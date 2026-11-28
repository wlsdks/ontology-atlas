//! What a write says about the map after it: the maintenance steps about the nodes it touched,
//! and how the code's coverage moved. Neither is the whole vault's queue: `validate_vault` and
//! `query_ontology` answer that, so a write answers only for what it changed.

use build_depth::{measure_against_survey, Coverage};
use meaning_findings::WITNESS_TEXT_MAX_BYTES;
use ontology_graph::{
    run_query, Operation, QueryRequest, SelectionOperation,
};
use vault_document::LoadedDocument;
use vault_edit::Setting;

use super::answer_fields::Fields;
use super::sent_setting::parse;
use super::vault_view::VaultView;
use crate::audit::{AbilityShare, AreaShare, ShareCounts};
use crate::dispatch::CallContext;
use crate::error::ToolError;
use crate::write_checkpoint::Permit;
use crate::tools::import_scan_target::ScanTarget;
use crate::tools::kept_survey::kept_survey;
use crate::tools::query_ontology::read_ignore_patterns;

/// Steps each check scans before the plan is narrowed to the written nodes.
const FINDING_SCAN_LIMIT: usize = 100;
/// Further subjects a grouped finding line names before it counts the rest.
const FINDING_SUBJECTS_MAX: usize = 8;

/// Review prompts that judge a settled map (a wide parent, an empty domain, a node nothing
/// contains yet): in the middle of a build they name work the next batch does.
const SETTLED_MAP_REVIEW_KINDS: [&str; 6] = [
    "empty_domain",
    "fold_bulk_siblings",
    "rejudge_summary_membership",
    "retire_starter_example",
    "retire_unearned_node",
    "unassigned_node",
];

fn text_of<'a>(action: &'a Setting, key: &str) -> &'a str {
    action
        .member(key)
        .and_then(Setting::as_text)
        .unwrap_or_default()
}

/// The steps about `slugs`, as the plan words them. A plan that cannot be made is no steps: a
/// measurement never fails the write.
fn steps_about(context: &CallContext<'_>, slugs: &[String], limit: usize) -> Vec<Setting> {
    let attempt = || -> Option<Vec<Setting>> {
        let graph = context.compiled_graph().read(context).ok()?;
        let mut request = QueryRequest::new(Operation::Selection(SelectionOperation::MaintenancePlan));
        request.limit = Some(limit);
        request.selection.arguments.touching = Some(slugs.to_vec());
        request.selection.outside.ignore_patterns = read_ignore_patterns(context).ok()?;
        let answer = run_query(&graph, &request).ok()?;
        let text = answer_format::json::to_string(&answer).ok()?;
        match parse(&text).ok()? {
            Setting::Map(members) => members.into_iter().find_map(|(key, value)| match value {
                Setting::List(actions) if key == "actions" => Some(actions),
                _ => None,
            }),
            _ => None,
        }
    };
    attempt().unwrap_or_default()
}

fn json_text(value: &Setting) -> String {
    serde_json::to_string(&super::answer_fields::Answer(value)).unwrap_or_default()
}

fn subject_of(action: &Setting) -> String {
    let proposed = action.member("proposedAction");
    let args = proposed.and_then(|proposed| proposed.member("args"));
    let first = |key: &str| match args.and_then(|args| args.member(key)) {
        Some(Setting::List(rows)) => rows.first(),
        _ => None,
    };
    let row = first("concepts").or_else(|| first("relations")).or(args);
    let named = |holder: Option<&Setting>, key: &str| {
        holder
            .and_then(|holder| holder.member(key))
            .and_then(Setting::as_text)
            .map(str::to_string)
    };
    named(row, "slug")
        .or_else(|| named(row, "to"))
        .or_else(|| named(action.member("node"), "slug"))
        .unwrap_or_else(|| text_of(action, "id").to_string())
}

fn finding_line(action: &Setting) -> String {
    let cycle = match action.member("cycle").and_then(|cycle| cycle.member("nodes")) {
        Some(Setting::List(nodes)) => {
            let names: Vec<&str> = nodes.iter().filter_map(Setting::as_text).collect();
            format!(" {}.", names.join(" -> "))
        }
        _ => String::new(),
    };
    let proposed = action.member("proposedAction");
    let next = match (action.member("executable"), proposed) {
        (Some(Setting::Bool(true)), Some(proposed)) => format!(
            " Next: {}({})",
            text_of(proposed, "tool"),
            proposed.member("args").map(json_text).unwrap_or_default()
        ),
        _ => String::new(),
    };
    format!("{}{cycle}{next}", text_of(action, "reason"))
}

