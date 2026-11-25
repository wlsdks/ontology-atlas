//! Agent programs at work on this Mac: a process whose own working folder lies in a worktree is
//! credited to the nearest agent program among itself and its ancestors. That is how a tool that
//! leaves no worktree lock, such as Codex, still shows where it works, including the Codex app,
//! whose one background server runs each command in that command's folder.
//! Only the person's own processes are read, and of those only the parent, start time, kernel
//! program name, executable path and working folder; never arguments or environment.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;

/// A command runs for seconds and the agent thinks between commands; this keeps the worktree
/// credited through that pause instead of flickering away.
const RECENT_GRACE: Duration = Duration::from_secs(90);
/// A parent chain longer than this is not an agent's command tree.
const MAX_ANCESTORS: usize = 64;
/// launchd on macOS, init on Linux: what starts a background server, never a person's terminal.
const SYSTEM_LAUNCHER_PID: u32 = 1;

#[cfg_attr(not(any(target_os = "macos", target_os = "linux")), allow(dead_code))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum AgentTool {
    ClaudeCode,
    Codex,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub(crate) struct AgentProcess {
    /// The agent program's pid, not the command's.
    pub(crate) pid: u32,
    pub(crate) tool: AgentTool,
    /// Seconds since the epoch.
    pub(crate) started_at: Option<i64>,
    /// The working folder of the agent or of a command it runs.
    pub(crate) folder: PathBuf,
}

/// What the kernel says about one of the person's processes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ProcessFacts {
    pub(crate) pid: u32,
    pub(crate) parent: u32,
    pub(crate) started_at: Option<i64>,
    pub(crate) tool: Option<AgentTool>,
    pub(crate) folder: Option<PathBuf>,
    /// The kernel's short program name (at most 16 bytes), never a path or an argument.
    pub(crate) name: String,
}

/// Claude Code installs as `claude` or as `.../claude/versions/<version>`; Codex as `codex`.
#[cfg_attr(not(any(target_os = "macos", target_os = "linux")), allow(dead_code))]
pub(crate) fn tool_for_executable(path: &Path) -> Option<AgentTool> {
    let name = path.file_name()?.to_str()?;
    match name {
        "claude" => return Some(AgentTool::ClaudeCode),
        "codex" => return Some(AgentTool::Codex),
        _ => {}
    }
    let versions = path.parent()?;
    let installed = versions.parent()?;
    (versions.file_name()? == "versions" && installed.file_name()? == "claude")
        .then_some(AgentTool::ClaudeCode)
}

/// Each process with a working folder, credited to its agent among itself and its ancestors; one
/// entry per agent and folder. A background server's own folder is not work. A chain through an Atlas agent session (`acp_pids`) is that
/// session's, which the page shows by its own pid. O(processes × chain length).
pub(crate) fn credit_to_agents(facts: &[ProcessFacts], acp_pids: &[u32]) -> Vec<AgentProcess> {
    let by_pid: HashMap<u32, &ProcessFacts> = facts.iter().map(|fact| (fact.pid, fact)).collect();
    let mut credited: Vec<AgentProcess> = facts
        .iter()
        .filter_map(|fact| {
            let folder = fact.folder.clone()?;
            let agent = session_agent(fact, &by_pid, acp_pids)?;
            if fact.tool.is_some() && is_background_server(agent, &by_pid) {
                return None;
            }
            Some(AgentProcess {
                pid: agent.pid,
                tool: agent.tool?,
                started_at: agent.started_at,
                folder,
            })
        })
        .collect();
    credited.sort_by(|a, b| (a.pid, &a.folder).cmp(&(b.pid, &b.folder)));
    credited.dedup();
    credited
}

/// The nearest agent above a process, then the outermost one of that same tool above it, so a
/// `claude` an agent runs for a moment counts toward the session that started it.
pub(crate) fn session_agent<'a>(
    start: &'a ProcessFacts,
    by_pid: &HashMap<u32, &'a ProcessFacts>,
    acp_pids: &[u32],
) -> Option<&'a ProcessFacts> {
    let mut found: Option<&ProcessFacts> = None;
    let mut current = start;
    for _ in 0..MAX_ANCESTORS {
        if acp_pids.contains(&current.pid) {
            return None;
        }
        match (found, current.tool) {
            (None, Some(_)) => found = Some(current),
            (Some(agent), Some(tool)) if agent.tool == Some(tool) => found = Some(current),
            _ => {}
        }
        if current.parent == 0 || current.parent == current.pid {
            break;
        }
        let Some(parent) = by_pid.get(&current.parent) else {
            break;
        };
        current = parent;
    }
    found
}

/// An agent the system launched rather than a terminal, such as the Codex app's server, sits in
/// one folder whether or not it works; only the commands it runs say where it works.
fn is_background_server(agent: &ProcessFacts, by_pid: &HashMap<u32, &ProcessFacts>) -> bool {
    let mut current = agent;
    for _ in 0..MAX_ANCESTORS {
        match by_pid.get(&current.parent) {
            Some(parent) if parent.tool == agent.tool => current = parent,
            _ => return current.parent == SYSTEM_LAUNCHER_PID || current.parent == 0,
        }
    }
    false
}

