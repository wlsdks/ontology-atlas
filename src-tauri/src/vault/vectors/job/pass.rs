//! One pass: take the turn, make the model ready, list the folder, plan, and prepare batch by
//! batch, while a ticker reports progress.

use super::super::failure::{failure_detail, During, ModelFailedDetail, ModelStep};
use super::super::models::{builtin_model, model_name, readable_model, Builtin, SourceModel};
use super::super::types::{VectorFailure, VectorSource};
use super::super::{lock, Vectors};
use super::{Ended, Entry, Pass, Run, Stage};
use crate::llm::embed::builtin::{Progress, Stage as ModelStage};
use crate::llm::embed::{BuildPlan, EmbedError, RunEnd};
use std::cell::Cell;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use vault_index::vectors::{Model, PrepareError};

/// How often a running job's ticker looks at its progress; the throttle decides what is sent.
const TICK: Duration = Duration::from_millis(250);

fn failed(error: &EmbedError, during: During) -> Ended {
    let (failure, detail) = failure_detail(error, during, ModelStep::Answer);
    Ended::Failed(failure, detail)
}

/// A failure while the worker converts or checks the model; the download is kept.
fn model_failed(error: &EmbedError, step: ModelStage) -> Ended {
    let step = if step == ModelStage::Check {
        ModelStep::Check
    } else {
        ModelStep::Convert
    };
    let (failure, detail) = failure_detail(error, During::ModelConvert, step);
    Ended::Failed(failure, detail)
}

/// The built-in model is not on this computer and this pass may not fetch it. Not a hold: the
/// status says so for as long as it is true.
fn model_gone() -> Ended {
    Ended::Failed(
        VectorFailure::ModelGone,
        EmbedError::ModelNotReady.code().into(),
    )
}

/// The built-in model in use by a job: counted for the release rule until the job ends.
struct BuiltinInUse<'v>(&'v Vectors);

impl<'v> BuiltinInUse<'v> {
    fn start(vectors: &'v Vectors) -> Self {
        lock(&vectors.keeper).job_started();
        Self(vectors)
    }
}

impl Drop for BuiltinInUse<'_> {
    fn drop(&mut self) {
        let now = self.0.clock.now();
        lock(&self.0.keeper).job_ended(now);
        self.0.release_due();
    }
}

/// Wakes a running job's reporter until the job ends.
struct Ticker {
    done: Arc<AtomicBool>,
    thread: Option<std::thread::JoinHandle<()>>,
}

impl Drop for Ticker {
    fn drop(&mut self) {
        self.done.store(true, Ordering::SeqCst);
        if let Some(thread) = self.thread.take() {
            thread.thread().unpark();
            let _ = thread.join();
        }
    }
}

impl Vectors {
    pub(super) fn run_pass(
        self: &Arc<Self>,
        entry: &Arc<Entry>,
        run: &Arc<Run>,
        source: &VectorSource,
    ) -> Ended {
        let _ticker = self.start_ticker(entry);
        let mut on_wait = || self.report_phase(entry);
        let Some(_turn) = self.turn.take(&entry.root, &|| run.stopped(), &mut on_wait) else {
            return Ended::Stopped;
        };
        run.has_turn.store(true, Ordering::SeqCst);
        self.report_phase(entry);
        let _in_use = run.builtin.then(|| BuiltinInUse::start(self));
        let (active, model) = match self.activate(entry, run, source) {
            Ok(active) => active,
            Err(ended) => return ended,
        };
        self.prepare_folder(entry, run, &active, &model)
    }

