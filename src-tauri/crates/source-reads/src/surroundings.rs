//! What surrounds a symbol read: the functions its body calls, and the code around it that decides
//! what it does.

use crate::file_outline::OutlineDeclaration;
use crate::opened_file::OpenedFile;
use crate::read_environment::ReadEnvironment;
use crate::read_one::CallBudget;
use crate::source_row::{CallerSite, Callee, ContextPart, OmittedPart};

#[derive(Debug, Default)]
pub struct Surroundings {
    pub callees: Vec<Callee>,
    pub context: Vec<ContextPart>,
    pub omitted: Vec<OmittedPart>,
    pub callers: Vec<CallerSite>,
    pub deciding: Option<String>,
    /// Bytes the context parts add to the read.
    pub context_bytes: usize,
}

pub fn surroundings_of(
    _environment: &ReadEnvironment<'_>,
    _file: &OpenedFile,
    _declaration: &OutlineDeclaration,
    _end_line: usize,
    _body: &str,
    _budget: CallBudget,
    _body_bytes: usize,
) -> Surroundings {
    Surroundings::default()
}
