'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildLocalManifest,
  computeLocalVaultFingerprint,
  type LocalVaultBuild,
  type VaultManifest,
} from '@/entities/docs-vault';
import {
  CURRENT_LOCAL_FS_HANDLE_ID,
  deleteLocalFsHandle,
  getLocalFsHandle,
  putLocalFsHandle,
  touchLocalFsHandle,
  verifyHandlePermission,
} from '@/entities/local-fs-handle';
import {
  ONTOLOGY_STARTER_FILES,
  buildMcpConfigJson,
} from '../lib/ontology-starter';
/** 탭 포커스 복귀 시 자동 refresh 의 최소 간격 (ms). 너무 자주 돌면
 *  사용자가 IDE 로 짧게 오갈 때마다 번쩍이므로 2초 간격으로 throttle. */
const AUTO_REFRESH_DEBOUNCE_MS = 2000;

type Status =
  | 'idle'
  | 'opening'
  | 'loading'
  | 'loaded'
  | 'permission-needed'
  | 'unsupported'
  | 'error';

interface State {
  status: Status;
  handle: FileSystemDirectoryHandle | null;
  manifest: VaultManifest | null;
  fileHandles: Map<string, FileSystemFileHandle>;
  imageHandles: Map<string, FileSystemFileHandle>;
  errorMessage: string | null;
  /** 마지막 성공 스캔 epoch ms. picker 에서 "N초 전 스캔" 표기에 씀. */
  lastLoadedAt: number | null;
}

function emptyState(status: Status = 'idle'): State {
  return {
    status,
    handle: null,
    manifest: null,
    fileHandles: new Map(),
    imageHandles: new Map(),
    errorMessage: null,
    lastLoadedAt: null,
  };
}

/**
 * md raw 에서 frontmatter 를 찾아 주어진 key 의 값을 교체/추가/삭제.
 * 본문은 건드리지 않는다. frontmatter 가 없으면 새로 만들어 맨 위에
 * 붙인다.
 *
 * 지원하는 value 타입:
 *  - string/number/boolean → `key: value` 로 직렬화 (문자열은 따옴표 없이,
 *    공백 포함이면 따옴표)
 *  - string[] → `key: [a, b, c]` inline 배열
 *  - { primitive: ... } → `key: { k1: v1, k2: v2 }` inline 1-depth 객체
 *  - null → 해당 key 제거
 *
 * 한계: nested 2-depth 이상 객체는 지원 안 함. value serialization 은 우리
 * 간단 frontmatter 파서와 정확히 round-trip.
 */
export type FrontmatterUpdateValue =
  | string
  | number
  | boolean
  | string[]
  | Record<string, string | number | boolean>
  | null;

export function applyFrontmatterUpdates(
  raw: string,
  updates: Record<string, FrontmatterUpdateValue>,
): string {
  let fmLines: string[] = [];
  let body = raw;
  if (raw.startsWith('---')) {
    const end = raw.indexOf('\n---', 3);
    if (end !== -1) {
      fmLines = raw.slice(4, end).split('\n');
      // 모든 선행 개행 제거 — serializer 가 `---\n...\n---\n\n` 로 구분자를
      // 보태므로 body 는 선두 개행 없이 시작해야 중복 방지.
      body = raw.slice(end + 4).replace(/^(\r?\n)+/, '');
    }
  }
  const updatedKeys = new Set<string>();
  const nextLines: string[] = [];
  for (const line of fmLines) {
    const idx = line.indexOf(':');
    if (idx === -1) {
      nextLines.push(line);
      continue;
    }
    const key = line.slice(0, idx).trim();
    if (!(key in updates)) {
      nextLines.push(line);
      continue;
    }
    updatedKeys.add(key);
    const value = updates[key];
    if (value === null) continue; // delete
    nextLines.push(`${key}: ${serializeFrontmatterValue(value)}`);
  }
  // 새 키 append
  for (const [key, value] of Object.entries(updates)) {
    if (updatedKeys.has(key)) continue;
    if (value === null) continue;
    nextLines.push(`${key}: ${serializeFrontmatterValue(value)}`);
  }
  // frontmatter 비어있으면 섹션 자체 생략
  if (nextLines.every((l) => l.trim() === '')) {
    return body;
  }
  return `---\n${nextLines.join('\n')}\n---\n\n${body}`;
}

