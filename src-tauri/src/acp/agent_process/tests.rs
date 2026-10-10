use super::*;

#[test]
fn bounded_line_reader_splits_lines_and_tolerates_crlf() {
    let mut input = std::io::BufReader::new(&b"{\"a\":1}\n{\"b\":2}\r\n"[..]);
    assert_eq!(
        read_bounded_line(&mut input, 1024).unwrap().as_deref(),
        Some(&b"{\"a\":1}"[..])
    );
    assert_eq!(
        read_bounded_line(&mut input, 1024).unwrap().as_deref(),
        Some(&b"{\"b\":2}"[..])
    );
    assert_eq!(read_bounded_line(&mut input, 1024).unwrap(), None);
}

#[test]
fn bounded_line_reader_refuses_an_endless_line_instead_of_eating_memory() {
    let flood = vec![b'x'; 4096];
    let mut input = std::io::BufReader::new(&flood[..]);
    let err = read_bounded_line(&mut input, 64).unwrap_err();
    assert_eq!(err.kind(), std::io::ErrorKind::InvalidData);
}

#[test]
fn bounded_line_reader_drops_the_oversized_line_and_keeps_reading() {
    // A truncated line would feed half a JSON to the parser; drop only that line.
    let mut data = vec![b'x'; 200];
    data.push(b'\n');
    data.extend_from_slice(b"{\"ok\":true}\n");
    let mut input = std::io::BufReader::new(&data[..]);
    assert!(read_bounded_line(&mut input, 64).is_err());
    assert_eq!(
        read_bounded_line(&mut input, 64).unwrap().as_deref(),
        Some(&b"{\"ok\":true}"[..]),
        "one oversized line must not kill the session"
    );
}

#[test]
fn bounded_line_reader_drops_the_whole_oversized_line_across_buffer_refills() {
    let data = b"{\"a\":\"0123456789\"}\n{\"ok\":1}\n";
    let mut input = std::io::BufReader::with_capacity(8, &data[..]);
    assert!(read_bounded_line(&mut input, 10).is_err());
    assert_eq!(
        read_bounded_line(&mut input, 10).unwrap().as_deref(),
        Some(&b"{\"ok\":1}"[..]),
        "the tail of the dropped line must not come back as a line of its own"
    );
    assert_eq!(read_bounded_line(&mut input, 10).unwrap(), None);
}

/// Reaping is asynchronous.
#[cfg(unix)]
fn wait_until_gone(pid: u32, within: std::time::Duration) -> bool {
    let deadline = std::time::Instant::now() + within;
    while std::time::Instant::now() < deadline {
        if !process_is_running(pid) {
            return true;
        }
        std::thread::sleep(std::time::Duration::from_millis(25));
    }
    !process_is_running(pid)
}

#[cfg(unix)]
#[test]
fn terminate_tree_reaps_grandchildren_that_a_naive_kill_would_orphan() {
    use std::io::{BufRead, BufReader};
    use std::os::unix::process::CommandExt;
    use std::process::{Command, Stdio};

    // sh backgrounds a sleep, reports its pid, then sleeps itself.
    let spawn_tree = || {
        let mut child = Command::new("/bin/sh")
            .arg("-c")
            .arg("sleep 30 & echo $!; sleep 30")
            .stdout(Stdio::piped())
            .process_group(0)
            .spawn()
            .expect("failed to spawn sh");
        let mut out = BufReader::new(child.stdout.take().unwrap());
        let mut line = String::new();
        out.read_line(&mut line).unwrap();
        let grandchild: u32 = line
            .trim()
            .parse()
            .expect("failed to read the grandchild pid");
        (child, grandchild)
    };

    {
        let (mut child, grandchild) = spawn_tree();
        assert!(process_is_running(grandchild));
        child.kill().unwrap();
        let _ = child.wait();
        assert!(
            process_is_running(grandchild),
            "precondition broken: a plain kill also killed the grandchild, \
             so this platform needs no tree cleanup"
        );
        let _ = terminate_tree(grandchild);
    }

    let (mut child, grandchild) = spawn_tree();
    assert!(process_is_running(grandchild));
    let leader_pid = child.id();
    // A separate thread reaps the leader as in the app; reaping afterwards tests an
    // EPERM state the app never has.
    let reaper = std::thread::spawn(move || child.wait());
    terminate_tree(leader_pid).expect("failed to terminate the tree");
    let _ = reaper.join();
    assert!(
        wait_until_gone(grandchild, std::time::Duration::from_secs(3)),
        "grandchild {grandchild} survived and would outlive the app"
    );
}

/// The app's wait thread can reap the leader right after SIGTERM, so a
/// TERM-ignoring grandchild must still escalate to a kill.
#[cfg(unix)]
#[test]
fn terminate_tree_escalates_after_the_group_leader_is_reaped() {
    use std::io::{BufRead, BufReader};
    use std::os::unix::process::CommandExt;
    use std::process::{Command, Stdio};

    let mut leader = Command::new("/bin/sh")
        .arg("-c")
        // The outer sh keeps default TERM, so a group TERM ends only the leader first.
        .arg("/bin/sh -c 'trap \"\" TERM; echo $$; while :; do sleep 1; done' & wait")
        .stdout(Stdio::piped())
        .process_group(0)
        .spawn()
        .expect("failed to spawn the test process group");
    let leader_pid = leader.id();
    let mut out = BufReader::new(leader.stdout.take().unwrap());
    let mut line = String::new();
    out.read_line(&mut line).unwrap();
    let grandchild: u32 = line
        .trim()
        .parse()
        .expect("failed to read the TERM-ignoring grandchild pid");
    assert_eq!(
        unsafe { libc::getpgid(grandchild as i32) },
        leader_pid as i32,
        "the grandchild must stay in the leader process group"
    );

    assert_eq!(
        unsafe { libc::kill(-(leader_pid as i32), libc::SIGTERM) },
        0
    );
    let _ = leader.wait();
    assert!(
        process_is_running(grandchild),
        "the grandchild did not ignore TERM, so the early-return case was not set up"
    );

    let result = terminate_tree(leader_pid);
    let gone_before_cleanup =
        wait_until_gone(grandchild, std::time::Duration::from_millis(250));
    // Clean up the whole group before failing, so a red run leaves no processes.
    if !gone_before_cleanup {
        unsafe {
            libc::kill(-(leader_pid as i32), libc::SIGKILL);
        }
        let _ = wait_until_gone(grandchild, std::time::Duration::from_secs(3));
    }

    result.expect("failed to terminate the remaining process group");
    assert!(
        gone_before_cleanup,
        "returned when the leader exited and left TERM-ignoring grandchild {grandchild}"
    );
}

/// Otherwise app shutdown would show errors for nothing the user did.
#[cfg(unix)]
#[test]
fn terminating_an_already_dead_process_is_not_an_error() {
    use std::process::{Command, Stdio};
    let mut child = Command::new("/bin/sh")
        .arg("-c")
        .arg("exit 0")
        .stdout(Stdio::null())
        .spawn()
        .unwrap();
    let pid = child.id();
    let _ = child.wait();
    assert!(terminate_tree(pid).is_ok());
}
