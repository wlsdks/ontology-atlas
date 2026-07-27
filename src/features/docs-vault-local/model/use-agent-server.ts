'use client';

/**
 * 「이 자리에서 에이전트를 붙일 수 있는가」를 한 번 물어 두는 훅.
 *
 * 설치된 앱은 자기 번들 안의 MCP 서버 경로를 안다 — 그러면 원클릭이 성립한다.
 * 브라우저는 모른다. 이 훅은 그 사실 하나만 돌려주고, 화면은 그걸 보고
 * 갈린다. 렌더마다 네이티브를 다시 묻지 않는다 (앱 수명 동안 안 바뀐다).
 */
import { useEffect, useState } from 'react';

import {
  agentServerFromBundle,
  agentServerUnavailable,
  type AgentServerAvailability,
} from '@/shared/config';
import { readBundledMcpServer } from '@/shared/lib/tauri-agent-setup';

export function useAgentServer(): AgentServerAvailability {
  const [availability, setAvailability] = useState<AgentServerAvailability>(() =>
    agentServerUnavailable(null),
  );

  useEffect(() => {
    let cancelled = false;
    void readBundledMcpServer()
      .then((bundled) => {
        if (cancelled) return;
        setAvailability(
          bundled.available && bundled.path
            ? agentServerFromBundle(bundled.path)
            : agentServerUnavailable(bundled.reason),
        );
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setAvailability(
          agentServerUnavailable(error instanceof Error ? error.message : String(error)),
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return availability;
}
