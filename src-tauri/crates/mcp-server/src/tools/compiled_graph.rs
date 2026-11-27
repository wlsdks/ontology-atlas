//! The compiled graph a graph tool answers from. Compiling reads every node's frontmatter, so the
//! graph is kept beside the session's document cache and used again for as long as every document
//! it was compiled from is the very read the cache still holds: a file that changed, appeared or
//! went away gives the next call a new read, and with it a new compile.

use std::sync::{Arc, Mutex, PoisonError};

use ontology_graph::CompiledGraph;
use vault_document::LoadedDocument;

use super::read_vault::read_vault;
use crate::dispatch::CallContext;
use crate::error::ToolError;

struct Compiled {
    /// The reads the graph was compiled from, in the order the vault lists them.
    documents: Vec<LoadedDocument>,
    graph: Arc<CompiledGraph>,
}

/// The graph of one session's vault, compiled once for as long as the vault reads the same.
pub struct KeptGraph {
    kept: Mutex<Option<Compiled>>,
}

fn is_current(kept: &Compiled, documents: &[LoadedDocument]) -> bool {
    kept.documents.len() == documents.len()
        && kept
            .documents
            .iter()
            .zip(documents)
            .all(|(old, new)| old.is_same_read(new))
}

impl KeptGraph {
    pub fn new() -> Self {
        Self {
            kept: Mutex::new(None),
        }
    }

    /// The graph of the vault as it is now.
    pub fn read(&self, context: &CallContext<'_>) -> Result<Arc<CompiledGraph>, ToolError> {
        let read = read_vault(context)?;
        let documents = read.vault.documents().to_vec();
        {
            let kept = self.kept.lock().unwrap_or_else(PoisonError::into_inner);
            if let Some(kept) = kept.as_ref().filter(|kept| is_current(kept, &documents)) {
                return Ok(Arc::clone(&kept.graph));
            }
        }
        let graph = Arc::new(
            ontology_graph::compile(&documents)
                .map_err(|error| ToolError::failed(error.to_string()))?,
        );
        let mut kept = self.kept.lock().unwrap_or_else(PoisonError::into_inner);
        *kept = Some(Compiled {
            documents,
            graph: Arc::clone(&graph),
        });
        Ok(graph)
    }
}

impl Default for KeptGraph {
    fn default() -> Self {
        Self::new()
    }
}
