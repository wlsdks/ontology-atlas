//! Ollama cloud models forward the input to another host.

use super::*;

#[test]
fn a_cloud_model_name_is_refused_before_any_request() {
    let fake = Fake::new(|_| Ok((200, embeddings_json(1, 4))));
    for name in [
        "x:cloud",
        "gpt-oss:120b-cloud",
        "Embed-Cloud:latest",
        "team/cloud",
    ] {
        let runner = LocalRunner::connect_with(
            "http://127.0.0.1:11434",
            name,
            &loopback_resolver,
            fake.clone(),
            FAST,
        );
        assert!(matches!(runner, Err(EmbedError::ModelRemote)), "{name}");
    }
    assert!(LocalRunner::connect_with(
        "http://127.0.0.1:11434",
        "cloudberry-embed",
        &loopback_resolver,
        fake.clone(),
        FAST
    )
    .is_ok());
    assert_eq!(fake.calls(), 0);
}

#[test]
fn the_model_list_leaves_out_cloud_and_remote_models() {
    let fake = Fake::new(|_| {
        Ok((
            200,
            r#"{"models":[
                {"name":"x:cloud","capabilities":["embedding"]},
                {"name":"y-embed:latest","remote_host":"https://ollama.com:443","capabilities":["embedding"]},
                {"name":"z-embed:latest","details":{"remote_model":"z"},"capabilities":["embedding"]},
                {"name":"bge-m3:latest","remote_host":"","capabilities":["embedding"]}
            ]}"#
            .into(),
        ))
    });
    let runner = fake_runner("http://127.0.0.1:11434", &fake).unwrap();
    assert_eq!(runner.embedding_models().unwrap(), vec!["bge-m3:latest"]);
}

#[cfg(any(unix, windows))]
#[test]
fn a_model_the_runner_shows_as_remote_is_refused_with_nothing_sent() {
    let vault = temp_vault("remote-show");
    for show in [
        r#"{"remote_host":"https://ollama.com:443","remote_model":"bge-m3"}"#,
        r#"{"details":{"remote_host":"https://ollama.com"}}"#,
        r#"{"remote_model":"bge-m3"}"#,
    ] {
        let fake = Fake::showing(show, |_| Ok((200, embeddings_json(1, 4))));
        let runner = fake_runner("http://127.0.0.1:11434", &fake).unwrap();
        assert!(matches!(
            runner.start_build(&vault, plan(1, 3)),
            Err(EmbedError::ModelRemote)
        ));
        assert_eq!(
            runner.embed_query(&vault, "question"),
            Err(EmbedError::ModelRemote)
        );
        assert_eq!(fake.calls(), 0, "{show}");
    }
    assert!(audit_lines(&vault).is_empty());
    std::fs::remove_dir_all(&vault).ok();
}

#[cfg(any(unix, windows))]
#[test]
fn a_runner_that_is_not_ollama_is_checked_once_and_used() {
    let vault = temp_vault("not-ollama");
    let fake = Fake::new(|request| Ok((200, embeddings_json(request_input_count(request), 4))));
    let runner = fake_runner("http://127.0.0.1:1234/v1", &fake).unwrap();
    runner.embed_query(&vault, "one").unwrap();
    runner.embed_query(&vault, "two").unwrap();
    assert_eq!(fake.shows.load(Ordering::SeqCst), 1);
    std::fs::remove_dir_all(&vault).ok();
}
