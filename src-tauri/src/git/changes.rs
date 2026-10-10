use serde::Serialize;
use std::fs;
use std::path::Path;

use super::runner::run_git;
use crate::errors::coded;

#[cfg(test)]
mod tests;

pub(super) struct PorcelainRow {
    pub(super) index: char,
    pub(super) worktree: char,
    pub(super) path: String,
    pub(super) renamed_from: Option<String>,
}

fn parse_porcelain(out: &str) -> Vec<PorcelainRow> {
    out.lines()
        .filter_map(|line| {
            // Read with `get`, not sliced, so an unrecognized line is skipped, not a panic.
            let bytes = line.as_bytes();
            let index = *bytes.first()? as char;
            let worktree = *bytes.get(1)? as char;
            let rest = line.get(3..)?;
            let mut renamed_from = None;
            let mut path = rest.to_string();
            if let Some(arrow) = rest.find(" -> ") {
                if let (Some(before), Some(after)) = (rest.get(..arrow), rest.get(arrow + 4..)) {
                    renamed_from = Some(before.to_string());
                    path = after.to_string();
                }
            }
            Some(PorcelainRow {
                index,
                worktree,
                path,
                renamed_from,
            })
        })
        .collect()
}

pub(super) fn get_porcelain_status(
    repo_root: &Path,
    pathspec: &str,
) -> Result<Vec<PorcelainRow>, String> {
    let out = run_git(
        repo_root,
        &[
            // Raw UTF-8 paths; the default core.quotePath C-quotes non-ASCII names and every
            // consumer would mangle them. The newline+arrow form stays because the Rust
            // mirror's tests pin it.
            "-c",
            "core.quotepath=false",
            "status",
            "--porcelain",
            "--untracked-files=all",
            "--",
            pathspec,
        ],
    )?;
    if !out.success {
        return Err(coded(
            "git-status-failed",
            first_nonempty_line(&out.stderr).unwrap_or_else(|| "unknown error".into()),
        ));
    }
    Ok(parse_porcelain(&out.stdout))
}

/// Whole-repo status for the staged-outside-vault guard; empty on failure.
pub(super) fn get_full_porcelain_status(repo_root: &Path) -> Vec<PorcelainRow> {
    match run_git(
        repo_root,
        &[
            "-c",
            "core.quotepath=false",
            "status",
            "--porcelain",
            "--untracked-files=all",
        ],
    ) {
        Ok(out) if out.success => parse_porcelain(&out.stdout),
        _ => Vec::new(),
    }
}

pub(super) fn classify_change(row: &PorcelainRow) -> &'static str {
    if row.index == 'D' || row.worktree == 'D' {
        return "deleted";
    }
    if row.index == 'R' {
        return "renamed";
    }
    if (row.index == '?' && row.worktree == '?') || row.index == 'A' {
        return "added";
    }
    "modified"
}

pub(super) type KindSlug = (Option<String>, Option<String>);

// Best-effort top-level `kind:`/`slug:` from the leading `---` block; never
// blocks a commit.
pub(super) fn read_kind_slug(abs_path: &Path) -> KindSlug {
    use std::io::BufRead;

    let Ok(file) = fs::File::open(abs_path) else {
        return (None, None);
    };
    let mut lines = std::io::BufReader::new(file).lines();
    if !matches!(lines.next(), Some(Ok(first)) if first.trim_end() == "---") {
        return (None, None);
    }
    let mut kind = None;
    let mut slug = None;
    for line in lines {
        let Ok(line) = line else {
            return (None, None);
        };
        let trimmed = line.trim_end();
        if trimmed == "---" {
            break;
        }
        if let Some(rest) = line.strip_prefix("kind:") {
            let value = unquote(rest.trim());
            if !value.is_empty() {
                kind = Some(value);
            }
        } else if let Some(rest) = line.strip_prefix("slug:") {
            let value = unquote(rest.trim());
            if !value.is_empty() {
                slug = Some(value);
            }
        }
    }
    (kind, slug)
}

