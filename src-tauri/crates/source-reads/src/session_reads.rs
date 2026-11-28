//! The source lines this server served through `sourceReads`, each file with the line ranges and
//! symbols read. Outlines are not reads. The depth check asks this record, not a node's wording,
//! which lines were read.
//!
//! Over stdio one server process serves one client connection and the transport carries no session
//! id, so the process is the session: a restarted server has no record and says so. Files are
//! keyed by their real absolute path, so a read made with `rootPath` at a package folder counts for
//! the repository it sits in, and the path the server cited under that folder still names the
//! file. Each range keeps a hash of the lines it served; a range whose lines changed since no
//! longer counts.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use confined_files::{sha256_hex, DiskSource, SourceFiles, SourceRoot};

use crate::source_row::{ContextRole, SourceEvidence, SourceRow};

const FILE_LIMIT: usize = 20_000;
const RANGES_PER_FILE: usize = 256;
const HASHED_BYTES: usize = 2 * 1024 * 1024;

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
    sha256: String,
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

fn lines_of(root: &SourceRoot, absolute: &Path) -> Option<Vec<String>> {
    let disk = DiskSource::new(root, HASHED_BYTES);
    let text = disk.read_text(absolute).ok()?;
    Some(text.split_inclusive('\n').map(str::to_string).collect())
}

fn hash_lines(lines: &[String], start_line: usize, end_line: usize) -> String {
    let joined: String = lines
        .iter()
        .skip(start_line.saturating_sub(1))
        .take((end_line + 1).saturating_sub(start_line))
        .map(String::as_str)
        .collect();
    sha256_hex(joined.as_bytes())
}

fn below(root: &Path, absolute: &Path) -> Option<String> {
    let relative = absolute.strip_prefix(root).ok()?;
    let parts: Vec<String> = relative
        .components()
        .map(|part| part.as_os_str().to_string_lossy().into_owned())
        .collect();
    (!parts.is_empty()).then(|| parts.join("/"))
}

impl SessionReads {
    pub fn new() -> Self {
        Self::default()
    }

    /// Records every delivered line range, symbol read and context part of `evidence`.
    pub fn record(&self, root: &SourceRoot, evidence: &SourceEvidence) {
        let mut texts: HashMap<PathBuf, Option<Vec<String>>> = HashMap::new();
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
                    sha256: String::new(),
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
                        sha256: String::new(),
                    },
                ));
            }
        }
        let Ok(mut files) = self.files.lock() else {
            return;
        };
        for (path, mut range) in additions {
            if path.is_empty() || path.starts_with('/') || path.split('/').any(|part| part == "..")
            {
                continue;
            }
            let absolute = path
                .split('/')
                .fold(root.as_path().to_path_buf(), |joined, part| {
                    joined.join(part)
                });
            let lines = texts
                .entry(absolute.clone())
                .or_insert_with(|| lines_of(root, &absolute));
            let Some(lines) = lines else { continue };
            range.sha256 = hash_lines(lines, range.start_line, range.end_line);
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
    /// forgotten.
    pub fn reads_under(&self, root: &SourceRoot) -> ReadsUnder {
        let mut under = ReadsUnder::default();
        let Ok(mut files) = self.files.lock() else {
            return under;
        };
        let inside: Vec<PathBuf> = files
            .entries
            .keys()
            .filter(|absolute| below(root.as_path(), absolute).is_some())
            .cloned()
            .collect();
        for absolute in inside {
            let Some(relative) = below(root.as_path(), &absolute) else {
                continue;
            };
            let lines = lines_of(root, &absolute);
            let Some(entry) = files.entries.get_mut(&absolute) else {
                continue;
            };
            entry.ranges = match &lines {
                Some(lines) => entry
                    .ranges
                    .iter()
                    .filter(|range| {
                        hash_lines(lines, range.start_line, range.end_line) == range.sha256
                    })
                    .cloned()
                    .collect(),
                None => Vec::new(),
            };
            if entry.ranges.is_empty() {
                files.entries.remove(&absolute);
                files.order.retain(|held| *held != absolute);
                continue;
            }
            let ranges = entry.ranges.clone();
            let roots = entry.roots.clone();
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
