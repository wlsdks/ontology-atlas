use super::confined::{identity, Phase, PlanningRoot};
use super::scan::{self, Inventory, ScanPhase};
#[cfg(target_os = "macos")]
use std::sync::atomic::{AtomicBool, Ordering};
use std::{
    fs::File,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

#[derive(Default)]
struct State {
    next: u64,
    pending: Option<u64>,
    active: Option<(u64, Arc<PlanningRoot>)>,
    document: Option<DocumentWitness>,
    document_request: u64,
}
struct DocumentWitness {
    generation: u64,
    path: PathBuf,
    token: String,
    file: File,
}
#[derive(Default)]
pub(crate) struct PlanningSession {
    state: Mutex<State>,
    #[cfg(target_os = "macos")]
    picker_busy: Arc<AtomicBool>,
}

#[cfg(target_os = "macos")]
pub(crate) struct PickerPermit(Arc<AtomicBool>);
#[cfg(target_os = "macos")]
impl Drop for PickerPermit {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}
impl PlanningSession {
    #[cfg(target_os = "macos")]
    pub(crate) fn picker_permit(&self) -> Result<PickerPermit, String> {
        self.picker_busy
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map_err(|_| "picker-busy")?;
        Ok(PickerPermit(Arc::clone(&self.picker_busy)))
    }
    pub(crate) fn begin_selection(&self) -> Result<u64, String> {
        let mut state = self.state.lock().map_err(|_| "session-unavailable")?;
        state.next = state.next.checked_add(1).ok_or("session-exhausted")?;
        let ticket = state.next;
        state.pending = Some(ticket);
        Ok(ticket)
    }
    pub(crate) fn cancel_selection(&self, ticket: u64) -> Result<(), String> {
        let mut state = self.state.lock().map_err(|_| "session-unavailable")?;
        if state.pending == Some(ticket) {
            state.pending = None;
        }
        Ok(())
    }
    pub(crate) fn activate(
        &self,
        ticket: u64,
        path: PathBuf,
        opened_selection: File,
    ) -> Result<u64, String> {
        self.activate_with_hook(ticket, path, opened_selection, || {})
    }
    fn activate_with_hook(
        &self,
        ticket: u64,
        path: PathBuf,
        opened_selection: File,
        hook: impl FnOnce(),
    ) -> Result<u64, String> {
        let root = Arc::new(PlanningRoot::new(path, opened_selection)?);
        hook();
        let mut state = self.state.lock().map_err(|_| "session-unavailable")?;
        if state.pending != Some(ticket) {
            return Err("selection-obsolete".into());
        }
        root.verify_root()?;
        state.pending = None;
        state.active = Some((ticket, root));
        state.document = None;
        state.document_request = 0;
        Ok(ticket)
    }
    pub(crate) fn revoke(&self) -> Result<(), String> {
        let mut state = self.state.lock().map_err(|_| "session-unavailable")?;
        state.pending = None;
        state.active = None;
        state.document = None;
        state.document_request = 0;
        Ok(())
    }
    fn selected_root(&self, generation: u64) -> Result<Arc<PlanningRoot>, String> {
        let state = self.state.lock().map_err(|_| "session-unavailable")?;
        let (active, root) = state.active.as_ref().ok_or("no-selection")?;
        if *active != generation {
            return Err("selection-obsolete".into());
        }
        Ok(Arc::clone(root))
    }
    fn verify_generation(&self, generation: u64) -> Result<(), String> {
        let state = self.state.lock().map_err(|_| "session-unavailable")?;
        if !matches!(state.active.as_ref(), Some((active, _)) if *active == generation) {
            return Err("selection-obsolete".into());
        }
        Ok(())
    }
    pub(crate) fn scan_with_hook(
        &self,
        generation: u64,
        max: usize,
        hook: impl FnMut(ScanPhase),
    ) -> Result<Inventory, String> {
        let root = self.selected_root(generation)?;
        let inventory = scan::scan_with_hook(&root, max.min(10_000), hook)?;
        self.verify_generation(generation)?;
        Ok(inventory)
    }
    pub(crate) fn read_with_hook(
        &self,
        generation: u64,
        path: &Path,
        hook: impl FnMut(Phase),
    ) -> Result<Vec<u8>, String> {
        let root = self.selected_root(generation)?;
        let bytes = root.read_with_hook(path, hook)?;
        self.verify_generation(generation)?;
        Ok(bytes)
    }
    pub(crate) fn open_document(
        &self,
        generation: u64,
        path: &Path,
        expected: Option<&str>,
        request: u64,
    ) -> Result<Vec<u8>, String> {
        self.open_document_with_hook(generation, path, expected, request, || {})
    }
    fn open_document_with_hook(
        &self,
        generation: u64,
        path: &Path,
        expected: Option<&str>,
        request: u64,
        hook: impl FnOnce(),
    ) -> Result<Vec<u8>, String> {
        let root = {
            let mut state = self.state.lock().map_err(|_| "session-unavailable")?;
            let (active, root) = state.active.as_ref().ok_or("no-selection")?;
            if *active != generation || request <= state.document_request {
                return Err("selection-obsolete".into());
            }
            let root = Arc::clone(root);
            state.document_request = request;
            root
        };
        let (bytes, file) = root.read_verified(path, |_| {})?;
        hook();
        let mut state = self.state.lock().map_err(|_| "session-unavailable")?;
        if !matches!(state.active.as_ref(), Some((active, _)) if *active == generation)
            || state.document_request != request
        {
            return Err("selection-obsolete".into());
        }
        let token = if let Some(expected) = expected {
            let witness = state.document.as_ref().ok_or("file-changed")?;
            if witness.generation != generation
                || witness.path != path
                || witness.token != expected
                || identity(&witness.file.metadata().map_err(|_| "file-changed")?)
                    != identity(&file.metadata().map_err(|_| "file-changed")?)
            {
                return Err("file-changed".into());
            }
            witness.token.clone()
        } else {
            let token = uuid::Uuid::new_v4().simple().to_string();
            state.document = Some(DocumentWitness {
                generation,
                path: path.to_owned(),
                token: token.clone(),
                file,
            });
            token
        };
        let mut result = token.into_bytes();
        result.extend(bytes);
        Ok(result)
    }
}
#[cfg(test)]
#[path = "session_tests.rs"]
mod tests;
