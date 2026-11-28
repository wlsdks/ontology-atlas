//! The reads a call makes against a real folder: what is served, what is refused by name, and what a
//! session remembers of the lines it served.

#![allow(
    clippy::disallowed_methods,
    reason = "a test plants the files a read opens, which the crate otherwise never writes"
)]

use confined_files::{ScanRoots, SourceRoot};
use source_reads::{
    parse_source_reads, read_source_evidence, RefusalReason, SessionReads, SourceEvidence,
    SourceRow,
};

fn repository(files: &[(&str, &str)]) -> (tempfile::TempDir, SourceRoot) {
    let base = tempfile::tempdir().expect("temp dir");
    let real = std::fs::canonicalize(base.path()).expect("real");
    for (name, text) in files {
        let path = real.join(name);
        std::fs::create_dir_all(path.parent().expect("parent")).expect("folder");
        std::fs::write(path, text).expect("file");
    }
    let root = ScanRoots::new(real.clone(), real.clone())
        .expect("roots")
        .allow(&real, "rootPath")
        .expect("allowed");
    (base, root)
}

fn evidence(root: &SourceRoot, selectors: serde_json::Value) -> SourceEvidence {
    let selectors = parse_source_reads(&selectors).expect("selectors");
    read_source_evidence(root, &selectors, &[], &|| false)
}

fn refusal_of(row: &SourceRow) -> Option<RefusalReason> {
    match row {
        SourceRow::Refused { reason, .. } | SourceRow::Omitted { reason, .. } => Some(*reason),
        _ => None,
    }
}

#[test]
fn a_symbol_is_read_with_its_callee_and_each_path_a_stranger_could_plant_is_refused() {
    let (_base, root) = repository(&[
        (
            "src/order.ts",
            "import { charge } from './pay';\n\nexport function place(n: number): string {\n  return charge(n);\n}\n",
        ),
        (
            "src/pay.ts",
            "export function charge(n: number): string {\n  if (n < 0) {\n    throw new Error('negative');\n  }\n  return `charged-${n}`;\n}\n",
        ),
        (".env", "TOKEN=SECRET\n"),
    ]);
    let read = evidence(
        &root,
        serde_json::json!([
            { "path": "src/order.ts", "symbol": "place" },
            { "path": ".env", "mode": "outline" },
            { "path": "../outside.ts", "mode": "outline" },
            { "path": "src/missing.ts", "mode": "outline" },
        ]),
    );
    let Some(SourceRow::Read(placed)) = read.rows.first() else {
        panic!("the symbol is read: {:?}", read.rows.first());
    };
    assert_eq!((placed.start_line, placed.end_line), (3, 5));
    assert_eq!(
        placed
            .callees
            .iter()
            .flatten()
            .map(|callee| (callee.name.as_str(), callee.path.as_str(), callee.line))
            .collect::<Vec<_>>(),
        [("charge", "src/pay.ts", 1)]
    );
    assert!(
        placed
            .context
            .iter()
            .any(|part| part.cite == "src/pay.ts:L1-L6"),
        "the callee refuses on a condition, so it is served beside the body"
    );
    let reasons: Vec<_> = read.rows.iter().skip(1).map(refusal_of).collect();
    assert_eq!(
        reasons,
        [
            Some(RefusalReason::SensitivePath),
            Some(RefusalReason::PathTraversal),
            Some(RefusalReason::NotFound),
        ]
    );
}

#[cfg(unix)]
#[test]
fn a_link_a_binary_file_and_a_line_past_the_range_limit_are_refused_by_name() {
    let (base, root) = repository(&[("src/a.ts", "export const a = 1;\n")]);
    let real = std::fs::canonicalize(base.path()).expect("real");
    std::os::unix::fs::symlink("/etc/hosts", real.join("src/escape.ts")).expect("link");
    std::fs::write(real.join("src/binary.ts"), b"export const a = 1;\0\0").expect("binary");
    std::fs::write(
        real.join("src/wide.ts"),
        format!("const w = '{}';\n", "x".repeat(9000)),
    )
    .expect("wide");
    let read = evidence(
        &root,
        serde_json::json!([
            { "path": "src/escape.ts", "mode": "outline" },
            { "path": "src/binary.ts", "mode": "outline" },
            { "path": "src/wide.ts", "startLine": 1, "maxLines": 1 },
            { "path": "src/a.ts", "startLine": 2, "maxLines": 1 },
        ]),
    );
    let reasons: Vec<_> = read.rows.iter().map(refusal_of).collect();
    assert_eq!(
        reasons,
        [
            Some(RefusalReason::SymlinkPath),
            Some(RefusalReason::BinarySource),
            Some(RefusalReason::LineTooLarge),
            Some(RefusalReason::RangeBeyondEof),
        ]
    );
}

