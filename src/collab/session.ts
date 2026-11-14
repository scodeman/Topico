import { EMPTY_STATE, SharedDiagram } from './sharedDiagram';
import { note, setState, useCollab, type PeerView, type ReplaceRequest } from './state';
import { answerFile, replaced, FolderMailbox, offerFile, peerFile, type DirHandle, type PeerNote, type SignalNote } from './folderMailbox';

/* Experiment: find the other Topico tabs using the same shared folder and connect to each one browser to browser
   (WebRTC data channel), with the folder as the only go-between. The channel then carries the diagram (Yjs updates,
   see sharedDiagram.ts), plus names and pings.

   Joining: of two copies of the diagram, the one already shared in the session wins; when neither is, the copy of
   whoever joined first. The other copy is replaced (that person's own file is untouched until they save).

   Who calls whom: of two tabs, the one with the smaller id writes an offer, the other answers. Offers and answers
   carry all their network candidates at once, since the folder is far too slow to trickle them. */

/** How often the folder is read, our heartbeat rewritten, and when a silent peer is considered gone. */
const POLL_MS = 2000;
const HEARTBEAT_MS = 5000;
const GONE_MS = 30000;
/** An unanswered offer is withdrawn and made again after this long (sync tools can take a while). */
const OFFER_TIMEOUT_MS = 60000;
/** Wait after a failed or closed connection before trying again. */
const RETRY_MS = 10000;
/** A request to replace the shared diagram is dropped when not everyone has answered after this long. */
const ASK_TIMEOUT_MS = 60000;
/** How long the outcome of a request stays on screen. */
const RESULT_SHOWN_MS = 8000;
export type AskResult = { ok: true } | { ok: false; reason: string };

/** No STUN or TURN server: only direct connections between machines that can reach each other (same network). */
const RTC_CONFIG: RTCConfiguration = { iceServers: [] };


/** This browser (profile): kept in its storage, so a normal and a private window are two different browsers. */
const BROWSER = (() => {
  try {
    const id = localStorage.getItem('topico-browser') ?? crypto.randomUUID().slice(0, 8);
    localStorage.setItem('topico-browser', id);
    return id;
  } catch {
    return crypto.randomUUID().slice(0, 8);
  }
})();

/** Binary messages on the data channel: Yjs sync, and pieces of a message too big to send at once. */
const STEP1 = 0; // state vector: "send me what I am missing"
const STEP2 = 1; // the reply
const UPDATE = 2; // a change, as it happens
const PART = 9; // [PART, last?1:0, …bytes]
const MAX_MESSAGE = 60000;

interface Hello {
  t: 'hello';
  name: string;
  joinedAt: number;
  synced: boolean;
}

interface Link {
  pc: RTCPeerConnection;
  /** Waiting for the session's diagram from this peer, to replace ours. */
  adopting?: boolean;
  /** The peer asked for what it is missing while we were adopting: answered once our copy is the session's. */
  pendingAsk?: Uint8Array;
  parts?: Uint8Array[];
  channel?: RTCDataChannel;
  role: 'calling' | 'answering';
  offerAt: number;
  startedAt: number;
  pinger?: ReturnType<typeof setInterval>;
}

let session: Session | null = null;

class Session {
  private links = new Map<string, Link>();
  private retryAfter = new Map<string, number>();
  private timer?: ReturnType<typeof setInterval>;
  private lastBeat = 0;
  private busy = false;
  private joinedAt = Date.now();
  readonly shared = new SharedDiagram((update, origin) => this.broadcast(update, origin));

  constructor(
    private box: FolderMailbox,
    private me: string,
    private name: () => string,
  ) {}

