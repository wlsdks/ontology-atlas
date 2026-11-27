//! What a `query_ontology` call asks, as the tool layer has already checked it: numbers are whole
//! and in range, text is not blank. What only an operation can judge (a relation name, a node that
//! does not exist) is judged by the operation.

use serde::Serialize;

/// The way an operation may follow an edge. `Both` and `Undirected` are the one thing under two
/// names; an answer repeats the name the call used.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Direction {
    Incoming,
    Outgoing,
    Both,
    Undirected,
}

impl Direction {
    pub const ALLOWED: [&'static str; 4] = ["incoming", "outgoing", "both", "undirected"];

    pub fn parse(text: &str) -> Option<Self> {
        match text {
            "incoming" => Some(Self::Incoming),
            "outgoing" => Some(Self::Outgoing),
            "both" => Some(Self::Both),
            "undirected" => Some(Self::Undirected),
            _ => None,
        }
    }

    pub fn follows_outgoing(self) -> bool {
        !matches!(self, Self::Incoming)
    }

    pub fn follows_incoming(self) -> bool {
        !matches!(self, Self::Outgoing)
    }

    /// The direction a path search takes: both ways unless one is named.
    pub fn for_paths(direction: Option<Self>) -> Self {
        match direction {
            Some(Self::Incoming) => Self::Incoming,
            Some(Self::Outgoing) => Self::Outgoing,
            Some(Self::Both | Self::Undirected) | None => Self::Undirected,
        }
    }
}

/// The arguments of a `query_ontology` call that the operations read.
#[derive(Debug, Clone, Default)]
pub struct QueryRequest {
    pub slug: Option<String>,
    pub seed: Option<String>,
    pub from: Option<String>,
    pub to: Option<String>,
    pub limit: Option<usize>,
    pub node_limit: Option<usize>,
    pub iterations: Option<usize>,
    pub max_hops: Option<usize>,
    pub depth: Option<usize>,
    pub search_budget: Option<usize>,
    pub direction: Option<Direction>,
    pub types: Option<Vec<String>>,
    pub include_isolated: Option<bool>,
    pub include_external: Option<bool>,
    pub include_unresolved: Option<bool>,
}
