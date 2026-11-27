//! The staleness reads against a real repository: how many paths one walk dates, and how much one
//! call reads. The rules over a parsed history are unit tests in `src/path_dating.rs`.

#![allow(
    clippy::disallowed_methods,
    clippy::indexing_slicing,
    reason = "these tests plant the files a repository holds and read results by position"
)]

mod support;

use confined_files::ReadBudget;
use hardened_git::{RepoPath, Repository};
use source_scan::{
    date_paths, read_evidence_pairs, Dating, EvidenceFiles, EvidenceRequest, WantedPath,
    DATING_WINDOW_COMMITS, MAX_DATED_PATHS,
};
use support::{commit_all, write, Scratch};

/// Stands in for a working tree with nothing in it, so only the committed side is measured.
struct NothingOnDisk;

impl EvidenceFiles for NothingOnDisk {
    fn refuses(&self, _path: &RepoPath) -> bool {
        false
    }

    fn working_text(&self, _path: &RepoPath, _budget: &mut ReadBudget) -> Option<String> {
        None
    }
}

#[test]
fn one_walk_dates_the_most_paths_it_will_ask_about_however_long_their_names_are() {
    let scratch = Scratch::new("long-names");
    let repo = scratch.repository("repo");
    // A command line holding these would pass 32,767 characters, the Windows limit.
    let names: Vec<String> = (0..=MAX_DATED_PATHS)
        .map(|number| format!("folder-{number:04}/{}-{number:04}.md", "n".repeat(110)))
        .collect();
    for name in &names {
        write(&repo, name, "text\n");
    }
    let commit = commit_all(&repo, "everything");
    assert!(names.iter().map(String::len).sum::<usize>() > 32_767);

    let wanted: Vec<WantedPath> = names
        .iter()
        .map(|name| WantedPath {
            key: name.clone(),
            resolved: RepoPath::new(name).expect("a path"),
            dating: Dating::NewestCommit,
        })
        .collect();
    let dated = date_paths(&Repository::at(&repo), &wanted, DATING_WINDOW_COMMITS).expect("dated");

    assert_eq!(dated.len(), MAX_DATED_PATHS + 1);
    assert!(
        dated[..MAX_DATED_PATHS].iter().all(|date| date
            .as_ref()
            .is_some_and(|date| date.commit.as_str() == commit)),
        "every path inside the cap is dated"
    );
    assert_eq!(
        dated[MAX_DATED_PATHS], None,
        "the path past the cap is not asked about, though it exists"
    );
}

#[test]
fn pairs_stop_being_read_when_the_call_has_read_all_it_is_allowed_to() {
    let scratch = Scratch::new("pair-budget");
    let repo = scratch.repository("repo");
    let size = 900_000;
    let fits = ReadBudget::evidence().left / size;
    let files = fits + 3;
    for number in 0..files {
        // Each file differs from the others, so no two share one blob read.
        write(
            &repo,
            &format!("file-{number:03}.txt"),
            &format!("{number:03}{}\n", "a".repeat(size - 4)),
        );
    }
    let commit = commit_all(&repo, "big files");

    let names: Vec<String> = (0..files)
        .map(|number| format!("file-{number:03}.txt"))
        .collect();
    let requests: Vec<EvidenceRequest<'_>> = names
        .iter()
        .map(|name| EvidenceRequest {
            path: name,
            commit: &commit,
        })
        .collect();
    let readings = read_evidence_pairs(
        &Repository::at(&repo),
        &RepoPath::root(),
        &NothingOnDisk,
        &requests,
    );

    let read: Vec<bool> = readings.iter().map(|pair| pair.before.is_some()).collect();
    assert_eq!(
        read.iter().filter(|read| **read).count(),
        fits,
        "as many as the budget holds"
    );
    assert!(
        read[..fits].iter().all(|read| *read) && read[fits..].iter().all(|read| !read),
        "the earlier requests are the ones read: {read:?}"
    );
}
