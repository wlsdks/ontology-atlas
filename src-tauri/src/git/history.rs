use super::*;
use crate::command_output::{self, CaptureError};
use std::time::Duration;

const MAX_CONTENT_BYTES: u64 = 2 * 1024 * 1024;
const MAX_LOG_BYTES: u64 = 64 * 1024;
const MAX_REFERENCE_BYTES: usize = 2 * 1024 * 1024;
const READ_DEADLINE: Duration = Duration::from_secs(10);

#[cfg(test)]
mod tests;

fn root_and_prefix(vault_path: &str) -> Result<(PathBuf, String), String> {
    let vault = validate_vault_dir(vault_path)?;
    let (success, toplevel) = read(&vault, &["rev-parse", "--show-toplevel"], MAX_LOG_BYTES)?;
    if !success || toplevel.trim().is_empty() {
        return Err(coded("git-repo-missing", ""));
    }
    let root = PathBuf::from(toplevel.trim());
    let root = fs::canonicalize(&root).unwrap_or(root);
    if !repo_toplevel_is_trustworthy(&root) || !vault.starts_with(&root) {
        return Err(coded("git-repo-missing", ""));
    }
    let pathspec = vault_pathspec(&root, &vault);
    let prefix = if pathspec == "." {
        String::new()
    } else {
        format!("{pathspec}/")
    };
    Ok((root, prefix))
}

fn valid_slug(slug: &str) -> bool {
    !slug.is_empty()
        && !slug.contains("..")
        && !slug.starts_with('/')
        && !slug.contains(['\\', '\0'])
}

fn valid_revision(revision: &str) -> bool {
    matches!(revision.len(), 40 | 64) && revision.bytes().all(|b| b.is_ascii_hexdigit())
}

fn read(root: &Path, args: &[&str], max_bytes: u64) -> Result<(bool, String), String> {
    // Only discovery/log/blob reads reach this helper; no checkout filters, hooks or text converters.
    let mut command = hardened_base_command();
    command
        .args(with_diff_family_guard(args))
        .current_dir(root)
        .env("GIT_OPTIONAL_LOCKS", "0")
        .env("GIT_ALLOW_PROTOCOL", "")
        .env("GIT_NO_LAZY_FETCH", "1")
        .env("GIT_LITERAL_PATHSPECS", "1")
        .env_remove("GIT_GLOB_PATHSPECS")
        .env_remove("GIT_NOGLOB_PATHSPECS")
        .env_remove("GIT_ICASE_PATHSPECS");
    command_output::run(command, READ_DEADLINE, max_bytes).map_err(|error| {
        coded(
            match error {
                CaptureError::TooLarge => "git-history-too-large",
                CaptureError::TimedOut => "git-history-timeout",
                CaptureError::Unavailable => "git-history-unavailable",
            },
            "",
        )
    })
}

// O(requested revisions) metadata, bounded separately from one body's bytes.
pub(super) fn list(
    vault_path: &str,
    slugs: &[String],
    max_revisions: Option<u32>,
) -> Result<Vec<NodeRevisionRef>, String> {
    let (root, prefix) = root_and_prefix(vault_path)?;
    let max_count = max_revisions.unwrap_or(40).clamp(1, 200);
    let mut references = Vec::new();
    let mut retained = 0;
    for slug in slugs
        .iter()
        .take(MAX_FRESHNESS_SLUGS)
        .filter(|s| valid_slug(s))
    {
        let (success, log) = read(
            &root,
            &[
                "log",
                &format!("--max-count={max_count}"),
                "--pretty=format:%H %cI",
                "--no-renames",
                "--",
                &format!("{prefix}{slug}.md"),
            ],
            MAX_LOG_BYTES,
        )?;
        if !success {
            return Err(coded("git-history-unavailable", ""));
        }
        for line in log.lines() {
            let Some((revision, iso_time)) = line.trim().split_once(' ') else {
                return Err(coded("git-history-unavailable", ""));
            };
            if !valid_revision(revision) {
                return Err(coded("git-history-unavailable", ""));
            }
            retained += slug.len() + revision.len() + iso_time.len();
            if retained > MAX_REFERENCE_BYTES {
                return Err(coded("git-history-too-large", ""));
            }
            references.push(NodeRevisionRef {
                slug: slug.clone(),
                iso_time: iso_time.trim().into(),
                revision: revision.into(),
            });
        }
    }
    Ok(references)
}

pub(super) fn content(
    vault_path: &str,
    slug: &str,
    revision: &str,
) -> Result<Option<String>, String> {
    if !valid_slug(slug) || !valid_revision(revision) {
        return Err(coded("git-history-invalid-reference", ""));
    }
    let (root, prefix) = root_and_prefix(vault_path)?;
    let file_path = format!("{prefix}{slug}.md");
    let (success, entry) = read(
        &root,
        &["ls-tree", "-z", "--full-tree", revision, "--", &file_path],
        MAX_LOG_BYTES,
    )?;
    if !success {
        return Err(coded("git-history-unavailable", ""));
    }
    if entry.is_empty() {
        return Ok(None);
    }
    let Some((metadata, path)) = entry
        .strip_suffix('\0')
        .and_then(|entry| entry.split_once('\t'))
    else {
        return Err(coded("git-history-unavailable", ""));
    };
    let fields: Vec<_> = metadata.split_ascii_whitespace().collect();
    if path != file_path || fields.len() != 3 || fields[1] != "blob" || !valid_revision(fields[2]) {
        return Err(coded("git-history-unavailable", ""));
    }
    let (success, text) = read(&root, &["cat-file", "blob", fields[2]], MAX_CONTENT_BYTES)?;
    if success {
        Ok(Some(text))
    } else {
        Err(coded("git-history-unavailable", ""))
    }
}
