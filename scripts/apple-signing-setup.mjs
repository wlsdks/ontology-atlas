#!/usr/bin/env node
/**
 * Developer ID 서명 자격증명을 만들어 GitHub 에 등록하는 경로.
 *
 * 왜 스크립트인가 — 이 절차는 5년에 한 번 한다(Developer ID 인증서 유효기간).
 * 그때의 나는 지금의 나가 아니고, 산문으로 적어 둔 절차는 그 사이에 반드시
 * 낡는다. 실행 가능한 형태여야 "한치의 오차 없이" 가 성립한다.
 *
 * ## 무엇을 자동화하고 무엇을 사람에게 남기는가
 *
 * 사람에게 남는 것은 **두 순간뿐이고, 둘 다 자격증명을 다루는 순간**이다:
 * Apple 로그인(비밀번호 + 2FA)과 앱 암호 발급. 나머지 — 키쌍 생성, CSR 작성,
 * `.p12` 조립, GitHub 등록, 검증 — 은 전부 여기 있다.
 *
 * ## 왜 Keychain Access GUI 를 쓰지 않는가
 *
 * 흔한 안내는 키체인 접근에서 CSR 을 만들고 인증서를 설치한 뒤 `.p12` 로
 * 내보내라고 한다. 그 경로에는 조용한 함정이 있다 — **"나의 인증서" 가 아니라
 * "인증서" 카테고리에서 내보내면 개인키가 빠지고**, 그래도 파일은 멀쩡히
 * 만들어진다. 실패는 몇 분 뒤 CI 의 codesign 에서 처음 드러난다.
 *
 * 여기서는 개인키를 우리가 만들고 우리가 들고 있으므로 그 실수가 **구조적으로
 * 불가능하다**. `.p12` 는 항상 키와 인증서를 함께 담는다.
 *
 * ## 비밀 값을 화면에 찍지 않는다
 *
 * `.p12` 내보내기 비밀번호는 여기서 무작위로 만들고 **아무도 보지 않는다** —
 * 사람도, 로그도, 모델도. 그 비밀번호의 유일한 용도는 GitHub 으로 가는 동안
 * 파일을 감싸는 것이고, 받는 쪽(CI)은 secret 으로 같은 값을 받는다. 사람이
 * 기억할 이유가 없는 값을 사람에게 보여주는 것은 유출 경로만 늘린다.
 */

