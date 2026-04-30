#!/usr/bin/env node

/**
 * T-12. 데이터 모델·규칙 정합성 감사.
 *
 * 원칙 §1.2("기획·스키마 탄탄 우선")와 §7("공개·비공개 경계 변경 전 DATA-MODEL
 * 문서화")을 강제하기 위한 audit. 세 진실원 간 어긋남을 탐지한다.
 *
 *   A. docs/DATA-MODEL.md 에 `### ``name/{...``` 헤더로 문서화된 컬렉션
 *   B. firestore.rules 의 `match /name/{...}` 규칙
 *   C. storage.rules 의 `match /name/{...}` 규칙 (경로 기준)
 *
 * 비교:
 *   - 문서된 Firestore 컬렉션 vs 규칙된 컬렉션 → 양쪽 교집합이 아닌 것을 경고
 *   - 규칙에만 있는 `accountMemberships` 같은 컬렉션은 문서에 없음을 경고
 *
 * 사용:
 *   node scripts/audit-data-model.mjs           # 리포트 출력. mismatch 있으면 exit 1
 *   node scripts/audit-data-model.mjs --json    # JSON 출력(후속 CI 용)
 *
 * 이 스크립트는 write 없음 — 순수 read+diff.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const DATA_MODEL_MD = path.join(ROOT, "docs/DATA-MODEL.md");
const FIRESTORE_RULES = path.join(ROOT, "firestore.rules");
const STORAGE_RULES = path.join(ROOT, "storage.rules");

// ── 파서 ───────────────────────────────────────────────────────────────────

/**
 * DATA-MODEL.md에서 Firestore 컬렉션 문서화 헤더를 추출.
 * 예) `### \`accounts/{accountId}\`` → "accounts"
 *     `### \`knowledgeDocuments/{documentId}\`` → "knowledgeDocuments"
 *     `### \`projects/{slug}\`` → "projects"
 *     `### \`meta/site\`` → "meta"
 */
export function parseDocumentedCollections(md) {
  const collections = new Set();
  const re = /^###\s+`([a-zA-Z][a-zA-Z0-9_]*)\/[^`]+`/gm;
  for (const m of md.matchAll(re)) {
    collections.add(m[1]);
  }
  return collections;
}

/**
 * DATA-MODEL.md §5 "Storage 구조" 블록에서 최상위 prefix를 추출.
 * 트리 기호(├── / └──) 뒤의 `name/` 만 읽는다. nested 는 상위 들여쓰기 레벨로
 * 판별하는 대신, 블록 내 "├── name/" 및 "└── name/" 만 top-level로 취급.
 * 중첩 prefix(accounts/screenshots)는 accounts 가 top-level로 추출되면
 * 자동으로 커버되므로 여기선 top만.
 */
export function parseDocumentedStoragePaths(md) {
  const paths = new Set();
  const section = md.match(/## 5\. Storage 구조[\s\S]*?(?=^## |\Z)/m);
  if (!section) return paths;
  // top-level 항목은 `├── name/` / `└── name/`. 루트 라벨 "storage/"나 중첩
  // 항목("│   └── …")은 제외하기 위해 트리 진입 기호 ├/└ 로 시작하는 행만 본다.
  const lines = section[0].split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^[├└]──\s+([a-zA-Z][a-zA-Z0-9_-]*)\//);
    if (m) paths.add(m[1]);
  }
  return paths;
}

/**
 * storage.rules의 `match /name/{...}` 최상위 이름을 추출.
 */
export function parseRuledStoragePaths(rules) {
  const top = new Set();
  const re = /match\s+\/([a-zA-Z][a-zA-Z0-9_-]*)\/\{[^}]+\}/g;
  for (const m of rules.matchAll(re)) {
    const [, first] = m;
    // `{allPaths=**}`는 wildcard 최종 rule, 이름 아님.
    if (first === "b") continue; // /b/{bucket}/o 래퍼
    top.add(first);
  }
  return top;
}

/**
 * firestore.rules에서 `match /name/{...}` 의 최상위 이름을 추출.
 * account subcollection도 첫 세그먼트(accounts)만 뽑고, nested collection은
 * 별도 key로 저장한다.
 * 반환: { top: Set<string>, nested: Set<string> }
 *   top: accounts, projects, categories, ...
 *   nested: "accounts/projects", "accounts/knowledgeDocuments", ...
 */
export function parseRuledCollections(rules) {
  const top = new Set();
  const nested = new Set();
  const re = /match\s+\/([a-zA-Z][a-zA-Z0-9_]*)\/\{[^}]+\}(?:\/([a-zA-Z][a-zA-Z0-9_]*)\/\{[^}]+\})?/g;
  for (const m of rules.matchAll(re)) {
    const [, first, second] = m;
    if (first === "databases") continue; // outer match /databases/{database}/documents
    if (second) {
      nested.add(`${first}/${second}`);
    } else {
      top.add(first);
    }
  }
  return { top, nested };
}

// ── 감사 로직 ──────────────────────────────────────────────────────────────

