import { describe, expect, it } from 'vitest';
import { replaced, type PeerNote } from './folderMailbox';

describe('peer notes left by an earlier load of a tab', () => {
  const old: PeerNote = { id: 'a1', name: 'Ann', browser: 'b-ann', since: 1000, at: 5000 };
  const reloaded: PeerNote = { id: 'a2', name: 'Ann', browser: 'b-ann', since: 6000, at: 9000 };

  it('ignores the note of a tab that went silent before the same browser joined again', () => {
    expect(replaced(old, [old, reloaded], 20000)).toBe(true);
    expect(replaced(reloaded, [old, reloaded], 20000)).toBe(false);
  });

  it('keeps two tabs open at the same time in one browser', () => {
    const second: PeerNote = { ...reloaded, id: 'a3', since: 3000 };
    expect(replaced(old, [old, second], 20000)).toBe(false);
  });

  it('waits a few seconds before treating a note as left over (the other tab may just be about to write it)', () => {
    expect(replaced(old, [old, reloaded], 9000)).toBe(false);
  });

  it('keeps people in other browsers, even with the same name', () => {
    const otherBrowser: PeerNote = { ...reloaded, browser: 'b-incognito' };
    expect(replaced(old, [old, otherBrowser], 20000)).toBe(false);
  });
});
