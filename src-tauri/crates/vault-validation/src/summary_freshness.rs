//! A domain or project body summarises what it contains, and no other check asks whether that
//! summary is still true. This one flags a summary node whose containment list changed after its
//! description was last written: the body (the judgement) and the containment lists (the
//! membership) are two clocks in one file. It reports and stops: the body is a person's accepted
//! judgement, so nothing is rewritten and no model is asked.
//!
//! Falsifier: if the flagged parents still describe their membership correctly, the containment
//! list is the wrong proxy and the check should be withdrawn.

use std::cmp::Ordering;
use std::collections::HashMap;

use answer_format::collation::compare_text;
use answer_format::iso_time::{parse_iso, to_iso_string};
use hardened_git::{RepoPath, Repository};
use serde::Serialize;
use vault_document::LoadedDocument;

use crate::kept_history::KeptHistory;
use crate::node_revisions::{contained_slugs, Revision};

/// The kinds whose body summarises their membership; an element's prose describes one role.
const SUMMARY_KINDS: [&str; 2] = ["project", "domain"];
const DAY_MS: f64 = 86_400_000.0;

/// What a summary node's history says went out of step.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(untagged)]
pub enum StaleSummary {
    /// The history is too short to tell which clock moved last.
    ShortHistory {
        slug: String,
        kind: String,
        #[serde(rename = "childCount")]
        child_count: usize,
        #[serde(rename = "reasonCode")]
        reason_code: &'static str,
        score: f64,
        hint: String,
    },
    Behind {
        slug: String,
        kind: String,
        #[serde(rename = "childCount")]
        child_count: usize,
        #[serde(rename = "bodyChangedAt")]
        body_changed_at: String,
        #[serde(rename = "membershipChangedAt")]
        membership_changed_at: String,
        #[serde(rename = "behindByMs")]
        behind_by_ms: i64,
        score: f64,
        hint: String,
    },
}

impl StaleSummary {
    pub fn slug(&self) -> &str {
        match self {
            Self::ShortHistory { slug, .. } | Self::Behind { slug, .. } => slug,
        }
    }

    pub fn score(&self) -> f64 {
        match self {
            Self::ShortHistory { score, .. } | Self::Behind { score, .. } => *score,
        }
    }

    pub fn hint(&self) -> &str {
        match self {
            Self::ShortHistory { hint, .. } | Self::Behind { hint, .. } => hint,
        }
    }

    fn lag(&self) -> i64 {
        match self {
            Self::ShortHistory { .. } => -1,
            Self::Behind { behind_by_ms, .. } => *behind_by_ms,
        }
    }
}

/// The answer's `summaryFreshness`: whether the check ran, how many summaries it looked at, the
/// stale ones, and a sentence that says which.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SummaryFreshness {
    pub checked: bool,
    #[serde(rename = "summaryNodes")]
    pub summary_nodes: usize,
    pub stale: Vec<StaleSummary>,
    pub hint: String,
}

struct Movement {
    body_changed_at: String,
    membership_changed_at: String,
    truncated: bool,
}

/// When each clock last moved over `revisions` (newest first). A value unchanged back to the oldest
/// revision is the oldest revision's time and `truncated`: unknown, not "never".
fn last_movement(revisions: &[Revision]) -> Option<Movement> {
    let oldest = revisions.last()?.changed_at.clone();
    let mut body = None;
    let mut membership = None;
    for pair in revisions.windows(2) {
        let [newer, older] = pair else {
            continue;
        };
        if body.is_none() && newer.body != older.body {
            body = Some(newer.changed_at.clone());
        }
        if membership.is_none() && newer.membership != older.membership {
            membership = Some(newer.changed_at.clone());
        }
        if body.is_some() && membership.is_some() {
            break;
        }
    }
    let truncated = body.is_none() || membership.is_none();
    Some(Movement {
        body_changed_at: body.unwrap_or_else(|| oldest.clone()),
        membership_changed_at: membership.unwrap_or(oldest),
        truncated,
    })
}

fn score_of(behind_ms: i64) -> f64 {
    if behind_ms <= 0 {
        return 0.0;
    }
    #[allow(
        clippy::cast_precision_loss,
        reason = "a lag in milliseconds is far below 2^53"
    )]
    let lag = behind_ms as f64;
    (lag / (30.0 * DAY_MS)).min(1.0)
}

fn description_of(slug: &str, child_count: usize, behind_ms: Option<i64>) -> String {
    match behind_ms {
        None => format!("\"{slug}\" summarises {child_count} node(s), but its history does not go back far enough to tell whether its description or its membership moved last. Read it against its children by hand."),
        Some(behind) => {
            #[allow(clippy::cast_precision_loss, reason = "a lag in milliseconds is far below 2^53")]
            let days = ((behind as f64) / DAY_MS).round().max(1.0);
            format!("\"{slug}\" declares {child_count} node(s) it contains, and that list changed {days} day(s) after its description was last written. The description may no longer cover what the domain now holds. Read it against its members and re-judge it; nothing is blocked and no rewrite is proposed.")
        }
    }
}

