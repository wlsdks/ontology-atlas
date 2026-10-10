use super::window::show_main_window;
use crate::{APP_LOCALES, DEFAULT_APP_LOCALE};
use std::process::Command;
use tauri::tray::TrayIconBuilder;

const NATIVE_TRAY_ID: &str = "ontology-atlas-tray";
const NATIVE_TRAY_OPEN_ID: &str = "ontology-atlas-tray-open";
const NATIVE_TRAY_QUIT_ID: &str = "ontology-atlas-tray-quit";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct NativeTrayLabels {
    open: &'static str,
    quit: &'static str,
}

fn locale_for_language_tag<'a>(tag: &str, locales: &[&'a str]) -> Option<&'a str> {
    let tag = tag.trim().to_ascii_lowercase().replace('_', "-");
    let tag = tag.split('.').next().unwrap_or_default();
    let mut parts = tag.split('-');
    let primary = parts.next().unwrap_or_default();
    if primary == "zh" && parts.any(|part| matches!(part, "hant" | "tw" | "hk" | "mo")) {
        return None;
    }
    locales.iter().copied().find(|locale| *locale == primary)
}

fn native_tray_locale<'a>(candidates: &[String], locales: &[&'a str]) -> &'a str {
    candidates
        .iter()
        .find_map(|tag| locale_for_language_tag(tag, locales))
        .unwrap_or(DEFAULT_APP_LOCALE)
}

fn native_tray_labels(candidates: &[String], locales: &[&str]) -> NativeTrayLabels {
    match native_tray_locale(candidates, locales) {
        "ko" => NativeTrayLabels {
            open: "Ontology Atlas 열기",
            quit: "Ontology Atlas 종료",
        },
        "ja" => NativeTrayLabels {
            open: "Ontology Atlasを開く",
            quit: "Ontology Atlasを終了",
        },
        "zh" => NativeTrayLabels {
            open: "打开 Ontology Atlas",
            quit: "退出 Ontology Atlas",
        },
        _ => NativeTrayLabels {
            open: "Open Ontology Atlas",
            quit: "Quit Ontology Atlas",
        },
    }
}

fn first_apple_language(defaults_output: &str) -> Option<String> {
    defaults_output
        .lines()
        .map(|line| line.trim().trim_matches(|ch| ch == ',' || ch == '"'))
        .find(|line| !line.is_empty() && *line != "(" && *line != ")")
        .map(str::to_string)
}

fn macos_language_candidates() -> Vec<String> {
    let mut candidates = Vec::new();
    if let Ok(output) = Command::new("defaults")
        .args(["read", "-g", "AppleLanguages"])
        .output()
    {
        candidates.extend(first_apple_language(&String::from_utf8_lossy(
            &output.stdout,
        )));
    }
    candidates.extend(
        ["LC_ALL", "LC_MESSAGES", "LANG"]
            .iter()
            .filter_map(|key| std::env::var(key).ok()),
    );
    candidates
}

/// Restores the existing window only; never a second window, never keeps the app
/// alive after quit, and exposes no tray or menu permission to the webview.
pub(crate) fn install_native_tray(app: &mut tauri::App) -> tauri::Result<()> {
    let labels = native_tray_labels(&macos_language_candidates(), &APP_LOCALES);
    let open =
        tauri::menu::MenuItem::with_id(app, NATIVE_TRAY_OPEN_ID, labels.open, true, None::<&str>)?;
    let separator = tauri::menu::PredefinedMenuItem::separator(app)?;
    let quit =
        tauri::menu::MenuItem::with_id(app, NATIVE_TRAY_QUIT_ID, labels.quit, true, None::<&str>)?;
    let menu = tauri::menu::Menu::with_items(app, &[&open, &separator, &quit])?;

    TrayIconBuilder::with_id(NATIVE_TRAY_ID)
        .icon(tauri::include_image!("icons/tray-template.png"))
        .icon_as_template(true)
        .tooltip("Ontology Atlas")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().0.as_str() {
            NATIVE_TRAY_OPEN_ID => show_main_window(app),
            NATIVE_TRAY_QUIT_ID => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn native_tray_labels_follow_the_first_system_language() {
        let ko = super::NativeTrayLabels {
            open: "Ontology Atlas 열기",
            quit: "Ontology Atlas 종료",
        };
        let en = super::NativeTrayLabels {
            open: "Open Ontology Atlas",
            quit: "Quit Ontology Atlas",
        };
        let tags = |list: &[&str]| list.iter().map(|t| t.to_string()).collect::<Vec<_>>();
        assert_eq!(
            super::native_tray_labels(&tags(&["ko-KR", "en-US"]), &crate::APP_LOCALES),
            ko
        );
        assert_eq!(
            super::native_tray_labels(&tags(&["en-US", "ko-KR"]), &crate::APP_LOCALES),
            en
        );
        assert_eq!(
            super::native_tray_labels(&tags(&["C", "ko_KR.UTF-8"]), &crate::APP_LOCALES),
            ko
        );
        assert_eq!(super::native_tray_labels(&[], &crate::APP_LOCALES), en);
    }

    #[test]
    fn native_tray_locale_maps_any_injected_locale_list() {
        let four = ["en", "ko", "ja", "zh"];
        let tags = |list: &[&str]| list.iter().map(|t| t.to_string()).collect::<Vec<_>>();
        for (tag, expected) in [
            ("ja-JP", "ja"),
            ("ja", "ja"),
            ("zh-Hans-CN", "zh"),
            ("zh-CN", "zh"),
            ("zh_SG.UTF-8", "zh"),
            ("zh", "zh"),
            ("zh-Hant-TW", "en"),
            ("zh-TW", "en"),
            ("zh-HK", "en"),
            ("fr-FR", "en"),
            ("", "en"),
        ] {
            assert_eq!(
                super::native_tray_locale(&tags(&[tag]), &four),
                expected,
                "{tag}"
            );
        }
        assert_eq!(
            super::native_tray_locale(&tags(&["ja-JP"]), &["en", "ko"]),
            "en"
        );
        assert_eq!(
            super::first_apple_language("(\n    \"ja-JP\",\n    en\n)").as_deref(),
            Some("ja-JP")
        );
        assert_eq!(super::first_apple_language("(\n)"), None);
    }
}
