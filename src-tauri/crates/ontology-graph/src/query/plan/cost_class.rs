//! How expensive a call is expected to be, in three words an agent can act on.

use serde::Serialize;

/// Work counted as edges or nodes looked at: a thousand is `high`, a hundred is `medium`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum CostClass {
    Low,
    Medium,
    High,
}

const HIGH_FROM: f64 = 1000.0;
const MEDIUM_FROM: f64 = 100.0;

impl CostClass {
    /// The class of `work` units. A number rather than a count because a bound on paths can
    /// be larger than any count.
    pub fn of(work: f64) -> Self {
        if work >= HIGH_FROM {
            Self::High
        } else if work >= MEDIUM_FROM {
            Self::Medium
        } else {
            Self::Low
        }
    }
}
