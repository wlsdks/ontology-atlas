//! The checks `health` and `workspace_brief` carry that no graph can make: whether the vault's files
//! validate, and whether the project meaning assessments are current. The tool layer hands over what
//! those found (`OutsideFacts`); this file turns it into the check, the action that asks for it and
//! the verdict it changes. With nothing handed over there is no check, so an answer never claims a
//! validation that did not run.

use serde::Serialize;
use serde_json::value::RawValue;

use super::health::HealthCheck;
use super::selection_request::OutsideFacts;

#[derive(Serialize)]
pub struct AttentionAction {
    id: &'static str,
    kind: &'static str,
    severity: &'static str,
    count: usize,
    message: String,
}

pub struct OutsideChecks {
    checks: Vec<HealthCheck>,
    validation: Option<Box<RawValue>>,
    validation_action: Option<AttentionAction>,
    meaning_action: Option<AttentionAction>,
    needs_attention: bool,
}

impl OutsideChecks {
    pub fn of(facts: &OutsideFacts) -> Self {
        let mut checks = Vec::new();
        let mut validation = None;
        let mut validation_action = None;
        let mut needs_attention = false;
        if let Some(found) = &facts.validation {
            let warnings = found.warning_files + found.path_drifts;
            let tail = if found.paths_checked {
                format!(
                    " (frontmatter/graph refs {}, source paths {}; repoRoot {})",
                    found.warning_files,
                    found.path_drifts,
                    found.repo_root.as_deref().unwrap_or("unknown")
                )
            } else {
                " (frontmatter/graph refs only \u{2014} source paths were NOT checked; pass repoRoot / OATLAS_REPO_ROOT to include them)".to_string()
            };
            let (status, message) = if found.error_files > 0 {
                (
                    "fail",
                    format!(
                        "{} file(s) have blocking schema/frontmatter errors.{tail}",
                        found.error_files
                    ),
                )
            } else if warnings > 0 {
                (
                    "warn",
                    format!("{warnings} warning(s) require review.{tail}"),
                )
            } else {
                (
                    "pass",
                    format!("Vault schema and graph references validate cleanly.{tail}"),
                )
            };
            let count = found.error_files + warnings;
            if status != "pass" {
                needs_attention = true;
                validation_action = Some(AttentionAction {
                    id: "vault_validation",
                    kind: "validate_vault",
                    severity: if status == "fail" { "fail" } else { "warn" },
                    count,
                    message: message.clone(),
                });
            }
            checks.push(HealthCheck::with_paths_checked(
                "vault_validation",
                status,
                count,
                found.paths_checked,
                message,
            ));
            validation = Some(found.brief.clone());
        }
        let mut meaning_action = None;
        if let Some(review) = &facts.meaning_review {
            needs_attention = true;
            checks.push(HealthCheck::new(
                "meaning_assessment",
                "warn",
                review.count,
                review.message.clone(),
            ));
            meaning_action = Some(AttentionAction {
                id: "meaning_assessment",
                kind: "meaning_assessment",
                severity: "warn",
                count: review.count,
                message: review.message.clone(),
            });
        }
        Self {
            checks,
            validation,
            validation_action,
            meaning_action,
            needs_attention,
        }
    }

    /// The verdict after these checks: a check that needs review makes the vault need attention.
    pub fn status(&self, own: &'static str) -> &'static str {
        if self.needs_attention {
            "needs_attention"
        } else {
            own
        }
    }

    pub fn into_parts(self) -> OutsideParts {
        OutsideParts {
            checks: self.checks,
            validation: self.validation,
            actions: [self.meaning_action, self.validation_action]
                .into_iter()
                .flatten()
                .collect(),
        }
    }
}

/// The checks, the validation object and the actions that come first in a brief's next actions:
/// the meaning review before the validation, as an agent should read them.
pub struct OutsideParts {
    pub checks: Vec<HealthCheck>,
    pub validation: Option<Box<RawValue>>,
    pub actions: Vec<AttentionAction>,
}
