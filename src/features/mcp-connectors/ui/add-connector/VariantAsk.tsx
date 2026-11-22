import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Input } from '@/shared/ui/fields/input';
import { badgeClass } from '@/shared/ui/badge-class';
import { controlClass } from '@/shared/ui/control-class';
import { variantRuns, type CatalogueEntry, type CatalogueVariant } from '@/shared/config/mcp/mcp-catalogue';
import {
  runtimePath,
  type ResolvedRuntime,
} from '@/shared/lib/connectors/tauri-connector-runtimes';

import { requiredVariables } from '../../model/catalogue-variant';
import { CONNECTOR_QUIET_CLASS, CONNECTOR_SUBMIT_CLASS } from './connector-button-class';
import { variantLabel } from './variant-labels';

/**
 * Unfolded under its row before any write: provenance, the command with this machine's
 * runtime, where any value goes, one password field per required variable, and the press.
 * Without a keychain the field is not offered, since its contents would be thrown away.
 */
export function VariantAsk({
  id,
  entry,
  variant,
  runtimes,
  canStoreSecrets,
  onAttach,
  onEdit,
  onDismiss,
  testIdPrefix,
}: {
  id: string;
  entry: CatalogueEntry;
  variant: CatalogueVariant;
  runtimes: readonly ResolvedRuntime[] | null;
  canStoreSecrets: boolean;
  onAttach: (values: Record<string, string>) => void;
  onEdit: () => void;
  onDismiss: () => void;
  testIdPrefix: string;
}) {
  const t = useTranslations('connectors');
  const required = requiredVariables(variant);
  const [values, setValues] = useState<Record<string, string>>({});
  const resolved = variant.kind === 'local' ? runtimePath(runtimes, variant.runtime) : null;
  const complete = required.every((variable) => (values[variable.name] ?? '').trim().length > 0);
  const firstField = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    firstField.current?.focus();
  }, []);
  return (
    <div
      id={id}
      data-testid={`${testIdPrefix}-catalogue-ask`}
      data-variant-kind={variant.kind}
      data-variant-source={variant.source}
      className="mt-2 border-l border-[color:var(--color-border-strong)] pl-3"
    >
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-label leading-label text-[color:var(--color-text-secondary)]">
        <span>{variantLabel(t, variant)}</span>
        <span
          className={badgeClass({
            shape: 'micro',
            className:
              'border border-[color:var(--color-border-soft)] text-[color:var(--color-text-quaternary)]',
          })}
        >
          {variant.source === 'registry'
            ? t('sourceRegistry')
            : t('sourceCurated', { date: entry.verifiedAt })}
        </span>
      </p>
      <code className="mt-1 block break-all font-mono text-label leading-label text-[color:var(--color-text-tertiary)]">
        {variantRuns(variant, resolved)}
      </code>
      {required.length > 0 ? (
        <p className="mt-1 break-keep text-label leading-prose text-[color:var(--color-text-quaternary)]">
          {canStoreSecrets
            ? t('variantAsksToken', { keys: required.map((variable) => variable.name).join(', ') })
            : t('secretsWeb', { keys: required.map((variable) => variable.name).join(', ') })}
        </p>
      ) : null}
      {canStoreSecrets && required.length > 0 ? (
        <div className="mt-2 flex flex-col gap-2">
          {required.map((variable, index) => (
            <div key={variable.name} className="flex flex-col gap-1">
              <Input
                ref={index === 0 ? firstField : undefined}
                id={`${testIdPrefix}-ask-${variable.name}`}
                label={variable.name}
                size="md"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={values[variable.name] ?? ''}
                placeholder={t('valuePlaceholder')}
                data-testid={`${testIdPrefix}-catalogue-ask-value`}
                data-variable={variable.name}
                onChange={(event) =>
                  setValues((current) => ({ ...current, [variable.name]: event.target.value }))
                }
                className="w-full"
              />
              {variable.issueUrl ? (
                <a
                  href={variable.issueUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid={`${testIdPrefix}-catalogue-ask-issue`}
                  className={controlClass({
                    shape: 'link',
                    tone: 'muted',
                    hoverInk: 'strong',
                    className: 'self-start text-label',
                  })}
                >
                  <span aria-hidden data-external-link-marker>
                    ↗
                  </span>
                  {t('issueLink', { name: variable.name })}
                </a>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {canStoreSecrets || required.length === 0 ? (
          <button
            type="button"
            data-testid={`${testIdPrefix}-catalogue-ask-add`}
            disabled={!complete}
            onClick={() => onAttach(values)}
            className={CONNECTOR_SUBMIT_CLASS}
          >
            {t('customAdd')}
          </button>
        ) : null}
        <button
          type="button"
          data-testid={`${testIdPrefix}-catalogue-ask-edit`}
          onClick={onEdit}
          className={CONNECTOR_QUIET_CLASS}
        >
          {t('askEdit')}
        </button>
        <button
          type="button"
          data-testid={`${testIdPrefix}-catalogue-ask-dismiss`}
          onClick={onDismiss}
          className={CONNECTOR_QUIET_CLASS}
        >
          {t('askDismiss')}
        </button>
        <a
          href={entry.docsUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-testid={`${testIdPrefix}-catalogue-docs`}
          className={CONNECTOR_QUIET_CLASS}
        >
          <span aria-hidden data-external-link-marker>
            ↗
          </span>
          {t('catalogueDocs', { title: entry.title })}
        </a>
      </div>
    </div>
  );
}
