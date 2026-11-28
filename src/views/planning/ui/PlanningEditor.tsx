import { useEffect, useRef } from 'react';
import { useTranslations } from 'use-intl';
import { isImeComposing } from '@/shared/lib/keyboard/ime-composition';
import { Button, Textarea } from '@/shared/ui';

export function PlanningEditor({ labelledBy, text, notice, saving, onChange, onSave, onCancel }: {
  labelledBy: string;
  text: string;
  notice: 'refused' | 'failed' | null;
  saving: boolean;
  onChange: (text: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations('planning');
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const node = field.current;
    if (!node) return;
    node.focus({ preventScroll: true });
    node.setSelectionRange(node.value.length, node.value.length);
  }, []);
  return <div data-planning-editor className="mx-auto flex h-full max-w-[var(--measure-doc-column)] flex-col gap-3">
    {notice && <p role="alert" className="flex-none text-body leading-body text-[color:var(--color-text-primary)]">{t(notice === 'refused' ? 'saveRefused' : 'saveFailed')}</p>}
    <Textarea
      ref={field}
      labelledBy={labelledBy}
      value={text}
      readOnly={saving}
      spellCheck={false}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (isImeComposing(event)) return;
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); onSave(); }
      }}
      className="min-h-0 flex-1 [&>div]:min-h-0 [&>div]:flex-1 [&_textarea]:flex-1 [&_textarea]:resize-none [&_textarea]:font-mono"
    />
    <div className="flex flex-none justify-end gap-2">
      <Button variant="ghost" size="sm" data-planning-cancel onClick={onCancel}>{t('cancel')}</Button>
      <Button size="sm" data-planning-save disabled={saving} onClick={onSave}>{t('save')}</Button>
    </div>
  </div>;
}
