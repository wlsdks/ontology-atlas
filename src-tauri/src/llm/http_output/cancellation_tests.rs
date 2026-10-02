use super::*;
use std::io::BufRead;
use std::net::TcpListener;
use std::time::{Duration, Instant};
use tokio::sync::oneshot;

fn run(
    command: Command,
    input: &[u8],
    receiver: &mut oneshot::Receiver<()>,
) -> Result<Output, CaptureError> {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap()
        .block_on(capture_cancelled(command, input, receiver))
}
#[test]
fn cancellation_before_capture_never_spawns_the_program() {
    let (sender, mut receiver) = oneshot::channel();
    sender.send(()).unwrap();
    assert!(matches!(
        run(Command::new("atlas-must-not-spawn"), b"", &mut receiver),
        Err(CaptureError::Cancelled)
    ));
}
#[test]
fn cancellation_reaps_a_child_even_when_its_stdin_is_full() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    listener.set_nonblocking(true).unwrap();
    let port = listener.local_addr().unwrap().port();
    let marker = std::env::temp_dir().join(format!(
        "atlas-cancel-timeout-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    let mut command = Command::new("node");
    command.args(["-e", &format!("const s=require('node:net').connect({port},'127.0.0.1',()=>s.write(process.pid+'\\n')); setTimeout(()=>{{require('node:fs').writeFileSync(process.argv[1],'expired');process.exit(9)}},30000);")]);
    command.arg(&marker);
    let (sender, mut receiver) = oneshot::channel();
    let worker = std::thread::spawn(move || run(command, &vec![b'x'; 1024 * 1024], &mut receiver));
    let waiting = Instant::now();
    let (mut socket, _) = loop {
        match listener.accept() {
            Ok(connection) => break connection,
            Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                assert!(
                    !worker.is_finished(),
                    "capture finished before the child connected"
                );
                assert!(
                    waiting.elapsed() < Duration::from_secs(30),
                    "child startup hang detector"
                );
                std::thread::yield_now();
            }
            Err(error) => panic!("accept failed: {error}"),
        }
    };
    socket.set_nonblocking(false).unwrap();
    socket
        .set_read_timeout(Some(Duration::from_secs(30)))
        .unwrap();
    let mut pid = String::new();
    std::io::BufReader::new(&mut socket)
        .read_line(&mut pid)
        .unwrap();
    let started = Instant::now();
    sender.send(()).unwrap();
    assert!(matches!(
        worker.join().unwrap(),
        Err(CaptureError::Cancelled)
    ));
    eprintln!("native cancellation cleanup: {:?}", started.elapsed());
    let expired_naturally = marker.exists();
    if expired_naturally {
        std::fs::remove_file(&marker).unwrap();
    }
    assert!(
        !expired_naturally,
        "the fixture expired naturally instead of being terminated by cancellation"
    );
    let closed = socket.read(&mut [0]);
    assert!(
        matches!(closed, Ok(0))
            || closed.is_err_and(|error| matches!(
                error.kind(),
                io::ErrorKind::ConnectionReset | io::ErrorKind::ConnectionAborted
            ))
    );
    #[cfg(unix)]
    {
        let pid: i32 = pid.trim().parse().unwrap();
        assert_eq!(
            unsafe { libc::kill(pid, 0) },
            -1,
            "owned child still exists after cancellation"
        );
        assert_eq!(io::Error::last_os_error().raw_os_error(), Some(libc::ESRCH));
    }
}
#[test]
fn cancellable_capture_preserves_both_exact_output_budgets_and_refuses_overflow() {
    for extra in [0, 1] {
        let mut command = Command::new("node");
        command.args(["-e", &format!("process.stderr.write(Buffer.alloc({MAX_STDERR_BYTES})); process.stdout.write(Buffer.alloc({}));", MAX_STDOUT_BYTES + extra)]);
        let (_sender, mut receiver) = oneshot::channel();
        let result = run(command, b"", &mut receiver);
        if extra == 0 {
            let output = result.unwrap();
            assert!(output.status.success());
            assert_eq!(output.stdout.len(), MAX_STDOUT_BYTES);
            assert_eq!(output.stderr.len(), MAX_STDERR_BYTES);
        } else {
            assert!(
                matches!(result, Err(CaptureError::Response(error)) if error.kind() == io::ErrorKind::InvalidData)
            );
        }
    }
}

#[test]
fn the_chat_blocking_worker_can_drive_native_async_io() {
    let (_sender, mut receiver) = oneshot::channel();
    let result = tauri::async_runtime::block_on(async {
        tauri::async_runtime::spawn_blocking(move || {
            let mut command = Command::new("node");
            command.args(["-e", "process.stdout.write('response')"]);
            tauri::async_runtime::block_on(capture_cancelled(command, b"", &mut receiver))
        })
        .await
        .unwrap()
    })
    .unwrap();
    assert!(result.status.success());
    assert_eq!(result.stdout, b"response");
}