  start() {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), POLL_MS);
  }

  /** `leaving`: also remove our note from the folder (not when another session of this tab takes over: same note). */
  async stop(leaving = true) {
    clearInterval(this.timer);
    for (const ask of [...this.asks.values()]) ask.done({ ok: false, reason: 'you left the room' });
    for (const id of [...this.links.keys()]) this.drop(id, false);
    this.shared.destroy();
    if (leaving) await this.box.remove(peerFile(this.me));
  }

  private async tick() {
    // A session that is no longer the tab's session (started twice, or replaced by a code update) stops itself:
    // two sessions of one tab would share its name and its counters, and fight over the same peers.
    if (session !== this) return void this.stop(false);
    if (this.busy) return;
    this.busy = true;
    try {
      const now = Date.now();
      if (now - this.lastBeat > HEARTBEAT_MS) {
        await this.box.write(peerFile(this.me), { id: this.me, name: this.name(), at: now, browser: BROWSER, since: this.joinedAt } satisfies PeerNote);
        this.lastBeat = now;
      }
      const all = await this.box.peers();
      // Notes left by an earlier load of a tab (it could not delete its note while closing) are ignored, and ours removed.
      for (const p of all) if (p.browser === BROWSER && p.id !== this.me && replaced(p, all, now)) void this.box.remove(peerFile(p.id));
      const others = all.filter((p) => p.id !== this.me && now - p.at < GONE_MS && !replaced(p, all, now));
      this.showPeers(others);
      for (const p of others) await this.handle(p, now);
      // Peers that left the folder: close their link.
      for (const id of this.links.keys()) if (!others.some((p) => p.id === id)) this.drop(id, true);
    } catch (e) {
      setState({ status: 'error', error: (e as Error).message });
    } finally {
      this.busy = false;
    }
  }

  private showPeers(others: PeerNote[]) {
    setState((s) => {
      const peers: Record<string, PeerView> = {};
      for (const p of others) {
        const old = s.peers[p.id];
        const link = this.links.get(p.id);
        peers[p.id] = { id: p.id, name: p.name, seenAt: p.at, rtt: old?.rtt, state: link?.channel?.readyState === 'open' ? 'connected' : link ? link.role : 'seen' };
      }
      return { peers };
    });
  }

  private async handle(p: PeerNote, now: number) {
    const link = this.links.get(p.id);
    if (link?.channel?.readyState === 'open') return;
    if ((this.retryAfter.get(p.id) ?? 0) > now) return;
    if (this.me < p.id) {
      // We call.
      if (!link) return this.call(p);
      if (now - link.startedAt > OFFER_TIMEOUT_MS) {
        note(`No answer from ${p.name}, trying again`);
        return this.drop(p.id, true);
      }
      const answer = await this.box.read<SignalNote>(answerFile(p.id, this.me));
      if (answer && answer.offerAt === link.offerAt && link.pc.signalingState === 'have-local-offer') {
        note(`Answer from ${p.name} found, connecting`);
        await link.pc.setRemoteDescription(answer.sdp);
      }
    } else {
      // We answer, once per offer.
      const offer = await this.box.read<SignalNote>(offerFile(p.id, this.me));
      if (offer && offer.offerAt !== link?.offerAt) await this.answer(p, offer);
      else if (link && now - link.startedAt > OFFER_TIMEOUT_MS) this.drop(p.id, true);
    }
  }

  private newLink(p: PeerNote, role: Link['role'], offerAt: number): Link {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const link: Link = { pc, role, offerAt, startedAt: Date.now() };
    this.links.set(p.id, link);
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        if (this.links.get(p.id) === link) {
          note(`Connection with ${p.name} ${pc.connectionState}`);
          this.drop(p.id, true);
        }
      }
    };
    pc.ondatachannel = (e) => this.useChannel(p, link, e.channel);
    return link;
  }

  private async call(p: PeerNote) {
    const offerAt = Date.now();
    const link = this.newLink(p, 'calling', offerAt);
    this.useChannel(p, link, link.pc.createDataChannel('topico'));
    await link.pc.setLocalDescription(await link.pc.createOffer());
    await gathered(link.pc);
    if (this.links.get(p.id) !== link) return;
    await this.box.write(offerFile(this.me, p.id), { sdp: link.pc.localDescription!.toJSON(), offerAt } satisfies SignalNote);
    note(`Offer written for ${p.name}`);
  }

  private async answer(p: PeerNote, offer: SignalNote) {
    this.drop(p.id, false);
    const link = this.newLink(p, 'answering', offer.offerAt);
    note(`Offer from ${p.name} found, answering`);
    await link.pc.setRemoteDescription(offer.sdp);
    await link.pc.setLocalDescription(await link.pc.createAnswer());
    await gathered(link.pc);
    if (this.links.get(p.id) !== link) return;
    await this.box.write(answerFile(this.me, p.id), { sdp: link.pc.localDescription!.toJSON(), offerAt: offer.offerAt } satisfies SignalNote);
  }

  /** Sends a change of the diagram to every connected peer (but the one it came from). */
  private broadcast(update: Uint8Array, origin: unknown) {
    for (const [id, link] of this.links) if (id !== origin && link.channel?.readyState === 'open' && !link.adopting) sendBinary(link.channel, UPDATE, update);
  }

  private onHello(p: PeerNote, link: Link, h: Hello) {
    const ch = link.channel!;
    const adopt = !this.shared.synced && (h.synced || h.joinedAt < this.joinedAt || (h.joinedAt === this.joinedAt && p.id < this.me));
    if (adopt) {
      link.adopting = true;
      note(`Receiving the shared diagram from ${h.name}`);
      sendBinary(ch, STEP1, EMPTY_STATE);
    } else {
      this.shared.synced = true;
      sendBinary(ch, STEP1, this.shared.stateVector());
    }
  }

  private onBinary(p: PeerNote, link: Link, data: Uint8Array): void {
    const kind = data[0];
    const body = data.subarray(1);
    if (kind === PART) {
      (link.parts ??= []).push(body.subarray(1));
      if (body[0] !== 1) return;
      const whole = concat(link.parts);
      link.parts = undefined;
      return this.onBinary(p, link, whole);
    }
    if (kind === STEP1) {
      // Never answer from the copy being replaced: the peer would merge it into the session's diagram.
      if ([...this.links.values()].some((l) => l.adopting)) link.pendingAsk = body.slice();
      else sendBinary(link.channel!, STEP2, this.shared.missing(body));
    } else if (kind === STEP2 && link.adopting) {
      link.adopting = false;
      this.shared.adopt(body, p.id);
      for (const l of this.links.values())
        if (l.pendingAsk && l.channel?.readyState === 'open') {
          sendBinary(l.channel, STEP2, this.shared.missing(l.pendingAsk));
          l.pendingAsk = undefined;
        }
      note(`Now editing the shared diagram (from ${p.name})`);
      setState({ shared: true });
    } else if (kind === STEP2 || (kind === UPDATE && !link.adopting)) {
      this.shared.apply(body, p.id);
      if (kind === STEP2) setState({ shared: true });
    }
  }

  private useChannel(p: PeerNote, link: Link, ch: RTCDataChannel) {
    link.channel = ch;
    ch.binaryType = 'arraybuffer';
    ch.onopen = () => {
      note(`Connected to ${p.name}`);
      setState((s) => (s.peers[p.id] ? { peers: { ...s.peers, [p.id]: { ...s.peers[p.id], state: 'connected' } } } : {}));
      // The mailbox files are no longer needed.
      void this.box.remove(link.role === 'calling' ? offerFile(this.me, p.id) : answerFile(this.me, p.id));
      ch.send(JSON.stringify({ t: 'hello', name: this.name(), joinedAt: this.joinedAt, synced: this.shared.synced } satisfies Hello));
      link.pinger = setInterval(() => ch.readyState === 'open' && ch.send(JSON.stringify({ t: 'ping', ts: performance.now() })), 3000);
    };
    ch.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) return this.onBinary(p, link, new Uint8Array(e.data));
      const m = JSON.parse(String(e.data)) as { t: string; ts?: number; name?: string; reqId?: string; what?: string; ok?: boolean };
      if (m.t === 'hello') this.onHello(p, link, m as Hello);
      else if (m.t === 'replace-ask' && m.reqId)
        setState((s) => ({ incoming: [...s.incoming, { reqId: m.reqId!, peerId: p.id, from: m.name ?? p.name, what: m.what ?? 'another diagram' }] }));
      else if (m.t === 'replace-cancel') setState((s) => ({ incoming: s.incoming.filter((r) => r.reqId !== m.reqId) }));
      else if (m.t === 'replace-answer' && m.reqId) this.onAnswer(p, m.reqId, !!m.ok);
      else if (m.t === 'ping') ch.send(JSON.stringify({ t: 'pong', ts: m.ts }));
      else if (m.t === 'pong' && m.ts !== undefined) {
        const rtt = Math.round(performance.now() - m.ts);
        setState((s) => (s.peers[p.id] ? { peers: { ...s.peers, [p.id]: { ...s.peers[p.id], rtt } } } : {}));
      }
    };
    ch.onclose = () => {
      if (this.links.get(p.id) === link) {
        note(`${p.name} disconnected`);
        this.drop(p.id, true);
      }
    };
  }

  /* ---------- Replacing the shared diagram (Open, New): every connected peer must agree ---------- */

  private asks = new Map<string, { waiting: Map<string, string>; done(r: AskResult): void }>();

  askReplace(what: string): Promise<AskResult> {
    const open = [...this.links].filter(([, l]) => l.channel?.readyState === 'open' && !l.adopting);
    if (!open.length) return Promise.resolve({ ok: true });
    const reqId = crypto.randomUUID();
    const names = useCollab.getState().peers;
    const waiting = new Map(open.map(([id]) => [id, names[id]?.name ?? 'someone']));
    for (const [, l] of open) l.channel!.send(JSON.stringify({ t: 'replace-ask', reqId, name: this.name(), what }));
    note(`Asked ${[...waiting.values()].join(', ')} to replace the diagram with ${what}`);
    const show = () => setState({ asking: { reqId, what, waiting: [...waiting.values()] } });
    show();
    return new Promise((resolve) => {
      const timer = setTimeout(() => done({ ok: false, reason: `no answer from ${[...waiting.values()].join(', ')}` }), ASK_TIMEOUT_MS);
      const done = (r: AskResult) => {
        if (!this.asks.has(reqId)) return;
        clearTimeout(timer);
        this.asks.delete(reqId);
        setState({ asking: null, askResult: { what, ok: r.ok, reason: r.ok ? undefined : r.reason } });
        setTimeout(() => setState((s) => (s.askResult?.what === what ? { askResult: null } : {})), RESULT_SHOWN_MS);
        if (!r.ok) for (const [id] of waiting) this.send(id, { t: 'replace-cancel', reqId });
        note(r.ok ? `Everyone agreed: replacing the diagram with ${what}` : `Diagram not replaced: ${r.reason}`);
        resolve(r);
      };
      this.asks.set(reqId, {
        waiting,
        done: (r) => {
          if (r.ok) show();
          if (!r.ok || !waiting.size) done(r);
        },
      });
    });
  }

  private onAnswer(p: PeerNote, reqId: string, ok: boolean) {
    const ask = this.asks.get(reqId);
    if (!ask || !ask.waiting.has(p.id)) return;
    ask.waiting.delete(p.id);
    ask.done(ok ? { ok: true } : { ok: false, reason: `${p.name} refused` });
  }

  answerReplace(r: ReplaceRequest, ok: boolean) {
    setState((s) => ({ incoming: s.incoming.filter((x) => x.reqId !== r.reqId) }));
    this.send(r.peerId, { t: 'replace-answer', reqId: r.reqId, ok });
    note(`${ok ? 'Allowed' : 'Refused'} ${r.from} to replace the diagram with ${r.what}`);
  }

  cancelAsk(reqId: string) {
    const ask = this.asks.get(reqId);
    if (ask) ask.done({ ok: false, reason: 'cancelled' });
  }

  private send(id: string, msg: unknown) {
    const ch = this.links.get(id)?.channel;
    if (ch?.readyState === 'open') ch.send(JSON.stringify(msg));
  }

  private drop(id: string, retryLater: boolean) {
    const link = this.links.get(id);
    if (!link) return;
    // Someone who leaves no longer has a say in pending requests, and their requests to us are void.
    for (const ask of this.asks.values()) if (ask.waiting.delete(id)) ask.done({ ok: true });
    setState((s) => ({ incoming: s.incoming.filter((r) => r.peerId !== id) }));
    this.links.delete(id);
    clearInterval(link.pinger);
    link.channel?.close();
    link.pc.close();
    void this.box.remove(link.role === 'calling' ? offerFile(this.me, id) : answerFile(this.me, id));
    if (retryLater) this.retryAfter.set(id, Date.now() + RETRY_MS);
    setState((s) => (s.peers[id] ? { peers: { ...s.peers, [id]: { ...s.peers[id], state: 'seen', rtt: undefined } } } : {}));
  }
}

