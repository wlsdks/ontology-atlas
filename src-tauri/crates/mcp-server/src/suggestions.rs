//! "Did you mean" suggestions: the nearest allowed value by edit distance over UTF-16 code units,
//! so an agent sees the same hint whichever server answers.

use answer_format::utf16;

/// The allowed value nearest to `input`, when it is near enough to be a typo: within a third of its
/// own length, and always at least two edits. Of equally near values the first listed wins.
pub fn closest_allowed_value<S: AsRef<str>>(input: &str, allowed: &[S]) -> Option<String> {
    if input.is_empty() {
        return None;
    }
    let input_units: Vec<u16> = input.encode_utf16().collect();
    let (nearest, distance) = allowed
        .iter()
        .map(|candidate| {
            let units: Vec<u16> = candidate.as_ref().encode_utf16().collect();
            (
                candidate.as_ref(),
                strsim::generic_levenshtein(&input_units, &units),
            )
        })
        .reduce(|best, next| if next.1 < best.1 { next } else { best })?;
    let threshold = (utf16::len(nearest) / 3).max(2);
    (distance <= threshold).then(|| nearest.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    const TOOLS: [&str; 5] = [
        "list_concepts",
        "get_concepts",
        "find_backlinks",
        "validate_vault",
        "git_status",
    ];

    #[test]
    fn a_typo_finds_its_tool() {
        assert_eq!(
            closest_allowed_value("list_concept", &TOOLS),
            Some("list_concepts".to_string())
        );
        assert_eq!(
            closest_allowed_value("git_statuss", &TOOLS),
            Some("git_status".to_string())
        );
        assert_eq!(
            closest_allowed_value("validate_vaul", &TOOLS),
            Some("validate_vault".to_string())
        );
    }

    #[test]
    fn a_distant_word_finds_nothing() {
        assert_eq!(closest_allowed_value("nope", &TOOLS), None);
        assert_eq!(closest_allowed_value("", &TOOLS), None);
        assert_eq!(closest_allowed_value("x", &[] as &[&str]), None);
    }

    #[test]
    fn an_exact_match_is_found_even_after_a_nearer_one() {
        let allowed = ["limit", "limits", "limit"];
        assert_eq!(
            closest_allowed_value("limit", &allowed),
            Some("limit".to_string())
        );
    }

    #[test]
    fn short_arguments_tolerate_two_edits() {
        let allowed = ["kind", "limit", "offset", "domain"];
        assert_eq!(
            closest_allowed_value("limt", &allowed),
            Some("limit".to_string())
        );
        assert_eq!(
            closest_allowed_value("lmt", &allowed),
            Some("limit".to_string())
        );
        assert_eq!(closest_allowed_value("zzzzz", &allowed), None);
    }

    #[test]
    fn distance_counts_utf16_units_so_an_emoji_is_two_edits() {
        assert_eq!(
            closest_allowed_value("a", &["a😀"]),
            Some("a😀".to_string())
        );
        assert_eq!(closest_allowed_value("a", &["a😀😀"]), None);
    }
}
