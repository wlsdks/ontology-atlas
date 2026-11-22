//! When the built-in model's worker and a folder's in-memory search copy leave memory. The app
//! decides; the worker's own idle limit only covers an app that can no longer tell it to go.

use crate::llm::embed::builtin::worker::WORKER_IDLE;
use std::time::Duration;

/// The worker leaves this long after the last question, or when a job ends and no question came
/// in this long. The one source of the two minutes the spec states.
pub(super) const RELEASE_AFTER: Duration = Duration::from_secs(2 * 60);
const _: () = assert!(
    RELEASE_AFTER.as_secs() < WORKER_IDLE.as_secs(),
    "the app releases the worker before the worker's own idle limit ends it"
);

/// A folder's search copy is dropped after this long without a search (the spec's memory budget).
pub(super) const SEARCHER_IDLE: Duration = Duration::from_secs(10 * 60);

/// The release rule for the built-in model's worker, on the job's clock.
#[derive(Default, Debug)]
pub(super) struct Keeper {
    last_question: Option<Duration>,
    /// Jobs using the built-in model; none is released from under them.
    jobs: usize,
    release_at: Option<Duration>,
}

impl Keeper {
    /// A question, or a warm-up for one about to be asked.
    pub(super) fn question(&mut self, now: Duration) {
        self.last_question = Some(now);
        self.release_at = Some(now + RELEASE_AFTER);
    }

    pub(super) fn job_started(&mut self) {
        self.jobs += 1;
    }

    pub(super) fn job_ended(&mut self, now: Duration) {
        self.jobs = self.jobs.saturating_sub(1);
        if self.jobs > 0 {
            return;
        }
        let asked_lately = self
            .last_question
            .is_some_and(|asked| now.saturating_sub(asked) < RELEASE_AFTER);
        self.release_at = Some(match self.last_question {
            Some(asked) if asked_lately => asked + RELEASE_AFTER,
            _ => now,
        });
    }

    /// Whether the worker should go now; answers `true` once per release.
    pub(super) fn due(&mut self, now: Duration) -> bool {
        if self.jobs > 0 || self.release_at.is_none_or(|at| now < at) {
            return false;
        }
        self.release_at = None;
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_worker_leaves_two_minutes_after_the_last_question_and_never_mid_job() {
        let at = Duration::from_secs;
        let mut keeper = Keeper::default();
        keeper.job_started();
        keeper.question(at(0));
        assert!(!keeper.due(at(600)), "a running job keeps it");
        keeper.job_ended(at(600));
        assert!(
            keeper.due(at(600)),
            "no question in the last two minutes: at once"
        );

        keeper.job_started();
        keeper.question(at(1000));
        keeper.job_ended(at(1060));
        assert!(!keeper.due(at(1060)));
        assert!(!keeper.due(at(1000) + RELEASE_AFTER - Duration::from_millis(1)));
        assert!(keeper.due(at(1000) + RELEASE_AFTER));
        assert!(!keeper.due(at(5000)), "released once");

        keeper.question(at(6000));
        assert!(keeper.due(at(6000) + RELEASE_AFTER));
    }
}
