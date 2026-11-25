use std::collections::HashMap;
use std::path::PathBuf;
use std::time::{Duration, Instant};

use super::attribute::ToolGroup;
use super::source::{CpuTicks, LoadSource, MacMemory, Pressure, Usage};
use super::{sample, LoadRead, LoadStatus, Sample};
use crate::work_status::agent_processes::{AgentTool, ProcessFacts};

const PLANTED: &str = "ATLAS_PLANTED_7f3c";
const MIB: u64 = 1024 * 1024;
const EPOCH_SECONDS: i64 = 1_700_000_000;

/// A machine described by hand, counting each read the sample makes.
#[derive(Default)]
struct FakeMac {
    processes: Vec<ProcessFacts>,
    usage: HashMap<u32, Usage>,
    folders: HashMap<u32, PathBuf>,
    gpu: Option<u8>,
    refuse_listing: bool,
    refuse_memory: bool,
    cpu_ticks: Option<CpuTicks>,
    listings: usize,
    usage_reads: usize,
    folder_reads: usize,
    mac_reads: usize,
}

impl LoadSource for FakeMac {
    fn processes(&mut self) -> Option<Vec<ProcessFacts>> {
        self.listings += 1;
        (!self.refuse_listing).then(|| self.processes.clone())
    }
    fn usage(&mut self, pid: u32) -> Option<Usage> {
        self.usage_reads += 1;
        self.usage.get(&pid).copied()
    }
    fn working_folder(&mut self, pid: u32) -> Option<PathBuf> {
        self.folder_reads += 1;
        self.folders.get(&pid).cloned()
    }
    fn memory(&mut self) -> Option<MacMemory> {
        self.mac_reads += 1;
        (!self.refuse_memory).then_some(MacMemory {
            used_bytes: 30 * 1024 * MIB,
            total_bytes: 64 * 1024 * MIB,
            pressure: Some(Pressure::Warning),
        })
    }
    fn cpu(&mut self) -> Option<CpuTicks> {
        self.mac_reads += 1;
        self.cpu_ticks
    }
    fn gpu_percent(&mut self) -> Option<u8> {
        self.mac_reads += 1;
        self.gpu
    }
}

impl FakeMac {
    fn with_cpu() -> Self {
        Self {
            cpu_ticks: Some(CpuTicks {
                busy: [100, 50, 0],
                idle: 850,
                core_count: 18,
            }),
            gpu: Some(31),
            ..Self::default()
        }
    }

    /// A process of this user: its parent, kernel name, agent tool, folder, memory and CPU time.
    fn add(
        &mut self,
        pid: u32,
        parent: u32,
        name: &str,
        tool: Option<AgentTool>,
        folder: &str,
        memory_mib: u64,
    ) {
        self.processes.push(ProcessFacts {
            pid,
            parent,
            started_at: Some(EPOCH_SECONDS - 100),
            tool,
            folder: None,
            name: name.to_string(),
        });
        self.folders.insert(pid, PathBuf::from(folder));
        self.usage.insert(
            pid,
            Usage {
                memory_bytes: memory_mib * MIB,
                cpu_ns: 1_000_000_000,
            },
        );
    }
}

fn worktrees() -> Vec<(PathBuf, String)> {
    vec![
        (PathBuf::from("/repo"), "main".to_string()),
        (PathBuf::from("/repo/.worktrees/a"), "a".to_string()),
    ]
}

fn first_sample(mac: &mut FakeMac) -> (LoadRead, Sample) {
    sample(mac, &worktrees(), &[], None, Instant::now(), EPOCH_SECONDS).expect("a sample")
}

/// An agent started outside every worktree; its child works in worktree A with 200 MiB, and the
/// child's own child works in a temporary folder.
fn agent_tree(mac: &mut FakeMac) {
    mac.add(
        10,
        1,
        "2.1.330",
        Some(AgentTool::ClaudeCode),
        "/Users/me/elsewhere",
        300,
    );
    mac.add(11, 10, "node", None, "/repo/.worktrees/a/web", 200);
    mac.add(12, 11, "python3", None, "/tmp/scratch", 5);
}

