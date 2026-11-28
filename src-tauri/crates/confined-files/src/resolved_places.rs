//! Where each path a [`crate::DiskSource`] was asked about really is, kept for the life of that
//! source.
//!
//! A call asks the same questions of one path several times (is it there, what kind is it, may it
//! be read) and a path that is not there is resolved by walking up to the nearest folder that is.
//! Each of those is a `realpath` per name along the way, which is the dearest thing the call does
//! to the disk. A source is made for one call, so the answers are kept no longer than the call.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, PoisonError};

use crate::source_access::Refusal;

/// Answers kept at most. A call over a repository this large still resolves every path; only the
/// paths after the limit are resolved again each time they are asked about.
const MAX_KEPT: usize = 16 * 1024;

/// The nearest place that is there for a path.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct NearestPlace {
    /// The place with every link resolved.
    pub real: PathBuf,
    /// Whether it is the path asked about, not a folder above it.
    pub is_the_path: bool,
}

pub(crate) type Resolution = Result<NearestPlace, Refusal>;

#[derive(Default)]
pub(crate) struct ResolvedPlaces {
    kept: Mutex<HashMap<PathBuf, Resolution>>,
}

impl ResolvedPlaces {
    pub fn recall(&self, path: &Path) -> Option<Resolution> {
        self.kept
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .get(path)
            .cloned()
    }

    pub fn remember(&self, path: &Path, resolution: &Resolution) {
        let mut kept = self.kept.lock().unwrap_or_else(PoisonError::into_inner);
        if kept.len() < MAX_KEPT {
            kept.insert(path.to_path_buf(), resolution.clone());
        }
    }
}
