//! The filesystem roots the user actually granted, and the gate keeping vault-scope commands inside them.
//! A `root_path` from the WebView only proves a relative path cannot escape that argument, so a root is
//! honoured only when it equals or sits inside a native-picker choice, the app's vault container, or a
//! Rust-owned record of a prior choice; a verification launch adds its fixture folders for that launch only
//! and never persisted (`grant_launch_vault_root`).
//! Enforcement starts at `initialize`; before it (unit tests) the gate is permissive, and a test enforces
//! on its own thread through `EnforcedScope`.

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
    /// what the content commands can read; `harness_source` reads its allowlist under one.
    sources: HashSet<PathBuf>,
    selected_sources: HashSet<PathBuf>,
    /// The subset of `vaults` granted for this launch only. `persist` leaves them out,
    /// so a verification run leaves the person's grant list as it found it.
    launch_only: HashSet<PathBuf>,
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
        // A genuine choice outlives the launch even when a verification run named it first.
        self.launch_only.remove(&root);
        self.vaults.insert(root);
    }

    /// Like `grant`, but a root the person had not already chosen is not persisted.
    fn grant_for_launch(&mut self, root: PathBuf, repo_root: Option<PathBuf>) {
        // An earlier launch grant of the same root is in `vaults` too; it is not a choice.
        let already_chosen = self.vaults.contains(&root) && !self.launch_only.contains(&root);
        self.grant(root.clone(), repo_root);
        if !already_chosen {
            self.launch_only.insert(root);
        }
    }

    fn persist(&self) {
        let Some(store) = self.store.as_ref() else {
            return;
        };
        let mut roots: Vec<String> = self
            .vaults
            .iter()
            .filter(|root| !self.launch_only.contains(*root))
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
    restored.extend(restorable_roots(persisted).into_iter().map(|root| {
        let repo = repo_root_of(&root);
        (root, repo)
    }));
    {
        let mut reg = lock();
        reg.store = Some(store);
        for (root, repo) in restored {
            reg.grant(root, repo);
        }
    }
    ENFORCING.store(true, Ordering::SeqCst);
}

