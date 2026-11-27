//! The sentences a validator says about what a node's body leaves out. Advisory: a body that lacks
//! a definition, a boundary or a stated uncertainty still saves; the words tell the writer what is
//! missing and the one call that adds it.

/// Heading names that carry each side of a boundary; the negative side is tested first because
/// "out of scope" contains "scope".
pub(crate) const INCLUDES_HEADINGS: [&str; 6] = [
    "includes",
    "inclusions",
    "in scope",
    "scope",
    "boundary",
    "constraints",
];
pub(crate) const EXCLUDES_HEADINGS: [&str; 4] =
    ["excludes", "exclusions", "out of scope", "not this"];
pub(crate) const DEFINITION_HEADINGS: [&str; 5] = [
    "definition",
    "summary",
    "what it is",
    "what this is",
    "overview",
];
pub(crate) const UNCERTAINTY_HEADINGS: [&str; 5] = [
    "uncertainty",
    "open questions",
    "unknowns",
    "not checked",
    "confidence",
];

/// Which side of a boundary a finding is about.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BoundarySide {
    Includes,
    Excludes,
}

impl BoundarySide {
    pub fn key(self) -> &'static str {
        match self {
            Self::Includes => "includes",
            Self::Excludes => "excludes",
        }
    }
}

pub(crate) fn definition_missing(slug: &str, kind: &str) -> String {
    format!(
        "\"{slug}\" is a {kind} whose body carries no definition — it is still the starter scaffold, it opens straight into headings, or it only restates the title. The write succeeded and nothing here blocks it; what is missing is the one sentence that makes this a concept instead of a label. Write what this {kind} is and what it is not, in prose before the first `##` or under `## Definition`: patch_concept({{slug:\"{slug}\", body:\"# <title>\\n\\n<one non-circular sentence: what it is, and what it is not>\\n\\n…\"}}). An agent handed only this vault can read the title and learn nothing it did not already know from the title."
    )
}

pub(crate) fn boundary_missing(slug: &str, kind: &str, side: BoundarySide) -> String {
    let (heading, other) = match side {
        BoundarySide::Excludes => ("Excludes", "what this is often confused with and is not"),
        BoundarySide::Includes => ("Includes", "what this covers"),
    };
    format!(
        "\"{slug}\" ({kind}) has no `## {heading}` section with anything in it, so the body never states {other}. The write succeeded; this is the half of the boundary the next reader cannot reconstruct from code, because there is no code for a thing deliberately left out. Add it with patch_concept({{slug:\"{slug}\", body:\"…\\n\\n## {heading}\\n\\n- <one concrete item>\\n\"}}) — one real bullet is worth more than the placeholder, and a placeholder bullet still counts as empty here."
    )
}

pub(crate) fn epistemic_exclusion(slug: &str, refs: &[String], sample_limit: usize) -> String {
    let count = refs.len();
    format!(
        "{count} exclusion bullet(s) on \"{slug}\" state an evidence limit rather than a product boundary: {}. \"Not mentioned in this scan\" says what the writer did not see; an `Excludes` bullet says what the product deliberately does not do. A reader handed the vault without the source cannot tell those apart, and repeats the first as the second — measured in the 2026-08-28 field trial. The write succeeded; move each one to an `## Uncertainty` (or `## Open questions`) section with patch_concept({{slug:\"{slug}\", body:\"…\"}}), and leave in `Excludes` only what a source actually supports.",
        sample_refs(refs, sample_limit)
    )
}

pub(crate) fn uncertainty_missing(slug: &str, kind: &str) -> String {
    format!(
        "\"{slug}\" ({kind}) records no uncertainty, so the body reads as complete — and nothing in a vault is. The write succeeded and nothing here blocks it; what is missing is the fact a later reader most needs and can least recover: which files you did not open, which claim you inferred rather than read, what you could not check. Without it an agent handed only this vault treats every silence as a settled negative. Say it plainly: patch_concept({{slug:\"{slug}\", body:\"…\\n\\n## Uncertainty\\n\\n- <what you did not read or could not check>\\n\"}}). `## Open questions`, `## Unknowns`, `## Not checked` and `## Confidence` are read as the same section, and this is also where an `Excludes` bullet belongs once you notice it was an evidence limit rather than a product boundary."
    )
}

pub(crate) fn slug_outside_kind_folder(slug: &str, kind: &str, canonical_slug: &str) -> String {
    format!(
        "\"{slug}\" is a {kind} written at the vault root instead of inside its kind folder, so it reads as \"{slug}\" where every other {kind} reads as \"{canonical_slug}\". The write succeeded and nothing here blocks it — a flat slug is valid, it just groups with nothing. The map, the README generator, and every other reader that shows a vault by kind group on that folder, so a root-level {kind} sits beside the project node rather than with its own kind. Move it when you are ready: rename_concept({{oldSlug:\"{slug}\", newSlug:\"{canonical_slug}\"}}) without `confirm` returns a dry-run listing every backlink that would be rewritten; repeat the same call with `confirm: true` to move the file and rewrite them in one pass. The UID does not change, so nothing loses its identity."
    )
}

/// The count plus a few examples: pasting every reference is unread by a person and costs an agent
/// context.
fn sample_refs(refs: &[String], limit: usize) -> String {
    let shown = refs
        .iter()
        .take(limit)
        .map(|reference| format!("\"{reference}\""))
        .collect::<Vec<_>>()
        .join(", ");
    let rest = refs.len() - refs.len().min(limit);
    if rest > 0 {
        format!("{shown} and {rest} more")
    } else {
        shown
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_long_list_of_references_is_a_few_and_a_count() {
        let refs: Vec<String> = (1..=7).map(|number| format!("r{number}")).collect();
        assert_eq!(
            sample_refs(&refs, 5),
            "\"r1\", \"r2\", \"r3\", \"r4\", \"r5\" and 2 more"
        );
        assert_eq!(sample_refs(&refs[..2], 5), "\"r1\", \"r2\"");
    }
}
