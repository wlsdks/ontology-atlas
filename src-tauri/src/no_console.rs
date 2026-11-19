//! A Windows GUI app's console children open a console window of their own,
//! one flash per curl, git or node call. Every spawn goes through
//! `hide_console`; elsewhere it does nothing.

use std::process::Command;

/// `CREATE_NO_WINDOW`: the child runs without a console window.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub(crate) fn hide_console(command: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

#[cfg(test)]
mod tests {
    use super::hide_console;
    use std::path::Path;
    use std::process::Command;

    /// Programs that never start on Windows (macOS or Linux only) or that are
    /// GUI programs with no console to hide.
    const NOT_A_WINDOWS_CONSOLE: &[&str] = &[
        "\"security\"",
        "\"defaults\"",
        "\"open\"",
        "\"/usr/bin/open\"",
        "\"/usr/bin/tar\"",
        "\"/usr/bin/curl\"",
        "\"xdg-open\"",
        "\"rundll32.exe\"",
    ];

    /// How far below `Command::new` the helper may be applied: the builder
    /// chain of one spawn, not the next function.
    const WINDOW: usize = 14;

    fn is_test_file(path: &Path) -> bool {
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        name == "tests.rs" || name.ends_with("_tests.rs") || name == "test_support.rs"
    }

    fn unhidden_spawns(dir: &Path, found: &mut Vec<String>) {
        for entry in std::fs::read_dir(dir).unwrap() {
            let path = entry.unwrap().path();
            if path.is_dir() {
                unhidden_spawns(&path, found);
                continue;
            }
            if path.extension().and_then(|e| e.to_str()) != Some("rs") || is_test_file(&path) {
                continue;
            }
            let source = std::fs::read_to_string(&path).unwrap();
            let all: Vec<&str> = source.lines().collect();
            // Production code ends where an inline test module begins.
            let end = all
                .windows(2)
                .position(|pair| {
                    pair[0].trim() == "#[cfg(test)]"
                        && pair[1].trim_start().starts_with("mod ")
                        && pair[1].trim_end().ends_with('{')
                })
                .unwrap_or(all.len());
            let lines = &all[..end];
            for (at, line) in lines.iter().enumerate() {
                let Some(start) = line.find("Command::new(") else {
                    continue;
                };
                let rest = &line[start..];
                if NOT_A_WINDOWS_CONSOLE.iter().any(|name| rest.contains(name)) {
                    continue;
                }
                let end = (at + WINDOW).min(lines.len());
                if !lines[at..end].iter().any(|l| l.contains("hide_console(")) {
                    found.push(format!("{}:{}", path.display(), at + 1));
                }
            }
        }
    }

    #[test]
    fn every_spawn_that_can_run_on_windows_hides_its_console() {
        let src = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
        let mut found = Vec::new();
        unhidden_spawns(&src, &mut found);
        assert!(
            found.is_empty(),
            "call no_console::hide_console on these commands: {found:?}"
        );
    }

    #[test]
    fn a_hidden_child_still_runs_and_reports_its_output() {
        #[cfg(windows)]
        let mut command = {
            let mut c = Command::new("cmd");
            c.args(["/C", "echo hidden"]);
            c
        };
        #[cfg(not(windows))]
        let mut command = {
            let mut c = Command::new("sh");
            c.args(["-c", "echo hidden"]);
            c
        };
        let output = hide_console(&mut command).output().unwrap();
        assert!(output.status.success());
        assert_eq!(String::from_utf8_lossy(&output.stdout).trim(), "hidden");
    }
}
