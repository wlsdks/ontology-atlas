//! The app's door to the derived index's rows (`vault_index::rows`): on open the WebView asks
//! which files still match a stored row, builds only the rest, and hands those rows back. Both
//! commands are async and do their work on the blocking pool, never on the main thread. The
//! WebView sends neither command while the search switch is off, so no row file is created then.

use crate::blocking::run_blocking;
use crate::vault::scope::resolve_existing_inside;
use serde::Serialize;
use tauri::ipc::{InvokeBody, Request, Response};
use vault_index::rows::{self, GetRequest, PutRequest};

/// Both bodies are `\n`-separated lines (`vault_index::rows::{GetRequest, PutRequest}`), so 50,000
/// stored values cross the bridge without first being escaped into JSON strings.
fn raw_body(request: &Request<'_>) -> Result<Vec<u8>, String> {
    match request.body() {
        InvokeBody::Raw(bytes) => Ok(bytes.clone()),
        InvokeBody::Json(_) => Err("vault-index-rows-needs-a-raw-body".into()),
    }
}

/// Stored values for the listed paths whose files did not change, and a token for each other
/// one, as one JSON document. Never creates the index.
#[tauri::command]
pub(crate) async fn vault_index_rows_get(request: Request<'_>) -> Result<Response, String> {
    let body = raw_body(&request)?;
    run_blocking(move || {
        let request = GetRequest::decode(&body).map_err(|error| error.to_string())?;
        let root = resolve_existing_inside(&request.root, "")?;
        rows::get(&root, &request.namespace, &request.paths)
            .map(Response::new)
            .map_err(|error| error.to_string())
    })
    .await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct VaultIndexRowsWritten {
    written: usize,
    skipped: usize,
    removed: usize,
}

/// Keeps the rows a build made; each is checked against the disk again first.
#[tauri::command]
pub(crate) async fn vault_index_rows_put(
    request: Request<'_>,
) -> Result<VaultIndexRowsWritten, String> {
    let body = raw_body(&request)?;
    run_blocking(move || {
        let request = PutRequest::decode(&body).map_err(|error| error.to_string())?;
        let root = resolve_existing_inside(&request.root, "")?;
        let report = rows::put(
            &root,
            &request.namespace,
            &request.rows,
            request.retain.as_deref(),
        )
        .map_err(|error| error.to_string())?;
        Ok(VaultIndexRowsWritten {
            written: report.written,
            skipped: report.skipped,
            removed: report.removed,
        })
    })
    .await
}
