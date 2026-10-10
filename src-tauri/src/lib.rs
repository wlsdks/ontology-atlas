use std::io::Write;
use tauri::{Manager, RunEvent};

mod acp;
mod acp_doctor;
mod acp_runtime;
mod acp_session;
mod agent_setup;
mod analysis_archive;
mod app_shell;
mod command_output;
mod connector_secrets;
mod connectors;
mod deep_link;
mod errors;
mod git;
mod gray_area;
mod gray_area_rpc;
mod gray_area_scope;
mod jev;
mod library;
mod llm;
mod llm_audit;
mod local_construction;
mod audit_read;
mod managed_node;
mod map_entry_diagnostic;
mod meaning_transition_archive;
mod project_source;
mod secrets;
mod source_access;
mod vault;
mod vault_grants;
mod webview_verify;

use acp_runtime::AcpInstallProgressState;
use acp_session::{terminate_all_acp_sessions, AcpSessions};
#[cfg(desktop)]
use app_shell::answer_deep_link;
use app_shell::app_log::{install_panic_logger, QuietStderr};
#[cfg(target_os = "macos")]
use app_shell::tray::install_native_tray;
#[cfg(target_os = "macos")]
use app_shell::window::disable_webview_frame_rate_cap;
use app_shell::window::{
    fit_main_window_to_display, read_saved_window_state, schedule_show_main_window,
    show_main_window,
};
pub(crate) use project_source::{run_source_git, source_digest};
use vault::location::default_vault_parent_dir;
pub(crate) use vault::scope::{
    canonical_root, canonical_source_root, resolve_existing_inside, vault_root_rejection,
};
#[cfg(not(unix))]
pub(crate) use vault::scope::{
    ensure_inside_canonical, resolve_directory_target_inside, resolve_write_target_inside,
};
use vault::watch::VaultWatcherState;
use webview_verify::{apply_verify_window_size, isolate_verify_webview_storage, WEBVIEW_VERIFY_ENV};
pub(crate) use webview_verify::{js_string_literal, write_verify_line};

const MAIN_WINDOW_LABEL: &str = "main";
/// Small on purpose: enough evidence for a bug report, not a history of the machine.
const APP_LOG_MAX_FILE_BYTES: u128 = 5 * 1024 * 1024;
/// Restoring `FULLSCREEN` adds a Space transition, `VISIBLE` can launch with no
/// window, and `DECORATIONS` never changes here.
#[cfg(desktop)]
const WINDOW_STATE_FLAGS: tauri_plugin_window_state::StateFlags =
    tauri_plugin_window_state::StateFlags::SIZE
        .union(tauri_plugin_window_state::StateFlags::POSITION)
        .union(tauri_plugin_window_state::StateFlags::MAXIMIZED);
pub(crate) const APP_LOCALES: [&str; 4] = ["en", "ko", "ja", "zh"];
const DEFAULT_APP_LOCALE: &str = "en";