    /// The source's embedder and the store's model, the built-in model made ready first.
    fn activate(
        &self,
        entry: &Entry,
        run: &Run,
        source: &VectorSource,
    ) -> Result<(SourceModel, Model), Ended> {
        match source {
            VectorSource::Builtin => {
                let builtin = self
                    .sources
                    .builtin()
                    .map_err(|error| failed(&error, During::ModelPrepare))?;
                if !builtin.is_ready() {
                    self.make_model_ready(entry, run, builtin.as_ref())?;
                }
                Ok((SourceModel::Builtin(builtin), builtin_model()))
            }
            VectorSource::Runner { base_url, model } => {
                let during = During::Embedding { runner: true };
                let runner = self
                    .sources
                    .runner(base_url, model)
                    .map_err(|error| failed(&error, during))?;
                let dimensions = match readable_model(&entry.root, source) {
                    Some(stored) => stored.dimensions,
                    None => match runner.dimensions() {
                        Ok(Some(dimensions)) => dimensions,
                        Ok(None) => {
                            return Err(Ended::Failed(
                                VectorFailure::ModelMissing,
                                "vectors-dimensions-unknown".into(),
                            ))
                        }
                        Err(error) => return Err(failed(&error, during)),
                    },
                };
                let model = Model {
                    name: model_name(source),
                    dimensions,
                };
                Ok((SourceModel::Runner(runner), model))
            }
        }
    }

    /// Downloads, converts and checks the built-in model, only in the pass the person's download
    /// press started.
    fn make_model_ready(
        &self,
        entry: &Entry,
        run: &Run,
        builtin: &dyn Builtin,
    ) -> Result<(), Ended> {
        if !run.may_download {
            return Err(model_gone());
        }
        // The worker maps the weights; nothing may hold them while the files are replaced.
        builtin.release();
        run.set_stage(Stage::Downloading {
            done: 0,
            total: 0,
            checking: false,
        });
        self.report_phase(entry);
        let step = Cell::new(ModelStage::Verify);
        let mut on_progress = |progress: &Progress| {
            step.set(progress.stage);
            let stage = match progress.stage {
                ModelStage::Verify | ModelStage::Download => Stage::Downloading {
                    done: progress.done,
                    total: progress.total,
                    checking: progress.stage == ModelStage::Verify,
                },
                ModelStage::Convert | ModelStage::Check => Stage::Converting,
            };
            let phase_changed =
                std::mem::discriminant(&*lock(&run.stage)) != std::mem::discriminant(&stage);
            run.set_stage(stage);
            if phase_changed {
                self.report_phase(entry);
            } else {
                self.report_progress(entry);
            }
        };
        match builtin.prepare(&entry.root, &run.stop, &mut on_progress) {
            Ok(()) if run.stopped() => Err(Ended::Stopped),
            Ok(()) => Ok(()),
            Err(EmbedError::Cancelled) => Err(Ended::Stopped),
            Err(error) => Err(match step.get() {
                ModelStage::Convert | ModelStage::Check => model_failed(&error, step.get()),
                ModelStage::Verify | ModelStage::Download => failed(&error, During::ModelPrepare),
            }),
        }
    }

