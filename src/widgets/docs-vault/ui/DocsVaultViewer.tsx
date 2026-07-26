'use client';

import { useEffect, useMemo, useState } from 'react';
import { Link } from '@/i18n/navigation';
import Image from 'next/image';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslations } from 'next-intl';
import { ExternalLink, Hash } from 'lucide-react';
import {
  buildDocsVaultHref,
  type VaultDoc,
} from '@/entities/docs-vault';
import { useStaticVaultSource } from '@/features/vault-sample-source';
import { splitHighlightSegments } from '@/shared/lib/highlight-match';
import { useCopyFeedback } from '@/shared/lib/use-copy-feedback';
import { fetchServerDocContent } from '../lib/server-doc-content';
import { resolveDocLink } from '../lib/resolve-doc-link';

interface Props {
  doc: VaultDoc;
  vaultSlugs: Set<string>;
  /** Vault 내부 링크 클릭 시 라우팅용. 보통 HomePage 가 setSelectedSlug 를 넣는다. */
  onNavigate: (slug: string) => void;
  /** Vault 내부 slug 로 바꾸는 현재 경로 prefix. 기본 '/docs'. */
  basePath?: string;
  /** Account scoped 라우팅 등 부모가 URL 상태를 보존해야 할 때 사용. */
  getDocHref?: (slug: string, hash?: string) => string;
  getProjectHref?: (slug: string) => string;
  /** 선택. 주어지면 이 함수로 md 본문을 가져온다 (로컬 볼트 용). 미지정시
   *  기본 /docs-vault/{slug}.md fetch. */
  getDocContent?: (slug: string) => Promise<string>;
  /** 검색 팔레트에서 넘어온 쿼리. text node 단위로 매치어를 mark 로 래핑. */
  highlightQuery?: string;
  /** 상대 이미지 경로를 실제 src 로 변환 (로컬 볼트의 asset blob URL 등).
   *  서버 볼트에선 미지정. */
  resolveImage?: (path: string) => Promise<string | null>;
  /** vault 외부(`../` escape) 상대 md 링크를 GitHub blob 으로 바꾸는 base.
   *  번들 docs vault 에서만 지정. 로컬 vault 는 미지정 → 죽은 404 대신
   *  비-라우팅 렌더. */
  repoBlobBase?: string;
  /** 이 vault 가 repo 안에서 위치한 경로 (번들 docs vault = `docs`). */
  vaultRepoRoot?: string;
}

/**
 * 개별 vault 문서 뷰어. 클라이언트에서 /docs-vault/{slug}.md 를 fetch 해서
 * react-markdown 으로 렌더. 내부 링크는 vaultSlugs 집합으로 판별해 Link 로
 * 치환, 외부는 new-tab. 이미지는 일단 native img.
 */
