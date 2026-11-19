//! Search by meaning's store: recovery, incremental updates, hostile answers and the caps, with a
//! deterministic stand-in for the embedding model.

#![allow(clippy::unwrap_used, clippy::indexing_slicing, clippy::panic)]

mod common;

use common::{Lcg, TempVault};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::convert::Infallible;
use std::process::{Command, Stdio};
use std::time::Instant;
use vault_index::vectors::{
    self, Model, PrepareError, PrepareProgress, Prepared, Refusal, Searcher,
};

const BENCH: &str = env!("CARGO_BIN_EXE_vault-index-bench");
const DIMS: usize = 64;

fn model() -> Model {
    Model {
        name: "fake-embedding".into(),
        dimensions: DIMS,
    }
}

/// The bench's stand-in: a pseudo-random vector seeded by the text's SHA-256.
fn fake(text: &str) -> Vec<f32> {
    let digest = Sha256::digest(text.as_bytes());
    let mut state = u64::from_le_bytes(digest[..8].try_into().unwrap()) | 1;
    (0..DIMS)
        .map(|_| {
            state ^= state << 13;
            state ^= state >> 7;
            state ^= state << 17;
            (state >> 40) as f32 / (1u64 << 23) as f32 - 1.0
        })
        .collect()
}

/// Plans and prepares every listed file, recording each passage text the model is asked for.
fn prepare_all(vault: &TempVault, asked: &mut Vec<String>) -> Prepared {
    let plan = vectors::plan(&vault.root, &model(), &vault.files()).unwrap();
    vectors::prepare(plan, &PrepareProgress::default(), |texts: &[&str]| {
        asked.extend(texts.iter().map(|text| text.to_string()));
        Ok::<_, Infallible>(texts.iter().map(|text| fake(text)).collect())
    })
    .unwrap()
}

fn nearest(vault: &TempVault, text: &str) -> vectors::Found {
    Searcher::open(&vault.root, &model())
        .unwrap()
        .expect("a store")
        .nearest(&fake(text), 8)
        .unwrap()
}

fn sha(text: &str) -> [u8; 32] {
    Sha256::digest(text.as_bytes()).into()
}

fn write(vault: &TempVault, path: &str, text: &str) {
    let path = vault.root.join(path);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, text).unwrap();
}

fn vectors_file(vault: &TempVault) -> std::path::PathBuf {
    vault_index::index_dir(&vault.root)
        .unwrap()
        .join("vectors.sqlite")
}

/// Every stored vector with its sign bits, and every file's passage hashes.
type Snapshot = (
    BTreeMap<Vec<u8>, (f64, Vec<u8>, Vec<u8>)>,
    BTreeSet<(String, Vec<u8>)>,
);

fn snapshot(vault: &TempVault) -> Snapshot {
    let conn = rusqlite::Connection::open(vectors_file(vault)).unwrap();
    let verdict: String = conn
        .query_row("PRAGMA quick_check", [], |row| row.get(0))
        .unwrap();
    assert_eq!(verdict, "ok");
    let mut statement = conn
        .prepare("SELECT v.sha256, v.scale, v.int8, s.bits FROM vectors AS v JOIN signs AS s ON s.id = v.id")
        .unwrap();
    let stored = statement
        .query_map([], |row| {
            Ok((row.get(0)?, (row.get(1)?, row.get(2)?, row.get(3)?)))
        })
        .unwrap()
        .collect::<Result<BTreeMap<_, _>, _>>()
        .unwrap();
    let mut statement = conn
        .prepare("SELECT f.path, p.sha256 FROM passages AS p JOIN files AS f ON f.id = p.file_id")
        .unwrap();
    let held = statement
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .unwrap()
        .collect::<Result<BTreeSet<_>, _>>()
        .unwrap();
    (stored, held)
}

fn row_counts(vault: &TempVault) -> (i64, i64) {
    let conn = rusqlite::Connection::open(vectors_file(vault)).unwrap();
    let count = |table: &str| -> i64 {
        conn.query_row(&format!("SELECT count(*) FROM {table}"), [], |row| {
            row.get(0)
        })
        .unwrap()
    };
    (count("vectors"), count("signs"))
}

