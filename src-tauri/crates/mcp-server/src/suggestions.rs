//! "Did you mean" suggestions: the nearest allowed value by edit distance over UTF-16 code units,
//! as `mcp/src/suggestions.mjs` finds it.

/// The allowed value nearest to `input`, when it is near enough to be a typo.
pub fn closest_allowed_value<S: AsRef<str>>(input: &str, allowed: &[S]) -> Option<String> {
    if input.is_empty() || allowed.is_empty() {
        return None;
    }
    let input_units: Vec<u16> = input.encode_utf16().collect();
    let threshold_limit = allowed
        .iter()
        .map(|value| utf16_len(value.as_ref()) / 3)
        .fold(2, usize::max);
    let limit = i64::try_from(threshold_limit).unwrap_or(i64::MAX);
    let mut best: Option<(&str, i64)> = None;
    for candidate in allowed {
        let candidate = candidate.as_ref();
        let cutoff = best.map_or(limit, |(_, distance)| limit.min(distance - 1));
        let distance = distance_within(
            &input_units,
            &candidate.encode_utf16().collect::<Vec<u16>>(),
            cutoff,
        );
        if best.is_none_or(|(_, held)| distance < held) {
            best = Some((candidate, distance));
        }
    }
    let (candidate, distance) = best?;
    let threshold = i64::try_from((utf16_len(candidate) / 3).max(2)).unwrap_or(i64::MAX);
    (distance <= threshold).then(|| candidate.to_string())
}

fn utf16_len(text: &str) -> usize {
    text.encode_utf16().count()
}

/// The edit distance when it is within `cutoff`; any value above `cutoff` otherwise. A distance
/// beyond the cutoff cannot change which candidate is chosen.
#[allow(
    clippy::indexing_slicing,
    reason = "every index is bounded by the lengths of `left` and `right` in the loops below"
)]
fn distance_within(left: &[u16], right: &[u16], cutoff: i64) -> i64 {
    let over = cutoff + 1;
    let length_gap = i64::try_from(left.len().abs_diff(right.len())).unwrap_or(i64::MAX);
    if length_gap > cutoff {
        return over;
    }
    let cut = usize::try_from(cutoff).unwrap_or(0);
    let mut previous: Vec<i64> = (0..=right.len())
        .map(|column| {
            if column <= cut {
                i64::try_from(column).unwrap_or(over)
            } else {
                over
            }
        })
        .collect();
    let mut current: Vec<i64> = vec![over; right.len() + 1];
    for row in 1..=left.len() {
        current[0] = if row <= cut {
            i64::try_from(row).unwrap_or(over)
        } else {
            over
        };
        let first = row.saturating_sub(cut).max(1);
        let last = right.len().min(row + cut);
        if first > 1 {
            current[first - 1] = over;
        }
        let mut minimum = current[0];
        for column in first..=last {
            let substitution = i64::from(left[row - 1] != right[column - 1]);
            current[column] = (previous[column] + 1)
                .min(current[column - 1] + 1)
                .min(previous[column - 1] + substitution);
            minimum = minimum.min(current[column]);
        }
        if last < right.len() {
            current[last + 1] = over;
        }
        if minimum > cutoff {
            return over;
        }
        std::mem::swap(&mut previous, &mut current);
    }
    previous[right.len()]
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
}