import { spawnSync, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** 저장소 밖. 개인키는 어떤 경우에도 작업 트리에 두지 않는다. */
export const DEFAULT_DIR = path.join(os.homedir(), ".ontology-atlas-signing");

export const REPO = "wlsdks/ontology-atlas";

/**
 * 워크플로가 실제로 요구하는 5개. `scripts/check-macos-release-secrets.mjs` 가
 * 진실원이고 이 목록은 그 거울이다 — 어긋나면 계약 테스트가 잡는다.
 */
export const REQUIRED_SECRETS = [
  "APPLE_CERTIFICATE_P12_BASE64",
  "APPLE_CERTIFICATE_PASSWORD",
  "APPLE_ID",
  "APPLE_APP_SPECIFIC_PASSWORD",
  "APPLE_TEAM_ID",
];

/** 자격증명이라 사람이 직접 넣어야 하는 둘. */
export const OWNER_ENTERED_SECRETS = ["APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD"];

export function parseArgs(argv) {
  const command = argv.find((arg) => !arg.startsWith("-")) ?? "help";
  const flag = (name) => {
    const hit = argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.slice(`--${name}=`.length).trim() : undefined;
  };
  return {
    command,
    dir: flag("dir") ?? DEFAULT_DIR,
    cer: flag("cer"),
    name: flag("name"),
    email: flag("email"),
    repo: flag("repo") ?? REPO,
  };
}

function fail(message) {
  console.error(`[apple-signing] ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.status !== 0) {
    fail(
      [
        `${command} ${args.join(" ")} failed with exit ${result.status}`,
        result.stderr?.trim(),
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  return result;
}

function printHelp() {
  console.log(`Usage: node scripts/apple-signing-setup.mjs <command>

  csr      개인키 + CSR 을 만든다. 그다음 Apple 에 업로드하는 것은 사람 몫.
             --name="법적 실명"  --email="Apple 계정 이메일"
  bundle   Apple 이 준 .cer 을 개인키와 합쳐 .p12 로 만들고 GitHub 에 등록한다.
             --cer=~/Downloads/developerID_application.cer
  verify   5개 secret 이 다 있는지, 무엇이 남았는지 본다.

공통: --dir=<경로> (기본 ${DEFAULT_DIR}) · --repo=<owner/name>

이 스크립트는 비밀 값을 화면에 찍지 않는다.`);
}

/** 1단계 — 키쌍과 CSR. 자격증명이 필요 없으므로 전부 자동이다. */
export function commandCsr({ dir, name, email }) {
  if (!name || !email) {
    fail(
      'csr 에는 --name 과 --email 이 필요하다.\n' +
        '  --name 은 Apple 계정의 **법적 실명**이어야 한다 (별명이면 심사가 지연된다).\n' +
        '  예: node scripts/apple-signing-setup.mjs csr --name="Hong Gildong" --email="me@example.com"',
    );
  }

  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const keyPath = path.join(dir, "developer-id.key");
  const csrPath = path.join(dir, "developer-id.certSigningRequest");

  if (fs.existsSync(keyPath)) {
    fail(
      `개인키가 이미 있다: ${keyPath}\n` +
        "덮어쓰면 그 키로 발급받은 인증서가 전부 쓸모없어진다. 다시 만들려면 먼저 옮겨 두라.",
    );
  }

  // Apple 이 요구하는 것은 2048-bit RSA 다.
  run("openssl", ["req", "-new", "-newkey", "rsa:2048", "-nodes",
    "-keyout", keyPath,
    "-out", csrPath,
    "-subj", `/emailAddress=${email}/CN=${name}/C=KR`,
  ]);

  fs.chmodSync(keyPath, 0o600);

  console.log(`[apple-signing] 개인키: ${keyPath} (0600)`);
  console.log(`[apple-signing] CSR:   ${csrPath}`);
  console.log(`
[apple-signing] 여기서부터 사람 차례다 — Apple 로그인이 필요하다.

  1. https://developer.apple.com/account/resources/certificates/add
  2. 종류: **Developer ID Application** (앱스토어용이 아니다)
  3. 위 CSR 파일을 업로드하고 .cer 을 내려받는다
  4. 돌아와서:  node scripts/apple-signing-setup.mjs bundle --cer=<내려받은 .cer 경로>

[apple-signing] 개인키를 잃어버리면 그 인증서는 못 쓴다. 이 폴더를 지우지 마라.`);
}

/** 2단계 — .cer + 키 → .p12 → GitHub. 비밀 값은 파이프로만 흐른다. */
export function commandBundle({ dir, cer, repo }) {
  if (!cer) fail("bundle 에는 --cer=<Apple 이 준 .cer 경로> 가 필요하다.");

  const cerPath = cer.replace(/^~/, os.homedir());
  const keyPath = path.join(dir, "developer-id.key");
  if (!fs.existsSync(cerPath)) fail(`.cer 을 찾을 수 없다: ${cerPath}`);
  if (!fs.existsSync(keyPath)) fail(`개인키가 없다: ${keyPath} — 먼저 csr 명령을 실행하라.`);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "apple-signing-"));
  const pemPath = path.join(tempDir, "cert.pem");
  const p12Path = path.join(tempDir, "developer-id.p12");

  try {
    // Apple 이 주는 .cer 은 DER 이다. openssl pkcs12 는 PEM 을 원한다.
    run("openssl", ["x509", "-inform", "DER", "-in", cerPath, "-out", pemPath]);

    // 이 비밀번호는 여기서 나고 GitHub 에서만 쓰인다. 아무도 보지 않는다.
    const password = randomBytes(24).toString("base64");

    run("openssl", ["pkcs12", "-export",
      "-inkey", keyPath,
      "-in", pemPath,
      "-out", p12Path,
      "-passout", "stdin",
    ], { input: password });

    const p12Base64 = fs.readFileSync(p12Path).toString("base64");

    // stdin 으로만 넘긴다 — 인자로 주면 프로세스 목록에 뜬다.
    const setSecret = (name, value) => {
      const result = spawnSync("gh", ["secret", "set", name, "--repo", repo], {
        input: value,
        encoding: "utf8",
      });
      if (result.status !== 0) {
        fail(`gh secret set ${name} failed: ${result.stderr?.trim() ?? `exit ${result.status}`}`);
      }
      console.log(`[apple-signing] 등록됨: ${name}`);
    };

    setSecret("APPLE_CERTIFICATE_P12_BASE64", p12Base64);
    setSecret("APPLE_CERTIFICATE_PASSWORD", password);

    console.log(`
[apple-signing] 인증서 쪽은 끝났다. 남은 셋은 자격증명이라 사람이 넣는다:

  APPLE_ID                     Apple 계정 이메일
  APPLE_APP_SPECIFIC_PASSWORD  https://account.apple.com → 로그인 및 보안 → 앱 암호
  APPLE_TEAM_ID                https://developer.apple.com/account → Membership details (10자리)

  입력이 가려지는 방식:
    gh secret set APPLE_ID --repo ${repo}
    gh secret set APPLE_APP_SPECIFIC_PASSWORD --repo ${repo}
    gh secret set APPLE_TEAM_ID --repo ${repo}

  그다음:  node scripts/apple-signing-setup.mjs verify`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

/** 어떤 이름이 등록됐는지만 본다 — 값은 GitHub 도 돌려주지 않는다. */
export function missingSecrets(listOutput) {
  const present = new Set(
    listOutput
      .split("\n")
      .map((line) => line.trim().split(/\s+/)[0])
      .filter(Boolean),
  );
  return REQUIRED_SECRETS.filter((name) => !present.has(name));
}

export function commandVerify({ repo }) {
  const listed = execFileSync("gh", ["secret", "list", "--repo", repo], { encoding: "utf8" });
  const missing = missingSecrets(listed);

  if (missing.length === 0) {
    console.log("[apple-signing] 5개 secret 이 모두 등록됐다 ✓");
    console.log("[apple-signing] 다음 태그부터 워크플로가 서명 경로로 간다 — 코드 수정은 필요 없다.");
    console.log("[apple-signing] 확인: pnpm desktop:release-github -- --tag=<다음 태그>");
    return;
  }

  console.error(`[apple-signing] 아직 없는 secret ${missing.length}개:`);
  for (const name of missing) {
    const who = OWNER_ENTERED_SECRETS.includes(name) ? "사람이 넣는다" : "bundle 명령이 넣는다";
    console.error(`[apple-signing]   ${name} (${who})`);
  }
  process.exit(1);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (process.platform !== "darwin") fail("이 절차는 macOS 에서 실행한다.");

  switch (options.command) {
    case "csr":
      return commandCsr(options);
    case "bundle":
      return commandBundle(options);
    case "verify":
      return commandVerify(options);
    default:
      printHelp();
      process.exit(options.command === "help" ? 0 : 1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
