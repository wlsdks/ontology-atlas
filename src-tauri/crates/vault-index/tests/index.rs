mod common;

use common::{assert_consistent, found, truth, write_corpus, Lcg, TempVault, PROBE_QUERIES};
use std::collections::BTreeSet;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Instant;
use vault_index::{delete, index_dir, stored_bytes, sync, Check, Progress, Searcher};

/// Names a way to damage an index file, and does it.
type Damage = fn(&std::path::Path);

const BENCH: &str = env!("CARGO_BIN_EXE_vault-index-bench");

fn sync_all(vault: &TempVault, check: Check) -> vault_index::SyncReport {
    sync(&vault.root, &vault.files(), &Progress::default(), check).unwrap()
}

fn bench(args: &[&str]) -> Command {
    let mut command = Command::new(BENCH);
    command
        .args(args)
        .env(
            vault_index::INDEX_DIR_OVERRIDE_ENV,
            std::env::var_os(vault_index::INDEX_DIR_OVERRIDE_ENV).unwrap(),
        )
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    command
}

#[test]
fn kill_mid_build_leaves_a_usable_or_rebuilt_index() {
    let vault = TempVault::new("kill");
    let files = write_corpus(&vault.root, 10_000, 7);
    let root = vault.root.to_string_lossy().into_owned();

    let started = Instant::now();
    assert!(bench(&["build", &root]).status().unwrap().success());
    let full_build = started.elapsed();

    let mut rng = Lcg::new(20_261_119);
    let mut repaired = 0;
    for round in 0..20 {
        delete(Some(&vault.root)).unwrap();
        let mut child = bench(&["build", &root]).spawn().unwrap();
        let kill_after = full_build.mul_f64((rng.next() % 1000) as f64 / 1000.0);
        std::thread::sleep(kill_after);
        let _ = child.kill();
        let _ = child.wait();

        let report = sync(
            &vault.root,
            &files,
            &Progress::default(),
            Check::IfInterrupted,
        )
        .unwrap_or_else(|error| panic!("round {round}, killed after {kill_after:?}: {error}"));
        if report.repair.set_aside_damaged || report.repair.created {
            repaired += 1;
        }
        assert_consistent(&vault, &files);
    }
    eprintln!("20 kills over a {full_build:?} build; {repaired} reopen(s) started over");
}

#[test]
fn damaged_files_are_set_aside_and_rebuilt() {
    let vault = TempVault::new("damage");
    let files = write_corpus(&vault.root, 1_500, 11);
    let index = vault.index_file();
    let damages: [(&str, Damage); 3] = [
        ("truncated to half", |path| {
            let file = std::fs::OpenOptions::new().write(true).open(path).unwrap();
            let length = file.metadata().unwrap().len();
            file.set_len(length / 2).unwrap();
        }),
        ("4 KB overwritten mid-file", |path| {
            use std::io::{Seek, SeekFrom, Write};
            let mut file = std::fs::OpenOptions::new().write(true).open(path).unwrap();
            let middle = file.metadata().unwrap().len() / 2 / 4096 * 4096;
            file.seek(SeekFrom::Start(middle)).unwrap();
            file.write_all(&[0xA5; 4096]).unwrap();
        }),
        ("zero length", |path| {
            std::fs::OpenOptions::new()
                .write(true)
                .truncate(true)
                .open(path)
                .unwrap();
        }),
    ];
    for (name, damage) in damages {
        delete(Some(&vault.root)).unwrap();
        sync_all(&vault, Check::IfInterrupted);
        damage(&index);
        let report = sync_all(&vault, Check::Always);
        assert!(
            report.repair.set_aside_damaged,
            "{name}: the damaged file is set aside"
        );
        assert!(
            index.with_extension("sqlite.damaged").exists(),
            "{name}: one damaged copy is kept"
        );
        assert_consistent(&vault, &files);
    }

    delete(Some(&vault.root)).unwrap();
    let holder = {
        sync_all(&vault, Check::IfInterrupted);
        let holder = rusqlite::Connection::open(&index).unwrap();
        holder
            .query_row("SELECT count(*) FROM files", [], |row| row.get::<_, i64>(0))
            .unwrap();
        holder
    };
    for file in files.iter().take(300) {
        std::fs::write(
            vault.root.join(file),
            format!("rewritten {file} walremoved\n"),
        )
        .unwrap();
    }
    sync_all(&vault, Check::IfInterrupted);
    let wal = index.with_extension("sqlite-wal");
    assert!(wal.exists(), "a second connection keeps the WAL in place");
    drop(holder);
    let _ = std::fs::remove_file(&wal);
    sync_all(&vault, Check::Always);
    assert_consistent(&vault, &files);
    assert_eq!(found(&vault.root, "walremoved").len(), 300, "-wal removed");
}

