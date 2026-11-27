//! Reading a batch of files on every core.
//!
//! Parsing is what a scan spends its time on, and it depends on the text alone, so the texts of a
//! batch are parsed on a pool of threads and the readings come back in the order the files were given:
//! placement, which does depend on the repository, stays one sequence and the answer is the same
//! as reading one file after another.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use rayon::prelude::*;
use rayon::{ThreadPool, ThreadPoolBuilder};

use confined_files::{Refusal, SourceFiles, SourceReadError};

use crate::file_reading::{read_file, FileReading};
use crate::go_imports::GO_FILE_MAX_BYTES;
use crate::import_edges::UnresolvedReason;
use crate::import_scan::SOURCE_FILE_MAX_BYTES;
use crate::path_facts::PathFacts;
use crate::source_language::{extension_of_file, SourceLanguage};

/// A batch of texts held for parsing at once ends at this many bytes or files.
const BATCH_MAX_BYTES: usize = 16 * 1024 * 1024;
const BATCH_MAX_FILES: usize = 512;

/// The threads one scan parses on: parsing is memory-bound beyond a handful of cores.
const READING_THREADS: usize = 8;

fn reading_pool() -> Option<&'static ThreadPool> {
    static POOL: OnceLock<Option<ThreadPool>> = OnceLock::new();
    POOL.get_or_init(|| {
        ThreadPoolBuilder::new()
            .num_threads(READING_THREADS)
            .thread_name(|index| format!("source-reading-{index}"))
            .build()
            .ok()
    })
    .as_ref()
}

/// One file waiting to be read: its text, or why it has none to read.
pub struct PendingFile {
    pub path: PathBuf,
    /// The path relative to the scan root, as the answer names it.
    pub from: String,
    pub language: SourceLanguage,
    pub max_bytes: usize,
    pub text: Result<String, UnresolvedReason>,
}

impl PendingFile {
    /// The bytes the batch holds for this file.
    pub fn weight(&self) -> usize {
        self.text.as_ref().map_or(0, String::len)
    }
}

/// The file's text, or why it has none to read; `None` for a file the scan does not read at all
/// (a name that is no source, a read that failed). Rust and Go files are read up to the Go limit:
/// a larger one is mostly generated tables.
pub fn pending_file(
    files: &dyn SourceFiles,
    facts: &PathFacts<'_>,
    file: &Path,
) -> Option<PendingFile> {
    let from = facts.relative(file)?;
    let language = SourceLanguage::of_extension(extension_of_file(file)?)?;
    let max_bytes = match language {
        SourceLanguage::Rust | SourceLanguage::Go => GO_FILE_MAX_BYTES,
        _ => SOURCE_FILE_MAX_BYTES,
    };
    let text = match files.read_text(file) {
        Ok(text) if text.len() <= max_bytes => Ok(text.into_owned()),
        Ok(_) | Err(SourceReadError::Refused(Refusal::FileOverSizeLimit)) => {
            Err(UnresolvedReason::FileTooLarge)
        }
        Err(_) => return None,
    };
    Some(PendingFile {
        path: file.to_path_buf(),
        from,
        language,
        max_bytes,
        text,
    })
}

/// What `read_in_batches` hands over for one listed file.
pub enum Batched<'a> {
    Read(&'a PendingFile, FileReading),
    /// The file has no text to give, and no reason the scan reports for it.
    Unreadable(&'a Path),
}

/// Reads `listed` in batches that fit in memory, each batch parsed together, and hands the files
/// over in the order listed, so the answer is that of reading one file at a time.
pub fn read_in_batches(
    files: &dyn SourceFiles,
    facts: &PathFacts<'_>,
    listed: &[PathBuf],
    mut each: impl FnMut(Batched<'_>),
) {
    let mut next_file = 0;
    while next_file < listed.len() {
        let mut batch: Vec<PendingFile> = Vec::new();
        let mut batch_bytes = 0;
        while let Some(file) = listed.get(next_file) {
            if batch_bytes >= BATCH_MAX_BYTES || batch.len() >= BATCH_MAX_FILES {
                break;
            }
            next_file += 1;
            let Some(pending) = pending_file(files, facts, file) else {
                each(Batched::Unreadable(file));
                continue;
            };
            batch_bytes += pending.weight();
            batch.push(pending);
        }
        let readings = read_batch(&batch);
        for (pending, reading) in batch.iter().zip(readings) {
            each(Batched::Read(pending, reading));
        }
    }
}

/// The reading of every file, in the order of `files`: a parallel iterator collects in the order
/// of its source, whichever thread finishes first. Without a pool (the system refused the
/// threads) the files are read one after another.
fn read_batch(files: &[PendingFile]) -> Vec<FileReading> {
    match reading_pool() {
        Some(pool) => pool.install(|| files.par_iter().map(read_pending).collect()),
        None => files.iter().map(read_pending).collect(),
    }
}

fn read_pending(file: &PendingFile) -> FileReading {
    match &file.text {
        Ok(text) => {
            let name = file.from.rsplit('/').next().unwrap_or(&file.from);
            read_file(file.language, name, text, file.max_bytes)
        }
        Err(reason) => FileReading::Unreadable(*reason),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pending(name: &str, text: &str) -> PendingFile {
        PendingFile {
            path: PathBuf::from(name),
            from: format!("src/{name}"),
            language: SourceLanguage::TypeScript,
            max_bytes: 1024,
            text: Ok(text.to_string()),
        }
    }

    #[test]
    fn a_file_without_text_keeps_its_place_and_its_reason() {
        let mut files = vec![pending("a.ts", "import './a';")];
        files.push(PendingFile {
            text: Err(UnresolvedReason::FileTooLarge),
            ..pending("b.ts", "")
        });
        files.push(pending("c.ts", "import './c';"));
        let readings = read_batch(&files);
        assert!(matches!(
            readings.get(1),
            Some(FileReading::Unreadable(UnresolvedReason::FileTooLarge))
        ));
        assert!(matches!(readings.get(2), Some(FileReading::Script(_))));
    }
}