/// Pages of four sections each, a third Korean, so a vault of `count` pages holds about
/// `4 * count` passages; half sit under `wiki/`.
fn write_sections(vault: &TempVault, count: usize, seed: u64) {
    let words = [
        "vault", "graph", "지도", "근거", "evidence", "검색", "meaning", "관계",
    ];
    let mut rng = Lcg::new(seed);
    for page in 0..count {
        let folder = if page % 2 == 0 { "wiki" } else { "notes" };
        let mut text = format!("---\ntitle: Page {page}\n---\n");
        for section in 0..4 {
            let body: Vec<&str> = (0..30 + rng.next() % 40)
                .map(|_| rng.pick(&words))
                .collect();
            text.push_str(&format!(
                "\n## Section {section} of {page}\n\n{}\n",
                body.join(" ")
            ));
        }
        write(vault, &format!("{folder}/page-{page}.md"), &text);
    }
}

fn bench(vault: &TempVault, log: &std::path::Path) -> Command {
    let mut command = Command::new(BENCH);
    command
        .args([
            "vectors-prepare",
            &vault.root.to_string_lossy(),
            &format!("--dims={DIMS}"),
            "--delay-ms=10",
            &format!("--log={}", log.display()),
        ])
        .env(
            vault_index::INDEX_DIR_OVERRIDE_ENV,
            std::env::var_os(vault_index::INDEX_DIR_OVERRIDE_ENV).unwrap(),
        )
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    command
}

fn asked_lines(log: &std::path::Path) -> Vec<String> {
    std::fs::read_to_string(log)
        .unwrap_or_default()
        .lines()
        .map(str::to_string)
        .collect()
}

#[test]
fn a_build_killed_mid_batch_twenty_times_equals_a_build_from_scratch() {
    let vault = TempVault::new("vectors-kill");
    write_sections(&vault, 300, 11);
    let scratch_log = vault.root.with_extension("scratch.log");
    let kill_log = vault.root.with_extension("kill.log");
    let _ = std::fs::remove_file(&scratch_log);
    let _ = std::fs::remove_file(&kill_log);

    let started = Instant::now();
    assert!(bench(&vault, &scratch_log).status().unwrap().success());
    let full_build = started.elapsed();
    let from_scratch = snapshot(&vault);
    let passages = from_scratch.0.len();
    assert_eq!(asked_lines(&scratch_log).len(), passages);
    let started = Instant::now();
    assert!(bench(&vault, &scratch_log).status().unwrap().success());
    let startup = started.elapsed();
    vault_index::delete(Some(&vault.root)).unwrap();

    // Each kill lands after start-up and within a fortieth of the embedding time, so twenty of
    // them stop the build part-way rather than let it finish.
    let embedding = full_build.saturating_sub(startup);
    let mut rng = Lcg::new(20_261_120);
    let mut killed_running = 0;
    for round in 0..20 {
        let mut child = bench(&vault, &kill_log).spawn().unwrap();
        let kill_after = startup + embedding.mul_f64((rng.next() % 1000) as f64 / 40_000.0);
        std::thread::sleep(kill_after);
        if child.try_wait().unwrap().is_none() {
            killed_running += 1;
        }
        let _ = child.kill();
        let _ = child.wait();
        if vectors_file(&vault).is_file() {
            let conn = rusqlite::Connection::open(vectors_file(&vault)).unwrap();
            let verdict: String = conn
                .query_row("PRAGMA quick_check", [], |row| row.get(0))
                .unwrap();
            assert_eq!(verdict, "ok", "round {round}, killed after {kill_after:?}");
            let (stored, signs) = row_counts(&vault);
            assert_eq!(stored, signs, "a vector and its signs land together");
        }
    }
    assert!(bench(&vault, &kill_log).status().unwrap().success());
    assert_eq!(snapshot(&vault), from_scratch);

    let asked = asked_lines(&kill_log);
    let distinct: BTreeSet<&String> = asked.iter().collect();
    assert_eq!(distinct.len(), passages);
    assert!(
        asked.len() - distinct.len() <= 20 * vectors::MAX_BATCH_PASSAGES,
        "{} passages asked twice: no more than the batch in flight at each kill",
        asked.len() - distinct.len()
    );
    assert!(bench(&vault, &kill_log).status().unwrap().success());
    assert_eq!(
        asked_lines(&kill_log).len(),
        asked.len(),
        "a finished build asks nothing"
    );
    eprintln!(
        "{killed_running} of 20 kills landed while the build ran ({full_build:?}); {} passages asked twice",
        asked.len() - distinct.len()
    );
    assert_eq!(
        killed_running, 20,
        "every kill landed before the build finished"
    );
    let _ = std::fs::remove_file(&scratch_log);
    let _ = std::fs::remove_file(&kill_log);
}