export function DocsVaultViewer({
  doc,
  vaultSlugs,
  onNavigate,
  basePath = '/docs',
  getDocHref = (slug, hash) => buildDocsVaultHref({ slug, hash }),
  getProjectHref = (slug) => `/?p=${encodeURIComponent(slug)}`,
  getDocContent,
  highlightQuery,
  resolveImage,
  repoBlobBase,
  vaultRepoRoot,
}: Props) {
  const t = useTranslations('vaultWidgets.viewer');
  const [raw, setRaw] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // static 볼트의 번들 본문 — 매니페스트를 고른 것과 **같은 볼트**에서 와야
  // 한다. 예전 결함이 정확히 이 어긋남이었다(매니페스트는 예시 쇼핑몰,
  // 본문은 도그푸드라 제목과 내용이 다른 문서를 가리켰다).
  const { content: bundledContent } = useStaticVaultSource();

  // raw 로드되고 highlightQuery 있으면 첫 매치로 자동 스크롤 — md-highlight
  // class 가 부여된 첫 mark 를 찾아 scrollIntoView.
  useEffect(() => {
    if (!raw || !highlightQuery) return;
    const handle = requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(
        '[data-docs-viewer] mark.docs-match',
      );
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    return () => cancelAnimationFrame(handle);
  }, [raw, highlightQuery]);

  // 이 컴포넌트는 부모에서 key={doc.slug} 로 remount 돼서 slug 변경 시
  // state 가 fresh null 로 초기화된다. 따라서 effect 에서 reset 불필요.
  useEffect(() => {
    let cancelled = false;
    const fetcher = getDocContent
      ? getDocContent(doc.slug)
      : fetchServerDocContent(doc.slug, {
          bundledContent,
          locationHref:
            typeof window === 'undefined' ? undefined : window.location.href,
        });
    fetcher
      .then((text) => {
        if (cancelled) return;
        // frontmatter 블록 제거 (렌더 중복 방지)
        let cleaned = text.startsWith('---')
          ? text.replace(/^---[\s\S]*?\n---\n?/, '')
          : text;
        // Wikilinks 전처리 — [[slug]] / [[slug|text]] / [[slug#anchor]]
        // 를 표준 markdown [text](WIKILINK:slug#anchor) 센티넬로 변환.
        // Viewer a 컴포넌트가 WIKILINK: 를 내부 라우팅으로 잡음.
        cleaned = cleaned.replace(
          /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g,
          (_, target: string, label?: string) => {
            const text = (label ?? target).trim();
            const clean = target.trim();
            return `[${text}](WIKILINK:${clean})`;
          },
        );
        setRaw(cleaned);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [bundledContent, doc.slug, getDocContent]);

  // 문자열 노드에 highlightQuery 매치를 <mark> 로 래핑. useMemo 내부에서
  // 의존성 추적하기 좋게 pure 함수로 분리, 클로저 대신 인자로 query 전달.
  const highlightChildren = useMemo(() => {
    const hl = (
      children: React.ReactNode,
      q: string,
      key = 'hl',
    ): React.ReactNode => {
      if (!q) return children;
      if (typeof children === 'string') {
        // 부분 문자열 분절은 공용 splitHighlightSegments 재사용(복잡도↓).
        // 첫 매치로 scrollIntoView 하는 effect 가 `.docs-match` 를 찾으므로
        // mark className 은 그대로 보존.
        return splitHighlightSegments(children, q).map((seg, i) =>
          seg.match ? (
            <mark
              key={`${key}-${i}`}
              className="docs-match rounded-sm bg-[color:var(--color-indigo-line-a22)] px-0.5 text-[color:rgba(210,218,255,0.98)]"
            >
              {seg.text}
            </mark>
          ) : (
            seg.text
          ),
        );
      }
      if (Array.isArray(children)) {
        return children.map((c, idx) => hl(c, q, `${key}-${idx}`));
      }
      return children;
    };
    const q = highlightQuery?.toLowerCase() ?? '';
    return (children: React.ReactNode, key = 'hl') => hl(children, q, key);
  }, [highlightQuery]);

  // heading id 는 렌더 횟수와 무관하게 같아야 한다 (idempotent). 이전의
  // occurrence 카운터 Map 은 렌더 중 클로저 변이라 StrictMode 이중 호출에서
  // 모든 id 가 `-2` 로 밀려 매니페스트 heading slug (스크롤스파이 · 목차
  // 레일 active · 앵커 클릭) 와 전부 어긋났다. 같은 텍스트의 heading 이 한
  // 문서에 중복되면 id 가 충돌하지만 (브라우저는 첫 번째로 앵커), 그
  // 트레이드오프가 전 heading 의 내비게이션이 죽는 것보다 낫다.
  const headingSlugOf = (children: React.ReactNode) => slugFromChildren(children);

  const components: Components = {
      a({ href, children, ...rest }) {
        if (!href) return <span {...rest}>{children}</span>;
        // 전처리 단계 센티넬 — [[slug#anchor]] 가 WIKILINK:slug#anchor 로
        // 변환돼 있음. vault slug 로 바로 매칭.
        if (href.startsWith('WIKILINK:')) {
          const spec = href.slice('WIKILINK:'.length);
          const [wikiSlug, anchor] = spec.split('#');
          // project: prefix → 공개 토폴로지 라우트로 이동. 예: [[project:reactor]]
          if (wikiSlug && wikiSlug.startsWith('project:')) {
            const projectSlug = wikiSlug.slice('project:'.length);
            return (
              <a
                href={getProjectHref(projectSlug)}
                className="text-[color:var(--color-amber-docs-a95)] underline underline-offset-2 decoration-[color:var(--color-amber-docs-a35)] hover:decoration-[color:var(--color-amber-docs-a100)]"
                title={t('projectLinkTitle', { slug: projectSlug })}
              >
                {children}
              </a>
            );
          }
          if (wikiSlug && vaultSlugs.has(wikiSlug)) {
            return (
              <Link
                href={getDocHref(wikiSlug, anchor)}
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate(wikiSlug);
                  if (anchor && typeof window !== 'undefined') {
                    requestAnimationFrame(() => {
                      document
                        .getElementById(anchor)
                        ?.scrollIntoView({ behavior: 'smooth' });
                    });
                  }
                }}
                className="text-[color:var(--color-indigo-line-a90)] underline underline-offset-2 decoration-[color:var(--color-indigo-line-a32)] hover:decoration-[color:var(--color-indigo-accent)]"
              >
                {children}
              </Link>
            );
          }
          // slug 가 vault 에 없으면 점선 표시 (unresolved wikilink)
          return (
            <span
              className="border-b border-dashed border-[color:var(--color-amber-source-a50)] text-[color:var(--color-amber-source-text-a85)]"
              title={t('wikilinkMissing', { slug: wikiSlug })}
              {...rest}
            >
              {children}
            </span>
          );
        }
        if (href.startsWith('#')) {
          return (
            <a href={href} {...rest}>
              {children}
            </a>
          );
        }
        if (/^https?:\/\//i.test(href)) {
          return (
            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 underline underline-offset-2 decoration-[color:var(--color-indigo-line-a40)] hover:decoration-[color:var(--color-indigo-accent)]"
              {...rest}
            >
              {children}
              <ExternalLink size={10} className="opacity-60" aria-hidden />
            </a>
          );
        }
        const resolved = resolveDocLink({
          href,
          fromSlug: doc.slug,
          vaultSlugs,
          repoBlobBase,
          vaultRepoRoot,
        });
        if (resolved.kind === 'internal') {
          const anchor = resolved.anchor;
          return (
            <Link
              href={getDocHref(resolved.slug, anchor)}
              onClick={(e) => {
                e.preventDefault();
                onNavigate(resolved.slug);
                if (anchor && typeof window !== 'undefined') {
                  requestAnimationFrame(() => {
                    document
                      .getElementById(anchor)
                      ?.scrollIntoView({ behavior: 'smooth' });
                  });
                }
              }}
              className="text-[color:var(--color-indigo-line-a90)] underline underline-offset-2 decoration-[color:var(--color-indigo-line-a32)] hover:decoration-[color:var(--color-indigo-accent)]"
            >
              {children}
            </Link>
          );
        }
        // vault 바깥(repo) 파일 → GitHub blob 새 탭. 앱 라우팅으로 넘겨
        // 404("어디서 길을 잃으셨나요")로 죽던 회귀 정정.
        if (resolved.kind === 'external') {
          return (
            <a
              href={resolved.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 underline underline-offset-2 decoration-[color:var(--color-indigo-line-a40)] hover:decoration-[color:var(--color-indigo-accent)]"
              {...rest}
            >
              {children}
              <ExternalLink size={10} className="opacity-60" aria-hidden />
            </a>
          );
        }
        // repo 위치 불명(로컬 vault) & vault 외부 → 라우팅 불가. 죽은 404 대신
        // 비-라우팅 텍스트로 렌더한다(href 제거).
        if (resolved.kind === 'unresolved') {
          return (
            <span
              className="text-[color:var(--color-text-tertiary)] underline decoration-dotted underline-offset-2"
              title={t('externalLinkUnresolved', { href })}
              {...rest}
            >
              {children}
            </span>
          );
        }
        return (
          <a href={href} {...rest}>
            {children}
          </a>
        );
      },
      h1({ children, ...rest }) {
        const slug = headingSlugOf(children);
        return (
          <h2
            id={slug}
            className="group relative mt-0 mb-6 text-display font-semibold leading-tight text-[color:var(--color-text-primary)]"
            {...rest}
          >
            {highlightChildren(children, 'h1')}
            <HeadingAnchor anchor={slug} docSlug={doc.slug} basePath={basePath} />
          </h2>
        );
      },
      h2({ children, ...rest }) {
        const slug = headingSlugOf(children);
        return (
          <h2
            id={slug}
            className="group relative mt-10 mb-3 text-title font-semibold leading-tight text-[color:var(--color-text-primary)]"
            {...rest}
          >
            {highlightChildren(children, 'h2')}
            <HeadingAnchor anchor={slug} docSlug={doc.slug} basePath={basePath} />
          </h2>
        );
      },
      h3({ children, ...rest }) {
        const slug = headingSlugOf(children);
        return (
          <h3
            id={slug}
            className="group relative mt-6 mb-2 text-title font-semibold leading-tight text-[color:var(--color-text-primary)]"
            {...rest}
          >
            {highlightChildren(children, 'h3')}
            <HeadingAnchor anchor={slug} docSlug={doc.slug} basePath={basePath} />
          </h3>
        );
      },
      p({ children, ...rest }) {
        return (
          <p
            className="my-3 text-body-lg leading-[1.7] text-[color:var(--color-text-secondary)]"
            {...rest}
          >
            {highlightChildren(children, 'p')}
          </p>
        );
      },
      ul(props) {
        return (
          <ul
            className="my-3 list-disc pl-6 text-body-lg leading-[1.75] text-[color:var(--color-text-secondary)] marker:text-[color:var(--color-text-quaternary)]"
            {...props}
          />
        );
      },
      ol(props) {
        return (
          <ol
            className="my-3 list-decimal pl-6 text-body-lg leading-[1.75] text-[color:var(--color-text-secondary)] marker:text-[color:var(--color-text-quaternary)]"
            {...props}
          />
        );
      },
      li({ children, ...rest }) {
        return (
          <li className="my-1" {...rest}>
            {highlightChildren(children, 'li')}
          </li>
        );
      },
      code({ className, children, ...rest }) {
        const isBlock = /language-/.test(className ?? '');
        if (!isBlock) {
          return (
            <code
              className="rounded-sm bg-[color:var(--color-indigo-line-a06)] px-1 py-0.5 font-mono text-label text-[color:var(--color-indigo-pale-a95)] md:text-body"
              {...rest}
            >
              {children}
            </code>
          );
        }
        return (
          <code className={`${className} font-mono text-label md:text-body`} {...rest}>
            {children}
          </code>
        );
      },
      pre(props) {
        return (
          <pre
            className="my-4 overflow-x-auto rounded-md border border-[color:var(--color-overlay-2)] bg-[color:var(--color-surface-deep-a80)] p-3 font-mono text-label leading-[1.55] text-[color:var(--color-indigo-pale-a92)] md:text-body"
            {...props}
          />
        );
      },
      blockquote({ children, ...rest }) {
        // Callout 감지 — 첫 paragraph 가 [!type] text... 형태면 전용 스타일.
        // 옵시디언 / GitHub 표기법: `> [!note] title\n> body...`
        // ReactMarkdown 이 이미 children 의 첫 p > text 로 파싱한 상태라
        // 안쪽 text node 를 inspect 해야 한다.
        const callout = detectCallout(children);
        if (callout) {
          return (
            <CalloutBlock kind={callout.kind} title={callout.title}>
              {callout.rest}
            </CalloutBlock>
          );
        }
        return (
          <blockquote
            className="my-4 border-l-2 border-[color:var(--color-indigo-line-a35)] pl-4 italic text-[color:var(--color-text-tertiary)]"
            {...rest}
          >
            {children}
          </blockquote>
        );
      },
      table(props) {
        return (
          <div className="my-4 overflow-x-auto">
            <table
              className="w-full border-collapse text-body text-[color:var(--color-text-secondary)]"
              {...props}
            />
          </div>
        );
      },
      th(props) {
        return (
          <th
            className="border-b border-[color:var(--color-divider)] px-2 py-1.5 text-left font-medium text-[color:var(--color-text-primary)]"
            {...props}
          />
        );
      },
      td(props) {
        return (
          <td
            className="border-b border-[color:var(--color-overlay-2)] px-2 py-1.5 align-top [&_a]:-mx-2 [&_a]:inline-flex [&_a]:min-h-8 [&_a]:items-center [&_a]:rounded-md [&_a]:px-2"
            {...props}
          />
        );
      },
      hr() {
        return <hr className="my-6 border-[color:var(--color-border-soft)]" />;
      },
      img({ src, alt, title }) {
        // 외부 URL (http/data/blob) 은 그대로. 상대 경로만 resolveImage 사용.
        const rawSrc = typeof src === 'string' ? src : undefined;
        if (!rawSrc || /^(https?:|data:|blob:)/i.test(rawSrc)) {
          return (
            <Image
              src={rawSrc ?? ''}
              alt={alt ?? ''}
              width={1200}
              height={800}
              sizes="(max-width: 768px) 100vw, 760px"
              unoptimized
              className="my-4 max-w-full rounded-md border border-[color:var(--color-border-soft)]"
              style={{ height: 'auto' }}
              title={title}
            />
          );
        }
        if (!resolveImage) {
          // 서버 볼트 — public/docs-vault 아래로 직접 참조 시도.
          return (
            <Image
              src={rawSrc}
              alt={alt ?? ''}
              width={1200}
              height={800}
              sizes="(max-width: 768px) 100vw, 760px"
              unoptimized
              className="my-4 max-w-full rounded-md border border-[color:var(--color-border-soft)]"
              style={{ height: 'auto' }}
              title={title}
            />
          );
        }
        return (
          <VaultImage
            src={rawSrc}
            alt={alt ?? ''}
            docSlug={doc.slug}
            resolve={resolveImage}
          />
        );
      },
    };

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <div className="text-body text-[color:var(--color-text-tertiary)]">
          {t('loadFailed')}
        </div>
        <div className="font-mono text-label text-[color:var(--color-text-quaternary)]">
          {error}
        </div>
      </div>
    );
  }
  if (raw === null) {
    return (
      <div className="flex flex-col gap-3 p-8" role="status" aria-label={t('loadingLabel')}>
        <div className="h-3 w-2/3 animate-pulse rounded bg-[color:var(--color-border-soft)]" aria-hidden />
        <div className="h-3 w-1/2 animate-pulse rounded bg-[color:var(--color-overlay-2)]" aria-hidden />
        <div className="h-3 w-5/6 animate-pulse rounded bg-[color:var(--color-overlay-2)]" aria-hidden />
      </div>
    );
  }
  return (
    <article
      data-docs-viewer
      className="mx-auto max-w-[760px] px-6 py-8 md:px-10 md:py-10"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {raw}
      </ReactMarkdown>
    </article>
  );
}

