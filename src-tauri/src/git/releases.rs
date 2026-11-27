//! Releases of the repository Changes reads: its tags, and the read branch walked newest first
//! so the page can count what each release holds. A tag name is display text only; every read
//! after the list takes commit hashes the list issued, never a name.

use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, OnceLock};

use serde::Serialize;
use sha2::{Digest, Sha256};

use super::briefing::{
    identity, picked_identity, read_bounded_git, text_git, valid_hash, Identity,
};
use crate::lower_hex::lower_hex;

#[cfg(test)]
mod tests;

const TAG_LIMIT: usize = 10_000;
/// 10,000 refs of 256-character names with their hashes and dates stay under 4 MiB.
const TAG_BYTES: usize = 8 * 1024 * 1024;
const NAME_CHARS: usize = 256;
pub(super) const WALK_STEP: usize = 20_000;
pub(super) const WALK_LIMIT: usize = 100_000;
const WALK_BYTES: usize = 8 * 1024 * 1024;
const RECEIPT_LIMIT: usize = 8;
const TAG_FORMAT: &str = "--format=%(objectname)%00%(objecttype)%00%(*objectname)%00%(*objecttype)%00%(committerdate:raw)%00%(*committerdate:raw)%00%(refname)%00";
const TAG_FIELDS: usize = 7;

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TaggedCommit {
    commit: String,
    committed_at: i64,
    names: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseList {
    status: String,
    source_root: String,
    snapshot: String,
    head: String,
    line: Option<String>,
    tags: Vec<TaggedCommit>,
    unreadable_names: usize,
    partial_reasons: Vec<String>,
    walk_step: usize,
    walk_limit: usize,
}
impl ReleaseList {
    fn unavailable(status: &str) -> Self {
        Self {
            status: status.into(),
            source_root: String::new(),
            snapshot: String::new(),
            head: String::new(),
            line: None,
            tags: vec![],
            unreadable_names: 0,
            partial_reasons: vec![],
            walk_step: WALK_STEP,
            walk_limit: WALK_LIMIT,
        }
    }
}

/// A tagged commit met on the walk, at its distance from the walk's tip (0 is the tip).
#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WalkMark {
    position: usize,
    commit: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseWalk {
    status: String,
    skip: usize,
    /// Each walked commit's type as an index into `types`, -1 for a title without one.
    kinds: Vec<i32>,
    types: Vec<String>,
    marks: Vec<WalkMark>,
    /// The walk reached the first commit.
    ended: bool,
}
impl ReleaseWalk {
    fn unavailable(status: &str, skip: usize) -> Self {
        Self {
            status: status.into(),
            skip,
            kinds: vec![],
            types: vec![],
            marks: vec![],
            ended: false,
        }
    }
}

#[derive(Clone)]
struct ReleaseReceipt {
    identity: Identity,
    snapshot: String,
    listing: [u8; 32],
    commits: HashSet<String>,
}
static RECEIPTS: OnceLock<Mutex<Vec<ReleaseReceipt>>> = OnceLock::new();

fn receipts() -> std::sync::MutexGuard<'static, Vec<ReleaseReceipt>> {
    RECEIPTS
        .get_or_init(Default::default)
        .lock()
        .unwrap_or_else(|e| e.into_inner())
}

struct Listing {
    tags: Vec<TaggedCommit>,
    unreadable_names: usize,
    over_limit: bool,
    digest: [u8; 32],
}

fn display_name(raw: &[u8]) -> Option<String> {
    let text = std::str::from_utf8(raw).ok()?;
    let name = text.strip_prefix("refs/tags/").unwrap_or(text);
    let clean: String = name
        .chars()
        .filter(|c| !c.is_control())
        .take(NAME_CHARS)
        .collect();
    (!clean.is_empty()).then_some(clean)
}

fn date_of(raw: &[u8]) -> Option<i64> {
    std::str::from_utf8(raw)
        .ok()?
        .split_whitespace()
        .next()?
        .parse()
        .ok()
}

