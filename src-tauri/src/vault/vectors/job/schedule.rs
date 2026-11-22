//! When a folder's job runs: what a prepare, an arm or a change asks for, and the job's thread
//! running one pass after another until none is asked for.

use super::super::models::readable_model;
use super::super::types::{VectorFailure, VectorSource};
use super::super::{lock, Vectors};
use super::{internal, Ended, Entry, Pass, Run, Stage, Unwinding};
use std::panic::AssertUnwindSafe;
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

/// Whether a store for `source` exists and a prepare once finished it.
fn finished_once(root: &Path, source: &VectorSource) -> bool {
    readable_model(root, source)
        .is_some_and(|model| vault_index::vectors::completed(root, &model).unwrap_or(false))
}

impl Vectors {
    /// Starts or continues the folder's job with `source`, and returns at once. The one call that
    /// chooses a folder's source and lets a held folder go. Only with `download`, the person's
    /// press in the dialog, may its pass fetch the built-in model.
    pub(in crate::vault::vectors) fn prepare(
        self: &Arc<Self>,
        entry: &Arc<Entry>,
        source: VectorSource,
        download: bool,
    ) {
        {
            let mut state = lock(&entry.state);
            state.source = Some(source);
            state.held = false;
            state.deleted = false;
            state.deferred = None;
            state.download |= download;
        }
        self.request(entry, Pass::Prepare);
    }

    /// Arms the folder as `Entry::arm` does. A folder armed now, not paused, whose store a
    /// preparation never finished was cut off by a quit or a crash: it continues once the quiet
    /// wait has passed, with no index pass needed.
    pub(in crate::vault::vectors) fn arm(
        self: &Arc<Self>,
        entry: &Arc<Entry>,
        source: &VectorSource,
        paused: bool,
    ) {
        if !entry.arm(source, paused) || paused {
            return;
        }
        if readable_model(&entry.root, source).is_some() && !finished_once(&entry.root, source) {
            self.defer_update(entry);
        }
    }

    /// A question dropped passages of changed files: someone waits on them, so their update starts
    /// now and ends the quiet wait it covers.
    pub(in crate::vault::vectors) fn update_for_question(self: &Arc<Self>, entry: &Arc<Entry>) {
        lock(&entry.state).deferred = None;
        self.request_update(entry);
    }

    /// The folder changed: a quiet update follows once its index passes go quiet (`tick`).
    pub(in crate::vault::vectors) fn note_change(self: &Arc<Self>, entry: &Arc<Entry>) {
        self.defer_update(entry);
    }

    fn defer_update(self: &Arc<Self>, entry: &Arc<Entry>) {
        let now = self.clock.now();
        {
            let mut state = lock(&entry.state);
            if state.held || state.source.is_none() {
                return;
            }
            state.deferred = Some(match state.deferred {
                Some((first, _)) => (first, now),
                None => (now, now),
            });
        }
        self.start_housekeeping();
    }

    pub(in crate::vault::vectors) fn start_due_updates(self: &Arc<Self>, now: Duration) {
        for entry in self.all_entries() {
            if entry.update_due(now) {
                self.request_update(&entry);
            }
        }
    }

    /// A quiet pass over changed files, only for a folder not held whose vectors for its source
    /// exist, and never while the built-in model is gone (the status says so instead).
    pub(in crate::vault::vectors) fn request_update(self: &Arc<Self>, entry: &Arc<Entry>) {
        let source = {
            let state = lock(&entry.state);
            if state.held {
                return;
            }
            state.source.clone()
        };
        let Some(source) = source else {
            return;
        };
        if readable_model(&entry.root, &source).is_none() {
            return;
        }
        let model_gone =
            matches!(source, VectorSource::Builtin) && self.builtin_missing_from_store();
        if !model_gone {
            self.request(entry, Pass::Update);
        }
    }

    fn request(self: &Arc<Self>, entry: &Arc<Entry>, pass: Pass) {
        {
            let mut state = lock(&entry.state);
            if pass == Pass::Update && state.held {
                return;
            }
            if state.running {
                // One more pass follows; a pass the person asked for outranks an update.
                state.again = Some(match (state.again, pass) {
                    (Some(Pass::Prepare), _) | (_, Pass::Prepare) => Pass::Prepare,
                    _ => Pass::Update,
                });
                return;
            }
            state.running = true;
        }
        // Published before the call returns, so the command's answer is the job's.
        let Some(first) = self.start_run(entry, pass) else {
            entry.ended.notify_all();
            self.report_phase(entry);
            return;
        };
        self.start_housekeeping();
        let vectors = self.clone();
        let job_entry = entry.clone();
        let spawned = std::thread::Builder::new()
            .name("vault-vectors".into())
            .spawn(move || {
                lower_priority();
                vectors.passes(&job_entry, first);
            });
        if let Err(error) = spawned {
            log::warn!("search by meaning job did not start: {error}");
            {
                let mut state = lock(&entry.state);
                state.running = false;
                state.run = None;
            }
            entry.ended.notify_all();
        }
    }

