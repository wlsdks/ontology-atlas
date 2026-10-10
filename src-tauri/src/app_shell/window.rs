use crate::webview_verify::apply_verify_window_size;
use crate::{write_verify_line, MAIN_WINDOW_LABEL};
use std::fs;
use std::time::Duration;
use tauri::{AppHandle, Manager};

/// The notched 14"/16" figure: placing a window low costs nothing, under a notch
/// costs the title bar.
const MACOS_MENU_BAR_RESERVE_PT: f64 = 37.0;
/// The acceptance floor for non-notched and external displays. Judging against 37
/// would recentre a window at y = 24 on every launch.
const MACOS_MENU_BAR_MIN_PT: f64 = 24.0;
/// The title bar sits outside the inner size.
const MACOS_TITLE_BAR_PT: f64 = 28.0;
/// Must equal `minWidth`/`minHeight` in `tauri.conf.json`; `check-desktop-readiness.mjs` asserts it.
const MAIN_WINDOW_MIN_LOGICAL: (f64, f64) = (1040.0, 720.0);
/// A window whose title bar is off screen cannot be moved back.
const MIN_ONSCREEN_TITLE_BAR_PT: f64 = 120.0;
/// The plugin's `DEFAULT_FILENAME`, shared with the harness's `--reset-window-state`.
const WINDOW_STATE_FILENAME: &str = ".window-state.json";

/// `x`/`y` are the outer frame origin (`set_position`); `width`/`height` the inner
/// content size (`set_size`, `tauri.conf.json`).
#[derive(Debug, Clone, Copy, PartialEq)]
struct WindowGeometry {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct MonitorRect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct SanitizedGeometry {
    geometry: WindowGeometry,
    resized: bool,
    repositioned: bool,
}

/// Runs on every launch: the plugin restores size in physical pixels and passes any
/// intersecting corner, so a window saved on a Retina panel could exceed a 1x monitor,
/// and even the default height overflows the smallest promised display (1440x900).
fn sanitize_window_geometry(
    saved: WindowGeometry,
    monitor: MonitorRect,
    min: (f64, f64),
) -> SanitizedGeometry {
    let usable_width = monitor.width.max(min.0);
    let usable_height = (monitor.height - MACOS_MENU_BAR_MIN_PT - MACOS_TITLE_BAR_PT).max(min.1);

    let width = saved.width.clamp(min.0, usable_width);
    let height = saved.height.clamp(min.1, usable_height);
    let resized = width != saved.width || height != saved.height;

    // Only the title bar can be grabbed, so reachability is judged on it, not on corners.
    let onscreen_width = (saved.x + width).min(monitor.x + monitor.width) - saved.x.max(monitor.x);
    let reachable = onscreen_width >= MIN_ONSCREEN_TITLE_BAR_PT
        && saved.y >= monitor.y + MACOS_MENU_BAR_MIN_PT
        && saved.y <= monitor.y + monitor.height - MACOS_TITLE_BAR_PT;

    // A resize implies a reposition, or the old origin drifts off an edge.
    let repositioned = resized || !reachable;
    let (x, y) = if repositioned {
        (
            monitor.x + (monitor.width - width) / 2.0,
            monitor.y + MACOS_MENU_BAR_RESERVE_PT + ((usable_height - height) / 2.0).max(0.0),
        )
    } else {
        (saved.x, saved.y)
    };

    SanitizedGeometry {
        geometry: WindowGeometry {
            x,
            y,
            width,
            height,
        },
        resized,
        repositioned,
    }
}

pub(crate) fn show_main_window(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    let _ = app.show();

    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// The plugin writes physical pixels, so a 2x-panel size would exceed a 1x display.
#[derive(serde::Deserialize)]
pub(crate) struct SavedWindowState {
    width: f64,
    height: f64,
    x: f64,
    y: f64,
    #[serde(default)]
    maximized: bool,
}

pub(crate) fn read_saved_window_state(app: &AppHandle) -> Option<SavedWindowState> {
    let path = app
        .path()
        .app_config_dir()
        .ok()?
        .join(WINDOW_STATE_FILENAME);
    let raw = fs::read_to_string(path).ok()?;
    let parsed: serde_json::Value = serde_json::from_str(&raw).ok()?;
    serde_json::from_value(parsed.get(MAIN_WINDOW_LABEL)?.clone()).ok()
}

/// Records whether the geometry came from a restored file, the config default or the
/// harness. Written to `log::info!` for installed builds and to the harness line.
pub(crate) fn fit_main_window_to_display(
    window: &tauri::WebviewWindow,
    saved: Option<SavedWindowState>,
    source: &str,
) {
    // Measured on the display it was saved on; `monitor_from_point` takes physical coordinates.
    let monitor = match saved
        .as_ref()
        .and_then(|state| window.monitor_from_point(state.x, state.y).ok().flatten())
    {
        Some(monitor) => Some(monitor),
        None => match window.current_monitor() {
            Ok(Some(monitor)) => Some(monitor),
            _ => window.primary_monitor().ok().flatten(),
        },
    };
    let Some(monitor) = monitor else {
        log::warn!("no monitor reported; leaving window geometry untouched");
        return;
    };
    let scale = monitor.scale_factor();
    let monitor_size = monitor.size().to_logical::<f64>(scale);
    let monitor_position = monitor.position().to_logical::<f64>(scale);

    // macOS owns zoom; reproducing it from stored numbers would fight the window manager.
    if saved.as_ref().is_some_and(|state| state.maximized) {
        let _ = window.maximize();
        let line = format!("[ontology-atlas-window-verify] fit source={source} maximized=true");
        log::info!("{line}");
        write_verify_line(line);
        return;
    }

    let current = match (window.inner_size(), window.outer_position()) {
        (Ok(inner), Ok(position)) => WindowGeometry {
            x: position.to_logical::<f64>(scale).x,
            y: position.to_logical::<f64>(scale).y,
            width: inner.to_logical::<f64>(scale).width,
            height: inner.to_logical::<f64>(scale).height,
        },
        _ => {
            log::warn!("window geometry unreadable; leaving it untouched");
            return;
        }
    };

    // Sanitized before applying: `set_size` goes through the event loop, so a read right
    // after restore still shows the old geometry and the clamp would be a no-op.
    let requested = match saved.as_ref() {
        Some(state) => WindowGeometry {
            x: state.x / scale,
            y: state.y / scale,
            width: state.width / scale,
            height: state.height / scale,
        },
        None => current,
    };

    let sanitized = sanitize_window_geometry(
        requested,
        MonitorRect {
            x: monitor_position.x,
            y: monitor_position.y,
            width: monitor_size.width,
            height: monitor_size.height,
        },
        MAIN_WINDOW_MIN_LOGICAL,
    );

    // Restoring applies size and position unconditionally; a plain launch writes only corrections.
    let restoring = saved.is_some();
    if restoring || sanitized.resized {
        let _ = window.set_size(tauri::LogicalSize::new(
            sanitized.geometry.width,
            sanitized.geometry.height,
        ));
    }
    if restoring || sanitized.repositioned {
        let _ = window.set_position(tauri::LogicalPosition::new(
            sanitized.geometry.x,
            sanitized.geometry.y,
        ));
    }

    let line = format!(
        "[ontology-atlas-window-verify] fit source={source} requested={:.0}x{:.0} applied={:.0}x{:.0} recentered={}",
        requested.width,
        requested.height,
        sanitized.geometry.width,
        sanitized.geometry.height,
        sanitized.repositioned
    );
    log::info!("{line}");
    write_verify_line(line);
}

pub(crate) fn schedule_show_main_window(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        std::thread::sleep(Duration::from_millis(500));
        show_main_window(&app);
        apply_verify_window_size(&app);
    });
}

