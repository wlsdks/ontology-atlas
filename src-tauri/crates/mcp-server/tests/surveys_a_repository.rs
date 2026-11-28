//! `analyze_repo_structure` over a throwaway repository, driven over standard input and output:
//! the breadth map lists the product units, the entry points and the ignored-folder rule, a tree
//! made to hang or to leak does neither, and the parts of the tool this build does not answer are
//! refused by name. The script server's answers for the same shapes are compared by the
//! differential harness (family `survey`).

#![allow(
    clippy::disallowed_methods,
    clippy::disallowed_types,
    clippy::indexing_slicing,
    reason = "these tests start git and the program, plant the files a repository holds, and read answers by key"
)]

mod support;

use std::path::{Path, PathBuf};
use std::process::Command;

use serde_json::Value;
use support::{call, run_to_end, Program};

fn git(folder: &Path, args: &[&str]) {
    let null_device = if cfg!(windows) { "NUL" } else { "/dev/null" };
    let output = Command::new("git")
        .args(["-c", "user.name=test", "-c", "user.email=test@example.invalid"])
        .args(["-c", "commit.gpgsign=false"])
        .args(args)
        .current_dir(folder)
        .env("GIT_CONFIG_GLOBAL", null_device)
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .output()
        .expect("git runs");
    assert!(
        output.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}

fn write(root: &Path, name: &str, text: &str) {
    let file = root.join(name);
    std::fs::create_dir_all(file.parent().expect("a parent")).expect("folder");
    std::fs::write(file, text).expect("write");
}

/// The real path as the server prints it. On Windows `canonicalize` returns a verbatim `\\?\`
/// path (std::fs::canonicalize documentation), and the server prints it without the prefix.
fn real_path(path: &Path) -> PathBuf {
    let real = path.canonicalize().expect("real path");
    PathBuf::from(real.to_string_lossy().trim_start_matches(r"\\?\"))
}

fn survey(repository: &Path, arguments: &str) -> Value {
    let vault = repository.join("ontology");
    let run = run_to_end(
        Program::Rust,
        &[("OATLAS_VAULT", &vault.to_string_lossy())],
        call(1, "analyze_repo_structure", arguments).as_bytes(),
    );
    let answer: Value = serde_json::from_str(run.lines.first().expect("an answer")).expect("json");
    answer["result"].clone()
}

fn text_of(result: &Value) -> String {
    result["content"][0]["text"]
        .as_str()
        .expect("a text answer")
        .to_string()
}

fn repository() -> (tempfile::TempDir, PathBuf) {
    let scene = tempfile::tempdir().expect("temp dir");
    let root = real_path(scene.path());
    git(&root, &["init", "-q", "-b", "main"]);
    write(&root, "ontology/README.md", "# Vault\n");
    write(&root, ".gitignore", "cache-out/\n");
    write(&root, "cache-out/built.ts", "export const built = 1;\n");
    write(
        &root,
        "package.json",
        "{ \"name\": \"shop\", \"bin\": { \"shop\": \"src/cli.ts\" } }\n",
    );
    write(
        &root,
        "src/cli.ts",
        "export function run(): void {}\nexport function stop(): void {}\n",
    );
    write(&root, "src/order/place.ts", "export class Place {}\n");
    write(&root, "src/order/place.test.ts", "export const t = 1;\n");
    (scene, root)
}

#[test]
fn the_map_lists_units_and_entry_points_and_leaves_out_tests_and_ignored_folders() {
    let (_scene, root) = repository();
    let text = text_of(&survey(&root, "{}"));
    assert!(
        text.starts_with("Breadth map of "),
        "the map opens with its size: {text}"
    );
    assert!(text.contains("(left out: test 1 files 1 lines)"), "{text}");
    assert!(text.contains("\nsrc | 1 | 2 | cli.ts (2) | run, stop | 0 | -\n"), "{text}");
    assert!(text.contains("\nsrc/order | 1 | 1 | place.ts (1) | Place | 0 | -\n"), "{text}");
    assert!(text.contains("\ncommand src/cli.ts shop\n"), "{text}");
    assert!(!text.contains("cache-out"), "a folder Git ignores is not counted: {text}");
}

#[test]
fn a_part_this_build_does_not_answer_is_refused_by_name_and_a_bad_argument_by_its_own_words() {
    let (_scene, root) = repository();
    for (arguments, words) in [
        (
            r#"{"sourceReads":[{"path":"src/cli.ts","mode":"outline"}]}"#,
            "sourceReads is not answered by this build",
        ),
        (
            r#"{"proposal":{"concepts":[]}}"#,
            "Reviewing a proposal or a qualification is not answered by this build",
        ),
        (r#"{"view":"nonsense"}"#, "view must be \"breadth\" or \"analysis\"."),
        (r#"{"maxDepth":99}"#, "maxDepth must be <= 10."),
        (
            r#"{"sourceOnly":true}"#,
            "sourceOnly requires sourceReads with 1\u{2013}16 exact selectors.",
        ),
    ] {
        let result = survey(&root, arguments);
        assert_eq!(result["isError"], true, "{arguments}");
        assert!(text_of(&result).contains(words), "{arguments}: {result}");
    }
}

#[test]
fn the_analysis_names_what_the_scan_found_and_a_repository_with_cargo_is_refused_by_name() {
    let (_scene, root) = repository();
    let result = survey(&root, r#"{"view":"analysis"}"#);
    assert_ne!(result["isError"], true, "{result}");
    let answer = &result["structuredContent"];
    assert_eq!(answer["proposalValidation"]["status"], "not-provided", "{answer}");
    assert_eq!(answer["proposalValidation"]["canWrite"], false, "{answer}");
    assert_eq!(answer["rootPath"], root.to_string_lossy().as_ref(), "{answer}");
    write(&root, "Cargo.toml", "[package]\nname = \"shop\"\n");
    let refused = survey(&root, r#"{"view":"analysis"}"#);
    assert_eq!(refused["isError"], true, "{refused}");
    assert!(text_of(&refused).contains("root Cargo.toml"), "{refused}");
}

#[cfg(unix)]
#[test]
fn a_link_loop_a_link_out_and_a_credential_name_neither_hang_nor_reach_the_map() {
    let (_scene, root) = repository();
    let outside = tempfile::tempdir().expect("outside");
    write(outside.path(), "stolen.ts", "export const SECRET_SENTINEL_outside = 1;\n");
    std::os::unix::fs::symlink("loop-b", root.join("src/loop-a")).expect("link");
    std::os::unix::fs::symlink("loop-a", root.join("src/loop-b")).expect("link");
    std::os::unix::fs::symlink(outside.path(), root.join("src/out")).expect("link");
    write(&root, "src/secrets.ts", "export const SECRET_SENTINEL_name = 1;\n");
    let text = text_of(&survey(&root, "{}"));
    assert!(!text.contains("SECRET_SENTINEL"), "{text}");
    assert!(!text.contains("stolen"), "a link out of the root is never followed: {text}");
    assert!(!text.contains("secrets"), "{text}");
    assert!(text.contains("\nsrc | 1 | 2 | cli.ts (2) | run, stop | 0 | -\n"), "{text}");
}
