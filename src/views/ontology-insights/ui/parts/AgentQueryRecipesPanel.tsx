import { Bot, GitBranch, Network, Route, SearchCheck, ShieldCheck, Workflow } from "lucide-react";
import { useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  buildAgentGraphDbQueryPack,
  buildAgentHandoffPrompt,
  buildAgentInvestigationPlaybooks,
  buildAgentQueryRecipes,
  buildAgentTraversalStrategies,
  buildAgentWriteGuardrails,
  formatAgentGuardrailPrompt,
  formatAgentPlaybookPrompt,
  formatAgentQueryCallCliCommand,
  formatAgentRecipeCliCommand,
  formatAgentRecipePayload,
  formatAgentRunOrderPrompt,
  formatAgentTraversalPacket,
  formatAgentTraversalStrategyPrompt,
  selectAgentProjectEntrypoint,
  selectAgentQueryEntrypoints,
} from "@/shared/lib/ontology-tree";
import { getTraversalGuardFacts } from "../../lib/traversal-guard-facts";
import { CopyAgentTextButton } from "./CopyAgentTextButton";

const RELATION_DECISIONS = [
  {
    key: "skip_existing",
    labelKey: "agentRelationDecisionSkipExisting",
    className:
      "border-[color:rgba(139,151,255,0.18)] bg-[color:rgba(139,151,255,0.055)]",
  },
  {
    key: "review_inverse",
    labelKey: "agentRelationDecisionReviewInverse",
    className:
      "border-[color:rgba(255,179,71,0.24)] bg-[color:rgba(255,179,71,0.065)]",
  },
  {
    key: "safe_to_add",
    labelKey: "agentRelationDecisionSafeToAdd",
    className:
      "border-[color:rgba(73,190,146,0.22)] bg-[color:rgba(73,190,146,0.065)]",
  },
  {
    key: "review_new_schema",
    labelKey: "agentRelationDecisionReviewNewSchema",
    className:
      "border-[color:rgba(229,72,77,0.22)] bg-[color:rgba(229,72,77,0.055)]",
  },
] as const;

/**
 * agent 쿼리 레시피 패널 — first-contact run order, 쿼리 entrypoint, 프로젝트
 * entrypoint, traversal 전략, write guardrail, investigation playbook, 통합
 * handoff 프롬프트. OntologyInsightsPage 모놀리스에서 가장 큰 패널(~660줄)을
 * 분리. 패널 전용 보조 컴포넌트(PlaybookChecklist · TraversalGuardFacts)와
 * 헬퍼(uniqueString)도 같은 파일에 동봉 — 이 패널 밖에서는 쓰이지 않음.
 */
