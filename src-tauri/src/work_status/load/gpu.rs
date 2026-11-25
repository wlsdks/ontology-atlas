//! The GPU's busy share as macOS reports it for the whole Mac: the "Device Utilization %" each
//! graphics accelerator publishes in its `PerformanceStatistics` registry entry. Read through
//! IOKit and CoreFoundation, declared here; no program is spawned and no root is needed. macOS
//! names no program that uses the GPU without administrator rights, so none is read.

use std::ffi::{c_char, c_void, CStr};

type CFTypeRef = *const c_void;
type CFStringRef = *const c_void;
type CFDictionaryRef = *const c_void;
type CFAllocatorRef = *const c_void;
type CFTypeID = usize;
type CFIndex = isize;
type IoObject = libc::mach_port_t;

/// `kCFStringEncodingUTF8`.
const UTF8: u32 = 0x0800_0100;
/// `kCFNumberSInt64Type`.
const SINT64: CFIndex = 4;
/// `kIOMainPortDefault`: the null port asks for the default.
const MAIN_PORT_DEFAULT: libc::mach_port_t = 0;
const ACCELERATOR_CLASS: &CStr = c"IOAccelerator";
const STATISTICS_KEY: &CStr = c"PerformanceStatistics";
const UTILIZATION_KEY: &CStr = c"Device Utilization %";
/// A machine has a handful of accelerators; more is not a list worth walking.
const MAX_ACCELERATORS: usize = 16;

#[link(name = "IOKit", kind = "framework")]
extern "C" {
    fn IOServiceMatching(name: *const c_char) -> CFDictionaryRef;
    fn IOServiceGetMatchingServices(
        main_port: libc::mach_port_t,
        matching: CFDictionaryRef,
        existing: *mut IoObject,
    ) -> libc::kern_return_t;
    fn IOIteratorNext(iterator: IoObject) -> IoObject;
    fn IORegistryEntryCreateCFProperty(
        entry: IoObject,
        key: CFStringRef,
        allocator: CFAllocatorRef,
        options: u32,
    ) -> CFTypeRef;
    fn IOObjectRelease(object: IoObject) -> libc::kern_return_t;
}

#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    fn CFStringCreateWithCString(
        allocator: CFAllocatorRef,
        text: *const c_char,
        encoding: u32,
    ) -> CFStringRef;
    fn CFDictionaryGetValue(dictionary: CFDictionaryRef, key: *const c_void) -> *const c_void;
    fn CFGetTypeID(value: CFTypeRef) -> CFTypeID;
    fn CFDictionaryGetTypeID() -> CFTypeID;
    fn CFNumberGetTypeID() -> CFTypeID;
    fn CFNumberGetValue(number: CFTypeRef, kind: CFIndex, value: *mut c_void) -> u8;
    fn CFRelease(value: CFTypeRef);
}

/// A CoreFoundation object this module created and releases.
struct Owned(CFTypeRef);

impl Owned {
    fn new(value: CFTypeRef) -> Option<Self> {
        (!value.is_null()).then_some(Self(value))
    }
}

impl Drop for Owned {
    fn drop(&mut self) {
        // SAFETY: created by a Create or Copy call and released once, here.
        unsafe { CFRelease(self.0) };
    }
}

fn cf_string(text: &CStr) -> Option<Owned> {
    // SAFETY: a NUL-terminated UTF-8 string; the default allocator.
    Owned::new(unsafe { CFStringCreateWithCString(std::ptr::null(), text.as_ptr(), UTF8) })
}

/// The highest utilization among the accelerators, 0 to 100; `None` when none reports one.
pub(crate) fn device_utilization_percent() -> Option<u8> {
    let statistics_key = cf_string(STATISTICS_KEY)?;
    let utilization_key = cf_string(UTILIZATION_KEY)?;
    // SAFETY: a NUL-terminated class name; the dictionary is consumed by the next call.
    let matching = unsafe { IOServiceMatching(ACCELERATOR_CLASS.as_ptr()) };
    if matching.is_null() {
        return None;
    }
    let mut iterator: IoObject = 0;
    // SAFETY: `matching` is a fresh dictionary the call takes ownership of.
    let status =
        unsafe { IOServiceGetMatchingServices(MAIN_PORT_DEFAULT, matching, &mut iterator) };
    if status != libc::KERN_SUCCESS {
        return None;
    }
    let mut highest: Option<u8> = None;
    for _ in 0..MAX_ACCELERATORS {
        // SAFETY: a valid iterator; 0 means it is spent.
        let entry = unsafe { IOIteratorNext(iterator) };
        if entry == 0 {
            break;
        }
        let percent = entry_utilization(entry, &statistics_key, &utilization_key);
        // SAFETY: the entry came from the iterator and is released once.
        unsafe { IOObjectRelease(entry) };
        highest = highest.max(percent);
    }
    // SAFETY: the iterator came from the matching call and is released once.
    unsafe { IOObjectRelease(iterator) };
    highest
}

fn entry_utilization(
    entry: IoObject,
    statistics_key: &Owned,
    utilization_key: &Owned,
) -> Option<u8> {
    // SAFETY: a live registry entry and a CFString key; the result is owned by this caller.
    let statistics = Owned::new(unsafe {
        IORegistryEntryCreateCFProperty(entry, statistics_key.0, std::ptr::null(), 0)
    })?;
    // SAFETY: type checks on a live object.
    if unsafe { CFGetTypeID(statistics.0) != CFDictionaryGetTypeID() } {
        return None;
    }
    // SAFETY: a dictionary and a CFString key; the value is borrowed from the dictionary.
    let number = unsafe { CFDictionaryGetValue(statistics.0, utilization_key.0) };
    // SAFETY: type check on a live object.
    if number.is_null() || unsafe { CFGetTypeID(number) != CFNumberGetTypeID() } {
        return None;
    }
    let mut value: i64 = 0;
    // SAFETY: a CFNumber read into an i64, the size the kind names.
    let exact = unsafe { CFNumberGetValue(number, SINT64, (&mut value as *mut i64).cast()) };
    (exact != 0)
        .then(|| u8::try_from(value.clamp(0, 100)).ok())
        .flatten()
}
