//! A relation filter as an answer echoes it: the names edges carry, and the names an agent writes.

use serde::Serialize;

use crate::compiled_graph::{Edge, Target};
use crate::query::relation_set::{allowed, public_relation_type, RelationSet};

/// Whether a call's filters let `edge` through: its relation is in the set, and an edge to code
/// or to a missing name is kept only when the call asked for those.
pub fn edge_passes(
    set: Option<&RelationSet>,
    include_external: bool,
    include_unresolved: bool,
    edge: &Edge,
) -> bool {
    allowed(set, edge.via)
        && match edge.target {
            Target::Node(_) => true,
            Target::External => include_external,
            Target::Unresolved => include_unresolved,
        }
}

/// The `types` and `relationTypes` an answer repeats from the call's filter.
#[derive(Serialize)]
pub struct EchoedRelations {
    types: Option<Vec<&'static str>>,
    #[serde(rename = "relationTypes")]
    relation_types: Option<Vec<&'static str>>,
}

impl EchoedRelations {
    pub fn of(set: Option<&RelationSet>) -> Self {
        Self {
            types: set.map(RelationSet::sorted_names),
            relation_types: set.map(|set| {
                let mut names: Vec<&'static str> = set
                    .sorted_names()
                    .into_iter()
                    .map(public_relation_type)
                    .collect();
                names.sort_unstable();
                names
            }),
        }
    }
}
