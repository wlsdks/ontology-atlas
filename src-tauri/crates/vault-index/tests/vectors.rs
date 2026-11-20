//! Search by meaning's store: recovery, incremental updates, the grace period, deletes, damage,
//! hostile answers and the caps, with a deterministic stand-in for the embedding model.

#![allow(clippy::unwrap_used, clippy::indexing_slicing, clippy::panic)]

mod common;

use common::{Lcg, TempVault};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::convert::Infallible;
use std::process::{Command, Stdio};
use vault_index::pause::{self, Point};
use vault_index::vectors::{
    self, Model, Plan, PrepareError, PrepareProgress, Prepared, Refusal, Searcher, MAX_HITS,
};
use vault_index::{sync, Check, Progress};

const BENCH: &str = env!("CARGO_BIN_EXE_vault-index-bench");
const DIMS: usize = 64;
const DAY_MS: i64 = 24 * 60 * 60 * 1000;
/// `vectors::UNHELD_GRACE` as the spec states it.
const GRACE_MS: i64 = 7 * DAY_MS;

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

fn plan_with(vault: &TempVault, model: &Model) -> Plan {
    vectors::plan(
        &vault.root,
        model,
        &vault.files(),
        &PrepareProgress::default(),
    )
    .unwrap()
}

fn plan(vault: &TempVault) -> Plan {
    plan_with(vault, &model())
}

/// Plans and prepares every listed file, recording each passage text the model is asked for.
fn prepare_all(vault: &TempVault, asked: &mut Vec<String>) -> Prepared {
    vectors::prepare(
        plan(vault),
        &PrepareProgress::default(),
        |texts: &[&str]| {
            asked.extend(texts.iter().map(|text| text.to_string()));
            Ok::<_, Infallible>(texts.iter().map(|text| fake(text)).collect())
        },
    )
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

/// The Delete contract, on whatever the platform left: nothing is stored, the size row reports
/// exactly the bytes on disk, and a file kept in place holds no vector, in its pages or its log.
fn assert_nothing_stored(vault: &TempVault) {
    assert!(vectors::status(&vault.root, &model()).unwrap().is_none());
    let path = vectors_file(vault);
    let named = |suffix: &str| std::path::PathBuf::from(format!("{}{suffix}", path.display()));
    let on_disk: u64 = ["", "-wal", "-shm", ".damaged"]
        .iter()
        .filter_map(|suffix| std::fs::metadata(named(suffix)).ok())
        .map(|meta| meta.len())
        .sum();
    assert_eq!(vectors::vectors_bytes(&vault.root).unwrap(), on_disk);
    assert!(
        !named(".damaged").exists(),
        "no damaged copy outlives a Delete"
    );
    if path.exists() {
        let wal = std::fs::metadata(named("-wal")).map_or(0, |meta| meta.len());
        assert_eq!(wal, 0, "the log was checkpointed away");
        let conn = rusqlite::Connection::open(&path).unwrap();
        let number = |sql: &str| -> i64 { conn.query_row(sql, [], |row| row.get(0)).unwrap() };
        assert_eq!(
            number("PRAGMA freelist_count"),
            0,
            "no vector left in freed pages"
        );
        for table in ["vectors", "signs", "passages", "files"] {
            assert_eq!(
                number(&format!("SELECT count(*) FROM {table}")),
                0,
                "{table}"
            );
        }
    }
}

/// Overwrites the first page of a table or index of `vectors.sqlite`, as a bad sector would.
fn corrupt_page_of(vault: &TempVault, name: &str) {
    use std::io::{Seek, SeekFrom, Write};
    let path = vectors_file(vault);
    let conn = rusqlite::Connection::open(&path).unwrap();
    conn.query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |_| Ok(()))
        .unwrap();
    let root: i64 = conn
        .query_row(
            "SELECT rootpage FROM sqlite_schema WHERE name = ?1",
            [name],
            |row| row.get(0),
        )
        .unwrap();
    let page: i64 = conn
        .query_row("PRAGMA page_size", [], |row| row.get(0))
        .unwrap();
    drop(conn);
    let mut file = std::fs::OpenOptions::new().write(true).open(&path).unwrap();
    file.seek(SeekFrom::Start(((root - 1) * page) as u64))
        .unwrap();
    file.write_all(&vec![0xAB; page as usize]).unwrap();
}

/// The unique index on `vectors.sha256`: what `pending` and `prepare`'s first write read, and no
/// earlier step of a plan with nothing changed.
const SHA_INDEX: &str = "sqlite_autoindex_vectors_1";

