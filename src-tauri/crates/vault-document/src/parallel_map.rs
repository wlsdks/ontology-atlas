//! One function over every item of a slice on all the cores there are, results in the slice's
//! order. A vault of ten thousand files is read and checked file by file, each independent of the
//! others, so the work divides without a shared structure.

use std::num::NonZeroUsize;
use std::thread;

/// Below this many items the threads would cost more than they save.
const SMALLEST_SPLIT: usize = 256;

/// The most threads one call starts: past this a disk or the allocator is the limit, not the cores.
const MOST_THREADS: usize = 8;

/// `work` applied to each item, in order. A panic in `work` is a panic of the call, as it would be
/// in a loop.
pub fn parallel_map<T, R>(items: &[T], work: impl Fn(&T) -> R + Sync) -> Vec<R>
where
    T: Sync,
    R: Send,
{
    let cores = thread::available_parallelism()
        .map_or(1, NonZeroUsize::get)
        .min(MOST_THREADS);
    if items.len() < SMALLEST_SPLIT || cores < 2 {
        return items.iter().map(&work).collect();
    }
    let share = items.len().div_ceil(cores);
    thread::scope(|scope| {
        let handles: Vec<_> = items
            .chunks(share)
            .map(|chunk| scope.spawn(|| chunk.iter().map(&work).collect::<Vec<R>>()))
            .collect();
        handles
            .into_iter()
            .flat_map(|handle| match handle.join() {
                Ok(results) => results,
                Err(panic) => std::panic::resume_unwind(panic),
            })
            .collect()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn results_come_back_in_the_order_of_the_items() {
        let items: Vec<usize> = (0..5000).collect();
        let doubled = parallel_map(&items, |item| item * 2);
        assert_eq!(
            doubled,
            items.iter().map(|item| item * 2).collect::<Vec<_>>()
        );
        assert_eq!(parallel_map(&items[..3], |item| *item), vec![0, 1, 2]);
    }
}
