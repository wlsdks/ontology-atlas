import type {
  SkillProcessDerivation,
  SkillProcessDiagnostic,
  SkillProcessIR,
  SkillProcessPacketDiagnostic,
  SkillProcessPacketSerialization,
  SkillProcessPacketVerification,
  SkillProcessSource,
  SkillProcessStep,
} from "../model/types";
import { sha256Digest } from "./process-ir";
import { deriveStepSemanticOverlay } from "./process-semantics";

type UnknownRecord = Record<string, unknown>;

const DIGEST = /^sha256:[a-f0-9]{64}$/;
const STEP_ID = /^step:[a-f0-9]{16}$/;
const RESOURCE_KINDS = new Set(["reference", "script", "asset", "template", "example"]);
const PROCESS_DIAGNOSTIC_CODES = new Set([
  "scan_truncated",
  "skill_markdown_unsupported",
  "numbered_steps_unavailable",
  "resource_missing",
  "resource_existence_unverified",
  "resource_path_unsupported",
  "semantic_ambiguous",
]);

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function exactKeys(value: UnknownRecord, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  const object = record(value);
  if (!object) return value;
  return Object.fromEntries(
    Object.keys(object)
      .sort()
      .map((key) => [key, canonical(object[key])]),
  );
}

function canonicalText(value: unknown): string {
  return JSON.stringify(canonical(value));
}

function packetDiagnostic(
  code: SkillProcessPacketDiagnostic["code"],
  message: string,
): SkillProcessPacketDiagnostic {
  return { code, severity: "error", message };
}

function packetSource(value: unknown): SkillProcessSource | null {
  const source = record(value);
  return source && typeof source.path === "string" && typeof source.digest === "string"
    ? { path: source.path, digest: source.digest }
    : null;
}

function safeRelativePath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) return false;
  if (value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value)) return false;
  return !value.split(/[\\/]/).includes("..");
}

function validPosition(value: unknown): boolean {
  const position = record(value);
  return Boolean(
    position &&
      exactKeys(position, ["column", "line"]) &&
      Number.isSafeInteger(position.line) &&
      Number(position.line) > 0 &&
      Number.isSafeInteger(position.column) &&
      Number(position.column) > 0,
  );
}

function validSpan(value: unknown): boolean {
  const span = record(value);
  if (!span || !exactKeys(span, ["end", "start"])) return false;
  if (!validPosition(span.start) || !validPosition(span.end)) return false;
  const start = span.start as { line: number; column: number };
  const end = span.end as { line: number; column: number };
  return end.line > start.line || (end.line === start.line && end.column >= start.column);
}

function validDiagnostic(value: unknown): boolean {
  const diagnostic = record(value);
  if (!diagnostic) return false;
  const keys = [
    "code",
    "message",
    "severity",
    ...(diagnostic.sourceDigest ? ["sourceDigest"] : []),
    ...(diagnostic.sourceSpan ? ["sourceSpan"] : []),
  ];
  return (
    exactKeys(diagnostic, keys) &&
    PROCESS_DIAGNOSTIC_CODES.has(String(diagnostic.code)) &&
    (diagnostic.severity === "warning" || diagnostic.severity === "error") &&
    typeof diagnostic.message === "string" &&
    diagnostic.message.length > 0 &&
    (!diagnostic.sourceDigest ||
      (typeof diagnostic.sourceDigest === "string" && DIGEST.test(diagnostic.sourceDigest))) &&
    (!diagnostic.sourceSpan || validSpan(diagnostic.sourceSpan))
  );
}

function sameSpan(left: unknown, right: unknown): boolean {
  return canonicalText(left) === canonicalText(right);
}

function literal(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value === value.trim() &&
    !value.includes("\n") &&
    !value.includes("\r")
  );
}

function validSemanticLabel(
  value: unknown,
  step: UnknownRecord,
  sourceDigest: string,
  knownOrdinals: ReadonlySet<number>,
): boolean {
  const label = record(value);
  if (
    !label ||
    label.sourceDigest !== sourceDigest ||
    !sameSpan(label.sourceSpan, step.sourceSpan)
  ) {
    return false;
  }
  if (label.kind === "branch") {
    return (
      exactKeys(label, ["guard", "kind", "sourceDigest", "sourceSpan", "targetOrdinal"]) &&
      literal(label.guard) &&
      Number.isSafeInteger(label.targetOrdinal) &&
      knownOrdinals.has(Number(label.targetOrdinal))
    );
  }
  if (label.kind === "retry") {
    return (
      exactKeys(label, ["condition", "kind", "sourceDigest", "sourceSpan", "targetOrdinal"]) &&
      literal(label.condition) &&
      Number.isSafeInteger(label.targetOrdinal) &&
      knownOrdinals.has(Number(label.targetOrdinal))
    );
  }
  if (label.kind === "stop") {
    return (
      exactKeys(label, ["condition", "kind", "sourceDigest", "sourceSpan"]) &&
      literal(label.condition)
    );
  }
  if (label.kind === "verify") {
    return (
      exactKeys(label, ["action", "criterion", "kind", "sourceDigest", "sourceSpan", "target"]) &&
      literal(label.target) &&
      literal(label.action) &&
      literal(label.criterion)
    );
  }
  return false;
}

