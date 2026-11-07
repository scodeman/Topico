import { describe, expect, it } from 'vitest';
import { autoSequence, chainLinks, chainSequence, linkLabel, stepsByLink } from './chainLinks';
import { sampleModel } from './sample';

const ids = (chain: string) => chainLinks(sampleModel(), chain).map((l) => `${l.kind}:${l.id}`);

describe('chainLinks', () => {
  it('pairs producers and consumers of the chain on the broker', () => {
    expect(ids('c-order')).toEqual(['broker:i-n1-p-5>i-xw1-c-5', 'broker:i-xw1-p-10>i-w2-c-10']);
  });

  it('follows relays through parent systems', () => {
    expect(ids('c-billing')).toEqual([
      'broker:i-n2-p-8>i-e1-c-8',
      'up:i-n21-p-8>i-n2-p-8', // ETL N2.1 publishes into NORTH SYS 2
      'down:i-e1-c-8>i-e11-c-8', // EAST SYS 1 relays to EAST SYS 1.1
      'broker:i-s1-p-9>i-e12-c-9',
    ]);
  });

  it('labels links with systems and topic', () => {
    const m = sampleModel();
    expect(linkLabel(m, chainLinks(m, 'c-order')[0])).toBe('NORTH SYS 1 → ETL W1 · TOPIC 5');
  });
});

describe('sequences', () => {
  it('proposes a sequence following the flow', () => {
    expect(autoSequence(sampleModel(), 'c-billing')).toEqual([
      ['i-n21-p-8>i-n2-p-8', 'i-s1-p-9>i-e12-c-9'],
      ['i-n2-p-8>i-e1-c-8'],
      ['i-e1-c-8>i-e11-c-8'],
    ]);
    expect(autoSequence(sampleModel(), 'c-order')).toEqual([['i-n1-p-5>i-xw1-c-5'], ['i-xw1-p-10>i-w2-c-10']]);
  });

  it('ships the sample chains with their sequence', () => {
    const m = sampleModel();
    expect(m.groups.find((g) => g.id === 'c-order')!.sequence).toHaveLength(2);
    expect(m.groups.find((g) => g.id === 'b-ref')!.sequence).toEqual([]);
  });

  it('drops links that no longer exist and empty steps', () => {
    const m = sampleModel();
    m.groups.find((g) => g.id === 'c-order')!.sequence = [['i-n1-p-5>i-xw1-c-5', 'gone>gone'], ['gone>too'], ['i-xw1-p-10>i-w2-c-10']];
    expect(chainSequence(m, 'c-order')).toEqual([['i-n1-p-5>i-xw1-c-5'], ['i-xw1-p-10>i-w2-c-10']]);
  });

  it('lets a link appear in several steps', () => {
    expect(stepsByLink([['a', 'b'], ['b'], ['c']]).get('b')).toEqual([1, 2]);
  });
});
