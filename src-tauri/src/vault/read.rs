use super::scope::{canonical_root, normalize_relative_path, resolve_existing_inside};
use super::walk::metadata_mtime_ms;
use serde::Serialize;
use std::io::Read;
use std::path::Path;
use std::{fs, time::UNIX_EPOCH};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TauriTextFile {
    text: String,
    last_modified: u128,
}

#[tauri::command(async)]
pub(crate) fn read_vault_text_file(
    root_path: String,
    relative_path: String,
) -> Result<TauriTextFile, String> {
    let path = resolve_existing_inside(&root_path, &relative_path)?;
    let text = fs::read_to_string(&path).map_err(|err| err.to_string())?;
    let last_modified = metadata_mtime_ms(&path)?;
    Ok(TauriTextFile {
        text,
        last_modified,
    })
}

const VAULT_TEXT_BATCH_MAX: usize = 256;
const VAULT_TEXT_BATCH_FILE_MAX_BYTES: u64 = 4 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TauriTextFileRead {
    relative_path: String,
    text: Option<String>,
    last_modified: Option<u128>,
    error: Option<String>,
}

#[tauri::command(async)]
pub(crate) fn read_vault_text_files(
    root_path: String,
    relative_paths: Vec<String>,
) -> Result<Vec<TauriTextFileRead>, String> {
    if relative_paths.len() > VAULT_TEXT_BATCH_MAX {
        return Err(format!(
            "at most {VAULT_TEXT_BATCH_MAX} files are read in one batch"
        ));
    }
    let root = canonical_root(&root_path)?;
    Ok(relative_paths
        .into_iter()
        .map(
            |relative_path| match read_vault_markdown(&root, &relative_path) {
                Ok((text, last_modified)) => TauriTextFileRead {
                    relative_path,
                    text: Some(text),
                    last_modified: Some(last_modified),
                    error: None,
                },
                Err(error) => TauriTextFileRead {
                    relative_path,
                    text: None,
                    last_modified: None,
                    error: Some(error),
                },
            },
        )
        .collect())
}

fn is_visible_markdown(relative: &Path) -> bool {
    relative.extension().is_some_and(|ext| ext == "md")
        && !relative
            .components()
            .any(|part| part.as_os_str().to_string_lossy().starts_with('.'))
}

fn read_vault_markdown(root: &Path, relative_path: &str) -> Result<(String, u128), String> {
    let relative = normalize_relative_path(relative_path)?;
    if !is_visible_markdown(&relative) {
        return Err("a batch reads only Markdown outside dot folders".into());
    }
    let path = fs::canonicalize(root.join(&relative)).map_err(|err| err.to_string())?;
    let Ok(target) = path.strip_prefix(root) else {
        return Err("resolved path must stay inside the selected vault".into());
    };
    if !is_visible_markdown(target) {
        return Err("a batch reads only Markdown outside dot folders".into());
    }
    let metadata = fs::metadata(&path).map_err(|err| err.to_string())?;
    if metadata.len() > VAULT_TEXT_BATCH_FILE_MAX_BYTES {
        return Err(format!(
            "a batch reads files up to {VAULT_TEXT_BATCH_FILE_MAX_BYTES} bytes"
        ));
    }
    let text = fs::read_to_string(&path).map_err(|err| err.to_string())?;
    let last_modified = metadata_mtime_ms(&path)?;
    Ok((text, last_modified))
}

#[tauri::command(async)]
pub(crate) fn read_vault_text_tail(
    root_path: String,
    relative_path: String,
    max_lines: usize,
) -> Result<String, String> {
    let path = resolve_existing_inside(&root_path, &relative_path)?;
    read_text_tail(&path, max_lines, MAX_TEXT_TAIL_BYTES).map_err(|err| err.to_string())
}

const MAX_TEXT_TAIL_BYTES: u64 = 1024 * 1024;

fn read_text_tail(path: &Path, max_lines: usize, max_bytes: u64) -> std::io::Result<String> {
    use std::io::{Seek, SeekFrom};
    const CHUNK_BYTES: u64 = 16 * 1024;

    let mut file = fs::File::open(path)?;
    let end = file.metadata()?.len();
    let floor = end.saturating_sub(max_bytes);
    let mut start = end;
    let mut newlines = 0;
    let mut chunks: Vec<Vec<u8>> = Vec::new();
    while start > floor && newlines <= max_lines {
        let from = start.saturating_sub(CHUNK_BYTES).max(floor);
        let mut chunk = vec![0_u8; (start - from) as usize];
        file.seek(SeekFrom::Start(from))?;
        file.read_exact(&mut chunk)?;
        newlines += chunk.iter().filter(|byte| **byte == b'\n').count();
        chunks.push(chunk);
        start = from;
    }
    let tail: Vec<u8> = chunks.into_iter().rev().flatten().collect();
    let text = String::from_utf8_lossy(&tail);
    let mut lines: Vec<&str> = text.lines().collect();
    if start > 0 && !lines.is_empty() {
        lines.remove(0);
    }
    let keep = lines.len().saturating_sub(max_lines);
    Ok(lines[keep..].join("\n"))
}