fn sql(vault: &TempVault, statement: &str) {
    let conn = rusqlite::Connection::open(vectors_file(vault)).unwrap();
    conn.execute_batch(statement).unwrap();
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

/// `sentence` repeated to at least 400 characters, so its section is a passage of its own.
fn long(sentence: &str) -> String {
    let mut text = sentence.to_string();
    while text.chars().count() < 400 {
        text.push(' ');
        text.push_str(sentence);
    }
    text
}

/// Pages of four sections of 400 to 700 characters each, half their words Korean, so a vault of
/// `count` pages holds `4 * count` passages; half sit under `wiki/`.
fn write_sections(vault: &TempVault, count: usize, seed: u64) {
    let words = [
        "vault", "graph", "지도", "근거", "evidence", "검색", "meaning", "관계",
    ];
    let mut rng = Lcg::new(seed);
    for page in 0..count {
        let folder = if page % 2 == 0 { "wiki" } else { "notes" };
        let mut text = format!("---\ntitle: Page {page}\n---\n");
        for section in 0..4 {
            let target = 400 + (rng.next() % 300) as usize;
            let mut body = String::new();
            while body.chars().count() < target {
                body.push_str(rng.pick(&words));
                body.push(' ');
            }
            text.push_str(&format!(
                "\n## Section {section} of {page}\n\n{}\n",
                body.trim_end()
            ));
        }
        write(vault, &format!("{folder}/page-{page}.md"), &text);
    }
}

fn bench(vault: &TempVault, log: &std::path::Path, abort_after: Option<usize>) -> Command {
    let mut command = Command::new(BENCH);
    command
        .args([
            "vectors-prepare",
            &vault.root.to_string_lossy(),
            &format!("--dims={DIMS}"),
            &format!("--log={}", log.display()),
        ])
        .args(abort_after.map(|batches| format!("--abort-after={batches}")))
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
fn a_build_aborted_twenty_times_after_stored_batches_equals_a_build_from_scratch() {
    let vault = TempVault::new("vectors-kill");
    write_sections(&vault, 600, 11);
    let scratch_log = vault.root.with_extension("scratch.log");
    let kill_log = vault.root.with_extension("kill.log");
    let _ = std::fs::remove_file(&scratch_log);
    let _ = std::fs::remove_file(&kill_log);

    assert!(bench(&vault, &scratch_log, None)
        .status()
        .unwrap()
        .success());
    let from_scratch = snapshot(&vault);
    let passages = from_scratch.0.len();
    assert_eq!(asked_lines(&scratch_log).len(), passages);
    vault_index::delete(Some(&vault.root)).unwrap();

    // Each round stores a seeded 1 to 3 batches, then aborts inside the next embedding call.
    let mut rng = Lcg::new(20_261_120);
    for round in 0..20 {
        let before = if vectors_file(&vault).is_file() {
            row_counts(&vault).0
        } else {
            0
        };
        let batches = 1 + (rng.next() % 3) as usize;
        let status = bench(&vault, &kill_log, Some(batches)).status().unwrap();
        assert!(!status.success(), "round {round} aborted mid-build");
        let conn = rusqlite::Connection::open(vectors_file(&vault)).unwrap();
        let verdict: String = conn
            .query_row("PRAGMA quick_check", [], |row| row.get(0))
            .unwrap();
        assert_eq!(verdict, "ok", "round {round}");
        drop(conn);
        let (stored, signs) = row_counts(&vault);
        assert_eq!(stored, signs, "a vector and its signs land together");
        assert!(
            stored > before,
            "round {round} stored {batches} batches before the abort"
        );
    }
    assert!(bench(&vault, &kill_log, None).status().unwrap().success());
    assert_eq!(snapshot(&vault), from_scratch);

    let asked = asked_lines(&kill_log);
    let distinct: BTreeSet<&String> = asked.iter().collect();
    assert_eq!(distinct.len(), passages);
    let twice = asked.len() - distinct.len();
    assert!(
        (20..=20 * vectors::MAX_BATCH_PASSAGES).contains(&twice),
        "{twice} passages asked twice: the batch in flight at each abort, no more"
    );
    assert!(bench(&vault, &kill_log, None).status().unwrap().success());
    assert_eq!(
        asked_lines(&kill_log).len(),
        asked.len(),
        "a finished build asks nothing"
    );
    let _ = std::fs::remove_file(&scratch_log);
    let _ = std::fs::remove_file(&kill_log);
}

#[test]
fn an_edit_a_rename_and_a_delete_send_only_changed_passages() {
    let vault = TempVault::new("vectors-incremental");
    let one = format!("# One\n{}", long("First section of a."));
    let three = format!("## Three\n{}", long("Third section of a."));
    let a_old = format!("## Two\n{}", long("The old second section of a."));
    write(&vault, "a.md", &format!("{one}\n\n{a_old}\n\n{three}\n"));
    let b_only = format!("# B\n{}", long("Only section of b."));
    let b_more = format!("## More\n{}", long("More of b."));
    write(&vault, "b.md", &format!("{b_only}\n\n{b_more}\n"));
    let c_only = format!("# C\n{}", long("Only section of c."));
    let c_more = format!("## More\n{}", long("More of c."));
    write(&vault, "c.md", &format!("{c_only}\n\n{c_more}\n"));
    let mut asked = Vec::new();
    prepare_all(&vault, &mut asked);
    assert_eq!(asked.len(), 7);

    let a_new = format!("## Two\n{}", long("A rewritten second section of a."));
    write(&vault, "a.md", &format!("{one}\n\n{a_new}\n\n{three}\n"));
    let before_update = nearest(&vault, &a_old);
    assert_eq!(before_update.stale, 1, "the edited passage is dropped");
    assert!(before_update
        .hits
        .iter()
        .all(|hit| hit.sha256 != sha(&a_old)));
    let kept = nearest(&vault, &one);
    assert_eq!(kept.hits[0].path, "a.md");
    assert_eq!((kept.hits[0].line_start, kept.hits[0].line_end), (1, 2));
    assert_eq!(kept.hits[0].heading.as_deref(), Some("One"));

    asked.clear();
    assert_eq!(plan(&vault).remaining().passages, 1);
    prepare_all(&vault, &mut asked);
    assert_eq!(asked, vec![a_new], "only the changed passage");

    std::fs::create_dir_all(vault.root.join("moved")).unwrap();
    std::fs::rename(vault.root.join("b.md"), vault.root.join("moved/b2.md")).unwrap();
    asked.clear();
    let prepared = prepare_all(&vault, &mut asked);
    assert!(asked.is_empty(), "a rename sends nothing");
    assert_eq!(prepared.passages, 0);
    let moved = nearest(&vault, &b_only);
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
        (2, 2, 5, 5),
        "status counts held passages"
    );
    assert_eq!(
        row_counts(&vault),
        (8, 8),
        "unheld vectors wait out their grace period"
    );
    assert!(nearest(&vault, &c_only)
        .hits
        .iter()
        .all(|hit| hit.path != "c.md"));
}

/// Moves every unheld vector's grace period `ms` further into the past.
fn age_unheld(vault: &TempVault, ms: i64) {
    sql(
        vault,
        &format!(
            "UPDATE vectors SET unheld_since_ms = unheld_since_ms - {ms} WHERE unheld_since_ms IS NOT NULL"
        ),
    );
}

fn unheld(vault: &TempVault) -> i64 {
    let conn = rusqlite::Connection::open(vectors_file(vault)).unwrap();
    conn.query_row(
        "SELECT count(*) FROM vectors WHERE unheld_since_ms IS NOT NULL",
        [],
        |row| row.get(0),
    )
    .unwrap()
}

#[test]
fn a_file_restored_within_the_grace_period_sends_nothing_and_one_past_it_is_swept() {
    let vault = TempVault::new("vectors-grace");
    write_sections(&vault, 4, 21);
    let mut asked = Vec::new();
    prepare_all(&vault, &mut asked);
    assert_eq!(asked.len(), 16);
    let page = vault.root.join("wiki/page-0.md");
    let text = std::fs::read_to_string(&page).unwrap();

    std::fs::remove_file(&page).unwrap();
    assert_eq!(plan(&vault).remaining().passages, 0);
    assert_eq!(
        unheld(&vault),
        4,
        "its four vectors start their grace period"
    );
    age_unheld(&vault, 6 * DAY_MS);
    std::fs::write(&page, &text).unwrap();
    asked.clear();
    prepare_all(&vault, &mut asked);
    assert!(asked.is_empty(), "restored within the period: nothing sent");
    assert_eq!(unheld(&vault), 0, "held again");

    let empty = vectors::plan(&vault.root, &model(), &[], &PrepareProgress::default()).unwrap();
    assert_eq!(empty.remaining().passages, 0);
    assert_eq!(unheld(&vault), 0, "an empty listing removes nothing");
    let status = vectors::status(&vault.root, &model()).unwrap().unwrap();
    assert_eq!((status.files, status.passages_stored), (4, 16));

    std::fs::remove_file(&page).unwrap();
    assert_eq!(plan(&vault).remaining().passages, 0);
    age_unheld(&vault, GRACE_MS - 60_000);
    assert_eq!(
        plan(&vault).remaining().passages,
        0,
        "nothing pending: the sweep still runs"
    );
    assert_eq!(
        row_counts(&vault),
        (16, 16),
        "a minute short of 7 days: kept"
    );
    age_unheld(&vault, 120_000);
    plan(&vault);
    assert_eq!(row_counts(&vault), (12, 12), "a minute past 7 days: swept");
}

/// What a hostile or broken model answers for a batch.
type Answer = Box<dyn Fn(&[&str]) -> Vec<Vec<f32>>>;

#[test]
fn hostile_vectors_are_refused_and_nothing_from_the_batch_is_stored() {
    let vault = TempVault::new("vectors-hostile");
    let sections = ["alpha", "beta", "gamma"]
        .map(|word| format!("# {word}\n{}", long(word)))
        .join("\n\n");
    write(&vault, "a.md", &sections);
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
        let outcome = vectors::prepare(
            plan(&vault),
            &PrepareProgress::default(),
            |texts: &[&str]| Ok::<_, Infallible>(answer(texts)),
        );
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
fn a_huge_limit_returns_at_most_sixty_four_hits() {
    let vault = TempVault::new("vectors-limit");
    write_sections(&vault, 20, 67);
    let mut asked = Vec::new();
    prepare_all(&vault, &mut asked);
    assert_eq!(asked.len(), 80);
    let mut searcher = Searcher::open(&vault.root, &model()).unwrap().unwrap();
    let found = searcher.nearest(&fake("vault"), 10_000).unwrap();
    assert_eq!(found.hits.len(), MAX_HITS);
    assert_eq!(searcher.nearest(&fake("vault"), 70).unwrap().hits.len(), 64);
}

#[test]
fn a_file_contributes_at_most_five_hundred_passages() {
    let vault = TempVault::new("vectors-cap");
    let many: String = (0..620)
        .map(|i| format!("# H{i}\n{}\n", long(&format!("body {i}."))))
        .collect();
    write(&vault, "long.md", &many);
    write(&vault, "short.md", "# S\nshort\n");
    assert_eq!(plan(&vault).remaining().passages, 501);
    let mut asked = Vec::new();
    prepare_all(&vault, &mut asked);
    assert_eq!(asked.len(), 501);
    assert!(!asked.iter().any(|text| text.contains("body 500.")));
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
    let plan_taken = plan(&vault);
    let total = plan_taken.remaining().passages as usize;
    let wiki = plan_taken
        .files()
        .iter()
        .take_while(|path| path.starts_with("wiki/"))
        .count();
    assert_eq!(wiki, 15, "every wiki page before any other file");
    let progress = PrepareProgress::default();
    let mut asked: Vec<String> = Vec::new();
    let outcome = vectors::prepare(plan_taken, &progress, |texts: &[&str]| {
        asked.extend(texts.iter().map(|text| text.to_string()));
        progress.request_stop();
        assert!(progress.reading().starts_with("wiki/"));
        Ok::<_, Infallible>(texts.iter().map(|text| fake(text)).collect())
    });
    assert!(matches!(outcome, Err(PrepareError::Stopped)), "{outcome:?}");
    assert_eq!(progress.passages_done(), asked.len() as u64);
    assert_eq!(asked.len(), vectors::MAX_BATCH_PASSAGES);
    let first_batch = asked.clone();
    assert!(
        !vectors::completed(&vault.root, &model()).unwrap(),
        "a stopped first build has not finished the store"
    );

    let resumed = prepare_all(&vault, &mut asked);
    assert_eq!(resumed.passages as usize, total - first_batch.len());
    let distinct: BTreeSet<&String> = asked.iter().collect();
    assert_eq!((asked.len(), distinct.len()), (total, total));
    let status = vectors::status(&vault.root, &model()).unwrap().unwrap();
    assert_eq!((status.files, status.files_ready), (30, 30));
    assert!(vectors::completed(&vault.root, &model()).unwrap());

    // A later edit stopped half way leaves the store finished once: the next pass is an update.
    write(
        &vault,
        "wiki/added.md",
        &long("A page written after the store was finished."),
    );
    let progress = PrepareProgress::default();
    progress.request_stop();
    let stopped = vectors::prepare(plan(&vault), &progress, |texts: &[&str]| {
        Ok::<_, Infallible>(texts.iter().map(|text| fake(text)).collect())
    });
    assert!(matches!(stopped, Err(PrepareError::Stopped)), "{stopped:?}");
    assert!(vectors::completed(&vault.root, &model()).unwrap());
    let other = Model {
        name: "another-model".into(),
        dimensions: DIMS,
    };
    assert!(!vectors::completed(&vault.root, &other).unwrap());
}

#[test]
fn a_stop_requested_before_plan_or_prepare_ends_the_run_at_once() {
    let vault = TempVault::new("vectors-stop-early");
    write_sections(&vault, 6, 13);
    let stopped = PrepareProgress::default();
    stopped.request_stop();
    let planned = vectors::plan(&vault.root, &model(), &vault.files(), &stopped);
    assert!(matches!(planned, Err(vault_index::Error::Cancelled)));

    let progress = PrepareProgress::default();
    let taken = vectors::plan(&vault.root, &model(), &vault.files(), &progress).unwrap();
    progress.request_stop();
    let mut asked = 0;
    let outcome = vectors::prepare(taken, &progress, |texts: &[&str]| {
        asked += texts.len();
        Ok::<_, Infallible>(texts.iter().map(|text| fake(text)).collect())
    });
    assert!(matches!(outcome, Err(PrepareError::Stopped)), "{outcome:?}");
    assert_eq!(asked, 0, "the stop is kept, not reset");
}

#[test]
fn a_search_reads_beside_a_running_build() {
    let vault = TempVault::new("vectors-beside");
    write_sections(&vault, 20, 9);
    let mut first: Option<String> = None;
    let mut seen_beside = false;
    vectors::prepare(
        plan(&vault),
        &PrepareProgress::default(),
        |texts: &[&str]| {
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
        },
    )
    .unwrap();
    assert!(
        seen_beside,
        "the first batch is searchable while the second is in flight"
    );
}

#[test]
fn one_searcher_follows_new_vectors_and_holds_only_those_files_hold() {
    let vault = TempVault::new("vectors-follow");
    write_sections(&vault, 10, 17);
    let mut asked = Vec::new();
    prepare_all(&vault, &mut asked);
    let mut searcher = Searcher::open(&vault.root, &model()).unwrap().unwrap();
    assert_eq!(searcher.vectors(), 40);

    let added = format!("# Added\n{}", long("A page added after the search opened."));
    write(&vault, "added.md", &added);
    prepare_all(&vault, &mut asked);
    let found = searcher.nearest(&fake(&added), 8).unwrap();
    assert_eq!(
        found.hits[0].path, "added.md",
        "caught up without reopening"
    );
    assert_eq!(searcher.vectors(), 41);

    let kept = std::fs::read_to_string(vault.root.join("wiki/page-0.md")).unwrap();
    for page in 0..6 {
        let folder = if page % 2 == 0 { "wiki" } else { "notes" };
        std::fs::remove_file(vault.root.join(format!("{folder}/page-{page}.md"))).unwrap();
    }
    plan(&vault);
    let found = searcher.nearest(&fake(&added), 8).unwrap();
    assert_eq!(
        (searcher.vectors(), found.stale),
        (17, 0),
        "vectors in their grace period are not searched"
    );
    assert_eq!(row_counts(&vault).0, 41, "they stay on disk");
    std::fs::write(vault.root.join("wiki/page-0.md"), kept).unwrap();
    plan(&vault);
    searcher.nearest(&fake(&added), 8).unwrap();
    assert_eq!(searcher.vectors(), 21, "held again: searched again");
    age_unheld(&vault, GRACE_MS + 60_000);
    plan(&vault);
    assert_eq!(row_counts(&vault).0, 21);
    let found = searcher.nearest(&fake(&added), 8).unwrap();
    assert_eq!(searcher.vectors(), 21);
    assert_eq!(found.hits[0].path, "added.md");
}

#[test]
fn a_second_run_for_the_same_folder_is_refused_while_one_prepares() {
    let vault = TempVault::new("vectors-second");
    write_sections(&vault, 20, 23);
    let first = plan(&vault);
    let second = plan(&vault);
    let mut refused = None;
    vectors::prepare(first, &PrepareProgress::default(), |texts: &[&str]| {
        if refused.is_none() {
            let planned = vectors::plan(
                &vault.root,
                &model(),
                &vault.files(),
                &PrepareProgress::default(),
            );
            refused = Some(matches!(planned, Err(vault_index::Error::Io(ref e)) if e.kind() == std::io::ErrorKind::ResourceBusy));
        }
        Ok::<_, Infallible>(texts.iter().map(|text| fake(text)).collect())
    })
    .unwrap();
    assert_eq!(
        refused,
        Some(true),
        "a plan beside a running prepare is refused"
    );
    let stale = vectors::prepare(second, &PrepareProgress::default(), |texts: &[&str]| {
        Ok::<_, Infallible>(texts.iter().map(|text| fake(text)).collect())
    })
    .unwrap();
    assert_eq!(
        stale.passages, 0,
        "an older plan sends nothing already stored"
    );
}

#[test]
fn a_second_prepare_beside_a_running_one_is_refused() {
    let vault = TempVault::new("vectors-second-prepare");
    write_sections(&vault, 20, 29);
    let first = plan(&vault);
    let mut second = Some(plan(&vault));
    let mut refused = false;
    vectors::prepare(first, &PrepareProgress::default(), |texts: &[&str]| {
        if let Some(plan) = second.take() {
            let outcome = vectors::prepare(plan, &PrepareProgress::default(), |_: &[&str]| {
                Ok::<_, Infallible>(Vec::new())
            });
            refused = matches!(outcome, Err(PrepareError::Index(vault_index::Error::Io(ref e))) if e.kind() == std::io::ErrorKind::ResourceBusy);
        }
        Ok::<_, Infallible>(texts.iter().map(|text| fake(text)).collect())
    })
    .unwrap();
    assert!(refused);
}

#[test]
fn a_file_changed_between_plan_and_prepare_sends_only_what_it_holds() {
    let vault = TempVault::new("vectors-between");
    let one = format!("# One\n{}", long("Kept section."));
    let old = format!("# Two\n{}", long("Planned section."));
    let new = format!("# Two\n{}", long("Written after the plan."));
    write(&vault, "a.md", &format!("{one}\n\n{old}\n"));
    let taken = plan(&vault);
    assert_eq!(taken.remaining().passages, 2);
    write(&vault, "a.md", &format!("{one}\n\n{new}\n"));
    let mut asked = Vec::new();
    let prepared = vectors::prepare(taken, &PrepareProgress::default(), |texts: &[&str]| {
        asked.extend(texts.iter().map(|text| text.to_string()));
        Ok::<_, Infallible>(texts.iter().map(|text| fake(text)).collect())
    })
    .unwrap();
    assert_eq!(
        asked,
        vec![one],
        "the planned passage the file no longer holds is skipped"
    );
    assert_eq!(prepared.changed, 1);
    assert_eq!(
        plan(&vault).remaining().passages,
        1,
        "the next plan sees the new one"
    );
}

#[test]
fn another_model_name_or_dimension_starts_a_new_file() {
    let vault = TempVault::new("vectors-model");
    let two = format!("# A\n{}\n\n# B\n{}\n", long("alpha"), long("beta"));
    write(&vault, "a.md", &two);
    let mut asked = Vec::new();
    prepare_all(&vault, &mut asked);
    let mut searcher = Searcher::open(&vault.root, &model()).unwrap().unwrap();
    let renamed = Model {
        name: "another-embedding".into(),
        dimensions: DIMS,
    };
    let wider = Model {
        name: "fake-embedding".into(),
        dimensions: DIMS * 2,
    };
    for other in [&renamed, &wider] {
        assert!(Searcher::open(&vault.root, other).unwrap().is_none());
        assert!(vectors::status(&vault.root, other).unwrap().is_none());
    }
    assert_eq!(
        plan_with(&vault, &renamed).remaining().passages,
        2,
        "every passage again"
    );
    assert!(vectors::status(&vault.root, &model()).unwrap().is_none());
    assert!(
        searcher.nearest(&fake("alpha"), 8).unwrap().deleted,
        "a searcher of the replaced store says so"
    );
    assert_eq!(searcher.vectors(), 0, "and lets its copy go");
    assert_eq!(plan_with(&vault, &wider).remaining().passages, 2);
    assert!(Searcher::open(&vault.root, &model()).unwrap().is_none());
}

/// Prepares with search.sqlite beside the vectors, deleting search by meaning during batch 2.
#[test]
fn a_delete_stops_a_running_build_and_leaves_nothing_stored() {
    let vault = TempVault::new("vectors-delete");
    write_sections(&vault, 20, 3);
    sync(
        &vault.root,
        &vault.files(),
        &Progress::default(),
        Check::IfInterrupted,
    )
    .unwrap();
    let mut asked = Vec::new();
    prepare_all(&vault, &mut asked);
    let mut searcher = Searcher::open(&vault.root, &model()).unwrap().unwrap();
    std::fs::write(vault.root.join("wiki/page-0.md"), "# New\nchanged text").unwrap();
    std::fs::write(vault.root.join("wiki/page-2.md"), "# New\nother text").unwrap();
    write_sections(&vault, 40, 31);
    let mut batches = 0;
    let outcome = vectors::prepare(
        plan(&vault),
        &PrepareProgress::default(),
        |texts: &[&str]| {
            batches += 1;
            if batches == 2 {
                vectors::delete_vectors(&vault.root).unwrap();
            }
            Ok::<_, Infallible>(texts.iter().map(|text| fake(text)).collect())
        },
    );
    assert!(matches!(outcome, Err(PrepareError::Deleted)), "{outcome:?}");
    assert!(vault.index_file().is_file(), "the search index stays");
    assert_nothing_stored(&vault);
    let found = searcher.nearest(&fake("vault"), 8).unwrap();
    assert!(found.deleted && found.hits.is_empty());
    assert_eq!(searcher.vectors(), 0, "the searcher let its copy go");
    assert_nothing_stored(&vault);
    assert_eq!(
        plan(&vault).remaining().passages,
        160,
        "the next plan starts over"
    );
}

#[test]
fn a_plan_that_waited_behind_a_delete_leaves_it_done() {
    let vault = TempVault::new("vectors-plan-waits");
    write_sections(&vault, 20, 59);
    let mut asked = Vec::new();
    prepare_all(&vault, &mut asked);
    // The Delete runs after the plan read the deletion count and before it takes the lock.
    let root = vault.root.clone();
    pause::at(
        Point::BeforePlanLock,
        &vault_index::index_dir(&vault.root).unwrap(),
        move || {
            vectors::delete_vectors(&root).unwrap();
        },
    );
    let planned = vectors::plan(
        &vault.root,
        &model(),
        &vault.files(),
        &PrepareProgress::default(),
    );
    assert!(
        matches!(&planned, Err(vault_index::Error::Deleted)),
        "{planned:?}"
    );
    assert!(vectors::status(&vault.root, &model()).unwrap().is_none());
    assert!(!vectors_file(&vault).exists(), "the delete stays done");
}

/// Windows refuses to remove a file another handle holds; a read-only folder does the same here.
#[cfg(unix)]
#[test]
fn a_delete_that_can_only_empty_the_file_still_leaves_nothing_stored() {
    use std::os::unix::fs::PermissionsExt;
    let vault = TempVault::new("vectors-delete-in-place");
    write_sections(&vault, 20, 37);
    let mut asked = Vec::new();
    prepare_all(&vault, &mut asked);
    let mut searcher = Searcher::open(&vault.root, &model()).unwrap().unwrap();
    write_sections(&vault, 40, 41);
    let dir = vault_index::index_dir(&vault.root).unwrap();
    let mut batches = 0;
    let outcome = vectors::prepare(
        plan(&vault),
        &PrepareProgress::default(),
        |texts: &[&str]| {
            batches += 1;
            if batches == 2 {
                std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o555)).unwrap();
                let deleted = vectors::delete_vectors(&vault.root);
                std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700)).unwrap();
                deleted.unwrap();
            }
            Ok::<_, Infallible>(texts.iter().map(|text| fake(text)).collect())
        },
    );
    assert!(matches!(outcome, Err(PrepareError::Deleted)), "{outcome:?}");
    assert!(
        vectors_file(&vault).is_file(),
        "reset in place, not removed"
    );
    assert_nothing_stored(&vault);
    let found = searcher.nearest(&fake("vault"), 8).unwrap();
    assert!(found.deleted && found.hits.is_empty());
    assert_eq!(searcher.vectors(), 0);
    assert_eq!(
        plan(&vault).remaining().passages,
        160,
        "the next plan starts over in the emptied file"
    );
}

