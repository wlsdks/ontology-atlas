//! The lines this module writes are the lines the Settings screen reads.

use super::*;

#[cfg(any(unix, windows))]
#[test]
fn the_embed_and_download_lines_match_the_shared_reader_fixture() {
    fn stable(mut line: serde_json::Value) -> serde_json::Value {
        line["at"] = "2026-11-19T09:00:00.000Z".into();
        if line.get("durationMs").is_some() {
            line["durationMs"] = 1.into();
        }
        for key in ["embed", "download"] {
            if line.get(key).is_some() {
                line[key]["run"] = "00000000-0000-4000-8000-000000000000".into();
            }
        }
        line
    }
    let vault = temp_vault("fixture");
    let fake = Fake::new(|request| Ok((200, embeddings_json(request_input_count(request), 4))));
    let runner = fake_runner("http://127.0.0.1:11434", &fake).unwrap();
    let mut run = runner
        .start_build(
            &vault,
            BuildPlan {
                files: 1,
                passages: 2,
                chars: 10,
            },
        )
        .unwrap();
    run.embed_batch(&["alpha", "bravo"]).unwrap();
    run.finish(RunEnd::Complete).unwrap();
    runner
        .embed_query(&vault, "결제 재시도는 어디서 정하나요?")
        .unwrap();
    let pull = Stub::start(|| {
        progress_lines(&[
            r#"{"status":"pulling x","digest":"sha256:daec91ffb5dd0c27411bd71f29932917c49cf529a641d0168496c3a501e3062c","total":1157671200,"completed":1157671200}"#,
            r#"{"status":"success"}"#,
        ])
    });
    let puller = LocalRunner::connect_with(
        "http://127.0.0.1:11434",
        "bge-m3",
        &loopback_resolver,
        Arc::new(CurlTransport),
        FAST,
    )
    .unwrap();
    let pull_base = pull.base();
    let pulling = LocalRunner {
        endpoint: loopback::local_endpoint(&pull_base, &loopback_resolver).unwrap(),
        ..puller
    };
    pulling
        .pull(&vault, "bge-m3", &AtomicBool::new(false), &mut |_| {})
        .unwrap();

    let written: Vec<_> = audit_lines(&vault).into_iter().map(stable).collect();
    let fixture: Vec<serde_json::Value> =
        include_str!("../../../../../tests/fixtures/llm-audit-log.sample.jsonl")
            .lines()
            .filter(|line| !line.trim().is_empty())
            .map(|line| serde_json::from_str(line).unwrap())
            .filter(|line: &serde_json::Value| {
                line["purpose"]
                    .as_str()
                    .is_some_and(|p| p.starts_with("embed-") || p == "model-download")
            })
            .collect();
    let mut expected = fixture;
    // The pull stub listens on a random port; the fixture names the default one.
    for line in written.iter().zip(expected.iter_mut()) {
        if line.0["purpose"] == "model-download" {
            line.1["host"] = line.0["host"].clone();
        }
    }
    assert_eq!(written, expected);
    std::fs::remove_dir_all(&vault).ok();
}
