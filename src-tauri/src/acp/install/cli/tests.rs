use super::*;
use crate::acp::registry::registry_agent;

/// The shown and executed string must carry `--prefix` and a pinned version.
#[test]
fn install_command_is_pinned_and_confined_to_our_own_prefix() {
    let app_data = Path::new("/tmp/atlas-app-data");
    let cmd = managed_install_command("claude-acp", app_data).unwrap();

    // Built with the same API so Windows separators compare correctly.
    let expected_prefix = managed_cli_prefix(app_data);
    assert!(
        cmd.contains(&format!("--prefix {}", expected_prefix.display())),
        "{cmd}"
    );
    assert!(cmd.contains("managed-node"), "{cmd}");
    assert!(cmd.contains("@anthropic-ai/claude-code@"), "{cmd}");
    assert!(!cmd.contains("@latest"), "{cmd}");
    let package = installable_package("claude-acp").unwrap();
    assert!(
        package
            .rsplit('@')
            .next()
            .is_some_and(|v| v.chars().next().is_some_and(|c| c.is_ascii_digit())),
        "version is not pinned: {package}"
    );
}

#[test]
fn only_measured_runtimes_can_be_installed_for_the_user() {
    // Never propose installing an unverified package.
    assert!(managed_install_command("gemini-acp", Path::new("/tmp/x")).is_none());
    assert!(installable_package("gemini-acp").is_none());
    for (id, _) in INSTALLABLE_CLI {
        assert!(
            registry_agent(id).is_some(),
            "{id} is missing from the registry"
        );
    }
}
