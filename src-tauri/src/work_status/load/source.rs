//! The reads one load sample makes, behind one trait so a test can count them. Each read is a
//! kernel call of macOS's own: no program is spawned, no file opened, and no argument,
//! environment or open file of any process is read.

use std::path::PathBuf;

use serde::Serialize;

use crate::work_status::agent_processes::ProcessFacts;

/// What one process uses now.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct Usage {
    /// What Activity Monitor calls Memory: the process's physical footprint.
    pub(crate) memory_bytes: u64,
    /// User and system time since the process started.
    pub(crate) cpu_ns: u64,
}

/// macOS's own reading of memory pressure.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum Pressure {
    Normal,
    Warning,
    Critical,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct MacMemory {
    pub(crate) used_bytes: u64,
    pub(crate) total_bytes: u64,
    pub(crate) pressure: Option<Pressure>,
}

/// CPU time of the whole Mac, summed over its cores, in scheduler ticks; each counter wraps.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct CpuTicks {
    pub(crate) busy: [u32; 3],
    pub(crate) idle: u32,
    pub(crate) core_count: u32,
}

impl CpuTicks {
    /// The cores busy on average between `earlier` and this read. O(1).
    pub(crate) fn cores_since(&self, earlier: &CpuTicks) -> Option<f64> {
        let busy: u64 = self
            .busy
            .iter()
            .zip(earlier.busy.iter())
            .map(|(now, then)| u64::from(now.wrapping_sub(*then)))
            .sum();
        let total = busy + u64::from(self.idle.wrapping_sub(earlier.idle));
        (total > 0).then(|| busy as f64 / total as f64 * f64::from(self.core_count))
    }
}

pub(crate) trait LoadSource {
    /// One listing of the person's own processes; `None` when the kernel refuses it.
    fn processes(&mut self) -> Option<Vec<ProcessFacts>>;
    /// `None` when the process ended since the listing.
    fn usage(&mut self, pid: u32) -> Option<Usage>;
    fn working_folder(&mut self, pid: u32) -> Option<PathBuf>;
    fn memory(&mut self) -> Option<MacMemory>;
    fn cpu(&mut self) -> Option<CpuTicks>;
    /// The busiest graphics processor's "Device Utilization %"; `None` when macOS reports none.
    fn gpu_percent(&mut self) -> Option<u8>;
}

#[cfg(target_os = "macos")]
pub(crate) use mac::MacSource;

#[cfg(target_os = "macos")]
mod mac {
    use std::path::PathBuf;
    use std::sync::OnceLock;

    use super::{CpuTicks, LoadSource, MacMemory, Pressure, Usage};
    use crate::work_status::agent_processes::{listed_processes, mac_working_folder, ProcessFacts};

    /// `mach_timebase_info_data_t` in `<mach/mach_time.h>`.
    #[repr(C)]
    struct Timebase {
        numer: u32,
        denom: u32,
    }

    // Declared here because `libc` marks its copies as moved to another crate.
    extern "C" {
        fn mach_host_self() -> libc::mach_port_t;
        fn mach_timebase_info(info: *mut Timebase) -> libc::kern_return_t;
    }

    /// `kern.memorystatus_vm_pressure_level` in `<sys/kern_memorystatus.h>`.
    const PRESSURE_NORMAL: i32 = 1;
    const PRESSURE_WARNING: i32 = 2;
    const PRESSURE_CRITICAL: i32 = 4;

    pub(crate) struct MacSource;

    /// The host port is a send right that each call adds a reference to, so it is asked once.
    fn host() -> libc::mach_port_t {
        static HOST: OnceLock<libc::mach_port_t> = OnceLock::new();
        // SAFETY: takes no argument and cannot fail.
        *HOST.get_or_init(|| unsafe { mach_host_self() })
    }

    /// Nanoseconds per CPU-time unit: 1/1 on Intel, 125/3 on Apple silicon.
    fn timebase() -> (u64, u64) {
        static TIMEBASE: OnceLock<(u64, u64)> = OnceLock::new();
        *TIMEBASE.get_or_init(|| {
            let mut info = Timebase { numer: 0, denom: 0 };
            // SAFETY: the struct is the one the call fills.
            let status = unsafe { mach_timebase_info(&mut info) };
            if status != libc::KERN_SUCCESS || info.denom == 0 {
                return (1, 1);
            }
            (u64::from(info.numer), u64::from(info.denom))
        })
    }

    fn sysctl_number<T: Copy + Default>(name: &std::ffi::CStr) -> Option<T> {
        let mut value = T::default();
        let mut size = std::mem::size_of::<T>();
        // SAFETY: the buffer is one `T` and the call is told its size; it writes no more.
        let status = unsafe {
            libc::sysctlbyname(
                name.as_ptr(),
                (&mut value as *mut T).cast(),
                &mut size,
                std::ptr::null_mut(),
                0,
            )
        };
        (status == 0 && size == std::mem::size_of::<T>()).then_some(value)
    }

