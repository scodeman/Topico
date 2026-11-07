import { autoSequence } from './chainLinks';
import { defaultSosRole, defaultSosSettings, type Direction, type Model, type NodeKind, type Side, type SystemNode, type Topic } from './types';

/** Recreates the landscape sketched in docs/spec/images/ALL.png. */
export function sampleModel(): Model {
  // SoS roles use the defaults: only the broker inside, every system (parent or leaf) outside, ETLs not shown.
  // Each system has a note so the SoS callouts have something to show.
  const notes: Record<string, string> = {
    n1: 'Order capture: publishes new orders and reference updates.',
    n2: 'Pricing engine, feeds the billing chain.',
    n3: 'Reporting: reads pricing and catalogue topics.',
    n21: 'Nightly batch, enriches TOPIC 6 into TOPIC 8.',
    w11: 'Master of the reference data (topics 1-4).',
    w2: 'Fulfilment hub, aggregates regional stock.',
    w21: 'Warehouse A stock feed.',
    w22: 'Warehouse B stock feed.',
    xw1: 'Converts orders (TOPIC 5) into shipments (TOPIC 10).',
    e1: 'Billing platform, fans invoices out to regional systems.',
    e11: 'Regional billing for zone 1.',
    e12x: 'Regional billing for zone 2.',
    e13: 'Regional billing for zone 3.',
    e12: 'Customer portal: shows orders, invoices and payments.',
    s1: 'Data lake: archives every topic.',
  };
  const sys = (id: string, name: string, side: Side, parentId: string | null = null, kind: NodeKind = 'system'): SystemNode => ({
    id, name, kind, side, parentId, description: '', owner: '', properties: [], hidden: false,
    sos: defaultSosRole(kind), notes: notes[id] ?? '',
  });
  const systems: SystemNode[] = [
    sys('n1', 'NORTH SYS 1', 'N'),
    sys('n2', 'NORTH SYS 2', 'N'),
    sys('n3', 'NORTH SYS 3', 'N'),
    sys('n21', 'ETL N2.1', 'N', 'n2', 'etl'),
    sys('w11', 'WEST SYS 11', 'W'),
    sys('w2', 'WEST SYS 2', 'W'),
    sys('w21', 'WEST SYS 2.1', 'W', 'w2'),
    sys('w22', 'WEST SYS 2.2', 'W', 'w2'),
    sys('xw1', 'ETL W1', 'W', null, 'etl'),
    sys('e1', 'EAST SYS 1', 'E'),
    sys('e11', 'EAST SYS 1.1', 'E', 'e1'),
    sys('e12x', 'EAST SYS 1.2', 'E', 'e1'),
    sys('e13', 'EAST SYS 1.3', 'E', 'e1'),
    sys('e12', 'EAST SYS 12', 'E'),
    sys('s1', 'SOUTH SYS 1', 'S'),
  ];

  const bundleRef = 'b-ref';
  const chainOrder = 'c-order';
  const chainBilling = 'c-billing';
  const chainSettle = 'c-settle';
  const topic = (n: number, bundleId: string | null = null): Topic => ({
    id: `t${n}`, name: `TOPIC ${n}`, description: '', owner: '', format: 'Avro', properties: [], bundleId, hidden: false,
  });
  const topics: Topic[] = [
    topic(1, bundleRef), topic(2, bundleRef), topic(3, bundleRef), topic(4, bundleRef),
    topic(5), topic(6), topic(7), topic(8), topic(9), topic(10),
  ];

  const flows: [string, Direction, number[]][] = [
    ['n1', 'produce', [1, 5, 6]],
    ['n1', 'consume', [2, 3, 4, 7, 10]],
    ['n2', 'produce', [7, 8]],
    ['n2', 'consume', [6]],
    ['n21', 'consume', [6]],
    ['n21', 'produce', [8]],
    ['n3', 'consume', [6, 7]],
    ['w11', 'produce', [2, 3]],
    ['w11', 'consume', [1, 4]],
    ['w2', 'produce', [4]],
    ['w2', 'consume', [5, 6, 7, 10]],
    ['w21', 'produce', [4]],
    ['w22', 'produce', [4]],
    ['xw1', 'consume', [5]],
    ['xw1', 'produce', [10]],
    ['e1', 'consume', [8, 9]],
    ['e11', 'consume', [8]],
    ['e12x', 'consume', [8]],
    ['e13', 'consume', [8]],
    ['e12', 'consume', [3, 9, 8, 6]],
    ['s1', 'produce', [9]],
    ['s1', 'consume', [1, 2, 3, 4, 5, 6, 7, 8, 10]],
  ];
  // Chains pick individual endpoints: e.g. TOPIC 5 is in "Order flow" only between NORTH SYS 1 and ETL W1.
  // An endpoint can be in several chains: SOUTH SYS 1 publishing TOPIC 9 is in both "Billing" and "Settlement".
  const chains: Record<string, string[]> = {
    'n1-p-5': [chainOrder], 'xw1-c-5': [chainOrder], 'xw1-p-10': [chainOrder], 'w2-c-10': [chainOrder],
    'n2-p-8': [chainBilling], 'n21-p-8': [chainBilling], 'e1-c-8': [chainBilling], 'e11-c-8': [chainBilling],
    's1-p-9': [chainBilling, chainSettle], 'e12-c-9': [chainBilling], 'e1-c-9': [chainSettle],
  };
  const interactions = flows.flatMap(([systemId, direction, nums]) =>
    nums.map((n) => {
      const key = `${systemId}-${direction[0]}-${n}`;
      return { id: `i-${key}`, systemId, topicId: `t${n}`, direction, hidden: false, chainIds: chains[key] ?? [] };
    }),
  );

  const model: Model = {
    version: 1,
    centre: { id: 'centre', name: 'CENTER SYS', description: 'Central brokering system', properties: [], sos: 'inner' },
    sos: defaultSosSettings(),
    systems,
    topics,
    interactions,
    groups: [
      { id: bundleRef, name: 'Reference data', type: 'bundle', color: '#0ea5e9', description: '', hidden: false, sequence: [] },
      { id: chainOrder, name: 'Order flow', type: 'chain', color: '#f97316', description: '', hidden: false, sequence: [] },
      { id: chainBilling, name: 'Billing', type: 'chain', color: '#a855f7', description: '', hidden: false, sequence: [] },
      { id: chainSettle, name: 'Settlement', type: 'chain', color: '#16a34a', description: '', hidden: false, sequence: [] },
    ],
  };
  // Each chain comes with the sequence proposed by "Auto-fill", ready to animate.
  for (const g of model.groups) if (g.type === 'chain') g.sequence = autoSequence(model, g.id);
  return model;
}