/// The recorded roots a launch may grant again. The record is a file any process of
/// this user can write, so each root passes the picker's refusals again; a refused one
/// is dropped and leaves the record at its next save.
fn restorable_roots(persisted: Vec<String>) -> Vec<PathBuf> {
    persisted
        .into_iter()
        .filter_map(|raw| std::fs::canonicalize(raw).ok())
        .filter(|root| root.is_dir() && crate::vault_root_rejection(root).is_none())
        .collect()
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

pub(crate) fn grant_source_root(root: &Path) {
    let Ok(canonical) = std::fs::canonicalize(root) else {
        return;
    };
    with_registry(|registry| {
        registry.sources.insert(canonical.clone());
        registry.selected_sources.insert(canonical);
    });
}

/// Grants, for this launch only, a folder a verification run names in its launch
/// environment. The picker's refusals of named positions (home, a filesystem root,
/// system folders, app bundles) apply to the canonical path, so a symlink or `..` to
/// one is refused too. Returns the canonical root, or why it was refused.
pub(crate) fn grant_launch_vault_root(root: &Path) -> Result<PathBuf, String> {
    let canonical = std::fs::canonicalize(root).map_err(|error| error.to_string())?;
    if !canonical.is_dir() {
        return Err("vault root must be a directory".into());
    }
    if let Some(reason) = crate::vault_root_rejection(&canonical) {
        return Err(format!("vault-root-rejected:{reason}"));
    }
    let repo = repo_root_of(&canonical);
    with_registry(|registry| registry.grant_for_launch(canonical.clone(), repo));
    Ok(canonical)
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

/// Whether `path` (canonical) is a granted vault root or a folder above one. A drop of such a
/// folder would copy the open folder into its own `sources/`.
pub(crate) fn holds_a_vault_root(path: &Path) -> bool {
    let holds = |reg: &Registry| reg.vaults.iter().any(|root| root.starts_with(path));
    if let Some(answer) = thread_override(holds) {
        return answer;
    }
    holds(&lock())
}

pub(crate) fn is_selected_source(path: &Path) -> bool {
    if let Some(answer) = thread_override(|reg| reg.selected_sources.contains(path)) {
        return answer;
    }
    lock().selected_sources.contains(path)
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

/// Changes this thread's test registry when a test set one, else the app's.
fn with_registry<T>(change: impl FnOnce(&mut Registry) -> T) -> T {
    #[cfg(test)]
    let change = match THREAD_REGISTRY.with(|slot| match slot.borrow_mut().as_mut() {
        Some(registry) => Ok(change(registry)),
        None => Err(change),
    }) {
        Ok(changed) => return changed,
        Err(change) => change,
    };
    change(&mut lock())
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

    #[test]
    fn a_launch_grant_admits_its_root_but_never_reaches_the_persisted_list() {
        let base = tmp("launch");
        let store = base.join("granted-vault-roots.json");
        let chosen = base.join("chosen");
        let fixture = base.join("fixture");
        std::fs::create_dir_all(&chosen).unwrap();
        std::fs::create_dir_all(&fixture).unwrap();
        let mut reg = Registry {
            store: Some(store.clone()),
            ..Registry::default()
        };
        reg.grant(chosen.clone(), None);
        reg.grant_for_launch(fixture.clone(), None);
        // A verify list may name one folder twice, or by two spellings of one path.
        reg.grant_for_launch(fixture.clone(), None);
        assert!(
            reg.is_vault_granted(&fixture),
            "the fixture opens this launch"
        );

        reg.persist();
        let chosen_only = vec![chosen.to_string_lossy().to_string()];
        assert_eq!(
            read_persisted(&store),
            chosen_only,
            "the fixture is not kept"
        );

        reg.grant_for_launch(chosen.clone(), None);
        reg.persist();
        assert_eq!(
            read_persisted(&store),
            chosen_only,
            "a run naming a folder the person chose does not drop it"
        );

        reg.grant(fixture.clone(), None);
        reg.persist();
        assert_eq!(
            read_persisted(&store).len(),
            2,
            "a later genuine choice of the fixture is kept"
        );
    }

    #[test]
    fn a_recorded_root_the_picker_would_refuse_is_not_granted_again() {
        let base = tmp("restore");
        let kept = base.join("notes");
        std::fs::create_dir_all(&kept).unwrap();
        let home = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).unwrap();
        let file = base.join("not-a-folder.md");
        std::fs::write(&file, "x").unwrap();
        let persisted = vec![
            kept.to_string_lossy().to_string(),
            home.to_string_lossy().to_string(),
            "/".to_string(),
            file.to_string_lossy().to_string(),
            base.join("gone").to_string_lossy().to_string(),
        ];
        assert_eq!(restorable_roots(persisted), vec![kept]);
    }

    #[test]
    fn a_launch_grant_refuses_the_home_folder_like_the_picker() {
        let _scope = EnforcedScope::granting(&[]);
        let home = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
            .map(PathBuf::from)
            .unwrap();
        let refusal = grant_launch_vault_root(&home).unwrap_err();
        assert!(refusal.contains("home-directory"), "{refusal}");
        assert!(!is_vault_granted(&std::fs::canonicalize(&home).unwrap()));
    }

    #[cfg(unix)]
    #[test]
    fn a_launch_grant_judges_a_link_to_the_home_folder_where_it_leads() {
        let _scope = EnforcedScope::granting(&[]);
        let home = PathBuf::from(std::env::var_os("HOME").unwrap());
        let base = tmp("launch-link");
        let link = base.join("looks-like-a-fixture");
        std::os::unix::fs::symlink(&home, &link).unwrap();
        let refusal = grant_launch_vault_root(&link).unwrap_err();
        assert!(refusal.contains("home-directory"), "{refusal}");
        assert!(!is_vault_granted(&std::fs::canonicalize(&home).unwrap()));
    }
}
