//! The one gate every write tool passes, in the order the checks must run: read-only mode, then the
//! person's consent, then the session's write lock, then the write itself with its reservation rule.
//!
//! A write handler is a function of a [`Permit`], and the only way to one is [`Permit::pass`], which
//! `dispatch` calls for every [`WriteTool`]. Dry run is decided there, once, from the call's
//! arguments: a dry run gets a [`PreviewPermit`], which can look at the vault and cannot write, and
//! asks nobody; every other call gets a [`WritePermit`], which asked first, holds the write lock
//! until `dispatch` has recorded the write, and is the only thing that makes a [`WritablePath`] or
//! applies a plan. `clippy.toml` disallows the vault's own `write_path` and `writable` and the
//! `confined-files` writers everywhere except this file, so a handler that writes around its permit
//! does not pass clippy, and a tool added later cannot skip a check by forgetting it.
//!
//! The lock makes a write tool's read-modify-write one step: two approved calls on one concept run
//! one after the other, so the second reads what the first wrote and neither is lost.

#![allow(
    clippy::disallowed_methods,
    reason = "this file is the one place a write path and a plan are made from the vault"
)]

use std::sync::MutexGuard;

use confined_files::{
    apply_all_or_nothing, Applied, ApplyOptions, ConfinedPath, PlanEntry, Reservations, SlugError,
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

/// What a write tool's handler is given: the right to write, or only to look.
pub enum Permit<'a> {
    Apply(WritePermit<'a>),
    /// A dry run: the same tool, the same arguments, no write.
    Preview(PreviewPermit<'a>),
}

impl<'a> Permit<'a> {
    /// Runs the checks. `Err` is the answer of a write that did not happen.
    pub(crate) fn pass(
        context: &'a CallContext<'a>,
        tool: WriteTool,
        arguments: &Arguments,
    ) -> Result<Self, ToolError> {
        if arguments.is_dry_run() {
            PreviewPermit::pass(context, tool).map(Self::Preview)
        } else {
            WritePermit::pass(context, tool, arguments).map(Self::Apply)
        }
    }

    pub fn tool(&self) -> WriteTool {
        match self {
            Self::Apply(permit) => permit.tool,
            Self::Preview(permit) => permit.tool,
        }
    }

    pub fn context(&self) -> &CallContext<'a> {
        match self {
            Self::Apply(permit) => permit.context,
            Self::Preview(permit) => permit.context,
        }
    }

    /// The vault to read from. Writing into it goes through [`WritePermit`] alone.
    pub fn vault(&self) -> &VaultRoot {
        match self {
            Self::Apply(permit) => &permit.vault,
            Self::Preview(permit) => &permit.vault,
        }
    }
}

/// Proof that a call is a dry run and passed read-only mode.
pub struct PreviewPermit<'a> {
    context: &'a CallContext<'a>,
    tool: WriteTool,
    vault: VaultRoot,
}

impl<'a> PreviewPermit<'a> {
    fn pass(context: &'a CallContext<'a>, tool: WriteTool) -> Result<Self, ToolError> {
        refuse_in_read_only_mode(context, tool.name())?;
        Ok(Self {
            context,
            tool,
            vault: open_vault(context)?,
        })
    }
}

/// Proof that a write passed read-only mode and consent for this call, and the right to be the one
/// write in progress.
pub struct WritePermit<'a> {
    context: &'a CallContext<'a>,
    tool: WriteTool,
    vault: VaultRoot,
    /// Held until the permit is dropped, which `dispatch` does after the audit lines are written.
    _write_lock: MutexGuard<'a, ()>,
}

impl<'a> WritePermit<'a> {
    fn pass(
        context: &'a CallContext<'a>,
        tool: WriteTool,
        arguments: &Arguments,
    ) -> Result<Self, ToolError> {
        refuse_in_read_only_mode(context, tool.name())?;
        consent::ask_before_writing(context, tool, arguments)?;
        // After the question, which can take minutes: nothing else waits behind a person's answer.
        let write_lock = context.lock_writes();
        Ok(Self {
            context,
            tool,
            vault: open_vault(context)?,
            _write_lock: write_lock,
        })
    }

    /// The file a slug names, as a path this write may change.
    pub fn write_path(&self, slug: &str) -> Result<WritablePath, SlugError> {
        self.vault.write_path(slug)
    }

    /// A file already read from the vault, as a path this write may change.
    pub fn writable(&self, file: &ConfinedPath) -> Result<WritablePath, SlugError> {
        self.vault.writable(file)
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

/// A failed write as the agent reads it: the public code of its class and the words of the error.
pub fn failure_answer(error: WriteError) -> ToolError {
    let code = match error.class() {
        WriteErrorClass::VaultConflict => ErrorCode::VaultConflict,
        WriteErrorClass::Conflict => ErrorCode::Conflict,
        WriteErrorClass::ToolError => ErrorCode::ToolError,
    };
    ToolError::new(code, error.to_string())
}

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