#[test]
fn an_edit_a_rename_and_a_delete_send_only_changed_passages() {
    let vault = TempVault::new("vectors-incremental");
    let a_old = "## Two\nThe old second section of a.";
    write(
        &vault,
        "a.md",
        &format!("# One\nFirst section of a.\n\n{a_old}\n\n## Three\nThird section of a.\n"),
    );
    write(
        &vault,
        "b.md",
        "# B\nOnly section of b.\n\n## More\nMore of b.\n",
    );
    write(
        &vault,
        "c.md",
        "# C\nOnly section of c.\n\n## More\nMore of c.\n",
    );
    let mut asked = Vec::new();
    prepare_all(&vault, &mut asked);
    assert_eq!(asked.len(), 7);

    let a_new = "## Two\nA rewritten second section of a.";
    write(
        &vault,
        "a.md",
        &format!("# One\nFirst section of a.\n\n{a_new}\n\n## Three\nThird section of a.\n"),
    );
    let before_update = nearest(&vault, a_old);
    assert_eq!(before_update.stale, 1, "the edited passage is dropped");
    assert!(before_update
        .hits
        .iter()
        .all(|hit| hit.sha256 != sha(a_old)));
    let kept = nearest(&vault, "# One\nFirst section of a.");
    assert_eq!(kept.hits[0].path, "a.md");
    assert_eq!((kept.hits[0].line_start, kept.hits[0].line_end), (1, 2));
    assert_eq!(kept.hits[0].heading.as_deref(), Some("One"));

    asked.clear();
    let plan = vectors::plan(&vault.root, &model(), &vault.files()).unwrap();
    assert_eq!(plan.remaining().passages, 1);
    drop(plan);
    prepare_all(&vault, &mut asked);
    assert_eq!(asked, vec![a_new.to_string()], "only the changed passage");

    std::fs::create_dir_all(vault.root.join("moved")).unwrap();
    std::fs::rename(vault.root.join("b.md"), vault.root.join("moved/b2.md")).unwrap();
    asked.clear();
    let prepared = prepare_all(&vault, &mut asked);
    assert!(asked.is_empty(), "a rename sends nothing");
    assert_eq!(prepared.passages, 0);
    let moved = nearest(&vault, "# B\nOnly section of b.");
    assert_eq!(moved.hits[0].path, "moved/b2.md");
    assert!(moved.hits.iter().all(|hit| hit.path != "b.md"));

    std::fs::remove_file(vault.root.join("c.md")).unwrap();
    asked.clear();
    prepare_all(&vault, &mut asked);
    assert!(asked.is_empty(), "a delete sends nothing");
    let status = vectors::status(&vault.root, &model()).unwrap().unwrap();
    assert_eq!(
        (
            status.files,
            status.files_ready,
            status.passages,
            status.passages_stored
        ),
        (2, 2, 5, 5)
    );
    assert_eq!(row_counts(&vault), (5, 5), "vectors no file holds are gone");
    assert!(nearest(&vault, "# C\nOnly section of c.")
        .hits
        .iter()
        .all(|hit| hit.path != "c.md"));
}

/// What a hostile or broken model answers for a batch.
type Answer = Box<dyn Fn(&[&str]) -> Vec<Vec<f32>>>;

