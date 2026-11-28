//! A window of source text measured in UTF-16 units, as the script server measured it with
//! `slice(offset, offset + 64)`, but answered as byte offsets. The masked text of
//! [`crate::jvm_masking`] has one space per byte, so a Korean comment would fill a window of
//! characters three times faster there than in the original: the original is what is counted.

/// The byte offset `units` UTF-16 units after `from` in `text`, or the end of `text`. A character
/// that would cross the limit is left out.
pub fn window_end(text: &str, from: usize, units: usize) -> usize {
    let mut used = 0;
    for (offset, character) in text.get(from..).unwrap_or_default().char_indices() {
        used += character.len_utf16();
        if used > units {
            return from + offset;
        }
    }
    text.len().max(from)
}

/// The byte offset `units` UTF-16 units before `to` in `text`, or 0.
pub fn window_start(text: &str, to: usize, units: usize) -> usize {
    let mut used = 0;
    let mut start = to.min(text.len());
    for (offset, character) in text.get(..start).unwrap_or_default().char_indices().rev() {
        used += character.len_utf16();
        if used > units {
            return start;
        }
        start = offset;
    }
    start
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_window_counts_the_original_in_utf16_units_and_never_cuts_a_character() {
        let text = "ab주문\u{1F600}cd";
        assert_eq!(window_end(text, 0, 4), "ab주문".len());
        assert_eq!(
            window_end(text, 0, 5),
            "ab주문".len(),
            "an emoji is two units"
        );
        assert_eq!(window_end(text, 0, 6), "ab주문\u{1F600}".len());
        assert_eq!(window_end(text, 2, 100), text.len());
        assert_eq!(window_start(text, text.len(), 2), text.len() - 2);
        assert_eq!(window_start(text, text.len(), 3), text.len() - 2);
        assert_eq!(window_start(text, "ab주문".len(), 3), "a".len());
        assert_eq!(window_start(text, 2, 100), 0);
    }
}