#[test]
fn a_damaged_file_is_set_aside_by_a_search_or_a_plan_and_rebuilt() {
    let vault = TempVault::new("vectors-damage");
    write_sections(&vault, 40, 43);
    let mut asked = Vec::new();
    prepare_all(&vault, &mut asked);
    sql(&vault, "PRAGMA wal_checkpoint(TRUNCATE);");
    let path = vectors_file(&vault);
    let mut bytes = std::fs::read(&path).unwrap();
    let half = bytes.len() / 2;
    for byte in &mut bytes[half..] {
        *byte = 0xAB;
    }
    std::fs::write(&path, &bytes).unwrap();

    let searched = Searcher::open(&vault.root, &model())
        .and_then(|searcher| searcher.unwrap().nearest(&fake("vault"), 8));
    assert!(
        searched.as_ref().is_err_and(vault_index::Error::is_damage),
        "{searched:?}"
    );
    assert!(!path.exists(), "set aside");
    assert!(path.with_extension("sqlite.damaged").exists());
    assert_eq!(plan(&vault).remaining().passages, 160, "rebuilt");

    std::fs::write(&path, vec![0x5A; 64 * 1024]).unwrap();
    assert_eq!(
        plan(&vault).remaining().passages,
        160,
        "a plan sets a file that is not a store aside and starts again"
    );
    assert!(
        vectors::vectors_bytes(&vault.root).unwrap() > 64 * 1024,
        "the copy is counted"
    );
    vectors::delete_vectors(&vault.root).unwrap();
    assert_nothing_stored(&vault);
}

