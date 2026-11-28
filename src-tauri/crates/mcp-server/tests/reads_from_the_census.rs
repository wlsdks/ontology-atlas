//! The scanning tools with `OATLAS_CONFINED_SOURCE_READS=1`: they answer from the census the app
//! passes on descriptor 198 and from nothing else. A file the census does not list is never read
//! even when it lies on the disk, a link in the census is never followed, and a census that is
//! missing, unreadable or of another folder refuses the call instead of falling back to the disk.
//! The script server's answers for the same censuses are compared by the differential harness
//! (family `safety`, cases `confined-*`).

#![cfg(unix)]
#![allow(
    clippy::disallowed_methods,
    clippy::disallowed_types,
    clippy::indexing_slicing,
    reason = "these tests plant the files a repository holds, start the program, and read answers by key"
)]

mod support;

use std::path::{Path, PathBuf};

use serde_json::{json, Value};
use support::{call, run_to_end_with_census, Program};

const SENTINEL: &str = "DISK_ONLY_SENTINEL";

struct Scene {
    _folder: tempfile::TempDir,
    /// The folder the census is of, real, and the server's repository root.
    repository: PathBuf,
    /// A folder beside it that no census lists.
    outside: PathBuf,
    vault: PathBuf,
}

fn write(path: &Path, text: &str) {
    std::fs::create_dir_all(path.parent().expect("a parent")).expect("folder");
    std::fs::write(path, text).expect("write");
}

fn scene() -> Scene {
    let folder = tempfile::tempdir().expect("temp dir");
    let base = real_path(folder.path());
    let repository = base.join("repository");
    let outside = base.join("outside");
    let vault = base.join("vault");
    std::fs::create_dir_all(&repository).expect("repository");
    write(&vault.join("README.md"), "# Vault\n");
    Scene {
        _folder: folder,
        repository,
        outside,
        vault,
    }
}

/// The real path, as the server names a root: no `/var` link on macOS.
fn real_path(path: &Path) -> PathBuf {
    path.canonicalize().expect("real path")
}

fn directory(path: &str, children: &[&str]) -> Value {
    json!({ "path": path, "kind": "directory", "children": children })
}

fn file(path: &str, text: &str) -> Value {
    json!({ "path": path, "kind": "file", "size": text.len(), "text": text })
}

fn census(scene: &Scene, entries: &[Value]) -> Value {
    json!({
        "contract": "confinedSourceSnapshot:v1",
        "rootPath": scene.repository,
        "truncated": false,
        "entries": entries,
    })
}

/// The answer text and whether it was a refusal, for one call of `tool` under `census`.
fn ask(scene: &Scene, census: Option<&Value>, tool: &str, arguments: &str) -> (bool, String) {
    let file = census.map(|value| {
        let path = scene.vault.parent().expect("a base").join("census.json");
        write(&path, &value.to_string());
        path
    });
    let vault = scene.vault.to_string_lossy().into_owned();
    let repository = scene.repository.to_string_lossy().into_owned();
    let run = run_to_end_with_census(
        Program::Rust,
        &[
            ("OATLAS_VAULT", &vault),
            ("OATLAS_REPO_ROOT", &repository),
            ("OATLAS_CONFINED_SOURCE_READS", "1"),
            ("OATLAS_SOURCE_SNAPSHOT_FD", "198"),
        ],
        file.as_deref(),
        call(1, tool, arguments).as_bytes(),
    );
    let answer: Value = serde_json::from_str(run.lines.first().expect("an answer")).expect("json");
    let result = &answer["result"];
    (
        result["isError"].as_bool().unwrap_or(false),
        result["content"][0]["text"]
            .as_str()
            .expect("a text answer")
            .to_string(),
    )
}

fn captured_pair(scene: &Scene) -> Value {
    census(
        scene,
        &[
            directory(".", &["src"]),
            directory("src", &["a.ts", "b.ts"]),
            file("src/a.ts", "import './b';\n"),
            file("src/b.ts", "export const b = 1;\n"),
        ],
    )
}

#[test]
fn a_file_on_the_disk_that_the_census_does_not_list_is_never_read() {
    let scene = scene();
    write(
        &scene.repository.join("src/a.ts"),
        &format!("import './planted'; // {SENTINEL}\n"),
    );
    write(
        &scene.repository.join("src/planted.ts"),
        &format!("export const planted = '{SENTINEL}';\n"),
    );
    let (refused, text) = ask(
        &scene,
        Some(&captured_pair(&scene)),
        "infer_imports",
        "{\"reconcile\":false}",
    );
    assert!(!refused, "{text}");
    let answer: Value = serde_json::from_str(&text).expect("json");
    assert_eq!(answer["filesScanned"], 2, "only the census's two files");
    assert!(!text.contains(SENTINEL), "no disk byte is in the answer");
    assert!(
        !text.contains("planted"),
        "the planted file is neither an edge nor a lookup that found it: {text}"
    );
    let edges = answer["edges"].as_array().expect("edges");
    assert_eq!(edges.len(), 1, "{edges:?}");
    assert_eq!(edges[0]["to"], "src/b.ts", "the census's own file");
}

