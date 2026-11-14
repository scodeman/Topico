import * as Y from 'yjs';
import { setCurrentFile } from '../model/currentFile';
import { useStore } from '../model/store';
import { normalizeModel, type Model } from '../model/types';
import { applyDiff } from './ydiff';

/* The diagram shared with the other people of a collaboration session: a Yjs document kept in step with the app's
   store both ways. Local edits become Yjs updates (sent to the others); updates from others change the diagram on
   screen, whoever is allowed to edit (a viewer without a name still sees them). */

/** Origin of the updates made here, to tell them apart from those received from a peer (whose origin is its id). */
export const LOCAL = 'local';

export class SharedDiagram {
  doc!: Y.Doc;
  private root!: Y.Map<unknown>;
  /** The diagram the document mirrors. */
  private last: Model;
  private applying = false;
  private unsubscribe: () => void;
  /** This copy is the session's: it was the first, or it has received the session's diagram. */
  synced = false;

  constructor(private onUpdate: (update: Uint8Array, origin: unknown) => void) {
    this.last = useStore.getState().model;
    this.use(new Y.Doc());
    this.doc.transact(() => applyDiff(this.root, {}, this.last as unknown as Record<string, unknown>), LOCAL);
    this.unsubscribe = useStore.subscribe((s) => {
      if (this.applying || s.model === this.last) return;
      const prev = this.last;
      this.last = s.model;
      this.doc.transact(() => applyDiff(this.root, prev as unknown as Record<string, unknown>, s.model as unknown as Record<string, unknown>), LOCAL);
    });
  }

  private use(doc: Y.Doc) {
    this.doc?.destroy();
    this.doc = doc;
    this.root = doc.getMap<unknown>('model');
    doc.on('update', (update: Uint8Array, origin: unknown) => {
      this.onUpdate(update, origin);
      if (origin !== LOCAL) this.show();
    });
  }

  /** Puts the shared diagram on screen. */
  private show() {
    const model = normalizeModel(this.root.toJSON() as Model);
    this.last = model;
    this.applying = true;
    try {
      useStore.setState({ model });
    } finally {
      this.applying = false;
    }
  }

  /** Replaces this copy with the session's diagram (sent whole by a peer that was there first). */
  adopt(update: Uint8Array, from: string) {
    this.use(new Y.Doc());
    Y.applyUpdate(this.doc, update, from);
    this.synced = true;
    this.show();
    // The diagram on screen is now the room's, not the file we had open: Save must not write it over that file.
    setCurrentFile(null);
  }

  apply(update: Uint8Array, from: string) {
    Y.applyUpdate(this.doc, update, from);
  }

  stateVector = () => Y.encodeStateVector(this.doc);
  /** What a peer with this state vector is missing. */
  missing = (sv: Uint8Array) => Y.encodeStateAsUpdate(this.doc, sv);

  destroy() {
    this.unsubscribe();
    this.doc.destroy();
  }
}

/** State vector of an empty document: asking for it gets the whole diagram. */
export const EMPTY_STATE = Y.encodeStateVector(new Y.Doc());
