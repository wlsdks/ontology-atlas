'use client';

import { useState } from 'react';
import {
  Bot,
  CheckCircle2,
  CircleAlert,
  ClipboardCopy,
  FilePlus,
  Layers,
  Terminal,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  buildCodexConfigTomlTemplate,
  buildMcpConfigJson,
  LocalVaultPicker,
  ONTOLOGY_STARTER_AGENT_VERIFY_PROMPT,
  OntologyStarterCta,
} from '@/features/docs-vault-local';
import type { VaultManifest } from '@/entities/docs-vault';
import { copyText } from '@/shared/lib/copy-text';

const AGENT_VERIFY_CLI_COMMAND = [
  'oh-my-ontology validate .',
  'oh-my-ontology workspace-brief .',
  'oh-my-ontology agent-brief . --prompt',
  'oh-my-ontology mcp-verify . --timeout-ms 15000',
].join('\n');

/**
 * R11 #16 step 1 — DocsVaultPage 의 advanced dropdown body 를 widget 으로 추출.
 * presentational only — open/close state, ref, outside-click 처리는 caller
 * (DocsVaultPage) 가 hold. 이 widget 은 dropdown 이 *열렸을 때* 렌더링되는
 * inner content + 그 안의 핸들러 wiring 만 담당.
 *
 * 추출 의의: 단일 view 1712 LOC 의 ~70 LOC 분리 (4% 감소). 점진적 분리의
 * 첫 step. 다음 step 들에서 trigger / state / outside-click 까지 widget 안으로
 * 흡수해 self-contained 화 가능.
 */

export type DocsVaultView = 'doc' | 'folder-topology';

export type FolderTopoStatus = 'idle' | 'rebuilding' | 'fresh';

interface LocalVaultLike {
  status:
    | 'idle'
    | 'opening'
    | 'loading'
    | 'loaded'
    | 'permission-needed'
    | 'unsupported'
    | 'error';
  handle: FileSystemDirectoryHandle | null;
  manifest: VaultManifest | null;
  agentConfigStatus: {
    mcpJson: boolean;
    codexConfig: boolean;
    mcpExample: boolean;
  } | null;
  errorMessage: string | null;
  lastLoadedAt: number | null;
  scaffoldOntology: () => Promise<{ created: number; skipped: number }>;
  ensureAgentConfigs: () => Promise<{ created: number; skipped: number }>;
  open: () => void;
  close: () => void;
  refresh: () => void;
  requestPermission: () => void;
}

interface Props {
  view: DocsVaultView;
  onViewChange: (view: DocsVaultView) => void;
  folderTopoStatus: FolderTopoStatus;
  canEditCurrent: boolean;
  localVault: LocalVaultLike;
  validationSummary: { errorCount: number; warningCount: number } | null;
  onCreateNewDoc: () => void;
}

