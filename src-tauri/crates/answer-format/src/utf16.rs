//! Strings measured and ordered in UTF-16 code units, as JavaScript does: `string.length`, the
//! default `Array.prototype.sort`, and `slice`.

use std::cmp::Ordering;

/// `string.length`.
pub fn len(text: &str) -> usize {
    text.chars().map(char::len_utf16).sum()
}

/// The default order of `Array.prototype.sort()`: by UTF-16 code unit, which is not code point
/// order for characters beyond the Basic Multilingual Plane.
pub fn compare(left: &str, right: &str) -> Ordering {
    left.encode_utf16().cmp(right.encode_utf16())
}

/// Sorts as `Array.prototype.sort()` does.
pub fn sort<S: AsRef<str>>(items: &mut [S]) {
    items.sort_by(|left, right| compare(left.as_ref(), right.as_ref()));
}

/// What JavaScript's `text.slice(start, end)` keeps, in UTF-16 units, except that a character cut
/// in half at either end is left out: half of an emoji is not text.
pub fn slice(text: &str, start: usize, end: usize) -> &str {
    let mut from = None;
    let mut to = 0;
    let mut position = 0;
    for (offset, character) in text.char_indices() {
        let next = position + character.len_utf16();
        if position >= start && next <= end {
            from.get_or_insert(offset);
            to = offset + character.len_utf8();
        }
        position = next;
        if position >= end {
            break;
        }
    }
    from.and_then(|from| text.get(from..to)).unwrap_or_default()
}

/// The longest start of `text` that is at most `units` UTF-16 units long and ends between two
/// characters.
pub fn prefix(text: &str, units: usize) -> &str {
    slice(text, 0, units)
}

/// The longest end of `text` that is at most `units` UTF-16 units long and starts between two
/// characters.
pub fn suffix(text: &str, units: usize) -> &str {
    let total = len(text);
    slice(text, total.saturating_sub(units), total)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn length_counts_utf16_units() {
        assert_eq!(len("a😀한"), 4);
        assert_eq!(len(""), 0);
    }

    #[test]
    fn utf16_order_puts_an_astral_character_before_a_late_bmp_one() {
        // U+10000 is the surrogate pair D800 DC00; U+FF5E is a single unit above it.
        assert_eq!(compare("\u{10000}", "\u{ff5e}"), Ordering::Less);
        assert!("\u{10000}" > "\u{ff5e}");
        let mut items = vec!["b", "\u{ff5e}", "\u{10000}", "a"];
        sort(&mut items);
        assert_eq!(items, ["a", "b", "\u{10000}", "\u{ff5e}"]);
    }

    #[test]
    fn a_prefix_cut_through_an_emoji_falls_before_it() {
        assert_eq!(prefix("ab😀cd", 2), "ab");
        assert_eq!(prefix("ab😀cd", 3), "ab");
        assert_eq!(prefix("ab😀cd", 4), "ab😀");
        assert_eq!(prefix("ab😀cd", 99), "ab😀cd");
        assert_eq!(prefix("😀", 1), "");
        assert_eq!(prefix("한글", 1), "한");
        assert_eq!(prefix("abc", 0), "");
    }

    #[test]
    fn a_suffix_cut_through_an_emoji_starts_after_it() {
        assert_eq!(suffix("ab😀cd", 2), "cd");
        assert_eq!(suffix("ab😀cd", 3), "cd");
        assert_eq!(suffix("ab😀cd", 4), "😀cd");
        assert_eq!(suffix("abc", 99), "abc");
    }

    #[test]
    fn a_slice_keeps_every_whole_character_inside_its_units() {
        assert_eq!(slice("ab😀cd", 1, 4), "b😀");
        assert_eq!(slice("ab😀cd", 3, 5), "c");
        assert_eq!(slice("ab😀cd", 5, 2), "");
        assert_eq!(slice("", 0, 3), "");
    }
}
