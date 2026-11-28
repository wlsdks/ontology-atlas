//! The ontology a vault's documents make: the compiler that reads nodes and edges out of them, the
//! compiled graph, and the answers `compile_ontology` and `query_ontology` give. See `README.md`.

mod adjacency;
mod compile_answer;
mod compile_issue;
mod compiled_graph;
mod graph_compiler;
mod graph_hash;
mod identity_error;
mod query;

pub use compile_answer::{compile_answer, CompileAnswer, CompileRequest, COMPILE_PAGE_MAX};
pub use compile_issue::{CompileIssue, IssueSeverity};
pub use compiled_graph::{
    Alias, Aliases, AmbiguousAlias, CanonicalizationAction, CompiledGraph, Edge, EdgeCounts,
    EdgeId, EdgeView, Node, NodeId, Target,
};
pub use graph_compiler::compile;
pub use identity_error::{IdentityError, IdentityFault};
pub use query::{
    is_match_nodes, match_nodes, parse_ignore_patterns, project_holdings, project_scope_slugs, run as run_query,
    Direction, LineSpan, NodeSort, Operation, OutsideFacts, ProjectHoldings, ProjectMeaningFacts,
    QueryAnswer, QueryError, QueryRequest, SelectionArguments, SelectionOperation,
    SelectionRequest, SourceNow, StaleSummary, UncertaintyRead, VaultValidationFacts,
    WalkOperation, WitnessesNow, RELATION_TYPE_VALUES, SEARCH_BUDGET_MAX,
};
