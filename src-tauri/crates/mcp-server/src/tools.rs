//! The tool handlers. A family of tools joins the server by adding its names to [`call`] (a read
//! tool) or to [`write_handler`] (a write tool); a tool absent from them is, in the release build,
//! absent from dispatch: the JavaScript server stays the shipped one until every tool answers here
//! and the differential harness finds them equal.
//!
//! [`write_handler`] matches every [`WriteTool`] by name, with no catch-all, so a tool added to that
//! list does not compile until this file says whether it is ported.

use crate::answer::ToolOutput;
use crate::arguments::Arguments;
use crate::audit::WriteDone;
use crate::dispatch::CallContext;
use crate::error::ToolError;
use crate::write_checkpoint::Permit;
use crate::write_tool::WriteTool;

mod analyze_repo_structure;
mod argument_checks;
mod compile_ontology;
mod compiled_graph;
mod concept_row;
mod connection_info;
mod find_backlinks;
mod get_concepts;
mod get_constellation;
mod import_answers;
mod import_scan_target;
mod infer_imports;
mod inspect_architecture;
mod kept_survey;
mod list_concepts;
mod meaning_readiness_facts;
mod project_graph;
mod project_meaning_context;
mod project_source_scope;
mod query_ontology;
mod read_source;
mod read_vault;
mod reply_bytes;
#[cfg(feature = "test-hooks")]
mod test_hooks;
mod validate_vault;
mod validate_wiki;
mod vault_facts;
mod vault_repository;
mod vault_validation_facts;
mod vault_validation_report;
mod writes;

pub use compiled_graph::KeptGraph;
pub use writes::connect_consent_root;

/// A write tool's handler. It receives the proof that the checkpoint passed, and answers with what
/// the audit lines record, so it cannot finish without saying.
pub type WriteHandler = fn(&Permit<'_>, &Arguments) -> Result<WriteDone, ToolError>;

/// The result of read tool `name`, or `None` when this build does not handle it.
pub fn call(
    context: &CallContext<'_>,
    name: &str,
    arguments: &Arguments,
) -> Option<Result<ToolOutput, ToolError>> {
    #[cfg(feature = "test-hooks")]
    if let Some(result) = test_hooks::call(context, name, arguments) {
        return Some(result);
    }
    match name {
        "connection_info" => Some(connection_info::call(context, arguments)),
        "list_concepts" => Some(list_concepts::call(context, arguments)),
        "get_constellation" => Some(get_constellation::call(context, arguments)),
        "get_concepts" => Some(get_concepts::call(context, arguments)),
        "find_backlinks" => Some(find_backlinks::call(context, arguments)),
        "read_source" => Some(read_source::call(context, arguments)),
        "compile_ontology" => Some(compile_ontology::call(context, arguments)),
        "query_ontology" => Some(query_ontology::call(context, arguments)),
        "validate_vault" => Some(validate_vault::call(context, arguments)),
        "validate_wiki" => Some(validate_wiki::call(context, arguments)),
        "infer_imports" => Some(infer_imports::call(context, arguments)),
        "inspect_architecture" => Some(inspect_architecture::call(context, arguments)),
        "analyze_repo_structure" => Some(analyze_repo_structure::call(context, arguments)),
        _ => None,
    }
}

/// The handler of `tool`, or `None` while this build does not port it.
pub fn write_handler(tool: WriteTool) -> Option<WriteHandler> {
    match tool {
        WriteTool::PatchConcept => Some(writes::patch_concept),
        WriteTool::AddConcepts => Some(writes::add_concepts),
        WriteTool::AddConcept => Some(writes::add_concept),
        WriteTool::AddRelations => Some(writes::add_relations),
        WriteTool::AddRelation => Some(writes::add_relation),
        WriteTool::RemoveRelation => Some(writes::remove_relation),
        WriteTool::RenameConcept => Some(writes::rename_concept),
        WriteTool::MergeConcepts => Some(writes::merge_concepts),
        WriteTool::DeleteConcept => Some(writes::delete_concept),
        WriteTool::AbsorbDocument => Some(writes::absorb_document),
        WriteTool::ConnectProjectSource => Some(writes::connect_project_source),
        WriteTool::DisconnectProjectSource => Some(writes::disconnect_project_source),
        WriteTool::FinalizeProjectMeaning => Some(writes::finalize_project_meaning),
        #[cfg(feature = "test-hooks")]
        WriteTool::TestWrite => Some(test_hooks::write_through_checkpoint),
    }
}
