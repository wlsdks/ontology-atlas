import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { secretErrorMessage } from '@/shared/lib/llm-connection/tauri-secrets';
import { useNativeErrorLookup } from '@/shared/lib/desktop-shell/use-native-error-lookup';
import { fieldClass } from '@/shared/ui/control-class';
import { Chip } from '@/shared/ui/controls/controls';
import { isImeComposing } from '@/shared/lib/keyboard/ime-composition';
import { COMMIT_CHIP, ROW_CHIP, refocusIfLost } from './ModelRow';

/**
 * The paste field — a component that exists only while its row is open, so the draft goes with
 * it. There is no clearing code because there is nowhere for a draft to remain.
 */
export function KeyDraftForm({
  testSuffix,
  inputLabel,
  open,
  onCancel,
  onSave,
  onError,
}: {
  testSuffix: string;
  inputLabel: string;
  open: boolean;
  onCancel: () => void;
  onSave: (value: string) => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const t = useTranslations('agents.models');
  const nativeErrors = useNativeErrorLookup();
  const [draftKey, setDraftKey] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    // Explicit rather than `autoFocus` for `preventScroll`: the box is 0px tall at mount.
    inputRef.current?.focus({ preventScroll: true });
  }, [open]);

  const handleSave = async () => {
    if (!draftKey.trim() || saving) return;
    setSaving(true);
    onError(null);
    try {
      await onSave(draftKey);
      // Cleared the instant the save succeeds — the only moment a full key exists on screen ends.
      setDraftKey('');
    } catch (err) {
      onError(secretErrorMessage(err, nativeErrors));
      // The save button was disabled while it worked; the field is where the fix happens.
      refocusIfLost(inputRef);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-w-0 items-center gap-2">
      <input
        ref={inputRef}
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={draftKey}
        aria-label={inputLabel}
        placeholder={t('keyPlaceholder')}
        data-testid={`ai-key-input-${testSuffix}`}
        onChange={(event) => setDraftKey(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !isImeComposing(event)) void handleSave();
        }}
        className={fieldClass({ size: 'md', className: 'min-w-0 flex-1 font-mono placeholder:font-sans' })}
      />
      <Chip
        size="lg"
        tone="secondary"
        hoverInk="strong"
        hoverBorder="strong"
        data-testid={`ai-cancel-${testSuffix}`}
        onClick={onCancel}
        className={ROW_CHIP}
      >
        {t('cancel')}
      </Chip>
      <Chip
        size="lg"
        tone="accent"
        data-testid={`ai-save-${testSuffix}`}
        onClick={() => void handleSave()}
        disabled={!draftKey.trim() || saving}
        className={COMMIT_CHIP}
      >
        {saving ? t('saving') : t('save')}
      </Chip>
    </div>
  );
}

/** The line under a key field: where the key goes, and — for a saved key — the way to remove it. */
export function DraftFoot({ note, clear }: { note: string; clear: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-2">
      <p className="min-w-0 flex-1 basis-60 text-body leading-body text-[color:var(--color-text-tertiary)]">
        {note}
      </p>
      {clear}
    </div>
  );
}
