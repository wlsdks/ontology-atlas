import type { AcpEvent } from '@/features/acp-session/model/use-acp-session';

/**
 * 이어진 도구 줄을 **한 덩어리로 묶는다.**
 *
 * ## 왜 (2026-08-16, 실물을 보고)
 *
 * 이 화면의 규율은 이미 적혀 있다 — 에이전트가 무슨 일을 하는지 보이는 것이
 * **기다림을 견디게 한다**. 그래서 도구 줄을 숨기지 않는다.
 *
 * 그런데 실물에서 한 번의 질문에 도구 줄이 다섯 개 쌓였고, 그것들이 정작
 * 읽어야 할 답과 **같은 무게로** 화면 위쪽을 차지했다. 기다리는 동안 도움이
 * 되던 것이 답이 온 뒤에는 답을 밀어내는 것이다.
 *
 * 가르는 기준은 시간이 아니라 **그 뒤에 무엇이 왔는가**다:
 *
 * - 아직 그 덩어리가 **마지막**이다 → 기다리는 중이다 → 펼쳐 둔다
 * - 뒤에 무엇이 왔다 → 답이 왔거나 다음 차례다 → **접는다**
 *
 * 하나뿐인 도구 줄은 접어도 줄지 않으므로 그냥 둔다.
 */

export type TranscriptItem =
  | { kind: 'event'; event: AcpEvent }
  | { kind: 'toolGroup'; id: string; events: Extract<AcpEvent, { kind: 'tool' }>[] };

/** 이 개수부터 접는다. 둘은 접어도 한 줄이라 얻는 것이 없다. */
const COLLAPSE_FROM = 2;

export function groupEvents(events: readonly AcpEvent[]): TranscriptItem[] {
  const out: TranscriptItem[] = [];
  let run: Extract<AcpEvent, { kind: 'tool' }>[] = [];

  const flush = (isLast: boolean) => {
    if (run.length === 0) return;
    // 마지막 덩어리는 「지금 하고 있는 일」이다 — 접지 않는다.
    if (run.length >= COLLAPSE_FROM && !isLast) {
      out.push({ kind: 'toolGroup', id: run[0].id, events: run });
    } else {
      for (const event of run) out.push({ kind: 'event', event });
    }
    run = [];
  };

  for (const event of events) {
    if (event.kind === 'tool') {
      run.push(event);
      continue;
    }
    flush(false);
    out.push({ kind: 'event', event });
  }
  flush(true);
  return out;
}