#[test]
fn damage_that_only_the_pending_list_reaches_is_set_aside_and_rebuilt() {
    let vault = TempVault::new("vectors-damage-pending");
    write_sections(&vault, 20, 71);
    let mut asked = Vec::new();
    prepare_all(&vault, &mut asked);
    corrupt_page_of(&vault, SHA_INDEX);
    let planned = vectors::plan(
        &vault.root,
        &model(),
        &vault.files(),
        &PrepareProgress::default(),
    );
    assert!(
        planned.as_ref().is_err_and(vault_index::Error::is_damage),
        "{planned:?}"
    );
    assert!(vectors_file(&vault)
        .with_extension("sqlite.damaged")
        .exists());
    assert_eq!(
        plan(&vault).remaining().passages,
        80,
        "rebuilt by the next plan"
    );
}

#[test]
fn damage_that_only_prepares_first_write_reaches_is_set_aside_and_rebuilt() {
    let vault = TempVault::new("vectors-damage-prepare");
    write_sections(&vault, 20, 73);
    let taken = plan(&vault);
    corrupt_page_of(&vault, SHA_INDEX);
    let mut asked = 0;
    let outcome = vectors::prepare(taken, &PrepareProgress::default(), |texts: &[&str]| {
        asked += texts.len();
        Ok::<_, Infallible>(texts.iter().map(|text| fake(text)).collect())
    });
    assert!(
        matches!(&outcome, Err(PrepareError::Index(error)) if error.is_damage()),
        "{outcome:?}"
    );
    assert_eq!(asked, 0);
    assert!(vectors_file(&vault)
        .with_extension("sqlite.damaged")
        .exists());
    assert_eq!(
        plan(&vault).remaining().passages,
        80,
        "rebuilt by the next plan"
    );
}

