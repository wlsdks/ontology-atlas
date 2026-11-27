//! What a `query_ontology` call asks, as the tool layer has already checked it: numbers are whole
//! and in range, text is not blank. What only an operation can judge (a relation name, a node that
//! does not exist) is judged by the operation.

use serde::Serialize;

use crate::query::operation::Operation;
use crate::query::query_error::QueryError;

/// The way an operation may follow an edge. `Both` and `Undirected` both follow an edge either way;
/// `neighbors` reads an absent direction as `Both` and a path search reads it as `Undirected`.
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

/// The most expanded states one search may be given to spend.
pub const SEARCH_BUDGET_MAX: usize = 50_000;

/// The arguments of one `query_ontology` call that the operations read, each read once by the
/// tool layer. The operation asks for the argument its own way: `search_budget` is judged only by
/// the two operations that spend one, after they have resolved their nodes.
#[derive(Debug, Clone)]
pub struct QueryRequest {
    pub operation: Operation,
    pub slug: Option<String>,
    pub from: Option<String>,
    pub to: Option<String>,
    pub limit: Option<usize>,
    pub node_limit: Option<usize>,
    pub iterations: Option<usize>,
    pub max_hops: Option<usize>,
    pub depth: Option<usize>,
    /// `searchBudget` as sent, a number or NaN for anything that is not one.
    pub search_budget: Option<f64>,
    pub direction: Option<Direction>,
    pub types: Option<Vec<String>>,
    pub include_isolated: Option<bool>,
    pub include_external: Option<bool>,
    pub include_unresolved: Option<bool>,
}

impl QueryRequest {
    /// A call that names `operation` and no argument.
    pub fn new(operation: Operation) -> Self {
        Self {
            operation,
            slug: None,
            from: None,
            to: None,
            limit: None,
            node_limit: None,
            iterations: None,
            max_hops: None,
            depth: None,
            search_budget: None,
            direction: None,
            types: None,
            include_isolated: None,
            include_external: None,
            include_unresolved: None,
        }
    }

    /// The states a search may expand: `default` when none was asked for.
    pub fn search_budget(&self, default: usize) -> Result<usize, QueryError> {
        let Some(sent) = self.search_budget else {
            return Ok(default);
        };
        if sent.fract() != 0.0 || !sent.is_finite() || sent < 1.0 {
            return Err(QueryError::Invalid(
                "searchBudget must be a positive integer.".to_string(),
            ));
        }
        #[allow(
            clippy::cast_possible_truncation,
            clippy::cast_sign_loss,
            reason = "the number is a whole number of at least one"
        )]
        let budget = if sent > SEARCH_BUDGET_MAX as f64 {
            usize::MAX
        } else {
            sent as usize
        };
        if budget > SEARCH_BUDGET_MAX {
            return Err(QueryError::Invalid(format!(
                "searchBudget must be <= {SEARCH_BUDGET_MAX}."
            )));
        }
        Ok(budget)
    }
}