#[test]
fn hostile_vectors_are_refused_and_nothing_from_the_batch_is_stored() {
    let vault = TempVault::new("vectors-hostile");
    write(&vault, "a.md", "# A\nalpha\n\n# B\nbeta\n\n# C\ngamma\n");
    let answers: Vec<(Answer, Refusal)> = vec![
        (
            Box::new(|texts: &[&str]| {
                let mut vectors: Vec<_> = texts.iter().map(|text| fake(text)).collect();
                vectors[2][5] = f32::NAN;
                vectors
            }),
            Refusal::NotFinite { index: 2 },
        ),
        (
            Box::new(|texts: &[&str]| {
                let mut vectors: Vec<_> = texts.iter().map(|text| fake(text)).collect();
                vectors[1][0] = f32::INFINITY;
                vectors
            }),
            Refusal::NotFinite { index: 1 },
        ),
        (
            Box::new(|texts: &[&str]| {
                let mut vectors: Vec<_> = texts.iter().map(|text| fake(text)).collect();
                vectors[1].push(0.5);
                vectors
            }),
            Refusal::WrongDimension {
                index: 1,
                expected: DIMS,
                got: DIMS + 1,
            },
        ),
        (
            Box::new(|texts: &[&str]| texts.iter().skip(1).map(|text| fake(text)).collect()),
            Refusal::WrongCount {
                expected: 3,
                got: 2,
            },
        ),
        (
            Box::new(|texts: &[&str]| {
                let mut vectors: Vec<_> = texts.iter().map(|text| fake(text)).collect();
                vectors[0] = vec![0.0; DIMS];
                vectors
            }),
            Refusal::Zero { index: 0 },
        ),
    ];
    for (answer, refusal) in answers {
        let plan = vectors::plan(&vault.root, &model(), &vault.files()).unwrap();
        let outcome = vectors::prepare(plan, &PrepareProgress::default(), |texts: &[&str]| {
            Ok::<_, Infallible>(answer(texts))
        });
        assert!(
            matches!(&outcome, Err(PrepareError::Refused(found)) if *found == refusal),
            "{outcome:?}"
        );
        let status = vectors::status(&vault.root, &model()).unwrap().unwrap();
        assert_eq!(status.passages_stored, 0, "{refusal}");
    }

    let mut asked = Vec::new();
    prepare_all(&vault, &mut asked);
    assert_eq!(asked.len(), 3);
    let mut searcher = Searcher::open(&vault.root, &model()).unwrap().unwrap();
    assert!(searcher.nearest(&[1.0; DIMS - 1], 8).is_err());
    assert!(searcher.nearest(&[f32::NAN; DIMS], 8).is_err());
}

#[test]
fn a_file_contributes_at_most_five_hundred_passages() {
    let vault = TempVault::new("vectors-cap");
    let long: String = (0..620).map(|i| format!("# H{i}\nbody {i}\n")).collect();
    write(&vault, "long.md", &long);
    write(&vault, "short.md", "# S\nshort\n");
    let plan = vectors::plan(&vault.root, &model(), &vault.files()).unwrap();
    assert_eq!(plan.remaining().passages, 501);
    drop(plan);
    let mut asked = Vec::new();
    prepare_all(&vault, &mut asked);
    assert_eq!(asked.len(), 501);
    assert!(!asked.iter().any(|text| text.contains("body 500")));
    let status = vectors::status(&vault.root, &model()).unwrap().unwrap();
    assert_eq!(
        (
            status.files,
            status.files_ready,
            status.files_capped,
            status.passages_stored,
            status.passages_not_prepared
        ),
        (2, 1, 1, 501, 120)
    );
}

#[test]
fn hangul_text_and_names_in_nfc_or_nfd_are_one_passage() {
    let vault = TempVault::new("vectors-hangul");
    let nfc = "# 지도\n한글 문서의 근거";
    let nfd = "# \u{110C}\u{1175}\u{1103}\u{1169}\n\u{1112}\u{1161}\u{11AB}\u{1100}\u{1173}\u{11AF} \u{1106}\u{116E}\u{11AB}\u{1109}\u{1165}\u{110B}\u{1174} \u{1100}\u{1173}\u{11AB}\u{1100}\u{1165}";
    write(&vault, "\u{1100}\u{1173}\u{11AB}\u{1100}\u{1165}.md", nfd);
    write(&vault, "문서.md", nfc);
    let mut asked = Vec::new();
    prepare_all(&vault, &mut asked);
    assert_eq!(asked, vec![nfc.to_string()], "one passage, sent as NFC");

    let listed: BTreeSet<String> = vault.files().into_iter().collect();
    let found = nearest(&vault, nfc);
    let paths: BTreeSet<String> = found.hits.into_iter().map(|hit| hit.path).collect();
    assert_eq!(paths, listed, "both files, by the names the walk listed");
}

#[test]
fn a_stopped_build_resumes_wiki_first_without_asking_twice() {
    let vault = TempVault::new("vectors-stop");
    write_sections(&vault, 30, 5);
    let plan = vectors::plan(&vault.root, &model(), &vault.files()).unwrap();
    let total = plan.remaining().passages as usize;
    let wiki = plan
        .files()
        .iter()
        .take_while(|path| path.starts_with("wiki/"))
        .count();
    assert_eq!(wiki, 15, "every wiki page before any other file");
    let progress = PrepareProgress::default();
    let mut asked: Vec<String> = Vec::new();
    let outcome = vectors::prepare(plan, &progress, |texts: &[&str]| {
        asked.extend(texts.iter().map(|text| text.to_string()));
        progress.request_stop();
        assert!(progress.reading().starts_with("wiki/"));
        Ok::<_, Infallible>(texts.iter().map(|text| fake(text)).collect())
    });
    assert!(matches!(outcome, Err(PrepareError::Stopped)), "{outcome:?}");
    assert_eq!(progress.passages_done(), asked.len() as u64);
    assert_eq!(asked.len(), vectors::MAX_BATCH_PASSAGES);
    let first_batch = asked.clone();

    let resumed = prepare_all(&vault, &mut asked);
    assert_eq!(resumed.passages as usize, total - first_batch.len());
    let distinct: BTreeSet<&String> = asked.iter().collect();
    assert_eq!((asked.len(), distinct.len()), (total, total));
    let status = vectors::status(&vault.root, &model()).unwrap().unwrap();
    assert_eq!((status.files, status.files_ready), (30, 30));
}