/// WKWebView caps rAF at 60fps via `PreferPageRenderingUpdatesNear60FPSEnabled`;
/// the private `_features` API lifts it for ProMotion. Selectors are checked first,
/// so a removed API leaves 60fps rather than crashing.
#[cfg(target_os = "macos")]
pub(crate) fn disable_webview_frame_rate_cap(window: &tauri::WebviewWindow) {
    let _ = window.with_webview(|platform_webview| {
        use objc2::runtime::{AnyClass, AnyObject, Bool};
        use objc2::{msg_send, sel};

        unsafe {
            let webview = platform_webview.inner() as *mut AnyObject;
            if webview.is_null() {
                return;
            }
            let configuration: *mut AnyObject = msg_send![&*webview, configuration];
            if configuration.is_null() {
                return;
            }
            let preferences: *mut AnyObject = msg_send![&*configuration, preferences];
            if preferences.is_null() {
                return;
            }
            let Some(preferences_class) = AnyClass::get(c"WKPreferences") else {
                return;
            };
            let class_object = preferences_class as *const AnyClass as *mut AnyObject;
            let class_responds: Bool =
                msg_send![&*class_object, respondsToSelector: sel!(_features)];
            let instance_responds: Bool = msg_send![
                &*preferences,
                respondsToSelector: sel!(_setEnabled:forFeature:)
            ];
            if !class_responds.as_bool() || !instance_responds.as_bool() {
                log::warn!(
                    "[frame-rate-cap] WKPreferences private feature API unavailable; staying at default frame pacing"
                );
                return;
            }
            let features: *mut AnyObject = msg_send![&*class_object, _features];
            if features.is_null() {
                return;
            }
            let count: usize = msg_send![&*features, count];
            for index in 0..count {
                let feature: *mut AnyObject = msg_send![&*features, objectAtIndex: index];
                if feature.is_null() {
                    continue;
                }
                let key: *mut AnyObject = msg_send![&*feature, key];
                if key.is_null() {
                    continue;
                }
                let utf8: *const std::ffi::c_char = msg_send![&*key, UTF8String];
                if utf8.is_null() {
                    continue;
                }
                let key_str = std::ffi::CStr::from_ptr(utf8).to_string_lossy();
                if key_str == "PreferPageRenderingUpdatesNear60FPSEnabled" {
                    let _: () = msg_send![
                        &*preferences,
                        _setEnabled: Bool::NO,
                        forFeature: &*feature
                    ];
                    log::info!(
                        "[frame-rate-cap] disabled PreferPageRenderingUpdatesNear60FPSEnabled — WebView follows display refresh rate"
                    );
                    return;
                }
            }
            log::warn!(
                "[frame-rate-cap] PreferPageRenderingUpdatesNear60FPSEnabled feature not found; staying at default frame pacing"
            );
        }
    });
}

