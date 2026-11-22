use super::*;
#[cfg(windows)]
use crate::llm_audit::log_file::open_audit_file;

#[cfg(windows)]
fn ok_outcome() -> AuditOutcome {
    AuditOutcome {
        outcome: "ok".into(),
        http_status: Some(200),
        response_chars: 1,
        duration_ms: 1,
    }
}

/// `reserve` canonicalizes the vault first, so a junction above the log can only
/// appear after that, in a race. Opening through a path that still holds one
/// stands in for that moment: only the final-path check can tell.
#[cfg(windows)]
#[test]
fn windows_refuses_a_log_reached_through_an_ancestor_junction() {
    let parent = fs::canonicalize(temp_vault("win-ancestor")).unwrap();
    let real = parent.join("real");
    fs::create_dir(&real).unwrap();
    let through = parent.join("through");
    let made = std::process::Command::new("cmd")
        .args(["/C", "mklink", "/J"])
        .arg(&through)
        .arg(&real)
        .output()
        .unwrap();
    assert!(made.status.success(), "{made:?}");

    let message = open_audit_file(&through)
        .map(|_| ())
        .expect_err("a junction above the log must be refused");
    assert!(message.contains("audit-log-tampered"), "{message}");
    assert!(
        message.contains("resolves outside"),
        "the final-path check refuses it: {message}"
    );
    let leaked = fs::read(real.join(SIDECAR_DIR).join(AUDIT_FILE)).unwrap_or_default();
    assert!(leaked.is_empty(), "no audit bytes may be written");
    assert!(
        open_audit_file(&real).is_ok(),
        "the same folder by its real path opens"
    );

    fs::remove_dir(&through).ok();
    fs::remove_dir_all(&parent).ok();
}

#[cfg(windows)]
#[test]
fn windows_refuses_a_junctioned_sidecar_without_writing_through_it() {
    let vault = temp_vault("win-junction");
    let outside = temp_vault("win-junction-target");
    let made = std::process::Command::new("cmd")
        .args(["/C", "mklink", "/J"])
        .arg(vault.join(SIDECAR_DIR))
        .arg(&outside)
        .output()
        .unwrap();
    assert!(made.status.success(), "{made:?}");

    let result = reserve(&vault, verify_draft());

    assert!(result.is_err(), "a junction must be refused");
    let leaked = fs::read(outside.join(AUDIT_FILE)).unwrap_or_default();
    assert!(
        leaked.is_empty(),
        "no audit bytes may land outside the vault"
    );
    fs::remove_dir(vault.join(SIDECAR_DIR)).ok();
    fs::remove_dir_all(&vault).ok();
    fs::remove_dir_all(&outside).ok();
}

/// Reserves against a vault whose log or sidecar is a link into `outside`,
/// then proves the refusal names tampering and nothing was written there.
#[cfg(windows)]
fn assert_link_refused(vault: &Path, outside: &Path) {
    let message = reserve(vault, verify_draft()).expect_err("a reparse point must be refused");
    assert!(message.contains("audit-log-tampered"), "{message}");
    let sentinel = outside.join(AUDIT_FILE);
    assert_eq!(fs::read(&sentinel).unwrap(), b"outside-sentinel\n");
}

#[cfg(windows)]
fn outside_with_sentinel(tag: &str) -> PathBuf {
    let outside = temp_vault(tag);
    fs::write(outside.join(AUDIT_FILE), b"outside-sentinel\n").unwrap();
    outside
}

#[cfg(windows)]
#[test]
fn windows_refuses_a_symlinked_log_without_touching_its_target() {
    let vault = temp_vault("win-log-symlink");
    let outside = outside_with_sentinel("win-log-symlink-target");
    fs::create_dir_all(vault.join(SIDECAR_DIR)).unwrap();
    std::os::windows::fs::symlink_file(outside.join(AUDIT_FILE), audit_log_path(&vault))
        .expect("hosted Windows runners may create symlinks");

    assert_link_refused(&vault, &outside);
    fs::remove_dir_all(&vault).ok();
    fs::remove_dir_all(&outside).ok();
}

#[cfg(windows)]
#[test]
fn windows_refuses_a_junction_in_place_of_the_log() {
    let vault = temp_vault("win-log-junction");
    let outside = outside_with_sentinel("win-log-junction-target");
    fs::create_dir_all(vault.join(SIDECAR_DIR)).unwrap();
    let made = std::process::Command::new("cmd")
        .args(["/C", "mklink", "/J"])
        .arg(audit_log_path(&vault))
        .arg(&outside)
        .output()
        .unwrap();
    assert!(made.status.success(), "{made:?}");

    assert_link_refused(&vault, &outside);
    fs::remove_dir(audit_log_path(&vault)).ok();
    fs::remove_dir_all(&vault).ok();
    fs::remove_dir_all(&outside).ok();
}