function sendBinary(ch: RTCDataChannel, kind: number, payload: Uint8Array) {
  if (payload.length + 1 <= MAX_MESSAGE) return ch.send(concat([Uint8Array.of(kind), payload]));
  // Too big for one message: send it in pieces, which arrive in order.
  const whole = concat([Uint8Array.of(kind), payload]);
  for (let i = 0; i < whole.length; i += MAX_MESSAGE - 2) {
    const last = i + MAX_MESSAGE - 2 >= whole.length;
    ch.send(concat([Uint8Array.of(PART, last ? 1 : 0), whole.subarray(i, i + MAX_MESSAGE - 2)]));
  }
}

function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, x) => n + x.length, 0));
  let at = 0;
  for (const x of parts) {
    out.set(x, at);
    at += x.length;
  }
  return out;
}

/** Resolves once the connection has gathered its network candidates (or after a few seconds). */
function gathered(pc: RTCPeerConnection): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') return resolve();
    const t = setTimeout(resolve, 5000);
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') {
        clearTimeout(t);
        resolve();
      }
    });
  });
}

/** Start meeting other users through this folder. Needs write permission on it (asked if necessary). */
/** Starts and stops run one after the other: two at once would leave two sessions running in the tab. */
let queue: Promise<void> = Promise.resolve();
const serial = (fn: () => Promise<void>): Promise<void> => (queue = queue.then(fn, fn));

