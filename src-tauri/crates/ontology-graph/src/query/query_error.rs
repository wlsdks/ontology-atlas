//! Why a query could not be answered, in the words an agent reads, and what kind of failure it is.

use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum QueryError {
    /// A call that was wrong: an argument missing, out of range or of the wrong shape.
    #[error("{0}")]
    Invalid(String),
    /// A value outside the few an argument allows.
    #[error("{name} must be one of: {}. Received: \"{received}\".", .allowed.join(", "))]
    NotAnAllowedValue {
        name: String,
        received: String,
        allowed: Vec<&'static str>,
    },
    /// A name that is no node of the graph. `field` is the argument it came from and `similar` the
    /// slugs near it.
    #[error("{field} \"{name}\" does not resolve to a compiled ontology node.{}", similar_sentence(.similar))]
    UnknownNode {
        field: &'static str,
        name: String,
        similar: Vec<String>,
    },
    /// An operation no module answers yet.
    #[error("The query_ontology operation \"{0}\" is not answered by this server yet.")]
    NotAnsweredYet(&'static str),
    /// A graph that could not answer, with the reason.
    #[error("{0}")]
    Failed(String),
}

fn similar_sentence(similar: &[String]) -> String {
    if similar.is_empty() {
        String::new()
    } else {
        format!(" Did you mean: {}?", similar.join(", "))
    }
}
