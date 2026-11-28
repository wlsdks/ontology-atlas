//! `maintenance_plan`: every step that would leave the vault sounder, ordered by how serious it is
//! and where in the work it belongs, with a stable address on each so a caller can resume after the
//! step it last handled. It lists steps; it never writes.
//!
//! Each kind of finding contributes at most `limit` steps, so the plan stays as long as `limit`
//! times the kinds however many findings a vault has; the counts say how many there were.

use std::collections::HashSet;

use answer_format::whitespace::trim;
use indexmap::IndexMap;
use serde::ser::SerializeMap;
use serde::{Serialize, Serializer};

use super::dependency_view::{self, default_types};
use super::growth_candidates::{
    capabilities_without_evidence, dangling_references, empty_domains, external_elements,
    is_starter_body, unassigned_nodes, unearned_nodes,
};
use super::maintenance_action::{compare_steps, Action, Step, Subject};
use super::proposed_action::{ActionArguments, FrontmatterPatch, ProposedAction};
use super::relation_recommendations::recommend;
use super::starter_examples::starter_examples;
use crate::compiled_graph::{CompiledGraph, NodeId};
use crate::query::name_counts::sorted_counts;
use crate::query::node_mask::NodeMask;
use crate::query::node_summary::NodeSummary;
use crate::query::operation_defaults::MAINTENANCE_PLAN_LIMIT;
use crate::query::query_error::QueryError;
use crate::query::request::QueryRequest;
use vault_document::body_findings;
use vault_document::meaning_wording::slug_outside_kind_folder;
use vault_document::schema::folder_for_kind;

const PHASES: [&str; 5] = ["validate", "repair", "link", "materialize", "review"];
const SEVERITIES: [&str; 3] = ["fail", "warn", "info"];
const KINDS: [&str; 20] = [
    "inspect_compile_issue",
    "break_dependency_cycle",
    "canonicalize_graph_arrays",
    "resolve_dangling_reference",
    "add_missing_relation",
    "materialize_external_element",
    "unassigned_node",
    "empty_domain",
    "separate_evidence_from_concept",
    "fold_bulk_siblings",
    "retire_unearned_node",
    "capability_without_evidence",
    "rejudge_summary_membership",
    "definition_missing",
    "boundary_missing",
    "epistemic_exclusion",
    "folder_only_evidence",
    "slug_outside_kind_folder",
    "uncertainty_missing",
    "retire_starter_example",
];

/// How a finding of the body reader reads in a plan: its kind and how sure the plan is of it.
fn meaning_gap(code: &str) -> Option<(&'static str, f64)> {
    Some(match code {
        "definition-missing" => ("definition_missing", 0.6),
        "boundary-missing" => ("boundary_missing", 0.55),
        "epistemic-exclusion" => ("epistemic_exclusion", 0.7),
        "folder-only-evidence" => ("folder_only_evidence", 0.5),
        "uncertainty-missing" => ("uncertainty_missing", 0.55),
        _ => return None,
    })
}

const SLUG_OUTSIDE_FOLDER_SCORE: f64 = 0.35;
/// Ranked just under `epistemic-exclusion`: both put a claim on the map that is not true of the
/// codebase, and this one is seen before anything is opened.
const STARTER_EXAMPLE_SCORE: f64 = 0.65;

/// Rows that are counted all but built only up to a limit.
struct Capped<T> {
    total: usize,
    limit: usize,
    rows: Vec<T>,
}

impl<T> Capped<T> {
    fn new(limit: usize) -> Self {
        Self {
            total: 0,
            limit,
            rows: Vec::new(),
        }
    }

    fn push(&mut self, row: impl FnOnce() -> T) {
        self.total += 1;
        if self.rows.len() < self.limit {
            self.rows.push(row());
        }
    }
}

struct GapRow<'a> {
    kind: &'static str,
    score: f64,
    reason: String,
    node: NodeSummary<'a>,
}

