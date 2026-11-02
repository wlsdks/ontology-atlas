pub(crate) mod commands;
#[cfg(any(target_os = "macos", target_os = "linux"))]
mod confined;
#[cfg(target_os = "macos")]
mod macos_panel;
#[cfg(target_os = "macos")]
mod picker;
#[cfg(any(target_os = "macos", target_os = "linux"))]
mod scan;
#[cfg(any(target_os = "macos", target_os = "linux"))]
mod session;
#[cfg(any(target_os = "macos", target_os = "linux"))]
pub(crate) use session::PlanningSession;
#[cfg(not(any(target_os = "macos", target_os = "linux")))]
#[derive(Default)]
pub(crate) struct PlanningSession;

#[cfg(all(test, any(target_os = "macos", target_os = "linux")))]
mod integration_tests;
