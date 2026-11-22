use super::open::OPENED;
use super::parse::HookKind;
use super::picked::{PickRefusal, PickedFile};
use super::*;
use serde_json::{json, Value};
use std::fs;
use std::sync::atomic::{AtomicUsize, Ordering};

const SECRET: &str = "sk-planted-7f3a";

static NEXT: AtomicUsize = AtomicUsize::new(0);

struct Scratch {
    base: PathBuf,
}

impl Scratch {
    fn new() -> Self {
        let base = std::env::temp_dir().join(format!(
            "ontology-atlas-harness-scopes-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::SeqCst)
        ));
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).unwrap();
        Self {
            base: fs::canonicalize(base).unwrap(),
        }
    }

    fn folder(&self, relative: &str) -> PathBuf {
        let path = self.base.join(relative);
        fs::create_dir_all(&path).unwrap();
        path
    }

    fn put(&self, relative: &str, content: impl AsRef<[u8]>) -> PathBuf {
        let path = self.base.join(relative);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, content).unwrap();
        path
    }

    fn host(&self) -> Host {
        Host {
            platform: Platform::current(),
            home: Some(self.folder("home")),
            claude_managed: Some(self.folder("system/managed")),
            codex_system: Some(self.folder("system/etc")),
        }
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.base);
    }
}

fn read(host: &Host, repository: &Path, picked: &[PickedFile]) -> Value {
    serde_json::to_value(read_scopes(host, repository, picked)).unwrap()
}

fn file<'a>(scopes: &'a Value, id: &str) -> &'a Value {
    scopes["files"]
        .as_array()
        .unwrap()
        .iter()
        .find(|file| file["id"] == id)
        .unwrap_or_else(|| panic!("no file {id}"))
}

fn claude_settings_with_planted_values(command: &str) -> String {
    json!({
        "env": { "TOKEN": SECRET },
        "apiKeyHelper": format!("echo {SECRET}"),
        "unknownKey": { "nested": SECRET },
        "statusLine": { "type": "command", "command": SECRET },
        "permissions": {
            "allow": [format!("Bash(curl -H {SECRET})"), "Read"],
            "deny": [format!("Read({SECRET})")],
            "defaultMode": SECRET
        },
        "disableAllHooks": false,
        "hooks": {
            "PreToolUse": [
                {
                    "matcher": "Bash",
                    "extra": SECRET,
                    "hooks": [
                        { "type": "command", "command": command, "timeout": 5, "async": true, "statusMessage": SECRET },
                        { "type": "http", "url": format!("https://hooks.example/{SECRET}"), "headers": { "Authorization": SECRET } },
                        { "type": "prompt", "prompt": SECRET },
                        { "type": "agent", "prompt": SECRET },
                        { "type": "mcp_tool", "server": SECRET, "tool": SECRET }
                    ]
                }
            ],
            (format!("Event{SECRET}")): [ { "hooks": [ { "type": "command", "command": "x" } ] } ]
        }
    })
    .to_string()
}

fn codex_hooks_with_planted_values(command: &str) -> String {
    json!({
        "token": SECRET,
        "hooks": {
            "Stop": [
                {
                    "hooks": [
                        { "type": "command", "command": command },
                        { "type": "http", "url": format!("https://hooks.example/{SECRET}") }
                    ]
                }
            ]
        }
    })
    .to_string()
}

const CODEX_CONFIG_WITH_PLANTED_VALUES: &str = r#"model = "sk-planted-7f3a"
[mcp_servers.git]
env = { TOKEN = "sk-planted-7f3a" }
[hooks.PreToolUse]
command = "sk-planted-7f3a"
[[hooks.Stop.hooks]]
[hooks.state."/Users/a/.codex/hooks.json:PreToolUse:0:0"]
trusted_hash = "sk-planted-7f3a"
[hooks."sk-planted-7f3a"]
[ hooks . 'SessionStart' ] # sk-planted-7f3a
"#;

