//! A heading's title as a citation anchor names it.

use icu_normalizer::DecomposingNormalizerBorrowed;

/// The most characters an anchor's slug holds.
const SLUG_MAX_CHARS: usize = 64;

/// The anchor grammar allows `[a-z0-9-]` only, so accented letters lose their marks and a heading
/// with no Latin letters at all (a Korean one, say) gets no slug here; the caller numbers it.
pub(crate) fn heading_slug(title: &str) -> String {
    let mut slug = String::new();
    let mut pending_dash = false;
    // The title is decomposed one character at a time and the walk stops at the slug's last
    // character, so a heading of many megabytes costs the first 64 characters of it.
    let decomposed = DecomposingNormalizerBorrowed::new_nfkd().normalize_iter(title.chars());
    for character in decomposed.filter(|character| !('\u{300}'..='\u{36f}').contains(character)) {
        for lowered in character.to_lowercase() {
            if lowered.is_ascii_lowercase() || lowered.is_ascii_digit() {
                if pending_dash && !slug.is_empty() {
                    slug.push('-');
                }
                pending_dash = false;
                slug.push(lowered);
            } else {
                pending_dash = true;
            }
        }
        if slug.len() >= SLUG_MAX_CHARS {
            break;
        }
    }
    slug.truncate(SLUG_MAX_CHARS);
    slug
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

    /// The slug as it was written before the walk stopped early: the whole title decomposed, then cut.
    fn whole_title_slug(title: &str) -> String {
        use icu_normalizer::DecomposingNormalizerBorrowed;
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

    #[test]
    fn stopping_at_sixty_four_characters_changes_no_slug() {
        let long_ascii = "Word ".repeat(40);
        let long_accented = "\u{c9}clair \u{fb01}ne ".repeat(30);
        let kelvin_and_dotted = "\u{212a}elvin \u{130}stanbul \u{3a3}\u{3a3} ".repeat(20);
        for title in [
            "",
            "-",
            "a",
            long_ascii.as_str(),
            long_accented.as_str(),
            kelvin_and_dotted.as_str(),
            "\u{c8fc}\u{bb38} plan 1 \u{2014} 2",
        ] {
            assert_eq!(heading_slug(title), whole_title_slug(title), "{title:?}");
        }
    }

    #[test]
    fn a_heading_of_many_megabytes_is_cut_without_decomposing_the_rest() {
        let heading = "a".repeat(8 * 1024 * 1024);
        assert_eq!(heading_slug(&heading), "a".repeat(64));
    }
}
