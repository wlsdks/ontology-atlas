//! How the analysis looks at a repository: every question is about a `/`-separated path below the
//! root, answered by `confined-files`, so a link that leaves the root, a hidden name and a
//! credential-named file never reach a read.

use std::path::PathBuf;

use answer_format::utf16;
use confined_files::{EntryKind, Refusal, SourceFiles, SourceReadError};
use serde::Serialize;

/// What a path is, as the analysis tells apart.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Probe {
    Missing,
    /// A link or a path whose real place is outside the repository root.
    OutsideRoot,
    File,
    Folder,
    Other,
}

/// Why a file's text was not read.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReadFailure {
    Missing,
    OutsideRoot,
    TooLarge,
    Unreadable,
}

pub struct RepositoryFiles<'a> {
    files: &'a (dyn SourceFiles + Sync),
    /// The root as the answer names it.
    label: String,
}

impl<'a> RepositoryFiles<'a> {
    pub fn new(files: &'a (dyn SourceFiles + Sync), label: &str) -> Self {
        Self {
            files,
            label: label.to_string(),
        }
    }

    pub fn label(&self) -> &str {
        &self.label
    }

    /// The files themselves, for a reader that asks its own questions of them.
    pub fn source(&self) -> &dyn SourceFiles {
        self.files
    }

    fn absolute(&self, relative: &str) -> PathBuf {
        relative
            .split('/')
            .filter(|part| !part.is_empty() && *part != ".")
            .fold(self.files.root().to_path_buf(), |path, part| path.join(part))
    }

    /// The path as the script server wrote it into a row: the root joined with the relative path.
    pub fn display(&self, relative: &str) -> String {
        let parts: Vec<&str> = relative
            .split('/')
            .filter(|part| !part.is_empty() && *part != ".")
            .collect();
        if parts.is_empty() {
            return self.label.clone();
        }
        format!("{}/{}", self.label.trim_end_matches('/'), parts.join("/"))
    }

    pub fn probe(&self, relative: &str) -> Probe {
        match self.files.kind(&self.absolute(relative)) {
            Ok(None) => Probe::Missing,
            Ok(Some(EntryKind::File)) => Probe::File,
            Ok(Some(EntryKind::Directory)) => Probe::Folder,
            Ok(Some(_)) => Probe::Other,
            Err(SourceReadError::Refused(Refusal::OutsideApprovedRoot)) => Probe::OutsideRoot,
            Err(_) => Probe::Missing,
        }
    }

    pub fn is_file(&self, relative: &str) -> bool {
        self.probe(relative) == Probe::File
    }

    pub fn is_folder(&self, relative: &str) -> bool {
        self.probe(relative) == Probe::Folder
    }

    /// Whether the path leaves the root; a path that is not there does not.
    pub fn leaves_root(&self, relative: &str) -> bool {
        self.probe(relative) == Probe::OutsideRoot
    }

    /// The names in a folder in UTF-16 order, each with what it is. Hidden and credential names
    /// are not listed.
    pub fn entries(&self, relative: &str) -> Vec<(String, Probe)> {
        let Ok(listing) = self.files.list_directory(&self.absolute(relative)) else {
            return Vec::new();
        };
        let mut names: Vec<String> = listing.entries.into_iter().map(|entry| entry.name).collect();
        utf16::sort(&mut names);
        names
            .into_iter()
            .map(|name| {
                let probe = self.probe(&join(relative, &name));
                (name, probe)
            })
            .collect()
    }

    pub fn names(&self, relative: &str) -> Vec<String> {
        self.entries(relative)
            .into_iter()
            .map(|(name, _)| name)
            .collect()
    }

    pub fn text(&self, relative: &str) -> Result<String, ReadFailure> {
        match self.files.read_text(&self.absolute(relative)) {
            Ok(text) => Ok(text.into_owned()),
            Err(SourceReadError::Absent) => Err(ReadFailure::Missing),
            Err(SourceReadError::Refused(Refusal::OutsideApprovedRoot)) => {
                Err(ReadFailure::OutsideRoot)
            }
            Err(SourceReadError::Refused(Refusal::FileOverSizeLimit)) => Err(ReadFailure::TooLarge),
            Err(SourceReadError::Refused(_)) => Err(ReadFailure::Unreadable),
        }
    }

    /// The first `max_bytes` bytes of the text of a file, cut at a character.
    pub fn head(&self, relative: &str, max_bytes: usize) -> Result<String, ReadFailure> {
        let text = self.text(relative)?;
        Ok(cut_at_boundary(&text, max_bytes).to_string())
    }

    /// The name among `names` that is `requested`, exactly or, when only one differs in case,
    /// that one.
    pub fn exact_case_entry<'n>(names: &'n [String], requested: &str) -> Option<&'n str> {
        if let Some(found) = names.iter().find(|name| name.as_str() == requested) {
            return Some(found);
        }
        let folded = requested.to_lowercase();
        let mut matches = names.iter().filter(|name| name.to_lowercase() == folded);
        match (matches.next(), matches.next()) {
            (Some(only), None) => Some(only),
            _ => None,
        }
    }

    /// The path as the disk spells it when each part matches an existing entry exactly or by case
    /// alone, and it names a file.
    pub fn existing_source_case(&self, source: &str) -> Option<String> {
        if source.is_empty() || source.starts_with('/') {
            return None;
        }
        let segments: Vec<&str> = source.split('/').collect();
        if segments
            .iter()
            .any(|segment| segment.is_empty() || *segment == "." || *segment == "..")
        {
            return None;
        }
        let mut cursor = String::new();
        let mut resolved = Vec::new();
        for segment in segments {
            let names = self.names(&cursor);
            let selected = Self::exact_case_entry(&names, segment)?.to_string();
            cursor = join(&cursor, &selected);
            resolved.push(selected);
        }
        self.is_file(&cursor).then(|| resolved.join("/"))
    }
}

/// `parent` and `name` as one `/` path; the root is the empty path.
pub fn join(parent: &str, name: &str) -> String {
    if parent.is_empty() || parent == "." {
        name.to_string()
    } else {
        format!("{parent}/{name}")
    }
}

/// The part of a `/` path after its last `/`.
pub fn file_name(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

/// The part of a `/` path before its last `/`; empty for a name in the root.
pub fn parent_of(path: &str) -> &str {
    path.rsplit_once('/').map_or("", |(parent, _)| parent)
}

pub fn cut_at_boundary(text: &str, max_bytes: usize) -> &str {
    if text.len() <= max_bytes {
        return text;
    }
    let mut end = max_bytes;
    while end > 0 && !text.is_char_boundary(end) {
        end -= 1;
    }
    text.get(..end).unwrap_or_default()
}

/// A row of what the analysis left unread and why.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Skipped {
    pub path: String,
    pub reason: String,
}

#[derive(Debug, Default)]
pub struct SkipLog {
    rows: Vec<Skipped>,
}

impl SkipLog {
    pub fn push(&mut self, path: impl Into<String>, reason: impl Into<String>) {
        self.rows.push(Skipped {
            path: path.into(),
            reason: reason.into(),
        });
    }

    /// Adds the row unless the same path and reason are already there.
    pub fn push_once(&mut self, path: impl Into<String>, reason: impl Into<String>) {
        let row = Skipped {
            path: path.into(),
            reason: reason.into(),
        };
        if !self.rows.contains(&row) {
            self.rows.push(row);
        }
    }

    pub fn contains(&self, check: impl Fn(&Skipped) -> bool) -> bool {
        self.rows.iter().any(check)
    }

    pub fn into_rows(self) -> Vec<Skipped> {
        self.rows
    }
}
