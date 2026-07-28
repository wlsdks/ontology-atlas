'use client';

import { useEffect, useState } from 'react';

import { analyzeAgentFiles, WEB_SCAN_ANALYZE_OPTIONS } from './agent-files';
import { readDesktopSkillTrees } from './read-desktop-skill-trees';
import { buildSkillParityModel, type SkillParityModel } from './skill-parity';

/**
 * 스킬 사본 일치 판정 — **데스크톱 앱에서 볼트 루트를 알 때만.**
 *
 * `null` 은 "이 자리에 아무것도 그리지 않는다" 이고, `rows` 가 빈 모델은
 * "스킬 트리가 없는 볼트" 다. 둘은 다른 사실이라 같은 값으로 뭉개지 않는다 —
 * 전자는 능력이 없는 것이고 후자는 볼 것이 없는 것이다.
 *
 * 웹에는 이 훅이 켜지지 않는다. FSA 핸들에 절대 경로가 없어 `.claude/` 를 볼
 * 방법이 원리적으로 없고, 그래서 웹 동등물을 짓지 않는다(`surfaces.md`).
 */
export function useSkillParity(vaultRootPath: string | null): SkillParityModel | null {
  const [model, setModel] = useState<SkillParityModel | null>(null);

  useEffect(() => {
    if (!vaultRootPath) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const files = await readDesktopSkillTrees(vaultRootPath);
        if (cancelled) return;
        if (files.length === 0) {
          setModel({ rows: [], disagreeing: 0 });
          return;
        }
        const analysis = analyzeAgentFiles({
          files,
          existingPaths: files.map((f) => f.path),
          unverifiablePrefixes: [...WEB_SCAN_ANALYZE_OPTIONS.unverifiablePrefixes],
          verifiableExtensions: [...WEB_SCAN_ANALYZE_OPTIONS.verifiableExtensions],
        });
        setModel(buildSkillParityModel(analysis));
      } catch {
        // 읽기 실패는 **판정 아님**으로 강등한다. 못 읽은 것을 "일치" 라고
        // 말하면 화면이 확인하지 않은 것을 확인했다고 주장하게 된다.
        if (!cancelled) setModel(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vaultRootPath]);

  return vaultRootPath ? model : null;
}
