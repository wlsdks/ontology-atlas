/**
 * 온톨로지 노드를 vault `.md` 문자열로 직렬화 — `parseFrontmatter` 의 역방향.
 *
 * 원래 은퇴한 ERD 빌더(구 `src/views/ontology-edit`) 안에 있던 직렬화 함수를
 * S1.0(ontology-first/topology-as-ontology 재구성)에서 entity 레이어로 추출.
 * 여러 view 가 cross-view import 없이 같은 vault `.md` 직렬화를 재사용하기
 * 위함(현재는 docs-vault·공방 쓰기 경로). 동작은 추출 전과 동일하게 유지
 * (slug·kind·title frontmatter + `# title` 본문) — 풍부한 frontmatter(domain,
 * 관계 키)·기존 본문 보존이 필요한 *기존 노드 편집*은 별도 patch 경로가 담당.
 */

import { slugify } from "@/shared/lib/slugify";
import { canonicalizeDomainRef } from "@/shared/lib/canonicalize-domain-ref";

const NODE_UID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function generateNodeUid(uid?: string): string {
  const resolved = uid ?? globalThis.crypto.randomUUID();
  if (!NODE_UID_PATTERN.test(resolved)) {
    throw new Error(`uid must be a lowercase UUIDv4: ${resolved}`);
  }
  return resolved;
}

function quoteYamlScalar(v: string): string {
  // 콜론 / 따옴표 등 YAML 특수문자가 있으면 안전하게 quote + escape.
  return /[:#\[\]{}"',&|*!%@`]/.test(v) ? `"${v.replace(/"/g, '\\"')}"` : v;
}

/**
 * 저작 출처(`created_by`)의 웹 쪽 상수 — 2026-07-31 원장.
 * 정본은 `mcp/src/schema.mjs`(미러 `cli/src/lib/schema.mjs`)이고, 세 사본이
 * 같은 문자열을 쓰는지는 `tests/contract/created-by-provenance.contract.test.ts`
 * 가 잡는다. 값 규약은 `human` | `agent:<name>` 뿐이고,
 * **부재는 결함이 아니라 unknown 이다** — 어떤 경로도 부재를 사람으로 채우지
 * 않는다.
 */
export const VAULT_CREATED_BY_KEY = "created_by";
export const VAULT_CREATED_BY_HUMAN = "human";
const VAULT_CREATED_BY_AGENT_PREFIX = "agent:";
export const VAULT_CREATED_BY_AGENT_UNKNOWN = `${VAULT_CREATED_BY_AGENT_PREFIX}unknown`;

/** 에이전트 이름 → `agent:<name>`. 이름을 모르면 `agent:unknown`(사람 아님). */
export function vaultAgentCreatedBy(agentName: string | null | undefined): string {
  const name = typeof agentName === "string" ? agentName.trim() : "";
  return name ? `${VAULT_CREATED_BY_AGENT_PREFIX}${name}` : VAULT_CREATED_BY_AGENT_UNKNOWN;
}

export function buildVaultMarkdown(args: {
  /** 영구 노드 식별자. 테스트·명시적 복원만 주입하고 일반 생성은 fresh UUIDv4. */
  uid?: string;
  kind: string;
  title: string;
  slug: string;
  /** capability/element 처럼 부모 도메인이 있는 노드의 `domain:` 키. 생략 시
   *  emit 안 함 — 추출 전(빌더)과 byte-identical 출력 보장. */
  domain?: string;
  /**
   * 어권별 표시 이름 (소유자 지시 2026-07-24) — `{ ko: "결제", en: "Payments" }`
   * → `display_ko:` / `display_en:` 키. 생략하면 emit 안 함(기존 출력 불변).
   * `title` 은 검색/매칭의 단일 진실원이라 그대로 둔다.
   */
  localeLabels?: Record<string, string>;
  /**
   * 저작 출처 — 이 문서를 **쓴 경로가 증명하는** 행위자(`human` |
   * `agent:<name>`)만 넘긴다. 모르면 넘기지 않는다: 키가 없는 것이 unknown 의
   * 정직한 표현이고, 사람으로 추정해 채우는 것은 2026-07-31 원장이 금지한
   * 소급 추론이다.
   */
  createdBy?: string;
}): string {
  const lines = ["---"];
  lines.push(`uid: ${generateNodeUid(args.uid)}`);
  lines.push(`slug: ${args.slug}`);
  lines.push(`kind: ${args.kind}`);
  // C7 — single canonical `domain:` serialization (bare tail-slug) so map + 공방
  // writers agree and analytics don't split one domain into two keys.
  const domain = canonicalizeDomainRef(args.domain);
  if (domain) lines.push(`domain: ${quoteYamlScalar(domain)}`);
  lines.push(`title: ${quoteYamlScalar(args.title)}`);
  for (const [locale, value] of Object.entries(args.localeLabels ?? {})) {
    if (!/^[a-z]{2}$/.test(locale)) continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    lines.push(`display_${locale}: ${quoteYamlScalar(trimmed)}`);
  }
  const createdBy = args.createdBy?.trim();
  // `agent:<name>` 은 콜론을 품는다 — MCP 쪽 writer 가 내는 바이트와 같게
  // 인용해야 두 표면이 같은 파일을 만든다.
  if (createdBy) lines.push(`${VAULT_CREATED_BY_KEY}: ${quoteYamlScalar(createdBy)}`);
  lines.push("---");
  lines.push("");
  lines.push(`# ${args.title}`);
  lines.push("");
  return lines.join("\n");
}

/**
 * kind → vault 폴더(복수형). dogfood vault 와 빌더 저장 경로 규칙을 단일화 —
 * capability→capabilities, element→elements, domain→domains, project→projects,
 * 그 외는 `${kind}s`.
 */
export function vaultFolderForKind(kind: string): string {
  switch (kind) {
    case "capability":
      return "capabilities";
    case "element":
      return "elements";
    case "domain":
      return "domains";
    case "project":
      return "projects";
    default:
      return `${kind}s`;
  }
}

/**
 * 새 온톨로지 노드의 vault 문서(slug + markdown)를 만든다 — S2(토폴로지에서
 * 노드 생성)의 순수 모델. slug = `${폴더}/${slugify(title)}`. title 이 비거나
 * slug 로 환원 불가하면 throw. createDoc(slug, markdown) 으로 디스크에 쓴다.
 */
export function buildNewNodeDoc(args: {
  uid?: string;
  title: string;
  kind: string;
  domain?: string;
  localeLabels?: Record<string, string>;
  /**
   * 저작 출처 — 화면에서 **사람이 손으로 만든 노드**는 `human` 이다
   * (2026-07-31 원장의 값 규약, 2026-08-03 배선).
   *
   * 스탬프는 **쓰기 시점에, 호출 경로가 증명하는 행위자에게만** 찍는다.
   * 이 함수는 화면의 「개념 만들기」에서만 불리므로 그 경로가 사람을 증명한다.
   * 생략하면 안 찍는다 — 부재는 unknown 이고, 그게 원장의 계약이다.
   */
  createdBy?: string;
}): { slug: string; markdown: string } {
  const title = args.title.trim();
  if (!title) throw new Error("title must not be empty");
  const tail = slugify(title);
  if (!tail) throw new Error("title produced an empty slug");
  const slug = `${vaultFolderForKind(args.kind)}/${tail}`;
  const markdown = buildVaultMarkdown({
    uid: args.uid,
    kind: args.kind,
    title,
    slug,
    domain: args.domain,
    localeLabels: args.localeLabels,
    createdBy: args.createdBy,
  });
  return { slug, markdown };
}