#[test]
fn a_child_and_its_child_count_for_the_worktree_and_an_unrelated_process_for_none() {
    let mut mac = FakeMac::with_cpu();
    agent_tree(&mut mac);
    mac.add(99, 1, "sleep", None, "/repo/.worktrees/a", 50);
    let (read, _) = first_sample(&mut mac);
    let a = read.worktrees.get("a").expect("worktree a has load");
    assert!(a.memory_bytes >= 150 * MIB);
    assert_eq!(a.memory_bytes, 205 * MIB);
    let tools: Vec<(ToolGroup, u32)> = a
        .groups
        .iter()
        .map(|group| (group.tool, group.count))
        .collect();
    assert_eq!(tools, [(ToolGroup::Node, 1), (ToolGroup::Python, 1)]);
    // The agent itself was started outside every worktree, so it is named nowhere in A.
    assert_eq!(a.agents_elsewhere, []);
    assert!(!read.worktrees.contains_key("main"));
    assert_eq!(
        read.outside
            .iter()
            .map(|group| (group.tool, group.memory_bytes))
            .collect::<Vec<_>>(),
        [(ToolGroup::Agent, 300 * MIB)]
    );
    // The first sample has no rate to give.
    assert_eq!(a.cpu_cores, None);
    assert_eq!(read.mac.as_ref().and_then(|mac| mac.cpu_cores), None);
}

#[test]
fn an_agent_counted_in_another_worktree_is_named_by_the_pid_the_page_holds() {
    let mut mac = FakeMac::with_cpu();
    mac.add(20, 1, "2.1.330", Some(AgentTool::ClaudeCode), "/repo", 300);
    // A `claude` the session runs for a moment: its command still counts toward pid 20.
    mac.add(21, 20, "2.1.330", Some(AgentTool::ClaudeCode), "/repo", 40);
    mac.add(22, 21, "cargo", None, "/repo/.worktrees/a", 80);
    let (read, _) = first_sample(&mut mac);
    let a = read.worktrees.get("a").expect("worktree a");
    let elsewhere: Vec<(u32, &str)> = a
        .agents_elsewhere
        .iter()
        .map(|agent| (agent.pid, agent.worktree_id.as_str()))
        .collect();
    assert_eq!(elsewhere, [(20, "main")]);
    assert_eq!(
        read.worktrees.get("main").map(|main| main.memory_bytes),
        Some(340 * MIB)
    );
}

/// Under an Atlas agent session the adapter runs Codex; the page shows that session by its own
/// pid, so Codex's pid must never be sent as the agent counted elsewhere.
#[test]
fn an_agent_under_an_atlas_session_is_never_named_elsewhere() {
    let mut mac = FakeMac::with_cpu();
    mac.add(5, 1, "ontology-atlas", None, "/Applications", 100);
    mac.add(6, 5, "node", None, "/repo", 50);
    mac.add(7, 6, "codex", Some(AgentTool::Codex), "/repo", 40);
    mac.add(8, 7, "cargo", None, "/repo/.worktrees/a", 80);
    let mut elsewhere = |acp_pids: &[u32]| {
        let (read, _) = sample(
            &mut mac,
            &worktrees(),
            acp_pids,
            None,
            Instant::now(),
            EPOCH_SECONDS,
        )
        .expect("a sample");
        let a = read.worktrees.get("a").cloned().expect("worktree a");
        a.agents_elsewhere
            .iter()
            .map(|agent| agent.pid)
            .collect::<Vec<u32>>()
    };
    assert_eq!(elsewhere(&[]), [7]);
    assert_eq!(elsewhere(&[6]), Vec::<u32>::new());
}

