//! The source lines this server served through `sourceReads`, each file with the line ranges and
//! symbols read. Outlines are not reads. The depth check asks this record, not a node's wording,
//! which lines were read.
//!
//! Over stdio one server process serves one client connection and the transport carries no session
//! id, so the process is the session: a restarted server has no record and says so. Files are
//! keyed by their real absolute path, so a read made with `rootPath` at a package folder counts for
//! the repository it sits in, and the path the server cited under that folder still names the
//! file.
//!
//! A range is recorded from the text that was served (its hash) and the stamp of the file version
//! it came from, both taken when the file was read, so the record never describes bytes the agent
//! did not see. A range counts while the file's stamp is the one it was served from; when the stamp
//! has moved the file is read again, outside the lock, and the range counts only if its lines still
//! hash the same.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, PoisonError};

use confined_files::{sha256_hex, FileStamp, PlainParts, SourceRoot};

use crate::opened_file::MAX_FILE_BYTES;
use crate::source_lines::{complete_lines, decode_source};
use crate::source_row::{ContextRole, ServedVersion, SourceEvidence, SourceRow};

const FILE_LIMIT: usize = 20_000;
const RANGES_PER_FILE: usize = 256;

/// A range of lines this session served, with what served it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReadRange {
    pub start_line: usize,
    pub end_line: usize,
    /// The symbol whose read served the range.
    pub symbol: Option<String>,
    /// The read that served it, `path:L1-L9`, when a symbol read did.
    pub read: Option<String>,
    /// A context part's role, when the range came as context.
    pub role: Option<ContextRole>,
    pub by_name: bool,
    served: ServedVersion,
}

struct FileEntry {
    ranges: Vec<ReadRange>,
    roots: Vec<PathBuf>,
}

#[derive(Default)]
struct Files {
    entries: HashMap<PathBuf, FileEntry>,
    /// Oldest first.
    order: Vec<PathBuf>,
}

/// The reads of one session. Held by the server; every call that serves source lines records here.
#[derive(Default)]
pub struct SessionReads {
    files: Mutex<Files>,
}

/// Repository-relative `/` path to the ranges read inside a root whose lines are unchanged, and
/// the file a path cited below a sub-root names.
#[derive(Debug, Default)]
pub struct ReadsUnder {
    pub reads: HashMap<String, Vec<ReadRange>>,
    pub cited: HashMap<String, String>,
}

impl ReadsUnder {
    /// The repository path a cited path names: itself, or the file a sub-root read cited that way.
    pub fn read_path<'a>(&'a self, path: &'a str) -> &'a str {
        self.cited.get(path).map_or(path, String::as_str)
    }
}

fn below(root: &Path, absolute: &Path) -> Option<String> {
    let relative = absolute.strip_prefix(root).ok()?;
    let parts: Vec<String> = relative
        .components()
        .map(|part| part.as_os_str().to_string_lossy().into_owned())
        .collect();
    (!parts.is_empty()).then(|| parts.join("/"))
}

/// The lines of `lines` from `start_line` to `end_line`, joined as a read serves them.
fn hash_of_lines(lines: &[String], start_line: usize, end_line: usize) -> String {
    let joined: String = lines
        .iter()
        .skip(start_line.saturating_sub(1))
        .take((end_line + 1).saturating_sub(start_line))
        .map(String::as_str)
        .collect();
    sha256_hex(joined.as_bytes())
}

/// What the file is now, read once for every range of it that needs a look.
struct CurrentFile {
    stamp: FileStamp,
    lines: Vec<String>,
}

fn read_current(root: &SourceRoot, relative: &str) -> Option<CurrentFile> {
    let parts: Vec<&str> = relative.split('/').collect();
    let file = root
        .read_repository_file(&PlainParts::new(&parts).ok()?, MAX_FILE_BYTES)
        .ok()?;
    let text = decode_source(&file.bytes)?;
    Some(CurrentFile {
        stamp: file.stamp,
        lines: complete_lines(text),
    })
}

/// What looking at one file's ranges found: the ranges that no longer count, and the ranges whose
/// stamp moved but whose lines read the same, with the stamp they now stand on.
#[derive(Default)]
struct Judged {
    gone: Vec<ReadRange>,
    refreshed: Vec<(ReadRange, FileStamp)>,
}

fn judge(root: &SourceRoot, relative: &str, ranges: &[ReadRange]) -> Judged {
    let parts: Vec<&str> = relative.split('/').collect();
    let stamp = root.repository_file_stamp(&parts);
    let mut judged = Judged::default();
    let mut current: Option<Option<CurrentFile>> = None;
    for range in ranges {
        if stamp == Some(range.served.file_stamp) && range.served.file_settled {
            continue;
        }
        let file = current.get_or_insert_with(|| read_current(root, relative));
        match file {
            Some(file)
                if hash_of_lines(&file.lines, range.start_line, range.end_line)
                    == range.served.text_sha256 =>
            {
                judged.refreshed.push((range.clone(), file.stamp));
            }
            _ => judged.gone.push(range.clone()),
        }
    }
    judged
}

