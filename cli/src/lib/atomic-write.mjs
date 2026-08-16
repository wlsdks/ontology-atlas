import {
  closeSync,
  existsSync,
  fchmodSync,
  fsyncSync,
  openSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';

function existingRegularFileMode(filePath) {
  try {
    const metadata = statSync(filePath);
    return metadata.isFile() ? metadata.mode & 0o777 : null;
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

/**
 * 파일 하나를 **끊기지 않게** 쓴다 — 임시 파일에 쓰고, 디스크에 확정하고, 이름을 바꾼다.
 *
 * ## 왜 (2026-08-16 검수, 실측으로 확인)
 *
 * `writeFileSync` 는 원본을 **먼저 비우고** 쓴다. 검수가 실제 쓰기 도중에
 * 바깥에서 파일 크기를 재서 그 순간을 잡았다:
 *
 * ```
 * FULL_SIZE 420000102   MIN_OBSERVED_DURING_WRITE 0
 * ```
 *
 * 그 사이에 프로세스가 죽거나 디스크가 차면 사용자의 마크다운이 **0바이트로**
 * 남는다. `relate` 처럼 **이미 있는 문서를 고쳐 쓰는** 명령이 그 길을 탄다.
 *
 * ⚠️ 이 저장소에는 안전한 쓰기가 **이미 있었다** — 그런데 쓰는 곳이
 * `.mcp.json` 과 `config.toml` 뿐이었다. **설정 파일은 지키고 사용자 데이터는
 * 안 지키는** 모양이었고, MCP 쪽은 같은 날 고쳤는데 CLI 는 남아 있었다.
 * 거울이 둘이면 한쪽만 고쳐지는 것이 기본값이다.
 *
 * 이름 바꾸기는 같은 파일 시스템 안에서 원자적이다. 그래서 어느 순간에 죽어도
 * 파일은 **옛 내용 아니면 새 내용**이지, 반쪽이 되지 않는다.
 */
export function writeFileAtomically(filePath, text) {
  const temporaryPath = `${filePath}.oatlas-tmp-${process.pid}`;
  const existingMode = existingRegularFileMode(filePath);
  let descriptor = null;
  try {
    descriptor = openSync(temporaryPath, 'wx');
    // private 원본의 권한을 temp가 잠깐이라도 넓히지 않도록 내용보다 먼저 적용한다.
    if (existingMode !== null) fchmodSync(descriptor, existingMode);
    writeFileSync(descriptor, text, 'utf-8');
    // 이름을 바꾸기 전에 디스크에 확정한다 — 안 하면 이름만 새것이고 내용은
    // 아직 캐시에 있는 상태로 전원이 나갈 수 있다.
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    renameSync(temporaryPath, filePath);
  } finally {
    if (descriptor !== null) {
      try {
        closeSync(descriptor);
      } catch {
        /* 이미 닫혔다 */
      }
    }
    try {
      // 성공하면 rename 이 가져갔으므로 지울 것이 없다. 실패했을 때만 남고,
      // 그건 원본을 건드리지 않고 치운다.
      if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
    } catch {
      /* 못 치워도 원본은 멀쩡하다 */
    }
  }
}
