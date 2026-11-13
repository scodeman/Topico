/* A shared folder used as a mailbox to find other Topico users and swap WebRTC connection messages with them,
   without any server: the folder is synced by whatever the team already uses (OneDrive, SharePoint, a network
   drive…). Everything lives in a `.topico-collab` subfolder:
     peer.<id>.json              who is here (name, last heartbeat), rewritten every few seconds by its owner
     offer.<from>.<to>.json      a WebRTC offer from one tab to another
     answer.<from>.<to>.json     the reply
   Each file has a single writer, so sync tools never see two people editing the same file. */

/** The parts of the File System Access API used here (not in every browser nor in TypeScript's DOM types). */
export interface DirHandle {
  name: string;
  kind: 'directory';
  getDirectoryHandle(name: string, o?: { create?: boolean }): Promise<DirHandle>;
  getFileHandle(name: string, o?: { create?: boolean }): Promise<FileHandleLike>;
  removeEntry(name: string): Promise<void>;
  entries(): AsyncIterable<[string, { kind: string }]>;
  queryPermission?(o: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(o: { mode: 'readwrite' }): Promise<PermissionState>;
}
interface FileHandleLike {
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
}

export interface PeerNote {
  id: string;
  name: string;
  /** Last heartbeat, ms since epoch. */
  at: number;
}
export interface SignalNote {
  sdp: RTCSessionDescriptionInit;
  /** When the offer was made: an answer names the offer it replies to. */
  offerAt: number;
}

export const MAILBOX = '.topico-collab';

export class FolderMailbox {
  private constructor(private dir: DirHandle) {}

  static async open(root: DirHandle): Promise<FolderMailbox> {
    return new FolderMailbox(await root.getDirectoryHandle(MAILBOX, { create: true }));
  }

  async write(name: string, data: unknown): Promise<void> {
    const w = await (await this.dir.getFileHandle(name, { create: true })).createWritable();
    await w.write(JSON.stringify(data));
    await w.close();
  }

  /** The file's content, or null when it is missing or not readable yet (a sync tool may be halfway through). */
  async read<T>(name: string): Promise<T | null> {
    try {
      return JSON.parse(await (await (await this.dir.getFileHandle(name)).getFile()).text()) as T;
    } catch {
      return null;
    }
  }

  async remove(name: string): Promise<void> {
    await this.dir.removeEntry(name).catch(() => undefined);
  }

  async names(): Promise<string[]> {
    const out: string[] = [];
    for await (const [name, h] of this.dir.entries()) if (h.kind === 'file') out.push(name);
    return out;
  }

  async peers(): Promise<PeerNote[]> {
    const notes = await Promise.all((await this.names()).filter((n) => /^peer\.[\w-]+\.json$/.test(n)).map((n) => this.read<PeerNote>(n)));
    return notes.filter((p): p is PeerNote => !!p?.id);
  }
}

export const peerFile = (id: string) => `peer.${id}.json`;
export const offerFile = (from: string, to: string) => `offer.${from}.${to}.json`;
export const answerFile = (from: string, to: string) => `answer.${from}.${to}.json`;
