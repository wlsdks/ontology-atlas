//! Reading a batch of files on every core.
//!
//! Parsing is what a scan spends its time on, and it depends on the text alone, so the texts of a
//! batch are parsed by a few threads and the readings come back in the order the files were given:
//! placement, which does depend on the repository, stays one sequence and the answer is the same
//! as reading one file after another.

use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;

use crate::file_reading::{read_file, FileReading};
use crate::import_edges::UnresolvedReason;
use crate::source_language::SourceLanguage;

/// The most threads one scan uses: parsing is memory-bound beyond a handful of cores.
const MAX_THREADS: usize = 8;

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

/// The reading of every file, in the order of `files`.
pub fn read_batch(files: &[PendingFile]) -> Vec<FileReading> {
    let threads = std::thread::available_parallelism()
        .map_or(1, usize::from)
        .min(MAX_THREADS)
        .min(files.len());
    if threads <= 1 {
        return files.iter().map(read_pending).collect();
    }
    let next = AtomicUsize::new(0);
    let finished: Mutex<Vec<(usize, FileReading)>> = Mutex::new(Vec::with_capacity(files.len()));
    std::thread::scope(|scope| {
        for _ in 0..threads {
            scope.spawn(|| {
                let mut mine = Vec::new();
                loop {
                    let at = next.fetch_add(1, Ordering::Relaxed);
                    let Some(file) = files.get(at) else { break };
                    mine.push((at, read_pending(file)));
                }
                if let Ok(mut all) = finished.lock() {
                    all.extend(mine);
                }
            });
        }
    });
    let mut readings = finished.into_inner().unwrap_or_default();
    readings.sort_by_key(|(at, _)| *at);
    readings.into_iter().map(|(_, reading)| reading).collect()
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
    fn readings_come_back_in_the_order_the_files_were_given() {
        let files: Vec<PendingFile> = (0..64)
            .map(|index| pending(&format!("f{index}.ts"), &format!("import './dep{index}';")))
            .collect();
        let readings = read_batch(&files);
        assert_eq!(readings.len(), files.len());
        for (index, reading) in readings.iter().enumerate() {
            let FileReading::Script(imports) = reading else {
                panic!("file {index} was not read as a script");
            };
            assert_eq!(imports.len(), 1);
            assert_eq!(imports[0].specifier, format!("./dep{index}"));
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
        assert!(matches!(readings.get(1), Some(FileReading::Unreadable(UnresolvedReason::FileTooLarge))));
        assert!(matches!(readings.get(2), Some(FileReading::Script(_))));
    }
}