#[test]
fn program_names_fall_in_a_closed_list_and_a_gradle_daemon_is_placed_by_its_folder() {
    let mut mac = FakeMac::with_cpu();
    mac.add(
        30,
        1,
        "codex",
        Some(AgentTool::Codex),
        "/repo/.worktrees/a",
        10,
    );
    mac.add(31, 30, PLANTED, None, "/repo/.worktrees/a", 10);
    mac.add(32, 30, "clang", None, "/repo/.worktrees/a", 10);
    // Idle daemon in Gradle's own folder; a building daemon and its worker in worktree A.
    mac.add(40, 1, "java", None, "/Users/me/.gradle/daemon/9.2.1", 400);
    mac.add(41, 1, "java", None, "/repo/.worktrees/a", 500);
    mac.add(42, 41, "java", None, "/repo/.worktrees/a", 60);
    mac.add(43, 1, "java", None, "/Users/me/tools", 70);
    let (read, _) = first_sample(&mut mac);
    let a = read.worktrees.get("a").expect("worktree a");
    let tools: Vec<(ToolGroup, u32)> = a
        .groups
        .iter()
        .map(|group| (group.tool, group.count))
        .collect();
    assert_eq!(
        tools,
        [
            (ToolGroup::Java, 2),
            (ToolGroup::Agent, 1),
            (ToolGroup::Xcode, 1),
            (ToolGroup::Other, 1)
        ]
    );
    let outside: Vec<ToolGroup> = read.outside.iter().map(|group| group.tool).collect();
    assert_eq!(outside, [ToolGroup::GradleDaemon, ToolGroup::Java]);
    let sent = serde_json::to_string(&read).expect("serializes");
    assert!(!sent.contains(PLANTED) && !sent.contains("/repo") && !sent.contains(".gradle"));
}

#[test]
fn one_sample_makes_one_listing_and_one_usage_read_per_process_under_an_agent() {
    for others in [10, 600] {
        let mut mac = FakeMac::with_cpu();
        agent_tree(&mut mac);
        for pid in 0..others {
            mac.add(1_000 + pid, 1, "Safari", None, "/", 10);
        }
        let _ = first_sample(&mut mac);
        assert_eq!(mac.listings, 1, "{others} others");
        assert_eq!(mac.usage_reads, 3, "{others} others");
        assert_eq!(mac.folder_reads, 3, "{others} others");
        assert_eq!(mac.mac_reads, 3, "{others} others");
    }
}

#[test]
fn the_second_sample_gives_cores_and_a_rate_after_a_pause_is_withheld() {
    let mut mac = FakeMac::with_cpu();
    agent_tree(&mut mac);
    let start = Instant::now();
    let (_, first) =
        sample(&mut mac, &worktrees(), &[], None, start, EPOCH_SECONDS).expect("first");
    // Two more CPU seconds for the child over five seconds: 0.4 cores.
    if let Some(usage) = mac.usage.get_mut(&11) {
        usage.cpu_ns += 2_000_000_000;
    }
    mac.cpu_ticks = Some(CpuTicks {
        busy: [100 + 300, 50, 0],
        idle: 850 + 600,
        core_count: 18,
    });
    let later = start + Duration::from_secs(5);
    let (read, _) = sample(
        &mut mac,
        &worktrees(),
        &[],
        Some(&first),
        later,
        EPOCH_SECONDS + 5,
    )
    .expect("second");
    let a = read.worktrees.get("a").expect("worktree a");
    assert_eq!(a.cpu_cores, Some(0.4));
    assert_eq!(read.mac.as_ref().and_then(|mac| mac.cpu_cores), Some(6.0));

    let paused = start + Duration::from_secs(60);
    let (read, _) = sample(
        &mut mac,
        &worktrees(),
        &[],
        Some(&first),
        paused,
        EPOCH_SECONDS + 60,
    )
    .expect("third");
    assert_eq!(read.worktrees.get("a").and_then(|a| a.cpu_cores), None);
}

#[test]
fn a_counter_that_wrapped_still_gives_the_cores_used() {
    let earlier = CpuTicks {
        busy: [u32::MAX - 99, 0, 0],
        idle: u32::MAX - 99,
        core_count: 10,
    };
    let now = CpuTicks {
        busy: [100, 0, 0],
        idle: 100,
        core_count: 10,
    };
    assert_eq!(now.cores_since(&earlier), Some(5.0));
}

