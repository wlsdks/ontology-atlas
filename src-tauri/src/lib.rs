use notify_debouncer_full::notify::{RecommendedWatcher, RecursiveMode, Watcher};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, FileIdMap};
use serde::Serialize;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::{Duration, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, RunEvent, State};

const WEBVIEW_VERIFY_ENV: &str = "ONTOLOGY_ATLAS_VERIFY_WEBVIEW";
const WEBVIEW_VERIFY_ROUTE_ENV: &str = "ONTOLOGY_ATLAS_VERIFY_ROUTE";
const WEBVIEW_VERIFY_TOPOLOGY_DRAG_ENV: &str = "ONTOLOGY_ATLAS_VERIFY_TOPOLOGY_DRAG";
const MAIN_WINDOW_LABEL: &str = "main";
const WEBVIEW_VERIFY_ROUTE_ATTEMPTS: usize = 20;
const WEBVIEW_VERIFY_ROUTE_INTERVAL_MS: u64 = 400;
const WEBVIEW_VERIFY_MARKER_ATTEMPTS: usize = 12;
const WEBVIEW_VERIFY_MARKER_INTERVAL_MS: u64 = 500;

/// notify-debouncer-full 의 기본 watcher 타입 별칭 — State 저장용.
type VaultDebouncer = Debouncer<RecommendedWatcher, FileIdMap>;

/// live-tauri — vault 파일워처를 앱 수명 동안 살려두는 State. start_vault_watch
/// 가 여기에 debouncer 를 넣어둬야 drop 되지 않고 계속 감시한다.
#[derive(Default)]
struct VaultWatcherState {
    debouncer: Mutex<Option<VaultDebouncer>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TauriVaultEntry {
    name: String,
    kind: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TauriTextFile {
    text: String,
    last_modified: u128,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TauriBinaryFile {
    bytes: Vec<u8>,
    last_modified: u128,
}

fn normalize_relative_path(relative_path: &str) -> Result<PathBuf, String> {
    let mut out = PathBuf::new();
    for component in Path::new(relative_path).components() {
        match component {
            Component::Normal(part) => out.push(part),
            Component::CurDir => {}
            Component::Prefix(_) | Component::RootDir | Component::ParentDir => {
                return Err("relative path must stay inside the selected vault".into());
            }
        }
    }
    Ok(out)
}

fn resolve_inside(root_path: &str, relative_path: &str) -> Result<PathBuf, String> {
    let root = PathBuf::from(root_path);
    let relative = normalize_relative_path(relative_path)?;
    Ok(root.join(relative))
}

fn canonical_root(root_path: &str) -> Result<PathBuf, String> {
    let root = fs::canonicalize(root_path).map_err(|err| err.to_string())?;
    let metadata = fs::metadata(&root).map_err(|err| err.to_string())?;
    if !metadata.is_dir() {
        return Err("vault root must be a directory".into());
    }
    Ok(root)
}

fn ensure_inside_canonical(root_path: &str, path: &Path) -> Result<PathBuf, String> {
    let root = canonical_root(root_path)?;
    let canonical_path = fs::canonicalize(path).map_err(|err| err.to_string())?;
    if !canonical_path.starts_with(&root) {
        return Err("resolved path must stay inside the selected vault".into());
    }
    Ok(canonical_path)
}

fn resolve_existing_inside(root_path: &str, relative_path: &str) -> Result<PathBuf, String> {
    let path = resolve_inside(root_path, relative_path)?;
    ensure_inside_canonical(root_path, &path)
}

fn resolve_write_target_inside(root_path: &str, relative_path: &str) -> Result<PathBuf, String> {
    let path = resolve_inside(root_path, relative_path)?;
    if path.exists() {
        return ensure_inside_canonical(root_path, &path);
    }
    let parent = path
        .parent()
        .ok_or_else(|| "write target must have a parent directory".to_string())?;
    let root = canonical_root(root_path)?;
    let mut ancestor = parent;
    while !ancestor.exists() {
        ancestor = ancestor
            .parent()
            .ok_or_else(|| "write target must stay inside the selected vault".to_string())?;
    }
    let canonical_ancestor = fs::canonicalize(ancestor).map_err(|err| err.to_string())?;
    if !canonical_ancestor.starts_with(&root) {
        return Err("resolved path must stay inside the selected vault".into());
    }
    fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    let canonical_parent = ensure_inside_canonical(root_path, parent)?;
    let file_name = path
        .file_name()
        .ok_or_else(|| "write target must include a file name".to_string())?;
    Ok(canonical_parent.join(file_name))
}

fn js_string_literal(value: &str) -> String {
    let escaped = value
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
        .replace('\r', "\\r");
    format!("\"{}\"", escaped)
}

fn is_safe_webview_verify_route(route: &str) -> bool {
    route.starts_with('/')
        && !route.starts_with("//")
        && !route.contains("://")
        && !route
            .chars()
            .any(|ch| matches!(ch, ' ' | '"' | '\'' | '<' | '>' | '\\'))
}

fn build_webview_verify_route_script(route: &str) -> String {
    let route = js_string_literal(route);
    format!(
        r#"(() => {{
  const target = {route};
  const targetUrl = new URL(target, location.href);
  const current = location.pathname + location.search + location.hash;
  const next = targetUrl.pathname + targetUrl.search + targetUrl.hash;
  if (current !== next) {{
    history.replaceState({{}}, "", next);
    window.dispatchEvent(new PopStateEvent("popstate"));
    window.dispatchEvent(new Event("app:urlchange"));
    location.replace(next);
  }}
}})()"#,
    )
}

