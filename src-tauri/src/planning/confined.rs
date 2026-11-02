use std::ffi::{CString, OsStr};
use std::fs::{File, Metadata};
use std::io::Read;
use std::os::fd::{AsRawFd, FromRawFd};
use std::os::unix::ffi::OsStrExt;
use std::os::unix::fs::MetadataExt;
use std::path::{Component, Path, PathBuf};

const MAX_READ_BYTES: u64 = 16 * 1024 * 1024;
const DENIED_NAMES: &[&str] = &[
    "credential",
    "secret",
    "password",
    "passwd",
    "token",
    "apikey",
    "api-key",
    "api_key",
    "id_rsa",
    "id_ed25519",
    "id_dsa",
    "id_ecdsa",
    ".env",
    ".pem",
    ".key",
    ".p12",
    ".pfx",
    ".keystore",
    ".jks",
    ".htpasswd",
];
const PRUNED_DIRS: &[&str] = &[
    "node_modules",
    "target",
    "dist",
    "build",
    "out",
    "coverage",
    "vendor",
    "Pods",
    "DerivedData",
    "__pycache__",
    "venv",
];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Phase {
    ParentOpened,
    LeafOpened,
    BytesRead,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) struct Identity {
    dev: u64,
    ino: u64,
}
pub(super) fn identity(metadata: &Metadata) -> Identity {
    Identity {
        dev: metadata.dev(),
        ino: metadata.ino(),
    }
}
fn io_failure(_: std::io::Error) -> String {
    "entry-unavailable".into()
}
fn name_cstring(name: &OsStr) -> Result<CString, String> {
    CString::new(name.as_bytes()).map_err(|_| "unsafe-path".into())
}
pub(super) fn open_at(parent: &File, name: &OsStr, directory: bool) -> Result<File, String> {
    let name = name_cstring(name)?;
    let flags = libc::O_RDONLY
        | libc::O_CLOEXEC
        | libc::O_NOFOLLOW
        | if directory {
            libc::O_DIRECTORY
        } else {
            libc::O_NONBLOCK
        };
    let fd = unsafe { libc::openat(parent.as_raw_fd(), name.as_ptr(), flags) };
    if fd < 0 {
        return Err("entry-unavailable".into());
    }
    Ok(unsafe { File::from_raw_fd(fd) })
}

pub(crate) fn open_root(path: &Path) -> Result<File, String> {
    if !path.is_absolute() {
        return Err("unsafe-root".into());
    }
    let fd = unsafe {
        libc::open(
            c"/".as_ptr(),
            libc::O_RDONLY | libc::O_CLOEXEC | libc::O_DIRECTORY | libc::O_NOFOLLOW,
        )
    };
    if fd < 0 {
        return Err("root-unavailable".into());
    }
    let mut current = unsafe { File::from_raw_fd(fd) };
    for component in path.components() {
        match component {
            Component::RootDir => (),
            Component::Normal(name) => current = open_at(&current, name, true)?,
            _ => return Err("unsafe-root".into()),
        }
    }
    Ok(current)
}

pub(super) fn allowed_component(name: &OsStr) -> bool {
    let Some(name_str) = name.to_str() else {
        return false;
    };
    let lower = name_str.to_ascii_lowercase();
    !name_str.starts_with('.')
        && !DENIED_NAMES.iter().any(|v| lower.contains(v))
        && !PRUNED_DIRS.contains(&name_str)
}

pub(super) fn supported_file(name: &OsStr) -> bool {
    let extension = name
        .to_str()
        .and_then(|file| file.rsplit_once('.'))
        .map(|(_, extension)| extension.to_ascii_lowercase());
    matches!(
        extension.as_deref(),
        Some("md" | "png" | "jpg" | "jpeg" | "webp" | "avif")
    )
}

