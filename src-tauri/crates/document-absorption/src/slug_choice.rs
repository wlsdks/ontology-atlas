//! The slug an absorbed section gets: the source's name and the heading, joined by hyphens, and the
//! next free one when a node already holds it.

use answer_format::whitespace::{is_whitespace, trim};

/// Lower case letters, digits and Hangul syllables of `text` with each run of white space as one
/// hyphen; every other character is dropped.
pub fn slugify(text: &str) -> String {
    let kept: String = text
        .to_lowercase()
        .chars()
        .filter(|character| {
            character.is_ascii_lowercase()
                || character.is_ascii_digit()
                || ('\u{AC00}'..='\u{D7A3}').contains(character)
                || is_whitespace(*character)
                || *character == '-'
        })
        .collect();
    let mut slug = String::new();
    let mut in_space = false;
    for character in trim(&kept).chars() {
        if is_whitespace(character) {
            in_space = true;
            continue;
        }
        if in_space {
            slug.push('-');
            in_space = false;
        }
        slug.push(character);
    }
    slug
}

/// `candidate` when free, else `candidate-2` to `candidate-999`; when all are taken, `candidate`.
pub(crate) fn next_free_slug(
    candidate: &str,
    used_in_plan: &[String],
    is_slug_taken: &dyn Fn(&str) -> bool,
) -> String {
    let taken = |slug: &str| used_in_plan.iter().any(|used| used == slug) || is_slug_taken(slug);
    if !taken(candidate) {
        return candidate.to_string();
    }
    (2..1000)
        .map(|number| format!("{candidate}-{number}"))
        .find(|next| !taken(next))
        .unwrap_or_else(|| candidate.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_slug_keeps_letters_digits_hangul_and_hyphens_and_joins_words_with_one_hyphen() {
        assert_eq!(slugify("Git Rules (v2)!"), "git-rules-v2");
        assert_eq!(slugify("  커밋   규칙 "), "커밋-규칙");
        assert_eq!(slugify("!!!"), "");
    }

    #[test]
    fn a_taken_slug_gets_the_next_number() {
        let taken = |slug: &str| slug == "a" || slug == "a-2";
        assert_eq!(next_free_slug("a", &[], &taken), "a-3");
        assert_eq!(next_free_slug("b", &["b".to_string()], &taken), "b-2");
    }
}
