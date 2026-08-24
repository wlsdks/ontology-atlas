//! Store the Node runtime in an **app-owned location** with a pinned version and
//! a verified hash.
//!
//! ## Why this exists (owner direction 2026-08-20, ledger (89))
//!
//! Users with no installed tools reached a final dead end: adapters require
//! Node, and without it the UI could only say "Install Node and check again."
//! Guidance that sends someone outside the app fails if they never return.
//!
//! ## Why this method
//!
//! Never use `curl | bash`. Piping a remote script directly into a shell means
//! we do not know what will execute, and yesterday's script may differ from
//! today's. Apply three constraints instead:
//!
//! | | What this file does |
//! |---|---|
//! | **Pin** | Compile the version as a constant. The same app always downloads the same artifact |
//! | **Verify** | Compile the hash from the official `SHASUMS256.txt`, compare after download, and delete then fail on mismatch |
//! | **Isolate** | Write only inside `<app-data>/runtimes/node/`. Do not touch system Node or PATH; uninstalling the app removes it too |
//!
//! The hash was copied directly from
//! `https://nodejs.org/dist/<version>/SHASUMS256.txt`.
//!
//! ## Why there is no new dependency
//!
//! Download with `curl`; extract with `tar` on macOS/Linux or PowerShell's
//! `Expand-Archive` on Windows. All are supplied by the OS, and the existing
//! `sha2` dependency computes the hash. The supply-chain surface grows by zero.

use std::path::{Path, PathBuf};

use crate::acp::bounded_output;

/// Node version to store. **If you change this, update the hash below too** — contract tests
/// block mismatches between version strings and file names.
pub(crate) const MANAGED_NODE_VERSION: &str = "v24.18.0";

/// Official distribution for a platform.
#[derive(Debug, Clone, Copy)]
pub(crate) struct ManagedNodeArtifact {
    /// The tail of the directory name extracted after decompression (`node-<version>-<platform>`).
    pub platform: &'static str,
    pub filename: &'static str,
    /// Exactly as in `SHASUMS256.txt`.
    pub sha256: &'static str,
    /// Exact byte count of the file to download — **the denominator of progress.**
    ///
    /// Hard-coding it does not rot silently: this URL is a version-pinned
    /// **immutable distribution**, so if the size had changed, `sha256` would
    /// mismatch first. Drift in this value is caught by the hash gate that
    /// already exists, not a new thing to watch.
    pub bytes: u64,
}

/// **Only platforms we ship are listed.** Offering installation on a platform
/// we have never tried means the screen promises to do something we have never
/// verified. Where unlisted, this feature does not exist at all, and the screen
/// sends people to the official guidance as before.
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

/// The root where the app-downloaded Node lives. Not one byte is written outside it.
pub(crate) fn managed_node_root(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("runtimes").join("node")
}

/// Where `node` · `npm` actually live.
pub(crate) fn managed_node_bin_dir(app_data_dir: &Path) -> Option<PathBuf> {
    let artifact = MANAGED_NODE?;
    let root = managed_node_root(app_data_dir).join(artifact.platform);
    // Windows distributions put `node.exe`·`npm.cmd` right at the archive root — there is no `bin/`.
    Some(if cfg!(windows) { root } else { root.join("bin") })
}

/// Has it already been downloaded.
pub(crate) fn managed_node_present(app_data_dir: &Path) -> bool {
    managed_node_bin_dir(app_data_dir)
        .map(|bin| bin.join(if cfg!(windows) { "node.exe" } else { "node" }).exists())
        .unwrap_or(false)
}

/// **The fact the screen shows first.** What is downloaded from where can be read before pressing.
pub(crate) fn managed_node_plan() -> Option<String> {
    let artifact = MANAGED_NODE?;
    Some(format!("{} ({})", download_url(&artifact), &artifact.sha256[..12]))
}

fn download_url(artifact: &ManagedNodeArtifact) -> String {
    format!(
        "https://nodejs.org/dist/{MANAGED_NODE_VERSION}/{}",
        artifact.filename
    )
}

/// Does the downloaded file's hash match the expected value.
///
/// **The comparison is this feature's reason to exist.** Without it, what we do
/// becomes "execute what was downloaded from the internet", and that is what
/// this repository decided not to do.
pub(crate) fn sha256_matches(bytes: &[u8], expected: &str) -> bool {
    use sha2::{Digest, Sha256};
    let digest = Sha256::digest(bytes);
    let actual: String = digest.iter().map(|b| format!("{b:02x}")).collect();
    actual.eq_ignore_ascii_case(expected)
}