fn review<'a>(row: GapRow<'a>) -> Step<'a> {
    Step {
        phase: "review",
        kind: row.kind,
        severity: "info",
        score: row.score,
        reason: row.reason,
        subject: Subject::Review {
            node: Some(row.node),
        },
    }
}

/// Fewer nodes than this are read in one thread: starting a thread costs more than reading them.
const NODES_PER_WORKER_MIN: usize = 256;

/// Background work leaves two cores to whatever else the machine is doing.
fn worker_count() -> usize {
    std::thread::available_parallelism()
        .map(|cores| cores.get().saturating_sub(2))
        .unwrap_or(1)
        .clamp(1, 6)
}

/// A finding of the body reader about one node, as a plan will word it.
struct BodyGap {
    node: NodeId,
    kind: &'static str,
    score: f64,
    reason: String,
}

/// What reading a run of nodes' bodies found: how many gaps, the first `limit` of them, and which
/// capabilities hold the starter's own text.
#[derive(Default)]
struct RunReading {
    gap_total: usize,
    gaps: Vec<BodyGap>,
    starter_bodies: Vec<NodeId>,
}

fn read_run(graph: &CompiledGraph, nodes: &[NodeId], limit: usize) -> RunReading {
    let mut reading = RunReading::default();
    for &id in nodes {
        let node = graph.node(id);
        let Ok(body) = node.body() else { continue };
        let title = node.title_text();
        if node.kind() == "capability" && is_starter_body(node.kind(), &title, &body) {
            reading.starter_bodies.push(id);
        }
        for finding in body_findings(node.kind(), node.slug(), &title, &body) {
            let Some((kind, score)) = meaning_gap(finding.code) else {
                continue;
            };
            reading.gap_total += 1;
            if reading.gaps.len() < limit {
                reading.gaps.push(BodyGap {
                    node: id,
                    kind,
                    score,
                    reason: finding.message,
                });
            }
        }
    }
    reading
}

/// What the bodies of the vault say, found while each body is read once: what they leave unsaid,
/// node by node in slug order, and which capabilities still hold the starter's own text. A body
/// that was not kept in the document record is a file read and a parse, so no check reads one of
/// its own, and the runs of nodes are read by several threads at once; each keeps only its first
/// `limit` gaps, so what is held stays as small as the plan.
struct BodyReading<'a> {
    gaps: Capped<GapRow<'a>>,
    starter_bodies: NodeMask,
}

fn read_bodies<'a>(
    graph: &'a CompiledGraph,
    limit: usize,
    touching: Option<&[String]>,
) -> BodyReading<'a> {
    let nodes: Vec<NodeId> = graph
        .node_ids()
        .filter(|id| touching.is_none_or(|slugs| slugs.iter().any(|slug| slug == graph.node(*id).slug())))
        .collect();
    let run = nodes
        .len()
        .div_ceil(worker_count())
        .max(NODES_PER_WORKER_MIN);
    let runs: Vec<RunReading> = std::thread::scope(|scope| {
        let handles: Vec<_> = nodes
            .chunks(run)
            .map(|part| scope.spawn(move || read_run(graph, part, limit)))
            .collect();
        handles
            .into_iter()
            .map(|handle| {
                handle
                    .join()
                    .unwrap_or_else(|panic| std::panic::resume_unwind(panic))
            })
            .collect()
    });
    let mut gaps = Capped::new(limit);
    let mut starter_bodies = NodeMask::empty(graph);
    for reading in runs {
        gaps.total += reading.gap_total;
        for gap in reading.gaps {
            if gaps.rows.len() < limit {
                gaps.rows.push(GapRow {
                    kind: gap.kind,
                    score: gap.score,
                    reason: gap.reason,
                    node: NodeSummary::of(graph, gap.node),
                });
            }
        }
        for node in reading.starter_bodies {
            starter_bodies.insert(node);
        }
    }
    BodyReading {
        gaps,
        starter_bodies,
    }
}

