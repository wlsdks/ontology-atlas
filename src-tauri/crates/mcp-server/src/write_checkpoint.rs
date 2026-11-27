//! The one gate every write tool passes, in the order the checks must run: read-only mode, then the
//! person's consent, then the write itself with its reservation rule.
//!
//! A write handler is a function of a [`WritePermit`], and the only way to a permit is
//! [`WritePermit::pass`], which `dispatch` calls for every [`WriteTool`]. A handler cannot get a
//! vault to write into except from its permit ([`WritePermit::vault`]) and cannot apply a plan
//! except through [`WritePermit::apply`], whose [`Reservations`] argument has no default. So a tool
//! added later cannot skip a check by forgetting it: it does not compile.

use confined_files::{
    apply_all_or_nothing, Applied, ApplyOptions, PlanEntry, Reservations, VaultRoot, WriteError,
    WriteErrorClass,
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

/// Proof that a write passed read-only mode and consent for this call.
pub struct WritePermit<'a> {
    context: &'a CallContext<'a>,
    tool: WriteTool,
    vault: VaultRoot,
}

impl<'a> WritePermit<'a> {
    /// Runs the checks. `Err` is the answer of a write that did not happen.
    pub(crate) fn pass(
        context: &'a CallContext<'a>,
        tool: WriteTool,
        arguments: &Arguments,
    ) -> Result<Self, ToolError> {
        refuse_in_read_only_mode(context, tool.name())?;
        consent::ask_before_writing(context, tool, arguments)?;
        let vault = VaultRoot::open(&context.config().vault_root)
            .map_err(|error| ToolError::failed(error.to_string()))?;
        Ok(Self {
            context,
            tool,
            vault,
        })
    }

    pub fn tool(&self) -> WriteTool {
        self.tool
    }

    pub fn context(&self) -> &CallContext<'a> {
        self.context
    }

    /// The vault, the only source of a path a plan may write.
    pub fn vault(&self) -> &VaultRoot {
        &self.vault
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
