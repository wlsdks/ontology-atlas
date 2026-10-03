use serde::Serialize;
use std::{
    collections::HashMap,
    fs,
    io::{Read, Seek, SeekFrom},
    path::PathBuf,
    sync::{Arc, Mutex, OnceLock},
    time::{Duration, Instant},
};

const MAX_READERS: usize = 4;
const MAX_CHUNK: usize = 1024 * 1024;
const IDLE: Duration = Duration::from_secs(30);
const LIFETIME: Duration = Duration::from_secs(300);
const CHANGED: &str = "audit-read-changed";
const EXPIRED: &str = "audit-read-expired";
const FAILED: &str = "audit-read-failed";

#[derive(Clone, Debug, PartialEq)]
struct Stamp {
    len: u64,
    modified: std::time::SystemTime,
    dev: u64,
    ino: u64,
    changed: (i64, i64),
}
#[cfg(unix)]
fn stamp(meta: &fs::Metadata) -> Result<Stamp, String> {
    use std::os::unix::fs::MetadataExt;
    if !meta.is_file() || meta.nlink() != 1 {
        return Err(FAILED.into());
    }
    Ok(Stamp {
        len: meta.len(),
        modified: meta.modified().map_err(|_| FAILED)?,
        dev: meta.dev(),
        ino: meta.ino(),
        changed: (meta.ctime(), meta.ctime_nsec()),
    })
}
#[cfg(not(unix))]
fn stamp(_: &fs::Metadata) -> Result<Stamp, String> {
    Err(FAILED.into())
}

