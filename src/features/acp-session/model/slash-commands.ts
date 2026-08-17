/**
 * `/` 로 부르는 **명령 목록** — 에이전트가 세션 중에 알려 준다.
 *
 * ## 왜 (2026-08-17 소유자 문의)
 *
 * *"여기서 `/` 입력하면 뭔가 좀 아틀라스 전용 스킬같은거 있으면 좋을것같은데"*.
 *
 * 된다. 어댑터가 이미 보내고 있었고 **우리가 안 받고 있었다** — 세션 중
 * `available_commands_update` 로 목록이 온다(어댑터 소스
 * `sendAvailableCommandsUpdate`). 지금까지 그 줄은 조용히 버려졌다.
 *
 * ## 「아틀라스 전용」은 어디서 오나
 *
 * 이 목록은 **에이전트가 그 폴더에서 찾은 것**이다. 볼트 폴더가 곧 작업 폴더라,
 * 볼트 안에 스킬을 두면 그대로 여기 뜬다. 즉 전용 스킬을 만드는 길은 이미
 * 열려 있고, 이 파일은 그것을 **화면에 보이게** 하는 쪽이다.
 *
 * 우리가 목록을 지어내지 않는다는 규율은 그대로다: 온 것만 그린다. 아무것도
 * 안 오면 `/` 를 쳐도 아무 일도 안 일어난다 — 없는 기능을 있는 척하지 않는다.
 */

export interface AcpSlashCommand {
  /** `/` 뒤에 치는 이름. */
  name: string;
  /** 한 줄 설명 — 어댑터가 준 그대로. 없으면 빈 문자열. */
  description: string;
}

const cleanString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

/**
 * `available_commands_update` 한 줄에서 명령 목록을 읽는다.
 *
 * 모양이 깨진 항목은 **조용히 버린다** — 이름이 없으면 칠 수가 없고, 목록
 * 하나가 이상하다고 나머지를 통째로 버리면 그게 더 나쁘다.
 */
export function readSlashCommands(update: unknown): AcpSlashCommand[] {
  const raw = (update as { availableCommands?: unknown } | null)?.availableCommands;
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: AcpSlashCommand[] = [];
  for (const item of raw) {
    const name = cleanString((item as { name?: unknown } | null)?.name);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push({
      name,
      description: cleanString((item as { description?: unknown } | null)?.description),
    });
  }
  return out;
}

/**
 * 지금 작성 칸에 친 것이 **명령을 고르는 중**인가, 그렇다면 무엇으로 거르나.
 *
 * 첫 글자가 `/` 이고 아직 공백이 없을 때만이다 — `/skill 인자` 처럼 이미 인자를
 * 치기 시작했으면 고르는 단계가 지났다.
 */
export function slashQuery(draft: string): string | null {
  if (!draft.startsWith('/')) return null;
  const rest = draft.slice(1);
  if (/\s/u.test(rest)) return null;
  return rest;
}

/** 이 질의에 맞는 명령들. 질의가 비면 전부. */
export function matchSlashCommands(
  commands: readonly AcpSlashCommand[],
  query: string,
): AcpSlashCommand[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...commands];
  return commands.filter((command) => command.name.toLowerCase().includes(needle));
}
