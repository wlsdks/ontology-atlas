//! The vault a read tool answers from, read afresh for the call: nothing is kept from an earlier
//! one, so a file changed behind the server is seen by the next call.

use confined_files::VaultRoot;
use vault_document::LoadedVault;

use crate::dispatch::CallContext;
use crate::error::ToolError;

pub struct ReadVault {
    pub root: VaultRoot,
    pub vault: LoadedVault,
}

pub fn read_vault(context: &CallContext<'_>) -> Result<ReadVault, ToolError> {
    let root = open_root(context)?;
    let vault = LoadedVault::load(&root);
    Ok(ReadVault { root, vault })
}

/// The vault folder alone, for a call that reads only the files it names.
pub fn open_root(context: &CallContext<'_>) -> Result<VaultRoot, ToolError> {
    VaultRoot::open(&context.config().vault_root)
        .map_err(|error| ToolError::failed(error.to_string()))
}
