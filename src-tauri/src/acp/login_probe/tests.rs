use super::*;

// Only the measured exit code 1 means signed out; everything else is unknown.
#[test]
fn only_the_measured_logged_out_code_means_signed_out() {
    assert_eq!(
        classify_login_exit(Some(0)),
        Some(true),
        "exit 0 means signed in"
    );
    assert_eq!(
        classify_login_exit(Some(LOGIN_LOGGED_OUT_EXIT)),
        Some(false),
        "a measured signed-out code must report signed out, not unknown",
    );
    for code in [2, 3, 126, 127, 130, 255] {
        assert_eq!(
            classify_login_exit(Some(code)),
            None,
            "{code} means the run failed, not the sign-in state",
        );
    }
    assert_eq!(
        classify_login_exit(None),
        None,
        "a process killed by a signal says nothing about credentials",
    );
}