fn resolve_directory_target_inside(
    root_path: &str,
    relative_path: &str,
) -> Result<PathBuf, String> {
    let path = resolve_inside(root_path, relative_path)?;
    if path.exists() {
        return ensure_inside_canonical(root_path, &path);
    }
    let root = canonical_root(root_path)?;
    let mut ancestor = path
        .parent()
        .ok_or_else(|| "directory target must have a parent directory".to_string())?;
    while !ancestor.exists() {
        ancestor = ancestor
            .parent()
            .ok_or_else(|| "directory target must stay inside the selected vault".to_string())?;
    }
    let canonical_ancestor = fs::canonicalize(ancestor).map_err(|err| err.to_string())?;
    if !canonical_ancestor.starts_with(&root) {
        return Err("resolved path must stay inside the selected vault".into());
    }
    Ok(path)
}

fn metadata_mtime_ms(path: &Path) -> Result<u128, String> {
    let metadata = fs::metadata(path).map_err(|err| err.to_string())?;
    let modified = metadata.modified().map_err(|err| err.to_string())?;
    Ok(modified
        .duration_since(UNIX_EPOCH)
        .map_err(|err| err.to_string())?
        .as_millis())
}

#[tauri::command]
fn pick_vault_directory() -> Result<Option<String>, String> {
    Ok(rfd::FileDialog::new()
        .set_title("Open ontology vault")
        .pick_folder()
        .map(|path| path.to_string_lossy().to_string()))
}

#[tauri::command]
fn list_vault_directory(
    root_path: String,
    relative_path: String,
) -> Result<Vec<TauriVaultEntry>, String> {
    let dir = resolve_existing_inside(&root_path, &relative_path)?;
    let entries = fs::read_dir(dir).map_err(|err| err.to_string())?;
    let mut out = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|err| err.to_string())?;
        let file_type = entry.file_type().map_err(|err| err.to_string())?;
        let kind = if file_type.is_dir() {
            "directory"
        } else if file_type.is_file() {
            "file"
        } else {
            continue;
        };
        out.push(TauriVaultEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            kind: kind.into(),
        });
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

#[tauri::command]
fn read_vault_text_file(root_path: String, relative_path: String) -> Result<TauriTextFile, String> {
    let path = resolve_existing_inside(&root_path, &relative_path)?;
    let text = fs::read_to_string(&path).map_err(|err| err.to_string())?;
    let last_modified = metadata_mtime_ms(&path)?;
    Ok(TauriTextFile {
        text,
        last_modified,
    })
}

#[tauri::command]
fn read_vault_binary_file(
    root_path: String,
    relative_path: String,
) -> Result<TauriBinaryFile, String> {
    let path = resolve_existing_inside(&root_path, &relative_path)?;
    let bytes = fs::read(&path).map_err(|err| err.to_string())?;
    let last_modified = metadata_mtime_ms(&path)?;
    Ok(TauriBinaryFile {
        bytes,
        last_modified,
    })
}

#[tauri::command]
fn write_vault_text_file(
    root_path: String,
    relative_path: String,
    content: String,
) -> Result<(), String> {
    let path = resolve_write_target_inside(&root_path, &relative_path)?;
    fs::write(path, content).map_err(|err| err.to_string())
}

#[tauri::command]
fn remove_vault_entry(
    root_path: String,
    relative_path: String,
    recursive: Option<bool>,
) -> Result<(), String> {
    if normalize_relative_path(&relative_path)?
        .as_os_str()
        .is_empty()
    {
        return Err("refusing to remove the selected vault root".into());
    }
    let path = resolve_existing_inside(&root_path, &relative_path)?;
    let metadata = fs::metadata(&path).map_err(|err| err.to_string())?;
    if metadata.is_dir() {
        if recursive.unwrap_or(false) {
            fs::remove_dir_all(path).map_err(|err| err.to_string())
        } else {
            fs::remove_dir(path).map_err(|err| err.to_string())
        }
    } else {
        fs::remove_file(path).map_err(|err| err.to_string())
    }
}

#[tauri::command]
fn ensure_vault_directory(root_path: String, relative_path: String) -> Result<(), String> {
    let path = resolve_directory_target_inside(&root_path, &relative_path)?;
    fs::create_dir_all(&path).map_err(|err| err.to_string())?;
    ensure_inside_canonical(&root_path, &path)?;
    Ok(())
}

