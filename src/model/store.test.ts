import { beforeEach, describe, expect, it } from 'vitest';
import { canEdit, useStore } from './store';
import { sampleModel } from './sample';

const st = useStore.getState;

describe('editing needs a user name', () => {
  beforeEach(() => {
    st().setModel(sampleModel());
    st().setUi({ userName: '' });
  });

  it('ignores changes to the diagram without a name', () => {
    const before = JSON.stringify(st().model);
    const sys = st().model.systems[0];
    st().addSystem({ kind: 'system' });
    st().addTopic('X');
    st().addGroup('chain');
    st().updateSystem(sys.id, { name: 'Renamed' });
    st().moveSystem(sys.id, { kind: 'side', side: 'E' });
    st().sortTopics('desc');
    st().deleteSystem(sys.id);
    expect(canEdit(st().ui)).toBe(false);
    expect(JSON.stringify(st().model)).toBe(before);
  });

  it('still lets anyone show or hide an element', () => {
    const sys = st().model.systems[0];
    st().updateSystem(sys.id, { hidden: true });
    expect(st().model.systems[0].hidden).toBe(true);
    st().updateSystem(sys.id, { hidden: false, name: 'Sneaky' });
    expect(st().model.systems[0].name).toBe(sys.name);
  });

  it('applies changes once a name is set', () => {
    st().setUi({ userName: 'Ann' });
    const n = st().model.systems.length;
    st().addSystem({ kind: 'system' });
    expect(st().model.systems.length).toBe(n + 1);
  });
});