#[test]
fn older_and_newer_versions_rebuild() {
    let vault = TempVault::new("versions");
    let files = write_corpus(&vault.root, 400, 3);
    sync_all(&vault, Check::IfInterrupted);
    let current: i32 = rusqlite::Connection::open(vault.index_file())
        .unwrap()
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .unwrap();
    for other in [current - 1, current + 1] {
        rusqlite::Connection::open(vault.index_file())
            .unwrap()
            .pragma_update(None, "user_version", other)
            .unwrap();
        assert!(
            Searcher::open(&vault.root).unwrap().is_none(),
            "a search never reads version {other}"
        );
        let report = sync_all(&vault, Check::IfInterrupted);
        assert!(
            report.repair.discarded_version,
            "version {other} is discarded"
        );
        assert_eq!(report.indexed, files.len(), "and rebuilt from the files");
        assert_consistent(&vault, &files);
    }
}

fn set_modified(path: &std::path::Path, time: std::time::SystemTime) {
    std::fs::File::options()
        .write(true)
        .open(path)
        .unwrap()
        .set_modified(time)
        .unwrap();
}

#[test]
fn external_changes_are_seen() {
    let vault = TempVault::new("external");
    write_corpus(&vault.root, 600, 5);
    sync_all(&vault, Check::IfInterrupted);
    let root = vault.root.clone();
    let check = |word: &str, expected: &[&str]| {
        sync_all(&vault, Check::IfInterrupted);
        let expected: BTreeSet<String> = expected.iter().map(|path| path.to_string()).collect();
        assert_eq!(found(&root, word), expected, "{word}");
        assert_consistent(&vault, &vault.files());
    };

    std::fs::write(root.join("wiki/page-0.md"), "in place 저장됨 inplacesave").unwrap();
    check("inplacesave", &["wiki/page-0.md"]);
    check("저장됨", &["wiki/page-0.md"]);

    std::fs::write(
        root.join("wiki/.page-2.md.tmp"),
        "saved by rename renamesave",
    )
    .unwrap();
    std::fs::rename(
        root.join("wiki/.page-2.md.tmp"),
        root.join("wiki/page-2.md"),
    )
    .unwrap();
    check("renamesave", &["wiki/page-2.md"]);

    std::fs::remove_file(root.join("wiki/page-0.md")).unwrap();
    check("inplacesave", &[]);

    let before: Vec<String> = found(&root, "zettelkasten").into_iter().collect();
    std::fs::rename(root.join("notes"), root.join("moved")).unwrap();
    let after: Vec<String> = before
        .iter()
        .map(|path| path.replace("notes/", "moved/"))
        .collect();
    check(
        "zettelkasten",
        &after.iter().map(String::as_str).collect::<Vec<_>>(),
    );

    write_corpus(&root, 5_000, 99);
    let rewritten: Vec<String> = (0..5_000)
        .map(|i| format!("{}/page-{i}.md", if i % 2 == 0 { "wiki" } else { "notes" }))
        .collect();
    for path in &rewritten {
        let mut text = std::fs::read_to_string(root.join(path)).unwrap();
        text.push_str(" checkoutmarker");
        std::fs::write(root.join(path), text).unwrap();
    }
    check(
        "checkoutmarker",
        &rewritten.iter().map(String::as_str).collect::<Vec<_>>(),
    );

    let target = root.join("wiki/page-4.md");
    std::fs::write(&target, "samesize alphaword").unwrap();
    sync_all(&vault, Check::IfInterrupted);
    let modified = std::fs::metadata(&target).unwrap().modified().unwrap();
    std::fs::write(&target, "samesize gammaword").unwrap();
    set_modified(&target, modified);
    check("gammaword", &["wiki/page-4.md"]);
    check("alphaword", &[]);
}

