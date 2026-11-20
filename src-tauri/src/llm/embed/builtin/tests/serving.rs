//! The worker's serve loop and the frames it reads and writes, over OS pipes.

use super::super::protocol::{
    decode_answer, encode_request, encode_vectors, read_frame, write_frame, Answer, FrameError,
    Reply, Request, MAX_ANSWER_BYTES, MAX_REQUEST_BYTES, PROTOCOL,
};
use super::super::worker::{requested, serve};
use super::fake_worker::{vector_of, Death, FakeModels, Gate, Log};
use super::*;
use std::io::{PipeReader, PipeWriter, Write as _};
use std::thread::JoinHandle;

struct Served {
    input: PipeWriter,
    output: PipeReader,
    worker: JoinHandle<i32>,
    gate: Arc<Gate>,
}

fn served(idle: Duration) -> Served {
    let (requests, input) = std::io::pipe().unwrap();
    let (output, answers) = std::io::pipe().unwrap();
    let gate = Arc::new(Gate::default());
    let models = FakeModels {
        log: Arc::new(Log::default()),
        gate: gate.clone(),
        killed: Arc::default(),
        fail_load: false,
        hold_load: false,
        death: Death::Panic,
    };
    let worker = std::thread::spawn(move || serve(requests, answers, &models, idle));
    let mut served = Served {
        input,
        output,
        worker,
        gate,
    };
    assert_eq!(
        served.answer(),
        Answer::Reply(Reply::Hello {
            protocol: PROTOCOL.into()
        })
    );
    served
}

impl Served {
    fn send(&mut self, request: &Request) {
        write_frame(&mut self.input, &encode_request(request)).unwrap();
    }

    fn answer(&mut self) -> Answer {
        let payload = read_frame(&mut self.output, MAX_ANSWER_BYTES)
            .unwrap()
            .unwrap();
        decode_answer(&payload).unwrap()
    }

    fn exit_code(self) -> i32 {
        drop(self.input);
        self.worker.join().unwrap()
    }
}

fn embed(id: u64, texts: &[&str]) -> Request {
    Request::Embed {
        id,
        texts: texts.iter().map(|text| (*text).to_string()).collect(),
        question: false,
    }
}

fn failed_code(answer: Answer) -> String {
    match answer {
        Answer::Reply(Reply::Failed { code, .. }) => code,
        other => panic!("not a refusal: {other:?}"),
    }
}

#[test]
fn only_the_one_flag_starts_the_worker() {
    let args = |list: &[&str]| -> Vec<std::ffi::OsString> {
        list.iter().map(std::ffi::OsString::from).collect()
    };
    assert!(requested(&args(&["atlas", "--embed-worker"])));
    for refused in [
        &["atlas"][..],
        &["atlas", "--embed-worker", "extra"],
        &["atlas", "--embed-worker=1"],
        &["atlas", "embed-worker"],
    ] {
        assert!(!requested(&args(refused)), "{refused:?}");
    }
}

#[test]
fn the_app_identifier_matches_the_bundle() {
    let config: serde_json::Value =
        serde_json::from_str(include_str!("../../../../../tauri.conf.json")).unwrap();
    let store = super::super::worker::app_store().unwrap();
    let identifier = config["identifier"].as_str().unwrap();
    assert!(store
        .dir()
        .ends_with(PathBuf::from(identifier).join("models").join("bge-m3")));
}

#[test]
fn it_loads_embeds_and_exits_on_request() {
    let mut worker = served(Duration::from_secs(60));
    worker.send(&embed(1, &["early"]));
    assert_eq!(failed_code(worker.answer()), "embed-model-not-ready");
    worker.send(&Request::Load { id: 2 });
    assert!(matches!(
        worker.answer(),
        Answer::Reply(Reply::Loaded { id: 2, .. })
    ));
    worker.send(&embed(3, &["search meaning", "검색"]));
    assert_eq!(
        worker.answer(),
        Answer::Vectors {
            id: 3,
            vectors: vec![vector_of("search meaning"), vector_of("검색")]
        }
    );
    worker.send(&Request::Exit);
    assert_eq!(worker.worker.join().unwrap(), 0);
}

#[test]
fn it_exits_when_its_input_closes_or_it_sits_idle() {
    let worker = served(Duration::from_secs(60));
    assert_eq!(worker.exit_code(), 0);
    let idle = served(Duration::from_millis(50));
    let started = Instant::now();
    let Served {
        input,
        worker: thread,
        ..
    } = idle;
    assert_eq!(thread.join().unwrap(), 0);
    assert!(started.elapsed() < Duration::from_secs(5));
    drop(input);
}

#[test]
fn it_refuses_batches_over_the_caps_a_runner_has() {
    let mut worker = served(Duration::from_secs(60));
    worker.send(&Request::Load { id: 1 });
    worker.answer();
    let many: Vec<&str> = vec!["word"; 33];
    worker.send(&embed(2, &many));
    assert_eq!(failed_code(worker.answer()), "embed-batch-too-large");
    worker.send(&Request::Embed {
        id: 3,
        texts: vec!["a".into(), "b".into()],
        question: true,
    });
    assert_eq!(failed_code(worker.answer()), "embed-batch-too-large");
    let long = "가".repeat(2_001);
    worker.send(&embed(4, &[&long]));
    assert_eq!(failed_code(worker.answer()), "embed-passage-too-long");
    worker.send(&embed(5, &[]));
    assert_eq!(failed_code(worker.answer()), "embed-batch-empty");
    assert_eq!(worker.exit_code(), 0);
}

