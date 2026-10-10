use super::*;

#[test]
fn host_platform_is_one_of_the_three_we_guide() {
    assert!(matches!(host_platform(), "macos" | "windows" | "linux"));
}

#[test]
fn git_probe_reports_this_machine_truthfully() {
    let probe = git_probe();
    assert!(probe.installed);
    assert!(probe.version.as_deref().unwrap_or("").contains("git"));
}
