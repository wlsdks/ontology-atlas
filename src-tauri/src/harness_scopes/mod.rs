//! Agent settings files from every scope: User, Project, Local, Managed and System, plus files the
//! person picked. Fixed names only, never a folder listing and never a path the page sends; each
//! file is reduced to the fields `parse.rs` names before anything is returned.

mod git;
mod open;
mod parse;
mod paths;
mod picked;
#[cfg(test)]
mod tests;

use crate::harness_source::authorized_source_root;
use open::{read_settings_below, OpenFailure};
use parse::{
    inline_hook_events, parse_claude_settings, parse_codex_hooks, PermissionCounts, ScopeHook,
};
use paths::{display_path, local_checkout, scope_locations, system_base, Base, Format, Location};
use paths::{Platform, Scope, Tool};
use picked::{held_files, hold_picked, picked_id, PickOutcome, PickedFile};
use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum FileStatus {
    Read,
    Missing,
    /// Not a JSON object of the expected shape; nothing from it is returned.
    Invalid,
    Unreadable,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ScopeFile {
    id: String,
    tool: Tool,
    scope: Scope,
    path: String,
    picked: bool,
    status: FileStatus,
    failure: Option<OpenFailure>,
    bytes: Option<u64>,
    modified_ms: Option<u64>,
    hooks: Vec<ScopeHook>,
    disable_all_hooks: Option<bool>,
    allow_managed_hooks_only: Option<bool>,
    permission_counts: Option<PermissionCounts>,
}

/// Codex hooks defined in a `config.toml`, named by event only.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct InlineHooks {
    id: &'static str,
    tool: Tool,
    scope: Scope,
    path: String,
    status: FileStatus,
    failure: Option<OpenFailure>,
    events: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorktreeFacts {
    linked: bool,
    /// The connected worktree's own Local file, when it exists and Claude Code reads another.
    unused_local_file: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HarnessScopes {
    platform: Platform,
    repository: String,
    files: Vec<ScopeFile>,
    inline_hooks: Vec<InlineHooks>,
    worktree: WorktreeFacts,
    /// Git's view of the Local file Claude Code reads; `None` outside a work tree.
    local_file_git: Option<git::LocalFileGit>,
}

/// The machine the app runs on; tests point the system folders at a scratch folder.
pub(super) struct Host {
    platform: Platform,
    home: Option<PathBuf>,
    claude_managed: Option<PathBuf>,
    codex_system: Option<PathBuf>,
}

impl Host {
    fn current() -> Self {
        let platform = Platform::current();
        let home_key = if cfg!(windows) { "USERPROFILE" } else { "HOME" };
        let home = std::env::var_os(home_key)
            .filter(|home| !home.is_empty())
            .map(PathBuf::from);
        let program_data = std::env::var("ProgramData")
            .ok()
            .filter(|_| platform == Platform::Windows);
        let system = |base| system_base(platform, base, program_data.as_deref()).map(PathBuf::from);
        Self {
            platform,
            home,
            claude_managed: system(Base::ClaudeManaged),
            codex_system: system(Base::CodexSystem),
        }
    }

    fn user_settings_paths(&self) -> Vec<PathBuf> {
        let Some(home) = &self.home else {
            return Vec::new();
        };
        scope_locations(self.platform)
            .iter()
            .filter(|location| location.base == Base::Home)
            .filter_map(|location| {
                let mut path = home.clone();
                path.extend(location.relative);
                std::fs::canonicalize(path).ok()
            })
            .collect()
    }
}

struct Bases<'a> {
    host: &'a Host,
    repository: &'a Path,
    local_checkout: &'a Path,
}

impl Bases<'_> {
    fn of(&self, base: Base) -> Option<&Path> {
        match base {
            Base::Home => self.host.home.as_deref(),
            Base::Repository => Some(self.repository),
            Base::LocalCheckout => Some(self.local_checkout),
            Base::ClaudeManaged => self.host.claude_managed.as_deref(),
            Base::CodexSystem => self.host.codex_system.as_deref(),
        }
    }
}

struct Opened {
    path: String,
    status: FileStatus,
    failure: Option<OpenFailure>,
    bytes: Option<u64>,
    modified_ms: Option<u64>,
    content: Option<Vec<u8>>,
}

fn open_settings(platform: Platform, base: &Path, relative: &[&str]) -> Opened {
    let path = display_path(platform, &base.to_string_lossy(), relative);
    match read_settings_below(base, relative) {
        Ok(read) => Opened {
            path,
            status: FileStatus::Read,
            failure: None,
            bytes: Some(read.size),
            modified_ms: read.modified_ms,
            content: Some(read.bytes),
        },
        Err(failure) => Opened {
            path,
            status: if failure == OpenFailure::Missing {
                FileStatus::Missing
            } else {
                FileStatus::Unreadable
            },
            failure: Some(failure).filter(|failure| *failure != OpenFailure::Missing),
            bytes: None,
            modified_ms: None,
            content: None,
        },
    }
}

