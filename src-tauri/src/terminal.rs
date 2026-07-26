// 앱 안에서 **사용자의** 셸/에이전트 CLI 를 띄우는 PTY 브리지 (#79).
//
// ## 무엇이 아닌가
//
// Atlas 는 이걸로 AI 클라이언트가 되지 않는다. API 키·모델 라우팅·스트리밍·
// 비용·프롬프트를 하나도 소유하지 않는다 — 사용자가 이미 설치하고 이미 로그인한
// `claude` / `codex` / 그냥 셸이 자기 자격증명으로 돈다. 우리가 하는 일은
// "그 프로세스에 창을 하나 준다" 뿐이다.
//
// `docs/AGENT-GRAPH-WORKFLOW.md` 의 경계 문장(2026-07-26 소유자 결정)과
// `scripts/check-desktop-readiness.mjs` 게이트가 이 계약을 문서 쪽에서 잠근다.
//
// ## 네 가지 규칙 (코드로 지킨다)
//
// 1. **자동 실행 0** — `terminal_write` 는 프런트의 키 입력에서만 호출된다.
//    이 모듈은 어떤 명령도 스스로 만들지 않는다. 셸 인자에 사용자 명령을
//    끼워 넣는 경로가 아예 없다(`-c "..."` 없음).
// 2. **숨은 입력 0** — 세션 시작 시 프롬프트 프리필/자동 타이핑을 하지 않는다.
// 3. **cwd 스코프** — 사용자가 이미 연 vault(또는 repo) 루트에서만 시작한다.
//    `validate_cwd` 가 실존 디렉토리인지 확인하고 canonicalize 한다.
// 4. **데스크톱 전용** — 웹은 이 커맨드에 도달할 수 없다(Tauri IPC).
//
// ## 왜 `portable-pty` 인가
//
// 진짜 TTY 가 필요하다. `std::process::Command` 의 파이프로는 `claude` 같은
// 대화형 TUI 가 로우 모드·색·리사이즈를 못 쓴다 — VS Code 가 node-pty 를 쓰는
// 이유와 같다.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::{fs, thread};

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

/// 한 세션의 살아있는 자원. `writer`/`master` 는 별 락으로 잡아
/// 쓰기(키 입력)와 리사이즈가 서로를 막지 않게 한다.
struct Session {
    master: Mutex<Box<dyn MasterPty + Send>>,
    writer: Mutex<Box<dyn Write + Send>>,
    child: Mutex<Box<dyn Child + Send + Sync>>,
}

#[derive(Default)]
pub struct TerminalState {
    sessions: Mutex<HashMap<u64, Arc<Session>>>,
    next_id: AtomicU64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalOpened {
    /// 이후 write/resize/close 에 쓰는 세션 id.
    id: u64,
    /// 실제로 띄운 프로그램 (사용자에게 무엇이 도는지 그대로 보여준다).
    program: String,
    /// 셸이 시작한 절대 경로 — "어디서 도는지" 를 화면이 말할 수 있게.
    cwd: String,
}

/// 출력 스트림 이벤트 이름 — 프런트는 `terminal://data/<id>` 를 구독한다.
fn data_event(id: u64) -> String {
    format!("terminal://data/{id}")
}

/// 프로세스 종료 이벤트 — 세션이 끝났음을 화면이 알아야 "닫힘" 을 그린다.
fn exit_event(id: u64) -> String {
    format!("terminal://exit/{id}")
}

/// 셸이 시작할 디렉토리 — **사용자가 이미 연 폴더**만 받는다.
///
/// 임의 경로를 프런트가 넘길 수는 있지만, 실존 디렉토리가 아니면 거절하고
/// canonicalize 해 심링크 우회를 막는다. 여기서 하는 건 "정말 폴더인가" 까지고,
/// **어떤 폴더를 열지는 이미 사용자가 OS 피커로 정한 결정**이다.
fn validate_cwd(cwd: &str) -> Result<PathBuf, String> {
    if cwd.trim().is_empty() {
        return Err("작업 폴더 경로가 비어 있어요.".into());
    }
    let path = PathBuf::from(cwd);
    let meta = fs::metadata(&path).map_err(|_| "작업 폴더가 존재하지 않아요.".to_string())?;
    if !meta.is_dir() {
        return Err("작업 폴더 경로가 디렉토리가 아니에요.".into());
    }
    fs::canonicalize(&path).map_err(|err| format!("작업 폴더를 확정할 수 없어요: {err}"))
}

/// 띄울 프로그램 — 인자 없는 **로그인 셸 하나**만 만든다.
///
/// 사용자 명령을 인자로 붙이는 경로를 두지 않는 것이 "자동 실행 0 · 숨은 입력
/// 0" 의 코드 쪽 보장이다. 에이전트를 쓰고 싶으면 사용자가 셸에 직접
/// `claude` 라고 친다 — 우리가 대신 치지 않는다.
fn login_shell() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string())
}

