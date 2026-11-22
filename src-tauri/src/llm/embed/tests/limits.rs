//! Response limits, with curl and a real socket.

use super::*;

#[test]
fn a_five_mib_answer_is_refused() {
    let stub = Stub::start(|| http("200 OK", "", &vec![b' '; 5 * 1024 * 1024]));
    assert_eq!(
        curl_runner(&stub.base()).version(),
        Err(EmbedError::ResponseTooLarge)
    );
}

#[test]
fn a_runner_that_never_answers_times_out() {
    let stub = Stub::start(|| Reply::Hang);
    let started = Instant::now();
    assert_eq!(
        curl_runner(&stub.base()).version(),
        Err(EmbedError::TimedOut)
    );
    assert!(started.elapsed() < Duration::from_secs(5));
}

/// Each request's own limit outlasts the stub's six-second stall, so only the question's one
/// deadline can answer `TimedOut`; without it the stub's closed socket would be a request error.
const SLOW_REQUESTS: Timeouts = Timeouts {
    query: "30",
    probe: "30",
    question: Duration::from_millis(400),
    ..FAST
};

#[test]
fn a_question_ends_at_its_one_deadline_wherever_the_runner_stalls() {
    // The model check stalls: the question is never sent and never recorded.
    let stub = Stub::start(|| Reply::Hang);
    let vault = temp_vault("question-deadline-check");
    let runner = LocalRunner::connect_with(
        &stub.base(),
        "bge-m3",
        &loopback_resolver,
        Arc::new(CurlTransport),
        SLOW_REQUESTS,
    )
    .unwrap();
    assert_eq!(
        runner.embed_query(&vault, "where is the quillwort"),
        Err(EmbedError::TimedOut)
    );
    assert_eq!(stub.hits(), 1, "only the model check");
    assert!(audit_lines(&vault).is_empty());

    // The model check answers and the question stalls: it ends at the same deadline.
    let answered = AtomicUsize::new(0);
    let stub = Stub::start(move || {
        if answered.fetch_add(1, Ordering::SeqCst) == 0 {
            http("200 OK", "", LOCAL_SHOW.as_bytes())
        } else {
            Reply::Hang
        }
    });
    let vault = temp_vault("question-deadline-send");
    let runner = LocalRunner::connect_with(
        &stub.base(),
        "bge-m3",
        &loopback_resolver,
        Arc::new(CurlTransport),
        SLOW_REQUESTS,
    )
    .unwrap();
    assert_eq!(
        runner.embed_query(&vault, "where is the quillwort"),
        Err(EmbedError::TimedOut)
    );
    assert_eq!(stub.hits(), 2);
    let lines = audit_lines(&vault);
    assert_eq!(lines.len(), 1, "{lines:?}");
    assert_eq!(lines[0]["outcome"], "error");
}

#[test]
fn a_stop_ends_a_batch_the_runner_has_not_answered_and_closes_the_run_as_stopped() {
    let answered = AtomicUsize::new(0);
    let stub = Stub::start(move || {
        // The model check answers; the batch never does.
        if answered.fetch_add(1, Ordering::SeqCst) == 0 {
            http("200 OK", "", LOCAL_SHOW.as_bytes())
        } else {
            Reply::Hang
        }
    });
    let vault = temp_vault("stopped-batch");
    let runner = curl_runner(&stub.base());
    let mut run = runner.start_build(&vault, plan(1, 10)).unwrap();
    let stop = AtomicBool::new(false);
    let ended = std::thread::scope(|scope| {
        scope.spawn(|| {
            while stub.hits() < 2 {
                std::thread::sleep(Duration::from_millis(5));
            }
            stop.store(true, Ordering::SeqCst);
        });
        EmbedSession::embed_batch_until(&mut run, &["alpha"], &stop)
    });
    // `TimedOut` would mean the batch ran to its two-second limit instead.
    assert_eq!(ended, Err(EmbedError::Cancelled));
    run.finish(RunEnd::Stopped).unwrap();
    let lines = audit_lines(&vault);
    let close = lines.last().unwrap();
    assert_eq!(close["embed"]["ended"], "stopped");
    assert_eq!(close["embed"]["passagesSent"], 1);
    std::fs::remove_dir_all(&vault).ok();
}
