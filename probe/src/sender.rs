use reqwest::Client;
use std::fmt;
use std::time::Duration;

/// Maximum number of retries for transient errors.
const MAX_RETRIES: u32 = 5;
/// Initial backoff delay.
const INITIAL_BACKOFF: Duration = Duration::from_secs(1);
/// Maximum backoff delay.
const MAX_BACKOFF: Duration = Duration::from_secs(60);

/// Permanent HTTP errors that should not be retried.
const fn is_permanent_error(status: u16) -> bool {
    matches!(status, 400 | 401 | 403)
}

/// Compute backoff duration for a given attempt (0-indexed).
///
/// Doubles each attempt: 1s → 2s → 4s → 8s → 16s, capped at `MAX_BACKOFF`.
fn backoff_duration(attempt: u32) -> Duration {
    let secs = INITIAL_BACKOFF.as_secs().saturating_mul(1u64 << attempt);
    Duration::from_secs(secs.min(MAX_BACKOFF.as_secs()))
}

/// Errors from [`Sender::post`].
#[derive(Debug)]
pub enum SendError {
    /// Server returned a permanent error (400/401/403). Do not retry.
    Permanent { status: u16, message: String },
    /// Transient failure after all retries exhausted.
    Transient { message: String },
}

impl fmt::Display for SendError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SendError::Permanent { status, message } => {
                write!(f, "permanent error {status}: {message}")
            }
            SendError::Transient { message } => {
                write!(f, "transient error after retries: {message}")
            }
        }
    }
}

/// HTTP client that posts JSON to the bat worker with retry/backoff.
pub struct Sender {
    client: Client,
    worker_url: String,
    write_key: String,
}

impl Sender {
    pub fn new(worker_url: &str, write_key: &str) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .expect("failed to build HTTP client");

        Self {
            client,
            worker_url: worker_url.trim_end_matches('/').to_string(),
            write_key: write_key.to_string(),
        }
    }

    /// POST JSON to `{worker_url}{path}`, retrying transient errors
    /// with exponential backoff up to [`MAX_RETRIES`] times.
    pub async fn post(&self, path: &str, body: &impl serde::Serialize) -> Result<(), SendError> {
        let url = format!("{}{}", self.worker_url, path);
        let mut last_error = String::new();

        for attempt in 0..=MAX_RETRIES {
            if attempt > 0 {
                let delay = backoff_duration(attempt - 1);
                tracing::debug!(
                    attempt,
                    delay_ms = delay.as_millis(),
                    "retrying after backoff"
                );
                tokio::time::sleep(delay).await;
            }

            let result = self
                .client
                .post(&url)
                .header("Authorization", format!("Bearer {}", self.write_key))
                .json(body)
                .send()
                .await;

            match result {
                Ok(response) => {
                    let status = response.status().as_u16();
                    if response.status().is_success() {
                        return Ok(());
                    }
                    if is_permanent_error(status) {
                        let text = response.text().await.unwrap_or_default();
                        return Err(SendError::Permanent {
                            status,
                            message: text,
                        });
                    }
                    // Transient server error (5xx etc.)
                    last_error = format!("HTTP {status}");
                    tracing::warn!(attempt, status, "transient HTTP error");
                }
                Err(e) => {
                    last_error = e.to_string();
                    tracing::warn!(attempt, error = %e, "request failed");
                }
            }
        }

        Err(SendError::Transient {
            message: last_error,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn permanent_error_detection() {
        assert!(is_permanent_error(400));
        assert!(is_permanent_error(401));
        assert!(is_permanent_error(403));
        assert!(!is_permanent_error(404));
        assert!(!is_permanent_error(500));
        assert!(!is_permanent_error(502));
        assert!(!is_permanent_error(503));
        assert!(!is_permanent_error(200));
        assert!(!is_permanent_error(429));
    }

    #[test]
    fn backoff_doubles_each_attempt() {
        assert_eq!(backoff_duration(0), Duration::from_secs(1));
        assert_eq!(backoff_duration(1), Duration::from_secs(2));
        assert_eq!(backoff_duration(2), Duration::from_secs(4));
        assert_eq!(backoff_duration(3), Duration::from_secs(8));
        assert_eq!(backoff_duration(4), Duration::from_secs(16));
    }

    #[test]
    fn backoff_capped_at_max() {
        // 2^6 = 64, should cap at 60
        assert_eq!(backoff_duration(6), Duration::from_secs(60));
        assert_eq!(backoff_duration(10), Duration::from_secs(60));
        assert_eq!(backoff_duration(30), Duration::from_secs(60));
    }

    #[test]
    fn send_error_display() {
        let perm = SendError::Permanent {
            status: 401,
            message: "unauthorized".into(),
        };
        assert_eq!(format!("{perm}"), "permanent error 401: unauthorized");

        let trans = SendError::Transient {
            message: "connection reset".into(),
        };
        assert_eq!(
            format!("{trans}"),
            "transient error after retries: connection reset"
        );
    }

    #[test]
    fn sender_trims_trailing_slash() {
        let s = Sender::new("https://example.com/", "key");
        assert_eq!(s.worker_url, "https://example.com");
    }
}