/// The processes with an agent among themselves and their ancestors: the only ones whose working
/// folder can be credited. O(processes × chain length).
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub(crate) fn under_agents(facts: &[ProcessFacts]) -> std::collections::HashSet<u32> {
    let by_pid: HashMap<u32, &ProcessFacts> = facts.iter().map(|fact| (fact.pid, fact)).collect();
    facts
        .iter()
        .filter(|start| {
            let mut current = *start;
            for _ in 0..MAX_ANCESTORS {
                if current.tool.is_some() {
                    return true;
                }
                if current.parent == 0 || current.parent == current.pid {
                    return false;
                }
                match by_pid.get(&current.parent) {
                    Some(parent) => current = parent,
                    None => return false,
                }
            }
            false
        })
        .map(|fact| fact.pid)
        .collect()
}

static RECENT: Mutex<Vec<(AgentProcess, Instant)>> = Mutex::new(Vec::new());

/// Agents at work now, plus folders an agent that still runs worked in within `RECENT_GRACE`.
pub(crate) fn agent_processes(acp_pids: &[u32]) -> Vec<AgentProcess> {
    let facts = own_processes();
    let live = credit_to_agents(&facts, acp_pids);
    let alive: HashMap<u32, Option<i64>> = facts
        .iter()
        .filter(|fact| fact.tool.is_some())
        .map(|fact| (fact.pid, fact.started_at))
        .collect();
    let Ok(mut recent) = RECENT.lock() else {
        return live;
    };
    remember(&mut recent, live, &alive, Instant::now(), |folder| {
        folder.exists()
    })
}

/// Keeps a remembered folder while it exists, its agent runs with the same start, and it was seen
/// within `RECENT_GRACE`; refreshes or adds what is live. Returns the union, ordered.
pub(crate) fn remember(
    recent: &mut Vec<(AgentProcess, Instant)>,
    live: Vec<AgentProcess>,
    alive: &HashMap<u32, Option<i64>>,
    now: Instant,
    exists: impl Fn(&Path) -> bool,
) -> Vec<AgentProcess> {
    recent.retain(|(process, seen)| {
        now.duration_since(*seen) < RECENT_GRACE
            && alive.get(&process.pid) == Some(&process.started_at)
            && exists(&process.folder)
    });
    for process in live {
        match recent.iter_mut().find(|(known, _)| *known == process) {
            Some(entry) => entry.1 = now,
            None => recent.push((process, now)),
        }
    }
    let mut all: Vec<AgentProcess> = recent.iter().map(|(process, _)| process.clone()).collect();
    all.sort_by(|a, b| (a.pid, &a.folder).cmp(&(b.pid, &b.folder)));
    all
}

#[cfg(target_os = "macos")]
fn own_processes() -> Vec<ProcessFacts> {
    let Some(mut facts) = listed_processes() else {
        return vec![];
    };
    // A working folder is a path lookup in the kernel; only an agent's own command tree needs one.
    let wanted = under_agents(&facts);
    for fact in &mut facts {
        if wanted.contains(&fact.pid) {
            fact.folder = mac_working_folder(fact.pid as libc::pid_t);
        }
    }
    facts
}

/// The person's own processes without their working folders: one listing and one kernel record
/// per process. The name is checked first, so only an agent-looking process pays for its path
/// read. `None` when the kernel refuses the listing.
#[cfg(target_os = "macos")]
pub(crate) fn listed_processes() -> Option<Vec<ProcessFacts>> {
    // SAFETY: a null buffer asks only for the number of pids.
    let estimate = unsafe { libc::proc_listallpids(std::ptr::null_mut(), 0) };
    if estimate <= 0 {
        return None;
    }
    /// Room for processes that start between the count and the listing.
    const LISTING_SLACK: usize = 64;
    let mut pids = vec![0 as libc::pid_t; estimate as usize + LISTING_SLACK];
    let bytes = (pids.len() * std::mem::size_of::<libc::pid_t>()) as libc::c_int;
    // SAFETY: the buffer holds `bytes` bytes of pids, the size the call is told.
    let listed = unsafe { libc::proc_listallpids(pids.as_mut_ptr().cast(), bytes) };
    if listed <= 0 {
        return None;
    }
    pids.truncate((listed as usize).min(pids.len()));
    // SAFETY: getuid has no failure mode.
    let own_uid = unsafe { libc::getuid() };
    Some(
        pids.into_iter()
            .filter(|pid| *pid > 0)
            .filter_map(|pid| mac_process(pid, own_uid))
            .collect(),
    )
}

