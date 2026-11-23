import { withAnswerLanguage } from "@/i18n/answer-language";
import type { LibrarySourceRow, LibraryWikiPage } from "@/entities/docs-vault";
import { WIKI_DIR, WIKI_PAGE_TEMPLATE, WIKI_SECTION_ORDER } from "@/shared/lib/library/wiki-page-schema";

import { selectCompileTargets } from "./compile-batch";
import {
  byteLength,
  isLocallyReadableWikiSlug,
  oneLine,
  selectBriefPages,
  type BriefPage,
} from "./compile-brief-pages";
import { compileRuleLines } from "./compile-brief-rules";
import { isRetainedAnswerPath } from "../../questions/answer-revision";

/**
 * The one place a runner is told the compilation contract. Source text is untrusted data, or a
 * document's imperative becomes a directive (docs/ONTOLOGY-ATLAS-SPEC.md, section 7).
 */

export interface CompileBriefInput {
  /** Sources the run should cover — not compiled, stale, or read only in part. */
  sources: readonly LibrarySourceRow[];
  locale: string;
  /** The selected runner; ACP remains the compatibility default for existing callers. */
  execution?: "acp" | "local";
  /** `agent:claude`, `model:llama3.1` — whatever will end up in `created_by`. */
  writerId: string;
  /** Pages already under `wiki/`, from the library model, so the writer revises rather than duplicates. */
  existingPages?: readonly LibraryWikiPage[];
  /** The folder every path is relative to; an agent's working directory may differ. */
  vaultRoot: string;
  /** sha256 by vault-relative source path, as the Library measured it; the writer copies it. */
  hashes?: ReadonlyMap<string, string>;
  /** The moment Compile was pressed, for `compiled_at`; the writer copies it rather than asking a shell. */
  now?: Date;
}

/** The most a brief may weigh in UTF-8 bytes; the two vault-sized lists share what the rest leaves. */
export const COMPILE_BRIEF_BYTE_LIMIT = 64 * 1024;
/** Room kept for the list headings and the two "not listed" lines, which are measured after. */
const BRIEF_BYTE_MARGIN = 1_024;
/** The review list goes first, because it names work; it takes at most this much. */
const REVIEW_LIST_BYTE_BUDGET = 16_000;
/** The existing-page list is context; it takes at most this much of what remains. */
const PAGE_LIST_BYTE_BUDGET = 40_000;

function omittedPagesLine(omitted: number, locale: string, execution: "acp" | "local"): string[] {
  if (omitted === 0) return [];
  if (locale === "ko") {
    return [execution === "local"
      ? `\`${WIKI_DIR}/\` 에는 목록에 없는 문서가 ${omitted}개 더 있어. 도구 결과가 이름을 알려 준 문서만 정확한 주소로 읽어 (규칙 g, i).`
      : `\`${WIKI_DIR}/\` 에는 목록에 없는 문서가 ${omitted}개 더 있어. 필요하면 폴더에서 찾아 읽어 (규칙 g, i).`];
  }
  return [execution === "local"
    ? `${omitted} more pages under \`${WIKI_DIR}/\` are not listed here; open one only by the exact address a tool result names (rules g, i).`
    : `${omitted} more pages under \`${WIKI_DIR}/\` are not listed here; look in the folder when a topic may already have one (rules g, i).`];
}

function existingPageLines(pages: readonly BriefPage[], locale: string, omitted = 0): string[] {
  if (pages.length === 0 && omitted > 0) return [];
  if (pages.length === 0) {
    return [locale === "ko" ? `\`${WIKI_DIR}/\` 에 아직 문서가 없어. 전부 새로 쓰는 거야.` : `Nothing is under \`${WIKI_DIR}/\` yet; every page is new.`];
  }
  const head = locale === "ko" ? `\`${WIKI_DIR}/\` 에 이미 있는 문서 (규칙 g):` : `Pages already under \`${WIKI_DIR}/\` (rule g):`;
  return [head, ...pages.map((entry) => entry.line)];
}