#[test]
fn a_second_process_reads_while_one_writes() {
    let vault = TempVault::new("readers");
    let files = write_corpus(&vault.root, 3_000, 13);
    sync_all(&vault, Check::IfInterrupted);
    let root = vault.root.to_string_lossy().into_owned();
    let reader = bench(&["read-loop", &root, "400", "지도"]).spawn().unwrap();

    let reading = AtomicBool::new(true);
    let rounds = std::thread::scope(|scope| {
        let writer = scope.spawn(|| {
            let mut rng = Lcg::new(42);
            let mut rounds = 0;
            while reading.load(Ordering::Relaxed) {
                for _ in 0..200 {
                    let file = &files[(rng.next() as usize) % files.len()];
                    let mut text = std::fs::read_to_string(vault.root.join(file)).unwrap();
                    text.push_str(" 지도를 다시 쓴다");
                    std::fs::write(vault.root.join(file), text).unwrap();
                }
                sync_all(&vault, Check::IfInterrupted);
                rounds += 1;
            }
            rounds
        });
        let output = reader.wait_with_output().unwrap();
        reading.store(false, Ordering::Relaxed);
        let rounds = writer.join().unwrap();
        assert_eq!(
            String::from_utf8_lossy(&output.stdout).trim(),
            "{\"reads\":400,\"errors\":0}",
            "after {rounds} write rounds"
        );
        rounds
    });
    assert!(rounds > 0, "the reads overlapped at least one commit");
    assert_consistent(&vault, &files);
}

#[test]
fn korean_english_and_mixed_recall() {
    let vault = TempVault::new("recall");
    let files = write_corpus(&vault.root, 2_000, 17);
    sync_all(&vault, Check::IfInterrupted);
    let classes: &[(&str, &[&str])] = &[
        ("two-syllable", &["지도", "검색", "근거"]),
        ("longer", &["온톨로지", "프런트매터", "에이전트"]),
        ("particle-attached", &["지도를", "색인의", "온톨로지에서"]),
        ("inside-compound", &["그래프엔진", "양자얽힘", "얽힘"]),
        ("English", &["tokenizer", "vault", "zettelkasten"]),
        ("mixed", &["MCP서버", "SQLite 색인", "vault 경계"]),
    ];
    let baseline = default_tokenizer_index(&vault.root, &files);
    let mut korean_truth = 0;
    let mut korean_baseline = 0;
    for (class, queries) in classes {
        for query in *queries {
            let expected = truth(&vault.root, &files, query);
            assert!(
                !expected.is_empty(),
                "{class} {query}: the fixture contains it"
            );
            let got = found(&vault.root, query);
            let hit = got.intersection(&expected).count();
            assert_eq!(
                hit as f64 / expected.len() as f64,
                1.0,
                "{class} recall for {query}"
            );
            assert_eq!(got, expected, "{class} precision for {query}");
            if *class != "English" {
                korean_truth += expected.len();
                korean_baseline += baseline_hits(&baseline, query)
                    .intersection(&expected)
                    .count();
            }
        }
    }
    let baseline_recall = korean_baseline as f64 / korean_truth as f64;
    eprintln!("default tokenizer recall on Korean and mixed queries: {baseline_recall:.2}");
    assert!(
        baseline_recall < 0.5,
        "the default tokenizer is the failing baseline ({baseline_recall:.2})"
    );
}

/// SQLite's own tokenizer over the raw text, the way an index without the shared segmentation
/// would answer.
fn default_tokenizer_index(
    root: &std::path::Path,
    files: &[String],
) -> (rusqlite::Connection, Vec<String>) {
    let conn = rusqlite::Connection::open_in_memory().unwrap();
    conn.execute_batch("CREATE VIRTUAL TABLE plain USING fts5(body)")
        .unwrap();
    for (id, file) in files.iter().enumerate() {
        let text = std::fs::read_to_string(root.join(file)).unwrap();
        conn.execute(
            "INSERT INTO plain(rowid, body) VALUES (?1, ?2)",
            rusqlite::params![id as i64, text],
        )
        .unwrap();
    }
    (conn, files.to_vec())
}