type CalloutKind = 'note' | 'tip' | 'info' | 'warning' | 'danger' | 'success';

const CALLOUT_STYLES: Record<
  CalloutKind,
  { border: string; bg: string; title: string; icon: string }
> = {
  note: {
    border: 'var(--color-indigo-line-a40)',
    bg: 'var(--color-indigo-a06)',
    title: 'var(--color-indigo-pale-a95)',
    icon: '📝',
  },
  tip: {
    border: 'var(--color-success-a40)',
    bg: 'var(--color-success-a06)',
    title: 'var(--color-success-text-a95)',
    icon: '💡',
  },
  info: {
    border: 'var(--color-indigo-line-a40)',
    bg: 'var(--color-indigo-a06)',
    title: 'var(--color-indigo-pale-a95)',
    icon: 'ℹ️',
  },
  warning: {
    border: 'var(--color-amber-source-a45)',
    bg: 'var(--color-amber-source-a06)',
    title: 'var(--color-amber-source-text-a95)',
    icon: '⚠️',
  },
  danger: {
    border: 'var(--color-danger-a50)',
    bg: 'var(--color-danger-a08)',
    title: 'var(--color-danger-text-strong)',
    icon: '🚫',
  },
  success: {
    border: 'var(--color-success-a45)',
    bg: 'var(--color-success-a07)',
    title: 'var(--color-success-text-a95)',
    icon: '✓',
  },
};

