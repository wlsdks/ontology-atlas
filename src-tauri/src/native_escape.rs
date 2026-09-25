//! Escape for input sources that keep it from the page.
//!
//! Under the macOS Korean input source (2-Set Korean, the owner's), a plain Escape reaches a
//! WKWebView page late or not at all. Measured on 2026-09-25 with bare WKWebViews under that
//! source: one got no key event at all for Escape, text field focused or not, while arrows,
//! Enter, Tab and Space arrived; another got the `keydown` only after the input method had
//! answered, behind its own `keyup`. A password field, whose secure input bypasses the input
//! method, got it at once. Every palette, sheet, inbox and dialog in this app closes on Escape,
//! so for a person typing Korean they could stay open.
//!
//! The app therefore watches its own key-downs with an AppKit local monitor. The monitor never
//! consumes the event — the input method still needs it to finish or cancel a composition — and
//! only after the event has gone on to the window does it tell that window's page that one
//! Escape press happened. The page decides whether its own `keydown` arrived or is still coming
//! (`src/shared/lib/tauri-native-escape.ts`), so an input source that does deliver Escape is
//! never handled twice.

/// `kVK_Escape` in `HIToolbox/Events.h`.
const ESCAPE_KEY_CODE: u16 = 53;

/// Shift, Control, Option and Command in `NSEventModifierFlags`. A chord is somebody else's
/// shortcut; Caps Lock, Fn and the numeric-pad bit do not make a press anything but Escape.
const CHORD_MODIFIER_FLAGS: usize = (1 << 17) | (1 << 18) | (1 << 19) | (1 << 20);

/// What the page listens for (`NATIVE_ESCAPE_EVENT` in the page bridge). A DOM event rather
/// than a Tauri event: it needs no listener registered over IPC and no capability, and a page
/// that is not listening simply ignores it.
const NATIVE_ESCAPE_SCRIPT: &str = "window.dispatchEvent(new CustomEvent('atlas:native-escape'))";

/// One plain press of Escape: the key itself, no chord modifier, and not the auto-repeat of a
/// held key — so the page is told once per press, however long the key stays down.
fn is_plain_escape_press(key_code: u16, modifier_flags: usize, is_repeat: bool) -> bool {
    key_code == ESCAPE_KEY_CODE && modifier_flags & CHORD_MODIFIER_FLAGS == 0 && !is_repeat
}

/// The presses already told to the page, by event timestamp.
///
/// WebKit hands a key-down the page left unhandled back to AppKit (`[NSApp sendEvent:]`) so key
/// bindings still see it, and the monitor then sees that same event a second time: measured on
/// 2026-09-25, two monitor calls per unhandled press, one timestamp. A press is its timestamp,
/// so the second sighting is not a second press.
#[derive(Default)]
struct PressLedger {
    last: std::cell::Cell<Option<f64>>,
}

impl PressLedger {
    fn first_sighting(&self, timestamp: f64) -> bool {
        if self.last.get() == Some(timestamp) {
            return false;
        }
        self.last.set(Some(timestamp));
        true
    }
}

/// Installs the monitor once for the life of the app.
///
/// Everything the monitor itself does is a read of the event it was handed; the matching of
/// windows and the script run on a worker, which reaches the main thread through Tauri's event
/// loop and so lands after AppKit has dispatched the key-down. Calling `eval` from inside the
/// monitor would run the script first: on the main thread Tauri handles the message at once.
pub(crate) fn install(app: &tauri::AppHandle) {
    use block2::RcBlock;
    use objc2::rc::Retained;
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSEvent, NSEventMask};
    use std::ptr::NonNull;

    let app = app.clone();
    // Only the main thread runs the monitor, so a `Cell` is all the ledger needs.
    let told = PressLedger::default();
    let handler = RcBlock::new(move |event: NonNull<NSEvent>| -> *mut NSEvent {
        // A panic must not unwind into AppKit, and whatever happens the event goes on exactly
        // as it arrived.
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            // SAFETY: AppKit hands the monitor a live event for the duration of this call.
            let event = unsafe { event.as_ref() };
            if !is_plain_escape_press(
                event.keyCode(),
                event.modifierFlags().bits(),
                event.isARepeat(),
            ) || !told.first_sighting(event.timestamp())
            {
                return;
            }
            let Some(mtm) = MainThreadMarker::new() else {
                return;
            };
            let Some(window) = event.window(mtm) else {
                return;
            };
            let target = Retained::as_ptr(&window) as usize;
            let app = app.clone();
            tauri::async_runtime::spawn_blocking(move || tell_page(&app, target));
        }));
        event.as_ptr()
    });
    // SAFETY: the handler returns the event it was given, which is a valid pointer.
    let monitor = unsafe {
        NSEvent::addLocalMonitorForEventsMatchingMask_handler(NSEventMask::KeyDown, &handler)
    };
    match monitor {
        // AppKit keeps the monitor until `removeMonitor:`, which this app never calls; the
        // token is released on purpose rather than held by something that could drop it.
        Some(monitor) => {
            std::mem::forget(monitor);
            log::info!("[native-escape] key monitor installed");
        }
        None => log::warn!(
            "[native-escape] AppKit returned no key monitor; Escape stays with the WebView"
        ),
    }
}

/// Tells the page in the window that received the press. A key-down in any other window — a
/// system panel, an alert — belongs to that window and is left alone.
fn tell_page(app: &tauri::AppHandle, ns_window: usize) {
    use tauri::Manager;

    for window in app.webview_windows().into_values() {
        if matches!(window.ns_window(), Ok(pointer) if pointer as usize == ns_window) {
            let _ = window.eval(NATIVE_ESCAPE_SCRIPT);
            return;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SHIFT: usize = 1 << 17;
    const CONTROL: usize = 1 << 18;
    const OPTION: usize = 1 << 19;
    const COMMAND: usize = 1 << 20;
    const CAPS_LOCK: usize = 1 << 16;
    const FUNCTION: usize = 1 << 23;

    #[test]
    fn a_plain_press_of_escape_is_told_to_the_page() {
        assert!(is_plain_escape_press(53, 0, false));
    }

    #[test]
    fn caps_lock_and_fn_do_not_turn_escape_into_something_else() {
        assert!(is_plain_escape_press(53, CAPS_LOCK, false));
        assert!(is_plain_escape_press(53, FUNCTION, false));
    }

    #[test]
    fn a_chord_with_escape_is_left_to_whoever_owns_it() {
        for modifier in [SHIFT, CONTROL, OPTION, COMMAND] {
            assert!(!is_plain_escape_press(53, modifier, false), "{modifier:#x}");
        }
    }

    #[test]
    fn a_held_key_is_told_once_not_once_per_repeat() {
        assert!(!is_plain_escape_press(53, 0, true));
    }

    #[test]
    fn a_key_down_webkit_hands_back_is_the_same_press() {
        let ledger = PressLedger::default();
        assert!(ledger.first_sighting(228_580.074_394_875));
        // The unhandled key-down, returned to AppKit by WebKit: same event, same timestamp.
        assert!(!ledger.first_sighting(228_580.074_394_875));
        // The next press.
        assert!(ledger.first_sighting(228_581.586_572_708));
    }

    #[test]
    fn any_other_key_is_not_escape() {
        // Return, Tab, Space, the up arrow and `k`: the keys WKWebView already delivers.
        for key_code in [36u16, 48, 49, 126, 40] {
            assert!(!is_plain_escape_press(key_code, 0, false), "{key_code}");
        }
    }
}