fn baseline_hits(
    (conn, files): &(rusqlite::Connection, Vec<String>),
    query: &str,
) -> BTreeSet<String> {
    let expression = query
        .split_whitespace()
        .map(|term| format!("\"{term}\""))
        .collect::<Vec<_>>()
        .join(" AND ");
    let mut statement = conn
        .prepare("SELECT rowid FROM plain WHERE plain MATCH ?1")
        .unwrap();
    let ids: Vec<i64> = statement
        .query_map([expression], |row| row.get(0))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();
    ids.into_iter()
        .map(|id| files[id as usize].clone())
        .collect()
}

#[test]
fn index_missing_or_off_answers_from_files() {
    let vault = TempVault::new("missing");
    let files = write_corpus(&vault.root, 500, 23);
    let dir = index_dir(&vault.root).unwrap();

    assert!(
        Searcher::open(&vault.root).unwrap().is_none(),
        "no index: the caller answers from files"
    );
    assert!(!dir.exists(), "looking for an index creates none");
    assert_eq!(stored_bytes(Some(&vault.root)).unwrap(), 0);

    sync_all(&vault, Check::IfInterrupted);
    assert!(stored_bytes(Some(&vault.root)).unwrap() > 0);
    let answers: Vec<_> = PROBE_QUERIES
        .iter()
        .map(|query| found(&vault.root, query))
        .collect();

    delete(Some(&vault.root)).unwrap();
    assert!(!dir.exists(), "off or deleted: no index files remain");
    assert!(Searcher::open(&vault.root).unwrap().is_none());

    sync_all(&vault, Check::IfInterrupted);
    let rebuilt: Vec<_> = PROBE_QUERIES
        .iter()
        .map(|query| found(&vault.root, query))
        .collect();
    assert_eq!(answers, rebuilt, "deleting the index changes no answer");
    assert_consistent(&vault, &files);
}

#[test]
fn only_markdown_inside_the_vault_is_indexed_whatever_the_listing_says() {
    let vault = TempVault::new("confine");
    let outside = vault.root.with_extension("outside");
    std::fs::create_dir_all(&outside).unwrap();
    std::fs::write(outside.join("secret.md"), "quillwort outside").unwrap();
    std::fs::write(vault.root.join("inside.md"), "quillwort inside").unwrap();
    std::fs::create_dir_all(vault.root.join(".hidden")).unwrap();
    std::fs::write(vault.root.join(".hidden/note.md"), "quillwort hidden").unwrap();
    std::fs::write(vault.root.join(".dot.md"), "quillwort dot").unwrap();
    std::fs::write(vault.root.join("notes.txt"), "quillwort text").unwrap();
    let mut listed = vec![
        "inside.md".to_string(),
        "../outside/secret.md".to_string(),
        format!(
            "../{}/secret.md",
            outside.file_name().unwrap().to_string_lossy()
        ),
        ".hidden/note.md".to_string(),
        ".dot.md".to_string(),
        "notes.txt".to_string(),
    ];
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(outside.join("secret.md"), vault.root.join("linked.md"))
            .unwrap();
        std::os::unix::fs::symlink(&outside, vault.root.join("linked-folder")).unwrap();
        listed.push("linked.md".to_string());
        listed.push("linked-folder/secret.md".to_string());
    }
    let report = sync(&vault.root, &listed, &Progress::default(), Check::Always).unwrap();
    assert_eq!(report.files, 1, "one listed file is admitted");
    let found = Searcher::open(&vault.root)
        .unwrap()
        .unwrap()
        .search("quillwort", 10)
        .unwrap();
    let paths: Vec<_> = found.hits.iter().map(|hit| hit.path.as_str()).collect();
    assert_eq!(paths, vec!["inside.md"]);

    // A file indexed inside the vault and later swapped for a link stops being a hit.
    #[cfg(unix)]
    {
        std::fs::remove_file(vault.root.join("inside.md")).unwrap();
        std::os::unix::fs::symlink(outside.join("secret.md"), vault.root.join("inside.md"))
            .unwrap();
        let found = Searcher::open(&vault.root)
            .unwrap()
            .unwrap()
            .search("quillwort", 10)
            .unwrap();
        assert!(
            found.hits.is_empty(),
            "a hit reached through a link is dropped"
        );
    }
    std::fs::remove_dir_all(&outside).unwrap();
}

