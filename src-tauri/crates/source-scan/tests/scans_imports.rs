//! The import scan over whole repositories: hostile files cost a bounded amount and are named,
//! and a repository of every supported language comes out as edges, modules and package
//! evidence.

#![allow(
    clippy::disallowed_methods,
    reason = "these tests plant the repositories a scan reads"
)]

mod support;

use std::time::{Duration, Instant};

use confined_files::{DiskSource, ScanRoots};
use source_scan::{scan_imports, ImportScan, ImportScanOptions, UnresolvedReason};
use support::{write, Scratch};

fn scan(root: &std::path::Path, options: &ImportScanOptions) -> ImportScan {
    let real = std::fs::canonicalize(root).expect("real path");
    let roots = ScanRoots::new(real.clone(), real.clone()).expect("roots");
    let source = DiskSource::new(
        &roots.allow(&real, "rootPath").expect("allowed"),
        8 * 1024 * 1024,
    );
    scan_imports(&source, &real.to_string_lossy(), options)
}

#[test]
fn hostile_files_cost_a_bounded_time_and_are_named_not_skipped_silently() {
    let scratch = Scratch::new("hostile");
    let root = scratch.path();
    write(root, "src/a.ts", "import { b } from './b';\n");
    write(root, "src/b.ts", "export const b = 1;\n");
    let nested = format!("{}1{}", "[".repeat(10_000), "]".repeat(10_000));
    write(
        root,
        "src/deep.ts",
        &format!("import './b';\nconst deep = {nested};\n"),
    );
    write(
        root,
        "src/line.ts",
        &format!("const x = '{}';\n", "x".repeat(5 * 1024 * 1024)),
    );
    // Every level holds an import and the next level, so each import has two thousand ancestors:
    // asking the tree for them one by one took minutes.
    let levels = 2_000;
    write(
        root,
        "src/nested.ts",
        &format!(
            "export const x = {}import('./b'){};\n",
            "[import('./b'),".repeat(levels),
            "]".repeat(levels)
        ),
    );
    let mut binary = vec![0u8, 1, 2, 0, 255];
    binary.extend_from_slice(b"import './b';");
    std::fs::write(root.join("src/binary.ts"), binary).expect("binary file");
    write(
        root,
        "src/big.rs",
        &format!("// {}\nmod b;\n", "x".repeat(300 * 1024)),
    );

    let started = Instant::now();
    let found = scan(root, &ImportScanOptions::default());
    assert!(
        started.elapsed() < Duration::from_secs(2),
        "hostile files must not stall the scan: {:?}",
        started.elapsed()
    );

    let edges: Vec<(&str, &str)> = found
        .edges
        .iter()
        .map(|e| (e.from.as_str(), e.to.as_str()))
        .collect();
    assert!(edges.contains(&("src/a.ts", "src/b.ts")));
    assert!(
        edges.contains(&("src/deep.ts", "src/b.ts")),
        "a file nested ten thousand brackets deep is still read"
    );
    assert!(
        edges.contains(&("src/nested.ts", "src/b.ts")),
        "a file with an import on each of two thousand levels is still read"
    );
    let unresolved: Vec<(&str, UnresolvedReason)> = found
        .unresolved
        .iter()
        .map(|u| (u.from.as_str(), u.reason))
        .collect();
    assert!(unresolved.contains(&("src/line.ts", UnresolvedReason::FileTooLarge)));
    assert!(unresolved.contains(&("src/big.rs", UnresolvedReason::FileTooLarge)));
    assert!(
        unresolved.contains(&("src/binary.ts", UnresolvedReason::SourceNotParsed)),
        "bytes posing as source say that nothing was read, not that nothing was found"
    );
}

