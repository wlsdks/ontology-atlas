//! Windows has no `openat`, so each check opens the path itself without
//! following a final link and reads the handle: volume serial and file index
//! for identity, link count, reparse attribute and change time.

use std::fs::{self, File, OpenOptions};
use std::io;
use std::os::windows::fs::OpenOptionsExt;
use std::os::windows::io::AsRawHandle;
use std::path::Path;
use windows_sys::Win32::Storage::FileSystem::{
    FileBasicInfo, GetFileInformationByHandle, GetFileInformationByHandleEx,
    BY_HANDLE_FILE_INFORMATION, FILE_ATTRIBUTE_REPARSE_POINT, FILE_BASIC_INFO,
    FILE_FLAG_BACKUP_SEMANTICS, FILE_FLAG_OPEN_REPARSE_POINT, FILE_READ_ATTRIBUTES,
    FILE_SHARE_DELETE, FILE_SHARE_READ, FILE_SHARE_WRITE,
};
use windows_sys::Win32::System::IO::DeviceIoControl;

/// Every sharing flag: reading never stops the writer, a rename or a delete.
/// A change is caught by comparing entries, as on Unix.
const SHARE_ALL: u32 = FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE;

/// `FSCTL_READ_FILE_USN_DATA`, spelled out to avoid a second `windows-sys` feature.
const FSCTL_READ_FILE_USN_DATA: u32 = 0x0009_00EB;

pub(super) struct Entry {
    pub(super) meta: fs::Metadata,
    pub(super) volume: u64,
    pub(super) index: u64,
    pub(super) links: u32,
    pub(super) changed: i64,
    pub(super) usn: i64,
    pub(super) reparse: bool,
}

/// The file's last change-journal number. Write and change times tick about every
/// 15 ms, so a same-size rewrite inside one tick leaves them equal; NTFS gives the
/// rewrite a new number. 0 where the volume keeps no journal.
fn usn(file: &File) -> i64 {
    let mut record = [0u64; 64];
    let mut returned = 0u32;
    let capacity = u32::try_from(std::mem::size_of_val(&record)).unwrap_or(0);
    // SAFETY: the handle is open, there is no input, and the output buffer holds `capacity` bytes.
    let ok = unsafe {
        DeviceIoControl(
            file.as_raw_handle(),
            FSCTL_READ_FILE_USN_DATA,
            std::ptr::null(),
            0,
            record.as_mut_ptr().cast(),
            capacity,
            &mut returned,
            std::ptr::null_mut(),
        )
    };
    if ok == 0 {
        return 0;
    }
    // USN_RECORD_V2 keeps `Usn` at byte 24; V3, with 128-bit file ids, at byte 40.
    let major = record.first().map_or(0, |word| (word >> 32) & 0xFFFF);
    let word = if major == 3 { 5 } else { 3 };
    if (returned as usize) < (word + 1) * 8 {
        return 0;
    }
    record.get(word).map_or(0, |usn| *usn as i64)
}

pub(super) fn entry_of(file: &File) -> io::Result<Entry> {
    let meta = file.metadata()?;
    let handle = file.as_raw_handle();
    let mut info = BY_HANDLE_FILE_INFORMATION::default();
    // SAFETY: the handle is open for the call and `info` is a valid out pointer.
    if unsafe { GetFileInformationByHandle(handle, &mut info) } == 0 {
        return Err(io::Error::last_os_error());
    }
    let mut basic = FILE_BASIC_INFO::default();
    let size = u32::try_from(std::mem::size_of::<FILE_BASIC_INFO>()).unwrap_or(u32::MAX);
    // SAFETY: `basic` is a FILE_BASIC_INFO of `size` bytes and the handle is open.
    let read = unsafe {
        GetFileInformationByHandleEx(
            handle,
            FileBasicInfo,
            (&mut basic as *mut FILE_BASIC_INFO).cast(),
            size,
        )
    };
    if read == 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(Entry {
        meta,
        volume: u64::from(info.dwVolumeSerialNumber),
        index: (u64::from(info.nFileIndexHigh) << 32) | u64::from(info.nFileIndexLow),
        links: info.nNumberOfLinks,
        changed: basic.ChangeTime,
        usn: usn(file),
        reparse: info.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT != 0,
    })
}

/// The entry at `path`; with `follow` false a link or junction is read as itself.
pub(super) fn entry_at(path: &Path, follow: bool) -> io::Result<Entry> {
    let mut flags = FILE_FLAG_BACKUP_SEMANTICS;
    if !follow {
        flags |= FILE_FLAG_OPEN_REPARSE_POINT;
    }
    let file = OpenOptions::new()
        .access_mode(FILE_READ_ATTRIBUTES)
        .share_mode(SHARE_ALL)
        .custom_flags(flags)
        .open(path)?;
    entry_of(&file)
}

/// The log, opened as itself if it is a link so the stamp check refuses it.
pub(super) fn open_log(path: &Path) -> io::Result<File> {
    OpenOptions::new()
        .read(true)
        .share_mode(SHARE_ALL)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT)
        .open(path)
}