#[cfg(test)]
mod window_geometry_tests {
    use super::{
        sanitize_window_geometry, MonitorRect, WindowGeometry, MACOS_MENU_BAR_MIN_PT,
        MACOS_MENU_BAR_RESERVE_PT, MACOS_TITLE_BAR_PT, MAIN_WINDOW_MIN_LOGICAL,
    };

    const REFERENCE_14_INCH: MonitorRect = MonitorRect {
        x: 0.0,
        y: 0.0,
        width: 1512.0,
        height: 982.0,
    };

    fn at(x: f64, y: f64, width: f64, height: f64) -> WindowGeometry {
        WindowGeometry {
            x,
            y,
            width,
            height,
        }
    }

    #[test]
    fn a_window_that_already_fits_is_returned_untouched() {
        // The identity case: an over-eager clamp would move a window every launch.
        let saved = at(0.0, MACOS_MENU_BAR_RESERVE_PT, 1512.0, 900.0);
        let result = sanitize_window_geometry(saved, REFERENCE_14_INCH, MAIN_WINDOW_MIN_LOGICAL);
        assert_eq!(result.geometry, saved);
        assert!(!result.resized);
        assert!(!result.repositioned);
    }

    #[test]
    fn the_shipped_default_fits_the_reference_panel() {
        // 982 content plus 28 title bar exceeds the 945pt visible frame; 900 fits.
        let usable = REFERENCE_14_INCH.height - MACOS_MENU_BAR_RESERVE_PT - MACOS_TITLE_BAR_PT;
        assert!(900.0 <= usable, "900 must fit inside {usable}");
        assert!(
            982.0 > usable,
            "982 must not fit, which is why it was never a window"
        );
    }

    #[test]
    fn a_window_larger_than_the_display_is_clamped_and_recentered() {
        let result = sanitize_window_geometry(
            at(0.0, MACOS_MENU_BAR_RESERVE_PT, 2560.0, 1400.0),
            REFERENCE_14_INCH,
            MAIN_WINDOW_MIN_LOGICAL,
        );
        assert_eq!(result.geometry.width, 1512.0);
        assert_eq!(
            result.geometry.height,
            REFERENCE_14_INCH.height - MACOS_MENU_BAR_MIN_PT - MACOS_TITLE_BAR_PT
        );
        assert!(result.resized);
        assert!(
            result.repositioned,
            "a clamped window must not keep an origin that now overflows"
        );
    }

    #[test]
    fn geometry_saved_in_physical_pixels_survives_losing_the_retina_display() {
        let one_x = MonitorRect {
            x: 0.0,
            y: 0.0,
            width: 1440.0,
            height: 900.0,
        };
        let result = sanitize_window_geometry(
            at(0.0, MACOS_MENU_BAR_RESERVE_PT, 3024.0, 1800.0),
            one_x,
            MAIN_WINDOW_MIN_LOGICAL,
        );
        assert_eq!(result.geometry.width, 1440.0);
        assert_eq!(
            result.geometry.height,
            one_x.height - MACOS_MENU_BAR_MIN_PT - MACOS_TITLE_BAR_PT
        );
        assert!(result.geometry.width <= one_x.width);
        assert!(result.geometry.height <= one_x.height);
    }

