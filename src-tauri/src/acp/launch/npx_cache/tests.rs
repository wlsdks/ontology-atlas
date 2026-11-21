use super::*;
use crate::acp::test_support::scratch;

// These checks reproduce the observed broken cache (node_modules present, `.bin`
// empty, no package.json) so disabling the healing turns them red.

struct EntryShape {
    package_json: Option<&'static str>,
    node_modules: bool,
    bin_entries: &'static [&'static str],
}

fn build_entry(entry: &Path, shape: &EntryShape) {
    std::fs::create_dir_all(entry).unwrap();
    if let Some(text) = shape.package_json {
        std::fs::write(entry.join("package.json"), text).unwrap();
    }
    if shape.node_modules {
        let bin = entry.join("node_modules").join(".bin");
        std::fs::create_dir_all(&bin).unwrap();
        std::fs::create_dir_all(
            entry
                .join("node_modules")
                .join("@agentclientprotocol")
                .join("claude-agent-acp"),
        )
        .unwrap();
        for name in shape.bin_entries {
            std::fs::write(bin.join(name), "#!/bin/sh\n").unwrap();
        }
    }
}

const CLAUDE_SPEC: &str = "@agentclientprotocol/claude-agent-acp@0.69.0";
const HEALTHY_MANIFEST: &str = r#"{
  "dependencies": { "@agentclientprotocol/claude-agent-acp": "^0.69.0" },
  "_npx": { "packages": ["@agentclientprotocol/claude-agent-acp@0.69.0"] }
}"#;

fn npx_launch(package: &str) -> AcpLaunch {
    AcpLaunch {
        program: PathBuf::from("/home/me/.nvm/versions/node/v24.16.0/bin/npx"),
        args: vec!["-y".to_string(), package.to_string()],
        path_env: String::new(),
    }
}

#[test]
fn entry_dir_matches_npms_observed_hashes() {
    // Pinned to two measured directory names; a formula drift would make healing do nothing.
    let root = PathBuf::from("/Users/me/.npm/_npx");
    assert_eq!(
        npx_cache_entry_dir(&root, CLAUDE_SPEC),
        root.join("8757e2301903ae53"),
    );
    assert_eq!(
        npx_cache_entry_dir(&root, "@agentclientprotocol/codex-acp@1.4.0"),
        root.join("8adbf6f1a7dec4e5"),
    );
}