fn find_stale(
    documents: &[LoadedDocument],
    revisions: &HashMap<String, Vec<Revision>>,
) -> Vec<StaleSummary> {
    let mut rows = Vec::new();
    for document in documents {
        let Some(kind) = document
            .frontmatter()
            .text("kind")
            .filter(|kind| SUMMARY_KINDS.contains(kind))
        else {
            continue;
        };
        let children = contained_slugs(document.frontmatter());
        if children.is_empty() {
            continue;
        }
        let Some(history) = revisions.get(document.slug()) else {
            continue;
        };
        let Some(movement) = last_movement(history) else {
            continue;
        };
        let body_time = parse_iso(&movement.body_changed_at);
        let membership_time = parse_iso(&movement.membership_changed_at);
        let slug = document.slug().to_string();
        let (Some(body_time), Some(membership_time)) = (body_time, membership_time) else {
            if movement.truncated {
                rows.push(StaleSummary::ShortHistory {
                    hint: description_of(&slug, children.len(), None),
                    slug,
                    kind: kind.to_string(),
                    child_count: children.len(),
                    reason_code: "insufficient-history",
                    score: 0.0,
                });
            }
            continue;
        };
        if membership_time <= body_time {
            continue;
        }
        let behind = membership_time - body_time;
        rows.push(StaleSummary::Behind {
            hint: description_of(&slug, children.len(), Some(behind)),
            slug,
            kind: kind.to_string(),
            child_count: children.len(),
            body_changed_at: to_iso_string(body_time),
            membership_changed_at: to_iso_string(membership_time),
            behind_by_ms: behind,
            score: score_of(behind),
        });
    }
    rows.sort_by(|left, right| match right.lag().cmp(&left.lag()) {
        Ordering::Equal => compare_text(left.slug(), right.slug()),
        other => other,
    });
    rows
}

/// The reason as this hint has always named it: a machine without the `git` program reads as a
/// folder without a repository, as the script server's hint did; `evidenceDrift` names the
/// missing program.
fn reason_in_hint(reason: &str) -> &str {
    if reason == "git-not-available" {
        "not-a-git-repository"
    } else {
        reason
    }
}

/// Why the check was not made, or the check itself, for the summary nodes of `documents`. `place`
/// is where the vault's history is read from, or the reason there is none.
pub fn summary_freshness(
    documents: &[LoadedDocument],
    place: Result<(&Repository, &RepoPath), &str>,
    kept: &KeptHistory,
) -> SummaryFreshness {
    let summaries: Vec<&str> = documents
        .iter()
        .filter(|document| {
            document
                .frontmatter()
                .text("kind")
                .is_some_and(|kind| SUMMARY_KINDS.contains(&kind))
        })
        .map(LoadedDocument::slug)
        .collect();
    if summaries.is_empty() {
        return SummaryFreshness {
            checked: true,
            summary_nodes: 0,
            stale: Vec::new(),
            hint: "no domain or project nodes to check.".to_string(),
        };
    }
    let (repository, scope) = match place {
        Ok(found) => found,
        Err(reason) => {
            return SummaryFreshness {
                checked: false,
                summary_nodes: summaries.len(),
                stale: Vec::new(),
                hint: format!("Summary freshness was NOT checked ({}). This comparison reads Git history, so a vault outside a repository cannot be judged \u{2014} read each domain against the nodes it contains by hand.", reason_in_hint(reason)),
            }
        }
    };
    let revisions = kept.node_revisions(repository, scope, &summaries);
    let stale = find_stale(documents, &revisions.by_slug);
    let unread = if revisions.is_complete() {
        String::new()
    } else {
        format!(
            " Git could not be asked about the history of {} summary node(s), so those were not judged.",
            revisions.unread
        )
    };
    let hint = if stale.is_empty() && revisions.is_complete() {
        format!(
            "all {} summary node(s) were described after their membership last changed.",
            summaries.len()
        )
    } else if stale.is_empty() {
        format!(
            "{} of {} summary node(s) were described after their membership last changed.{unread}",
            summaries.len() - revisions.unread,
            summaries.len()
        )
    } else {
        format!("{} summary node(s) declare a membership that changed after their description was last written. Nothing is blocked; read each against the nodes it contains and re-judge the body.{unread}", stale.len())
    };
    SummaryFreshness {
        checked: true,
        summary_nodes: summaries.len(),
        stale,
        hint,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn revision(at: &str, body: u8, members: &[&str]) -> Revision {
        Revision {
            changed_at: at.to_string(),
            body: [body; 32],
            membership: members.iter().map(ToString::to_string).collect(),
        }
    }

    #[test]
    fn a_description_older_than_its_membership_is_behind_by_the_gap_and_one_older_than_nothing_is_short(
    ) {
        let history = [
            revision("2026-02-10T00:00:00+00:00", 1, &["a", "b"]),
            revision("2026-02-01T00:00:00+00:00", 1, &["a"]),
            revision("2026-01-01T00:00:00+00:00", 0, &["a"]),
        ];
        let movement = last_movement(&history).expect("history");
        assert_eq!(movement.body_changed_at, "2026-02-01T00:00:00+00:00");
        assert_eq!(movement.membership_changed_at, "2026-02-10T00:00:00+00:00");
        assert!(!movement.truncated);
        let single = last_movement(&history[..1]).expect("history");
        assert!(single.truncated);
        assert_eq!(single.body_changed_at, single.membership_changed_at);
    }

    #[test]
    fn the_score_saturates_after_thirty_days() {
        assert!((score_of(15 * 86_400_000) - 0.5).abs() < f64::EPSILON);
        assert!((score_of(90 * 86_400_000) - 1.0).abs() < f64::EPSILON);
        assert!(score_of(-5).abs() < f64::EPSILON);
    }
}
