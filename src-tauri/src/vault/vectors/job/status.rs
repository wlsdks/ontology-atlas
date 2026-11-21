//! What a folder's status says, built from its running job or its store and last pass, and
//! when it is sent.

use super::super::models::{is_builtin_model, readable_model};
use super::super::types::{ModelBytes, VectorFailure, VectorPhase, VectorSource, VectorStatus};
use super::super::{lock, Vectors};
use super::{Entry, Pass, Run, Stage};
use crate::llm::embed::builtin::ModelStore;
use crate::llm::embed::EmbedError;
use std::sync::atomic::Ordering;
use vault_index::vectors::{Model, Status as Summary};

/// What the progress events last said, so the throttle knows whether anything moved.
#[derive(Default, PartialEq)]
pub(super) struct Said {
    phase: Option<VectorPhase>,
    files_done: u64,
    passages_done: u64,
    current_path: Option<String>,
    model: Option<ModelBytes>,
}

impl Vectors {
    /// What a cut-off download left of the built-in model, said beside `ModelGone` so the screen
    /// offers to continue it rather than to start again.
    fn kept_download(&self) -> Option<ModelBytes> {
        let done = self.sources.builtin().ok()?.downloaded_bytes();
        (done > 0).then(|| ModelBytes {
            done_bytes: done,
            total_bytes: ModelStore::download_bytes(),
            checking: false,
        })
    }

    /// Whether the built-in model cannot answer now: not ready on this computer, a partial download
    /// included, or no model store to keep it in. A pass and the status treat all three alike.
    pub(in crate::vault::vectors) fn builtin_unusable(&self) -> bool {
        !self
            .sources
            .builtin()
            .is_ok_and(|builtin| builtin.is_ready())
    }

    /// Whether the app's model store is there and the built-in model is not ready in it. Unlike
    /// `builtin_unusable`, `false` when there is no model store: then no quiet update is skipped
    /// for it and a stored folder's idle status does not say `modelGone`.
    pub(in crate::vault::vectors) fn builtin_missing_from_store(&self) -> bool {
        self.sources
            .builtin()
            .is_ok_and(|builtin| !builtin.is_ready())
    }

    /// `modelGone` with the store's counts and what a cut-off download kept.
    fn model_gone_status(&self, summary: Option<Summary>) -> VectorStatus {
        let mut gone = VectorStatus::of_phase(VectorPhase::Failed);
        if let Some(summary) = summary {
            fill_counts(&mut gone, &summary, 0, 0);
        }
        gone.failure = Some(VectorFailure::ModelGone);
        gone.failure_detail = Some(EmbedError::ModelNotReady.code().into());
        gone.model = self.kept_download();
        gone
    }

    /// The folder's status: the running job's, else what the store and the last pass say.
    pub(in crate::vault::vectors) fn status(
        &self,
        entry: &Entry,
        enabled: bool,
        source: Option<&VectorSource>,
    ) -> VectorStatus {
        if !enabled {
            let mut off = VectorStatus::of_phase(VectorPhase::Off);
            off.vectors_bytes = vault_index::vectors::vectors_bytes(&entry.root).unwrap_or(0);
            return off;
        }
        let (run, remembered, failure, held, deleted, at_model, busy) = {
            let state = lock(&entry.state);
            (
                // A pass of an older generation was ended by a Delete and speaks no more.
                state
                    .run
                    .clone()
                    .filter(|run| run.generation == state.generation),
                state.source.clone(),
                state.failure.clone(),
                state.held,
                state.deleted,
                state.failure_at_model,
                state.running,
            )
        };
        if deleted {
            return VectorStatus::of_phase(VectorPhase::NotSetUp);
        }
        let vectors_bytes = vault_index::vectors::vectors_bytes(&entry.root).unwrap_or(0);
        let source = source.cloned().or(remembered);
        let model = match &source {
            Some(source) => readable_model(&entry.root, source),
            None => vault_index::vectors::store_model(&entry.root)
                .ok()
                .flatten(),
        };
        let summary = model.as_ref().and_then(|model| self.summary(entry, model));
        // Resume cannot work without the model, so its absence comes first: ahead of a failure
        // and of `stopped`, also for a pass stopped during its download. Only the download the
        // person pressed for, still going, says otherwise, and the failure that download ended
        // with, which says why the model is absent, until the next prepare lets the folder go.
        let downloading = run
            .as_ref()
            .is_some_and(|run| run.may_download && !run.stopped());
        let says_why = held && at_model && failure.is_some();
        if matches!(source, Some(VectorSource::Builtin))
            && !downloading
            && !says_why
            && self.builtin_unusable()
        {
            let mut gone = self.model_gone_status(summary);
            gone.vectors_bytes = vectors_bytes;
            return gone;
        }
        let mut status = match run {
            Some(run) => self.running_status(entry, &run, summary),
            None => self.idle_status(summary, model.as_ref(), failure, held),
        };
        status.vectors_bytes = vectors_bytes;
        status.busy = busy;
        status
    }

    fn summary(&self, entry: &Entry, model: &Model) -> Option<Summary> {
        let mut cached = lock(&entry.summary);
        if let Some((of, summary)) = cached.as_ref() {
            if of == model {
                return *summary;
            }
        }
        let summary = vault_index::vectors::status(&entry.root, model)
            .ok()
            .flatten();
        *cached = Some((model.clone(), summary));
        summary
    }