export const startCollab = (root: DirHandle, name: () => string): Promise<void> => serial(() => start(root, name));
export const stopCollab = (): Promise<void> => serial(stop);

async function start(root: DirHandle, name: () => string): Promise<void> {
  await stop();
  setState({ status: 'starting', folder: root.name, error: undefined, peers: {}, log: [], shared: false });
  try {
    if ((await root.requestPermission?.({ mode: 'readwrite' })) === 'denied') throw new Error('No permission to write in this folder');
    session = new Session(await FolderMailbox.open(root), useCollab.getState().me, name);
    session.start();
    setState({ status: 'on' });
    note(`Joined ${root.name}`);
  } catch (e) {
    session = null;
    setState({ status: 'error', error: (e as Error).message });
  }
}

/** Asks every connected peer to agree before the shared diagram is replaced (by Open or New). */
export const askReplace = (what: string): Promise<AskResult> => session?.askReplace(what) ?? Promise.resolve({ ok: true });
export const answerReplace = (r: ReplaceRequest, ok: boolean) => session?.answerReplace(r, ok);
export const cancelAsk = (reqId: string) => session?.cancelAsk(reqId);

async function stop(): Promise<void> {
  const s = session;
  session = null;
  if (s) await s.stop();
  setState({ status: 'off', peers: {}, shared: false, asking: null, incoming: [] });
}

// Leave the folder when the tab closes (best effort: the heartbeat going stale covers the rest).
if (typeof window !== 'undefined') window.addEventListener('pagehide', () => void session?.stop());

// Development server only: hot-swapping this code (or anything it uses, like the store) would leave the running
// session's connections, timers and store subscription behind, still "connected" but no longer syncing. Reload instead.
if (import.meta.hot) import.meta.hot.accept(() => window.location.reload());