/// A search that hits a damaged page lets its own connection go and sets the file aside without
/// waiting for the lock. Windows refuses to rename a file another handle holds; a read-only folder
/// does the same here (the plan makes its folder private again, so only this path can be shown).
#[cfg(unix)]
#[test]
fn a_damaged_file_a_search_cannot_rename_is_reset_in_place_and_rebuilt() {
    use std::os::unix::fs::PermissionsExt;
    let vault = TempVault::new("vectors-damage-in-place");
    write_sections(&vault, 20, 79);
    let mut asked = Vec::new();
    prepare_all(&vault, &mut asked);
    let mut other = Searcher::open(&vault.root, &model()).unwrap().unwrap();
    corrupt_page_of(&vault, "signs");
    let dir = vault_index::index_dir(&vault.root).unwrap();
    std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o555)).unwrap();
    let opened = Searcher::open(&vault.root, &model());
    std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700)).unwrap();
    assert!(
        opened.as_ref().is_err_and(vault_index::Error::is_damage),
        "{:?}",
        opened.as_ref().err()
    );
    assert!(
        vectors_file(&vault).is_file(),
        "reset in place, not renamed"
    );
    assert_nothing_stored(&vault);
    assert!(other.nearest(&fake("vault"), 8).unwrap().deleted);
    assert_eq!(other.vectors(), 0);
    assert_eq!(
        plan(&vault).remaining().passages,
        80,
        "rebuilt in the same file"
    );
}

