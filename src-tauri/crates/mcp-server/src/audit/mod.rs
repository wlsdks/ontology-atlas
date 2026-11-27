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
    AbilityShare, ActivityContent, AreaShare, ConceptEffect, ShareCounts, ShareMeasure, WriteDone,
    WriteRecord,
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

fn now_ms() -> i64 {
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

    /// Adds what a finished write did to both files. Both are tried even if the first fails; the
    /// first failure is returned.
    pub fn record(
        &self,
        tool: WriteTool,
        client_name: &str,
        record: WriteRecord,
    ) -> Result<(), AuditError> {
        let WriteRecord::Wrote {
            activity,
            concepts,
            share,
        } = record
        else {
            return Ok(());
        };
        let agent = agent_heartbeat::agent_name(&self.sidecar, client_name);
        let activity_result = activity_log::append(
            &self.sidecar,
            tool.name(),
            &activity,
            agent.as_deref(),
            now_ms(),
        );
        let analysis_result = self
            .recorder
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .record(&concepts, agent.as_deref(), share)
            .map(|_| ());
        activity_result.and(analysis_result)
    }
}
