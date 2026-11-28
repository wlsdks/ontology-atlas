//! `health`: whether the graph is sound enough to rely on, in one answer: is anything there, did it
//! compile cleanly, do the edges resolve, do dependencies loop, are the domain links written back,
//! and is the graph one piece. Each is a check that passes, warns, fails or informs, so an agent
//! reads the verdict first and the evidence after.

use answer_format::json::RawJson;
use serde::Serialize;

use super::clusters::{connected_components, describe_components, ComponentRow};
use super::dependency_view::{self, default_types};
use super::outside_checks::OutsideChecks;
use super::relation_recommendations::{recommend, Recommendation};
use crate::compiled_graph::{CompiledGraph, NodeId};
use crate::query::operation_defaults::{
    HEALTH_COMPONENT_LIMIT, HEALTH_CYCLE_LIMIT, HEALTH_NODE_LIMIT, HEALTH_ORDER_LIMIT,
    HEALTH_RECOMMENDATION_LIMIT,
};
use crate::query::query_error::QueryError;
use crate::query::relation_set::RelationSet;
use crate::query::request::QueryRequest;
use crate::query::walks::dependency_cycles::CycleRow;
use crate::query::walks::dependency_order::BlockedRow;

/// Kinds that hold the graph together without being part of what it describes; a group made only
/// of them is not an island worth reporting.
const IGNORED_COMPONENT_KINDS: [&str; 1] = ["vault-readme"];

#[derive(Serialize)]
pub struct HealthCheck {
    id: &'static str,
    status: &'static str,
    count: usize,
    #[serde(rename = "pathsChecked", skip_serializing_if = "Option::is_none")]
    paths_checked: Option<bool>,
    message: String,
}

impl HealthCheck {
    pub fn new(id: &'static str, status: &'static str, count: usize, message: String) -> Self {
        Self {
            id,
            status,
            count,
            paths_checked: None,
            message,
        }
    }

    /// The validation check names whether source paths were compared, beside its count.
    pub fn with_paths_checked(
        id: &'static str,
        status: &'static str,
        count: usize,
        paths_checked: bool,
        message: String,
    ) -> Self {
        Self {
            paths_checked: Some(paths_checked),
            ..Self::new(id, status, count, message)
        }
    }

    pub fn id(&self) -> &'static str {
        self.id
    }

    pub fn status(&self) -> &'static str {
        self.status
    }

    pub fn count(&self) -> usize {
        self.count
    }

    pub fn message(&self) -> &str {
        &self.message
    }
}

#[derive(Serialize)]
struct CompilerDeclarations {
    count: usize,
    #[serde(rename = "reportedAt")]
    reported_at: [&'static str; 2],
    unit: &'static str,
    identity: [&'static str; 3],
    #[serde(rename = "logicalRelationDeduplicated")]
    logical_relation_deduplicated: bool,
    #[serde(rename = "reciprocalDeclarationsMayDescribeOneLogicalRelation")]
    reciprocal_declarations_may_describe_one_logical_relation: bool,
}

#[derive(Serialize)]
struct CanonicalMapCensus {
    #[serde(rename = "countAvailable")]
    count_available: bool,
    count: Option<usize>,
    unit: &'static str,
    scope: &'static str,
    #[serde(rename = "filterSensitive")]
    filter_sensitive: bool,
    reason: &'static str,
}

#[derive(Serialize)]
struct RelationCensus {
    #[serde(rename = "compilerDeclarations")]
    compiler_declarations: CompilerDeclarations,
    #[serde(rename = "canonicalMapCensus")]
    canonical_map_census: CanonicalMapCensus,
}

impl RelationCensus {
    fn of(edges: usize) -> Self {
        Self {
            compiler_declarations: CompilerDeclarations {
                count: edges,
                reported_at: ["summary.edges", "compiledSummary.edges"],
                unit: "compiled_frontmatter_relation_declarations",
                identity: ["declaring_document", "relation_key", "target_reference"],
                logical_relation_deduplicated: false,
                reciprocal_declarations_may_describe_one_logical_relation: true,
            },
            canonical_map_census: CanonicalMapCensus {
                count_available: false,
                count: None,
                unit: "deduplicated_normalized_typed_edges",
                scope: "loaded_app_ontology",
                filter_sensitive: false,
                reason: "The MCP process does not run the app derivation or know its loaded UI state, so use the app census for this numeric count.",
            },
        }
    }
}

#[derive(Serialize)]
struct HealthSummary {
    nodes: usize,
    edges: usize,
    #[serde(rename = "resolvedEdges")]
    resolved_edges: usize,
    #[serde(rename = "externalEdges")]
    external_edges: usize,
    #[serde(rename = "unresolvedEdges")]
    unresolved_edges: usize,
    issues: usize,
    #[serde(rename = "ambiguousAliases")]
    ambiguous_aliases: usize,
    components: usize,
    #[serde(rename = "actionableComponents")]
    actionable_components: usize,
    #[serde(rename = "ignoredComponents")]
    ignored_components: usize,
    #[serde(rename = "largestComponentSize")]
    largest_component_size: usize,
    #[serde(rename = "singletonComponents")]
    singleton_components: usize,
    #[serde(rename = "dependencyCycles")]
    dependency_cycles: usize,
    #[serde(rename = "relationRecommendations")]
    relation_recommendations: usize,
    #[serde(rename = "dependencyOrderAcyclic")]
    dependency_order_acyclic: bool,
}

#[derive(Serialize)]
struct HealthComponents<'a> {
    #[serde(rename = "totalComponents")]
    total_components: usize,
    #[serde(rename = "actionableComponents")]
    actionable_components: usize,
    #[serde(rename = "ignoredComponents")]
    ignored_components: usize,
    #[serde(rename = "largestSize")]
    largest_size: usize,
    #[serde(rename = "singletonCount")]
    singleton_count: usize,
    limited: bool,
    components: Vec<ComponentRow<'a>>,
}

#[derive(Serialize)]
struct HealthCycles<'a> {
    #[serde(rename = "totalCycles")]
    total_cycles: usize,
    #[serde(rename = "totalCyclesExact")]
    total_cycles_exact: bool,
    limited: bool,
    cycles: Vec<CycleRow<'a>>,
}

