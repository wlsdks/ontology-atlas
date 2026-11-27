//! Whether a person has reviewed a node, read fresh from the file each time so an approval that no
//! longer matches its node shows. No digest is returned: the reader is an agent, and could forge a
//! stamp.

use serde::Serialize;

use crate::frontmatter::{Frontmatter, Value};
use crate::schema::{
    review_currentness, Currentness, REVIEWED_AT_KEY, REVIEWED_BY_KEY, REVIEW_NOTE_KEY,
    REVIEW_STATE_HUMAN_DECIDES, REVIEW_STATE_KEY,
};

const RESERVED_GUIDANCE: &str =
    "A person reserved this node. Do not write it — report it and let them decide. Atlas write tools refuse it.";
const CHANGED_GUIDANCE: &str = "This node changed after a person confirmed it, so the approval no longer describes what is here. Treat the meaning as unreviewed and say so.";

/// A node's review as an agent reads it.
#[derive(Debug, Serialize)]
pub struct Review<'a> {
    state: Option<&'a Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    note: Option<&'a Value>,
    #[serde(rename = "reviewedBy", skip_serializing_if = "Option::is_none")]
    reviewed_by: Option<&'a Value>,
    #[serde(rename = "reviewedAt", skip_serializing_if = "Option::is_none")]
    reviewed_at: Option<&'a Value>,
    currentness: Currentness,
    #[serde(rename = "agentGuidance", skip_serializing_if = "Option::is_none")]
    agent_guidance: Option<&'static str>,
}

pub fn describe_review<'a>(frontmatter: &'a Frontmatter, body: &str) -> Review<'a> {
    let state = frontmatter.get(REVIEW_STATE_KEY);
    let currentness = review_currentness(frontmatter, body);
    let reserved = state.and_then(Value::as_text) == Some(REVIEW_STATE_HUMAN_DECIDES);
    let agent_guidance = if currentness == Currentness::ChangedSinceReview {
        Some(CHANGED_GUIDANCE)
    } else if reserved {
        Some(RESERVED_GUIDANCE)
    } else {
        None
    };
    Review {
        state,
        note: frontmatter.truthy(REVIEW_NOTE_KEY),
        reviewed_by: frontmatter.truthy(REVIEWED_BY_KEY),
        reviewed_at: frontmatter.truthy(REVIEWED_AT_KEY),
        currentness,
        agent_guidance,
    }
}