/// Nodes written at the vault root instead of inside the folder of their kind.
fn flat_slugs(graph: &CompiledGraph, limit: usize) -> Capped<GapRow<'_>> {
    let mut flat = Capped::new(limit);
    for id in graph.node_ids() {
        let node = graph.node(id);
        let folder = folder_for_kind(node.kind());
        if folder.is_empty() || node.slug().starts_with(folder) {
            continue;
        }
        flat.push(|| GapRow {
            kind: "slug_outside_kind_folder",
            score: SLUG_OUTSIDE_FOLDER_SCORE,
            reason: slug_outside_kind_folder(
                node.slug(),
                node.kind(),
                &format!("{folder}{}", node.slug()),
            ),
            node: NodeSummary::of(graph, id),
        });
    }
    flat
}

fn starter_gaps(graph: &CompiledGraph, limit: usize) -> Capped<GapRow<'_>> {
    let mut starters = Capped::new(limit);
    for example in starter_examples(graph) {
        starters.push(|| GapRow {
            kind: "retire_starter_example",
            score: STARTER_EXAMPLE_SCORE,
            reason: example.message,
            node: NodeSummary::of(graph, example.node),
        });
    }
    starters
}

/// A filter on one of the plan's three enumerations: the values a call asked for, or none.
fn filter_of(
    values: Option<&[String]>,
    name: &str,
    allowed: &[&'static str],
) -> Result<Option<HashSet<String>>, QueryError> {
    let Some(values) = values else {
        return Ok(None);
    };
    let mut chosen = HashSet::new();
    for value in values {
        if !allowed.contains(&value.as_str()) {
            return Err(QueryError::NotAnAllowedValue {
                name: format!("{name} items"),
                received: value.clone(),
                allowed: allowed.to_vec(),
            });
        }
        chosen.insert(value.clone());
    }
    Ok(Some(chosen).filter(|set| !set.is_empty()))
}

fn sorted(set: Option<&HashSet<String>>) -> Vec<&str> {
    let mut names: Vec<&str> = set
        .map(|set| set.iter().map(String::as_str).collect())
        .unwrap_or_default();
    names.sort_unstable();
    names
}

#[derive(Serialize)]
struct PlanSummary {
    #[serde(rename = "totalActions")]
    total_actions: usize,
    #[serde(rename = "filteredActions")]
    filtered_actions: usize,
    #[serde(rename = "remainingActions")]
    remaining_actions: usize,
    #[serde(rename = "executableActions")]
    executable_actions: usize,
    #[serde(rename = "reviewActions")]
    review_actions: usize,
    #[serde(rename = "compileIssues")]
    compile_issues: usize,
    #[serde(rename = "dependencyCycles")]
    dependency_cycles: usize,
    #[serde(rename = "canonicalizationActions")]
    canonicalization_actions: usize,
    #[serde(rename = "danglingReferences")]
    dangling_references: usize,
    #[serde(rename = "relationRecommendations")]
    relation_recommendations: usize,
    #[serde(rename = "externalElementRefs")]
    external_element_refs: usize,
    #[serde(rename = "externalElementRefsIgnored")]
    external_element_refs_ignored: usize,
    #[serde(rename = "unassignedNodes")]
    unassigned_nodes: usize,
    #[serde(rename = "emptyDomains")]
    empty_domains: usize,
    #[serde(rename = "capabilitiesWithoutEvidence")]
    capabilities_without_evidence: usize,
}

#[derive(Serialize)]
struct PlanFilters<'a> {
    #[serde(rename = "executableOnly")]
    executable_only: bool,
    phases: Vec<&'a str>,
    severities: Vec<&'a str>,
    kinds: Vec<&'a str>,
}

#[derive(Serialize)]
struct PlanCursor<'a> {
    #[serde(rename = "afterActionId")]
    after_action_id: Option<&'a str>,
    found: bool,
    reason: Option<&'static str>,
    #[serde(rename = "startIndex")]
    start_index: Option<usize>,
    #[serde(rename = "nextAfterActionId")]
    next_after_action_id: Option<&'a str>,
    #[serde(rename = "hasMore")]
    has_more: bool,
}

