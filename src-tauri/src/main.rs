#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // The model worker branches before Tauri, a window, single-instance or the log
    // plugin exist, so it never shows a Dock icon or reaches the running app.
    let args: Vec<std::ffi::OsString> = std::env::args_os().collect();
    if ontology_atlas_lib::embed_worker_requested(&args) {
        std::process::exit(ontology_atlas_lib::run_embed_worker());
    }
    ontology_atlas_lib::run()
}
