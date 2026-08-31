const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * How long ago something happened, in Hebrew, at the coarseness a person
 * actually needs.
 *
 * Used by the send-confirmation prompt: "נפתחה ב-WhatsApp לפני 5 דקות" is what
 * lets the user tell an order they just sent from one they abandoned
 * yesterday and forgot about.
 */
export function formatTimeAgo(isoTimestamp: string, now: Date = new Date()): string {
  const elapsed = now.getTime() - new Date(isoTimestamp).getTime();

  // A clock that is slightly behind the server would otherwise produce
  // "לפני -1 דקות".
  if (elapsed < MINUTE) return 'הרגע';

  if (elapsed < HOUR) {
    const minutes = Math.floor(elapsed / MINUTE);
    return minutes === 1 ? 'לפני דקה' : `לפני ${minutes} דקות`;
  }

  if (elapsed < DAY) {
    const hours = Math.floor(elapsed / HOUR);
    return hours === 1 ? 'לפני שעה' : `לפני ${hours} שעות`;
  }

  const days = Math.floor(elapsed / DAY);
  return days === 1 ? 'אתמול' : `לפני ${days} ימים`;
}
