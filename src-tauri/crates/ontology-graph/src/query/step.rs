//! One step of a walk: the edge it takes and the node that edge leads to.

use crate::compiled_graph::{EdgeId, NodeId};

#[derive(Debug, Clone, Copy)]
pub struct Step {
    pub next: NodeId,
    pub edge: EdgeId,
}