fn grouped_line(group: &[&Setting]) -> String {
    let Some((first, rest)) = group.split_first() else {
        return String::new();
    };
    if rest.is_empty() {
        return finding_line(first);
    }
    let subjects: Vec<String> = rest
        .iter()
        .take(FINDING_SUBJECTS_MAX)
        .map(|action| subject_of(action))
        .collect();
    let unnamed = rest.len().saturating_sub(FINDING_SUBJECTS_MAX);
    let tail = if unnamed > 0 {
        format!(" and {unnamed} others")
    } else {
        String::new()
    };
    format!(
        "{} Same for {} more: {}{tail}.",
        finding_line(first),
        rest.len(),
        subjects.join(", ")
    )
}

/// What the maintenance plan says about the nodes a build write just touched: one plain line per
/// kind, with the call that settles it.
pub fn findings_on_written(context: &CallContext<'_>, written: &[String]) -> Vec<String> {
    if written.is_empty() {
        return Vec::new();
    }
    let steps = steps_about(context, written, FINDING_SCAN_LIMIT);
    let mut kinds: Vec<(&str, Vec<&Setting>)> = Vec::new();
    for action in &steps {
        let kind = text_of(action, "kind");
        if SETTLED_MAP_REVIEW_KINDS.contains(&kind) {
            continue;
        }
        match kinds.iter_mut().find(|(held, _)| *held == kind) {
            Some((_, group)) => group.push(action),
            None => kinds.push((kind, vec![action])),
        }
    }
    kinds.iter().map(|(_, group)| grouped_line(group)).collect()
}

fn compact_node(node: &Setting) -> Setting {
    Setting::Map(
        ["slug", "kind", "title"]
            .iter()
            .filter_map(|key| {
                node.member(key)
                    .map(|value| ((*key).to_string(), value.clone()))
            })
            .collect(),
    )
}

fn compact_action(action: &Setting) -> Setting {
    let mut fields = Fields::new();
    for key in [
        "id",
        "phase",
        "kind",
        "severity",
        "score",
        "executable",
        "reason",
        "proposedAction",
    ] {
        fields = fields.with_some(key, action.member(key).cloned());
    }
    fields = fields.with_some("node", action.member("node").map(compact_node));
    let nodes = action.member("nodes").map(|nodes| match nodes {
        Setting::List(items) => Setting::List(items.iter().map(compact_node).collect()),
        Setting::Map(members) => Setting::Map(
            members
                .iter()
                .map(|(key, node)| (key.clone(), compact_node(node)))
                .collect(),
        ),
        other => other.clone(),
    });
    fields.with_some("nodes", nodes).into_setting()
}

/// The one step that comes next for the nodes a write touched: a call that settles one, else the
/// first judgement that is left, and how many steps there are about them.
pub fn post_write_maintenance(context: &CallContext<'_>, touched: &[String]) -> Setting {
    let steps = steps_about(context, touched, 5);
    let is_executable = |action: &&Setting| matches!(action.member("executable"), Some(Setting::Bool(true)));
    let next = steps
        .iter()
        .find(is_executable)
        .or_else(|| steps.first())
        .map(compact_action);
    #[allow(clippy::cast_precision_loss, reason = "a count of steps")]
    let count = steps.len() as f64;
    Fields::new()
        .with("nextAction", next.unwrap_or(Setting::Null))
        .with("stepsAboutTouched", Setting::Number(count))
        .into_setting()
}

/// The code's coverage by the documents given, or `None` when no repository is known.
pub fn measure_coverage(
    context: &CallContext<'_>,
    documents: &[LoadedDocument],
) -> Option<Coverage> {
    if context.config().repo_resolution == "process.cwd" {
        return None;
    }
    let target = ScanTarget::allow_named(context, None, "repoRoot").ok()?;
    let source = target.source_with_limit(WITNESS_TEXT_MAX_BYTES);
    let survey = kept_survey(context, &target, &[]).ok()?;
    let reads = context.source_reads().reads_under(target.source_root());
    measure_against_survey(documents, &survey, &reads, &source).coverage
}

#[allow(clippy::cast_precision_loss, reason = "counts of abilities and areas")]
fn count(value: usize) -> Setting {
    Setting::Number(value as f64)
}