#[tauri::command]
pub fn terminal_open(
    app: AppHandle,
    state: State<'_, TerminalState>,
    cwd: String,
    cols: u16,
    rows: u16,
) -> Result<TerminalOpened, String> {
    let dir = validate_cwd(&cwd)?;
    let program = login_shell();

    let pty = native_pty_system();
    let pair = pty
        .openpty(PtySize {
            rows: rows.max(1),
            cols: cols.max(1),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|err| format!("터미널을 열 수 없어요: {err}"))?;

    // 인자 0개 — 로그인 셸만 띄운다(위 `login_shell` 주석 참고).
    let mut cmd = CommandBuilder::new(&program);
    cmd.cwd(&dir);
    // 대화형 TUI 가 색·커서 제어를 쓰도록 최소한의 TERM 만 준다.
    cmd.env("TERM", "xterm-256color");

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|err| format!("셸을 실행할 수 없어요: {err}"))?;
    // slave 는 spawn 후 즉시 닫아야 자식 종료 시 master 가 EOF 를 받는다.
    drop(pair.slave);

    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|err| format!("터미널 출력을 읽을 수 없어요: {err}"))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|err| format!("터미널 입력을 열 수 없어요: {err}"))?;

    let id = state.next_id.fetch_add(1, Ordering::Relaxed) + 1;
    let session = Arc::new(Session {
        master: Mutex::new(pair.master),
        writer: Mutex::new(writer),
        child: Mutex::new(child),
    });
    state
        .sessions
        .lock()
        .map_err(|_| "터미널 상태가 잠겼어요.".to_string())?
        .insert(id, Arc::clone(&session));

    // 출력 펌프 — PTY 는 블로킹 read 라 전용 스레드가 필요하다. EOF(=자식 종료)면
    // exit 이벤트를 쏘고 스레드가 끝난다.
    let emit_app = app.clone();
    thread::spawn(move || {
        let mut reader = reader;
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let chunk = String::from_utf8_lossy(&buf[..n]).into_owned();
                    if emit_app.emit(&data_event(id), chunk).is_err() {
                        break; // 창이 사라졌으면 펌프도 접는다.
                    }
                }
                Err(_) => break,
            }
        }
        let _ = emit_app.emit(&exit_event(id), id);
    });

    Ok(TerminalOpened {
        id,
        program,
        cwd: dir.to_string_lossy().into_owned(),
    })
}

fn session_of(state: &State<'_, TerminalState>, id: u64) -> Result<Arc<Session>, String> {
    state
        .sessions
        .lock()
        .map_err(|_| "터미널 상태가 잠겼어요.".to_string())?
        .get(&id)
        .cloned()
        .ok_or_else(|| "이미 닫힌 터미널이에요.".to_string())
}

/// 키 입력 전달 — **프런트의 실제 키 이벤트에서만** 호출된다. 이 함수를 자동
/// 갱신·마운트·포커스 경로에서 부르는 순간 "숨은 입력 0" 이 깨진다.
#[tauri::command]
pub fn terminal_write(state: State<'_, TerminalState>, id: u64, data: String) -> Result<(), String> {
    let session = session_of(&state, id)?;
    let mut writer = session
        .writer
        .lock()
        .map_err(|_| "터미널 입력이 잠겼어요.".to_string())?;
    writer
        .write_all(data.as_bytes())
        .map_err(|err| format!("입력을 보내지 못했어요: {err}"))?;
    writer
        .flush()
        .map_err(|err| format!("입력을 보내지 못했어요: {err}"))
}

#[tauri::command]
pub fn terminal_resize(
    state: State<'_, TerminalState>,
    id: u64,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let session = session_of(&state, id)?;
    // 가드를 지역 변수로 잡는다 — 표현식 끝에서 임시로 두면 블록 지역보다 늦게
    // 드롭돼 대여 검사가 막는다.
    let master = session
        .master
        .lock()
        .map_err(|_| "터미널이 잠겼어요.".to_string())?;
    master
        .resize(PtySize {
            rows: rows.max(1),
            cols: cols.max(1),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|err| format!("터미널 크기를 바꾸지 못했어요: {err}"))
}

/// 세션 종료 — 자식을 죽이고 맵에서 뺀다. 창을 닫거나 도크를 접을 때 호출한다.
/// 좀비 셸이 남으면 사용자 기계에 우리 흔적이 남는 것이라 반드시 정리한다.
#[tauri::command]
pub fn terminal_close(state: State<'_, TerminalState>, id: u64) -> Result<(), String> {
    let removed = state
        .sessions
        .lock()
        .map_err(|_| "터미널 상태가 잠겼어요.".to_string())?
        .remove(&id);
    if let Some(session) = removed {
        if let Ok(mut child) = session.child.lock() {
            let _ = child.kill();
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_cwd_rejects_empty_and_missing() {
        assert!(validate_cwd("").is_err());
        assert!(validate_cwd("   ").is_err());
        assert!(validate_cwd("/path/does/not/exist/atlas-term").is_err());
    }

    #[test]
    fn validate_cwd_rejects_a_file() {
        let dir = std::env::temp_dir();
        let file = dir.join(format!("atlas-term-{}.txt", std::process::id()));
        fs::write(&file, b"x").unwrap();
        assert!(validate_cwd(file.to_str().unwrap()).is_err());
        let _ = fs::remove_file(&file);
    }

    #[test]
    fn validate_cwd_canonicalizes_an_existing_dir() {
        let dir = std::env::temp_dir();
        let resolved = validate_cwd(dir.to_str().unwrap()).unwrap();
        assert!(resolved.is_absolute());
        assert!(resolved.is_dir());
    }

    #[test]
    fn login_shell_falls_back_to_a_real_path() {
        // SHELL 이 없어도 빈 문자열을 spawn 하지 않는다.
        let shell = login_shell();
        assert!(!shell.trim().is_empty());
        assert!(shell.starts_with('/'));
    }

    #[test]
    fn event_names_are_session_scoped() {
        // 세션마다 채널이 달라야 두 터미널의 출력이 섞이지 않는다.
        assert_ne!(data_event(1), data_event(2));
        assert_ne!(data_event(1), exit_event(1));
    }
}
