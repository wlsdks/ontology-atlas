// BYOK connection checks and chat round trips. The key never crosses IPC or argv
// (curl reads URL and headers from stdin, or `ps` would show it), an audit line is
// reserved before every send, and nothing runs without a user click.

pub(crate) mod chat;
pub(crate) mod curl;
mod http_output;
mod local_endpoint;
pub(crate) mod requests;
pub(crate) mod verify;

/// Codes, not sentences, so the screen can branch and translate; matching prose
/// would turn a vault-write failure into "check your network".
const AUDIT_BLOCKED_PREFIX: &str = "audit-blocked:";

/// Derived from the URL so the audit `host` and the screen never drift from the real target.
fn host_of(url: &str) -> &str {
    let without_scheme = url.split_once("://").map_or(url, |(_, rest)| rest);
    without_scheme
        .split(['/', '?', '#'])
        .next()
        .unwrap_or(without_scheme)
}

#[cfg(test)]
mod tests;
