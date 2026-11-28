//! Many files read on a few threads, and what is made of each worked on the pool while the next
//! files are read.
//!
//! File system calls do not get faster on every core: the kernel resolves names and opens files
//! under locks the threads then wait on, and that wait is spent spinning, as CPU time. On macOS
//! (APFS) opening and reading 50,000 notes on twelve threads cost 6.8 s of system time against
//! 1.4 s on one, and a few threads answer sooner than either ([`READER_THREADS`]). Parsing,
//! folding and searching depend on the bytes alone, so each batch read is handed to the pool as
//! one task and worked while the reading goes on.

use std::marker::PhantomData;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Mutex, PoisonError};

use rayon::Scope;

/// The threads that read, the calling thread among them. Wall / CPU ms of the first get_concepts
/// on the 50,000-note scale gate, two runs each (macOS, APFS, 12 cores, load average about 9):
///
/// | readers                  | flow a                        | flow b                         |
/// |--------------------------|-------------------------------|--------------------------------|
/// | every core (the old way) | 1,643 / 9,000; 1,500 / 11,290 | 1,387 / 12,750; 1,210 / 7,870  |
/// | 1                        | 1,577 / 3,230; 1,564 / 3,170  | 1,419 / 2,060; 1,417 / 2,050   |
/// | 2                        | 1,039 / 3,580;   963 / 3,330  |   922 / 2,400; 1,083 / 2,720   |
/// | 3                        |   798 / 3,780;   990 / 4,270  |   794 / 2,770;   783 / 2,760   |
/// | 4                        | 1,156 / 5,750;   906 / 4,780  | 1,115 / 4,450;   786 / 3,380   |
///
/// Three answer soonest; a fourth only adds CPU. One count for every machine, not a share of its
/// cores: what the reads wait on is the file system, which serializes the opens of one volume
/// however many cores ask.
pub(crate) const READER_THREADS: usize = 3;

/// A reader claims this many items at a time, and hands them over at this many bytes or at the
/// end of its claim: small enough that working one overlaps reading the next, large enough that
/// handing it over costs nothing beside the reads.
const BATCH_MAX_ITEMS: usize = 128;
const BATCH_MAX_BYTES: usize = 4 * 1024 * 1024;

/// What `read` took from the disk for one item, and how many bytes it holds.
pub(crate) struct Reading<R> {
    pub value: R,
    pub bytes: usize,
}

/// What the readers share: the items, where the next claim starts, and the batches worked.
struct Readers<'a, T, R, O, Read, Work> {
    items: &'a [T],
    read: Read,
    work: Work,
    next_item: AtomicUsize,
    in_flight: AtomicUsize,
    /// The worked batches, each by the position of its first item.
    finished: Mutex<Vec<(usize, Vec<O>)>>,
    values: PhantomData<fn() -> R>,
}

