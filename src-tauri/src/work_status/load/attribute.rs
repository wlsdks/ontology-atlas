//! Whose load a process is: the worktree it counts for and the tool group it is shown in, from its
//! program name, its working folder and those of its ancestors. Pure; the reads live in `source`.

use std::collections::{BTreeMap, HashMap};
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::work_status::agent_processes::AgentTool;

/// A parent chain longer than this is not an agent's command tree.
const MAX_ANCESTORS: usize = 64;

/// How a process is shown, by its kernel program name from a closed list.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum ToolGroup {
    Agent,
    Node,
    Rust,
    Java,
    GradleDaemon,
    Xcode,
    Python,
    Git,
    Other,
}

pub(crate) fn group_for(name: &str, tool: Option<AgentTool>) -> ToolGroup {
    if tool.is_some() {
        return ToolGroup::Agent;
    }
    match name {
        "claude" | "codex" => ToolGroup::Agent,
        "node" => ToolGroup::Node,
        "cargo" | "rustc" | "rustdoc" | "clippy-driver" => ToolGroup::Rust,
        "java" => ToolGroup::Java,
        "xcodebuild" | "clang" | "swift-frontend" | "ld" => ToolGroup::Xcode,
        "python3" | "Python" => ToolGroup::Python,
        "git" => ToolGroup::Git,
        _ => ToolGroup::Other,
    }
}

/// Gradle keeps an idle daemon in `<Gradle home>/daemon/<version>`; while it builds, its working
/// folder is the build's own, which places it in that worktree instead.
pub(crate) fn is_gradle_daemon_folder(folder: &Path) -> bool {
    let daemon = folder.parent();
    let home = daemon.and_then(Path::parent);
    daemon
        .and_then(Path::file_name)
        .is_some_and(|name| name == "daemon")
        && home
            .and_then(Path::file_name)
            .is_some_and(|name| name == ".gradle")
}

/// The deepest worktree `folder` lies in. O(worktrees).
pub(crate) fn worktree_of<'a>(
    folder: &Path,
    worktrees: &'a [(PathBuf, String)],
) -> Option<&'a str> {
    worktrees
        .iter()
        .filter(|(path, _)| folder.starts_with(path))
        .max_by_key(|(path, _)| path.components().count())
        .map(|(_, id)| id.as_str())
}

/// One process whose usage was read this sample.
#[derive(Debug, Clone)]
pub(crate) struct Measured {
    pub(crate) pid: u32,
    pub(crate) parent: u32,
    pub(crate) tool: Option<AgentTool>,
    pub(crate) name: String,
    pub(crate) folder: Option<PathBuf>,
    /// Whether an agent is among itself and its ancestors.
    pub(crate) under_agent: bool,
    /// Whether an Atlas agent session's process is among itself and its ancestors.
    pub(crate) under_acp_session: bool,
    pub(crate) memory_bytes: u64,
    /// `None` on the first sample, or after a pause long enough to make a rate meaningless.
    pub(crate) cpu_cores: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LoadGroup {
    pub(crate) tool: ToolGroup,
    pub(crate) count: u32,
    pub(crate) memory_bytes: u64,
    pub(crate) cpu_cores: Option<f64>,
}

/// An agent program whose commands run in a room while the program itself counts in another.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AgentElsewhere {
    /// The pid the worktree read already credits: the outermost program of its tool.
    pub(crate) pid: u32,
    pub(crate) worktree_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorktreeLoad {
    pub(crate) memory_bytes: u64,
    pub(crate) cpu_cores: Option<f64>,
    /// Every group with a process here, heaviest by memory first.
    pub(crate) groups: Vec<LoadGroup>,
    pub(crate) agents_elsewhere: Vec<AgentElsewhere>,
}

#[derive(Default)]
struct Tally {
    memory_bytes: u64,
    cpu_cores: Option<f64>,
    groups: BTreeMap<ToolGroup, LoadGroup>,
    agents_elsewhere: Vec<AgentElsewhere>,
}

fn add_cpu(total: Option<f64>, more: Option<f64>) -> Option<f64> {
    match (total, more) {
        (Some(total), Some(more)) => Some(total + more),
        (total, None) => total,
        (None, more) => more,
    }
}

impl Tally {
    fn add(&mut self, tool: ToolGroup, process: &Measured) {
        self.memory_bytes += process.memory_bytes;
        self.cpu_cores = add_cpu(self.cpu_cores, process.cpu_cores);
        let entry = self.groups.entry(tool).or_insert(LoadGroup {
            tool,
            count: 0,
            memory_bytes: 0,
            cpu_cores: None,
        });
        entry.count += 1;
        entry.memory_bytes += process.memory_bytes;
        entry.cpu_cores = add_cpu(entry.cpu_cores, process.cpu_cores);
    }

