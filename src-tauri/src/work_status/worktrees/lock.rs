//! A worktree lock names who holds it. Claude Code writes
//! `claude agent agent-<id> (pid <pid> start <ctime in UTC>)`; the pid is the session's, and the
//! time is when that process started, so a reused pid shows as a different start.

use chrono::NaiveDateTime;
use serde::Serialize;

/// The reason's time has whole seconds and the kernel's start time may round the other way;
/// Linux derives the start from boot time plus clock ticks, so it may round twice.
#[cfg(not(target_os = "linux"))]
const START_TOLERANCE_SECS: i64 = 1;
#[cfg(target_os = "linux")]
const START_TOLERANCE_SECS: i64 = 2;
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

#[cfg_attr(
    not(any(target_os = "macos", windows, target_os = "linux")),
    allow(dead_code)
)]
#[derive(Hash)]
pub(crate) enum ProcessStart {
    StartedAt(i64),
    Gone,
    /// The process exists but Atlas may not read when it started; the lock is believed.
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
    if written == size {
        // SAFETY: the kernel filled all `size` bytes.
        let info = unsafe { info.assume_init() };
        return ProcessStart::StartedAt(info.pbi_start_tvsec as i64);
    }
    // SAFETY: signal 0 only asks whether the pid exists and may be signalled.
    let exists = unsafe { libc::kill(pid, 0) } == 0
        || std::io::Error::last_os_error().raw_os_error() == Some(libc::EPERM);
    if exists {
        ProcessStart::Unknown
    } else {
        ProcessStart::Gone
    }
}

/// `GetProcessTimes` on a handle that may only query: the creation time, nothing else.
#[cfg(windows)]
pub(crate) fn process_start(pid: u32) -> ProcessStart {
    use windows_sys::Win32::Foundation::{
        CloseHandle, GetLastError, ERROR_ACCESS_DENIED, FILETIME,
    };
    use windows_sys::Win32::System::Threading::{
        GetProcessTimes, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    /// Seconds from 1601-01-01, where FILETIME counts from, to 1970-01-01.
    const FILETIME_TO_UNIX_SECS: i64 = 11_644_473_600;
    const FILETIME_TICKS_PER_SEC: u64 = 10_000_000;

    // SAFETY: plain FFI call; a null handle is checked before any use.
    let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
    if handle.is_null() {
        // SAFETY: reads this thread's last error, which `OpenProcess` just set.
        return if unsafe { GetLastError() } == ERROR_ACCESS_DENIED {
            ProcessStart::Unknown
        } else {
            ProcessStart::Gone
        };
    }
    let mut created = FILETIME::default();
    let mut exited = FILETIME::default();
    let mut kernel = FILETIME::default();
    let mut user = FILETIME::default();
    // SAFETY: the handle is open and every out pointer is a live, writable FILETIME.
    let read =
        unsafe { GetProcessTimes(handle, &mut created, &mut exited, &mut kernel, &mut user) };
    // SAFETY: the handle came from `OpenProcess` and is closed exactly once.
    unsafe { CloseHandle(handle) };
    if read == 0 {
        return ProcessStart::Unknown;
    }
    let ticks = (u64::from(created.dwHighDateTime) << 32) | u64::from(created.dwLowDateTime);
    let seconds = (ticks / FILETIME_TICKS_PER_SEC) as i64;
    ProcessStart::StartedAt(seconds - FILETIME_TO_UNIX_SECS)
}

/// `/proc/<pid>/stat` counts the start in clock ticks after boot; `/proc/stat` says when boot was.
#[cfg(target_os = "linux")]
pub(crate) fn process_start(pid: u32) -> ProcessStart {
    let Ok(stat) = std::fs::read_to_string(format!("/proc/{pid}/stat")) else {
        return ProcessStart::Gone;
    };
    linux_start(&stat).map_or(ProcessStart::Unknown, ProcessStart::StartedAt)
}

#[cfg(target_os = "linux")]
fn linux_start(stat: &str) -> Option<i64> {
    /// `starttime` is field 22; the fields after `comm`'s closing parenthesis begin at field 3.
    const START_FIELD_AFTER_COMM: usize = 22 - 3;
    let ticks: i64 = stat
        .rsplit_once(')')?
        .1
        .split_whitespace()
        .nth(START_FIELD_AFTER_COMM)?
        .parse()
        .ok()?;
    let boot: i64 = std::fs::read_to_string("/proc/stat")
        .ok()?
        .lines()
        .find_map(|line| line.strip_prefix("btime "))?
        .trim()
        .parse()
        .ok()?;
    /// `/proc` reports clock ticks in USER_HZ, which the kernel fixes at 100 for user space.
    const USER_HZ: i64 = 100;
    Some(boot + ticks / USER_HZ)
}

#[cfg(not(any(target_os = "macos", windows, target_os = "linux")))]
pub(crate) fn process_start(_pid: u32) -> ProcessStart {
    ProcessStart::Unknown
}
