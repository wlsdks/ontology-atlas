//! The one segmentation used both to index a file and to read a query. Index-time and query-time
//! rules that live in two places drift silently, so nothing else in the crate splits text.

/// Bump with any change to the rules below; a different value discards every index.
pub(crate) const SEGMENTATION_VERSION: u32 = 1;

/// Longer runs are encoded data (base64, hashes), not words anyone types.
const MAX_WORD_BYTES: usize = 64;

/// Scripts written without spaces between words, where particles attach to nouns.
fn is_paired_script(c: char) -> bool {
    matches!(c as u32,
        0x1100..=0x11FF | 0x3130..=0x318F | 0xA960..=0xA97F | 0xAC00..=0xD7AF | 0xD7B0..=0xD7FF
        | 0x3040..=0x30FF | 0x31F0..=0x31FF
        | 0x3400..=0x4DBF | 0x4E00..=0x9FFF | 0xF900..=0xFAFF | 0x20000..=0x2FA1F)
}

/// Words of other alphabets stay whole and lowercased; a Hangul, kana or CJK run becomes its
/// overlapping pairs, so a term inside a longer run is found as a phrase of pairs. O(n).
pub(crate) fn for_each_token(text: &str, mut emit: impl FnMut(&str)) {
    let mut word = String::new();
    let mut pair = String::with_capacity(8);
    let (mut previous, mut run_length) = (None::<char>, 0usize);
    let flush_word = |word: &mut String, emit: &mut dyn FnMut(&str)| {
        if !word.is_empty() && word.len() <= MAX_WORD_BYTES {
            emit(word);
        }
        word.clear();
    };
    for c in text.chars() {
        if is_paired_script(c) {
            flush_word(&mut word, &mut emit);
            if let Some(first) = previous {
                pair.clear();
                pair.push(first);
                pair.push(c);
                emit(&pair);
            }
            previous = Some(c);
            run_length += 1;
            continue;
        }
        if let (Some(single), 1) = (previous, run_length) {
            emit(single.encode_utf8(&mut [0; 4]));
        }
        (previous, run_length) = (None, 0);
        if c.is_alphanumeric() {
            word.extend(c.to_lowercase());
        } else {
            flush_word(&mut word, &mut emit);
        }
    }
    if let (Some(single), 1) = (previous, run_length) {
        emit(single.encode_utf8(&mut [0; 4]));
    }
    flush_word(&mut word, &mut emit);
}

pub(crate) fn segment_into(text: &str, out: &mut String) {
    for_each_token(text, |token| {
        if !out.is_empty() {
            out.push(' ');
        }
        out.push_str(token);
    });
}

/// A query is read up to this many bytes and terms; past them it is cut, so one pasted page cannot
/// hold the search for seconds. No one types a sixteen-word search.
pub(crate) const MAX_QUERY_BYTES: usize = 512;
pub(crate) const MAX_QUERY_TERMS: usize = 16;

fn query_head(query: &str) -> &str {
    if query.len() <= MAX_QUERY_BYTES {
        return query;
    }
    let mut end = MAX_QUERY_BYTES;
    while !query.is_char_boundary(end) {
        end -= 1;
    }
    &query[..end]
}

/// Each whitespace-separated term becomes a phrase of its tokens, and every term must match. A
/// lone Hangul, kana or CJK character matches as a prefix, because it is only indexed inside pairs.
pub(crate) fn match_expression(query: &str) -> Option<String> {
    let mut phrases = Vec::new();
    for term in query_head(query).split_whitespace().take(MAX_QUERY_TERMS) {
        let mut tokens = String::new();
        segment_into(term, &mut tokens);
        if tokens.is_empty() {
            continue;
        }
        let mut chars = tokens.chars();
        let lone_paired =
            matches!((chars.next(), chars.next()), (Some(c), None) if is_paired_script(c));
        phrases.push(if lone_paired {
            format!("\"{tokens}\"*")
        } else {
            format!("\"{tokens}\"")
        });
    }
    (!phrases.is_empty()).then(|| phrases.join(" AND "))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tokens(text: &str) -> String {
        let mut out = String::new();
        segment_into(text, &mut out);
        out
    }

    #[test]
    fn words_stay_whole_and_hangul_runs_become_pairs() {
        assert_eq!(tokens("MCP서버를 SQLite 색인"), "mcp 서버 버를 sqlite 색인");
        assert_eq!(
            tokens("지식그래프엔진의"),
            "지식 식그 그래 래프 프엔 엔진 진의"
        );
        assert_eq!(tokens("값, 2층"), "값 2 층");
        assert_eq!(tokens("Café_au-lait"), "café au lait");
        assert_eq!(tokens(&"a".repeat(MAX_WORD_BYTES + 1)), "");
    }

    #[test]
    fn a_query_is_a_conjunction_of_phrases() {
        assert_eq!(
            match_expression("온톨로지 MCP서버").as_deref(),
            Some("\"온톨 톨로 로지\" AND \"mcp 서버\"")
        );
        assert_eq!(match_expression("값").as_deref(), Some("\"값\"*"));
        assert_eq!(match_expression(" \"-- ").as_deref(), None);
    }

    #[test]
    fn a_pasted_page_is_cut_to_the_query_limits() {
        let page = "alpha ".repeat(200_000);
        let started = std::time::Instant::now();
        let expression = match_expression(&page).unwrap();
        assert!(started.elapsed() < std::time::Duration::from_millis(50));
        assert_eq!(expression.matches("AND").count(), MAX_QUERY_TERMS - 1);
        let hangul = "가".repeat(MAX_QUERY_BYTES);
        let cut = match_expression(&hangul).unwrap();
        assert!(
            cut.len() <= MAX_QUERY_BYTES * 3,
            "a long run is cut at a character boundary"
        );
    }

    /// Changing what the rules emit without bumping `SEGMENTATION_VERSION` would leave old indexes
    /// answering with tokens no new query produces.
    #[test]
    fn the_rules_are_pinned_to_their_version() {
        let sample = "Atlas 지도에서 MCP서버 ー カタカナ 漢字 ÉCOLE x1";
        assert_eq!(
            (SEGMENTATION_VERSION, tokens(sample).as_str()),
            (
                1,
                "atlas 지도 도에 에서 mcp 서버 ー カタ タカ カナ 漢字 école x1"
            )
        );
    }
}
