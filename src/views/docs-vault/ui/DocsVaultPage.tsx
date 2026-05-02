'use client';

import dynamic from 'next/dynamic';
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link } from '@/i18n/navigation';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  BarChart3,
  Cloud,
  FileText,
  FilePlus,
  FolderCog,
  HardDrive,
  Layers,
  Menu,
  Network,
  Search,
  Settings2,
  X,
} from 'lucide-react';
import {
  LocalVaultPicker,
  OntologyStarterCta,
  useLocalVault,
} from '@/features/docs-vault-local';
import { useTypingShortcuts } from '@/shared/lib/use-typing-shortcut';
import { usePrevious } from '@/shared/lib/use-previous';
import { Tooltip } from '@/shared/ui';
// Fire 4-d-1 — 추출된 헬퍼들.
import { buildDocsVaultPopoutHtml } from '../lib/popout-template';
import { useDocsVaultScrollSpy } from '../lib/use-scroll-spy';
import {
  buildDocsVaultHref,
  buildTopologyFromVault,
  findRelationshipRadarSuggestions,
  type FolderTopologyBuild,
  vaultManifest,
  type VaultManifest,
  type VaultMode,
} from '@/entities/docs-vault';
import { DocsVaultAudienceMismatchNotice } from '@/widgets/docs-vault/ui/DocsVaultAudienceMismatchNotice';
import { DocsVaultEditor } from '@/widgets/docs-vault/ui/DocsVaultEditor';
import { DocsVaultProjectDepsBar } from '@/widgets/docs-vault/ui/DocsVaultProjectDepsBar';
import { DocsVaultRelationshipRadar } from '@/widgets/docs-vault/ui/DocsVaultRelationshipRadar';
import { DocsVaultStats } from '@/widgets/docs-vault/ui/DocsVaultStats';
import { DocsVaultUnifiedPalette } from '@/widgets/docs-vault/ui/DocsVaultUnifiedPalette';
import { DocsVaultViewer } from '@/widgets/docs-vault/ui/DocsVaultViewer';
import type { VaultCommand } from '@/widgets/docs-vault/model/command';
import {
  PINNED_DOCS_STORAGE_PREFIX,
  readPinnedDocs,
  togglePinnedDoc,
} from '@/widgets/docs-vault/lib/pinned-docs';
import {
  clearDismissedRadarReviewState,
  makeRadarReviewKey,
  readRadarReviewState,
  updateRadarReviewState,
} from '@/widgets/docs-vault/lib/radar-review-state';
import {
  migrateLegacyRecentDocs,
  pushRecentDoc,
  readRecentDocs,
  RECENT_DOCS_STORAGE_PREFIX,
  type VaultRecentKey,
} from '@/widgets/docs-vault/lib/recent-docs';

// DocsVaultFolderTopology 와 DocsVaultGraph 모두 Sigma WebGL 을 top-level
// 모듈에서 초기화하므로 SSR 에서 평가되면 WebGL2RenderingContext not
// defined 로 빌드 실패. 반드시 dynamic + ssr:false.
const DocsVaultFolderTopology = dynamic(
  () =>
    import('@/widgets/docs-vault/ui/DocsVaultFolderTopology').then(
      (m) => m.DocsVaultFolderTopology,
    ),
  { ssr: false },
);

// WebGL Sigma 는 SSR 빌드에서 잡히지 않도록 dynamic + ssr:false.
const DocsVaultGraph = dynamic(
  () =>
    import('@/widgets/docs-vault/ui/DocsVaultGraph').then(
      (m) => m.DocsVaultGraph,
    ),
  { ssr: false },
);

const serverManifest = vaultManifest as VaultManifest;

// Fire 4-b — persistence helpers 분리: src/views/docs-vault/lib/persistence.ts
//
// parseView → parseDocsVaultView, parseAudience → parseDocsVaultAudience 로
// 이름 정확화 (다른 view 도메인 과 collision 회피).
import { DocMetaBar } from "./parts/DocMetaBar";
import { DocsSidebarBody } from "./parts/DocsSidebarBody";
import { DocsVaultDocOutlinePanel } from "./parts/DocsVaultDocOutlinePanel";
import { EmptyState } from "./parts/EmptyState";
import {
  parseDocsVaultAudience as parseAudience,
  parseDocsVaultView as parseView,
  readStoredAudience,
  readStoredSource,
  scheduleStateSync,
  storeAudience,
  storeSource,
  type DocsVaultAudience,
  type DocsVaultSource as Source,
  type DocsVaultView,
} from "../lib/persistence";

