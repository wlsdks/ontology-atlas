use super::confined::{identity, open_root, PlanningRoot};
use std::{
    collections::HashSet,
    fs::{self, File},
    path::{Path, PathBuf},
};

struct Candidate {
    requested: PathBuf,
    key: PathBuf,
    canonical: PathBuf,
    opened: File,
}
fn path_key(path: &Path) -> Option<PathBuf> {
    if !path.is_absolute() {
        return None;
    }
    match (path.parent(), path.file_name()) {
        (Some(parent), Some(name)) => fs::canonicalize(parent).ok().map(|p| p.join(name)),
        _ => fs::canonicalize(path).ok(),
    }
}
#[derive(Default)]
pub(super) struct PickerBinding {
    candidate: Option<Candidate>,
    validated: bool,
    rejected: HashSet<PathBuf>,
}
impl PickerBinding {
    // Repeated events at the same path must not adopt a replacement descriptor.
    pub(super) fn observe(&mut self, path: Option<&Path>) -> Result<(), String> {
        let key = path.and_then(path_key);
        if path.is_some_and(|p| self.rejected.contains(p))
            || key.as_ref().is_some_and(|p| self.rejected.contains(p))
        {
            self.candidate = None;
            self.validated = false;
            return Err("selection-changed".into());
        }
        if self.candidate.as_ref().is_some_and(|c| {
            Some(c.requested.as_path()) == path
                || Some(c.key.as_path()) == path
                || Some(&c.key) == key.as_ref()
        }) {
            self.validated = false;
            if path.is_some_and(|p| self.matches(p)) {
                return Ok(());
            }
            if let Some(p) = key {
                self.rejected.insert(p);
            }
            if let Some(candidate) = self.candidate.as_ref() {
                self.rejected.insert(candidate.requested.clone());
                self.rejected.insert(candidate.key.clone());
            }
            self.candidate = None;
            return Err("selection-changed".into());
        }
        self.candidate = None;
        self.validated = false;
        let path = path.ok_or("selection-unavailable")?;
        if !path.is_absolute() {
            return Err("selection-unavailable".into());
        }
        let key = key.ok_or("selection-unavailable")?;
        let canonical = fs::canonicalize(path).map_err(|_| "selection-unavailable")?;
        // Authority starts at descriptor open; earlier replacements cannot be detected.
        let opened = open_root(&canonical)?;
        let selected = fs::metadata(path).map_err(|_| "selection-unavailable")?;
        let metadata = opened.metadata().map_err(|_| "selection-unavailable")?;
        if !metadata.is_dir() || identity(&metadata) != identity(&selected) {
            return Err("selection-changed".into());
        }
        PlanningRoot::new(
            canonical.clone(),
            opened.try_clone().map_err(|_| "selection-unavailable")?,
        )?;
        self.candidate = Some(Candidate {
            requested: path.to_owned(),
            key,
            canonical,
            opened,
        });
        Ok(())
    }
    fn matches(&self, path: &Path) -> bool {
        self.candidate.as_ref().is_some_and(|c| {
            path_key(path).as_ref() == Some(&c.key)
                && fs::canonicalize(path).ok().as_ref() == Some(&c.canonical)
                && fs::metadata(path)
                    .ok()
                    .zip(c.opened.metadata().ok())
                    .is_some_and(|(a, b)| identity(&a) == identity(&b))
                && c.opened
                    .try_clone()
                    .ok()
                    .and_then(|fd| PlanningRoot::new(c.canonical.clone(), fd).ok())
                    .is_some()
        })
    }
    pub(super) fn validate(&mut self, path: &Path) -> bool {
        self.validated = self.matches(path);
        if !self.validated {
            if let Some(candidate) = self.candidate.as_ref() {
                if candidate.requested == path
                    || candidate.key == path
                    || path_key(path).as_ref() == Some(&candidate.key)
                {
                    self.rejected.insert(candidate.requested.clone());
                    self.rejected.insert(candidate.key.clone());
                    self.candidate = None;
                }
            }
        }
        self.validated
    }
    // A cancelled panel can still retain URLs; only its response authorizes.
    pub(super) fn finish(
        &mut self,
        accepted: bool,
        path: Option<&Path>,
    ) -> Result<Option<(PathBuf, File)>, String> {
        if !accepted {
            self.candidate = None;
            self.validated = false;
            return Ok(None);
        }
        if !self.validated || !path.is_some_and(|p| self.matches(p)) {
            self.candidate = None;
            self.validated = false;
            return Err("selection-changed".into());
        }
        let candidate = self.candidate.take().ok_or("selection-unavailable")?;
        self.validated = false;
        Ok(Some((candidate.canonical, candidate.opened)))
    }
}

#[cfg(test)]
#[path = "picker_tests.rs"]
mod tests;
