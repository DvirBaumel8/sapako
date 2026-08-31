import { formatTimeAgo } from './timeAgo';

const now = new Date('2026-08-31T12:00:00.000Z');
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

describe('formatTimeAgo', () => {
  it('says הרגע for something that just happened', () => {
    expect(formatTimeAgo(ago(5_000), now)).toBe('הרגע');
  });

  it('does not produce a negative age when the clock is behind the server', () => {
    // The device clock can trail the server's by a few seconds, which would
    // otherwise render "לפני -1 דקות".
    expect(formatTimeAgo(new Date(now.getTime() + 30_000).toISOString(), now)).toBe(
      'הרגע',
    );
  });

  it('uses the singular for one minute', () => {
    expect(formatTimeAgo(ago(60_000), now)).toBe('לפני דקה');
  });

  it('counts minutes under an hour', () => {
    expect(formatTimeAgo(ago(5 * 60_000), now)).toBe('לפני 5 דקות');
  });

  it('uses the singular for one hour', () => {
    expect(formatTimeAgo(ago(60 * 60_000), now)).toBe('לפני שעה');
  });

  it('counts hours under a day', () => {
    expect(formatTimeAgo(ago(5 * 60 * 60_000), now)).toBe('לפני 5 שעות');
  });

  it('says אתמול for one day', () => {
    expect(formatTimeAgo(ago(25 * 60 * 60_000), now)).toBe('אתמול');
  });

  it('counts days beyond that', () => {
    expect(formatTimeAgo(ago(3 * 24 * 60 * 60_000), now)).toBe('לפני 3 ימים');
  });

  it('rounds down rather than up, so nothing is reported as older than it is', () => {
    expect(formatTimeAgo(ago(119_000), now)).toBe('לפני דקה');
  });
});
