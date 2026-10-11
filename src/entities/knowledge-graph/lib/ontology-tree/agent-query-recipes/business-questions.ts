import { AGENT_GRAPH_DB_RUNTIME_GATE_COMMAND } from "../agent-readiness";
import { DEFAULT_BUSINESS_ONTOLOGY_LENS } from "@/shared/lib/ontology-graph/business-ontology-lens";
import { formatAgentGraphDbQueryPackItemPrompt } from "./graph-db-query-pack";
import { formatAgentMcpQueryPayload } from "./mcp-payloads";
import { formatAgentQueryCallCliCommand, uniqueString } from "./query-recipes";
import type { AgentBusinessQuestionFocus, AgentGraphDbQueryPackItem } from "./types";

export function formatAgentBusinessQuestionBrief(
  items: readonly AgentGraphDbQueryPackItem[],
): string {
  const businessQuestions = items.find((item) => item.id === "business_questions");
  const readOrder = DEFAULT_BUSINESS_ONTOLOGY_LENS.readOrder.join(" -> ");
  const questions = DEFAULT_BUSINESS_ONTOLOGY_LENS.decisionQuestions.map(
    (question, index) => `${index + 1}. ${question}`,
  );
  const guidance = DEFAULT_BUSINESS_ONTOLOGY_LENS.guidance.map((item) => `- ${item}`);
  const pack = businessQuestions
    ? [
        "",
        "Graph DB query pack item: business_questions",
        formatAgentGraphDbQueryPackItemPrompt(businessQuestions),
      ]
    : [
        "",
        "Graph DB query pack item: business_questions is missing. Stop and run agent_brief or refresh the app bundle before making a business claim.",
      ];

  return [
    "# Business ontology decision brief",
    "",
    `Read order: ${readOrder}`,
    ...guidance,
    "",
    "Decision questions to answer with graph evidence:",
    ...questions,
    "",
    "Evidence contract:",
    "- Business outcome: report facets distribution and domain_matrix pressure before deciding which outcome the ontology should explain.",
    "- Domain boundary: report query_plan(match_nodes), match_nodes totalMatches/limited/followUp, and domain_matrix coupling.",
    "- Capability claim: report query_plan(match_nodes kind=capability), capability totalMatches/limited/followUp, and the human decision language before citing implementation evidence.",
    "- Implementation evidence: report capability -> element match_edges totalMatches/limited/followUp before citing paths, APIs, routes, or commands.",
    "",
    "Required answer shape:",
    "- Outcome: name the business outcome, cite graph facets/domain pressure, then state the decision this changes.",
    "- Boundary: name the domain boundary, cite coupling or containment evidence, then state what belongs inside/outside it.",
    "- Claim: write the human capability claim first, cite capability graph evidence second, and only then mention implementation proof.",
    "- Evidence: list capability -> element proof rows with followUp evidence, and mark whether each row proves, disproves, or needs review.",
    `- Runtime gate: ${AGENT_GRAPH_DB_RUNTIME_GATE_COMMAND}`,
    ...pack,
  ].join("\n");
}

