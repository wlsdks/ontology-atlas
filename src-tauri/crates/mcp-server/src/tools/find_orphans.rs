//! `find_orphans`: the nodes nothing points at, which a person decides to connect or retire.

use serde::Serialize;
use vault_document::schema::KNOWN_KINDS;
use vault_document::{find_orphans, Orphan, ReferenceIndex};

use super::argument_checks::{optional_non_blank_text, optional_one_of, optional_text_list};
use super::read_vault::read_vault;
use crate::answer::ToolOutput;
use crate::arguments::Arguments;
use crate::dispatch::CallContext;
use crate::error::{ReceivedValue, ToolError};

#[derive(Serialize)]
struct Orphans<'a> {
    total: usize,
    orphans: Vec<Orphan<'a>>,
}

/// `excludeKinds`: at most one entry per kind, each a kind.
fn excluded_kinds(arguments: &Arguments) -> Result<Option<Vec<String>>, ToolError> {
    let Some(kinds) = optional_text_list(arguments, "excludeKinds", KNOWN_KINDS.len())? else {
        return Ok(None);
    };
    for kind in &kinds {
        if !KNOWN_KINDS.contains(&kind.as_str()) {
            return Err(ToolError::not_an_allowed_value(
                "excludeKinds items",
                ReceivedValue::Text(kind),
                &KNOWN_KINDS,
            ));
        }
    }
    Ok(Some(kinds))
}

pub fn call(context: &CallContext<'_>, arguments: &Arguments) -> Result<ToolOutput, ToolError> {
    let kind = match optional_non_blank_text(arguments, "kind")? {
        Some(_) => optional_one_of(arguments, "kind", &KNOWN_KINDS)?,
        None => None,
    };
    let excluded = excluded_kinds(arguments)?;
    let read = read_vault(context)?;
    let documents = read.vault.documents();
    let index = ReferenceIndex::new(documents);
    let orphans = find_orphans(documents, &index, kind, excluded.as_deref());
    ToolOutput::json(&Orphans {
        total: orphans.len(),
        orphans,
    })
}
