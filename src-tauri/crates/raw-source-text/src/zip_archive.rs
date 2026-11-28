//! The entries of a ZIP file (a DOCX or an XLSX is one), unpacked on request and never past a
//! budget.
//!
//! A ZIP in a vault is a stranger's file, so nothing it declares is believed: an entry's inflated
//! size is capped at what it declares and at what is left of the budget one read may unpack, the
//! compressed bytes one read may take never exceed the file's own length (two entries that point
//! at the same data are refused), and every offset is checked against the file before it is read.
//! Only STORE and DEFLATE are read; an encrypted or ZIP64 entry is refused with its own words.

use std::collections::HashMap;

use miniz_oxide::inflate::{decompress_to_vec_with_limit, TINFLStatus};

/// Bytes one read may unpack across a ZIP's entries, each entry unpacked once.
pub const UNPACK_BUDGET_BYTES: usize = 64 * 1024 * 1024;

const END_RECORD: [u8; 4] = [0x50, 0x4b, 0x05, 0x06];
const CENTRAL_RECORD: [u8; 4] = [0x50, 0x4b, 0x01, 0x02];
const LOCAL_RECORD: [u8; 4] = [0x50, 0x4b, 0x03, 0x04];
const END_RECORD_BYTES: usize = 22;
const CENTRAL_RECORD_BYTES: usize = 46;
const LOCAL_RECORD_BYTES: usize = 30;
/// A ZIP comment is at most 64 KiB, and the end record sits in front of it.
const COMMENT_MAX_BYTES: usize = 0xffff;
/// The value of a size field that says the real size is in a ZIP64 extra field.
const ZIP64_MARKER: u32 = 0xffff_ffff;

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum ArchiveFault {
    #[error("it is too short to be a ZIP file")]
    TooShort,
    #[error("it has no end-of-central-directory record, so it is not a ZIP file")]
    NoEndRecord,
    #[error("its central directory is damaged")]
    DamagedDirectory,
    #[error("the entry `{name}` is damaged")]
    DamagedEntry { name: String },
    #[error("the entry `{name}` uses compression method {method}, which is not supported")]
    UnsupportedMethod { name: String, method: u16 },
    #[error("the entry `{name}` is stored in ZIP64 form, which is not supported")]
    Zip64 { name: String },
    #[error("the entry `{name}` would take this read past the file's {file_bytes} bytes: its data overlaps an entry already read")]
    Overlap { name: String, file_bytes: usize },
    #[error("the entry `{name}` inflates past {limit} bytes, more than it declares or than one read unpacks")]
    InflatesPastLimit { name: String, limit: usize },
    #[error("the entry `{name}` inflated to {actual} bytes, and declares {declared}")]
    WrongInflatedSize {
        name: String,
        actual: usize,
        declared: usize,
    },
    #[error("the entry `{name}` cannot be inflated")]
    NotDeflate { name: String },
    #[error("the entry `{name}` would take this read past {UNPACK_BUDGET_BYTES} unpacked bytes, the most one read unpacks")]
    PastUnpackBudget { name: String },
}

#[derive(Debug, Clone)]
struct EntryRecord {
    method: u16,
    compressed_size: u32,
    uncompressed_size: u32,
    local_offset: usize,
}

pub struct ZipArchive<'a> {
    bytes: &'a [u8],
    entries: HashMap<String, EntryRecord>,
    unpack_left: usize,
    compressed_left: usize,
}

fn le16(bytes: &[u8], at: usize) -> Option<u16> {
    let pair: [u8; 2] = bytes.get(at..at.checked_add(2)?)?.try_into().ok()?;
    Some(u16::from_le_bytes(pair))
}

fn le32(bytes: &[u8], at: usize) -> Option<u32> {
    let quad: [u8; 4] = bytes.get(at..at.checked_add(4)?)?.try_into().ok()?;
    Some(u32::from_le_bytes(quad))
}

fn to_usize(value: u32) -> usize {
    usize::try_from(value).unwrap_or(usize::MAX)
}

