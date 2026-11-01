use super::*;
use std::collections::{BTreeMap, BTreeSet};
use std::sync::atomic::AtomicU64;
use std::time::Instant;

mod transport;
use transport::{fetch, identity_until, next_page, page_path, repositories_until, Page, PageError};
#[cfg(test)]
use transport::{parse_response, public_curl};

const PAGE_SIZES: [usize; 5] = [20, 10, 5, 2, 1];
const PAGES_PER_ACTION: usize = 5;
const ACTION_BYTES: usize = 2 * 1024 * 1024;
const SESSION_BYTES: usize = 16 * 1024 * 1024;
const RECORD_BYTES: usize = 512 * 1024;
const RECORD_LIMIT: usize = 400;
const OMISSION_LIMIT: usize = 400;
const SCAN_LIMIT: usize = 32;
const LINK_BYTES: usize = 8192;
const ACTION_SECONDS: u64 = 60;
const LIST_TRAILER: &str = "%{stderr}\nATLAS_LINK\t%header{link}";

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicPullVersion {
    pub number: u64,
    pub title: String,
    pub body: String,
    pub body_present: bool,
    pub url: String,
    pub updated_at: String,
    pub fetched_at: String,
    pub status: String,
    pub digest: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicPullOmission {
    pub number: u64,
    pub updated_at: String,
    pub digest: String,
    pub reason: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicPullInventory {
    pub status: &'static str,
    pub reason: Option<&'static str>,
    pub repository: String,
    pub start_epoch: i64,
    pub end_epoch: i64,
    pub scanned: usize,
    pub observed_distinct: usize,
    pub observed_distinct_exact: bool,
    pub versions: Vec<PublicPullVersion>,
    pub omitted: Vec<PublicPullOmission>,
    pub unlisted_omissions: usize,
    pub conflicts: Vec<u64>,
    pub cursor: Option<String>,
    pub can_continue: bool,
    pub retry_smaller: bool,
    pub page_size: usize,
    pub moving_list_uncertain: bool,
    pub ordering_uncertain: bool,
    pub retry_at: Option<String>,
    pub restarted: bool,
    pub attempted_requests: usize,
    pub parsed_json_body_bytes: usize,
}

#[derive(Clone)]
struct Scan {
    owner: String,
    identity: Identity,
    snapshot: String,
    repository: String,
    start: i64,
    end: i64,
    page: usize,
    size_index: usize,
    scanned: usize,
    versions: BTreeMap<u64, BTreeSet<String>>,
    omitted: BTreeMap<(u64, String), PublicPullOmission>,
    unlisted_omissions: usize,
    retained_records: usize,
    retained_bytes: usize,
    previous_timestamp: Option<i64>,
    ordering_uncertain: bool,
    restarted: bool,
    repository_id: Option<u64>,
    retry_smaller_only: bool,
}

static SCANS: OnceLock<Mutex<BTreeMap<String, Scan>>> = OnceLock::new();
static NEXT_SCAN: AtomicU64 = AtomicU64::new(1);

fn save_scan(scan: Scan) -> Result<String, String> {
    let id = NEXT_SCAN
        .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |value| {
            value.checked_add(1)
        })
        .map_err(|_| "unavailable")?
        .to_string();
    let mut scans = SCANS
        .get_or_init(Default::default)
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    if scans.len() >= SCAN_LIMIT {
        if let Some(oldest) = scans.keys().filter_map(|key| key.parse::<u64>().ok()).min() {
            scans.remove(&oldest.to_string());
        }
    }
    scans.insert(id.clone(), scan);
    Ok(id)
}

fn take_scan(
    id: &str,
    owner: &str,
    identity: &Identity,
    snapshot: &str,
    repository: &str,
    start: i64,
    end: i64,
    smaller: bool,
) -> Result<Scan, String> {
    let mut scans = SCANS
        .get_or_init(Default::default)
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    let scan = scans
        .get(id)
        .filter(|scan| {
            scan.owner == owner
                && scan.identity == *identity
                && scan.snapshot == snapshot
                && scan.repository == repository
                && scan.start == start
                && scan.end == end
                && scan.retry_smaller_only == smaller
        })
        .ok_or("stale")?;
    let result = scan.clone();
    scans.remove(id);
    Ok(result)
}

fn conflicts(scan: &Scan) -> Vec<u64> {
    let mut versions = scan.versions.clone();
    for omission in scan.omitted.values() {
        versions
            .entry(omission.number)
            .or_default()
            .insert(omission.digest.clone());
    }
    versions
        .into_iter()
        .filter_map(|(number, versions)| (versions.len() > 1).then_some(number))
        .collect()
}

fn result(scan: &Scan) -> PublicPullInventory {
    PublicPullInventory {
        status: "partial",
        reason: None,
        repository: scan.repository.clone(),
        start_epoch: scan.start,
        end_epoch: scan.end,
        scanned: scan.scanned,
        observed_distinct: scan
            .versions
            .keys()
            .copied()
            .chain(scan.omitted.values().map(|omission| omission.number))
            .collect::<BTreeSet<_>>()
            .len(),
        observed_distinct_exact: scan.unlisted_omissions == 0,
        versions: vec![],
        omitted: scan.omitted.values().cloned().collect(),
        unlisted_omissions: scan.unlisted_omissions,
        conflicts: conflicts(scan),
        cursor: None,
        can_continue: false,
        retry_smaller: false,
        page_size: PAGE_SIZES[scan.size_index],
        moving_list_uncertain: true,
        ordering_uncertain: scan.ordering_uncertain,
        retry_at: None,
        restarted: scan.restarted,
        attempted_requests: 0,
        parsed_json_body_bytes: 0,
    }
}

fn pull(
    record: &Value,
    repository: &str,
    repository_id: u64,
) -> Result<(PublicPullVersion, usize, i64), ()> {
    let object = record.as_object().ok_or(())?;
    let number = object
        .get("number")
        .and_then(Value::as_u64)
        .filter(|n| *n > 0)
        .ok_or(())?;
    if !record["base"]["repo"]["full_name"]
        .as_str()
        .is_some_and(|name| name.eq_ignore_ascii_case(repository))
        || record["base"]["repo"]["id"].as_u64() != Some(repository_id)
    {
        return Err(());
    }
    let title = object.get("title").and_then(Value::as_str).ok_or(())?;
    let (body, body_present) = match object.get("body") {
        Some(Value::String(body)) => (body.as_str(), true),
        Some(Value::Null) => ("", false),
        _ => return Err(()),
    };
    let updated = object.get("updated_at").and_then(Value::as_str).ok_or(())?;
    let epoch = chrono::DateTime::parse_from_rfc3339(updated)
        .map_err(|_| ())?
        .timestamp();
    let state = object.get("state").and_then(Value::as_str);
    let draft = object.get("draft").and_then(Value::as_bool);
    let merged = object.get("merged_at");
    let status = match (state, draft, merged) {
        (Some("open"), Some(true), Some(Value::Null)) => "draft",
        (Some("open"), Some(false), Some(Value::Null)) => "open",
        (Some("closed"), _, Some(Value::Null)) => "closed",
        (Some("closed"), _, Some(Value::String(value)))
            if chrono::DateTime::parse_from_rfc3339(value).is_ok() =>
        {
            "merged"
        }
        _ => "unknown",
    };
    let original = serde_json::to_vec(record).map_err(|_| ())?;
    let size = original.len();
    let digest = format!("{:x}", Sha256::digest(&original));
    Ok((
        PublicPullVersion {
            number,
            title: title.into(),
            body: body.into(),
            body_present,
            url: format!("https://github.com/{repository}/pull/{number}"),
            updated_at: updated.into(),
            fetched_at: chrono::Utc::now().to_rfc3339(),
            status: status.into(),
            digest,
        },
        size,
        epoch,
    ))
}

fn collect_until(
    scan: &mut Scan,
    mut get: impl FnMut(&str, usize, Instant) -> Result<Page, PageError>,
    cancelled: &AtomicBool,
    deadline: Instant,
) -> PublicPullInventory {
    let mut out = result(scan);
    let mut used = 0usize;
    let mut completed_pages = 0usize;
    if cancelled.load(Ordering::Acquire) {
        out.status = "cancelled";
        out.reason = Some("cancelled");
        out.can_continue = true;
        return out;
    }
    if Instant::now() >= deadline {
        out.reason = Some("time-limit");
        out.can_continue = true;
        return out;
    }
    out.attempted_requests += 1;
    let meta = match get(&scan.repository, ACTION_BYTES, deadline) {
        Ok(meta) if meta.bytes <= ACTION_BYTES => meta,
        Err(PageError::Cancelled) => {
            out.status = "cancelled";
            out.reason = Some("cancelled");
            out.can_continue = true;
            return out;
        }
        Err(PageError::Deadline) => {
            out.reason = Some("time-limit");
            out.can_continue = true;
            return out;
        }
        Err(PageError::RateLimited(at)) => {
            out.status = "unavailable";
            out.reason = Some("rate-limited");
            out.retry_at = at;
            out.can_continue = true;
            return out;
        }
        _ => {
            out.status = "unavailable";
            out.reason = Some("unavailable");
            out.can_continue = true;
            return out;
        }
    };
    used += meta.bytes;
    out.parsed_json_body_bytes = used;
    if meta.value["private"] != false
        || !meta.value["full_name"]
            .as_str()
            .is_some_and(|name| name.eq_ignore_ascii_case(&scan.repository))
    {
        out.status = "unavailable";
        out.reason = Some("unavailable");
        return out;
    }
    let Some(repository_id) = meta.value["id"].as_u64().filter(|id| *id > 0) else {
        out.status = "unavailable";
        out.reason = Some("repository-id-unknown");
        return out;
    };
    if scan.repository_id.is_some_and(|id| id != repository_id) {
        out.reason = Some("repository-changed");
        return out;
    }
    scan.repository_id = Some(repository_id);
    for _ in 0..PAGES_PER_ACTION {
        out.can_continue = false;
        if cancelled.load(Ordering::Acquire) {
            out.status = "cancelled";
            out.reason = Some("cancelled");
            out.can_continue = true;
            break;
        }
        if Instant::now() >= deadline {
            out.reason = Some("time-limit");
            out.can_continue = true;
            break;
        }
        if used >= ACTION_BYTES {
            out.reason = Some("byte-limit");
            out.can_continue = true;
            break;
        }
        let size = PAGE_SIZES[scan.size_index];
        let path = page_path(&scan.repository, size, scan.page);
        out.attempted_requests += 1;
        let response = match get(&path, ACTION_BYTES - used, deadline) {
            Ok(value) if value.bytes <= ACTION_BYTES - used => value,
            Ok(_) | Err(PageError::Oversized) => {
                if completed_pages > 0 {
                    out.reason = Some("byte-limit");
                    out.can_continue = true;
                } else {
                    out.reason = Some(if size == 1 {
                        "scan-cannot-continue"
                    } else {
                        "page-oversized"
                    });
                    out.retry_smaller = size > 1;
                }
                break;
            }
            Err(PageError::Cancelled) => {
                out.status = "cancelled";
                out.reason = Some("cancelled");
                out.can_continue = true;
                break;
            }
            Err(PageError::Deadline) => {
                out.reason = Some("time-limit");
                out.can_continue = true;
                break;
            }
            Err(PageError::RateLimited(at)) => {
                out.reason = Some("rate-limited");
                out.retry_at = at;
                out.can_continue = true;
                break;
            }
            Err(PageError::Unavailable) => {
                out.reason = Some("unavailable");
                out.can_continue = true;
                break;
            }
        };
        used += response.bytes;
        out.parsed_json_body_bytes = used;
        let Some(items) = response
            .value
            .as_array()
            .filter(|items| items.len() <= size)
        else {
            out.reason = Some("invalid-response");
            break;
        };
        let link = match next_page(
            &response.link,
            &scan.repository,
            repository_id,
            scan.page,
            size,
        ) {
            Ok(link) => link,
            Err(()) => {
                out.reason = Some("invalid-link");
                break;
            }
        };
        let mut next = scan.clone();
        let mut versions = Vec::new();
        let mut older = false;
        let mut malformed = false;
        for item in items {
            let (version, bytes, epoch) = match pull(item, &scan.repository, repository_id) {
                Ok(value) => value,
                Err(()) => {
                    malformed = true;
                    break;
                }
            };
            next.scanned += 1;
            if next
                .previous_timestamp
                .is_some_and(|previous| epoch > previous)
            {
                next.ordering_uncertain = true;
            }
            next.previous_timestamp = Some(epoch);
            if epoch < scan.start {
                older = true;
                continue;
            }
            if epoch >= scan.end {
                continue;
            }
            if next
                .versions
                .get(&version.number)
                .is_some_and(|known| known.contains(&version.digest))
            {
                continue;
            }
            if bytes > RECORD_BYTES
                || next.retained_records >= RECORD_LIMIT
                || next.retained_bytes.saturating_add(bytes) > SESSION_BYTES
            {
                let omission = PublicPullOmission {
                    number: version.number,
                    updated_at: version.updated_at,
                    digest: version.digest.clone(),
                    reason: if bytes > RECORD_BYTES {
                        "record-oversized"
                    } else {
                        "session-limit"
                    },
                };
                let key = (version.number, version.digest);
                if next.omitted.len() < OMISSION_LIMIT || next.omitted.contains_key(&key) {
                    next.omitted.insert(key, omission);
                } else {
                    next.unlisted_omissions = next.unlisted_omissions.saturating_add(1);
                }
                continue;
            }
            let known = next.versions.entry(version.number).or_default();
            if known.insert(version.digest.clone()) {
                next.retained_records += 1;
                next.retained_bytes += bytes;
                versions.push(version);
            }
        }
        if malformed {
            out.reason = Some("invalid-response");
            break;
        }
        *scan = next;
        completed_pages += 1;
        out.versions.extend(versions);
        if older && !scan.ordering_uncertain {
            out.status = "observed";
            out.reason = Some("older-than-period");
            break;
        }
        if !link {
            out.status = "observed";
            out.reason = Some("end-of-list");
            break;
        }
        let Some(next_page) = scan.page.checked_add(1) else {
            out.reason = Some("page-overflow");
            break;
        };
        scan.page = next_page;
        out.reason = Some("page-limit");
        out.can_continue = true;
    }
    out.scanned = scan.scanned;
    out.observed_distinct = scan
        .versions
        .keys()
        .copied()
        .chain(scan.omitted.values().map(|omission| omission.number))
        .collect::<BTreeSet<_>>()
        .len();
    out.omitted = scan.omitted.values().cloned().collect();
    out.unlisted_omissions = scan.unlisted_omissions;
    out.observed_distinct_exact = scan.unlisted_omissions == 0;
    if out.status == "observed"
        && (scan.restarted || !out.omitted.is_empty() || out.unlisted_omissions > 0)
    {
        out.status = "partial";
    }
    out.conflicts = conflicts(scan);
    out.ordering_uncertain = scan.ordering_uncertain;
    out
}

#[cfg(test)]
fn collect(
    scan: &mut Scan,
    get: impl FnMut(&str, usize, Instant) -> Result<Page, PageError>,
    cancelled: &AtomicBool,
) -> PublicPullInventory {
    collect_until(
        scan,
        get,
        cancelled,
        Instant::now() + Duration::from_secs(ACTION_SECONDS),
    )
}

#[tauri::command(async)]
pub fn git_briefing_public_repositories(
    source_path: String,
    head: String,
    snapshot: String,
) -> Result<Vec<String>, String> {
    let deadline = Instant::now() + Duration::from_secs(ACTION_SECONDS);
    let active = AtomicBool::new(false);
    let before = identity_until(&source_path, deadline, &active)?;
    snapshot_for_identity(&before, &head, &snapshot)?;
    let remotes = repositories_until(&before.root, deadline, &active)?;
    if identity_until(&source_path, deadline, &active)
        .ok()
        .as_ref()
        != Some(&before)
    {
        return Err("stale".into());
    }
    Ok(remotes)
}

#[tauri::command]
pub async fn git_briefing_public_inventory(
    window: tauri::WebviewWindow,
    request_id: String,
    source_path: String,
    head: String,
    snapshot: String,
    repository: String,
    action: String,
    cursor: Option<String>,
) -> Result<PublicPullInventory, String> {
    let deadline = Instant::now() + Duration::from_secs(ACTION_SECONDS);
    let transfer_deadline = deadline - Duration::from_secs(5);
    let mut owned = crate::llm::requests::registry().claim(window.label(), &request_id)?;
    let owner = window.label().to_string();
    let cancelled = Arc::new(AtomicBool::new(false));
    let worker_cancelled = cancelled.clone();
    let worker = tauri::async_runtime::spawn_blocking(move || {
        let before = identity_until(&source_path, deadline, &worker_cancelled)?;
        let receipt = snapshot_for_identity(&before, &head, &snapshot)?;
        if !repositories_until(&before.root, deadline, &worker_cancelled)?.contains(&repository) {
            return Err("unavailable".into());
        }
        let mut scan = match (action.as_str(), cursor) {
            ("start", None) => Scan {
                owner,
                identity: before.clone(),
                snapshot: snapshot.clone(),
                repository: repository.clone(),
                start: receipt.start,
                end: receipt.end,
                page: 1,
                size_index: 0,
                scanned: 0,
                versions: BTreeMap::new(),
                omitted: BTreeMap::new(),
                unlisted_omissions: 0,
                retained_records: 0,
                retained_bytes: 0,
                previous_timestamp: None,
                ordering_uncertain: false,
                restarted: false,
                repository_id: None,
                retry_smaller_only: false,
            },
            ("more" | "smaller", Some(id)) => {
                let mut scan = take_scan(
                    &id,
                    &owner,
                    &before,
                    &snapshot,
                    &repository,
                    receipt.start,
                    receipt.end,
                    action == "smaller",
                )?;
                if action == "smaller" {
                    if scan.size_index + 1 >= PAGE_SIZES.len() {
                        return Err("unavailable".into());
                    }
                    scan.size_index += 1;
                    scan.page = 1;
                    scan.previous_timestamp = None;
                    scan.restarted = true;
                    scan.retry_smaller_only = false;
                }
                scan
            }
            _ => return Err("unavailable".into()),
        };
        let mut out = collect_until(
            &mut scan,
            |path, limit, deadline| fetch(path, limit, deadline, &worker_cancelled),
            &worker_cancelled,
            transfer_deadline,
        );
        let recheck = AtomicBool::new(false);
        if identity_until(&source_path, deadline, &recheck)
            .ok()
            .as_ref()
            != Some(&before)
            || snapshot_for_identity(&before, &head, &snapshot).is_err()
            || !repositories_until(&before.root, deadline, &recheck)?.contains(&repository)
        {
            return Err("stale".into());
        }
        if out.can_continue || out.retry_smaller {
            scan.retry_smaller_only = out.retry_smaller;
            out.cursor = Some(save_scan(scan)?);
        }
        Ok(out)
    });
    match futures_util::future::select(Box::pin(worker), Box::pin(&mut owned.receiver)).await {
        futures_util::future::Either::Left((result, _)) => {
            result.map_err(|_| "unavailable".to_string())?
        }
        futures_util::future::Either::Right((_, worker)) => {
            cancelled.store(true, Ordering::Release);
            worker.await.map_err(|_| "unavailable".to_string())?
        }
    }
}

#[cfg(test)]
mod tests;