pub(super) fn excluded_system_path(path: &Path) -> bool {
    #[cfg(target_os = "macos")]
    {
        let system_roots = [
            "/System",
            "/Library",
            "/Applications",
            "/usr",
            "/bin",
            "/sbin",
            "/dev",
            "/private/etc",
            "/private/var/db",
            "/private/var/root",
            "/private/var/run",
        ];
        if system_roots.iter().any(|root| path.starts_with(root)) {
            return true;
        }
        static HOME_LIBRARY: std::sync::OnceLock<Option<PathBuf>> = std::sync::OnceLock::new();
        let home_library = HOME_LIBRARY.get_or_init(|| {
            std::env::var_os("HOME")
                .and_then(|home| std::fs::canonicalize(home).ok())
                .map(|home| home.join("Library"))
        });
        if let Some(library) = home_library {
            if path.starts_with(library) {
                return true;
            }
        }
    }
    #[cfg(target_os = "linux")]
    if [
        "/usr", "/etc", "/boot", "/proc", "/sys", "/dev", "/bin", "/sbin", "/var/lib", "/var/run",
    ]
    .iter()
    .any(|root| path.starts_with(root))
    {
        return true;
    }
    false
}

fn normal_parts(path: &Path) -> Result<Vec<&OsStr>, String> {
    let mut out = Vec::new();
    for component in path.components() {
        match component {
            Component::Normal(name) => {
                if !allowed_component(name) {
                    return Err("excluded-entry".into());
                }
                out.push(name);
            }
            _ => return Err("unsafe-path".into()),
        }
    }
    if out.is_empty() {
        return Err("unsafe-path".into());
    }
    if !supported_file(path.file_name().ok_or("unsupported-name")?) {
        return Err("unsupported-type".into());
    }
    Ok(out)
}

pub(crate) fn resolve_image(document: &Path, target: &Path) -> Result<PathBuf, String> {
    normal_parts(document)?;
    if !document
        .extension()
        .and_then(OsStr::to_str)
        .is_some_and(|extension| extension.eq_ignore_ascii_case("md"))
    {
        return Err("unsupported-type".into());
    }
    let raw = target.to_str().ok_or("unsafe-path")?;
    if raw.is_empty() || raw.contains(['\0', '\\', ':']) || target.is_absolute() {
        return Err("unsafe-path".into());
    }
    let mut result = PathBuf::new();
    for component in document.parent().unwrap_or(Path::new("")).components() {
        match component {
            Component::Normal(name) => result.push(name),
            _ => return Err("unsafe-path".into()),
        }
    }
    for component in target.components() {
        match component {
            Component::Normal(name) => result.push(name),
            Component::CurDir => (),
            Component::ParentDir if result.pop() => (),
            _ => return Err("unsafe-path".into()),
        }
    }
    normal_parts(&result)?;
    if result
        .extension()
        .and_then(OsStr::to_str)
        .is_some_and(|extension| extension.eq_ignore_ascii_case("md"))
    {
        return Err("unsupported-type".into());
    }
    Ok(result)
}

