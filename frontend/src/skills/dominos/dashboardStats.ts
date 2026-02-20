/**
 * Dashboard Stats Skill
 *
 * Fetches and formats Dominos order dashboard statistics.
 * Handles queries like:
 *   "show dashboard stats"
 *   "order summary"
 *   "how many orders"
 *   "how many orders yesterday"
 *   "orders today"
 *   "orders this week"
 *   "success rate last 7 days"
 */

import type { SkillEntry, SkillResult } from './types';
import { getDashboardStats } from '../../services/api/dominosApi';

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function rateColor(rate: number): string {
  if (rate >= 0.95) return '🟢';
  if (rate >= 0.80) return '🟡';
  return '🔴';
}

function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Format a Date as YYYY-MM-DD */
function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Parse a natural-language timeframe from the user query.
 * Returns { startDate, endDate } or undefined for "all time".
 */
function parseTimeframe(query: string): { startDate: string; endDate: string } | undefined {
  const q = query.toLowerCase();
  const now = new Date();

  // "today"
  if (/\btoday\b/.test(q)) {
    const d = fmtDate(now);
    return { startDate: d, endDate: d };
  }

  // "yesterday"
  if (/\byesterday\b/.test(q)) {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const d = fmtDate(y);
    return { startDate: d, endDate: d };
  }

  // "this week" (Monday–today)
  if (/\bthis\s+week\b/.test(q)) {
    const monday = new Date(now);
    const day = monday.getDay();
    const diff = day === 0 ? 6 : day - 1; // Monday=0 offset
    monday.setDate(monday.getDate() - diff);
    return { startDate: fmtDate(monday), endDate: fmtDate(now) };
  }

  // "last week" (previous Mon–Sun)
  if (/\blast\s+week\b/.test(q)) {
    const monday = new Date(now);
    const day = monday.getDay();
    const diff = day === 0 ? 6 : day - 1;
    monday.setDate(monday.getDate() - diff - 7);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { startDate: fmtDate(monday), endDate: fmtDate(sunday) };
  }

  // "this month"
  if (/\bthis\s+month\b/.test(q)) {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    return { startDate: fmtDate(first), endDate: fmtDate(now) };
  }

  // "last month"
  if (/\blast\s+month\b/.test(q)) {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last = new Date(now.getFullYear(), now.getMonth(), 0);
    return { startDate: fmtDate(first), endDate: fmtDate(last) };
  }

  // "last N weeks" / "past N weeks"
  const weeksMatch = q.match(/(?:last|past)\s+(\d+)\s+weeks?/);
  if (weeksMatch) {
    const n = parseInt(weeksMatch[1], 10);
    const start = new Date(now);
    start.setDate(start.getDate() - n * 7);
    return { startDate: fmtDate(start), endDate: fmtDate(now) };
  }

  // "last N days" / "past N days"
  const daysMatch = q.match(/(?:last|past)\s+(\d+)\s+days?/);
  if (daysMatch) {
    const n = parseInt(daysMatch[1], 10);
    const start = new Date(now);
    start.setDate(start.getDate() - n);
    return { startDate: fmtDate(start), endDate: fmtDate(now) };
  }

  // "last N months" / "past N months"
  const monthsMatch = q.match(/(?:last|past)\s+(\d+)\s+months?/);
  if (monthsMatch) {
    const n = parseInt(monthsMatch[1], 10);
    const start = new Date(now);
    start.setMonth(start.getMonth() - n);
    return { startDate: fmtDate(start), endDate: fmtDate(now) };
  }

  // "last N hours" — map to today
  const hoursMatch = q.match(/(?:last|past)\s+(\d+)\s+hours?/);
  if (hoursMatch) {
    const d = fmtDate(now);
    return { startDate: d, endDate: d };
  }

  return undefined;
}

async function execute(query: string): Promise<SkillResult> {
  try {
    const timeframe = parseTimeframe(query);
    const stats = await getDashboardStats(timeframe);

    const lines: string[] = [];
    lines.push('## Dashboard Stats');
    if (stats.period) {
      lines.push(`*${stats.period}*`);
    }
    lines.push('');

    // Build deep-link URLs from timeframe
    const ordersBase = timeframe
      ? `/dominos/orders?fromDate=${timeframe.startDate}&toDate=${timeframe.endDate}`
      : `/dominos/orders`;
    const sessionsBase = timeframe
      ? `/dominos/call-tracing?fromDate=${timeframe.startDate}&toDate=${timeframe.endDate}`
      : `/dominos/call-tracing`;
    const qJoin = timeframe ? '&' : '?';

    // Orders overview
    lines.push('### Orders');
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Total Orders | **[${stats.totalOrders}](${ordersBase})** |`);
    lines.push(`| Successful | ${stats.successfulOrders > 0 ? `**[${stats.successfulOrders}](${ordersBase}${qJoin}status=success)**` : '**0**'} |`);
    lines.push(`| Failed | ${stats.failedOrders > 0 ? `**[${stats.failedOrders}](${ordersBase}${qJoin}status=failed)**` : '**0**'} |`);
    lines.push(`| Success Rate | ${rateColor(stats.successRate)} **${formatPercent(stats.successRate)}** |`);

    lines.push('');

    // Revenue
    lines.push('### Revenue');
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Total Revenue | **${formatCurrency(stats.totalRevenue)}** |`);
    lines.push(`| Avg Order Value | **${formatCurrency(stats.averageOrderValue)}** |`);

    lines.push('');

    // Performance
    lines.push('### Performance');
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Avg Response Time | **${formatMs(stats.averageResponseTime)}** |`);
    lines.push(`| Unique Sessions | **[${stats.uniqueSessions}](${sessionsBase})** |`);

    return { success: true, markdown: lines.join('\n'), data: stats };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      markdown: `## Dashboard Stats Failed\n\nCould not fetch dashboard stats: ${msg}`,
    };
  }
}

export const dashboardStatsSkill: SkillEntry = {
  id: 'dashboard-stats',
  label: 'Dashboard Stats',
  category: 'dominos-orders',
  sampleQuery: 'Show dashboard stats',
  triggers: [
    /(?:show|get|display)\s+(?:the\s+)?dashboard\s+stats/i,
    /\border\s+summary\b/i,
    /how\s+many\s+orders/i,
    /\bsuccess\s+rate\b/i,
    /\bdashboard\s+(?:overview|statistics)\b/i,
    /\border\s+stats\b/i,
    /\borders\s+(?:today|yesterday|this\s+week|last\s+week|this\s+month|last\s+month)\b/i,
  ],
  execute,
};
