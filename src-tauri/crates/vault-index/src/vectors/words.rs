//! A growable run of 64-bit words whose memory goes back to the system the moment it is dropped.
//! macOS's allocator keeps freed large blocks in the process's footprint, so on Unix the words
//! live in an anonymous mapping; Windows's heap already returns blocks this large on free.

use std::io;

pub(super) struct Words {
    inner: imp::Inner,
}

impl Words {
    pub(super) fn with_capacity(words: usize) -> io::Result<Words> {
        Ok(Words {
            inner: imp::Inner::with_capacity(words)?,
        })
    }

    pub(super) fn as_slice(&self) -> &[u64] {
        self.inner.as_slice()
    }

    pub(super) fn len(&self) -> usize {
        self.as_slice().len()
    }

    /// Amortised O(1): a full run moves to one twice its size.
    pub(super) fn push(&mut self, word: u64) -> io::Result<()> {
        self.inner.push(word)
    }
}

#[cfg(unix)]
mod imp {
    use std::io;
    use std::ptr::NonNull;

    const WORD_BYTES: usize = std::mem::size_of::<u64>();

    pub(super) struct Inner {
        start: NonNull<u64>,
        len: usize,
        capacity: usize,
    }

    // SAFETY: the mapping is owned by this value alone, as a Vec owns its buffer.
    unsafe impl Send for Inner {}
    unsafe impl Sync for Inner {}

    impl Inner {
        pub(super) fn with_capacity(words: usize) -> io::Result<Inner> {
            let mut inner = Inner {
                start: NonNull::dangling(),
                len: 0,
                capacity: 0,
            };
            if words > 0 {
                inner.grow_to(words)?;
            }
            Ok(inner)
        }

        pub(super) fn as_slice(&self) -> &[u64] {
            // SAFETY: `len` words from `start` are initialised and mapped (or `len` is 0 and
            // `start` is dangling but aligned).
            unsafe { std::slice::from_raw_parts(self.start.as_ptr(), self.len) }
        }

        pub(super) fn push(&mut self, word: u64) -> io::Result<()> {
            if self.len == self.capacity {
                self.grow_to(self.capacity.saturating_mul(2).max(512))?;
            }
            // SAFETY: `len < capacity`, so the slot is inside the mapping.
            unsafe { self.start.as_ptr().add(self.len).write(word) };
            self.len += 1;
            Ok(())
        }

        /// Maps `words` words, copies the current ones over and unmaps the old run. Pages are
        /// counted against the process only once written.
        fn grow_to(&mut self, words: usize) -> io::Result<()> {
            let bytes = words
                .checked_mul(WORD_BYTES)
                .ok_or_else(|| io::Error::new(io::ErrorKind::OutOfMemory, "too many vectors"))?;
            // SAFETY: an anonymous private mapping with no address hint touches no existing memory.
            let mapped = unsafe {
                libc::mmap(
                    std::ptr::null_mut(),
                    bytes,
                    libc::PROT_READ | libc::PROT_WRITE,
                    libc::MAP_PRIVATE | libc::MAP_ANON,
                    -1,
                    0,
                )
            };
            if mapped == libc::MAP_FAILED {
                return Err(io::Error::last_os_error());
            }
            let Some(start) = NonNull::new(mapped.cast::<u64>()) else {
                return Err(io::Error::other("mmap returned a null address"));
            };
            // SAFETY: both runs are mapped, distinct, and hold at least `len` words.
            unsafe { std::ptr::copy_nonoverlapping(self.start.as_ptr(), start.as_ptr(), self.len) };
            self.release();
            self.start = start;
            self.capacity = words;
            Ok(())
        }

        fn release(&mut self) {
            if self.capacity > 0 {
                // SAFETY: `start` was mapped with exactly this length by `grow_to`.
                unsafe { libc::munmap(self.start.as_ptr().cast(), self.capacity * WORD_BYTES) };
            }
        }
    }

    impl Drop for Inner {
        fn drop(&mut self) {
            self.release();
        }
    }
}

#[cfg(not(unix))]
mod imp {
    use std::io;

    pub(super) struct Inner(Vec<u64>);

    impl Inner {
        pub(super) fn with_capacity(words: usize) -> io::Result<Inner> {
            let mut words_held = Vec::new();
            words_held
                .try_reserve_exact(words)
                .map_err(|_| io::Error::new(io::ErrorKind::OutOfMemory, "too many vectors"))?;
            Ok(Inner(words_held))
        }

        pub(super) fn as_slice(&self) -> &[u64] {
            &self.0
        }

        pub(super) fn push(&mut self, word: u64) -> io::Result<()> {
            self.0.push(word);
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::Words;

    #[test]
    fn words_survive_growth_and_start_empty() {
        let mut words = Words::with_capacity(0).unwrap();
        assert!(words.as_slice().is_empty());
        for word in 0..5_000u64 {
            words.push(word * 3).unwrap();
        }
        assert_eq!(words.len(), 5_000);
        assert!(words
            .as_slice()
            .iter()
            .enumerate()
            .all(|(at, &word)| word == at as u64 * 3));
        let sized = Words::with_capacity(10).unwrap();
        assert_eq!(sized.len(), 0);
    }
}
