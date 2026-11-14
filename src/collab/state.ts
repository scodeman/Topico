import { create } from 'zustand';

/* What the Collaborate panel shows. Kept apart from session.ts so that the app loads Yjs and the connection code only
   when someone joins. */

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
export interface CollabState {
  folder: string | null;
  /** The room's folder: file dialogs start there while no file is open. */
  folderHandle: unknown;
  status: 'off' | 'starting' | 'on' | 'error';
  error?: string;
  me: string;
  peers: Record<string, PeerView>;
  /** Short log of what happened, newest last. */
  log: string[];
  /** The diagram on screen is the one shared with others. */
  shared: boolean;
  /** Our request to replace the shared diagram, waiting for the others' approval. */
  asking: { reqId: string; what: string; waiting: string[] } | null;
  /** Others' requests to replace the shared diagram, waiting for our answer. */
  incoming: ReplaceRequest[];
  /** How our last request ended, shown for a few seconds. */
  askResult: { what: string; ok: boolean; reason?: string } | null;
}

export interface ReplaceRequest {
  reqId: string;
  peerId: string;
  from: string;
  what: string;
}

const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, '0')).join('');

export const useCollab = create<CollabState>(() => ({ folderHandle: null, folder: null, status: 'off', me: newId(), peers: {}, log: [], shared: false, asking: null, incoming: [], askResult: null }));
export const setState = useCollab.setState;
export const note = (line: string) => setState((s) => ({ log: [...s.log.slice(-30), `${new Date().toLocaleTimeString()} ${line}`] }));
