export const DEMO_TIMEZONE = 'America/New_York';

/**
 * Returns a new Date object representing the current moment, but 
 * conceptually shifted so its local `.getHours()`, etc., match the New York time.
 * Note: this is a trick for simple math. A better way is to use `Intl.DateTimeFormat` 
 * to parse out the NY parts.
 */
export function getNowInNY(): Date {
  const now = new Date();
  const nyString = now.toLocaleString("en-US", { timeZone: DEMO_TIMEZONE });
  return new Date(nyString); // This parses the NY string as local, so .getHours() gives NY hour.
}

export function createNYDateISO(daysDiff: number, hours: number = 10, minutes: number = 0): string {
  // Get what "now" looks like in NY
  const now = new Date();
  const nyString = now.toLocaleString("en-US", { timeZone: DEMO_TIMEZONE });
  const nyLocal = new Date(nyString);
  
  // Apply days diff
  nyLocal.setDate(nyLocal.getDate() + daysDiff);
  // Apply hours and minutes (this sets local hours, which corresponds to NY hours in our hack)
  nyLocal.setHours(hours, minutes, 0, 0);

  // Now we need to convert this "nyLocal" back to a real UTC timestamp representing that exact NY time.
  // We can format it to ISO string, but attach the correct NY offset.
  // Actually, standard `Intl.DateTimeFormat` doesn't easily give the offset in ISO.
  // We can do it by finding the offset between UTC and NY for that specific date.
  
  // A cleaner approach: Use Intl to format the target date to a string, then parse it.
  // Wait, let's just use the inverse offset.
  // We'll format the UTC date as NY time, find the difference in ms, and subtract.
  
  // Let's use standard Date math:
  // Create a UTC date from the target NY parts
  const targetUTC = new Date(Date.UTC(
    nyLocal.getFullYear(), nyLocal.getMonth(), nyLocal.getDate(),
    nyLocal.getHours(), nyLocal.getMinutes(), 0, 0
  ));
  
  // Find NY offset for this specific targetUTC date
  // targetUTC is e.g. 10:00 UTC. What is this time in NY? 06:00 (if EDT).
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DEMO_TIMEZONE,
    timeZoneName: 'longOffset',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).formatToParts(targetUTC);
  
  const offsetPart = parts.find(p => p.type === 'timeZoneName')?.value || 'GMT-04:00';
  // offsetPart looks like "GMT-04:00" or "GMT-05:00"
  let offsetStr = offsetPart.replace('GMT', '');
  if (!offsetStr || offsetStr === '') { offsetStr = '+00:00'; }
  
  // Construct a strict ISO string with the exact NY offset at that time.
  const pad = (n: number) => String(n).padStart(2, '0');
  const isoStr = `${nyLocal.getFullYear()}-${pad(nyLocal.getMonth()+1)}-${pad(nyLocal.getDate())}T${pad(nyLocal.getHours())}:${pad(nyLocal.getMinutes())}:00${offsetStr}`;
  
  return isoStr;
}

export function formatCareTime(dateString: string | number | Date | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('en-US', {
    timeZone: DEMO_TIMEZONE,
    ...options
  }).format(date);
}

export function formatTimeline(dateString: string | number | Date | null | undefined): string {
  return formatCareTime(dateString, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
}

export function formatTimeOnly(dateString: string | number | Date | null | undefined): string {
  return formatCareTime(dateString, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
}

export function formatDayTime(dateString: string | number | Date | null | undefined): string {
  return formatCareTime(dateString, { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
}

export function formatDateTime(dateString: string | number | Date | null | undefined): string {
  return formatCareTime(dateString, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
}

export function getCareDateKey(dateString: string | number | Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: DEMO_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date(dateString));
  const part = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function formatElderHeader(dateString: string | number | Date | null | undefined): string {
  return formatCareTime(dateString, { weekday: 'long', month: 'long', day: 'numeric', timeZoneName: 'short' });
}

export function formatAuditTime(dateString: string | number | Date | null | undefined): string {
  return formatCareTime(dateString, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZoneName: 'short' });
}

/**
 * Converts a `datetime-local` input value ("YYYY-MM-DDTHH:mm") into an ISO
 * string anchored to the demo timezone, so a time a caregiver types is stored
 * as that wall-clock time in New York rather than the browser's zone.
 */
export function nyIsoFromWallClock(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return '';

  const [, year, month, day, hour, minute] = match.map(Number) as unknown as number[];

  const approximate = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DEMO_TIMEZONE,
    timeZoneName: 'longOffset',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(approximate);

  const offset = (parts.find(p => p.type === 'timeZoneName')?.value || 'GMT-04:00').replace('GMT', '') || '+00:00';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00${offset}`;
}

/** Current NY wall clock formatted for a `datetime-local` input's min attribute. */
export function nyWallClockNow(): string {
  const now = getNowInNY();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}
