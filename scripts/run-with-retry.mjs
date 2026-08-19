#!/usr/bin/env node
/**
 * 명령 하나를 **시간을 묶어서** 돌리고, 실패하면 정해진 횟수만큼 다시 돌린다.
 *
 * ## 왜 있나 — 20분을 통째로 먹은 apt (2026-08-20 실측)
 *
 * E2E 잡의 준비 스텝(`playwright install-deps chromium`)이 **하루에 여섯 번**
 * 죽었다. 죽은 모양이 문제였다: 테스트는 한 줄도 안 돌았고, 로그는
 * `Ign: http://azure.archive.ubuntu.com/... InRelease` 를 반복하다 멈췄으며,
 * 19분 42초 뒤 잡 타임아웃(20분)에 걸려 `The operation was canceled.` 만 남았다.
 * 네 샤드가 같은 자리에서 같이 죽어서 PR 하나에 재실행 여섯 번이 들었다.
 *
 * **apt 는 기다리는 데 상한이 없다.** 미러가 응답하지 않으면 영원히 기다리고,
 * 그 «영원히» 를 끊는 것이 잡 타임아웃뿐이면 **비용을 전액 치른 뒤에야** 실패를
 * 안다. 그래서 여기서 두 가지를 한다 — 한 번의 시도에 상한을 두고, 상한에
 * 걸리면 다시 시도한다.
 *
 * ## 왜 bash 루프가 아니라 스크립트인가
 *
 * **검사할 수 있어야 하기 때문이다.** CI YAML 안의 `for` 루프는 CI 를 돌려야만
 * 검증되고, 그 검증에는 20분과 러너 한 대가 든다. 실패 경로(멈춘 명령을 죽이는
 * 것 · 마지막 시도까지 실패했을 때의 종료 코드)는 **일부러 만들어야** 밟히는데,
 * CI 에서 그것을 재현할 방법이 없다. 스크립트로 두면 가짜 명령으로 전부 밟아
 * 볼 수 있다 — `run-with-retry.test.mjs` 가 그렇게 한다.
 *
 * ## 멈춘 명령은 프로세스 **그룹**째 죽인다
 *
 * `playwright install-deps` 는 자기가 apt 를 다시 띄운다. 부모만 죽이면 손자가
 * 남아 락을 쥔 채 떠돌고, 다음 시도가 그 락에서 또 막힌다. 그래서 `detached`
 * 로 띄워 자기 프로세스 그룹의 리더로 만들고, 죽일 때 `-pid` 로 그룹 전체에
 * 신호를 보낸다. SIGTERM 뒤 유예를 주고도 안 죽으면 SIGKILL 이다.
 *
 * ## `--best-effort`
 *
 * 「있으면 좋지만 없어도 다음 단계가 스스로 말해 주는」 준비 작업용이다.
 * 시스템 라이브러리 설치가 그렇다 — 러너 이미지에 이미 대부분 들어 있고,
 * 정말 빠졌다면 브라우저가 뜰 때 Playwright 가 **어느 라이브러리가 없는지
 * 이름을 대며** 실패한다. 미러가 잠깐 흔들렸다는 이유로 PR 전체를 세우는 것보다,
 * 경고를 남기고 진짜 판정을 다음 단계에 맡기는 편이 낫다.
 *
 * 반대로 브라우저 내려받기처럼 **없으면 아무것도 못 하는** 것은 이 옵션 없이
 * 쓴다 — 그때는 마지막 시도까지 실패하면 종료 코드가 1이다.
 *
 * ## 쓰는 법
 *
 * ```bash
 * node scripts/run-with-retry.mjs --attempts=3 --timeout-ms=180000 \
 *   --label="playwright install-deps" --best-effort \
 *   -- pnpm exec playwright install-deps chromium
 * ```
 */

import { spawn } from 'node:child_process';

const DEFAULTS = {
  attempts: 3,
  timeoutMs: 180_000,
  /** SIGTERM 을 보낸 뒤 SIGKILL 까지 주는 유예. */
  killGraceMs: 5_000,
  /** 시도 사이에 쉬는 시간의 기준 — n 번째 재시도 앞에서 n 배로 늘어난다. */
  backoffMs: 5_000,
};

