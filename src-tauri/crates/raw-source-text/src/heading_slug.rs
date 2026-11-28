//! A heading's title as a citation anchor names it.

use icu_normalizer::DecomposingNormalizerBorrowed;

/// The anchor grammar allows `[a-z0-9-]` only, so accented letters lose their marks and a heading
/// with no Latin letters at all (a Korean one, say) gets no slug here; the caller numbers it.
pub(crate) fn heading_slug(title: &str) -> String {
    let decomposed = DecomposingNormalizerBorrowed::new_nfkd().normalize(title);
    let lowered: String = decomposed
        .chars()
        .filter(|character| !('\u{300}'..='\u{36f}').contains(character))
        .collect::<String>()
        .to_lowercase();
    let mut slug = String::new();
    let mut pending_dash = false;
    for character in lowered.chars() {
        if character.is_ascii_lowercase() || character.is_ascii_digit() {
            if pending_dash && !slug.is_empty() {
                slug.push('-');
            }
            pending_dash = false;
            slug.push(character);
        } else {
            pending_dash = true;
        }
    }
    slug.chars().take(64).collect()
}

#[cfg(test)]
mod tests {
    use super::heading_slug;

    #[test]
    fn marks_fall_away_and_a_heading_without_latin_letters_has_no_slug() {
        assert_eq!(heading_slug("Scope & Goals (v2)"), "scope-goals-v2");
        assert_eq!(heading_slug("Éclair  crème"), "eclair-creme");
        assert_eq!(heading_slug("\u{c8fc}\u{bb38} \u{cde8}\u{c18c}"), "");
        // The cut falls after the trim, so an anchor already written keeps its spelling.
        assert!(heading_slug(&format!("{} b", "a".repeat(63))).ends_with('-'));
    }
}
