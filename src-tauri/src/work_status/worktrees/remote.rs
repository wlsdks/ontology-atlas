use std::path::Path;

use super::super::git_read::git_read;

const SLUG_PART_MAX_LEN: usize = 100;

/// The host and `owner/name` of `origin`, never its user information.
pub(super) fn origin(root: &Path) -> (Option<String>, Option<String>) {
    git_read(root, &["config", "--get", "remote.origin.url"])
        .ok()
        .map(|url| host_and_slug(url.trim()))
        .unwrap_or((None, None))
}

/// Reads `https://[user@]host[:port]/owner/name(.git)`, `ssh://…` and scp-like `[user@]host:owner/name`.
pub(crate) fn host_and_slug(url: &str) -> (Option<String>, Option<String>) {
    let (authority, path) = if let Some((_, rest)) = url.split_once("://") {
        rest.split_once('/').unwrap_or((rest, ""))
    } else if let Some((authority, path)) = url.split_once(':') {
        if authority.contains('/') {
            return (None, None);
        }
        (authority, path)
    } else {
        return (None, None);
    };
    let host_and_port = authority.rsplit_once('@').map_or(authority, |(_, host)| host);
    let host = host_and_port.split(':').next().unwrap_or("").to_ascii_lowercase();
    let host = (!host.is_empty()
        && host.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-'))
    .then_some(host);
    let mut parts = path.trim_matches('/').trim_end_matches(".git").split('/');
    let slug = match (parts.next(), parts.next(), parts.next()) {
        (Some(owner), Some(name), None) if is_slug_part(owner) && is_slug_part(name) => {
            Some(format!("{owner}/{name}"))
        }
        _ => None,
    };
    (host, slug)
}

fn is_slug_part(part: &str) -> bool {
    !part.is_empty()
        && part.len() <= SLUG_PART_MAX_LEN
        && part
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '.' | '-'))
}