#[derive(Serialize)]
struct HealthRecommendations<'a> {
    #[serde(rename = "totalRecommendations")]
    total_recommendations: usize,
    limited: bool,
    recommendations: Vec<Recommendation<'a>>,
}

#[derive(Serialize)]
struct HealthOrder<'a> {
    acyclic: bool,
    #[serde(rename = "totalNodes")]
    total_nodes: usize,
    #[serde(rename = "orderedCount")]
    ordered_count: usize,
    blocked: Vec<BlockedRow<'a>>,
}

#[derive(Serialize)]
pub struct HealthAnswer<'a> {
    operation: &'static str,
    pub(super) status: &'static str,
    #[serde(rename = "graphHash")]
    graph_hash: &'a str,
    #[serde(rename = "maxMtime")]
    max_mtime: f64,
    #[serde(rename = "relationCensus")]
    relation_census: RelationCensus,
    summary: HealthSummary,
    pub(super) checks: Vec<HealthCheck>,
    components: HealthComponents<'a>,
    #[serde(rename = "dependencyCycles")]
    dependency_cycles: HealthCycles<'a>,
    #[serde(rename = "relationRecommendations")]
    relation_recommendations: HealthRecommendations<'a>,
    #[serde(rename = "dependencyOrder")]
    dependency_order: HealthOrder<'a>,
    #[serde(skip_serializing_if = "Option::is_none")]
    validation: Option<Box<RawJson>>,
}

impl HealthAnswer<'_> {
    /// The answer with the checks only the outside can make added after its own.
    pub fn with_outside(mut self, outside: OutsideChecks) -> Self {
        self.status = outside.status(self.status);
        let parts = outside.into_parts();
        self.checks.extend(parts.checks);
        self.validation = parts.validation;
        self
    }
}

/// What a call asks of `health`: the limits of each list and the relation filter. `workspace_brief`
/// asks for the same lists with a limit of its own.
pub struct HealthQuestion {
    pub component_limit: usize,
    pub node_limit: usize,
    pub cycle_limit: usize,
    pub recommendation_limit: usize,
    pub order_limit: usize,
    pub max_hops: Option<usize>,
    pub component_types: Option<Vec<String>>,
    /// Whether `componentTypes` or `types` was sent at all, which names the graph "scoped".
    pub scoped: bool,
    /// The argument that named the component filter, for a refusal.
    pub component_types_argument: &'static str,
}

impl HealthQuestion {
    /// The question a `health` call asks.
    pub fn from_request(request: &QueryRequest) -> Self {
        let component_types = request.types.clone();
        Self {
            component_limit: HEALTH_COMPONENT_LIMIT,
            node_limit: HEALTH_NODE_LIMIT,
            cycle_limit: HEALTH_CYCLE_LIMIT,
            recommendation_limit: HEALTH_RECOMMENDATION_LIMIT,
            order_limit: HEALTH_ORDER_LIMIT,
            max_hops: request.max_hops.or(request.depth),
            scoped: component_types.is_some(),
            component_types_argument: "types",
            component_types,
        }
    }
}

fn check(id: &'static str, status: &'static str, count: usize, message: &str) -> HealthCheck {
    HealthCheck::new(id, status, count, message.to_string())
}

/// Whether every node of a group is of a kind the health check does not count.
fn only_ignored_kinds(graph: &CompiledGraph, group: &[NodeId]) -> bool {
    group
        .iter()
        .all(|id| IGNORED_COMPONENT_KINDS.contains(&graph.node(*id).kind()))
}

