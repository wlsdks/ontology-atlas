//! The link targets a body holds, listed once while its text is in hand, so a call that asks who
//! links to a node need not read every body again.
//!
//! A body links to `needle` when it holds `[[needle]]`, `[[needle#`, `[[needle|`, `(needle.md` or
//! `/needle.md`. For a needle that holds none of `]`, `#`, `|`, `(` or a line break, the first of
//! those characters after a `[[` ends the wiki form, so each `[[` fixes its one possible target;
//! and walking back from each `.md`, every `/` and the nearest `(` start one. The targets found
//! that way are exactly the needles the body links to, so asking is a lookup. A needle the list
//! cannot speak for (too long, or holding one of those characters) reads the body instead.

use std::collections::HashSet;

/// The longest target the list holds, in bytes; a longer needle reads the body.
const TARGET_MAX_BYTES: usize = 512;

/// Work, in bytes scanned or copied, a body may cost beyond a floor, per byte of body. Ordinary
/// links cost about three; only text built to make the backward walks overlap (`/a.md` repeated)
/// reaches it, and such a body is left unlisted and read when asked about.
const WORK_PER_BYTE: usize = 8;
const WORK_FLOOR: usize = 4096;

const SEPARATOR: char = '\n';

/// What a body links to, or that the list was not worth making.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BodyLinks {
    /// Every target, each between two line breaks (`\n` + target + `\n` + ...); no links at all is
    /// the empty text.
    Listed(Box<str>),
    /// Too costly to list: every question reads the body.
    Unlisted,
}

/// `]`, `#`, `|` or a line break: what ends a wiki link's target.
fn ends_wiki_target(byte: u8) -> bool {
    matches!(byte, b']' | b'#' | b'|' | b'\n')
}

/// Whether `body` links to `needle` as a wiki link (`[[n]]`, `[[n#`, `[[n|`) or a Markdown link to
/// its file (`(n.md`, `/n.md`): the question [`BodyLinks`] answers without the body.
pub(crate) fn body_links_to(body: &str, needle: &str) -> bool {
    [
        format!("[[{needle}]]"),
        format!("[[{needle}#"),
        format!("[[{needle}|"),
        format!("({needle}.md"),
        format!("/{needle}.md"),
    ]
    .iter()
    .any(|form| body.contains(form.as_str()))
}

/// Whether the list can answer for `needle` exactly.
fn is_listable(needle: &str) -> bool {
    !needle.is_empty()
        && needle.len() <= TARGET_MAX_BYTES
        && !needle
            .bytes()
            .any(|byte| matches!(byte, b']' | b'#' | b'|' | b'(' | b'\n'))
}

impl BodyLinks {
    /// Lists the targets of `body`.
    pub fn of(body: &str) -> Self {
        let bytes = body.as_bytes();
        let mut targets: HashSet<&str> = HashSet::new();
        let mut budget = WORK_FLOOR + WORK_PER_BYTE * bytes.len();
        let mut add = |from: usize, to: usize, budget: &mut usize| {
            *budget = budget.saturating_sub(to - from);
            if let Some(target) = body.get(from..to) {
                targets.insert(target);
            }
        };
        // The first byte at or after the current `[[` that ends a wiki target; `[[` positions only
        // grow, so it only moves forward.
        let mut end = 0;
        let mut search = 0;
        while let Some(found) = body.get(search..).and_then(|rest| rest.find("[[")) {
            let open = search + found;
            search = open + 1;
            let from = open + 2;
            if end < from {
                end = from;
                while end < bytes.len() && !bytes.get(end).copied().is_some_and(ends_wiki_target) {
                    end += 1;
                }
                budget = budget.saturating_sub(end - from);
            }
            if end >= bytes.len() || end - from > TARGET_MAX_BYTES {
                continue;
            }
            match bytes.get(end).copied() {
                // A target never holds the separator, so no target can read as two.
                Some(b'\n') | None => continue,
                Some(b']') if bytes.get(end + 1).copied() != Some(b']') => {}
                Some(_) => add(from, end, &mut budget),
            }
            if budget == 0 {
                return Self::Unlisted;
            }
        }
        let mut search = 0;
        while let Some(found) = body.get(search..).and_then(|rest| rest.find(".md")) {
            let extension = search + found;
            search = extension + 1;
            let floor = extension.saturating_sub(TARGET_MAX_BYTES + 1);
            let mut at = extension;
            while at > floor {
                at -= 1;
                let byte = bytes.get(at).copied().unwrap_or_default();
                if byte == b'/' || byte == b'(' {
                    add(at + 1, extension, &mut budget);
                }
                if byte == b'(' || ends_wiki_target(byte) {
                    break;
                }
            }
            budget = budget.saturating_sub(extension - at);
            if budget == 0 {
                return Self::Unlisted;
            }
        }
        let mut listed = String::new();
        if !targets.is_empty() {
            listed.push(SEPARATOR);
            for target in targets {
                listed.push_str(target);
                listed.push(SEPARATOR);
            }
        }
        Self::Listed(listed.into_boxed_str())
    }

    /// `Some(whether the body links to needle)` when the list can say, `None` when only the body
    /// can.
    pub fn answer(&self, needle: &str) -> Option<bool> {
        match self {
            Self::Listed(listed) if is_listable(needle) => Some(
                listed
                    .match_indices(needle)
                    .any(|(start, _)| is_whole_target(listed, start, needle.len())),
            ),
            _ => None,
        }
    }
}

/// Whether the text at `start` of length `length` sits between two separators.
fn is_whole_target(listed: &str, start: usize, length: usize) -> bool {
    start > 0
        && listed.as_bytes().get(start - 1).copied() == Some(b'\n')
        && listed.as_bytes().get(start + length).copied() == Some(b'\n')
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    #[test]
    fn the_listed_targets_answer_as_the_body_does() {
        let body = "See [[capabilities/cart]] and [[domains/order#top]], [[elements/a|A]], \
                    [cart](../capabilities/cart.md) and (notes.md) but not [[broken]x.";
        let links = BodyLinks::of(body);
        for needle in [
            "capabilities/cart",
            "domains/order",
            "elements/a",
            "cart",
            "../capabilities/cart",
            "capabilities",
            "notes",
            "broken",
            "order",
            "domains",
        ] {
            assert_eq!(
                links.answer(needle),
                Some(body_links_to(body, needle)),
                "{needle}"
            );
        }
    }

    #[test]
    fn a_needle_the_list_cannot_speak_for_reads_the_body() {
        let links = BodyLinks::of("[[a]]");
        assert_eq!(links.answer("a]]"), None);
        assert_eq!(links.answer(""), None);
        assert_eq!(links.answer(&"a".repeat(TARGET_MAX_BYTES + 1)), None);
    }

    #[test]
    fn a_body_built_to_overlap_the_walks_is_left_unlisted() {
        let body = "/a.md".repeat(50_000);
        assert_eq!(BodyLinks::of(&body), BodyLinks::Unlisted);
    }

    proptest! {
        #[test]
        fn a_listable_needle_is_answered_as_the_body_answers(
            body in "[a-d/\\[\\]#|(). \\nm]{0,60}",
            needle in "[a-c/. md]{1,6}",
        ) {
            let links = BodyLinks::of(&body);
            if let Some(answer) = links.answer(&needle) {
                prop_assert_eq!(answer, body_links_to(&body, &needle), "{:?} {:?}", body, needle);
            }
        }
    }
}
