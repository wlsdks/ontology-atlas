//! The loopback rule.

use super::*;

#[test]
fn a_remote_address_is_refused_before_any_request() {
    let fake = Fake::new(|_| Ok((200, embeddings_json(1, 4))));
    for remote in [
        "https://example.com",
        "https://93.184.216.34:11434",
        "https://10.0.0.5",
        "https://[2606:2800:220:1::]:443",
        "https://127.0.0.1.nip.io",
        "https://localhost.example.com",
    ] {
        assert!(
            matches!(fake_runner(remote, &fake), Err(EmbedError::NotLocal)),
            "{remote} must be refused"
        );
    }
    // The public entry point resolves and refuses the same way.
    assert!(matches!(
        LocalRunner::connect("https://example.com", "bge-m3"),
        Err(EmbedError::NotLocal)
    ));
    // Plain http beyond loopback is already refused by the shared address check.
    assert!(matches!(
        fake_runner("http://example.com", &fake),
        Err(EmbedError::Endpoint(_))
    ));
    assert_eq!(fake.calls(), 0);
}

#[test]
fn every_loopback_spelling_is_accepted_for_http_and_https() {
    let fake = Fake::new(|_| Ok((200, embeddings_json(1, 4))));
    for local in [
        "http://localhost:11434",
        "https://localhost:11434",
        "http://127.0.0.1:11434",
        "http://127.8.9.10",
        "https://[::1]:8443",
        "http://localhost:1234/v1",
    ] {
        assert!(
            fake_runner(local, &fake).is_ok(),
            "{local} must be accepted"
        );
    }
}

#[test]
fn a_localhost_that_resolves_elsewhere_is_refused() {
    let fake = Fake::new(|_| Ok((200, embeddings_json(1, 4))));
    let remote: &Resolve = &|_, _| Ok(vec!["93.184.216.34".parse().unwrap()]);
    let mixed: &Resolve = &|_, _| {
        Ok(vec![
            "127.0.0.1".parse().unwrap(),
            "192.168.1.20".parse().unwrap(),
        ])
    };
    let none: &Resolve = &|_, _| Ok(vec![]);
    let failing: &Resolve = &|_, _| Err(io::Error::other("no resolver"));
    for resolve in [remote, mixed, none, failing] {
        let runner = LocalRunner::connect_with(
            "http://localhost:11434",
            "bge-m3",
            resolve,
            fake.clone(),
            FAST,
        );
        assert!(matches!(runner, Err(EmbedError::ResolvesElsewhere)));
    }
    assert_eq!(fake.calls(), 0);
}

#[test]
fn a_resolved_localhost_is_pinned_and_proxies_are_off() {
    let both: &Resolve = &|_, _| Ok(vec!["::1".parse().unwrap(), "127.0.0.1".parse().unwrap()]);
    let seen = Arc::new(Mutex::new(String::new()));
    let seen_in = seen.clone();
    let fake = Fake::new(move |request| {
        *seen_in.lock().unwrap() = curl_config(request);
        Ok((200, r#"{"version":"0.35.1"}"#.into()))
    });
    let runner =
        LocalRunner::connect_with("http://localhost:11434", "bge-m3", both, fake, FAST).unwrap();
    runner.version().unwrap();
    let config = seen.lock().unwrap().clone();
    assert!(
        config.contains("resolve = \"localhost:11434:[::1],127.0.0.1\"\n"),
        "{config}"
    );
    assert!(config.contains("noproxy = \"*\"\n"), "{config}");
    assert!(config.contains("proto = \"=http,https\"\n"), "{config}");
}

#[test]
fn curl_connects_to_the_pinned_address_and_keeps_the_host_name() {
    let stub = Stub::start(|| http("200 OK", "", br#"{"version":"0.35.1"}"#));
    let runner = curl_runner(&format!("http://localhost:{}", stub.addr.port()));
    assert_eq!(runner.version().unwrap(), "0.35.1");
    let heads = stub.heads.lock().unwrap();
    let head = heads.first().unwrap().to_ascii_lowercase();
    assert!(head.starts_with("get /api/version "), "{head}");
    assert!(
        head.contains(&format!("host: localhost:{}", stub.addr.port())),
        "{head}"
    );
}

#[test]
fn a_redirect_is_refused_and_never_followed() {
    let elsewhere = Stub::start(|| http("200 OK", "", br#"{"version":"9"}"#));
    let target = format!("http://{}/api/version", elsewhere.addr);
    let stub = Stub::start(move || {
        http(
            "307 Temporary Redirect",
            &format!("Location: {target}\r\n"),
            b"",
        )
    });
    assert_eq!(
        curl_runner(&stub.base()).version(),
        Err(EmbedError::Redirected(307))
    );
    assert_eq!(stub.hits(), 1);
    assert_eq!(elsewhere.hits(), 0);
}
