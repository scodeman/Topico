import { create } from 'zustand';
import { answerFile, FolderMailbox, offerFile, peerFile, type DirHandle, type PeerNote, type SignalNote } from './folderMailbox';

/* Experiment: find the other Topico tabs using the same shared folder and connect to each one browser to browser
   (WebRTC data channel), with the folder as the only go-between. No editing is shared yet: the channel carries
   names and pings, to see whether the folder is a good enough way to meet.

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
/** No STUN or TURN server: only direct connections between machines that can reach each other (same network). */
const RTC_CONFIG: RTCConfiguration = { iceServers: [] };

export type PeerState = 'seen' | 'calling' | 'answering' | 'connected';
export interface PeerView {
  id: string;
  name: string;
  state: PeerState;
  /** Round trip over the data channel, in ms. */
  rtt?: number;
  /** Last heartbeat seen in the folder. */
  seenAt: number;
}
interface CollabState {
  folder: string | null;
  status: 'off' | 'starting' | 'on' | 'error';
  error?: string;
  me: string;
  peers: Record<string, PeerView>;
  /** Short log of what happened, newest last. */
  log: string[];
}

const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, '0')).join('');

export const useCollab = create<CollabState>(() => ({ folder: null, status: 'off', me: newId(), peers: {}, log: [] }));
const setState = useCollab.setState;
const note = (line: string) => setState((s) => ({ log: [...s.log.slice(-30), `${new Date().toLocaleTimeString()} ${line}`] }));

interface Link {
  pc: RTCPeerConnection;
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

  constructor(
    private box: FolderMailbox,
    private me: string,
    private name: () => string,
  ) {}

  start() {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), POLL_MS);
  }

  async stop() {
    clearInterval(this.timer);
    for (const id of [...this.links.keys()]) this.drop(id, false);
    await this.box.remove(peerFile(this.me));
  }

  private async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const now = Date.now();
      if (now - this.lastBeat > HEARTBEAT_MS) {
        await this.box.write(peerFile(this.me), { id: this.me, name: this.name(), at: now } satisfies PeerNote);
        this.lastBeat = now;
      }
      const others = (await this.box.peers()).filter((p) => p.id !== this.me && now - p.at < GONE_MS);
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

  private useChannel(p: PeerNote, link: Link, ch: RTCDataChannel) {
    link.channel = ch;
    ch.onopen = () => {
      note(`Connected to ${p.name}`);
      setState((s) => (s.peers[p.id] ? { peers: { ...s.peers, [p.id]: { ...s.peers[p.id], state: 'connected' } } } : {}));
      // The mailbox files are no longer needed.
      void this.box.remove(link.role === 'calling' ? offerFile(this.me, p.id) : answerFile(this.me, p.id));
      ch.send(JSON.stringify({ t: 'hello', name: this.name() }));
      link.pinger = setInterval(() => ch.readyState === 'open' && ch.send(JSON.stringify({ t: 'ping', ts: performance.now() })), 3000);
    };
    ch.onmessage = (e) => {
      const m = JSON.parse(String(e.data)) as { t: string; ts?: number; name?: string };
      if (m.t === 'ping') ch.send(JSON.stringify({ t: 'pong', ts: m.ts }));
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

  private drop(id: string, retryLater: boolean) {
    const link = this.links.get(id);
    if (!link) return;
    this.links.delete(id);
    clearInterval(link.pinger);
    link.channel?.close();
    link.pc.close();
    void this.box.remove(link.role === 'calling' ? offerFile(this.me, id) : answerFile(this.me, id));
    if (retryLater) this.retryAfter.set(id, Date.now() + RETRY_MS);
    setState((s) => (s.peers[id] ? { peers: { ...s.peers, [id]: { ...s.peers[id], state: 'seen', rtt: undefined } } } : {}));
  }
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
export async function startCollab(root: DirHandle, name: () => string): Promise<void> {
  await stopCollab();
  setState({ status: 'starting', folder: root.name, error: undefined, peers: {}, log: [] });
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

export async function stopCollab(): Promise<void> {
  const s = session;
  session = null;
  if (s) await s.stop();
  setState({ status: 'off', peers: {} });
}

// Leave the folder when the tab closes (best effort: the heartbeat going stale covers the rest).
if (typeof window !== 'undefined') window.addEventListener('pagehide', () => void session?.stop());
