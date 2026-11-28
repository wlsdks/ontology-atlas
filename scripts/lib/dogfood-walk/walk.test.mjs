#!/usr/bin/env node
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { QUERY_ONTOLOGY_OPERATIONS } from "../../../mcp/scripts/verify/server-vocabularies.mjs";
import { stderrWarnings, stepFailure } from "./run-dogfood-walk.mjs";
import {
  OPERATIONS_NOT_WALKED,
  selectTargets,
  walkOperationNames,
  walkRequests,
  walkSteps,
} from "./walk-requests.mjs";

const page = (nodes) => ({ nodes });
const TARGETS = selectTargets({
  projects: page([{ kind: "project", slug: "project/atlas" }]),
  domains: page([{ kind: "domain", slug: "domains/vault" }]),
  capabilities: page([
    { kind: "capability", slug: "capabilities/no-domain", domain: "domains/missing" },
    { kind: "capability", slug: "capabilities/read", domain: "domains/vault" },
    { kind: "capability", slug: "capabilities/write", domain: "domains/vault" },
  ]),
});

const answer = (payload, { isError = false, structured = payload } = {}) => ({
  id: 1,
  result: {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    ...(structured === undefined ? {} : { structuredContent: structured }),
    ...(isError ? { isError: true } : {}),
  },
});

describe("dogfood walk targets and steps", () => {
  it("walks a capability whose domain exists, beside a second capability", () => {
    assert.deepEqual(TARGETS, {
      projectSlug: "project/atlas",
      domainSlug: "domains/vault",
      capabilitySlug: "capabilities/read",
      otherCapabilitySlug: "capabilities/no-domain",
    });
    assert.throws(
      () => selectTargets({ projects: page([]), domains: page([]), capabilities: page([]) }),
      /needs a project/,
    );
  });

  it("asks every query operation the engine answers, so a new operation cannot go unwalked", () => {
    const walked = new Set([...walkOperationNames(TARGETS), ...OPERATIONS_NOT_WALKED]);
    assert.deepEqual([...QUERY_ONTOLOGY_OPERATIONS].filter((operation) => !walked.has(operation)), []);
    assert.deepEqual([...walked].filter((operation) => !QUERY_ONTOLOGY_OPERATIONS.includes(operation)), []);
  });

  it("gives every request its own id", () => {
    const steps = walkSteps(TARGETS, { repositoryRoot: "/repo" });
    const ids = walkRequests(steps).flatMap((request) => (request.id === undefined ? [] : [request.id]));
    assert.equal(new Set(ids).size, ids.length);
  });
});

describe("dogfood walk answer checks", () => {
  const stepOf = (expect) => ({ expect });

  it("passes an answer whose structuredContent equals its text and fails one that differs", () => {
    assert.equal(stepFailure(stepOf({ kind: "ok" }), answer({ total: 1 })), null);
    assert.match(stepFailure(stepOf({ kind: "ok" }), answer({ total: 1 }, { structured: { total: 2 } })), /mismatch/);
    assert.match(stepFailure(stepOf({ kind: "ok" }), answer({ error: "x" }, { isError: true })), /refused/);
    assert.equal(stepFailure(stepOf({ kind: "ok" }), undefined), "no answer");
  });

  it("holds a refusal to the sentence it must carry", () => {
    const step = stepOf({ kind: "refused", sentence: "Unknown argument" });
    assert.equal(stepFailure(step, { id: 1, result: { isError: true, content: [{ text: "Unknown argument nope" }] } }), null);
    assert.match(stepFailure(step, { id: 1, result: { isError: true, content: [{ text: "other" }] } }), /does not say/);
    assert.equal(stepFailure(step, answer({ total: 1 })), "was not refused");
  });

  it("holds a preview to dryRun:true and ok:false", () => {
    const step = stepOf({ kind: "dryRun" });
    assert.equal(stepFailure(step, answer({ ok: false, dryRun: true })), null);
    assert.match(stepFailure(step, answer({ ok: true, dryRun: false })), /dryRun:true and ok:false/);
  });

  it("ignores the connection notice on stderr and keeps any other line", () => {
    assert.deepEqual(stderrWarnings("[ontology-atlas-mcp] connected. vault=/v\n\nwarning: slow\n"), ["warning: slow"]);
  });
});
