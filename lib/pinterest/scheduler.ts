/**
 * Pinterest peak-hours scheduler.
 *
 * Generates random posting times spread across 6 AM – 11 PM US Eastern
 * with a configurable minimum gap between consecutive posts.
 * Properly handles EST/EDT (DST) transitions.
 */

/** Pinterest posting window: 6 AM to 11 PM US Eastern (17-hour window). */
const PEAK_START_HOUR = 6; // 6 AM Eastern
const PEAK_END_HOUR = 23; // 11 PM Eastern
const DEFAULT_MIN_GAP_MINUTES = 30;

/**
 * Get the UTC offset for US Eastern time on a given date.
 * Returns -4 for EDT (Mar second Sun – Nov first Sun) or -5 for EST.
 */
function getEasternOffsetHours(date: Date): number {
  const year = date.getUTCFullYear();

  // DST starts: second Sunday of March at 2 AM local
  const marchFirst = new Date(Date.UTC(year, 2, 1)); // March 1
  const marchFirstDay = marchFirst.getUTCDay(); // 0=Sun
  const secondSunday = 8 + ((7 - marchFirstDay) % 7); // day of month
  const dstStart = new Date(Date.UTC(year, 2, secondSunday, 7, 0, 0)); // 2AM EST = 7AM UTC

  // DST ends: first Sunday of November at 2 AM local
  const novFirst = new Date(Date.UTC(year, 10, 1)); // November 1
  const novFirstDay = novFirst.getUTCDay();
  const firstSunday = 1 + ((7 - novFirstDay) % 7); // day of month
  const dstEnd = new Date(Date.UTC(year, 10, firstSunday, 6, 0, 0)); // 2AM EDT = 6AM UTC

  const ts = date.getTime();
  if (ts >= dstStart.getTime() && ts < dstEnd.getTime()) {
    return -4; // EDT
  }
  return -5; // EST
}

/**
 * Generate `count` random posting times on `targetDate`, spread
 * across Pinterest posting hours (6 AM – 11 PM US Eastern) with at least
 * `minGapMinutes` between each post.
 *
 * The targetDate should be the date you want pins scheduled ON (in US Eastern).
 * Times are returned as UTC Date objects.
 *
 * @param count   Number of time slots to generate.
 * @param targetDate  The calendar date to schedule on (interpreted as US Eastern date).
 * @param minGapMinutes  Minimum minutes between consecutive times (default: 30).
 * @returns Sorted array of Date objects in chronological order (UTC).
 * @throws If the requested count cannot fit within the window with the minimum gap.
 */
export function generateRandomTimes(
  count: number,
  targetDate: Date,
  minGapMinutes: number = DEFAULT_MIN_GAP_MINUTES
): Date[] {
  if (count <= 0) return [];

  const totalWindowMinutes = (PEAK_END_HOUR - PEAK_START_HOUR) * 60; // 1020 min

  if (count > Math.floor(totalWindowMinutes / minGapMinutes) + 1) {
    throw new Error(
      `Cannot fit ${count} pins in the peak window with ${minGapMinutes}-minute gaps. ` +
        `Maximum is ${Math.floor(totalWindowMinutes / minGapMinutes) + 1}.`
    );
  }

  // Determine the Eastern offset for this date
  const offsetHours = getEasternOffsetHours(targetDate);
  const offsetMs = Math.abs(offsetHours) * 60 * 60 * 1000; // always positive since offset is negative

  // Build the base date at midnight Eastern in UTC.
  // e.g. midnight EDT (UTC-4) = 04:00 UTC
  const base = new Date(targetDate);
  base.setUTCHours(0, 0, 0, 0);

  // Window start/end in UTC
  // Eastern midnight in UTC = base + |offset| hours
  // Eastern 6AM in UTC = base + |offset| + 6 hours
  const windowStartMs = base.getTime() + (PEAK_START_HOUR * 60 * 60 * 1000) + offsetMs;
  const windowEndMs = base.getTime() + (PEAK_END_HOUR * 60 * 60 * 1000) + offsetMs;

  // Generate times using interval sampling:
  // 1. Divide the window into `count` equal segments.
  // 2. Pick a random minute within each segment.
  // 3. Enforce the minimum gap by shifting forward if needed.
  const segmentMs = (windowEndMs - windowStartMs) / count;
  const times: number[] = [];

  for (let i = 0; i < count; i++) {
    const segStart = windowStartMs + segmentMs * i;
    const segEnd = windowStartMs + segmentMs * (i + 1);

    // Random point within segment, rounded to the nearest minute
    let candidate = segStart + Math.random() * (segEnd - segStart);
    candidate = Math.round(candidate / 60000) * 60000; // snap to minute

    // Enforce minimum gap from previous time
    if (times.length > 0) {
      const minAllowed = times[times.length - 1] + minGapMinutes * 60000;
      if (candidate < minAllowed) {
        candidate = minAllowed;
      }
    }

    // Clamp to window end
    if (candidate > windowEndMs) {
      candidate = windowEndMs;
    }

    times.push(candidate);
  }

  return times.map((t) => new Date(t));
}

/**
 * Get tomorrow's date in US Eastern timezone.
 * Useful for the cron which runs at 1AM VN (6PM UTC) —
 * at that point it's still "today" in the US, so we schedule for "tomorrow" US time.
 */
export function getTomorrowEastern(): Date {
  const now = new Date();
  const offsetHours = getEasternOffsetHours(now);
  // Current Eastern time = UTC + offset (offset is negative, so subtract)
  const easternNowMs = now.getTime() + offsetHours * 60 * 60 * 1000;
  const easternNow = new Date(easternNowMs);

  // Tomorrow in Eastern
  const tomorrow = new Date(easternNow);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);

  // Convert back: this Date represents tomorrow's date in Eastern
  // We return a Date whose UTC year/month/day matches the Eastern date
  return tomorrow;
}
