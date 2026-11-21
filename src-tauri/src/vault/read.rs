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

/// One requested path and what reading it gave: the text and its mtime in milliseconds, or why not.
#[derive(Debug, PartialEq)]
struct VaultTextRead {
    relative_path: String,
    outcome: Result<(String, u128), String>,
}

/// Answers in the framing `vault-text-frames.ts` decodes, so a batch is never one JSON string.
#[tauri::command(async)]
pub(crate) fn read_vault_text_files(
    root_path: String,
    relative_paths: Vec<String>,
) -> Result<tauri::ipc::Response, String> {
    let reads = read_vault_text_batch(&root_path, relative_paths)?;
    encode_text_reads(&reads).map(tauri::ipc::Response::new)
}

fn read_vault_text_batch(
    root_path: &str,
    relative_paths: Vec<String>,
) -> Result<Vec<VaultTextRead>, String> {
    if relative_paths.len() > VAULT_TEXT_BATCH_MAX {
        return Err(format!(
            "at most {VAULT_TEXT_BATCH_MAX} files are read in one batch"
        ));
    }
    let root = canonical_root(root_path)?;
    Ok(relative_paths
        .into_iter()
        .map(|relative_path| VaultTextRead {
            outcome: read_vault_markdown(&root, &relative_path),
            relative_path,
        })
        .collect())
}

const FRAME_TEXT: u8 = 0;
const FRAME_ERROR: u8 = 1;
const FRAME_LENGTH_BYTES: usize = 4;
const FRAME_MTIME_BYTES: usize = 8;

/// Little-endian: a `u32` count, then per read a kind byte and a `u32`-length-prefixed UTF-8
/// path; a text read adds an `f64` mtime and the text, an error read adds the reason.
fn encode_text_reads(reads: &[VaultTextRead]) -> Result<Vec<u8>, String> {
    let capacity = reads.iter().fold(FRAME_LENGTH_BYTES, |total, read| {
        let outcome_bytes = match &read.outcome {
            Ok((text, _)) => FRAME_MTIME_BYTES + FRAME_LENGTH_BYTES + text.len(),
            Err(error) => FRAME_LENGTH_BYTES + error.len(),
        };
        total.saturating_add(1 + FRAME_LENGTH_BYTES + read.relative_path.len() + outcome_bytes)
    });
    let mut frames = Vec::with_capacity(capacity);
    frames.extend_from_slice(&frame_length(reads.len())?.to_le_bytes());
    for read in reads {
        match &read.outcome {
            Ok((text, last_modified)) => {
                frames.push(FRAME_TEXT);
                push_framed(&mut frames, read.relative_path.as_bytes())?;
                frames.extend_from_slice(&(*last_modified as f64).to_le_bytes());
                push_framed(&mut frames, text.as_bytes())?;
            }
            Err(error) => {
                frames.push(FRAME_ERROR);
                push_framed(&mut frames, read.relative_path.as_bytes())?;
                push_framed(&mut frames, error.as_bytes())?;
            }
        }
    }
    Ok(frames)
}

fn frame_length(length: usize) -> Result<u32, String> {
    u32::try_from(length).map_err(|_| "a framed field is longer than 4 GiB".to_string())
}

