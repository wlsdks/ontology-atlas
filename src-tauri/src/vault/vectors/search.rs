//! A question: embedded within ten seconds by the folder's source, then the nearest passages from
//! the folder's in-memory copy, each still held by its file. A failure is a state, never an error.

use super::job::Entry;
use super::memory::SEARCHER_IDLE;
use super::models::{readable_model, Builtin, Runner};
use super::types::{
    failure_of, During, FoundState, PassageHit, VectorFailure, VectorFound, VectorSource,
};
use super::{lock, Vectors};
use crate::llm::embed::{EmbedError, Embedder};
use std::path::Path;
use std::sync::{mpsc, Arc};
use std::time::Duration;
use vault_index::vectors::{Model, Searcher, MAX_HITS};

/// Embedding the question, the model's load included, may take this long in all.
pub(super) const QUESTION_LIMIT: Duration = Duration::from_secs(10);

/// A folder's search copy and when it last answered.
pub(super) struct OpenSearcher {
    model: Model,
    searcher: Searcher,
    last_used: Duration,
}

impl OpenSearcher {
    pub(super) fn idle_past(&self, now: Duration) -> bool {
        now.saturating_sub(self.last_used) >= SEARCHER_IDLE
    }
}

enum Asker {
    Builtin(Arc<dyn Builtin>),
    Runner(Arc<dyn Runner>),
}

impl Asker {
    fn embedder(&self) -> &dyn Embedder {
        match self {
            Asker::Builtin(builtin) => builtin.as_ref(),
            Asker::Runner(runner) => runner.as_ref(),
        }
    }
}

fn failed(failure: VectorFailure) -> VectorFound {
    VectorFound::empty(FoundState::Failed, Some(failure))
}

impl Vectors {
    pub(super) fn search(
        self: &Arc<Self>,
        entry: &Arc<Entry>,
        source: &VectorSource,
        question: &str,
        limit: usize,
    ) -> VectorFound {
        let root = &entry.root;
        let Some(model) = readable_model(root, source) else {
            return self.with_coverage(entry, VectorFound::empty(FoundState::NotReady, None));
        };
        entry.remember(source);
        let question = question.trim();
        if question.is_empty() || limit == 0 {
            return self.with_coverage(entry, VectorFound::empty(FoundState::Ok, None));
        }
        let during = During::Embedding {
            runner: matches!(source, VectorSource::Runner { .. }),
        };
        let asker = match self.asker(source) {
            Ok(asker) => asker,
            Err(error) => return self.with_coverage(entry, failed(failure_of(&error, during))),
        };
        if let Asker::Builtin(builtin) = &asker {
            if !builtin.is_ready() {
                return self.with_coverage(entry, failed(VectorFailure::ModelGone));
            }
            lock(&self.keeper).question(self.clock.now());
            self.start_housekeeping();
        }
        let query = match ask_within(asker, root, question, QUESTION_LIMIT) {
            Ok(query) => query,
            Err(error) => return self.with_coverage(entry, failed(failure_of(&error, during))),
        };
        let found = self.nearest(entry, &model, &query, limit.min(MAX_HITS));
        let found = match found {
            Ok(found) => found,
            Err(error) => {
                log::warn!("search by meaning could not read its store: {error}");
                let state = if error.is_damage() {
                    // Set aside by the crate; the next pass rebuilds it.
                    FoundState::NotReady
                } else {
                    FoundState::Failed
                };
                let failure = (state == FoundState::Failed).then_some(VectorFailure::Write);
                return self.with_coverage(entry, VectorFound::empty(state, failure));
            }
        };
        if found.stale > 0 {
            self.request_update(entry);
        }
        let hits = found
            .hits
            .into_iter()
            .map(|hit| PassageHit {
                path: hit.path,
                line_start: hit.line_start,
                line_end: hit.line_end,
                heading: hit.heading.unwrap_or_default(),
                score: f64::from(hit.score),
            })
            .collect();
        self.with_coverage(
            entry,
            VectorFound {
                state: FoundState::Ok,
                failure: None,
                hits,
                stale_dropped: found.stale as u64,
                files_ready: 0,
                files_total: 0,
            },
        )
    }

    fn asker(&self, source: &VectorSource) -> Result<Asker, EmbedError> {
        Ok(match source {
            VectorSource::Builtin => Asker::Builtin(self.sources.builtin()?),
            VectorSource::Runner { base_url, model } => {
                Asker::Runner(self.sources.runner(base_url, model)?)
            }
        })
    }

    /// The folder's copy answers; one opened for another model, or one whose store went, is
    /// replaced first.
    fn nearest(
        &self,
        entry: &Entry,
        model: &Model,
        query: &[f32],
        limit: usize,
    ) -> vault_index::Result<vault_index::vectors::Found> {
        let now = self.clock.now();
        let mut open = lock(&entry.searcher);
        for _ in 0..2 {
            if open.as_ref().is_none_or(|open| &open.model != model) {
                *open = None;
                let Some(searcher) = Searcher::open(&entry.root, model)? else {
                    return Ok(vault_index::vectors::Found::default());
                };
                *open = Some(OpenSearcher {
                    model: model.clone(),
                    searcher,
                    last_used: now,
                });
            }
            let Some(current) = open.as_mut() else {
                break;
            };
            current.last_used = now;
            let found = current.searcher.nearest(query, limit)?;
            if !found.deleted {
                return Ok(found);
            }
            *open = None;
        }
        Ok(vault_index::vectors::Found::default())
    }

    /// Adds the coverage line's counts: the running job's, or the store's.
    fn with_coverage(&self, entry: &Entry, mut found: VectorFound) -> VectorFound {
        let status = self.status(entry, true, None);
        found.files_ready = status.files_done;
        found.files_total = status.files_total;
        found
    }

    /// Loads the built-in model for a question about to be asked; never downloads.
    pub(super) fn warm(self: &Arc<Self>, source: &VectorSource) {
        if !matches!(source, VectorSource::Builtin) {
            return;
        }
        let Ok(builtin) = self.sources.builtin() else {
            return;
        };
        if builtin.is_ready() {
            lock(&self.keeper).question(self.clock.now());
            self.start_housekeeping();
            builtin.warm();
        }
    }
}

/// The question's vector, or `TimedOut` once `limit` passed; a late answer is dropped.
fn ask_within(
    asker: Asker,
    root: &Path,
    question: &str,
    limit: Duration,
) -> Result<Vec<f32>, EmbedError> {
    let (answer, answered) = mpsc::channel();
    let (root, question) = (root.to_path_buf(), question.to_string());
    let spawned = std::thread::Builder::new()
        .name("vault-vectors-question".into())
        .spawn(move || {
            let _ = answer.send(asker.embedder().embed_query(&root, &question));
        });
    if spawned.is_err() {
        return Err(EmbedError::WorkerStart("thread".into()));
    }
    match answered.recv_timeout(limit) {
        Ok(answer) => answer,
        Err(_) => Err(EmbedError::TimedOut),
    }
}
