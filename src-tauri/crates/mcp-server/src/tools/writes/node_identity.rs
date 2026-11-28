//! Whose a new node is and what names it: the agent in `created_by`, the UID a session mints, and
//! the refusal a clash of identity answers with.

use vault_edit::{IdentityRefusal, NodeUids};

use crate::dispatch::CallContext;
use crate::error::ToolError;

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
