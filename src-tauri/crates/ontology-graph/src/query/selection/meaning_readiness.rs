//! The check `health` and `workspace_brief` carry when a project's meaning is not current: whether
//! its competency answers were finalized against the ontology and source as they are. The tool
//! layer judges each project (`ProjectMeaningFacts`); this file words the one check that names the
//! first project that needs review, and the action that asks for it. A vault whose every project is
//! current, or that has none, gets no check.

use super::health::HealthCheck;
use super::outside_checks::AttentionAction;
use super::selection_request::{ProjectMeaningFacts, SourceNow, WitnessesNow};

const AUTHORED_NOT_FINALIZED: &str = "This project's five competency answers are already written, but this vault has no finalize receipt for them. Nothing is broken. Call finalize_project_meaning to record the receipt.";

const BODY_CHANGED: &str = "The project document changed since its competency answers were finalized. Review its `## Competency answers` against the current ontology and source evidence. After any approved changes, validate the vault, compile the ontology, and call finalize_project_meaning again.";

/// What to do about the next action an assessment names. Never says the section is missing: a vault
/// can have it without having finalized it, and `AUTHORED_NOT_FINALIZED` covers that.
fn remedy_of(facts: &ProjectMeaningFacts) -> String {
    if facts.top_gap == "competency_body_changed" {
        return BODY_CHANGED.to_string();
    }
    if facts.next_action == "author_competency_answers" && facts.competency_authored {
        return AUTHORED_NOT_FINALIZED.to_string();
    }
    let text = match facts.next_action.as_str() {
        "author_competency_answers" => {
            "This project's five competency answers have not been finalized yet. Nothing is broken. Fill in the `## Competency answers` section of the project document if it is missing, then call finalize_project_meaning."
        }
        "resolve_competency_question" => {
            "A competency answer is incomplete: it needs concrete witnesses (concepts, relations, or evidence paths) that resolve in this vault. Fill the gap in the project document, then call finalize_project_meaning again."
        }
        "reevaluate_competency" => {
            "The ontology or source evidence changed since the competency answers were finalized. Review the project document's `## Competency answers` against the current ontology and source evidence. After any approved changes, validate the vault, compile the ontology, and call finalize_project_meaning again."
        }
        "repair_assessment_input" => {
            "The assessment input is malformed. Inspect the project document's `## Competency answers` section and the source receipt."
        }
        "repair_source_receipt" => {
            "The source receipt is unusable. Re-bind the project to its code folder with connect_project_source."
        }
        "measure_source" => "Measure the bound source with connect_project_source.",
        "remeasure_source" => {
            "The source changed since it was measured. Re-run connect_project_source."
        }
        "verify_source_currentness" => {
            "The source measurement is stale or unavailable. Re-run connect_project_source before treating this evidence as current."
        }
        "review_source_evidence" => {
            "The source moved in a way the receipt cannot judge. Look at what changed before relying on the evidence."
        }
        other => return format!("Next: {other}."),
    };
    text.to_string()
}

/// What the changed source says about the recorded witnesses, so "source changed" is not the whole
/// story a person gets.
fn source_note(source: &SourceNow) -> String {
    match &source.witnesses {
        WitnessesNow::AllResolve { total } => format!(
            " All {total} recorded witness paths still resolve at {}; the receipt is behind the source, not broken.",
            source.revision
        ),
        WitnessesNow::SomeMissing { missing, total } => format!(
            " {missing} of {total} recorded witness paths no longer resolve at {}.",
            source.revision
        ),
    }
}

pub struct MeaningReadiness {
    pub check: HealthCheck,
    pub action: AttentionAction,
}

impl MeaningReadiness {
    /// The check and action when any project needs review, built from the first of them; `None`
    /// when every project is current or there is none.
    pub fn of(projects: &[ProjectMeaningFacts]) -> Option<Self> {
        let mut unresolved = projects.iter().filter(|facts| !facts.is_current());
        let first = unresolved.next()?;
        let count = 1 + unresolved.count();
        let note = first
            .source_now
            .as_ref()
            .map(source_note)
            .unwrap_or_default();
        let message = format!(
            "{count} project meaning assessment(s) require review; first {}: {} ({}). {}{note}",
            first.project_slug,
            first.status,
            first.top_gap,
            remedy_of(first)
        );
        Some(Self {
            check: HealthCheck::new("meaning_assessment", "warn", count, message.clone()),
            action: AttentionAction::new(
                "meaning_assessment",
                "meaning_assessment",
                "warn",
                count,
                message,
            ),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn facts(slug: &str, status: &str, gap: &str, next: &str) -> ProjectMeaningFacts {
        ProjectMeaningFacts {
            project_slug: slug.to_string(),
            status: status.to_string(),
            top_gap: gap.to_string(),
            next_action: next.to_string(),
            competency_authored: false,
            source_now: None,
        }
    }

    fn current(slug: &str) -> ProjectMeaningFacts {
        facts(slug, "verified_current", "none", "use_current_evidence")
    }

    #[test]
    fn current_projects_and_no_projects_make_no_check() {
        assert!(MeaningReadiness::of(&[]).is_none());
        assert!(MeaningReadiness::of(&[current("a"), current("b")]).is_none());
    }

    #[test]
    fn the_first_project_that_needs_review_is_named_and_all_of_them_are_counted() {
        let projects = [
            current("a"),
            facts(
                "b",
                "invalid",
                "competency_not_authored",
                "author_competency_answers",
            ),
            facts("c", "needs_evidence", "source_unbound", "measure_source"),
        ];
        let found = MeaningReadiness::of(&projects).expect("a check");
        assert_eq!(found.check.count(), 2);
        assert_eq!(found.check.status(), "warn");
        assert!(found.check.message().starts_with(
            "2 project meaning assessment(s) require review; first b: invalid (competency_not_authored). This project's five competency answers have not been finalized yet."
        ));
        assert_eq!(found.action.message(), found.check.message());
    }

    #[test]
    fn written_answers_without_a_receipt_are_told_to_finalize_not_to_write() {
        let mut project = facts(
            "a",
            "invalid",
            "competency_not_authored",
            "author_competency_answers",
        );
        project.competency_authored = true;
        let found = MeaningReadiness::of(&[project]).expect("a check");
        assert!(found.check.message().contains("already written"));
    }

    #[test]
    fn a_changed_source_says_what_became_of_the_recorded_witnesses() {
        let mut project = facts("a", "review_required", "source_changed", "remeasure_source");
        project.source_now = Some(SourceNow {
            revision: "abc123def456".to_string(),
            witnesses: WitnessesNow::SomeMissing {
                missing: 2,
                total: 5,
            },
        });
        let found = MeaningReadiness::of(&[project]).expect("a check");
        assert!(found
            .check
            .message()
            .ends_with(" 2 of 5 recorded witness paths no longer resolve at abc123def456."));
    }
}
