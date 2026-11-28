//! The graph an `agent_brief` is put to: the project it is about and what that project holds, and
//! nothing else of the vault. The vault's other nodes (a second project, a node no project holds)
//! would otherwise count in the readiness of a project they are not part of. A vault that is one
//! project is answered from the graph already compiled.

use std::sync::Arc;

use ontology_graph::{compile, project_holdings, CompiledGraph};

use super::read_vault::read_vault;
use crate::dispatch::CallContext;
use crate::error::ToolError;

/// The graph of the project `named` means (the only one when none is named), with the slug of that
/// project. A vault with no project node is answered whole and names none.
pub fn project_graph(
    context: &CallContext<'_>,
    whole: Arc<CompiledGraph>,
    named: Option<&str>,
    refuse: impl Fn(ontology_graph::QueryError) -> ToolError,
) -> Result<(Arc<CompiledGraph>, Option<String>), ToolError> {
    let Some(holdings) = project_holdings(&whole, named).map_err(refuse)? else {
        return Ok((whole, None));
    };
    let read = read_vault(context)?;
    let documents = read.vault.documents();
    let held: Vec<_> = documents
        .iter()
        .filter(|document| holdings.holds(document.slug()))
        .cloned()
        .collect();
    let project = holdings.project.clone();
    if held.len() != holdings.node_count() {
        return Err(ToolError::failed(format!(
            "agent_brief blocked: selected project \"{project}\" contains a compiled node without one readable vault document. Run validate_vault and repair the missing document before using the handoff."
        )));
    }
    if held.len() == documents.len() {
        return Ok((whole, Some(project)));
    }
    let scoped = compile(&held).map_err(|error| ToolError::failed(error.to_string()))?;
    Ok((Arc::new(scoped), Some(project)))
}
