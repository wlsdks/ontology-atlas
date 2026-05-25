pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running oh-my-ontology desktop app");
}
