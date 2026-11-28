//! What `query_plan` answers, stated in full: each answer the script server's plan could not give
//! (its defaults, relation names and suggested calls differ; spec row 43) is a row of
//! `tests/plan_answers/<case>.tsv`, `id`, error code (`-` for none) and the answer's text, so a
//! changed word, number or key order fails here and is read before it is accepted. The requests are
//! the differential corpus's own (`tests/differential/corpus/graph/query-plan-<case>.jsonl`); the
//! vaults are the storefront sample and the planted ones kept beside the rows.

#![allow(
    clippy::disallowed_methods,
    clippy::disallowed_types,
    clippy::indexing_slicing,
    reason = "this test reads fixture files and answers by key"
)]

mod support;

use std::fs::{self, File, FileTimes};
use std::path::{Path, PathBuf};
use std::time::{Duration, UNIX_EPOCH};

use serde_json::Value;
use support::{call, request, run_to_end, Program, INITIALIZED};

const CASES: [&str; 5] = [
    "storefront",
    "tangle",
    "containment-tangle",
    "empty",
    "one-node",
];

/// Every file of a vault carries this time in a plan's `compiledSummary.maxMtime`, so the time a
/// checkout gave the files is not part of an answer.
const PLANTED_SECONDS: u64 = 1_700_000_000;

/// A copy of `from` in `to` whose files all have the planted time.
fn plant_copy(from: &Path, to: &Path) {
    fs::create_dir_all(to).expect("create the copy");
    for entry in fs::read_dir(from).expect("read the vault") {
        let entry = entry.expect("an entry");
        let target = to.join(entry.file_name());
        if entry.file_type().expect("a file type").is_dir() {
            plant_copy(&entry.path(), &target);
        } else {
            fs::copy(entry.path(), &target).expect("copy a file");
            let planted = UNIX_EPOCH + Duration::from_secs(PLANTED_SECONDS);
            File::options()
                .write(true)
                .open(&target)
                .expect("open the copy")
                .set_times(FileTimes::new().set_modified(planted))
                .expect("plant the time");
        }
    }
}

fn pinned_folder() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/plan_answers")
}

/// The requests of one corpus case by id, the arguments as they were sent.
fn corpus_requests(case: &str) -> Vec<(u32, String)> {
    let file = support::repository_root()
        .join("tests/differential/corpus/graph")
        .join(format!("query-plan-{case}.jsonl"));
    let text = fs::read_to_string(&file).expect("the corpus case exists");
    text.lines()
        .filter(|line| line.starts_with("{\"id\""))
        .map(|line| {
            let sent: Value = serde_json::from_str(line).expect("a corpus line is JSON");
            let id = u32::try_from(sent["id"].as_u64().expect("an id")).expect("a small id");
            (id, sent["params"]["arguments"].to_string())
        })
        .collect()
}

fn pinned_rows(case: &str) -> Vec<(u32, String, String)> {
    let text = fs::read_to_string(pinned_folder().join(format!("{case}.tsv")))
        .expect("the pinned answers exist");
    text.lines()
        .map(|row| {
            let mut columns = row.splitn(3, '\t');
            let id = columns.next().expect("an id").parse().expect("a number");
            let code = columns.next().expect("an error code").to_string();
            let answer = columns.next().expect("an answer").to_string();
            (id, code, answer)
        })
        .collect()
}

#[test]
fn every_plan_the_script_server_could_not_give_is_stated_in_full() {
    for case in CASES {
        let kept = match case {
            "storefront" => Some(support::storefront()),
            "empty" => None,
            planted => Some(pinned_folder().join("vaults").join(planted)),
        };
        let work = tempfile::tempdir().expect("a folder for the vault");
        let vault = work.path().join("vault");
        match kept {
            Some(from) => plant_copy(&from, &vault),
            None => fs::create_dir_all(&vault).expect("an empty vault"),
        }
        let mut input = request(
            0,
            "initialize",
            "{\"protocolVersion\":\"2025-06-18\",\"capabilities\":{},\"clientInfo\":{\"name\":\"t\",\"version\":\"1\"}}",
        );
        input.push_str(INITIALIZED);
        for (id, arguments) in corpus_requests(case) {
            input.push_str(&call(id, "query_ontology", &arguments));
        }
        let vault_text = vault.to_str().expect("a UTF-8 path");
        let run = run_to_end(
            Program::Rust,
            &[("OATLAS_VAULT", vault_text)],
            input.as_bytes(),
        );
        let answers: Vec<Value> = run
            .lines
            .iter()
            .map(|line| serde_json::from_str(line).expect("an answer is JSON"))
            .collect();
        for (id, code, expected) in pinned_rows(case) {
            let answer = answers
                .iter()
                .find(|answer| answer["id"].as_u64() == Some(u64::from(id)))
                .unwrap_or_else(|| panic!("{case} {id}: no answer"));
            let result = &answer["result"];
            assert_eq!(
                result["structuredContent"]["errorCode"].as_str().unwrap_or("-"),
                code,
                "{case} {id}: the error code"
            );
            assert_eq!(
                result["content"][0]["text"].as_str(),
                Some(expected.as_str()),
                "{case} {id}: the answer's text"
            );
        }
    }
}
