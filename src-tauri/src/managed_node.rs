//! Node 런타임을 **앱 전용 자리**에 받아 둔다 — 고정된 버전, 대조한 해시.
//!
//! ## 왜 있나 (2026-08-20 소유자 지시 · 원장 (89))
//!
//! 도구가 하나도 없는 사람의 마지막 막다른 길이 여기였다. 어댑터를 띄우려면
//! Node 가 필요한데, 없으면 화면이 할 수 있는 말이 「Node 를 설치한 뒤 다시
//! 확인」뿐이었다. 앱 밖으로 내보내는 안내는 그 사람이 돌아오지 않으면 끝난다.
//!
//! ## 왜 이 방식인가
//!
//! `curl | bash` 는 안 쓴다. 원격 스크립트를 그대로 셸에 파이프하면 **무엇이
//! 실행될지 우리가 모르고**, 어제와 오늘이 다를 수 있다. 대신 셋을 건다:
//!
//! | | 이 파일이 하는 것 |
//! |---|---|
//! | **고정** | 버전을 상수로 박는다. 같은 앱은 언제나 같은 것을 받는다 |
//! | **검증** | 공식 `SHASUMS256.txt` 에서 읽은 해시를 **빌드에 박아 두고** 받은 뒤 대조한다. 안 맞으면 지우고 실패한다 |
//! | **격리** | `<app-data>/runtimes/node/` 안에만. 시스템 Node 도 PATH 도 안 건드리고, 앱을 지우면 같이 사라진다 |
//!
//! 해시는 `https://nodejs.org/dist/<버전>/SHASUMS256.txt` 를 직접 읽어 옮겼다.
//!
//! ## 왜 새 의존성이 없나
//!
//! 받는 것은 `curl`, 푸는 것은 `tar`(macOS/Linux) 또는 PowerShell 의
//! `Expand-Archive`(Windows). 셋 다 OS 가 들고 있고, 해시는 이미 있는 `sha2`
//! 로 낸다. 공급망 표면이 0으로 는다.

use std::path::{Path, PathBuf};

use crate::acp::bounded_output;

/// 받아 둘 Node 버전. **바꾸면 아래 해시도 같이 바꿔야 한다** — 계약 테스트가
/// 버전 문자열과 파일 이름이 어긋나면 막는다.
pub(crate) const MANAGED_NODE_VERSION: &str = "v24.18.0";

/// 한 플랫폼의 공식 배포물.
#[derive(Debug, Clone, Copy)]
pub(crate) struct ManagedNodeArtifact {
    /// 압축을 풀면 나오는 디렉터리 이름의 꼬리(`node-<버전>-<platform>`).
    pub platform: &'static str,
    pub filename: &'static str,
    /// `SHASUMS256.txt` 의 값 그대로.
    pub sha256: &'static str,
    /// 받을 파일의 정확한 바이트 수 — **진행률의 분모다.**
    ///
    /// 박아 두어도 조용히 썩지 않는다: 이 URL 은 버전이 박힌 **불변 배포물**이라
    /// 크기가 달라졌다면 `sha256` 이 먼저 안 맞는다. 즉 이 값의 드리프트는
    /// 이미 있는 해시 게이트가 잡는 것이지 새 감시 대상이 아니다.
    pub bytes: u64,
}

/// **우리가 배포하는 플랫폼만 등재한다.** 안 해 본 자리에 설치를 제안하면,
/// 화면이 우리가 확인한 적 없는 것을 해 주겠다고 말하는 것이 된다. 등재되지
/// 않은 곳에서는 이 기능이 아예 없고, 화면은 종전대로 공식 안내로 보낸다.
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

/// 앱이 받아 둔 Node 가 사는 뿌리. 이 밖으로는 한 바이트도 안 쓴다.
pub(crate) fn managed_node_root(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("runtimes").join("node")
}

/// `node` · `npm` 이 실제로 있는 곳.
pub(crate) fn managed_node_bin_dir(app_data_dir: &Path) -> Option<PathBuf> {
    let artifact = MANAGED_NODE?;
    let root = managed_node_root(app_data_dir).join(artifact.platform);
    // Windows 배포물은 `node.exe`·`npm.cmd` 가 압축 루트에 바로 있다 — `bin/` 이 없다.
    Some(if cfg!(windows) { root } else { root.join("bin") })
}

/// 이미 받아 두었나.
pub(crate) fn managed_node_present(app_data_dir: &Path) -> bool {
    managed_node_bin_dir(app_data_dir)
        .map(|bin| bin.join(if cfg!(windows) { "node.exe" } else { "node" }).exists())
        .unwrap_or(false)
}

/// **화면이 먼저 보여 줄 사실.** 어디서 무엇을 받는지 누르기 전에 읽을 수 있다.
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

/// 받은 파일의 해시가 기대값과 같은가.
///
/// **대조가 이 기능의 존재 이유다.** 이것이 빠지면 우리가 하는 일은
/// 「인터넷에서 받은 것을 실행한다」가 되고, 그건 이 저장소가 안 하기로 한 일이다.
pub(crate) fn sha256_matches(bytes: &[u8], expected: &str) -> bool {
    use sha2::{Digest, Sha256};
    let digest = Sha256::digest(bytes);
    let actual: String = digest.iter().map(|b| format!("{b:02x}")).collect();
    actual.eq_ignore_ascii_case(expected)
}

