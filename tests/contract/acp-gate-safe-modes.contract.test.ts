import { describe, expect, it } from 'vitest';

import {
  keepGateSafeModes,
  readSessionChoices,
  type AcpChoice,
} from '@/features/acp-session/model/acp-client';

/**
 * **관문을 없애는 모드는 화면에 안 내놓는다.**
 *
 * ## 왜 이 게이트가 있나
 *
 * 이 앱은 실행기 목록에서 「폴더 밖 파일을 건드릴 때 Atlas 가 대신 물어봐
 * 준다」고 **글자로 약속한다.** 그 약속을 지키는 장치는 하나뿐이다 —
 * `session/request_permission` 이 우리에게 오는 것.
 *
 * 그런데 어댑터가 내놓는 모드 목록에는 그 요청 자체를 안 보내게 만드는 것들이
 * 섞여 있다(실측 2026-08-16):
 *
 * - claude: `bypassPermissions` — *"Bypass all permission checks"*
 * - claude: `acceptEdits` — *"Auto-accept file edit operations"*
 * - codex: `agent-full-access`
 *
 * 그걸 드롭다운에 그냥 담으면 **사용자가 한 번 고르는 것으로 우리 약속이
 * 무효가 된다.** 그러면 그건 약속이 아니라 기본값이다.
 *
 * ⚠️ 「엄격한 모드」를 막는 것이 아니다. `dontAsk` 는 미리 허용 안 된 것을
 * **거절**하므로 안전한 쪽으로 실패한다 — 그건 통과시킨다. 가르는 기준은
 * **「묻지 않고 통과시키는가」** 하나다.
 */

function choice(id: string, name = id): AcpChoice {
  return { id, name, description: null };
}

describe('작업 방식 목록 — 관문을 없애는 것은 안 내놓는다', () => {
  it('실측에서 실제로 온 claude 모드 목록을 그대로 넣어 본다', () => {
    const measured = [
      choice('auto', 'Auto'),
      choice('default', 'Manual'),
      choice('acceptEdits', 'Accept Edits'),
      choice('plan', 'Plan Mode'),
      choice('dontAsk', "Don't Ask"),
      choice('bypassPermissions', 'Bypass Permissions'),
    ];
    const kept = keepGateSafeModes(measured).map((m) => m.id);

    expect(kept).not.toContain('bypassPermissions');
    expect(kept).not.toContain('acceptEdits');
    // 안전한 쪽으로 실패하는 것과 유용한 것은 남는다.
    expect(kept).toEqual(['auto', 'default', 'plan', 'dontAsk']);
  });

  it('실측에서 실제로 온 codex 모드 목록을 그대로 넣어 본다', () => {
    const kept = keepGateSafeModes([
      choice('read-only', 'Read Only'),
      choice('agent', 'Agent'),
      choice('agent-full-access', 'Agent (full access)'),
    ]).map((m) => m.id);
    /*
     * ⚠️ 종전 기댓값은 `['read-only', 'agent']` 였다 — **이 파일이 구멍을
     * 못박고 있었다**(2026-08-16 검수). `agent` 는 이름만 「보통 모드」이고,
     * 이 저장소가 직접 잰 결과가 `src-tauri/src/acp.rs` 에 적혀 있다:
     * codex 를 그 기본 모드로 띄웠더니 *"작업 폴더 밖에 파일을 쓰면서 권한
     * 요청이 0회"* 였다. 위 기준(「묻지 않고 통과시키는가」) 그대로 걸린다.
     *
     * 그래서 codex 에게 남는 것은 `read-only` 하나다. 그 모드에서도 우리가
     * 꽂아 준 볼트 도구는 그대로 돌아서, 지도를 채우는 일은 막히지 않는다.
     */
    expect(kept).toEqual(['read-only']);
  });

  it('세션 응답을 읽는 경로가 **반드시** 이 필터를 지난다', () => {
    /*
     * 필터 함수만 검사하면 소비처가 그것을 안 부르는 날 조용히 뚫린다.
     * 그래서 실제 응답 모양을 넣고 나온 결과를 본다.
     */
    const choices = readSessionChoices({
      modes: {
        currentModeId: 'auto',
        availableModes: [
          { id: 'auto', name: 'Auto' },
          { id: 'bypassPermissions', name: 'Bypass Permissions' },
        ],
      },
      models: {
        currentModelId: 'gpt-5.6-sol[xhigh]',
        availableModels: [{ modelId: 'gpt-5.6-sol[xhigh]', name: 'GPT-5.6-Sol (xhigh)' }],
      },
    });

    expect(choices.modes.map((m) => m.id)).toEqual(['auto']);
    // 모델은 안전과 무관하므로 그대로 온다 — 필터가 과하게 걸리고 있지 않다.
    expect(choices.models.map((m) => m.id)).toEqual(['gpt-5.6-sol[xhigh]']);
    expect(choices.currentModelId).toBe('gpt-5.6-sol[xhigh]');
  });

  it('안 내놓는 어댑터는 빈 목록이다 — 없는 것을 있는 척하지 않는다', () => {
    // claude 는 모델을 아예 안 내놓는다(실측: `session/set_model` 이 없는 메서드).
    const choices = readSessionChoices({ modes: { currentModeId: 'default', availableModes: [] } });
    expect(choices.models).toEqual([]);
    expect(choices.currentModelId).toBeNull();
  });

  it('모양이 깨진 줄은 버린다', () => {
    const choices = readSessionChoices({
      models: { availableModels: [{ name: '이름만 있고 id 가 없다' }, 'not-an-object', null] },
    });
    expect(choices.models).toEqual([]);
  });
});