pub struct MaintenancePlanAnswer<'a> {
    graph_hash: &'a str,
    summary: PlanSummary,
    filter_names: [Vec<String>; 3],
    executable_only: bool,
    after_action_id: Option<String>,
    cursor_found: bool,
    start_index: Option<usize>,
    has_more: bool,
    by_phase: IndexMap<String, usize>,
    by_severity: IndexMap<String, usize>,
    by_kind: IndexMap<String, usize>,
    page: Vec<Action<'a>>,
}

impl Serialize for MaintenancePlanAnswer<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut map = serializer.serialize_map(None)?;
        map.serialize_entry("operation", "maintenance_plan")?;
        map.serialize_entry("sideEffect", &false)?;
        map.serialize_entry("graphHash", self.graph_hash)?;
        map.serialize_entry("summary", &self.summary)?;
        let [phases, severities, kinds] = &self.filter_names;
        map.serialize_entry(
            "filters",
            &PlanFilters {
                executable_only: self.executable_only,
                phases: phases.iter().map(String::as_str).collect(),
                severities: severities.iter().map(String::as_str).collect(),
                kinds: kinds.iter().map(String::as_str).collect(),
            },
        )?;
        map.serialize_entry(
            "cursor",
            &PlanCursor {
                after_action_id: self.after_action_id.as_deref(),
                found: self.cursor_found,
                reason: if self.cursor_found {
                    None
                } else {
                    Some("afterActionId not found in filtered maintenance actions")
                },
                start_index: self.start_index,
                next_after_action_id: self.page.last().map(|action| action.id.as_str()),
                has_more: self.has_more,
            },
        )?;
        map.serialize_entry("byPhase", &self.by_phase)?;
        map.serialize_entry("bySeverity", &self.by_severity)?;
        map.serialize_entry("byKind", &self.by_kind)?;
        map.serialize_entry("limited", &self.has_more)?;
        map.serialize_entry(
            "nextExecutableAction",
            &self.page.iter().find(|action| action.is_executable()),
        )?;
        map.serialize_entry(
            "nextReviewAction",
            &self.page.iter().find(|action| !action.is_executable()),
        )?;
        map.serialize_entry("actions", &self.page)?;
        map.end()
    }
}

fn canonicalization_steps<'a>(graph: &'a CompiledGraph, steps: &mut Vec<Step<'a>>) {
    for row in graph.canonicalization_actions() {
        steps.push(Step {
            phase: "repair",
            kind: "canonicalize_graph_arrays",
            severity: "warn",
            score: 0.95,
            reason: format!(
                "{} has non-canonical graph arrays: {}.",
                row.slug,
                row.keys.join(", ")
            ),
            subject: Subject::Write {
                proposed: Some(ProposedAction {
                    tool: "patch_concept",
                    args: ActionArguments::Patch {
                        slug: row.slug.clone(),
                        frontmatter: FrontmatterPatch(row.frontmatter.clone()),
                        expected_mtime: row.expected_mtime,
                    },
                }),
                node: graph
                    .node_by_slug(&row.slug)
                    .map(|id| NodeSummary::of(graph, id)),
            },
        });
    }
}

/// Domains and projects whose membership changed after their description was last written. The
/// fix is a person reading the domain against its members, so the step is a review and nothing
/// here is broken, only owed.
fn stale_summary_steps<'a>(
    graph: &'a CompiledGraph,
    request: &QueryRequest,
    steps: &mut Vec<Step<'a>>,
) {
    for row in &request.selection.outside.stale_summaries {
        if row.slug.is_empty() {
            continue;
        }
        steps.push(Step {
            phase: "review",
            kind: "rejudge_summary_membership",
            severity: "info",
            score: row.score,
            reason: if row.hint.is_empty() {
                format!(
                    "\"{}\" declares a membership that changed after its description was last written.",
                    row.slug
                )
            } else {
                row.hint.clone()
            },
            subject: Subject::Review {
                node: graph
                    .node_by_slug(&row.slug)
                    .map(|id| NodeSummary::of(graph, id)),
            },
        });
    }
}