#[test]
fn a_stop_between_plan_batches_keeps_what_was_written_and_the_next_plan_reads_the_rest() {
    let vault = TempVault::new("vectors-plan-stop");
    write_sections(&vault, 600, 83);
    let dir = vault_index::index_dir(&vault.root).unwrap();
    let files_held = || -> i64 {
        let conn = rusqlite::Connection::open(vectors_file(&vault)).unwrap();
        conn.query_row("SELECT count(*) FROM files", [], |row| row.get(0))
            .unwrap()
    };
    let progress = std::sync::Arc::new(PrepareProgress::default());
    let stopper = std::sync::Arc::clone(&progress);
    pause::at(Point::AfterPlanBatch, &dir, move || stopper.request_stop());
    let planned = vectors::plan(&vault.root, &model(), &vault.files(), &progress);
    assert!(
        matches!(planned, Err(vault_index::Error::Cancelled)),
        "{planned:?}"
    );
    assert_eq!(files_held(), 256, "the first batch of read files stays");
    assert_eq!(plan(&vault).remaining().files, 600);
    assert_eq!(files_held(), 600);

    // Removed files are forgotten 1,024 per transaction; one is kept, since an empty listing
    // removes nothing.
    let vault = TempVault::new("vectors-plan-stop-forget");
    write_sections(&vault, 1_100, 89);
    let dir = vault_index::index_dir(&vault.root).unwrap();
    plan(&vault);
    for page in 1..1_100 {
        let folder = if page % 2 == 0 { "wiki" } else { "notes" };
        std::fs::remove_file(vault.root.join(format!("{folder}/page-{page}.md"))).unwrap();
    }
    let progress = std::sync::Arc::new(PrepareProgress::default());
    let stopper = std::sync::Arc::clone(&progress);
    pause::at(Point::AfterPlanBatch, &dir, move || stopper.request_stop());
    let planned = vectors::plan(&vault.root, &model(), &vault.files(), &progress);
    assert!(
        matches!(planned, Err(vault_index::Error::Cancelled)),
        "{planned:?}"
    );
    let held = {
        let conn = rusqlite::Connection::open(vectors_file(&vault)).unwrap();
        conn.query_row("SELECT count(*) FROM files", [], |row| row.get::<_, i64>(0))
            .unwrap()
    };
    assert_eq!(held, 1_100 - 1_024);
    plan(&vault);
    let status = vectors::status(&vault.root, &model()).unwrap().unwrap();
    assert_eq!(status.files, 1);
}

