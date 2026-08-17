import type {
  SkillProcessDerivation,
  SkillProcessDiagnostic,
  SkillProcessPosition,
  SkillProcessResource,
  SkillProcessResourceKind,
  SkillProcessSource,
  SkillProcessStep,
} from "../model/types";
import { classifyReferences } from "./parse-skill";
import { deriveStepSemanticOverlay } from "./process-semantics";

export interface DeriveSkillProcessInput {
  readonly relativePath: string;
  readonly text: string;
  readonly existingPaths?: ReadonlySet<string>;
  readonly scanTruncated?: boolean;
}

interface SourceLine {
  readonly number: number;
  readonly text: string;
  readonly ending: string;
}

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotateRight = (value: number, amount: number) =>
  (value >>> amount) | (value << (32 - amount));

/** Browser-safe synchronous SHA-256 over UTF-8 bytes. */
export function sha256Digest(text: string): string {
  const input = new TextEncoder().encode(text);
  const bitLength = input.length * 8;
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(input);
  padded[input.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_0000_0000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);

  const hash = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const words = new Uint32Array(64);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i += 1) words[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const x = words[i - 15];
      const y = words[i - 2];
      const s0 = rotateRight(x, 7) ^ rotateRight(x, 18) ^ (x >>> 3);
      const s1 = rotateRight(y, 17) ^ rotateRight(y, 19) ^ (y >>> 10);
      words[i] = (words[i - 16] + s0 + words[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let i = 0; i < 64; i += 1) {
      const upper = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = (e & f) ^ (~e & g);
      const t1 = (h + upper + choose + SHA256_K[i] + words[i]) >>> 0;
      const lower = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (lower + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }
  return `sha256:${[...hash].map((part) => part.toString(16).padStart(8, "0")).join("")}`;
}

function sourceLines(text: string): SourceLine[] {
  const lines: SourceLine[] = [];
  let cursor = 0;
  let number = 1;
  while (cursor < text.length) {
    let end = cursor;
    while (end < text.length && text[end] !== "\n" && text[end] !== "\r") end += 1;
    let ending = "";
    if (text[end] === "\r" && text[end + 1] === "\n") ending = "\r\n";
    else if (text[end] === "\r" || text[end] === "\n") ending = text[end];
    lines.push({ number, text: text.slice(cursor, end), ending });
    cursor = end + ending.length;
    number += 1;
  }
  if (lines.length === 0) lines.push({ number: 1, text: "", ending: "" });
  return lines;
}

function unavailable(
  source: SkillProcessSource,
  scanTruncated: boolean,
  diagnostics: readonly SkillProcessDiagnostic[],
): SkillProcessDerivation {
  return { state: "unavailable", source, scanTruncated, diagnostics };
}

function resourceKind(ref: string): SkillProcessResourceKind {
  const prefix = ref.replace(/^\.\//, "").split("/", 1)[0];
  if (prefix === "scripts") return "script";
  if (prefix === "assets") return "asset";
  if (prefix === "templates") return "template";
  if (prefix === "examples") return "example";
  return "reference";
}

function dirOf(relativePath: string): string {
  const cut = relativePath.lastIndexOf("/");
  return cut === -1 ? "" : relativePath.slice(0, cut);
}

function resolveResourcePath(sourcePath: string, ref: string): string {
  const clean = ref.replace(/^\.\//, "");
  const dir = dirOf(sourcePath);
  return dir ? `${dir}/${clean}` : clean;
}

function leadingSpaces(line: string): number {
  const hit = line.match(/^ */);
  return hit?.[0].length ?? 0;
}

function endPosition(line: SourceLine): SkillProcessPosition {
  return { line: line.number, column: line.text.length + 1 };
}

/** `## 3. 제목` 처럼 **서수를 단 마크다운 제목**. */
const HEADING_ORDINAL = /^(#{1,6})[ \t]+(\d{1,9})([.)])[ \t]+(\S.*)$/;

interface HeadingHit {
  readonly index: number;
  readonly level: number;
  readonly ordinal: number;
  readonly title: string;
  readonly titleColumn: number;
}

/**
 * **절차를 제목으로 쓴 스킬을 읽는다** (2026-08-18).
 *
 * ## 왜 필요했나 — 실측
 *
 * 이 저장소의 실제 스킬 18개를 화면에 걸어 세어 보니 절차가 읽히는 것이
 * **9개뿐**이었다. 못 읽은 9개를 열어 보니 여덟이 같은 모양이었다:
 *
 *     ## 1. 서버 — 남의 서버를 재면 남의 화면을 잰다
 *     ### 0. 이 게이트가 지키는 것을 한 문장으로 쓴다
 *
 * 번호도 제목도 **원문에 명시**돼 있는데, 목록 서수만 보던 파서의 시야 밖이라
 * 「번호가 매겨진 절차를 찾지 못했어요」가 떴다. 이건 애매해서 못 읽은 것이
 * 아니라 **안 본 것**이다 — 이 스킬이 지키는 「추측하지 않는다」와는 다른 문제다.
 *
 * ## 어디까지만 하나
 *
 * - **목록 서수가 하나라도 잡히면 이 경로는 아예 안 돈다.** 지금 읽히는 9개의
 *   결과가 한 글자도 안 바뀌어야 한다는 것이 이 변경의 상한이다.
 * - **깊이가 섞이면 가장 얕은 층 하나만** 고른다. `##` 절 밑의 `###` 소절까지
 *   단계로 세면 절차가 아니라 목차가 된다.
 * - **연속해서 올라가야 하고 시작은 0 또는 1.** 「0. 준비」로 시작하는 절차는
 *   실재하는 관례라(실측 3건) 1 로만 받으면 그것들이 또 밀려난다.
 * - 코드 블록 안의 `# 1. …` 은 제목이 아니다 — 펜스 안은 건너뛴다.
 */
function headingOrdinalSteps(
  lines: readonly SourceLine[],
  from: number,
): { hits: readonly HeadingHit[]; level: number } | null {
  const hits: HeadingHit[] = [];
  let fence: { marker: "`" | "~"; length: number } | null = null;
  for (let index = from; index < lines.length; index += 1) {
    const text = lines[index].text;
    const fenceHit = text.match(/^(`{3,}|~{3,})/);
    if (fenceHit) {
      const marker = fenceHit[1][0] as "`" | "~";
      if (!fence) fence = { marker, length: fenceHit[1].length };
      else if (marker === fence.marker && fenceHit[1].length >= fence.length) fence = null;
      continue;
    }
    if (fence) continue;
    const hit = text.match(HEADING_ORDINAL);
    if (!hit) continue;
    hits.push({
      index,
      level: hit[1].length,
      ordinal: Number(hit[2]),
      title: hit[4],
      titleColumn: hit[1].length + 1 + hit[2].length + hit[3].length + 1 + 1,
    });
  }
  if (hits.length === 0) return null;

  const levels = [...new Set(hits.map((hit) => hit.level))].sort((a, b) => a - b);
  for (const level of levels) {
    const atLevel = hits.filter((hit) => hit.level === level);
    if (atLevel.length < 2) continue;
    const first = atLevel[0].ordinal;
    if (first !== 0 && first !== 1) continue;
    if (!atLevel.every((hit, offset) => hit.ordinal === first + offset)) continue;
    return { hits: atLevel, level };
  }
  return null;
}

/**
 * Extract only explicit top-level numbered Markdown list items. No control-flow or
 * default transition is inferred. Ambiguous or incomplete input stays unavailable.
 */
export function deriveSkillProcess({
  relativePath,
  text,
  existingPaths,
  scanTruncated = false,
}: DeriveSkillProcessInput): SkillProcessDerivation {
  const source = { path: relativePath, digest: sha256Digest(text) } as const;
  if (scanTruncated) {
    return unavailable(source, true, [
      {
        code: "scan_truncated",
        severity: "error",
        message: "The folder scan was truncated, so the process is unavailable.",
      },
    ]);
  }

  const lines = sourceLines(text);
  if (lines[0]?.text !== "---") {
    return unavailable(source, false, [
      {
        code: "skill_markdown_unsupported",
        severity: "error",
        message: "The SKILL.md frontmatter boundary is unsupported.",
      },
    ]);
  }
  const frontmatterEnd = lines.findIndex((line, index) => index > 0 && line.text === "---");
  if (frontmatterEnd === -1) {
    return unavailable(source, false, [
      {
        code: "skill_markdown_unsupported",
        severity: "error",
        message: "The SKILL.md frontmatter boundary is unsupported.",
      },
    ]);
  }

  const steps: SkillProcessStep[] = [];
  const parseDiagnostics: SkillProcessDiagnostic[] = [];
  const duplicateCounts = new Map<string, number>();
  let fence: { marker: "`" | "~"; length: number } | null = null;
  for (let index = frontmatterEnd + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const fenceHit = line.text.match(/^(`{3,}|~{3,})/);
    if (fenceHit) {
      const marker = fenceHit[1][0] as "`" | "~";
      if (!fence) fence = { marker, length: fenceHit[1].length };
      else if (marker === fence.marker && fenceHit[1].length >= fence.length) fence = null;
      continue;
    }
    if (fence) continue;

    if (/^\d{10,}[.)][ \t]+\S/.test(line.text) || /^\d+[.)][ \t]*$/.test(line.text)) {
      parseDiagnostics.push({
        code: "skill_markdown_unsupported",
        severity: "error",
        message: "A top-level numbered step marker is empty or outside the supported range.",
        sourceSpan: {
          start: { line: line.number, column: 1 },
          end: endPosition(line),
        },
      });
      continue;
    }

    const marker = line.text.match(/^(\d{1,9})([.)])([ \t]+)(\S[\s\S]*)$/);
    if (!marker) continue;
    const contentColumn = marker[1].length + marker[2].length + marker[3].length + 1;
    const contentIndent = contentColumn - 1;
    let lastIndex = index;
    const continuation: SourceLine[] = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const next = lines[cursor];
      if (next.text.length === 0) {
        let lookahead = cursor + 1;
        while (lookahead < lines.length && lines[lookahead].text.length === 0) lookahead += 1;
        if (
          lookahead < lines.length &&
          leadingSpaces(lines[lookahead].text) >= contentIndent
        ) {
          continuation.push(next);
          lastIndex = cursor;
          continue;
        }
        break;
      }
      if (leadingSpaces(next.text) < contentIndent) break;
      continuation.push(next);
      lastIndex = cursor;
    }

    const firstText = marker[4];
    const exactText = continuation.reduce(
      (out, next, continuationIndex) =>
        `${out}${continuationIndex === 0 ? line.ending : continuation[continuationIndex - 1].ending}${next.text}`,
      firstText,
    );
    const occurrenceKey = `${marker[1]}\0${exactText}`;
    const occurrence = (duplicateCounts.get(occurrenceKey) ?? 0) + 1;
    duplicateCounts.set(occurrenceKey, occurrence);
    const stepId = `step:${sha256Digest(`${relativePath}\0${occurrenceKey}\0${occurrence}`).slice(7, 23)}`;
    const finalLine = lines[lastIndex];
    steps.push({
      stepId,
      ordinal: Number(marker[1]),
      exactText,
      sourceSpan: {
        start: { line: line.number, column: contentColumn },
        end: endPosition(finalLine),
      },
      semanticLabels: [],
    });
    index = lastIndex;
  }

  if (parseDiagnostics.length > 0) {
    return unavailable(source, false, parseDiagnostics);
  }

  /*
   * **목록 서수가 절차를 이루지 못할 때만** 제목 서수를 본다.
   *
   * 「하나도 없을 때만」으로 짰다가 실측에서 둘을 놓쳤다(`parallel-brief` ·
   * `design-system-audit`). 그 둘은 절 **안쪽에** 번호 목록을 갖고 있어서 목록
   * 경로가 조각을 주워 오고, 그 조각들이 1..N 을 못 이뤄 「서수가 잘못됐다」로
   * 끝났다 — 정작 문서 자신은 `## 1.`~`## 7.` 로 절차를 또박또박 적어 두고
   * 있는데도. 그래서 조건을 「비었을 때」가 아니라 **「절차가 안 될 때」**로 둔다.
   * 지금 읽히는 9개는 전부 1..N 이 성립하므로 이 경로를 밟지 않는다.
   */
  const scanTextByStepId = new Map<string, string>();
  const listIsProcess = steps.length > 0 && steps.every((step, at) => step.ordinal === at + 1);
  if (!listIsProcess) {
    const heading = headingOrdinalSteps(lines, frontmatterEnd + 1);
    if (heading) {
      steps.length = 0;
      duplicateCounts.clear();
      heading.hits.forEach((hit, order) => {
        const line = lines[hit.index];
        /*
         * **카드에 싣는 것은 제목 한 줄이다.** 절 본문까지 실으면 카드 하나가
         * 예순 줄이 되어 「절차」가 아니라 문서 전문이 된다. 대신 자료(딸린
         * 파일)는 절 본문에서 찾는다 — 목록 서수 경로가 들여쓴 본문을 훑는 것과
         * 같은 자리이고, 스킬이 파일 이름을 대는 곳이 거기이기 때문이다.
         */
        const nextIndex =
          order + 1 < heading.hits.length ? heading.hits[order + 1].index : lines.length;
        const body = lines
          .slice(hit.index + 1, nextIndex)
          .map((next) => next.text)
          .join("\n");
        const occurrenceKey = `${hit.ordinal}\0${hit.title}`;
        const occurrence = (duplicateCounts.get(occurrenceKey) ?? 0) + 1;
        duplicateCounts.set(occurrenceKey, occurrence);
        const stepId = `step:${sha256Digest(`${relativePath}\0${occurrenceKey}\0${occurrence}`).slice(7, 23)}`;
        scanTextByStepId.set(stepId, `${hit.title}\n${body}`);
        steps.push({
          stepId,
          // 0 으로 시작하는 절차도 화면에서는 1 부터 센다 — 아래 연속성 검사와
          // 「단계 N개」가 같은 수를 말해야 한다. 원문 번호는 제목에 그대로 있다.
          ordinal: order + 1,
          exactText: hit.title,
          sourceSpan: {
            start: { line: line.number, column: hit.titleColumn },
            end: endPosition(line),
          },
          semanticLabels: [],
        });
      });
    }
  }

  if (steps.length === 0) {
    return unavailable(source, false, [
      {
        code: "numbered_steps_unavailable",
        severity: "error",
        message: "No supported top-level numbered steps were found.",
      },
    ]);
  }

  const ordinalsAreContiguous = steps.every(
    (step, index) => step.ordinal === index + 1,
  );
  if (!ordinalsAreContiguous) {
    return unavailable(source, false, [
      {
        code: "step_ordinals_invalid",
        severity: "error",
        message:
          "Numbered process steps must use each ordinal exactly once in ascending order.",
      },
    ]);
  }

  const diagnostics: SkillProcessDiagnostic[] = [];
  const knownOrdinals = new Set(steps.map((step) => step.ordinal));
  const semanticSteps = steps.map((step) => {
    const overlay = deriveStepSemanticOverlay(step, source.digest, knownOrdinals);
    diagnostics.push(...overlay.diagnostics);
    return { ...step, semanticLabels: overlay.labels };
  });
  const resourcesByPath = new Map<string, SkillProcessResource>();
  for (const step of semanticSteps) {
    for (const ref of classifyReferences(scanTextByStepId.get(step.stepId) ?? step.exactText)
      .bundled) {
      if (ref.replace(/^\.\//, "").split("/").includes("..")) {
        diagnostics.push({
          code: "resource_path_unsupported",
          severity: "error",
          message: `Resource path escapes the skill folder: ${ref}`,
          sourceSpan: step.sourceSpan,
        });
        continue;
      }
      const path = resolveResourcePath(relativePath, ref);
      const prior = resourcesByPath.get(path);
      if (prior) {
        if (!prior.referencedByStepIds.includes(step.stepId)) {
          resourcesByPath.set(path, {
            ...prior,
            referencedByStepIds: [...prior.referencedByStepIds, step.stepId],
          });
        }
        continue;
      }
      resourcesByPath.set(path, {
        path,
        kind: resourceKind(ref),
        exists: existingPaths ? existingPaths.has(path) : null,
        referencedByStepIds: [step.stepId],
      });
    }
  }
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return unavailable(source, false, diagnostics);
  }
  for (const resource of resourcesByPath.values()) {
    if (resource.exists === false) {
      diagnostics.push({
        code: "resource_missing",
        severity: "warning",
        message: `Referenced resource is missing: ${resource.path}`,
      });
    } else if (resource.exists === null) {
      diagnostics.push({
        code: "resource_existence_unverified",
        severity: "warning",
        message: `Referenced resource existence was not verified: ${resource.path}`,
      });
    }
  }

  return {
    state: "ready",
    process: {
      irVersion: "skillProcessIR:v1",
      source,
      scanTruncated: false,
      diagnostics,
      steps: semanticSteps,
      resources: [...resourcesByPath.values()],
      edges: [],
    },
  };
}
