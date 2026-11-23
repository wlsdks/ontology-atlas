//! When the session list may be read again: each read starts a 140 MB program, so it is paced.

use std::time::{Duration, Instant};

/// With the same sessions running, one read in this long.
pub(crate) const STEADY_GAP: Duration = Duration::from_secs(10);
/// After a session appears or ends, the next read comes this soon.
pub(crate) const CHANGE_GAP: Duration = Duration::from_secs(1);

/// A Claude Code session as the process read shows it: its pid and start, in seconds.
pub(crate) type SeenSession = (u32, Option<i64>);

#[derive(Default)]
pub(crate) struct Pace {
    last_read: Option<Instant>,
    sessions_at_last_read: Vec<SeenSession>,
}

impl Pace {
    /// Whether a read is due at `now` for these sessions, given in one order; a due read is
    /// recorded as taken. Never due with no session running.
    pub(crate) fn take_turn(&mut self, now: Instant, sessions: &[SeenSession]) -> bool {
        if sessions.is_empty() {
            return false;
        }
        let due = match self.last_read {
            None => true,
            Some(last) => {
                let gap = now.saturating_duration_since(last);
                gap >= STEADY_GAP || (gap >= CHANGE_GAP && self.sessions_at_last_read != sessions)
            }
        };
        if due {
            self.last_read = Some(now);
            self.sessions_at_last_read = sessions.to_vec();
        }
        due
    }

    /// The next ask reads as after a change: at least `CHANGE_GAP` after the last read, never at
    /// once. For a read the person switched off and on again.
    pub(crate) fn expect_change(&mut self) {
        self.sessions_at_last_read.clear();
    }
}
