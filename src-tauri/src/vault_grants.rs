//! The set of filesystem roots the user actually granted, and the gate that keeps
//! the vault-scope commands operating only inside them.
//!
//! Every vault command takes a `root_path` from the WebView and, on its own, only
//! proves a relative path cannot escape *that argument*. With a WebView XSS the
//! attacker chooses the argument, so `invoke('read_vault_text_file', { rootPath:
//! '/Users/me', relativePath: '.ssh/id_rsa' })` walked straight out of any vault.
//! This registry is the missing boundary: a root is honoured only when it equals or
//! sits inside a directory the user genuinely chose — the native folder picker, the
//! app's own vault container, or a vault restored from a Rust-owned record of a
//! prior choice (never a path the renderer merely asserts).
//!
//! Enforcement turns on once `initialize` runs at startup. Before that (unit tests
//! that never call it) the gate is permissive; a test enforces on its own thread
//! through `EnforcedScope` rather than flipping global state.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};

/// True once production startup has seeded the registry; keeps test-built commands
/// that never call `initialize` working while production enforces.
static ENFORCING: AtomicBool = AtomicBool::new(false);

#[derive(Default)]
pub(crate) struct Registry {
    /// Roots the user chose for vault content: picker result, app vault container,
    /// restored prior choice. Vault read/write/list/git all gate on these.
    vaults: HashSet<PathBuf>,
    /// Repository roots discovered from a granted vault, for project-source
    /// inspection only (it may climb to the repo the vault lives in). Never widens
    /// what the content commands can read.
    sources: HashSet<PathBuf>,
    /// Where granted vault roots persist across launches; `None` in tests.
    store: Option<PathBuf>,
}

fn within(roots: &HashSet<PathBuf>, path: &Path) -> bool {
    roots
        .iter()
        .any(|root| path == root || path.starts_with(root))
}

impl Registry {
    fn is_vault_granted(&self, path: &Path) -> bool {
        within(&self.vaults, path)
    }

    fn is_source_granted(&self, path: &Path) -> bool {
        within(&self.vaults, path) || within(&self.sources, path)
    }

    /// Adds `root` (already canonical) and, when given, the repository root the vault
    /// lives in so a project-source inspection of that repo is allowed.
    fn grant(&mut self, root: PathBuf, repo_root: Option<PathBuf>) {
        if let Some(repo) = repo_root {
            self.sources.insert(repo);
        }
        self.vaults.insert(root);
    }

    fn persist(&self) {
        let Some(store) = self.store.as_ref() else {
            return;
        };
        let mut roots: Vec<String> = self
            .vaults
            .iter()
            .map(|p| p.to_string_lossy().to_string())
            .collect();
        roots.sort();
        if let Some(parent) = store.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_string_pretty(&roots) {
            let _ = std::fs::write(store, json);
        }
    }
}

fn registry() -> &'static Mutex<Registry> {
    static REGISTRY: OnceLock<Mutex<Registry>> = OnceLock::new();
    REGISTRY.get_or_init(|| Mutex::new(Registry::default()))
}

fn lock() -> std::sync::MutexGuard<'static, Registry> {
    registry().lock().unwrap_or_else(|e| e.into_inner())
}

/// The repo root a granted vault lives in, for the source allowlist. Runs a hardened
/// git command, so it stays off the registry lock.
fn repo_root_of(path: &Path) -> Option<PathBuf> {
    crate::git::find_repo_root(path).ok().flatten()
}

/// Reads the roots a prior launch persisted. A record written only by a genuine grant
/// is the Rust-owned proof of the user's earlier choice that restore re-grants from.
fn read_persisted(store: &Path) -> Vec<String> {
    let Ok(text) = std::fs::read_to_string(store) else {
        return Vec::new();
    };
    serde_json::from_str::<Vec<String>>(&text).unwrap_or_default()
}

/// Production startup: turn enforcement on, remember where to persist, re-grant the
/// app's own vault container and every vault a prior launch recorded.
pub(crate) fn initialize(store: PathBuf, app_vault_container: Option<PathBuf>) {
    let persisted = read_persisted(&store);
    let mut restored: Vec<(PathBuf, Option<PathBuf>)> = Vec::new();
    if let Some(container) = app_vault_container.and_then(|c| std::fs::canonicalize(c).ok()) {
        restored.push((container.clone(), repo_root_of(&container)));
    }
    for raw in persisted {
        if let Ok(canonical) = std::fs::canonicalize(&raw) {
            let repo = repo_root_of(&canonical);
            restored.push((canonical, repo));
        }
    }
    {
        let mut reg = lock();
        reg.store = Some(store);
        for (root, repo) in restored {
            reg.grant(root, repo);
        }
    }
    ENFORCING.store(true, Ordering::SeqCst);
}

