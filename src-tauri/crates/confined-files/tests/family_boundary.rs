//! A family crate reaches the disk only through `confined-files` and runs `git` only through
//! `hardened-git`. Two checks hold that, and neither reads source text:
//!
//! 1. Dependencies: every non-dev dependency of a family crate is on that crate's list below. A
//!    crate that wraps the disk (`walkdir`, `ignore`, `tokio`, `memmap2`, `rustix`, `libc`) is
//!    not on any list, so adding one is a review of this table.
//! 2. The standard library: each family crate's `clippy.toml` is `family_clippy.toml`, which
//!    disallows the entry points of `std::fs` and `std::process`. Clippy resolves the item, so
//!    an alias, a macro expansion, a `#[path]` module or a raw string cannot hide a use. A
//!    planted crate holding each of those is linted here to prove the file can fail.
//!
//! `mcp-server` is a family crate for the first check. It has no `clippy.toml` yet: its feature
//! gated test hooks and its tests spawn and write on purpose, and the server slice that owns
//! them adds the file together with the `allow` for those (see `CLIPPY_PENDING`).

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde_json::{json, Value};

/// Crates that may name the standard library's disk and process items: the two this rule
/// protects, and the app's index crate, which carries its own confinement
/// (`vault-index/src/confine.rs`).
const OWNERS: [&str; 3] = ["confined-files", "hardened-git", "vault-index"];

/// The app itself, which is not a family crate.
const APP: &str = "ontology-atlas";

/// The family crates and the only dependencies each may have outside tests. Anything that wraps
/// the disk or a process is absent on purpose.
const FAMILY: [(&str, &[&str]); 4] = [
    ("vault-document", &["confined-files"]),
    ("ontology-graph", &["vault-document"]),
    (
        "source-evidence",
        &["confined-files", "hardened-git", "vault-document"],
    ),
    (
        "mcp-server",
        &[
            "confined-files",
            "hardened-git",
            "vault-document",
            "ontology-graph",
            "source-evidence",
            "ryu-js",
            "regex",
        ],
    ),
];

/// Family crates whose clippy file is added by their own slice, and why.
const CLIPPY_PENDING: [(&str, &str); 1] = [(
    "mcp-server",
    "its test hooks and tests write and spawn on purpose; the slice adds the file with the allow",
)];

const CANONICAL_CLIPPY: &str = include_str!("family_clippy.toml");

fn crates_folder() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("the crates folder")
        .to_path_buf()
}

/// Every offence in a `cargo metadata --no-deps` answer.
fn dependency_offences(metadata: &Value) -> Vec<String> {
    let mut offences = Vec::new();
    let packages = metadata["packages"].as_array().cloned().unwrap_or_default();
    for package in &packages {
        let name = package["name"].as_str().unwrap_or_default();
        if OWNERS.contains(&name) || name == APP {
            continue;
        }
        let Some((_, allowed)) = FAMILY.iter().find(|(family, _)| *family == name) else {
            offences.push(format!(
                "{name} is a workspace crate this check does not know: classify it as an owner, a family crate or the app"
            ));
            continue;
        };
        for dependency in package["dependencies"].as_array().into_iter().flatten() {
            let kind = dependency["kind"].as_str();
            let depends_on = dependency["name"].as_str().unwrap_or_default();
            if kind == Some("dev") || allowed.contains(&depends_on) {
                continue;
            }
            offences.push(format!(
                "{name} depends on {depends_on}, which is not on its list in family_boundary.rs"
            ));
        }
    }
    offences
}

fn package(name: &str, dependencies: &[(&str, Option<&str>)]) -> Value {
    json!({
        "name": name,
        "dependencies": dependencies
            .iter()
            .map(|(dependency, kind)| json!({ "name": dependency, "kind": kind }))
            .collect::<Vec<_>>(),
    })
}

#[test]
fn every_family_crate_depends_only_on_what_its_list_names() {
    let manifest = crates_folder().join("../Cargo.toml");
    let output = Command::new(std::env::var_os("CARGO").unwrap_or_else(|| "cargo".into()))
        .args([
            "metadata",
            "--no-deps",
            "--format-version",
            "1",
            "--manifest-path",
        ])
        .arg(&manifest)
        .output()
        .expect("cargo metadata runs");
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let metadata: Value = serde_json::from_slice(&output.stdout).expect("metadata is JSON");
    let seen: Vec<&str> = metadata["packages"]
        .as_array()
        .expect("packages")
        .iter()
        .filter_map(|package| package["name"].as_str())
        .collect();
    for (family, _) in FAMILY {
        assert!(seen.contains(&family), "{family} is not a workspace crate");
    }
    assert_eq!(dependency_offences(&metadata), Vec::<String>::new());
}

/// The rule can fail: a crate that wraps the disk is named whatever the family crate is, and a
/// dev-dependency or a listed one is not.
#[test]
fn a_dependency_that_wraps_the_disk_is_named_and_a_listed_or_dev_one_is_not() {
    for wrapper in [
        "ignore",
        "tokio",
        "memmap2",
        "rustix",
        "walkdir",
        "libc",
        "tempfile",
        "fs_err",
        "async-std",
        "std-fs-extra",
    ] {
        let metadata = json!({ "packages": [
            package("vault-document", &[("confined-files", None), (wrapper, None)]),
            package("mcp-server", &[(wrapper, Some("build"))]),
        ]});
        let offences = dependency_offences(&metadata);
        assert_eq!(offences.len(), 2, "{wrapper}: {offences:?}");
        assert!(
            offences.iter().all(|line| line.contains(wrapper)),
            "{offences:?}"
        );
    }
    let fine = json!({ "packages": [
        package("vault-document", &[("confined-files", None), ("tempfile", Some("dev"))]),
        package("source-evidence", &[("hardened-git", None)]),
        package("confined-files", &[("walkdir", None)]),
        package("ontology-atlas", &[("tauri", None)]),
    ]});
    assert_eq!(dependency_offences(&fine), Vec::<String>::new());
    let unknown = json!({ "packages": [package("brand-new-family", &[])] });
    assert_eq!(dependency_offences(&unknown).len(), 1);
}