pub fn maintenance_plan<'a>(
    graph: &'a CompiledGraph,
    request: &QueryRequest,
) -> Result<MaintenancePlanAnswer<'a>, QueryError> {
    let limit = request.limit.unwrap_or(MAINTENANCE_PLAN_LIMIT);
    let arguments = &request.selection.arguments;
    let phase_filter = filter_of(arguments.phases.as_deref(), "phases", &PHASES)?;
    let severity_filter = filter_of(arguments.severities.as_deref(), "severities", &SEVERITIES)?;
    let kind_filter = filter_of(arguments.kinds.as_deref(), "kinds", &KINDS)?;
    let cycle_report = dependency_view::cycles(graph, limit, None, &default_types(), "types")?;
    let recommendations = recommend(graph, None, limit);
    let external = external_elements(graph, &request.selection.outside.ignore_patterns, limit);
    let dangling = dangling_references(graph, limit);
    let unassigned = unassigned_nodes(graph, limit);
    let empty = empty_domains(graph, limit);
    let bodies = read_bodies(graph, limit, arguments.touching.as_deref());
    let unearned = unearned_nodes(graph, &bodies.starter_bodies, limit);
    let without_evidence = capabilities_without_evidence(graph, limit);
    let flat = flat_slugs(graph, limit);
    let starters = starter_gaps(graph, limit);

    let (total_cycles, cycle_rows) = (cycle_report.total, cycle_report.cycles);
    let totals = (
        dangling.total(),
        recommendations.total,
        external.total(),
        external.ignored(),
        unassigned.total(),
        empty.total(),
        without_evidence.total(),
    );

    let mut steps: Vec<Step<'a>> = Vec::new();
    for issue in graph.issues() {
        let message = issue.message();
        steps.push(Step {
            phase: "validate",
            kind: "inspect_compile_issue",
            severity: "warn",
            score: 1.0,
            reason: if message.is_empty() {
                issue.code().to_string()
            } else {
                message
            },
            subject: Subject::Issue(issue),
        });
    }
    for cycle in cycle_rows {
        steps.push(Step {
            phase: "repair",
            kind: "break_dependency_cycle",
            severity: "fail",
            score: 1.0,
            reason: format!(
                "Dependency cycle detected across {} nodes.",
                cycle.nodes().len() - 1
            ),
            subject: Subject::Cycle(cycle),
        });
    }
    canonicalization_steps(graph, &mut steps);
    for row in dangling.into_rows() {
        steps.push(Step {
            phase: "repair",
            kind: row.kind,
            severity: "warn",
            score: row.score,
            reason: row.reason,
            subject: Subject::Write {
                proposed: row.proposed_action,
                node: Some(row.node),
            },
        });
    }
    for row in recommendations.rows {
        steps.push(Step {
            phase: "link",
            kind: "add_missing_relation",
            severity: "warn",
            score: row.score,
            reason: row.reason,
            subject: Subject::Link {
                proposed: row.proposed_action,
                nodes: row.nodes,
            },
        });
    }
    for row in external.into_rows() {
        steps.push(Step {
            phase: "materialize",
            kind: row.kind,
            severity: "info",
            score: row.score,
            reason: row.reason,
            subject: Subject::Write {
                proposed: Some(row.proposed_action),
                node: Some(row.node),
            },
        });
    }
    for group in [
        unassigned.into_rows(),
        unearned.into_rows(),
        empty.into_rows(),
        without_evidence.into_rows(),
    ] {
        for row in group {
            steps.push(Step {
                phase: "review",
                kind: row.kind,
                severity: "info",
                score: row.score,
                reason: row.reason,
                subject: Subject::Review {
                    node: Some(row.node),
                },
            });
        }
    }
    for row in bodies
        .gaps
        .rows
        .into_iter()
        .chain(flat.rows)
        .chain(starters.rows)
    {
        steps.push(review(row));
    }
    stale_summary_steps(graph, request, &mut steps);

    if let Some(touching) = arguments.touching.as_deref() {
        steps.retain(|step| {
            step.slugs()
                .iter()
                .any(|slug| touching.iter().any(|touched| touched == slug))
        });
    }
    let total_steps = steps.len();
    steps.sort_by(compare_steps);
    let mut slots: Vec<Option<Action<'a>>> = steps
        .into_iter()
        .map(|step| Some(Action::of(step)))
        .collect();
    let executable = slots
        .iter()
        .flatten()
        .filter(|action| action.is_executable())
        .count();
    let executable_only = arguments.executable_only.unwrap_or(false);
    let filtered: Vec<usize> = slots
        .iter()
        .enumerate()
        .filter_map(|(index, slot)| {
            let action = slot.as_ref()?;
            let step = &action.step;
            let keeps = (!executable_only || action.is_executable())
                && phase_filter
                    .as_ref()
                    .is_none_or(|set| set.contains(step.phase))
                && severity_filter
                    .as_ref()
                    .is_none_or(|set| set.contains(step.severity))
                && kind_filter
                    .as_ref()
                    .is_none_or(|set| set.contains(step.kind));
            keeps.then_some(index)
        })
        .collect();
    let after_action_id = arguments
        .after_action_id
        .as_deref()
        .map(trim)
        .filter(|text| !text.is_empty())
        .map(str::to_string);
    let after_index = after_action_id.as_deref().and_then(|wanted| {
        filtered.iter().position(|index| {
            slots
                .get(*index)
                .and_then(Option::as_ref)
                .is_some_and(|action| action.id == wanted)
        })
    });
    let cursor_found = after_action_id.is_none() || after_index.is_some();
    let cursor: &[usize] = match (&after_action_id, after_index) {
        (None, _) => &filtered,
        (Some(_), Some(at)) => filtered.get(at + 1..).unwrap_or_default(),
        (Some(_), None) => &[],
    };
    let step_of = |index: &usize| {
        slots
            .get(*index)
            .and_then(Option::as_ref)
            .map(|action| &action.step)
    };
    let by_phase = sorted_counts(cursor.iter().filter_map(step_of).map(|step| step.phase));
    let by_severity = sorted_counts(cursor.iter().filter_map(step_of).map(|step| step.severity));
    let by_kind = sorted_counts(cursor.iter().filter_map(step_of).map(|step| step.kind));
    let start_index = match (&after_action_id, after_index) {
        (None, _) => Some(0),
        (Some(_), Some(at)) => Some(at + 1),
        (Some(_), None) => None,
    };
    let remaining = cursor.len();
    let page_indices: Vec<usize> = cursor.iter().copied().take(limit).collect();
    let page: Vec<Action<'a>> = page_indices
        .iter()
        .filter_map(|index| slots.get_mut(*index).and_then(Option::take))
        .collect();
    let (
        dangling_total,
        recommended_total,
        external_total,
        external_ignored,
        unassigned_total,
        empty_total,
        evidence_total,
    ) = totals;

    Ok(MaintenancePlanAnswer {
        graph_hash: graph.graph_hash(),
        summary: PlanSummary {
            total_actions: total_steps,
            filtered_actions: filtered.len(),
            remaining_actions: remaining,
            executable_actions: executable,
            review_actions: total_steps - executable,
            compile_issues: graph.issues().len(),
            dependency_cycles: total_cycles,
            canonicalization_actions: graph.canonicalization_actions().len(),
            dangling_references: dangling_total,
            relation_recommendations: recommended_total,
            external_element_refs: external_total,
            external_element_refs_ignored: external_ignored,
            unassigned_nodes: unassigned_total,
            empty_domains: empty_total,
            capabilities_without_evidence: evidence_total,
        },
        filter_names: [
            sorted(phase_filter.as_ref())
                .into_iter()
                .map(String::from)
                .collect(),
            sorted(severity_filter.as_ref())
                .into_iter()
                .map(String::from)
                .collect(),
            sorted(kind_filter.as_ref())
                .into_iter()
                .map(String::from)
                .collect(),
        ],
        executable_only,
        after_action_id,
        cursor_found,
        start_index,
        has_more: remaining > limit,
        by_phase,
        by_severity,
        by_kind,
        page,
    })
}