function validProcess(value: unknown): value is SkillProcessIR {
  const process = record(value);
  if (
    !process ||
    !exactKeys(process, [
      "diagnostics",
      "edges",
      "irVersion",
      "resources",
      "scanTruncated",
      "source",
      "steps",
    ]) ||
    process.irVersion !== "skillProcessIR:v1" ||
    process.scanTruncated !== false ||
    !Array.isArray(process.edges) ||
    process.edges.length !== 0 ||
    !Array.isArray(process.diagnostics) ||
    !process.diagnostics.every(validDiagnostic)
  ) {
    return false;
  }

  const source = record(process.source);
  if (
    !source ||
    !exactKeys(source, ["digest", "path"]) ||
    !safeRelativePath(source.path) ||
    typeof source.digest !== "string" ||
    !DIGEST.test(source.digest)
  ) {
    return false;
  }

  if (!Array.isArray(process.steps) || process.steps.length === 0) return false;
  const stepIds = new Set<string>();
  const knownOrdinals = new Set<number>();
  for (const valueStep of process.steps) {
    const step = record(valueStep);
    if (
      !step ||
      !exactKeys(step, ["exactText", "ordinal", "semanticLabels", "sourceSpan", "stepId"]) ||
      typeof step.stepId !== "string" ||
      !STEP_ID.test(step.stepId) ||
      stepIds.has(step.stepId) ||
      !Number.isSafeInteger(step.ordinal) ||
      Number(step.ordinal) < 0 ||
      typeof step.exactText !== "string" ||
      step.exactText.length === 0 ||
      !validSpan(step.sourceSpan) ||
      !Array.isArray(step.semanticLabels) ||
      step.semanticLabels.length > 1
    ) {
      return false;
    }
    stepIds.add(step.stepId);
    knownOrdinals.add(Number(step.ordinal));
  }
  const expectedSemanticDiagnostics: unknown[] = [];
  for (const valueStep of process.steps) {
    const step = record(valueStep)!;
    if (
      !(step.semanticLabels as unknown[]).every((label) =>
        validSemanticLabel(label, step, source.digest as string, knownOrdinals),
      )
    ) {
      return false;
    }
    const derived = deriveStepSemanticOverlay(
      valueStep as SkillProcessStep,
      source.digest as string,
      knownOrdinals,
    );
    if (canonicalText(derived.labels) !== canonicalText(step.semanticLabels)) return false;
    expectedSemanticDiagnostics.push(...derived.diagnostics);
  }
  const semanticDiagnostics = process.diagnostics.filter(
    (valueDiagnostic) => record(valueDiagnostic)?.code === "semantic_ambiguous",
  );
  if (canonicalText(semanticDiagnostics) !== canonicalText(expectedSemanticDiagnostics)) return false;
  for (const diagnosticValue of process.diagnostics) {
    const diagnostic = record(diagnosticValue);
    if (
      diagnostic?.code === "semantic_ambiguous" &&
      (diagnostic.severity !== "warning" ||
        diagnostic.sourceDigest !== source.digest ||
        !diagnostic.sourceSpan)
    ) {
      return false;
    }
  }

  if (!Array.isArray(process.resources)) return false;
  const resourcePaths = new Set<string>();
  for (const valueResource of process.resources) {
    const resource = record(valueResource);
    if (
      !resource ||
      !exactKeys(resource, ["exists", "kind", "path", "referencedByStepIds"]) ||
      !safeRelativePath(resource.path) ||
      resourcePaths.has(resource.path) ||
      !RESOURCE_KINDS.has(String(resource.kind)) ||
      ![true, false, null].includes(resource.exists as boolean | null) ||
      !Array.isArray(resource.referencedByStepIds) ||
      resource.referencedByStepIds.length === 0 ||
      new Set(resource.referencedByStepIds).size !== resource.referencedByStepIds.length ||
      !resource.referencedByStepIds.every(
        (stepId) => typeof stepId === "string" && stepIds.has(stepId),
      )
    ) {
      return false;
    }
    resourcePaths.add(resource.path);
  }
  return true;
}

