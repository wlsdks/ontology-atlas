// HTTPS from Hugging Face hosts only, each hop's host checked before it is asked
// anything; a `.part` file resumes, and only a file matching its pinned size and
// SHA-256 is renamed into place. A run's start line precedes its first request, and
// a run left without its close line is closed before anything else happens.

use super::super::audit::{self, Download, RunEnd};
use super::super::EmbedError;
use super::fetch::{Fetch, Head, Sink};
use super::pins::{self, PinnedFile};
use super::{Progress, Stage, DOWNLOAD_SOURCE};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Instant;

/// Hugging Face serves `resolve` from huggingface.co and redirects large files to
/// its CDN and storage hosts under hf.co.
pub(crate) const ALLOWED_DOMAINS: [&str; 2] = ["huggingface.co", "hf.co"];
const MAX_HOPS: usize = 8;
const HASH_CHUNK: usize = 1024 * 1024;
/// Names the run whose start line is written and whose close line is not yet.
pub(crate) const OPEN_RUN: &str = "open-run.json";

#[derive(Debug, Serialize, Deserialize)]
struct OpenRun {
    run: String,
    hosts: Vec<String>,
}

/// What one download run did, for the consent dialog; the close line says the same.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(crate) struct DownloadReport {
    /// Every host asked, in order, each once.
    pub hosts: Vec<String>,
    pub bytes_received: u64,
}

pub(crate) fn host_allowed(host: &str) -> bool {
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    ALLOWED_DOMAINS
        .iter()
        .any(|domain| host == *domain || host.ends_with(&format!(".{domain}")))
}

/// Accepts an absolute or root-relative Location only when it stays on HTTPS, on
/// an allowed host, on the default port, with no user info.
pub(crate) fn checked_url(location: &str, base: Option<&url::Url>) -> Result<url::Url, EmbedError> {
    let parsed = match base {
        Some(base) => base.join(location),
        None => url::Url::parse(location),
    }
    .map_err(|_| EmbedError::HostRefused("unparsable".into()))?;
    let host = parsed.host_str().unwrap_or_default().to_string();
    if parsed.scheme() != "https"
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.port().is_some()
        || !matches!(parsed.host(), Some(url::Host::Domain(_)))
        || !host_allowed(&host)
    {
        return Err(EmbedError::HostRefused(short_host(&parsed)));
    }
    Ok(parsed)
}

fn short_host(url: &url::Url) -> String {
    let text = match url.host_str() {
        Some(host) => format!("{}://{host}", url.scheme()),
        None => url.scheme().to_string(),
    };
    text.chars()
        .filter(|ch| !ch.is_control())
        .take(120)
        .collect()
}

fn io_error(error: std::io::Error) -> EmbedError {
    EmbedError::Store(crate::errors::squeeze(&error.to_string()))
}

pub(crate) fn part_path(dir: &Path, file: &PinnedFile) -> PathBuf {
    dir.join(format!("{}.part", file.name))
}

/// Hashes a file's first `len` bytes, reporting each chunk.
fn hash_prefix(
    path: &Path,
    len: u64,
    cancel: &AtomicBool,
    on_bytes: &mut dyn FnMut(u64),
) -> Result<Sha256, EmbedError> {
    let mut hasher = Sha256::new();
    if len == 0 {
        return Ok(hasher);
    }
    let mut reader = File::open(path).map_err(io_error)?.take(len);
    let mut buffer = vec![0u8; HASH_CHUNK];
    loop {
        if cancel.load(Ordering::Relaxed) {
            return Err(EmbedError::Cancelled);
        }
        let read = reader.read(&mut buffer).map_err(io_error)?;
        let Some(chunk) = buffer.get(..read).filter(|chunk| !chunk.is_empty()) else {
            return Ok(hasher);
        };
        hasher.update(chunk);
        on_bytes(read as u64);
    }
}

