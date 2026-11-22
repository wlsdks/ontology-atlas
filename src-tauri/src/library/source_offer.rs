//! Records the files Rust offered to the page and reopens one only if it is still the file offered.

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

/// A path Rust handed to the page, and where its copy lands under `sources/`: the
/// `/`-joined path below the root Rust offered it from, never a value the page sent.
#[derive(Clone, Debug)]
pub(crate) struct SourceOffer {
    pub(crate) canonical: PathBuf,
    pub(crate) relative: String,
    identity: FileIdentity,
}

/// The file an offer named. The copy reopens the path, so anything swapped in after the offer
/// (a link to a key, a FIFO, another file) is told apart by this. Windows compares only the
/// length, since std exposes no stable file index there; a reparse point is refused instead.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct FileIdentity {
    device: u64,
    inode: u64,
    length: u64,
}

impl FileIdentity {
    fn of(metadata: &fs::Metadata) -> Self {
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            Self {
                device: metadata.dev(),
                inode: metadata.ino(),
                length: metadata.len(),
            }
        }
        #[cfg(not(unix))]
        {
            Self {
                device: 0,
                inode: 0,
                length: metadata.len(),
            }
        }
    }
}

impl SourceOffer {
    /// Records what is at `canonical` now, without following a link there; only a regular file
    /// can be offered.
    pub(crate) fn of_file(canonical: PathBuf, relative: String) -> Option<Self> {
        let metadata = fs::symlink_metadata(&canonical).ok()?;
        metadata.is_file().then(|| Self {
            identity: FileIdentity::of(&metadata),
            canonical,
            relative,
        })
    }

    pub(crate) fn length(&self) -> u64 {
        self.identity.length
    }
}

/// Reopens an offered file without following a link and without waiting on a FIFO, then
/// requires the very file the offer recorded.
#[cfg(unix)]
pub(super) fn open_offered_file(offer: &SourceOffer) -> Result<fs::File, &'static str> {
    use std::os::unix::fs::OpenOptionsExt;
    let file = fs::OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK)
        .open(&offer.canonical)
        .map_err(open_failure_reason)?;
    let metadata = file.metadata().map_err(|_| "source-unreadable")?;
    if !metadata.is_file() || FileIdentity::of(&metadata) != offer.identity {
        return Err("source-changed-since-offered");
    }
    Ok(file)
}

#[cfg(windows)]
pub(super) fn open_offered_file(offer: &SourceOffer) -> Result<fs::File, &'static str> {
    use std::os::windows::fs::{MetadataExt, OpenOptionsExt};
    const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;
    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0000_0400;
    let file = fs::OpenOptions::new()
        .read(true)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT)
        .open(&offer.canonical)
        .map_err(open_failure_reason)?;
    let metadata = file.metadata().map_err(|_| "source-unreadable")?;
    if metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
        || !metadata.is_file()
        || FileIdentity::of(&metadata) != offer.identity
    {
        return Err("source-changed-since-offered");
    }
    Ok(file)
}

fn open_failure_reason(error: std::io::Error) -> &'static str {
    #[cfg(unix)]
    if error.raw_os_error() == Some(libc::ELOOP) {
        // `O_NOFOLLOW` met a link swapped in after the offer.
        return "source-changed-since-offered";
    }
    match error.kind() {
        std::io::ErrorKind::NotFound => "source-missing",
        _ => "source-unreadable",
    }
}

fn offers_by_key() -> &'static Mutex<HashMap<String, SourceOffer>> {
    static OFFERS: OnceLock<Mutex<HashMap<String, SourceOffer>>> = OnceLock::new();
    OFFERS.get_or_init(|| Mutex::new(HashMap::new()))
}

pub(crate) fn remember_source_offer(offer_key: String, offer: SourceOffer) {
    offers_by_key()
        .lock()
        .unwrap_or_else(|err| err.into_inner())
        .insert(offer_key, offer);
}

pub(crate) fn forget_source_offers(offer_keys: &[String]) {
    let mut offers = offers_by_key()
        .lock()
        .unwrap_or_else(|err| err.into_inner());
    for key in offer_keys {
        offers.remove(key);
    }
}

pub(super) fn take_source_offer(offer_key: &str) -> Option<SourceOffer> {
    offers_by_key()
        .lock()
        .unwrap_or_else(|err| err.into_inner())
        .remove(offer_key)
}

#[cfg(test)]
mod tests;
