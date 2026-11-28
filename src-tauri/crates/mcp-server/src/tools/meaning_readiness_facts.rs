//! What `health` and `workspace_brief` take from the meaning of each project: the assessment
//! `finalize_project_meaning` ends with, judged again from the receipts the vault holds, so a
//! project whose competency answers have fallen behind its ontology or source is named.

use answer_format::collation::compare_text;
use ontology_graph::{CompiledGraph, ProjectMeaningFacts, SourceNow, WitnessesNow};
use project_meaning::{
    parse_competency_markdown, read_meaning_assessment, AssessedProject, SourceFacts,
};
use project_source::LiveWitnessCheck;
use vault_document::LoadedDocument;

use super::project_meaning_context::project_meaning_context;
use super::read_vault::read_vault;
use crate::dispatch::CallContext;
use crate::error::ToolError;

/// The structure is judged by `health` itself; a meaning check asks only about the receipts.
const STRUCTURE_ASSUMED: &str = "ready";
const REVISION_CHARACTERS: usize = 12;

fn source_now(live: &LiveWitnessCheck) -> Option<SourceNow> {
    let summary = &live.witness_summary;
    let witnesses = match live.status {
        "witnesses_supported" => WitnessesNow::AllResolve {
            total: summary.total,
        },
        "witnesses_missing" => WitnessesNow::SomeMissing {
            missing: summary.missing,
            total: summary.total,
        },
        _ => return None,
    };
    Some(SourceNow {
        revision: live
            .source_revision
            .chars()
            .take(REVISION_CHARACTERS)
            .collect(),
        witnesses,
    })
}

fn project_facts(
    call: &CallContext<'_>,
    graph: &CompiledGraph,
    documents: &[LoadedDocument],
    project_slug: &str,
) -> ProjectMeaningFacts {
    let context = project_meaning_context(call, graph, documents, project_slug, None);
    let body = context
        .scope
        .documents
        .iter()
        .find(|document| document.slug() == project_slug)
        .and_then(|document| document.body().ok());
    let source = SourceFacts::of_view(&context.view);
    let assessment = read_meaning_assessment(
        &call.config().vault_root,
        &AssessedProject {
            project_slug,
            project_body: body.as_deref(),
            graph_hash: context.graph_hash.as_deref(),
            structure_status: Some(STRUCTURE_ASSUMED),
            source: &source,
            inventory: context.inventory.as_ref().ok(),
        },
    );
    ProjectMeaningFacts {
        project_slug: project_slug.to_string(),
        status: assessment.status.to_string(),
        top_gap: assessment
            .top_gap
            .map_or_else(|| "assessment_input_invalid".to_string(), |gap| gap.id),
        next_action: assessment.next_action.id.to_string(),
        competency_authored: body
            .as_deref()
            .is_some_and(|body| parse_competency_markdown(body).is_ok()),
        source_now: context.view.live.as_ref().and_then(source_now),
    }
}

/// The assessment of every project of the vault, ordered by slug; empty for a vault with none.
pub fn meaning_readiness_facts(
    call: &CallContext<'_>,
    graph: &CompiledGraph,
) -> Result<Vec<ProjectMeaningFacts>, ToolError> {
    let mut slugs: Vec<&str> = graph
        .nodes()
        .iter()
        .filter(|node| node.kind() == "project")
        .map(|node| node.slug())
        .collect();
    if slugs.is_empty() {
        return Ok(Vec::new());
    }
    slugs.sort_by(|left, right| compare_text(left, right));
    let read = read_vault(call)?;
    Ok(slugs
        .into_iter()
        .map(|slug| project_facts(call, graph, read.vault.documents(), slug))
        .collect())
}