    /// Constant while the app runs, so read once.
    fn memory_total_bytes() -> Option<u64> {
        static TOTAL: OnceLock<Option<u64>> = OnceLock::new();
        *TOTAL.get_or_init(|| sysctl_number::<u64>(c"hw.memsize"))
    }

    fn core_count() -> u32 {
        static CORES: OnceLock<u32> = OnceLock::new();
        *CORES.get_or_init(|| {
            sysctl_number::<i32>(c"hw.logicalcpu")
                .and_then(|count| u32::try_from(count).ok())
                .unwrap_or(1)
        })
    }

    fn page_size() -> u64 {
        static PAGE: OnceLock<u64> = OnceLock::new();
        // SAFETY: sysconf has no failure mode that touches memory.
        *PAGE.get_or_init(|| {
            u64::try_from(unsafe { libc::sysconf(libc::_SC_PAGESIZE) }).unwrap_or(16_384)
        })
    }

    impl LoadSource for MacSource {
        fn processes(&mut self) -> Option<Vec<ProcessFacts>> {
            listed_processes()
        }

        fn usage(&mut self, pid: u32) -> Option<Usage> {
            let mut info = std::mem::MaybeUninit::<libc::rusage_info_v2>::zeroed();
            // SAFETY: the buffer is one `rusage_info_v2`, the flavor the call is asked for.
            let status = unsafe {
                libc::proc_pid_rusage(
                    pid as libc::c_int,
                    libc::RUSAGE_INFO_V2,
                    info.as_mut_ptr().cast(),
                )
            };
            if status != 0 {
                return None;
            }
            // SAFETY: the kernel filled the struct.
            let info = unsafe { info.assume_init() };
            let (numer, denom) = timebase();
            let units = info.ri_user_time.saturating_add(info.ri_system_time);
            Some(Usage {
                memory_bytes: info.ri_phys_footprint,
                cpu_ns: (u128::from(units) * u128::from(numer) / u128::from(denom)) as u64,
            })
        }

        fn working_folder(&mut self, pid: u32) -> Option<PathBuf> {
            mac_working_folder(pid as libc::pid_t)
        }

        fn memory(&mut self) -> Option<MacMemory> {
            let mut stats = std::mem::MaybeUninit::<libc::vm_statistics64>::zeroed();
            let mut count = libc::HOST_VM_INFO64_COUNT;
            // SAFETY: the buffer is one `vm_statistics64`, and `count` says so in its units.
            let status = unsafe {
                libc::host_statistics64(
                    host(),
                    libc::HOST_VM_INFO64,
                    stats.as_mut_ptr().cast(),
                    &mut count,
                )
            };
            if status != libc::KERN_SUCCESS {
                return None;
            }
            // SAFETY: the kernel filled the struct.
            let stats = unsafe { stats.assume_init() };
            // Activity Monitor's Memory Used: app memory, wired and compressed.
            let app = u64::from(stats.internal_page_count)
                .saturating_sub(u64::from(stats.purgeable_count));
            let pages = app + u64::from(stats.wire_count) + u64::from(stats.compressor_page_count);
            let pressure = match sysctl_number::<i32>(c"kern.memorystatus_vm_pressure_level") {
                Some(PRESSURE_NORMAL) => Some(Pressure::Normal),
                Some(PRESSURE_WARNING) => Some(Pressure::Warning),
                Some(PRESSURE_CRITICAL) => Some(Pressure::Critical),
                _ => None,
            };
            Some(MacMemory {
                used_bytes: pages * page_size(),
                total_bytes: memory_total_bytes()?,
                pressure,
            })
        }

        fn cpu(&mut self) -> Option<CpuTicks> {
            let mut load = std::mem::MaybeUninit::<libc::host_cpu_load_info>::zeroed();
            let mut count = libc::HOST_CPU_LOAD_INFO_COUNT;
            // SAFETY: the buffer is one `host_cpu_load_info`, and `count` says so in its units.
            let status = unsafe {
                libc::host_statistics(
                    host(),
                    libc::HOST_CPU_LOAD_INFO,
                    load.as_mut_ptr().cast(),
                    &mut count,
                )
            };
            if status != libc::KERN_SUCCESS {
                return None;
            }
            // SAFETY: the kernel filled the struct.
            let ticks = unsafe { load.assume_init() }.cpu_ticks;
            let tick = |state: libc::c_int| {
                usize::try_from(state)
                    .ok()
                    .and_then(|index| ticks.get(index))
                    .copied()
                    .unwrap_or(0)
            };
            Some(CpuTicks {
                busy: [
                    tick(libc::CPU_STATE_USER),
                    tick(libc::CPU_STATE_SYSTEM),
                    tick(libc::CPU_STATE_NICE),
                ],
                idle: tick(libc::CPU_STATE_IDLE),
                core_count: core_count(),
            })
        }

        fn gpu_percent(&mut self) -> Option<u8> {
            super::super::gpu::device_utilization_percent()
        }
    }
}
