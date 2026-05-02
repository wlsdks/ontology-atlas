'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';

interface Props {
  /** 클릭 시 useLocalVault.scaffoldOntology() 호출. created/skipped 반환. */
  onScaffold: () => Promise<{ created: number; skipped: number }>;
  /** 현재 vault 의 doc 수 — 0 이면 빈 vault. 0 보다 크면 "기존 vault 에
   *  starter 추가" 톤으로 보조 메시지 표시. */
  docCount: number;
}

/**
 * mission v2 ontology starter CTA — vault 폴더 선택 후 비어 있으면 prominent
 * 카드, 이미 있으면 작은 보조 버튼. 사용자 비전 ("비개발자도 같이") 의
 * 핵심 진입점 — 터미널 / npm 없이 5 md 시드 + .mcp.json 작성.
 *
 * AI agent (Claude Code 등) 등록 안내는 scaffold 후 toast 로 띄우는 게
 * 자연스럽지만 이 컴포넌트는 결과만 emit — 호출자 (DocsVaultPage) 가 toast.
 */
export function OntologyStarterCta({ onScaffold, docCount }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEmpty = docCount === 0;

  async function handleClick() {
    setError(null);
    setBusy(true);
    try {
      await onScaffold();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'starter 만들기 실패');
    } finally {
      setBusy(false);
    }
  }

  if (isEmpty) {
    // 빈 vault — 큰 카드로 "여기서 시작" 안내
    return (
      <section
        aria-label="ontology starter 시드"
        className="rounded-2xl border border-dashed border-[color:rgba(94,106,210,0.46)] bg-[color:rgba(94,106,210,0.06)] px-5 py-6 text-center"
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-indigo-accent)]">
          빈 폴더 감지됨
        </p>
        <h2 className="mt-2 break-keep text-lg font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
          ontology starter 만들기
        </h2>
        <p className="mt-2 break-keep text-[12px] leading-6 text-[color:var(--color-text-secondary)]">
          5 개의 starter markdown 파일 (project / domain / capability / element + README)
          과 AI agent 등록용 <code className="rounded bg-[color:var(--color-overlay-2)] px-1 font-mono text-[10.5px]">.mcp.json.example</code> 을 이 폴더에 만듭니다.
          <br />
          그 다음 frontmatter 를 본인 프로젝트에 맞게 수정하면 즉시 트리·토폴로지·빌더에 반영돼요.
        </p>
        <button
          type="button"
          onClick={handleClick}
          disabled={busy}
          className="mt-4 inline-flex items-center gap-2 rounded-md border border-[color:var(--color-indigo-brand)] bg-[color:rgba(94,106,210,0.18)] px-4 py-2 text-[12.5px] text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:rgba(94,106,210,0.28)] disabled:opacity-60"
        >
          <Sparkles size={13} aria-hidden />
          {busy ? '만드는 중…' : 'starter 시드 만들기'}
        </button>
        {error ? (
          <p
            role="alert"
            className="mt-3 break-keep text-[11.5px] text-[color:var(--color-status-danger)]"
          >
            {error}
          </p>
        ) : null}
      </section>
    );
  }

  // 이미 vault 에 .md 가 있는 경우 — 작은 보조 옵션
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      title="ontology starter 5 파일을 추가합니다 (이미 있는 파일은 안 건드립니다)"
      className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-3 py-1.5 text-[11.5px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.46)] hover:text-[color:var(--color-text-primary)] disabled:opacity-60"
    >
      <Sparkles size={12} aria-hidden />
      {busy ? '추가 중…' : 'ontology starter 추가'}
    </button>
  );
}
