//! Ending jobs: a stop, a quit, a Delete of a folder's vectors, and a Delete of the model.

use super::super::{lock, Vectors};
use super::Entry;
use std::path::Path;
use std::sync::Arc;
use std::time::{Duration, Instant};

/// Delete of the model waits this long for the jobs using it to stop: each step they can be in
/// (a download chunk, a conversion, the check, a batch) gives up within about a second.
const STOP_WAIT: Duration = Duration::from_secs(5);

impl Vectors {
    /// Holds the folder and asks its job to stop at its next batch, download chunk or model step.
    /// From now on the folder reports `stopped` until the person prepares it again.
    pub(in crate::vault::vectors) fn stop(&self, entry: &Entry) {
        let run = {
            let mut state = lock(&entry.state);
            state.again = None;
            state.held = true;
            state.deferred = None;
            state.run.clone()
        };
        if let Some(run) = run {
            run.request_stop();
        }
        self.turn.wake();
        self.report_phase(entry);
    }

    /// Stops every job, then waits up to `within` for each to end and close its audit line.
    /// `false` when one was still running at the bound; the caller goes on regardless.
    pub(in crate::vault::vectors) fn stop_all(&self, within: Duration) -> bool {
        let entries = self.all_entries();
        for entry in &entries {
            self.stop(entry);
        }
        let deadline = Instant::now() + within;
        entries
            .iter()
            .all(|entry| entry.wait_idle(deadline.saturating_duration_since(Instant::now())))
    }

    /// Stops every matching job for good, holds each out of its plan while `delete` runs, and lets
    /// each folder's search copy and remembered source go. Each folder reports not set up from
    /// now until it is prepared again, unless `delete` failed: then its status says what is on
    /// disk.
    pub(in crate::vault::vectors) fn forget<T, E>(
        &self,
        root: Option<&Path>,
        delete: impl FnOnce() -> Result<T, E>,
    ) -> Result<T, E> {
        let canonical = root.and_then(|root| std::fs::canonicalize(root).ok());
        let mut entries: Vec<Arc<Entry>> = self
            .all_entries()
            .into_iter()
            .filter(|entry| {
                root.is_none_or(|root| {
                    entry.root == root || canonical.as_ref() == Some(&entry.root)
                })
            })
            .collect();
        entries.sort_by(|a, b| a.root.cmp(&b.root));
        for entry in &entries {
            let run = {
                let mut state = lock(&entry.state);
                state.generation += 1;
                state.again = None;
                state.source = None;
                state.failure = None;
                state.held = false;
                state.deleted = true;
                state.deferred = None;
                state.run.clone()
            };
            if let Some(run) = run {
                run.request_stop();
            }
        }
        self.turn.wake();
        let gates: Vec<_> = entries.iter().map(|entry| lock(&entry.plan_gate)).collect();
        let deleted = delete();
        for entry in &entries {
            *lock(&entry.searcher) = None;
            entry.forget_summary();
            if deleted.is_err() {
                lock(&entry.state).deleted = false;
            }
        }
        drop(gates);
        for entry in &entries {
            self.report_phase(entry);
        }
        deleted
    }

    /// Ends every job using the built-in model, then has the model end its worker and delete its
    /// files in one turn, so no question starts a worker between the two.
    pub(in crate::vault::vectors) fn delete_model(&self) -> Result<(), String> {
        let using: Vec<Arc<Entry>> = self
            .all_entries()
            .into_iter()
            .filter(|entry| entry.uses_builtin())
            .collect();
        for entry in &using {
            self.stop(entry);
        }
        if !using.iter().all(|entry| entry.wait_idle(STOP_WAIT)) {
            return Err("vectors-model-in-use".into());
        }
        let builtin = self
            .sources
            .builtin()
            .map_err(|error| error.code().to_string())?;
        builtin.delete().map_err(|error| error.code().to_string())
    }
}