pub fn health<'a>(
    graph: &'a CompiledGraph,
    question: &HealthQuestion,
) -> Result<HealthAnswer<'a>, QueryError> {
    let component_types = RelationSet::parse(
        question.component_types.as_deref(),
        question.component_types_argument,
    )?;
    let groups = connected_components(graph, component_types.as_ref());
    let components = describe_components(
        graph,
        &groups,
        question.component_limit,
        question.node_limit,
    );
    let actionable = groups
        .iter()
        .filter(|group| !only_ignored_kinds(graph, group))
        .count();
    let ignored = groups.len() - actionable;
    let recommended = recommend(graph, None, question.recommendation_limit);
    let dependency_types = default_types();
    let cycles = dependency_view::cycles(
        graph,
        question.cycle_limit,
        question.max_hops,
        &dependency_types,
        "types",
    )?;
    let order = dependency_view::order(graph, question.order_limit, &dependency_types, "types")?;

    let counts = graph.edge_counts();
    let (nodes, edges) = (graph.nodes().len(), graph.edges().len());
    let issues = graph.issues().len();
    let subject = if question.scoped {
        "The scoped ontology graph"
    } else {
        "The resolved ontology graph"
    };
    let connected_subject = if question.scoped {
        "The scoped ontology graph"
    } else {
        "The actionable ontology graph"
    };

    let checks = vec![
        if nodes == 0 {
            check("vault_present", "fail", nodes, "This folder has no ontology nodes, so every other check below passed with nothing to count. Either the path is not a vault, or the vault is empty: check the folder you passed, or scaffold one with the first-run starter in the app or `node <checkout>/cli init`.")
        } else {
            check(
                "vault_present",
                "pass",
                nodes,
                "The folder contains ontology nodes.",
            )
        },
        if issues == 0 {
            check(
                "compile_issues",
                "pass",
                issues,
                "Compiled ontology artifact has no compiler issues.",
            )
        } else {
            check("compile_issues", "warn", issues, "Compiled ontology artifact has compiler issues; compile_ontology({ nodesLimit: 1, edgesLimit: 1 }) returns every issue.")
        },
        if counts.unresolved == 0 {
            check(
                "unresolved_edges",
                "pass",
                counts.unresolved,
                "Every internal edge resolves to a known ontology node.",
            )
        } else {
            check(
                "unresolved_edges",
                "warn",
                counts.unresolved,
                "Some internal edges do not resolve to a known ontology node.",
            )
        },
        if cycles.total > 0 {
            check(
                "dependency_cycles",
                "fail",
                cycles.total,
                "Directed dependency cycles block a clean prerequisite-first graph order.",
            )
        } else if order.acyclic {
            check(
                "dependency_cycles",
                "pass",
                cycles.total,
                "No directed dependency cycles were detected.",
            )
        } else {
            check("dependency_cycles", "warn", cycles.total, "The dependency order is not acyclic, but the cycle search ran out of budget before naming a cycle; cycles({ maxHops }) with a narrower scope names them.")
        },
        if recommended.total == 0 {
            check(
                "relation_recommendations",
                "pass",
                recommended.total,
                "No safe domain-containment relation suggestions are pending.",
            )
        } else {
            check(
                "relation_recommendations",
                "warn",
                recommended.total,
                "Safe domain-containment relation suggestions are available.",
            )
        },
        if actionable <= 1 {
            let message = if ignored > 0 {
                format!("{connected_subject} is connected; {ignored} root/reference component(s) were ignored.")
            } else {
                format!("{subject} is connected.")
            };
            HealthCheck::new("components", "pass", actionable, message)
        } else {
            HealthCheck::new(
                "components",
                "info",
                actionable,
                format!("{subject} has disconnected actionable islands."),
            )
        },
    ];
    let status = if checks
        .iter()
        .any(|check| check.status == "fail" || check.status == "warn")
    {
        "needs_attention"
    } else {
        "healthy"
    };

    Ok(HealthAnswer {
        operation: "health",
        status,
        graph_hash: graph.graph_hash(),
        max_mtime: graph.max_mtime(),
        relation_census: RelationCensus::of(edges),
        summary: HealthSummary {
            nodes,
            edges,
            resolved_edges: counts.resolved,
            external_edges: counts.external,
            unresolved_edges: counts.unresolved,
            issues,
            ambiguous_aliases: graph.ambiguous_aliases().len(),
            components: components.total_components,
            actionable_components: actionable,
            ignored_components: ignored,
            largest_component_size: components.largest_size,
            singleton_components: components.singleton_count,
            dependency_cycles: cycles.total,
            relation_recommendations: recommended.total,
            dependency_order_acyclic: order.acyclic,
        },
        checks,
        components: HealthComponents {
            total_components: components.total_components,
            actionable_components: actionable,
            ignored_components: ignored,
            largest_size: components.largest_size,
            singleton_count: components.singleton_count,
            limited: components.limited,
            components: components.components,
        },
        dependency_cycles: HealthCycles {
            total_cycles: cycles.total,
            total_cycles_exact: cycles.exact,
            limited: cycles.limited,
            cycles: cycles.cycles,
        },
        relation_recommendations: HealthRecommendations {
            total_recommendations: recommended.total,
            limited: recommended.total > question.recommendation_limit,
            recommendations: recommended.rows,
        },
        dependency_order: HealthOrder {
            acyclic: order.acyclic,
            total_nodes: order.total_nodes,
            ordered_count: order.ordered_count,
            blocked: order.blocked,
        },
        validation: None,
    })
}