/// A real second handle on `vectors.sqlite`, as the desk's searcher keeps: Windows then refuses
/// to remove or rename the file, and every retire resets it in place.
#[cfg(windows)]
fn hold_open(vault: &TempVault) -> rusqlite::Connection {
    let held = rusqlite::Connection::open(vectors_file(vault)).unwrap();
    let _: i64 = held
        .query_row("SELECT count(*) FROM vectors", [], |row| row.get(0))
        .unwrap();
    held
}

#[cfg(windows)]
#[test]
fn on_windows_a_delete_beside_an_open_handle_leaves_nothing_stored() {
    let vault = TempVault::new("vectors-windows-delete");
    write_sections(&vault, 20, 97);
    let mut asked = Vec::new();
    prepare_all(&vault, &mut asked);
    let _held = hold_open(&vault);
    let mut searcher = Searcher::open(&vault.root, &model()).unwrap().unwrap();
    vectors::delete_vectors(&vault.root).unwrap();
    assert!(vectors_file(&vault).is_file(), "reset in place");
    assert_nothing_stored(&vault);
    assert!(searcher.nearest(&fake("vault"), 8).unwrap().deleted);
    assert_eq!(searcher.vectors(), 0);
    assert_eq!(plan(&vault).remaining().passages, 80);
}

