use super::picker::PickerBinding;
use objc2::rc::Retained;
use objc2::runtime::{AnyObject, Bool, ProtocolObject};
use objc2::{define_class, msg_send, DefinedClass, MainThreadOnly};
use objc2_app_kit::{NSModalResponseOK, NSOpenPanel, NSOpenSavePanelDelegate};
use objc2_foundation::{
    ns_string, MainThreadMarker, NSDictionary, NSError, NSLocalizedDescriptionKey, NSObject,
    NSObjectProtocol, NSString, NSURL,
};
use std::{cell::RefCell, fs::File, path::PathBuf};

#[derive(Default)]
struct DelegateState {
    binding: RefCell<PickerBinding>,
    error_message: String,
}
fn selection_error(message: &str) -> Retained<NSError> {
    let message = NSString::from_str(message);
    let info: Retained<NSDictionary<NSString, AnyObject>> =
        NSDictionary::from_slices(&[unsafe { NSLocalizedDescriptionKey }], &[message.as_ref()]);
    unsafe {
        NSError::errorWithDomain_code_userInfo(ns_string!("AtlasPlanningSelection"), 1, Some(&info))
    }
}
define_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[ivars = DelegateState]
    struct PlanningPanelDelegate;
    unsafe impl NSObjectProtocol for PlanningPanelDelegate {}
    unsafe impl NSOpenSavePanelDelegate for PlanningPanelDelegate {}
    impl PlanningPanelDelegate {
        #[unsafe(method(panelSelectionDidChange:))]
        fn selection_changed(&self, panel: &NSOpenPanel) {
            let urls = panel.URLs();
            let path = if urls.len() == 1 {
                urls.objectAtIndex(0).path().map(|value| PathBuf::from(value.to_string()))
            } else { None };
            let _ = self.ivars().binding.borrow_mut().observe(path.as_deref());
        }
        #[unsafe(method(panel:validateURL:error:))]
        fn validate_url(&self, _panel: &AnyObject, url: &NSURL, error: *mut *mut NSError) -> Bool {
            let path = url.path().map(|value| PathBuf::from(value.to_string()));
            let valid = path.as_deref().is_some_and(|path| self.ivars().binding.borrow_mut().validate(path));
            if !valid && !error.is_null() {
                unsafe { *error = Retained::autorelease_ptr(selection_error(&self.ivars().error_message)); }
            }
            valid.into()
        }
    }
);
impl PlanningPanelDelegate {
    fn new(mtm: MainThreadMarker, error_message: String) -> Retained<Self> {
        let this = Self::alloc(mtm).set_ivars(DelegateState {
            binding: RefCell::new(PickerBinding::default()),
            error_message,
        });
        unsafe { msg_send![super(this), init] }
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn validation_error_uses_the_supplied_localized_recovery_message() {
        let message = "The folder changed. Choose it again.";
        assert_eq!(
            super::selection_error(message)
                .localizedDescription()
                .to_string(),
            message
        );
    }
}

pub(super) fn choose_folder(error_message: &str) -> Result<Option<(PathBuf, File)>, String> {
    let mtm = MainThreadMarker::new().ok_or("picker-main-thread-required")?;
    let panel = NSOpenPanel::openPanel(mtm);
    panel.setCanChooseFiles(false);
    panel.setCanChooseDirectories(true);
    panel.setAllowsMultipleSelection(false);
    let delegate = PlanningPanelDelegate::new(mtm, error_message.chars().take(512).collect());
    // The delegate property is weak and must remain retained through runModal.
    unsafe {
        panel.setDelegate(Some(ProtocolObject::from_ref(&*delegate)));
    }
    let response = panel.runModal();
    if response != NSModalResponseOK {
        return delegate.ivars().binding.borrow_mut().finish(false, None);
    }
    let urls = panel.URLs();
    let path = if urls.len() == 1 {
        urls.objectAtIndex(0)
            .path()
            .map(|value| PathBuf::from(value.to_string()))
    } else {
        None
    };
    let result = delegate
        .ivars()
        .binding
        .borrow_mut()
        .finish(true, path.as_deref());
    result
}
