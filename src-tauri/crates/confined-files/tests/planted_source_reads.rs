//! Planted hostile source trees, mirroring
//! `mcp/src/infer-imports/confinement/confined-source-fs.test.mjs`: a link out, a replaced tree,
//! an incomplete census, and the limits.

#![cfg(unix)]

use std::fs;
use std::os::unix::fs::symlink;
use std::path::{Path, PathBuf};

use confined_files::{
    DiskSource, EntryKind, ScanRoots, SnapshotError, SourceFiles, SourceReadError, SourceSnapshot,
};
use serde_json::{json, Value};

/// The census the app would hand over: a walk of `root` that lists links as links and carries
/// every file's text, hidden names left out.
fn capture(root: &Path) -> Value {
    let mut entries = Vec::new();
    capture_into(root, ".", &mut entries);
    json!({
        "contract": "confinedSourceSnapshot:v1",
        "rootPath": root,
        "truncated": false,
        "entries": entries,
    })
}

fn capture_into(path: &Path, relative: &str, entries: &mut Vec<Value>) {
    let metadata = fs::symlink_metadata(path).expect("stat");
    if metadata.file_type().is_symlink() {
        entries.push(json!({ "path": relative, "kind": "symlink" }));
    } else if metadata.is_dir() {
        let mut names: Vec<String> = fs::read_dir(path)
            .expect("list")
            .filter_map(Result::ok)
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .filter(|name| !name.starts_with('.'))
            .collect();
        names.sort();
        entries.push(json!({ "path": relative, "kind": "directory", "children": names }));
        for name in names {
            let child = if relative == "." {
                name.clone()
            } else {
                format!("{relative}/{name}")
            };
            capture_into(&path.join(&name), &child, entries);
        }
    } else {
        let text = fs::read_to_string(path).expect("text");
        entries.push(json!({ "path": relative, "kind": "file", "size": text.len(), "text": text }));
    }
}

struct Tree {
    _directory: tempfile::TempDir,
    base: PathBuf,
    root: PathBuf,
}

fn tree() -> Tree {
    let directory = tempfile::tempdir().expect("temp dir");
    let base = dunce::canonicalize(directory.path()).expect("real");
    let root = base.join("repo");
    fs::create_dir_all(root.join("src")).expect("src");
    Tree {
        _directory: directory,
        base,
        root,
    }
}

fn census(value: &Value) -> Result<SourceSnapshot, SnapshotError> {
    SourceSnapshot::from_json(&value.to_string())
}

#[test]
fn an_authored_source_root_link_is_captured_as_a_link_and_refused_on_every_read() {
    let tree = tree();
    let outside = tree.base.join("outside");
    fs::create_dir(&outside).expect("outside");
    fs::write(outside.join("a.ts"), "import './b';").expect("a");
    fs::write(outside.join("b.ts"), "export const b = 1;").expect("b");
    symlink(&outside, tree.root.join("linked")).expect("link");
    let snapshot = census(&capture(&tree.root)).expect("census");
    let source = snapshot.source_for(&tree.root).expect("source");
    for path in ["linked", "linked/a.ts"] {
        let refused = source.list_directory(&tree.root.join(path));
        assert!(
            matches!(
                refused,
                Err(SourceReadError::Refused(_)) | Err(SourceReadError::Absent)
            ),
            "{path}: {refused:?}"
        );
    }
    assert!(
        source.read_text(&tree.root.join("linked")).is_err(),
        "the link itself is never read"
    );
    assert_eq!(
        source.finish().err(),
        Some(SnapshotError::Refused("symlink".to_string())),
        "the run fails closed"
    );
}

#[test]
fn a_symlinked_resolver_config_fails_the_run_even_when_the_parser_catches_the_error() {
    let tree = tree();
    fs::write(tree.base.join("config.json"), "{\"compilerOptions\":{}}").expect("config");
    symlink(
        tree.base.join("config.json"),
        tree.root.join("tsconfig.json"),
    )
    .expect("link");
    fs::write(tree.root.join("src/a.ts"), "import 'policy';").expect("a");
    let snapshot = census(&capture(&tree.root)).expect("census");
    let source = snapshot.source_for(&tree.root).expect("source");
    // The parser swallows the failure and falls back to defaults, as the JavaScript one does.
    let parsed = source
        .read_text(&tree.root.join("tsconfig.json"))
        .unwrap_or_default();
    assert_eq!(parsed, "");
    assert!(source.finish().is_err());
}

#[test]
fn a_climbing_or_absolute_probe_is_refused_without_reaching_the_disk() {
    let tree = tree();
    fs::write(tree.root.join("src/a.ts"), "import '../../outside';").expect("a");
    fs::write(tree.base.join("outside.ts"), "export const value = 1;").expect("outside");
    let snapshot = census(&capture(&tree.root)).expect("census");
    let source = snapshot.source_for(&tree.root).expect("source");
    for probe in [
        tree.base.join("outside.ts"),
        tree.root.join("../outside.ts"),
        tree.root.join("src/../../outside.ts"),
    ] {
        assert_eq!(
            source.kind(&probe),
            Err(SourceReadError::Refused(
                "outside approved root".to_string()
            )),
            "{}",
            probe.display()
        );
    }
    assert_eq!(
        source.finish().err(),
        Some(SnapshotError::Refused("outside approved root".to_string()))
    );
}