    fn idle_status(
        &self,
        summary: Option<Summary>,
        model: Option<&Model>,
        failure: Option<(VectorFailure, String)>,
        held: bool,
    ) -> VectorStatus {
        let mut status = VectorStatus::of_phase(VectorPhase::NotSetUp);
        if let Some(summary) = summary {
            fill_counts(&mut status, &summary, 0, 0);
        }
        let kept = summary.is_some_and(|summary| summary.passages_stored > 0);
        if let Some((failure, detail)) = failure {
            status.phase = if kept && failure != VectorFailure::ModelGone {
                VectorPhase::Stopped
            } else {
                VectorPhase::Failed
            };
            status.failure = Some(failure);
            status.failure_detail = Some(detail);
            return status;
        }
        if summary.is_some()
            && model.is_some_and(is_builtin_model)
            && self.builtin_missing_from_store()
        {
            return self.model_gone_status(summary);
        }
        if held {
            status.phase = VectorPhase::Stopped;
            return status;
        }
        let Some(summary) = summary else {
            return status;
        };
        status.phase = if summary.passages_stored >= summary.passages {
            VectorPhase::Ready
        } else {
            VectorPhase::Stopped
        };
        status
    }

    fn running_status(&self, entry: &Entry, run: &Run, cached: Option<Summary>) -> VectorStatus {
        let stage = *lock(&run.stage);
        let base = *lock(&run.base);
        let folder_counts = |status: &mut VectorStatus| match base.or(cached) {
            Some(summary) => {
                let (files, passages) = match base {
                    Some(_) => (run.progress.files_done(), run.progress.passages_done()),
                    None => (0, 0),
                };
                fill_counts(status, &summary, files, passages);
            }
            None => status.files_total = run.listed.load(Ordering::Relaxed),
        };
        if run.stopped() {
            // Stop was asked for: what is in flight may still land, but the person stopped it.
            let mut status = VectorStatus::of_phase(VectorPhase::Stopped);
            folder_counts(&mut status);
            return status;
        }
        // An update of a finished store stays quiet until it knows something changed.
        let quiet = run.pass == Pass::Update && run.finished && stage != Stage::Preparing;
        let waiting = !run.has_turn.load(Ordering::SeqCst) && self.turn.busy_for(&entry.root);
        let phase = match stage {
            _ if quiet => VectorPhase::Ready,
            _ if waiting => VectorPhase::WaitingTurn,
            Stage::Downloading { .. } => VectorPhase::ModelDownloading,
            Stage::Converting => VectorPhase::ModelConverting,
            Stage::Starting | Stage::Planning | Stage::Preparing => VectorPhase::Preparing,
        };
        let mut status = VectorStatus::of_phase(phase);
        let planned = *lock(&run.planned);
        if let (true, Stage::Preparing, Some(planned)) = (run.finished, stage, planned) {
            // The changed files alone: what this pass reads.
            status.updating = true;
            status.files_total = planned.files;
            status.files_done = run.progress.files_done().min(planned.files);
            status.passages_total = planned.passages;
            status.passages_done = run.progress.passages_done().min(planned.passages);
        } else {
            folder_counts(&mut status);
        }
        if phase == VectorPhase::Preparing && stage == Stage::Preparing {
            let reading = run.progress.reading();
            status.current_path = (!reading.is_empty()).then_some(reading);
        }
        if let (
            VectorPhase::ModelDownloading,
            Stage::Downloading {
                done,
                total,
                checking,
            },
        ) = (phase, stage)
        {
            status.model = Some(ModelBytes {
                done_bytes: done,
                total_bytes: total,
                checking,
            });
        }
        status.passages_per_second = lock(&run.rate).per_second(self.clock.now());
        status
    }

    /// Sends the status now: a phase changed.
    pub(in crate::vault::vectors) fn report_phase(&self, entry: &Entry) {
        let status = self.status(entry, true, None);
        let now = self.clock.now();
        {
            let mut throttle = lock(&entry.throttle);
            throttle.0.sent(now);
            throttle.1 = said(&status);
        }
        self.emit.emit(&entry.shown_as, &status);
    }

    /// Sends the status if the throttle allows: progress moved, or two seconds passed.
    pub(in crate::vault::vectors) fn report_progress(&self, entry: &Entry) {
        let Some(run) = entry.running_run() else {
            return;
        };
        let now = self.clock.now();
        lock(&run.rate).record(now, run.progress.passages_done());
        let status = self.status(entry, true, None);
        let next = said(&status);
        {
            let mut throttle = lock(&entry.throttle);
            let (gate, last) = &mut *throttle;
            let changed = *last != next;
            if !gate.due(now, changed) {
                return;
            }
            *last = next;
        }
        self.emit.emit(&entry.shown_as, &status);
    }
}

fn said(status: &VectorStatus) -> Said {
    Said {
        phase: Some(status.phase),
        files_done: status.files_done,
        passages_done: status.passages_done,
        current_path: status.current_path.clone(),
        model: status.model,
    }
}

/// Folder-wide counts: what the store held when the pass began plus what this pass stored.
fn fill_counts(status: &mut VectorStatus, summary: &Summary, files: u64, passages: u64) {
    status.files_total = summary.files;
    status.files_done = (summary.files_ready + summary.files_capped + files).min(summary.files);
    status.passages_total = summary.passages;
    status.passages_done = (summary.passages_stored + passages).min(summary.passages);
}