function localExistingPageLines(pages: readonly BriefPage[], locale: string, omitted = 0): string[] {
  if (pages.length === 0 && omitted > 0) return [];
  // Match the reader's safe inventoried addresses; this list does not grant write authority.
  const reachablePages = pages.filter(({ page }) => isLocallyReadableWikiSlug(page.slug));
  const outOfReach = pages.filter((page) => !reachablePages.includes(page));
  const lines = reachablePages.length > 0
    ? existingPageLines(reachablePages, locale)
    : pages.length === 0
      ? existingPageLines([], locale)
      : [
          locale === "ko"
            ? "로컬 도구로 읽을 수 있는 위키 문서가 없어. 아래 참조의 내용은 읽지 않은 상태야."
            : "No reachable Wiki pages are available to the local reader; the references below are uninspected.",
        ];
  if (reachablePages.length > 0) {
    lines[0] = locale === "ko"
      ? `로컬 도구로 읽을 수 있는 위키 문서 (규칙 g):`
      : "Reachable Wiki pages (rule g):";
  }
  if (outOfReach.length === 0) return lines;

  const head = locale === "ko"
    ? `로컬 도구가 읽을 수 없는 위키 참조 (내용은 읽지 않음):`
    : "Out-of-reach Wiki references (contents uninspected by local tools):";
  const note = locale === "ko"
    ? "아래 경로는 참조로만 알고 있어. 내용을 읽었다고 말하거나 읽으려고 하지 말고, 영향이 있으면 사람에게 보고해."
    : "These paths are references only. Do not claim to have read or try to read their contents; report a possible impact to the person.";
  return [
    ...lines,
    "",
    head,
    note,
    ...outOfReach.map((entry) => `${entry.line} (uninspected)`),
  ];
}

/** The local runner receives typed fields and a proposal card, never a Markdown template. */
function buildLocalBrief({
  locale,
  vaultRoot,
  paths,
  existing,
  sections,
  rules,
}: {
  locale: string;
  vaultRoot: string;
  paths: string;
  existing: string;
  sections: string;
  rules: string;
}): string {
  if (locale === "ko") {
    return [
      "이 폴더의 자료를 읽고 위키 페이지 제안을 만들어 줘. 로컬 실행에서는 네가 파일을 직접 쓰지 않고, 사람이 검토할 수 있는 typed 필드 제안만 만들어.",
      "",
      `폴더: ${vaultRoot}`,
      "",
      "이 실행에서 읽을 파일 (이 폴더 기준 경로):",
      paths,
      "",
      "사용 가능한 도구는 정확히 세 가지야:",
      "1. `read_source_text` — 파일 하나를 열고 문단 앵커 `[p1]`, `[p2]` 등이 붙은 텍스트를 돌려줘.",
      "2. `read_wiki_page` — 목록에서 읽을 수 있는 정확한 `wiki/...` 경로의 문서 하나를 열어. `nextCursor` 를 정확히 따라 `complete: true` 가 될 때까지 계속 읽고, 마지막 결과의 예측할 수 없는 `receipt` 를 보관해.",
      "3. `propose_wiki_page` — 도구 스키마에 선언된 typed 필드로 페이지 하나를 제안해. 이 도구는 쓰지 않고 사람에게 검토 카드를 보여 줘.",
      "`propose_wiki_page` 스키마가 선언한 필드만 사용해. 기존 페이지를 갱신할 때만 마지막 읽기의 final `receipt` 를 그대로 넣어. 없는 페이지는 새로 만드는 제안만 해.",
      "Atlas 는 이번 실행에서 읽고 인용한 자료만 `sources` 에 넣어. 기존 페이지를 고칠 때는 그 페이지가 인용하는 자료도 먼저 읽어 (규칙 g).",
      `본문의 다섯 절은 항상 이 순서로 유지해: ${sections}. 빈 절도 남겨.`,
      "위 목록에서 읽을 수 있는 문서만 `read_wiki_page` 로 읽을 수 있어. 읽을 수 없는 참조는 내용을 읽지 않은 상태로 두고 사람에게 보고해.",
      "",
      existing,
      "",
      "규칙:",
      rules,
      "",
      "`propose_wiki_page` 는 파일을 쓰지 않아. 이 실행은 제안에서 멈추고, 사람의 검토와 허락 뒤에만 Atlas가 페이지를 적용해.",
    ].join("\n");
  }

  return [
    "Read the raw sources in this folder and prepare wiki page proposals. In local execution, you do not write files yourself; return typed fields for the person to review.",
    "",
    `Folder: ${vaultRoot}`,
    "",
    "Files to read in this folder (relative paths):",
    paths,
    "",
    "You have exactly three tools:",
    "1. `read_source_text` — open one file and return its text with paragraph anchors such as `[p1]` and `[p2]`.",
    "2. `read_wiki_page` — open one reachable exact `wiki/...` page from the list. Follow its exact `nextCursor` until `complete: true`, and retain the unpredictable `receipt` from that final result.",
    "3. `propose_wiki_page` — propose one page through the typed fields declared by its tool schema. It writes nothing and shows the person a review card.",
    "Use only the fields declared by the `propose_wiki_page` tool schema. When revising an existing page, echo the final `receipt` from the complete read; a missing page is create-only.",
    "Atlas lists in `sources` only the originals you read and cite in this run; before revising an existing page, read the originals it cites too (rule g).",
    `Keep all five body sections in this order: ${sections}. Keep an empty section.`,
    "Only the reachable Wiki entries above may be opened with `read_wiki_page`. Leave out-of-reach references uninspected and report a possible impact to the person.",
    "",
    existing,
    "",
    "Rules:",
    rules,
    "",
    "`propose_wiki_page` never writes a file. This run only proposes; Atlas applies a page only after the person reviews and allows it.",
  ].join("\n");
}

