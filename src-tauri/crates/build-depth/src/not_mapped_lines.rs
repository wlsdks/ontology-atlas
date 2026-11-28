//! The `Not mapped yet` lines the project keeps under `## Uncertainty`. The app reads their
//! numbers to show how much of the code is on the map, so their wording is fixed and the first
//! summary line must carry the measured counts.

use std::sync::LazyLock;

use regex::Regex;
use repository_survey::repo_text;

use crate::ability_placement::NOT_MAPPED_LINE;
use crate::area_coverage::{AreaCoverage, NotMappedArea};
use crate::line_cites::pattern;
use crate::node_fields::section_of;

/// How many areas the kept lines name, one bullet each.
const LISTED_AREAS: usize = 12;
const OWN_FILES: &str = " (its own files)";

static SUMMARY_LINE: LazyLock<Regex> = LazyLock::new(|| {
    pattern(r"(?i-u)^\s*(?:[-*+]\s+)?Not mapped yet:\s*[0-9]+\s+of\s+[0-9]+\s+areas?\b")
});
static SUMMARY_COUNTS: LazyLock<Regex> = LazyLock::new(|| {
    pattern(
        r"(?i-u)^\s*(?:[-*+]\s+)?Not mapped yet:\s*([0-9]+)\s+of\s+([0-9]+)\s+areas?,\s*([0-9]+)\s+of\s+([0-9]+)\s+abilities\b",
    )
});

/// The numbers the app reads from a summary line.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Counts {
    remaining: u64,
    total: u64,
    abilities_uncovered: u64,
    abilities_total: u64,
}

/// The area as its `Not mapped yet` bullet writes it.
fn area_label(area: &NotMappedArea<'_>) -> String {
    let place = if area.area.rest {
        format!(
            "{} smaller folders in {}",
            area.area.members.len(),
            repo_text(&area.area.path, 160)
        )
    } else {
        format!(
            "{}{}",
            repo_text(&area.area.path, 160),
            if area.area.own { OWN_FILES } else { "" }
        )
    };
    if area.abilities == 0 {
        return format!("{place} (no abilities found, no node)");
    }
    let noun = if area.abilities == 1 {
        "ability"
    } else {
        "abilities"
    };
    format!(
        "{place} ({} of {} {noun} not on the map)",
        area.uncovered, area.abilities
    )
}

pub(crate) fn summary_line(coverage: &AreaCoverage<'_>) -> String {
    format!(
        "Not mapped yet: {} of {} areas, {} of {} abilities.",
        coverage.not_mapped.len(),
        coverage.counted,
        coverage.uncovered,
        coverage.abilities
    )
}

/// Areas are not mapped yet and hold abilities; without abilities the app shows no step, so no
/// line is asked for.
fn needs_summary_line(coverage: &AreaCoverage<'_>) -> bool {
    !coverage.not_mapped.is_empty() && coverage.abilities > 0
}

/// The lines the project keeps under `## Uncertainty`: the summary, then one bullet per listed
/// area; empty when none is asked for.
pub(crate) fn lines_to_keep(coverage: &AreaCoverage<'_>) -> Vec<String> {
    if !needs_summary_line(coverage) {
        return Vec::new();
    }
    std::iter::once(summary_line(coverage))
        .chain(
            coverage
                .not_mapped
                .iter()
                .take(LISTED_AREAS)
                .map(|area| format!("- Not mapped yet: {}", area_label(area))),
        )
        .collect()
}

/// The first summary line under `## Uncertainty` as written, and the counts the app reads from
/// it: `None` for counts when it is in an earlier form or its counts cannot be true (not whole
/// numbers a double holds exactly, more remaining than there are, or no area or ability).
fn read_summary(body: &str) -> (Option<String>, Option<Counts>) {
    let Some(line) = section_of(body, "Uncertainty")
        .split('\n')
        .find(|line| SUMMARY_LINE.is_match(line))
    else {
        return (None, None);
    };
    let shown = Some(line.trim().to_string());
    let Some(found) = SUMMARY_COUNTS.captures(line) else {
        return (shown, None);
    };
    let number = |at: usize| -> Option<u64> {
        found
            .get(at)?
            .as_str()
            .parse::<u64>()
            .ok()
            .filter(|value| *value < (1 << 53))
    };
    let counts = (|| {
        Some(Counts {
            remaining: number(1)?,
            total: number(2)?,
            abilities_uncovered: number(3)?,
            abilities_total: number(4)?,
        })
    })()
    .filter(|counts| {
        counts.total > 0
            && counts.remaining <= counts.total
            && counts.abilities_total > 0
            && counts.abilities_uncovered <= counts.abilities_total
    });
    (shown, counts)
}

/// Whether the body still keeps a `Not mapped yet` line under its Uncertainty.
fn keeps_lines(body: &str) -> bool {
    section_of(body, "Uncertainty")
        .split('\n')
        .any(|line| NOT_MAPPED_LINE.is_match(line))
}

/// What the project's summary line says against the measure, or `None` when it matches or no line
/// is needed: the first summary line carries the measured counts, and once every area is mapped
/// no `Not mapped yet` line stays.
pub(crate) fn line_gap(body: &str, coverage: &AreaCoverage<'_>) -> Option<String> {
    if coverage.not_mapped.is_empty() {
        return keeps_lines(body).then(|| {
            "keeps Not mapped yet lines under ## Uncertainty although every area is mapped"
                .to_string()
        });
    }
    if !needs_summary_line(coverage) {
        return None;
    }
    let expected = summary_line(coverage);
    let (line, counts) = read_summary(body);
    let measured = Counts {
        remaining: coverage.not_mapped.len() as u64,
        total: coverage.counted as u64,
        abilities_uncovered: coverage.uncovered as u64,
        abilities_total: coverage.abilities as u64,
    };
    if counts == Some(measured) {
        return None;
    }
    Some(match line {
        None => format!("keeps no Not mapped yet summary line under ## Uncertainty, where the measure gives \"{expected}\""),
        Some(line) => format!("keeps \"{}\" as its first summary line under ## Uncertainty, where the measure gives \"{expected}\"", repo_text(&line, 160)),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_app_reads_a_summary_line_only_when_its_counts_can_be_true() {
        let body = "## Uncertainty\n\n- Not mapped yet: 3 of 10 areas, 5 of 20 abilities.\n";
        let (line, counts) = read_summary(body);
        assert_eq!(line.as_deref(), Some("- Not mapped yet: 3 of 10 areas, 5 of 20 abilities."));
        assert_eq!(
            counts,
            Some(Counts {
                remaining: 3,
                total: 10,
                abilities_uncovered: 5,
                abilities_total: 20
            })
        );
        let more_than_exist = "## Uncertainty\nNot mapped yet: 11 of 10 areas, 5 of 20 abilities.\n";
        assert_eq!(read_summary(more_than_exist).1, None);
        let earlier_form = "## Uncertainty\nNot mapped yet: 3 of 10 areas.\n";
        let (line, counts) = read_summary(earlier_form);
        assert!(line.is_some() && counts.is_none());
        assert!(keeps_lines("## Uncertainty\n* Not mapped yet: src (1 of 2 abilities not on the map)\n"));
        assert!(!keeps_lines("## Uncertainty\nNothing mapped yet.\n"));
    }
}
