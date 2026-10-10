/// Generated into `src-tauri/src/acp-registry.json` by `scripts/build-acp-registry.mjs`
/// and never fetched at runtime: no unrequested network traffic, and it works offline.
#[derive(Debug, Clone, serde::Deserialize)]
pub(crate) struct RegistryAgent {
    pub id: String,
    pub name: String,
    pub description: String,
    pub website: Option<String>,
    pub license: Option<String>,
    /// Guards against the UI claiming work it has not done.
    pub verified: bool,
    /// `None` when unknown; a guess would fabricate a reason for absence.
    pub cli: Option<String>,
    /// Bundled at build time so the app fetches no images.
    pub icon: Option<String>,
    /// Human-verified pairs only; a missing value draws grayscale, which beats a wrong brand.
    #[serde(default, rename = "brandInk")]
    pub brand_ink: Option<String>,
    pub launch: RegistryLaunch,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub(crate) enum RegistryLaunch {
    Npx {
        package: String,
        #[serde(default)]
        args: Vec<String>,
    },
    Uvx {
        package: String,
        #[serde(default)]
        args: Vec<String>,
    },
    /// Launches what is already on PATH. App-managed installs follow the rules in the
    /// agent-install section of `.claude/rules/surfaces.md`.
    Binary {
        command: String,
        #[serde(default)]
        args: Vec<String>,
    },
}

#[derive(Debug, Clone, Default, serde::Deserialize)]
pub(super) struct RegistrySnapshot {
    agents: Vec<RegistryAgent>,
    #[serde(default, rename = "npmDependencyCutoff")]
    pub(super) npm_dependency_cutoff: Option<String>,
}

/// Parsed once; a corrupt snapshot yields an empty list, so the UI says "nothing
/// found" rather than launching something invalid.
pub(super) fn snapshot() -> &'static RegistrySnapshot {
    static SNAPSHOT: std::sync::OnceLock<RegistrySnapshot> = std::sync::OnceLock::new();
    SNAPSHOT
        .get_or_init(|| serde_json::from_str(include_str!("../acp-registry.json")).unwrap_or_default())
}

pub(super) fn registry() -> &'static [RegistryAgent] {
    &snapshot().agents
}

pub(crate) fn registry_agent(id: &str) -> Option<&'static RegistryAgent> {
    registry().iter().find(|a| a.id == id)
}

// Config-directory isolation alone proves neither filesystem nor MCP permission control.
// runtime-gate.ts owns chat eligibility and the required session mode.

/// Runtimes whose permission gate was measured; not the same as `ISOLATION`
/// (decision (111)). Joining requires an installed-app run showing reject-without-write,
/// allow-with-write and a fresh question after `allow_once` for every write path.
pub(crate) const CHAT_ELIGIBLE: &[&str] = &["claude-acp", "codex-acp"];

pub(crate) fn chat_eligible(id: &str) -> bool {
    CHAT_ELIGIBLE.contains(&id)
}

#[cfg(test)]
mod tests;