function composeCompileBrief({
  sources,
  locale,
  execution = "acp",
  writerId,
  vaultRoot,
  existingPages = [],
  hashes,
  now,
}: CompileBriefInput): string {
  const targets = selectCompileTargets(sources);
  const compiledAt = execution === "acp" && now ? now.toISOString().replace(/\.\d{3}Z$/, "Z") : null;
  const hashLines = execution === "acp"
    ? targets
        .map((row) => [row.path, hashes?.get(row.path)] as const)
        .filter((pair): pair is readonly [string, string] => typeof pair[1] === "string")
        .map(([path, sha]) => `${oneLine(path)}: ${oneLine(sha)}`)
    : [];
  const paths = targets.map((row) => `- ${oneLine(row.path)}`).join("\n");
  const sections = WIKI_SECTION_ORDER.join(" → ");
  const rules = compileRuleLines(locale, oneLine(writerId), hashLines, compiledAt, execution).join("\n");
  const assemble = (existing: string, review: readonly string[]) =>
    assembleCompileBrief({ locale, execution, vaultRoot: oneLine(vaultRoot), paths, existing, review, sections, rules });

  // The fixed part is measured; the review list, then the page list, share what it leaves.
  let available = COMPILE_BRIEF_BYTE_LIMIT - BRIEF_BYTE_MARGIN - byteLength(assemble("", []));
  const revisions = targets.flatMap((row) =>
    (row.reviewPages ?? []).filter((slug) => !isRetainedAnswerPath(slug)).map((slug) => `- ${oneLine(slug)}.md ← ${oneLine(row.path)}`));
  const reviewBudget = Math.min(REVIEW_LIST_BYTE_BUDGET, Math.max(0, available));
  const listedRevisions: string[] = [];
  let reviewBytes = 0;
  for (const line of revisions) {
    const cost = byteLength(line) + 1;
    if (reviewBytes + cost > reviewBudget) break;
    reviewBytes += cost;
    listedRevisions.push(line);
  }
  available -= reviewBytes;
  const review = reviewLines(listedRevisions, revisions.length - listedRevisions.length, locale);

  const { listed, omitted } = selectBriefPages(existingPages, targets, (now ?? new Date()).getTime(), Math.max(0, Math.min(PAGE_LIST_BYTE_BUDGET, available)));
  const existing = [
    ...(execution === "local" ? localExistingPageLines : existingPageLines)(listed, locale, omitted),
    ...omittedPagesLine(omitted, locale, execution),
  ].join("\n");
  return assemble(existing, review);
}

function reviewLines(listed: readonly string[], omitted: number, locale: string): string[] {
  if (listed.length === 0 && omitted === 0) return [];
  const ko = locale === 'ko';
  return [
    ko
      ? '원본 버전을 다시 확인할 기존 위키 문서. 각 문서를 먼저 읽고 인용된 자료를 확인한 뒤 같은 경로에 수정해. 이미 최신인 문서를 복제하지 마. 옛 값과 변경 근거를 함께 남겨. 해시만 바꾸지 마:'
      : 'Existing Wiki pages whose source version needs review. Read each page and its cited originals, then revise that same path. Do not duplicate a current write-up. Keep the earlier value and the evidence for its change; never update only a hash:',
    ...listed,
    ...(omitted === 0
      ? []
      : [ko
          ? `이 자료들을 인용하는 문서 ${omitted}개도 다시 확인해야 하지만 여기 싣지 않았어. 그 문서들은 다음 요청에 다시 나와.`
          : `${omitted} more pages citing these sources also need review and are not listed here; a later request names them.`]),
    '',
  ];
}