#[test]
fn a_request_over_the_cap_or_unreadable_ends_the_worker() {
    let oversized = ((MAX_REQUEST_BYTES + 1) as u32).to_le_bytes().to_vec();
    let mut not_json = 5u32.to_le_bytes().to_vec();
    not_json.extend(b"{oops");
    let mut unknown = Vec::new();
    let body = br#"{"op":"format-disk","id":1}"#;
    unknown.extend((body.len() as u32).to_le_bytes());
    unknown.extend(body);
    for (tag, bytes) in [
        ("oversized", oversized),
        ("not-json", not_json),
        ("unknown", unknown),
    ] {
        let mut worker = served(Duration::from_secs(60));
        worker.input.write_all(&bytes).unwrap();
        let answer = worker.answer();
        assert!(
            matches!(&answer, Answer::Reply(Reply::Failed { id: 0, code, .. }) if code == "embed-worker-failed"),
            "{tag}: {answer:?}"
        );
        assert_eq!(worker.worker.join().unwrap(), 2, "{tag}");
    }
}

#[test]
fn a_stop_ends_the_request_it_names_and_no_other() {
    let mut worker = served(Duration::from_secs(60));
    worker.send(&Request::Load { id: 1 });
    worker.answer();
    worker.send(&embed(2, &["slow"]));
    worker.send(&Request::Stop { id: 2 });
    assert_eq!(failed_code(worker.answer()), "embed-cancelled");
    worker.send(&Request::Stop { id: 1 });
    worker.send(&embed(3, &["wave"]));
    assert!(matches!(worker.answer(), Answer::Vectors { id: 3, .. }));

    // A stop that arrives while its request still waits behind another.
    worker.send(&embed(4, &["gate", "wave"]));
    worker.send(&embed(5, &["slow"]));
    worker.send(&Request::Stop { id: 5 });
    worker.gate.open();
    assert!(matches!(worker.answer(), Answer::Vectors { id: 4, .. }));
    assert_eq!(failed_code(worker.answer()), "embed-cancelled");
    assert_eq!(worker.exit_code(), 0);
}

#[test]
fn a_conversion_reports_progress_and_can_be_stopped() {
    let mut worker = served(Duration::from_secs(60));
    worker.send(&Request::Convert { id: 1 });
    let half = Answer::Reply(Reply::Progress {
        id: 1,
        done: 1,
        total: 2,
    });
    assert_eq!(worker.answer(), half);
    worker.send(&Request::Stop { id: 1 });
    assert_eq!(failed_code(worker.answer()), "embed-cancelled");

    worker.gate.open();
    worker.send(&Request::Convert { id: 2 });
    let progress: Vec<Answer> = (0..3).map(|_| worker.answer()).collect();
    assert_eq!(
        progress,
        [
            Answer::Reply(Reply::Progress {
                id: 2,
                done: 1,
                total: 2
            }),
            Answer::Reply(Reply::Progress {
                id: 2,
                done: 2,
                total: 2
            }),
            Answer::Reply(Reply::Converted { id: 2 }),
        ]
    );
    assert_eq!(worker.exit_code(), 0);
}

#[test]
fn input_that_closes_mid_batch_stops_the_batch() {
    let mut worker = served(Duration::from_secs(60));
    worker.send(&Request::Load { id: 1 });
    worker.answer();
    worker.send(&embed(2, &["slow"]));
    let Served {
        input,
        mut output,
        worker: thread,
        ..
    } = worker;
    let closed = Instant::now();
    drop(input);
    let payload = read_frame(&mut output, MAX_ANSWER_BYTES).unwrap().unwrap();
    assert_eq!(
        failed_code(decode_answer(&payload).unwrap()),
        "embed-cancelled"
    );
    assert_eq!(thread.join().unwrap(), 0);
    assert!(closed.elapsed() < Duration::from_secs(2));
}

#[test]
fn frames_over_the_cap_are_refused_before_their_body_is_read() {
    let mut header = 100u32.to_le_bytes().to_vec();
    header.extend([0u8; 3]);
    let mut reader: &[u8] = &header;
    assert_eq!(read_frame(&mut reader, 99), Err(FrameError::TooLarge));
    assert_eq!(reader.len(), 3, "the body was read");
    let mut truncated: &[u8] = &header;
    assert_eq!(read_frame(&mut truncated, 100), Err(FrameError::Broken));
    let mut empty: &[u8] = &[];
    assert_eq!(read_frame(&mut empty, 100), Ok(None));
    let mut half_length: &[u8] = &[1, 0];
    assert_eq!(read_frame(&mut half_length, 100), Err(FrameError::Broken));
}

#[test]
fn vectors_round_trip_and_a_body_of_the_wrong_size_is_refused() {
    let vectors = vec![vector_of("a"), vector_of("b")];
    let encoded = encode_vectors(7, &vectors);
    assert_eq!(
        decode_answer(&encoded),
        Ok(Answer::Vectors { id: 7, vectors })
    );
    let mut longer = encoded.clone();
    longer.extend([0u8; 4]);
    assert_eq!(
        decode_answer(&longer),
        Err(EmbedError::ResponseInvalid("frame"))
    );
    let mut too_many = encoded;
    too_many.splice(9..13, 33u32.to_le_bytes());
    assert_eq!(
        decode_answer(&too_many),
        Err(EmbedError::ResponseInvalid("frame"))
    );
    assert!(MAX_ANSWER_BYTES >= encode_vectors(1, &vec![vec![0.0; 1024]; 32]).len());
}
