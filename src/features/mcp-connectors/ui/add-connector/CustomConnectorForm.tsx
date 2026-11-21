import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, X } from 'lucide-react';

import { Checkbox, Chip, IconButton } from '@/shared/ui';
import { SegmentedControl } from '@/shared/ui/fields/segmented-control';
import { Input } from '@/shared/ui/fields/input';
import { cn } from '@/shared/lib/cn';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import {
  connectorProblems,
  looksLikeSecretKey,
  type ConnectorProblem,
  type ConnectorRecord,
  type ConnectorTransport,
} from '@/shared/lib/connectors/connector-record';
import { MCP_CATALOGUE_CAPTURED_AT } from '@/shared/config/mcp-catalogue';
import type { ResolvedRuntime } from '@/shared/lib/connectors/tauri-connector-runtimes';

import {
  buildDraftRecord,
  draftForWrite,
  draftRuns,
  newConnectorId,
  type CustomPrefill,
  type DraftVariable,
  type SecretToStore,
} from '../../model/connector-draft';
import { CONNECTOR_SUBMIT_CLASS } from './connector-button-class';

type ProblemKey = `problem.${ConnectorProblem}`;

export function CustomConnectorForm({
  prefill,
  runtimes,
  canStoreSecrets,
  onAdd,
  testIdPrefix,
}: {
  prefill: CustomPrefill;
  runtimes: readonly ResolvedRuntime[] | null;
  canStoreSecrets: boolean;
  onAdd: (connector: ConnectorRecord, secrets: SecretToStore[]) => void;
  testIdPrefix: string;
}) {
  const t = useTranslations('connectors');
  const [transport, setTransport] = useState<ConnectorTransport>(prefill.transport);
  const [name, setName] = useState(prefill.name);
  const [command, setCommand] = useState(prefill.command);
  const [args, setArgs] = useState(prefill.args);
  const [url, setUrl] = useState(prefill.url);
  const [variables, setVariables] = useState<DraftVariable[]>(prefill.variables);
  const [typedCommand, setTypedCommand] = useState(false);

  const installed = (runtimes ?? []).filter((runtime) => runtime.path !== null);

  const draft = useMemo<ConnectorRecord>(
    () => buildDraftRecord({ name, transport, command, args, url, variables }),
    [args, command, name, transport, url, variables],
  );

  const problems = connectorProblems(draft);
  const runs = draftRuns(draft);
  const changeVariable = (index: number, next: Partial<DraftVariable>) =>
    setVariables((current) =>
      current.map((variable, position) =>
        position === index ? { ...variable, ...next } : variable,
      ),
    );

  return (
    <div data-testid={`${testIdPrefix}-custom`}>
      {prefill.provenance ? (
        /*
         * Provenance above a pre-filled form, or `connectors.json` would hold an untraceable row.
         */
        <p
          data-testid={`${testIdPrefix}-custom-provenance`}
          className="mb-3 break-keep border-l border-[color:var(--color-border-strong)] pl-2.5 text-label leading-prose text-[color:var(--color-text-tertiary)]"
        >
          {t('customFromCatalogue', {
            title: prefill.provenance.title,
            date: MCP_CATALOGUE_CAPTURED_AT,
          })}
        </p>
      ) : (
        <p className="mb-3 break-keep text-label leading-prose text-[color:var(--color-text-tertiary)]">
          {t('customBody')}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <Input
          id={`${testIdPrefix}-custom-name`}
          label={t('fieldName')}
          size="md"
          type="text"
          spellCheck={false}
          autoComplete="off"
          value={name}
          placeholder="notion"
          data-testid={`${testIdPrefix}-custom-name`}
          onChange={(event) => setName(event.target.value)}
          className="w-full"
        />

        <div>
          <p className="text-label leading-label text-[color:var(--color-text-secondary)]">
            {t('transportLabel')}
          </p>
          <SegmentedControl
            ariaLabel={t('transportLabel')}
            value={transport}
            onChange={setTransport}
            testId={`${testIdPrefix}-custom-transport`}
            className="mt-1"
            options={[
              {
                value: 'stdio' as ConnectorTransport,
                label: t('transport.stdio'),
                testId: `${testIdPrefix}-custom-transport-stdio`,
              },
              {
                value: 'http' as ConnectorTransport,
                label: t('transport.http'),
                testId: `${testIdPrefix}-custom-transport-http`,
              },
            ]}
          />
        </div>

        {transport === 'stdio' ? (
          <>
            <div data-testid={`${testIdPrefix}-custom-runtime`}>
              {/*
               * The group label only when there is a choice; otherwise `Input` owns the accessible
               * name and a second label would sit on the same box.
               */}
              {installed.length > 0 ? (
                <p className="text-label leading-label text-[color:var(--color-text-secondary)]">
                  {t('fieldRuntime')}
                </p>
              ) : null}
              {installed.length > 0 ? (
                <>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {installed.map((runtime) => (
                      <Chip
                        key={runtime.name}
                        data-testid={`${testIdPrefix}-custom-runtime-${runtime.name}`}
                        aria-pressed={command === runtime.path}
                        tone={command === runtime.path ? 'accent' : 'secondary'}
                        onClick={() => {
                          setCommand(runtime.path ?? '');
                          setTypedCommand(false);
                        }}
                      >
                        {runtime.name}
                      </Chip>
                    ))}
                    <Chip
                      data-testid={`${testIdPrefix}-custom-runtime-other`}
                      aria-pressed={typedCommand}
                      tone={typedCommand ? 'accent' : 'secondary'}
                      onClick={() => setTypedCommand(true)}
                    >
                      {t('runtimeOther')}
                    </Chip>
                  </div>
                  {command && !typedCommand ? (
                    <code
                      data-testid={`${testIdPrefix}-custom-runtime-path`}
                      className="mt-1 block break-all font-mono text-label leading-label text-[color:var(--color-text-quaternary)]"
                    >
                      {command}
                    </code>
                  ) : null}
                </>
              ) : null}
              {installed.length === 0 || typedCommand ? (
                <Input
                  id={`${testIdPrefix}-custom-command`}
                  label={t('fieldCommand')}
                  hint={t('fieldCommandHint')}
                  size="md"
                  type="text"
                  spellCheck={false}
                  autoComplete="off"
                  value={command}
                  placeholder="/opt/homebrew/bin/npx"
                  data-testid={`${testIdPrefix}-custom-command`}
                  onChange={(event) => {
                    setCommand(event.target.value);
                    setTypedCommand(true);
                  }}
                  className="mt-1 w-full"
                />
              ) : null}
            </div>
            <Input
              id={`${testIdPrefix}-custom-args`}
              label={t('fieldArgs')}
              size="md"
              type="text"
              spellCheck={false}
              autoComplete="off"
              value={args}
              placeholder="-y @notionhq/notion-mcp-server"
              data-testid={`${testIdPrefix}-custom-args`}
              onChange={(event) => setArgs(event.target.value)}
              className="w-full"
            />
          </>
        ) : (
          <Input
            id={`${testIdPrefix}-custom-url`}
            label={t('fieldUrl')}
            size="md"
            type="text"
            spellCheck={false}
            autoComplete="off"
            value={url}
            placeholder="https://mcp.notion.com/mcp"
            data-testid={`${testIdPrefix}-custom-url`}
            onChange={(event) => setUrl(event.target.value)}
            className="w-full"
          />
        )}

        <div data-testid={`${testIdPrefix}-custom-variables`}>
          <p className="text-label leading-label text-[color:var(--color-text-secondary)]">
            {transport === 'stdio' ? t('fieldEnvKeys') : t('fieldHeaderKeys')}
          </p>
          {variables.length === 0 ? (
            <p className="mt-1 break-keep text-label leading-prose text-[color:var(--color-text-quaternary)]">
              {t('variablesNone')}
            </p>
          ) : null}
          <ul className="mt-1 flex flex-col gap-2">
            {variables.map((variable, index) => {
              const locked = looksLikeSecretKey(variable.name);
              const secret = variable.secret || locked;
              return (
                <li
                  key={index}
                  data-testid={`${testIdPrefix}-custom-variable`}
                  data-variable-name={variable.name}
                  data-variable-secret={secret ? 'true' : 'false'}
                  className="rounded-chip border border-[color:var(--color-border-soft)] px-2.5 py-2"
                >
                  <div className="flex items-end gap-2">
                    <Input
                      label={t('variableName')}
                      size="md"
                      type="text"
                      spellCheck={false}
                      autoComplete="off"
                      value={variable.name}
                      placeholder="NOTION_TOKEN"
                      data-testid={`${testIdPrefix}-custom-variable-name`}
                      onChange={(event) => changeVariable(index, { name: event.target.value })}
                      className="min-w-0 flex-1"
                    />
                    <IconButton
                      label={t('variableRemove', { name: variable.name || t('variableName') })}
                      data-testid={`${testIdPrefix}-custom-variable-remove`}
                      hoverSurface="lift"
                      onClick={() =>
                        setVariables((current) =>
                          current.filter((_, position) => position !== index),
                        )
                      }
                    >
                      <X size={ICON_SIZE.md} aria-hidden />
                    </IconButton>
                  </div>
                  <Input
                    label={t('variableValue')}
                    size="md"
                    type={secret ? 'password' : 'text'}
                    spellCheck={false}
                    autoComplete="off"
                    value={variable.value}
                    placeholder={secret ? 'ntn_…' : t('valuePlaceholder')}
                    data-testid={`${testIdPrefix}-custom-variable-value`}
                    onChange={(event) => changeVariable(index, { value: event.target.value })}
                    className="mt-2 w-full"
                  />
                  <Checkbox
                    data-testid={`${testIdPrefix}-custom-variable-secret`}
                    label={t('variableSecret')}
                    checked={secret}
                    /*
                     * A credential name cannot be unchecked: `serializeConnectorState` refuses a
                     * literal under one, so the whole write would fail. Disabled on the web: there is
                     * no keychain.
                     */
                    disabled={locked || !canStoreSecrets}
                    onChange={(event) => changeVariable(index, { secret: event.target.checked })}
                    className="mt-2 text-label text-[color:var(--color-text-secondary)]"
                  />
                  {secret && !canStoreSecrets ? (
                    <p className="mt-1 break-keep text-label leading-prose text-[color:var(--color-text-tertiary)]">
                      {t('secretsWeb', { keys: variable.name || t('variableName') })}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <Chip
            size="lg"
            data-testid={`${testIdPrefix}-custom-variable-add`}
            className="mt-2"
            onClick={() =>
              setVariables((current) => [...current, { name: '', value: '', secret: false }])
            }
          >
            <Plus size={ICON_SIZE.sm} aria-hidden />
            {t('variableAdd')}
          </Chip>
        </div>
      </div>

      {runs ? (
        <div data-testid={`${testIdPrefix}-custom-runs`} className="mt-3">
          <p className="text-label leading-label text-[color:var(--color-text-quaternary)]">
            {t('whatRunsLabel')}
          </p>
          <code className="mt-1 block break-all font-mono text-label leading-label text-[color:var(--color-text-primary)]">
            {runs}
          </code>
        </div>
      ) : null}

      {name.trim() && problems.length > 0 ? (
        <p
          role="status"
          data-testid={`${testIdPrefix}-custom-problem`}
          className="mt-3 break-keep text-label leading-prose text-[color:var(--color-status-warning)]"
        >
          {problems.map((problem) => t(`problem.${problem}` as ProblemKey)).join(' ')}
        </p>
      ) : null}

      <button
        type="button"
        data-testid={`${testIdPrefix}-custom-add`}
        disabled={problems.length > 0}
        className={cn(CONNECTOR_SUBMIT_CLASS, 'mt-3')}
        onClick={() => {
          const { connector, secrets } = draftForWrite(draft, variables, newConnectorId());
          onAdd(connector, secrets);
        }}
      >
        {t('customAdd')}
      </button>
    </div>
  );
}
