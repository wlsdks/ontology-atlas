/**
 * 「지난 길」 **저장층** — 이 앱에서 지난 길을 읽고 쓰고 지우는 유일한 통로.
 *
 * 세션 궤적(`footprint-trail.ts`)은 메모리라 새로고침·탭 닫기에서 죽는데,
 * `?p=`(지금 여기)는 URL 로 살아남아서 "어디"는 남고 "어떻게 왔는지"만 사라지는
 * 비대칭이 있었다. 지난 길은 그 궤적을 잃지 않게 붙든다 — 살아있는 궤적을 끊는
 * 자동 동작(시간 만료·유휴 감지)은 하나도 없다.
 *
 * ## 왜 볼트 안 파일인가 — 웹과 설치 앱이 같은 것을 봐야 한다
 *
 * 브라우저 저장소(localStorage/IndexedDB)는 **출처(origin) 단위**라, 웹에서 쌓은
 * 지난 길과 설치 앱(Tauri — 다른 origin)에서 쌓은 지난 길이 **같은 볼트 폴더를
 * 열어도 서로 안 보인다**. 소유자 결정은 "웹/앱에서 동일하게 보여야지?" 이므로
 * 저장 위치는 **사용자 볼트 폴더 안**이다 — 그 폴더가 양쪽이 공유하는 유일한
 * 바닥이다.
 *
 * 팀에 새지 않는가: `.ontology-atlas/` 는 이미 이 제품이 쓰는 사이드카 폴더이고
 * (`agent-activity.json` 이 같은 곳에 산다) 저장소 `.gitignore` 가 이미 그 폴더를
 * 통째로 무시한다. 커밋되지 않으므로 push 되지 않는다. 볼트 인덱서도 `.` 로
 * 시작하는 디렉터리를 건너뛰므로 여기 쓰기가 매니페스트 재빌드를 부르지 않는다.
 *
 * ## 왜 인터페이스로 좁혔나
 *
 * 화면은 `PastTrailStore` 넷(`list`/`save`/`remove`/`clear`)만 안다. 파일을
 * 만지는 코드는 이 파일 안 `createVaultFilePastTrailStore` 하나에 갇혀 있고,
 * 형식(스키마·상한·중복 판정·직렬화)은 매체와 무관하게 `past-trail-record.ts`
 * 에 순수 함수로 있다. 저장 위치를 또 옮기게 되면 여기 medium 하나만 갈아끼운다.
 */

import {
  deserializePastTrails,
  serializePastTrails,
  upsertPastWalk,
  type PastWalk,
  type PastWalkEntry,
  type UpsertPastWalkOptions,
} from "./past-trail-record";

/** 볼트 안 사이드카 폴더 — `agent-activity.json` 과 같은 자리(이미 gitignore). */
export const PAST_TRAILS_VAULT_DIR = ".ontology-atlas";
export const PAST_TRAILS_VAULT_FILE = "past-trails.json";
export const PAST_TRAILS_RELATIVE_PATH = `${PAST_TRAILS_VAULT_DIR}/${PAST_TRAILS_VAULT_FILE}`;
/** 사이드카 폴더가 스스로를 git 에서 감추는 파일 — 이 저장소 `.gitignore` 의 의도와 같다. */
export const SIDECAR_IGNORE_FILE = ".gitignore";
export const SIDECAR_IGNORE_CONTENT = "# Ontology Atlas local runtime state — not for commit.\n*\n";

/**
 * 화면·훅이 아는 전부. 파일 IO 라 전부 비동기이고, 반환값은 **갱신된 목록**이라
 * 호출부가 다시 읽을 필요가 없다.
 */
export interface PastTrailStore {
  /** 보관된 길 — 최근이 앞. 읽기 실패는 빈 목록으로 환원된다. */
  list(): Promise<PastWalk[]>;
  /**
   * 지금 걷고 있는 길을 같은 id 로 덮어쓴다. 문턱 미달이면 아무 일도 하지 않는다.
   * 쓰기에 실패하면(권한 없음 등) 목록만 돌려주고 조용히 지나간다 — 보관은
   * 편의라 세션을 막아서는 안 된다.
   */
  save(
    walkId: string,
    entries: readonly PastWalkEntry[],
    options?: UpsertPastWalkOptions,
  ): Promise<PastWalk[]>;
  /** 길 하나를 지운다. */
  remove(walkId: string): Promise<PastWalk[]>;
  /** 전부 지운다 — 파일까지 없앤다. */
  clear(): Promise<PastWalk[]>;
}

/**
 * 갈아끼우는 지점. 텍스트 한 덩이를 읽고 쓰고 지우는 것 외에 아무 것도 모른다 —
 * 스키마도, 상한도, 중복 판정도 매체가 알 필요가 없다.
 */
export interface PastTrailMedium {
  read(): Promise<string | null>;
  write(text: string): Promise<void>;
  erase(): Promise<void>;
}