function assembleCompileBrief({
  locale,
  execution,
  vaultRoot,
  paths,
  existing,
  review,
  sections,
  rules,
}: {
  locale: string;
  execution: "acp" | "local";
  vaultRoot: string;
  paths: string;
  existing: string;
  review: readonly string[];
  sections: string;
  rules: string;
}): string {
  if (execution === "local") {
    return buildLocalBrief({ locale, vaultRoot, paths, existing: [existing, ...review].join("\n"), sections, rules });
  }

  if (locale === "ko") {
    return [
      "이 폴더의 자료를 읽고 위키 문서를 써 줘. 형식은 아래 템플릿 그대로여야 해.",
      "",
      `폴더: ${vaultRoot}`,
      "",
      "읽을 파일 (이 폴더 기준 경로):",
      paths,
      "",
      "PDF 는 네 도구로 그대로 읽어. DOCX·XLSX·CSV·텍스트는 `read_source` 도구로 읽어: 인용에 쓸 앵커(`h:`, `s2r14`, `r89`, `l204`)가 단위마다 붙어서 와. 이 파일들을 셸 명령으로 읽지는 마.",
      `결과는 \`${WIKI_DIR}/<주제>.md\` 로 쓰거나 이미 있으면 고쳐 줘.`,
      `본문 순서는 고정이야: ${sections}. 빈 절도 지우지 말고 남겨.`,
      "",
      existing,
      "",
      ...review,
      "규칙:",
      rules,
      "",
      "템플릿 (이 모양 그대로, 다른 모양은 거절돼):",
      "```markdown",
      WIKI_PAGE_TEMPLATE.trimEnd(),
      "```",
      "",
      "`validate_wiki` 를 통과하지 못하는 문서는 위키 목록에 첫 문제 코드와 함께 떠. 문서는 네 파일 편집 도구로 쓰고, 기존 위키 문서는 네가 파일을 읽는 방법으로 읽어. 읽기 전용 세션은 쓸 수 없다는 뜻이 아니라 쓰기가 사람의 답을 기다린다는 뜻이야: 편집을 보내면 Atlas 가 그 요청을 사람에게 보여 줘. 자료실의 쓰기 모드와 선택한 ACP 런타임의 권한에 따라 형식에 맞는 문서도 검토가 필요할 수 있어. 이 요청은 자동 쓰기를 무조건 약속하지 않아.",
    ].join("\n");
  }

  return [
    "Read the raw sources in this folder and write them up as wiki pages. The shape is the template below, exactly.",
    "",
    `Folder: ${vaultRoot}`,
    "",
    "Files to read (paths relative to this folder):",
    paths,
    "",
    "Read a PDF with your own reader. Read a DOCX, XLSX, CSV or text file through the `read_source` tool: it returns the text in the units a citation names, each with its anchor (`h:`, `s2r14`, `r89`, `l204`). Do not shell out for them. Atlas converts nothing and keeps nothing converted.",
    `Write or update \`${WIKI_DIR}/<topic>.md\`.`,
    `The body order is fixed: ${sections}. Keep an empty section rather than dropping it.`,
    "",
    existing,
    "",
    ...review,
    "Rules:",
    rules,
    "",
    "The template — write only this shape; a page that fails `validate_wiki` is listed in the Wiki with its first problem code:",
    "```markdown",
    WIKI_PAGE_TEMPLATE.trimEnd(),
    "```",
    "",
    "Write each page with your own file-edit tool, and read an existing page the way you read any file. A read-only session means a write waits for the person's answer, not that it cannot be made: send the edit and Atlas shows them the request. The Library write mode and the selected ACP runtime's permissions govern approval; this brief does not promise an automatic write for a fitting page.",
  ].join("\n");
}

export function buildCompileBrief(input: CompileBriefInput): string {
  return withAnswerLanguage(composeCompileBrief(input), input.locale);
}