impl<'a, T, R, O, Read, Work> Readers<'a, T, R, O, Read, Work>
where
    T: Sync,
    R: Send,
    O: Send,
    Read: Fn(&T) -> Reading<R> + Sync,
    Work: Fn(&T, R) -> O + Sync,
{
    /// Claims items and reads them until none are left, handing each batch read to the pool.
    fn read_claims<'scope>(&'scope self, scope: &Scope<'scope>)
    where
        'a: 'scope,
    {
        loop {
            let first = self.next_item.fetch_add(BATCH_MAX_ITEMS, Ordering::Relaxed);
            let claim = self.items.get(first..).unwrap_or_default();
            let claim = claim.get(..BATCH_MAX_ITEMS).unwrap_or(claim);
            if claim.is_empty() {
                return;
            }
            let mut start = 0;
            let mut bytes = 0;
            let mut values = Vec::new();
            for (offset, item) in claim.iter().enumerate() {
                let reading = (self.read)(item);
                bytes += reading.bytes;
                values.push(reading.value);
                if bytes >= BATCH_MAX_BYTES || offset + 1 == claim.len() {
                    let batch = claim.get(start..=offset).unwrap_or_default();
                    self.hand_over(scope, first + start, batch, std::mem::take(&mut values));
                    start = offset + 1;
                    bytes = 0;
                }
            }
        }
    }

    /// Works `batch` on the pool, or here when every thread of the pool already has one, so no
    /// more than that many batches of bytes are ever held.
    fn hand_over<'scope>(
        &'scope self,
        scope: &Scope<'scope>,
        first: usize,
        batch: &'scope [T],
        values: Vec<R>,
    ) {
        if self.in_flight.load(Ordering::Acquire) >= rayon::current_num_threads() {
            self.work_batch(first, batch, values);
            return;
        }
        self.in_flight.fetch_add(1, Ordering::AcqRel);
        scope.spawn(move |_| {
            self.work_batch(first, batch, values);
            self.in_flight.fetch_sub(1, Ordering::AcqRel);
        });
    }

    fn work_batch(&self, first: usize, batch: &[T], values: Vec<R>) {
        let done = batch
            .iter()
            .zip(values)
            .map(|(item, value)| (self.work)(item, value))
            .collect();
        self.finished
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .push((first, done));
    }
}

/// `work` on what `read` took for each item, in the order of `items`. `read` runs on at most
/// [`READER_THREADS`] threads, the calling one among them; `work` runs on the pool, one task per
/// batch, while the next batches are read.
pub(crate) fn read_on_reader_threads<T, R, O>(
    items: &[T],
    read: impl Fn(&T) -> Reading<R> + Sync,
    work: impl Fn(&T, R) -> O + Sync,
) -> Vec<O>
where
    T: Sync,
    R: Send,
    O: Send,
{
    let readers = Readers {
        items,
        read,
        work,
        next_item: AtomicUsize::new(0),
        in_flight: AtomicUsize::new(0),
        finished: Mutex::new(Vec::new()),
        values: PhantomData,
    };
    let reader_count = READER_THREADS.min(items.len().div_ceil(BATCH_MAX_ITEMS));
    rayon::in_place_scope(|scope| {
        let shared = &readers;
        for _ in 1..reader_count {
            scope.spawn(move |scope| shared.read_claims(scope));
        }
        shared.read_claims(scope);
    });
    let mut finished = readers
        .finished
        .into_inner()
        .unwrap_or_else(PoisonError::into_inner);
    finished.sort_unstable_by_key(|(first, _)| *first);
    finished.into_iter().flat_map(|(_, done)| done).collect()
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::*;

    #[test]
    fn every_item_is_read_once_on_at_most_the_reader_threads_and_answered_in_order() {
        let items: Vec<usize> = (0..BATCH_MAX_ITEMS * 40 + 7).collect();
        let reads: Vec<AtomicUsize> = items.iter().map(|_| AtomicUsize::new(0)).collect();
        let reading_threads = Mutex::new(HashSet::new());
        let worked = read_on_reader_threads(
            &items,
            |&item| {
                reads
                    .get(item)
                    .map(|count| count.fetch_add(1, Ordering::Relaxed));
                reading_threads
                    .lock()
                    .unwrap_or_else(PoisonError::into_inner)
                    .insert(std::thread::current().id());
                Reading {
                    value: item * 10,
                    // Every seventh item fills a batch by its bytes alone.
                    bytes: if item % 7 == 0 { BATCH_MAX_BYTES } else { 1 },
                }
            },
            |&item, value| (item, value),
        );
        assert!(reads.iter().all(|count| count.load(Ordering::Relaxed) == 1));
        assert!(
            reading_threads
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .len()
                <= READER_THREADS
        );
        assert_eq!(worked.len(), items.len());
        assert!(worked
            .iter()
            .enumerate()
            .all(|(index, &(item, value))| item == index && value == index * 10));
    }
}
