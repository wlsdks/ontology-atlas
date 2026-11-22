//! The constant table of agent settings files this reader may open.
//! `tests/fixtures/harness-scope-files.json` pins it for macOS, Linux and Windows.

use serde::Serialize;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum Platform {
    Macos,
    Linux,
    Windows,
}

impl Platform {
    pub(super) fn current() -> Self {
        if cfg!(windows) {
            Self::Windows
        } else if cfg!(target_os = "macos") {
            Self::Macos
        } else {
            Self::Linux
        }
    }

    fn separator(self) -> char {
        match self {
            Self::Windows => '\\',
            Self::Macos | Self::Linux => '/',
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum Tool {
    ClaudeCode,
    Codex,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum Scope {
    User,
    Project,
    Local,
    Managed,
    System,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Format {
    ClaudeSettings,
    CodexHooks,
    /// Only `[hooks.<Event>]` table headers are taken from it.
    CodexConfig,
}

/// The folder a location hangs from. Links at or above a base are resolved; every component
/// below it is opened without following a link.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Base {
    Home,
    Repository,
    /// The folder whose `.claude/settings.local.json` Claude Code reads (`local_checkout`).
    LocalCheckout,
    ClaudeManaged,
    CodexSystem,
}

#[derive(Clone, Copy, Debug)]
pub(super) struct Location {
    pub id: &'static str,
    pub tool: Tool,
    pub scope: Scope,
    pub format: Format,
    pub base: Base,
    pub relative: &'static [&'static str],
}

const CLAUDE_SETTINGS: &[&str] = &[".claude", "settings.json"];
const CLAUDE_LOCAL_SETTINGS: &[&str] = &[".claude", "settings.local.json"];
const CODEX_HOOKS: &[&str] = &[".codex", "hooks.json"];
const CODEX_CONFIG: &[&str] = &[".codex", "config.toml"];

const fn location(
    id: &'static str,
    tool: Tool,
    scope: Scope,
    format: Format,
    base: Base,
    relative: &'static [&'static str],
) -> Location {
    Location {
        id,
        tool,
        scope,
        format,
        base,
        relative,
    }
}

/// Every file this reader opens, in the order pane 2 lists them within a tool.
pub(super) fn scope_locations(platform: Platform) -> [Location; 9] {
    let (managed_relative, system_relative): (&'static [&'static str], &'static [&'static str]) =
        match platform {
            Platform::Macos => (
                &["ClaudeCode", "managed-settings.json"],
                &["codex", "hooks.json"],
            ),
            Platform::Linux => (
                &["claude-code", "managed-settings.json"],
                &["codex", "hooks.json"],
            ),
            Platform::Windows => (
                &["ClaudeCode", "managed-settings.json"],
                &["OpenAI", "Codex", "hooks.json"],
            ),
        };
    use Base::*;
    use Format::*;
    use Scope::*;
    use Tool::*;
    [
        location(
            "claude-project",
            ClaudeCode,
            Project,
            ClaudeSettings,
            Repository,
            CLAUDE_SETTINGS,
        ),
        location(
            "claude-local",
            ClaudeCode,
            Local,
            ClaudeSettings,
            LocalCheckout,
            CLAUDE_LOCAL_SETTINGS,
        ),
        location(
            "claude-user",
            ClaudeCode,
            User,
            ClaudeSettings,
            Home,
            CLAUDE_SETTINGS,
        ),
        location(
            "claude-managed",
            ClaudeCode,
            Managed,
            ClaudeSettings,
            ClaudeManaged,
            managed_relative,
        ),
        location(
            "codex-project",
            Codex,
            Project,
            CodexHooks,
            Repository,
            CODEX_HOOKS,
        ),
        location("codex-user", Codex, User, CodexHooks, Home, CODEX_HOOKS),
        location(
            "codex-system",
            Codex,
            System,
            CodexHooks,
            CodexSystem,
            system_relative,
        ),
        location(
            "codex-project-config",
            Codex,
            Project,
            CodexConfig,
            Repository,
            CODEX_CONFIG,
        ),
        location(
            "codex-user-config",
            Codex,
            User,
            CodexConfig,
            Home,
            CODEX_CONFIG,
        ),
    ]
}

/// `program_data` is `%ProgramData%`; only Windows uses it.
pub(super) fn system_base(
    platform: Platform,
    base: Base,
    program_data: Option<&str>,
) -> Option<String> {
    match (platform, base) {
        (Platform::Macos, Base::ClaudeManaged) => Some("/Library/Application Support".into()),
        (Platform::Linux, Base::ClaudeManaged) => Some("/etc".into()),
        (Platform::Windows, Base::ClaudeManaged) => Some("C:\\Program Files".into()),
        (Platform::Macos | Platform::Linux, Base::CodexSystem) => Some("/etc".into()),
        (Platform::Windows, Base::CodexSystem) => {
            Some(program_data.unwrap_or("C:\\ProgramData").to_string())
        }
        _ => None,
    }
}

/// Claude Code reads the main checkout's Local file from a linked worktree, except on Windows,
/// where it stays beside the worktree's own `.claude/settings.json`.
pub(super) fn local_checkout<T>(platform: Platform, repository: T, main_checkout: Option<T>) -> T {
    match (platform, main_checkout) {
        (Platform::Windows, _) | (_, None) => repository,
        (_, Some(main)) => main,
    }
}

pub(super) fn display_path(platform: Platform, base: &str, relative: &[&str]) -> String {
    let separator = platform.separator();
    let mut path = base.trim_end_matches(separator).to_string();
    for part in relative {
        path.push(separator);
        path.push_str(part);
    }
    path
}
