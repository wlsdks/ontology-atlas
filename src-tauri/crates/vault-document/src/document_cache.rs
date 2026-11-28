//! What was read of each file of a vault, kept between calls so the next call pays for the files
//! that changed and the one look at each name that proves the others did not.
//!
//! An entry is trusted when the file's stamp (device, inode, size, modification and change times)
//! is the one it was read at, and the file was already older than [`RACY_WINDOW_NANOSECONDS`] when
//! it was read. A file written within that window of being read can be written again inside the
//! clock's grain with no stamp changing, so it is read again on every call until it has aged out of
//! the window. The cache holds frontmatter, issues and link targets, not text.
//!
//! The entries are kept in the order of the listing, so the next call, whose listing is the same
//! unless a file came or went, pairs each name with its entry by position and looks nothing up.

use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::{SystemTime, UNIX_EPOCH};

use confined_files::{ConfinedPath, FileSnapshot, FileStamp, StableReadError, VaultRoot};

use crate::loaded_document::{FileReadError, LoadedDocument};
use crate::reader_threads::{read_on_reader_threads, Reading};

/// A file this recently written or changed, when it was read, is not trusted yet.
const RACY_WINDOW_NANOSECONDS: i128 = 2_000_000_000;

struct Entry {
    stamp: FileStamp,
    /// Whether the file was older than the racy window when read.
    settled: bool,
    document: LoadedDocument,
}

impl Entry {
    fn copy(&self) -> Self {
        Self {
            stamp: self.stamp,
            settled: self.settled,
            document: self.document.clone(),
        }
    }
}

/// The documents read so far, one entry per file of the last listing, in its order.
#[derive(Default)]
pub struct DocumentCache {
    entries: Mutex<Vec<Entry>>,
    reads: AtomicUsize,
    parses: AtomicUsize,
}

/// How much work the cache has done, since it was made.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CacheCounts {
    /// Files whose bytes were read from the disk.
    pub reads: usize,
    /// Files whose bytes were read as a document, which is the costlier half.
    pub parses: usize,
}

/// What one file came to on a call.
enum Outcome {
    /// Still the version that was kept.
    Kept(LoadedDocument),
    /// Read again.
    Read(Entry),
    /// Nothing regular is there any more.
    Gone,
    Failed(FileReadError),
}

fn now_nanoseconds() -> i128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |elapsed| i128::try_from(elapsed.as_nanos()).unwrap_or(0))
}

/// The kept document of a file whose stamp is the one a settled entry was read at.
fn kept(
    cached: Option<&Entry>,
    looked_at: &Result<Option<FileStamp>, StableReadError>,
) -> Option<LoadedDocument> {
    cached
        .filter(|entry| entry.settled)
        .filter(|entry| matches!(looked_at, Ok(Some(stamp)) if *stamp == entry.stamp))
        .map(|entry| entry.document.clone())
}

impl DocumentCache {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn counts(&self) -> CacheCounts {
        CacheCounts {
            reads: self.reads.load(Ordering::Relaxed),
            parses: self.parses.load(Ordering::Relaxed),
        }
    }