    fn prepare_folder(
        &self,
        entry: &Entry,
        run: &Run,
        active: &SourceModel,
        model: &Model,
    ) -> Ended {
        let root = &entry.root;
        let Ok(files) = self.sources.markdown_files(root) else {
            return Ended::Failed(VectorFailure::Unreadable, "vectors-walk-failed".into());
        };
        run.listed.store(files.len() as u64, Ordering::Relaxed);
        // The model's download and fit before this pass embed nothing; they never count toward its rate.
        lock(&run.rate).restart();
        run.set_stage(Stage::Planning);
        self.report_phase(entry);
        let planned = {
            let _gate = lock(&entry.plan_gate);
            if lock(&entry.state).generation != run.generation {
                return Ended::Deleted;
            }
            if run.stopped() {
                return Ended::Stopped;
            }
            let store = vault_index::vectors::store_model(root).ok().flatten();
            if run.pass == Pass::Update && store.as_ref() != Some(model) {
                // The store went since the update was asked for: it is not made again.
                return Ended::Done;
            }
            vault_index::vectors::plan(root, model, &files, &run.progress)
        };
        let plan = match planned {
            Ok(plan) => plan,
            Err(vault_index::Error::Cancelled) => return Ended::Stopped,
            Err(vault_index::Error::Deleted) => return Ended::Deleted,
            Err(error) => {
                log::warn!("search by meaning could not plan: {error}");
                return Ended::Failed(VectorFailure::Write, "vectors-store-failed".into());
            }
        };
        *lock(&run.base) = vault_index::vectors::status(root, model).ok().flatten();
        let remaining = plan.remaining();
        *lock(&run.planned) = Some(remaining);
        if remaining.passages == 0 {
            // Nothing to embed: `prepare` only records that the store is finished.
            let finished = vault_index::vectors::prepare(plan, &run.progress, |_: &[&str]| {
                Err::<Vec<Vec<f32>>, _>(EmbedError::BatchEmpty)
            });
            return match finished {
                Ok(_) => Ended::Done,
                Err(PrepareError::Stopped) => Ended::Stopped,
                Err(PrepareError::Deleted) => Ended::Deleted,
                Err(_) => Ended::Failed(VectorFailure::Write, "vectors-store-failed".into()),
            };
        }
        run.set_stage(Stage::Preparing);
        self.report_phase(entry);
        let wide = |count: u64| usize::try_from(count).unwrap_or(usize::MAX);
        let build_plan = BuildPlan {
            files: wide(remaining.files),
            passages: wide(remaining.passages),
            chars: wide(remaining.chars),
        };
        let during = active.during();
        let mut session = match active.embedder().start_build(root, build_plan) {
            Ok(session) => session,
            Err(error) => return failed(&error, during),
        };
        let outcome = vault_index::vectors::prepare(plan, &run.progress, |texts: &[&str]| {
            let vectors = session.embed_batch_until(texts, &run.stop);
            self.report_progress(entry);
            vectors
        });
        let (end, ended) = match outcome {
            Ok(prepared) => {
                log::info!(
                    "search by meaning prepared {} passage(s) of {} file(s) with {}",
                    prepared.passages,
                    prepared.files,
                    active.embedder().model()
                );
                (RunEnd::Complete, Ended::Done)
            }
            Err(PrepareError::Stopped | PrepareError::Embed(EmbedError::Cancelled)) => {
                (RunEnd::Stopped, Ended::Stopped)
            }
            Err(PrepareError::Deleted) => (RunEnd::Stopped, Ended::Deleted),
            Err(PrepareError::Embed(error)) => (RunEnd::Failed, failed(&error, during)),
            Err(PrepareError::Refused(refusal)) => {
                log::warn!("search by meaning refused the model's answer: {refusal}");
                (
                    RunEnd::Failed,
                    Ended::Failed(
                        VectorFailure::ModelFailed,
                        ModelFailedDetail::Check.as_str().into(),
                    ),
                )
            }
            Err(PrepareError::Index(error)) => {
                log::warn!("search by meaning could not write: {error}");
                (
                    RunEnd::Failed,
                    Ended::Failed(VectorFailure::Write, "vectors-store-failed".into()),
                )
            }
        };
        if let Err(error) = session.finish(end) {
            log::error!("search by meaning run has no closing audit line: {error}");
        }
        ended
    }

    fn start_ticker(self: &Arc<Self>, entry: &Arc<Entry>) -> Option<Ticker> {
        if !self.background {
            return None;
        }
        let done = Arc::new(AtomicBool::new(false));
        let (vectors, entry, run_done) = (self.clone(), entry.clone(), done.clone());
        let thread = std::thread::Builder::new()
            .name("vault-vectors-progress".into())
            .spawn(move || {
                while !run_done.load(Ordering::SeqCst) {
                    std::thread::park_timeout(TICK);
                    vectors.report_progress(&entry);
                }
            })
            .ok()?;
        Some(Ticker {
            done,
            thread: Some(thread),
        })
    }
}