export function formatAgentBusinessQuestionHandoff(
  items: readonly AgentGraphDbQueryPackItem[],
  focus: AgentBusinessQuestionFocus,
): string {
  const businessQuestions = items.find((item) => item.id === "business_questions");
  const focusConfig = {
    outcome: {
      title: "Business outcome",
      question: DEFAULT_BUSINESS_ONTOLOGY_LENS.decisionQuestions[0],
      evidence:
        "Report facets distribution and domain_matrix pressure before deciding which business outcome the ontology should explain or improve.",
      acceptance: DEFAULT_BUSINESS_ONTOLOGY_LENS.decisionAnswerCriteria[0],
      payloadIndexes: [0, 3],
    },
    boundary: {
      title: "Domain boundary",
      question: DEFAULT_BUSINESS_ONTOLOGY_LENS.decisionQuestions[1],
      evidence:
        "Report query_plan(match_nodes), match_nodes totalMatches/limited/followUp, and domain_matrix coupling before changing a business/product boundary.",
      acceptance: DEFAULT_BUSINESS_ONTOLOGY_LENS.decisionAnswerCriteria[1],
      payloadIndexes: [1, 2, 3],
    },
    claim: {
      title: "Capability claim",
      question: DEFAULT_BUSINESS_ONTOLOGY_LENS.decisionQuestions[2],
      evidence:
        "Report query_plan(match_nodes kind=capability), capability totalMatches/limited/followUp, and the human decision language before turning source paths into a product claim.",
      acceptance: DEFAULT_BUSINESS_ONTOLOGY_LENS.decisionAnswerCriteria[2],
      payloadIndexes: [4, 5],
    },
    evidence: {
      title: "Implementation evidence",
      question: DEFAULT_BUSINESS_ONTOLOGY_LENS.decisionQuestions[3],
      evidence:
        "Report capability -> element match_edges totalMatches/limited/followUp before citing paths, APIs, routes, or commands.",
      acceptance: DEFAULT_BUSINESS_ONTOLOGY_LENS.decisionAnswerCriteria[3],
      payloadIndexes: [6, 7],
    },
  } satisfies Record<
    AgentBusinessQuestionFocus,
    {
      title: string;
      question: string;
      evidence: string;
      acceptance: string;
      payloadIndexes: number[];
    }
  >;
  const config = focusConfig[focus];
  const payloads =
    businessQuestions?.payloads.filter((_, index) => config.payloadIndexes.includes(index)) ?? [];
  const mcpCalls = payloads.length
    ? payloads.map(
        (payload, index) => `${index + 1}. ${payload.operation}\n${formatAgentMcpQueryPayload(payload)}`,
      )
    : [
        "business_questions payloads are missing. Stop and run query_ontology(agent_brief) or refresh the app bundle.",
      ];
  const cliCommands = payloads
    .map(formatAgentQueryCallCliCommand)
    .filter((command): command is string => command !== null)
    .filter(uniqueString);
  const cliFallback =
    cliCommands.length > 0
      ? [
          "",
          "CLI fallback:",
          ...cliCommands.map((command, index) => `${index + 1}. ${command}`),
        ]
      : [];

  return [
    "# Business ontology question handoff",
    "",
    `Question focus: ${config.title}`,
    `Question: ${config.question}`,
    `Read order: ${DEFAULT_BUSINESS_ONTOLOGY_LENS.readOrder.join(" -> ")}`,
    "",
    "Evidence to report:",
    `- ${config.evidence}`,
    "- Scan rows remain candidates until totalMatches, limited, and followUp are reported.",
    "",
    "Acceptance criteria:",
    `- ${config.acceptance}`,
    "- Reject path-only, API-only, route-only, or command-only answers as implementation notes, not business ontology evidence.",
    "",
    "Required answer shape:",
    ...formatBusinessQuestionAnswerShape(focus),
    `- Runtime gate: ${AGENT_GRAPH_DB_RUNTIME_GATE_COMMAND}`,
    "",
    "MCP calls:",
    ...mcpCalls,
    ...cliFallback,
  ].join("\n");
}

function formatBusinessQuestionAnswerShape(focus: AgentBusinessQuestionFocus): string[] {
  const answerShape = {
    outcome: [
      "- Outcome: <business outcome the ontology should explain or improve>",
      "- Graph evidence: <facets distribution + domain_matrix pressure>",
      "- Decision: <what planner/leader/developer should do differently>",
    ],
    boundary: [
      "- Boundary: <business/product domain boundary>",
      "- Graph evidence: <domain match_nodes totals + coupling rows>",
      "- Decision: <what belongs inside/outside this boundary>",
    ],
    claim: [
      "- Claim: <planner/marketer/leader-readable capability claim>",
      "- Graph evidence: <capability match_nodes totals + followUp detail>",
      "- Implementation proof to check next: <element/edge evidence, not a path-only claim>",
    ],
    evidence: [
      "- Capability: <capability claim under review>",
      "- Proof rows: <capability -> element match_edges with followUp evidence>",
      "- Verdict: <proves / disproves / needs review before business claim>",
    ],
  } satisfies Record<AgentBusinessQuestionFocus, string[]>;

  return answerShape[focus];
}
