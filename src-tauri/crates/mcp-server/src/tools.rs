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

mod argument_checks;
mod compile_ontology;
mod compiled_graph;
mod concept_row;
mod connection_info;
mod find_backlinks;
mod find_orphans;
mod get_concepts;
mod git_history;
mod git_status;
mod list_concepts;
mod query_concepts;
mod query_ontology;
mod read_vault;
#[cfg(feature = "test-hooks")]
mod test_hooks;
mod vault_repository;

pub use compiled_graph::KeptGraph;

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
        "get_concepts" => Some(get_concepts::call(context, arguments)),
        "find_backlinks" => Some(find_backlinks::call(context, arguments)),
        "find_orphans" => Some(find_orphans::call(context, arguments)),
        "query_concepts" => Some(query_concepts::call(context, arguments)),
        "compile_ontology" => Some(compile_ontology::call(context, arguments)),
        "query_ontology" => Some(query_ontology::call(context, arguments)),
        "git_status" => Some(git_status::call(context)),
        "git_history" => Some(git_history::call(context, arguments)),
        _ => None,
    }
}

/// The handler of `tool`, or `None` while this build does not port it.
pub fn write_handler(tool: WriteTool) -> Option<WriteHandler> {
    match tool {
        WriteTool::AddConcept
        | WriteTool::AddConcepts
        | WriteTool::AddRelation
        | WriteTool::AddRelations
        | WriteTool::RemoveRelation
        | WriteTool::ReplaceRelation
        | WriteTool::PatchConcept
        | WriteTool::RenameConcept
        | WriteTool::ReclassifyConcept
        | WriteTool::MergeConcepts
        | WriteTool::DeleteConcept
        | WriteTool::AbsorbDocument
        | WriteTool::ConnectProjectSource
        | WriteTool::DisconnectProjectSource
        | WriteTool::FinalizeProjectMeaning
        | WriteTool::GitSnapshot => None,
        #[cfg(feature = "test-hooks")]
        WriteTool::TestWrite => Some(test_hooks::write_through_checkpoint),
    }
}
