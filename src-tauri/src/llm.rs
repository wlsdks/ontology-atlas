// BYOK connection checks and chat round trips. The key never crosses IPC or argv
// (curl reads URL and headers from stdin, or `ps` would show it), an audit line is
// reserved before every send, and nothing runs without a user click.

pub(crate) mod chat;
pub(crate) mod curl;
mod http_output;
mod local_endpoint;
pub(crate) mod requests;
pub(crate) mod verify;

#[cfg(test)]
mod tests;
