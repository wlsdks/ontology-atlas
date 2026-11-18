//! A command without `async` runs on the main thread, so a slow disk sync or a Keychain
//! prompt freezes the window. Commands await their blocking work here instead: it runs
//! on the blocking pool, off both the main thread and the async workers, and a panic in
//! it fails that one command rather than the app.

pub(crate) async fn run_blocking<T, F>(work: F) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String> + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::run_blocking;

    #[test]
    fn returns_the_work_result_and_its_error_unchanged() {
        assert_eq!(
            tauri::async_runtime::block_on(run_blocking(|| Ok::<_, String>(7))),
            Ok(7)
        );
        assert_eq!(
            tauri::async_runtime::block_on(run_blocking(|| Err::<(), _>("vault-gone".into()))),
            Err("vault-gone".to_string())
        );
    }

    #[test]
    fn runs_off_the_calling_thread() {
        let caller = std::thread::current().id();
        let worker =
            tauri::async_runtime::block_on(run_blocking(move || Ok(std::thread::current().id())))
                .unwrap();
        assert_ne!(worker, caller);
    }

    #[test]
    fn a_panic_fails_the_command_instead_of_the_process() {
        let result = tauri::async_runtime::block_on(run_blocking(|| -> Result<(), String> {
            panic!("simulated failure inside a command")
        }));
        assert!(result.is_err());
    }
}