pub fn run() {
    install_panic_logger();
    if let Some(path) = std::env::var_os("PATH") {
        std::env::set_var("PATH", acp::sanitized_process_path(&path));
    }
    let verify_webview = std::env::var_os(WEBVIEW_VERIFY_ENV).is_some();
    let mut context = tauri::generate_context!();
    let isolated_window_count =
        isolate_verify_webview_storage(context.config_mut(), verify_webview);
    if verify_webview {
        write_verify_line(format!(
            "[ontology-atlas-webview-storage] mode=incognito windows={isolated_window_count}"
        ));
    }

    let mut builder = tauri::Builder::default();

    // First plugin, as it requires: a second launch focuses the existing window, or two
    // instances would write the same vault.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }));
        // Right after single-instance, so a second link press routes the existing window.
        builder = builder.plugin(tauri_plugin_deep_link::init());
    }

    // Read-only diagnostic, independent of the verifier.
    if map_entry_diagnostic::enabled_from_env() {
        builder = builder.plugin(map_entry_diagnostic::init());
    }

    // Not under the harness: the plugin writes on exit, so a harness resize would
    // overwrite the owner's geometry and make `--min-window-size` verdicts depend on it.
    if !verify_webview {
        builder = builder.plugin(
            tauri_plugin_window_state::Builder::new()
                // See `WINDOW_STATE_FLAGS`.
                .with_state_flags(WINDOW_STATE_FLAGS)
                // The plugin restores after `setup`, so the fit would check the default and let the
                // restored geometry land unchecked; the restore is done explicitly below.
                .skip_initial_state(MAIN_WINDOW_LABEL)
                .build(),
        );
    }

    builder
        // Outside the vault, at `Info`: what the app did, never vault content, prompts or secrets.
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some("ontology-atlas".to_string()),
                    }),
                    // Not `TargetKind::Stderr`: fern panics on a failed stderr write, and a harness that
                    // exits with a piped stderr makes every later line abort the app.
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Dispatch(
                        tauri_plugin_log::fern::Dispatch::new()
                            .chain(Box::new(QuietStderr) as Box<dyn Write + Send>),
                    )),
                ])
                .level(log::LevelFilter::Info)
                // Local time, matching crash report names.
                .timezone_strategy(tauri_plugin_log::TimezoneStrategy::UseLocal)
                .max_file_size(APP_LOG_MAX_FILE_BYTES)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepOne)
                .build(),
        )
        // Updates install only with a valid minisign signature (public key in `tauri.conf.json`).
        // The process plugin exists for the one post-update restart.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(VaultWatcherState::default())
        .manage(AcpInstallProgressState::default())
        .manage(AcpSessions::default())
        .setup(move |app| {
            // Seed the vault-grant registry before any command can run: turn the
            // boundary on, choose where grants persist, and re-grant the app's own
            // vault container plus every vault a prior launch recorded.
            if let Ok(store) = app.path().app_data_dir() {
                let container =
                    std::env::var("HOME").ok().map(|home| default_vault_parent_dir(&home));
                vault_grants::initialize(store.join("granted-vault-roots.json"), container);
            }

            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Regular);

            #[cfg(target_os = "macos")]
            install_native_tray(app)?;

            // Before anything slow: the plugin holds a cold-start link only until a handler exists.
            #[cfg(desktop)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let deep_link_app = app.handle().clone();
                app.deep_link().on_open_url(move |event| {
                    for url in event.urls() {
                        answer_deep_link(&deep_link_app, url.as_str());
                    }
                });
            }

            // Without the version a log cannot be matched to its build.
            log::info!(
                "ontology atlas {} started",
                app.handle().package_info().version
            );

            show_main_window(app.handle());
            apply_verify_window_size(app.handle());

            // The payload contract asserts this line.
            write_verify_line(format!(
                "[ontology-atlas-window-verify] state_plugin={}",
                if verify_webview { "disabled" } else { "enabled" }
            ));
            if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                // Its presence at setup separates a restored window from the config default.
                let saved = if verify_webview {
                    None
                } else {
                    read_saved_window_state(app.handle())
                };
                let source = match (verify_webview, saved.is_some()) {
                    (true, _) => "harness",
                    (false, true) => "restored",
                    (false, false) => "default",
                };
                fit_main_window_to_display(&window, saved, source);
            }

            #[cfg(target_os = "macos")]
            if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                let diagnostic_default_pacing =
                    map_entry_diagnostic::default_pacing_from_env();
                map_entry_diagnostic::write_pacing_metadata(diagnostic_default_pacing);
                if !diagnostic_default_pacing {
                    disable_webview_frame_rate_cap(&window);
                }
            }

            if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                if std::env::var_os(WEBVIEW_VERIFY_ENV).is_some() {
                    webview_verify::spawn_webview_verify(&window);
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            acp_runtime::acp_detect_runtimes,
            acp_runtime::acp_diagnose,
            acp_runtime::acp_repair,
            acp_runtime::acp_reset_connection,
            app_shell::open_external_url,
            acp_runtime::acp_node_plan,
            acp_runtime::acp_install_node,
            acp_runtime::acp_install_plan,
            acp_runtime::acp_install_cli,
            acp_runtime::acp_install_progress,
            acp_session::acp_start,
            acp_session::acp_send,
            acp_session::acp_stop,
            acp_session::acp_permission_verdict,
            vault::location::pick_vault_directory,
            source_access::pick_source_directory,
            local_construction::preview_local_construction_source,
            local_construction::read_local_construction_source,
            project_source::inspect_project_source,
            project_source::inspect_project_source_continuity,
            vault::walk::list_vault_directory,
            vault::walk::vault_fingerprint,
            vault::read::read_vault_text_file,
            vault::read::read_vault_text_files,
            vault::read::read_vault_text_tail,
            vault::read::read_vault_binary_file,
            audit_read::audit_read_prepare,
            audit_read::audit_read_begin,
            audit_read::audit_read_pull,
            audit_read::audit_read_finish,
            audit_read::audit_read_cancel,
            vault::write::write_vault_text_file,
            vault::library_collections::read_library_collections,
            vault::library_collections::write_library_collections,
            vault::create::create_vault_text_file,
            analysis_archive::append_analysis_record,
            analysis_archive::read_analysis_record_text,
            meaning_transition_archive::observe_meaning_transition_root,
            meaning_transition_archive::append_meaning_transition_bundle,
            meaning_transition_archive::read_meaning_transition_record_text,
            meaning_transition_archive::read_meaning_transition_artifact_text,
            meaning_transition_archive::list_meaning_transition_history,
            vault::write::remove_vault_entry,
            vault::write::ensure_vault_directory,
            vault::write::vault_path_exists,
            vault::location::open_vault_in_finder,
            app_shell::app_log::reveal_app_log_dir,
            vault::location::ensure_default_vault_parent_dir,
            library::hash_vault_files,
            gray_area::read_gray_area_evidence,
            gray_area::preview_gray_area_scope,
            gray_area::check_gray_area_evidence,
            library::pick_source_files,
            library::import_source_files,
            library::discover_source_candidates,
            library::reveal_vault_file,
            vault::watch::start_vault_watch,
            app_shell::app_log::log_webview_error,
            secrets::secret_set,
            secrets::secret_status,
            secrets::secret_clear,
            jev::jev_secret_set,
            jev::jev_secret_status,
            jev::jev_secret_clear,
            jev::jev_judge,
            llm::secret_verify,
            llm::llm_chat,
            llm::requests::llm_chat_prepare,
            llm::requests::llm_chat_cancel,
            git::status::git_status,
            git::setup::git_probe,
            git::setup::git_init,
            git::remote::git_set_remote,
            git::snapshot::git_snapshot,
            git::commits::git_history,
            git::history::vault_node_revisions,
            git::history::vault_node_revision_content,
            git::evidence::git_paths_last_change,
            git::commits::git_diff,
            git::commits::git_commit_diff,
            git::remote::git_pull,
            git::remote::git_fetch,
            git::document::git_restore_file,
            git::document::git_document_diff,
            agent_setup::mcp_bundled_server,
            agent_setup::verify_mcp_server,
            connectors::discover_mcp_connectors,
            connectors::resolve_connector_runtimes,
            connector_secrets::connector_secret_set,
            connector_secrets::connector_secret_status,
            connector_secrets::connector_secret_delete,
        ])
        .build(context)
        .expect("error while building ontology-atlas desktop app")
        .run(|app_handle, event| match event {
            RunEvent::Ready => {
                show_main_window(app_handle);
                apply_verify_window_size(app_handle);
                schedule_show_main_window(app_handle.clone());
            }
            #[cfg(target_os = "macos")]
            RunEvent::Reopen { .. } => {
                show_main_window(app_handle);
                apply_verify_window_size(app_handle);
                schedule_show_main_window(app_handle.clone());
            }
            RunEvent::WindowEvent { label, event: tauri::WindowEvent::Destroyed, .. } => {
                llm::requests::cancel_owner(Some(&label));
                audit_read::cancel_owner(Some(&label));
            }
            // Adapters and their children must not outlive the window.
            RunEvent::ExitRequested { .. } | RunEvent::Exit => {
                llm::requests::cancel_owner(None);
                audit_read::cancel_owner(None);
                terminate_all_acp_sessions(app_handle);
            }
            _ => {}
        });
}
