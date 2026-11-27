//! What the pulse keeps per worktree: counted changes per 10 s step for an hour, the time of the
//! last one, and Git's verdicts by a one-way hash of each path. A path waits for its verdict in
//! memory; nothing here opens or stats a file, and no path leaves this module.

use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::{Component, Path, PathBuf};
use std::time::{Duration, Instant};

use serde::Serialize;
use sha2::{Digest, Sha256};

/// One step of the last-hour line.
pub(crate) const STEP_MS: i64 = 10_000;
/// Sixty minutes of steps.
const STEPS_KEPT: i64 = 360;
/// A step counts at most this many changes.
pub(crate) const STEP_COUNT_CAP: u8 = 99;
/// Steps older than this many have no verdict left to wait for, so their paths are forgotten.
const STEPS_DEDUPLICATED: i64 = 6;
/// Git's verdicts kept per worktree; past this they are forgotten and asked again.
pub(crate) const JUDGED_CAP: usize = 4_096;
/// Paths waiting for a verdict per worktree; a path past this is not counted.
const PENDING_CAP: usize = 4_096;
/// Notice times kept for one waiting path.
const PENDING_TIMES_CAP: usize = 8;
/// One Git call per worktree in this long at most.
pub(crate) const GIT_CALL_GAP: Duration = Duration::from_secs(10);

/// Dependency and build folders: a change under one is never counted and costs no Git call.
pub(crate) const SKIPPED_FOLDERS: [&str; 13] = [
    ".git",
    "node_modules",
    "target",
    ".next",
    "out",
    "dist",
    "build",
    ".gradle",
    "DerivedData",
    "Pods",
    ".venv",
    "__pycache__",
    "coverage",
];

/// A path's verdict key: what is kept after Git has judged it, never the path.
type PathHash = u64;

fn path_hash(relative: &str) -> PathHash {
    let digest = Sha256::digest(relative.as_bytes());
    let mut bytes = [0u8; 8];
    for (to, from) in bytes.iter_mut().zip(digest.iter()) {
        *to = *from;
    }
    u64::from_le_bytes(bytes)
}

/// A rescan notice stands for one unnamed change in its step.
const RESCAN_HASH: PathHash = 0;

/// `relative` under a skipped folder or `.git`, from its components alone. O(components).
pub(crate) fn is_skipped(relative: &Path) -> bool {
    relative.components().any(|component| match component {
        Component::Normal(part) => part
            .to_str()
            .is_some_and(|part| SKIPPED_FOLDERS.contains(&part)),
        _ => false,
    })
}

#[derive(Default)]
struct Step {
    count: u8,
    /// Paths counted in this step, so one file saved twice in a step is one change.
    counted: HashSet<PathHash>,
}

/// One drawn worktree. Holds paths only while they wait for Git, so it has no `Debug` form.
pub(crate) struct Room {
    id: String,
    folder: PathBuf,
    watched: bool,
    steps: BTreeMap<i64, Step>,
    last_change_ms: Option<i64>,
    /// Whether Git ignores the path, by hash.
    judged: HashMap<PathHash, bool>,
    pending: HashMap<String, Vec<i64>>,
}

impl Room {
    fn new(id: String, folder: PathBuf) -> Self {
        Self {
            id,
            folder,
            watched: false,
            steps: BTreeMap::new(),
            last_change_ms: None,
            judged: HashMap::new(),
            pending: HashMap::new(),
        }
    }

    fn judge(&mut self, hash: PathHash, is_ignored: bool) {
        if self.judged.len() >= JUDGED_CAP {
            self.judged.clear();
        }
        self.judged.insert(hash, is_ignored);
    }

    fn count(&mut self, hash: PathHash, at_ms: i64, now_ms: i64) {
        let step = at_ms.div_euclid(STEP_MS);
        if step <= now_ms.div_euclid(STEP_MS) - STEPS_KEPT {
            return;
        }
        self.last_change_ms = Some(self.last_change_ms.map_or(at_ms, |last| last.max(at_ms)));
        let entry = self.steps.entry(step).or_default();
        if entry.count < STEP_COUNT_CAP && entry.counted.insert(hash) {
            entry.count += 1;
        }
    }

    fn wait_for_verdict(&mut self, relative: String, at_ms: i64) {
        if self.pending.len() >= PENDING_CAP && !self.pending.contains_key(&relative) {
            return;
        }
        let times = self.pending.entry(relative).or_default();
        let step = at_ms.div_euclid(STEP_MS);
        if times.len() < PENDING_TIMES_CAP
            && times
                .last()
                .is_none_or(|last| last.div_euclid(STEP_MS) != step)
        {
            times.push(at_ms);
        }
    }

