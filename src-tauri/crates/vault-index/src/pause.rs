//! Pause points for the crate's own tests (feature `test-hooks`): a test parks a run between two
//! steps and does something there, so an interleaving that threads would leave to chance is fixed.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

type Hook = (PathBuf, Box<dyn FnOnce() + Send>);

static BEFORE_PLAN_LOCK: Mutex<Vec<Hook>> = Mutex::new(Vec::new());

/// Runs `run` once, inside the next `vectors::plan` for the index folder `dir`, after it read the
/// deletion count and before it takes the writer lock.
pub fn before_plan_lock(dir: &Path, run: impl FnOnce() + Send + 'static) {
    let mut hooks = BEFORE_PLAN_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    hooks.push((dir.to_path_buf(), Box::new(run)));
}

pub(crate) fn reached_plan_lock(dir: &Path) {
    let hook = {
        let mut hooks = BEFORE_PLAN_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        hooks
            .iter()
            .position(|(for_dir, _)| for_dir == dir)
            .map(|at| hooks.swap_remove(at).1)
    };
    if let Some(run) = hook {
        run();
    }
}
