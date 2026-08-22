import { evaluateQuantifiedCompetencyCoverage } from "./competency-coverage.mjs";

/**
 * Deterministic project-meaning assessment.
 *
 * This module deliberately does not calculate a score. Structural readiness,
 * competency evidence, and source currentness stay separate so one healthy
 * dimension cannot hide a gap in another.
 */

import { PROJECT_SOURCE_GAP_IDS as SOURCE_GAP_IDS } from "./project-source-vocabulary.mjs";

export const MEANING_ASSESSMENT_CONTRACT = "meaningAssessment:v1";
export const MEANING_COMPETENCY_CONTRACT = "meaningCompetency:v1";
export const MEANING_COMPETENCY_EVALUATOR = "meaningProposalValidator:v1";
export const MEANING_WITNESS_INVENTORY_CONTRACT = "meaningWitnessInventory:v1";

export const MEANING_COMPETENCY_QUESTIONS = Object.freeze([
  Object.freeze({
    id: "scope",
    type: "scoping",
    question: "What product/system outcome and user problem define the ontology scope?",
    priority: "core",
    requiredWitnesses: Object.freeze(["concepts", "evidence"]),
  }),
  Object.freeze({
    id: "domains",
    type: "scoping",
    question: "Which stable business responsibilities or decision boundaries form its domains?",
    priority: "core",
    requiredWitnesses: Object.freeze(["concepts", "relations", "evidence"]),
  }),
  Object.freeze({
    id: "abilities",
    type: "validation",
    question: "Which observable abilities realize those outcomes inside each domain?",
    priority: "core",
    requiredWitnesses: Object.freeze(["concepts", "relations", "evidence"]),
  }),
  Object.freeze({
    id: "evidence",
    type: "validation",
    question: "Which source artifacts provide implementation evidence for each ability?",
    priority: "core",
    requiredWitnesses: Object.freeze(["concepts", "evidence", "paths"]),
  }),
  Object.freeze({
    id: "impact",
    type: "relationship",
    question: "Which typed dependencies explain change impact across the model?",
    priority: "core",
    requiredWitnesses: Object.freeze(["concepts", "relations", "evidence"]),
  }),
]);

const QUESTION_STATUSES = new Set(["answered", "partial", "visible-gap"]);
const STRUCTURE_STATUS_NORMALIZATION = new Map([
  ["ready", "ready"],
  ["needs_structure", "needs_structure"],
  ["needs_attention", "needs_structure"],
  ["needs_shape", "needs_structure"],
  ["needs-links", "needs_structure"],
  ["needs-shape", "needs_structure"],
  ["invalid", "invalid"],
]);
const SOURCE_STATUSES = new Set([
  "not_measured",
  "needs_evidence",
  "review_required",
  "invalid",
  "verified_current",
]);
const SOURCE_CURRENTNESS = new Set(["current", "stale", "unavailable"]);

function safeVaultSlug(value, maxLength = 300) {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > maxLength
    || value.trim() !== value
    || value.startsWith("/")
    || /^[A-Za-z]:[\\/]/.test(value)
    || value.includes("\\")
    || /[\u0000-\u001f\u007f]/u.test(value)
  ) return false;
  return value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function safeProjectSlug(value) {
  return safeVaultSlug(value, 200);
}

function safeGraphHash(value) {
  return typeof value === "string" && /^project-graph-v1:[a-f0-9]{8}$/.test(value);
}

function safeOpaque(value) {
  return typeof value === "string"
    && value.length <= 200
    && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value);
}

function safeConceptSlug(value) {
  return safeVaultSlug(value);
}

export function normalizeMeaningStructureStatus(value) {
  return STRUCTURE_STATUS_NORMALIZATION.get(value) ?? "invalid";
}

function safeRelativePath(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 500) return false;
  const normalized = value.replaceAll("\\", "/");
  return !normalized.startsWith("/")
    && !/^[A-Za-z]:\//.test(normalized)
    && !normalized.split("/").includes("..")
    && !normalized.includes("\0");
}

