'use client';

import { useEffect, useState } from 'react';
import { controlClass } from '@/shared/ui';

/**
 * 경계 카드 — "여기서 못 하는 일" 을 정직하게 말하고, 할 수 있는 곳으로
 * 넘겨준다.
 *
 * 이 패널의 에이전트는 문서 폴더만 본다. 코드가 답을 정하는 질문(이 개념이 실제
 * 구현과 맞나 · 이 경로가 아직 있나)은 **사용자 자신의 터미널**에서 여는 AI
 * 가 낫다 — 세션이 이어지고, 탭이 있고, 자기 설정이 그대로다. 그래서 카드가
 * 주는 것은 그 자리로 가는 두 줄이다: 볼트로 이동하는 `cd` 와, 붙여넣으면
 * 바로 일이 시작되는 문장.
 *
 * 앱이 창을 내주지 않아도 되돌아오는 절반은 이미 있다 — 밖에서 고친 결과는
 * 볼트 워처가 지도에 그린다.
 *
 * 지고 있는 싸움을 이기려 하지 않고 넘기는 것이 이 표면의 경계다.
 *
 * ## 경계 문장이 왜 여기로 들어왔나
 *
 * "코드까지 봐야 하는 일은 터미널의 AI 가 낫다" 는 문장은 대화 내내 입력칸
 * 아래 상주하며 두 줄을 먹었는데, 그 문장이 쓸모 있는 순간은 **넘길 때**
 * 하나뿐이다. 그래서 이제 그 자리로 내려왔다 — 넘기는 이유와 넘기는 방법이
 * 한 자리에 있어야 문장이 안내가 된다.
 */
export function AgentHandoffPacket({
  vaultPath,
  focusedSlug,
  labels,
}: {
  vaultPath: string;
  focusedSlug: string | null;
  labels: {
    /** 왜 넘기는가 — 이 표면의 경계. */
    boundary: string;
    note: string;
    copy: string;
    copied: string;
  };
}) {
  const [copied, setCopied] = useState(false);
  // 확인 문구는 **방금** 복사했다는 뜻이라야 한다. 한 번 눌러 영구히 "복사됨"
  // 으로 남으면 나중에 본 사람에게 거짓이 된다 — 눌렀을 때만 잠깐 참이다.
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);
  // 개념 이름은 화면이 부르는 이름 그대로 — 붙여넣는 즉시 볼트에서 풀려야
  // 한다. (호출부가 `resolveNodeAgentTarget` 결과를 넘긴다.)
  const packet = [
    `cd ${vaultPath}`,
    '',
    focusedSlug
      ? `Check whether the concept "${focusedSlug}" still matches the code, using the ontology-atlas MCP tools plus the repository source. Report what drifted.`
      : 'Check whether this vault still matches the code, using the ontology-atlas MCP tools plus the repository source. Report what drifted.',
  ].join('\n');

  return (
    <div data-testid="agent-handoff-card">
      <p className="mb-2 text-body leading-body text-[color:var(--color-text-secondary)] [word-break:keep-all]">
        {labels.boundary}
      </p>
      <p className="mb-2 text-label tracking-label text-[color:var(--color-text-quaternary)] [word-break:keep-all]">
        {labels.note}
      </p>
      <pre
        data-testid="agent-handoff-packet"
        className="max-h-32 overflow-auto whitespace-pre-wrap break-all rounded-chip bg-[color:var(--color-overlay-1)] p-2 text-caption leading-caption text-[color:var(--color-text-secondary)]"
      >
        {packet}
      </pre>
      <button
        type="button"
        data-testid="agent-handoff-copy"
        onClick={() => {
          void navigator.clipboard?.writeText(packet);
          setCopied(true);
        }}
        className={controlClass({
          shape: 'chip',
          size: 'md',
          tone: 'secondary',
          className:
            'mt-2 tracking-label border-[color:var(--color-border-soft)] hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]',
        })}
      >
        {copied ? labels.copied : labels.copy}
      </button>
    </div>
  );
}
