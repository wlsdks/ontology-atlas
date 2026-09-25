/** One date format for a schedule's row and its run history, so one run never reads two ways. */
export function automationDate(locale: string, value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date)
    : '—';
}
