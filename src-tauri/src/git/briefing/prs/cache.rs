use super::*;
use serde::{Deserialize, Deserializer};
use tauri::Manager;

const STORE_BYTES: usize = 16 * 1024 * 1024;
const ENTRY_BYTES: usize = 512 * 1024;
const STORE_COUNT: usize = 400;

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveReport {
    pub status: String,
    pub saved: usize,
    pub unsaved: usize,
    pub evicted: usize,
}
impl SaveReport {
    pub(super) fn unavailable() -> Self {
        Self { status: if cfg!(unix) { "unavailable" } else { "unsupported" }.into(), ..Default::default() }
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedPulls {
    pub status: String,
    pub pulls: Option<PullDescriptions>,
    pub omitted: usize,
    pub ignored: usize,
}
#[derive(Serialize, Deserialize)]
struct Entry {
    scope: String,
    repository: String,
    merge: String,
    description: PullDescription,
}
#[derive(Serialize, Deserialize)]
struct Envelope {
    version: u8,
    generation: String,
    #[serde(deserialize_with = "bounded_entries")]
    entries: Vec<Entry>,
}
fn bounded_entries<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Vec<Entry>, D::Error> {
    struct Entries;
    impl<'de> serde::de::Visitor<'de> for Entries {
        type Value = Vec<Entry>;
        fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result { f.write_str("at most 400 PR copies") }
        fn visit_seq<A: serde::de::SeqAccess<'de>>(self, mut seq: A) -> Result<Self::Value, A::Error> {
            let mut entries = Vec::new();
            while entries.len() < STORE_COUNT {
                match seq.next_element()? { Some(entry) => entries.push(entry), None => return Ok(entries) }
            }
            if seq.next_element::<serde::de::IgnoredAny>()?.is_some() { return Err(serde::de::Error::custom("too many PR copies")); }
            Ok(entries)
        }
    }
    deserializer.deserialize_seq(Entries)
}
fn generation() -> String {
    static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    format!("{:x}-{:x}-{:x}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_nanos(), std::process::id(), NEXT.fetch_add(1, Ordering::Relaxed))
}
fn scope(identity: &Identity, repository: &str) -> String {
    let mut digest = Sha256::new();
    digest.update(identity.root.as_os_str().as_encoded_bytes());
    digest.update(format!("\0{}\0{}\0{}", identity.object.0, identity.object.1, repository.to_ascii_lowercase()));
    format!("{:x}", digest.finalize())
}
fn valid(entry: &Entry) -> bool {
    let pr = &entry.description;
    entry.scope.len() == 64 && entry.scope.bytes().all(|b| b.is_ascii_hexdigit())
        && github_repository(&format!("https://github.com/{}", entry.repository)).as_deref() == Some(&entry.repository)
        && pr.number > 0 && valid_hash(&entry.merge) && valid_hash(&pr.integration)
        && pr.url.eq_ignore_ascii_case(&format!("https://github.com/{}/pull/{}", entry.repository, pr.number))
        && chrono::DateTime::parse_from_rfc3339(&pr.updated_at).is_ok()
        && chrono::DateTime::parse_from_rfc3339(&pr.fetched_at).is_ok()
        && pr.digest == format!("{:x}", Sha256::digest(format!("{}\0{}\0{}", pr.title, pr.body, pr.updated_at)))
        && serde_json::to_vec(entry).is_ok_and(|bytes| bytes.len() <= ENTRY_BYTES)
}

#[cfg(unix)]
mod confined;
#[cfg(unix)]
use confined::Store;

#[cfg(unix)]
fn app_directory(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let root = app.path().app_local_data_dir().map_err(|_| "unavailable")?;
    let parent = root.parent().ok_or("unavailable")?;
    let name = root.file_name().ok_or("unavailable")?;
    let directory = crate::agent_setup::open_absolute_directory_no_follow(parent)?;
    crate::agent_setup::open_or_create_relative_directory(&directory, Path::new(name), 0o700)?;
    Ok(root)
}
#[cfg(unix)]
pub(super) fn ticket(app: &tauri::AppHandle) -> Result<(PathBuf, String), String> {
    let path = app_directory(app)?;
    let token = Store::open(&path)?.begin_read()?;
    Ok((path, token))
}
#[cfg(not(unix))]
pub(super) fn ticket(_: &tauri::AppHandle) -> Result<(PathBuf, String), String> { Err("unsupported".into()) }

pub(super) fn save(ticket: &Result<(PathBuf, String), String>, identity: &Identity, result: &PullDescriptions, commits: &[BriefingCommit], cancelled: &AtomicBool, preserve_previous: bool) -> SaveReport {
    #[cfg(unix)]
    if let Ok((path, generation)) = ticket {
        if cancelled.load(Ordering::Relaxed) || (result.failure.is_some() && (preserve_previous || result.descriptions.is_empty())) || result.status == "cancelled" || result.status == "unavailable" {
            return SaveReport { status: if result.descriptions.is_empty() { "unchanged" } else { "unavailable" }.into(), ..Default::default() };
        }
        let checked: Vec<_> = commits.iter().filter(|_| result.failure.is_none()).filter(|commit| !result.unchecked_commits.contains(&commit.hash)).map(|commit| commit.hash.clone()).collect();
        return match Store::open(path).and_then(|store| store.save_cancellable(generation, &scope(identity, &result.repository), &result.repository, &result.descriptions, &checked, cancelled)) {
            Ok(report) => report,
            Err(error) if error == "cleared" => SaveReport { status: "superseded".into(), ..Default::default() },
            Err(_) => SaveReport::unavailable(),
        };
    }
    SaveReport::unavailable()
}

#[tauri::command(async)]
pub fn git_briefing_saved_pull_descriptions(app: tauri::AppHandle, source_path: String, head: String, tip: String, base: Option<String>, repository: String, snapshot: String) -> Result<SavedPulls, String> {
    let (before, commits) = source_receipt(&source_path, &head, &tip, base.as_deref(), &snapshot)?;
    if !repositories(&before.root)?.iter().any(|value| value == &repository) { return Err("unavailable".into()); }
    #[cfg(unix)]
    let result = app_directory(&app).and_then(|path| Store::open(&path)?.read()).map(|envelope| restore(envelope, &before, &repository, &commits));
    #[cfg(not(unix))]
    let result: Result<SavedPulls, String> = Err("unsupported".into());
    if picked_identity(&source_path).ok().as_ref() != Some(&before) || !repositories(&before.root)?.contains(&repository) { return Err("stale".into()); }
    Ok(result.unwrap_or(SavedPulls { status: if cfg!(unix) { "unavailable" } else { "unsupported" }.into(), pulls: None, omitted: 0, ignored: 0 }))
}
fn restore(envelope: Envelope, identity: &Identity, repository: &str, commits: &[BriefingCommit]) -> SavedPulls {
    let key = scope(identity, repository);
    let mut entries: Vec<_> = envelope.entries.into_iter().filter(|entry| entry.scope == key && entry.repository.eq_ignore_ascii_case(repository) && commits.iter().any(|commit| commit.hash == entry.description.integration)).collect();
    entries.sort_by_key(|entry| (commits.iter().position(|commit| commit.hash == entry.description.integration).unwrap_or(usize::MAX), entry.description.number));
    let mut ignored = 0;
    let mut eligible = Vec::new();
    let mut seen = HashSet::new();
    for mut entry in entries {
        if !valid(&entry) || !introduced(&identity.root, &entry.merge, &entry.description.integration) || !seen.insert(entry.description.number) { ignored += 1; continue; }
        entry.description.copy_kind = "saved".into();
        entry.description.merge_commit = entry.merge;
        eligible.push(entry.description);
    }
    let mut result = SavedPulls { status: "ready".into(), pulls: Some(PullDescriptions { status: "partial".into(), repository: repository.into(), descriptions: vec![], unchecked: commits.len(), unchecked_commits: commits.iter().map(|c| c.hash.clone()).collect(), unlinked: 0, failure: None, saved: None }), omitted: eligible.len(), ignored };
    for description in eligible.into_iter().take(PR_LIMIT) {
        result.pulls.as_mut().unwrap().descriptions.push(description);
        result.omitted -= 1;
        if serde_json::to_vec(&result).map_or(true, |bytes| bytes.len() > PR_BYTES) {
            result.pulls.as_mut().unwrap().descriptions.pop();
            result.omitted += 1;
            break;
        }
    }
    result
}
#[tauri::command(async)]
pub fn git_briefing_clear_saved_pulls(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(unix)]
    { Store::open(&app_directory(&app)?)?.clear() }
    #[cfg(not(unix))]
    { Err("unsupported".into()) }
}

#[cfg(all(test, unix))]
mod tests;