export function VaultToolsMenu({
  view,
  onViewChange,
  folderTopoStatus,
  canEditCurrent,
  localVault,
  validationSummary,
  onCreateNewDoc,
}: Props) {
  const t = useTranslations('docsVault');
  const [agentSetupBusy, setAgentSetupBusy] = useState(false);
  const [agentSetupError, setAgentSetupError] = useState<string | null>(null);
  const [agentPromptCopyState, setAgentPromptCopyState] = useState<
    'idle' | 'copied' | 'failed'
  >('idle');
  const [agentCliCopyState, setAgentCliCopyState] = useState<
    'idle' | 'copied' | 'failed'
  >('idle');
  const [agentTemplateCopyState, setAgentTemplateCopyState] = useState<
    'idle' | 'copied' | 'failed'
  >('idle');
  const [agentCodexTemplateCopyState, setAgentCodexTemplateCopyState] =
    useState<'idle' | 'copied' | 'failed'>('idle');
  const agentStatus = localVault.agentConfigStatus;
  const agentSetupReady = Boolean(
    agentStatus?.mcpJson && agentStatus.codexConfig && agentStatus.mcpExample,
  );

  async function handleEnsureAgentConfigs() {
    setAgentSetupError(null);
    setAgentSetupBusy(true);
    try {
      await localVault.ensureAgentConfigs();
    } catch (err) {
      setAgentSetupError(
        err instanceof Error ? err.message : t('agentSetup.errorFallback'),
      );
    } finally {
      setAgentSetupBusy(false);
    }
  }

  async function handleCopyAgentVerifyPrompt() {
    const copied = await copyText(ONTOLOGY_STARTER_AGENT_VERIFY_PROMPT);
    setAgentPromptCopyState(copied ? 'copied' : 'failed');
  }

  async function handleCopyAgentVerifyCli() {
    const copied = await copyText(AGENT_VERIFY_CLI_COMMAND);
    setAgentCliCopyState(copied ? 'copied' : 'failed');
  }

  async function handleCopyAgentConfigTemplate() {
    const copied = await copyText(
      buildMcpConfigJson(localVault.handle?.name ?? 'vault'),
    );
    setAgentTemplateCopyState(copied ? 'copied' : 'failed');
  }

  async function handleCopyCodexConfigTemplate() {
    const copied = await copyText(
      buildCodexConfigTomlTemplate(localVault.handle?.name ?? 'vault'),
    );
    setAgentCodexTemplateCopyState(copied ? 'copied' : 'failed');
  }

  const copyPromptLabel =
    agentPromptCopyState === 'copied'
      ? t('agentSetup.copyPromptCopied')
      : agentPromptCopyState === 'failed'
        ? t('agentSetup.copyPromptFailed')
        : t('agentSetup.copyPrompt');

  const copyCliLabel =
    agentCliCopyState === 'copied'
      ? t('agentSetup.copyCliCopied')
      : agentCliCopyState === 'failed'
        ? t('agentSetup.copyCliFailed')
        : t('agentSetup.copyCli');

  const copyTemplateLabel =
    agentTemplateCopyState === 'copied'
      ? t('agentSetup.copyTemplateCopied')
      : agentTemplateCopyState === 'failed'
        ? t('agentSetup.copyTemplateFailed')
        : t('agentSetup.copyTemplate');

  const copyCodexTemplateLabel =
    agentCodexTemplateCopyState === 'copied'
      ? t('agentSetup.copyCodexTemplateCopied')
      : agentCodexTemplateCopyState === 'failed'
        ? t('agentSetup.copyCodexTemplateFailed')
        : t('agentSetup.copyCodexTemplate');

  return (
    <div
      role="menu"
      className="fixed inset-x-3 top-24 z-30 max-h-[calc(100dvh-8rem)] overflow-y-auto rounded-md border border-[color:var(--color-divider)] bg-[color:rgba(14,15,18,0.98)] p-2 shadow-[0_18px_48px_rgba(0,0,0,0.38)] md:absolute md:inset-x-auto md:right-0 md:top-10 md:max-h-[calc(100dvh-5rem)] md:w-[300px]"
    >
      <button
        type="button"
        role="menuitemradio"
        aria-checked={view === 'folder-topology'}
        onClick={() =>
          onViewChange(view === 'folder-topology' ? 'doc' : 'folder-topology')
        }
        className={`inline-flex w-full items-center justify-center gap-1 rounded-sm px-2 py-1.5 text-[11px] transition-colors ${
          view === 'folder-topology'
            ? 'bg-[color:rgba(94,106,210,0.16)] text-[color:var(--color-text-primary)]'
            : 'text-[color:var(--color-text-tertiary)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]'
        }`}
      >
        <Layers size={12} aria-hidden />
        {t('advanced.viewTopology')}
        {folderTopoStatus === 'rebuilding' ? (
          <span
            aria-hidden
            className="h-1.5 w-1.5 animate-pulse rounded-full bg-[color:var(--color-indigo-accent)]"
          />
        ) : null}
      </button>
      <div className="my-2 h-px bg-[color:var(--color-border-soft)]" />
      <div className="space-y-2">
        <LocalVaultPicker
          status={localVault.status}
          handleName={localVault.handle?.name ?? null}
          docCount={localVault.manifest?.docs.length ?? 0}
          errorMessage={localVault.errorMessage}
          lastLoadedAt={localVault.lastLoadedAt}
          validationSummary={validationSummary}
          onOpen={localVault.open}
          onClose={localVault.close}
          onRefresh={localVault.refresh}
          onRequestPermission={localVault.requestPermission}
        />
        {localVault.status === 'loaded' && agentStatus ? (
          <section
            aria-label={t('agentSetup.ariaLabel')}
            className="rounded-md border border-[color:rgba(139,151,255,0.22)] bg-[color:rgba(94,106,210,0.06)] p-2.5"
          >
            <div className="flex items-start gap-2">
              <Bot
                size={14}
                aria-hidden
                className="mt-0.5 text-[color:var(--color-indigo-accent)]"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[11.5px] font-medium text-[color:var(--color-text-primary)]">
                    {t('agentSetup.title')}
                  </h3>
                  <span
                    className={`rounded-sm px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.12em] ${
                      agentSetupReady
                        ? 'bg-[color:rgba(50,185,125,0.12)] text-[color:rgba(130,230,180,0.92)]'
                        : 'bg-[color:rgba(239,180,120,0.12)] text-[color:rgba(244,196,130,0.92)]'
                    }`}
                  >
                    {agentSetupReady
                      ? t('agentSetup.ready')
                      : t('agentSetup.missing')}
                  </span>
                </div>
                <div className="mt-2 grid gap-1.5">
                  {[
                    ['mcpJson', '.mcp.json', t('agentSetup.mcpJson')],
                    [
                      'codexConfig',
                      '.codex/config.toml',
                      t('agentSetup.codexConfig'),
                    ],
                    [
                      'mcpExample',
                      '.mcp.json.example',
                      t('agentSetup.mcpExample'),
                    ],
                  ].map(([key, path, label]) => {
                    const present = Boolean(
                      agentStatus[key as keyof typeof agentStatus],
                    );
                    return (
                      <div
                        key={key}
                        className="grid grid-cols-[14px_1fr] items-start gap-1.5 text-[11px] leading-4 text-[color:var(--color-text-secondary)]"
                      >
                        {present ? (
                          <CheckCircle2
                            size={12}
                            aria-hidden
                            className="mt-0.5 text-[color:rgba(130,230,180,0.9)]"
                          />
                        ) : (
                          <CircleAlert
                            size={12}
                            aria-hidden
                            className="mt-0.5 text-[color:rgba(244,196,130,0.92)]"
                          />
                        )}
                        <span>
                          <code className="font-mono text-[10.5px] text-[color:var(--color-text-primary)]">
                            {path}
                          </code>{' '}
                          <span className="text-[color:var(--color-text-tertiary)]">
                            {label}
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>
                {!agentSetupReady && canEditCurrent ? (
                  <button
                    type="button"
                    onClick={() => void handleEnsureAgentConfigs()}
                    disabled={agentSetupBusy}
                    title={t('agentSetup.repairTitle')}
                    className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-[color:rgba(139,151,255,0.35)] bg-[color:rgba(94,106,210,0.1)] px-2 py-1.5 text-[11.5px] text-[color:rgba(200,210,255,0.94)] transition-colors hover:border-[color:rgba(139,151,255,0.55)] hover:bg-[color:rgba(94,106,210,0.16)] disabled:opacity-60"
                  >
                    <Bot size={12} aria-hidden />
                    {agentSetupBusy
                      ? t('agentSetup.repairing')
                      : t('agentSetup.repair')}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void handleCopyAgentVerifyPrompt()}
                  title={t('agentSetup.copyPromptTitle')}
                  className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-2 py-1.5 text-[11.5px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.46)] hover:text-[color:var(--color-text-primary)]"
                >
                  <ClipboardCopy size={12} aria-hidden />
                  {copyPromptLabel}
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyAgentVerifyCli()}
                  title={t('agentSetup.copyCliTitle')}
                  className="mt-1.5 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-[color:var(--color-divider)] bg-[color:rgba(255,255,255,0.025)] px-2 py-1.5 text-[11.5px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.46)] hover:text-[color:var(--color-text-primary)]"
                >
                  <Terminal size={12} aria-hidden />
                  {copyCliLabel}
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyAgentConfigTemplate()}
                  title={t('agentSetup.copyTemplateTitle')}
                  className="mt-1.5 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-[color:var(--color-divider)] bg-[color:rgba(255,255,255,0.025)] px-2 py-1.5 text-[11.5px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.46)] hover:text-[color:var(--color-text-primary)]"
                >
                  <ClipboardCopy size={12} aria-hidden />
                  {copyTemplateLabel}
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyCodexConfigTemplate()}
                  title={t('agentSetup.copyCodexTemplateTitle')}
                  className="mt-1.5 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-[color:var(--color-divider)] bg-[color:rgba(255,255,255,0.025)] px-2 py-1.5 text-[11.5px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.46)] hover:text-[color:var(--color-text-primary)]"
                >
                  <ClipboardCopy size={12} aria-hidden />
                  {copyCodexTemplateLabel}
                </button>
                {agentSetupError ? (
                  <p
                    role="alert"
                    className="mt-2 text-[11px] leading-4 text-[color:var(--color-status-danger)]"
                  >
                    {agentSetupError}
                  </p>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}
        {/* dogfood hint + ontology starter CTA — vault 가 *비어 있으면*
            scaffold 버튼 prominent 노출 (Option D), 기존 vault 면 작은
            보조 버튼. 사용자 비전 ("비개발자도 같이") 의 핵심 진입점 —
            터미널 / npm 없이 5 md + agent MCP 설정 시드 작성. */}
        {localVault.status === 'idle' ? (
          <p className="text-[11px] leading-5 text-[color:var(--color-text-tertiary)]">
            {t('advanced.ontologyHintPrefix')}
            <code className="rounded bg-[color:var(--color-overlay-1)] px-1 py-0.5 font-mono text-[10.5px] text-[color:var(--color-indigo-accent)]">
              docs/ontology/
            </code>
            {t('advanced.ontologyHintSuffix')}
          </p>
        ) : null}
        {localVault.status === 'loaded' && canEditCurrent ? (
          <OntologyStarterCta
            onScaffold={localVault.scaffoldOntology}
            docCount={localVault.manifest?.docs.length ?? 0}
          />
        ) : null}
        {canEditCurrent ? (
          <button
            type="button"
            onClick={onCreateNewDoc}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-[color:rgba(139,151,255,0.35)] bg-[color:rgba(94,106,210,0.08)] px-2.5 py-1.5 text-[11.5px] text-[color:rgba(200,210,255,0.92)] transition-colors hover:border-[color:rgba(139,151,255,0.55)] hover:bg-[color:rgba(94,106,210,0.14)]"
          >
            <FilePlus size={12} aria-hidden />
            {t('advanced.newDoc')}
          </button>
        ) : null}
      </div>
    </div>
  );
}