function derivationDiagnostics(
  diagnostics: readonly SkillProcessDiagnostic[],
): SkillProcessPacketDiagnostic[] {
  return diagnostics.map((diagnostic) => ({
    code: diagnostic.code,
    severity: "error",
    message: diagnostic.message,
  }));
}

export function serializeProcessPacket(
  derivation: SkillProcessDerivation | null | undefined,
): SkillProcessPacketSerialization {
  if (!derivation) {
    return {
      state: "unavailable",
      source: null,
      diagnostics: [packetDiagnostic("packet_unavailable", "No process was provided for export.")],
    };
  }
  if (derivation.state === "unavailable") {
    return {
      state: "unavailable",
      source: derivation.source,
      diagnostics: [
        packetDiagnostic("process_unavailable", "The source process is unavailable."),
        ...derivationDiagnostics(derivation.diagnostics),
      ],
    };
  }
  const candidate: unknown = derivation.process;
  if (!validProcess(candidate)) {
    const candidateRecord = record(candidate);
    return {
      state: "unavailable",
      source: packetSource(candidateRecord?.source),
      diagnostics: [packetDiagnostic("process_invalid", "The source process is invalid.")],
    };
  }

  const payload = {
    packetVersion: "skillProcessPacket:v1" as const,
    sourceDigest: candidate.source.digest,
    process: candidate,
  };
  const packetDigest = sha256Digest(canonicalText(payload));
  const text = canonicalText({ ...payload, packetDigest });
  return {
    state: "ready",
    text,
    bytes: new TextEncoder().encode(text),
    sourceDigest: payload.sourceDigest,
    packetDigest,
  };
}

export function verifyProcessPacket(
  input: Uint8Array | string | null | undefined,
): SkillProcessPacketVerification {
  if (input == null || (typeof input === "string" ? input.length === 0 : input.byteLength === 0)) {
    return {
      state: "unavailable",
      source: null,
      diagnostics: [packetDiagnostic("packet_unavailable", "The process packet is unavailable.")],
    };
  }

  let text: string;
  let bytes: Uint8Array;
  try {
    if (typeof input === "string") {
      text = input;
      bytes = new TextEncoder().encode(input);
    } else {
      bytes = new Uint8Array(input);
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    }
  } catch {
    return {
      state: "tampered",
      source: null,
      diagnostics: [packetDiagnostic("packet_malformed", "The process packet is not valid UTF-8.")],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      state: "tampered",
      source: null,
      diagnostics: [packetDiagnostic("packet_malformed", "The process packet is not valid JSON.")],
    };
  }
  const packet = record(parsed);
  const process = record(packet?.process);
  const source = packetSource(process?.source);
  if (
    !packet ||
    !exactKeys(packet, ["packetDigest", "packetVersion", "process", "sourceDigest"]) ||
    packet.packetVersion !== "skillProcessPacket:v1" ||
    typeof packet.packetDigest !== "string" ||
    !DIGEST.test(packet.packetDigest) ||
    typeof packet.sourceDigest !== "string" ||
    !DIGEST.test(packet.sourceDigest) ||
    !validProcess(packet.process)
  ) {
    return {
      state: "tampered",
      source,
      diagnostics: [packetDiagnostic("packet_malformed", "The process packet shape is invalid.")],
    };
  }
  if (packet.sourceDigest !== packet.process.source.digest) {
    return {
      state: "tampered",
      source,
      diagnostics: [
        packetDiagnostic("source_digest_mismatch", "The packet and process source digests differ."),
      ],
    };
  }

  const payload = {
    packetVersion: packet.packetVersion,
    sourceDigest: packet.sourceDigest,
    process: packet.process,
  };
  if (sha256Digest(canonicalText(payload)) !== packet.packetDigest) {
    return {
      state: "tampered",
      source,
      diagnostics: [packetDiagnostic("packet_digest_mismatch", "The packet digest does not match.")],
    };
  }
  if (canonicalText(packet) !== text) {
    return {
      state: "tampered",
      source,
      diagnostics: [packetDiagnostic("packet_noncanonical", "The packet bytes are not canonical.")],
    };
  }

  return {
    state: "ready",
    process: packet.process,
    bytes,
    sourceDigest: packet.sourceDigest,
    packetDigest: packet.packetDigest,
  };
}