#[test]
fn a_repository_of_every_language_gives_edges_modules_and_go_package_evidence() {
    let scratch = Scratch::new("languages");
    let root = scratch.path();
    write(root, "go.mod", "module example.com/app\n");
    write(
        root,
        "cmd/main.go",
        "package main\nimport \"example.com/app/store\"\n",
    );
    write(root, "store/store.go", "package store\n");
    write(root, "src/features/checkin/index.ts", "import { db } from '../../storage/db';\nimport './side';\nimport type { T } from '../../storage/db';\n");
    write(root, "src/features/checkin/side.ts", "");
    write(root, "src/storage/db.ts", "export const db = 1;\n");
    write(
        root,
        "src/lib.rs",
        "mod util;\nuse crate::util::tool;\nuse serde::Serialize;\n",
    );
    write(root, "src/util.rs", "");
    write(root, "src/app/__init__.py", "");
    write(
        root,
        "src/app/main.py",
        "from app import helper\nimport os\n",
    );
    write(root, "src/app/helper.py", "");
    write(
        root,
        "src/java/com/acme/A.java",
        "package com.acme;\nclass A { B b; }\n",
    );
    write(
        root,
        "src/java/com/acme/B.java",
        "package com.acme;\nclass B {}\n",
    );

    let found = scan(root, &ImportScanOptions::default());
    let edge = |from: &str, to: &str| found.edges.iter().any(|e| e.from == from && e.to == to);
    assert!(edge("src/features/checkin/index.ts", "src/storage/db.ts"));
    assert!(edge(
        "src/features/checkin/index.ts",
        "src/features/checkin/side.ts"
    ));
    assert!(edge("src/lib.rs", "src/util.rs"));
    assert!(edge("src/app/main.py", "src/app/helper.py"));
    assert!(edge("src/java/com/acme/A.java", "src/java/com/acme/B.java"));
    let external: Vec<&str> = found
        .external_imports
        .iter()
        .map(|e| e.spec.as_str())
        .collect();
    assert!(external.contains(&"serde") && external.contains(&"os"));

    let module = found
        .module_edges
        .iter()
        .find(|m| m.from == "capabilities/features" || m.from.starts_with("capabilities/"))
        .expect("a module edge from the feature");
    assert_eq!(module.to, "elements/db");
    assert_eq!(
        module.stats.count, 2,
        "the value import and the type-only import"
    );
    assert_eq!(module.stats.import_usage_counts.type_only, 1);

    let go = found.package_import_evidence.as_ref().expect("a Go module");
    assert_eq!(go.package_imports.len(), 1);
    assert_eq!(go.package_imports[0].to_package, "store");
    assert_eq!(go.files_scanned, 2);
}

#[test]
fn an_import_into_a_hidden_folder_is_placed_and_one_into_a_secret_or_git_is_not() {
    let scratch = Scratch::new("hidden-targets");
    let root = scratch.path();
    write(
        root,
        "src/a.ts",
        "import data from './.generated/surface.json';\nimport './.storybook/main';\nimport env from './.env';\nimport key from './secrets';\nimport cfg from '../.git/config';\n",
    );
    write(root, "src/.generated/surface.json", "{}\n");
    write(root, "src/.storybook/main.ts", "");
    write(root, "src/.env", "KEY=1\n");
    write(root, "src/secrets.ts", "");
    write(root, ".git/config", "");

    let found = scan(root, &ImportScanOptions::default());
    let mut targets: Vec<&str> = found.edges.iter().map(|e| e.to.as_str()).collect();
    targets.sort_unstable();
    assert_eq!(
        targets,
        ["src/.generated/surface.json", "src/.storybook/main.ts"]
    );
    let mut refused: Vec<&str> = found.unresolved.iter().map(|u| u.spec.as_str()).collect();
    refused.sort_unstable();
    assert_eq!(refused, ["../.git/config", "./.env", "./secrets"]);
}

#[test]
fn windows_line_endings_and_a_byte_order_mark_give_the_edges_unix_ones_do() {
    let scratch = Scratch::new("line-endings");
    let root = scratch.path();
    write(
        root,
        "src/lib.rs",
        "\u{feff}mod util;\r\nuse crate::\r\n    helper::tool;\r\n",
    );
    write(root, "src/util.rs", "");
    write(root, "src/helper.rs", "");
    write(
        root,
        "src/a.ts",
        "\u{feff}import { b } from './b';\r\nimport './c';\r\n",
    );
    write(root, "src/b.ts", "");
    write(root, "src/c.ts", "");

    let found = scan(root, &ImportScanOptions::default());
    let mut edges: Vec<(&str, &str)> = found
        .edges
        .iter()
        .map(|e| (e.from.as_str(), e.to.as_str()))
        .collect();
    edges.sort_unstable();
    assert_eq!(
        edges,
        [
            ("src/a.ts", "src/b.ts"),
            ("src/a.ts", "src/c.ts"),
            ("src/lib.rs", "src/helper.rs"),
            ("src/lib.rs", "src/util.rs")
        ]
    );
    assert!(found.unresolved.is_empty());
}
