import { definePreference } from '@/shared/lib/preferences/define-preference';
import { MEANING_GUIDE_SEEN_KEY } from '@/shared/lib/preferences/first-run-seen';

export const meaningGuideSeen = definePreference({ key: MEANING_GUIDE_SEEN_KEY, values: ['off', 'on'] as const, fallback: 'off' });