#[tauri::command]
fn vault_path_exists(
    root_path: String,
    relative_path: String,
    kind: String,
) -> Result<bool, String> {
    let path = resolve_inside(&root_path, &relative_path)?;
    let root = canonical_root(&root_path)?;
    let path = match fs::canonicalize(&path) {
        Ok(path) => path,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(err) => return Err(err.to_string()),
    };
    if !path.starts_with(&root) {
        return Err("resolved path must stay inside the selected vault".into());
    }
    let metadata = match fs::metadata(path) {
        Ok(metadata) => metadata,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(err) => return Err(err.to_string()),
    };
    Ok(match kind.as_str() {
        "file" => metadata.is_file(),
        "directory" => metadata.is_dir(),
        _ => false,
    })
}

#[tauri::command]
fn open_vault_in_finder(root_path: String) -> Result<(), String> {
    let root = PathBuf::from(&root_path);
    let metadata = fs::metadata(&root).map_err(|err| err.to_string())?;
    if !metadata.is_dir() {
        return Err("vault root must be a directory".into());
    }

    #[cfg(target_os = "macos")]
    {
        let status = Command::new("open")
            .arg(&root)
            .status()
            .map_err(|err| err.to_string())?;
        if status.success() {
            Ok(())
        } else {
            Err(format!("open exited with status {status}"))
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = root;
        Err("Finder reveal is only available on macOS".into())
    }
}

fn show_main_window(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    let _ = app.show();

    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn schedule_show_main_window(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        std::thread::sleep(Duration::from_millis(500));
        show_main_window(&app);
    });
}

