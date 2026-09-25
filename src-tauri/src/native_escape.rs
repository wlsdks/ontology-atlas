//! Escape, told to the page once per press, with one log line that says where it went.
//!
//! Under the macOS Korean input source (2-Set Korean, the owner's), WebKit gives a plain Escape to
//! the input method before the page, and the page's `keydown` arrives once the input method has
//! answered: measured on 2026-09-26 in a build of this code launched both ways the app is, at
//! most 18 ms after the native signal below over 29 presses. Every palette, sheet, inbox and
//! dialog in this app closes on Escape, so a press the page never got would leave one open.
//!
//! The app therefore watches its own key-downs with an AppKit local monitor. The monitor never
//! consumes the event — the input method still needs it to finish or cancel a composition — and
//! only after the event has gone on to the window does it tell that window's page that one
//! Escape press happened. The page decides whether its own `keydown` arrived or is still coming
//! (`src/shared/lib/tauri-native-escape.ts`), so a press WebKit delivers is never handled twice.
//!
//! What no code in the app can see is a press that never reaches it. A tool that taps Escape for
//! the whole session takes every press before any app does: Claude Code's Computer Use MCP does
//! this while it holds its lock (`EscHotkey.swift`, "user escape with no CU call in flight;
//! consumed only"), except in a password field, whose secure input hides keys from event taps.
//! The measurements this module was first written from — no Escape at all, text field focused or
//! not, while a password field got it — were taken with that tap on (2026-09-25, 2026-09-26), so
//! they measured the tap, not the input method.
//!
//! Every press the monitor sees leaves one line in the app log: which window it was in, which
//! page was told, and what that page did with it. A press with no line never reached the app.
//! Nothing else about the keyboard is logged — no other key, no text.

use std::time::Duration;

/// `kVK_Escape` in `HIToolbox/Events.h`.
const ESCAPE_KEY_CODE: u16 = 53;

/// Shift, Control, Option and Command in `NSEventModifierFlags`. A chord is somebody else's
/// shortcut; Caps Lock, Fn and the numeric-pad bit do not make a press anything but Escape.
const CHORD_MODIFIER_FLAGS: usize = (1 << 17) | (1 << 18) | (1 << 19) | (1 << 20);

/// What the page listens for (`NATIVE_ESCAPE_EVENT` in the page bridge). A DOM event rather
/// than a Tauri event: it needs no listener registered over IPC and no capability, and a page
/// that is not listening simply ignores it.
const NATIVE_ESCAPE_EVENT: &str = "atlas:native-escape";

/// What the page is asked afterwards (`NATIVE_ESCAPE_VERDICT_EVENT` in the page bridge): the
/// bridge writes what it did with that press into the event's `detail.verdict`.
const NATIVE_ESCAPE_VERDICT_EVENT: &str = "atlas:native-escape-verdict";

/// How long after the signal the page is asked what it did: past the bridge's wait for a late
/// key-down (`LATE_KEYDOWN_GRACE_MS`, 80 ms), with room for a busy frame.
const VERDICT_DELAY: Duration = Duration::from_millis(300);

/// How long the log waits for the page's answer before saying there was none.
const VERDICT_TIMEOUT: Duration = Duration::from_millis(1000);

/// The script that tells the page about one press.
fn signal_script(press: u64) -> String {
    format!(
        "window.dispatchEvent(new CustomEvent('{NATIVE_ESCAPE_EVENT}', {{ detail: {{ press: {press} }} }}))"
    )
}

/// The script that asks the page what it did with one press. It always returns a string, so a
/// page with no bridge reads as that rather than as silence.
fn verdict_script(press: u64) -> String {
    format!(
        "(() => {{ const detail = {{ press: {press} }}; \
         window.dispatchEvent(new CustomEvent('{NATIVE_ESCAPE_VERDICT_EVENT}', {{ detail }})); \
         return typeof detail.verdict === 'string' ? detail.verdict : 'no bridge answered'; }})()"
    )
}