/// One release per tagged commit: annotated tags are peeled once, tags on anything but a commit
/// are not releases. O(tags).
fn parse_tags(bytes: &[u8]) -> Result<(Vec<TaggedCommit>, usize, usize), String> {
    let tokens: Vec<&[u8]> = bytes.split(|b| *b == 0).collect();
    let mut by_commit: HashMap<String, TaggedCommit> = HashMap::new();
    let mut unreadable = 0;
    let mut refs = 0;
    let mut index = 0;
    while index + TAG_FIELDS <= tokens.len() {
        let record = index;
        let field = |at: usize| tokens.get(record + at).copied().unwrap_or_default();
        let object = std::str::from_utf8(field(0))
            .map_err(|_| "unreadable")?
            .trim_start_matches('\n');
        if object.is_empty() {
            index += 1;
            continue;
        }
        if !valid_hash(object) {
            return Err("unreadable".into());
        }
        refs += 1;
        let (commit, date) = match (field(1), field(3)) {
            (b"commit", _) => (object.to_string(), date_of(field(4))),
            (b"tag", b"commit") => (
                std::str::from_utf8(field(2))
                    .map_err(|_| "unreadable")?
                    .to_string(),
                date_of(field(5)),
            ),
            _ => {
                index += TAG_FIELDS;
                continue;
            }
        };
        index += TAG_FIELDS;
        let (Some(date), true) = (date, valid_hash(&commit)) else {
            continue;
        };
        let Some(name) = display_name(field(6)) else {
            unreadable += 1;
            continue;
        };
        let entry = by_commit.entry(commit.clone()).or_insert(TaggedCommit {
            commit,
            committed_at: date,
            names: vec![],
        });
        if !entry.names.contains(&name) {
            entry.names.push(name);
        }
    }
    let mut tags: Vec<TaggedCommit> = by_commit.into_values().collect();
    for tag in &mut tags {
        tag.names.sort();
    }
    tags.sort_by(|a, b| a.commit.cmp(&b.commit));
    Ok((tags, unreadable, refs))
}

fn read_listing(identity: &Identity) -> Result<Listing, String> {
    let count = format!("--count={}", TAG_LIMIT + 1);
    let out = read_bounded_git(
        &identity.root,
        &["for-each-ref", TAG_FORMAT, &count, "refs/tags/"],
        TAG_BYTES,
    )?;
    if out.truncated {
        return Err("unreadable".into());
    }
    let digest = Sha256::digest(&out.bytes).into();
    let (mut tags, unreadable_names, refs) = parse_tags(&out.bytes)?;
    let over_limit = refs > TAG_LIMIT;
    if over_limit {
        tags.truncate(TAG_LIMIT);
    }
    Ok(Listing {
        tags,
        unreadable_names,
        over_limit,
        digest,
    })
}

fn is_shallow(identity: &Identity) -> bool {
    text_git(&identity.root, &["rev-parse", "--is-shallow-repository"]).as_deref() == Ok("true")
}

#[tauri::command(async)]
pub fn git_change_releases(
    vault_path: String,
    project_slug: String,
) -> Result<ReleaseList, String> {
    Ok(list_releases(|| identity(&vault_path, &project_slug)))
}

#[tauri::command(async)]
pub fn git_source_releases(source_path: String) -> Result<ReleaseList, String> {
    Ok(list_releases(|| picked_identity(&source_path)))
}