fn plant_every_scope(scratch: &Scratch) -> (Host, PathBuf, Vec<PickedFile>) {
    let host = scratch.host();
    let repository = scratch.folder("repo");
    scratch.put(
        "home/.claude/settings.json",
        claude_settings_with_planted_values("~/.claude/hooks/user.sh"),
    );
    scratch.put(
        "home/.claude/.credentials.json",
        json!({ "token": SECRET }).to_string(),
    );
    scratch.put(
        "home/.codex/auth.json",
        json!({ "OPENAI_API_KEY": SECRET }).to_string(),
    );
    scratch.put(
        "home/.codex/hooks.json",
        codex_hooks_with_planted_values("user-codex.sh"),
    );
    scratch.put("home/.codex/config.toml", CODEX_CONFIG_WITH_PLANTED_VALUES);
    scratch.put(
        "repo/.claude/settings.json",
        claude_settings_with_planted_values("bash .claude/hooks/project.sh"),
    );
    scratch.put(
        "repo/.claude/settings.local.json",
        claude_settings_with_planted_values("bash local.sh"),
    );
    scratch.put(
        "repo/.codex/hooks.json",
        codex_hooks_with_planted_values("project-codex.sh"),
    );
    scratch.put("repo/.codex/config.toml", CODEX_CONFIG_WITH_PLANTED_VALUES);
    scratch.put("repo/.env", SECRET);
    let managed_relative = scope_locations(host.platform)[3].relative.join("/");
    let system_relative = scope_locations(host.platform)[6].relative.join("/");
    scratch.put(
        &format!("system/managed/{managed_relative}"),
        claude_settings_with_planted_values("managed.sh"),
    );
    scratch.put(
        &format!("system/etc/{system_relative}"),
        codex_hooks_with_planted_values("system.sh"),
    );
    let picked = scratch.put(
        "profiles/work/settings.json",
        claude_settings_with_planted_values("picked.sh"),
    );
    let picked = vec![PickedFile {
        path: picked,
        tool: Tool::ClaudeCode,
    }];
    (host, repository, picked)
}

#[test]
fn the_scope_file_table_matches_the_fixture() {
    let table: Value = serde_json::from_str(include_str!(
        "../../../tests/fixtures/harness-scope-files.json"
    ))
    .unwrap();
    let platforms = [
        ("macos", Platform::Macos),
        ("linux", Platform::Linux),
        ("windows", Platform::Windows),
    ];
    for (name, platform) in platforms {
        let locations = scope_locations(platform);
        let ids: Vec<&str> = locations.iter().map(|location| location.id).collect();
        let fixture_ids: Vec<&str> = table["files"]
            .as_array()
            .unwrap()
            .iter()
            .map(|file| file["id"].as_str().unwrap())
            .collect();
        assert_eq!(ids, fixture_ids, "{name}");
        for (location, row) in locations.iter().zip(table["files"].as_array().unwrap()) {
            assert_eq!(json!(location.tool), row["tool"]);
            assert_eq!(json!(location.scope), row["scope"]);
            let base = match location.base {
                Base::Home if platform == Platform::Windows => "%USERPROFILE%".to_string(),
                Base::Home => "~".to_string(),
                Base::Repository | Base::LocalCheckout => "<repository>".to_string(),
                system => system_base(platform, system, Some("%ProgramData%")).unwrap(),
            };
            assert_eq!(
                display_path(platform, &base, location.relative),
                row["patterns"][name],
                "{name} {}",
                location.id
            );
        }
    }
    for case in table["cases"].as_array().unwrap() {
        let platform = platforms
            .iter()
            .find(|(name, _)| case["platform"] == *name)
            .unwrap()
            .1;
        let repository = case["repository"].as_str().unwrap();
        for location in scope_locations(platform) {
            let base = match location.base {
                Base::Home => case["home"].as_str().unwrap().to_string(),
                Base::Repository => repository.to_string(),
                Base::LocalCheckout => {
                    local_checkout(platform, repository, case["mainCheckout"].as_str()).to_string()
                }
                system => system_base(platform, system, case["programData"].as_str()).unwrap(),
            };
            assert_eq!(
                display_path(platform, &base, location.relative),
                case["paths"][location.id],
                "{} {}",
                case["name"],
                location.id
            );
        }
    }
}