function safeMeasuredAt(value) {
  if (typeof value !== "string") return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function safeRelation(value) {
  return value
    && typeof value === "object"
    && safeConceptSlug(value.from)
    && safeConceptSlug(value.to)
    && safeOpaque(value.type);
}

function relationKey(value) {
  return `${value.from}\0${value.to}\0${value.type}`;
}

function normalizeInventory(value) {
  const kindEntries = value?.kinds && typeof value.kinds === "object" && !Array.isArray(value.kinds)
    ? Object.entries(value.kinds)
    : [];
  const valid = value
    && value.contract === MEANING_WITNESS_INVENTORY_CONTRACT
    && safeGraphHash(value.graphHash)
    && safeOpaque(value.sourceFingerprint)
    && Array.isArray(value.concepts)
    && value.concepts.every(safeConceptSlug)
    && new Set(value.concepts).size === value.concepts.length
    && Array.isArray(value.relations)
    && value.relations.every(safeRelation)
    && new Set(value.relations.map(relationKey)).size === value.relations.length
    && Array.isArray(value.evidence)
    && value.evidence.every(safeRelativePath)
    && new Set(value.evidence).size === value.evidence.length
    && Array.isArray(value.paths)
    && value.paths.every(safeRelativePath)
    && new Set(value.paths).size === value.paths.length
    && kindEntries.every(([slug, kind]) => safeConceptSlug(slug) && safeOpaque(kind));
  return {
    valid,
    graphHash: valid ? value.graphHash : null,
    sourceFingerprint: valid ? value.sourceFingerprint : null,
    concepts: new Set(valid ? value.concepts : []),
    kinds: new Map(valid ? kindEntries : []),
    relations: new Set(valid ? value.relations.map(relationKey) : []),
    evidence: new Set(valid ? value.evidence : []),
    paths: new Set(valid ? value.paths : []),
  };
}

function normalizeQuestions(competency, projectSlug) {
  /*
   * **Separate "not written yet" from "broken"** (measured 2026-08-17).
   *
   * Checking a freshly created vault produced `assessment_input_invalid`. `init`
   * does not create the competency-question block, and the block being **absent**
   * was collapsed into `malformed` below. So a newborn vault declared itself
   * broken and the user concluded they had broken it.
   *
   * The verdict is unchanged (the meaning genuinely is not confirmed yet). What
   * changes is **the name and the remedy**: say it was not written, and say what
   * to do about it.
   */
  const absent = competency === null || competency === undefined;
  const rows = Array.isArray(competency?.questions) ? competency.questions : [];
  const inventory = normalizeInventory(competency?.inventory);
  const byId = new Map();
  let malformed = competency?.contract !== MEANING_COMPETENCY_CONTRACT
    || competency?.receiptVersion !== 1
    || competency?.evaluator !== MEANING_COMPETENCY_EVALUATOR
    || !inventory.valid
    || !safeGraphHash(competency?.graphHash);

  for (const row of rows) {
    const contract = MEANING_COMPETENCY_QUESTIONS.find(({ id }) => id === row?.id);
    const witnesses = row?.witnesses;
    const witnessShapeValid = witnesses
      && typeof witnesses === "object"
      && Array.isArray(witnesses.concepts)
      && witnesses.concepts.every(safeConceptSlug)
      && Array.isArray(witnesses.relations)
      && witnesses.relations.every(safeRelation)
      && Array.isArray(witnesses.evidence)
      && witnesses.evidence.every(safeRelativePath)
      && Array.isArray(witnesses.paths)
      && witnesses.paths.every(safeRelativePath)
      && Array.isArray(row.unresolvedWitnesses)
      && row.unresolvedWitnesses.every(safeOpaque);
    if (
      !contract
      || byId.has(row.id)
      || !QUESTION_STATUSES.has(row.status)
      || !witnessShapeValid
    ) {
      malformed = true;
      continue;
    }

    const requiredWitnessesPresent = contract.requiredWitnesses.every(
      (key) => witnesses[key].length > 0,
    );
    const impactDependencyPresent = contract.id !== "impact"
      || witnesses.relations.some((relation) => relation.type === "depends_on");
    const witnessesResolve = witnesses.concepts.every((slug) => inventory.concepts.has(slug))
      && witnesses.relations.every((relation) => inventory.relations.has(relationKey(relation)))
      && witnesses.evidence.every((path) => inventory.evidence.has(path))
      && witnesses.paths.every((path) => inventory.paths.has(path));
    const quantifiedCoverage = competencyCoverage({
      id: contract.id,
      projectSlug,
      inventory,
      witnesses,
    });
    const witnessStatus = requiredWitnessesPresent
      && impactDependencyPresent
      && witnessesResolve
      && (!quantifiedCoverage || quantifiedCoverage.uncovered.length === 0)
      && row.unresolvedWitnesses.length === 0
      ? "resolved"
      : "missing";
    byId.set(row.id, { id: row.id, status: row.status, witnessStatus });
  }

  return {
    malformed,
    absent,
    inventory,
    questions: MEANING_COMPETENCY_QUESTIONS.map(({ id }) => (
      byId.get(id) ?? { id, status: "unassessed", witnessStatus: "unavailable" }
    )),
  };
}

function competencyCoverage({ id, projectSlug, inventory, witnesses }) {
  if (!safeProjectSlug(projectSlug)) return null;
  const relations = [...inventory.relations].map((key) => {
    const [from, to, type] = key.split("\0");
    return { from, to, type };
  });
  const hasKindInventory = inventory.kinds.size > 0;
  const capabilityParents = new Set(relations
    .filter((row) => row.type === "capabilities" || row.type === "contains")
    .map((row) => row.from));
  const domains = relations.filter((row) =>
    row.from === projectSlug
    && (row.type === "domains" || row.type === "contains")
    && (hasKindInventory
      ? inventory.kinds.get(row.to) === "domain"
      : capabilityParents.has(row.to)))
    .map((row) => ({ slug: row.to }));
  const domainSlugs = new Set(domains.map((row) => row.slug));
  const capabilities = relations
    .filter((row) =>
      domainSlugs.has(row.from)
      && (row.type === "capabilities" || row.type === "contains")
      && (!hasKindInventory || inventory.kinds.get(row.to) === "capability"))
    .map((row) => ({ slug: row.to, domain: row.from }));
  return evaluateQuantifiedCompetencyCoverage({ id, domains, capabilities, witnesses });
}

function sourceReceiptMalformed(source) {
  if (!source || !SOURCE_STATUSES.has(source.status) || !SOURCE_CURRENTNESS.has(source.currentness)) {
    return true;
  }
  if (source.topGapId !== null && source.topGapId !== undefined && !SOURCE_GAP_IDS.has(source.topGapId)) {
    return true;
  }
  if (source.receiptContractVersion !== undefined && source.receiptContractVersion !== null) {
    if (source.receiptContractVersion !== 1) return true;
  }
  if (source.status === "verified_current" && source.topGapId != null) return true;
  if (source.status === "review_required" && source.topGapId == null) return true;
  if (!new Set(["verified_current", "review_required"]).has(source.status)) return false;
  return source.receiptContractVersion !== 1
    || !safeGraphHash(source.graphHash)
    || !safeOpaque(source.sourceId)
    || !safeOpaque(source.sourceRevision)
    || !safeOpaque(source.sourceFingerprint)
    || !safeMeasuredAt(source.measuredAt);
}

function result(input, normalized, status, topGap, nextAction) {
  const sourceStatus = SOURCE_STATUSES.has(input.source?.status)
    ? input.source.status
    : "invalid";
  const currentness = SOURCE_CURRENTNESS.has(input.source?.currentness)
    ? input.source.currentness
    : "unavailable";
  const competencyAnswered = normalized.questions.every(
    (row) => row.status === "answered" && row.witnessStatus === "resolved",
  );
  return {
    contract: MEANING_ASSESSMENT_CONTRACT,
    projectSlug: safeProjectSlug(input.projectSlug) ? input.projectSlug : null,
    status,
    dimensions: {
      structure: {
        status: normalizeMeaningStructureStatus(input.structure?.status),
        basis: "structure_only",
      },
      competency: {
        status: competencyAnswered ? "answered" : "needs_evidence",
        questions: normalized.questions,
      },
      source: { status: sourceStatus, currentness },
    },
    topGap,
    nextAction,
    provenance: {
      evaluator: MEANING_ASSESSMENT_CONTRACT,
      graphHash: safeGraphHash(input.graphHash) ? input.graphHash : null,
      competencyContract: input.competency?.contract === MEANING_COMPETENCY_CONTRACT
        ? MEANING_COMPETENCY_CONTRACT
        : null,
      competencyEvaluator: input.competency?.evaluator === MEANING_COMPETENCY_EVALUATOR
        ? MEANING_COMPETENCY_EVALUATOR
        : null,
      competencyGraphHash: safeGraphHash(input.competency?.graphHash)
        ? input.competency.graphHash
        : null,
      witnessInventoryContract:
        input.competency?.inventory?.contract === MEANING_WITNESS_INVENTORY_CONTRACT
          ? MEANING_WITNESS_INVENTORY_CONTRACT
          : null,
      witnessInventoryGraphHash: safeGraphHash(input.competency?.inventory?.graphHash)
        ? input.competency.inventory.graphHash
        : null,
      witnessInventorySourceFingerprint: safeOpaque(
        input.competency?.inventory?.sourceFingerprint,
      )
        ? input.competency.inventory.sourceFingerprint
        : null,
      sourceGraphHash: safeGraphHash(input.source?.graphHash) ? input.source.graphHash : null,
      sourceReceiptContractVersion: input.source?.receiptContractVersion === 1 ? 1 : null,
      sourceId: safeOpaque(input.source?.sourceId) ? input.source.sourceId : null,
      sourceRevision: safeOpaque(input.source?.sourceRevision) ? input.source.sourceRevision : null,
      sourceFingerprint: safeOpaque(input.source?.sourceFingerprint)
        ? input.source.sourceFingerprint
        : null,
      sourceMeasuredAt: safeMeasuredAt(input.source?.measuredAt) ? input.source.measuredAt : null,
      sourceGapId: SOURCE_GAP_IDS.has(input.source?.topGapId) ? input.source.topGapId : null,
    },
  };
}

/**
 * Derive a categorical assessment from versioned evidence receipts.
 * Unknown input fields are intentionally ignored so private source coordinates
 * cannot leak into a handoff by object spreading.
 */
export function deriveMeaningAssessment(input) {
  const safeInput = input && typeof input === "object" ? input : {};
  const normalized = normalizeQuestions(safeInput.competency, safeInput.projectSlug);
  const sourceStatus = safeInput.source?.status;
  const currentness = safeInput.source?.currentness;
  const rawStructureStatus = safeInput.structure?.status;
  const structureStatus = normalizeMeaningStructureStatus(rawStructureStatus);

  const inputBroken =
    !safeProjectSlug(safeInput.projectSlug)
    || !safeGraphHash(safeInput.graphHash)
    || !STRUCTURE_STATUS_NORMALIZATION.has(rawStructureStatus)
    || sourceReceiptMalformed(safeInput.source);

  // If something else is wrong, say that first — "not written yet" masking a real
  // defect sends the user to fix the wrong place.
  if (inputBroken || (normalized.malformed && !normalized.absent)) {
    return result(
      safeInput,
      normalized,
      "invalid",
      { dimension: "assessment", id: "assessment_input_invalid" },
      { id: "repair_assessment_input" },
    );
  }

  // The competency answers are **not there yet**. That is work not done, not
  // breakage, and the name and remedy must say so — otherwise a brand-new vault
  // reports itself broken.
  if (normalized.absent) {
    return result(
      safeInput,
      normalized,
      "invalid",
      { dimension: "competency", id: "competency_not_authored" },
      { id: "author_competency_answers" },
    );
  }

  if (structureStatus === "invalid" || sourceStatus === "invalid") {
    return result(
      safeInput,
      normalized,
      "invalid",
      {
        dimension: structureStatus === "invalid" ? "structure" : "source",
        id: structureStatus === "invalid" ? "structure_not_ready" : "source_receipt_invalid",
      },
      { id: structureStatus === "invalid" ? "repair_ontology_structure" : "repair_source_receipt" },
    );
  }

  if (sourceStatus === "not_measured" || sourceStatus === "needs_evidence") {
    return result(
      safeInput,
      normalized,
      "needs_evidence",
      { dimension: "source", id: safeInput.source.topGapId ?? "source_evidence_missing" },
      { id: "measure_source" },
    );
  }

  if (safeInput.source.graphHash !== safeInput.graphHash) {
    return result(
      safeInput,
      normalized,
      "review_required",
      { dimension: "source", id: "ontology_changed" },
      { id: "remeasure_source" },
    );
  }
  if (currentness === "stale") {
    return result(
      safeInput,
      normalized,
      "review_required",
      { dimension: "source", id: safeInput.source.topGapId ?? "source_changed" },
      { id: "remeasure_source" },
    );
  }
  if (currentness === "unavailable") {
    return result(
      safeInput,
      normalized,
      "review_required",
      { dimension: "source", id: "source_currentness_unavailable" },
      { id: "verify_source_currentness" },
    );
  }
  if (sourceStatus === "review_required") {
    return result(
      safeInput,
      normalized,
      "review_required",
      { dimension: "source", id: safeInput.source.topGapId ?? "source_review_required" },
      { id: "review_source_evidence" },
    );
  }
  if (
    safeInput.competency.graphHash !== safeInput.graphHash
    || normalized.inventory.graphHash !== safeInput.graphHash
  ) {
    return result(
      safeInput,
      normalized,
      "review_required",
      { dimension: "competency", id: "competency_ontology_changed" },
      { id: "reevaluate_competency" },
    );
  }
  if (normalized.inventory.sourceFingerprint !== safeInput.source.sourceFingerprint) {
    return result(
      safeInput,
      normalized,
      "review_required",
      { dimension: "competency", id: "competency_source_changed" },
      { id: "reevaluate_competency" },
    );
  }

  const incomplete = normalized.questions.find(
    (row) => row.status !== "answered" || row.witnessStatus !== "resolved",
  );
  if (incomplete) {
    return result(
      safeInput,
      normalized,
      "needs_evidence",
      {
        dimension: "competency",
        id: "competency_question_incomplete",
        questionId: incomplete.id,
      },
      { id: "resolve_competency_question", target: incomplete.id },
    );
  }

  if (structureStatus !== "ready") {
    return result(
      safeInput,
      normalized,
      "needs_evidence",
      { dimension: "structure", id: "structure_not_ready" },
      { id: "repair_ontology_structure" },
    );
  }

  return result(
    safeInput,
    normalized,
    "verified_current",
    null,
    { id: "use_current_evidence" },
  );
}
