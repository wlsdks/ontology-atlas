import { describe, expect, it } from "vitest";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  buildInsightsOrphanNodeActions,
  formatInsightsOrphanRepairMcpPacket,
  formatInsightsOrphanRepairPacket,
} from "./orphan-node-actions";

const stamp = new Date(0);

function node(
  overrides: Partial<KnowledgeGraphNode> = {},
): KnowledgeGraphNode {
  return {
    id: "capability:unowned-concept",
    title: "Unowned Concept",
    kind: "capability",
    projectIds: [],
    evidenceIds: ["capabilities/unowned-concept"],
    lastApprovedAt: stamp,
    lastApprovedBy: "test",
    ...overrides,
  };
}

describe("buildInsightsOrphanNodeActions", () => {
  it("links an open ownership question to ontology, topology health, and builder focus", () => {
    expect(buildInsightsOrphanNodeActions(node())).toEqual({
      ontologyHref: "/ontology/?node=capability%3Aunowned-concept",
      topologyHref: "/topology/?mode=health&p=capability%3Aunowned-concept",
      builderHref: "/ontology/edit/?node=capabilities%2Funowned-concept",
    });
  });

  it("keeps topology links encoded for slash-based graph ids", () => {
    expect(
      buildInsightsOrphanNodeActions(
        node({
          id: "capabilities/unowned concept",
          evidenceIds: [],
        }),
      ),
    ).toMatchObject({
      topologyHref: "/topology/?mode=health&p=capabilities%2Funowned%20concept",
      builderHref: "/ontology/edit/?node=capabilities%2Funowned%20concept",
    });
  });
});

describe("formatInsightsOrphanRepairPacket", () => {
  const labels = {
    title: "Open ownership repair",
    node: "Node",
    kind: "Kind",
    ontology: "Ontology",
    topology: "Topology health",
    builder: "Builder",
    agentChecks: "Agent checks",
    nextSteps: "Next steps",
    inspectNode: "Inspect the node in topology health mode.",
    chooseOwner: "Choose the nearest domain, capability, or project owner.",
    preflightRelation: "Run relation-check before writing frontmatter.",
    verifyHealth: "Run health after saving.",
    syncGate: "Run the post-change sync gate before handoff.",
  };

  it("exports URLs, next steps, and bounded CLI checks for an ownership repair", () => {
    const subject = node();
    const actions = buildInsightsOrphanNodeActions(subject);

    expect(
      formatInsightsOrphanRepairPacket({
        actions,
        labels,
        node: subject,
      }),
    ).toBe(`# Open ownership repair

- Node: Unowned Concept (capability:unowned-concept)
- Kind: capability
- Ontology: /ontology/?node=capability%3Aunowned-concept
- Topology health: /topology/?mode=health&p=capability%3Aunowned-concept
- Builder: /ontology/edit/?node=capabilities%2Funowned-concept

## Next steps
1. Inspect the node in topology health mode.
2. Choose the nearest domain, capability, or project owner.
3. Run relation-check before writing frontmatter.
4. Run health after saving.
5. Run the post-change sync gate before handoff.

## Agent checks
- oh-my-ontology node capabilities/unowned-concept [vault] --limit 12
- oh-my-ontology relation-check <owner-slug> capabilities/unowned-concept contains [vault]
- oh-my-ontology health [vault] --limit 5

# Post-change ontology sync gate

Run this after a non-trivial code change before handing work to Claude Code, Codex, or another collaborator.

## Runtime graph DB gate
10 checks · pnpm dogfood:graph-db

## Run when
- a domain, capability, element, or relation was introduced, renamed, split, merged, or made more explicit
- a UI, CLI, MCP, or docs change changes what this codebase is or how an agent should navigate it
- a vault write landed and the next agent needs the same graph health evidence

## MCP
1. query_ontology
{
  "tool": "query_ontology",
  "arguments": {
    "operation": "health"
  }
}

2. query_ontology
{
  "tool": "query_ontology",
  "arguments": {
    "operation": "cycles",
    "maxHops": 8
  }
}

3. query_ontology
{
  "tool": "query_ontology",
  "arguments": {
    "operation": "growth_plan",
    "limit": 20
  }
}

4. query_ontology
{
  "tool": "query_ontology",
  "arguments": {
    "operation": "maintenance_plan",
    "limit": 20
  }
}

5. validate_vault
{
  "tool": "validate_vault",
  "arguments": {}
}

## CLI fallback
1. oh-my-ontology health [vault]
2. oh-my-ontology cycles [vault] --max-hops 8
3. oh-my-ontology growth [vault] --limit 20
4. oh-my-ontology maintenance [vault] --limit 20
5. pnpm dogfood:graph-db # 10 runtime graph DB checks
6. oh-my-ontology validate [vault]

## Skip when
- typo-only, comment-only, one-line style, lint config, or test fixture changes with no ontology shape change`);
  });

  it("falls back to the graph id when the node has no evidence path", () => {
    const subject = node({ evidenceIds: [] });

    expect(
      formatInsightsOrphanRepairPacket({
        actions: buildInsightsOrphanNodeActions(subject),
        labels,
        node: subject,
      }),
    ).toContain(
      "oh-my-ontology relation-check <owner-slug> capability:unowned-concept contains [vault]",
    );
  });

  it("exports focused MCP payloads for an ownership repair", () => {
    expect(
      formatInsightsOrphanRepairMcpPacket({
        labels: {
          title: "Ownership repair MCP preflight",
          inspectNode: "Inspect node",
          preflightRelation: "Preflight owner relation",
          verifyHealth: "Verify health",
          syncGate: "Post-repair sync gate",
        },
        node: node(),
      }),
    ).toBe(`# Ownership repair MCP preflight

- Inspect node: {"operation":"node_profile","slug":"capabilities/unowned-concept","depth":2,"limit":12}
- Preflight owner relation: {"operation":"relation_check","from":"<owner-slug>","to":"capabilities/unowned-concept","type":"contains"}
- Verify health: {"operation":"health","limit":5}

## Post-repair sync gate
# Post-change ontology sync gate

Run this after a non-trivial code change before handing work to Claude Code, Codex, or another collaborator.

## Runtime graph DB gate
10 checks · pnpm dogfood:graph-db

## Run when
- a domain, capability, element, or relation was introduced, renamed, split, merged, or made more explicit
- a UI, CLI, MCP, or docs change changes what this codebase is or how an agent should navigate it
- a vault write landed and the next agent needs the same graph health evidence

## MCP
1. query_ontology
{
  "tool": "query_ontology",
  "arguments": {
    "operation": "health"
  }
}

2. query_ontology
{
  "tool": "query_ontology",
  "arguments": {
    "operation": "cycles",
    "maxHops": 8
  }
}

3. query_ontology
{
  "tool": "query_ontology",
  "arguments": {
    "operation": "growth_plan",
    "limit": 20
  }
}

4. query_ontology
{
  "tool": "query_ontology",
  "arguments": {
    "operation": "maintenance_plan",
    "limit": 20
  }
}

5. validate_vault
{
  "tool": "validate_vault",
  "arguments": {}
}

## CLI fallback
1. oh-my-ontology health [vault]
2. oh-my-ontology cycles [vault] --max-hops 8
3. oh-my-ontology growth [vault] --limit 20
4. oh-my-ontology maintenance [vault] --limit 20
5. pnpm dogfood:graph-db # 10 runtime graph DB checks
6. oh-my-ontology validate [vault]

## Skip when
- typo-only, comment-only, one-line style, lint config, or test fixture changes with no ontology shape change`);
  });
});
