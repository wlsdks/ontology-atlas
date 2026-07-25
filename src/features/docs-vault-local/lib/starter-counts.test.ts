import { describe, expect, it } from 'vitest';

import { ONTOLOGY_STARTER_FILES } from './ontology-starter';
import { STARTER_CONCEPT_COUNT } from './starter-counts';

describe('스타터 개수 의미 (#70)', () => {
  // 온보딩 문구가 "마크다운 시드 5개" 라고 약속한다. 파일 목록이 늘거나 줄면
  // 그 문구도 함께 고쳐야 하므로 여기서 잠근다.
  it('스타터 개념 수는 마크다운 파일 수와 같다', () => {
    expect(STARTER_CONCEPT_COUNT).toBe(ONTOLOGY_STARTER_FILES.length);
    expect(STARTER_CONCEPT_COUNT).toBe(5);
  });

  it('스타터 마크다운은 모두 .md 이고 에이전트 설정 파일을 포함하지 않는다', () => {
    for (const file of ONTOLOGY_STARTER_FILES) {
      expect(file.relPath).toMatch(/\.md$/);
    }
    // `.mcp.json` / `.codex/config.toml` 은 개념이 아니라 설정이다 — 개념 수에
    // 섞이면 "개념 8개" 라는 거짓말이 된다.
    expect(ONTOLOGY_STARTER_FILES.some((f) => f.relPath.includes('.mcp.json'))).toBe(false);
    expect(ONTOLOGY_STARTER_FILES.some((f) => f.relPath.includes('config.toml'))).toBe(false);
  });
});
