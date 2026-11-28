//! The archive against records the app's own writer made (`fixtures/`), and against the files a
//! vault from Git or a sync client can hold: cut short, too large, linked, copied twice.

use std::time::{Duration, Instant};

use analysis_archive_format::{ARCHIVE_FOLDER, MAX_RECORD_BYTES};
use serde::Serialize;

use super::analysis_archive::{AnalysisArchive, ArchiveError, HistoryLimit, HistoryQuery};
use super::analysis_record::AnalysisMode;
use super::record_text::parse_record;

const RUN: &str = include_str!("fixtures/run-written-by-the-app.txt");
const REVIEW: &str = include_str!("fixtures/review-written-by-the-app.txt");
const RUN_WITH_SEPARATORS: &str = include_str!("fixtures/run-with-line-separators.txt");
const RUN_ID: &str = "3f2b7c1e-9d4a-4e8b-a1c6-5d0e7f8a9b10";
const REVIEW_ID: &str = "8a6e1d2c-7b3f-4c9a-b5d4-1e2f3a4b5c6d";
const RUN_FILE: &str = "2026-11-27T09-15-30-123Z-3f2b7c1e-9d4a-4e8b-a1c6-5d0e7f8a9b10.md";
const REVIEW_FILE: &str = "2026-11-27T10-00-00-000Z-8a6e1d2c-7b3f-4c9a-b5d4-1e2f3a4b5c6d.md";

fn plant(vault: &tempfile::TempDir, name: &str, text: &str) {
    let folder = vault.path().join(".ontology-atlas").join(ARCHIVE_FOLDER);
    std::fs::create_dir_all(&folder).expect("folder");
    std::fs::write(folder.join(name), text).expect("file");
}

fn archive(vault: &tempfile::TempDir) -> AnalysisArchive {
    AnalysisArchive::new(vault.path().to_path_buf())
}

fn limit(pages: usize) -> HistoryLimit {
    #[allow(
        clippy::cast_precision_loss,
        reason = "a test page is at most a hundred"
    )]
    HistoryLimit::from_sent(Some(pages as f64)).expect("a limit the archive accepts")
}

fn query(pages: usize) -> HistoryQuery {
    HistoryQuery {
        limit: limit(pages),
        ..HistoryQuery::default()
    }
}

fn written<T: Serialize>(answer: &T) -> String {
    answer_format::json::to_string(answer).expect("writes")
}

fn app_vault() -> tempfile::TempDir {
    let vault = tempfile::tempdir().expect("temp dir");
    plant(&vault, RUN_FILE, RUN);
    plant(&vault, REVIEW_FILE, REVIEW);
    vault
}

#[test]
fn records_the_app_wrote_are_listed_newest_first_and_read_back_whole_in_file_order() {
    let vault = app_vault();
    let history = written(&archive(&vault).history(&query(30)).expect("lists"));
    let review_at = history.find("\"recordType\":\"review\"").expect("review");
    let run_at = history.find("\"recordType\":\"run\"").expect("run");
    assert!(review_at < run_at, "{history}");
    assert!(history.contains("\"problems\":[]"), "{history}");
    assert!(
        history.contains("\"totalFiles\":2,\"scanned\":2,\"returned\":2"),
        "{history}"
    );

    let record = written(&archive(&vault).record(RUN_ID).expect("reads"));
    // The writer's digests hold, so the evidence passed; the frontmatter keys that are whole
    // numbers list first, as a script lists them, and the answer is the last field.
    assert!(
        record.contains("\"frontmatter\":{\"10\":\"ten\",\"2024\":\"year\",\"uid\""),
        "{record}"
    );
    assert!(record.contains("\"big\":1e+21"), "{record}");
    assert!(record.contains("\"ratio\":0.1"), "{record}");
    let tail = record.rfind("\"answer\":").expect("answer");
    assert!(record[tail..].starts_with("\"answer\":\"The answer, with a line break."));
    assert!(record.starts_with(&format!(
        "{{\"contract\":\"analysisRecordRead:v1\",\"operation\":\"analysis_record\",\"fileName\":\"{RUN_FILE}\",\"record\":{{\"schema\":\"atlas-analysis/v1\",\"recordType\":\"run\""
    )));
}