pub(super) fn list_releases(resolve: impl Fn() -> Result<Identity, String>) -> ReleaseList {
    let before = match resolve() {
        Ok(value) => value,
        Err(status) => return ReleaseList::unavailable(&status),
    };
    let listing = match read_listing(&before) {
        Ok(value) => value,
        Err(_) => return ReleaseList::unavailable("unreadable"),
    };
    let shallow = is_shallow(&before);
    if resolve().ok().as_ref() != Some(&before) {
        return ReleaseList::unavailable("stale");
    }
    let mut reasons = Vec::new();
    if shallow {
        reasons.push("shallow".to_string());
    }
    if listing.unreadable_names > 0 {
        reasons.push("names".into());
    }
    if listing.over_limit {
        reasons.push("tag-limit".into());
    }
    let snapshot = lower_hex(&Sha256::digest(format!(
        "{}\0{}\0{:?}\0{}",
        before.root.to_string_lossy(),
        before.head,
        before.object,
        lower_hex(&listing.digest)
    )));
    let receipt = ReleaseReceipt {
        identity: before.clone(),
        snapshot: snapshot.clone(),
        listing: listing.digest,
        commits: listing.tags.iter().map(|t| t.commit.clone()).collect(),
    };
    {
        let mut stored = receipts();
        stored.retain(|r| r.snapshot != snapshot);
        while stored.len() >= RECEIPT_LIMIT {
            stored.remove(0);
        }
        stored.push(receipt);
    }
    ReleaseList {
        status: if reasons.is_empty() {
            "measured"
        } else {
            "partial"
        }
        .into(),
        source_root: before.root.to_string_lossy().into_owned(),
        snapshot,
        head: before.head.clone(),
        line: before.line.clone(),
        tags: listing.tags,
        unreadable_names: listing.unreadable_names,
        partial_reasons: reasons,
        walk_step: WALK_STEP,
        walk_limit: WALK_LIMIT,
    }
}

fn receipt_for(current: &Identity, snapshot: &str) -> Result<ReleaseReceipt, &'static str> {
    receipts()
        .iter()
        .rev()
        .find(|r| r.snapshot == snapshot && r.identity == *current)
        .cloned()
        .ok_or("stale")
}

/// The list that issued `snapshot` still describes the repository, and named both ends of a span:
/// `tip` a tagged commit or the read branch's tip, `base` a tagged commit or the first commit.
pub(super) fn span_issued(
    current: &Identity,
    snapshot: &str,
    base: Option<&str>,
    tip: &str,
) -> Result<(), &'static str> {
    let receipt = receipt_for(current, snapshot)?;
    let issued = |hash: &str| receipt.commits.contains(hash);
    if !(issued(tip) || tip == current.head) || base.is_some_and(|b| !issued(b)) {
        return Err("unreadable");
    }
    let listing = read_listing(current).map_err(|_| "unreadable")?;
    if listing.digest != receipt.listing {
        return Err("stale");
    }
    Ok(())
}

const MERGE_HOSTED: &str = "merge pull request #";

/// The commit type as its author typed it, read as the digest reads it: after a `Merge #N:`
/// wrapper, or from a hosted merge's first body line. O(message).
pub(super) fn commit_type(message: &str) -> Option<&str> {
    let mut lines = message.lines();
    let subject = lines.next().unwrap_or("");
    let own = if subject.len() >= MERGE_HOSTED.len()
        && subject.is_char_boundary(MERGE_HOSTED.len())
        && subject[..MERGE_HOSTED.len()].eq_ignore_ascii_case(MERGE_HOSTED)
        && subject[MERGE_HOSTED.len()..]
            .split_once(' ')
            .is_some_and(|(number, rest)| {
                !number.is_empty()
                    && number.bytes().all(|b| b.is_ascii_digit())
                    && rest
                        .strip_prefix("from ")
                        .is_some_and(|branch| branch.starts_with(|c: char| !c.is_whitespace()))
            }) {
        lines
            .map(str::trim)
            .find(|line| !line.is_empty() && *line != subject)
            .unwrap_or(subject)
    } else {
        strip_merge_number(subject)
    };
    let head_end = own
        .find(|c: char| !(c.is_alphanumeric() || c == '_' || c == '-'))
        .unwrap_or(own.len());
    if head_end == 0 {
        return None;
    }
    let mut rest = &own[head_end..];
    if let Some(scope) = rest.strip_prefix('(') {
        let close = scope.find(')')?;
        if scope[..close].contains('(') {
            return None;
        }
        rest = &scope[close + 1..];
    }
    rest = rest.strip_prefix('!').unwrap_or(rest);
    rest.starts_with(':').then(|| &own[..head_end])
}

fn strip_merge_number(subject: &str) -> &str {
    let Some(prefix) = subject.get(..7) else {
        return subject;
    };
    if !prefix.eq_ignore_ascii_case("merge #") {
        return subject;
    }
    let mut rest = &subject[7..];
    loop {
        let digits = rest.bytes().take_while(u8::is_ascii_digit).count();
        if digits == 0 {
            return subject;
        }
        rest = &rest[digits..];
        if let Some(next) = rest.strip_prefix(" #") {
            rest = next;
            continue;
        }
        return match rest.strip_prefix(':') {
            Some(body) => body.trim_start(),
            None => subject,
        };
    }
}