/**
 * blockquote children 에서 `[!kind] title` 패턴 추출. 첫 문단의 맨 앞
 * text 만 검사. 매치 실패 시 null. 매치 시 children 에서 해당 prefix 를
 * 제거한 나머지를 rest 로 반환해 본문에 그대로 렌더.
 */
function detectCallout(
  children: React.ReactNode,
): { kind: CalloutKind; title: string; rest: React.ReactNode } | null {
  const kids = Array.isArray(children) ? children : [children];
  // 첫 번째 element-like 인 p 찾기 (공백 텍스트 등 skip).
  const firstIdx = kids.findIndex(
    (c) =>
      c != null &&
      typeof c === 'object' &&
      'type' in (c as object) &&
      (c as { type?: unknown }).type !== undefined,
  );
  if (firstIdx === -1) return null;
  const firstEl = kids[firstIdx] as React.ReactElement<{
    children?: React.ReactNode;
  }>;
  const inner = firstEl.props?.children;
  const innerArr = Array.isArray(inner) ? inner : [inner];
  const firstText = innerArr[0];
  if (typeof firstText !== 'string') return null;
  const m = firstText.match(
    /^\[!(note|tip|info|warning|danger|success)\]\s*(.*?)(?:\n|$)/i,
  );
  if (!m) return null;
  const kind = m[1].toLowerCase() as CalloutKind;
  const title = m[2].trim() || kind.toUpperCase();
  // 나머지 첫 paragraph 안의 children: firstText 매치 이후 조각 + innerArr[1:]
  const remainderText = firstText.slice(m[0].length).trimStart();
  const restFirstP = [
    remainderText,
    ...innerArr.slice(1),
  ].filter((x) => x !== '' && x != null);
  const restKids = [...kids];
  if (restFirstP.length > 0) {
    // 동일 p 로 나머지 복원 (React element clone)
    restKids[firstIdx] = {
      ...firstEl,
      props: { ...firstEl.props, children: restFirstP },
    };
  } else {
    restKids.splice(firstIdx, 1);
  }
  return { kind, title, rest: restKids };
}

