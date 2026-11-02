use super::PlanningSession;
use tauri::State;

#[derive(serde::Serialize)]
pub(crate) struct Selection {
    generation: u64,
    folder: String,
    path: String,
}

#[tauri::command]
pub(crate) fn planning_supported() -> bool {
    cfg!(target_os = "macos")
}

#[tauri::command]
pub(crate) async fn planning_pick_folder<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    session: State<'_, PlanningSession>,
    error_message: String,
) -> Result<Option<Selection>, String> {
    #[cfg(target_os = "macos")]
    {
        let permit = session.picker_permit()?;
        let ticket = session.begin_selection()?;
        let (sender, receiver) = tokio::sync::oneshot::channel();
        if app
            .run_on_main_thread(move || {
                let _permit = permit;
                let _ = sender.send(super::macos_panel::choose_folder(&error_message));
            })
            .is_err()
        {
            session.cancel_selection(ticket)?;
            return Err("picker-unavailable".into());
        }
        let selection = match receiver.await {
            Ok(Ok(value)) => value,
            Ok(Err(error)) => {
                session.cancel_selection(ticket)?;
                return Err(error);
            }
            Err(_) => {
                session.cancel_selection(ticket)?;
                return Err("picker-unavailable".into());
            }
        };
        match selection {
            None => {
                session.cancel_selection(ticket)?;
                Ok(None)
            }
            Some((path, opened)) => {
                let folder = path
                    .file_name()
                    .ok_or("selection-unavailable")?
                    .to_string_lossy()
                    .into_owned();
                let verified_path = path.to_string_lossy().into_owned();
                let generation = session.activate(ticket, path, opened)?;
                Ok(Some(Selection {
                    generation,
                    folder,
                    path: verified_path,
                }))
            }
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, session, error_message);
        Err("planning-picker-unavailable".into())
    }
}

#[tauri::command(async)]
pub(crate) fn planning_scan(
    session: State<'_, PlanningSession>,
    generation: u64,
) -> Result<serde_json::Value, String> {
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        let report = session.scan_with_hook(generation, 10_000, |_| {})?;
        serde_json::to_value(report).map_err(|_| "report-unavailable".into())
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        let _ = (session, generation);
        Err("planning-unavailable".into())
    }
}

#[tauri::command(async)]
pub(crate) fn planning_read_file(
    session: State<'_, PlanningSession>,
    generation: u64,
    path: String,
) -> Result<tauri::ipc::Response, String> {
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        session
            .read_with_hook(generation, std::path::Path::new(&path), |_| {})
            .map(tauri::ipc::Response::new)
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        let _ = (session, generation, path);
        Err("planning-unavailable".into())
    }
}

#[tauri::command(async)]
pub(crate) fn planning_open_document(
    session: State<'_, PlanningSession>,
    generation: u64,
    path: String,
    expected_identity: Option<String>,
    request: u64,
) -> Result<tauri::ipc::Response, String> {
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        session
            .open_document(
                generation,
                std::path::Path::new(&path),
                expected_identity.as_deref(),
                request,
            )
            .map(tauri::ipc::Response::new)
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        let _ = (session, generation, path, expected_identity, request);
        Err("planning-unavailable".into())
    }
}

#[tauri::command]
pub(crate) fn planning_revoke(session: State<'_, PlanningSession>) -> Result<(), String> {
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        session.revoke()
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        let _ = session;
        Ok(())
    }
}