/// live-tauri — vault 디렉터리를 recursive 로 감시해 `.md` 변경 시 webview 에
/// `vault-changed` 이벤트를 emit. 500ms debounce 로 에디터의 다중 write 를 묶는다.
/// JS 측은 이 이벤트를 listen 해 즉시 refresh — 5초 폴링 대기 없이 반영.
/// debouncer 를 State 에 보관해 앱 수명 동안 살린다(재호출 시 이전 것을 교체·drop).
#[tauri::command]
fn start_vault_watch(
    app: AppHandle,
    root_path: String,
    state: State<'_, VaultWatcherState>,
) -> Result<(), String> {
    let canonical = canonical_root(&root_path)?;
    let app_handle = app.clone();
    let mut debouncer = new_debouncer(
        Duration::from_millis(500),
        None,
        move |result: DebounceEventResult| {
            if let Ok(events) = result {
                let md_changed = events.iter().any(|event| {
                    event
                        .paths
                        .iter()
                        .any(|path| path.extension().map_or(false, |ext| ext == "md"))
                });
                if md_changed {
                    let _ = app_handle.emit("vault-changed", ());
                }
            }
        },
    )
    .map_err(|err| err.to_string())?;
    debouncer
        .watcher()
        .watch(&canonical, RecursiveMode::Recursive)
        .map_err(|err| err.to_string())?;
    *state
        .debouncer
        .lock()
        .map_err(|_| "vault watcher state poisoned".to_string())? = Some(debouncer);
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .manage(VaultWatcherState::default())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Regular);

            show_main_window(app.handle());

            if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                if std::env::var_os(WEBVIEW_VERIFY_ENV).is_some() {
                    let verify_window = window.clone();
                    let verify_route = std::env::var(WEBVIEW_VERIFY_ROUTE_ENV)
                        .ok()
                        .filter(|route| is_safe_webview_verify_route(route));
                    let verify_topology_drag =
                        std::env::var_os(WEBVIEW_VERIFY_TOPOLOGY_DRAG_ENV).is_some();
                    tauri::async_runtime::spawn(async move {
                        if let Some(route) = verify_route {
                            let script = build_webview_verify_route_script(&route);
                            for _ in 0..WEBVIEW_VERIFY_ROUTE_ATTEMPTS {
                                let _ = verify_window.eval(&script);
                                std::thread::sleep(Duration::from_millis(
                                    WEBVIEW_VERIFY_ROUTE_INTERVAL_MS,
                                ));
                            }
                        } else {
                            std::thread::sleep(Duration::from_millis(2000));
                        }
                        if verify_topology_drag {
                            let _ = verify_window.eval(
                                r#"(() => {
                                  const result = {
                                    attempted: false,
                                    reason: "scheduled",
                                    focusDelta: null,
                                    companionDelta: null,
                                    companionSlug: "",
                                    companionCount: 0,
                                    alignedCompanionCount: 0,
                                    visibleCompanionCount: 0,
                                    relationLabelClicked: false
                                  };
                                  window.__ontologyAtlasTopologyDragVerify = result;

                                  const rectOf = (el) => {
                                    const rect = el.getBoundingClientRect();
                                    return {
                                      left: rect.left,
                                      top: rect.top,
                                      right: rect.right,
                                      bottom: rect.bottom,
                                      width: rect.width,
                                      height: rect.height
                                    };
                                  };
                                  const visible = (el) => {
                                    if (!el) return false;
                                    const style = getComputedStyle(el);
                                    const rect = el.getBoundingClientRect();
                                    return style.display !== "none" &&
                                      style.visibility !== "hidden" &&
                                      Number(style.opacity || "1") > 0.01 &&
                                      rect.width > 0 &&
                                      rect.height > 0 &&
                                      el.getAttribute("data-surface-hidden") !== "true";
                                  };
                                  const runDragVerification = () => {
                                    const focus = document.querySelector('[data-skeleton-card][data-slug="domain:views"]');
                                    if (!focus) {
                                      result.reason = "missing domain:views card";
                                      return;
                                    }
                                    if (typeof PointerEvent !== "function") {
                                      result.reason = "PointerEvent unavailable";
                                      return;
                                    }

                                    focus.click();
                                    window.setTimeout(() => {
                                    const relationLabel = document.querySelector('button[data-relation-label-hit="true"]');
                                    if (relationLabel && typeof relationLabel.click === "function") {
                                      relationLabel.click();
                                      result.relationLabelClicked = true;
                                    }
                                    const draggedFocus = document.querySelector('[data-skeleton-card][data-slug="domain:views"]');
                                    const companionsBefore = Array.from(document.querySelectorAll('[data-skeleton-card][data-dock-parent="domain:views"]'))
                                      .map((el) => ({
                                        el,
                                        slug: el.getAttribute("data-slug") || "",
                                        rect: rectOf(el)
                                      }));
                                    if (!draggedFocus || companionsBefore.length === 0) {
                                      result.reason = "missing selected reveal companion";
                                      return;
                                    }

                                    const focusBefore = rectOf(draggedFocus);
                                    const startX = focusBefore.left + focusBefore.width / 2;
                                    const startY = focusBefore.top + focusBefore.height / 2;
                                    const pointerBase = {
                                      bubbles: true,
                                      cancelable: true,
                                      pointerId: 19,
                                      pointerType: "mouse",
                                      isPrimary: true
                                    };
                                    draggedFocus.dispatchEvent(new PointerEvent("pointerdown", {
                                      ...pointerBase,
                                      button: 0,
                                      buttons: 1,
                                      clientX: startX,
                                      clientY: startY
                                    }));
                                    draggedFocus.dispatchEvent(new PointerEvent("pointermove", {
                                      ...pointerBase,
                                      button: 0,
                                      buttons: 1,
                                      clientX: startX - 92,
                                      clientY: startY + 42
                                    }));
                                    draggedFocus.dispatchEvent(new PointerEvent("pointermove", {
                                      ...pointerBase,
                                      button: 0,
                                      buttons: 1,
                                      clientX: startX - 128,
                                      clientY: startY + 58
                                    }));
                                    window.setTimeout(() => {
                                      const focusDuring = rectOf(draggedFocus);
                                      const focusDx = focusDuring.left - focusBefore.left;
                                      const focusDy = focusDuring.top - focusBefore.top;
                                      const companionsDuring = companionsBefore.map((before) => {
                                        const after = rectOf(before.el);
                                        const dx = after.left - before.rect.left;
                                        const dy = after.top - before.rect.top;
                                        const isVisible = visible(before.el);
                                        const travelsWithFocus =
                                          Math.abs(dx - focusDx) < 34 &&
                                          Math.abs(dy - focusDy) < 34;
                                        return {
                                          slug: before.slug,
                                          dx,
                                          dy,
                                          visible: isVisible,
                                          aligned: travelsWithFocus
                                        };
                                      });
                                      const alignedCompanion = companionsDuring.find((candidate) => candidate.aligned);
                                      const visibleDuringCompanions = companionsDuring.filter((candidate) => candidate.visible);
                                      draggedFocus.dispatchEvent(new PointerEvent("pointerup", {
                                        ...pointerBase,
                                        button: 0,
                                        buttons: 0,
                                        clientX: startX - 128,
                                        clientY: startY + 58
                                      }));
                                      window.setTimeout(() => {
                                        const companionsAfterRelease = companionsBefore.map((before) => ({
                                          slug: before.slug,
                                          visible: visible(before.el)
                                        }));
                                        const visibleCompanions = companionsAfterRelease.filter((candidate) => candidate.visible);
                                      result.attempted = true;
                                      result.reason = "done";
                                      result.companionCount = companionsDuring.length;
                                      result.alignedCompanionCount = companionsDuring.filter((candidate) => candidate.aligned).length;
                                      result.visibleCompanionCount = Math.max(
                                        visibleCompanions.length,
                                        visibleDuringCompanions.length
                                      );
                                      result.companionSlug = alignedCompanion?.slug || visibleDuringCompanions[0]?.slug || visibleCompanions[0]?.slug || companionsDuring[0]?.slug || "";
                                      result.focusDelta = { x: focusDx, y: focusDy };
                                      result.companionDelta = alignedCompanion
                                        ? { x: alignedCompanion.dx, y: alignedCompanion.dy }
                                        : companionsDuring[0]
                                          ? { x: companionsDuring[0].dx, y: companionsDuring[0].dy }
                                            : null;
                                      result.focusMoved = Math.abs(focusDx) > 24 || Math.abs(focusDy) > 24;
                                      result.companionVisible = visibleCompanions.length > 0 || visibleDuringCompanions.length > 0;
                                      result.companionAligned = Boolean(alignedCompanion);
                                      }, 650);
                                    }, 80);
                                    }, 700);
                                  };

                                  if (location.pathname.includes("/topology") && location.search) {
                                    const cleanPath = location.pathname + location.hash;
                                    history.replaceState({}, "", cleanPath);
                                    window.dispatchEvent(new PopStateEvent("popstate"));
                                    window.dispatchEvent(new Event("app:urlchange"));
                                    window.setTimeout(runDragVerification, 900);
                                    return;
                                  }

                                  runDragVerification();
                                })()"#,
                            );
                            std::thread::sleep(Duration::from_millis(2200));
                        }
                        for _ in 0..WEBVIEW_VERIFY_MARKER_ATTEMPTS {
                            let _ = verify_window.eval_with_callback(
                            r#"(() => {
                              const bodyText = document.body ? document.body.innerText : "";
                              const links = Array.from(document.querySelectorAll("a")).map((link) => ({
                                href: link.getAttribute("href") || "",
                                text: link.textContent || "",
                              }));
                              const buttons = Array.from(document.querySelectorAll("button")).map((button) => button.textContent || "");
                              const hasDecisionQuestionList = Boolean(
                                document.querySelector('[aria-label="비즈니스 결정 질문"], [aria-label="Business decision questions"]')
                              );
                              const hasReaderDecisionLens = Boolean(
                                document.querySelector('[data-reader-decision-lens="planning>marketing>leadership>developer>agent"]')
                              );
                              const topologyDragVerification = window.__ontologyAtlasTopologyDragVerify || null;
                              const skeletonCardsLayer = document.querySelector('[data-testid="sigma-skeleton-cards"]');
                              const topologyRelationLens = document.querySelector('[data-testid="topology-relation-lens"]');
                              const topologyRelationLensText = topologyRelationLens?.textContent || "";
                              const topologyRelationQualityLens = document.querySelector('[data-testid="topology-relation-quality-lens"]');
                              const topologyRelationQualityLensText = topologyRelationQualityLens?.textContent || "";
                              const topologyOverviewAgentReadiness = document.querySelector('[data-testid="topology-overview-agent-readiness"]');
                              const topologyOverviewAgentReadinessText = topologyOverviewAgentReadiness?.textContent || "";
                              const topologyOverviewAgentReadinessMeter = document.querySelector('[data-testid="topology-overview-agent-readiness-meter"]');
                              const topologyOverviewAgentReadinessMeterSegments = topologyOverviewAgentReadinessMeter
                                ? Array.from(topologyOverviewAgentReadinessMeter.querySelectorAll("[data-agent-readiness-segment]")).map((segment) => ({
                                    kind: segment.getAttribute("data-agent-readiness-segment") || "",
                                    count: segment.getAttribute("data-count") || ""
                                  }))
                                : [];
                              const topologySelectedRelationHalo = document.querySelector('[data-selected-relation-halo="true"]');
                              const topologySelectedRelationHaloD = topologySelectedRelationHalo?.getAttribute("d") || "";
                              const topologySelectedRelationHaloOpacity = Number(topologySelectedRelationHalo?.getAttribute("opacity") || "1");
                              const topologySelectedRelationClaimLens = document.querySelector('[data-testid="sigma-selected-edge-claim-lens"]');
                              const topologySelectedRelationClaimLensText = topologySelectedRelationClaimLens?.textContent || "";
                              const topologySelectedRelationClaimLensQuality =
                                topologySelectedRelationClaimLens?.getAttribute("data-relation-quality") ||
                                "";
                              const topologySelectedRelationClaimLensDotVisible =
                                Boolean(topologySelectedRelationClaimLens?.querySelector("[data-relation-quality-dot]"));
                              const topologySelectedRelationContract = document.querySelector('[data-testid="sigma-selected-edge-contract"]');
                              const topologySelectedRelationContractKind =
                                topologySelectedRelationContract?.getAttribute("data-relation-contract") ||
                                "";
                              const topologySelectedRelationContractText =
                                topologySelectedRelationContract?.textContent ||
                                "";
                              const topologySelectedRelationCard = document.querySelector('[data-testid="sigma-selected-edge-card"]');
                              const topologySelectedRelationCardQuality =
                                topologySelectedRelationCard?.getAttribute("data-relation-quality") ||
                                "";
                              const topologySelectedRelationCardAgentGate =
                                topologySelectedRelationCard?.getAttribute("data-agent-gate") ||
                                "";
                              const topologySelectedRelationCardAgentGateKind =
                                topologySelectedRelationCard?.getAttribute("data-agent-gate-kind") ||
                                "";
                              const topologySelectedRelationCardAgentDecision =
                                topologySelectedRelationCard?.getAttribute("data-agent-decision") ||
                                "";
                              const topologySelectedRelationAgentGate = document.querySelector('[data-testid="sigma-selected-edge-agent-gate"]');
                              const topologySelectedRelationAgentGateText =
                                topologySelectedRelationAgentGate?.getAttribute("data-metric-value") ||
                                topologySelectedRelationAgentGate?.textContent ||
                                "";
                              const topologySelectedRelationAgentDecision = document.querySelector('[data-testid="sigma-selected-edge-agent-decision"]');
                              const topologySelectedRelationAgentDecisionText =
                                topologySelectedRelationAgentDecision?.getAttribute("data-agent-decision") ||
                                topologySelectedRelationAgentDecision?.textContent ||
                                "";
                              const topologySelectedRelationAgentDecisionGateKind =
                                topologySelectedRelationAgentDecision?.getAttribute("data-agent-gate-kind") ||
                                "";
                              const topologySelectedRelationAgentRoute = document.querySelector('[data-testid="sigma-selected-edge-agent-route"]');
                              const topologySelectedRelationAgentRouteText =
                                topologySelectedRelationAgentRoute?.textContent ||
                                "";
                              const topologySelectedRelationAgentRouteGateKind =
                                topologySelectedRelationAgentRoute?.getAttribute("data-agent-gate-kind") ||
                                "";
                              const topologySelectedRelationAgentRoutePrimaryAction =
                                topologySelectedRelationAgentRoute?.getAttribute("data-primary-copy-action") ||
                                "";
                              const topologySelectedRelationPrimaryCopyAction = document.querySelector('[data-relation-copy-priority="primary"]');
                              const topologySelectedRelationPrimaryCopyActionKind =
                                topologySelectedRelationPrimaryCopyAction?.getAttribute("data-relation-copy-action") ||
                                "";
                              const fixedTopologySurfaces = Array.from(document.querySelectorAll(
                                '[data-testid="topology-analysis-panel"], [data-testid="topology-kind-legend"], [data-testid="topology-node-popover"]'
                              )).map((surface) => {
                                const style = getComputedStyle(surface);
                                const rect = surface.getBoundingClientRect();
                                return {
                                  visible:
                                    style.display !== "none" &&
                                    style.visibility !== "hidden" &&
                                    Number(style.opacity || "1") > 0.01 &&
                                    rect.width > 0 &&
                                    rect.height > 0,
                                  left: rect.left,
                                  top: rect.top,
                                  right: rect.right,
                                  bottom: rect.bottom
                                };
                              }).filter((surface) => surface.visible);
                              const topologyCards = Array.from(document.querySelectorAll("[data-skeleton-card]"))
                                .map((card) => {
                                  const style = getComputedStyle(card);
                                  const rect = card.getBoundingClientRect();
                                  return {
                                    slug: card.getAttribute("data-slug") || "",
                                    visible:
                                      style.display !== "none" &&
                                      style.visibility !== "hidden" &&
                                      Number(style.opacity || "1") > 0.01 &&
                                      rect.width > 0 &&
                                      rect.height > 0,
                                    left: rect.left,
                                    top: rect.top,
                                    right: rect.right,
                                    bottom: rect.bottom,
                                    width: rect.width,
                                    height: rect.height
                                  };
                                })
                                .filter((card) => card.visible);
                              const overlapPad = 2;
                              const fixedSurfacePad = 8;
                              let topologyCardOverlapCount = 0;
                              let topologyCardClippedCount = 0;
                              let topologyCardFixedSurfaceOverlapCount = 0;
                              for (let i = 0; i < topologyCards.length; i += 1) {
                                const card = topologyCards[i];
                                if (
                                  card.left < 0 ||
                                  card.top < 0 ||
                                  card.right > innerWidth ||
                                  card.bottom > innerHeight
                                ) {
                                  topologyCardClippedCount += 1;
                                }
                                for (const surface of fixedTopologySurfaces) {
                                  if (
                                    card.left < surface.right + fixedSurfacePad &&
                                    card.right > surface.left - fixedSurfacePad &&
                                    card.top < surface.bottom + fixedSurfacePad &&
                                    card.bottom > surface.top - fixedSurfacePad
                                  ) {
                                    topologyCardFixedSurfaceOverlapCount += 1;
                                    break;
                                  }
                                }
                                for (let j = i + 1; j < topologyCards.length; j += 1) {
                                  const a = topologyCards[i];
                                  const b = topologyCards[j];
                                  if (
                                    a.left < b.right - overlapPad &&
                                    a.right > b.left + overlapPad &&
                                    a.top < b.bottom - overlapPad &&
                                    a.bottom > b.top + overlapPad
                                  ) {
                                    topologyCardOverlapCount += 1;
                                  }
                                }
                              }
                              return JSON.stringify({
                                href: location.href,
                                title: document.title,
                                bodyText: bodyText.slice(0, 240),
                                bodyChildren: document.body ? document.body.children.length : null,
                                readyState: document.readyState,
                                bg: getComputedStyle(document.body).backgroundColor,
                                color: getComputedStyle(document.body).color,
                                width: innerWidth,
                                height: innerHeight,
                                markers: {
                                  ontologyNav: links.some((link) => link.href.includes("/ontology") || /온톨로지|Ontology/.test(link.text)),
                                  sourceVaultNav: links.some((link) => link.href.includes("/docs") || /저장소|문서함|Source Vault|Documents/.test(link.text)),
                                  agentBriefCopy: buttons.some((text) => /브리핑 복사|Copy brief/.test(text)) && /agent_brief/.test(bodyText),
                                  businessDecisionQuestions:
                                    hasDecisionQuestionList &&
                                    /누가 이 개념으로 결정을 내리는가\\?|Who uses this concept to make a decision\\?/.test(bodyText) &&
                                    /어떤 사용자·운영 결과를 바꾸는가\\?|Which user or operating outcome changes\\?/.test(bodyText) &&
                                    /어떤 구현 증거가 그 의미를 검증하는가\\?|Which implementation evidence proves the meaning\\?/.test(bodyText),
                                  readerDecisionLens: hasReaderDecisionLens,
                                  topologyRelief:
                                    location.pathname.includes("/topology") &&
                                    /Relief|Ontology relief map|concept cards|대표 카드|카드 골격/.test(bodyText),
                                  topologyCardsReady:
                                    skeletonCardsLayer?.getAttribute("data-skeleton-cards-ready") === "true",
                                  topologyCardCount: topologyCards.length,
                                  topologyCardOverlapCount,
                                  topologyCardClippedCount,
                                  topologyFixedSurfaceCount: fixedTopologySurfaces.length,
                                  topologyCardFixedSurfaceOverlapCount,
                                  topologyRelationLensVisible: Boolean(topologyRelationLens),
                                  topologyRelationLensText,
                                  topologyRelationLensPluralMismatch: /\b1\s+relation\s+types\b/i.test(topologyRelationLensText),
                                  topologyRelationQualityLensVisible: Boolean(topologyRelationQualityLens),
                                  topologyRelationQualityLensText,
                                  topologyOverviewAgentReadinessText,
                                  topologyOverviewAgentReadinessMeterSegments,
                                  topologySelectedRelationHaloVisible:
                                    Boolean(topologySelectedRelationHalo) &&
                                    topologySelectedRelationHaloD.length > 0 &&
                                    topologySelectedRelationHaloOpacity > 0.01,
                                  topologySelectedRelationHaloQuality:
                                    topologySelectedRelationHalo?.getAttribute("data-relation-quality") || "",
                                  topologySelectedRelationClaimLensVisible: Boolean(topologySelectedRelationClaimLens),
                                  topologySelectedRelationClaimLensText,
                                  topologySelectedRelationClaimLensQuality,
                                  topologySelectedRelationClaimLensDotVisible,
                                  topologySelectedRelationContractKind,
                                  topologySelectedRelationContractText,
                                  topologySelectedRelationCardQuality,
                                  topologySelectedRelationCardAgentGate,
                                  topologySelectedRelationCardAgentGateKind,
                                  topologySelectedRelationCardAgentDecision,
                                  topologySelectedRelationAgentGateText,
                                  topologySelectedRelationAgentDecisionText,
                                  topologySelectedRelationAgentDecisionGateKind,
                                  topologySelectedRelationAgentRouteText,
                                  topologySelectedRelationAgentRouteGateKind,
                                  topologySelectedRelationAgentRoutePrimaryAction,
                                  topologySelectedRelationPrimaryCopyActionKind,
                                  topologyDragAttempted: topologyDragVerification?.attempted === true,
                                  topologyDragReason: topologyDragVerification?.reason || "",
                                  topologyDragFocusMoved: topologyDragVerification?.focusMoved === true,
                                  topologyDragFocusDelta: topologyDragVerification?.focusDelta || null,
                                  topologyDragRelationLabelClicked: topologyDragVerification?.relationLabelClicked === true,
                                  topologyDragCompanionVisible: topologyDragVerification?.companionVisible === true,
                                  topologyDragCompanionAligned: topologyDragVerification?.companionAligned === true,
                                  topologyDragCompanionDelta: topologyDragVerification?.companionDelta || null,
                                  topologyDragCompanionSlug: topologyDragVerification?.companionSlug || "",
                                  topologyDragCompanionCount: topologyDragVerification?.companionCount || 0,
                                  topologyDragVisibleCompanionCount: topologyDragVerification?.visibleCompanionCount || 0,
                                  topologyDragAlignedCompanionCount: topologyDragVerification?.alignedCompanionCount || 0
                                }
                              });
                            })()"#,
                            |result| println!("[ontology-atlas-webview-verify] {result}"),
                            );
                            std::thread::sleep(Duration::from_millis(
                                WEBVIEW_VERIFY_MARKER_INTERVAL_MS,
                            ));
                        }
                    });
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pick_vault_directory,
            list_vault_directory,
            read_vault_text_file,
            read_vault_binary_file,
            write_vault_text_file,
            remove_vault_entry,
            ensure_vault_directory,
            vault_path_exists,
            open_vault_in_finder,
            start_vault_watch,
        ])
        .build(tauri::generate_context!())
        .expect("error while building ontology-atlas desktop app")
        .run(|app_handle, event| match event {
            RunEvent::Ready => {
                show_main_window(app_handle);
                schedule_show_main_window(app_handle.clone());
            }
            #[cfg(target_os = "macos")]
            RunEvent::Reopen { .. } => {
                show_main_window(app_handle);
                schedule_show_main_window(app_handle.clone());
            }
            _ => {}
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_relative_path_accepts_nested_vault_paths() {
        assert_eq!(
            normalize_relative_path("docs/ontology/project.md").unwrap(),
            PathBuf::from("docs/ontology/project.md")
        );
        assert_eq!(
            normalize_relative_path("./docs//ontology").unwrap(),
            PathBuf::from("docs/ontology")
        );
    }

    #[test]
    fn normalize_relative_path_rejects_escape_paths() {
        for path in [
            "../outside.md",
            "docs/../../outside.md",
            "/tmp/outside.md",
            "docs/../outside.md",
        ] {
            let error = normalize_relative_path(path).unwrap_err();
            assert_eq!(error, "relative path must stay inside the selected vault");
        }
    }

    #[test]
    fn resolve_inside_keeps_paths_under_the_selected_root() {
        assert_eq!(
            resolve_inside("/Users/me/vault", "docs/project.md").unwrap(),
            PathBuf::from("/Users/me/vault/docs/project.md")
        );
    }

    #[test]
    fn open_vault_in_finder_rejects_non_directory_root() {
        let error = open_vault_in_finder("/path/that/does/not/exist".into()).unwrap_err();
        assert!(!error.is_empty());
    }

    #[test]
    fn webview_verify_route_script_navigates_to_target_path() {
        let script = build_webview_verify_route_script("/en/topology/");

        assert!(script.contains("history.replaceState({}, \"\", next)"));
        assert!(script.contains("window.dispatchEvent(new Event(\"app:urlchange\"))"));
        assert!(script.contains("location.replace(next)"));
        assert!(script.contains("location.pathname + location.search + location.hash"));
        assert!(script.contains("\"/en/topology/\""));
    }

    #[test]
    fn remove_vault_entry_rejects_root_removal() {
        let error = remove_vault_entry("/tmp/vault".into(), "".into(), Some(true)).unwrap_err();
        assert_eq!(error, "refusing to remove the selected vault root");
    }

    #[test]
    fn remove_vault_entry_removes_files_and_directories() {
        let root = std::env::temp_dir().join(format!(
            "ontology-atlas-remove-test-{}",
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(root.join("docs/nested")).unwrap();
        fs::write(root.join("note.md"), "hello").unwrap();
        fs::write(root.join("docs/nested/file.md"), "nested").unwrap();

        remove_vault_entry(root.to_string_lossy().to_string(), "note.md".into(), None).unwrap();
        assert!(!root.join("note.md").exists());

        let non_recursive_error = remove_vault_entry(
            root.to_string_lossy().to_string(),
            "docs".into(),
            Some(false),
        )
        .unwrap_err();
        assert!(!non_recursive_error.is_empty());
        assert!(root.join("docs").exists());

        remove_vault_entry(
            root.to_string_lossy().to_string(),
            "docs".into(),
            Some(true),
        )
        .unwrap();
        assert!(!root.join("docs").exists());

        fs::remove_dir_all(root).ok();
    }

    #[cfg(unix)]
    #[test]
    fn vault_commands_reject_symlink_escapes() {
        use std::os::unix::fs::symlink;

        let nonce = std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("ontology-atlas-vault-root-{nonce}"));
        let outside = std::env::temp_dir().join(format!("ontology-atlas-vault-outside-{nonce}"));
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(&outside).unwrap();
        fs::write(outside.join("outside.md"), "outside").unwrap();
        symlink(outside.join("outside.md"), root.join("linked.md")).unwrap();
        symlink(&outside, root.join("linked-dir")).unwrap();

        let root_path = root.to_string_lossy().to_string();
        let read_error = read_vault_text_file(root_path.clone(), "linked.md".into()).unwrap_err();
        assert_eq!(
            read_error,
            "resolved path must stay inside the selected vault"
        );

        let write_error =
            write_vault_text_file(root_path.clone(), "linked.md".into(), "changed".into())
                .unwrap_err();
        assert_eq!(
            write_error,
            "resolved path must stay inside the selected vault"
        );
        assert_eq!(
            fs::read_to_string(outside.join("outside.md")).unwrap(),
            "outside"
        );

        let exists_error =
            vault_path_exists(root_path.clone(), "linked.md".into(), "file".into()).unwrap_err();
        assert_eq!(
            exists_error,
            "resolved path must stay inside the selected vault"
        );

        let mkdir_error =
            ensure_vault_directory(root_path.clone(), "linked-dir/new".into()).unwrap_err();
        assert_eq!(
            mkdir_error,
            "resolved path must stay inside the selected vault"
        );
        assert!(!outside.join("new").exists());

        let nested_write_error = write_vault_text_file(
            root_path.clone(),
            "linked-dir/new/created-outside.md".into(),
            "outside".into(),
        )
        .unwrap_err();
        assert_eq!(
            nested_write_error,
            "resolved path must stay inside the selected vault"
        );
        assert!(!outside.join("new").exists());

        let remove_error =
            remove_vault_entry(root_path, "linked.md".into(), Some(false)).unwrap_err();
        assert_eq!(
            remove_error,
            "resolved path must stay inside the selected vault"
        );

        fs::remove_dir_all(root).ok();
        fs::remove_dir_all(outside).ok();
    }
}
