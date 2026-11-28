import { useTranslations } from 'use-intl';

import { fieldNameKey } from '@/features/ontology-change-review';

/** A field's name in the person's language, or its raw key in monospace when it has no name. */
export function ReviewFieldLabel({ fieldKey }: { fieldKey: string }) {
  const tChange = useTranslations('ontologyChangeReview');
  const nameKey = fieldNameKey(fieldKey);
  return nameKey
    ? <span className="text-[color:var(--color-text-tertiary)]">{tChange(nameKey)}</span>
    : <span className="font-mono text-[color:var(--color-text-tertiary)]">{fieldKey}</span>;
}
