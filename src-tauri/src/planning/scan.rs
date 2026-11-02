use super::confined::{
    allowed_component, identity, open_at, supported_file, Identity, PlanningRoot,
};
use std::ffi::{CStr, CString, OsStr, OsString};
use std::fs::File;
use std::mem::MaybeUninit;
use std::os::fd::{AsRawFd, IntoRawFd};
use std::os::unix::ffi::{OsStrExt, OsStringExt};
use std::os::unix::fs::MetadataExt;
use std::path::{Path, PathBuf};

const MAX_DEPTH: usize = 12;
#[derive(Debug, serde::Serialize)]
pub(crate) struct Entry {
    pub(crate) path: PathBuf,
    pub(crate) size: u64,
    pub(crate) modified_seconds: i64,
}
#[derive(Debug, Default, serde::Serialize)]
pub(crate) struct OmissionCounts {
    pub(crate) excluded: usize,
    pub(crate) linked: usize,
    pub(crate) symlink: usize,
    pub(crate) unsupported: usize,
    pub(crate) unreadable: usize,
}
#[derive(Debug, serde::Serialize)]
pub(crate) struct Inventory {
    pub(crate) files: Vec<Entry>,
    pub(crate) skipped: usize,
    pub(crate) partial: bool,
    pub(crate) visited: usize,
    pub(crate) limit_reached: bool,
    pub(crate) depth_limited: bool,
    pub(crate) unknown_remainder: bool,
    pub(crate) omitted: OmissionCounts,
}
#[derive(Clone, Debug)]
pub(crate) enum ScanPhase {
    DirectoryOpened(PathBuf),
}
struct Dir(*mut libc::DIR);
impl Drop for Dir {
    fn drop(&mut self) {
        unsafe {
            libc::closedir(self.0);
        }
    }
}

#[cfg(target_os = "macos")]
unsafe fn errno_slot() -> *mut libc::c_int {
    libc::__error()
}
#[cfg(target_os = "linux")]
unsafe fn errno_slot() -> *mut libc::c_int {
    libc::__errno_location()
}

// Opening dot creates a separate directory cursor; dup shares the offset.
fn names(directory: &File, remaining: usize) -> Result<(Vec<OsString>, bool), String> {
    let stream_fd = open_at(directory, OsStr::new("."), true)?.into_raw_fd();
    let raw = unsafe { libc::fdopendir(stream_fd) };
    if raw.is_null() {
        unsafe {
            libc::close(stream_fd);
        }
        return Err("directory-unavailable".into());
    }
    let stream = Dir(raw);
    let mut result = Vec::new();
    let mut limited = false;
    loop {
        unsafe {
            *errno_slot() = 0;
        }
        let ptr = unsafe { libc::readdir(stream.0) };
        if ptr.is_null() {
            if unsafe { *errno_slot() } != 0 {
                return Err("directory-unavailable".into());
            }
            break;
        }
        let name = unsafe { CStr::from_ptr((*ptr).d_name.as_ptr()) }.to_bytes();
        if name == b"." || name == b".." {
            continue;
        }
        if result.len() >= remaining {
            limited = true;
            break;
        }
        result.push(OsString::from_vec(name.to_vec()));
    }
    result.sort();
    Ok((result, limited))
}

fn stat_at(directory: &File, name: &OsStr) -> Result<libc::stat, String> {
    let name = CString::new(name.as_bytes()).map_err(|_| "unsafe-path")?;
    let mut metadata = MaybeUninit::<libc::stat>::uninit();
    let result = unsafe {
        libc::fstatat(
            directory.as_raw_fd(),
            name.as_ptr(),
            metadata.as_mut_ptr(),
            libc::AT_SYMLINK_NOFOLLOW,
        )
    };
    if result != 0 {
        return Err("entry-unavailable".into());
    }
    Ok(unsafe { metadata.assume_init() })
}