#[tauri::command(async)]
pub fn git_change_release_walk(
    vault_path: String,
    project_slug: String,
    snapshot: String,
    tip: String,
    skip: usize,
) -> Result<ReleaseWalk, String> {
    Ok(walk(
        || identity(&vault_path, &project_slug),
        &snapshot,
        &tip,
        skip,
    ))
}

#[tauri::command(async)]
pub fn git_source_release_walk(
    source_path: String,
    snapshot: String,
    tip: String,
    skip: usize,
) -> Result<ReleaseWalk, String> {
    Ok(walk(
        || picked_identity(&source_path),
        &snapshot,
        &tip,
        skip,
    ))
}

/// One step of the first-parent walk from `tip`: up to `WALK_STEP` commits after the first
/// `skip`, or fewer when their messages pass `WALK_BYTES`. O(step output).
pub(super) fn walk(
    resolve: impl Fn() -> Result<Identity, String>,
    snapshot: &str,
    tip: &str,
    skip: usize,
) -> ReleaseWalk {
    if !valid_hash(tip) || skip >= WALK_LIMIT {
        return ReleaseWalk::unavailable("unreadable", skip);
    }
    let before = match resolve() {
        Ok(value) => value,
        Err(status) => return ReleaseWalk::unavailable(&status, skip),
    };
    let receipt = match receipt_for(&before, snapshot) {
        Ok(value) => value,
        Err(status) => return ReleaseWalk::unavailable(status, skip),
    };
    if !(receipt.commits.contains(tip) || tip == before.head) {
        return ReleaseWalk::unavailable("unreadable", skip);
    }
    let step = WALK_STEP.min(WALK_LIMIT - skip);
    let skip_arg = format!("--skip={skip}");
    let max = format!("--max-count={step}");
    let out = match read_bounded_git(
        &before.root,
        &[
            "log",
            "--first-parent",
            "--no-show-signature",
            "-z",
            "--format=%H%x00%B",
            &skip_arg,
            &max,
            tip,
            "--",
        ],
        WALK_BYTES,
    ) {
        Ok(value) => value,
        Err(_) => return ReleaseWalk::unavailable("unreadable", skip),
    };
    let tokens: Vec<&[u8]> = out.bytes.split(|b| *b == 0).collect();
    let mut pairs = Vec::new();
    let mut index = 0;
    while index + 1 < tokens.len() {
        let hash = String::from_utf8_lossy(tokens.get(index).copied().unwrap_or_default());
        let hash = hash.trim_start_matches('\n');
        if hash.is_empty() {
            index += 1;
            continue;
        }
        if !valid_hash(hash) {
            return ReleaseWalk::unavailable("unreadable", skip);
        }
        let message = String::from_utf8_lossy(tokens.get(index + 1).copied().unwrap_or_default());
        pairs.push((hash.to_string(), message.into_owned()));
        index += 2;
    }
    if out.truncated {
        pairs.pop();
    }
    let ended = !out.truncated && pairs.len() < step;
    let mut types: Vec<String> = Vec::new();
    let mut kinds = Vec::with_capacity(pairs.len());
    let mut marks = Vec::new();
    for (offset, (hash, message)) in pairs.iter().enumerate() {
        kinds.push(match commit_type(message) {
            Some(kind) => match types.iter().position(|known| known == kind) {
                Some(at) => at as i32,
                None => {
                    types.push(kind.to_string());
                    (types.len() - 1) as i32
                }
            },
            None => -1,
        });
        if receipt.commits.contains(hash) {
            marks.push(WalkMark {
                position: skip + offset,
                commit: hash.clone(),
            });
        }
    }
    if resolve().ok().as_ref() != Some(&before) {
        return ReleaseWalk::unavailable("stale", skip);
    }
    ReleaseWalk {
        status: "measured".into(),
        skip,
        kinds,
        types,
        marks,
        ended,
    }
}
