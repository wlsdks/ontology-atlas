//! Many files read one after another on the calling thread, and what is made of each worked on
//! the pool while the next files are read.
//!
//! File system calls do not get faster on more threads: the kernel resolves names and opens files
//! under locks the threads then wait on, and that wait is spent spinning, as CPU time. On macOS
//! (APFS) opening and reading 50,000 notes on twelve threads cost 6.8 s of system time against
//! 1.4 s on one, and no sooner answer above four. Parsing, folding and searching depend on the
//! bytes alone, so each batch read is handed to the pool as one task and worked while the reading
//! goes on: as many threads work as the reading keeps busy, which is one or two, not every core.

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Mutex, PoisonError};

/// A batch ends at this many items or bytes: small enough that working one overlaps reading the
/// next, large enough that handing it over costs nothing beside the reads.
const BATCH_MAX_ITEMS: usize = 128;
const BATCH_MAX_BYTES: usize = 4 * 1024 * 1024;

/// What `read` took from the disk for one item, and how many bytes it holds.
pub(crate) struct Reading<R> {
    pub value: R,
    pub bytes: usize,
}

/// `work` on what `read` took for each item, in the order of `items`. `read` runs on the calling
/// thread, one item after another (it is `FnMut`, so it cannot be shared); `work` runs on the pool,
/// one task per batch, while the next batch is read. When every thread of the pool already has a
/// batch, the calling thread works the next one itself, so no more than that many batches of bytes
/// are ever held.
pub(crate) fn read_serially<T, R, O>(
    items: &[T],
    mut read: impl FnMut(&T) -> Reading<R>,
    work: impl Fn(&T, R) -> O + Sync,
) -> Vec<O>
where
    T: Sync,
    R: Send,
    O: Send,
{
    let finished: Mutex<Vec<(usize, Vec<O>)>> = Mutex::new(Vec::new());
    let in_flight = AtomicUsize::new(0);
    let work_batch = |items: &[T], values: Vec<R>| -> Vec<O> {
        items
            .iter()
            .zip(values)
            .map(|(item, value)| work(item, value))
            .collect()
    };
    let finish = |number: usize, done: Vec<O>| {
        finished
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .push((number, done));
    };
    rayon::in_place_scope(|scope| {
        let mut rest = items;
        let mut number = 0;
        while !rest.is_empty() {
            let mut values: Vec<R> = Vec::new();
            let mut bytes = 0;
            for item in rest {
                if values.len() >= BATCH_MAX_ITEMS || bytes >= BATCH_MAX_BYTES {
                    break;
                }
                let reading = read(item);
                bytes += reading.bytes;
                values.push(reading.value);
            }
            let (batch, unread) = rest.split_at(values.len());
            rest = unread;
            if in_flight.load(Ordering::Acquire) >= rayon::current_num_threads() {
                finish(number, work_batch(batch, values));
            } else {
                in_flight.fetch_add(1, Ordering::AcqRel);
                let (work_batch, finish, in_flight) = (&work_batch, &finish, &in_flight);
                scope.spawn(move |_| {
                    finish(number, work_batch(batch, values));
                    in_flight.fetch_sub(1, Ordering::AcqRel);
                });
            }
            number += 1;
        }
    });
    let mut finished = finished
        .into_inner()
        .unwrap_or_else(PoisonError::into_inner);
    finished.sort_unstable_by_key(|(number, _)| *number);
    finished.into_iter().flat_map(|(_, done)| done).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_item_is_read_once_on_the_calling_thread_and_answered_in_order() {
        let items: Vec<usize> = (0..BATCH_MAX_ITEMS * 40 + 7).collect();
        let caller = std::thread::current().id();
        let mut read_order = Vec::new();
        let worked = read_serially(
            &items,
            |&item| {
                assert_eq!(std::thread::current().id(), caller);
                read_order.push(item);
                Reading {
                    value: item * 10,
                    bytes: 1,
                }
            },
            |&item, value| (item, value),
        );
        assert_eq!(read_order, items);
        assert!(worked
            .iter()
            .enumerate()
            .all(|(index, &(item, value))| item == index && value == index * 10));
        assert_eq!(worked.len(), items.len());
    }
}
