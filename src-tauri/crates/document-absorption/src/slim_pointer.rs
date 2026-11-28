//! The text that replaces the source once its rules are nodes. It destroys nothing: every section
//! not absorbed is repeated verbatim below the notice, and the original is kept in a backup.

use answer_format::whitespace::trim;

use crate::absorption_plan::{AbsorptionPlan, Action};

pub fn slim_pointer(plan: &AbsorptionPlan) -> String {
    let absorbed: Vec<_> = plan.sections.iter().filter(|s| s.action == Action::Absorb).collect();
    let suggested: Vec<_> = plan.sections.iter().filter(|s| s.action == Action::Suggest).collect();
    let suspects: Vec<_> = plan.sections.iter().filter(|s| s.injection.suspect()).collect();
    let kept: Vec<_> = plan.sections.iter().filter(|s| s.action != Action::Absorb).collect();

    let mut lines: Vec<String> = Vec::new();
    let title = plan.title.as_deref().filter(|title| !title.is_empty());
    lines.push(format!("# {}", title.unwrap_or(&plan.source_label)));
    lines.push(String::new());
    for notice in [
        "> **Absorbed into the ontology-atlas vault.** The sections below were",
        "> converted into typed vault nodes. Edit the vault, not this file, for",
        "> the sections that moved: this file is now a slim pointer.",
    ] {
        lines.push(notice.to_string());
    }
    lines.push(String::new());
    if !plan.intro.is_empty() {
        lines.push(plan.intro.clone());
        lines.push(String::new());
    }
    if !absorbed.is_empty() {
        lines.push("## Absorbed into the vault".to_string());
        lines.push(String::new());
        for section in &absorbed {
            lines.push(format!(
                "- **{}** \u{2192} `{}` (document \u{b7} role: policy)",
                section.heading,
                section.target_slug.as_deref().unwrap_or_default()
            ));
        }
        lines.push(String::new());
    }
    if !suggested.is_empty() {
        lines.push("## Suggested (not written: review before adding)".to_string());
        lines.push(String::new());
        for section in &suggested {
            lines.push(format!(
                "- **{}** \u{2192} candidate `{}` `{}`",
                section.heading,
                section.target_kind.unwrap_or_default(),
                section.target_slug.as_deref().unwrap_or_default()
            ));
        }
        lines.push(String::new());
    }
    if !suspects.is_empty() {
        lines.push(
            "## \u{26a0} Injection-suspect sections (excluded, kept below for human review)"
                .to_string(),
        );
        lines.push(String::new());
        for section in &suspects {
            lines.push(format!(
                "- **{}**: matched: {}",
                section.heading,
                section.injection.matches.join(", ")
            ));
        }
        lines.push(String::new());
    }
    if !kept.is_empty() {
        lines.push("---".to_string());
        lines.push(String::new());
        for section in &kept {
            lines.push(format!("## {}", section.heading));
            lines.push(String::new());
            lines.push(section.body.clone());
            lines.push(String::new());
        }
    }
    format!("{}\n", trim(&collapse_blank_runs(&lines.join("\n"))))
}

/// Three or more line breaks in a row become two.
fn collapse_blank_runs(text: &str) -> String {
    let mut collapsed = String::with_capacity(text.len());
    let mut run = 0usize;
    for character in text.chars() {
        if character == '\n' {
            run += 1;
            if run > 2 {
                continue;
            }
        } else {
            run = 0;
        }
        collapsed.push(character);
    }
    collapsed
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::plan_absorption;

    #[test]
    fn the_pointer_lists_what_moved_and_repeats_what_stayed() {
        let plan = plan_absorption("# T\n## Git rules\nBe kind.\n## Notes\nplain\n\n\n\nmore", "t", &|_| false);
        let pointer = slim_pointer(&plan);
        assert!(pointer.starts_with("# T\n\n> **Absorbed into the ontology-atlas vault.**"));
        assert!(pointer.contains("- **Git rules** \u{2192} `t-git-rules` (document \u{b7} role: policy)"));
        assert!(pointer.contains("---\n\n## Notes\n\nplain\n\nmore\n"));
        assert!(!pointer.contains("Be kind."), "an absorbed body lives in its node now");
    }
}
