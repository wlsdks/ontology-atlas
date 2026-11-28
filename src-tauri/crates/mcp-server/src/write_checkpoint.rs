//! The one gate every write tool passes, in the order the checks must run: read-only mode, then the
//! person's consent, then the session's write lock, then the write itself with its reservation rule.
//!
//! A write handler is a function of a [`Permit`], and the only way to one is [`Permit::pass`], which
//! `dispatch` calls for every [`WriteTool`]. A permit asked first (unless the call says
//! `confirm: false`, a preview that changes nothing and so asks nobody), holds the write lock until
//! `dispatch` has recorded the write, and is the only thing that makes a [`WritablePath`] or applies
//! a plan. No write tool takes a `dryRun` argument, so there is one kind of permit and a preview is
//! a handler that stops before it applies a plan. `clippy.toml` disallows the vault's own
//! `write_path` and `writable` and the `confined-files` writers everywhere except this file, so a
//! handler that writes around its permit does not pass clippy, and a tool added later cannot skip a
//! check by forgetting it.
//!
//! The lock makes a write tool's read-modify-write one step: two approved calls on one concept run
//! one after the other, so the second reads what the first wrote and neither is lost.

#![allow(
    clippy::disallowed_methods,
    reason = "this file is the one place a write path and a plan are made from the vault"
)]

use std::sync::MutexGuard;

use confined_files::{
    apply_all_or_nothing, AbsorbedFile, AbsorbedPlace, Applied, ApplyOptions, ConfinedPath, PlanEntry, Reservations, SlugError,
    VaultRoot, WritablePath, WriteError, WriteErrorClass,
};

use crate::arguments::Arguments;
use crate::consent;
use crate::dispatch::CallContext;
use crate::error::{ErrorCode, ToolError};
use crate::write_tool::WriteTool;

/// The refusal a write gets in read-only mode, whatever it carries.
pub(crate) fn refuse_in_read_only_mode(
    context: &CallContext<'_>,
    tool_name: &str,
) -> Result<(), ToolError> {
    if context.config().modes.read_only {
        return Err(ToolError::failed(format!(
            "Tool \"{tool_name}\" is unavailable: server is in read-only mode (OATLAS_READ_ONLY). Only read tools are exposed."
        )));
    }
    Ok(())
}

fn open_vault(context: &CallContext<'_>) -> Result<VaultRoot, ToolError> {
    VaultRoot::open(&context.config().vault_root)
        .map_err(|error| ToolError::failed(error.to_string()))
}

/// Proof that a write passed read-only mode and consent for this call, and the right to be the one
/// write in progress.
pub struct Permit<'a> {
    context: &'a CallContext<'a>,
    tool: WriteTool,
    vault: VaultRoot,
    /// What a person said yes to on the card for this call; `None` when none was asked.
    approval: Option<consent::Approval>,
    /// Held until the permit is dropped, which `dispatch` does after the audit lines are written.
    _write_lock: MutexGuard<'a, ()>,
}

impl<'a> Permit<'a> {
    /// Runs the checks. `Err` is the answer of a write that did not happen.
    pub(crate) fn pass(
        context: &'a CallContext<'a>,
        tool: WriteTool,
        arguments: &Arguments,
    ) -> Result<Self, ToolError> {
        refuse_in_read_only_mode(context, tool.name())?;
        let approval = consent::ask_before_writing(context, tool, arguments)?;
        // After the question, which can take minutes: nothing else waits behind a person's answer.
        let write_lock = context.lock_writes();
        Ok(Self {
            context,
            tool,
            vault: open_vault(context)?,
            approval,
            _write_lock: write_lock,
        })
    }

    pub fn tool(&self) -> WriteTool {
        self.tool
    }