/** 매체 위에 형식 규칙을 얹어 store 를 만든다 — 모든 구현이 공유하는 몸통. */
export function createPastTrailStore(medium: PastTrailMedium): PastTrailStore {
  // 쓰기를 한 줄로 세운다 — 걸으면서 덮어쓰는 구조라 read-modify-write 가
  // 겹치면 마지막 걸음이 유실될 수 있다.
  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = <T,>(job: () => Promise<T>): Promise<T> => {
    const run = queue.then(job, job);
    queue = run.catch(() => undefined);
    return run;
  };

  const readWalks = async () => {
    try {
      return deserializePastTrails(await medium.read());
    } catch {
      return [];
    }
  };
  // 쓰기가 실패하면 **늘어난 척하지 않는다** — 화면에 보이는 목록과 디스크에
  // 남은 것이 어긋나면 그게 조용한 거짓말이다. 던지지도 않는다(보관은 편의라
  // 세션을 막아서는 안 된다).
  const commit = async (walks: PastWalk[], fallback: PastWalk[]) => {
    try {
      await medium.write(serializePastTrails(walks));
      return walks;
    } catch {
      return fallback;
    }
  };

  return {
    list: () => enqueue(readWalks),
    save: (walkId, entries, options) =>
      enqueue(async () => {
        const current = await readWalks();
        const next = upsertPastWalk(current, walkId, entries, options);
        // 내용이 그대로면 파일을 건드리지 않는다 — 걸음마다 호출되는 경로라
        // 무의미한 쓰기가 사용자 디스크에 쌓이면 안 된다.
        if (serializePastTrails(next) === serializePastTrails(current)) return current;
        return commit(next, current);
      }),
    remove: (walkId) =>
      enqueue(async () => {
        const current = await readWalks();
        return commit(
          current.filter((walk) => walk.id !== walkId),
          current,
        );
      }),
    clear: () =>
      enqueue(async () => {
        try {
          await medium.erase();
        } catch {
          /* ignore */
        }
        return [];
      }),
  };
}

/** 계약 테스트와 저장 불가 환경(볼트 미선택)의 조용한 대역. */
export function createMemoryPastTrailStore(seed: string | null = null): PastTrailStore {
  let text: string | null = seed;
  return createPastTrailStore({
    read: async () => text,
    write: async (next) => {
      text = next;
    },
    erase: async () => {
      text = null;
    },
  });
}

/**
 * **볼트 파일을 만지는 유일한 곳.** 저장 위치를 옮기게 되면 이 함수(정확히는
 * 여기서 만드는 medium)만 갈아끼운다.
 *
 * 쓰기 권한은 여기서 요청하지 않는다 — 탐색만 하러 온 사람에게 "기록을 남기려면
 * 권한을 주세요" 를 들이미는 건 마찰이다. 이미 readwrite 를 가진 세션에서만
 * 조용히 남기고, 없으면 남기지 않는다(호출부가 권한을 조회해 판단한다).
 */
export function createVaultFilePastTrailStore(
  handle: FileSystemDirectoryHandle,
): PastTrailStore {
  const dir = async (create: boolean) =>
    handle.getDirectoryHandle(PAST_TRAILS_VAULT_DIR, { create });
  // 사이드카 폴더가 스스로를 무시하게 한다 — 사용자의 볼트는 대개 별도 git
  // 저장소라, 이 파일이 `git status` 에 뜨면 실수로 커밋돼 탐색 궤적이 팀에
  // 노출될 수 있다. 이미 있으면 절대 덮어쓰지 않는다(사용자 의도가 우선).
  let ignoreEnsured = false;
  const ensureSelfIgnore = async (sidecar: FileSystemDirectoryHandle) => {
    if (ignoreEnsured) return;
    ignoreEnsured = true;
    try {
      await sidecar.getFileHandle(SIDECAR_IGNORE_FILE);
      return;
    } catch {
      /* 없으니 만든다 */
    }
    try {
      const fh = await sidecar.getFileHandle(SIDECAR_IGNORE_FILE, { create: true });
      const writable = await fh.createWritable();
      await writable.write(SIDECAR_IGNORE_CONTENT);
      await writable.close();
    } catch {
      /* 권한 없음 — 지난 길 쓰기도 어차피 막혀 있다 */
    }
  };
  return createPastTrailStore({
    read: async () => {
      try {
        const file = await (await dir(false)).getFileHandle(PAST_TRAILS_VAULT_FILE);
        return await (await file.getFile()).text();
      } catch {
        // 폴더도 파일도 아직 없는 게 정상 초기 상태다.
        return null;
      }
    },
    write: async (text) => {
      const sidecar = await dir(true);
      await ensureSelfIgnore(sidecar);
      const file = await sidecar.getFileHandle(PAST_TRAILS_VAULT_FILE, {
        create: true,
      });
      const writable = await file.createWritable();
      await writable.write(text);
      await writable.close();
    },
    erase: async () => {
      try {
        await (await dir(false)).removeEntry(PAST_TRAILS_VAULT_FILE);
      } catch {
        /* 이미 없음 */
      }
    },
  });
}
