//! `validate_vault`: every finding about the vault, whether its summaries and the code it cites are
//! still current, and which cited paths no longer exist, in pages. Read-only. The report itself is
//! built in `vault_validation_report`.

use vault_validation::{page_validation, PageRequest};

use super::argument_checks::{
    optional_non_blank_text, optional_non_negative_integer, optional_positive_integer,
};
use super::read_vault::read_vault;
use super::vault_validation_report::build_report;
use crate::answer::ToolOutput;
use crate::arguments::Arguments;
use crate::dispatch::CallContext;
use crate::error::ToolError;

const MAXIMUM_LIMIT: f64 = 500.0;

#[allow(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    reason = "the arguments were checked to be whole numbers from zero up to 500, or a page start"
)]
fn count(number: f64) -> usize {
    number as usize
}

pub fn call(context: &CallContext<'_>, arguments: &Arguments) -> Result<ToolOutput, ToolError> {
    let offset = optional_non_negative_integer(arguments, "offset", None)?.map(count);
    let unplaced_offset =
        optional_non_negative_integer(arguments, "unplacedOffset", None)?.map(count);
    let limit = optional_positive_integer(arguments, "limit", Some(MAXIMUM_LIMIT))?.map(count);
    let repo_root = optional_non_blank_text(arguments, "repoRoot")?;

    let read = read_vault(context)?;
    let report = build_report(
        context,
        &read.root,
        read.vault.documents(),
        repo_root.as_deref(),
    )?;
    let page = page_validation(
        &report.frame,
        &report.list,
        &PageRequest::asked(
            offset.unwrap_or(0),
            unplaced_offset.unwrap_or(0),
            limit,
            repo_root.as_deref(),
        ),
    );
    ToolOutput::json(&page)
}
