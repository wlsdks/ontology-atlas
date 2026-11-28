//! The two local audit files a successful write adds to: `.ontology-atlas/activity.jsonl` (one line
//! per write, what the app shows as an agent's activity) and `.ontology-atlas/map-analysis.jsonl`
//! (counts per agent session). Nothing here is sent anywhere, and nothing here can change what a
//! write answers: a line that cannot be written is reported on standard error by the caller.

mod activity_log;
mod agent_heartbeat;
mod map_analysis_lines;
mod map_analysis_record;
mod record_shapes;
mod write_record;

use std::path::PathBuf;
use std::sync::{Mutex, PoisonError};

use confined_files::{SidecarError, VaultSidecar};
use thiserror::Error;

use crate::write_tool::WriteTool;

pub use map_analysis_record::{MapAnalysisRecorder, Recorded, RecorderInputs};
pub use write_record::{
    AbilityShare, ActivityContent, AreaShare, ConceptEffect, NodeWrite, ShareCounts, ShareMeasure,
    WriteDone, WriteRecord,
};

/// Why an audit line was not written.
#[derive(Debug, Error)]
pub enum AuditError {
    #[error(transparent)]
    Sidecar(#[from] SidecarError),
    #[error("the line could not be written as JSON: {0}")]
    Line(#[from] serde_json::Error),
}

/// One server process's audit lines for one vault.
pub struct AuditLog {
    sidecar: VaultSidecar,
    recorder: Mutex<MapAnalysisRecorder>,
}

/// The server's one clock, in milliseconds since the epoch: every time it writes to an audit file
/// or reports in an answer comes from here, so a test or a pinned run replaces it in one place.
pub(crate) fn now_ms() -> i64 {
    #[cfg(feature = "differential-inputs")]
    if let Some(pinned) = crate::pinned_inputs::clock_ms() {
        return pinned;
    }
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |elapsed| {
            i64::try_from(elapsed.as_millis()).unwrap_or(i64::MAX)
        })
}

impl AuditLog {
    pub fn new(vault: PathBuf) -> Self {
        let sidecar = VaultSidecar::new(vault);
        let recorder = MapAnalysisRecorder::new(sidecar.clone(), RecorderInputs::live(now_ms));
        Self {
            sidecar,
            recorder: Mutex::new(recorder),
        }
    }

    /// The name this vault gives the agent that is calling: the name it registered, else the name
    /// its client sent, else none.
    pub fn agent_name(&self, client_name: &str) -> Option<String> {
        agent_heartbeat::agent_name(&self.sidecar, client_name)
    }

    /// Adds what a finished write did to both files. Both are tried even if the first fails; the
    /// first failure is returned.
    pub fn record(
        &self,
        tool: WriteTool,
        client_name: &str,
        record: WriteRecord,
    ) -> Result<(), AuditError> {
        let writes = match record {
            WriteRecord::Nothing => return Ok(()),
            WriteRecord::Wrote {
                activity,
                concepts,
                share,
            } => vec![NodeWrite {
                activity,
                concepts,
                share,
            }],
            WriteRecord::WroteEach(writes) => writes,
        };
        let agent = agent_heartbeat::agent_name(&self.sidecar, client_name);
        let mut first_failure = Ok(());
        for write in writes {
            let activity_result = activity_log::append(
                &self.sidecar,
                write.activity.logged_as.unwrap_or(tool.name()),
                &write.activity,
                agent.as_deref(),
                now_ms(),
            );
            let analysis_result = self
                .recorder
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .record(&write.concepts, agent.as_deref(), write.share)
                .map(|_| ());
            first_failure = first_failure.and(activity_result).and(analysis_result);
        }
        first_failure
    }
}