function serializeFrontmatterValue(
  v: Exclude<FrontmatterUpdateValue, null>,
): string {
  if (Array.isArray(v)) {
    return `[${v.map((s) => (needsQuote(s) ? `"${s.replace(/"/g, '\\"')}"` : s)).join(', ')}]`;
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object') {
    // inline 1-depth object — `{ x: 100, y: 200 }`. parseFrontmatter 가 같은
    // 형식 round-trip 인식 (parser.test.mjs 'inline object' case).
    const entries = Object.entries(v).map(([k, val]) => {
      let serialized: string;
      if (typeof val === 'boolean') serialized = val ? 'true' : 'false';
      else if (typeof val === 'number') serialized = String(val);
      else serialized = needsQuote(val) ? `"${val.replace(/"/g, '\\"')}"` : val;
      return `${k}: ${serialized}`;
    });
    return `{ ${entries.join(', ')} }`;
  }
  return needsQuote(v) ? `"${v.replace(/"/g, '\\"')}"` : v;
}

function needsQuote(s: string): boolean {
  // 우리 파서가 감당 못 하는 문자들 (쉼표, 콜론, 대괄호, 시작 따옴표)
  return /[:,\[\]"]|^\s|\s$/.test(s);
}

function isSupported(): boolean {
  return (
    typeof window !== 'undefined' && 'showDirectoryPicker' in window
  );
}

function verifyRead(
  handle: FileSystemDirectoryHandle,
  ask = false,
): Promise<'granted' | 'prompt' | 'denied'> {
  return verifyHandlePermission(handle, 'read', { ask });
}

/**
 * write 경로 공통 — readwrite 권한이 없으면 ask 후 거부 시 throw.
 * inline `queryPermission` / `requestPermission` 보일러를 압축한다.
 */
async function ensureReadWrite(
  handle: FileSystemDirectoryHandle | FileSystemFileHandle,
): Promise<void> {
  const result = await verifyHandlePermission(handle, 'readwrite', { ask: true });
  if (result !== 'granted') {
    throw new Error('쓰기 권한이 거부되었습니다');
  }
}

/**
 * 로컬 (PC) 폴더를 볼트로 쓰는 훅. File System Access API 지원 브라우저
 * (Chrome/Edge/Safari 18.2+/Opera) 에서만 동작.
 *
 * - `open()` : showDirectoryPicker 로 폴더 선택 + IDB 에 핸들 저장
 * - `close()` : 핸들 지우고 state idle
 * - `refresh()` : 현재 핸들 재스캔 (파일 변경 반영)
 * - `requestPermission()` : 세션 복원 후 permission-needed 일 때 재승인
 *
 * 최초 mount 에서 IDB 에 저장된 핸들을 복원 시도. query 결과가
 * 'granted' 면 자동 manifest 빌드, 'prompt' 면 permission-needed 로 대기.
 */
export function useLocalVault() {
  const [state, setState] = useState<State>(() =>
    emptyState(isSupported() ? 'idle' : 'unsupported'),
  );

  /** 마지막 성공 빌드의 fingerprint — auto-refresh 시 변경 없으면 skip 의 비교 기준. */
  const lastFingerprintRef = useRef<string | null>(null);

  const load = useCallback(async (handle: FileSystemDirectoryHandle) => {
    setState((s) => ({ ...s, status: 'loading', handle, errorMessage: null }));
    try {
      const build: LocalVaultBuild = await buildLocalManifest(handle);
      const { manifest, fileHandles, imageHandles, fingerprint } = build;
      lastFingerprintRef.current = fingerprint;
      setState({
        status: 'loaded',
        handle,
        manifest,
        fileHandles,
        imageHandles,
        errorMessage: null,
        lastLoadedAt: Date.now(),
      });
    } catch (err) {
      setState({
        status: 'error',
        handle,
        manifest: null,
        fileHandles: new Map(),
        imageHandles: new Map(),
        errorMessage:
          err instanceof Error ? err.message : '매니페스트 빌드 실패',
        lastLoadedAt: null,
      });
    }
  }, []);

  const open = useCallback(async () => {
    if (!isSupported()) {
      setState(emptyState('unsupported'));
      return;
    }
    setState((s) => ({ ...s, status: 'opening', errorMessage: null }));
    try {
      const handle = await (
        window as unknown as {
          showDirectoryPicker: (opts?: {
            mode?: 'read' | 'readwrite';
          }) => Promise<FileSystemDirectoryHandle>;
        }
      ).showDirectoryPicker({ mode: 'read' });
      const now = Date.now();
      await putLocalFsHandle({
        id: CURRENT_LOCAL_FS_HANDLE_ID,
        handle,
        name: handle.name,
        createdAt: now,
        lastAccessedAt: now,
      });
      await load(handle);
    } catch (err) {
      // AbortError = 사용자가 취소한 것이니 idle 로 복귀.
      if (err instanceof DOMException && err.name === 'AbortError') {
        setState((s) => ({ ...s, status: s.handle ? 'loaded' : 'idle' }));
        return;
      }
      setState((s) => ({
        ...s,
        status: 'error',
        errorMessage:
          err instanceof Error ? err.message : '폴더를 열지 못했습니다',
      }));
    }
  }, [load]);

  const close = useCallback(async () => {
    await deleteLocalFsHandle();
    setState(emptyState(isSupported() ? 'idle' : 'unsupported'));
  }, []);

  /**
   * 사용자 주도 refresh. fingerprint 가 같으면 (외부 변경 없음) 전체 재빌드를
   * skip 하되, `lastLoadedAt` 만 갱신해 picker 의 "방금 스캔" 라벨이 적절히
   * 갱신되도록 한다. fingerprint 계산 자체가 실패하면 안전하게 전체 재빌드로
   * 폴백.
   */
  const refresh = useCallback(async () => {
    if (!state.handle) return;
    const handle = state.handle;
    try {
      const fp = await computeLocalVaultFingerprint(handle);
      if (fp === lastFingerprintRef.current) {
        setState((s) => ({ ...s, lastLoadedAt: Date.now() }));
        return;
      }
    } catch {
      /* fingerprint 실패 → 안전하게 전체 재빌드로 폴백 */
    }
    await load(handle);
  }, [state.handle, load]);

  // 탭 포커스 복귀 시 자동 refresh — IDE 에서 편집 후 브라우저로 돌아오면
  // 스스로 다시 스캔해 최신 상태로. 2초 debounce 로 중복 호출 방지.
  // fingerprint 비교를 먼저 수행해 변경 없으면 전체 재빌드를 skip — 큰 볼트
  // 에서 focus 시 잠깐 멈추는 현상 완화.
  const autoRefreshRef = useRef<{
    lastAt: number;
    timer: ReturnType<typeof setTimeout> | null;
  }>({ lastAt: 0, timer: null });
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);
  useEffect(() => {
    if (state.status !== 'loaded' || !state.handle) return;
    const handle = state.handle;
    const tracker = autoRefreshRef.current;
    const tryReload = async () => {
      try {
        const fp = await computeLocalVaultFingerprint(handle);
        if (fp === lastFingerprintRef.current) {
          // 변경 없음 — picker 라벨이 stale 로 보이지 않도록 lastLoadedAt 만 갱신.
          setState((s) => ({ ...s, lastLoadedAt: Date.now() }));
          return;
        }
      } catch {
        /* fingerprint 실패는 무시 — 안전하게 전체 재빌드로 폴백 */
      }
      loadRef.current(handle);
    };
    const fire = () => {
      const now = Date.now();
      const last = tracker.lastAt;
      if (now - last < AUTO_REFRESH_DEBOUNCE_MS) {
        if (tracker.timer) clearTimeout(tracker.timer);
        tracker.timer = setTimeout(() => {
          tracker.lastAt = Date.now();
          void tryReload();
        }, AUTO_REFRESH_DEBOUNCE_MS - (now - last));
        return;
      }
      tracker.lastAt = now;
      void tryReload();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') fire();
    };
    window.addEventListener('focus', fire);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', fire);
      document.removeEventListener('visibilitychange', onVisibility);
      if (tracker.timer) {
        clearTimeout(tracker.timer);
        tracker.timer = null;
      }
    };
  }, [state.status, state.handle]);

  const requestPermission = useCallback(async () => {
    if (!state.handle) return;
    const result = await verifyRead(state.handle, true);
    if (result === 'granted') {
      await load(state.handle);
    } else {
      setState((s) => ({ ...s, status: 'permission-needed' }));
    }
  }, [state.handle, load]);

  /**
   * 루트 핸들 부터 슬래시 경로를 따라가 (생성 옵션 포함) 부모 디렉터리
   * 핸들과 파일 이름을 반환. `foo/bar/baz` → dir = root/foo/bar, name = baz.md.
   */
  const getParentAndName = useCallback(
    async (
      slug: string,
      createIntermediate: boolean,
    ): Promise<{
      parent: FileSystemDirectoryHandle;
      fileName: string;
    } | null> => {
      if (!state.handle) return null;
      // readwrite permission — 쓰기 경로에만 호출되므로 여기서 확보.
      await ensureReadWrite(state.handle);
      const parts = slug.split('/').filter(Boolean);
      if (parts.length === 0) throw new Error('빈 slug');
      const fileName = `${parts[parts.length - 1]}.md`;
      let parent: FileSystemDirectoryHandle = state.handle;
      for (let i = 0; i < parts.length - 1; i += 1) {
        parent = await parent.getDirectoryHandle(parts[i], {
          create: createIntermediate,
        });
      }
      return { parent, fileName };
    },
    [state.handle],
  );

  /**
   * 특정 slug 의 md 파일 내용을 새로 쓴다. readwrite 권한이 없으면 먼저
   * 승인 요청. 성공 시 manifest 를 재스캔해 최신 상태로.
   */
  const saveDoc = useCallback(
    async (slug: string, content: string) => {
      const fh = state.fileHandles.get(slug);
      if (!fh) throw new Error(`로컬 볼트에 ${slug} 없음`);
      await ensureReadWrite(fh);
      const writable = await fh.createWritable();
      await writable.write(content);
      await writable.close();
      // 저장 성공 뒤 전체 매니페스트 재스캔 — backlinks/headings 등 반영.
      if (state.handle) await load(state.handle);
    },
    [state.fileHandles, state.handle, load],
  );

  /**
   * 새 .md 파일을 slug 경로에 생성. 같은 slug 가 이미 있으면 에러.
   * 중간 디렉터리는 자동 생성. 템플릿 content 를 써서 초기 본문 채움.
   */
  const createDoc = useCallback(
    async (slug: string, content: string) => {
      if (state.fileHandles.has(slug)) {
        throw new Error(`이미 존재하는 문서: ${slug}`);
      }
      const resolved = await getParentAndName(slug, true);
      if (!resolved) throw new Error('볼트가 열려있지 않습니다');
      const fh = await resolved.parent.getFileHandle(resolved.fileName, {
        create: true,
      });
      const writable = await fh.createWritable();
      await writable.write(content);
      await writable.close();
      if (state.handle) await load(state.handle);
    },
    [state.fileHandles, state.handle, getParentAndName, load],
  );

  /**
   * slug 에 해당하는 파일을 로컬 디스크에서 삭제. 중간 디렉터리가 비어도
   * 제거하지 않음 (의도적 — 다른 파일 들어갈 수 있음).
   */
  const deleteDoc = useCallback(
    async (slug: string) => {
      const resolved = await getParentAndName(slug, false);
      if (!resolved) throw new Error('볼트가 열려있지 않습니다');
      await resolved.parent.removeEntry(resolved.fileName);
      if (state.handle) await load(state.handle);
    },
    [state.handle, getParentAndName, load],
  );

  /**
   * 특정 slug 의 md 파일의 frontmatter 중 일부 key 만 업데이트. 본문은
   * 보존. 간단 frontmatter 규칙 (key: value 한 줄 + tags/projects 같은
   * 배열 [a, b]) 에서 동작. 복잡한 nested object 는 지원하지 않음.
   *
   * updates 의 key 에 이미 있으면 교체, 없으면 frontmatter 끝에 append.
   * value 가 null 이면 해당 key 를 삭제.
   *
   * 원자성 — saveDoc 과 같은 경로로 createWritable → write. refresh 는
   * opts.skipRefresh 가 true 면 건너뛰어 연속 호출 시 스크롤/깜빡임
   * 방지.
   */
  const updateFrontmatter = useCallback(
    async (
      slug: string,
      updates: Record<string, FrontmatterUpdateValue>,
      opts: { skipRefresh?: boolean } = {},
    ) => {
      const fh = state.fileHandles.get(slug);
      if (!fh) throw new Error(`로컬 볼트에 ${slug} 없음`);
      await ensureReadWrite(fh);
      const file = await fh.getFile();
      const raw = await file.text();
      const next = applyFrontmatterUpdates(raw, updates);
      if (next === raw) return; // 변경 없음
      const writable = await fh.createWritable();
      await writable.write(next);
      await writable.close();
      if (!opts.skipRefresh && state.handle) await load(state.handle);
    },
    [state.fileHandles, state.handle, load],
  );

  /**
   * 로컬 볼트 내에서 slug 경로 변경 (rename 또는 이동). 기존 파일 내용을
   * 읽어 새 위치에 create, 성공 시 원본 제거. 같은 slug 면 no-op.
   *
   * 옵션 `rewriteBacklinks=true` 면 vault 내 다른 md 파일들의 본문에서
   * oldSlug 참조 ([[oldSlug]], [text](...oldSlug.md)) 를 newSlug 로 자동
   * 치환. 실패해도 rename 자체는 유지되도록 best-effort.
   */
  const renameDoc = useCallback(
    async (
      oldSlug: string,
      newSlug: string,
      opts: { rewriteBacklinks?: boolean } = {},
    ) => {
      if (oldSlug === newSlug) return;
      if (state.fileHandles.has(newSlug)) {
        throw new Error(`이미 존재하는 문서: ${newSlug}`);
      }
      const oldFh = state.fileHandles.get(oldSlug);
      if (!oldFh) throw new Error(`로컬 볼트에 ${oldSlug} 없음`);
      const file = await oldFh.getFile();
      const content = await file.text();
      const newResolved = await getParentAndName(newSlug, true);
      if (!newResolved) throw new Error('볼트가 열려있지 않습니다');
      const newFh = await newResolved.parent.getFileHandle(
        newResolved.fileName,
        { create: true },
      );
      const writable = await newFh.createWritable();
      await writable.write(content);
      await writable.close();
      const oldResolved = await getParentAndName(oldSlug, false);
      if (oldResolved) {
        await oldResolved.parent.removeEntry(oldResolved.fileName);
      }

      // --- backlinks 연쇄 치환 (옵션)
      if (opts.rewriteBacklinks && state.manifest) {
        // 이 문서를 인용하는 slug 들을 manifest 의 linksOut 에서 역산
        const referrers = state.manifest.docs
          .filter(
            (d) => d.slug !== oldSlug && d.linksOut.includes(oldSlug),
          )
          .map((d) => d.slug);
        // 각 referrer 의 raw 를 읽어 치환 — [[oldSlug...]] + (...oldSlug.md...)
        // 형태 모두 대응. 다른 slug 앞뒤에 걸치지 않도록 경계 확인.
        const escaped = oldSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // [[oldSlug]] / [[oldSlug|..]] / [[oldSlug#..]]
        const wikiRe = new RegExp(
          `(\\[\\[)(${escaped})(\\||#|\\]\\])`,
          'g',
        );
        // [text](path/oldSlug.md...) — 상대 경로 말미가 oldSlug.md 인 경우.
        const mdRe = new RegExp(
          `(\\]\\([^)]*?)(${escaped})(\\.md)`,
          'g',
        );
        for (const ref of referrers) {
          const fh = state.fileHandles.get(ref);
          if (!fh) continue;
          try {
            const perm = await verifyHandlePermission(fh, 'readwrite', {
              ask: true,
            });
            if (perm !== 'granted') continue;
            const srcFile = await fh.getFile();
            const srcText = await srcFile.text();
            const nextText = srcText
              .replace(wikiRe, `$1${newSlug}$3`)
              .replace(mdRe, `$1${newSlug}$3`);
            if (nextText !== srcText) {
              const w = await fh.createWritable();
              await w.write(nextText);
              await w.close();
            }
          } catch {
            /* best-effort — 실패 파일은 스킵 */
          }
        }
      }

      if (state.handle) await load(state.handle);
    },
    [state.fileHandles, state.handle, state.manifest, getParentAndName, load],
  );

  // 최초 1회 — IDB 에서 핸들 복원 시도
  useEffect(() => {
    if (!isSupported()) return;
    let cancelled = false;
    (async () => {
      const record = await getLocalFsHandle();
      if (!record || cancelled) return;
      const handle = record.handle;
      void touchLocalFsHandle();
      const permission = await verifyRead(handle, false);
      if (cancelled) return;
      if (permission === 'granted') {
        await load(handle);
      } else {
        setState({
          status: 'permission-needed',
          handle,
          manifest: null,
          fileHandles: new Map(),
          imageHandles: new Map(),
          errorMessage: null,
          lastLoadedAt: null,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  /**
   * 볼트를 Folder-Topology 규격으로 초기화 — projects/ 디렉터리 + sample 2개
   * 프로젝트 + categories.md + statuses.md + README.md. 이미 존재하는 파일은
   * 덮어쓰지 않는다 (skip). 호출자가 confirm 이후 실행 권장.
   */
  const scaffoldTopology = useCallback(async () => {
    const files: Record<string, string> = {
      README: [
        '# 나의 볼트',
        '',
        '이 폴더는 Docs Vault + Folder-Topology 규격 볼트입니다.',
        '',
        '## 구조',
        '',
        '- `projects/*.md` — 각 파일 = 1 프로젝트 (토폴로지 노드)',
        '- `categories.md` — 카테고리 정의 (tone: indigo / amber / neutral)',
        '- `statuses.md` — 상태 lifecycle',
        '- `docs/**` — 일반 위키 문서 (선택)',
        '',
        '## 프로젝트 md frontmatter 필드',
        '',
        '| 필드 | 타입 | 필수 | 설명 |',
        '| --- | --- | --- | --- |',
        '| `name` | string | ✅ | 사용자에게 보이는 이름 |',
        '| `slug` | string | ❌ | 생략 시 파일 이름에서 유도 |',
        '| `category` | string | ✅ | categories.md 의 slug |',
        '| `status` | string | ❌ | statuses.md 의 slug. 기본 active |',
        '| `isHub` | boolean | ❌ | 허브 프로젝트 여부 |',
        '| `dependencies` | string[] | ❌ | 의존하는 프로젝트 slug 배열 |',
        '| `tags` | string[] | ❌ | 태그 |',
        '| `positionX`, `positionY` | number | ❌ | 드래그 시 자동 저장 |',
        '| `description` | string | ❌ | 한 줄 요약 |',
        '',
        '## 워크플로',
        '',
        '1. "토폴로지" 탭에서 노드 드래그하면 position 자동 저장',
        '2. "+ 프로젝트" 버튼으로 새 md 생성 (기본 template)',
        '3. 프로젝트 문서 열면 상단에 의존 관계 편집 바 등장',
        '4. `⌘O` 제목 이동 · `⌘K` 본문 검색 · `⌘⇧P` 모든 명령',
        '5. 편집 저장 (`⌘S`) 시 토폴로지 매니페스트 자동 재스캔',
        '',
        '## 출력',
        '',
        '- 단일 문서 HTML 내보내기',
        '- 볼트 JSON 백업·복원',
        '- `/share?t=...` 임시 공개 링크',
        '',
        '샘플 프로젝트 `sample-hub`, `sample-leaf` 를 템플릿으로 참고하세요.',
        '',
      ].join('\n'),
      categories: `# Categories\n\n## platform\nname: 플랫폼\ntone: indigo\n\n## product\nname: 제품\ntone: amber\n`,
      statuses: `# Statuses\n\n## draft\nlabel: 초안\n\n## active\nlabel: 활성\n\n## launched\nlabel: 런칭됨\n\n## archived\nlabel: 보관\n`,
      'projects/sample-hub': `---\nname: Sample Hub\nslug: sample-hub\ncategory: platform\nstatus: active\nisHub: true\ntags: [sample]\n---\n\n# Sample Hub\n\n허브 프로젝트 예시. 편집해서 본인 것으로 교체하세요.\n\n토폴로지에서 큰 노드로 표시되고, 다른 프로젝트가 의존으로 가리킬 수 있습니다.\n`,
      'projects/sample-leaf': `---\nname: Sample Leaf\nslug: sample-leaf\ncategory: product\nstatus: draft\ndependencies: [sample-hub]\ntags: [sample]\n---\n\n# Sample Leaf\n\n\`sample-hub\` 에 의존하는 리프 프로젝트 예시. 토폴로지 뷰에서 sample-hub 와 엣지로 연결됩니다.\n`,
    };
    let created = 0;
    let skipped = 0;
    for (const [slug, content] of Object.entries(files)) {
      // 이미 있으면 스킵
      if (state.fileHandles.has(slug)) {
        skipped += 1;
        continue;
      }
      try {
        const resolved = await getParentAndName(slug, true);
        if (!resolved) continue;
        const fh = await resolved.parent.getFileHandle(resolved.fileName, {
          create: true,
        });
        const writable = await fh.createWritable();
        await writable.write(content);
        await writable.close();
        created += 1;
      } catch {
        skipped += 1;
      }
    }
    if (state.handle) await load(state.handle);
    return { created, skipped };
  }, [state.fileHandles, state.handle, getParentAndName, load]);

  /**
   * mission v2 ontology starter — `npx oh-my-ontology init` 과 동일한
   * 5 md + .mcp.json.example 시드를 vault 에 작성. 비개발자가 터미널 없이
   * web workbench 의 picker → "starter 만들기" 버튼만으로 시작 가능하게.
   *
   * 이미 존재하는 파일은 덮어쓰지 않고 skip. 사용자가 기존 vault 에 호출해도
   * 안전.
   */
  const scaffoldOntology = useCallback(async () => {
    if (!state.handle) {
      throw new Error('볼트가 열려있지 않습니다');
    }
    await ensureReadWrite(state.handle);
    let created = 0;
    let skipped = 0;
    for (const { relPath, content } of ONTOLOGY_STARTER_FILES) {
      // slug 는 .md 확장자 제거한 경로로. createDoc / saveDoc 의 규칙 따름.
      const slug = relPath.replace(/\.md$/, '');
      if (state.fileHandles.has(slug)) {
        skipped += 1;
        continue;
      }
      try {
        const resolved = await getParentAndName(slug, true);
        if (!resolved) continue;
        const fh = await resolved.parent.getFileHandle(resolved.fileName, {
          create: true,
        });
        const writable = await fh.createWritable();
        await writable.write(content);
        await writable.close();
        created += 1;
      } catch {
        skipped += 1;
      }
    }
    // .mcp.json.example — 사용자가 AI agent 설정으로 복사. vault 폴더의
    // 절대경로는 브라우저가 모르니 placeholder 로 두고 안내.
    try {
      const fh = await state.handle.getFileHandle('.mcp.json.example', {
        create: true,
      });
      const writable = await fh.createWritable();
      await writable.write(buildMcpConfigJson(state.handle.name));
      await writable.close();
      created += 1;
    } catch {
      skipped += 1;
    }
    if (state.handle) await load(state.handle);
    return { created, skipped };
  }, [state.fileHandles, state.handle, getParentAndName, load]);

  return {
    status: state.status,
    handle: state.handle,
    manifest: state.manifest,
    fileHandles: state.fileHandles,
    imageHandles: state.imageHandles,
    errorMessage: state.errorMessage,
    lastLoadedAt: state.lastLoadedAt,
    isSupported: isSupported(),
    open,
    close,
    refresh,
    requestPermission,
    saveDoc,
    createDoc,
    deleteDoc,
    renameDoc,
    scaffoldTopology,
    scaffoldOntology,
    updateFrontmatter,
  };
}
