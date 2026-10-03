use super::*;
#[test]
fn admission_is_atomic_and_retiring_work_keeps_its_slot() {
    let registry = Arc::new(Registry::default());
    let now = Instant::now();
    let ids: Vec<_> = (0..MAX_READERS)
        .map(|i| registry.prepare(&i.to_string(), now).unwrap())
        .collect();
    assert!(registry.prepare("overflow", now).is_err());
    let op = registry.take("0", &ids[0], now).unwrap();
    registry.cancel(Some("0"), Some(&ids[0]));
    assert!(registry.prepare("overflow", now).is_err());
    assert!(op.valid(now).is_err());
    drop(op);
    assert!(registry.prepare("overflow", now).is_ok());
    assert!(registry.take("wrong", &ids[1], now).is_err());
    assert!(registry.take("1", &ids[1], now).is_ok());
}
#[test]
fn idle_and_total_expiry_reclaim_capacity_without_sleep() {
    let registry = Arc::new(Registry::default());
    let now = Instant::now();
    let id = registry.prepare("a", now).unwrap();
    registry.expire(now + IDLE);
    assert!(registry.take("a", &id, now + IDLE).is_err());
    let id = registry.prepare("a", now).unwrap();
    registry
        .0
        .lock()
        .unwrap()
        .entries
        .get_mut(&id)
        .unwrap()
        .touched = now + LIFETIME - Duration::from_secs(1);
    registry.expire(now + LIFETIME);
    assert!(registry.0.lock().unwrap().entries.is_empty());
}
#[test]
fn concurrent_begins_never_exceed_the_aggregate_cap() {
    let registry = Arc::new(Registry::default());
    let barrier = Arc::new(std::sync::Barrier::new(16));
    let threads: Vec<_> = (0..16)
        .map(|i| {
            let registry = registry.clone();
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                barrier.wait();
                registry.prepare(&i.to_string(), Instant::now()).is_ok()
            })
        })
        .collect();
    let admitted = threads
        .into_iter()
        .map(|thread| thread.join().unwrap())
        .filter(|admitted| *admitted)
        .count();
    assert_eq!(admitted, MAX_READERS);
    registry.cancel(None, None);
    assert!(registry.0.lock().unwrap().entries.is_empty());
}
#[cfg(unix)]
#[test]
fn generation_rejects_same_size_edits_and_replacement() {
    let path = std::env::temp_dir().join(format!("atlas-audit-generation-{}", std::process::id()));
    fs::write(&path, b"before").unwrap();
    let file = fs::File::open(&path).unwrap();
    let before = stamp(&file.metadata().unwrap()).unwrap();
    fs::write(&path, b"after!").unwrap();
    assert_ne!(before, stamp(&file.metadata().unwrap()).unwrap());
    fs::remove_file(&path).unwrap();
    fs::write(&path, b"before").unwrap();
    assert_ne!(before, stamp(&fs::metadata(&path).unwrap()).unwrap());
    fs::remove_file(path).unwrap();
}

