import type { CalendarEventInput } from '@dokuvault/shared';

// ─── ICS / iCalendar generator ────────────────────────────────────────────────

function icsDate(isoDate: string): string {
  // Convert "2026-05-15" → "20260515"
  return isoDate.replace(/-/g, '');
}

function escapeICS(str: string): string {
  return str.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
}

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}@dokuvault`;
}

function formatDtstamp(): string {
  return new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
}

export function generateICS(events: CalendarEventInput[]): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DokuVault//DokuVault Desktop//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:DokuVault Termine',
    'X-WR-TIMEZONE:Europe/Berlin',
  ];

  for (const event of events) {
    const dateStr = icsDate(event.date);
    const priorityMap: Record<string, number> = {
      urgent: 1,
      high: 3,
      medium: 5,
      low: 9,
    };
    const icalPriority = priorityMap[event.priority] ?? 5;

    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid()}`,
      `DTSTAMP:${formatDtstamp()}`,
      `DTSTART;VALUE=DATE:${dateStr}`,
      `DTEND;VALUE=DATE:${dateStr}`,
      `SUMMARY:${escapeICS(event.title)}`,
      event.description
        ? `DESCRIPTION:${escapeICS(event.description)}`
        : 'DESCRIPTION:',
      `PRIORITY:${icalPriority}`,
      'STATUS:CONFIRMED',
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
