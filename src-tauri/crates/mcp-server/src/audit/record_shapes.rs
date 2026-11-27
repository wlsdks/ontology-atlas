//! The shapes a map analysis line and the heartbeat allow for ids, commits and agent names, so free
//! text from an agent (a path, code, a line break) never becomes a field a reader believes.

use answer_format::whitespace::trim;

const ID_MAX_CHARACTERS: usize = 80;
const AGENT_MAX_CHARACTERS: usize = 100;

fn is_id_character(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-')
}

/// `^[A-Za-z0-9._-]{1,80}$`: an analysis, a session or a press id.
pub fn is_id(text: &str) -> bool {
    (1..=ID_MAX_CHARACTERS).contains(&text.len()) && text.bytes().all(is_id_character)
}

/// `^[0-9a-f]{7,64}$` in either case: a commit's hash, never a branch name.
pub fn is_commit(text: &str) -> bool {
    (7..=64).contains(&text.len()) && text.bytes().all(|byte| byte.is_ascii_hexdigit())
}

/// The agent name for a map analysis line: only a name shaped like a runtime id
/// (`^[a-z0-9][a-z0-9._-]{0,99}$`, either case) after trimming, since free text may hold a path or
/// code. The runtime ids the app's heartbeat writer enforces have this shape.
pub fn runtime_agent(name: &str) -> Option<String> {
    let trimmed = trim(name);
    let mut bytes = trimmed.bytes();
    let first_is_plain = bytes
        .next()
        .is_some_and(|byte| byte.is_ascii_alphanumeric());
    (first_is_plain
        && trimmed.len() <= AGENT_MAX_CHARACTERS
        && trimmed.bytes().all(is_id_character))
    .then(|| trimmed.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_commits_and_agent_names_keep_to_their_shapes() {
        assert!(is_id("a1") && is_id("A.b_c-9") && is_id(&"x".repeat(80)));
        assert!(
            !is_id("") && !is_id(&"x".repeat(81)) && !is_id("../../etc/passwd") && !is_id("a b")
        );
        assert!(
            is_commit("abc1234")
                && is_commit("ABC1234DEF")
                && !is_commit("main")
                && !is_commit("abc123")
        );
        assert_eq!(runtime_agent("  codex-acp  ").as_deref(), Some("codex-acp"));
        for not_a_runtime in [
            "src/billing/keys.ts: function charge(secret)",
            "/Users/someone/clients/acme/plan.md",
            "claude\n{\"v\":1}",
            "-claude",
            "",
        ] {
            assert_eq!(runtime_agent(not_a_runtime), None, "{not_a_runtime:?}");
        }
        assert_eq!(runtime_agent(&"x".repeat(101)), None);
        assert!(runtime_agent(&"x".repeat(100)).is_some());
    }
}