/// The page's answer as the WebView hands it back: a JSON string, or nothing when the script
/// failed. Clipped, because the log is not the place for whatever a broken page returns.
fn page_answer(raw: &str) -> String {
    const MAX_CHARS: usize = 160;
    let text = serde_json::from_str::<String>(raw).unwrap_or_else(|_| {
        if raw.trim().is_empty() {
            "the script returned nothing".to_string()
        } else {
            raw.trim().to_string()
        }
    });
    if text.chars().count() <= MAX_CHARS {
        return text;
    }
    let kept: String = text.chars().take(MAX_CHARS).collect();
    format!("{kept}…")
}

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

/// One press as the monitor saw it, handed to the worker that tells the page.
struct Press {
    /// Counted from launch, so the page's answer can be matched to its press.
    number: u64,
    /// `NSEvent.timestamp`: seconds since boot.
    timestamp: f64,
    /// The window the event names, as a pointer, when it names one.
    window: Option<usize>,
    /// `NSEvent.windowNumber`, which the log shows when the window is not one of ours.
    window_number: isize,
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
    // Only the main thread runs the monitor, so a `Cell` is all the ledger and the count need.
    let told = PressLedger::default();
    let presses = std::cell::Cell::new(0_u64);
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
            presses.set(presses.get() + 1);
            let window = MainThreadMarker::new()
                .and_then(|mtm| event.window(mtm))
                .map(|window| Retained::as_ptr(&window) as usize);
            let press = Press {
                number: presses.get(),
                timestamp: event.timestamp(),
                window,
                window_number: event.windowNumber(),
            };
            let app = app.clone();
            tauri::async_runtime::spawn_blocking(move || tell_page(&app, press));
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

/// Tells the page in the window that received the press, then asks it what it did and writes
/// the one log line for the press. A key-down in any other window — a system panel, an alert —
/// belongs to that window and is left alone.
fn tell_page(app: &tauri::AppHandle, press: Press) {
    use tauri::Manager;

    let head = format!(
        "[native-escape] press {} (t={:.3}",
        press.number, press.timestamp
    );
    let windows = app.webview_windows();
    let Some(window_pointer) = press.window else {
        log::info!("{head}): the event names no window; nothing signalled");
        return;
    };
    let Some(window) = windows.values().find(
        |window| matches!(window.ns_window(), Ok(pointer) if pointer as usize == window_pointer),
    ) else {
        log::info!(
            "{head}, window #{}): not a webview window; nothing signalled",
            press.window_number
        );
        return;
    };
    let head = format!("{head}, window {})", window.label());
    if let Err(error) = window.eval(signal_script(press.number)) {
        log::info!("{head}: the signal could not be sent ({error})");
        return;
    }
    std::thread::sleep(VERDICT_DELAY);
    let (answer_tx, answer_rx) = std::sync::mpsc::channel::<String>();
    let asked = window.eval_with_callback(verdict_script(press.number), move |raw| {
        let _ = answer_tx.send(raw);
    });
    let verdict = match asked {
        Err(error) => format!("the page could not be asked ({error})"),
        Ok(()) => match answer_rx.recv_timeout(VERDICT_TIMEOUT) {
            Ok(raw) => page_answer(&raw),
            Err(_) => format!(
                "no answer from the page within {} ms",
                (VERDICT_DELAY + VERDICT_TIMEOUT).as_millis()
            ),
        },
    };
    log::info!("{head}: {verdict}");
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

    #[test]
    fn the_signal_names_its_press_so_the_answer_can_be_matched() {
        assert_eq!(
            signal_script(7),
            "window.dispatchEvent(new CustomEvent('atlas:native-escape', { detail: { press: 7 } }))"
        );
        let question = verdict_script(7);
        assert!(question.contains("new CustomEvent('atlas:native-escape-verdict', { detail })"));
        assert!(question.contains("const detail = { press: 7 };"));
        assert!(question.contains("'no bridge answered'"));
    }

    #[test]
    fn the_page_answer_is_read_as_the_string_it_returned() {
        assert_eq!(
            page_answer("\"stood in on INPUT after 81 ms\""),
            "stood in on INPUT after 81 ms"
        );
        assert_eq!(page_answer(""), "the script returned nothing");
        assert_eq!(page_answer("42"), "42");
        let long = format!("\"{}\"", "x".repeat(400));
        assert_eq!(page_answer(&long).chars().count(), 161);
    }
}
