import { definePreference } from '@/shared/lib/preferences/define-preference';
import { MEANING_GUIDE_SEEN_KEY } from '@/shared/lib/preferences/first-run-seen';

/** Whether the person has met the first-use guide: set by Not now, and by setting search up from it. */
export const meaningGuideSeen = definePreference({ key: MEANING_GUIDE_SEEN_KEY, values: ['off', 'on'] as const, fallback: 'off' });