    #[test]
    fn a_title_bar_above_the_menu_bar_is_brought_back() {
        // Bottom corners on screen but title bar not: unreachable.
        let result = sanitize_window_geometry(
            at(0.0, -200.0, 1200.0, 800.0),
            REFERENCE_14_INCH,
            MAIN_WINDOW_MIN_LOGICAL,
        );
        assert!(result.repositioned);
        assert!(result.geometry.y >= REFERENCE_14_INCH.y + MACOS_MENU_BAR_RESERVE_PT);
        assert!(!result.resized, "position was the only problem");
    }

    #[test]
    fn a_window_dragged_almost_entirely_off_the_right_edge_is_brought_back() {
        let result = sanitize_window_geometry(
            at(1470.0, 300.0, 1200.0, 800.0),
            REFERENCE_14_INCH,
            MAIN_WINDOW_MIN_LOGICAL,
        );
        assert!(result.repositioned);
        assert!(result.geometry.x >= REFERENCE_14_INCH.x);
    }

    #[test]
    fn a_window_below_the_minimum_is_raised_to_it() {
        let result = sanitize_window_geometry(
            at(100.0, 100.0, 600.0, 400.0),
            REFERENCE_14_INCH,
            MAIN_WINDOW_MIN_LOGICAL,
        );
        assert_eq!(result.geometry.width, MAIN_WINDOW_MIN_LOGICAL.0);
        assert_eq!(result.geometry.height, MAIN_WINDOW_MIN_LOGICAL.1);
        assert!(result.resized);
    }

    #[test]
    fn a_second_display_left_of_the_primary_keeps_its_negative_origin() {
        // Monitor rects are not anchored at zero.
        let left_monitor = MonitorRect {
            x: -1920.0,
            y: 0.0,
            width: 1920.0,
            height: 1080.0,
        };
        let saved = at(-1800.0, 200.0, 1400.0, 900.0);
        let result = sanitize_window_geometry(saved, left_monitor, MAIN_WINDOW_MIN_LOGICAL);
        assert_eq!(result.geometry, saved);
        assert!(!result.repositioned);
    }

    const EXTERNAL_1080P: MonitorRect = MonitorRect {
        x: 0.0,
        y: 0.0,
        width: 1920.0,
        height: 1080.0,
    };

    #[test]
    fn a_window_snapped_to_the_top_of_a_non_notched_display_is_left_alone() {
        // External monitors use 24pt, not the notched 37.
        let saved = at(0.0, MACOS_MENU_BAR_MIN_PT, 1400.0, 900.0);
        let result = sanitize_window_geometry(saved, EXTERNAL_1080P, MAIN_WINDOW_MIN_LOGICAL);
        assert_eq!(result.geometry, saved);
        assert!(
            !result.repositioned,
            "a window a non-notched display allows must be left where it is"
        );
        assert!(!result.resized);
    }

    #[test]
    fn a_maximized_window_that_exactly_fills_a_non_notched_display_is_not_shrunk() {
        // The zoomed shape macOS produces must not be clamped.
        let zoomed_height = EXTERNAL_1080P.height - MACOS_MENU_BAR_MIN_PT - MACOS_TITLE_BAR_PT;
        let saved = at(0.0, MACOS_MENU_BAR_MIN_PT, 1920.0, zoomed_height);
        let result = sanitize_window_geometry(saved, EXTERNAL_1080P, MAIN_WINDOW_MIN_LOGICAL);
        assert_eq!(result.geometry, saved);
        assert!(
            !result.resized,
            "a window that fits its display exactly must not be clamped"
        );
        assert!(!result.repositioned);
    }

    #[test]
    fn a_title_bar_genuinely_under_the_menu_bar_is_still_recovered() {
        // Above the shortest menu bar is still unreachable.
        let result = sanitize_window_geometry(
            at(0.0, MACOS_MENU_BAR_MIN_PT - 8.0, 1400.0, 900.0),
            EXTERNAL_1080P,
            MAIN_WINDOW_MIN_LOGICAL,
        );
        assert!(result.repositioned);
        assert!(result.geometry.y >= EXTERNAL_1080P.y + MACOS_MENU_BAR_MIN_PT);
    }

    #[test]
    fn a_recentred_window_is_placed_clear_of_a_notch_and_still_fits() {
        // Placement stays conservative while acceptance is permissive.
        let result = sanitize_window_geometry(
            at(0.0, -400.0, 3024.0, 1800.0),
            REFERENCE_14_INCH,
            MAIN_WINDOW_MIN_LOGICAL,
        );
        assert!(result.repositioned);
        assert!(result.geometry.y >= REFERENCE_14_INCH.y + MACOS_MENU_BAR_RESERVE_PT);
        assert!(
            result.geometry.y + result.geometry.height
                <= REFERENCE_14_INCH.y + REFERENCE_14_INCH.height,
            "a recentred window must not hang off the bottom"
        );
    }
}
