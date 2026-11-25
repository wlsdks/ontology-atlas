//! A session's name as Claude Code prints it, reduced to one short line of plain text. The name
//! can be a title written from the person's own conversation, so it lives only in memory and goes
//! only to the page: its `Debug` form says how long it is and never what it says, so no log line,
//! error or panic message built from a value that holds it can carry the text.

use serde::Serialize;
use unicode_segmentation::UnicodeSegmentation;

/// The most characters a name keeps, counted as a person sees them (grapheme clusters), as the
/// page counts them; the page draws one line.
pub(crate) const NAME_MAX_CHARS: usize = 60;

#[derive(Clone, PartialEq, Eq, Serialize)]
#[serde(transparent)]
pub(crate) struct SessionName(String);

impl std::fmt::Debug for SessionName {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "SessionName({} characters)",
            self.0.graphemes(true).count()
        )
    }
}

impl SessionName {
    /// The first line of `raw`, without control or direction-override characters, trimmed and cut
    /// after `NAME_MAX_CHARS` grapheme clusters, so never inside a character, an emoji sequence or
    /// a Hangul syllable written as separate letters. `None` when nothing is left. O(`raw`).
    pub(crate) fn from_raw(raw: &str) -> Option<Self> {
        let first_line = raw.split(is_line_break).next().unwrap_or_default();
        let kept: String = first_line.chars().filter(|c| !is_removed(*c)).collect();
        let cut: String = kept.trim().graphemes(true).take(NAME_MAX_CHARS).collect();
        let name = cut.trim_end();
        (!name.is_empty()).then(|| Self(name.to_string()))
    }

    #[cfg(test)]
    pub(crate) fn text(&self) -> &str {
        &self.0
    }
}

fn is_line_break(c: char) -> bool {
    matches!(
        c,
        '\n' | '\r' | '\u{0B}' | '\u{0C}' | '\u{85}' | '\u{2028}' | '\u{2029}'
    )
}

/// Control characters, and the marks that reorder or embed right-to-left text, which could make a
/// name look like other words on the screen.
fn is_removed(c: char) -> bool {
    c.is_control()
        || matches!(
            c,
            '\u{061C}' | '\u{200E}' | '\u{200F}' | '\u{202A}'..='\u{202E}' | '\u{2066}'..='\u{2069}'
        )
}
