//! A worktree lock names who holds it. Claude Code writes
//! `claude agent agent-<id> (pid <pid> start <ctime in UTC>)`; the pid is the session's, and the
//! time is when that process started, so a reused pid shows as a different start.

use chrono::NaiveDateTime;
use serde::Serialize;

/// The reason's time has whole seconds and the kernel's start time may round the other way.
const START_TOLERANCE_SECS: i64 = 1;
const AGENT_ID_MAX_LEN: usize = 64;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum LockTool {
    ClaudeCode,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct LockReason {
    pub(crate) tool: LockTool,
    pub(crate) agent_id: Option<String>,
    pub(crate) pid: u32,
    pub(crate) started_at: i64,
}

/// What a lock says about its holder now.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum LockState {
    /// The named pid runs and started when the reason says.
    Live,
    /// The named pid is gone, or it is another process that reused the number.
    Stale,
    /// The reason has no pid and start Atlas can read; counted as held.
    Unparsed,
}

pub(crate) enum ProcessStart {
    StartedAt(i64),
    Gone,
    /// This platform cannot say; the lock is believed.
    #[cfg_attr(target_os = "macos", allow(dead_code))]
    Unknown,
}

pub(crate) fn parse_lock_reason(reason: &str) -> Option<LockReason> {
    let reason = reason.trim();
    let open = reason.rfind("(pid ")?;
    let inner = reason[open + "(pid ".len()..].strip_suffix(')')?;
    let (pid, start) = inner.split_once(" start ")?;
    let pid: u32 = pid.trim().parse().ok().filter(|pid| *pid > 0)?;
    let started_at = parse_utc_ctime(start)?;
    let head = &reason[..open];
    let tool = if head.split_whitespace().next() == Some("claude") {
        LockTool::ClaudeCode
    } else {
        LockTool::Unknown
    };
    let agent_id = head
        .split_whitespace()
        .find_map(|word| word.strip_prefix("agent-"))
        .filter(|id| {
            !id.is_empty()
                && id.len() <= AGENT_ID_MAX_LEN
                && id.chars().all(|c| c.is_ascii_alphanumeric())
        })
        .map(str::to_string);
    Some(LockReason {
        tool,
        agent_id,
        pid,
        started_at,
    })
}

/// `Sat Nov 21 09:47:42 2026`, read as UTC whatever the local zone; `ctime` pads the day with a space.
fn parse_utc_ctime(text: &str) -> Option<i64> {
    let squeezed = text.split_whitespace().collect::<Vec<_>>().join(" ");
    NaiveDateTime::parse_from_str(&squeezed, "%a %b %d %H:%M:%S %Y")
        .ok()
        .map(|time| time.and_utc().timestamp())
}

pub(crate) fn judge_lock(
    reason: Option<&LockReason>,
    probe: impl Fn(u32) -> ProcessStart,
) -> LockState {
    let Some(reason) = reason else {
        return LockState::Unparsed;
    };
    match probe(reason.pid) {
        ProcessStart::StartedAt(started) => {
            if (started - reason.started_at).abs() <= START_TOLERANCE_SECS {
                LockState::Live
            } else {
                LockState::Stale
            }
        }
        ProcessStart::Gone => LockState::Stale,
        ProcessStart::Unknown => LockState::Live,
    }
}

/// Reads only the start time of the one pid a lock names; no arguments, environment or files.
#[cfg(target_os = "macos")]
pub(crate) fn process_start(pid: u32) -> ProcessStart {
    let Ok(pid) = libc::c_int::try_from(pid) else {
        return ProcessStart::Gone;
    };
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
        return ProcessStart::Gone;
    }
    // SAFETY: the kernel filled all `size` bytes.
    let info = unsafe { info.assume_init() };
    ProcessStart::StartedAt(info.pbi_start_tvsec as i64)
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn process_start(_pid: u32) -> ProcessStart {
    ProcessStart::Unknown
}
