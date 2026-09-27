//! An app-owned Node runtime: a pinned version, a hash from the official SHASUMS256
//! list checked before use, and writes only under the app's runtimes/node folder.
//! Never `curl | bash`: an unverified remote script could run anything.

use std::path::{Path, PathBuf};

use crate::acp::bounded_output;

/// Change the hash and file names with the version; contract tests catch a mismatch.
pub(crate) const MANAGED_NODE_VERSION: &str = "v24.18.0";

#[derive(Debug, Clone, Copy)]
pub(crate) struct ManagedNodeArtifact {
    pub platform: &'static str,
    pub filename: &'static str,
    pub sha256: &'static str,
    /// Progress denominator. The pinned URL is immutable, so drift fails the hash first.
    pub bytes: u64,
}

/// Only shipped platforms are listed, so the screen never offers an untried install.
#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
pub(crate) const MANAGED_NODE: Option<ManagedNodeArtifact> = Some(ManagedNodeArtifact {
    platform: "darwin-arm64",
    filename: "node-v24.18.0-darwin-arm64.tar.gz",
    sha256: "e1a97e14c99c803e96c7339403282ea05a499c32f8d83defe9ef5ec66f979ed1",
    bytes: 52087559,
});

#[cfg(all(target_os = "macos", target_arch = "x86_64"))]
pub(crate) const MANAGED_NODE: Option<ManagedNodeArtifact> = Some(ManagedNodeArtifact {
    platform: "darwin-x64",
    filename: "node-v24.18.0-darwin-x64.tar.gz",
    sha256: "dfd0dbd3e721503434df7b7205e719f61b3a3a31b2bcf9729b8b91fea240f080",
    bytes: 53282687,
});

#[cfg(all(target_os = "windows", target_arch = "x86_64"))]
pub(crate) const MANAGED_NODE: Option<ManagedNodeArtifact> = Some(ManagedNodeArtifact {
    platform: "win-x64",
    filename: "node-v24.18.0-win-x64.zip",
    sha256: "0ae68406b42d7725661da979b1403ec9926da205c6770827f33aac9d8f26e821",
    bytes: 37176245,
});

#[cfg(all(target_os = "linux", target_arch = "x86_64"))]
pub(crate) const MANAGED_NODE: Option<ManagedNodeArtifact> = Some(ManagedNodeArtifact {
    platform: "linux-x64",
    filename: "node-v24.18.0-linux-x64.tar.gz",
    sha256: "783130984963db7ba9cbd01089eaf2c2efb055c7c1693c943174b967b3050cb8",
    bytes: 57224421,
});

#[cfg(not(any(
    all(target_os = "macos", target_arch = "aarch64"),
    all(target_os = "macos", target_arch = "x86_64"),
    all(target_os = "windows", target_arch = "x86_64"),
    all(target_os = "linux", target_arch = "x86_64"),
)))]
pub(crate) const MANAGED_NODE: Option<ManagedNodeArtifact> = None;

/// Nothing is written outside this root.
pub(crate) fn managed_node_root(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("runtimes").join("node")
}

pub(crate) fn managed_node_bin_dir(app_data_dir: &Path) -> Option<PathBuf> {
    let artifact = MANAGED_NODE?;
    let root = managed_node_root(app_data_dir).join(artifact.platform);
    // Windows archives put `node.exe` and `npm.cmd` at the root, with no `bin/`.
    Some(if cfg!(windows) {
        root
    } else {
        root.join("bin")
    })
}

pub(crate) fn managed_node_present(app_data_dir: &Path) -> bool {
    managed_node_bin_dir(app_data_dir)
        .map(|bin| {
            bin.join(if cfg!(windows) { "node.exe" } else { "node" })
                .exists()
        })
        .unwrap_or(false)
}

pub(crate) fn managed_node_plan() -> Option<String> {
    let artifact = MANAGED_NODE?;
    Some(format!(
        "{} ({})",
        download_url(&artifact),
        &artifact.sha256[..12]
    ))
}

fn download_url(artifact: &ManagedNodeArtifact) -> String {
    format!(
        "https://nodejs.org/dist/{MANAGED_NODE_VERSION}/{}",
        artifact.filename
    )
}

/// Without this comparison the feature would execute unverified downloads.
pub(crate) fn sha256_matches(bytes: &[u8], expected: &str) -> bool {
    use sha2::{Digest, Sha256};
    let digest = Sha256::digest(bytes);
    let actual: String = digest.iter().map(|b| format!("{b:02x}")).collect();
    actual.eq_ignore_ascii_case(expected)
}

