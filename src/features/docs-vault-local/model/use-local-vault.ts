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

/**
 * R13 #69 — background fs polling interval (ms). 탭 visible 인 동안
 * 이 간격으로 fingerprint 비교 → 변경 있으면 reload. 사용자가 IDE / AI agent
 * 통해 vault 만지면 웹 탭 *focus 안 해도* 자동 반영.
 *
 * 5s 가 sweet spot — 사람의 인지 갱신 속도 (~"몇 초 안에 반영") 와 큰 vault
 * fingerprint 비용 (~수십 ms) 의 균형. 변경 없으면 fingerprint 만 비교하므로
 * 거의 무료. 변경 있을 때만 full rebuild.
 */
const AUTO_REFRESH_INTERVAL_MS = 5000;

/**
 * R11 #15 — vault 의 .md 가 외부 (다른 에디터 / AI MCP) 에 의해 변경된 채
 * 사용자가 GUI 에서 save 하려 할 때 silent overwrite 차단. mcp 측의
 * VaultConflictError 와 같은 의미.
 */
export class VaultConflictError extends Error {
  readonly slug: string;
  readonly expectedMtime: number;
  readonly currentMtime: number;
  constructor(slug: string, expectedMtime: number, currentMtime: number) {
    super(
      `Vault conflict — "${slug}" was modified externally between read and write.`,
    );
    this.name = 'VaultConflictError';
    this.slug = slug;
    this.expectedMtime = expectedMtime;
    this.currentMtime = currentMtime;
  }
}

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
 * @internal — 직접 호출 금지. `useLocalVault()` (LocalVaultProvider 의
 * consumer) 를 통해서만 접근. 본 훅은 LocalVaultProvider 가 1 회 mount
 * 해 단일 인스턴스 (state / IDB rehydrate / fingerprint rescan / FS read)
 * 만 유지하기 위한 internal API.
 *
 * 이전 (Round 7 발견): 8 곳에서 직접 useLocalVault() 호출 → 한 페이지
 * mount 에 2-3 인스턴스 → 같은 IDB 키 N 번 rehydrate + N 번
 * buildLocalManifest (전체 FS walk). Round 8 에서 provider 패턴으로
 * 단일 진실원 화.
 *
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
export function useLocalVaultInternal() {
  // SSR 일치성: lazy initializer 가 isSupported() 를 호출하면 SSR (window
  // 없음 → 'unsupported') 와 client 첫 hydration (window 있음 → 'idle')
  // 사이에 mismatch. 항상 'idle' 로 시작하고 mount 후 useEffect 가
  // FSA 미지원 시 'unsupported' 로 전환 — 첫 paint 1 frame 동안 잠깐
  // supported 로 보이지만 hydration 에러는 사라짐.
  const [state, setState] = useState<State>(() => emptyState('idle'));

  /** 마지막 성공 빌드의 fingerprint — auto-refresh 시 변경 없으면 skip 의 비교 기준. */
  const lastFingerprintRef = useRef<string | null>(null);

  /**
   * Round 9 cut — 쓰기 전에 readwrite permission 확보. 거부 시 state 를
   * 'permission-needed' 로 업데이트해 LocalVaultPicker 의 reauth UI 가
   * 즉시 노출되게 한다. 이전엔 saveDoc 가 throw 만 하고 state 는 'loaded'
   * 로 남아 사용자가 picker 로 가도 권한 문제임을 모름. 호출 후 throw 는
   * 그대로 — 상위 try/catch (editor 등) 가 inline error 표시 책임 유지.
   */
  const requireWritePermission = useCallback(
    async (handle: FileSystemDirectoryHandle | FileSystemFileHandle) => {
      const result = await verifyHandlePermission(handle, 'readwrite', { ask: true });
      if (result !== 'granted') {
        setState((s) => ({ ...s, status: 'permission-needed' }));
        throw new Error('Write permission denied');
      }
    },
    [],
  );

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
      // err.message 가 없을 땐 null 로 두고 LocalVaultPicker 의
      // \`t('errorFallback')\` 가 locale-aware 메시지를 채우게 — 이전엔 한국어
      // 하드코딩 fallback "매니페스트 빌드 실패" 가 en locale 사용자에게도
      // 노출되는 회귀가 있었다.
      setState({
        status: 'error',
        handle,
        manifest: null,
        fileHandles: new Map(),
        imageHandles: new Map(),
        errorMessage: err instanceof Error ? err.message : null,
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
      // 같은 이유로 ko 하드코딩 "폴더를 열지 못했습니다" 제거 — null 이면
      // LocalVaultPicker 가 t('errorFallback') 으로 fallback.
      setState((s) => ({
        ...s,
        status: 'error',
        errorMessage: err instanceof Error ? err.message : null,
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

    // R13 #69 — interval-based polling while visible. focus/visibility
    // 만으로는 사용자가 다른 탭 / IDE 보고 있을 때 안 갱신됨. 5s 간격으로
    // fingerprint 비교 — 변경 없으면 거의 무료, 변경 있으면 자동 reload.
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    const startPolling = () => {
      if (pollTimer) return;
      pollTimer = setInterval(() => {
        // 직접 tryReload 호출 (fire 의 debounce 로직은 burst 용. polling 은
        // 이미 5s 간격이라 debounce 무관).
        void tryReload();
      }, AUTO_REFRESH_INTERVAL_MS);
    };
    const stopPolling = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };
    if (document.visibilityState === 'visible') startPolling();
    const onVisibilityForPoll = () => {
      if (document.visibilityState === 'visible') startPolling();
      else stopPolling();
    };
    document.addEventListener('visibilitychange', onVisibilityForPoll);

    return () => {
      window.removeEventListener('focus', fire);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('visibilitychange', onVisibilityForPoll);
      stopPolling();
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
      await requireWritePermission(state.handle);
      const parts = slug.split('/').filter(Boolean);
      if (parts.length === 0) throw new Error('Empty slug');
      const fileName = `${parts[parts.length - 1]}.md`;
      let parent: FileSystemDirectoryHandle = state.handle;
      for (let i = 0; i < parts.length - 1; i += 1) {
        parent = await parent.getDirectoryHandle(parts[i], {
          create: createIntermediate,
        });
      }
      return { parent, fileName };
    },
    [state.handle, requireWritePermission],
  );

  /**
   * 특정 slug 의 md 파일 내용을 새로 쓴다. readwrite 권한이 없으면 먼저
   * 승인 요청. 성공 시 manifest 를 재스캔해 최신 상태로.
   *
   * R11 #15 — options.expectedMtime 옵션 (manifest doc.mtime). 지정 시 write
   * 직전 fs file.lastModified 와 비교해 외부 변경 감지 → VaultConflictError
   * throw. 미지정 시 검증 skip (기존 호출자 호환).
   */
  const saveDoc = useCallback(
    async (
      slug: string,
      content: string,
      options: { expectedMtime?: number } = {},
    ) => {
      const fh = state.fileHandles.get(slug);
      if (!fh) throw new Error(`Local vault: no file handle for "${slug}"`);
      await requireWritePermission(fh);
      if (typeof options.expectedMtime === 'number') {
        const file = await fh.getFile();
        if (file.lastModified !== options.expectedMtime) {
          throw new VaultConflictError(
            slug,
            options.expectedMtime,
            file.lastModified,
          );
        }
      }
      const writable = await fh.createWritable();
      await writable.write(content);
      await writable.close();
      // 저장 성공 뒤 전체 매니페스트 재스캔 — backlinks/headings 등 반영.
      if (state.handle) await load(state.handle);
    },
    [state.fileHandles, state.handle, load, requireWritePermission],
  );

  /**
   * 새 .md 파일을 slug 경로에 생성. 같은 slug 가 이미 있으면 에러.
   * 중간 디렉터리는 자동 생성. 템플릿 content 를 써서 초기 본문 채움.
   */
  const createDoc = useCallback(
    async (slug: string, content: string) => {
      if (state.fileHandles.has(slug)) {
        throw new Error(`Document already exists: "${slug}"`);
      }
      const resolved = await getParentAndName(slug, true);
      if (!resolved) throw new Error('Vault is not open');
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
      if (!resolved) throw new Error('Vault is not open');
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
      if (!fh) throw new Error(`Local vault: no file handle for "${slug}"`);
      await requireWritePermission(fh);
      const file = await fh.getFile();
      const raw = await file.text();
      const next = applyFrontmatterUpdates(raw, updates);
      if (next === raw) return; // 변경 없음
      const writable = await fh.createWritable();
      await writable.write(next);
      await writable.close();
      if (!opts.skipRefresh && state.handle) await load(state.handle);
    },
    [state.fileHandles, state.handle, load, requireWritePermission],
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
        throw new Error(`Document already exists: "${newSlug}"`);
      }
      const oldFh = state.fileHandles.get(oldSlug);
      if (!oldFh) throw new Error(`Local vault: no file handle for "${oldSlug}"`);
      const file = await oldFh.getFile();
      const content = await file.text();
      const newResolved = await getParentAndName(newSlug, true);
      if (!newResolved) throw new Error('Vault is not open');
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

  // 최초 1회 — IDB 에서 핸들 복원 시도. 동시에 FSA 미지원 브라우저면
  // 'unsupported' state 로 전환 (initial 'idle' 에서 — SSR 일치 fix).
  useEffect(() => {
    if (!isSupported()) {
      setState((s) => ({ ...s, status: 'unsupported' }));
      return;
    }
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
        '# My vault',
        '',
        'This folder is a Docs Vault + Folder-Topology vault.',
        '',
        '## Structure',
        '',
        '- `projects/*.md` — each file is one project (topology node).',
        '- `categories.md` — category definitions (tone: indigo / amber / neutral).',
        '- `statuses.md` — status lifecycle.',
        '- `docs/**` — general wiki docs (optional).',
        '',
        '## Project frontmatter fields',
        '',
        '| Field | Type | Required | Notes |',
        '| --- | --- | --- | --- |',
        '| `name` | string | ✅ | Display name shown to the user. |',
        '| `slug` | string | ❌ | Derived from the file name when omitted. |',
        '| `category` | string | ✅ | A slug from `categories.md`. |',
        '| `status` | string | ❌ | A slug from `statuses.md`. Defaults to `active`. |',
        '| `isHub` | boolean | ❌ | Whether this is a hub project. |',
        '| `dependencies` | string[] | ❌ | Slugs of upstream projects this depends on. |',
        '| `tags` | string[] | ❌ | Tags. |',
        '| `positionX`, `positionY` | number | ❌ | Saved automatically when you drag in the topology. |',
        '| `description` | string | ❌ | One-line summary. |',
        '',
        '## Workflow',
        '',
        '1. Drag a node in the topology — position is saved automatically.',
        '2. "+ Project" button creates a new .md from the default template.',
        '3. Open a project document and the dependency editor bar appears at the top.',
        '4. `⌘K` opens the body search. The full command palette is `⌘⇧P`.',
        '5. The topology manifest re-scans automatically when you save (`⌘S`).',
        '',
        '## Export',
        '',
        '- Download a single document as HTML.',
        '- Back up / restore the whole vault as JSON.',
        '',
        'Use the sample projects `sample-hub` and `sample-leaf` as starter templates.',
        '',
      ].join('\n'),
      categories: `# Categories\n\n## platform\nname: Platform\ntone: indigo\n\n## product\nname: Product\ntone: amber\n`,
      statuses: `# Statuses\n\n## draft\nlabel: Draft\n\n## active\nlabel: Active\n\n## launched\nlabel: Launched\n\n## archived\nlabel: Archived\n`,
      'projects/sample-hub': `---\nname: Sample Hub\nslug: sample-hub\ncategory: platform\nstatus: active\nisHub: true\ntags: [sample]\n---\n\n# Sample Hub\n\nA sample hub project — edit it or replace it with your own.\n\nIn the topology this renders as a larger node and other projects can list it as a dependency.\n`,
      'projects/sample-leaf': `---\nname: Sample Leaf\nslug: sample-leaf\ncategory: product\nstatus: draft\ndependencies: [sample-hub]\ntags: [sample]\n---\n\n# Sample Leaf\n\nA sample leaf project that depends on \`sample-hub\`. The topology view connects them with an edge.\n`,
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
      throw new Error('Vault is not open');
    }
    await requireWritePermission(state.handle);
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
    //
    // overwrite guard: 사용자가 .mcp.json.example 을 customize 했을 수도
    // 있으니 기존 파일이 있으면 skip. 처음 scaffold 일 때만 생성.
    try {
      let alreadyExists = false;
      try {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- existence probe
        const _existing = await state.handle.getFileHandle('.mcp.json.example');
        alreadyExists = true;
      } catch {
        // NotFoundError — 파일 없음, 정상.
      }
      if (alreadyExists) {
        skipped += 1;
      } else {
        const fh = await state.handle.getFileHandle('.mcp.json.example', {
          create: true,
        });
        const writable = await fh.createWritable();
        await writable.write(buildMcpConfigJson(state.handle.name));
        await writable.close();
        created += 1;
      }
    } catch {
      skipped += 1;
    }
    if (state.handle) await load(state.handle);
    return { created, skipped };
  }, [
    state.fileHandles,
    state.handle,
    getParentAndName,
    load,
    requireWritePermission,
  ]);

  return {
    status: state.status,
    handle: state.handle,
    manifest: state.manifest,
    fileHandles: state.fileHandles,
    imageHandles: state.imageHandles,
    errorMessage: state.errorMessage,
    lastLoadedAt: state.lastLoadedAt,
    // state-derived — SSR 일치 (lazy initializer 의 isSupported() 호출
    // 회피). 'unsupported' 로 전환되는 시점은 mount 후 useEffect.
    isSupported: state.status !== 'unsupported',
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