#[test]
fn the_scan_reads_the_captured_bytes_even_if_the_files_are_replaced_after_capture() {
    let tree = tree();
    fs::write(tree.root.join("src/a.ts"), "import './old';").expect("a");
    fs::write(tree.root.join("src/old.ts"), "export const old = 1;").expect("old");
    let snapshot = census(&capture(&tree.root)).expect("census");
    // After the capture the tree is replaced by a link to a folder that holds a sentinel.
    fs::remove_dir_all(tree.root.join("src")).expect("remove");
    let outside = tree.base.join("outside");
    fs::create_dir(&outside).expect("outside");
    fs::write(outside.join("a.ts"), "import './private';").expect("a");
    fs::write(outside.join("private.ts"), "outside sentinel").expect("sentinel");
    symlink(&outside, tree.root.join("src")).expect("link");

    let source = snapshot.source_for(&tree.root).expect("source");
    assert_eq!(
        source.read_text(&tree.root.join("src/a.ts")).as_deref(),
        Ok("import './old';")
    );
    assert_eq!(source.kind(&tree.root.join("src/private.ts")), Ok(None));
    let boundary = source.finish().expect("boundary");
    assert!(!serde_json::to_string(&boundary)
        .expect("json")
        .contains("sentinel"));

    // The disk reader, asked the same question now, refuses: the tree is a link.
    let roots = ScanRoots::new(tree.root.clone(), tree.root.clone());
    let disk = DiskSource::new(&roots.allow(&tree.root, "rootPath").expect("allowed"));
    assert_eq!(
        disk.read_text(&tree.root.join("src/a.ts")),
        Err(SourceReadError::Refused("symlink".to_string()))
    );
    assert_eq!(
        disk.link_kind(&tree.root.join("src")),
        Ok(Some(EntryKind::Symlink))
    );
}

#[test]
fn missing_bytes_and_an_incomplete_census_cannot_become_a_quiet_success() {
    let tree = tree();
    fs::write(tree.root.join("src/a.ts"), "import 'policy';").expect("a");
    fs::write(tree.root.join("tsconfig.json"), "{}").expect("config");
    let mut value = capture(&tree.root);
    if let Some(entries) = value["entries"].as_array_mut() {
        for entry in entries.iter_mut() {
            if entry["path"] == "tsconfig.json" {
                entry.as_object_mut().expect("object").remove("text");
            }
        }
    }
    let snapshot = census(&value).expect("census");
    let source = snapshot.source_for(&tree.root).expect("source");
    assert_eq!(
        source.read_text(&tree.root.join("tsconfig.json")),
        Err(SourceReadError::Refused(
            "file bytes unavailable in snapshot".to_string()
        ))
    );
    assert!(source.finish().is_err());
    value["truncated"] = json!(true);
    assert_eq!(census(&value).err(), Some(SnapshotError::Incomplete));
}

#[test]
fn a_census_of_an_empty_namespace_answers_from_the_census_not_from_the_folder_it_names() {
    let tree = tree();
    fs::write(tree.root.join("src/a.ts"), "import './b';").expect("a");
    fs::write(tree.root.join("src/b.ts"), "export const b = 1;").expect("b");
    let mut value = capture(&tree.root);
    let empty = tree.base.join("empty-namespace");
    fs::create_dir(&empty).expect("empty");
    value["rootPath"] = json!(empty);
    // Entries still name `src/...`, so the census is valid for the empty folder's path.
    let snapshot = census(&value).expect("census");
    let source = snapshot.source_for(&empty).expect("source");
    assert_eq!(
        source.read_text(&empty.join("src/a.ts")).as_deref(),
        Ok("import './b';")
    );
    assert!(
        !empty.join("src").exists(),
        "nothing was ever on the disk there"
    );
}

#[test]
fn a_hidden_or_credential_file_cannot_be_smuggled_into_a_census() {
    let tree = tree();
    for path in [
        ".env",
        "src/.git/config",
        "keys/server.pem",
        "secrets/token.txt",
        "id_rsa",
    ] {
        let value = json!({
            "contract": "confinedSourceSnapshot:v1",
            "rootPath": tree.root,
            "truncated": false,
            "entries": [{ "path": path, "kind": "file", "text": "x" }],
        });
        assert_eq!(
            census(&value).err(),
            Some(SnapshotError::Refused("private or hidden path".to_string())),
            "{path}"
        );
    }
}

#[test]
fn the_disk_reader_and_the_census_agree_on_what_a_hidden_name_is() {
    let tree = tree();
    fs::write(tree.root.join(".env"), "TOKEN=1").expect("env");
    fs::write(tree.root.join("src/a.ts"), "x").expect("a");
    let roots = ScanRoots::new(tree.root.clone(), tree.root.clone());
    let disk = DiskSource::new(&roots.allow(&tree.root, "rootPath").expect("allowed"));
    let snapshot = census(&capture(&tree.root)).expect("census");
    let source = snapshot.source_for(&tree.root).expect("source");
    for path in [tree.root.join(".env"), tree.root.join("src/.git/config")] {
        assert_eq!(
            disk.read_text(&path).err(),
            source.read_text(&path).err(),
            "{}",
            path.display()
        );
    }
}
