//! What every write tool does the same way: take the permit that may write, say a stale file is
//! stale, name the agent in `created_by`, and read the time a file now has.

use confined_files::{ConfinedPath, ModifiedTime, VaultConflict, WriteError};
use vault_edit::{IdentityRefusal, NodeUids};

use crate::audit::ConceptEffect;
use crate::dispatch::CallContext;
use crate::error::ToolError;
use crate::write_checkpoint::{failure_answer, Permit, WritePermit};

/// The permit that may write. None of the tools here has a dry-run argument, so a preview permit
/// is a call this server never advertised.
pub fn write_permit<'a, 'p>(permit: &'a Permit<'p>) -> Result<&'a WritePermit<'p>, ToolError> {
    match permit {
        Permit::Apply(write) => Ok(write),
        Permit::Preview(_) => Err(ToolError::invalid(format!(
            "{} has no dryRun argument; pass confirm: false to preview.",
            permit.tool().name()
        ))),
    }
}

/// `expected` is the time the caller last saw; the file now has `current`.
pub fn require_current(
    slug: &str,
    expected: Option<f64>,
    current: Option<ModifiedTime>,
) -> Result<(), ToolError> {
    let Some(expected) = expected else {
        return Ok(());
    };
    let expected_time = ModifiedTime::from_milliseconds(expected);
    let differs = current.is_none_or(|current| expected_time.differs_from(current));
    if !differs {
        return Ok(());
    }
    Err(failure_answer(WriteError::Conflict(VaultConflict {
        slug: slug.to_string(),
        expected_modified: Some(expected_time),
        current_modified: current,
    })))
}

pub fn modified_ms(file: &ConfinedPath) -> Option<f64> {
    file.modified_time().map(ModifiedTime::milliseconds)
}

/// `agent:<name>`, or `agent:unknown` when the call path proves an agent wrote it and not which.
pub fn created_by(context: &CallContext<'_>) -> String {
    let name = context.audit().agent_name(&context.client_name());
    match name.as_deref().map(str::trim).filter(|name| !name.is_empty()) {
        Some(name) => format!("agent:{name}"),
        None => "agent:unknown".to_string(),
    }
}

/// Where a node's first identity comes from.
pub struct SessionUids;

impl NodeUids for SessionUids {
    fn mint(&self) -> String {
        #[cfg(feature = "differential-inputs")]
        if let Some(pinned) = crate::pinned_inputs::next_id("schema") {
            return pinned;
        }
        uuid::Uuid::new_v4().to_string()
    }
}

pub fn identity_refusal(refusal: &IdentityRefusal) -> ToolError {
    if refusal.is_invalid_argument() {
        ToolError::invalid(refusal.to_string())
    } else {
        ToolError::failed(refusal.to_string())
    }
}

pub fn effect(added: &[&str], changed: &[&str], removed: &[&str]) -> ConceptEffect {
    let owned = |slugs: &[&str]| slugs.iter().map(|slug| (*slug).to_string()).collect();
    ConceptEffect::new(owned(added), owned(changed), owned(removed))
}
