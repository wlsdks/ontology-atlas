/**
 * "그냥 시작하기" (데스크톱 first-run, Tauri 런타임 한정) 전용 순수 함수 —
 * `~/Documents/Ontology Atlas/<name>` 아래 vault 폴더 이름을 고르고, 사용자에게
 * 보여줄 경로 문자열을 조립한다. 실제 파일시스템 접근(존재 여부 조회, 생성)은
 * `@/shared/lib/tauri-vault-fs` 가 맡고, 이 모듈은 그 결과(기존 이름 목록)를
 * 받아 충돌 없는 이름을 순수하게 계산한다 — FS mock 없이 vitest 로 바로 검증.
 */

export const DEFAULT_VAULT_BASE_NAME = 'my-ontology';
export const DEFAULT_VAULT_PARENT_LABEL = '~/Documents/Ontology Atlas';

/**
 * `existingNames` 안에 `baseName` 이 없으면 그대로, 있으면 `-2`, `-3`, ... 로
 * 충돌하지 않는 다음 이름을 반환한다. "만들 때마다 새 vault" 계약 — 기존
 * vault 를 덮어쓰지 않는다.
 */
export function resolveUniqueVaultDirName(
  existingNames: readonly string[],
  baseName: string = DEFAULT_VAULT_BASE_NAME,
): string {
  if (!existingNames.includes(baseName)) return baseName;
  let suffix = 2;
  while (existingNames.includes(`${baseName}-${suffix}`)) {
    suffix += 1;
  }
  return `${baseName}-${suffix}`;
}

/** 성공 토스트 등에 보여줄 사람이 읽을 수 있는 경로 문자열. */
export function buildDefaultVaultDisplayPath(dirName: string): string {
  return `${DEFAULT_VAULT_PARENT_LABEL}/${dirName}`;
}