#[cfg(target_os = "macos")]
fn mac_process(pid: libc::pid_t, own_uid: libc::uid_t) -> Option<ProcessFacts> {
    let mut info = std::mem::MaybeUninit::<libc::proc_bsdinfo>::zeroed();
    let size = std::mem::size_of::<libc::proc_bsdinfo>() as libc::c_int;
    // SAFETY: the buffer is exactly one `proc_bsdinfo`, the size the call is told.
    let written = unsafe {
        libc::proc_pidinfo(
            pid,
            libc::PROC_PIDTBSDINFO,
            0,
            info.as_mut_ptr().cast(),
            size,
        )
    };
    if written != size {
        return None;
    }
    // SAFETY: the kernel filled all `size` bytes.
    let info = unsafe { info.assume_init() };
    if info.pbi_uid != own_uid {
        return None;
    }
    let name = c_text(&info.pbi_comm);
    let looks_like_agent = name == "claude"
        || name == "codex"
        || (!name.is_empty() && name.chars().all(|c| c.is_ascii_digit() || c == '.'));
    Some(ProcessFacts {
        pid: pid as u32,
        parent: info.pbi_ppid,
        started_at: Some(info.pbi_start_tvsec as i64),
        tool: looks_like_agent
            .then(|| mac_executable(pid))
            .flatten()
            .and_then(|path| tool_for_executable(&path)),
        folder: None,
        name,
    })
}

#[cfg(target_os = "macos")]
fn c_text(bytes: &[libc::c_char]) -> String {
    let bytes: Vec<u8> = bytes
        .iter()
        .take_while(|byte| **byte != 0)
        .map(|byte| *byte as u8)
        .collect();
    String::from_utf8_lossy(&bytes).into_owned()
}

#[cfg(target_os = "macos")]
fn mac_executable(pid: libc::pid_t) -> Option<PathBuf> {
    /// `PROC_PIDPATHINFO_MAXSIZE` in `<libproc.h>`.
    const PATH_MAX_BYTES: usize = 4 * 1024;
    let mut buffer = vec![0u8; PATH_MAX_BYTES];
    // SAFETY: the buffer holds `PATH_MAX_BYTES` bytes, the size the call is told.
    let written =
        unsafe { libc::proc_pidpath(pid, buffer.as_mut_ptr().cast(), PATH_MAX_BYTES as u32) };
    if written <= 0 {
        return None;
    }
    buffer.truncate(written as usize);
    Some(PathBuf::from(String::from_utf8(buffer).ok()?))
}

#[cfg(target_os = "macos")]
pub(crate) fn mac_working_folder(pid: libc::pid_t) -> Option<PathBuf> {
    let mut info = std::mem::MaybeUninit::<libc::proc_vnodepathinfo>::zeroed();
    let size = std::mem::size_of::<libc::proc_vnodepathinfo>() as libc::c_int;
    // SAFETY: the buffer is exactly one `proc_vnodepathinfo`, the size the call is told.
    let written = unsafe {
        libc::proc_pidinfo(
            pid,
            libc::PROC_PIDVNODEPATHINFO,
            0,
            info.as_mut_ptr().cast(),
            size,
        )
    };
    if written != size {
        return None;
    }
    // SAFETY: the kernel filled all `size` bytes.
    let info = unsafe { info.assume_init() };
    let path: Vec<libc::c_char> = info.pvi_cdir.vip_path.iter().flatten().copied().collect();
    let text = c_text(&path);
    (!text.is_empty()).then(|| PathBuf::from(text))
}

#[cfg(target_os = "linux")]
fn own_processes() -> Vec<ProcessFacts> {
    use std::os::unix::fs::MetadataExt;
    // SAFETY: getuid has no failure mode.
    let own_uid = unsafe { libc::getuid() };
    let Ok(entries) = std::fs::read_dir("/proc") else {
        return vec![];
    };
    entries
        .flatten()
        .filter_map(|entry| {
            let pid: u32 = entry.file_name().to_str()?.parse().ok()?;
            if entry.metadata().ok()?.uid() != own_uid {
                return None;
            }
            let stat = std::fs::read_to_string(entry.path().join("stat")).ok()?;
            let name = stat
                .split_once('(')
                .and_then(|(_, rest)| rest.rsplit_once(')'))
                .map(|(name, _)| name.to_string())
                .unwrap_or_default();
            /// `ppid` is field 4; the fields after `comm`'s closing parenthesis begin at field 3.
            const PARENT_FIELD_AFTER_COMM: usize = 4 - 3;
            let parent = stat
                .rsplit_once(')')?
                .1
                .split_whitespace()
                .nth(PARENT_FIELD_AFTER_COMM)?
                .parse()
                .ok()?;
            let tool = std::fs::read_link(entry.path().join("exe"))
                .ok()
                .and_then(|path| tool_for_executable(&path));
            // Only an agent's start is compared, so only an agent pays for reading it.
            let started_at = tool.and_then(|_| match super::worktrees::lock::process_start(pid) {
                super::worktrees::lock::ProcessStart::StartedAt(at) => Some(at),
                _ => None,
            });
            Some(ProcessFacts {
                pid,
                parent,
                started_at,
                tool,
                folder: std::fs::read_link(entry.path().join("cwd")).ok(),
                name,
            })
        })
        .collect()
}

/// Windows has no supported way to read another process's working folder.
#[cfg(not(any(target_os = "macos", target_os = "linux")))]
fn own_processes() -> Vec<ProcessFacts> {
    vec![]
}