#[cfg(windows)]
#[test]
fn windows_refuses_a_symlinked_sidecar_without_touching_its_target() {
    let vault = temp_vault("win-sidecar-symlink");
    let outside = outside_with_sentinel("win-sidecar-symlink-target");
    std::os::windows::fs::symlink_dir(&outside, vault.join(SIDECAR_DIR))
        .expect("hosted Windows runners may create symlinks");

    assert_link_refused(&vault, &outside);
    fs::remove_dir(vault.join(SIDECAR_DIR)).ok();
    fs::remove_dir_all(&vault).ok();
    fs::remove_dir_all(&outside).ok();
}

#[cfg(windows)]
#[test]
fn windows_keeps_the_held_log_in_place_or_refuses_to_finalize() {
    let vault = temp_vault("win-swap");
    let reservation = reserve(&vault, verify_draft()).unwrap();
    let renamed_log = fs::rename(audit_log_path(&vault), vault.join("moved.jsonl"));
    assert!(renamed_log.is_err(), "the held log must not be renamable");
    let moved_sidecar = fs::rename(vault.join(SIDECAR_DIR), vault.join("moved-sidecar"));

    let result = finalize(reservation, &ok_outcome());

    if moved_sidecar.is_ok() {
        assert!(
            result.is_err(),
            "a moved log must not be finalized as if in place"
        );
    } else {
        result.unwrap();
    }
    fs::remove_dir_all(&vault).ok();
}

#[cfg(windows)]
#[test]
fn windows_reading_the_log_is_not_blocked_by_a_held_reservation() {
    let vault = temp_vault("win-read");
    let first = reserve(&vault, verify_draft()).unwrap();
    finalize(first, &ok_outcome()).unwrap();
    let held = reserve(&vault, verify_draft()).unwrap();
    let read = fs::read_to_string(audit_log_path(&vault)).unwrap();
    assert_eq!(read.lines().count(), 2);
    finalize(held, &ok_outcome()).unwrap();
    fs::remove_dir_all(&vault).ok();
}

#[cfg(unix)]
#[test]
fn reserve_refuses_a_symlinked_sidecar_without_touching_its_target() {
    use std::os::unix::fs::symlink;

    let vault = temp_vault("sidecar-symlink");
    let outside = temp_vault("sidecar-symlink-target");
    let outside_log = outside.join(AUDIT_FILE);
    fs::write(&outside_log, b"outside-sentinel\n").unwrap();
    symlink(&outside, vault.join(SIDECAR_DIR)).unwrap();

    let result = reserve(&vault, verify_draft());
    let outside_after = fs::read(&outside_log).unwrap();

    fs::remove_file(vault.join(SIDECAR_DIR)).ok();
    fs::remove_dir_all(&vault).ok();
    fs::remove_dir_all(&outside).ok();
    assert!(result.is_err(), "must not follow a sidecar link");
    assert_eq!(outside_after, b"outside-sentinel\n");
}

#[cfg(unix)]
#[test]
fn reserve_refuses_a_symlinked_log_without_touching_its_target() {
    use std::os::unix::fs::symlink;

    let vault = temp_vault("log-symlink");
    let outside = temp_vault("log-symlink-target");
    fs::create_dir(vault.join(SIDECAR_DIR)).unwrap();
    let outside_log = outside.join("sentinel.jsonl");
    fs::write(&outside_log, b"outside-sentinel\n").unwrap();
    symlink(&outside_log, audit_log_path(&vault)).unwrap();

    let result = reserve(&vault, verify_draft());
    let outside_after = fs::read(&outside_log).unwrap();

    fs::remove_file(audit_log_path(&vault)).ok();
    fs::remove_dir_all(&vault).ok();
    fs::remove_dir_all(&outside).ok();
    assert!(result.is_err(), "must not follow a log link");
    assert_eq!(outside_after, b"outside-sentinel\n");
}

#[cfg(any(unix, windows))]
#[test]
fn reserve_refuses_a_hard_linked_log_without_touching_its_target() {
    let vault = temp_vault("log-hardlink");
    let outside = temp_vault("log-hardlink-target");
    fs::create_dir(vault.join(SIDECAR_DIR)).unwrap();
    let outside_log = outside.join("sentinel.jsonl");
    fs::write(&outside_log, b"outside-sentinel\n").unwrap();
    fs::hard_link(&outside_log, audit_log_path(&vault)).unwrap();

    let result = reserve(&vault, verify_draft());
    let outside_after = fs::read(&outside_log).unwrap();

    fs::remove_file(audit_log_path(&vault)).ok();
    fs::remove_dir_all(&vault).ok();
    fs::remove_dir_all(&outside).ok();
    assert!(
        result.is_err(),
        "must not write a hard link as the audit file"
    );
    assert_eq!(outside_after, b"outside-sentinel\n");
}