/// If absent, download, verify, and extract. If already present, do nothing.
///
/// Failure **fails closed** — on a hash mismatch, delete what was downloaded
/// and raise an error. Leaving a half-downloaded file means the next run tries
/// to use it and dies in an even stranger place.
/// The channel that reports how far the installation has come.
///
/// **Why a callback** — this module knows nothing of Tauri (so that tests run
/// without the app). Turning it into an event is the caller's job.
///
/// `received`/`total` pass **only as much as is known.** Unknown means `None`,
/// and the screen draws no fake percentage — this repository's
/// `formatDownloadProgress` already follows the same discipline.
pub(crate) type NodeProgress<'a> = &'a dyn Fn(&'static str, Option<u64>, Option<u64>);

pub(crate) fn ensure_managed_node(
    app_data_dir: &Path,
    report: NodeProgress<'_>,
) -> Result<PathBuf, String> {
    let artifact = MANAGED_NODE.ok_or_else(|| "unsupported-platform".to_string())?;
    let bin = managed_node_bin_dir(app_data_dir).ok_or_else(|| "unsupported-platform".to_string())?;
    if managed_node_present(app_data_dir) {
        return Ok(bin);
    }

    let root = managed_node_root(app_data_dir);
    std::fs::create_dir_all(&root).map_err(|err| format!("node-dir-failed:{err}"))?;
    let archive = root.join(artifact.filename);
    let _ = std::fs::remove_file(&archive);

    // Download. `curl` is carried by the OS — zero new dependencies.
    download_with_progress(
        &download_url(&artifact),
        &archive,
        artifact.bytes,
        std::time::Duration::from_secs(660),
        report,
    )?;

    // **Compare.** On mismatch, delete and fail.
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

    // The archive extracts to `node-<version>-<platform>/`. Move it to the name we look for.
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

/// Downloads while **reporting how far it has come.**
///
/// This is the one and only reason `bounded_output` is not used — that function
/// returns only when finished, so the screen could say nothing while 52MB is
/// downloading. That is exactly the shape of the defect this repository's
/// walkthrough named "the silent wait".
///
/// **Progress is measured by the size of the file being received, not by
/// curl's output.** curl's progress bar overwrites one line with `\r`, so it
/// cannot be read line by line, and the option names differ per version. File
/// size means the same thing on every curl.
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
            // If time is up, **kill and reclaim it.** If not reclaimed, zombies remain.
            let _ = child.kill();
            let _ = child.wait();
            return Err("node-download-failed:timeout".to_string());
        }
        if let Ok(meta) = std::fs::metadata(dest) {
            // Do not report values exceeding the denominator — 101% is a defect, not progress.
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
    bounded_output(command_ref(&mut command), std::time::Duration::from_secs(300))
        .ok_or_else(|| "node-extract-failed".to_string())?;
    Ok(())
}

/// Extract `Command` to pass by value — `bounded_output` takes ownership.
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
        // sha256 of empty input — a fixed point to verify if the comparison actually performs computation.
        let empty = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
        assert!(sha256_matches(b"", empty));
        assert!(sha256_matches(b"", &empty.to_uppercase()));
        assert!(!sha256_matches(b"x", empty));
        // Must block even with a single character difference — this is the reason this feature exists.
        let mut tampered = empty.to_string();
        tampered.replace_range(0..1, "f");
        assert!(!sha256_matches(b"", &tampered));
    }

    /// **If version string and file name mismatch**, it points to a file with no receiving address.
    /// This prevents mistakes where the hash is updated but the file name is not when bumping versions.
    #[test]
    fn artifact_filename_matches_the_pinned_version() {
        let Some(artifact) = MANAGED_NODE else {
            return; // Unlisted platform — this feature does not exist.
        };
        assert!(
            artifact.filename.contains(MANAGED_NODE_VERSION),
            "파일 이름이 고정 버전과 다르다: {} vs {MANAGED_NODE_VERSION}",
            artifact.filename
        );
        assert!(artifact.filename.contains(artifact.platform));
        assert_eq!(artifact.sha256.len(), 64, "sha256 이 64자가 아니다");
        assert!(artifact.sha256.chars().all(|c| c.is_ascii_hexdigit()));
    }

    /// **If the denominator is 0, it's a division error, not progress.**
    ///
    /// This value cannot be verified over the network (CI does not go outside). So what we measure here
    /// is not "is it the correct value" but **「is it a value usable as progress」** —
    /// if it were actually wrong, `sha256` would fail first after receipt, and that already has a gate.
    #[test]
    fn artifact_bytes_can_serve_as_a_denominator() {
        let Some(artifact) = MANAGED_NODE else { return };
        assert!(artifact.bytes > 0, "0 을 분모로 쓸 수 없다");
        // Node distributions are tens of MB. If the magnitude is off (e.g., writing KB instead of bytes),
        // progress immediately jumps to 100% or stays stuck at 1% forever.
        assert!(
            (10_000_000..200_000_000).contains(&artifact.bytes),
            "크기 자릿수가 이상하다: {}",
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
        assert!(root.starts_with(app_data), "앱 전용 자리 밖이다: {root:?}");
        if let Some(bin) = managed_node_bin_dir(app_data) {
            assert!(bin.starts_with(app_data), "앱 전용 자리 밖이다: {bin:?}");
        }
    }

    #[test]
    fn plan_shows_where_it_comes_from_before_anyone_presses() {
        let Some(_) = MANAGED_NODE else { return };
        let plan = managed_node_plan().unwrap();
        assert!(plan.contains("https://nodejs.org/dist/"), "{plan}");
        // The hash prefix must be visible — the screen demonstrates that "verification" is not just talk.
        assert!(plan.contains('('), "{plan}");
    }
}