/// A u64 LE mtime, then raw bytes: a serde `Vec<u8>` is one JSON number per byte.
#[tauri::command(async)]
pub(crate) fn read_vault_binary_file(
    root_path: String,
    relative_path: String,
) -> Result<tauri::ipc::Response, String> {
    let path = resolve_existing_inside(&root_path, &relative_path)?;
    read_stamped_bytes(&path).map(tauri::ipc::Response::new)
}

fn read_stamped_bytes(path: &Path) -> Result<Vec<u8>, String> {
    let mut file = fs::File::open(path).map_err(|err| err.to_string())?;
    let metadata = file.metadata().map_err(|err| err.to_string())?;
    let modified = metadata.modified().map_err(|err| err.to_string())?;
    let last_modified = modified
        .duration_since(UNIX_EPOCH)
        .map_err(|err| err.to_string())?
        .as_millis() as u64;
    let mut stamped = Vec::with_capacity(8 + metadata.len() as usize);
    stamped.extend_from_slice(&last_modified.to_le_bytes());
    file.read_to_end(&mut stamped)
        .map_err(|err| err.to_string())?;
    Ok(stamped)
}

#[cfg(test)]
mod tests {
    #[test]
    fn a_binary_read_is_the_mtime_then_the_raw_bytes() {
        let dir = std::env::temp_dir().join(format!("atlas-binary-read-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("figure.png");
        let body: Vec<u8> = (0..=255).collect();
        std::fs::write(&file, &body).unwrap();

        let stamped = super::read_stamped_bytes(&file).unwrap();

        let (stamp, bytes) = stamped.split_at(8);
        assert_eq!(bytes, body.as_slice());
        let expected = super::metadata_mtime_ms(&file).unwrap() as u64;
        assert_eq!(u64::from_le_bytes(stamp.try_into().unwrap()), expected);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_tail_read_returns_only_the_last_whole_lines() {
        let dir = std::env::temp_dir().join(format!("atlas-tail-read-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let log = dir.join("activity.jsonl");
        let lines: Vec<String> = (0..1000)
            .map(|i| format!("{{\"v\":1,\"summary\":\"entry {i:04}\"}}"))
            .collect();
        std::fs::write(&log, format!("{}\n", lines.join("\n"))).unwrap();

        let tail = super::read_text_tail(&log, 50, super::MAX_TEXT_TAIL_BYTES).unwrap();
        assert_eq!(tail, lines[950..].join("\n"));

        let short = super::read_text_tail(&log, 50, 100).unwrap();
        assert!(!short.is_empty() && short.lines().count() < 50);
        assert!(
            lines[950..].join("\n").ends_with(&short),
            "a capped read keeps whole lines only"
        );

        std::fs::write(&log, "one\ntwo").unwrap();
        assert_eq!(
            super::read_text_tail(&log, 50, super::MAX_TEXT_TAIL_BYTES).unwrap(),
            "one\ntwo"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }
}

#[cfg(test)]
mod vault_text_batch_tests {
    use super::{read_vault_text_files, VAULT_TEXT_BATCH_FILE_MAX_BYTES, VAULT_TEXT_BATCH_MAX};

    fn vault(name: &str) -> std::path::PathBuf {
        let base =
            std::env::temp_dir().join(format!("atlas-text-batch-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(base.join("vault/domains")).unwrap();
        std::fs::create_dir_all(base.join("vault/.claude")).unwrap();
        std::fs::write(base.join("vault/project.md"), "# project").unwrap();
        std::fs::write(base.join("vault/domains/order.md"), "# order").unwrap();
        std::fs::write(base.join("vault/.claude/notes.md"), "hidden").unwrap();
        std::fs::write(base.join("vault/.env.md"), "hidden").unwrap();
        std::fs::write(base.join("vault/plan.txt"), "not markdown").unwrap();
        std::fs::write(base.join("outside.md"), "outside").unwrap();
        base
    }

    #[test]
    fn reads_every_requested_markdown_file_in_the_order_asked() {
        let base = vault("order");
        let root = base.join("vault").to_string_lossy().to_string();
        let read =
            read_vault_text_files(root, vec!["domains/order.md".into(), "project.md".into()])
                .unwrap();
        let paths: Vec<&str> = read
            .iter()
            .map(|file| file.relative_path.as_str())
            .collect();
        assert_eq!(paths, ["domains/order.md", "project.md"]);
        assert_eq!(read[0].text.as_deref(), Some("# order"));
        assert_eq!(read[1].text.as_deref(), Some("# project"));
        assert!(read
            .iter()
            .all(|file| file.error.is_none() && file.last_modified.is_some()));
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn a_file_it_may_not_read_fails_alone_and_says_why() {
        let base = vault("refuse");
        let root = base.join("vault").to_string_lossy().to_string();
        let read = read_vault_text_files(
            root,
            vec![
                ".claude/notes.md".into(),
                ".env.md".into(),
                "plan.txt".into(),
                "../outside.md".into(),
                "missing.md".into(),
                "project.md".into(),
            ],
        )
        .unwrap();
        assert_eq!(read.len(), 6);
        for refused in &read[..5] {
            assert!(refused.text.is_none(), "{} was read", refused.relative_path);
            assert!(
                refused.error.is_some(),
                "{} has no reason",
                refused.relative_path
            );
        }
        assert_eq!(read[5].text.as_deref(), Some("# project"));
        let _ = std::fs::remove_dir_all(&base);
    }

    #[cfg(unix)]
    #[test]
    fn a_link_that_leaves_the_vault_is_not_followed() {
        use std::os::unix::fs::symlink;
        let base = vault("link");
        symlink(base.join("outside.md"), base.join("vault/linked.md")).unwrap();
        let root = base.join("vault").to_string_lossy().to_string();
        let read = read_vault_text_files(root, vec!["linked.md".into()]).unwrap();
        assert!(read[0].text.is_none());
        let reason = read[0].error.clone().unwrap_or_default();
        assert!(reason.contains("stay inside"), "{reason}");
        let _ = std::fs::remove_dir_all(&base);
    }

    #[cfg(unix)]
    #[test]
    fn a_markdown_name_linked_to_a_dot_file_is_not_read() {
        use std::os::unix::fs::symlink;
        let base = vault("dotlink");
        std::fs::write(base.join("vault/.env"), "SECRET=1").unwrap();
        symlink(".env", base.join("vault/notes.md")).unwrap();
        symlink(".claude/notes.md", base.join("vault/claude.md")).unwrap();
        let root = base.join("vault").to_string_lossy().to_string();
        let read =
            read_vault_text_files(root, vec!["notes.md".into(), "claude.md".into()]).unwrap();
        for refused in &read {
            assert!(refused.text.is_none(), "{} was read", refused.relative_path);
            assert!(refused.error.is_some());
        }
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn a_file_past_the_byte_bound_is_left_to_the_single_read() {
        let base = vault("bytes");
        let large = "x".repeat(VAULT_TEXT_BATCH_FILE_MAX_BYTES as usize + 1);
        std::fs::write(base.join("vault/large.md"), &large).unwrap();
        let root = base.join("vault").to_string_lossy().to_string();
        let read =
            read_vault_text_files(root.clone(), vec!["large.md".into(), "project.md".into()])
                .unwrap();
        assert!(read[0].text.is_none());
        let reason = read[0].error.clone().unwrap_or_default();
        assert!(reason.contains("bytes"), "{reason}");
        assert_eq!(read[1].text.as_deref(), Some("# project"));
        assert_eq!(
            super::read_vault_text_file(root, "large.md".into())
                .unwrap()
                .text
                .len(),
            large.len()
        );
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn refuses_a_batch_past_the_bound_and_an_ungranted_root() {
        let base = vault("bound");
        let root = base.join("vault").to_string_lossy().to_string();
        let too_many = vec!["project.md".to_string(); VAULT_TEXT_BATCH_MAX + 1];
        assert!(read_vault_text_files(root.clone(), too_many).is_err());
        assert!(read_vault_text_files(root.clone(), Vec::new())
            .unwrap()
            .is_empty());

        let granted = std::fs::canonicalize(base.join("vault/domains")).unwrap();
        let scope = crate::vault_grants::EnforcedScope::granting(&[granted]);
        let err = read_vault_text_files(root, vec!["project.md".into()]).unwrap_err();
        assert!(err.contains("not-granted"), "{err}");
        drop(scope);
        let _ = std::fs::remove_dir_all(&base);
    }
}