export function AgentQueryRecipesPanel({
  entrypoints,
  guardrails,
  graphDbQueryPack,
  playbooks,
  projectEntrypoint,
  recipes,
  traversalStrategies,
}: {
  entrypoints: ReturnType<typeof selectAgentQueryEntrypoints>;
  guardrails: ReturnType<typeof buildAgentWriteGuardrails>;
  graphDbQueryPack: ReturnType<typeof buildAgentGraphDbQueryPack>;
  playbooks: ReturnType<typeof buildAgentInvestigationPlaybooks>;
  projectEntrypoint: ReturnType<typeof selectAgentProjectEntrypoint>;
  recipes: ReturnType<typeof buildAgentQueryRecipes>;
  traversalStrategies: ReturnType<typeof buildAgentTraversalStrategies>;
}) {
  const t = useTranslations("ontologyPages.insights");
  const handoffPrompt = useMemo(
    () =>
      buildAgentHandoffPrompt(
        recipes,
        entrypoints,
        projectEntrypoint,
        traversalStrategies,
        graphDbQueryPack,
        guardrails,
      ),
    [entrypoints, graphDbQueryPack, guardrails, projectEntrypoint, recipes, traversalStrategies],
  );
  const traversalPayloadCount = traversalStrategies.reduce(
    (count, strategy) => count + strategy.payloads.length,
    0,
  );
  const traversalCliFallbackCount = traversalStrategies
    .flatMap((strategy) => strategy.payloads)
    .map(formatAgentQueryCallCliCommand)
    .filter((command): command is string => command !== null)
    .filter(uniqueString).length;
  const firstRunRecipes = useMemo(() => recipes.slice(0, 5), [recipes]);
  const firstRunPrompt = useMemo(
    () => formatAgentRunOrderPrompt(firstRunRecipes),
    [firstRunRecipes],
  );
  const primaryRecipeCount = recipes.filter((recipe) => recipe.priority === "primary").length;
  const recipeStats = [
    {
      key: "primary",
      label: t("agentRecipeStatPrimary"),
      value: primaryRecipeCount,
    },
    {
      key: "entrypoints",
      label: t("agentRecipeStatEntrypoints"),
      value: entrypoints.length,
    },
    {
      key: "playbooks",
      label: t("agentRecipeStatPlaybooks"),
      value: playbooks.length,
    },
    {
      key: "guardrails",
      label: t("agentRecipeStatGuardrails"),
      value: guardrails.length,
    },
  ];
  const iconById = {
    agent_brief: Bot,
    workspace_brief: Bot,
    query_plan: SearchCheck,
    health: ShieldCheck,
    components: Network,
    cycles: Route,
    topological_order: Route,
    growth_plan: GitBranch,
    maintenance_plan: ShieldCheck,
    node_profile: Network,
    path: Route,
    explain_relation: SearchCheck,
    similar_nodes: SearchCheck,
    relation_check: GitBranch,
    blast_radius: Route,
    domain_matrix: Workflow,
    all_paths: Route,
    pattern_walk: Workflow,
  } satisfies Record<(typeof recipes)[number]["id"], typeof Bot>;

  return (
    <section
      className="min-w-0 md:col-span-2 rounded-2xl border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-5 py-4"
      data-testid="insights-agent-query-recipes"
    >
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            {t("agentRecipesTitle")}
          </p>
          <p className="mt-0.5 text-[11px] text-[color:var(--color-text-tertiary)]">
            {t("agentRecipesSubtitle")}
          </p>
        </div>
        <span className="rounded-full border border-[color:rgba(139,151,255,0.24)] bg-[color:rgba(139,151,255,0.08)] px-2 py-0.5 font-mono text-[10px] text-[color:rgba(184,191,255,0.92)]">
          MCP
        </span>
      </header>
      <dl className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="insights-agent-recipe-stats">
        {recipeStats.map((stat) => (
          <div
            key={stat.key}
            className="rounded-lg border border-[color:rgba(139,151,255,0.14)] bg-[color:rgba(139,151,255,0.045)] px-3 py-2"
          >
            <dt className="truncate font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
              {stat.label}
            </dt>
            <dd className="mt-1 font-mono text-sm tabular-nums text-[color:var(--color-text-primary)]">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mb-3 rounded-lg border border-[color:rgba(73,190,146,0.22)] bg-[color:rgba(73,190,146,0.055)] px-3 py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-mono text-[11px] text-[color:var(--color-text-secondary)]">
              {t("agentHandoffTitle")}
            </p>
            <p className="mt-1 break-keep text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
              {t("agentHandoffSubtitle")}
            </p>
          </div>
          <CopyAgentTextButton
            label={t("agentCopyHandoff")}
            copiedLabel={t("agentCopied")}
            text={handoffPrompt}
          />
        </div>
        <div
          className="mt-3 grid gap-2 lg:grid-cols-2"
          data-testid="insights-agent-result-contracts"
        >
          <div
            className="rounded-md border border-[color:rgba(73,190,146,0.16)] bg-[color:rgba(3,7,18,0.14)] px-2.5 py-2"
            data-testid="insights-agent-traversal-contract"
          >
            <p className="font-mono text-[10px] text-[color:rgba(151,230,198,0.92)]">
              {t("agentTraversalContractTitle")}
            </p>
            <ul className="mt-1 grid gap-1">
              {[
                "agentTraversalContractBudget",
                "agentTraversalContractPartial",
                "agentTraversalContractProof",
              ].map((key) => (
                <li
                  key={key}
                  className="break-keep rounded border border-[color:rgba(73,190,146,0.12)] bg-[color:rgba(73,190,146,0.035)] px-2 py-1.5 text-[11px] leading-4 text-[color:var(--color-text-tertiary)]"
                >
                  {t(key)}
                </li>
              ))}
            </ul>
          </div>
          <div
            className="rounded-md border border-[color:rgba(139,151,255,0.16)] bg-[color:rgba(3,7,18,0.14)] px-2.5 py-2"
            data-testid="insights-agent-scan-contract"
          >
            <p className="font-mono text-[10px] text-[color:rgba(184,191,255,0.92)]">
              {t("agentScanContractTitle")}
            </p>
            <ul className="mt-1 grid gap-1">
              {[
                "agentScanContractTotals",
                "agentScanContractNodeFollowUp",
                "agentScanContractEdgeFollowUp",
              ].map((key) => (
                <li
                  key={key}
                  className="break-keep rounded border border-[color:rgba(139,151,255,0.12)] bg-[color:rgba(139,151,255,0.04)] px-2 py-1.5 text-[11px] leading-4 text-[color:var(--color-text-tertiary)]"
                >
                  {t(key)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <div
        className="mb-3 rounded-lg border border-[color:rgba(139,151,255,0.18)] bg-[color:rgba(139,151,255,0.045)] px-3 py-3"
        data-testid="insights-agent-traversal-strategy"
      >
        <div className="mb-2">
          <p className="font-mono text-[11px] text-[color:var(--color-text-secondary)]">
            {t("agentTraversalStrategyTitle")}
          </p>
          <p className="mt-1 break-keep text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
            {t("agentTraversalStrategySubtitle")}
          </p>
        </div>
        <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-[10px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
            {t("agentTraversalPacketMeta", {
              mcp: traversalPayloadCount,
              cli: traversalCliFallbackCount,
            })}
          </p>
          <CopyAgentTextButton
            label={t("agentCopyTraversalPacket")}
            copiedLabel={t("agentCopied")}
            text={formatAgentTraversalPacket(traversalStrategies)}
            compact
          />
        </div>
        <ol className="grid gap-2 lg:grid-cols-3">
          {traversalStrategies.map((strategy, index) => (
            <li
              key={strategy.id}
              className="flex min-w-0 flex-col gap-2 rounded-md border border-[color:rgba(139,151,255,0.14)] bg-[color:rgba(255,255,255,0.035)] px-2.5 py-2.5"
              data-strategy={strategy.id}
            >
              <div className="flex items-start gap-2">
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[color:rgba(139,151,255,0.18)] bg-[color:rgba(139,151,255,0.07)] font-mono text-[10px] text-[color:rgba(211,215,255,0.96)]">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
                    {strategy.id}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-[color:var(--color-text-secondary)]">
                    {t(strategy.titleKey)}
                  </p>
                  <p className="mt-1 break-keep text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
                    {t(strategy.promptKey)}
                  </p>
                </div>
              </div>
              <div className="grid gap-1.5">
                <PlaybookChecklist
                  label={t("agentPlaybookEvidenceLabel")}
                  items={strategy.evidence}
                  tone="evidence"
                />
                <PlaybookChecklist
                  label={t("agentPlaybookStopLabel")}
                  items={strategy.stopWhen}
                  tone="stop"
                />
              </div>
              <ol className="flex flex-wrap gap-1" aria-label={t("agentTraversalStrategyStepsLabel")}>
                {strategy.payloads.map((payload, payloadIndex) => (
                  <li
                    key={`${strategy.id}-${payload.operation}-${payloadIndex}`}
                    className="rounded border border-[color:rgba(139,151,255,0.14)] bg-[color:rgba(139,151,255,0.055)] px-1.5 py-0.5 font-mono text-[9px] text-[color:var(--color-text-quaternary)]"
                  >
                    {payloadIndex + 1}. {payload.arguments.operation as string}
                  </li>
                ))}
              </ol>
              <TraversalGuardFacts argumentsPayload={strategy.payloads[0]?.arguments} />
              <CopyAgentTextButton
                label={t("agentCopyStrategy")}
                copiedLabel={t("agentCopied")}
                text={formatAgentTraversalStrategyPrompt(strategy)}
                compact
              />
            </li>
          ))}
        </ol>
      </div>
      <div
        className="mb-3 rounded-lg border border-[color:rgba(139,151,255,0.16)] bg-[color:rgba(139,151,255,0.045)] px-3 py-3"
        data-testid="insights-agent-run-order"
      >
        <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-[11px] text-[color:var(--color-text-secondary)]">
              {t("agentRunOrderTitle")}
            </p>
            <p className="mt-1 break-keep text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
              {t("agentRunOrderSubtitle")}
            </p>
          </div>
          <CopyAgentTextButton
            label={t("agentCopyRunOrder")}
            copiedLabel={t("agentCopied")}
            text={firstRunPrompt}
            compact
          />
        </div>
        <ol className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {firstRunRecipes.map((recipe, index) => {
            const Icon = iconById[recipe.id];
            const payload = formatAgentRecipePayload(recipe);
            const cliCommand = formatAgentRecipeCliCommand(recipe);
            return (
              <li
                key={`run-order-${recipe.id}`}
                className="min-w-0 rounded-md border border-[color:var(--color-border-soft)] bg-[color:rgba(255,255,255,0.035)] px-2.5 py-2"
                data-testid="insights-agent-run-order-step"
              >
                <div className="flex items-start gap-2">
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[color:rgba(139,151,255,0.18)] bg-[color:rgba(139,151,255,0.07)] font-mono text-[10px] text-[color:rgba(211,215,255,0.96)]">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate font-mono text-[10px] text-[color:var(--color-text-secondary)]">
                      <Icon size={12} aria-hidden />
                      <span className="truncate">{recipe.arguments.operation as string}</span>
                    </p>
                    <p className="mt-1 break-keep text-[11px] leading-4 text-[color:var(--color-text-tertiary)]">
                      {t(recipe.promptKey)}
                    </p>
                  </div>
                </div>
                {cliCommand ? (
                  <code className="mt-2 block overflow-hidden text-ellipsis whitespace-nowrap rounded border border-[color:rgba(73,190,146,0.14)] bg-[color:rgba(73,190,146,0.04)] px-1.5 py-1 font-mono text-[9px] leading-4 text-[color:var(--color-text-quaternary)]">
                    {cliCommand}
                  </code>
                ) : null}
                <div className="mt-2 flex flex-wrap justify-end gap-1.5">
                  {cliCommand ? (
                    <CopyAgentTextButton
                      label={t("agentCopyCli")}
                      copiedLabel={t("agentCopied")}
                      text={cliCommand}
                      compact
                    />
                  ) : null}
                  <CopyAgentTextButton
                    label={t("agentCopyStep")}
                    copiedLabel={t("agentCopied")}
                    text={payload}
                    compact
                  />
                </div>
              </li>
            );
          })}
        </ol>
      </div>
      {entrypoints.length > 0 || projectEntrypoint ? (
        <div className="mb-3 rounded-lg border border-[color:rgba(139,151,255,0.16)] bg-[color:rgba(139,151,255,0.045)] px-3 py-3">
          <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-mono text-[11px] text-[color:var(--color-text-secondary)]">
                {t("agentEntrypointsTitle")}
              </p>
              <p className="mt-1 break-keep text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
                {t("agentEntrypointsSubtitle")}
              </p>
            </div>
          </div>
          <ul className="grid gap-2 md:grid-cols-2" data-testid="insights-agent-entrypoints">
            {projectEntrypoint ? (
              <li
                key={projectEntrypoint.slug}
                className="flex min-w-0 items-center gap-2 rounded-md border border-[color:rgba(73,190,146,0.18)] bg-[color:rgba(73,190,146,0.05)] px-2.5 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] text-[color:var(--color-text-primary)]">
                    {projectEntrypoint.title}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
                    {projectEntrypoint.slug} · project · degree {projectEntrypoint.degree}
                  </p>
                </div>
                <CopyAgentTextButton
                  label={t("agentCopySlug")}
                  copiedLabel={t("agentCopied")}
                  text={projectEntrypoint.slug}
                  compact
                />
              </li>
            ) : null}
            {entrypoints.map((entrypoint) => (
              <li
                key={entrypoint.slug}
                className="flex min-w-0 items-center gap-2 rounded-md border border-[color:var(--color-border-soft)] bg-[color:rgba(255,255,255,0.035)] px-2.5 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] text-[color:var(--color-text-primary)]">
                    {entrypoint.title}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
                    {entrypoint.slug} · {entrypoint.kind} · degree {entrypoint.degree}
                  </p>
                </div>
                <CopyAgentTextButton
                  label={t("agentCopySlug")}
                  copiedLabel={t("agentCopied")}
                  text={entrypoint.slug}
                  compact
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div
        className="mb-3 rounded-lg border border-[color:rgba(255,255,255,0.10)] bg-[color:rgba(255,255,255,0.032)] px-3 py-3"
        data-testid="insights-agent-playbooks"
      >
        <div className="mb-2">
          <p className="font-mono text-[11px] text-[color:var(--color-text-secondary)]">
            {t("agentPlaybooksTitle")}
          </p>
          <p className="mt-1 break-keep text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
            {t("agentPlaybooksSubtitle")}
          </p>
        </div>
        <div className="grid min-w-0 gap-2 md:grid-cols-2 xl:grid-cols-4">
          {playbooks.map((playbook) => {
            const cliCommands = playbook.payloads
              .map(formatAgentQueryCallCliCommand)
              .filter((command): command is string => command !== null)
              .filter(uniqueString);

            return (
              <article
                key={playbook.id}
                className="flex min-w-0 flex-col gap-2 rounded-md border border-[color:var(--color-border-soft)] bg-[color:rgba(255,255,255,0.035)] px-2.5 py-2.5"
                data-playbook={playbook.id}
              >
                <div className="min-w-0">
                  <p className="font-mono text-[11px] text-[color:var(--color-text-secondary)]">
                    {t(playbook.titleKey)}
                  </p>
                  <p className="mt-1 break-keep text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
                    {t(playbook.promptKey)}
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
                    {playbook.payloads.length} MCP calls
                  </p>
                  <div className="mt-2 grid gap-1.5">
                    <PlaybookChecklist
                      label={t("agentPlaybookEvidenceLabel")}
                      items={playbook.evidence}
                      tone="evidence"
                    />
                    <PlaybookChecklist
                      label={t("agentPlaybookStopLabel")}
                      items={playbook.stopWhen}
                      tone="stop"
                    />
                  </div>
                  <ol className="mt-2 flex flex-wrap gap-1" aria-label={t("agentPlaybookStepsLabel")}>
                    {playbook.payloads.map((payload, index) => (
                      <li
                        key={`${playbook.id}-${payload.operation}-${index}`}
                        className="rounded border border-[color:rgba(139,151,255,0.14)] bg-[color:rgba(139,151,255,0.055)] px-1.5 py-0.5 font-mono text-[9px] text-[color:var(--color-text-quaternary)]"
                      >
                        {index + 1}. {payload.arguments.operation as string}
                      </li>
                    ))}
                  </ol>
                  <TraversalGuardFacts
                    argumentsPayload={
                      playbook.id === "graph_traversal"
                        ? playbook.payloads.find(
                            (payload) => payload.arguments.operation === "all_paths",
                          )?.arguments
                        : playbook.payloads.find(
                            (payload) => payload.arguments.operation === "query_plan",
                          )?.arguments
                    }
                  />
                  {cliCommands.length > 0 ? (
                    <div className="mt-2 min-w-0 rounded-md border border-[color:rgba(73,190,146,0.16)] bg-[color:rgba(73,190,146,0.045)] p-2">
                      <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.10em] text-[color:rgba(151,230,198,0.92)]">
                        {t("agentCliCommandLabel")}
                      </p>
                      <ul className="grid gap-1">
                        {cliCommands.map((command) => (
                          <li key={command}>
                            <code className="block overflow-x-auto whitespace-nowrap font-mono text-[10px] leading-4 text-[color:var(--color-text-tertiary)]">
                              {command}
                            </code>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
                <CopyAgentTextButton
                  label={t("agentCopyPlaybook")}
                  copiedLabel={t("agentCopied")}
                  text={formatAgentPlaybookPrompt(playbook)}
                  compact
                />
              </article>
            );
          })}
        </div>
      </div>
      <div
        className="mb-3 rounded-lg border border-[color:rgba(73,190,146,0.20)] bg-[color:rgba(73,190,146,0.045)] px-3 py-3"
        data-testid="insights-agent-guardrails"
      >
        <div className="mb-2">
          <p className="font-mono text-[11px] text-[color:var(--color-text-secondary)]">
            {t("agentGuardrailsTitle")}
          </p>
          <p className="mt-1 break-keep text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
            {t("agentGuardrailsSubtitle")}
          </p>
        </div>
        <div
          className="mb-2 rounded-md border border-[color:rgba(73,190,146,0.14)] bg-[color:rgba(3,7,18,0.16)] px-2.5 py-2.5"
          data-testid="insights-agent-relation-decisions"
        >
          <div className="mb-2">
            <p className="font-mono text-[10px] text-[color:var(--color-text-secondary)]">
              {t("agentRelationDecisionTitle")}
            </p>
            <p className="mt-1 break-keep text-[11px] leading-4 text-[color:var(--color-text-tertiary)]">
              {t("agentRelationDecisionSubtitle")}
            </p>
          </div>
          <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
            {RELATION_DECISIONS.map((decision) => (
              <li
                key={decision.key}
                className={[
                  "min-w-0 rounded border px-2 py-1.5",
                  decision.className,
                ].join(" ")}
              >
                <p className="truncate font-mono text-[9px] text-[color:var(--color-text-secondary)]">
                  {decision.key}
                </p>
                <p className="mt-1 break-keep text-[11px] leading-4 text-[color:var(--color-text-tertiary)]">
                  {t(decision.labelKey)}
                </p>
              </li>
            ))}
          </ul>
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          {guardrails.map((guardrail) => (
            <article
              key={guardrail.id}
              className="flex min-w-0 flex-col gap-2 rounded-md border border-[color:rgba(73,190,146,0.16)] bg-[color:rgba(255,255,255,0.035)] px-2.5 py-2.5"
              data-guardrail={guardrail.id}
            >
              <div className="min-w-0">
                <p className="font-mono text-[11px] text-[color:var(--color-text-secondary)]">
                  {t(guardrail.titleKey)}
                </p>
                <p className="mt-1 break-keep text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
                  {t(guardrail.promptKey)}
                </p>
                <ol className="mt-2 flex flex-wrap gap-1" aria-label={t("agentGuardrailStepsLabel")}>
                  {guardrail.payloads.map((payload, index) => (
                    <li
                      key={`${guardrail.id}-${payload.operation}-${index}`}
                      className="rounded border border-[color:rgba(73,190,146,0.16)] bg-[color:rgba(73,190,146,0.055)] px-1.5 py-0.5 font-mono text-[9px] text-[color:var(--color-text-quaternary)]"
                    >
                      {index + 1}. {payload.operation}
                    </li>
                  ))}
                </ol>
                {guardrail.cliFallbackCommands && guardrail.cliFallbackCommands.length > 0 ? (
                  <ol className="mt-2 grid gap-1" aria-label={t("agentCliCommandLabel")}>
                    {guardrail.cliFallbackCommands.slice(0, 3).map((command, index) => (
                      <li
                        key={`${guardrail.id}-cli-${command}`}
                        className="min-w-0 rounded border border-[color:rgba(73,190,146,0.12)] bg-[color:rgba(3,7,18,0.16)] px-1.5 py-1"
                      >
                        <code className="block overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[9px] text-[color:var(--color-text-quaternary)]">
                          {index + 1}. {command}
                        </code>
                      </li>
                    ))}
                  </ol>
                ) : null}
              </div>
              <CopyAgentTextButton
                label={t("agentCopyGuardrail")}
                copiedLabel={t("agentCopied")}
                text={formatAgentGuardrailPrompt(guardrail)}
                compact
              />
            </article>
          ))}
        </div>
      </div>
      <div className="grid min-w-0 gap-2 lg:grid-cols-2">
        {recipes.map((recipe) => {
          const Icon = iconById[recipe.id];
          const payload = formatAgentRecipePayload(recipe);
          const cliCommand = formatAgentRecipeCliCommand(recipe);
          return (
            <article
              key={recipe.id}
              className="min-w-0 rounded-lg border border-[color:var(--color-border-soft)] bg-[color:rgba(255,255,255,0.035)] px-3 py-3"
              data-testid="insights-agent-query-recipe"
              data-recipe={recipe.id}
            >
              <div className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[color:rgba(139,151,255,0.18)] bg-[color:rgba(139,151,255,0.07)] text-[color:rgba(184,191,255,0.92)]">
                  <Icon size={13} aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="font-mono text-[11px] text-[color:var(--color-text-secondary)]">
                    {recipe.operation}
                  </p>
                  <span
                    className={[
                      "mt-1 inline-flex rounded-full border px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-[0.10em]",
                      recipe.priority === "primary"
                        ? "border-[color:rgba(73,190,146,0.28)] bg-[color:rgba(73,190,146,0.08)] text-[color:rgba(151,230,198,0.95)]"
                        : "border-[color:rgba(139,151,255,0.18)] bg-[color:rgba(139,151,255,0.06)] text-[color:rgba(184,191,255,0.88)]",
                    ].join(" ")}
                  >
                    {recipe.priority === "primary"
                      ? t("agentRecipePriorityPrimary")
                      : t("agentRecipePrioritySecondary")}
                  </span>
                  <p className="mt-1 break-keep text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
                    {t(recipe.promptKey)}
                  </p>
                </div>
              </div>
              <pre className="mt-3 max-h-32 min-w-0 max-w-full overflow-auto rounded-md border border-[color:rgba(139,151,255,0.14)] bg-[color:rgba(3,7,18,0.34)] p-2 font-mono text-[10px] leading-4 text-[color:var(--color-text-tertiary)]">
                <code>{payload}</code>
              </pre>
              {cliCommand ? (
                <div className="mt-2 min-w-0 rounded-md border border-[color:rgba(73,190,146,0.16)] bg-[color:rgba(73,190,146,0.045)] p-2">
                  <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.10em] text-[color:rgba(151,230,198,0.92)]">
                    {t("agentCliCommandLabel")}
                  </p>
                  <code className="block overflow-x-auto whitespace-nowrap font-mono text-[10px] leading-4 text-[color:var(--color-text-tertiary)]">
                    {cliCommand}
                  </code>
                </div>
              ) : null}
              <TraversalGuardFacts argumentsPayload={recipe.arguments} />
              <div className="mt-2 flex flex-wrap justify-end gap-1.5">
                {cliCommand ? (
                  <CopyAgentTextButton
                    label={t("agentCopyCli")}
                    copiedLabel={t("agentCopied")}
                    text={cliCommand}
                    compact
                  />
                ) : null}
                <CopyAgentTextButton
                  label={t("agentCopyPayload")}
                  copiedLabel={t("agentCopied")}
                  text={payload}
                  compact
                />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function PlaybookChecklist({
  items,
  label,
  tone,
}: {
  items: readonly string[];
  label: string;
  tone: "evidence" | "stop";
}) {
  const toneClass =
    tone === "evidence"
      ? "border-[color:rgba(73,190,146,0.14)] bg-[color:rgba(73,190,146,0.045)]"
      : "border-[color:rgba(255,179,71,0.14)] bg-[color:rgba(255,179,71,0.045)]";

  return (
    <div className={`rounded border px-2 py-1.5 ${toneClass}`}>
      <p className="font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
        {label}
      </p>
      <ul className="mt-1 space-y-1">
        {items.slice(0, 2).map((item) => (
          <li
            key={item}
            className="line-clamp-2 break-keep text-[10px] leading-4 text-[color:var(--color-text-tertiary)]"
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TraversalGuardFacts({
  argumentsPayload,
}: {
  argumentsPayload?: Record<string, unknown>;
}) {
  const t = useTranslations("ontologyPages.insights");
  const facts = getTraversalGuardFacts(argumentsPayload);
  if (facts.length === 0) return null;

  return (
    <div
      className="mt-2 rounded-md border border-[color:rgba(73,190,146,0.18)] bg-[color:rgba(73,190,146,0.045)] px-2 py-1.5"
      data-testid="insights-agent-traversal-guard"
    >
      <p className="font-mono text-[9px] uppercase tracking-[0.10em] text-[color:rgba(151,230,198,0.90)]">
        {t("agentTraversalGuardLabel")}
      </p>
      <ul className="mt-1 flex flex-wrap gap-1">
        {facts.map((fact) => (
          <li
            key={fact.key}
            className="rounded border border-[color:rgba(73,190,146,0.18)] bg-[color:rgba(3,7,18,0.18)] px-1.5 py-0.5 font-mono text-[9px] text-[color:var(--color-text-tertiary)]"
          >
            {fact.label}
          </li>
        ))}
      </ul>
    </div>
  );
}


function uniqueString(value: string, index: number, values: string[]): boolean {
  return values.indexOf(value) === index;
}