#[cfg(unix)]
#[test]
fn reserve_restricts_an_existing_audit_file_to_owner_only() {
    use std::os::unix::fs::{MetadataExt, PermissionsExt};

    let vault = temp_vault("existing-permissions");
    fs::create_dir(vault.join(SIDECAR_DIR)).unwrap();
    let path = audit_log_path(&vault);
    fs::write(&path, b"").unwrap();
    fs::set_permissions(&path, fs::Permissions::from_mode(0o644)).unwrap();

    let reservation = reserve(&vault, verify_draft()).unwrap();
    let mode = fs::metadata(&path).unwrap().mode() & 0o777;
    drop(reservation);

    fs::remove_dir_all(&vault).ok();
    assert_eq!(
        mode, 0o600,
        "audit questions must not be readable by other accounts"
    );
}

#[cfg(unix)]
#[test]
fn finalize_refuses_a_replaced_log_path_without_touching_its_target() {
    use std::os::unix::fs::symlink;

    let vault = temp_vault("finalize-symlink");
    let outside = temp_vault("finalize-symlink-target");
    let reservation = reserve(&vault, verify_draft()).unwrap();
    fs::remove_file(audit_log_path(&vault)).unwrap();
    let outside_log = outside.join("sentinel.jsonl");
    fs::write(&outside_log, b"outside-sentinel\n").unwrap();
    symlink(&outside_log, audit_log_path(&vault)).unwrap();

    let result = finalize(
        reservation,
        &AuditOutcome {
            outcome: "ok".into(),
            http_status: Some(200),
            response_chars: 42,
            duration_ms: 640,
        },
    );
    let outside_after = fs::read(&outside_log).unwrap();

    fs::remove_file(audit_log_path(&vault)).ok();
    fs::remove_dir_all(&vault).ok();
    fs::remove_dir_all(&outside).ok();
    assert!(
        result.is_err(),
        "must not follow a log path replaced after reservation"
    );
    assert_eq!(outside_after, b"outside-sentinel\n");
}

#[cfg(unix)]
#[test]
fn reserve_refuses_a_fifo_without_waiting_for_a_reader() {
    use std::ffi::CString;
    use std::os::unix::ffi::OsStrExt;
    use std::sync::mpsc;
    use std::time::Duration;

    let vault = temp_vault("fifo-no-reader");
    fs::create_dir(vault.join(SIDECAR_DIR)).unwrap();
    let path = audit_log_path(&vault);
    let path_c = CString::new(path.as_os_str().as_bytes()).unwrap();
    assert_eq!(unsafe { libc::mkfifo(path_c.as_ptr(), 0o600) }, 0);

    let (tx, rx) = mpsc::channel();
    let thread_vault = vault.clone();
    std::thread::spawn(move || {
        tx.send(reserve(&thread_vault, verify_draft()).map(|_| ()))
            .ok();
    });
    let result = rx
        .recv_timeout(Duration::from_secs(1))
        .expect("opening a FIFO as the audit file must not wait for a reader");

    fs::remove_file(&path).ok();
    fs::remove_dir_all(&vault).ok();
    assert!(result.is_err(), "a FIFO cannot be the audit file");
}

#[cfg(unix)]
#[test]
fn reserve_rejects_a_fifo_before_writing_audit_data() {
    use std::ffi::CString;
    use std::os::fd::{FromRawFd, RawFd};
    use std::os::unix::ffi::OsStrExt;

    let vault = temp_vault("fifo-reader");
    fs::create_dir(vault.join(SIDECAR_DIR)).unwrap();
    let path = audit_log_path(&vault);
    let path_c = CString::new(path.as_os_str().as_bytes()).unwrap();
    assert_eq!(unsafe { libc::mkfifo(path_c.as_ptr(), 0o600) }, 0);
    let reader_fd: RawFd = unsafe {
        libc::open(
            path_c.as_ptr(),
            libc::O_RDONLY | libc::O_NONBLOCK | libc::O_CLOEXEC,
        )
    };
    assert!(reader_fd >= 0);
    let mut reader = unsafe { fs::File::from_raw_fd(reader_fd) };

    let result = reserve(&vault, verify_draft());
    let mut leaked = Vec::new();
    // A parallel test's child between fork and exec can hold an inherited copy of
    // reserve's O_RDWR fd (the same inheritance the flock retry absorbs), so the
    // kernel may still see a writer and answer EAGAIN instead of EOF. Both mean
    // the FIFO is empty; bytes read before the error stay in `leaked`.
    match reader.read_to_end(&mut leaked) {
        Ok(_) => {}
        Err(err) if err.kind() == std::io::ErrorKind::WouldBlock => {}
        Err(err) => panic!("reading the FIFO failed: {err}"),
    }

    fs::remove_file(&path).ok();
    fs::remove_dir_all(&vault).ok();
    assert!(result.is_err(), "a FIFO cannot be the audit file");
    assert!(
        leaked.is_empty(),
        "must not write audit data before the regular-file check"
    );
}