fn locked(files: &Mutex<Files>) -> MutexGuard<'_, Files> {
    files.lock().unwrap_or_else(PoisonError::into_inner)
}

impl SessionReads {
    pub fn new() -> Self {
        Self::default()
    }

    /// Records every delivered line range, symbol read and context part of `evidence`. Nothing is
    /// read from the disk: each range carries the version it was served from.
    pub fn record(&self, root: &SourceRoot, evidence: &SourceEvidence) {
        let mut additions: Vec<(String, ReadRange)> = Vec::new();
        for row in &evidence.rows {
            let SourceRow::Read(read) = row else { continue };
            let served = format!("{}:L{}-L{}", read.path, read.start_line, read.end_line);
            let read_tag = read.symbol.as_ref().map(|_| served.clone());
            additions.push((
                read.path.clone(),
                ReadRange {
                    start_line: read.start_line,
                    end_line: read.end_line,
                    symbol: read.symbol.clone(),
                    read: read_tag.clone(),
                    role: None,
                    by_name: false,
                    served: read.served.clone(),
                },
            ));
            for part in &read.context {
                additions.push((
                    part.path.clone(),
                    ReadRange {
                        start_line: part.start_line,
                        end_line: part.end_line,
                        symbol: Some(part.symbol.clone()),
                        read: read_tag.clone(),
                        role: Some(part.role),
                        by_name: part.by_name,
                        served: part.served.clone(),
                    },
                ));
            }
        }
        let mut files = locked(&self.files);
        for (path, range) in additions {
            if path.is_empty() || path.starts_with('/') || path.split('/').any(|part| part == "..")
            {
                continue;
            }
            let absolute = path
                .split('/')
                .fold(root.as_path().to_path_buf(), |joined, part| {
                    joined.join(part)
                });
            let mut entry = files.entries.remove(&absolute).unwrap_or(FileEntry {
                ranges: Vec::new(),
                roots: Vec::new(),
            });
            files.order.retain(|held| *held != absolute);
            if !entry.roots.iter().any(|held| held == root.as_path()) {
                entry.roots.push(root.as_path().to_path_buf());
            }
            if entry.ranges.len() < RANGES_PER_FILE {
                entry.ranges.push(range);
            }
            files.entries.insert(absolute.clone(), entry);
            files.order.push(absolute);
            if files.entries.len() > FILE_LIMIT {
                if let Some(oldest) = files.order.first().cloned() {
                    files.order.remove(0);
                    files.entries.remove(&oldest);
                }
            }
        }
    }

    /// The ranges served inside `root` whose lines are unchanged; a file with none left is
    /// forgotten. The files are looked at without the lock held, so a call that records is never
    /// kept waiting for the disk.
    pub fn reads_under(&self, root: &SourceRoot) -> ReadsUnder {
        let held: Vec<(PathBuf, String, Vec<ReadRange>, Vec<PathBuf>)> = {
            let files = locked(&self.files);
            files
                .entries
                .iter()
                .filter_map(|(absolute, entry)| {
                    let relative = below(root.as_path(), absolute)?;
                    Some((
                        absolute.clone(),
                        relative,
                        entry.ranges.clone(),
                        entry.roots.clone(),
                    ))
                })
                .collect()
        };
        let judgements: Vec<Judged> = held
            .iter()
            .map(|(_, relative, ranges, _)| judge(root, relative, ranges))
            .collect();
        let mut kept: Vec<(String, Vec<ReadRange>, PathBuf, Vec<PathBuf>)> = Vec::new();
        {
            let mut files = locked(&self.files);
            for ((absolute, relative, ranges, roots), judged) in held.into_iter().zip(judgements) {
                let Some(entry) = files.entries.get_mut(&absolute) else {
                    continue;
                };
                entry.ranges.retain(|range| !judged.gone.contains(range));
                for (before, stamp) in &judged.refreshed {
                    if let Some(range) = entry.ranges.iter_mut().find(|range| *range == before) {
                        range.served.file_stamp = *stamp;
                    }
                }
                if entry.ranges.is_empty() {
                    files.entries.remove(&absolute);
                    files.order.retain(|held| *held != absolute);
                    continue;
                }
                let counted: Vec<ReadRange> = ranges
                    .into_iter()
                    .filter(|range| !judged.gone.contains(range))
                    .collect();
                kept.push((relative, counted, absolute, roots));
            }
        }
        let mut under = ReadsUnder::default();
        for (relative, ranges, absolute, roots) in kept {
            for read_root in roots {
                if read_root.as_path() == root.as_path() {
                    continue;
                }
                if let Some(alias) = below(&read_root, &absolute) {
                    under.cited.entry(alias).or_insert_with(|| relative.clone());
                }
            }
            under.reads.insert(relative, ranges);
        }
        let cited: Vec<(String, String)> = under
            .cited
            .iter()
            .map(|(alias, path)| (alias.clone(), path.clone()))
            .collect();
        for (alias, path) in cited {
            if under.reads.contains_key(&alias) {
                under.cited.remove(&alias);
            } else if let Some(ranges) = under.reads.get(&path).cloned() {
                under.reads.insert(alias, ranges);
            }
        }
        under
    }
}
