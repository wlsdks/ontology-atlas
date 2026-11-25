//! Load: how much memory and CPU each agent's command tree uses, summed per worktree and named by
//! tool, and how busy this Mac's memory, CPU and GPU are. One sample is one process listing, one
//! usage read per process under an agent (and per `java` outside every tree), and three reads for
//! the Mac. Only the previous sample is kept, in memory; arguments, environment and open files are
//! never read, and no pid or path reaches the page.

// Only macOS samples, so the sampler's half is unused elsewhere.
#![cfg_attr(not(target_os = "macos"), allow(dead_code))]

mod attribute;
#[cfg(target_os = "macos")]
mod gpu;
mod source;
#[cfg(test)]
mod tests;

use std::collections::{BTreeMap, HashMap};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;

use attribute::{attribute, LoadGroup, Measured, WorktreeLoad};
use source::{CpuTicks, LoadSource, Pressure};

use super::agent_processes::under_agents;

/// The page asks every 5 s; an ask sooner than this answers from the last sample.
const SAMPLE_GAP: Duration = Duration::from_secs(4);
/// A previous sample older than this (Work status was hidden) makes no CPU rate.
const RATE_LAPSE: Duration = Duration::from_secs(15);
/// A parent chain longer than this is not an agent's command tree.
const MAX_ANCESTORS: usize = 64;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum LoadStatus {
    Read,
    /// A read macOS refused: this sample has no numbers, and the last good ones are not current.
    Failed,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MacLoad {
    pub(crate) memory_used_bytes: u64,
    pub(crate) memory_total_bytes: u64,
    /// A level macOS reports outside its documented three reads as normal: no warning on doubt.
    pub(crate) pressure: Pressure,
    /// `None` on the first sample.
    pub(crate) cpu_cores: Option<f64>,
    pub(crate) core_count: u32,
    /// `None` when this Mac reports no GPU figure.
    pub(crate) gpu_percent: Option<u8>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LoadRead {
    pub(crate) status: LoadStatus,
    /// By worktree id: each worktree with a process counted in it.
    pub(crate) worktrees: BTreeMap<String, WorktreeLoad>,
    /// Load running outside every room, by group.
    pub(crate) outside: Vec<LoadGroup>,
    pub(crate) mac: Option<MacLoad>,
}

impl LoadRead {
    fn failed() -> Self {
        Self {
            status: LoadStatus::Failed,
            worktrees: BTreeMap::new(),
            outside: vec![],
            mac: None,
        }
    }
}

/// A process across samples: its pid and start, so a reused pid is another process.
type ProcessKey = (u32, Option<i64>);

/// What the next sample needs from this one: CPU totals, to make rates.
pub(crate) struct Sample {
    at: Instant,
    /// Seconds since the epoch, to tell a process that started since this sample.
    at_epoch_seconds: i64,
    cpu_ns: HashMap<ProcessKey, u64>,
    mac_cpu: CpuTicks,
}

/// Two decimals: the page shows cores to one.
fn rounded(cores: f64) -> f64 {
    (cores * 100.0).round() / 100.0
}

/// Whether one of `acp_pids` is `pid` or above it in `parents`. O(chain length).
fn under_acp_session(pid: u32, parents: &HashMap<u32, u32>, acp_pids: &[u32]) -> bool {
    let mut current = pid;
    for _ in 0..MAX_ANCESTORS {
        if acp_pids.contains(&current) {
            return true;
        }
        match parents.get(&current) {
            Some(parent) if *parent != 0 && *parent != current => current = *parent,
            _ => return false,
        }
    }
    false
}

/// One sample through `source`, against the worktrees Git lists, with rates from `previous` when
/// it is recent; `acp_pids` are Atlas's own agent sessions. `Err` when the listing or a read of
/// the Mac's memory or CPU fails; a process that ends between the listing and its read is
/// skipped. O(processes × ancestor chain).
pub(crate) fn sample(
    source: &mut impl LoadSource,
    worktrees: &[(PathBuf, String)],
    acp_pids: &[u32],
    previous: Option<&Sample>,
    now: Instant,
    now_epoch_seconds: i64,
) -> Result<(LoadRead, Sample), ()> {
    let facts = source.processes().ok_or(())?;
    let under = under_agents(&facts);
    let parents: HashMap<u32, u32> = facts.iter().map(|fact| (fact.pid, fact.parent)).collect();
    let previous =
        previous.filter(|earlier| now.saturating_duration_since(earlier.at) <= RATE_LAPSE);
    let wall_ns =
        previous.map(|earlier| now.saturating_duration_since(earlier.at).as_nanos() as f64);
    let mut cpu_ns = HashMap::new();
    let mut measured = Vec::new();
    for fact in &facts {
        let under_agent = under.contains(&fact.pid);
        if !under_agent && fact.name != "java" {
            continue;
        }
        let Some(usage) = source.usage(fact.pid) else {
            continue;
        };
        let key = (fact.pid, fact.started_at);
        cpu_ns.insert(key, usage.cpu_ns);
        let cpu_cores = previous.zip(wall_ns).map(|(earlier, wall_ns)| {
            let before = earlier.cpu_ns.get(&key).copied().or_else(|| {
                // A process that started since the last sample used all its time in between.
                fact.started_at
                    .is_some_and(|start| start >= earlier.at_epoch_seconds)
                    .then_some(0)
            });
            before.map_or(0.0, |before| {
                usage.cpu_ns.saturating_sub(before) as f64 / wall_ns.max(1.0)
            })
        });
        measured.push(Measured {
            pid: fact.pid,
            parent: fact.parent,
            tool: fact.tool,
            name: fact.name.clone(),
            folder: source.working_folder(fact.pid),
            under_agent,
            under_acp_session: under_acp_session(fact.pid, &parents, acp_pids),
            memory_bytes: usage.memory_bytes,
            cpu_cores,
        });
    }
    let memory = source.memory().ok_or(())?;
    let mac_cpu = source.cpu().ok_or(())?;
    let gpu_percent = source.gpu_percent();

    let (mut rooms, mut outside) = attribute(&measured, worktrees);
    for room in rooms.values_mut() {
        room.cpu_cores = room.cpu_cores.map(rounded);
        for group in &mut room.groups {
            group.cpu_cores = group.cpu_cores.map(rounded);
        }
    }
    for group in &mut outside {
        group.cpu_cores = group.cpu_cores.map(rounded);
    }
    let read = LoadRead {
        status: LoadStatus::Read,
        worktrees: rooms,
        outside,
        mac: Some(MacLoad {
            memory_used_bytes: memory.used_bytes,
            memory_total_bytes: memory.total_bytes,
            pressure: memory.pressure.unwrap_or(Pressure::Normal),
            cpu_cores: previous
                .and_then(|earlier| mac_cpu.cores_since(&earlier.mac_cpu))
                .map(rounded),
            core_count: mac_cpu.core_count,
            gpu_percent,
        }),
    };
    Ok((
        read,
        Sample {
            at: now,
            at_epoch_seconds: now_epoch_seconds,
            cpu_ns,
            mac_cpu,
        },
    ))
}

#[derive(Default)]
struct Sampler {
    /// The person switched load off: no ask samples, whoever sends it.
    off: bool,
    previous: Option<Sample>,
    last: Option<(Instant, LoadRead)>,
}

static SAMPLER: Mutex<Option<Sampler>> = Mutex::new(None);

/// The load of each worktree in `worktrees` and of this Mac. Samples when `SAMPLE_GAP` has passed,
/// else answers with the last sample; `None` while another sample runs or load is switched off.
#[cfg(target_os = "macos")]
pub(crate) fn load_read(worktrees: &[(PathBuf, String)], acp_pids: &[u32]) -> Option<LoadRead> {
    let mut guard = SAMPLER.try_lock().ok()?;
    let sampler = guard.get_or_insert_with(Sampler::default);
    if sampler.off {
        return None;
    }
    let now = Instant::now();
    if let Some((at, read)) = &sampler.last {
        if now.saturating_duration_since(*at) < SAMPLE_GAP {
            return Some(read.clone());
        }
    }
    let epoch_seconds = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |since| since.as_secs() as i64);
    let read = match sample(
        &mut source::MacSource,
        worktrees,
        acp_pids,
        sampler.previous.as_ref(),
        now,
        epoch_seconds,
    ) {
        Ok((read, taken)) => {
            sampler.previous = Some(taken);
            read
        }
        Err(()) => LoadRead::failed(),
    };
    sampler.last = Some((now, read.clone()));
    Some(read)
}

/// Load is read on macOS alone.
#[cfg(not(target_os = "macos"))]
pub(crate) fn load_read(_worktrees: &[(PathBuf, String)], _acp_pids: &[u32]) -> Option<LoadRead> {
    None
}

/// Whether the person leaves load on. Off waits out a sample in flight and drops every sample held.
pub(crate) fn set_reading(on: bool) {
    let Ok(mut guard) = SAMPLER.lock() else {
        return;
    };
    let sampler = guard.get_or_insert_with(Sampler::default);
    sampler.off = !on;
    sampler.previous = None;
    sampler.last = None;
}

#[cfg(test)]
pub(crate) fn holds_a_sample() -> bool {
    SAMPLER
        .lock()
        .map(|guard| {
            guard
                .as_ref()
                .is_some_and(|sampler| sampler.previous.is_some() || sampler.last.is_some())
        })
        .unwrap_or(false)
}
