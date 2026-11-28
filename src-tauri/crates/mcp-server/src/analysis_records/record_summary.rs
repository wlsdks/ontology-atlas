//! One row of the history: what a record is, without its evidence or its answer.

use serde::Serialize;

use super::analysis_record::{AnalysisRecord, RecordKind};
use super::record_value::RecordValue;

#[derive(Serialize)]
pub struct RunSummary {
    id: String,
    #[serde(rename = "recordType")]
    record_type: &'static str,
    #[serde(rename = "fileName")]
    file_name: String,
    #[serde(rename = "createdAt")]
    created_at: String,
    mode: String,
    scope: RecordValue,
    question: String,
    outcome: String,
    qualification: RecordValue,
    findings: usize,
    #[serde(rename = "parentRunId")]
    parent_run_id: RecordValue,
}

#[derive(Serialize)]
pub struct ReviewSummary {
    id: String,
    #[serde(rename = "recordType")]
    record_type: &'static str,
    #[serde(rename = "fileName")]
    file_name: String,
    #[serde(rename = "createdAt")]
    created_at: String,
    #[serde(rename = "runId")]
    run_id: String,
    #[serde(rename = "findingId")]
    finding_id: String,
    disposition: String,
}

#[derive(Serialize)]
#[serde(untagged)]
pub enum RecordSummary {
    Run(Box<RunSummary>),
    Review(ReviewSummary),
}

impl RecordSummary {
    pub fn of(record: &AnalysisRecord, file_name: &str) -> Self {
        let text = |key: &str| record.text_of(key).to_string();
        match record.kind() {
            RecordKind::Run => {
                let request = record.at("request");
                let in_request = |key: &str| {
                    request
                        .get(key)
                        .and_then(RecordValue::as_text)
                        .unwrap_or_default()
                        .to_string()
                };
                Self::Run(Box::new(RunSummary {
                    id: text("id"),
                    record_type: "run",
                    file_name: file_name.to_string(),
                    created_at: text("createdAt"),
                    mode: text("mode"),
                    scope: record.at("scope").clone(),
                    question: in_request("text"),
                    outcome: record
                        .at("origin")
                        .get("outcome")
                        .and_then(RecordValue::as_text)
                        .unwrap_or_default()
                        .to_string(),
                    qualification: record.at("qualification").clone(),
                    findings: record.at("findings").as_list().map_or(0, <[_]>::len),
                    parent_run_id: request
                        .get("parentRunId")
                        .cloned()
                        .unwrap_or(RecordValue::Null),
                }))
            }
            RecordKind::Review => Self::Review(ReviewSummary {
                id: text("id"),
                record_type: "review",
                file_name: file_name.to_string(),
                created_at: text("createdAt"),
                run_id: text("runId"),
                finding_id: text("findingId"),
                disposition: text("disposition"),
            }),
        }
    }
}