#[test]
fn a_run_holding_line_separators_is_read_where_the_script_reader_refused_it() {
    let vault = tempfile::tempdir().expect("temp dir");
    plant(&vault, RUN_FILE, RUN_WITH_SEPARATORS);
    let record = written(&archive(&vault).record(RUN_ID).expect("reads"));
    assert!(
        record.contains("Line two with \u{2028} separator"),
        "{record}"
    );
}

#[test]
fn a_history_limit_is_a_whole_number_from_one_to_a_hundred_and_nothing_else() {
    for refused in [
        Some(0.0),
        Some(101.0),
        Some(1.5),
        Some(-1.0),
        Some(f64::NAN),
        None,
    ] {
        assert_eq!(
            HistoryLimit::from_sent(refused),
            Err(ArchiveError::InvalidLimit),
            "{refused:?}"
        );
    }
    assert_eq!(
        HistoryLimit::from_sent(Some(100.0)).map(HistoryLimit::get),
        Ok(100)
    );
    assert_eq!(
        HistoryLimit::from_sent(Some(1.0)).map(HistoryLimit::get),
        Ok(1)
    );
}

#[test]
fn a_metadata_line_the_format_cannot_hold_is_refused_in_the_one_sentence_whatever_it_holds() {
    // The same sentence for a line that is not JSON, one nested a level too deep for the reader,
    // and a string with half of a surrogate pair; a record the app wrote never holds one.
    let nested = |levels: usize| {
        let note = format!("note: {}{}", "[".repeat(levels), "]".repeat(levels));
        RUN.replacen(
            "mode: \"architecture\"",
            &format!("mode: \"architecture\"\n{note}"),
            1,
        )
    };
    let refusal = |text: &str| {
        parse_record(text)
            .err()
            .map(|fault| fault.to_string())
            .unwrap_or_default()
    };
    let unsupported = "Analysis metadata must use the supported JSON flow values.";
    assert_eq!(
        refusal(&RUN.replacen("mode: \"architecture\"", "mode: architecture", 1)),
        unsupported
    );
    assert_eq!(refusal(&nested(128)), unsupported);
    assert_eq!(
        refusal(&nested(127)),
        "run has missing or unsupported fields.",
        "a value nested 127 levels is read; the field is what the format does not know"
    );
    let half = RUN.replace("Which module owns checkout? \u{1f600}", "\\ud83d");
    assert_ne!(half, RUN);
    assert_eq!(refusal(&half), unsupported);
}

#[test]
fn a_basis_of_five_thousand_documents_is_checked_for_repeats_in_well_under_a_tenth_of_a_second() {
    let documents: Vec<String> = (0..5000)
        .map(|index| {
            format!(
                "{{\"slug\":\"capabilities/n{index:04}\",\"digest\":\"sha256:{:064x}\"}}",
                index
            )
        })
        .collect();
    let basis = format!(
        "basis: {{\"graphHash\":\"sha256:{:064x}\",\"sourceFingerprint\":\"fp-1\",\"profileHash\":\"sha256:2a14fad1970b2ebc76d1c9f592d5e0e330a6ee92c6901982018a792bf0265392\",\"documents\":[{}]}}",
        0,
        documents.join(",")
    );
    let before = RUN
        .lines()
        .find(|line| line.starts_with("basis: "))
        .expect("basis line");
    let text = RUN.replacen(before, &basis, 1);
    let started = Instant::now();
    let read = parse_record(&text);
    let took = started.elapsed();
    assert!(
        read.is_ok(),
        "five thousand is the bound, and is allowed: {:?}",
        read.err()
    );
    assert!(took < Duration::from_millis(100), "{took:?}");
}

#[test]
fn a_record_checked_out_with_windows_line_endings_is_still_a_record() {
    // Git on Windows may turn every line feed into a carriage return and a line feed
    // (`core.autocrlf`); the digests cover the evidence text, which is inside the JSON.
    let vault = tempfile::tempdir().expect("temp dir");
    plant(&vault, RUN_FILE, &RUN.replace('\n', "\r\n"));
    let record = written(&archive(&vault).record(RUN_ID).expect("reads"));
    assert!(
        record.contains("The answer, with a line break.\\r\\n\\r\\nSecond"),
        "{record}"
    );
}