fn push_framed(frames: &mut Vec<u8>, bytes: &[u8]) -> Result<(), String> {
    frames.extend_from_slice(&frame_length(bytes.len())?.to_le_bytes());
    frames.extend_from_slice(bytes);
    Ok(())
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
    Ok(lines.get(keep..).unwrap_or_default().join("\n"))
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
    use super::{
        encode_text_reads, VaultTextRead, FRAME_ERROR, FRAME_TEXT, VAULT_TEXT_BATCH_FILE_MAX_BYTES,
        VAULT_TEXT_BATCH_MAX,
    };
    use tauri::ipc::{InvokeResponseBody, IpcResponse};

    /// The shape `vault-text-frames.ts` decodes into, which is what the JSON answer used to be.
    #[derive(Debug, PartialEq, serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct DecodedRead {
        relative_path: String,
        text: Option<String>,
        last_modified: Option<f64>,
        error: Option<String>,
    }

    struct FrameCursor<'a> {
        rest: &'a [u8],
    }

    impl<'a> FrameCursor<'a> {
        fn take(&mut self, length: usize) -> Result<&'a [u8], String> {
            let (head, rest) = self
                .rest
                .split_at_checked(length)
                .ok_or_else(|| format!("frames end {length} bytes short"))?;
            self.rest = rest;
            Ok(head)
        }

        fn array<const N: usize>(&mut self) -> Result<[u8; N], String> {
            self.take(N)?
                .try_into()
                .map_err(|_| "frames are misaligned".to_string())
        }

        fn length(&mut self) -> Result<usize, String> {
            usize::try_from(u32::from_le_bytes(self.array()?)).map_err(|err| err.to_string())
        }

        fn text(&mut self) -> Result<String, String> {
            let length = self.length()?;
            String::from_utf8(self.take(length)?.to_vec()).map_err(|err| err.to_string())
        }
    }

    fn decode_text_reads(frames: &[u8]) -> Result<Vec<DecodedRead>, String> {
        let mut cursor = FrameCursor { rest: frames };
        let count = cursor.length()?;
        let mut reads = Vec::new();
        for _ in 0..count {
            let [kind] = cursor.array()?;
            let relative_path = cursor.text()?;
            reads.push(match kind {
                FRAME_TEXT => {
                    let last_modified = f64::from_le_bytes(cursor.array()?);
                    DecodedRead {
                        relative_path,
                        last_modified: Some(last_modified),
                        text: Some(cursor.text()?),
                        error: None,
                    }
                }
                FRAME_ERROR => DecodedRead {
                    relative_path,
                    text: None,
                    last_modified: None,
                    error: Some(cursor.text()?),
                },
                other => return Err(format!("unknown frame kind {other}")),
            });
        }
        if !cursor.rest.is_empty() {
            return Err(format!("{} bytes follow the last frame", cursor.rest.len()));
        }
        Ok(reads)
    }

    fn read_vault_text_files(
        root_path: String,
        relative_paths: Vec<String>,
    ) -> Result<Vec<DecodedRead>, String> {
        let response = super::read_vault_text_files(root_path, relative_paths)?;
        match response.body().map_err(|err| err.to_string())? {
            InvokeResponseBody::Raw(frames) => decode_text_reads(&frames),
            InvokeResponseBody::Json(json) => Err(format!("the batch answered JSON: {json}")),
        }
    }

    fn shared_fixture() -> (Vec<DecodedRead>, Vec<u8>) {
        #[derive(serde::Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct Fixture {
            reads: Vec<DecodedRead>,
            frames_hex: String,
        }
        let fixture: Fixture = serde_json::from_str(include_str!(
            "../../../tests/fixtures/vault-text-frames.json"
        ))
        .unwrap();
        let frames = (0..fixture.frames_hex.len())
            .step_by(2)
            .map(|at| u8::from_str_radix(&fixture.frames_hex[at..at + 2], 16).unwrap())
            .collect();
        (fixture.reads, frames)
    }

    fn as_vault_text_read(read: &DecodedRead) -> VaultTextRead {
        VaultTextRead {
            relative_path: read.relative_path.clone(),
            outcome: match (&read.text, read.last_modified, &read.error) {
                (Some(text), Some(last_modified), None) => {
                    Ok((text.clone(), last_modified as u128))
                }
                (None, None, Some(error)) => Err(error.clone()),
                _ => panic!("{} is neither a text nor an error", read.relative_path),
            },
        }
    }

    #[test]
    fn the_rust_framing_is_the_bytes_the_typescript_decoder_is_pinned_to() {
        let (reads, frames) = shared_fixture();
        let sources: Vec<VaultTextRead> = reads.iter().map(as_vault_text_read).collect();
        assert_eq!(encode_text_reads(&sources).unwrap(), frames);
        assert_eq!(decode_text_reads(&frames).unwrap(), reads);
    }

    #[test]
    fn frames_round_trip_large_multibyte_empty_and_error_reads() {
        let large = "가나다 frontmatter\n".repeat(200_000);
        let sources = vec![
            VaultTextRead {
                relative_path: "문서/큰.md".into(),
                outcome: Ok((large.clone(), 1_763_600_000_123)),
            },
            VaultTextRead {
                relative_path: "empty.md".into(),
                outcome: Ok((String::new(), 0)),
            },
            VaultTextRead {
                relative_path: "gone.md".into(),
                outcome: Err("No such file or directory (os error 2)".into()),
            },
        ];
        let decoded = decode_text_reads(&encode_text_reads(&sources).unwrap()).unwrap();
        assert_eq!(decoded.len(), 3);
        assert_eq!(decoded[0].text.as_deref(), Some(large.as_str()));
        assert_eq!(decoded[0].last_modified, Some(1_763_600_000_123.0));
        assert_eq!(decoded[1].text.as_deref(), Some(""));
        assert_eq!(
            decoded[2].error.as_deref(),
            Some("No such file or directory (os error 2)")
        );
        assert!(decoded[2].text.is_none() && decoded[2].last_modified.is_none());
    }

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
        let scope = crate::vault::grants::EnforcedScope::granting(&[granted]);
        let err = read_vault_text_files(root, vec!["project.md".into()]).unwrap_err();
        assert!(err.contains("not-granted"), "{err}");
        drop(scope);
        let _ = std::fs::remove_dir_all(&base);
    }
}
