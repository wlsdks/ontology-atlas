//! `find_backlinks`: who points at a node, asked before a rename, a merge or a delete.

use answer_format::utf16;
use serde::Serialize;
use vault_document::{find_backlinks, Backlink, ReferenceIndex};

use super::argument_checks::required_non_blank_text;
use super::read_vault::read_vault;
use crate::answer::ToolOutput;
use crate::arguments::Arguments;
use crate::dispatch::CallContext;
use crate::error::ToolError;

#[derive(Serialize)]
struct Backlinks<'a> {
    target: &'a str,
    total: usize,
    matches: Vec<Backlink<'a>>,
}

pub fn call(context: &CallContext<'_>, arguments: &Arguments) -> Result<ToolOutput, ToolError> {
    let slug = required_non_blank_text(arguments, "slug")?;
    let read = read_vault(context)?;
    let documents = read.vault.documents();
    let index = ReferenceIndex::new(documents);
    let mut matches = find_backlinks(documents, &index, &slug);
    matches.sort_by(|left, right| utf16::compare(left.slug, right.slug));
    ToolOutput::json(&Backlinks {
        target: &slug,
        total: matches.len(),
        matches,
    })
}