#[test]
fn evidence_that_no_longer_matches_its_stamp_is_a_problem_beside_the_records_that_do() {
    let vault = app_vault();
    plant(&vault, RUN_FILE, &RUN.replace("A cart.", "A cart!"));
    let history = written(&archive(&vault).history(&query(30)).expect("lists"));
    assert!(
        history.contains(
            "Analysis evidence integrity failed: evidence_digest_mismatch:capabilities/cart\""
        ),
        "{history}"
    );
    assert!(history.contains("\"returned\":1"), "{history}");
    assert!(history.contains(REVIEW_ID), "{history}");
}

#[test]
fn a_run_calling_itself_grounded_without_a_finished_turn_is_refused() {
    let vault = tempfile::tempdir().expect("temp dir");
    plant(
        &vault,
        RUN_FILE,
        &RUN.replace("\"outcome\":\"completed\"", "\"outcome\":\"failed\""),
    );
    let refused = archive(&vault).record(RUN_ID).err().expect("refused");
    assert_eq!(
        refused.to_string(),
        "Grounded evidence requires a completed turn and completed full-body reads."
    );
}

#[test]
fn a_record_cut_short_or_over_the_byte_limit_is_a_problem_and_never_stops_the_page() {
    let vault = app_vault();
    let torn = "2026-11-26T09-00-00-000Z-11111111-2222-4333-8444-555555555555.md";
    plant(&vault, torn, &RUN[..500]);
    let huge = "2026-11-25T09-00-00-000Z-11111111-2222-4333-8444-666666666666.md";
    plant(&vault, huge, &"x".repeat(MAX_RECORD_BYTES + 1));
    let history = written(&archive(&vault).history(&query(30)).expect("lists"));
    assert!(
        history.contains("Analysis frontmatter is incomplete."),
        "{history}"
    );
    assert!(
        history.contains("Analysis record is not a bounded, independent regular file."),
        "{history}"
    );
    assert!(
        history.contains("\"scanned\":4,\"returned\":2"),
        "{history}"
    );
}

#[test]
fn pages_follow_the_cursor_over_a_hundred_and_five_files_without_a_gap_or_a_repeat() {
    let vault = tempfile::tempdir().expect("temp dir");
    for index in 0..105 {
        let name =
            format!("2026-01-01T00-00-00-{index:03}Z-11111111-2222-4333-8444-{index:012}.md");
        plant(&vault, &name, "not a record");
    }
    let first = written(&archive(&vault).history(&query(100)).expect("lists"));
    assert!(
        first.contains("\"totalFiles\":105,\"scanned\":100"),
        "{first}"
    );
    assert!(first.contains("\"hasMore\":true"), "{first}");
    let cursor = "2026-01-01T00-00-00-005Z-11111111-2222-4333-8444-000000000005.md";
    assert!(
        first.contains(&format!("\"nextCursor\":\"{cursor}\"")),
        "{first}"
    );
    let rest = HistoryQuery {
        limit: limit(100),
        cursor: Some(cursor.to_string()),
        ..HistoryQuery::default()
    };
    let second = written(&archive(&vault).history(&rest).expect("lists"));
    assert!(
        second.contains("\"totalFiles\":105,\"scanned\":5"),
        "{second}"
    );
    assert!(second.contains("\"hasMore\":false"), "{second}");
    assert!(
        !second.contains(&format!("\"fileName\":\"{cursor}\"")),
        "the cursor's own file is on the first page"
    );
}

