use super::*;
use std::fs::File;
use std::io::{Read, Write};
use std::os::fd::{AsRawFd, FromRawFd};
use std::os::unix::fs::MetadataExt;

#[cfg(test)]
thread_local! { pub(super) static WAIT_NOTICE: std::cell::RefCell<Option<std::sync::mpsc::Sender<()>>> = const { std::cell::RefCell::new(None) }; }

pub(super) struct Store { directory: File, _lock: File }
fn private(file: &File, directory: bool) -> Result<(), String> {
    let meta = file.metadata().map_err(|_| "unavailable")?;
    if meta.uid() != unsafe { libc::geteuid() } || meta.mode() & 0o077 != 0 || (if directory { !meta.is_dir() } else { !meta.is_file() || meta.nlink() != 1 }) { return Err("unavailable".into()); }
    Ok(())
}
impl Store {
    pub(super) fn open(root: &Path) -> Result<Self, String> {
        let root = crate::agent_setup::open_absolute_directory_no_follow(root)?;
        let directory = crate::agent_setup::open_or_create_relative_directory(&root, Path::new("public-pr-copies"), 0o700)?;
        private(&directory, true)?;
        let fd = unsafe { libc::openat(directory.as_raw_fd(), c"lock".as_ptr(), libc::O_RDWR | libc::O_CREAT | libc::O_CLOEXEC | libc::O_NOFOLLOW | libc::O_NONBLOCK, 0o600) };
        if fd < 0 { return Err("unavailable".into()); }
        let lock = unsafe { File::from_raw_fd(fd) };
        private(&lock, false)?;
        let started = std::time::Instant::now();
        while unsafe { libc::flock(lock.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) } != 0 {
            let lock_error = std::io::Error::last_os_error();
            #[cfg(test)]
            WAIT_NOTICE.with(|notice| { if let Some(sender) = notice.borrow_mut().take() { let _ = sender.send(()); } });
            if lock_error.kind() != std::io::ErrorKind::WouldBlock || started.elapsed() > Duration::from_secs(2) { return Err("unavailable".into()); }
            std::thread::sleep(Duration::from_millis(10));
        }
        let store = Self { directory, _lock: lock };
        store.remove_interrupted_temporary()?;
        Ok(store)
    }
    fn remove_interrupted_temporary(&self) -> Result<(), String> {
        let fd = unsafe { libc::dup(self.directory.as_raw_fd()) };
        if fd < 0 { return Err("unavailable".into()); }
        let stream = unsafe { libc::fdopendir(fd) };
        if stream.is_null() { unsafe { libc::close(fd); } return Err("unavailable".into()); }
        struct Directory(*mut libc::DIR);
        impl Drop for Directory { fn drop(&mut self) { unsafe { libc::closedir(self.0); } } }
        let directory = Directory(stream);
        let mut count = 0;
        loop {
            let raw = unsafe { libc::readdir(directory.0) };
            if raw.is_null() { break; }
            count += 1;
            if count > 64 { return Err("unavailable".into()); }
            let name = unsafe { std::ffi::CStr::from_ptr((*raw).d_name.as_ptr()) };
            if !name.to_bytes().starts_with(b".copies.json.oatlas-tmp-") { continue; }
            let fd = unsafe { libc::openat(self.directory.as_raw_fd(), name.as_ptr(), libc::O_RDONLY | libc::O_CLOEXEC | libc::O_NOFOLLOW | libc::O_NONBLOCK) };
            if fd < 0 { return Err("unavailable".into()); }
            let file = unsafe { File::from_raw_fd(fd) };
            private(&file, false)?;
            if file.metadata().map_err(|_| "unavailable")?.len() > STORE_BYTES as u64 { return Err("unavailable".into()); }
            if unsafe { libc::unlinkat(self.directory.as_raw_fd(), name.as_ptr(), 0) } != 0 { return Err("unavailable".into()); }
        }
        Ok(())
    }
    fn file(&self) -> Result<Option<File>, String> {
        let fd = unsafe { libc::openat(self.directory.as_raw_fd(), c"copies.json".as_ptr(), libc::O_RDONLY | libc::O_CLOEXEC | libc::O_NOFOLLOW | libc::O_NONBLOCK) };
        if fd < 0 {
            return if std::io::Error::last_os_error().kind() == std::io::ErrorKind::NotFound { Ok(None) } else { Err("unavailable".into()) };
        }
        let file = unsafe { File::from_raw_fd(fd) };
        private(&file, false)?;
        Ok(Some(file))
    }
    pub(super) fn read(&self) -> Result<Envelope, String> {
        let Some(mut file) = self.file()? else { return Ok(Envelope { version: 1, generation: String::new(), entries: vec![] }); };
        let before = file.metadata().map_err(|_| "unavailable")?;
        if before.len() > STORE_BYTES as u64 { return Err("unavailable".into()); }
        let mut bytes = Vec::new();
        (&mut file).take((STORE_BYTES + 1) as u64).read_to_end(&mut bytes).map_err(|_| "unavailable")?;
        let after = file.metadata().map_err(|_| "unavailable")?;
        if bytes.len() > STORE_BYTES || after.len() != before.len() || after.mtime() != before.mtime() || after.mtime_nsec() != before.mtime_nsec() { return Err("unavailable".into()); }
        let value: Envelope = serde_json::from_slice(&bytes).map_err(|_| "unavailable")?;
        if value.version != 1 || value.generation.is_empty() || value.generation.len() > 96 { return Err("unavailable".into()); }
        Ok(value)
    }
    fn write(&self, envelope: &Envelope) -> Result<(), String> {
        self.write_cancellable(envelope, &AtomicBool::new(false))
    }
    fn write_cancellable(&self, envelope: &Envelope, cancelled: &AtomicBool) -> Result<(), String> {
        let bytes = serde_json::to_vec(envelope).map_err(|_| "unavailable")?;
        if bytes.len() > STORE_BYTES { return Err("unavailable".into()); }
        crate::agent_setup::write_entry_atomically_with_guard(&self.directory, c"copies.json", 0o600, |file| file.write_all(&bytes), || if cancelled.load(Ordering::Acquire) { Err(std::io::Error::new(std::io::ErrorKind::Interrupted, "cancelled")) } else { Ok(()) })
    }
    #[cfg(test)]
    pub(super) fn generation(&self) -> Result<String, String> {
        let mut value = self.read()?;
        if value.generation.is_empty() { value.generation = generation(); self.write(&value)?; }
        Ok(value.generation)
    }
    pub(super) fn begin_read(&self) -> Result<String, String> {
        let mut value = self.read()?;
        value.generation = generation();
        self.write(&value)?;
        Ok(value.generation)
    }
    pub(super) fn clear(&self) -> Result<(), String> {
        self.file()?;
        self.write(&Envelope { version: 1, generation: generation(), entries: vec![] })
    }
    #[cfg(test)]
    pub(super) fn save(&self, generation: &str, scope: &str, repository: &str, originals: &[PullDescription], checked: &[String]) -> Result<SaveReport, String> {
        self.save_cancellable(generation, scope, repository, originals, checked, &AtomicBool::new(false))
    }
    pub(super) fn save_cancellable(&self, generation: &str, scope: &str, repository: &str, originals: &[PullDescription], checked: &[String], cancelled: &AtomicBool) -> Result<SaveReport, String> {
        if cancelled.load(Ordering::Acquire) { return Err("cancelled".into()); }
        let mut envelope = self.read()?;
        if envelope.generation != generation || generation.is_empty() { return Err("cleared".into()); }
        envelope.entries.retain(|entry| valid(entry) && !(entry.scope == scope && (checked.contains(&entry.description.integration) || originals.iter().any(|pr| pr.number == entry.description.number))));
        let mut report = SaveReport { status: "saved".into(), ..Default::default() };
        let mut added = HashSet::new();
        for description in originals {
            let entry = Entry { scope: scope.into(), repository: repository.to_ascii_lowercase(), merge: description.merge_commit.clone(), description: description.clone() };
            if valid(&entry) && added.insert(description.number) { envelope.entries.push(entry); report.saved += 1; } else { report.unsaved += 1; }
        }
        envelope.entries.sort_by(|a, b| {
            let time = |entry: &Entry| chrono::DateTime::parse_from_rfc3339(&entry.description.fetched_at).map(|v| v.timestamp_millis()).unwrap_or_default();
            time(b).cmp(&time(a)).then_with(|| a.scope.cmp(&b.scope)).then_with(|| a.description.number.cmp(&b.description.number))
        });
        let empty_size = serde_json::to_vec(&Envelope { version: 1, generation: envelope.generation.clone(), entries: vec![] }).map_err(|_| "unavailable")?.len();
        let mut total = empty_size;
        let mut keep = 0;
        for entry in &envelope.entries {
            let size = serde_json::to_vec(entry).map_err(|_| "unavailable")?.len() + usize::from(keep > 0);
            if keep == STORE_COUNT || total + size > STORE_BYTES { break; }
            total += size; keep += 1;
        }
        report.evicted = envelope.entries.len() - keep;
        let retained: HashSet<_> = envelope.entries[..keep].iter().filter(|entry| entry.scope == scope).map(|entry| entry.description.number).collect();
        let unsaved_new = originals.iter().filter(|pr| added.contains(&pr.number) && !retained.contains(&pr.number)).count();
        report.saved = report.saved.saturating_sub(unsaved_new); report.unsaved += unsaved_new;
        envelope.entries.truncate(keep);
        self.write_cancellable(&envelope, cancelled)?;
        Ok(report)
    }
}