#[test]
fn a_search_reads_beside_a_running_build() {
    let vault = TempVault::new("vectors-beside");
    write_sections(&vault, 20, 9);
    let plan = vectors::plan(&vault.root, &model(), &vault.files()).unwrap();
    let mut first: Option<String> = None;
    let mut seen_beside = false;
    vectors::prepare(plan, &PrepareProgress::default(), |texts: &[&str]| {
        match &first {
            None => first = Some(texts[0].to_string()),
            Some(text) if !seen_beside => {
                let found = nearest(&vault, text);
                seen_beside = found
                    .hits
                    .first()
                    .is_some_and(|hit| hit.sha256 == sha(text));
                let status = vectors::status(&vault.root, &model()).unwrap().unwrap();
                assert_eq!(status.passages_stored, vectors::MAX_BATCH_PASSAGES as u64);
            }
            Some(_) => {}
        }
        Ok::<_, Infallible>(texts.iter().map(|text| fake(text)).collect())
    })
    .unwrap();
    assert!(
        seen_beside,
        "the first batch is searchable while the second is in flight"
    );
}

#[test]
fn another_model_or_dimension_starts_a_new_file() {
    let vault = TempVault::new("vectors-model");
    write(&vault, "a.md", "# A\nalpha\n\n# B\nbeta\n");
    let mut asked = Vec::new();
    prepare_all(&vault, &mut asked);
    let wider = Model {
        name: "fake-embedding".into(),
        dimensions: DIMS * 2,
    };
    assert!(Searcher::open(&vault.root, &wider).unwrap().is_none());
    assert!(vectors::status(&vault.root, &wider).unwrap().is_none());
    let plan = vectors::plan(&vault.root, &wider, &vault.files()).unwrap();
    assert_eq!(plan.remaining().passages, 2, "every passage again");
    assert!(vectors::status(&vault.root, &model()).unwrap().is_none());
    assert!(Searcher::open(&vault.root, &model()).unwrap().is_none());
}

#[test]
fn a_delete_stops_a_running_build_and_its_size_is_counted() {
    let vault = TempVault::new("vectors-delete");
    write_sections(&vault, 20, 3);
    let mut asked = Vec::new();
    let plan = vectors::plan(&vault.root, &model(), &vault.files()).unwrap();
    let mut batches = 0;
    let outcome = vectors::prepare(plan, &PrepareProgress::default(), |texts: &[&str]| {
        batches += 1;
        if batches == 2 {
            vectors::delete_vectors(&vault.root).unwrap();
        }
        asked.extend(texts.iter().map(|text| text.to_string()));
        Ok::<_, Infallible>(texts.iter().map(|text| fake(text)).collect())
    });
    assert!(matches!(outcome, Err(PrepareError::Deleted)), "{outcome:?}");
    assert!(
        !vectors_file(&vault).exists(),
        "nothing written after the delete"
    );
    assert_eq!(vectors::vectors_bytes(&vault.root).unwrap(), 0);

    prepare_all(&vault, &mut asked);
    let size = vectors::vectors_bytes(&vault.root).unwrap();
    assert!(size > 0);
    assert!(vault_index::stored_bytes(Some(&vault.root)).unwrap() >= size);
    assert!(
        vectors::status(&vault.root, &model())
            .unwrap()
            .unwrap()
            .bytes
            >= size,
        "the size row counts the file and its WAL files"
    );
    let mut searcher = Searcher::open(&vault.root, &model()).unwrap().unwrap();
    vault_index::delete(Some(&vault.root)).unwrap();
    assert!(
        !vectors_file(&vault).exists(),
        "Delete removes it with the index"
    );
    assert!(
        searcher.nearest(&fake("anything"), 8).is_err(),
        "an open search says so"
    );
}