/** `--` 앞은 이 스크립트의 옵션, 뒤는 실행할 명령. */
export function parseArgs(argv) {
  const separator = argv.indexOf('--');
  if (separator < 0) {
    throw new Error('run-with-retry: `--` 뒤에 실행할 명령을 적어라');
  }
  const flags = argv.slice(0, separator);
  const command = argv.slice(separator + 1);
  if (command.length === 0) {
    throw new Error('run-with-retry: `--` 뒤가 비었다');
  }

  const options = {
    ...DEFAULTS,
    bestEffort: false,
    label: command.join(' '),
  };

  for (const flag of flags) {
    const numeric = (name) => {
      const raw = flag.slice(`--${name}=`.length);
      const value = Number(raw);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`run-with-retry: --${name} 는 양수여야 한다 (받은 값: ${raw})`);
      }
      return value;
    };

    if (flag === '--best-effort') options.bestEffort = true;
    else if (flag.startsWith('--attempts=')) options.attempts = numeric('attempts');
    else if (flag.startsWith('--timeout-ms=')) options.timeoutMs = numeric('timeout-ms');
    else if (flag.startsWith('--kill-grace-ms=')) options.killGraceMs = numeric('kill-grace-ms');
    else if (flag.startsWith('--backoff-ms=')) options.backoffMs = numeric('backoff-ms');
    else if (flag.startsWith('--label=')) options.label = flag.slice('--label='.length);
    else throw new Error(`run-with-retry: 모르는 옵션 ${flag}`);
  }

  return { options, command };
}

/**
 * 한 번 돌린다. `{ ok, reason }` 을 돌려준다 — `reason` 은 'exit-<code>' 이거나
 * 'timeout' 이거나 'signal-<name>' 이다.
 */
function runOnce(command, { timeoutMs, killGraceMs }) {
  return new Promise((resolve) => {
    // detached: 자기 프로세스 그룹의 리더가 되게 한다. 손자까지 한 번에 죽이려면
    // 그룹이 필요하다(위 독블록 참고).
    const child = spawn(command[0], command.slice(1), { stdio: 'inherit', detached: true });

    let settled = false;
    let killTimer;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      clearTimeout(killTimer);
      resolve(result);
    };

    const signalGroup = (signal) => {
      try {
        process.kill(-child.pid, signal);
      } catch {
        // 이미 죽었으면 그룹이 없다 — 정상이다.
      }
    };

    let timedOut = false;
    const deadline = setTimeout(() => {
      timedOut = true;
      signalGroup('SIGTERM');
      killTimer = setTimeout(() => signalGroup('SIGKILL'), killGraceMs);
      // 여기서 바로 결론을 내지 않는다 — 'close' 를 기다려야 자식이 실제로
      // 정리된 뒤 다음 시도가 시작된다(락을 쥔 채 겹치는 것을 막는다).
    }, timeoutMs);

    child.on('error', (error) => finish({ ok: false, reason: `spawn-error: ${error.message}` }));
    child.on('close', (code, signal) => {
      if (timedOut) return finish({ ok: false, reason: 'timeout' });
      if (signal) return finish({ ok: false, reason: `signal-${signal}` });
      return finish({ ok: code === 0, reason: `exit-${code}` });
    });
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runWithRetry(command, options) {
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    const started = Date.now();
    const result = await runOnce(command, options);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);

    if (result.ok) {
      if (attempt > 1) {
        console.log(`[run-with-retry] ${options.label}: ${attempt}번째 시도에 성공 (${seconds}s)`);
      }
      return { ok: true, attempts: attempt };
    }

    const why = result.reason === 'timeout' ? `${options.timeoutMs}ms 안에 안 끝남` : result.reason;
    console.log(
      `[run-with-retry] ${options.label}: ${attempt}/${options.attempts} 실패 — ${why} (${seconds}s)`,
    );

    if (attempt < options.attempts) await sleep(options.backoffMs * attempt);
  }

  return { ok: false, attempts: options.attempts };
}

async function main() {
  const { options, command } = parseArgs(process.argv.slice(2));
  const result = await runWithRetry(command, options);
  if (result.ok) return 0;

  if (options.bestEffort) {
    // GitHub 이 주석으로 띄워 주는 형식. 조용히 넘어가면 「됐다」와 구별되지 않는다.
    console.log(
      `::warning title=${options.label}::${options.attempts}번 다 실패했지만 필수 단계가 아니라 계속한다. ` +
        `이것 때문에 다음 단계가 깨지면 그 실패 메시지가 무엇이 빠졌는지 이름을 댄다.`,
    );
    return 0;
  }

  console.error(`[run-with-retry] ${options.label}: ${options.attempts}번 다 실패했다`);
  return 1;
}

if (process.argv[1] && process.argv[1].endsWith('run-with-retry.mjs')) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(`[run-with-retry] ${error.message}`);
      process.exitCode = 1;
    });
}