struct Witness {
    path: PathBuf,
    chain: Vec<Identity>,
    directory: bool,
}
struct Walker<'a, F> {
    root: &'a PlanningRoot,
    max: usize,
    seen: usize,
    result: Inventory,
    witnesses: Vec<Witness>,
    hook: F,
}
impl<F: FnMut(ScanPhase)> Walker<'_, F> {
    fn walk(
        &mut self,
        directory: &File,
        path: &Path,
        chain: &[Identity],
        depth: usize,
    ) -> Result<(), String> {
        if depth > MAX_DEPTH {
            self.result.partial = true;
            self.result.depth_limited = true;
            return Ok(());
        }
        let (entries, limited) = match names(directory, self.max.saturating_sub(self.seen)) {
            Ok(value) => value,
            Err(_) => {
                self.result.partial = true;
                self.result.omitted.unreadable += 1;
                return Ok(());
            }
        };
        if limited {
            self.result.partial = true;
            self.result.limit_reached = true;
        }
        for name in entries {
            // Recursion can spend the budget after parent entries were buffered.
            if self.seen >= self.max {
                self.result.partial = true;
                self.result.limit_reached = true;
                break;
            }
            self.seen += 1;
            if !allowed_component(&name) {
                self.result.omitted.excluded += 1;
                continue;
            }
            let stat = match stat_at(directory, &name) {
                Ok(value) => value,
                Err(_) => {
                    self.result.partial = true;
                    self.result.omitted.unreadable += 1;
                    continue;
                }
            };
            let kind = stat.st_mode & libc::S_IFMT;
            if kind == libc::S_IFLNK {
                self.result.omitted.symlink += 1;
                continue;
            }
            let child_path = path.join(&name);
            if kind == libc::S_IFDIR && self.root.excluded_directory(&child_path) {
                self.result.omitted.excluded += 1;
                continue;
            }
            if kind == libc::S_IFDIR {
                let child = match open_at(directory, &name, true) {
                    Ok(value) => value,
                    Err(_) => {
                        self.result.partial = true;
                        self.result.omitted.unreadable += 1;
                        continue;
                    }
                };
                let meta = child.metadata().map_err(|_| "entry-unavailable")?;
                if !meta.is_dir()
                    || meta.dev() != stat.st_dev as u64
                    || meta.ino() != stat.st_ino as u64
                {
                    return Err("entry-changed".into());
                }
                let mut child_chain = chain.to_vec();
                child_chain.push(identity(&meta));
                self.witnesses.push(Witness {
                    path: child_path.clone(),
                    chain: child_chain.clone(),
                    directory: true,
                });
                (self.hook)(ScanPhase::DirectoryOpened(child_path.clone()));
                self.walk(&child, &child_path, &child_chain, depth + 1)?;
            } else if kind == libc::S_IFREG {
                if !supported_file(&name) {
                    self.result.omitted.unsupported += 1;
                    continue;
                }
                let child = match open_at(directory, &name, false) {
                    Ok(value) => value,
                    Err(_) => {
                        self.result.partial = true;
                        self.result.omitted.unreadable += 1;
                        continue;
                    }
                };
                let meta = child.metadata().map_err(|_| "entry-unavailable")?;
                if !meta.is_file()
                    || meta.dev() != stat.st_dev as u64
                    || meta.ino() != stat.st_ino as u64
                {
                    return Err("entry-changed".into());
                }
                if meta.nlink() != 1 {
                    self.result.omitted.linked += 1;
                    continue;
                }
                let mut child_chain = chain.to_vec();
                child_chain.push(identity(&meta));
                self.witnesses.push(Witness {
                    path: child_path.clone(),
                    chain: child_chain,
                    directory: false,
                });
                self.result.files.push(Entry {
                    path: child_path,
                    size: meta.len(),
                    modified_seconds: meta.mtime(),
                });
            } else {
                self.result.omitted.excluded += 1;
            }
        }
        Ok(())
    }
}

pub(crate) fn scan_with_hook(
    root: &PlanningRoot,
    max: usize,
    hook: impl FnMut(ScanPhase),
) -> Result<Inventory, String> {
    root.verify_root()?;
    let mut walker = Walker {
        root,
        max,
        seen: 0,
        result: Inventory {
            files: Vec::new(),
            skipped: 0,
            partial: false,
            visited: 0,
            limit_reached: false,
            depth_limited: false,
            unknown_remainder: false,
            omitted: OmissionCounts::default(),
        },
        witnesses: Vec::new(),
        hook,
    };
    walker.walk(&root.root, Path::new(""), &[], 0)?;
    root.verify_root()?;
    for witness in &walker.witnesses {
        let parts: Vec<_> = witness.path.iter().collect();
        walker
            .root
            .verify_path(&parts, &witness.chain, witness.directory)?;
    }
    walker.result.files.sort_by(|a, b| a.path.cmp(&b.path));
    walker.result.visited = walker.seen;
    walker.result.unknown_remainder = walker.result.partial;
    walker.result.skipped = walker.result.omitted.excluded
        + walker.result.omitted.linked
        + walker.result.omitted.symlink
        + walker.result.omitted.unsupported;
    Ok(walker.result)
}
#[cfg(test)]
#[path = "scan_tests.rs"]
mod tests;