#[test]
fn a_range_counts_as_read_until_its_lines_change() {
    let (base, root) = repository(&[("src/a.ts", "export const a = 1;\nexport const b = 2;\n")]);
    let served = evidence(
        &root,
        serde_json::json!([{ "path": "src/a.ts", "startLine": 1, "maxLines": 1 }]),
    );
    let session = SessionReads::new();
    session.record(&root, &served);
    let reads = session.reads_under(&root);
    assert_eq!(reads.reads.get("src/a.ts").map(Vec::len), Some(1));
    let real = std::fs::canonicalize(base.path()).expect("real");
    std::fs::write(
        real.join("src/a.ts"),
        "export const a = 9;\nexport const b = 2;\n",
    )
    .expect("changed");
    assert!(
        session.reads_under(&root).reads.is_empty(),
        "a range whose lines changed since no longer counts"
    );
}

#[test]
fn a_cancelled_call_reads_no_more_selectors() {
    let (_base, root) = repository(&[("src/a.ts", "export const a = 1;\n")]);
    let selectors = parse_source_reads(&serde_json::json!([
        { "path": "src/a.ts", "mode": "outline" },
        { "path": "src/a.ts", "mode": "outline" },
        { "path": "src/a.ts", "mode": "outline" },
    ]))
    .expect("selectors");
    let asked = std::cell::Cell::new(0);
    let read = read_source_evidence(&root, &selectors, &[], &|| {
        asked.set(asked.get() + 1);
        asked.get() > 2
    });
    assert_eq!(read.rows.len(), 2, "cancelled before the third selector");
}

/// The lines a read serves end at `\r\n`, `\n` or a lone `\r`; the record must hash those lines,
/// not the file split another way, or a change inside a served line goes unnoticed.
#[test]
fn a_range_in_a_file_with_lone_carriage_returns_is_judged_by_the_lines_served() {
    let (base, root) = repository(&[(
        "src/old_mac.ts",
        "const a = 1;\rconst b = 2;\rconst c = 3;\r",
    )]);
    let served = evidence(
        &root,
        serde_json::json!([{ "path": "src/old_mac.ts", "startLine": 2, "maxLines": 1 }]),
    );
    let Some(SourceRow::Read(row)) = served.rows.first() else {
        panic!("the line is served: {:?}", served.rows.first());
    };
    assert_eq!(row.text, "const b = 2;\r");
    let session = SessionReads::new();
    session.record(&root, &served);
    let real = std::fs::canonicalize(base.path()).expect("real");
    std::fs::write(
        real.join("src/old_mac.ts"),
        "const a = 1;\rconst b = 9;\rconst c = 3;\r",
    )
    .expect("changed inside the served line");
    assert!(
        session.reads_under(&root).reads.is_empty(),
        "the second line changed, and the record judges that line"
    );
}

#[test]
fn a_rewrite_that_leaves_the_served_lines_alone_keeps_the_range() {
    let (base, root) = repository(&[("src/a.ts", "export const a = 1;\nexport const b = 2;\n")]);
    let served = evidence(
        &root,
        serde_json::json!([{ "path": "src/a.ts", "startLine": 1, "maxLines": 1 }]),
    );
    let session = SessionReads::new();
    session.record(&root, &served);
    let real = std::fs::canonicalize(base.path()).expect("real");
    std::fs::write(
        real.join("src/a.ts"),
        "export const a = 1;\nexport const b = 3;\n",
    )
    .expect("another line changed");
    assert_eq!(
        session
            .reads_under(&root)
            .reads
            .get("src/a.ts")
            .map(Vec::len),
        Some(1),
        "the stamp moved, the served line did not"
    );
}

/// Microsoft, "Naming Files, Paths, and Namespaces": `NUL.txt` is equivalent to `NUL` and `COM1.ts`
/// opens the port. The name is refused before the disk is asked, on every system, so no file need
/// exist and the answer does not depend on where the repository lies.
#[test]
fn a_windows_device_name_is_refused_before_the_disk_is_asked() {
    let (_base, root) = repository(&[("src/a.ts", "export const a = 1;\n")]);
    let read = evidence(
        &root,
        serde_json::json!([
            { "path": "src/CON.ts", "mode": "outline" },
            { "path": "src/dir/nul.tar.ts", "mode": "outline" },
            { "path": "COM1/a.ts", "startLine": 1, "maxLines": 1 },
            { "path": "src/console.ts", "mode": "outline" },
        ]),
    );
    let reasons: Vec<_> = read.rows.iter().map(refusal_of).collect();
    assert_eq!(
        reasons,
        [
            Some(RefusalReason::NotAFileName),
            Some(RefusalReason::NotAFileName),
            Some(RefusalReason::NotAFileName),
            Some(RefusalReason::NotFound),
        ]
    );
}

/// NTFS opens a name by any letter case (Microsoft, "Naming Files, Paths, and Namespaces": "Do not
/// assume case sensitivity"), so a selector that spells a path in other letters than the disk
/// holds reads the file and is served, as it is on a case-insensitive macOS volume.
#[cfg(windows)]
#[test]
fn a_path_in_other_letters_than_the_disk_holds_is_served_on_ntfs() {
    let (_base, root) = repository(&[("src/Order.ts", "export const order = 1;\n")]);
    let read = evidence(
        &root,
        serde_json::json!([{ "path": "SRC/ORDER.TS", "startLine": 1, "maxLines": 1 }]),
    );
    assert!(
        matches!(read.rows.as_slice(), [SourceRow::Read(_)]),
        "{:?}",
        read.rows
    );
}
