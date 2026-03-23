/**
 * Pinterest peak-hours scheduler.
 *
 * Generates random posting times spread across 8 AM – 10 PM EST
 * with a configurable minimum gap between consecutive posts.
 */

/** Pinterest peak window: 8 AM to 10 PM EST (14-hour window). */
const PEAK_START_HOUR = 8; // 8 AM EST
const PEAK_END_HOUR = 22; // 10 PM EST
const DEFAULT_MIN_GAP_MINUTES = 30;

/**
 * Generate `count` random posting times on `targetDate`, spread
 * across Pinterest peak hours (8 AM – 10 PM EST) with at least
 * `minGapMinutes` between each post.
 *
 * @param count   Number of time slots to generate.
 * @param targetDate  The calendar date to schedule on (time portion is ignored).
 * @param minGapMinutes  Minimum minutes between consecutive times (default: 30).
 * @returns Sorted array of Date objects in chronological order.
 * @throws If the requested count cannot fit within peak hours with the minimum gap.
 */
export function generateRandomTimes(
  count: number,
  targetDate: Date,
  minGapMinutes: number = DEFAULT_MIN_GAP_MINUTES
): Date[] {
  if (count <= 0) return [];

  const totalWindowMinutes = (PEAK_END_HOUR - PEAK_START_HOUR) * 60; // 840 min

  if (count > Math.floor(totalWindowMinutes / minGapMinutes) + 1) {
    throw new Error(
      `Cannot fit ${count} pins in the peak window with ${minGapMinutes}-minute gaps. ` +
        `Maximum is ${Math.floor(totalWindowMinutes / minGapMinutes) + 1}.`
    );
  }

  // Build the base date at midnight EST.
  // EST = UTC-5. We store everything as UTC Date objects.
  const estOffsetMs = 5 * 60 * 60 * 1000;
  const base = new Date(targetDate);
  base.setUTCHours(0, 0, 0, 0);

  // Window start/end in UTC
  const windowStartMs = base.getTime() + (PEAK_START_HOUR * 60 * 60 * 1000) + estOffsetMs;
  const windowEndMs = base.getTime() + (PEAK_END_HOUR * 60 * 60 * 1000) + estOffsetMs;

  // Generate times using rejection-free interval sampling:
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