    /// Publishes the next pass's run, or ends the job: a held folder, one with no source, and a
    /// built-in one whose model is absent and whose pass may not fetch it start nothing.
    fn start_run(&self, entry: &Entry, pass: Pass) -> Option<(Arc<Run>, VectorSource)> {
        let mut seen = entry.source();
        loop {
            let facts = seen.as_ref().map(|source| {
                let absent = matches!(source, VectorSource::Builtin) && self.builtin_unusable();
                (absent, finished_once(&entry.root, source))
            });
            let mut state = lock(&entry.state);
            if state.source != seen {
                seen = state.source.clone();
                continue;
            }
            state.again = None;
            let (Some(source), Some((absent, finished))) = (seen, facts) else {
                state.running = false;
                return None;
            };
            if state.held {
                state.running = false;
                return None;
            }
            // The press is taken by the pass it asked for; a later Resume asks again.
            let may_download = pass == Pass::Prepare && std::mem::take(&mut state.download);
            if absent && !may_download {
                state.running = false;
                return None;
            }
            // A pass that must fetch the model says so once it holds the turn.
            let initial = if absent {
                Stage::Downloading {
                    done: 0,
                    total: 0,
                    checking: false,
                }
            } else {
                Stage::Starting
            };
            let builtin = matches!(source, VectorSource::Builtin);
            let run = Arc::new(Run::new(
                pass,
                builtin,
                may_download,
                finished,
                state.generation,
                initial,
            ));
            state.run = Some(run.clone());
            return Some((run, source));
        }
    }

    fn passes(self: &Arc<Self>, entry: &Arc<Entry>, first: (Arc<Run>, VectorSource)) {
        let _unwinding = Unwinding(entry);
        let mut current = first;
        loop {
            let (run, source) = current;
            let ended =
                std::panic::catch_unwind(AssertUnwindSafe(|| self.run_pass(entry, &run, &source)))
                    .unwrap_or_else(|_| internal());
            entry.forget_summary();
            let next = {
                let mut state = lock(&entry.state);
                state.run = None;
                if state.generation == run.generation {
                    state.failure_at_model = matches!(
                        *lock(&run.stage),
                        Stage::Downloading { .. } | Stage::Converting
                    );
                    state.failure = match &ended {
                        // Not a hold and not remembered: the status says it while it is true.
                        Ended::Failed(VectorFailure::ModelGone, _) => None,
                        Ended::Failed(failure, detail) => {
                            state.held = true;
                            state.deferred = None;
                            Some((*failure, detail.clone()))
                        }
                        _ => None,
                    };
                }
                let next = state.again.take();
                if next.is_none() {
                    state.running = false;
                }
                next
            };
            if let Ended::Failed(failure, detail) = &ended {
                log::warn!("search by meaning stopped: {failure:?} ({detail})");
            }
            entry.ended.notify_all();
            self.report_phase(entry);
            let Some(again) = next else {
                return;
            };
            // A Stop since the pass ended holds the folder: the queued pass does not start.
            let Some(next_run) = self.start_run(entry, again) else {
                entry.ended.notify_all();
                self.report_phase(entry);
                return;
            };
            current = next_run;
        }
    }
}

/// The job's thread yields to the person's work: utility quality of service on macOS, the
/// background mode (CPU and I/O) on Windows.
fn lower_priority() {
    #[cfg(target_os = "macos")]
    {
        // SAFETY: changes only the calling thread's own scheduling class.
        let failed =
            unsafe { libc::pthread_set_qos_class_self_np(libc::qos_class_t::QOS_CLASS_UTILITY, 0) };
        if failed != 0 {
            log::warn!("search by meaning job kept its priority ({failed})");
        }
    }
    #[cfg(windows)]
    {
        #[link(name = "kernel32")]
        extern "system" {
            fn GetCurrentThread() -> *mut std::ffi::c_void;
            fn SetThreadPriority(thread: *mut std::ffi::c_void, priority: i32) -> i32;
        }
        const THREAD_MODE_BACKGROUND_BEGIN: i32 = 0x0001_0000;
        // SAFETY: the pseudo-handle names the calling thread and needs no closing.
        if unsafe { SetThreadPriority(GetCurrentThread(), THREAD_MODE_BACKGROUND_BEGIN) } == 0 {
            log::warn!("search by meaning job kept its priority");
        }
    }
}
