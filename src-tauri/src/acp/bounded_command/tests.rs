use super::*;

/// Uses `node`, which every platform building this repo has; missing `/bin/echo`
/// on Windows made a spawn failure look like a working timeout.
fn node_command(script: &str) -> std::process::Command {
    let mut cmd = std::process::Command::new("node");
    cmd.args(["-e", script]);
    cmd
}

#[test]
fn bounded_output_returns_stdout_when_the_command_finishes() {
    let out = bounded_output(
        node_command("process.stdout.write('hello')"),
        std::time::Duration::from_secs(20),
    );
    assert_eq!(out.as_deref().map(str::trim), Some("hello"));
}

#[test]
fn bounded_output_returns_none_when_the_program_does_not_exist() {
    // A spawn failure and a timeout both yield `None`, so this must not pass by accident.
    let cmd = std::process::Command::new("oatlas-no-such-program-anywhere");
    assert!(bounded_output(cmd, std::time::Duration::from_secs(5)).is_none());
}

#[test]
fn bounded_success_separates_a_failed_command_from_a_silent_one() {
    // The keychain write prints nothing on success; a non-zero exit with empty output is not done.
    assert!(bounded_success(
        node_command("process.exit(0)"),
        std::time::Duration::from_secs(20),
    ));
    assert!(!bounded_success(
        node_command("process.exit(1)"),
        std::time::Duration::from_secs(20),
    ));
    assert_eq!(
        bounded_output(
            node_command("process.exit(1)"),
            std::time::Duration::from_secs(20),
        )
        .as_deref(),
        Some(""),
        "stdout alone cannot tell the two apart — which is why the status is read"
    );
}

#[test]
fn bounded_success_is_false_when_the_program_does_not_exist() {
    let cmd = std::process::Command::new("oatlas-no-such-program-anywhere");
    assert!(!bounded_success(cmd, std::time::Duration::from_secs(5)));
}

#[test]
fn bounded_output_kills_a_command_that_never_finishes() {
    // A broken bound costs 30 seconds and fails on wall-clock time too.
    let started = std::time::Instant::now();
    let out = bounded_output(
        node_command("setTimeout(() => {}, 30000)"),
        std::time::Duration::from_millis(400),
    );
    assert!(out.is_none(), "a command that never ends returned a value");
    assert!(
        started.elapsed() < std::time::Duration::from_secs(15),
        "the timeout did not apply: {:?}",
        started.elapsed()
    );
}
