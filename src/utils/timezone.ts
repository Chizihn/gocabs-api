// Timezone utility functions
export function getTimezone(): string {
  return process.env.TIMEZONE || 'UTC';
}

export function formatDateWithTimezone(date: Date, timezone?: string): string {
  const tz = timezone || getTimezone();
  return date.toLocaleString('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function convertToTimezone(date: Date, timezone?: string): Date {
  const tz = timezone || getTimezone();
  const dateString = date.toLocaleString('en-US', { timeZone: tz });
  return new Date(dateString);
}