    fn sorted_groups(&self) -> Vec<LoadGroup> {
        let mut groups: Vec<LoadGroup> = self.groups.values().cloned().collect();
        groups.sort_by(|a, b| {
            b.memory_bytes
                .cmp(&a.memory_bytes)
                .then(a.tool.cmp(&b.tool))
        });
        groups
    }
}

/// Each worktree's load, by id, and the groups outside every worktree. A process counts once: for
/// the worktree its own working folder lies in, else for the one of its nearest ancestor, up to its
/// agent, that has one. A `java` outside every agent tree counts only by its own folder.
/// O(processes × chain).
pub(crate) fn attribute(
    measured: &[Measured],
    worktrees: &[(PathBuf, String)],
) -> (BTreeMap<String, WorktreeLoad>, Vec<LoadGroup>) {
    let by_pid: HashMap<u32, &Measured> = measured
        .iter()
        .map(|process| (process.pid, process))
        .collect();
    let placed = |process: &Measured| -> Option<String> {
        let mut current = process;
        for _ in 0..MAX_ANCESTORS {
            if let Some(id) = current
                .folder
                .as_deref()
                .and_then(|folder| worktree_of(folder, worktrees))
            {
                return Some(id.to_string());
            }
            if !current.under_agent || current.tool.is_some() {
                return None;
            }
            current = by_pid.get(&current.parent)?;
        }
        None
    };
    // The nearest agent above, then the outermost one of that same tool, as the worktree read
    // credits a session: a `claude` an agent runs for a moment counts toward the session above it.
    // A chain through an Atlas agent session is that session's, which the page shows by its own
    // pid, so no agent pid below it is sent.
    let agent_of = |process: &Measured| -> Option<&Measured> {
        if process.under_acp_session {
            return None;
        }
        let mut found: Option<&Measured> = None;
        let mut current = by_pid.get(&process.parent).copied()?;
        for _ in 0..MAX_ANCESTORS {
            match (found.and_then(|agent| agent.tool), current.tool) {
                (None, Some(_)) => found = Some(current),
                (Some(tool), Some(other)) if tool == other => found = Some(current),
                _ => {}
            }
            match by_pid.get(&current.parent) {
                Some(parent) => current = parent,
                None => break,
            }
        }
        found
    };

    let mut rooms: BTreeMap<String, Tally> = BTreeMap::new();
    let mut outside = Tally::default();
    for process in measured {
        let room = placed(process);
        let tool = match group_for(&process.name, process.tool) {
            ToolGroup::Java
                if room.is_none()
                    && !process.under_agent
                    && process
                        .folder
                        .as_deref()
                        .is_some_and(is_gradle_daemon_folder) =>
            {
                ToolGroup::GradleDaemon
            }
            tool => tool,
        };
        let Some(room) = room else {
            outside.add(tool, process);
            continue;
        };
        let tally = rooms.entry(room.clone()).or_default();
        tally.add(tool, process);
        let agent_room = process
            .tool
            .is_none()
            .then(|| agent_of(process))
            .flatten()
            .and_then(|agent| Some((agent.pid, placed(agent)?)));
        if let Some((pid, worktree_id)) = agent_room.filter(|(_, agent_room)| *agent_room != room) {
            let elsewhere = AgentElsewhere { pid, worktree_id };
            if !tally.agents_elsewhere.contains(&elsewhere) {
                tally.agents_elsewhere.push(elsewhere);
            }
        }
    }
    let rooms = rooms
        .into_iter()
        .map(|(worktree_id, mut tally)| {
            tally.agents_elsewhere.sort();
            let load = WorktreeLoad {
                memory_bytes: tally.memory_bytes,
                cpu_cores: tally.cpu_cores,
                groups: tally.sorted_groups(),
                agents_elsewhere: tally.agents_elsewhere,
            };
            (worktree_id, load)
        })
        .collect();
    (rooms, outside.sorted_groups())
}
