'use client';

import { useTranslations } from 'next-intl';

const MINUTES_PER_HOUR = 60;

/** Whole minutes, at least one, or whole hours from an hour on, as the run's card says them. */
export function useMappingDuration() {
  const t = useTranslations('workCard.mapping');
  return (minutes: number) => (minutes < MINUTES_PER_HOUR
    ? t('minutes', { minutes: Math.max(1, Math.round(minutes)) })
    : t('hours', { hours: Math.round(minutes / MINUTES_PER_HOUR) }));
}