/// A callback keeps this module free of Tauri; unknown sizes are `None` so the
/// screen draws no fake percentage.
pub(crate) type NodeProgress<'a> = &'a dyn Fn(&'static str, Option<u64>, Option<u64>);

/// Fails closed: a hash mismatch deletes the download, or the next run would use it.
pub(crate) fn ensure_managed_node(
    app_data_dir: &Path,
    report: NodeProgress<'_>,
) -> Result<PathBuf, String> {
    let artifact = MANAGED_NODE.ok_or_else(|| "unsupported-platform".to_string())?;
    let bin =
        managed_node_bin_dir(app_data_dir).ok_or_else(|| "unsupported-platform".to_string())?;
    if managed_node_present(app_data_dir) {
        return Ok(bin);
    }

    let root = managed_node_root(app_data_dir);
    std::fs::create_dir_all(&root).map_err(|err| format!("node-dir-failed:{err}"))?;
    let archive = root.join(artifact.filename);
    let _ = std::fs::remove_file(&archive);

    download_with_progress(
        &download_url(&artifact),
        &archive,
        artifact.bytes,
        std::time::Duration::from_secs(660),
        report,
    )?;

    report("verifying", None, None);
    let bytes = std::fs::read(&archive).map_err(|err| format!("node-read-failed:{err}"))?;
    if !sha256_matches(&bytes, artifact.sha256) {
        let _ = std::fs::remove_file(&archive);
        return Err("node-hash-mismatch".to_string());
    }
    drop(bytes);

    report("extracting", None, None);
    extract(&archive, &root)?;
    let _ = std::fs::remove_file(&archive);

    let unpacked = root.join(format!("node-{MANAGED_NODE_VERSION}-{}", artifact.platform));
    let target = root.join(artifact.platform);
    if unpacked.exists() {
        let _ = std::fs::remove_dir_all(&target);
        std::fs::rename(&unpacked, &target).map_err(|err| format!("node-move-failed:{err}"))?;
    }

    if !managed_node_present(app_data_dir) {
        return Err("node-missing-after-install".to_string());
    }
    Ok(bin)
}

/// Progress comes from the growing file size, not curl output, which rewrites
/// one line with `\r` and differs between versions.
fn download_with_progress(
    url: &str,
    dest: &Path,
    total: u64,
    limit: std::time::Duration,
    report: NodeProgress<'_>,
) -> Result<(), String> {
    let mut child = std::process::Command::new("curl")
        .args(["-fsSL", "--max-time", "600", "-o"])
        .arg(dest)
        .arg(url)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|err| format!("node-download-failed:{err}"))?;

    let started = std::time::Instant::now();
    report("downloading", Some(0), Some(total));
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                if !status.success() {
                    return Err("node-download-failed".to_string());
                }
                report("downloading", Some(total), Some(total));
                return Ok(());
            }
            Ok(None) => {}
            Err(err) => return Err(format!("node-download-failed:{err}")),
        }
        if started.elapsed() > limit {
            // Reclaim the killed child, or a zombie remains.
            let _ = child.kill();
            let _ = child.wait();
            return Err("node-download-failed:timeout".to_string());
        }
        if let Ok(meta) = std::fs::metadata(dest) {
            // Never report above the denominator.
            report("downloading", Some(meta.len().min(total)), Some(total));
        }
        std::thread::sleep(std::time::Duration::from_millis(250));
    }
}

fn extract(archive: &Path, into: &Path) -> Result<(), String> {
    #[cfg(windows)]
    let mut command = {
        let mut c = std::process::Command::new("powershell");
        c.args(["-NoProfile", "-Command", "Expand-Archive", "-LiteralPath"])
            .arg(archive)
            .arg("-DestinationPath")
            .arg(into)
            .arg("-Force");
        c
    };
    #[cfg(not(windows))]
    let mut command = {
        let mut c = std::process::Command::new("/usr/bin/tar");
        c.arg("-xzf").arg(archive).arg("-C").arg(into);
        c
    };
    bounded_output(
        command_ref(&mut command),
        std::time::Duration::from_secs(300),
    )
    .ok_or_else(|| "node-extract-failed".to_string())?;
    Ok(())
}

fn command_ref(command: &mut std::process::Command) -> std::process::Command {
    let mut out = std::process::Command::new(command.get_program());
    out.args(command.get_args());
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_check_accepts_the_real_thing_and_refuses_anything_else() {
        // sha256 of empty input.
        let empty = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
        assert!(sha256_matches(b"", empty));
        assert!(sha256_matches(b"", &empty.to_uppercase()));
        assert!(!sha256_matches(b"x", empty));
        let mut tampered = empty.to_string();
        tampered.replace_range(0..1, "f");
        assert!(!sha256_matches(b"", &tampered));
    }

    #[test]
    fn artifact_filename_matches_the_pinned_version() {
        let Some(artifact) = MANAGED_NODE else {
            return;
        };
        assert!(
            artifact.filename.contains(MANAGED_NODE_VERSION),
            "file name differs from the pinned version: {} vs {MANAGED_NODE_VERSION}",
            artifact.filename
        );
        assert!(artifact.filename.contains(artifact.platform));
        assert_eq!(artifact.sha256.len(), 64, "sha256 is not 64 characters");
        assert!(artifact.sha256.chars().all(|c| c.is_ascii_hexdigit()));
    }

    /// CI cannot reach the network, so this checks the size is usable as progress;
    /// a wrong value fails the hash first.
    #[test]
    fn artifact_bytes_can_serve_as_a_denominator() {
        let Some(artifact) = MANAGED_NODE else { return };
        assert!(artifact.bytes > 0, "size must be non-zero");
        assert!(
            (10_000_000..200_000_000).contains(&artifact.bytes),
            "size magnitude is implausible: {}",
            artifact.bytes
        );
    }

    #[test]
    fn download_url_is_the_official_https_dist() {
        let Some(artifact) = MANAGED_NODE else { return };
        let url = download_url(&artifact);
        assert!(url.starts_with("https://nodejs.org/dist/"), "{url}");
        assert!(url.ends_with(artifact.filename), "{url}");
    }

    #[test]
    fn everything_lives_under_the_app_private_root() {
        let app_data = Path::new("/tmp/atlas-app-data");
        let root = managed_node_root(app_data);
        assert!(root.starts_with(app_data), "outside app data: {root:?}");
        if let Some(bin) = managed_node_bin_dir(app_data) {
            assert!(bin.starts_with(app_data), "outside app data: {bin:?}");
        }
    }

    #[test]
    fn plan_shows_where_it_comes_from_before_anyone_presses() {
        let Some(_) = MANAGED_NODE else { return };
        let plan = managed_node_plan().unwrap();
        assert!(plan.contains("https://nodejs.org/dist/"), "{plan}");
        assert!(plan.contains('('), "{plan}");
    }
}
