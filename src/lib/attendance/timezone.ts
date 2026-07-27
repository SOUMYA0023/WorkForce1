/**
 * Timezone & Plant Date Standardization (Refinement #4)
 *
 * All DB timestamps are stored in UTC (timestamp with time zone).
 * Attendance event dates, shift start/end comparisons, and late/early-exit calculations
 * use the configured plant timezone (`PLANT_TIMEZONE`, default `Asia/Kolkata`).
 * Device clocks, browser clocks, and scanner clocks are strictly ignored.
 */

export const PLANT_TIMEZONE = process.env.PLANT_TIMEZONE || "Asia/Kolkata";

/**
 * Returns current date string (YYYY-MM-DD) in plant timezone.
 */
export function getPlantDateString(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: PLANT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date); // Format: YYYY-MM-DD
}

/**
 * Returns current time string (HH:mm:ss) in plant timezone.
 */
export function getPlantTimeString(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: PLANT_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return formatter.format(date);
}

/**
 * Converts a time string "HH:mm:ss" and a date string "YYYY-MM-DD" in plant timezone
 * to a JavaScript Date object (in UTC).
 */
export function parsePlantDateTimeToUtc(
  dateStr: string,
  timeStr: string
): Date {
  // Construct ISO string with offset or parse via Intl
  const isoStr = `${dateStr}T${timeStr}`;
  // For standard plant calculation: parse time string seconds
  const [hours, minutes, seconds] = timeStr.split(":").map(Number);
  const targetDate = new Date(`${dateStr}T00:00:00.000Z`);
  targetDate.setUTCHours(hours, minutes, seconds || 0, 0);
  return targetDate;
}