/// The file at `path`, not a link, has the pinned size and SHA-256.
pub(crate) fn file_matches(
    path: &Path,
    file: &PinnedFile,
    cancel: &AtomicBool,
    on_bytes: &mut dyn FnMut(u64),
) -> Result<bool, EmbedError> {
    match fs::symlink_metadata(path) {
        Ok(meta) if meta.is_file() && meta.len() == file.bytes => {}
        _ => return Ok(false),
    }
    let digest = hash_prefix(path, file.bytes, cancel, on_bytes)?.finalize();
    Ok(super::super::hex(&digest) == file.sha256)
}

/// One file's transfer state, fed by the transport.
struct Transfer<'a> {
    file: &'a PinnedFile,
    out: File,
    hasher: Sha256,
    have: u64,
    received: u64,
    /// Set by a redirect: the next URL to ask.
    next: Option<String>,
    on_bytes: &'a mut dyn FnMut(u64),
}

impl Transfer<'_> {
    fn restart(&mut self) -> Result<(), EmbedError> {
        self.out.set_len(0).map_err(io_error)?;
        self.out.seek(SeekFrom::Start(0)).map_err(io_error)?;
        self.hasher = Sha256::new();
        self.have = 0;
        (self.on_bytes)(0);
        Ok(())
    }
}

impl Sink for Transfer<'_> {
    fn head(&mut self, head: &Head) -> Result<bool, EmbedError> {
        self.next = None;
        match head.status {
            301 | 302 | 303 | 307 | 308 => {
                let location = head
                    .location
                    .clone()
                    .ok_or(EmbedError::ResponseInvalid("location"))?;
                self.next = Some(location);
                Ok(false)
            }
            206 => {
                let range = head
                    .content_range
                    .ok_or(EmbedError::ResponseInvalid("content-range"))?;
                if range.start != self.have
                    || range.total != self.file.bytes
                    || range.end.checked_add(1) != Some(self.file.bytes)
                {
                    return Err(EmbedError::SizeMismatch(self.file.name.into()));
                }
                Ok(true)
            }
            200 => {
                if head
                    .content_length
                    .is_some_and(|length| length != self.file.bytes)
                {
                    return Err(EmbedError::SizeMismatch(self.file.name.into()));
                }
                // The server ignored the Range header and sends the whole file.
                if self.have > 0 {
                    self.restart()?;
                }
                Ok(true)
            }
            404 => Err(EmbedError::ModelMissing),
            status => Err(EmbedError::Http(status)),
        }
    }

    fn body(&mut self, chunk: &[u8]) -> Result<(), EmbedError> {
        let len = chunk.len() as u64;
        if self.have + len > self.file.bytes {
            return Err(EmbedError::SizeMismatch(self.file.name.into()));
        }
        self.out.write_all(chunk).map_err(io_error)?;
        self.hasher.update(chunk);
        self.have += len;
        self.received += len;
        (self.on_bytes)(self.have);
        Ok(())
    }
}

pub(crate) struct Downloader<'a> {
    pub fetch: &'a dyn Fetch,
    /// `pins::DOWNLOADS` outside tests.
    pub files: &'a [PinnedFile],
    pub dir: &'a Path,
    pub vault_dir: &'a Path,
    pub cancel: &'a AtomicBool,
    pub on_progress: &'a mut dyn FnMut(&Progress),
}

/// The audit run, opened lazily: a run with nothing to fetch writes no line.
struct Opened {
    run: String,
    started: Instant,
}

