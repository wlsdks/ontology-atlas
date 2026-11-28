//! What to do about a code, stated once per code in the answer's `summary.byCode` instead of in
//! the sentence of every finding that carries it.

/// The repair for `code`, or `None` for a code whose message carries its own.
pub(crate) fn code_remedy(code: &str) -> Option<&'static str> {
    build_depth::remedy(code).or_else(|| meaning_findings::remedy(code))
}
