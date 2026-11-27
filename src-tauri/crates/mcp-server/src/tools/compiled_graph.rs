//! The compiled graph a graph tool answers from. Compiling reads every node's frontmatter, so the
//! graph is kept between calls and used again for as long as every document it was compiled from
//! is the very read the document cache still holds: a file that changed, appeared or went away
//! gives the next call a new read, and with it a new compile.

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

/// One graph for the process: a server has one vault.
static KEPT: Mutex<Option<Compiled>> = Mutex::new(None);

/// What a graph tool reads: the documents of this call and the graph compiled from them.
pub struct ReadGraph {
    pub documents: Vec<LoadedDocument>,
    pub graph: Arc<CompiledGraph>,
}

fn is_current(kept: &Compiled, documents: &[LoadedDocument]) -> bool {
    kept.documents.len() == documents.len()
        && kept
            .documents
            .iter()
            .zip(documents)
            .all(|(old, new)| old.is_same_read(new))
}

/// The graph of the vault as it is now.
pub fn read_graph(context: &CallContext<'_>) -> Result<ReadGraph, ToolError> {
    let read = read_vault(context)?;
    let documents = read.vault.documents().to_vec();
    {
        let kept = KEPT.lock().unwrap_or_else(PoisonError::into_inner);
        if let Some(kept) = kept.as_ref().filter(|kept| is_current(kept, &documents)) {
            return Ok(ReadGraph {
                graph: Arc::clone(&kept.graph),
                documents,
            });
        }
    }
    let graph = Arc::new(
        ontology_graph::compile(&documents)
            .map_err(|error| ToolError::failed(error.to_string()))?,
    );
    let mut kept = KEPT.lock().unwrap_or_else(PoisonError::into_inner);
    *kept = Some(Compiled {
        documents: documents.clone(),
        graph: Arc::clone(&graph),
    });
    Ok(ReadGraph { documents, graph })
}