impl Downloader<'_> {
    /// Leaves every pinned file verified under `dir`, fetching what is missing. The
    /// report is filled in even when the run fails.
    pub(crate) fn run(&mut self, report: &mut DownloadReport) -> Result<(), EmbedError> {
        fs::create_dir_all(self.dir).map_err(io_error)?;
        self.close_unclosed_run()?;
        let total: u64 = self.files.iter().map(|file| file.bytes).sum();
        let mut opened: Option<Opened> = None;
        let mut done_before = 0u64;
        let mut outcome = Ok(());
        for file in self.files {
            if let Err(error) = self.one(file, done_before, total, report, &mut opened) {
                outcome = Err(error);
                break;
            }
            done_before += file.bytes;
        }
        let closed = match opened {
            Some(opened) => {
                let ended = match &outcome {
                    Ok(()) => RunEnd::Complete,
                    Err(EmbedError::Cancelled) => RunEnd::Stopped,
                    Err(_) => RunEnd::Failed,
                };
                audit::write_download_close_naming(
                    self.vault_dir,
                    &DOWNLOAD_SOURCE,
                    &download_line(
                        &opened.run,
                        self.files,
                        Some(report.bytes_received),
                        Some(ended),
                    ),
                    opened.started.elapsed().as_millis() as u64,
                    &report.hosts,
                )
                .and_then(|()| remove_if_present(&self.dir.join(OPEN_RUN)))
            }
            None => Ok(()),
        };
        outcome?;
        closed
    }

    /// A run that ended without its close line (a quit, a log that refused the line)
    /// is closed as failed first; until that line is written nothing is asked.
    fn close_unclosed_run(&self) -> Result<(), EmbedError> {
        let marker = self.dir.join(OPEN_RUN);
        remove_link(&marker)?;
        let Ok(text) = fs::read_to_string(&marker) else {
            return Ok(());
        };
        // An unreadable marker cannot name its run; nothing more can close it.
        if let Ok(open) = serde_json::from_str::<OpenRun>(&text) {
            audit::write_download_close_naming(
                self.vault_dir,
                &DOWNLOAD_SOURCE,
                &download_line(&open.run, self.files, None, Some(RunEnd::Failed)),
                0,
                &open.hosts,
            )?;
        }
        remove_if_present(&marker)
    }

    fn one(
        &mut self,
        file: &PinnedFile,
        done_before: u64,
        total: u64,
        report: &mut DownloadReport,
        opened: &mut Option<Opened>,
    ) -> Result<(), EmbedError> {
        let target = self.dir.join(file.name);
        let part = part_path(self.dir, file);
        remove_link(&target)?;
        remove_link(&part)?;
        let verify = |on_progress: &mut dyn FnMut(&Progress), checked: u64| {
            on_progress(&Progress {
                stage: Stage::Verify,
                done: done_before + checked.min(file.bytes),
                total,
            });
        };
        let mut checked = 0u64;
        let matches = file_matches(&target, file, self.cancel, &mut |bytes| {
            checked += bytes;
            verify(&mut *self.on_progress, checked);
        })?;
        if matches {
            return Ok(());
        }
        remove_if_present(&target)?;

        let mut have = fs::symlink_metadata(&part).map_or(0, |meta| meta.len());
        if have > file.bytes {
            remove_if_present(&part)?;
            have = 0;
        }
        let mut checked = 0u64;
        let hasher = hash_prefix(&part, have, self.cancel, &mut |bytes| {
            checked += bytes;
            verify(&mut *self.on_progress, checked);
        })?;
        let out = open_part(&part)?;
        let dir = self.dir;
        let on_progress = &mut *self.on_progress;
        let mut on_bytes = |have: u64| {
            on_progress(&Progress {
                stage: Stage::Download,
                done: done_before + have,
                total,
            });
        };
        let mut transfer = Transfer {
            file,
            out,
            hasher,
            have,
            received: 0,
            next: None,
            on_bytes: &mut on_bytes,
        };

        let mut url = checked_url(&pins::resolve_url(file), None)?;
        let mut hops = 0usize;
        let fetched = loop {
            if transfer.have == file.bytes {
                break Ok(());
            }
            let host = url.host_str().unwrap_or_default().to_ascii_lowercase();
            let new_host = !report.hosts.contains(&host);
            if new_host {
                report.hosts.push(host);
            }
            match opened.as_ref() {
                None => {
                    let run = uuid::Uuid::new_v4().to_string();
                    audit::write_download_start(
                        self.vault_dir,
                        &DOWNLOAD_SOURCE,
                        &download_line(&run, self.files, None, None),
                    )?;
                    mark_open(dir, &run, &report.hosts)?;
                    *opened = Some(Opened {
                        run,
                        started: Instant::now(),
                    });
                }
                Some(open) if new_host => mark_open(dir, &open.run, &report.hosts)?,
                Some(_) => {}
            }
            let got = self
                .fetch
                .get(url.as_str(), transfer.have, self.cancel, &mut transfer);
            report.bytes_received += std::mem::take(&mut transfer.received);
            if let Err(error) = got {
                break Err(error);
            }
            match transfer.next.take() {
                Some(location) => {
                    hops += 1;
                    if hops > MAX_HOPS {
                        break Err(EmbedError::ResponseInvalid("too-many-redirects"));
                    }
                    url = match checked_url(&location, Some(&url)) {
                        Ok(next) => next,
                        Err(error) => break Err(error),
                    };
                }
                // The body ended short; a later run resumes from here.
                None if transfer.have < file.bytes => {
                    break Err(EmbedError::Request("ended-early".into()))
                }
                None => break Ok(()),
            }
        };
        let Transfer {
            out, hasher, have, ..
        } = transfer;
        if let Err(error) = fetched {
            drop(out);
            if matches!(error, EmbedError::SizeMismatch(_)) {
                remove_if_present(&part)?;
            }
            return Err(error);
        }
        out.sync_all().map_err(io_error)?;
        drop(out);
        // The hash covers every byte in `.part`: the resumed prefix re-read from disk,
        // the rest hashed as written, then synced. Conversion reads the file again and
        // its result must match the reference vectors, so no third read is made.
        if have != file.bytes || super::super::hex(&hasher.finalize()) != file.sha256 {
            remove_if_present(&part)?;
            return Err(EmbedError::HashMismatch(file.name.into()));
        }
        fs::rename(&part, &target).map_err(io_error)
    }
}

