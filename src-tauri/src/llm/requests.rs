use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tokio::sync::oneshot;

const MAX_REQUESTS: usize = 32;
const PREPARE_LIFETIME: Duration = Duration::from_secs(30);

struct Entry {
    owner: String,
    prepared: Instant,
    sender: Option<oneshot::Sender<()>>,
    receiver: Option<oneshot::Receiver<()>>,
}
#[derive(Default)]
struct Entries {
    next_id: u64,
    requests: HashMap<String, Entry>,
}
#[derive(Default)]
pub(super) struct Registry(Mutex<Entries>);

pub(super) struct Request {
    registry: Arc<Registry>,
    id: String,
    pub receiver: oneshot::Receiver<()>,
}
impl Drop for Request {
    fn drop(&mut self) {
        self.registry.0.lock().unwrap().requests.remove(&self.id);
    }
}
impl Registry {
    fn prepare(&self, owner: &str, now: Instant) -> Result<String, String> {
        let mut entries = self.0.lock().unwrap();
        // O(MAX_REQUESTS), including abandoned prepared tickets; active requests keep their slot.
        entries.requests.retain(|_, entry| {
            entry.receiver.is_none() || now.duration_since(entry.prepared) < PREPARE_LIFETIME
        });
        if entries.requests.len() >= MAX_REQUESTS {
            return Err("request-failed: active_requests_limit=32".into());
        }
        entries.next_id = entries
            .next_id
            .checked_add(1)
            .ok_or("request-failed: request_identifier_exhausted")?;
        let id = entries.next_id.to_string();
        let (sender, receiver) = oneshot::channel();
        entries.requests.insert(
            id.clone(),
            Entry {
                owner: owner.into(),
                prepared: now,
                sender: Some(sender),
                receiver: Some(receiver),
            },
        );
        Ok(id)
    }
    pub(super) fn claim(self: &Arc<Self>, owner: &str, id: &str) -> Result<Request, String> {
        let mut entries = self.0.lock().unwrap();
        let entry = entries
            .requests
            .get_mut(id)
            .filter(|entry| entry.owner == owner)
            .ok_or("cancelled")?;
        if entry.receiver.is_some() && entry.prepared.elapsed() >= PREPARE_LIFETIME {
            entries.requests.remove(id);
            return Err("cancelled".into());
        }
        let receiver = entry
            .receiver
            .take()
            .ok_or("request-failed: duplicate_request")?;
        Ok(Request {
            registry: self.clone(),
            id: id.into(),
            receiver,
        })
    }
    fn cancel(&self, owner: &str, id: &str) -> bool {
        let mut entries = self.0.lock().unwrap();
        let Some(entry) = entries
            .requests
            .get_mut(id)
            .filter(|entry| entry.owner == owner)
        else {
            return false;
        };
        let Some(sender) = entry.sender.take() else {
            return false;
        };
        let _ = sender.send(());
        if entry.receiver.is_some() {
            entries.requests.remove(id);
        }
        true
    }
    fn cancel_owner(&self, owner: Option<&str>) {
        let mut entries = self.0.lock().unwrap();
        entries.requests.retain(|_, entry| {
            if owner.is_some_and(|owner| entry.owner != owner) {
                return true;
            }
            if let Some(sender) = entry.sender.take() {
                let _ = sender.send(());
            }
            entry.receiver.is_none()
        });
    }
}
pub(super) fn registry() -> &'static Arc<Registry> {
    static REGISTRY: OnceLock<Arc<Registry>> = OnceLock::new();
    REGISTRY.get_or_init(|| Arc::new(Registry::default()))
}
#[tauri::command]
pub fn llm_chat_prepare(window: tauri::WebviewWindow) -> Result<String, String> {
    registry().prepare(window.label(), Instant::now())
}
#[tauri::command]
pub fn llm_chat_cancel(window: tauri::WebviewWindow, request_id: String) -> bool {
    registry().cancel(window.label(), &request_id)
}
pub(crate) fn cancel_owner(owner: Option<&str>) {
    registry().cancel_owner(owner);
}

#[cfg(test)]
mod tests;
