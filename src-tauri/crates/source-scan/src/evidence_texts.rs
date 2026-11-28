//! Each cited file as it was at a commit and as it is now, as text, so a caller can tell whether
//! only comments, imports or layout changed since a concept was written.
//!
//! One call answers at most [`MAX_EVIDENCE_PAIRS`] pairs and reads at most
//! [`MAX_EVIDENCE_READ_BYTES`] bytes across both sides; a side it cannot read is `None` and the
//! caller keeps that pair as moved. A name that is hidden or holds credentials is never read,
//! as asked and as the working file really resolves.

use std::collections::{HashMap, HashSet};

use confined_files::{
    evidence_text, names_hidden_or_credential_file, DiskSource, ReadBudget, MAX_EVIDENCE_TEXT_BYTES,
};
use hardened_git::{BlobAt, CommitId, RepoPath, Repository};

/// Pairs one call answers; the caller asks again for the rest.
pub const MAX_EVIDENCE_PAIRS: usize = 256;

/// The working-tree side of a reading, and any refusal of a name beyond the shared one.
pub trait EvidenceFiles {
    /// A name this reader refuses on top of hidden and credential names, as asked.
    fn refuses(&self, path: &RepoPath) -> bool;
    /// The file as evidence text, or `None` for anything the reader will not or cannot read.
    fn working_text(&self, path: &RepoPath, budget: &mut ReadBudget) -> Option<String>;
}

impl EvidenceFiles for DiskSource {
    fn refuses(&self, _path: &RepoPath) -> bool {
        false
    }

    fn working_text(&self, path: &RepoPath, budget: &mut ReadBudget) -> Option<String> {
        self.read_evidence_text(std::path::Path::new(path.as_str()), budget)
    }
}

/// A file named as a caller wrote it, and the commit to read it at.
#[derive(Debug, Clone, Copy)]
pub struct EvidenceRequest<'a> {
    pub path: &'a str,
    pub commit: &'a str,
}

/// One pair: the file at the commit, and in the working tree now.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct EvidenceReading {
    pub before: Option<String>,
    pub after: Option<String>,
}

/// A request whose path and commit are plain names a read may use.
struct Readable {
    working_path: RepoPath,
    committed: BlobAt,
}

fn readable(
    request: &EvidenceRequest<'_>,
    base: &RepoPath,
    files: &dyn EvidenceFiles,
) -> Option<Readable> {
    // The working file is asked for below the folder the files are rooted at, the committed one
    // below the top of the repository: they are the same file named from two places, so a folder
    // `base` that lies below the top is in the committed name only.
    let working_path = RepoPath::new(request.path)?;
    let committed_path = base.join(&working_path);
    if names_hidden_or_credential_file(committed_path.as_str()) || files.refuses(&working_path) {
        return None;
    }
    let commit = CommitId::new(request.commit)?;
    Some(Readable {
        committed: BlobAt {
            commit,
            path: committed_path,
        },
        working_path,
    })
}

/// Reads each request: all committed sides first, then each working file once, against one
/// budget in the order asked. `base` is the folder the cited paths are relative to. One
/// `cat-file --batch-check` and one `--batch` serve every committed side.
pub fn read_evidence_pairs(
    repository: &Repository,
    base: &RepoPath,
    files: &dyn EvidenceFiles,
    requests: &[EvidenceRequest<'_>],
) -> Vec<EvidenceReading> {
    let asked: Vec<Option<Readable>> = requests
        .iter()
        .take(MAX_EVIDENCE_PAIRS)
        .map(|request| readable(request, base, files))
        .collect();
    let mut budget = ReadBudget::evidence();
    let mut seen = HashSet::new();
    let unique_blobs: Vec<BlobAt> = asked
        .iter()
        .flatten()
        .filter(|item| seen.insert(item.committed.clone()))
        .map(|item| item.committed.clone())
        .collect();
    let committed = committed_texts(repository, &unique_blobs, &mut budget);
    let mut working: HashMap<&RepoPath, Option<String>> = HashMap::new();
    for item in asked.iter().flatten() {
        if !working.contains_key(&item.working_path) {
            let text = files.working_text(&item.working_path, &mut budget);
            working.insert(&item.working_path, text);
        }
    }
    asked
        .iter()
        .map(|item| match item {
            None => EvidenceReading::default(),
            Some(item) => EvidenceReading {
                before: committed.get(&item.committed).cloned().flatten(),
                after: working.get(&item.working_path).cloned().flatten(),
            },
        })
        .collect()
}

/// Each blob as text, or `None` when it is missing, over [`MAX_EVIDENCE_TEXT_BYTES`], over what
/// is left of the budget, binary or not UTF-8. A git that cannot answer leaves every side `None`.
fn committed_texts(
    repository: &Repository,
    blobs: &[BlobAt],
    budget: &mut ReadBudget,
) -> HashMap<BlobAt, Option<String>> {
    let sizes = repository.blob_sizes(blobs).unwrap_or_default();
    let mut to_read: Vec<BlobAt> = Vec::new();
    for (blob, size) in blobs.iter().zip(&sizes) {
        let Some(size) = size.and_then(|size| usize::try_from(size).ok()) else {
            continue;
        };
        if size > MAX_EVIDENCE_TEXT_BYTES || size > budget.left {
            continue;
        }
        budget.left -= size;
        to_read.push(blob.clone());
    }
    let contents = repository.blobs(&to_read).unwrap_or_default();
    to_read
        .into_iter()
        .zip(contents)
        .map(|(blob, bytes)| (blob, bytes.and_then(|bytes| evidence_text(&bytes))))
        .collect()
}