fn download_line<'r>(
    run: &'r str,
    files: &[PinnedFile],
    bytes: Option<u64>,
    ended: Option<RunEnd>,
) -> Download<'r> {
    let urls: Vec<String> = files.iter().map(pins::resolve_url).collect();
    Download {
        run,
        model: pins::MODEL_NAME,
        source: "hugging-face",
        revision: Some(pins::REVISION.to_string()),
        bytes,
        ended,
        // The request carries only these URLs.
        payload_sha256: crate::llm_audit::sha256_hex(&urls.join("\n")),
    }
}

fn mark_open(dir: &Path, run: &str, hosts: &[String]) -> Result<(), EmbedError> {
    let text = serde_json::to_string(&OpenRun {
        run: run.to_string(),
        hosts: hosts.to_vec(),
    })
    .map_err(|error| EmbedError::Store(error.to_string()))?;
    write_synced(&dir.join(OPEN_RUN), text.as_bytes())
}

/// Opens `.part` for appending without following a link put in its place.
fn open_part(path: &Path) -> Result<File, EmbedError> {
    let mut options = OpenOptions::new();
    options.create(true).append(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW);
    }
    options.open(path).map_err(io_error)
}

/// Removes `path` when it is a link, so the next open makes a plain file there.
pub(crate) fn remove_link(path: &Path) -> Result<(), EmbedError> {
    match fs::symlink_metadata(path) {
        Ok(meta) if meta.file_type().is_symlink() => remove_if_present(path),
        _ => Ok(()),
    }
}

/// Writes a synced temporary sibling, then renames it over `path`.
pub(crate) fn write_synced(path: &Path, bytes: &[u8]) -> Result<(), EmbedError> {
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(".tmp");
    let temporary = path.with_file_name(name);
    remove_link(&temporary)?;
    let mut file = File::create(&temporary).map_err(io_error)?;
    file.write_all(bytes).map_err(io_error)?;
    file.sync_all().map_err(io_error)?;
    drop(file);
    fs::rename(&temporary, path).map_err(io_error)
}

pub(crate) fn remove_if_present(path: &Path) -> Result<(), EmbedError> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(io_error(error)),
    }
}