#[test]
fn no_planted_value_leaves_any_reader_result() {
    let scratch = Scratch::new();
    let (host, repository, picked) = plant_every_scope(&scratch);
    OPENED.with(|opened| opened.borrow_mut().clear());

    let scopes = read(&host, &repository, &picked);
    let serialized = scopes.to_string();
    assert!(!serialized.contains(SECRET), "{serialized}");
    assert!(!serialized.contains("hooks.example"));

    for id in [
        "claude-project",
        "claude-local",
        "claude-user",
        "claude-managed",
        "codex-project",
        "codex-user",
        "codex-system",
        "picked-1",
    ] {
        assert_eq!(file(&scopes, id)["status"], "read", "{id}");
    }
    let user = file(&scopes, "claude-user");
    assert_eq!(
        user["permissionCounts"],
        json!({ "allow": 2, "deny": 1, "ask": 0 })
    );
    assert_eq!(user["disableAllHooks"], false);
    assert_eq!(user["allowManagedHooksOnly"], Value::Null);
    let hooks = user["hooks"].as_array().unwrap();
    let kinds: Vec<&str> = hooks
        .iter()
        .map(|hook| hook["kind"].as_str().unwrap())
        .collect();
    assert_eq!(kinds, ["command", "http", "prompt", "agent", "mcp_tool"]);
    assert_eq!(
        hooks[0],
        json!({
            "event": "PreToolUse", "group": 0, "handler": 0, "matcher": "Bash", "kind": "command",
            "command": "~/.claude/hooks/user.sh", "timeoutSeconds": 5.0, "async": true
        })
    );
    assert!(hooks[1..]
        .iter()
        .all(|hook| hook["command"].is_null() && hook["matcher"] == "Bash"));
    assert_eq!(file(&scopes, "picked-1")["picked"], true);
    assert_eq!(file(&scopes, "picked-1")["scope"], "user");
    let inline: Vec<&Value> = scopes["inlineHooks"].as_array().unwrap().iter().collect();
    assert_eq!(inline.len(), 2);
    for config in inline {
        assert_eq!(
            config["events"],
            json!(["PreToolUse", "Stop", "SessionStart"])
        );
    }

    let mut allowed: Vec<PathBuf> = Vec::new();
    for location in scope_locations(host.platform) {
        let base = match location.base {
            Base::Home => host.home.clone().unwrap(),
            Base::Repository | Base::LocalCheckout => repository.clone(),
            Base::ClaudeManaged => host.claude_managed.clone().unwrap(),
            Base::CodexSystem => host.codex_system.clone().unwrap(),
        };
        let mut path = base;
        path.extend(location.relative);
        allowed.push(path);
    }
    allowed.push(picked[0].path.clone());
    OPENED.with(|opened| {
        let opened = opened.borrow();
        assert!(!opened.is_empty());
        for path in opened.iter() {
            assert!(allowed.contains(path), "opened {path:?} outside the table");
        }
    });
}

#[test]
fn a_file_that_is_not_json_returns_its_name_and_nothing_from_it() {
    let scratch = Scratch::new();
    let host = scratch.host();
    let repository = scratch.folder("repo");
    scratch.put(
        "repo/.claude/settings.json",
        format!("{{\"env\": {{\"TOKEN\": \"{SECRET}\"}}, "),
    );
    scratch.put("repo/.codex/hooks.json", format!("[\"{SECRET}\"]"));
    scratch.put(
        "home/.claude/settings.json",
        format!("{{\"hooks\": \"{SECRET}\"}}"),
    );
    let scopes = read(&host, &repository, &[]);
    assert!(!scopes.to_string().contains(SECRET));
    assert_eq!(file(&scopes, "claude-project")["status"], "invalid");
    assert_eq!(file(&scopes, "codex-project")["status"], "invalid");
    assert_eq!(file(&scopes, "claude-user")["status"], "read");
    assert_eq!(file(&scopes, "claude-user")["hooks"], json!([]));
    assert_eq!(file(&scopes, "claude-local")["status"], "missing");
    assert_eq!(file(&scopes, "claude-local")["failure"], Value::Null);
}

#[test]
fn a_file_over_one_mebibyte_is_unreadable() {
    let scratch = Scratch::new();
    let host = scratch.host();
    let repository = scratch.folder("repo");
    let padding = " ".repeat(open::SETTINGS_MAX_BYTES as usize);
    scratch.put("repo/.claude/settings.json", format!("{{}}{padding}"));
    let scopes = read(&host, &repository, &[]);
    assert_eq!(file(&scopes, "claude-project")["status"], "unreadable");
    assert_eq!(file(&scopes, "claude-project")["failure"], "too-large");
}