#[cfg(unix)]
struct Vault(PathBuf);
#[cfg(unix)]
impl Vault {
    fn new() -> Self {
        static SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let path = std::env::temp_dir().join(format!(
            "atlas-audit-read-{}-{}",
            std::process::id(),
            SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        fs::create_dir_all(path.join(".ontology-atlas")).unwrap();
        Self(fs::canonicalize(path).unwrap())
    }
    fn log(&self) -> PathBuf {
        self.0.join(".ontology-atlas/llm-audit.jsonl")
    }
    fn root(&self) -> &str {
        self.0.to_str().unwrap()
    }
}
#[cfg(unix)]
impl Drop for Vault {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
#[cfg(unix)]
#[test]
fn bounded_pulls_preserve_all_bytes_and_check_cursors() {
    let vault = Vault::new();
    let _grant = crate::vault_grants::EnforcedScope::granting(&[vault.0.clone()]);
    let bytes = vec![b'a'; MAX_CHUNK * 3 + 17];
    fs::write(vault.log(), &bytes).unwrap();
    let mut session = Session::open(vault.root()).unwrap().unwrap();
    let mut actual = Vec::new();
    while session.cursor < session.initial.len {
        let part = session.pull(session.cursor).unwrap();
        assert!(part.len() <= MAX_CHUNK);
        assert!(part.capacity() <= MAX_CHUNK);
        actual.extend(part);
    }
    assert_eq!(actual, bytes);
    assert!(session.pull(0).is_err());
    session.validate().unwrap();
}
#[cfg(unix)]
#[test]
fn changes_at_middle_and_eof_never_validate() {
    for action in [
        "append", "finalize", "replace", "truncate", "sidecar", "root",
    ] {
        let vault = Vault::new();
        let _grant = crate::vault_grants::EnforcedScope::granting(&[vault.0.clone()]);
        fs::write(vault.log(), b"pending\n").unwrap();
        let mut session = Session::open(vault.root()).unwrap().unwrap();
        session.pull(0).unwrap();
        match action {
            "append" => {
                use std::io::Write;
                fs::OpenOptions::new()
                    .append(true)
                    .open(vault.log())
                    .unwrap()
                    .write_all(b"extra\n")
                    .unwrap();
            }
            "finalize" => fs::write(vault.log(), b"success\n").unwrap(),
            "replace" => {
                fs::rename(vault.log(), vault.0.join("old")).unwrap();
                fs::write(vault.log(), b"pending\n").unwrap();
            }
            "truncate" => fs::write(vault.log(), b"").unwrap(),
            "sidecar" => {
                fs::rename(vault.0.join(".ontology-atlas"), vault.0.join("old-dir")).unwrap();
                fs::create_dir(vault.0.join(".ontology-atlas")).unwrap();
                fs::rename(vault.0.join("old-dir/llm-audit.jsonl"), vault.log()).unwrap();
            }
            "root" => {
                let moved = vault.0.with_extension("moved");
                fs::rename(&vault.0, &moved).unwrap();
                fs::create_dir_all(vault.0.join(".ontology-atlas")).unwrap();
                fs::rename(moved.join(".ontology-atlas/llm-audit.jsonl"), vault.log()).unwrap();
                fs::remove_dir_all(moved).unwrap();
            }
            _ => unreachable!(),
        }
        assert_eq!(session.validate().unwrap_err(), CHANGED, "{action}");
    }
}
#[cfg(unix)]
#[test]
fn only_confirmed_absence_is_empty_and_grant_revocation_invalidates() {
    let vault = Vault::new();
    let _grant = crate::vault_grants::EnforcedScope::granting(&[vault.0.clone()]);
    assert!(Session::open(vault.root()).unwrap().is_none());
    fs::write(vault.log(), b"data").unwrap();
    let session = Session::open(vault.root()).unwrap().unwrap();
    let _revoked = crate::vault_grants::EnforcedScope::granting(&[]);
    assert!(session.validate().is_err());
}
#[cfg(unix)]
#[test]
fn links_and_fifo_are_rejected_without_touching_external_data() {
    use std::os::unix::fs::symlink;
    let vault = Vault::new();
    let _grant = crate::vault_grants::EnforcedScope::granting(&[vault.0.clone()]);
    let outside = vault.0.join("outside");
    fs::write(&outside, b"untouched").unwrap();
    symlink(&outside, vault.log()).unwrap();
    assert!(Session::open(vault.root()).is_err());
    fs::remove_file(vault.log()).unwrap();
    fs::hard_link(&outside, vault.log()).unwrap();
    assert!(Session::open(vault.root()).is_err());
    fs::remove_file(vault.log()).unwrap();
    let path = std::ffi::CString::new(vault.log().to_str().unwrap()).unwrap();
    assert_eq!(unsafe { libc::mkfifo(path.as_ptr(), 0o600) }, 0);
    assert!(Session::open(vault.root()).is_err());
    fs::remove_file(vault.log()).unwrap();
    assert_eq!(fs::read(outside).unwrap(), b"untouched");
    fs::remove_dir(vault.0.join(".ontology-atlas")).unwrap();
    symlink(&vault.0, vault.0.join(".ontology-atlas")).unwrap();
    assert!(Session::open(vault.root()).is_err());
}
#[cfg(unix)]
#[test]
fn reading_does_not_take_writer_lock_or_change_modes() {
    use std::os::{fd::AsRawFd, unix::fs::PermissionsExt};
    let vault = Vault::new();
    let _grant = crate::vault_grants::EnforcedScope::granting(&[vault.0.clone()]);
    fs::write(vault.log(), b"data").unwrap();
    let writer = fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(vault.log())
        .unwrap();
    assert_eq!(
        unsafe { libc::flock(writer.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) },
        0
    );
    let mode = writer.metadata().unwrap().permissions().mode();
    let mut session = Session::open(vault.root()).unwrap().unwrap();
    assert_eq!(session.pull(0).unwrap(), b"data");
    assert_eq!(writer.metadata().unwrap().permissions().mode(), mode);
}

#[cfg(unix)]
#[test]
fn repeated_terminal_paths_close_descriptors_and_release_slots() {
    use std::os::fd::AsRawFd;
    let vault = Vault::new();
    let _grant = crate::vault_grants::EnforcedScope::granting(&[vault.0.clone()]);
    fs::write(vault.log(), b"row\n").unwrap();
    let registry = Arc::new(Registry::default());
    let now = Instant::now();
    for cycle in 0..100 {
        let id = registry.prepare("owner", now).unwrap();
        let mut op = registry.take("owner", &id, now).unwrap();
        op.session = Session::open(vault.root()).unwrap();
        let fd = op.session.as_ref().unwrap().file.as_raw_fd();
        let original_id = identity(&op.session.as_ref().unwrap().file.metadata().unwrap());
        match cycle % 4 {
            0 => {
                registry.cancel(Some("owner"), Some(&id));
                assert!(registry.prepare("owner", now).is_err());
                assert!(op.restore(now).is_err());
            }
            1 => {
                op.restore(now).unwrap();
                registry.expire(now + IDLE);
            }
            2 => {
                let session = op.session.as_mut().unwrap();
                session.pull(0).unwrap();
                session.validate().unwrap();
                drop(op);
            }
            _ => {
                registry.expire(now + LIFETIME);
                assert!(op.valid(now + LIFETIME).is_err());
                assert!(registry.prepare("owner", now + LIFETIME).is_err());
                drop(op);
            }
        }
        assert!(registry.0.lock().unwrap().entries.is_empty());

        let mut meta = std::mem::MaybeUninit::<libc::stat>::uninit();
        if unsafe { libc::fstat(fd, meta.as_mut_ptr()) } == 0 {
            let meta = unsafe { meta.assume_init() };
            assert_ne!((meta.st_dev as u64, meta.st_ino as u64), original_id);
        } else {
            assert_eq!(
                std::io::Error::last_os_error().raw_os_error(),
                Some(libc::EBADF)
            );
        }
    }
}

#[cfg(unix)]
#[test]
fn missing_sources_revalidate_parent_identity_and_absence() {
    for mode in ["root", "sidecar", "created"] {
        let vault = Vault::new();
        let _grant = crate::vault_grants::EnforcedScope::granting(&[vault.0.clone()]);
        if mode == "root" {
            fs::remove_dir(vault.0.join(".ontology-atlas")).unwrap();
        }
        let result = Session::open_checked(vault.root(), || {
            if mode == "root" {
                let previous = vault.0.with_extension("old");
                fs::rename(&vault.0, &previous).unwrap();
                fs::create_dir_all(vault.0.join(".ontology-atlas")).unwrap();
                fs::remove_dir(previous).unwrap();
            } else if mode == "sidecar" {
                fs::rename(vault.0.join(".ontology-atlas"), vault.0.join("old-sidecar")).unwrap();
                fs::create_dir(vault.0.join(".ontology-atlas")).unwrap();
            }
            fs::write(vault.log(), b"current\n").unwrap();
        });
        assert_eq!(result.err().as_deref(), Some(CHANGED), "{mode}");
        assert!(Session::open(vault.root()).unwrap().is_some());
    }
}

#[cfg(unix)]
#[test]
fn staged_responses_outlive_reader_slots_without_an_aggregate_transport_claim() {
    use tauri::ipc::{InvokeResponseBody, IpcResponse};
    let vault = Vault::new();
    let _grant = crate::vault_grants::EnforcedScope::granting(&[vault.0.clone()]);
    fs::write(vault.log(), vec![b'a'; MAX_CHUNK]).unwrap();
    let registry = Arc::new(Registry::default());
    let now = Instant::now();
    let mut responses = Vec::new();
    for _ in 0..MAX_READERS + 1 {
        let id = registry.prepare("same-owner", now).unwrap();
        let mut op = registry.take("same-owner", &id, now).unwrap();
        op.session = Session::open(vault.root()).unwrap();
        let bytes = op.session.as_mut().unwrap().pull(0).unwrap();
        op.restore(now).unwrap();
        responses.push(tauri::ipc::Response::new(bytes));
        registry.cancel(Some("same-owner"), Some(&id));
        assert!(registry.0.lock().unwrap().entries.is_empty());
    }
    let delivered: usize = responses
        .into_iter()
        .map(|response| match response.body().unwrap() {
            InvokeResponseBody::Raw(bytes) => {
                assert!(bytes.len() <= MAX_CHUNK);
                bytes.len()
            }
            _ => panic!("expected raw IPC body"),
        })
        .sum();
    assert_eq!(delivered, (MAX_READERS + 1) * MAX_CHUNK);
}