#[test]
fn a_tree_replaced_by_a_link_after_the_census_was_taken_changes_nothing() {
    let scene = scene();
    write(&scene.outside.join("a.ts"), &format!("import './secret'; // {SENTINEL}\n"));
    write(&scene.outside.join("secret.ts"), &format!("export const s = '{SENTINEL}';\n"));
    std::os::unix::fs::symlink(&scene.outside, scene.repository.join("src")).expect("link");
    let (refused, text) = ask(
        &scene,
        Some(&captured_pair(&scene)),
        "infer_imports",
        "{\"reconcile\":false}",
    );
    assert!(!refused, "{text}");
    assert!(!text.contains(SENTINEL), "nothing came from behind the link");
    let answer: Value = serde_json::from_str(&text).expect("json");
    assert_eq!(answer["edges"][0]["to"], "src/b.ts");
}

#[test]
fn a_link_the_census_lists_is_refused_and_never_followed() {
    let scene = scene();
    write(&scene.outside.join("a.ts"), &format!("export const a = '{SENTINEL}';\n"));
    std::os::unix::fs::symlink(&scene.outside, scene.repository.join("linked")).expect("link");
    let linked = census(
        &scene,
        &[
            directory(".", &["linked"]),
            json!({ "path": "linked", "kind": "symlink" }),
        ],
    );
    let (refused, text) = ask(
        &scene,
        Some(&linked),
        "infer_imports",
        "{\"sourceFolders\":[\"linked\"],\"reconcile\":false}",
    );
    assert!(refused, "{text}");
    assert_eq!(text, "Error: Confined source read refused: symlink");
}

#[test]
fn a_breadth_map_lists_what_the_census_lists_and_not_what_lies_on_the_disk() {
    let scene = scene();
    write(&scene.repository.join("src/a.ts"), "export function onDisk(): void {}\n");
    write(&scene.repository.join("src/planted.ts"), &format!("// {SENTINEL}\n"));
    let listed = census(
        &scene,
        &[
            directory(".", &["src"]),
            directory("src", &["a.ts"]),
            file("src/a.ts", "export function inCensus(): void {}\n"),
        ],
    );
    let (refused, text) = ask(&scene, Some(&listed), "analyze_repo_structure", "{}");
    assert!(!refused, "{text}");
    assert!(text.contains("inCensus"), "{text}");
    assert!(!text.contains("onDisk"), "{text}");
    assert!(!text.contains("planted"), "{text}");
}

#[test]
fn without_a_usable_census_every_scanning_tool_refuses_and_reads_nothing() {
    let scene = scene();
    write(&scene.repository.join("src/a.ts"), &format!("export const a = '{SENTINEL}';\n"));
    let mut truncated = captured_pair(&scene);
    truncated["truncated"] = json!(true);
    let mut contract = captured_pair(&scene);
    contract["contract"] = json!("confinedSourceSnapshot:v2");
    let mut another_root = captured_pair(&scene);
    another_root["rootPath"] = json!(scene.outside);
    let unusable = [
        (None, "Confined source snapshot descriptor is unavailable"),
        (Some(truncated), "Confined source snapshot is incomplete"),
        (Some(contract), "Confined source snapshot is incomplete"),
        (Some(another_root), "Confined source snapshot root mismatch"),
    ];
    for (census, message) in &unusable {
        for tool in ["infer_imports", "analyze_repo_structure"] {
            let (refused, text) = ask(&scene, census.as_ref(), tool, "{}");
            assert!(refused, "{tool}: {text}");
            assert_eq!(text, format!("Error: {message}"), "{tool}");
        }
    }
}

#[test]
fn selected_reads_are_refused_while_the_app_supplies_a_census() {
    let scene = scene();
    write(&scene.repository.join("src/a.ts"), &format!("export const a = '{SENTINEL}';\n"));
    let (refused, text) = ask(
        &scene,
        Some(&captured_pair(&scene)),
        "analyze_repo_structure",
        "{\"sourceReads\":[{\"path\":\"src/a.ts\",\"mode\":\"outline\"}]}",
    );
    assert!(refused, "{text}");
    assert!(text.contains("sourceReads is not available"), "{text}");
    assert!(!text.contains(SENTINEL));
}