impl<'a> ZipArchive<'a> {
    /// Reads the central directory. When two entries share a name, the later one is the entry.
    pub fn open(bytes: &'a [u8]) -> Result<Self, ArchiveFault> {
        if bytes.len() < END_RECORD_BYTES {
            return Err(ArchiveFault::TooShort);
        }
        let last_start = bytes.len() - END_RECORD_BYTES;
        let floor = last_start.saturating_sub(COMMENT_MAX_BYTES);
        let end = (floor..=last_start)
            .rev()
            .find(|&at| bytes.get(at..at + 4) == Some(&END_RECORD))
            .ok_or(ArchiveFault::NoEndRecord)?;
        let count = le16(bytes, end + 10).ok_or(ArchiveFault::DamagedDirectory)?;
        let mut offset = le32(bytes, end + 16)
            .map(to_usize)
            .ok_or(ArchiveFault::DamagedDirectory)?;
        let mut entries = HashMap::new();
        for _ in 0..count {
            if bytes.get(offset..offset.saturating_add(4)) != Some(&CENTRAL_RECORD) {
                return Err(ArchiveFault::DamagedDirectory);
            }
            let damaged = || ArchiveFault::DamagedDirectory;
            let name_length = usize::from(le16(bytes, offset + 28).ok_or_else(damaged)?);
            let extra_length = usize::from(le16(bytes, offset + 30).ok_or_else(damaged)?);
            let comment_length = usize::from(le16(bytes, offset + 32).ok_or_else(damaged)?);
            let name_start = offset + CENTRAL_RECORD_BYTES;
            let name = String::from_utf8_lossy(
                bytes
                    .get(name_start..name_start + name_length)
                    .ok_or_else(damaged)?,
            )
            .into_owned();
            entries.insert(
                name,
                EntryRecord {
                    method: le16(bytes, offset + 10).ok_or_else(damaged)?,
                    compressed_size: le32(bytes, offset + 20).ok_or_else(damaged)?,
                    uncompressed_size: le32(bytes, offset + 24).ok_or_else(damaged)?,
                    local_offset: to_usize(le32(bytes, offset + 42).ok_or_else(damaged)?),
                },
            );
            offset = name_start + name_length + extra_length + comment_length;
        }
        Ok(Self {
            bytes,
            entries,
            unpack_left: UNPACK_BUDGET_BYTES,
            compressed_left: bytes.len(),
        })
    }

    /// The unpacked bytes of the entry `name`, or `None` when the file has none by that name.
    pub fn unpack(&mut self, name: &str) -> Result<Option<Vec<u8>>, ArchiveFault> {
        let Some(entry) = self.entries.get(name).cloned() else {
            return Ok(None);
        };
        let damaged = || ArchiveFault::DamagedEntry {
            name: name.to_string(),
        };
        if entry.compressed_size == ZIP64_MARKER {
            return Err(ArchiveFault::Zip64 {
                name: name.to_string(),
            });
        }
        let local = entry.local_offset;
        if self.bytes.get(local..local.saturating_add(4)) != Some(&LOCAL_RECORD) {
            return Err(damaged());
        }
        let local_name = usize::from(le16(self.bytes, local + 26).ok_or_else(damaged)?);
        let local_extra = usize::from(le16(self.bytes, local + 28).ok_or_else(damaged)?);
        let start = local + LOCAL_RECORD_BYTES + local_name + local_extra;
        let end = start
            .saturating_add(to_usize(entry.compressed_size))
            .min(self.bytes.len());
        let raw = self.bytes.get(start..end).ok_or_else(damaged)?;
        if raw.len() > self.compressed_left {
            return Err(ArchiveFault::Overlap {
                name: name.to_string(),
                file_bytes: self.bytes.len(),
            });
        }
        self.compressed_left -= raw.len();
        let unpacked = match entry.method {
            0 => raw.to_vec(),
            8 => self.inflate(name, raw, &entry)?,
            method => {
                return Err(ArchiveFault::UnsupportedMethod {
                    name: name.to_string(),
                    method,
                })
            }
        };
        if unpacked.len() > self.unpack_left {
            return Err(ArchiveFault::PastUnpackBudget {
                name: name.to_string(),
            });
        }
        self.unpack_left -= unpacked.len();
        Ok(Some(unpacked))
    }

    fn inflate(
        &self,
        name: &str,
        raw: &[u8],
        entry: &EntryRecord,
    ) -> Result<Vec<u8>, ArchiveFault> {
        let declared_size = entry.uncompressed_size != ZIP64_MARKER;
        let declared = to_usize(entry.uncompressed_size);
        let limit = if declared_size {
            declared.min(self.unpack_left)
        } else {
            self.unpack_left
        }
        .max(1);
        let out = decompress_to_vec_with_limit(raw, limit).map_err(|error| {
            if error.status == TINFLStatus::HasMoreOutput {
                ArchiveFault::InflatesPastLimit {
                    name: name.to_string(),
                    limit,
                }
            } else {
                ArchiveFault::NotDeflate {
                    name: name.to_string(),
                }
            }
        })?;
        if declared_size && out.len() != declared {
            return Err(ArchiveFault::WrongInflatedSize {
                name: name.to_string(),
                actual: out.len(),
                declared,
            });
        }
        Ok(out)
    }
}
