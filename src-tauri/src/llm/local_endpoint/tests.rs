use super::*;

#[test]
fn plaintext_http_is_allowed_only_to_this_machine() {
    // Plain `http` only on localhost.
    for ok in [
        "http://localhost:11434",
        "http://127.0.0.1:1234",
        "http://127.42.0.7:1234",
        "http://[::1]:11434",
        "https://box.example.com:8080",
    ] {
        assert!(normalize_base_url(ok).is_ok(), "must be accepted: {ok}");
    }
    for bad in [
        "http://example.com",
        "http://192.168.0.9:11434",
        "http://127.example.invalid:11434",
    ] {
        assert!(normalize_base_url(bad).is_err(), "must be rejected: {bad}");
    }
}

#[test]
fn a_base_url_cannot_smuggle_credentials_or_a_new_curl_option() {
    for bad in [
        "",
        "localhost:11434",                 // no scheme
        "ftp://localhost:11434",           // a scheme we cannot speak
        "http://user:pw@localhost:11434",  // a secret carried in the URL
        "http://localhost:11434?key=leak", // a query we did not choose
        "http://localhost:11434#frag",
        "http://local host:11434", // whitespace starts a new curl config token
        "http://localhost:11434\nheader = evil",
        "http://localhost:11434\" \nheader = evil",
    ] {
        assert!(
            normalize_base_url(bad).is_err(),
            "must be rejected: {bad:?}"
        );
    }
}

#[test]
fn an_lm_studio_style_base_url_does_not_get_a_second_v1() {
    assert_eq!(
        local_endpoint("http://localhost:11434", LOCAL_CHAT_PATH),
        "http://localhost:11434/v1/chat/completions"
    );
    assert_eq!(
        local_endpoint("http://localhost:1234/v1", LOCAL_CHAT_PATH),
        "http://localhost:1234/v1/chat/completions"
    );
    assert_eq!(
        local_endpoint(
            &normalize_base_url("http://localhost:11434/").unwrap(),
            LOCAL_MODELS_PATH
        ),
        "http://localhost:11434/v1/models"
    );
}