#[test]
fn a_run_is_held_to_the_mode_and_project_asked_for_and_a_review_never_is() {
    let vault = app_vault();
    let by_mode = HistoryQuery {
        mode: Some(AnalysisMode::Meaning),
        ..query(30)
    };
    let answer = written(&archive(&vault).history(&by_mode).expect("lists"));
    assert!(answer.contains("\"scanned\":2,\"returned\":1"), "{answer}");
    assert!(answer.contains("\"recordType\":\"review\""), "{answer}");
    let by_project = HistoryQuery {
        project: Some("projects/storefront".to_string()),
        ..query(30)
    };
    let answer = written(&archive(&vault).history(&by_project).expect("lists"));
    assert!(answer.contains("\"returned\":2"), "{answer}");
    let other = HistoryQuery {
        project: Some("projects/other".to_string()),
        ..query(30)
    };
    let answer = written(&archive(&vault).history(&other).expect("lists"));
    assert!(answer.contains("\"returned\":1"), "{answer}");
}

#[test]
fn a_record_is_found_by_its_id_and_a_wrong_id_says_why() {
    let vault = app_vault();
    assert_eq!(
        archive(&vault).record("none").err(),
        Some(ArchiveError::InvalidRecordId)
    );
    assert_eq!(
        archive(&vault)
            .record("11111111-1111-4111-8111-111111111111")
            .err(),
        Some(ArchiveError::NotFound)
    );
    let twin = format!("2026-11-28T09-15-30-123Z-{RUN_ID}.md");
    plant(&vault, &twin, RUN);
    assert_eq!(
        archive(&vault).record(RUN_ID).err(),
        Some(ArchiveError::Ambiguous)
    );
    let empty = tempfile::tempdir().expect("temp dir");
    assert_eq!(
        archive(&empty).record(RUN_ID).err(),
        Some(ArchiveError::NotFound)
    );
    assert!(archive(&empty).history(&query(30)).is_ok());
    let cursor = HistoryQuery {
        cursor: Some("../x".to_string()),
        ..query(30)
    };
    assert_eq!(
        archive(&empty).history(&cursor).err(),
        Some(ArchiveError::InvalidCursor)
    );
}

#[cfg(unix)]
#[test]
fn a_link_where_the_archive_or_a_record_belongs_reads_nothing_outside_the_vault() {
    use std::os::unix::fs::symlink;
    let outside = tempfile::tempdir().expect("temp dir");
    std::fs::write(outside.path().join(RUN_FILE), RUN).expect("file");

    let linked_folder = tempfile::tempdir().expect("temp dir");
    std::fs::create_dir(linked_folder.path().join(".ontology-atlas")).expect("folder");
    symlink(
        outside.path(),
        linked_folder
            .path()
            .join(".ontology-atlas")
            .join(ARCHIVE_FOLDER),
    )
    .expect("link");
    assert_eq!(
        archive(&linked_folder).history(&query(30)).err(),
        Some(ArchiveError::FolderRefused)
    );
    assert_eq!(
        archive(&linked_folder).record(RUN_ID).err(),
        Some(ArchiveError::FolderRefused)
    );

    let linked_record = tempfile::tempdir().expect("temp dir");
    let folder = linked_record
        .path()
        .join(".ontology-atlas")
        .join(ARCHIVE_FOLDER);
    std::fs::create_dir_all(&folder).expect("folder");
    symlink(outside.path().join(RUN_FILE), folder.join(RUN_FILE)).expect("link");
    let history = written(&archive(&linked_record).history(&query(30)).expect("lists"));
    assert!(
        history.contains("Analysis record is not a bounded, independent regular file."),
        "{history}"
    );
    assert!(history.contains("\"returned\":0"), "{history}");
}

#[cfg(unix)]
#[test]
fn a_pipe_at_a_record_name_is_a_problem_and_never_holds_the_call() {
    let vault = app_vault();
    let folder = vault.path().join(".ontology-atlas").join(ARCHIVE_FOLDER);
    let pipe = "2026-11-24T09-00-00-000Z-11111111-2222-4333-8444-999999999999.md";
    let made = std::process::Command::new("mkfifo")
        .arg(folder.join(pipe))
        .status()
        .expect("run mkfifo");
    assert!(made.success());
    let history = written(&archive(&vault).history(&query(30)).expect("lists"));
    assert!(
        history.contains(&format!(
            "{{\"fileName\":\"{pipe}\",\"reason\":\"Analysis record is not a bounded, independent regular file.\"}}"
        )),
        "{history}"
    );
    assert!(history.contains("\"returned\":2"), "{history}");
}
