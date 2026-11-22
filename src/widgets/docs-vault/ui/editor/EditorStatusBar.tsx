import { Check, CheckSquare, Eye, EyeOff, Save, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import { BrandMark } from '@/shared/ui/marks/brand-mark';
import { Chip } from '@/shared/ui';
import { saveStatusOf } from '../../lib/editor/save-status';

function dirtyIconInk(dirty: boolean): string {
  return dirty
    ? 'text-[color:var(--color-amber-docs-a95)]'
    : 'text-[color:var(--color-text-quaternary)]';
}

function dirtyValueInk(dirty: boolean): string {
  return dirty
    ? 'font-[var(--font-weight-signature)] text-[color:var(--color-amber-docs-a95)]'
    : 'text-[color:var(--color-text-tertiary)]';
}

interface Props {
  slug: string;
  dirty: boolean;
  saving: boolean;
  savedFlash: boolean;
  draftSavedAt: number | null;
  preview: boolean;
  onTogglePreview: () => void;
  onSave: () => void;
  onClose: () => void;
}

/** The strip above the textarea: where the document is, what is saved where, and Preview/Save/Close. */
export function EditorStatusBar({
  slug,
  dirty,
  saving,
  savedFlash,
  draftSavedAt,
  preview,
  onTogglePreview,
  onSave,
  onClose,
}: Props) {
  const t = useTranslations('vaultWidgets.editor');
  const saveStatus = saveStatusOf({ saving, dirty, savedFlash, draftSavedAt });
  return (
    <div className="flex flex-none items-center gap-2 border-b border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] px-4 py-2 text-label">
      <span className="font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
        {t.rich('editorEyebrow', {
          slug,
          value: (chunks) => <span className="normal-case tracking-normal">{chunks}</span>,
        })}
      </span>
      <span
        className={
          saveStatus.tone === 'dirty'
            ? "inline-flex items-center gap-1.5 rounded-micro border border-[color:var(--color-amber-docs-a25)] bg-[color:var(--color-amber-docs-a08)] px-2 py-1 font-mono text-label uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-amber-docs-a95)]"
            : saveStatus.tone === 'saved'
              ? "inline-flex items-center gap-1.5 rounded-micro border border-[color:var(--color-indigo-line-a22)] bg-[color:var(--color-indigo-a08)] px-2 py-1 font-mono text-label uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-indigo-line-a90)]"
              : "inline-flex items-center gap-1.5 rounded-micro border border-[color:var(--color-overlay-2)] bg-[color:var(--color-overlay-1)] px-2 py-1 font-mono text-label uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-text-tertiary)]"
        }
        aria-live="polite"
      >
        {saveStatus.tone === 'saved' ? <Check size={ICON_SIZE.sm} aria-hidden /> : null}
        <span>{t(saveStatus.labelKey)}</span>
        <span className="hidden normal-case tracking-normal text-[color:var(--color-text-quaternary)] sm:inline">
          {t(saveStatus.bodyKey)}
        </span>
      </span>
      <span
        className="hidden min-w-0 items-center gap-1.5 rounded-micro border border-[color:var(--color-overlay-2)] bg-[color:var(--color-overlay-1)] px-2 py-1 text-label text-[color:var(--color-text-tertiary)] lg:inline-flex"
        aria-label={t('saveContractAriaLabel')}
      >
        <Check size={ICON_SIZE.sm} className="text-[color:var(--color-text-quaternary)]" aria-hidden />
        <span className="font-mono uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-text-quaternary)]">
          {t('draftContract')}
        </span>
        <span className="truncate">
          {draftSavedAt
            ? t('draftContractActive')
            : dirty
              ? t('draftContractPending')
              : t('draftContractIdle')}
        </span>
        <span className="text-[color:var(--color-text-quaternary)]" aria-hidden>
          ·
        </span>
        <Save
          size={ICON_SIZE.sm}
          className={dirtyIconInk(dirty)}
          aria-hidden
        />
        <span className="font-mono uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-text-quaternary)]">
          {t('diskContract')}
        </span>
        <span
          className={`truncate ${dirtyValueInk(dirty)}`}
        >
          {dirty ? t('diskContractNeedsSave') : t('diskContractClean')}
        </span>
      </span>
      <span
        className="hidden min-w-0 items-center gap-1.5 rounded-micro border border-[color:var(--color-overlay-2)] bg-[color:var(--color-overlay-1)] px-2 py-1 text-label text-[color:var(--color-text-tertiary)] 2xl:inline-flex"
        aria-label={t('saveWorkflowAriaLabel')}
      >
        <CheckSquare
          size={ICON_SIZE.sm}
          className={dirtyIconInk(dirty)}
          aria-hidden
        />
        <span className="font-mono uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-text-quaternary)]">
          {t('validateContract')}
        </span>
        <span
          className={`truncate ${dirtyValueInk(dirty)}`}
        >
          {dirty ? t('validateContractDirty') : t('validateContractClean')}
        </span>
        <span className="text-[color:var(--color-text-quaternary)]" aria-hidden>
          ·
        </span>
        <X
          size={ICON_SIZE.sm}
          className={dirtyIconInk(dirty)}
          aria-hidden
        />
        <span className="font-mono uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-text-quaternary)]">
          {t('revertContract')}
        </span>
        <span className="truncate">
          {dirty ? t('revertContractDirty') : t('revertContractClean')}
        </span>
      </span>
      <div className="ml-auto flex items-center gap-1.5">
        <Chip
          active={preview}
          onClick={onTogglePreview}
          className="hover:border-[color:var(--color-indigo-line-a32)] hover:text-[color:var(--color-text-primary)]"
          aria-pressed={preview}
          title={t('previewTooltip')}
        >
          {preview ? (
            <EyeOff size={ICON_SIZE.sm} aria-hidden />
          ) : (
            <Eye size={ICON_SIZE.sm} aria-hidden />
          )}
          {t('preview')}
        </Chip>
        <Chip
          active
          tone="accent"
          onClick={onSave}
          disabled={saving || !dirty}
          className="hover:border-[color:var(--color-indigo-line-a54)]"
          title={t('saveTooltip')}
        >
          {saving ? (
            <>
              {/* Keep the 12px layout slot while the micro master stays native 16px. */}
              <span className="relative inline-flex size-3 shrink-0" aria-hidden="true">
                <BrandMark detail="micro" alt="" className="atlas-inline-waiting-mark absolute left-1/2 top-1/2 size-4 max-w-none -translate-x-1/2 -translate-y-1/2" />
              </span>
              {t('saving')}
            </>
          ) : (
            <>
              <Save size={ICON_SIZE.sm} aria-hidden />
              {t('save')}
            </>
          )}
        </Chip>
        <Chip
          onClick={onClose}
          disabled={saving}
          className="hover:border-[color:var(--color-overlay-3)] hover:text-[color:var(--color-text-primary)]"
          title={dirty ? t('closeUnsavedTooltip') : t('closeTooltip')}
        >
          <X size={ICON_SIZE.sm} aria-hidden />
          {dirty ? t('cancel') : t('closeAction')}
        </Chip>
      </div>
    </div>
  );
}
