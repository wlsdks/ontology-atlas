import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

export class VaultRootError extends Error {
  constructor(message) {
    super(message);
    this.name = 'VaultRootError';
  }
}

/**
 * Vault root 결정 우선순위 — graph-level read 명령 (list / query / path /
 * orphans / backlinks / find / validate) 공유.
 *
 *  1. 호출자가 명시한 `explicit` (positional 인자 또는 `--vault path`) 가 있고
 *     기본값 (`.` 또는 빈 문자열) 이 아니면 → 그대로 사용
 *  2. 환경 변수 `OATLAS_VAULT` 설정되어 있으면 → 그 경로
 *  3. cwd 에 `docs/ontology/` 디렉토리 있으면 → 그쪽 (자기 repo dogfood 대응
 *     — 빌드 미러 `public/docs-vault/` 나 `cli/templates/` 가 cwd 안에 있어도
 *     의도된 canonical vault 가 우선)
 *  4. 마지막 fallback: cwd
 *
 * 항상 절대 경로 반환.
 */
export function resolveVaultRoot(explicit) {
  // 1) 명시적 사용자 지정 — 우선
  if (typeof explicit === 'string' && explicit && explicit !== '.') {
    const root = resolve(process.cwd(), explicit);
    assertVaultDirectory(root);
    return root;
  }

  // 2) OATLAS_VAULT env (MCP 서버 규약과 동일)
  const env = process.env.OATLAS_VAULT;
  if (typeof env === 'string' && env.length > 0) {
    const root = resolve(process.cwd(), env);
    assertVaultDirectory(root);
    return root;
  }

  // 3) cwd 의 docs/ontology 디렉토리 — repo dogfood 자동 감지
  const candidate = resolve(process.cwd(), 'docs/ontology');
  if (isDirectory(candidate)) return candidate;

  // 4) fallback — cwd
  return process.cwd();
}

function assertVaultDirectory(path) {
  if (!existsSync(path)) {
    throw new VaultRootError(`Vault root not found: ${path}`);
  }
  if (!isDirectory(path)) {
    throw new VaultRootError(`Vault root is not a directory: ${path}`);
  }
}

function isDirectory(path) {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}
