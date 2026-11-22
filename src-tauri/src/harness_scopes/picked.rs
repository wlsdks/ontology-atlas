//! A `settings.json` or `hooks.json` the person picked, held by path until the app closes.

use super::paths::Tool;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, OnceLock};

const HELD_MAX: usize = 16;

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct PickedFile {
    pub path: PathBuf,
    pub tool: Tool,
}

impl PickedFile {
    pub(super) fn file_name(&self) -> &'static str {
        match self.tool {
            Tool::ClaudeCode => "settings.json",
            Tool::Codex => "hooks.json",
        }
    }
}

pub(super) fn picked_id(index: usize) -> String {
    format!("picked-{}", index + 1)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum PickRefusal {
    /// Neither `settings.json` nor `hooks.json`.
    Name,
    Link,
    NotAFile,
    /// Inside a Git work tree and not that repository's own settings file.
    InRepository,
    TooMany,
    Unreadable,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(tag = "outcome", rename_all = "kebab-case")]
pub(crate) enum PickOutcome {
    Held {
        id: String,
        path: String,
    },
    Cancelled,
    AlreadyListed {
        path: String,
    },
    Refused {
        reason: PickRefusal,
        path: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        repository: Option<String>,
    },
}

pub(super) fn held_files() -> MutexGuard<'static, Vec<PickedFile>> {
    static HELD: OnceLock<Mutex<Vec<PickedFile>>> = OnceLock::new();
    HELD.get_or_init(|| Mutex::new(Vec::new()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn refused(reason: PickRefusal, path: &Path, repository: Option<&Path>) -> PickOutcome {
    PickOutcome::Refused {
        reason,
        path: path.to_string_lossy().into_owned(),
        repository: repository.map(|path| path.to_string_lossy().into_owned()),
    }
}

/// The nearest folder above `file` that holds a `.git` entry; existence only, nothing is read.
fn enclosing_work_tree(file: &Path) -> Option<&Path> {
    file.parent()?
        .ancestors()
        .find(|folder| fs::symlink_metadata(folder.join(".git")).is_ok())
}

fn is_own_settings_file(repository: &Path, file: &Path) -> bool {
    [
        repository.join(".claude").join("settings.json"),
        repository.join(".codex").join("hooks.json"),
    ]
    .iter()
    .any(|own| own == file)
}

/// `listed` holds the canonical paths the reader already opens by name.
pub(super) fn hold_picked(
    held: &mut Vec<PickedFile>,
    picked: &Path,
    listed: &[PathBuf],
) -> PickOutcome {
    let tool = match picked.file_name().and_then(|name| name.to_str()) {
        Some("settings.json") => Tool::ClaudeCode,
        Some("hooks.json") => Tool::Codex,
        _ => return refused(PickRefusal::Name, picked, None),
    };
    let Ok(entry) = fs::symlink_metadata(picked) else {
        return refused(PickRefusal::Unreadable, picked, None);
    };
    if entry.file_type().is_symlink() {
        return refused(PickRefusal::Link, picked, None);
    }
    if !entry.is_file() {
        return refused(PickRefusal::NotAFile, picked, None);
    }
    let Ok(canonical) = fs::canonicalize(picked) else {
        return refused(PickRefusal::Unreadable, picked, None);
    };
    if let Some(repository) = enclosing_work_tree(&canonical) {
        if !is_own_settings_file(repository, &canonical) {
            return refused(PickRefusal::InRepository, &canonical, Some(repository));
        }
    }
    let path = canonical.to_string_lossy().into_owned();
    if listed.contains(&canonical) || held.iter().any(|file| file.path == canonical) {
        return PickOutcome::AlreadyListed { path };
    }
    if held.len() >= HELD_MAX {
        return refused(PickRefusal::TooMany, &canonical, None);
    }
    held.push(PickedFile {
        path: canonical,
        tool,
    });
    PickOutcome::Held {
        id: picked_id(held.len() - 1),
        path,
    }
}