pub(crate) struct PlanningRoot {
    path: PathBuf,
    pub(super) root: File,
    root_identity: Identity,
}
impl PlanningRoot {
    pub(crate) fn new(path: PathBuf, root: File) -> Result<Self, String> {
        if crate::vault_root_rejection(&path).is_some()
            || excluded_system_path(&path)
            || path
                .components()
                .any(|part| matches!(part, Component::Normal(name) if !allowed_component(name)))
        {
            return Err("excluded-root".into());
        }
        let metadata = root.metadata().map_err(io_failure)?;
        if !metadata.is_dir() {
            return Err("root-unavailable".into());
        }
        let root_identity = identity(&metadata);
        let value = Self {
            path,
            root,
            root_identity,
        };
        value.verify_root()?;
        Ok(value)
    }
    pub(super) fn verify_root(&self) -> Result<(), String> {
        let current = open_root(&self.path)?;
        if identity(&current.metadata().map_err(io_failure)?) != self.root_identity {
            return Err("root-replaced".into());
        }
        Ok(())
    }
    pub(super) fn excluded(&self, relative: &Path) -> bool {
        excluded_system_path(&self.path.join(relative))
    }
    pub(super) fn excluded_directory(&self, relative: &Path) -> bool {
        self.excluded(relative) || crate::vault_root_rejection(&self.path.join(relative)).is_some()
    }
    pub(super) fn verify_path(
        &self,
        parts: &[&OsStr],
        expected: &[Identity],
        last_is_directory: bool,
    ) -> Result<(), String> {
        let mut directory = self.root.try_clone().map_err(io_failure)?;
        for (index, part) in parts.iter().enumerate() {
            let next = open_at(
                &directory,
                part,
                index + 1 < parts.len() || last_is_directory,
            )?;
            let metadata = next.metadata().map_err(io_failure)?;
            if identity(&metadata) != expected[index] {
                return Err("entry-replaced".into());
            }
            if index + 1 == parts.len()
                && !last_is_directory
                && (!metadata.is_file() || metadata.nlink() != 1)
            {
                return Err("excluded-entry".into());
            }
            directory = next;
        }
        Ok(())
    }
    pub(crate) fn read_with_hook(
        &self,
        path: &Path,
        hook: impl FnMut(Phase),
    ) -> Result<Vec<u8>, String> {
        self.read_verified(path, hook).map(|(bytes, _)| bytes)
    }
    pub(crate) fn read_verified(
        &self,
        path: &Path,
        mut hook: impl FnMut(Phase),
    ) -> Result<(Vec<u8>, File), String> {
        let parts = normal_parts(path)?;
        if self.excluded(path) {
            return Err("excluded-entry".into());
        }
        let mut ancestor = PathBuf::new();
        for part in parts.iter().take(parts.len().saturating_sub(1)) {
            ancestor.push(part);
            if self.excluded_directory(&ancestor) {
                return Err("excluded-entry".into());
            }
        }
        self.verify_root()?;
        let mut current = self.root.try_clone().map_err(io_failure)?;
        let mut identities = Vec::with_capacity(parts.len());
        for (index, part) in parts.iter().enumerate() {
            let is_directory = index + 1 < parts.len();
            let next = open_at(&current, part, is_directory)?;
            let metadata = next.metadata().map_err(io_failure)?;
            if is_directory && !metadata.is_dir() {
                return Err("entry-unavailable".into());
            }
            if !is_directory
                && (!metadata.is_file() || metadata.nlink() != 1 || metadata.len() > MAX_READ_BYTES)
            {
                return Err("excluded-entry".into());
            }
            identities.push(identity(&metadata));
            current = next;
            hook(if is_directory {
                Phase::ParentOpened
            } else {
                Phase::LeafOpened
            });
        }
        let before = current.metadata().map_err(io_failure)?;
        if before.nlink() != 1 || before.len() > MAX_READ_BYTES {
            return Err("excluded-entry".into());
        }
        let mut bytes = Vec::new();
        (&mut current)
            .take(MAX_READ_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(io_failure)?;
        if bytes.len() as u64 > MAX_READ_BYTES {
            return Err("file-too-large".into());
        }
        hook(Phase::BytesRead);
        let after = current.metadata().map_err(io_failure)?;
        if after.nlink() != 1
            || identity(&before) != identity(&after)
            || before.len() != after.len()
            || before.mtime() != after.mtime()
            || before.mtime_nsec() != after.mtime_nsec()
            || before.ctime() != after.ctime()
            || before.ctime_nsec() != after.ctime_nsec()
        {
            return Err("entry-changed".into());
        }
        self.verify_root()?;
        self.verify_path(&parts, &identities, false)?;
        Ok((bytes, current))
    }
}

#[cfg(test)]
#[path = "confined_tests.rs"]
mod tests;
