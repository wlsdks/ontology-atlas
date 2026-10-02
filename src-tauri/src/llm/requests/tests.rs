use super::*;

#[test]
fn cancellation_before_claim_never_starts_and_does_not_leave_a_tombstone() {
    let registry = Arc::new(Registry::default());
    let id = registry.prepare("main", Instant::now()).unwrap();
    assert!(registry.cancel("main", &id));
    assert!(registry.claim("main", &id).is_err());
    assert!(registry.0.lock().unwrap().requests.is_empty());
}
#[test]
fn only_the_owner_can_claim_or_cancel_a_request() {
    let registry = Arc::new(Registry::default());
    let id = registry.prepare("main", Instant::now()).unwrap();
    assert!(registry.claim("other", &id).is_err());
    assert!(!registry.cancel("other", &id));
    let mut request = registry.claim("main", &id).unwrap();
    assert!(registry.claim("main", &id).is_err());
    assert!(registry.cancel("main", &id));
    assert!(!registry.cancel("main", &id));
    assert_eq!(request.receiver.try_recv(), Ok(()));
    assert_eq!(registry.0.lock().unwrap().requests.len(), 1);
    drop(request);
    assert!(registry.0.lock().unwrap().requests.is_empty());
}
#[test]
fn cancellation_never_reuses_an_old_identifier_or_reaches_another_owner() {
    let registry = Arc::new(Registry::default());
    let old = registry.prepare("main", Instant::now()).unwrap();
    registry.cancel("main", &old);
    let next = registry.prepare("main", Instant::now()).unwrap();
    let other = registry.prepare("other", Instant::now()).unwrap();
    let mut next_request = registry.claim("main", &next).unwrap();
    let mut other_request = registry.claim("other", &other).unwrap();
    assert_ne!(old, next);
    assert!(!registry.cancel("main", &old));
    registry.cancel_owner(Some("main"));
    assert_eq!(next_request.receiver.try_recv(), Ok(()));
    assert_eq!(
        other_request.receiver.try_recv(),
        Err(oneshot::error::TryRecvError::Empty)
    );
}
#[test]
fn expired_preparations_free_capacity_but_active_requests_do_not() {
    let registry = Arc::new(Registry::default());
    let now = Instant::now();
    let active = registry.prepare("main", now).unwrap();
    let request = registry.claim("main", &active).unwrap();
    for _ in 1..MAX_REQUESTS {
        registry.prepare("main", now).unwrap();
    }
    assert!(registry.prepare("main", now).is_err());
    assert!(registry.prepare("main", now + PREPARE_LIFETIME).is_ok());
    assert_eq!(registry.0.lock().unwrap().requests.len(), 2);
    drop(request);
    registry.cancel_owner(None);
    assert!(registry.0.lock().unwrap().requests.is_empty());
}
#[test]
fn completed_cycles_leave_no_request_entries() {
    let registry = Arc::new(Registry::default());
    for _ in 0..64 {
        let id = registry.prepare("main", Instant::now()).unwrap();
        let request = registry.claim("main", &id).unwrap();
        registry.cancel("main", &id);
        drop(request);
        assert!(registry.0.lock().unwrap().requests.is_empty());
    }
}

#[test]
fn an_expired_ticket_cannot_be_claimed_without_another_preparation() {
    let registry = Arc::new(Registry::default());
    let id = registry
        .prepare("main", Instant::now() - PREPARE_LIFETIME)
        .unwrap();
    assert!(registry.claim("main", &id).is_err());
    assert!(registry.0.lock().unwrap().requests.is_empty());
}