/// Grants a root the user chose through a Rust-validated path (the native picker or
/// the app vault container) and persists it so the next launch restores it.
pub(crate) fn grant_vault_root(root: &Path) {
    let Ok(canonical) = std::fs::canonicalize(root) else {
        return;
    };
    let repo = repo_root_of(&canonical);
    let mut reg = lock();
    reg.grant(canonical, repo);
    reg.persist();
}

/// Gate for vault content, git and archive commands. Permissive until `initialize`.
pub(crate) fn is_vault_granted(path: &Path) -> bool {
    if let Some(answer) = thread_override(|reg| reg.is_vault_granted(path)) {
        return answer;
    }
    if !ENFORCING.load(Ordering::SeqCst) {
        return true;
    }
    lock().is_vault_granted(path)
}

/// Gate for project-source inspection, which may target the repo a granted vault
/// lives in. Permissive until `initialize`.
pub(crate) fn is_source_granted(path: &Path) -> bool {
    if let Some(answer) = thread_override(|reg| reg.is_source_granted(path)) {
        return answer;
    }
    if !ENFORCING.load(Ordering::SeqCst) {
        return true;
    }
    lock().is_source_granted(path)
}

#[cfg(not(test))]
fn thread_override(_check: impl Fn(&Registry) -> bool) -> Option<bool> {
    None
}

#[cfg(test)]
thread_local! {
    static THREAD_REGISTRY: std::cell::RefCell<Option<Registry>> =
        const { std::cell::RefCell::new(None) };
}

#[cfg(test)]
fn thread_override(check: impl Fn(&Registry) -> bool) -> Option<bool> {
    THREAD_REGISTRY.with(|slot| slot.borrow().as_ref().map(check))
}

#[cfg(test)]
pub(crate) struct EnforcedScope;

#[cfg(test)]
impl EnforcedScope {
    pub(crate) fn granting(vaults: &[PathBuf]) -> Self {
        let mut reg = Registry::default();
        for vault in vaults {
            reg.grant(vault.clone(), None);
        }
        THREAD_REGISTRY.with(|slot| *slot.borrow_mut() = Some(reg));
        EnforcedScope
    }
}

#[cfg(test)]
impl Drop for EnforcedScope {
    fn drop(&mut self) {
        THREAD_REGISTRY.with(|slot| *slot.borrow_mut() = None);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("atlas-grant-{label}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::canonicalize(&dir).unwrap()
    }

    #[test]
    fn a_granted_root_admits_itself_and_descendants_but_nothing_else() {
        let base = tmp("scope");
        let vault = base.join("vault");
        std::fs::create_dir_all(vault.join("nested")).unwrap();
        let mut reg = Registry::default();
        reg.grant(vault.clone(), None);

        assert!(reg.is_vault_granted(&vault), "the granted root itself");
        assert!(reg.is_vault_granted(&vault.join("nested")), "a descendant");
        assert!(
            !reg.is_vault_granted(&base),
            "the parent of a granted root is not granted"
        );
        // The kind of secret path outside every granted root the exploit reached
        // (a fixed absolute path, so the test does not depend on $HOME/%USERPROFILE%).
        let secret = tmp("outside").join(".ssh/id_rsa");
        assert!(
            !reg.is_vault_granted(secret.parent().unwrap()),
            "an outside dir is not granted"
        );
        assert!(
            !reg.is_vault_granted(&secret),
            "a secret outside every granted root stays refused"
        );
    }

    #[test]
    fn a_source_root_never_widens_the_content_gate() {
        let base = tmp("source");
        let vault = base.join("repo/atlas");
        let repo = base.join("repo");
        std::fs::create_dir_all(&vault).unwrap();
        let mut reg = Registry::default();
        reg.grant(vault.clone(), Some(repo.clone()));

        assert!(
            reg.is_source_granted(&repo),
            "the vault's repo is a source root"
        );
        assert!(
            !reg.is_vault_granted(&repo),
            "but the repo is not a content root, so reads stay scoped to the vault"
        );
    }

    #[test]
    fn persist_and_reload_round_trip_the_granted_roots() {
        let base = tmp("persist");
        let store = base.join("granted-vault-roots.json");
        let vault = base.join("vault");
        std::fs::create_dir_all(&vault).unwrap();
        let mut reg = Registry {
            store: Some(store.clone()),
            ..Registry::default()
        };
        reg.grant(std::fs::canonicalize(&vault).unwrap(), None);
        reg.persist();

        let reloaded = read_persisted(&store);
        assert_eq!(reloaded.len(), 1, "one root persisted");
        assert!(
            reloaded[0].ends_with("vault"),
            "the canonical vault path is what a later launch re-grants"
        );
    }
}
