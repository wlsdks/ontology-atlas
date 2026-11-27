//! A list an answer cuts at `limit`: how many there were, whether some are missing, and the rows
//! kept.

use serde::Serialize;

#[derive(Serialize)]
pub struct RowPage<T> {
    total: usize,
    limited: bool,
    rows: Vec<T>,
}

impl<T> RowPage<T> {
    /// `rows` are the first `limit` of `total`.
    pub fn new(total: usize, limit: usize, rows: Vec<T>) -> Self {
        Self {
            total,
            limited: total > limit,
            rows,
        }
    }

    /// `rows` are the part of `total` that was written, however it was chosen: some are missing
    /// when there are fewer rows than `total`.
    pub fn partial(total: usize, rows: Vec<T>) -> Self {
        Self {
            total,
            limited: rows.len() < total,
            rows,
        }
    }

    /// `rows` are what was kept of `total` found, and `cut` says the search itself stopped early,
    /// so more may exist than `total` counts.
    pub fn counted(total: usize, limit: usize, cut: bool, rows: Vec<T>) -> Self {
        Self {
            total,
            limited: cut || total > limit,
            rows,
        }
    }
}

/// A list of nodes written under `nodes`, with how many there were and whether some are missing:
/// the form a project map gives each of its lists of nodes.
#[derive(Serialize)]
pub struct NodePage<T> {
    total: usize,
    limited: bool,
    nodes: Vec<T>,
}

impl<T> NodePage<T> {
    pub fn new(total: usize, limit: usize, nodes: Vec<T>) -> Self {
        Self {
            total,
            limited: total > limit,
            nodes,
        }
    }
}
