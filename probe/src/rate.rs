/// Compute rate in bytes/sec from two counter samples.
///
/// Handles u64 wrap: if `curr < prev`, treats it as
/// `curr + (u64::MAX - prev) + 1` (counter wrapped).
pub fn compute_rate(prev: u64, curr: u64, interval_secs: u64) -> f64 {
    if interval_secs == 0 {
        return 0.0;
    }
    let delta = compute_delta(prev, curr);
    delta as f64 / interval_secs as f64
}

/// Compute counter delta, handling u64 wrap.
///
/// If `curr < prev`, the counter wrapped around u64::MAX.
pub const fn compute_delta(prev: u64, curr: u64) -> u64 {
    if curr >= prev {
        curr - prev
    } else {
        // Counter wrapped: curr + (u64::MAX - prev) + 1
        curr.wrapping_sub(prev)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rate_normal() {
        // 3000 bytes in 30 seconds = 100 bytes/sec
        assert!((compute_rate(1000, 4000, 30) - 100.0).abs() < f64::EPSILON);
    }

    #[test]
    fn rate_zero_interval() {
        assert_eq!(compute_rate(0, 1000, 0), 0.0);
    }

    #[test]
    fn rate_no_change() {
        assert_eq!(compute_rate(5000, 5000, 30), 0.0);
    }

    #[test]
    fn delta_normal() {
        assert_eq!(compute_delta(100, 200), 100);
    }

    #[test]
    fn delta_wrap() {
        // Simulate counter wrapping: prev near max, curr near 0
        let prev = u64::MAX - 10;
        let curr = 5;
        // Expected: 5 + (u64::MAX - (u64::MAX - 10)) = 5 + 10 + 1 = 16
        assert_eq!(compute_delta(prev, curr), 16);
    }

    #[test]
    fn delta_wrap_from_max() {
        let prev = u64::MAX;
        let curr = 0;
        assert_eq!(compute_delta(prev, curr), 1);
    }

    #[test]
    fn delta_no_change() {
        assert_eq!(compute_delta(42, 42), 0);
    }

    #[test]
    fn rate_with_wrap() {
        let prev = u64::MAX - 999;
        let curr = 0;
        // delta = 1000
        assert!((compute_rate(prev, curr, 10) - 100.0).abs() < f64::EPSILON);
    }
}