    fn forget_old(&mut self, now_ms: i64) {
        let now_step = now_ms.div_euclid(STEP_MS);
        self.steps.retain(|step, _| *step > now_step - STEPS_KEPT);
        for (step, entry) in self.steps.iter_mut() {
            if *step < now_step - STEPS_DEDUPLICATED {
                entry.counted = HashSet::new();
            }
        }
    }
}

/// Paths of one worktree that wait for Git's verdict, taken out so the call runs unlocked.
pub(crate) struct VerdictBatch {
    pub(crate) worktree_id: String,
    pub(crate) folder: PathBuf,
    paths: Vec<(String, Vec<i64>)>,
}

impl VerdictBatch {
    /// In the order Git is asked about them.
    pub(crate) fn relative_paths(&self) -> impl Iterator<Item = &str> {
        self.paths.iter().map(|(path, _)| path.as_str())
    }
}

/// Git's answer for a batch, in the order it was asked.
#[derive(Debug, Default, PartialEq, Eq)]
pub(crate) struct Verdict {
    /// The paths Git ignores among those it judged.
    pub(crate) ignored: HashSet<String>,
    /// The path Git refused to judge (inside a submodule, beyond a link): it stopped there, so
    /// the paths after it wait for the next call.
    pub(crate) refused: Option<String>,
}

/// What reaches the page for one worktree.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorktreePulse {
    /// macOS accepted the folder; otherwise the room keeps the Git read's times.
    pub(crate) watched: bool,
    /// Milliseconds since the epoch.
    pub(crate) last_change_at_ms: Option<i64>,
    /// Steps of the last hour that had a change, oldest first.
    pub(crate) steps: Vec<PulseStep>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PulseStep {
    /// When the 10 s step began, in milliseconds since the epoch.
    pub(crate) at_ms: i64,
    pub(crate) count: u8,
}

/// Every worktree Git lists, for placing a path, and the drawn ones, which alone count.
#[derive(Default)]
pub(crate) struct Pulse {
    /// Deepest first, so a nested worktree claims its own paths.
    listed: Vec<(PathBuf, String)>,
    rooms: HashMap<String, Room>,
    /// The last Git call per worktree id, kept apart from the rooms so a room that leaves and
    /// returns, or a switch turned off and on, cannot start a second call within the gap.
    git_calls: HashMap<String, Instant>,
}

impl Pulse {
    /// Off: every room and count goes; only the Git pace stays.
    pub(crate) fn forget_counts(&mut self) {
        self.listed.clear();
        self.rooms.clear();
    }

    /// Hidden: paths waiting for Git are dropped, so no path is held while nothing is watched.
    pub(crate) fn forget_waiting(&mut self) {
        for room in self.rooms.values_mut() {
            room.pending.clear();
        }
    }

    /// The worktrees Git lists and the ids the page draws; a room no longer drawn, moved or listed
    /// is dropped with its counts.
    pub(crate) fn set_rooms(&mut self, mut listed: Vec<(PathBuf, String)>, drawn: &[String]) {
        listed.sort_by_key(|(folder, _)| std::cmp::Reverse(folder.components().count()));
        self.rooms.retain(|id, room| {
            drawn.contains(id)
                && listed
                    .iter()
                    .any(|(folder, listed_id)| listed_id == id && *folder == room.folder)
        });
        for (folder, id) in &listed {
            if drawn.contains(id) && !self.rooms.contains_key(id) {
                self.rooms
                    .insert(id.clone(), Room::new(id.clone(), folder.clone()));
            }
        }
        self.listed = listed;
    }

    /// The drawn folders, sorted.
    pub(crate) fn folders(&self) -> Vec<PathBuf> {
        let mut folders: Vec<PathBuf> = self
            .rooms
            .values()
            .map(|room| room.folder.clone())
            .collect();
        folders.sort();
        folders
    }

    pub(crate) fn mark_watched(&mut self, watched: impl Fn(&Path) -> bool) {
        for room in self.rooms.values_mut() {
            room.watched = watched(&room.folder);
        }
    }

    fn room_for(&mut self, path: &Path) -> Option<(&mut Room, PathBuf)> {
        let (folder, id) = self
            .listed
            .iter()
            .find(|(folder, _)| path.starts_with(folder))?;
        let relative = path.strip_prefix(folder).ok()?.to_path_buf();
        let room = self.rooms.get_mut(id)?;
        Some((room, relative))
    }