fn scope_file(
    id: String,
    tool: Tool,
    scope: Scope,
    picked: bool,
    format: Format,
    opened: Opened,
) -> ScopeFile {
    let parsed = opened.content.as_deref().map(|bytes| match format {
        Format::ClaudeSettings => parse_claude_settings(bytes),
        Format::CodexHooks | Format::CodexConfig => parse_codex_hooks(bytes),
    });
    let status = match parsed {
        Some(None) => FileStatus::Invalid,
        _ => opened.status,
    };
    let parsed = parsed.flatten().unwrap_or_default();
    ScopeFile {
        id,
        tool,
        scope,
        path: opened.path,
        picked,
        status,
        failure: opened.failure,
        bytes: opened.bytes,
        modified_ms: opened.modified_ms,
        hooks: parsed.hooks,
        disable_all_hooks: parsed.disable_all_hooks,
        allow_managed_hooks_only: parsed.allow_managed_hooks_only,
        permission_counts: parsed.permission_counts,
    }
}

fn inline_hooks(location: &Location, opened: Opened) -> InlineHooks {
    let text = opened.content.as_deref().map(std::str::from_utf8);
    let status = match text {
        Some(Err(_)) => FileStatus::Invalid,
        _ => opened.status,
    };
    InlineHooks {
        id: location.id,
        tool: location.tool,
        scope: location.scope,
        path: opened.path,
        status,
        failure: opened.failure,
        events: text
            .and_then(Result::ok)
            .map(inline_hook_events)
            .unwrap_or_default(),
    }
}

fn exists_below(base: &Path, relative: &[&str]) -> bool {
    read_settings_below(base, relative).is_ok()
}

pub(super) fn read_scopes(host: &Host, repository: &Path, picked: &[PickedFile]) -> HarnessScopes {
    let layout = git::worktree_layout(repository);
    let linked = layout.as_ref().is_some_and(|layout| layout.linked);
    let main_checkout = layout.and_then(|layout| layout.main_checkout);
    let local_base = local_checkout(host.platform, repository, main_checkout.as_deref());
    let bases = Bases {
        host,
        repository,
        local_checkout: local_base,
    };
    let mut files = Vec::new();
    let mut inline = Vec::new();
    for location in scope_locations(host.platform) {
        let Some(base) = bases.of(location.base) else {
            continue;
        };
        let opened = open_settings(host.platform, base, location.relative);
        if location.format == Format::CodexConfig {
            inline.push(inline_hooks(&location, opened));
        } else {
            files.push(scope_file(
                location.id.to_string(),
                location.tool,
                location.scope,
                false,
                location.format,
                opened,
            ));
        }
    }
    for (index, file) in picked.iter().enumerate() {
        let Some(folder) = file.path.parent() else {
            continue;
        };
        let format = match file.tool {
            Tool::ClaudeCode => Format::ClaudeSettings,
            Tool::Codex => Format::CodexHooks,
        };
        let opened = open_settings(host.platform, folder, &[file.file_name()]);
        files.push(scope_file(
            picked_id(index),
            file.tool,
            Scope::User,
            true,
            format,
            opened,
        ));
    }
    let local_relative = scope_locations(host.platform)
        .iter()
        .find(|location| location.base == Base::LocalCheckout)
        .map_or(&[][..], |location| location.relative);
    let unused_local_file = (local_base != repository && exists_below(repository, local_relative))
        .then(|| display_path(host.platform, &repository.to_string_lossy(), local_relative));
    HarnessScopes {
        platform: host.platform,
        repository: repository.to_string_lossy().into_owned(),
        files,
        inline_hooks: inline,
        worktree: WorktreeFacts {
            linked,
            unused_local_file,
        },
        local_file_git: git::local_file_git(local_base),
    }
}

#[tauri::command(async)]
pub(crate) fn read_harness_scopes(
    vault_path: String,
    project_slug: String,
) -> Result<HarnessScopes, String> {
    let repository = authorized_source_root(&vault_path, &project_slug)?;
    let picked = held_files().clone();
    Ok(read_scopes(&Host::current(), &repository, &picked))
}

/// Not `async`: `NSOpenPanel` must run on the macOS main thread.
#[tauri::command]
pub(crate) fn pick_harness_scope_file(dialog_title: Option<String>) -> Result<PickOutcome, String> {
    let title = dialog_title
        .as_deref()
        .unwrap_or("Show another settings file");
    let Some(path) = rfd::FileDialog::new().set_title(title).pick_file() else {
        return Ok(PickOutcome::Cancelled);
    };
    let listed = Host::current().user_settings_paths();
    Ok(hold_picked(&mut held_files(), &path, &listed))
}
