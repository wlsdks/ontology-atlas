//! The state of a repository's source as one fingerprint: `HEAD`, the index (every file's blob id),
//! what `status` reports, and the bytes of only the files the work tree changed.
//!
//! Two `git` runs read the tree and the changes; no file is opened for a file nobody changed, so the
//! cost follows the changes and not the size of the repository. A committed or staged file is
//! identified by the blob id the index holds, which Git already computed.

use std::path::Path;

use confined_files::{EntryKind, ProbeFolder};
use hardened_git::{run_git, GitInvocation};
use sha2::{Digest, Sha256};

use crate::composed_name::composed;
use crate::probe_error::ProbeError;
use crate::source_digest::lower_hex;
use crate::source_inventory_limits::{SOURCE_INVENTORY_MAX_HASH_BYTES, SOURCE_INVENTORY_VERSION};
use crate::vault_exclusion::{filter_status, is_excluded};

/// A listing of a very large repository is read whole; the bound only turns a runaway into an error.
const GIT_MAX_OUTPUT: usize = 1024 * 1024 * 1024;
const GITLINK_MODE: &str = "160000";
const NO_COMMITS_YET: &str = "(unborn)";

pub struct GitState {
    pub revision: String,
    pub fingerprint: String,
    pub dirty: bool,
    pub truncated: bool,
    pub files: Vec<String>,
}

fn run(root: &Path, args: &[&str]) -> Result<Vec<u8>, ProbeError> {
    let owned: Vec<String> = args.iter().map(|argument| (*argument).to_string()).collect();
    let mut invocation = GitInvocation::new(root, &owned);
    invocation.max_output = GIT_MAX_OUTPUT;
    let output = run_git(invocation)?;
    if output.success() {
        return Ok(output.stdout);
    }
    let detail = output
        .stderr_text()
        .lines()
        .find(|line| !line.trim().is_empty())
        .unwrap_or("unknown git error")
        .trim()
        .to_string();
    Err(ProbeError::Git(format!("git source inspection failed: {detail}")))
}

/// The top folder of the repository holding `root`, or `None` when `root` is in none, `git` is not
/// there or refuses the repository's own configuration.
pub fn find_git_root(root: &Path) -> Option<std::path::PathBuf> {
    let found = hardened_git::Repository::at(root).top_level().ok()??;
    confined_files::real_path(&found).ok()
}

struct IndexLines {
    records: Vec<String>,
    /// The records as the fingerprint covers them: each followed by a zero byte.
    bytes: Vec<u8>,
}

fn path_of(record: &str) -> &str {
    record.find('\t').map_or("", |at| record.get(at + 1..).unwrap_or(""))
}

fn stage_of(record: &str) -> char {
    record
        .find('\t')
        .and_then(|at| record.get(..at))
        .and_then(|head| head.chars().last())
        .unwrap_or(' ')
}

/// Every entry of the index as its own `mode blob stage<TAB>path` line, in path order, the path
/// composed. A line cut by the excluded vault folder is not covered.
fn index_lines(root: &Path, excluded: Option<&str>) -> Result<IndexLines, ProbeError> {
    let listing = run(root, &["ls-files", "--stage", "-z"])?;
    let valid_text = std::str::from_utf8(&listing).is_ok();
    let text = String::from_utf8_lossy(&listing);
    let mut records: Vec<String> = Vec::new();
    let mut as_listed = valid_text && excluded.is_none();
    let mut ordered = true;
    let mut previous = String::new();
    for record in text.split('\0').filter(|record| !record.is_empty()) {
        let path = path_of(record);
        if is_excluded(path, excluded) {
            continue;
        }
        let normalized = composed(path);
        let line = if normalized == path {
            record.to_string()
        } else {
            as_listed = false;
            format!("{}{normalized}", record.get(..record.len() - path.len()).unwrap_or(""))
        };
        if previous.as_str() > normalized.as_str() {
            ordered = false;
        }
        previous = normalized;
        records.push(line);
    }
    if !ordered {
        records.sort_by(|left, right| {
            path_of(left)
                .cmp(path_of(right))
                .then_with(|| stage_of(left).cmp(&stage_of(right)))
        });
    }
    let bytes = if as_listed && ordered {
        listing
    } else {
        let mut rebuilt = Vec::new();
        for record in &records {
            rebuilt.extend_from_slice(record.as_bytes());
            rebuilt.push(0);
        }
        rebuilt
    };
    Ok(IndexLines { records, bytes })
}

struct StatusEntry {
    path: String,
    untracked: bool,
    lost: bool,
    changed_in_work_tree: bool,
}

/// The entries of `status --porcelain=v1 -z`. A path differs from the index when the work tree
/// changed it (`Y` is not blank) or nothing tracks it (`??`); a path the work tree lost (`Y` is
/// `D`) has no file to read.
fn status_entries(status: &[u8]) -> Vec<StatusEntry> {
    let text = String::from_utf8_lossy(status);
    let mut tokens: Vec<&str> = text.split('\0').collect();
    if tokens.last() == Some(&"") {
        tokens.pop();
    }
    let mut entries = Vec::new();
    let mut index = 0;
    while let Some(&token) = tokens.get(index) {
        let mut letters = token.chars();
        let (x, y) = (letters.next().unwrap_or(' '), letters.next().unwrap_or(' '));
        if matches!(x, 'R' | 'C') || matches!(y, 'R' | 'C') {
            index += 1;
        }
        index += 1;
        entries.push(StatusEntry {
            path: token.get(3..).unwrap_or("").to_string(),
            untracked: x == '?',
            lost: y == 'D',
            changed_in_work_tree: x == '?' || (y != ' ' && y != 'D'),
        });
    }
    entries
}