#[test]
fn no_gpu_figure_leaves_the_rest_and_a_failed_read_fails_the_sample_only() {
    let mut mac = FakeMac::with_cpu();
    mac.gpu = None;
    agent_tree(&mut mac);
    let (read, _) = first_sample(&mut mac);
    let numbers = read.mac.expect("the Mac's numbers");
    assert_eq!(numbers.gpu_percent, None);
    assert_eq!(numbers.pressure, Pressure::Warning);
    assert_eq!(numbers.core_count, 18);
    assert!(read.worktrees.contains_key("a"));

    for refuse in ["listing", "memory", "cpu"] {
        let mut mac = FakeMac::with_cpu();
        agent_tree(&mut mac);
        match refuse {
            "listing" => mac.refuse_listing = true,
            "memory" => mac.refuse_memory = true,
            _ => mac.cpu_ticks = None,
        }
        assert!(sample(
            &mut mac,
            &worktrees(),
            &[],
            None,
            Instant::now(),
            EPOCH_SECONDS
        )
        .is_err());
    }
    let failed = serde_json::to_value(LoadRead::failed()).expect("serializes");
    assert_eq!(
        failed,
        serde_json::json!({"status": "failed", "worktrees": {}, "outside": [], "mac": null})
    );
    assert_eq!(
        serde_json::to_value(LoadStatus::Read).expect("serializes"),
        serde_json::json!("read")
    );
}

#[test]
fn the_payload_speaks_the_page_contract() {
    let mut mac = FakeMac::with_cpu();
    mac.add(20, 1, "2.1.330", Some(AgentTool::ClaudeCode), "/repo", 1);
    mac.add(22, 20, "node", None, "/repo/.worktrees/a", 2);
    let (read, _) = first_sample(&mut mac);
    let sent = serde_json::to_value(&read).expect("serializes");
    assert_eq!(
        sent["worktrees"]["a"],
        serde_json::json!({
            "memoryBytes": 2 * MIB,
            "cpuCores": null,
            "groups": [{"tool": "node", "count": 1, "memoryBytes": 2 * MIB, "cpuCores": null}],
            "agentsElsewhere": [{"pid": 20, "worktreeId": "main"}]
        })
    );
    assert_eq!(
        sent["mac"],
        serde_json::json!({
            "memoryUsedBytes": 30 * 1024 * MIB,
            "memoryTotalBytes": 64 * 1024 * MIB,
            "pressure": "warning",
            "cpuCores": null,
            "coreCount": 18,
            "gpuPercent": 31
        })
    );
}

/// The real kernel reads on this Mac.
#[cfg(target_os = "macos")]
mod on_this_mac {
    use std::os::unix::process::CommandExt;
    use std::path::PathBuf;
    use std::process::{Child, Command, Stdio};
    use std::time::{Duration, Instant};

    use super::super::source::MacSource;
    use super::super::{holds_a_sample, load_read, sample, set_reading};
    use super::{MIB, PLANTED};

    /// Children to kill with their trees, and one detached pid.
    struct Killed(Vec<Child>, libc::pid_t);

    impl Drop for Killed {
        fn drop(&mut self) {
            for child in &mut self.0 {
                // SAFETY: the group `process_group(0)` made for this child, named by its pid.
                unsafe { libc::killpg(child.id() as libc::pid_t, libc::SIGKILL) };
                let _ = child.wait();
            }
            // SAFETY: a pid this test started and printed; SIGKILL needs no cleanup.
            unsafe { libc::kill(self.1, libc::SIGKILL) };
        }
    }