#[cfg(windows)]
#[test]
fn on_windows_another_model_beside_an_open_handle_starts_a_new_store() {
    let vault = TempVault::new("vectors-windows-model");
    write_sections(&vault, 20, 101);
    let mut asked = Vec::new();
    prepare_all(&vault, &mut asked);
    let _held = hold_open(&vault);
    let mut searcher = Searcher::open(&vault.root, &model()).unwrap().unwrap();
    let other = Model {
        name: "another-embedding".into(),
        dimensions: DIMS,
    };
    assert_eq!(plan_with(&vault, &other).remaining().passages, 80);
    assert!(vectors::status(&vault.root, &model()).unwrap().is_none());
    assert!(searcher.nearest(&fake("vault"), 8).unwrap().deleted);
}

#[cfg(windows)]
#[test]
fn on_windows_a_damaged_file_beside_an_open_handle_is_reset_and_rebuilt() {
    let vault = TempVault::new("vectors-windows-damage");
    write_sections(&vault, 20, 103);
    let mut asked = Vec::new();
    prepare_all(&vault, &mut asked);
    let held = hold_open(&vault);
    corrupt_page_of(&vault, SHA_INDEX);
    let planned = vectors::plan(
        &vault.root,
        &model(),
        &vault.files(),
        &PrepareProgress::default(),
    );
    assert!(
        planned.as_ref().is_err_and(vault_index::Error::is_damage),
        "{planned:?}"
    );
    assert_nothing_stored(&vault);
    drop(held);
    assert_eq!(plan(&vault).remaining().passages, 80);
}

#[test]
fn a_new_passage_rule_reads_every_file_again_but_sends_nothing_unchanged() {
    let vault = TempVault::new("vectors-passage-version");
    write_sections(&vault, 10, 47);
    let mut asked = Vec::new();
    prepare_all(&vault, &mut asked);
    sql(
        &vault,
        "UPDATE meta SET value = '1' WHERE key = 'passage_version';",
    );
    std::fs::remove_file(vault.root.join("notes/page-1.md")).unwrap();
    let taken = plan(&vault);
    assert_eq!(taken.remaining().passages, 0);
    assert_eq!(
        unheld(&vault),
        4,
        "only the vectors of the file gone start their grace period, marked once all were read"
    );
    let status = vectors::status(&vault.root, &model()).unwrap().unwrap();
    assert_eq!((status.files, status.passages_stored), (9, 36));
}

#[test]
fn changed_files_counts_edits_additions_and_removals_without_writing() {
    let vault = TempVault::new("vectors-changed");
    write_sections(&vault, 6, 53);
    let mut asked = Vec::new();
    prepare_all(&vault, &mut asked);
    let changed = |files: &[String]| vectors::changed_files(&vault.root, &model(), files).unwrap();
    assert_eq!(changed(&vault.files()), Some(0));
    write(
        &vault,
        "wiki/page-0.md",
        &format!("# Edited\n{}", long("edited")),
    );
    write(&vault, "new.md", &format!("# New\n{}", long("new")));
    std::fs::remove_file(vault.root.join("notes/page-1.md")).unwrap();
    assert_eq!(changed(&vault.files()), Some(3));
    assert_eq!(changed(&[]), Some(0), "an empty listing removes nothing");
    let other = Model {
        name: "other".into(),
        dimensions: DIMS,
    };
    assert_eq!(
        vectors::changed_files(&vault.root, &other, &vault.files()).unwrap(),
        None
    );
    assert_eq!(
        plan(&vault).remaining().passages,
        2,
        "nothing was written before"
    );
}
