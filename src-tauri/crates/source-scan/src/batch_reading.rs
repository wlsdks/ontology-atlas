//! Reading a batch of files on every core.
//!
//! Parsing is what a scan spends its time on, and it depends on the text alone, so the texts of a
//! batch are parsed on a pool of threads and the readings come back in the order the files were given:
//! placement, which does depend on the repository, stays one sequence and the answer is the same
//! as reading one file after another.

use std::path::PathBuf;
use std::sync::OnceLock;

use rayon::prelude::*;
use rayon::{ThreadPool, ThreadPoolBuilder};

use crate::file_reading::{read_file, FileReading};
use crate::import_edges::UnresolvedReason;
use crate::source_language::SourceLanguage;

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

/// The reading of every file, in the order of `files`: a parallel iterator collects in the order
/// of its source, whichever thread finishes first. Without a pool (the system refused the
/// threads) the files are read one after another.
pub fn read_batch(files: &[PendingFile]) -> Vec<FileReading> {
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