#[cfg(unix)]
fn identity(meta: &fs::Metadata) -> (u64, u64) {
    use std::os::unix::fs::MetadataExt;
    (meta.dev(), meta.ino())
}
#[cfg(not(unix))]
fn identity(_: &fs::Metadata) -> (u64, u64) {
    (0, 0)
}
#[cfg(unix)]
fn validate_absence(
    root: &std::path::Path,
    root_id: (u64, u64),
    side_id: Option<(u64, u64)>,
) -> Result<(), String> {
    let check_root = || {
        let canonical =
            super::canonical_root(root.to_str().ok_or(CHANGED)?).map_err(|_| CHANGED)?;
        let meta = fs::symlink_metadata(root).map_err(|_| CHANGED)?;
        if canonical != root || !meta.is_dir() || identity(&meta) != root_id {
            return Err(CHANGED.to_string());
        }
        Ok(())
    };
    check_root()?;
    let side = root.join(".ontology-atlas");
    let absent = if let Some(expected) = side_id {
        let meta = fs::symlink_metadata(&side).map_err(|_| CHANGED)?;
        if !meta.is_dir() || identity(&meta) != expected {
            return Err(CHANGED.into());
        }
        side.join("llm-audit.jsonl")
    } else {
        side.clone()
    };
    match fs::symlink_metadata(absent) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        _ => return Err(CHANGED.into()),
    }

    if let Some(expected) = side_id {
        let meta = fs::symlink_metadata(side).map_err(|_| CHANGED)?;
        if !meta.is_dir() || identity(&meta) != expected {
            return Err(CHANGED.into());
        }
    }
    check_root()
}
struct Session {
    root: PathBuf,
    root_id: (u64, u64),
    side_id: (u64, u64),
    file: fs::File,
    initial: Stamp,
    cursor: u64,
}
impl Session {
    fn open(root: &str) -> Result<Option<Self>, String> {
        Self::open_checked(root, || {})
    }
    fn open_checked(root: &str, before_absence: impl FnOnce()) -> Result<Option<Self>, String> {
        let root = super::canonical_root(root)?;
        #[cfg(unix)]
        {
            use std::os::fd::{AsRawFd, FromRawFd};
            let root_fd = crate::agent_setup::open_absolute_directory_no_follow(&root)?;
            let root_id = identity(&root_fd.metadata().map_err(|_| FAILED)?);
            let side_fd = unsafe {
                libc::openat(
                    root_fd.as_raw_fd(),
                    c".ontology-atlas".as_ptr(),
                    libc::O_RDONLY | libc::O_DIRECTORY | libc::O_CLOEXEC | libc::O_NOFOLLOW,
                )
            };
            if side_fd < 0 {
                return if std::io::Error::last_os_error().kind() == std::io::ErrorKind::NotFound {
                    before_absence();
                    validate_absence(&root, root_id, None)?;
                    Ok(None)
                } else {
                    Err(FAILED.into())
                };
            }
            let side = unsafe { fs::File::from_raw_fd(side_fd) };
            let side_id = identity(&side.metadata().map_err(|_| FAILED)?);
            let fd = unsafe {
                libc::openat(
                    side.as_raw_fd(),
                    c"llm-audit.jsonl".as_ptr(),
                    libc::O_RDONLY | libc::O_CLOEXEC | libc::O_NOFOLLOW | libc::O_NONBLOCK,
                )
            };
            if fd < 0 {
                return if std::io::Error::last_os_error().kind() == std::io::ErrorKind::NotFound {
                    before_absence();
                    validate_absence(&root, root_id, Some(side_id))?;
                    Ok(None)
                } else {
                    Err(FAILED.into())
                };
            }
            let file = unsafe { fs::File::from_raw_fd(fd) };
            let initial = stamp(&file.metadata().map_err(|_| FAILED)?)?;
            let session = Self {
                root,
                root_id,
                side_id,
                file,
                initial,
                cursor: 0,
            };
            session.validate()?;
            Ok(Some(session))
        }
        #[cfg(not(unix))]
        {
            let _ = (root, before_absence);
            Err(FAILED.into())
        }
    }
    fn validate(&self) -> Result<(), String> {
        let root = super::canonical_root(self.root.to_str().ok_or(FAILED)?).map_err(|_| CHANGED)?;
        if root != self.root {
            return Err(CHANGED.into());
        }
        if identity(&fs::metadata(&root).map_err(|_| CHANGED)?) != self.root_id {
            return Err(CHANGED.into());
        }
        let side = self.root.join(".ontology-atlas");
        let side_meta = fs::symlink_metadata(&side).map_err(|_| CHANGED)?;
        if !side_meta.is_dir() || identity(&side_meta) != self.side_id {
            return Err(CHANGED.into());
        }
        let path = side.join("llm-audit.jsonl");
        let metadata = fs::symlink_metadata(path).map_err(|_| CHANGED)?;
        if stamp(&metadata).map_err(|_| CHANGED)? != self.initial
            || stamp(&self.file.metadata().map_err(|_| CHANGED)?)? != self.initial
        {
            return Err(CHANGED.into());
        }
        Ok(())
    }
    fn pull(&mut self, cursor: u64) -> Result<Vec<u8>, String> {
        if cursor != self.cursor {
            return Err(FAILED.into());
        }
        self.validate()?;
        let len = (self.initial.len - self.cursor).min(MAX_CHUNK as u64) as usize;
        let mut bytes = vec![0; len];
        self.file
            .seek(SeekFrom::Start(self.cursor))
            .map_err(|_| FAILED)?;
        self.file.read_exact(&mut bytes).map_err(|_| CHANGED)?;
        self.validate()?;
        self.cursor += len as u64;
        Ok(bytes)
    }
}
struct Slot {
    owner: String,
    created: Instant,
    touched: Instant,
    busy: bool,
    cancelled: bool,
    session: Option<Session>,
}
impl Slot {
    fn expired(&self, now: Instant) -> bool {
        now.saturating_duration_since(self.touched) >= IDLE
            || now.saturating_duration_since(self.created) >= LIFETIME
    }
}
#[derive(Default)]
struct Slots {
    next: u64,
    entries: HashMap<String, Slot>,
    sweeping: bool,
}
#[derive(Default)]
struct Registry(Mutex<Slots>);
struct Operation {
    registry: Arc<Registry>,
    id: String,
    session: Option<Session>,
}
impl Drop for Operation {
    fn drop(&mut self) {
        drop(self.session.take());
        if !self.id.is_empty() {
            self.registry.0.lock().unwrap().entries.remove(&self.id);
        }
    }
}
impl Operation {
    fn restore(mut self, now: Instant) -> Result<(), String> {
        let mut slots = self.registry.0.lock().unwrap();
        let slot = slots.entries.get_mut(&self.id).ok_or(EXPIRED)?;
        if slot.cancelled || slot.expired(now) {
            return Err(EXPIRED.into());
        }
        slot.session = self.session.take();
        slot.busy = false;
        slot.touched = now;
        self.id.clear();
        Ok(())
    }
    fn valid(&self, now: Instant) -> Result<(), String> {
        let slots = self.registry.0.lock().unwrap();
        let slot = slots.entries.get(&self.id).ok_or(EXPIRED)?;
        if slot.cancelled || slot.expired(now) {
            Err(EXPIRED.into())
        } else {
            Ok(())
        }
    }
}
impl Registry {
    fn expire(&self, now: Instant) {
        self.0.lock().unwrap().entries.retain(|_, slot| {
            if slot.expired(now) {
                slot.cancelled = true;
            }
            if slot.busy {
                true
            } else {
                !slot.cancelled
            }
        });
    }
    fn prepare(self: &Arc<Self>, owner: &str, now: Instant) -> Result<String, String> {
        self.expire(now);
        let mut slots = self.0.lock().unwrap();
        if slots.entries.len() >= MAX_READERS
            || slots.entries.values().any(|slot| slot.owner == owner)
        {
            return Err(FAILED.into());
        }
        slots.next = slots.next.checked_add(1).ok_or(FAILED)?;
        let id = slots.next.to_string();
        slots.entries.insert(
            id.clone(),
            Slot {
                owner: owner.into(),
                created: now,
                touched: now,
                busy: false,
                cancelled: false,
                session: None,
            },
        );
        Ok(id)
    }
    fn take(self: &Arc<Self>, owner: &str, id: &str, now: Instant) -> Result<Operation, String> {
        self.expire(now);
        let mut slots = self.0.lock().unwrap();
        let slot = slots
            .entries
            .get_mut(id)
            .filter(|slot| slot.owner == owner && !slot.busy && !slot.cancelled)
            .ok_or(EXPIRED)?;
        slot.busy = true;
        Ok(Operation {
            registry: self.clone(),
            id: id.into(),
            session: slot.session.take(),
        })
    }
    fn cancel(&self, owner: Option<&str>, id: Option<&str>) {
        self.0.lock().unwrap().entries.retain(|key, slot| {
            if owner.is_some_and(|owner| slot.owner != owner) || id.is_some_and(|id| key != id) {
                return true;
            }
            slot.cancelled = true;
            slot.busy
        });
    }
}
fn registry() -> &'static Arc<Registry> {
    static REGISTRY: OnceLock<Arc<Registry>> = OnceLock::new();
    REGISTRY.get_or_init(|| Arc::new(Registry::default()))
}
fn start_sweeper(registry: Arc<Registry>) {
    {
        let mut slots = registry.0.lock().unwrap();
        if slots.sweeping {
            return;
        }
        slots.sweeping = true;
    }
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(1)).await;
            registry.expire(Instant::now());
            let mut slots = registry.0.lock().unwrap();
            if slots.entries.is_empty() {
                slots.sweeping = false;
                break;
            }
        }
    });
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Begin {
    missing: bool,
    size: u64,
}
#[tauri::command(async)]
pub fn audit_read_prepare(window: tauri::WebviewWindow) -> Result<Option<String>, String> {
    #[cfg(not(unix))]
    {
        let _ = window;
        Ok(None)
    }
    #[cfg(unix)]
    {
        let id = registry().prepare(window.label(), Instant::now())?;
        start_sweeper(registry().clone());
        Ok(Some(id))
    }
}
#[tauri::command(async)]
pub fn audit_read_begin(
    window: tauri::WebviewWindow,
    reader_id: String,
    root_path: String,
) -> Result<Begin, String> {
    let mut op = registry().take(window.label(), &reader_id, Instant::now())?;
    if op.session.is_some() {
        return Err(FAILED.into());
    }
    op.session = Session::open(&root_path)?;
    op.valid(Instant::now())?;
    let Some(session) = &op.session else {
        return Ok(Begin {
            missing: true,
            size: 0,
        });
    };
    let size = session.initial.len;
    op.restore(Instant::now())?;
    Ok(Begin {
        missing: false,
        size,
    })
}
#[tauri::command(async)]
pub fn audit_read_pull(
    window: tauri::WebviewWindow,
    reader_id: String,
    cursor: u64,
) -> Result<tauri::ipc::Response, String> {
    let mut op = registry().take(window.label(), &reader_id, Instant::now())?;
    let bytes = op.session.as_mut().ok_or(FAILED)?.pull(cursor)?;
    op.valid(Instant::now())?;
    op.restore(Instant::now())?;
    Ok(tauri::ipc::Response::new(bytes))
}
#[tauri::command(async)]
pub fn audit_read_finish(window: tauri::WebviewWindow, reader_id: String) -> Result<(), String> {
    let op = registry().take(window.label(), &reader_id, Instant::now())?;
    let session = op.session.as_ref().ok_or(FAILED)?;
    if session.cursor != session.initial.len {
        return Err(FAILED.into());
    }
    session.validate()?;
    op.valid(Instant::now())
}
#[tauri::command(async)]
pub fn audit_read_cancel(window: tauri::WebviewWindow, reader_id: String) {
    registry().cancel(Some(window.label()), Some(&reader_id));
}
pub(crate) fn cancel_owner(owner: Option<&str>) {
    registry().cancel(owner, None);
}

#[cfg(test)]
mod tests;
