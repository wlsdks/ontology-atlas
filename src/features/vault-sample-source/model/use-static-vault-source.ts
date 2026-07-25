'use client';

import {
  resolveStaticVaultSource,
  type StaticVaultSource,
} from '@/entities/docs-vault';
import { useSampleSource } from './use-sample-source';

/**
 * static 모드에서 **지금 봐야 할 번들 볼트**(매니페스트 + 본문 한 벌).
 *
 * 화면 코드가 `vaultManifest` / `vaultContent` 를 직접 import 하면 사용자의
 * "예시 비즈니스 보기" 선택을 조용히 무시하게 된다 — 2026-07-26 실측에서
 * 9개 표면이 그랬다(프로젝트 목록·상세 본문·문서함·검색 팔레트·문서 드로어
 * 등). 그래서 진입점을 이 훅 하나로 모은다. 자세한 배경은
 * `entities/docs-vault/lib/static-vault-source.ts`.
 *
 * local 모드에서는 호출부가 이 값을 버리면 된다 — 사용자 vault 가 우선이라
 * 여기서 분기하지 않는다(모드 판단은 각 호출부의 책임이고, 이 훅은 "static
 * 이면 어느 볼트인가" 라는 한 질문에만 답한다).
 */
export function useStaticVaultSource(): StaticVaultSource {
  const [sampleSource] = useSampleSource();
  return resolveStaticVaultSource(sampleSource);
}
