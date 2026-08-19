/**
 * 어댑터가 뱉은 것을 **사람이 읽는 한 문장**으로 옮긴다.
 *
 * ## 왜 (2026-08-16 소유자 화면)
 *
 * 대화창이 사용자에게 이걸 그대로 보여 줬다:
 *
 * ```
 * 문제가 생겼어요: {"code":-32603,"message":"Internal error: Failed to
 * authenticate: OAuth session expired and could not be refreshed",
 * "data":{"errorKind":"authentication_failed"}}
 * ```
 *
 * 소유자: *"이렇게 보여주면 사용자가 어떻게 알겠어."* 맞다 — 이 줄에는 **무슨
 * 일이 났는지**도 **뭘 해야 하는지**도 사람의 말로는 없다. 있는 것은 우리가
 * 디버깅할 때 쓰는 재료뿐이다.
 *
 * ## 무엇을 알아보고, 무엇을 모른다고 하나
 *
 * 아는 모양만 옮긴다. 못 알아본 것은 **지어내지 않고** 「알 수 없는 문제」로
 * 두고 원문을 접어 둔다 — 그럴듯한 오역이 원문보다 나쁘다(원문은 적어도
 * 검색이라도 된다).
 *
 * 각 갈래는 **다음에 할 일**을 갖는다. 할 일이 없는 오류 화면은 막다른 길이고,
 * 이 저장소는 그걸 결함으로 센다.
 */

export type AcpTroubleKind = 'auth' | 'install' | 'timeout' | 'launch' | 'network' | 'unknown';

export interface AcpTrouble {
  kind: AcpTroubleKind;
  /** 원문. 접어 두었다가 「자세히」에서만 보여 준다. */
  detail: string;
}

/**
 * 로그인이 풀렸다 — 이 도구의 가장 흔한 실패다. 어댑터마다 문장이 달라서
 * 여러 모양을 본다(실측: claude 는 `authentication_failed`, 어떤 도구는
 * `Authentication required`).
 */
const AUTH = /authentication[_ ]?(failed|required)|oauth|not logged ?in|unauthorized|401/i;
/**
 * 첫 내려받기가 끊겨 반쯤 남은 npx 캐시에 걸렸다 (2026-08-19 소유자 실기계).
 * 실측 stderr 그대로의 모양을 본다:
 *
 * ```
 * npm error code ENOENT
 * npm error path /Users/…/.npm/_npx/8757e2301903ae53/package.json
 * npm error enoent Could not read package.json …
 * ```
 *
 * `_npx/<16자리 hex>` 경로, 또는 「package.json 을 못 읽었다」는 npm 문장 —
 * 둘 다 이 고장에서만 나온다. 앱이 다음 시작에서 그 항목을 지우고 다시 받으므로
 * (`src-tauri/src/acp.rs` npx 캐시 자기 치유), 할 일은 「새 대화」다.
 */
const INSTALL = /_npx[\\/][0-9a-f]{4,16}|could not read package\.json/i;
/** 우리가 건 상한에 걸렸다. */
const TIMEOUT = /acp-timeout|timed? ?out|ETIMEDOUT/i;
/** 띄우지도 못했다 — 설치·경로 문제다. */
const LAUNCH = /ENOENT|command not found|spawn|cli-missing|node-missing|npx-missing|binary-missing/i;
/** 밖으로 못 나갔다. */
const NETWORK = /ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|network|fetch failed|offline/i;

/**
 * @param diagnostics 어댑터가 stderr 에 남긴 줄들. **install 판정에만** 참여한다 —
 * 이 고장에서는 오류 문자열이 `acp session closed` 처럼 아무것도 말하지 않고
 * 단서가 전부 stderr 에 있었다(실측). 다른 갈래까지 stderr 로 판정하면 지나가는
 * 낱말(「network」 등)에 오분류가 생기므로 넓히지 않는다.
 */
export function readAcpTrouble(raw: string, diagnostics: readonly string[] = []): AcpTrouble {
  const detail = raw.trim();
  const stderrClues = diagnostics.join('\n');
  // 순서가 계약이다: 더 **구체적인** 것이 먼저다. 인증 실패 메시지에 「network」
  // 같은 낱말이 섞여 와도 인증 문제로 읽어야 사용자가 할 일이 맞는다.
  // install 은 launch 보다 앞이어야 한다 — 같은 ENOENT 라도 「반쯤 남은 캐시」는
  // 「도구가 없다」와 사용자가 할 일이 다르다.
  const kind: AcpTroubleKind = AUTH.test(detail)
    ? 'auth'
    : INSTALL.test(detail) || INSTALL.test(stderrClues)
      ? 'install'
      : TIMEOUT.test(detail)
        ? 'timeout'
        : LAUNCH.test(detail)
          ? 'launch'
          : NETWORK.test(detail)
            ? 'network'
            : 'unknown';
  return { kind, detail };
}

/**
 * 진단으로 실을 만한 줄인가 — **아니면 소음이다.**
 *
 * stderr 를 화면에 올리자마자 사용자가 처음 본 것이 이거였다(2026-08-16):
 *
 * ```
 * npm warn Unknown env config "_jsr-registry". This will stop working in the
 * next major version of npm. See `npm help npmrc` for supported config options.
 * ```
 *
 * 어댑터를 `npx` 로 띄우므로 이런 줄은 **매번** 나오고, 아무 일도 안 났을 때도
 * 나온다. 그래서 대화창 맨 위에 늘 영어 경고 두 문단이 앉아 있었다 — 진단이
 * 아니라 그냥 화면을 먹는 것이다.
 *
 * 규율 둘로 정리한다: ① 뻔한 소음은 아예 안 담는다 ② 담은 것도 **문제가
 * 생겼을 때만** 보여 준다(그때는 그 줄들이 유일한 단서다).
 */
const STDERR_NOISE = [
  /^npm (warn|notice)\b/i,
  /^npx:/i,
  /^\s*$/,
  // 설치 진행률 — 점·퍼센트·스피너만 있는 줄.
  /^[\s.%|/\\\-()0-9]*$/,
];

export function isDiagnosticStderr(line: string): boolean {
  const text = line.trim();
  if (!text) return false;
  return !STDERR_NOISE.some((pattern) => pattern.test(text));
}