struct ByteBudget {
    remaining: u64,
    truncated: bool,
}

/// Feeds one changed file into `hash`: its name, size and, within the byte budget, its bytes. A
/// link is covered by its target text. A name that vanished since the listing is no file.
fn hash_changed_file(
    folder: &ProbeFolder,
    path: &str,
    hash: &mut Sha256,
    budget: &mut ByteBudget,
) -> Result<(), ProbeError> {
    let Some(facts) = folder.facts(path)? else {
        return Ok(());
    };
    if !matches!(facts.kind, EntryKind::File | EntryKind::Symlink) {
        return Ok(());
    }
    hash.update(composed(path).as_bytes());
    hash.update([0]);
    hash.update(facts.size.to_le_bytes());
    if facts.kind == EntryKind::Symlink {
        let target = folder.link_target(path)?;
        let copied = usize::try_from(budget.remaining)
            .unwrap_or(usize::MAX)
            .min(target.len());
        hash.update(target.get(..copied).unwrap_or_default());
        budget.remaining -= copied as u64;
        if copied < target.len() {
            budget.truncated = true;
        }
        return Ok(());
    }
    let bytes = match folder.read_prefix(path, budget.remaining) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error.into()),
    };
    hash.update(&bytes);
    budget.remaining -= bytes.len() as u64;
    if (bytes.len() as u64) < facts.size {
        budget.truncated = true;
    }
    Ok(())
}

fn head_commit(root: &Path) -> String {
    run(root, &["rev-parse", "--quiet", "--verify", "HEAD"])
        .map(|bytes| String::from_utf8_lossy(&bytes).trim().to_string())
        .unwrap_or_else(|_| NO_COMMITS_YET.to_string())
}

pub fn inspect_git_state(
    folder: &ProbeFolder,
    excluded: Option<&str>,
) -> Result<GitState, ProbeError> {
    let root = folder.path();
    let index = index_lines(root, excluded)?;
    let revision = head_commit(root);
    let status = filter_status(
        &run(root, &["status", "--porcelain=v1", "-z", "--untracked-files=all"])?,
        excluded,
    );
    let changes = status_entries(&status);

    let mut tree_hash = Sha256::new();
    tree_hash.update(SOURCE_INVENTORY_VERSION.as_bytes());
    tree_hash.update([0]);
    tree_hash.update(&index.bytes);

    let mut changed_hash = Sha256::new();
    let mut budget = ByteBudget {
        remaining: SOURCE_INVENTORY_MAX_HASH_BYTES,
        truncated: false,
    };
    let mut changed: Vec<String> = changes
        .iter()
        .filter(|change| change.changed_in_work_tree)
        .map(|change| change.path.clone())
        .collect();
    changed.sort_by_cached_key(|path| composed(path));
    for path in &changed {
        hash_changed_file(folder, path, &mut changed_hash, &mut budget)?;
    }

    let lost: std::collections::HashSet<String> = changes
        .iter()
        .filter(|change| change.lost)
        .map(|change| composed(&change.path))
        .collect();
    let mut files: Vec<String> = Vec::new();
    for record in &index.records {
        let path = path_of(record);
        if !record.starts_with(GITLINK_MODE)
            && !lost.contains(path)
            && files.last().map(String::as_str) != Some(path)
        {
            files.push(path.to_string());
        }
    }
    let mut saw_untracked = false;
    for change in &changes {
        // A nested repository is listed as its folder, which holds no file of this one.
        if !change.untracked || change.path.ends_with('/') {
            continue;
        }
        files.push(composed(&change.path));
        saw_untracked = true;
    }
    if saw_untracked {
        files.sort();
    }

    let mut digest = Sha256::new();
    let tree_hex = lower_hex(&tree_hash.finalize());
    let changed_hex = lower_hex(&changed_hash.finalize());
    for part in [
        b"git-state-v2".as_slice(),
        revision.as_bytes(),
        tree_hex.as_bytes(),
        changed_hex.as_bytes(),
        &status,
    ] {
        digest.update(part);
        digest.update([0]);
    }
    Ok(GitState {
        revision,
        fingerprint: format!("sha256:{}", lower_hex(&digest.finalize())),
        dirty: !status.is_empty(),
        truncated: budget.truncated,
        files,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_rename_entry_consumes_its_source_path_and_a_lost_file_has_nothing_to_read() {
        let status = b"R  new.go\0old.go\0 D gone.go\0?? fresh.go\0 M kept.go\0";
        let entries = status_entries(status);
        let paths: Vec<&str> = entries.iter().map(|entry| entry.path.as_str()).collect();
        assert_eq!(paths, ["new.go", "gone.go", "fresh.go", "kept.go"]);
        assert!(entries.get(1).is_some_and(|entry| entry.lost && !entry.changed_in_work_tree));
        assert!(entries.get(2).is_some_and(|entry| entry.untracked && entry.changed_in_work_tree));
        assert!(entries.first().is_some_and(|entry| !entry.changed_in_work_tree));
    }

    #[test]
    fn the_index_path_is_what_follows_the_tab() {
        let record = "100644 abc 0\tsrc/a b.ts";
        assert_eq!(path_of(record), "src/a b.ts");
        assert_eq!(stage_of(record), '0');
    }
}