/// 없으면 받아서 검증하고 푼다. 이미 있으면 아무것도 안 한다.
///
/// 실패는 **닫히는 쪽**이다 — 해시가 안 맞으면 받은 것을 지우고 에러를 낸다.
/// 반쯤 받은 것을 남겨 두면 다음 실행이 그것을 쓰려다 더 이상한 자리에서 죽는다.
/// 설치가 어디까지 왔는지 알리는 통로.
///
/// **왜 콜백인가** — 이 모듈은 Tauri 를 모른다(그래야 테스트가 앱 없이 돈다).
/// 이벤트로 바꾸는 일은 부르는 쪽이 한다.
///
/// `received`/`total` 은 **아는 만큼만** 넘긴다. 모르면 `None` 이고, 화면은
/// 가짜 퍼센트를 그리지 않는다 — 이 저장소의 `formatDownloadProgress` 가
/// 이미 같은 규율을 따른다.
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

    // 받는다. `curl` 은 OS 가 들고 있다 — 새 의존성 0.
    download_with_progress(
        &download_url(&artifact),
        &archive,
        artifact.bytes,
        std::time::Duration::from_secs(660),
        report,
    )?;

    // **대조한다.** 안 맞으면 지우고 실패한다.
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

    // 압축은 `node-<버전>-<platform>/` 으로 풀린다. 우리가 찾는 이름으로 옮긴다.
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

/// 받으면서 **얼마나 왔는지 알린다.**
///
/// `bounded_output` 을 안 쓰는 유일한 이유가 이것이다 — 그 함수는 끝나야
/// 돌아오므로, 52MB 를 받는 동안 화면은 아무 말도 못 한다. 이 저장소의
/// 워크스루가 「조용한 기다림」이라고 이름 붙여 둔 결함이 정확히 그 모양이다.
///
/// **진행은 curl 의 출력이 아니라 받고 있는 파일의 크기로 잰다.** curl 의
/// 진행 막대는 `\r` 로 한 줄을 덮어쓰는 형식이라 줄 단위로 못 읽고,
/// 옵션 이름도 버전마다 다르다. 파일 크기는 어느 curl 에서나 같은 뜻이다.
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
            // 시간이 다 됐으면 **죽이고 거둔다.** 안 거두면 좀비가 남는다.
            let _ = child.kill();
            let _ = child.wait();
            return Err("node-download-failed:timeout".to_string());
        }
        if let Ok(meta) = std::fs::metadata(dest) {
            // 분모를 넘는 값을 보고하지 않는다 — 101% 는 진행률이 아니라 결함이다.
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

/// `Command` 를 값으로 넘기려고 꺼낸다 — `bounded_output` 이 소유권을 받는다.
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
        // 빈 입력의 sha256 — 대조가 실제로 계산을 하는지 보는 고정점.
        let empty = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
        assert!(sha256_matches(b"", empty));
        assert!(sha256_matches(b"", &empty.to_uppercase()));
        assert!(!sha256_matches(b"x", empty));
        // 한 글자만 달라도 막아야 한다 — 이게 이 기능의 존재 이유다.
        let mut tampered = empty.to_string();
        tampered.replace_range(0..1, "f");
        assert!(!sha256_matches(b"", &tampered));
    }

    /// **버전 문자열과 파일 이름이 어긋나면** 받는 주소가 없는 파일을 가리킨다.
    /// 버전을 올리면서 해시만 두고 파일 이름을 안 고치는 실수를 여기서 막는다.
    #[test]
    fn artifact_filename_matches_the_pinned_version() {
        let Some(artifact) = MANAGED_NODE else {
            return; // 등재 안 된 플랫폼 — 이 기능이 없다.
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

    /// **분모가 0이면 진행률이 아니라 나눗셈 사고다.**
    ///
    /// 이 값은 네트워크로 확인할 수 없다(CI 는 밖으로 안 나간다). 그래서 여기서
    /// 재는 것은 「맞는 값인가」가 아니라 **「진행률로 쓸 수 있는 값인가」** 다 —
    /// 실제로 틀렸다면 받은 뒤 `sha256` 이 먼저 안 맞고, 그건 이미 게이트가 있다.
    #[test]
    fn artifact_bytes_can_serve_as_a_denominator() {
        let Some(artifact) = MANAGED_NODE else { return };
        assert!(artifact.bytes > 0, "0 을 분모로 쓸 수 없다");
        // Node 배포물은 수십 MB 다. 자릿수가 어긋나면(바이트 대신 KB 를 적는 등)
        // 진행률이 즉시 100% 로 붙거나 영영 1% 에 머문다.
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
        // 해시 앞머리가 보여야 한다 — 「검증한다」가 말뿐이 아님을 화면이 댄다.
        assert!(plan.contains('('), "{plan}");
    }
}
