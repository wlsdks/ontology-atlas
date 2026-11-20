//! How often a running job tells the WebView where it is, and how fast it goes. Time comes from
//! the job's clock, so tests drive it without waiting.

use std::collections::VecDeque;
use std::time::{Duration, Instant};

/// Progress events at most this often while a job runs.
const MIN_GAP: Duration = Duration::from_millis(250);
/// And at least this often, changed or not, so the screen knows the job is alive.
pub(super) const MAX_GAP: Duration = Duration::from_secs(2);
/// The rate is measured over at least this much of the run.
const RATE_WINDOW: Duration = Duration::from_secs(30);

/// Time since some fixed moment; the app's clock is the monotonic one.
pub(crate) trait Clock: Send + Sync {
    fn now(&self) -> Duration;
}

pub(super) struct MonotonicClock(Instant);

impl MonotonicClock {
    pub(super) fn new() -> Self {
        Self(Instant::now())
    }
}

impl Clock for MonotonicClock {
    fn now(&self) -> Duration {
        self.0.elapsed()
    }
}

/// Whether a progress event is due. A phase change is sent at once and restarts the gaps.
#[derive(Default)]
pub(super) struct Throttle {
    last: Option<Duration>,
}

impl Throttle {
    pub(super) fn due(&mut self, now: Duration, changed: bool) -> bool {
        let since = self.last.map(|last| now.saturating_sub(last));
        let due = match since {
            None => true,
            Some(since) => since >= MAX_GAP || (changed && since >= MIN_GAP),
        };
        if due {
            self.last = Some(now);
        }
        due
    }

    pub(super) fn sent(&mut self, now: Duration) {
        self.last = Some(now);
    }
}

/// Passages per second over the newest stretch of at least `RATE_WINDOW`.
#[derive(Default)]
pub(super) struct Rate {
    samples: VecDeque<(Duration, u64)>,
}

impl Rate {
    pub(super) fn record(&mut self, now: Duration, done: u64) {
        self.samples.push_back((now, done));
        // Keep exactly one sample at least a window old: the start of the stretch measured.
        while self
            .samples
            .get(1)
            .is_some_and(|(at, _)| now.saturating_sub(*at) >= RATE_WINDOW)
        {
            self.samples.pop_front();
        }
    }

    pub(super) fn per_second(&self, now: Duration) -> Option<f64> {
        let (start, done_then) = *self.samples.front()?;
        let (end, done_now) = *self.samples.back()?;
        if now.saturating_sub(start) < RATE_WINDOW || end <= start {
            return None;
        }
        let seconds = (end - start).as_secs_f64();
        Some(done_now.saturating_sub(done_then) as f64 / seconds)
    }
}