function CalloutBlock({
  kind,
  title,
  children,
}: {
  kind: CalloutKind;
  title: string;
  children: React.ReactNode;
}) {
  const s = CALLOUT_STYLES[kind];
  return (
    <aside
      className="my-4 rounded-md border-l-4 px-4 py-3"
      style={{ borderLeftColor: s.border, backgroundColor: s.bg }}
    >
      <div
        className="mb-1 flex items-center gap-1.5 text-body font-semibold"
        style={{ color: s.title }}
      >
        <span aria-hidden>{s.icon}</span>
        <span>{title}</span>
      </div>
      <div className="text-body leading-[1.65] text-[color:var(--color-text-secondary)]">
        {children}
      </div>
    </aside>
  );
}

/**
 * 로컬 볼트 이미지 src 를 async 로 blob URL 로 변환해 렌더. 언마운트
 * 또는 src 변경 시 createObjectURL 로 만든 blob 을 revoke 해 메모리 누수
 * 방지.
 */
function VaultImage({
  src,
  alt,
  docSlug,
  resolve,
}: {
  src: string;
  alt: string;
  docSlug: string;
  resolve: (path: string) => Promise<string | null>;
}) {
  const t = useTranslations('vaultWidgets.viewer');
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    // 문서 디렉터리 기준 상대 경로를 vault root 기준으로 normalize.
    const fromDir = docSlug.includes('/')
      ? docSlug.slice(0, docSlug.lastIndexOf('/'))
      : '';
    const rel = src.replace(/^\.\//, '');
    const joined = fromDir ? `${fromDir}/${rel}` : rel;
    const parts = joined.split('/');
    const stack: string[] = [];
    for (const p of parts) {
      if (p === '' || p === '.') continue;
      if (p === '..') {
        stack.pop();
        continue;
      }
      stack.push(p);
    }
    const normalized = stack.join('/');
    resolve(normalized)
      .then((url) => {
        if (cancelled) {
          if (url) URL.revokeObjectURL(url);
          return;
        }
        if (!url) {
          setError(true);
          return;
        }
        created = url;
        setBlobUrl(url);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [src, docSlug, resolve]);
  if (error) {
    return (
      <span
        className="my-3 inline-block rounded-sm border border-dashed border-[color:var(--color-amber-source-a50)] px-2 py-1 font-mono text-caption text-[color:var(--color-amber-source-text-a80)]"
        title={t('imageMissing', { src })}
      >
        🖼 {alt || src}
      </span>
    );
  }
  if (!blobUrl) {
    return (
      <span
        className="my-3 inline-block h-5 w-24 animate-pulse rounded bg-[color:var(--color-overlay-2)]"
        aria-label={alt}
      />
    );
  }
  return (
    <Image
      src={blobUrl}
      alt={alt}
      width={1200}
      height={800}
      sizes="(max-width: 768px) 100vw, 760px"
      unoptimized
      className="my-4 max-w-full rounded-md border border-[color:var(--color-border-soft)]"
      style={{ height: 'auto' }}
    />
  );
}

/**
 * Heading 옆 # 아이콘 — hover 시 살짝 뜨고 클릭 시 slug#anchor URL 을
 * 클립보드로. 2초간 체크 표시로 feedback.
 */
function HeadingAnchor({
  anchor,
  docSlug,
  basePath,
}: {
  anchor: string;
  docSlug: string;
  basePath: string;
}) {
  const t = useTranslations('vaultWidgets.viewer');
  const { state, copy } = useCopyFeedback(2000);
  const copied = state === "copied";
  const onClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.pathname = basePath.endsWith('/') ? basePath : `${basePath}/`;
    url.searchParams.set('slug', docSlug);
    url.hash = anchor;
    await copy(url.toString());
  };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={copied ? t('anchorCopiedAria') : t('anchorCopyAria')}
      title={copied ? t('anchorCopiedTitle') : t('anchorCopyTitle')}
      className={`absolute right-0 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md transition-[background-color,color,opacity] sm:-left-9 sm:right-auto ${
        copied
          ? 'text-[color:var(--color-indigo-line-a90)] opacity-100'
          : 'text-[color:var(--color-text-quaternary)] opacity-100 hover:bg-[color:var(--color-indigo-line-a06)] hover:text-[color:var(--color-indigo-line-a90)] sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100'
      }`}
      contentEditable={false}
    >
      <Hash size={11} aria-hidden />
    </button>
  );
}

function slugFromChildren(children: React.ReactNode): string {
  const text = flattenText(children);
  return text
    .toLowerCase()
    .replace(/[^\w가-힣\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function flattenText(node: React.ReactNode): string {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join('');
  if (typeof node === 'object' && 'props' in node) {
    const props = (node as { props?: { children?: React.ReactNode } }).props;
    return flattenText(props?.children);
  }
  return '';
}