#[test]
fn an_edit_not_yet_indexed_never_shows_its_old_words() {
    let vault = TempVault::new("stale-hit");
    std::fs::write(vault.root.join("a.md"), "quillwort").unwrap();
    sync_all(&vault, Check::IfInterrupted);
    let searcher = Searcher::open(&vault.root).unwrap().unwrap();
    assert_eq!(searcher.search("quillwort", 10).unwrap().hits.len(), 1);
    std::fs::write(vault.root.join("a.md"), "bladderwrack and more").unwrap();
    let found = searcher.search("quillwort", 10).unwrap();
    assert_eq!((found.hits.len(), found.stale), (0, 1));
}

#[test]
fn a_pasted_page_as_a_query_answers_at_once() {
    let vault = TempVault::new("long-query");
    write_corpus(&vault.root, 200, 47);
    sync_all(&vault, Check::IfInterrupted);
    let searcher = Searcher::open(&vault.root).unwrap().unwrap();
    let page = "graph ".repeat(200_000);
    let started = Instant::now();
    searcher.search(&page, 20).unwrap();
    assert!(
        started.elapsed().as_millis() < 1000,
        "took {:?}",
        started.elapsed()
    );
}

#[cfg(windows)]
mod windows {
    use super::*;

    #[test]
    fn windows_a_path_over_260_characters_is_indexed() {
        let mut dir = std::env::temp_dir().join(format!("vault-index-long-{}", std::process::id()));
        while dir.to_string_lossy().len() <= 280 {
            dir = dir.join("a-folder-name-long-enough-to-pass-the-limit");
        }
        let vault = TempVault::at(dir);
        assert!(vault.root.to_string_lossy().len() > 260);
        let files = write_corpus(&vault.root, 50, 31);
        sync_all(&vault, Check::Always);
        assert_consistent(&vault, &files);
    }

    #[test]
    fn windows_a_non_ascii_folder_is_indexed() {
        let vault = TempVault::at(
            std::env::temp_dir().join(format!("볼트 노트 ünï {}", std::process::id())),
        );
        let files = write_corpus(&vault.root, 50, 37);
        sync_all(&vault, Check::Always);
        assert_consistent(&vault, &files);
    }

    #[test]
    fn windows_one_root_spelled_in_two_cases_maps_to_one_index() {
        let vault =
            TempVault::at(std::env::temp_dir().join(format!("Vault-Case-{}", std::process::id())));
        let files = write_corpus(&vault.root, 50, 41);
        let lower = std::path::PathBuf::from(vault.root.to_string_lossy().to_lowercase());
        let upper = std::path::PathBuf::from(vault.root.to_string_lossy().to_uppercase());
        let spelled: Vec<_> = [&lower, &upper]
            .iter()
            .map(|path| vault_index::canonical_vault_root(path).unwrap())
            .collect();
        assert_eq!(
            index_dir(&spelled[0]).unwrap(),
            index_dir(&spelled[1]).unwrap()
        );
        assert_eq!(
            vault_index::vault_key(&lower),
            vault_index::vault_key(&vault.root)
        );
        sync(&spelled[0], &files, &Progress::default(), Check::Always).unwrap();
        let report = sync(&spelled[1], &files, &Progress::default(), Check::Always).unwrap();
        // Files written a moment ago are inside the racy window, so the reuse shows as rows
        // confirmed by hash rather than by stamp; either way nothing is indexed again.
        assert_eq!(
            (report.indexed, report.unchanged + report.verified),
            (0, files.len()),
            "the second spelling reuses the first one's index"
        );
        assert_consistent(&vault, &files);
    }
}