    /// A stand-in agent: the Node program copied under the name `claude`, so the kernel names it
    /// as Claude Code. It starts a child in worktree A that holds 200 MiB, and that child starts a
    /// grandchild in a temporary folder; the planted text rides in arguments and environment.
    #[test]
    fn an_agent_tree_is_measured_and_no_argument_or_environment_value_is_read() {
        let base = std::env::temp_dir().join(format!("atlas-load-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let worktree = base.join("repo/.worktrees/a");
        let scratch = base.join("scratch");
        std::fs::create_dir_all(&worktree).expect("worktree folder");
        std::fs::create_dir_all(&scratch).expect("scratch folder");
        let worktree = std::fs::canonicalize(&worktree).expect("canonical worktree");
        let scratch = std::fs::canonicalize(&scratch).expect("canonical scratch");
        let node = std::env::var_os("PATH")
            .and_then(|path| {
                std::env::split_paths(&path)
                    .map(|folder| folder.join("node"))
                    .find(|candidate| candidate.is_file())
            })
            .expect("Node is installed, as for every pnpm command");
        let agent = base.join("claude");
        std::fs::copy(&node, &agent).expect("stand-in agent");

        let child_script = format!(
            "const b = Buffer.alloc(200 * 1024 * 1024, 1); \
             require('child_process').spawn('/bin/sleep', ['60'], {{ cwd: {scratch:?}, stdio: 'ignore' }}); \
             setTimeout(() => b.length, 60000);"
        );
        let agent_script = format!(
            "require('child_process').spawn({node:?}, ['-e', {child_script:?}, '{PLANTED}'], \
             {{ cwd: {worktree:?}, stdio: 'ignore', env: {{ SECRET: '{PLANTED}' }} }}); \
             setTimeout(() => 0, 60000);"
        );
        let spawned = Command::new(&agent)
            .process_group(0)
            .args(["-e", &agent_script, PLANTED])
            .env("SECRET_VALUE", PLANTED)
            .current_dir(&base)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("the stand-in starts");
        // Started and left by a shell that ends, so its parent is launchd and no agent is above
        // it, even while this test runs under one.
        let printed = Command::new("/bin/sh")
            .args(["-c", "/bin/sleep 60 >/dev/null 2>&1 & echo $!"])
            .current_dir(&worktree)
            .output()
            .expect("an unrelated process");
        let unrelated: libc::pid_t = String::from_utf8_lossy(&printed.stdout)
            .trim()
            .parse()
            .expect("its pid");
        let _guard = Killed(vec![spawned], unrelated);

        let worktrees = vec![(worktree.clone(), "a".to_string())];
        let deadline = Instant::now() + Duration::from_secs(30);
        let read = loop {
            let (read, _) =
                sample(&mut MacSource, &worktrees, &[], None, Instant::now(), 0).expect("a sample");
            let enough = read.worktrees.get("a").is_some_and(|a| {
                a.memory_bytes >= 150 * MIB
                    && a.groups.iter().map(|group| group.count).sum::<u32>() >= 2
            });
            if enough || Instant::now() > deadline {
                break read;
            }
            std::thread::sleep(Duration::from_millis(200));
        };
        let a = read.worktrees.get("a").expect("worktree a has load");
        assert!(a.memory_bytes >= 150 * MIB, "{} bytes", a.memory_bytes);
        // The child and the grandchild; the unrelated sleeper has no agent above it.
        assert_eq!(a.groups.iter().map(|group| group.count).sum::<u32>(), 2);
        let mac = read.mac.as_ref().expect("the Mac's numbers");
        assert!(mac.memory_total_bytes > 0 && mac.core_count > 0);
        println!(
            "mac: used {} MiB of {} MiB, {:?}, {} cores, GPU {:?}%",
            mac.memory_used_bytes / MIB,
            mac.memory_total_bytes / MIB,
            mac.pressure,
            mac.core_count,
            mac.gpu_percent
        );
        let sent = serde_json::to_string(&read).expect("serializes");
        assert!(!sent.contains(PLANTED));
        assert!(!sent.contains(&*base.to_string_lossy()));
        let _ = std::fs::remove_dir_all(PathBuf::from(&base));
    }

    #[test]
    fn switched_off_load_holds_no_sample_and_answers_nothing() {
        set_reading(true);
        assert!(load_read(&[], &[]).is_some());
        assert!(holds_a_sample());
        set_reading(false);
        assert!(!holds_a_sample());
        assert!(load_read(&[], &[]).is_none());
        assert!(!holds_a_sample());
        set_reading(true);
    }
}
