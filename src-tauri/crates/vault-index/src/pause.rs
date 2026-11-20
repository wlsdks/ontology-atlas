//! Pause points for the crate's own tests (feature `test-hooks`): a test parks a run between two
//! steps and does something there, so an interleaving that threads would leave to chance is fixed.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// Where a run can be parked.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Point {
    /// `vectors::plan`, after it read the deletion count and before it takes the writer lock.
    BeforePlanLock,
    /// `vectors::plan`, after each batch of files it forgot or read was written.
    AfterPlanBatch,
}

type Hook = (Point, PathBuf, Box<dyn FnOnce() + Send>);

static HOOKS: Mutex<Vec<Hook>> = Mutex::new(Vec::new());

/// Runs `run` once, the next time a run for the index folder `dir` reaches `point`.
pub fn at(point: Point, dir: &Path, run: impl FnOnce() + Send + 'static) {
    let mut hooks = HOOKS
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    hooks.push((point, dir.to_path_buf(), Box::new(run)));
}

pub(crate) fn reached(point: Point, dir: &Path) {
    let hook = {
        let mut hooks = HOOKS
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        hooks
            .iter()
            .position(|(at, for_dir, _)| *at == point && for_dir == dir)
            .map(|found| hooks.swap_remove(found).2)
    };
    if let Some(run) = hook {
        run();
    }
}