function AdminDocsContent() {
  const t = useTranslations('docsVault');
  const searchParams = useSearchParams();
  const querySlug = searchParams?.get('slug') ?? null;
  const queryView = parseView(searchParams?.get('view'));
  const queryAudience = parseAudience(searchParams?.get('audience'));
  const accountId = searchParams?.get('account')?.trim() || null;
  // 로그인 사용자가 ?account= 없이 진입하면 본인 워크스페이스로 자동 스코프.
  const adminDashboardHref = useMemo(
    () => '/projects/',
    [accountId],
  );
  const workspaceHref = useMemo(
    () => '/',
    [accountId],
  );
  const getDocHref = useCallback(
    (slug: string, hash?: string) =>
      buildDocsVaultHref({ accountId, slug, hash }),
    [accountId],
  );
  const getProjectHref = useCallback(
    (slug: string) => `/?p=${encodeURIComponent(slug)}`,
    [],
  );
  const [selectedSlug, setSelectedSlug] = useState<string | null>(querySlug);
  const [audience, setAudience] =
    useState<DocsVaultAudience>(queryAudience);
  // 통합 팔레트 하나로 3 단축키 수렴. openWith 가 truthy 이면 open,
  // 값은 초기 쿼리 (`>` 명령, `#` 태그, `` 기본).
  const [paletteQuery, setPaletteQuery] = useState<string | null>(null);
  const paletteOpen = paletteQuery !== null;
  const [view, setView] = useState<DocsVaultView>(queryView);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const advancedMenuRef = useRef<HTMLDivElement | null>(null);
  const [folderTopo, setFolderTopo] = useState<FolderTopologyBuild | null>(
    null,
  );
  const [folderTopoError, setFolderTopoError] = useState<string | null>(null);
  const [folderTopoStatus, setFolderTopoStatus] = useState<
    'idle' | 'rebuilding' | 'fresh'
  >('idle');
  const freshResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [graphFocus, setGraphFocus] = useState<'all' | 'local'>('all');
  const [highlightQuery, setHighlightQuery] = useState<string | undefined>(
    undefined,
  );
  const [editing, setEditing] = useState(false);
  const [recentSlugs, setRecentSlugs] = useState<string[]>([]);
  const [pinnedSlugs, setPinnedSlugs] = useState<string[]>([]);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  // ?intent=local — landing CTA "내 마크다운 폴더 열기" 의 진입 query.
  // source 초기값을 'local' 로 박아 처음부터 picker UI 가 우측 sidebar 에
  // 보이게 (eval B4 finding — 이전엔 picker 가 4-단계 깊숙이 묻혀 있었음).
  const initialIntentLocal = searchParams?.get('intent') === 'local';
  const [source, setSource] = useState<Source>(initialIntentLocal ? 'local' : 'server');
  const [mobileTreeOpen, setMobileTreeOpen] = useState(false);
  const [radarConfirmedKeys, setRadarConfirmedKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [radarDismissedKeys, setRadarDismissedKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const localVault = useLocalVault();

  const replaceUrlState = useCallback(
    (next: {
      slug?: string | null;
      view?: DocsVaultView;
      audience?: DocsVaultAudience;
    }) => {
      if (typeof window === 'undefined') return;
      const url = new URL(window.location.href);
      if ('slug' in next) {
        if (next.slug) url.searchParams.set('slug', next.slug);
        else url.searchParams.delete('slug');
      }
      if ('view' in next) {
        if (next.view && next.view !== 'doc') {
          url.searchParams.set('view', next.view);
        } else {
          url.searchParams.delete('view');
        }
      }
      if ('audience' in next) {
        if (next.audience && next.audience !== 'all') {
          url.searchParams.set('audience', next.audience);
        } else {
          url.searchParams.delete('audience');
        }
      }
      window.history.replaceState({}, '', url.toString());
      window.dispatchEvent(new Event('app:urlchange'));
    },
    [],
  );

  const handleViewChange = useCallback(
    (next: DocsVaultView) => {
      setView(next);
      replaceUrlState({ view: next });
      setAdvancedOpen(false);
    },
    [replaceUrlState],
  );

  const handleAudienceChange = useCallback(
    (next: DocsVaultAudience) => {
      setAudience(next);
      storeAudience(next);
      replaceUrlState({ audience: next });
    },
    [replaceUrlState],
  );

  // 현재 활성 볼트의 recent namespace key. 로컬 폴더 이름이 핸들에서
  // 나오기 때문에 localVault.handle 의존.
  const recentKey = useMemo<VaultRecentKey>(() => {
    if (source === 'local' && localVault.handle) {
      return `local:${localVault.handle.name}`;
    }
    return 'server';
  }, [source, localVault.handle]);

  useEffect(() => {
    migrateLegacyRecentDocs();
    scheduleStateSync(() => setSource(readStoredSource()));
  }, []);

  // recentKey 가 바뀔 때마다 해당 볼트의 recent + pinned 목록 로드.
  useEffect(() => {
    scheduleStateSync(() => {
      setRecentSlugs(readRecentDocs(recentKey));
      setPinnedSlugs(readPinnedDocs(recentKey));
      const reviewState = readRadarReviewState(recentKey);
      setRadarConfirmedKeys(reviewState.confirmed);
      setRadarDismissedKeys(reviewState.dismissed);
    });
  }, [recentKey]);

  useEffect(() => {
    if (!advancedOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        advancedMenuRef.current?.contains(target)
      ) {
        return;
      }
      setAdvancedOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAdvancedOpen(false);
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [advancedOpen]);

  const handleTogglePin = useCallback(
    (slug: string) => {
      setPinnedSlugs(togglePinnedDoc(recentKey, slug));
    },
    [recentKey],
  );

  const pinnedSet = useMemo(() => new Set(pinnedSlugs), [pinnedSlugs]);

  // URL 복사 feedback — 최근에 복사된 slug 를 잠깐 기억하고 2초 뒤 reset.
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleCopyUrl = useCallback(async (slug: string) => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('slug', slug);
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopiedSlug(slug);
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
      copyResetRef.current = setTimeout(() => setCopiedSlug(null), 2000);
    } catch {
      /* clipboard 권한 없음 — silent. */
    }
  }, []);
  useEffect(
    () => () => {
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
    },
    [],
  );

  // Fire 4-d-1 — 스크롤 스파이 hook 추출 (lib/use-scroll-spy.ts).
  const { articleScrollRef, activeHeadingSlug, setActiveHeadingSlug } =
    useDocsVaultScrollSpy(selectedSlug, source);

  // 로컬 볼트 state 가 unsupported 면 server 로 강제 복귀 (토글 누른 후
  // 브라우저 교체한 경우 대비).
  useEffect(() => {
    if (source === 'local' && localVault.status === 'unsupported') {
      scheduleStateSync(() => {
        setSource('server');
        storeSource('server');
      });
    }
  }, [source, localVault.status]);

  const handleSourceChange = useCallback((next: Source) => {
    setSource(next);
    storeSource(next);
    // 소스 전환 시 선택 해제 — 동일 slug 가 다른 볼트에 있을 가능성 적음.
    setSelectedSlug(null);
    setActiveTag(null);
    replaceUrlState({
      slug: null,
      view: next === 'server' && view === 'folder-topology' ? 'doc' : view,
    });
    if (next === 'server' && view === 'folder-topology') setView('doc');
  }, [replaceUrlState, view]);

  // 현재 활성 매니페스트 — source 에 따라 분기. 로컬은 loaded 이전엔 null.
  const manifest: VaultManifest =
    source === 'local' && localVault.manifest
      ? localVault.manifest
      : serverManifest;

  // Viewer content resolver — 로컬은 파일 핸들로 읽기, 서버는 기본 fetch.
  const getDocContent = useMemo<
    ((slug: string) => Promise<string>) | undefined
  >(() => {
    if (source !== 'local') return undefined;
    const handles = localVault.fileHandles;
    return async (slug: string) => {
      const fh = handles.get(slug);
      if (!fh) throw new Error(`로컬 볼트에 ${slug} 없음`);
      const file = await fh.getFile();
      return file.text();
    };
  }, [source, localVault.fileHandles]);

  // 로컬 볼트 이미지 resolver — 상대 경로 → blob URL. 서버 볼트엔 undefined.
  const resolveImage = useMemo<
    ((path: string) => Promise<string | null>) | undefined
  >(() => {
    if (source !== 'local') return undefined;
    const handles = localVault.imageHandles;
    return async (path: string) => {
      const fh = handles.get(path);
      if (!fh) return null;
      const file = await fh.getFile();
      return URL.createObjectURL(file);
    };
  }, [source, localVault.imageHandles]);

  // 편집은 로컬 볼트일 때만. R10 (auth 영구 제거) 후 cap 체크 제거.
  const canEditCurrent = source === 'local';
  const editResolver = useMemo<
    ((slug: string) => Promise<string>) | undefined
  >(() => {
    // 편집용 resolver — 뷰어 resolver 와 동일하지만 명시적 분리.
    if (!canEditCurrent) return undefined;
    const handles = localVault.fileHandles;
    return async (slug: string) => {
      const fh = handles.get(slug);
      if (!fh) throw new Error(`로컬 볼트에 ${slug} 없음`);
      const file = await fh.getFile();
      return file.text();
    };
  }, [canEditCurrent, localVault.fileHandles]);
  // 편집 종료 조건 — 뷰어로 돌아가거나 source 바뀔 때.
  useEffect(() => {
    if (!canEditCurrent) scheduleStateSync(() => setEditing(false));
  }, [canEditCurrent]);
  useEffect(() => {
    scheduleStateSync(() => setEditing(false));
  }, [selectedSlug]);

  const handleDeleteCurrent = useCallback(async () => {
    if (!canEditCurrent || !selectedSlug) return;
    const slug = selectedSlug;
    const title =
      manifest.docs.find((d) => d.slug === slug)?.title ?? slug;
    if (typeof window === 'undefined') return;
    const ok = window.confirm(t('dialog.deleteConfirm', { title, slug }));
    if (!ok) return;
    try {
      await localVault.deleteDoc(slug);
      // 삭제 성공 — selection/pinned/recent 정리
      setSelectedSlug(null);
      setEditing(false);
      setRecentSlugs((list) => list.filter((s) => s !== slug));
      setPinnedSlugs((list) => {
        const next = list.filter((s) => s !== slug);
        if (next.length !== list.length) {
          // 실제 제거된 경우에만 localStorage 동기화
          try {
            window.localStorage.setItem(
              `${PINNED_DOCS_STORAGE_PREFIX}${recentKey}`,
              JSON.stringify(next),
            );
          } catch {
            /* ignore */
          }
        }
        return next;
      });
    } catch (err) {
      window.alert(
        t('dialog.deleteFailed', { message: err instanceof Error ? err.message : String(err) }),
      );
    }
  }, [canEditCurrent, selectedSlug, manifest, localVault, recentKey, t]);

  // Folder-Topology 빌드 — projects/*.md + categories.md + statuses.md 로드
  // → parser 호출. source==='local' 이고 vault 에 projects/ 가 있을 때만.
  const buildFolderTopology = useCallback(async () => {
    if (source !== 'local') return;
    setFolderTopoError(null);
    setFolderTopoStatus('rebuilding');
    try {
      const projectSlugs = manifest.docs
        .filter((d) => d.slug.startsWith('projects/'))
        .map((d) => d.slug);
      if (projectSlugs.length === 0) {
        setFolderTopo(null);
        return;
      }
      const loadRaw = async (slug: string) => {
        const fh = localVault.fileHandles.get(slug);
        if (!fh) throw new Error(`no handle: ${slug}`);
        const file = await fh.getFile();
        return file.text();
      };
      const categoriesFh = localVault.fileHandles.get('categories');
      const statusesFh = localVault.fileHandles.get('statuses');
      const categoriesRaw = categoriesFh
        ? await (await categoriesFh.getFile()).text()
        : undefined;
      const statusesRaw = statusesFh
        ? await (await statusesFh.getFile()).text()
        : undefined;
      const build = await buildTopologyFromVault({
        projectSlugs,
        loadRaw,
        categoriesRaw,
        statusesRaw,
      });
      setFolderTopo(build);
      // 갱신 완료 feedback — 2초간 "fresh" 표시 후 idle 로.
      setFolderTopoStatus('fresh');
      if (freshResetTimerRef.current) clearTimeout(freshResetTimerRef.current);
      freshResetTimerRef.current = setTimeout(
        () => setFolderTopoStatus('idle'),
        2000,
      );
    } catch (err) {
      setFolderTopoError(
        err instanceof Error ? err.message : String(err),
      );
      setFolderTopo(null);
      setFolderTopoStatus('idle');
    }
  }, [source, manifest, localVault]);

  useEffect(
    () => () => {
      if (freshResetTimerRef.current) clearTimeout(freshResetTimerRef.current);
    },
    [],
  );

  // view='folder-topology' 로 전환되거나 manifest 가 refresh 되면 자동 빌드.
  useEffect(() => {
    if (view !== 'folder-topology') return;
    scheduleStateSync(() => void buildFolderTopology());
  }, [view, buildFolderTopology]);

  /**
   * Folder-Topology 에서 "+ 프로젝트" 버튼 — 새 projects/{slug}.md 를
   * 기본 template 으로 생성하고 편집 모드로 진입.
   * category / status 는 vault 의 첫 정의를 default 로.
   */
  const handleCreateProject = useCallback(async () => {
    if (!canEditCurrent) return;
    if (typeof window === 'undefined') return;
    const input = window.prompt(t('dialog.createProjectPrompt'));
    if (!input) return;
    const slug = input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (!slug) {
      window.alert(t('dialog.invalidSlug'));
      return;
    }
    const fullSlug = `projects/${slug}`;
    if (manifest.docs.some((d) => d.slug === fullSlug)) {
      window.alert(t('dialog.alreadyExists', { slug: fullSlug }));
      return;
    }
    const defaultCategory = folderTopo?.categories[0]?.slug ?? 'uncategorized';
    const defaultStatus = folderTopo?.statuses[0]?.slug ?? 'active';
    const name = slug
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
    const template = [
      '---',
      `name: ${name}`,
      `slug: ${slug}`,
      `category: ${defaultCategory}`,
      `status: ${defaultStatus}`,
      'isHub: false',
      'dependencies: []',
      'tags: []',
      '---',
      '',
      `# ${name}`,
      '',
      '프로젝트 설명을 여기에 써주세요.',
      '',
    ].join('\n');
    try {
      await localVault.createDoc(fullSlug, template);
      setSelectedSlug(fullSlug);
      setRecentSlugs(pushRecentDoc(recentKey, fullSlug));
      setEditing(true);
      replaceUrlState({ slug: fullSlug, view: 'doc' });
      setView('doc');
    } catch (err) {
      window.alert(
        t('dialog.createFailed', { message: err instanceof Error ? err.message : String(err) }),
      );
    }
  }, [canEditCurrent, manifest, folderTopo, localVault, recentKey, replaceUrlState, t]);

  // Scaffold 실행 헬퍼 — confirm 거쳐 useLocalVault.scaffoldTopology.
  const handleScaffoldTopology = useCallback(async () => {
    if (!canEditCurrent) return;
    if (typeof window === 'undefined') return;
    const ok = window.confirm(t('dialog.scaffoldConfirm'));
    if (!ok) return;
    try {
      const result = await localVault.scaffoldTopology();
      window.alert(
        t('dialog.scaffoldDone', { created: result.created, skipped: result.skipped }),
      );
      // scaffold 후 README 를 자동 선택해 규격 인지 도움
      setSelectedSlug('README');
      setRecentSlugs(pushRecentDoc(recentKey, 'README'));
      replaceUrlState({ slug: 'README', view: 'folder-topology' });
      setView('folder-topology');
    } catch (err) {
      window.alert(
        t('dialog.scaffoldFailed', { message: err instanceof Error ? err.message : String(err) }),
      );
    }
  }, [canEditCurrent, localVault, recentKey, replaceUrlState, t]);

  const handleDailyNote = useCallback(async () => {
    if (!canEditCurrent) return;
    if (typeof window === 'undefined') return;
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const iso = `${y}-${m}-${d}`;
    const slug = `daily/${iso}`;
    const selectAndRecord = (s: string) => {
      setSelectedSlug(s);
      setRecentSlugs(pushRecentDoc(recentKey, s));
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.set('slug', s);
        window.history.replaceState({}, '', url.toString());
      }
    };
    if (manifest.docs.some((doc) => doc.slug === slug)) {
      selectAndRecord(slug);
      return;
    }
    const template = [
      '---',
      `title: ${iso}`,
      'tags: [daily]',
      '---',
      '',
      `# ${iso}`,
      '',
      '## 할 일',
      '',
      '- ',
      '',
      '## 메모',
      '',
      '',
    ].join('\n');
    try {
      await localVault.createDoc(slug, template);
      selectAndRecord(slug);
      setEditing(true);
    } catch (err) {
      window.alert(
        t('dialog.dailyNoteFailed', { message: err instanceof Error ? err.message : String(err) }),
      );
    }
  }, [canEditCurrent, manifest, localVault, recentKey, t]);

  const handleInsertToc = useCallback(async () => {
    if (!canEditCurrent || !selectedSlug) return;
    if (typeof window === 'undefined') return;
    const doc = manifest.docs.find((d) => d.slug === selectedSlug);
    if (!doc) return;
    const headings = doc.headings.filter(
      (h) => h.depth >= 2 && h.depth <= 3,
    );
    if (headings.length === 0) {
      window.alert(t('dialog.noHeadings'));
      return;
    }
    // TOC markdown — h2 는 * indent 없음, h3 는 2-space indent.
    const tocLines = headings.map((h) => {
      const indent = h.depth === 3 ? '  ' : '';
      return `${indent}- [${h.text}](#${h.slug})`;
    });
    const tocBlock = [
      '<!-- toc:start -->',
      '## 목차',
      '',
      ...tocLines,
      '<!-- toc:end -->',
    ].join('\n');
    const fh = localVault.fileHandles.get(selectedSlug);
    if (!fh) {
      window.alert(t('dialog.notLocalFile'));
      return;
    }
    try {
      const file = await fh.getFile();
      const raw = await file.text();
      // frontmatter 끝 찾기
      let insertAfter = 0;
      if (raw.startsWith('---')) {
        const end = raw.indexOf('\n---', 3);
        if (end !== -1) insertAfter = end + 4;
        while (raw[insertAfter] === '\n') insertAfter += 1;
      }
      // 기존 toc 블록이 있으면 제거
      const stripped = raw.replace(
        /<!-- toc:start -->[\s\S]*?<!-- toc:end -->\n?/,
        '',
      );
      // stripped 에서 insertAfter 재계산 (지워진 만큼 보정 필요하지만, 보통
      // toc 가 맨 앞이라 그대로 써도 안전)
      const head = stripped.slice(0, insertAfter);
      const body = stripped.slice(insertAfter);
      const next = `${head}${tocBlock}\n\n${body}`;
      await localVault.saveDoc(selectedSlug, next);
    } catch (err) {
      window.alert(
        t('dialog.tocFailed', { message: err instanceof Error ? err.message : String(err) }),
      );
    }
  }, [canEditCurrent, selectedSlug, manifest, localVault, t]);

  const handleExportDocHtml = useCallback(() => {
    if (!selectedSlug || typeof window === 'undefined') return;
    const doc = manifest.docs.find((d) => d.slug === selectedSlug);
    if (!doc) return;
    const article = document.querySelector('[data-docs-viewer]');
    if (!article) {
      window.alert(t('dialog.notRendered'));
      return;
    }
    const html = buildDocsVaultPopoutHtml(doc.title, article.outerHTML);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = doc.slug.replace(/\//g, '-');
    a.href = url;
    a.download = `${safeName}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [selectedSlug, manifest, t]);

  const handleImportVault = useCallback(async () => {
    if (!canEditCurrent) return;
    if (typeof window === 'undefined') return;
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = 'application/json,.json';
    const chosen: File | null = await new Promise((resolve) => {
      picker.onchange = () => {
        resolve(picker.files?.[0] ?? null);
      };
      picker.click();
    });
    if (!chosen) return;
    let bundle: {
      raws?: Record<string, string>;
      manifest?: { docs?: Array<{ slug: string }> };
    };
    try {
      const text = await chosen.text();
      bundle = JSON.parse(text);
    } catch (err) {
      window.alert(
        t('dialog.jsonParseFailed', { message: err instanceof Error ? err.message : String(err) }),
      );
      return;
    }
    const raws = bundle.raws ?? {};
    const slugs = Object.keys(raws);
    if (slugs.length === 0) {
      window.alert(t('dialog.noValidRaws'));
      return;
    }
    const existing = slugs.filter((s) =>
      manifest.docs.some((d) => d.slug === s),
    );
    let overwrite = false;
    if (existing.length > 0) {
      overwrite = window.confirm(
        t('dialog.importOverwriteConfirm', { count: existing.length }),
      );
    }
    let created = 0;
    let skipped = 0;
    let updated = 0;
    for (const slug of slugs) {
      const content = raws[slug];
      if (typeof content !== 'string') continue;
      const exists = manifest.docs.some((d) => d.slug === slug);
      try {
        if (exists) {
          if (overwrite) {
            await localVault.saveDoc(slug, content);
            updated += 1;
          } else {
            skipped += 1;
          }
        } else {
          await localVault.createDoc(slug, content);
          created += 1;
        }
      } catch {
        skipped += 1;
      }
    }
    window.alert(
      t('dialog.importDone', { created, updated, skipped }),
    );
  }, [canEditCurrent, manifest, localVault, t]);

  const handleExportVault = useCallback(async () => {
    if (typeof window === 'undefined') return;
    // 서버 볼트는 manifest 만 읽히지만 raw md 도 클라이언트 fetch 로 묶어
    // 단일 JSON 파일로 다운로드. 로컬 볼트는 fileHandle 로 읽기.
    const fetchRaw = async (slug: string): Promise<string> => {
      if (source === 'local' && localVault.fileHandles.has(slug)) {
        const fh = localVault.fileHandles.get(slug)!;
        const file = await fh.getFile();
        return file.text();
      }
      const res = await fetch(`/docs-vault/${slug}.md`, { cache: 'no-cache' });
      return res.ok ? res.text() : '';
    };
    const raws: Record<string, string> = {};
    for (const d of manifest.docs) {
      try {
        raws[d.slug] = await fetchRaw(d.slug);
      } catch {
        raws[d.slug] = '';
      }
    }
    const bundle = {
      exportedAt: new Date().toISOString(),
      source,
      vaultName:
        source === 'local' ? (localVault.handle?.name ?? 'local') : 'server',
      manifest,
      raws,
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
    a.href = url;
    a.download = `docs-vault-${bundle.vaultName}-${ts}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [manifest, source, localVault]);

  const handleRenameCurrent = useCallback(async () => {
    if (!canEditCurrent || !selectedSlug) return;
    if (typeof window === 'undefined') return;
    const input = window.prompt(t('dialog.renamePrompt'), selectedSlug);
    if (!input) return;
    const nextSlug = input
      .trim()
      .replace(/^\/+|\/+$/g, '')
      .replace(/\.md$/, '');
    if (!nextSlug || nextSlug === selectedSlug) return;
    if (manifest.docs.some((d) => d.slug === nextSlug)) {
      window.alert(t('dialog.renameAlreadyExists', { slug: nextSlug }));
      return;
    }
    try {
      await localVault.renameDoc(selectedSlug, nextSlug, {
        rewriteBacklinks: true,
      });
      // selection + recent/pinned 마이그레이트
      const prev = selectedSlug;
      setSelectedSlug(nextSlug);
      setRecentSlugs((list) => {
        const mapped = list.map((s) => (s === prev ? nextSlug : s));
        try {
          window.localStorage.setItem(
            `${RECENT_DOCS_STORAGE_PREFIX}${recentKey}`,
            JSON.stringify(mapped),
          );
        } catch {
          /* ignore */
        }
        return mapped;
      });
      setPinnedSlugs((list) => {
        const mapped = list.map((s) => (s === prev ? nextSlug : s));
        try {
          window.localStorage.setItem(
            `${PINNED_DOCS_STORAGE_PREFIX}${recentKey}`,
            JSON.stringify(mapped),
          );
        } catch {
          /* ignore */
        }
        return mapped;
      });
    } catch (err) {
      window.alert(
        t('dialog.renameFailed', { message: err instanceof Error ? err.message : String(err) }),
      );
    }
  }, [canEditCurrent, selectedSlug, manifest, localVault, recentKey, t]);

  const handleCreateNewDoc = useCallback(async () => {
    if (!canEditCurrent) return;
    if (typeof window === 'undefined') return;
    // 현재 선택 문서의 디렉터리를 기본으로 제안. 없으면 루트.
    const currentDir = selectedSlug && selectedSlug.includes('/')
      ? selectedSlug.slice(0, selectedSlug.lastIndexOf('/'))
      : '';
    const suggested = currentDir
      ? `${currentDir}/new-document`
      : 'new-document';
    const input = window.prompt(t('dialog.newDocPrompt'), suggested);
    if (!input) return;
    const slug = input
      .trim()
      .replace(/^\/+|\/+$/g, '')
      .replace(/\.md$/, '');
    if (!slug) return;
    if (manifest.docs.some((d) => d.slug === slug)) {
      window.alert(t('dialog.renameAlreadyExists', { slug }));
      return;
    }
    const title = slug.split('/').pop() ?? slug;
    const template = `---\ntitle: ${title}\n---\n\n# ${title}\n\n`;
    try {
      await localVault.createDoc(slug, template);
      // 방금 만든 문서를 자동 선택 + 편집 모드 진입
      setSelectedSlug(slug);
      setRecentSlugs(pushRecentDoc(recentKey, slug));
      setEditing(true);
      replaceUrlState({ slug, view: 'doc' });
    } catch (err) {
      window.alert(
        t('dialog.createFailed', { message: err instanceof Error ? err.message : String(err) }),
      );
    }
  }, [canEditCurrent, selectedSlug, manifest, localVault, recentKey, replaceUrlState, t]);

  // 마운트 1 회 — 초기 URL 값이 없을 때 localStorage 선호값으로 보강.
  // useRef 로 '실행 여부' 를 가두고 dep 는 컴포넌트 stable 값들만 명시.
  const initialPrefsAppliedRef = useRef(false);
  useEffect(() => {
    if (initialPrefsAppliedRef.current) return;
    initialPrefsAppliedRef.current = true;
    scheduleStateSync(() => {
      if (!searchParams?.has('audience')) setAudience(readStoredAudience());
      if (!searchParams?.has('view')) setView(queryView);
    });
  }, [searchParams, queryView]);

  // URL ↔ state 동기화: URL 쿼리가 변할 때만 local state 로 흘려보낸다.
  // 반대 방향 (state → URL) 은 user 인터랙션에서 router.push 로 이미 처리.
  // usePrevious 로 직전 URL 값과 비교해 "URL 이 변했을 때" 만 액션 실행.
  // dep array 에 모든 reactive 값 (current+prev URL, 그리고 비교 대상 state) 포함.
  const prevQuerySlug = usePrevious(querySlug);
  useEffect(() => {
    if (prevQuerySlug !== querySlug && querySlug !== selectedSlug) {
      scheduleStateSync(() => setSelectedSlug(querySlug));
    }
  }, [prevQuerySlug, querySlug, selectedSlug]);
  const prevQueryView = usePrevious(queryView);
  useEffect(() => {
    if (prevQueryView !== queryView && queryView !== view) {
      scheduleStateSync(() => setView(queryView));
    }
  }, [prevQueryView, queryView, view]);
  const prevQueryAudience = usePrevious(queryAudience);
  useEffect(() => {
    if (prevQueryAudience !== queryAudience && queryAudience !== audience) {
      scheduleStateSync(() => setAudience(queryAudience));
    }
  }, [prevQueryAudience, queryAudience, audience]);

  const docsBySlug = useMemo(() => {
    const map = new Map<string, (typeof manifest.docs)[number]>();
    for (const d of manifest.docs) map.set(d.slug, d);
    return map;
  }, [manifest]);
  const audienceBySlug = useMemo(() => {
    const out: Record<string, VaultMode> = {};
    for (const d of manifest.docs) out[d.slug] = d.mode;
    return out;
  }, [manifest]);
  const vaultSlugs = useMemo(
    () => new Set(manifest.docs.map((d) => d.slug)),
    [manifest],
  );

  useEffect(() => {
    if (selectedSlug && docsBySlug.has(selectedSlug)) return;

    const candidates = [
      ...pinnedSlugs,
      ...recentSlugs,
      'README',
      'ARCHITECTURE',
      manifest.docs[0]?.slug,
    ];
    const nextSlug = candidates.find(
      (slug): slug is string => Boolean(slug) && docsBySlug.has(slug),
    );
    if (!nextSlug) return;

    scheduleStateSync(() => {
      setSelectedSlug(nextSlug);
      if (!querySlug) replaceUrlState({ slug: nextSlug });
    });
  }, [docsBySlug, manifest.docs, pinnedSlugs, querySlug, recentSlugs, replaceUrlState, selectedSlug]);

  const handleSelect = useCallback(
    (slug: string, query?: string) => {
      setSelectedSlug(slug);
      setHighlightQuery(query);
      setRecentSlugs(pushRecentDoc(recentKey, slug));
      replaceUrlState({ slug });
    },
    [recentKey, replaceUrlState],
  );

  useTypingShortcuts([
    {
      combo: { key: 'k', meta: true },
      onFire: () => setPaletteQuery((q) => (q === null ? '' : null)),
    },
    {
      combo: { key: 'p', meta: true },
      onFire: () => setPaletteQuery((q) => (q === null ? '' : null)),
    },
    {
      combo: { key: 'o', meta: true },
      onFire: () => setPaletteQuery((q) => (q === null ? '' : null)),
    },
    {
      combo: { key: 'p', meta: true, shift: true },
      onFire: () => setPaletteQuery((q) => (q === null ? '> ' : null)),
    },
    {
      combo: { key: '/' },
      disabled: paletteOpen,
      onFire: () => setPaletteQuery(''),
    },
  ]);

  const selectedDoc = selectedSlug ? (docsBySlug.get(selectedSlug) ?? null) : null;
  const selectedDocOutsideAudience =
    audience !== 'all' &&
    selectedDoc !== null &&
    selectedDoc.mode !== audience &&
    selectedDoc.mode !== 'both';
  const selectedRadarDismissedSlugs = useMemo(() => {
    if (!selectedSlug) return new Set<string>();
    const prefix = `${selectedSlug}->`;
    return new Set(
      [...radarDismissedKeys]
        .filter((key) => key.startsWith(prefix))
        .map((key) => key.slice(prefix.length)),
    );
  }, [radarDismissedKeys, selectedSlug]);
  const selectedRadarConfirmedSlugs = useMemo(() => {
    if (!selectedSlug) return new Set<string>();
    const prefix = `${selectedSlug}->`;
    return new Set(
      [...radarConfirmedKeys]
        .filter((key) => key.startsWith(prefix))
        .map((key) => key.slice(prefix.length)),
    );
  }, [radarConfirmedKeys, selectedSlug]);
  const selectedRadarDismissedCount = selectedRadarDismissedSlugs.size;
  const radarSuggestions = useMemo(
    () =>
      findRelationshipRadarSuggestions(manifest.docs, selectedSlug, {
        audience,
        dismissedSlugs: selectedRadarDismissedSlugs,
        limit: 4,
      }),
    [audience, manifest.docs, selectedRadarDismissedSlugs, selectedSlug],
  );
  const handleConfirmRadarSuggestion = useCallback(
    (slug: string) => {
      if (!selectedSlug) return;
      const next = updateRadarReviewState(
        recentKey,
        makeRadarReviewKey(selectedSlug, slug),
        'confirmed',
      );
      setRadarConfirmedKeys(next.confirmed);
      setRadarDismissedKeys(next.dismissed);
    },
    [recentKey, selectedSlug],
  );
  const handleDismissRadarSuggestion = useCallback(
    (slug: string) => {
      if (!selectedSlug) return;
      const next = updateRadarReviewState(
        recentKey,
        makeRadarReviewKey(selectedSlug, slug),
        'dismissed',
      );
      setRadarConfirmedKeys(next.confirmed);
      setRadarDismissedKeys(next.dismissed);
    },
    [recentKey, selectedSlug],
  );
  const handleResetRadarSuggestion = useCallback(
    (slug: string) => {
      if (!selectedSlug) return;
      const next = updateRadarReviewState(
        recentKey,
        makeRadarReviewKey(selectedSlug, slug),
        'pending',
      );
      setRadarConfirmedKeys(next.confirmed);
      setRadarDismissedKeys(next.dismissed);
    },
    [recentKey, selectedSlug],
  );
  const handleClearDismissedRadarSuggestions = useCallback(() => {
    if (!selectedSlug) return;
    const next = clearDismissedRadarReviewState(recentKey, selectedSlug);
    setRadarConfirmedKeys(next.confirmed);
    setRadarDismissedKeys(next.dismissed);
  }, [recentKey, selectedSlug]);
  const backlinksDetail = selectedSlug
    ? (manifest.backlinksDetail?.[selectedSlug] ?? [])
    : [];
  const outlineHeadings = useMemo(() => {
    const headings =
      selectedDoc?.headings.filter((h) => h.depth >= 2 && h.depth <= 3) ?? [];
    const totals = new Map<string, number>();
    for (const heading of headings) {
      totals.set(heading.text, (totals.get(heading.text) ?? 0) + 1);
    }
    const seen = new Map<string, number>();
    return headings.map((heading) => {
      const occurrence = (seen.get(heading.text) ?? 0) + 1;
      seen.set(heading.text, occurrence);
      return {
        ...heading,
        duplicate: (totals.get(heading.text) ?? 0) > 1,
        occurrence,
      };
    });
  }, [selectedDoc]);
  const activeOutlineHeading =
    outlineHeadings.find((h) => h.slug === activeHeadingSlug) ??
    outlineHeadings[0] ??
    null;

  // 전체 명령 목록 — ⌘⇧P 팔레트용. selection/source/editing 등에 따라
  // visible 동적 계산.
  const commands = useMemo<VaultCommand[]>(() => {
    const selectedDocExists = selectedSlug !== null;
    return [
      {
        id: 'palette',
        label: t('commands.openPalette'),
        icon: '🔍',
        shortcut: '⌘K',
        onRun: () => setPaletteQuery(''),
      },
      {
        id: 'palette-tags',
        label: t('commands.findTags'),
        icon: '#',
        shortcut: '⌘K #',
        onRun: () => setPaletteQuery('#'),
      },
      {
        id: 'view-doc',
        label: t('commands.viewDoc'),
        icon: '📄',
        visible: view !== 'doc',
        onRun: () => handleViewChange('doc'),
      },
      {
        id: 'view-graph',
        label: t('commands.viewGraph'),
        icon: '🕸️',
        visible: view !== 'graph',
        onRun: () => handleViewChange('graph'),
      },
      {
        id: 'view-stats',
        label: t('commands.viewStats'),
        icon: '📊',
        visible: view !== 'stats',
        onRun: () => handleViewChange('stats'),
      },
      {
        id: 'view-folder-topology',
        label: t('commands.viewFolderTopology'),
        icon: '🗺️',
        visible: source === 'local' && view !== 'folder-topology',
        onRun: () => handleViewChange('folder-topology'),
      },
      {
        id: 'scaffold-topology',
        label: t('commands.scaffoldTopology'),
        icon: '🆕',
        visible: canEditCurrent,
        onRun: () => void handleScaffoldTopology(),
      },
      {
        id: 'create-project',
        label: t('commands.createProject'),
        icon: '🧩',
        visible: canEditCurrent && source === 'local',
        onRun: () => void handleCreateProject(),
      },
      {
        id: 'audience-all',
        label: t('commands.audienceAll'),
        icon: '◎',
        visible: audience !== 'all',
        onRun: () => handleAudienceChange('all'),
      },
      {
        id: 'audience-planner',
        label: t('commands.audiencePlanner'),
        icon: '◎',
        visible: audience !== 'planner',
        onRun: () => handleAudienceChange('planner'),
      },
      {
        id: 'audience-engineer',
        label: t('commands.audienceEngineer'),
        icon: '◎',
        visible: audience !== 'engineer',
        onRun: () => handleAudienceChange('engineer'),
      },
      {
        id: 'source-server',
        label: t('commands.sourceServer'),
        icon: '☁️',
        visible: source !== 'server',
        onRun: () => handleSourceChange('server'),
      },
      {
        id: 'source-local',
        label: t('commands.sourceLocal'),
        icon: '💾',
        visible: source !== 'local' && localVault.isSupported,
        onRun: () => handleSourceChange('local'),
      },
      {
        id: 'pin-toggle',
        label: pinnedSet.has(selectedSlug ?? '') ? t('commands.unpinDoc') : t('commands.pinDoc'),
        icon: '⭐',
        visible: selectedDocExists,
        onRun: () => selectedSlug && handleTogglePin(selectedSlug),
      },
      {
        id: 'copy-url',
        label: t('commands.copyUrl'),
        icon: '🔗',
        visible: selectedDocExists,
        onRun: () => selectedSlug && void handleCopyUrl(selectedSlug),
      },
      {
        id: 'print',
        label: t('commands.print'),
        icon: '🖨️',
        visible: selectedDocExists && view === 'doc',
        onRun: () => {
          if (typeof window !== 'undefined') window.print();
        },
      },
      {
        id: 'edit',
        label: t('commands.edit'),
        icon: '✏️',
        visible: canEditCurrent && selectedDocExists && !editing,
        onRun: () => setEditing(true),
      },
      {
        id: 'new-doc',
        label: t('commands.newDoc'),
        icon: '➕',
        visible: canEditCurrent,
        onRun: () => void handleCreateNewDoc(),
      },
      {
        id: 'daily-note',
        label: t('commands.dailyNote'),
        icon: '📅',
        visible: canEditCurrent,
        onRun: () => void handleDailyNote(),
      },
      {
        id: 'rename',
        label: t('commands.rename'),
        icon: '✎',
        visible: canEditCurrent && selectedDocExists,
        onRun: () => void handleRenameCurrent(),
      },
      {
        id: 'insert-toc',
        label: t('commands.insertToc'),
        icon: '≡',
        visible: canEditCurrent && selectedDocExists,
        onRun: () => void handleInsertToc(),
      },
      {
        id: 'delete',
        label: t('commands.deleteDoc'),
        icon: '🗑️',
        visible: canEditCurrent && selectedDocExists,
        onRun: () => void handleDeleteCurrent(),
      },
      {
        id: 'export-doc-html',
        label: t('commands.exportDocHtml'),
        icon: '📄',
        visible: selectedDocExists && view === 'doc',
        onRun: () => handleExportDocHtml(),
      },
      {
        id: 'export',
        label: t('commands.exportVault'),
        icon: '⬇',
        onRun: () => void handleExportVault(),
      },
      {
        id: 'import',
        label: t('commands.importVault'),
        icon: '⬆',
        visible: canEditCurrent,
        onRun: () => void handleImportVault(),
      },
      {
        id: 'local-refresh',
        label: t('commands.localRefresh'),
        icon: '↻',
        visible: source === 'local' && localVault.status === 'loaded',
        onRun: () => void localVault.refresh(),
      },
      {
        id: 'local-close',
        label: t('commands.localClose'),
        icon: '✖',
        visible: source === 'local' && localVault.status === 'loaded',
        onRun: () => void localVault.close(),
      },
      {
        id: 'tag-clear',
        label: t('commands.clearTagFilter'),
        icon: '#',
        visible: activeTag !== null,
        onRun: () => setActiveTag(null),
      },
      {
        id: 'projects-list',
        label: t('commands.projectsList'),
        icon: '←',
        onRun: () => {
          if (typeof window !== 'undefined')
            window.location.href = adminDashboardHref;
        },
      },
    ];
  }, [
    view,
    audience,
    source,
    selectedSlug,
    pinnedSet,
    canEditCurrent,
    editing,
    activeTag,
    adminDashboardHref,
    localVault,
    handleCopyUrl,
    handleCreateNewDoc,
    handleCreateProject,
    handleDailyNote,
    handleDeleteCurrent,
    handleExportDocHtml,
    handleExportVault,
    handleImportVault,
    handleInsertToc,
    handleAudienceChange,
    handleViewChange,
    handleRenameCurrent,
    handleScaffoldTopology,
    handleSourceChange,
    handleTogglePin,
    t,
  ]);

  // 좌측 사이드바 내부 내용 — aside 와 mobile drawer 양쪽에서 재사용.
  // Fire 4-d-2 — sidebarBody JSX 변수를 컴포넌트 (parts/DocsSidebarBody) 로
  // 승격. onSelect 는 caller 가 mobile drawer 닫기와 wrapping.
  const handleSelectFromSidebar = useCallback(
    (slug: string) => {
      handleSelect(slug);
      setMobileTreeOpen(false);
    },
    [handleSelect],
  );
  const sidebarBody = (
    <DocsSidebarBody
      pinnedSlugs={pinnedSlugs}
      recentSlugs={recentSlugs}
      selectedSlug={selectedSlug}
      docsBySlug={docsBySlug}
      audience={audience}
      audienceBySlug={audienceBySlug}
      activeTag={activeTag}
      manifest={manifest}
      onSelect={handleSelectFromSidebar}
      onTogglePin={handleTogglePin}
      onTagSelect={setActiveTag}
    />
  );

  return (
    <div className="flex h-screen flex-col bg-[color:var(--color-canvas)] text-[color:var(--color-text-primary)]">
      {/* 상단 바 — workspace 복귀 + 타이틀 + 소스 토글 + 모드 토글 */}
      <header className="flex min-h-14 flex-none flex-wrap items-center gap-x-3 gap-y-2 border-b border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-4 py-2">
        <div className="flex min-w-[280px] flex-1 flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileTreeOpen(true)}
            className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-md border border-[color:var(--color-divider)] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(139,151,255,0.35)] hover:text-[color:var(--color-text-primary)] md:hidden"
            aria-label={t('header.openTreeAriaLabel')}
            title={t('header.openTreeTitle')}
          >
            <Menu size={14} aria-hidden />
          </button>
          <Link
            href={workspaceHref}
            aria-label={t('header.backToWorkspaceAriaLabel')}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[color:var(--color-divider)] px-3 text-[12px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(139,151,255,0.35)] hover:text-[color:var(--color-text-primary)]"
          >
            <ArrowLeft size={12} aria-hidden />
            {t('header.back')}
          </Link>
          <div className="flex items-baseline gap-2">
            <h1 className="text-[14px] font-semibold">{t('header.title')}</h1>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              {t('header.docCount', { count: manifest.docs.length })}
            </span>
          </div>
          {source === 'local' ? (
            <span className="inline-flex items-center gap-1 rounded-sm border border-[color:rgba(139,151,255,0.24)] bg-[color:rgba(94,106,210,0.08)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[color:rgba(200,210,255,0.86)]">
              <HardDrive size={10} aria-hidden />
              {t('header.localBadge')}
            </span>
          ) : null}
        </div>
        <div className="ml-auto flex flex-none flex-wrap items-center justify-end gap-2">
          <div
            className="flex items-center gap-1 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] p-0.5 text-[11px]"
            aria-label={t('header.audienceAriaLabel')}
          >
            <span className="px-2 font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              {t('header.audienceLabel')}
            </span>
            {(['all', 'planner', 'engineer'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => handleAudienceChange(m)}
                className={`rounded-sm px-2.5 py-1 transition-colors ${
                  audience === m
                    ? 'bg-[color:rgba(94,106,210,0.14)] text-[color:var(--color-text-primary)]'
                    : 'text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-primary)]'
                }`}
                aria-pressed={audience === m}
              >
                {m === 'all' ? t('header.audienceAll') : m === 'planner' ? t('header.audiencePlanner') : t('header.audienceEngineer')}
              </button>
            ))}
          </div>
          <Tooltip content={t('header.paletteTooltip')} withProvider={false}>
            <button
              type="button"
              onClick={() => {
                setAdvancedOpen(false);
                setPaletteQuery('');
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[color:var(--color-border-soft)] px-2 text-[12px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(139,151,255,0.28)] hover:text-[color:var(--color-text-primary)]"
              aria-label={t('header.paletteAriaLabel')}
            >
              <Search size={13} aria-hidden />
              <kbd className="hidden rounded border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-1 font-mono text-[9.5px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)] md:inline-flex">
                ⌘K
              </kbd>
            </button>
          </Tooltip>
          <div className="relative" ref={advancedMenuRef}>
            <Tooltip content={t('header.advancedTooltip')} withProvider={false}>
              <button
                type="button"
                onClick={() => setAdvancedOpen((open) => !open)}
                aria-expanded={advancedOpen}
                aria-haspopup="menu"
                aria-label={t('header.advancedAriaLabel')}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[color:var(--color-border-soft)] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(139,151,255,0.28)] hover:text-[color:var(--color-text-primary)]"
              >
                <Settings2 size={13} aria-hidden />
              </button>
            </Tooltip>
            {advancedOpen ? (
              <div
                role="menu"
                className="absolute right-0 top-10 z-30 w-[300px] rounded-md border border-[color:var(--color-divider)] bg-[color:rgba(14,15,18,0.98)] p-2 shadow-[0_18px_48px_rgba(0,0,0,0.38)]"
              >
                <div className="mb-2 px-2 font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
                  {t('advanced.viewSection')}
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {[
                    { value: 'doc' as const, label: t('advanced.viewDoc'), icon: FileText },
                    { value: 'graph' as const, label: t('advanced.viewGraph'), icon: Network },
                    { value: 'stats' as const, label: t('advanced.viewStats'), icon: BarChart3 },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.value}
                        type="button"
                        role="menuitemradio"
                        aria-checked={view === item.value}
                        onClick={() => handleViewChange(item.value)}
                        className={`inline-flex items-center justify-center gap-1 rounded-sm px-2 py-1.5 text-[11px] transition-colors ${
                          view === item.value
                            ? 'bg-[color:rgba(94,106,210,0.16)] text-[color:var(--color-text-primary)]'
                            : 'text-[color:var(--color-text-tertiary)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]'
                        }`}
                      >
                        <Icon size={12} aria-hidden />
                        {item.label}
                      </button>
                    );
                  })}
                </div>
                {source === 'local' ? (
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={view === 'folder-topology'}
                    onClick={() => handleViewChange('folder-topology')}
                    className={`mt-1 inline-flex w-full items-center justify-center gap-1 rounded-sm px-2 py-1.5 text-[11px] transition-colors ${
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
                ) : null}
                <div className="my-2 h-px bg-[color:var(--color-border-soft)]" />
                <div className="mb-2 px-2 font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
                  {t('advanced.sourceSection')}
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={source === 'server'}
                    onClick={() => {
                      handleSourceChange('server');
                      setAdvancedOpen(false);
                    }}
                    className={`inline-flex items-center justify-center gap-1 rounded-sm px-2 py-1.5 text-[11px] transition-colors ${
                      source === 'server'
                        ? 'bg-[color:rgba(94,106,210,0.16)] text-[color:var(--color-text-primary)]'
                        : 'text-[color:var(--color-text-tertiary)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]'
                    }`}
                  >
                    <Cloud size={12} aria-hidden />
                    {t('advanced.sourceServer')}
                  </button>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={source === 'local'}
                    disabled={localVault.status === 'unsupported'}
                    onClick={() => {
                      handleSourceChange('local');
                      setAdvancedOpen(false);
                    }}
                    className={`inline-flex items-center justify-center gap-1 rounded-sm px-2 py-1.5 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                      source === 'local'
                        ? 'bg-[color:rgba(94,106,210,0.16)] text-[color:var(--color-text-primary)]'
                        : 'text-[color:var(--color-text-tertiary)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]'
                    }`}
                  >
                    <HardDrive size={12} aria-hidden />
                    {t('advanced.sourceLocal')}
                  </button>
                </div>
                {source === 'local' ? (
                  <div className="mt-2 space-y-2">
                    <LocalVaultPicker
                      status={localVault.status}
                      handleName={localVault.handle?.name ?? null}
                      docCount={localVault.manifest?.docs.length ?? 0}
                      errorMessage={localVault.errorMessage}
                      lastLoadedAt={localVault.lastLoadedAt}
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
                        onClick={handleCreateNewDoc}
                        className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-[color:rgba(139,151,255,0.35)] bg-[color:rgba(94,106,210,0.08)] px-2.5 py-1.5 text-[11.5px] text-[color:rgba(200,210,255,0.92)] transition-colors hover:border-[color:rgba(139,151,255,0.55)] hover:bg-[color:rgba(94,106,210,0.14)]"
                      >
                        <FilePlus size={12} aria-hidden />
                        {t('advanced.newDoc')}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* 좌측 트리 — md+ 에서만 inline aside */}
        <aside className="hidden w-[260px] flex-none flex-col overflow-auto border-r border-[color:var(--color-overlay-2)] bg-[color:var(--color-elevated)] md:flex">
          {sidebarBody}
        </aside>

        {/* 모바일 drawer — md 미만에서만 overlay */}
        {mobileTreeOpen ? (
          <div className="fixed inset-0 z-40 flex md:hidden">
            <div
              className="absolute inset-0 bg-[color:rgba(0,0,0,0.5)]"
              onClick={() => setMobileTreeOpen(false)}
              aria-hidden
            />
            <aside className="relative flex w-[280px] max-w-[82vw] flex-col overflow-auto bg-[color:var(--color-panel)] shadow-[0_0_24px_rgba(0,0,0,0.5)]">
              <div className="flex h-12 flex-none items-center justify-between border-b border-[color:var(--color-border-soft)] px-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
                  {t('mobileDrawer.title')}
                </span>
                <button
                  type="button"
                  onClick={() => setMobileTreeOpen(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-sm text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
                  aria-label={t('mobileDrawer.closeAriaLabel')}
                >
                  <X size={14} aria-hidden />
                </button>
              </div>
              <div className="flex flex-1 flex-col overflow-auto">
                {sidebarBody}
              </div>
            </aside>
          </div>
        ) : null}

        {/* 본문 + 우측 사이드 */}
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {view === 'folder-topology' ? (
            <div className="relative flex min-h-0 flex-1">
              {canEditCurrent && folderTopo && folderTopo.projects.length > 0 ? (
                <button
                  type="button"
                  onClick={() => void handleCreateProject()}
                  className="pointer-events-auto absolute left-3 top-[46px] z-10 inline-flex items-center gap-1.5 rounded-md border border-[color:rgba(139,151,255,0.35)] bg-[color:rgba(94,106,210,0.1)] px-2.5 py-1.5 text-[11.5px] text-[color:rgba(200,210,255,0.92)] shadow-[0_4px_14px_rgba(0,0,0,0.25)] transition-colors hover:border-[color:rgba(139,151,255,0.55)] hover:bg-[color:rgba(94,106,210,0.18)]"
                  title={t('topology.addProjectTitle', { slug: '{slug}' })}
                >
                  <FilePlus size={12} aria-hidden />
                  {t('topology.addProjectLabel')}
                </button>
              ) : null}
              {folderTopo && folderTopo.projects.length > 0 ? (
                <DocsVaultFolderTopology
                  build={folderTopo}
                  selectedSlug={selectedSlug}
                  onSelect={(slug) => {
                    handleSelect(`projects/${slug}`);
                    handleViewChange('doc');
                  }}
                  onPositionChange={
                    canEditCurrent
                      ? (slug, pos) => {
                          void localVault.updateFrontmatter(
                            `projects/${slug}`,
                            { positionX: pos.x, positionY: pos.y },
                            { skipRefresh: true },
                          );
                        }
                      : undefined
                  }
                />
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                  <FolderCog
                    size={28}
                    className="text-[color:var(--color-text-quaternary)]"
                    aria-hidden
                  />
                  <div className="text-[14px] text-[color:var(--color-text-primary)]">
                    {t('topology.emptyTitle')}
                  </div>
                  <p className="max-w-[440px] text-[12.5px] leading-[1.6] text-[color:var(--color-text-tertiary)]">
                    {t('topology.emptyBody')}
                  </p>
                  {folderTopoError ? (
                    <p className="font-mono text-[11px] text-[color:rgba(239,180,120,0.9)]">
                      {folderTopoError}
                    </p>
                  ) : null}
                  {canEditCurrent ? (
                    <button
                      type="button"
                      onClick={() => void handleScaffoldTopology()}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-[color:rgba(139,151,255,0.4)] bg-[color:rgba(94,106,210,0.08)] px-3 py-1.5 text-[12px] text-[color:rgba(200,210,255,0.95)] transition-colors hover:border-[color:rgba(139,151,255,0.6)] hover:bg-[color:rgba(94,106,210,0.14)]"
                    >
                      <FolderCog size={12} aria-hidden />
                      {t('topology.scaffoldCta')}
                    </button>
                  ) : (
                    <p className="font-mono text-[11px] text-[color:var(--color-text-quaternary)]">
                      {t('topology.needEditPermission')}
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : view === 'stats' ? (
            <div className="min-w-0 flex-1 overflow-auto">
              <DocsVaultStats
                manifest={manifest}
                pinnedSlugs={pinnedSlugs}
                onSelect={(slug) => {
                  handleSelect(slug);
                  handleViewChange('doc');
                }}
              />
            </div>
          ) : view === 'graph' ? (
            <div className="relative flex min-h-0 flex-1">
              {/* focus 모드 토글 — 선택 없으면 'local' 비활성 */}
              <div className="pointer-events-auto absolute right-3 top-3 z-10 flex items-center gap-1 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setGraphFocus('all')}
                  aria-pressed={graphFocus === 'all'}
                  className={`rounded-sm px-2 py-1 transition-colors ${
                    graphFocus === 'all'
                      ? 'bg-[color:rgba(94,106,210,0.14)] text-[color:var(--color-text-primary)]'
                      : 'text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-primary)]'
                  }`}
                >
                  {t('graph.focusAll')}
                </button>
                <button
                  type="button"
                  onClick={() => setGraphFocus('local')}
                  aria-pressed={graphFocus === 'local'}
                  disabled={!selectedSlug}
                  className={`rounded-sm px-2 py-1 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    graphFocus === 'local'
                      ? 'bg-[color:rgba(94,106,210,0.14)] text-[color:var(--color-text-primary)]'
                      : 'text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-primary)]'
                  }`}
                  title={
                    selectedSlug
                      ? t('graph.focusLocalEnabled')
                      : t('graph.focusLocalDisabled')
                  }
                >
                  {t('graph.focusLocalLabel')}
                </button>
              </div>
              <DocsVaultGraph
                docs={manifest.docs}
                selectedSlug={selectedSlug}
                onSelect={(slug) => {
                  handleSelect(slug);
                  handleViewChange('doc');
                }}
                mode="all"
                focusMode={graphFocus}
                focusHops={2}
              />
            </div>
          ) : selectedDoc ? (
            <div className="flex min-h-0 flex-1">
              <div
                ref={articleScrollRef}
                className="min-w-0 flex-1 overflow-auto"
              >
                {editing && canEditCurrent && editResolver ? (
                  <DocsVaultEditor
                    key={`edit:${source}:${selectedDoc.slug}`}
                    doc={selectedDoc}
                    getDocContent={editResolver}
                    onSave={async (slug, content) => {
                      await localVault.saveDoc(slug, content);
                    }}
                    onClose={() => setEditing(false)}
                    allDocs={manifest.docs}
                  />
                ) : (
                  <>
                    <DocMetaBar doc={selectedDoc} />
                    {selectedDocOutsideAudience ? (
                      <DocsVaultAudienceMismatchNotice
                        docMode={selectedDoc.mode}
                        currentAudience={audience}
                        onSwitchAudience={handleAudienceChange}
                      />
                    ) : null}
                    {audience === 'planner' ? (
                      <DocsVaultRelationshipRadar
                        suggestions={radarSuggestions}
                        confirmedSlugs={selectedRadarConfirmedSlugs}
                        dismissedCount={selectedRadarDismissedCount}
                        onNavigate={handleSelect}
                        onConfirm={handleConfirmRadarSuggestion}
                        onReset={handleResetRadarSuggestion}
                        onDismiss={handleDismissRadarSuggestion}
                        onClearDismissed={handleClearDismissedRadarSuggestions}
                      />
                    ) : null}
                    {selectedDoc.slug.startsWith('projects/') &&
                    source === 'local' ? (
                      <DocsVaultProjectDepsBar
                        currentSlug={selectedDoc.slug.replace(
                          /^projects\//,
                          '',
                        )}
                        build={folderTopo}
                        canEdit={canEditCurrent}
                        onChange={async (next) => {
                          await localVault.updateFrontmatter(
                            selectedDoc.slug,
                            { dependencies: next },
                          );
                          // manifest refresh 후 folderTopo 도 갱신
                          await buildFolderTopology();
                        }}
                        onNavigateProject={(slug) =>
                          handleSelect(`projects/${slug}`)
                        }
                      />
                    ) : null}
                    <DocsVaultViewer
                      key={`${source}:${selectedDoc.slug}`}
                      doc={selectedDoc}
                      vaultSlugs={vaultSlugs}
                      onNavigate={handleSelect}
                      getDocContent={getDocContent}
                      getDocHref={getDocHref}
                      getProjectHref={getProjectHref}
                      highlightQuery={highlightQuery}
                      resolveImage={resolveImage}
                    />
                  </>
                )}
              </div>
              {/* 우측 사이드: heading outline + backlinks. 편집 중엔 숨김 —
                  Editor 가 자체 툴바/액션을 가지고 공간도 쓰므로. Fire 4-d-3
                  에서 컴포넌트 추출 (parts/DocsVaultDocOutlinePanel). */}
              {!editing ? (
                <DocsVaultDocOutlinePanel
                  selectedDoc={selectedDoc}
                  pinnedSet={pinnedSet}
                  copiedSlug={copiedSlug}
                  canEditCurrent={canEditCurrent}
                  outlineHeadings={outlineHeadings}
                  activeOutlineHeading={activeOutlineHeading}
                  activeHeadingSlug={activeHeadingSlug}
                  backlinksDetail={backlinksDetail}
                  docsBySlug={docsBySlug}
                  onTogglePin={handleTogglePin}
                  onStartEditing={() => setEditing(true)}
                  onCopyUrl={handleCopyUrl}
                  onDeleteCurrent={handleDeleteCurrent}
                  onNavigate={handleSelect}
                  onHeadingClick={(slug) => {
                    document
                      .getElementById(slug)
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                    setActiveHeadingSlug(slug);
                    if (typeof window !== "undefined") {
                      window.history.replaceState(
                        {},
                        "",
                        `${window.location.pathname}${window.location.search}#${slug}`,
                      );
                    }
                  }}
                />
              ) : null}
            </div>
          ) : (
            <EmptyState audience={audience} />
          )}
        </main>
      </div>

      <AnimatePresence>
        {paletteOpen ? (
          <DocsVaultUnifiedPalette
            key="docs-unified-palette"
            onClose={() => setPaletteQuery(null)}
            docs={manifest.docs}
            recentSlugs={recentSlugs}
            pinnedSlugs={pinnedSlugs}
            commands={commands}
            tagCounts={Object.entries(manifest.tags).map(([tag, slugs]) => ({
              tag,
              count: slugs.length,
            }))}
            onDocSelect={(slug, q) => handleSelect(slug, q)}
            onTagSelect={(tag) => setActiveTag(tag)}
            initialQuery={paletteQuery ?? ''}
            getDocHref={getDocHref}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// Fire 4-c — DocMetaBar / EmptyState 분리:
//   src/views/docs-vault/ui/parts/DocMetaBar.tsx
//   src/views/docs-vault/ui/parts/EmptyState.tsx

export function DocsVaultPage() {
  // local-first 핵심 (`.claude/rules/local-first.md` §1) — vault picker 진입은
  // 인증 게이트 없음. Guard 폐기 (mission v2: 사용자 로컬 디스크가 진실원이라
  // cloud-side multi-account workspace 권한 체크 불필요).
  return (
    <Suspense fallback={null}>
      <AdminDocsContent />
    </Suspense>
  );
}