    pub fn context(&self) -> &CallContext<'a> {
        self.context
    }

    /// The vault to read from.
    pub fn vault(&self) -> &VaultRoot {
        &self.vault
    }

    /// Whether a person accepted the consent card for this call, which names what it does: a call
    /// that was not asked (consent off, or a preview) has no such yes.
    pub fn consented(&self) -> bool {
        self.approval.is_some()
    }

    /// Refuses a file other than the one the card showed. The card names where the typed path
    /// really led when it was asked; a link retargeted while the person decided leads elsewhere
    /// now, and a yes to the first file is no yes to the second. A call that was not asked has no
    /// card to differ from.
    pub fn ensure_card_named(&self, found: &AbsorbedPlace) -> Result<(), ToolError> {
        let Some(approval) = &self.approval else {
            return Ok(());
        };
        if approval.absorbed_place.as_ref() == Some(found) {
            return Ok(());
        }
        Err(ToolError::new(
            ErrorCode::Conflict,
            "The file this path leads to is not the one the question named, so nothing was \
             rewritten. Run absorb_document again to be asked about the file it leads to now.",
        ))
    }

    /// The file a slug names, as a path this write may change.
    pub fn write_path(&self, slug: &str) -> Result<WritablePath, SlugError> {
        self.vault.write_path(slug)
    }

    /// A file already read from the vault, as a path this write may change.
    pub fn writable(&self, file: &ConfinedPath) -> Result<WritablePath, SlugError> {
        self.vault.writable(file)
    }

    /// The document `absorb_document` rewrites, which lies outside the vault: the opened file has
    /// already refused every name and text a rewrite may not touch.
    pub fn absorbed_source(&self, file: &AbsorbedFile) -> WritablePath {
        file.writable_source()
    }

    /// The copy of that document kept beside it.
    pub fn absorbed_backup(&self, file: &AbsorbedFile) -> WritablePath {
        file.writable_backup()
    }

    /// Applies `plan` all or nothing. `reservations` is the tool's statement of how a file reserved
    /// for a person is read; a plan that would rewrite one is refused.
    pub fn apply(
        &self,
        plan: Vec<PlanEntry>,
        reservations: Reservations<'_>,
    ) -> Result<Applied, ToolError> {
        apply_all_or_nothing(plan, &ApplyOptions::new(reservations)).map_err(failure_answer)
    }
}

impl Permit<'_> {
    /// [`Self::apply`] for a plan that rewrites files the tool did not name (a rename or a merge
    /// reaches every referrer): each entry must carry what it was made from, or the plan is refused.
    pub fn apply_requiring_revisions(
        &self,
        plan: Vec<PlanEntry>,
        reservations: Reservations<'_>,
    ) -> Result<Applied, ToolError> {
        apply_all_or_nothing(plan, &ApplyOptions::new(reservations).requiring_revisions())
            .map_err(failure_answer)
    }
}

/// A failed write as the agent reads it: the public code of its class and the words of the error.
pub fn failure_answer(error: WriteError) -> ToolError {
    let code = match error.class() {
        WriteErrorClass::VaultConflict => ErrorCode::VaultConflict,
        WriteErrorClass::Conflict => ErrorCode::Conflict,
        WriteErrorClass::ToolError => ErrorCode::ToolError,
    };
    let mut message = error.to_string();
    if code == ErrorCode::VaultConflict {
        message.push_str(RECOVERY_AFTER_CONFLICT);
    }
    ToolError::new(code, message)
}

/// Names only a recovery that works: most write tools do not accept `force`, and a delete's `force`
/// means "despite backlinks", not "ignore the file's time".
const RECOVERY_AFTER_CONFLICT: &str =
    " Re-read the doc with get_concepts to get the current expected_mtime, then retry the write.";

#[cfg(test)]
mod tests {
    use std::io;
    use std::path::PathBuf;

    use confined_files::{IoFailure, ReservedForPerson, VaultConflict};

    use super::*;

    #[test]
    fn a_failed_write_answers_with_the_public_code_of_its_class_even_after_a_rollback() {
        let stale = || {
            WriteError::Conflict(VaultConflict {
                slug: "a".to_string(),
                expected_modified: None,
                current_modified: None,
            })
        };
        let taken = || {
            WriteError::Io(IoFailure::new(
                "open",
                PathBuf::from("a.md"),
                io::Error::from(io::ErrorKind::AlreadyExists),
            ))
        };
        let rolled_back = |cause| WriteError::RolledBack {
            cause: Box::new(cause),
        };
        assert_eq!(failure_answer(stale()).code(), ErrorCode::VaultConflict);
        assert_eq!(failure_answer(taken()).code(), ErrorCode::Conflict);
        assert_eq!(
            failure_answer(rolled_back(stale())).code(),
            ErrorCode::VaultConflict
        );
        let reserved = WriteError::Reserved(ReservedForPerson {
            slug: "a".to_string(),
            note: None,
        });
        assert_eq!(failure_answer(reserved).code(), ErrorCode::ToolError);
        assert_eq!(
            failure_answer(WriteError::ChangedOnDisk(vec![PathBuf::from("a.md")])).code(),
            ErrorCode::ToolError
        );
    }
}
