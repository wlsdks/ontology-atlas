//! "Did you mean" suggestions: the nearest allowed value by edit distance over UTF-16 code units,
//! so an agent sees the same hint whichever server answers.

use answer_format::utf16;

/// The most edits a typo of an allowed value of this length may hold: a third of the length, and
/// always at least two.
fn edits_allowed(length: usize) -> usize {
    (length / 3).max(2)
}

/// The allowed value nearest to `input`, when it is near enough to be a typo: within a third of its
/// own length, and always at least two edits. Of equally near values the first listed wins.
///
/// An edit distance is never below the difference in length, so a value whose length differs from
/// the input's by more than any allowed value tolerates is not measured, and an input that long is
/// refused before it is read: a name of millions of characters costs a length count, not a table.
pub fn closest_allowed_value<S: AsRef<str>>(input: &str, allowed: &[S]) -> Option<String> {
    if input.is_empty() {
        return None;
    }
    let lengths: Vec<usize> = allowed
        .iter()
        .map(|candidate| utf16::len(candidate.as_ref()))
        .collect();
    let most_edits = lengths.iter().map(|&length| edits_allowed(length)).max()?;
    let longest_reach = lengths
        .iter()
        .map(|&length| length + edits_allowed(length))
        .max()?;
    // A UTF-16 unit takes at most three bytes of UTF-8, so the byte count bounds the unit count
    // from below without reading the input.
    if input.len() / 3 > longest_reach {
        return None;
    }
    let input_units: Vec<u16> = input.encode_utf16().collect();
    if input_units.len() > longest_reach {
        return None;
    }
    let mut nearest: Option<(&str, usize)> = None;
    for (candidate, &length) in allowed.iter().zip(&lengths) {
        let gap = input_units.len().abs_diff(length);
        let best = nearest.map_or(usize::MAX, |(_, distance)| distance);
        if gap > most_edits || gap >= best {
            continue;
        }
        let units: Vec<u16> = candidate.as_ref().encode_utf16().collect();
        let distance = strsim::generic_levenshtein(&input_units, &units);
        if distance < best {
            nearest = Some((candidate.as_ref(), distance));
        }
    }
    let (value, distance) = nearest?;
    (distance <= edits_allowed(utf16::len(value))).then(|| value.to_string())
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

    #[test]
    fn a_name_of_millions_of_characters_is_refused_without_being_measured() {
        let name = "x".repeat(9_000_000);
        let wide = "😀".repeat(2_000_000);
        let started = std::time::Instant::now();
        assert_eq!(closest_allowed_value(&name, &TOOLS), None);
        assert_eq!(closest_allowed_value(&wide, &TOOLS), None);
        assert!(
            started.elapsed() < std::time::Duration::from_millis(100),
            "took {:?}",
            started.elapsed()
        );
    }

    #[test]
    fn a_value_far_in_length_is_skipped_and_a_near_one_still_wins() {
        let allowed = ["abcdefghijklmnopqrstuvwxyz", "ab"];
        assert_eq!(
            closest_allowed_value("abc", &allowed),
            Some("ab".to_string())
        );
        assert_eq!(
            closest_allowed_value("abcdefghijklmnopqrstuvwxy", &allowed),
            Some(allowed[0].to_string())
        );
    }
}
