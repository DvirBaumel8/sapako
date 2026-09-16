import { groupOrdersForActivity } from './groupOrdersForActivity';
import type { Order } from '../api/types';

const order = (id: string, status: Order['status']): Order => ({
  id,
  branchId: 'b1',
  providerId: 'p1',
  createdByUserId: 'u1',
  status,
  createdAt: '2026-01-01T00:00:00.000Z',
  items: [],
  provider: { id: 'p1', name: `Provider ${id}`, phone: '0500000000' },
});

describe('groupOrdersForActivity', () => {
  it('puts DRAFT and AWAITING_CONFIRMATION together under "טיוטות", and PUBLISHED under "נשלחו"', () => {
    const orders = [order('d1', 'DRAFT'), order('a1', 'AWAITING_CONFIRMATION'), order('s1', 'PUBLISHED')];

    const sections = groupOrdersForActivity(orders);

    expect(sections.map((section) => section.title)).toEqual(['טיוטות', 'נשלחו']);
    expect(sections[0].data.map((o) => o.id)).toEqual(['a1', 'd1']);
    expect(sections[1].data.map((o) => o.id)).toEqual(['s1']);
  });

  it('sorts awaiting-confirmation orders above plain drafts within "טיוטות"', () => {
    // AWAITING_CONFIRMATION has a pending yes/no question; a plain draft is
    // just unfinished editing. The more urgent one belongs on top regardless
    // of which order the backend returned them in.
    const orders = [
      order('d1', 'DRAFT'),
      order('d2', 'DRAFT'),
      order('a1', 'AWAITING_CONFIRMATION'),
    ];

    const sections = groupOrdersForActivity(orders);

    expect(sections[0].data.map((o) => o.id)).toEqual(['a1', 'd1', 'd2']);
  });

  it('omits a section entirely when it has nothing in it, rather than rendering it empty', () => {
    const onlyDrafts = groupOrdersForActivity([order('d1', 'DRAFT')]);
    expect(onlyDrafts.map((section) => section.title)).toEqual(['טיוטות']);

    const onlySent = groupOrdersForActivity([order('s1', 'PUBLISHED')]);
    expect(onlySent.map((section) => section.title)).toEqual(['נשלחו']);

    expect(groupOrdersForActivity([])).toEqual([]);
  });
});
