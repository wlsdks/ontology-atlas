//! The app's one model turn, so one job at a time uses a model.

use super::super::lock;
use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::{Condvar, Mutex};
use std::time::Duration;

/// The app's one model turn: jobs take it in the order they asked.
#[derive(Default)]
pub(in crate::vault::vectors) struct Turn {
    state: Mutex<TurnState>,
    changed: Condvar,
}

#[derive(Default)]
struct TurnState {
    holder: Option<PathBuf>,
    waiting: VecDeque<PathBuf>,
}

pub(super) struct TurnHeld<'t>(&'t Turn);

impl Drop for TurnHeld<'_> {
    fn drop(&mut self) {
        lock(&self.0.state).holder = None;
        self.0.changed.notify_all();
    }
}

impl Turn {
    /// Waits for the turn; `on_wait` runs once if another folder holds it. `None` once `stopped`.
    pub(super) fn take(
        &self,
        root: &Path,
        stopped: &dyn Fn() -> bool,
        on_wait: &mut dyn FnMut(),
    ) -> Option<TurnHeld<'_>> {
        let mut state = lock(&self.state);
        state.waiting.push_back(root.to_path_buf());
        let mut told = false;
        loop {
            if stopped() {
                state.waiting.retain(|waiting| waiting != root);
                drop(state);
                self.changed.notify_all();
                return None;
            }
            let first = state.waiting.front().is_some_and(|first| first == root);
            if state.holder.is_none() && first {
                state.waiting.pop_front();
                state.holder = Some(root.to_path_buf());
                return Some(TurnHeld(self));
            }
            if !told {
                told = true;
                drop(state);
                on_wait();
                state = lock(&self.state);
                continue;
            }
            // Woken by a release or a stop; the bound only covers a wake that was missed.
            state = self
                .changed
                .wait_timeout(state, Duration::from_millis(200))
                .map(|(state, _)| state)
                .unwrap_or_else(|poisoned| poisoned.into_inner().0);
        }
    }

    /// Whether another folder holds the turn or would take it first.
    pub(super) fn busy_for(&self, root: &Path) -> bool {
        let state = lock(&self.state);
        state.holder.as_ref().is_some_and(|holder| holder != root)
            || state.waiting.front().is_some_and(|first| first != root)
    }

    pub(super) fn wake(&self) {
        self.changed.notify_all();
    }
}