#[test]
fn every_family_crate_carries_the_shared_clippy_file_unless_its_slice_adds_it() {
    let mut checked = 0;
    for (family, _) in FAMILY {
        if CLIPPY_PENDING.iter().any(|(pending, _)| *pending == family) {
            continue;
        }
        let file = crates_folder().join(family).join("clippy.toml");
        let found = fs::read_to_string(&file).unwrap_or_default();
        assert_eq!(
            found,
            CANONICAL_CLIPPY,
            "{} must be a copy of tests/family_clippy.toml",
            file.display()
        );
        checked += 1;
    }
    assert!(checked > 0, "the check found no family crate to hold");
}

/// One planted way to reach the disk or a process, as the file it lives in.
const PLANTED: [(&str, &str); 9] = [
    (
        "alias",
        "use std as s;\npub fn f(p: &str) { let _ = s::fs::read(p); }\n",
    ),
    (
        "extern_crate",
        "extern crate std as s;\npub fn f(p: &str) { let _ = s::fs::read(p); }\n",
    ),
    (
        "macro_expansion",
        "macro_rules! m { ($x:ident) => { std::$x::read(\"p\") } }\npub fn f() { let _ = m!(fs); }\n",
    ),
    (
        "raw_string",
        "pub fn f(p: &str) { let _x = br#\"\"\"#; let _ = std::fs::read(p); let _y = \"\"; }\n",
    ),
    (
        "open_a_file",
        "pub fn f(p: &str) { let _ = std::fs::File::open(p); }\n",
    ),
    (
        "open_options",
        "use std::fs::OpenOptions;\npub fn f(p: &str) { let _ = OpenOptions::new().write(true).open(p); }\n",
    ),
    (
        "ask_the_path",
        "pub fn f(p: &std::path::Path) -> bool { p.exists() }\n",
    ),
    (
        "spawn",
        "pub fn f() { let _ = std::process::Command::new(\"git\").status(); }\n",
    ),
    // The file is `elsewhere/io.rs`, included by a `#[path]` module in `lib.rs`.
    ("path_module", "#[path = \"elsewhere/io.rs\"]\npub mod io_elsewhere;\n"),
];

/// What a family crate may write: paths and bytes, no disk.
const CLEAN: &str = "use std::path::{Path, PathBuf};\nuse std::io::Write;\n\
pub fn f(p: &Path) -> PathBuf { let mut out = Vec::new(); let _ = out.write(b\"x\"); p.join(\"a\") }\n";

#[test]
fn clippy_with_the_shared_file_refuses_every_planted_way_to_reach_the_disk() {
    let work = tempfile::tempdir().expect("temp dir");
    let krate = work.path().join("planted");
    let source = krate.join("src");
    fs::create_dir_all(source.join("elsewhere")).expect("folders");
    fs::write(
        krate.join("Cargo.toml"),
        "[package]\nname = \"planted\"\nversion = \"0.0.0\"\nedition = \"2021\"\n\n[workspace]\n",
    )
    .expect("manifest");
    let mut lib = String::new();
    for (name, text) in PLANTED {
        if name == "path_module" {
            fs::write(
                source.join("elsewhere/io.rs"),
                "pub fn g(p: &str) { let _ = std::fs::read(p); }\n",
            )
            .expect("path target");
            lib.push_str(text);
        } else {
            fs::write(source.join(format!("{name}.rs")), text).expect("planted");
            lib.push_str(&format!("pub mod {name};\n"));
        }
    }
    fs::write(source.join("clean.rs"), CLEAN).expect("clean");
    lib.push_str("pub mod clean;\n");
    fs::write(source.join("lib.rs"), lib).expect("lib");
    let configuration = work.path().join("configuration");
    fs::create_dir_all(&configuration).expect("configuration");
    fs::write(configuration.join("clippy.toml"), CANONICAL_CLIPPY).expect("clippy.toml");

    let output = Command::new(std::env::var_os("CARGO").unwrap_or_else(|| "cargo".into()))
        .args([
            "clippy",
            "--quiet",
            "--message-format",
            "short",
            "--manifest-path",
        ])
        .arg(krate.join("Cargo.toml"))
        .args(["--", "-D", "warnings"])
        .env("CLIPPY_CONF_DIR", &configuration)
        .env("CARGO_TARGET_DIR", work.path().join("target"))
        .env_remove("RUSTC_WORKSPACE_WRAPPER")
        .output()
        .expect("cargo clippy runs");
    let report = String::from_utf8_lossy(&output.stderr);
    assert!(
        !output.status.success(),
        "clippy passed the planted crate:\n{report}"
    );
    for (name, _) in PLANTED {
        let places = if name == "path_module" {
            "elsewhere/io.rs".to_string()
        } else {
            format!("{name}.rs")
        };
        assert!(
            report
                .lines()
                .any(|line| line.contains(&places) && line.contains("disallowed")),
            "{name} was not refused:\n{report}"
        );
    }
    assert!(
        !report.lines().any(|line| line.contains("clean.rs")),
        "a file that only names paths and bytes was refused:\n{report}"
    );
}