    fn lock(&self) -> MutexGuard<'_, Vec<Entry>> {
        // A call that panicked left plain data behind; the next call checks every entry anyway.
        self.entries.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// The document of every listed file, in the order given: kept where the file is as it was,
    /// read where it is not. A file that is gone since the listing is left out; one that cannot be
    /// read fails the whole call, as a vault read that skipped it could tell a rename that nothing
    /// links to a file it could not see.
    pub(crate) fn documents_of(
        &self,
        root: &VaultRoot,
        files: &[ConfinedPath],
    ) -> Result<Vec<LoadedDocument>, FileReadError> {
        let mut entries = self.lock();
        // The entry of each listed file: by position when the listing is the one the entries were
        // made from, by path when a file came or went.
        let same_listing = entries.len() == files.len()
            && entries.iter().zip(files).all(|(entry, file)| {
                entry.document.file().as_path().as_os_str() == file.as_path().as_os_str()
            });
        let by_path: HashMap<&Path, &Entry> = if same_listing {
            HashMap::new()
        } else {
            entries
                .iter()
                .map(|entry| (entry.document.file().as_path(), entry))
                .collect()
        };
        let cached_for = |position: usize, file: &ConfinedPath| -> Option<&Entry> {
            if same_listing {
                entries.get(position)
            } else {
                by_path.get(file.as_path()).copied()
            }
        };
        // One look at every name, a folder's files together, on this thread: on three threads the
        // looks of a repeat call cost 60 to 100 ms more CPU on the scale gate and left the process
        // 4 MB larger after each call (`reader_threads` says why). A settled file whose stamp
        // holds is kept, the rest are read. A kept document is one word per file; only the files
        // read hold a whole outcome.
        let stamps = ConfinedPath::stamps(files);
        let mut kept_documents: Vec<Option<LoadedDocument>> = Vec::with_capacity(files.len());
        let mut unsettled: Vec<(&ConfinedPath, Option<&Entry>)> = Vec::new();
        for (position, (file, stamp)) in files.iter().zip(stamps).enumerate() {
            let cached = cached_for(position, file);
            let document = kept(cached, &stamp);
            if document.is_none() {
                unsettled.push((file, cached));
            }
            kept_documents.push(document);
        }
        let mut read = read_on_reader_threads(
            &unsettled,
            |(file, _)| {
                self.reads.fetch_add(1, Ordering::Relaxed);
                let snapshot = file.read_snapshot();
                let bytes = snapshot
                    .as_ref()
                    .ok()
                    .and_then(Option::as_ref)
                    .map_or(0, |snapshot| snapshot.bytes.len());
                Reading {
                    value: snapshot,
                    bytes,
                }
            },
            |(file, cached), snapshot| self.outcome_of(root, file, *cached, snapshot),
        )
        .into_iter();
        // At the first change, the files before it, which were all kept, start the new entries.
        let keep_before = |position: usize, next: &mut Vec<Entry>| {
            next.reserve(files.len());
            for (earlier, earlier_file) in files.iter().take(position).enumerate() {
                next.extend(cached_for(earlier, earlier_file).map(Entry::copy));
            }
        };
        let mut documents = Vec::with_capacity(files.len());
        let mut changed = !same_listing;
        let mut next: Vec<Entry> = Vec::new();
        for (position, (file, kept_document)) in files.iter().zip(kept_documents).enumerate() {
            // The files read come back in the order they were listed, so each file not kept takes
            // the next outcome.
            let outcome = match kept_document {
                Some(document) => Outcome::Kept(document),
                None => read.next().unwrap_or(Outcome::Gone),
            };
            match outcome {
                Outcome::Kept(document) => {
                    if changed {
                        next.extend(cached_for(position, file).map(Entry::copy));
                    }
                    documents.push(document);
                }
                Outcome::Read(entry) => {
                    if !changed {
                        changed = true;
                        keep_before(position, &mut next);
                    }
                    documents.push(entry.document.clone());
                    next.push(entry);
                }
                Outcome::Gone => {
                    if !changed {
                        changed = true;
                        keep_before(position, &mut next);
                    }
                }
                Outcome::Failed(error) => return Err(error),
            }
        }
        if changed {
            *entries = next;
        }
        Ok(documents)
    }

    /// What a file that was read again comes to: gone, failed, the kept document when the bytes
    /// are the ones it was read from, or a new read of them.
    fn outcome_of(
        &self,
        root: &VaultRoot,
        file: &ConfinedPath,
        cached: Option<&Entry>,
        snapshot: Result<Option<FileSnapshot>, StableReadError>,
    ) -> Outcome {
        let slug = match cached {
            Some(entry) => entry.document.slug().to_string(),
            None => match root.slug_of(file) {
                Some(slug) => slug,
                None => return Outcome::Gone,
            },
        };
        let snapshot = match snapshot {
            Ok(Some(snapshot)) => snapshot,
            Ok(None) => return Outcome::Gone,
            Err(error) => return Outcome::Failed(FileReadError::of(&slug, error)),
        };
        let stamp = snapshot.stamp;
        let settled = !stamp.is_recent(now_nanoseconds(), RACY_WINDOW_NANOSECONDS);
        // A file written lately and not since has the same bytes it had: keep what was read of them.
        if let Some(entry) = cached
            .filter(|entry| entry.stamp == stamp && entry.document.was_read_from(&snapshot.bytes))
        {
            return Outcome::Read(Entry {
                stamp,
                settled,
                document: entry.document.clone(),
            });
        }
        self.parses.fetch_add(1, Ordering::Relaxed);
        Outcome::Read(Entry {
            stamp,
            settled,
            document: LoadedDocument::of(file, slug, snapshot, false),
        })
    }
}
