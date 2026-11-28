//! Every fact one judgement of a project's meaning reads: its containment and graph hash, the stored
//! view of its source judged against the folder as it is, and the witness inventory made from them.
//! `finalize_project_meaning` judges from it before it writes a receipt, and `health` and
//! `workspace_brief` judge from it to say whether a receipt is still current, so the two cannot
//! disagree about what a project holds.

use ontology_graph::CompiledGraph;
use project_meaning::{
    build_meaning_inventory, trusted_view_receipt, Inventory, InventoryInput, InventoryUnavailable,
};
use project_source::{
    derive_witness_claims_with_body, pinned_citation_verifier, read_source_view, SourceReceipt,
    SourceView, WitnessClaim,
};
use vault_document::LoadedDocument;

use super::project_source_scope::{project_scope, scope_slugs, ProjectScope};
use crate::dispatch::CallContext;

pub struct ProjectMeaningContext<'a> {
    pub graph_hash: Option<String>,
    pub scope: ProjectScope<'a>,
    pub view: SourceView,
    pub inventory: Result<Inventory, InventoryUnavailable>,
    pub claims: Vec<WitnessClaim>,
}

/// The witnesses a project's answers may cite, drawn from `receipt`: the stored one, or one just
/// measured. `project_body` is the body the project will have when a write is about to replace it;
/// `None` takes the body its file has.
pub fn meaning_inventory(
    call: &CallContext<'_>,
    graph: &CompiledGraph,
    project_slug: &str,
    scope: &ProjectScope<'_>,
    project_body: Option<&str>,
    receipt: Option<&SourceReceipt>,
) -> Result<Inventory, InventoryUnavailable> {
    let slugs = scope_slugs(graph, project_slug);
    let verify = pinned_citation_verifier(&call.config().vault_root, project_slug);
    build_meaning_inventory(&InventoryInput {
        project_slug,
        graph_hash: scope.graph_hash.as_deref(),
        scope: slugs.as_deref(),
        graph,
        documents: &scope.documents,
        project_body,
        receipt,
        verify_citation: verify.as_ref().map(|check| check as &dyn Fn(&_) -> bool),
    })
}

/// The facts of `project_slug` in `documents`, judged against its stored source receipt.
pub fn project_meaning_context<'a>(
    call: &CallContext<'_>,
    graph: &CompiledGraph,
    documents: &'a [LoadedDocument],
    project_slug: &str,
    project_body: Option<&str>,
) -> ProjectMeaningContext<'a> {
    let scope = project_scope(Some(graph), documents, project_slug);
    let claims = derive_witness_claims_with_body(project_slug, &scope.documents, project_body);
    let view = read_source_view(
        &call.config().vault_root,
        project_slug,
        scope.graph_hash.as_deref(),
        Some(&claims),
    );
    let inventory = meaning_inventory(
        call,
        graph,
        project_slug,
        &scope,
        project_body,
        trusted_view_receipt(&view, project_slug),
    );
    ProjectMeaningContext {
        graph_hash: scope.graph_hash.clone(),
        scope,
        view,
        inventory,
        claims,
    }
}
