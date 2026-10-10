use std::path::{Path, PathBuf};

/// Only CLIs meeting all four conditions of `.claude/rules/surfaces.md`
/// ("Installing an agent tool for the user"): version pinned and installed under the
/// app's own prefix, never global npm or the system PATH.
const INSTALLABLE_CLI: &[(&str, &str)] = &[
    ("claude-acp", "@anthropic-ai/claude-code@2.1.237"),
    ("codex-acp", "@openai/codex@0.148.0"),
];

pub(crate) fn installable_package(runtime_id: &str) -> Option<&'static str> {
    INSTALLABLE_CLI
        .iter()
        .find(|(id, _)| *id == runtime_id)
        .map(|(_, pkg)| *pkg)
}

/// Nothing is written outside it.
pub(crate) fn managed_cli_prefix(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("managed-node")
}

/// Added to PATH candidates.
pub(crate) fn managed_cli_bin_dir(app_data_dir: &Path) -> PathBuf {
    managed_cli_prefix(app_data_dir).join("bin")
}

/// The literal command the screen shows before the press.
pub(crate) fn managed_install_command(runtime_id: &str, app_data_dir: &Path) -> Option<String> {
    let package = installable_package(runtime_id)?;
    Some(format!(
        "npm install --prefix {} --global {package}",
        managed_cli_prefix(app_data_dir).display()
    ))
}

#[cfg(test)]
mod tests;
