'use client';

import { FilePlus, Layers } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { LocalVaultPicker, OntologyStarterCta } from '@/features/docs-vault-local';
import type { VaultManifest } from '@/entities/docs-vault';

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
  errorMessage: string | null;
  lastLoadedAt: number | null;
  scaffoldOntology: () => Promise<{ created: number; skipped: number }>;
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
  return (
    <div
      role="menu"
      className="absolute right-0 top-10 z-30 w-[300px] rounded-md border border-[color:var(--color-divider)] bg-[color:rgba(14,15,18,0.98)] p-2 shadow-[0_18px_48px_rgba(0,0,0,0.38)]"
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
        {/* dogfood hint + ontology starter CTA — vault 가 *비어 있으면*
            scaffold 버튼 prominent 노출 (Option D), 기존 vault 면 작은
            보조 버튼. 사용자 비전 ("비개발자도 같이") 의 핵심 진입점 —
            터미널 / npm 없이 5 md + .mcp.json.example 시드 작성. */}
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