#[test]
fn spots_the_owners_broken_cache_shape() {
    let dir = scratch("broken");
    let entry = dir.join("8757e2301903ae53");
    build_entry(
        &entry,
        &EntryShape {
            package_json: None,
            node_modules: true,
            bin_entries: &[],
        },
    );
    assert_eq!(
        npx_entry_health(&entry, CLAUDE_SPEC),
        NpxEntryHealth::Broken("package-json-missing"),
    );
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn accepts_a_completed_install() {
    let dir = scratch("healthy");
    let entry = dir.join("entry");
    build_entry(
        &entry,
        &EntryShape {
            package_json: Some(HEALTHY_MANIFEST),
            node_modules: true,
            bin_entries: &["claude-agent-acp"],
        },
    );
    assert_eq!(
        npx_entry_health(&entry, CLAUDE_SPEC),
        NpxEntryHealth::Usable
    );
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn spots_unlinked_bins_and_unparseable_manifests() {
    // Download finished but linking was cut off; npx never heals this.
    let dir = scratch("nobin");
    let entry = dir.join("entry");
    build_entry(
        &entry,
        &EntryShape {
            package_json: Some(HEALTHY_MANIFEST),
            node_modules: true,
            bin_entries: &[],
        },
    );
    assert_eq!(
        npx_entry_health(&entry, CLAUDE_SPEC),
        NpxEntryHealth::Broken("bin-links-missing"),
    );
    std::fs::write(entry.join("package.json"), "{\"dependencies\": {").unwrap();
    assert_eq!(
        npx_entry_health(&entry, CLAUDE_SPEC),
        NpxEntryHealth::Broken("package-json-unparseable"),
    );
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn leaves_a_foreign_entry_alone() {
    // Another spec's marker means someone else's entry: never delete it.
    let dir = scratch("foreign");
    let entry = dir.join("entry");
    build_entry(
        &entry,
        &EntryShape {
            package_json: Some(r#"{ "_npx": { "packages": ["somebody-else@9.9.9"] } }"#),
            node_modules: true,
            bin_entries: &[],
        },
    );
    assert_eq!(
        npx_entry_health(&entry, CLAUDE_SPEC),
        NpxEntryHealth::Usable
    );
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn preflight_removes_only_the_broken_entry() {
    let home = scratch("home");
    let root = npx_cache_root(Some(&home)).unwrap();
    let ours = npx_cache_entry_dir(&root, CLAUDE_SPEC);
    build_entry(
        &ours,
        &EntryShape {
            package_json: None,
            node_modules: true,
            bin_entries: &[],
        },
    );
    let neighbor = root.join("deadbeefdeadbeef");
    build_entry(
        &neighbor,
        &EntryShape {
            package_json: Some(r#"{ "_npx": { "packages": ["other@1.0.0"] } }"#),
            node_modules: true,
            bin_entries: &["other"],
        },
    );

    let verdict = preflight_npx_cache(&npx_launch(CLAUDE_SPEC), Some(&home));
    assert_eq!(
        verdict,
        NpxCachePreflight::HealedBrokenEntry {
            reason: "package-json-missing"
        },
    );
    assert!(!ours.exists(), "the broken entry must be removed");
    assert!(
        neighbor
            .join("node_modules")
            .join(".bin")
            .join("other")
            .exists(),
        "a neighbouring foreign entry must stay"
    );

    assert_eq!(
        preflight_npx_cache(&npx_launch(CLAUDE_SPEC), Some(&home)),
        NpxCachePreflight::FirstDownload,
    );
    let _ = std::fs::remove_dir_all(&home);
}

#[test]
fn preflight_reports_a_ready_cache_and_ignores_non_npx_launches() {
    let home = scratch("ready");
    let root = npx_cache_root(Some(&home)).unwrap();
    build_entry(
        &npx_cache_entry_dir(&root, CLAUDE_SPEC),
        &EntryShape {
            package_json: Some(HEALTHY_MANIFEST),
            node_modules: true,
            bin_entries: &["claude-agent-acp"],
        },
    );
    assert_eq!(
        preflight_npx_cache(&npx_launch(CLAUDE_SPEC), Some(&home)),
        NpxCachePreflight::CacheReady,
    );

    let installed = AcpLaunch {
        program: PathBuf::from("/usr/local/bin/claude-agent-acp"),
        args: vec![],
        path_env: String::new(),
    };
    assert_eq!(
        preflight_npx_cache(&installed, Some(&home)),
        NpxCachePreflight::NotNpx,
    );
    assert_eq!(
        preflight_npx_cache(&npx_launch(CLAUDE_SPEC), None),
        NpxCachePreflight::CacheUnknown,
    );
    let _ = std::fs::remove_dir_all(&home);
}

#[cfg(unix)]
fn plant_adapter(home: &Path, installed_version: &str) -> PathBuf {
    let entry = npx_cache_entry_dir(&npx_cache_root(Some(home)).unwrap(), CLAUDE_SPEC);
    build_entry(
        &entry,
        &EntryShape {
            package_json: Some(HEALTHY_MANIFEST),
            node_modules: true,
            bin_entries: &[],
        },
    );
    let package = adapter_package(&entry);
    let manifest = serde_json::json!({
        "version": installed_version,
        "bin": { "claude-agent-acp": "dist/index.js" },
    });
    std::fs::write(package.join("package.json"), manifest.to_string()).unwrap();
    std::fs::create_dir_all(package.join("dist")).unwrap();
    std::fs::write(
        package.join("dist").join("index.js"),
        "#!/usr/bin/env node\n",
    )
    .unwrap();
    link_bin(
        &entry,
        Path::new("../@agentclientprotocol/claude-agent-acp/dist/index.js"),
    );
    entry
}

#[cfg(unix)]
fn adapter_package(entry: &Path) -> PathBuf {
    entry
        .join("node_modules")
        .join("@agentclientprotocol")
        .join("claude-agent-acp")
}

#[cfg(unix)]
fn link_bin(entry: &Path, target: &Path) {
    let link = entry
        .join("node_modules")
        .join(".bin")
        .join("claude-agent-acp");
    let _ = std::fs::remove_file(&link);
    std::os::unix::fs::symlink(target, link).unwrap();
}

#[cfg(unix)]
#[test]
fn a_ready_entry_launches_its_pinned_bin_without_npm_exec() {
    let home = scratch("direct");
    let entry = plant_adapter(&home, "0.69.0");
    let mut launch = npx_launch(CLAUDE_SPEC);
    launch
        .args
        .insert(1, "--before=2026-01-01T00:00:00.000Z".to_string());
    launch.args.push("--acp".to_string());
    launch.path_env = "/opt/node/bin".to_string();

    let direct = launch_from_npx_cache(&launch, Some(&home), &|_| true).expect("direct launch");

    let bin = entry.join("node_modules").join(".bin");
    assert_eq!(direct.program, bin.join("claude-agent-acp"));
    assert_eq!(direct.args, vec!["--acp".to_string()]);
    let path_env = std::env::join_paths([bin, PathBuf::from("/opt/node/bin")]).unwrap();
    assert_eq!(direct.path_env, path_env.to_string_lossy());
    let _ = std::fs::remove_dir_all(&home);
}

#[cfg(unix)]
#[test]
fn a_bin_link_that_is_not_the_checked_packages_bin_is_not_run() {
    let home = scratch("direct-planted");
    let launch = npx_launch(CLAUDE_SPEC);
    let entry = plant_adapter(&home, "0.69.0");
    let planted = home.join("planted.sh");
    std::fs::write(&planted, "#!/bin/sh\n").unwrap();

    link_bin(&entry, &planted);
    assert_eq!(launch_from_npx_cache(&launch, Some(&home), &|_| true), None);

    let bin = entry
        .join("node_modules")
        .join(".bin")
        .join("claude-agent-acp");
    std::fs::remove_file(&bin).unwrap();
    std::fs::write(&bin, "#!/bin/sh\n").unwrap();
    assert_eq!(launch_from_npx_cache(&launch, Some(&home), &|_| true), None);

    let leaving = serde_json::json!({
        "version": "0.69.0",
        "bin": { "claude-agent-acp": planted },
    });
    std::fs::write(
        adapter_package(&entry).join("package.json"),
        leaving.to_string(),
    )
    .unwrap();
    link_bin(&entry, &planted);
    assert_eq!(launch_from_npx_cache(&launch, Some(&home), &|_| true), None);
    let _ = std::fs::remove_dir_all(&home);
}

#[cfg(unix)]
#[test]
fn a_direct_launch_needs_the_exact_pinned_version_and_a_runnable_bin() {
    let home = scratch("direct-refused");
    let launch = npx_launch(CLAUDE_SPEC);
    plant_adapter(&home, "0.70.0");
    assert_eq!(launch_from_npx_cache(&launch, Some(&home), &|_| true), None);

    plant_adapter(&home, "0.69.0");
    assert_eq!(
        launch_from_npx_cache(&launch, Some(&home), &|_| false),
        None
    );

    let unpinned = npx_launch("@agentclientprotocol/claude-agent-acp");
    assert_eq!(
        launch_from_npx_cache(&unpinned, Some(&home), &|_| true),
        None
    );
    let installed = AcpLaunch {
        program: PathBuf::from("/usr/local/bin/claude-agent-acp"),
        args: vec![],
        path_env: String::new(),
    };
    assert_eq!(
        launch_from_npx_cache(&installed, Some(&home), &|_| true),
        None
    );
    let _ = std::fs::remove_dir_all(&home);
}

#[test]
fn cache_root_honors_the_users_npmrc_override() {
    let home = scratch("npmrc");
    std::fs::write(
        home.join(".npmrc"),
        "cache-min=999\ncache = ~/custom-cache\n",
    )
    .unwrap();
    assert_eq!(
        npx_cache_root(Some(&home)),
        Some(home.join("custom-cache").join("_npx")),
    );

    let plain = scratch("plainhome");
    let expected = if cfg!(windows) {
        plain
            .join("AppData")
            .join("Local")
            .join("npm-cache")
            .join("_npx")
    } else {
        plain.join(".npm").join("_npx")
    };
    assert_eq!(npx_cache_root(Some(&plain)), Some(expected));
    let _ = std::fs::remove_dir_all(&home);
    let _ = std::fs::remove_dir_all(&plain);
}

#[test]
fn dir_size_counts_files_under_the_entry() {
    let dir = scratch("size");
    std::fs::create_dir_all(dir.join("a").join("b")).unwrap();
    std::fs::write(dir.join("a").join("one"), vec![0u8; 1000]).unwrap();
    std::fs::write(dir.join("a").join("b").join("two"), vec![0u8; 500]).unwrap();
    assert_eq!(dir_size_bytes(&dir), 1500);
    assert_eq!(dir_size_bytes(&dir.join("missing")), 0);
    let _ = std::fs::remove_dir_all(&dir);
}