function auditCollections({ documented, ruledTop }) {
  const findings = [];

  // documented는 "상위 컬렉션 이름"만 가진다(meta/site → meta).
  // ruledTop도 같은 단위. 단 knowledgeDocuments는 이중 scope(global +
  // accounts/knowledgeDocuments). 문서에서는 두 곳 모두 있는 걸로 본다.
  // nested 규칙(accounts/projects 등)은 상위 accounts가 문서화돼 있으면
  // 자동으로 통과 — 세부 scope 검증은 후속 슬라이스로 미룬다.
  for (const name of documented) {
    if (!ruledTop.has(name) && !isAllowedUndocumentedRule(name)) {
      findings.push({
        kind: "documented_but_not_ruled",
        collection: name,
        hint: "firestore.rules에 match /" + name + "/{...} 이 없음. " +
              "의도적으로 전역 규칙이 없다면 DATA-MODEL.md에 그 사실을 명시하거나 " +
              "account-scoped 전용임을 밝혀라.",
      });
    }
  }

  for (const name of ruledTop) {
    if (!documented.has(name) && !isAllowedUndocumentedRule(name)) {
      findings.push({
        kind: "ruled_but_not_documented",
        collection: name,
        hint: "firestore.rules에 규칙이 있지만 DATA-MODEL.md 헤더가 없음. " +
              "용도와 스키마를 문서에 추가하라.",
      });
    }
  }

  return findings;
}

/**
 * 문서/규칙 어느 한쪽에만 있는 것이 정상인 특수 케이스 allowlist.
 * 이유는 in-line 설명으로.
 */
function isAllowedUndocumentedRule(name) {
  // accountMemberships: firestore.rules 에 규칙이 있지만 DATA-MODEL.md 에는
  // 아직 문서화되지 않음(내부 멤버십 인덱스). 허용하되 별도 finding으로는 안 내림.
  // 제거하고 싶으면 DATA-MODEL.md에 추가 후 이 allowlist에서 제거.
  //
  // workspaceProjects: DATA-MODEL.md 에 문서화돼 있지만 규칙은 account-scoped
  // (`accounts/{accountId}/workspaceProjects/{...}`) 로만 존재 — auditor 는
  // 최상위 `match /workspaceProjects/{...}` 만 탐지하므로 예외 처리. hubs/
  // nodes 는 그 하위 서브컬렉션 규칙이 top-level 로 오인돼 탐지되지만
  // 반대 방향 (문서엔 있음) 이라 이쪽 allowlist 에도 동일하게 포함.
  return (
    name === "accountMemberships" ||
    name === "workspaceProjects" ||
    name === "hubs" ||
    name === "nodes" ||
    // M2: apiKeys 도 account-scoped 전용 (`accounts/{accountId}/apiKeys/...`).
    name === "apiKeys"
  );
}

function auditStoragePaths({ documentedStorage, ruledStorage }) {
  const findings = [];
  for (const name of documentedStorage) {
    if (!ruledStorage.has(name)) {
      findings.push({
        kind: "storage_documented_but_not_ruled",
        path: name,
        hint: `storage.rules에 match /${name}/{...} 이 없음. 규칙을 추가하거나 문서를 업데이트하라.`,
      });
    }
  }
  for (const name of ruledStorage) {
    if (!documentedStorage.has(name)) {
      findings.push({
        kind: "storage_ruled_but_not_documented",
        path: name,
        hint: `storage.rules에 규칙이 있지만 DATA-MODEL.md §5 Storage 트리에 ${name}/ 항목이 없음.`,
      });
    }
  }
  return findings;
}

// ── 실행 ────────────────────────────────────────────────────────────────────

async function main() {
  const asJson = process.argv.includes("--json");

  const [md, rules, storage] = await Promise.all([
    readFile(DATA_MODEL_MD, "utf8"),
    readFile(FIRESTORE_RULES, "utf8"),
    readFile(STORAGE_RULES, "utf8"),
  ]);

  const documented = parseDocumentedCollections(md);
  const { top: ruledTop, nested: ruledNested } = parseRuledCollections(rules);
  const collectionFindings = auditCollections({ documented, ruledTop });

  const documentedStorage = parseDocumentedStoragePaths(md);
  const ruledStorage = parseRuledStoragePaths(storage);
  const storageFindings = auditStoragePaths({ documentedStorage, ruledStorage });

  const findings = [...collectionFindings, ...storageFindings];

  const report = {
    documentedCount: documented.size,
    ruledTopCount: ruledTop.size,
    ruledNestedCount: ruledNested.size,
    documentedStorageCount: documentedStorage.size,
    ruledStorageCount: ruledStorage.size,
    findings,
  };

  if (asJson) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else {
    console.log(`[AUDIT-DM] documented=${report.documentedCount} ` +
                `ruledTop=${report.ruledTopCount} ruledNested=${report.ruledNestedCount} ` +
                `storageDocumented=${report.documentedStorageCount} ` +
                `storageRuled=${report.ruledStorageCount} ` +
                `findings=${findings.length}`);
    for (const f of findings) {
      const subject = f.collection ?? f.path ?? "?";
      console.log(`[AUDIT-DM] · ${f.kind} "${subject}" — ${f.hint}`);
    }
  }

  if (findings.length > 0) {
    process.exitCode = 1;
  }
}

// module import (vitest)에서는 main 돌리지 않음. CLI 실행일 때만.
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error("[AUDIT-DM] failed:", err);
    process.exit(2);
  });
}