#[cfg(unix)]
#[test]
fn a_link_anywhere_below_a_base_is_refused() {
    use std::os::unix::fs::symlink;

    let scratch = Scratch::new();
    let host = scratch.host();
    scratch.put(
        "home/.claude/settings.json",
        claude_settings_with_planted_values("user.sh"),
    );
    let repository = scratch.folder("code/repo");
    symlink("../../home/.claude", repository.join(".claude")).unwrap();
    scratch.put("elsewhere/hooks.json", codex_hooks_with_planted_values("x"));
    fs::create_dir_all(repository.join(".codex")).unwrap();
    symlink(
        scratch.base.join("elsewhere/hooks.json"),
        repository.join(".codex/hooks.json"),
    )
    .unwrap();

    let scopes = read(&host, &repository, &[]);
    assert!(!scopes.to_string().contains(SECRET));
    for id in ["claude-project", "claude-local", "codex-project"] {
        assert_eq!(file(&scopes, id)["status"], "unreadable", "{id}");
        assert_eq!(file(&scopes, id)["failure"], "link", "{id}");
        assert_eq!(file(&scopes, id)["hooks"], json!([]), "{id}");
    }
    assert_eq!(file(&scopes, "claude-user")["status"], "read");

    let home = scratch.base.join("home");
    fs::rename(home.join(".claude"), scratch.base.join("real-claude")).unwrap();
    symlink(scratch.base.join("real-claude"), home.join(".claude")).unwrap();
    let scopes = read(&host, &repository, &[]);
    assert_eq!(file(&scopes, "claude-user")["failure"], "link");
}

#[test]
fn a_picked_file_is_held_only_by_its_name_outside_any_other_repository() {
    let scratch = Scratch::new();
    let mut held = Vec::new();
    let refusal = |outcome: PickOutcome| match outcome {
        PickOutcome::Refused { reason, .. } => Some(reason),
        _ => None,
    };

    let other_name = scratch.put("profiles/a/config.json", "{}");
    assert_eq!(
        refusal(hold_picked(&mut held, &other_name, &[])),
        Some(PickRefusal::Name)
    );
    let folder = scratch.folder("profiles/b/settings.json");
    assert_eq!(
        refusal(hold_picked(&mut held, &folder, &[])),
        Some(PickRefusal::NotAFile)
    );

    scratch.folder("other-repo/.git");
    let in_repository = scratch.put("other-repo/config/settings.json", "{}");
    let outcome = hold_picked(&mut held, &in_repository, &[]);
    assert_eq!(
        serde_json::to_value(&outcome).unwrap(),
        json!({
            "outcome": "refused", "reason": "in-repository",
            "path": in_repository.to_string_lossy(),
            "repository": scratch.base.join("other-repo").to_string_lossy()
        })
    );
    let own = scratch.put("other-repo/.claude/settings.json", "{}");
    assert!(matches!(
        hold_picked(&mut held, &own, &[]),
        PickOutcome::Held { ref id, .. } if id == "picked-1"
    ));
    let codex = scratch.put("profiles/c/hooks.json", "{}");
    assert!(matches!(
        hold_picked(&mut held, &codex, &[]),
        PickOutcome::Held { ref id, .. } if id == "picked-2"
    ));
    assert_eq!(held[1].tool, Tool::Codex);
    assert!(matches!(
        hold_picked(&mut held, &codex, &[]),
        PickOutcome::AlreadyListed { .. }
    ));
    let user = scratch.put("home/.claude/settings.json", "{}");
    assert!(matches!(
        hold_picked(&mut held, &user, std::slice::from_ref(&user)),
        PickOutcome::AlreadyListed { .. }
    ));
    assert_eq!(held.len(), 2);

    #[cfg(unix)]
    {
        let link = scratch.base.join("profiles/link/settings.json");
        fs::create_dir_all(link.parent().unwrap()).unwrap();
        std::os::unix::fs::symlink(&codex, &link).unwrap();
        assert_eq!(
            refusal(hold_picked(&mut held, &link, &[])),
            Some(PickRefusal::Link)
        );
    }
}

fn git_available() -> bool {
    std::process::Command::new("git")
        .arg("--version")
        .output()
        .is_ok_and(|output| output.status.success())
}

fn run_git(cwd: &Path, args: &[&str]) {
    let status = std::process::Command::new("git")
        .args([
            "-c",
            "user.name=atlas",
            "-c",
            "user.email=atlas@example.invalid",
        ])
        .args([
            "-c",
            "init.defaultBranch=main",
            "-c",
            "core.hooksPath=/dev/null",
        ])
        .args(args)
        .current_dir(cwd)
        .output()
        .unwrap();
    assert!(status.status.success(), "git {args:?}");
}

