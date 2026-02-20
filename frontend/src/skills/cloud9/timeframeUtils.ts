/**
 * Timeframe Utilities
 *
 * Shared natural-language timeframe parser for Cloud9 skills.
 * Extracted from dominos/dashboardStats.ts and enhanced with labels.
 */

/** Format a Date as YYYY-MM-DD */
function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export interface TimeframeResult {
  startDate: string;
  endDate: string;
  /** Human-readable label for display (e.g. "Today", "This Week") */
  label: string;
}

/**
 * Parse a natural-language timeframe from the user query.
 * Returns { startDate, endDate, label } or undefined for "all time" / no match.
 */
export function parseTimeframe(query: string): TimeframeResult | undefined {
  const q = query.toLowerCase();
  const now = new Date();

  // "today" / "this morning" / "this afternoon"
  if (/\b(?:today|this\s+morning|this\s+afternoon)\b/.test(q)) {
    const d = fmtDate(now);
    return { startDate: d, endDate: d, label: 'Today' };
  }

  // "yesterday"
  if (/\byesterday\b/.test(q)) {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const d = fmtDate(y);
    return { startDate: d, endDate: d, label: 'Yesterday' };
  }

  // "this week" (Monday-today)
  if (/\bthis\s+week\b/.test(q)) {
    const monday = new Date(now);
    const day = monday.getDay();
    const diff = day === 0 ? 6 : day - 1;
    monday.setDate(monday.getDate() - diff);
    return { startDate: fmtDate(monday), endDate: fmtDate(now), label: 'This Week' };
  }

  // "last week" (previous Mon-Sun)
  if (/\blast\s+week\b/.test(q)) {
    const monday = new Date(now);
    const day = monday.getDay();
    const diff = day === 0 ? 6 : day - 1;
    monday.setDate(monday.getDate() - diff - 7);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { startDate: fmtDate(monday), endDate: fmtDate(sunday), label: 'Last Week' };
  }

  // "this month"
  if (/\bthis\s+month\b/.test(q)) {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    return { startDate: fmtDate(first), endDate: fmtDate(now), label: 'This Month' };
  }

  // "last month"
  if (/\blast\s+month\b/.test(q)) {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last = new Date(now.getFullYear(), now.getMonth(), 0);
    return { startDate: fmtDate(first), endDate: fmtDate(last), label: 'Last Month' };
  }

  // "last N weeks" / "past N weeks"
  const weeksMatch = q.match(/(?:last|past)\s+(\d+)\s+weeks?/);
  if (weeksMatch) {
    const n = parseInt(weeksMatch[1], 10);
    const start = new Date(now);
    start.setDate(start.getDate() - n * 7);
    return { startDate: fmtDate(start), endDate: fmtDate(now), label: `Last ${n} Week${n > 1 ? 's' : ''}` };
  }

  // "last N days" / "past N days"
  const daysMatch = q.match(/(?:last|past)\s+(\d+)\s+days?/);
  if (daysMatch) {
    const n = parseInt(daysMatch[1], 10);
    const start = new Date(now);
    start.setDate(start.getDate() - n);
    return { startDate: fmtDate(start), endDate: fmtDate(now), label: `Last ${n} Day${n > 1 ? 's' : ''}` };
  }

  // "last N months" / "past N months"
  const monthsMatch = q.match(/(?:last|past)\s+(\d+)\s+months?/);
  if (monthsMatch) {
    const n = parseInt(monthsMatch[1], 10);
    const start = new Date(now);
    start.setMonth(start.getMonth() - n);
    return { startDate: fmtDate(start), endDate: fmtDate(now), label: `Last ${n} Month${n > 1 ? 's' : ''}` };
  }

  // "last N hours" - map to today
  const hoursMatch = q.match(/(?:last|past)\s+(\d+)\s+hours?/);
  if (hoursMatch) {
    const d = fmtDate(now);
    return { startDate: d, endDate: d, label: 'Today' };
  }

  // Day-of-week: "last monday", "on wednesday", "friday", "this tuesday"
  const dayNames: Record<string, number> = {
    sunday: 0, sun: 0,
    monday: 1, mon: 1,
    tuesday: 2, tue: 2, tues: 2,
    wednesday: 3, wed: 3,
    thursday: 4, thu: 4, thurs: 4,
    friday: 5, fri: 5,
    saturday: 6, sat: 6,
  };
  const dayPattern = Object.keys(dayNames).join('|');
  const dayMatch = q.match(new RegExp(`(?:last|this|on|from)?\\s*(${dayPattern})\\b`));
  if (dayMatch) {
    const targetDay = dayNames[dayMatch[1]];
    const currentDay = now.getDay();
    // Calculate days back: if target is same as today, go back 7 days
    let daysBack = currentDay - targetDay;
    if (daysBack <= 0) daysBack += 7;
    const target = new Date(now);
    target.setDate(target.getDate() - daysBack);
    const d = fmtDate(target);
    const label = dayMatch[1].charAt(0).toUpperCase() + dayMatch[1].slice(1);
    return { startDate: d, endDate: d, label: `${label} (${d})` };
  }

  // Explicit date: "2/18", "02/18", "2/18/2026", "feb 18", "february 18"
  const monthNames: Record<string, number> = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
    apr: 3, april: 3, may: 4, jun: 5, june: 5,
    jul: 6, july: 6, aug: 7, august: 7, sep: 8, september: 8,
    oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
  };
  // "2/18" or "2/18/2026"
  const slashMatch = q.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/);
  if (slashMatch) {
    const month = parseInt(slashMatch[1], 10) - 1;
    const day = parseInt(slashMatch[2], 10);
    const year = slashMatch[3] ? parseInt(slashMatch[3], 10) : now.getFullYear();
    const target = new Date(year, month, day);
    const d = fmtDate(target);
    return { startDate: d, endDate: d, label: d };
  }
  // "feb 18" / "february 18"
  const monthNamePattern = Object.keys(monthNames).join('|');
  const namedDateMatch = q.match(new RegExp(`(${monthNamePattern})\\s+(\\d{1,2})(?:\\s*,?\\s*(\\d{4}))?`));
  if (namedDateMatch) {
    const month = monthNames[namedDateMatch[1]];
    const day = parseInt(namedDateMatch[2], 10);
    const year = namedDateMatch[3] ? parseInt(namedDateMatch[3], 10) : now.getFullYear();
    const target = new Date(year, month, day);
    const d = fmtDate(target);
    return { startDate: d, endDate: d, label: d };
  }

  return undefined;
}