    /// One OS notice that a path changed. O(listed worktrees + path length).
    pub(crate) fn notice(&mut self, path: &Path, at_ms: i64) {
        let Some((room, relative)) = self.room_for(path) else {
            return;
        };
        if relative.as_os_str().is_empty() || is_skipped(&relative) {
            return;
        }
        let Some(relative) = relative.to_str().map(str::to_string) else {
            return;
        };
        if relative == ".gitignore" || relative.ends_with("/.gitignore") {
            room.judged.clear();
        }
        let hash = path_hash(&relative);
        match room.judged.get(&hash) {
            Some(true) => {}
            Some(false) => room.count(hash, at_ms, at_ms),
            None => room.wait_for_verdict(relative, at_ms),
        }
    }

    /// macOS dropped notices under `path`, or everywhere when it names none: each room that may
    /// hold them counts one change in that step, and nothing is rescanned. Those are the room
    /// holding `path` and every room inside it, since macOS names a folder above the watched ones
    /// (often `/`) for a drop and a parent folder for a coalesced change. A folder under `.git` or
    /// a build folder of the room holding it counts none there. O(listed worktrees + rooms).
    pub(crate) fn dropped_notices(&mut self, path: Option<&Path>, at_ms: i64) {
        let holder = path.and_then(|path| {
            let (room, relative) = self.room_for(path)?;
            (!is_skipped(&relative)).then(|| room.id.clone())
        });
        for room in self.rooms.values_mut() {
            let may_hold = path.is_none_or(|path| room.folder.starts_with(path))
                || holder.as_ref() == Some(&room.id);
            if may_hold {
                room.count(RESCAN_HASH, at_ms, at_ms);
            }
        }
    }

    /// The waiting paths of each worktree whose last Git call is `GIT_CALL_GAP` behind, taken out.
    pub(crate) fn take_due_batches(&mut self, now: Instant) -> Vec<VerdictBatch> {
        self.git_calls
            .retain(|_, last| now.saturating_duration_since(*last) < GIT_CALL_GAP);
        let mut batches = Vec::new();
        for room in self.rooms.values_mut() {
            if room.pending.is_empty() || self.git_calls.contains_key(&room.id) {
                continue;
            }
            self.git_calls.insert(room.id.clone(), now);
            let mut paths: Vec<(String, Vec<i64>)> = room.pending.drain().collect();
            paths.sort();
            batches.push(VerdictBatch {
                worktree_id: room.id.clone(),
                folder: room.folder.clone(),
                paths,
            });
        }
        batches.sort_by(|a, b| a.worktree_id.cmp(&b.worktree_id));
        batches
    }

    /// Git's answer for a batch, or `None` when it could not say, which counts nothing and
    /// remembers nothing. A refused path counts nothing and is not asked again until the
    /// worktree's `.gitignore` changes; the paths after it wait for the next call.
    pub(crate) fn apply_verdicts(
        &mut self,
        batch: VerdictBatch,
        verdict: Option<&Verdict>,
        now_ms: i64,
    ) {
        let (Some(verdict), Some(room)) = (verdict, self.rooms.get_mut(&batch.worktree_id)) else {
            return;
        };
        if room.folder != batch.folder {
            return;
        }
        let refused_at = verdict
            .refused
            .as_ref()
            .and_then(|refused| batch.paths.iter().position(|(path, _)| path == refused));
        for (index, (relative, times)) in batch.paths.into_iter().enumerate() {
            let hash = path_hash(&relative);
            match refused_at.map(|refused| index.cmp(&refused)) {
                Some(std::cmp::Ordering::Equal) => room.judge(hash, true),
                Some(std::cmp::Ordering::Greater) => {
                    for at_ms in times {
                        room.wait_for_verdict(relative.clone(), at_ms);
                    }
                }
                _ => {
                    let is_ignored = verdict.ignored.contains(&relative);
                    room.judge(hash, is_ignored);
                    if !is_ignored {
                        for at_ms in times {
                            room.count(hash, at_ms, now_ms);
                        }
                    }
                }
            }
        }
    }

    /// Each drawn worktree's counts for the last hour, by id.
    pub(crate) fn read(&mut self, now_ms: i64) -> BTreeMap<String, WorktreePulse> {
        self.rooms
            .values_mut()
            .map(|room| {
                room.forget_old(now_ms);
                let pulse = WorktreePulse {
                    watched: room.watched,
                    last_change_at_ms: room.last_change_ms,
                    steps: room
                        .steps
                        .iter()
                        .filter(|(_, step)| step.count > 0)
                        .map(|(step, entry)| PulseStep {
                            at_ms: step * STEP_MS,
                            count: entry.count,
                        })
                        .collect(),
                };
                (room.id.clone(), pulse)
            })
            .collect()
    }

    #[cfg(test)]
    pub(crate) fn waiting_paths(&self) -> usize {
        self.rooms.values().map(|room| room.pending.len()).sum()
    }
}
