//! The vault's own folder when it lies inside the source it describes. Its files are the ontology,
//! not the code, so writing the vault must not make its own source binding stale: the probe leaves
//! the folder out of the inventory and out of `git status`.

use std::path::Path;

use confined_files::real_path;

/// Whether `relative` is the excluded folder or lies under it.
pub fn is_excluded(relative: &str, excluded: Option<&str>) -> bool {
    excluded.is_some_and(|folder| {
        relative == folder
            || relative
                .strip_prefix(folder)
                .is_some_and(|rest| rest.starts_with('/'))
    })
}

/// One absolute path as forward-slash text: the `\\?\` verbatim prefix dropped, the drive letter
/// lower-cased and no trailing separator, so a Windows path and its canonical form compare equal.
fn comparable_path(path: &str) -> String {
    let unified = path.replace('\\', "/");
    let unverbatim = match unified.strip_prefix("//?/UNC/") {
        Some(rest) => format!("//{rest}"),
        None => match unified.strip_prefix("//?/") {
            Some(rest) => rest.to_string(),
            None => unified,
        },
    };
    let mut characters: Vec<char> = unverbatim.chars().collect();
    if let [drive, ':', ..] = characters.as_mut_slice() {
        if drive.is_ascii_alphabetic() {
            *drive = drive.to_ascii_lowercase();
        }
    }
    let mut text: String = characters.into_iter().collect();
    while text.len() > 1 && text.ends_with('/') && !text.ends_with(":/") {
        text.pop();
    }
    text
}

/// The vault's folder relative to the source root when it lies strictly inside it, else `None`.
pub fn vault_folder_inside(source_root: &str, vault_root: &str) -> Option<String> {
    let base = comparable_path(source_root);
    let vault = comparable_path(vault_root);
    let rest = vault.strip_prefix(&base)?;
    let inside = if base.ends_with('/') {
        rest
    } else {
        rest.strip_prefix('/')?
    };
    if inside.is_empty()
        || inside
            .split('/')
            .any(|part| part.is_empty() || part == "." || part == "..")
    {
        return None;
    }
    Some(inside.to_string())
}

/// [`vault_folder_inside`] for two folders on disk, each resolved to the letter case the disk
/// stores, so `/Repo` and `/repo/atlas` compare as one place on a file system that ignores case.
pub fn excluded_vault_folder(source_root: &Path, vault: Option<&Path>) -> Option<String> {
    let vault = vault?;
    let source = real_path(source_root).ok()?;
    let vault = real_path(vault).ok()?;
    vault_folder_inside(&source.to_string_lossy(), &vault.to_string_lossy())
}

/// `git status --porcelain=v1 -z` without the entries under the excluded folder. A rename or copy
/// entry carries its source path as the next token and is dropped only when both are inside.
pub fn filter_status(status: &[u8], excluded: Option<&str>) -> Vec<u8> {
    let Some(folder) = excluded else {
        return status.to_vec();
    };
    if status.is_empty() {
        return Vec::new();
    }
    let text = String::from_utf8_lossy(status);
    let mut tokens: Vec<&str> = text.split('\0').collect();
    if tokens.last() == Some(&"") {
        tokens.pop();
    }
    let mut kept: Vec<&str> = Vec::new();
    let mut index = 0;
    while let Some(&entry) = tokens.get(index) {
        let renamed = entry.starts_with('R') || entry.starts_with('C');
        let source = if renamed {
            tokens.get(index + 1).copied()
        } else {
            None
        };
        index += if renamed { 2 } else { 1 };
        let inside = is_excluded(entry.get(3..).unwrap_or(""), Some(folder))
            && source.is_none_or(|from| is_excluded(from, Some(folder)));
        if inside {
            continue;
        }
        kept.push(entry);
        if let Some(from) = source {
            kept.push(from);
        }
    }
    if kept.is_empty() {
        return Vec::new();
    }
    let mut out = kept.join("\0").into_bytes();
    out.push(0);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cases() -> serde_json::Value {
        serde_json::from_str(include_str!("../vault_exclusion_cases.json")).expect("cases parse")
    }

    #[test]
    fn a_vault_inside_a_source_is_found_in_every_spelling_a_platform_gives() {
        for case in cases()["folders"].as_array().expect("folders") {
            assert_eq!(
                vault_folder_inside(
                    case["source"].as_str().expect("source"),
                    case["vault"].as_str().expect("vault")
                )
                .as_deref(),
                case["inside"].as_str(),
                "{case}"
            );
        }
    }

    #[test]
    fn status_entries_inside_the_vault_are_dropped_and_a_move_out_of_it_is_kept() {
        let encode = |entries: &serde_json::Value| {
            let mut bytes = Vec::new();
            for entry in entries.as_array().expect("entries") {
                bytes.extend_from_slice(entry.as_str().expect("text").as_bytes());
                bytes.push(0);
            }
            bytes
        };
        for case in cases()["status"].as_array().expect("status") {
            assert_eq!(
                filter_status(&encode(&case["entries"]), case["excluded"].as_str()),
                encode(&case["kept"]),
                "{case}"
            );
        }
    }
}
