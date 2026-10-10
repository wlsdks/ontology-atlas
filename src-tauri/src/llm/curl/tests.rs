use super::*;

#[test]
fn curl_disables_ambient_config_before_every_other_argument() {
    let argv = curl_argv();
    assert_eq!(argv.first(), Some(&"--disable"));
    assert_eq!(argv.iter().filter(|arg| **arg == "--disable").count(), 1);
}

#[test]
fn curl_never_follows_a_redirect() {
    // A followed redirect would resend the key to a host we did not choose.
    for arg in curl_argv() {
        assert_ne!(arg, "-L");
        assert_ne!(arg, "--location");
    }
}

#[test]
fn curl_exit_codes_tell_off_from_wrong_port_from_timeout_apart() {
    // The exit code separates these cases; stderr collapses them.
    let refused = curl_failure_message(Some(7), "Couldn't connect to server");
    let unknown_host = curl_failure_message(Some(6), "Could not resolve host");
    let timeout = curl_failure_message(Some(28), "Operation timed out");
    // Codes, not wording: sentences live in `messages/<locale>.json`.
    assert_eq!(refused, "connection-refused");
    assert_eq!(unknown_host, "host-not-found");
    assert!(timeout.starts_with(TIMED_OUT_PREFIX));
    assert_ne!(refused, unknown_host);
    assert_ne!(refused, timeout);
}

#[test]
fn a_connection_that_never_happened_is_not_http_zero() {
    // curl writes `000` on connection failure; it must not read as HTTP 0.
    let refused = interpret_curl_output(Some(7), false, "\n000", "Couldn't connect to server");
    assert!(refused.is_err());
    assert_eq!(refused.unwrap_err(), "connection-refused");

    let ok = interpret_curl_output(Some(0), true, "{\"data\":[]}\n200", "").unwrap();
    assert_eq!(ok.0, 200);
    assert_eq!(ok.1, "{\"data\":[]}");
}