/// `strip_prefix`/`strip_suffix`, not byte indexing, so a panic cannot abort the
/// app from the macOS main thread.
pub(super) fn unquote(value: &str) -> String {
    for quote in ['"', '\''] {
        if let Some(inner) = value
            .strip_prefix(quote)
            .and_then(|rest| rest.strip_suffix(quote))
        {
            return inner.to_string();
        }
    }
    value.to_string()
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ChangeEntry {
    pub(super) path: String,
    pub(super) status: String,
    pub(super) kind: Option<String>,
    pub(super) slug: String,
    pub(super) renamed_from: Option<String>,
}

pub(super) fn build_change_summary(
    rows: &[PorcelainRow],
    repo_root: &Path,
    vault_dir: &Path,
) -> Vec<ChangeEntry> {
    rows.iter()
        .map(|row| {
            let abs_path = repo_root.join(&row.path);
            let status = classify_change(row);
            let mut kind = None;
            let mut slug = path_based_slug(vault_dir, &abs_path);
            if row.path.ends_with(".md") && status != "deleted" {
                let (k, s) = read_kind_slug(&abs_path);
                if k.is_some() {
                    kind = k;
                }
                if let Some(s) = s {
                    slug = s;
                }
            }
            let renamed_from = if status == "renamed" {
                row.renamed_from.clone()
            } else {
                None
            };
            ChangeEntry {
                path: row.path.clone(),
                status: status.to_string(),
                kind,
                slug,
                renamed_from,
            }
        })
        .collect()
}

pub(super) fn path_based_slug(vault_dir: &Path, abs_path: &Path) -> String {
    let rel = abs_path
        .strip_prefix(vault_dir)
        .unwrap_or(abs_path)
        .to_string_lossy()
        .replace('\\', "/");
    rel.strip_suffix(".md").unwrap_or(&rel).to_string()
}

/// Kind counts plus up to three representative slugs.
pub(super) fn format_snapshot_summary(changes: &[ChangeEntry]) -> String {
    let added = changes.iter().filter(|c| c.status == "added").count();
    let modified = changes.iter().filter(|c| c.status == "modified").count();
    let removed = changes.iter().filter(|c| c.status == "deleted").count();
    let renamed = changes.iter().filter(|c| c.status == "renamed").count();

    let mut parts: Vec<String> = Vec::new();
    if added > 0 {
        parts.push(format!(
            "+{added} concept{}",
            if added == 1 { "" } else { "s" }
        ));
    }
    if modified > 0 {
        parts.push(format!("~{modified} updated"));
    }
    if renamed > 0 {
        parts.push(format!("→{renamed} renamed"));
    }
    if removed > 0 {
        parts.push(format!("-{removed} removed"));
    }

    let headline = if parts.is_empty() {
        "ontology snapshot: no concept changes".to_string()
    } else {
        format!("ontology snapshot: {}", parts.join(", "))
    };

    let slugs: Vec<&str> = changes.iter().map(|c| c.slug.as_str()).collect();
    let shown = &slugs[..slugs.len().min(3)];
    let overflow = slugs.len() - shown.len();
    if shown.is_empty() {
        headline
    } else {
        let overflow_text = if overflow > 0 {
            format!(", +{overflow}")
        } else {
            String::new()
        };
        format!("{headline} ({}{overflow_text})", shown.join(", "))
    }
}

fn status_mark(status: &str) -> char {
    match status {
        "added" => 'A',
        "modified" => 'M',
        "deleted" => 'D',
        "renamed" => 'R',
        _ => '?',
    }
}

/// A custom message keeps the auto summary in the body.
pub(super) fn build_commit_message(
    subject: &str,
    auto_summary: &str,
    changes: &[ChangeEntry],
    has_custom_message: bool,
) -> String {
    let mut body: Vec<String> = Vec::new();
    if has_custom_message {
        body.push(auto_summary.to_string());
        body.push(String::new());
    }
    for c in changes {
        body.push(format!("  {}  {}", status_mark(&c.status), c.path));
    }
    format!("{subject}\n\n{}", body.join("\n"))
}

/// Reported as a warning, never mixed into the commit.
pub(super) fn find_staged_outside_vault(rows: &[PorcelainRow], pathspec: &str) -> Vec<String> {
    rows.iter()
        .filter(|row| {
            let is_staged = row.index != ' ' && row.index != '?';
            is_staged && !is_under_pathspec(&row.path, pathspec)
        })
        .map(|row| row.path.clone())
        .collect()
}

fn is_under_pathspec(path: &str, pathspec: &str) -> bool {
    if pathspec == "." {
        return true;
    }
    path == pathspec || path.starts_with(&format!("{pathspec}/"))
}

pub(super) fn first_nonempty_line(text: &str) -> Option<String> {
    text.lines()
        .map(|l| l.trim())
        .find(|l| !l.is_empty())
        .map(|l| l.to_string())
}