#[test]
fn a_linked_worktree_reads_the_local_file_the_vendor_rule_names() {
    if !git_available() {
        return;
    }
    let scratch = Scratch::new();
    let host = scratch.host();
    let main = scratch.folder("main");
    run_git(&main, &["init", "-q"]);
    run_git(&main, &["commit", "-q", "--allow-empty", "-m", "first"]);
    run_git(&main, &["worktree", "add", "-q", "../feature"]);
    let worktree = fs::canonicalize(scratch.base.join("feature")).unwrap();
    scratch.put(
        "main/.claude/settings.local.json",
        claude_settings_with_planted_values("main-local.sh"),
    );
    scratch.put(
        "feature/.claude/settings.local.json",
        claude_settings_with_planted_values("worktree-local.sh"),
    );

    let scopes = read(&host, &worktree, &[]);
    let local = file(&scopes, "claude-local");
    let separator = std::path::MAIN_SEPARATOR;
    let worktree_local = format!(
        "{}{separator}.claude{separator}settings.local.json",
        worktree.to_string_lossy()
    );
    assert_eq!(scopes["worktree"]["linked"], true);
    if host.platform == Platform::Windows {
        assert_eq!(local["path"], worktree_local.as_str());
        assert_eq!(scopes["worktree"]["unusedLocalFile"], Value::Null);
    } else {
        assert_eq!(local["hooks"][0]["command"], "main-local.sh");
        assert_eq!(
            scopes["worktree"]["unusedLocalFile"],
            worktree_local.as_str()
        );
    }
    // `ignored` here also depends on the machine's global excludes file, so only after .gitignore.
    assert_eq!(scopes["localFileGit"]["tracked"], false);

    scratch.put("main/.gitignore", ".claude/settings.local.json\n");
    let main_scopes = read(&host, &fs::canonicalize(&main).unwrap(), &[]);
    assert_eq!(main_scopes["worktree"]["linked"], false);
    assert_eq!(main_scopes["localFileGit"]["ignored"], true);
    run_git(&main, &["add", "-f", ".claude/settings.local.json"]);
    let main_scopes = read(&host, &fs::canonicalize(&main).unwrap(), &[]);
    assert_eq!(
        main_scopes["localFileGit"],
        json!({ "tracked": true, "ignored": true })
    );
}

#[test]
fn a_folder_outside_git_has_no_git_facts() {
    let scratch = Scratch::new();
    let repository = scratch.folder("plain");
    let scopes = read(&scratch.host(), &repository, &[]);
    assert_eq!(
        scopes["worktree"],
        json!({ "linked": false, "unusedLocalFile": null })
    );
    assert_eq!(scopes["localFileGit"], Value::Null);
}

#[test]
fn the_parser_keeps_positions_and_skips_values_of_the_wrong_type() {
    let parsed = parse::parse_claude_settings(
        br#"{"hooks":{"Stop":[7,{"matcher":3,"hooks":["x",{"type":"command","command":"a","timeout":"5","async":"yes"}]}],"SessionStart":"x"},"disableAllHooks":"no","permissions":{"allow":"Bash"}}"#,
    )
    .unwrap();
    assert_eq!(parsed.disable_all_hooks, None);
    assert_eq!(parsed.permission_counts, Some(Default::default()));
    assert_eq!(
        parsed.hooks,
        vec![parse::ScopeHook {
            event: "Stop".into(),
            group: 1,
            handler: 1,
            matcher: None,
            kind: HookKind::Command,
            command: Some("a".into()),
            timeout_seconds: None,
            run_async: None,
        }]
    );
    assert!(parse::parse_claude_settings(b"\xEF\xBB\xBF{}").is_some());
    assert!(parse::parse_claude_settings(b"[]").is_none());
    assert!(parse::parse_codex_hooks(b"{\"hooks\":{}} trailing").is_none());
}

#[test]
fn a_binding_failure_carries_no_file_content() {
    let error = read_harness_scopes("/nonexistent-vault".into(), "project".into()).unwrap_err();
    assert!(!error.contains(SECRET));
}

#[cfg(windows)]
#[test]
fn the_windows_host_reads_the_documented_system_folders() {
    let host = Host::current();
    assert_eq!(host.platform, Platform::Windows);
    assert_eq!(
        host.claude_managed,
        Some(PathBuf::from("C:\\Program Files"))
    );
    assert!(host.codex_system.is_some());
    assert!(host.home.is_some());
}