fn moved(name: &str, before: Option<usize>, after: Option<usize>, fields: Fields) -> Fields {
    if before == after {
        return fields;
    }
    fields.with(
        name,
        Fields::new()
            .with_some("before", before.map(count))
            .with_some("after", after.map(count))
            .into_setting(),
    )
}

/// What moved between two measures of the coverage, and nothing else: the abilities the map
/// placed or lost, the areas, the files read. `None` when nothing moved.
pub fn coverage_change(before: Option<&Coverage>, after: Option<&Coverage>) -> Option<Setting> {
    if before == after {
        return None;
    }
    let breadth = |coverage: Option<&Coverage>, pick: fn(&Coverage) -> usize| coverage.map(pick);
    let mut fields = Fields::new();
    fields = moved("abilities", breadth(before, |c| c.breadth.abilities), breadth(after, |c| c.breadth.abilities), fields);
    fields = moved("node", breadth(before, |c| c.breadth.node), breadth(after, |c| c.breadth.node), fields);
    fields = moved("named", breadth(before, |c| c.breadth.named), breadth(after, |c| c.breadth.named), fields);
    fields = moved("excluded", breadth(before, |c| c.breadth.excluded), breadth(after, |c| c.breadth.excluded), fields);
    fields = moved("unplaced", breadth(before, |c| c.breadth.unplaced.len()), breadth(after, |c| c.breadth.unplaced.len()), fields);
    let area = |coverage: Option<&Coverage>, pick: fn(&build_depth::AreaSummary) -> usize| {
        coverage.and_then(|c| c.areas.as_ref()).map(pick)
    };
    fields = moved("notMapped", area(before, |a| a.not_mapped), area(after, |a| a.not_mapped), fields);
    fields = moved("uncovered", area(before, |a| a.uncovered), area(after, |a| a.uncovered), fields);
    let read = |coverage: Option<&Coverage>| coverage.and_then(|c| c.reads.as_ref()).map(|r| r.read);
    fields = moved("read", read(before), read(after), fields);
    match fields.into_setting() {
        Setting::Map(members) if members.is_empty() => None,
        other => Some(other),
    }
}

/// The counts one map analysis line carries, from the coverage after the write.
pub fn share_counts(coverage: Option<&Coverage>, source: SourceState) -> ShareCounts {
    ShareCounts {
        source_commit: source.commit,
        source_dirty: source.dirty,
        abilities: coverage.and_then(|c| {
            c.areas.as_ref().map(|a| AbilityShare {
                total: a.abilities as u64,
                off_map: a.uncovered as u64,
            })
        }),
        areas: coverage.and_then(|c| {
            c.areas.as_ref().map(|a| AreaShare {
                total: a.counted as u64,
                not_mapped: a.not_mapped as u64,
            })
        }),
    }
}

/// The share counts of the vault as it stands now: what a write that ends in a share line reports.
pub fn counts_after(permit: &Permit<'_>) -> Result<ShareCounts, ToolError> {
    let context = permit.context();
    let view = VaultView::read(permit)?;
    let coverage = measure_coverage(context, view.documents());
    Ok(share_counts(coverage.as_ref(), source_state(context)))
}

/// The code's `HEAD` and whether it holds uncommitted changes outside the vault.
#[derive(Debug, Clone, Default)]
pub struct SourceState {
    pub commit: Option<String>,
    pub dirty: Option<bool>,
}

pub fn source_state(context: &CallContext<'_>) -> SourceState {
    use hardened_git::{RepoPath, Repository};
    let config = context.config();
    if config.repo_resolution == "process.cwd" {
        return SourceState::default();
    }
    let repository = Repository::at(&config.repo_root);
    let Ok(Some(facts)) = repository.facts() else {
        return SourceState::default();
    };
    let Ok(tree) = repository.working_tree(&[RepoPath::root()]) else {
        return SourceState::default();
    };
    let top = confined_files::real_path(&facts.top_level).unwrap_or(facts.top_level);
    let vault_below = config
        .vault_root
        .strip_prefix(&top)
        .ok()
        .map(|below| below.to_string_lossy().replace('\\', "/"));
    let dirty = tree.rows.iter().any(|row| {
        vault_below
            .as_deref()
            .filter(|folder| !folder.is_empty())
            .is_none_or(|folder| !(row.path == folder || row.path.starts_with(&format!("{folder}/"))))
    });
    SourceState {
        commit: tree.head.commit().map(|commit| commit.as_str().to_string()),
        dirty: Some(dirty),
    }
}
