"use client";

import { useState } from "react";

/**
 * O-10 — 한국어 frontmatter 인라인 onboarding (Fire 3).
 *
 * 신규 사용자가 KnowledgeDocumentNewPage 우측 사이드 카드로 보는 frontmatter
 * 가이드. spec `2026-04-27-ontology-frontmatter-contract.md` §2~§5 의 처리
 * 등급 A/B/C + 필수 5 종 + 권장 4 종 + 예시 markdown 을 한 화면에 풀어 씀.
 *
 * 디자인 헌장 §11 준수:
 * - 단일 인디고 + 무채색만, glow / scale 금지.
 * - 등급 chip = 무채색 outline, 활성 등급은 인디고 outline + alpha bg.
 * - copy-to-clipboard 는 추가하지 않음 (사용자가 직접 입력해야 학습).
 *
 * 호출자: `KnowledgeDocumentNewPage` 의 우측 360px 컬럼.
 */

type Grade = "A" | "B" | "C";

const GRADES: Array<{
  grade: Grade;
  label: string;
  cap: string;
  hint: string;
}> = [
  {
    grade: "A",
    label: "strict",
    cap: "신뢰도 1.0 (자동 승인 가능)",
    hint: "필수 5 종 + 권장 4 종 모두 채움. spec / runbook / 도메인 마스터 수준 문서.",
  },
  {
    grade: "B",
    label: "lenient",
    cap: "신뢰도 0.84 (medium tier 까지)",
    hint: "필수 5 종 채움, 권장 일부 누락. 빠르게 시작하기 좋은 기본 옵션.",
  },
  {
    grade: "C",
    label: "freeform",
    cap: "신뢰도 0.59 (low tier · 자동 반영 금지)",
    hint: "frontmatter 없거나 필수 누락. 추출은 시도되지만 검수자 직접 검토 필수.",
  },
];

const REQUIRED_FIELDS: Array<{ key: string; desc: string; example: string }> =
  [
    { key: "id", desc: "kebab-case 노드 ID. 문서 안 식별자.", example: "auth-login" },
    {
      key: "kind",
      desc: "TBox 클래스. project / domain / capability / element / document.",
      example: "capability",
    },
    { key: "project", desc: "문서가 속한 project ID.", example: "aslan-maps" },
    { key: "title", desc: "표시 제목. 한글 OK.", example: "로그인" },
    { key: "version", desc: "frontmatter schema 버전. 현재 1.", example: "1" },
  ];

const RECOMMENDED_FIELDS: Array<{ key: string; desc: string }> = [
  { key: "domain", desc: "kind 가 capability/element 일 때 상위 domain ID." },
  { key: "status", desc: "draft / active / deprecated / archived." },
  { key: "aliases", desc: "같은 개념의 다른 표현. 노드 병합 매칭." },
  { key: "tags", desc: "검색·필터용 자유 라벨." },
];

const EXAMPLE_MD = `---
id: auth-login
kind: capability
project: aslan-maps
domain: authentication
title: 로그인
status: active
version: 1
aliases:
  - sign in
  - 로그인 기능
tags:
  - auth
  - p0
---

## 요약
이메일 / OAuth 두 경로로 로그인. iam 모듈을 통해 토큰 발급.

## 역할
- 사용자 인증
- 세션 토큰 발급

## 관계
- depends_on: iam
`;

export function FrontmatterOnboarding() {
  const [openGrade, setOpenGrade] = useState<Grade>("A");
  const [showExample, setShowExample] = useState(false);

  return (
    <aside
      aria-label="frontmatter 가이드"
      className="rounded-2xl border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] p-5"
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-indigo-accent)]">
        Onboarding · frontmatter 가이드
      </p>
      <h2 className="mt-2 break-keep text-lg font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
        문서를 어떻게 써야 추출이 잘 될까
      </h2>
      <p className="mt-2 text-[12px] leading-5 text-[color:var(--color-text-secondary)]">
        문서 머리에 yaml frontmatter 만 잘 채우면, 워커가 의미 단위 노드와 관계를
        추출하는 신뢰도가 달라져요. 처리 등급 3 단계.
      </p>

      <div className="mt-4 flex items-center gap-1.5">
        {GRADES.map((g) => {
          const active = openGrade === g.grade;
          return (
            <button
              key={g.grade}
              type="button"
              onClick={() => setOpenGrade(g.grade)}
              aria-pressed={active}
              className={
                active
                  ? "flex-1 rounded-md border border-[color:rgba(94,106,210,0.5)] bg-[color:rgba(94,106,210,0.16)] px-2 py-1.5 text-[11px] text-[color:var(--color-indigo-accent)]"
                  : "flex-1 rounded-md border border-[color:var(--color-divider)] bg-transparent px-2 py-1.5 text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-secondary)]"
              }
            >
              <span className="font-mono uppercase tracking-[0.10em]">
                {g.grade}
              </span>
              <span className="ml-1 text-[10px]">{g.label}</span>
            </button>
          );
        })}
      </div>

      {GRADES.filter((g) => g.grade === openGrade).map((g) => (
        <div
          key={g.grade}
          className="mt-3 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2.5"
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
            {g.cap}
          </p>
          <p className="mt-1.5 text-[12px] leading-5 text-[color:var(--color-text-secondary)]">
            {g.hint}
          </p>
        </div>
      ))}

      <details className="mt-4 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2.5">
        <summary className="cursor-pointer list-none font-mono text-[10px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
          필수 5 종
        </summary>
        <ul className="mt-2 space-y-1.5 text-[12px] leading-5">
          {REQUIRED_FIELDS.map((f) => (
            <li key={f.key} className="flex flex-col">
              <span className="font-mono text-[11px] text-[color:var(--color-indigo-accent)]">
                {f.key}{" "}
                <span className="text-[color:var(--color-text-quaternary)]">
                  · 예 {f.example}
                </span>
              </span>
              <span className="text-[color:var(--color-text-secondary)]">
                {f.desc}
              </span>
            </li>
          ))}
        </ul>
      </details>

      <details className="mt-2 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2.5">
        <summary className="cursor-pointer list-none font-mono text-[10px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
          권장 4 종 (등급 A 진입 조건)
        </summary>
        <ul className="mt-2 space-y-1.5 text-[12px] leading-5">
          {RECOMMENDED_FIELDS.map((f) => (
            <li key={f.key} className="flex flex-col">
              <span className="font-mono text-[11px] text-[color:var(--color-text-tertiary)]">
                {f.key}
              </span>
              <span className="text-[color:var(--color-text-secondary)]">
                {f.desc}
              </span>
            </li>
          ))}
        </ul>
      </details>

      <button
        type="button"
        onClick={() => setShowExample((v) => !v)}
        aria-expanded={showExample}
        className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.10em] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:text-[color:var(--color-text-primary)]"
      >
        등급 A 예시 {showExample ? "숨김" : "보기"}
      </button>

      {showExample ? (
        <pre className="mt-2 max-h-[280px] overflow-auto rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-backdrop-medium)] px-3 py-2.5 text-[11px] leading-5 text-[color:var(--color-text-secondary)]">
          {EXAMPLE_MD}
        </pre>
      ) : null}

      <p className="mt-4 text-[11px] leading-5 text-[color:var(--color-text-quaternary)]">
        전체 명세는{" "}
        <code className="rounded bg-[color:var(--color-overlay-2)] px-1 py-[1px] font-mono text-[10px] text-[color:var(--color-text-tertiary)]">
          docs/superpowers/specs/2026-04-27-ontology-frontmatter-contract.md
        </code>{" "}
        참고.
      </p>
    </aside>
  );
}
