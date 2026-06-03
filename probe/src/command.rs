use std::fmt;
use std::process::Stdio;
use std::time::Duration;
use tokio::process::Command;

/// Default timeout for external commands.
const DEFAULT_TIMEOUT: Duration = Duration::from_secs(30);

/// Errors from [`run_command`].
#[derive(Debug)]
pub enum CommandError {
    /// The program was not found on PATH.
    NotFound,
    /// The command timed out.
    Timeout,
    /// The command exited with a non-zero status.
    ExitStatus {
        code: i32,
        stdout: String,
        stderr: String,
    },
    /// An I/O error occurred.
    Io(std::io::Error),
}

impl fmt::Display for CommandError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotFound => write!(f, "command not found"),
            Self::Timeout => write!(f, "command timed out"),
            Self::ExitStatus { code, stderr, .. } => {
                write!(f, "exit code {code}: {stderr}")
            }
            Self::Io(e) => write!(f, "io error: {e}"),
        }
    }
}

/// Run an external command with a timeout, returning stdout as a String.
///
/// On timeout, the child process is explicitly killed to prevent zombie
/// accumulation (D-state processes from orphaned I/O-heavy commands).
pub async fn run_command(
    program: &str,
    args: &[&str],
    timeout: Duration,
) -> Result<String, CommandError> {
    let mut child = Command::new(program)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                CommandError::NotFound
            } else {
                CommandError::Io(e)
            }
        })?;

    let stdout_handle = child.stdout.take();
    let stderr_handle = child.stderr.take();

    match tokio::time::timeout(timeout, child.wait()).await {
        Err(_) => {
            child.kill().await.ok();
            Err(CommandError::Timeout)
        }
        Ok(Err(e)) => Err(CommandError::Io(e)),
        Ok(Ok(status)) => {
            let mut stdout_bytes = Vec::new();
            let mut stderr_bytes = Vec::new();
            if let Some(mut out) = stdout_handle {
                tokio::io::AsyncReadExt::read_to_end(&mut out, &mut stdout_bytes)
                    .await
                    .ok();
            }
            if let Some(mut err) = stderr_handle {
                tokio::io::AsyncReadExt::read_to_end(&mut err, &mut stderr_bytes)
                    .await
                    .ok();
            }

            if status.success() {
                String::from_utf8(stdout_bytes).map_err(|e| {
                    CommandError::Io(std::io::Error::new(std::io::ErrorKind::InvalidData, e))
                })
            } else {
                let code = status.code().unwrap_or(-1);
                let stdout = String::from_utf8_lossy(&stdout_bytes).to_string();
                let stderr = String::from_utf8_lossy(&stderr_bytes).to_string();
                Err(CommandError::ExitStatus {
                    code,
                    stdout,
                    stderr,
                })
            }
        }
    }
}

/// Run an external command with the default timeout.
pub async fn run_command_default(program: &str, args: &[&str]) -> Result<String, CommandError> {
    run_command(program, args, DEFAULT_TIMEOUT).await
}

/// Run a command with low I/O and CPU priority (ionice -c3 nice -n 19).
///
/// On Linux, wraps the command with `ionice -c3 nice -n 19` to avoid competing
/// with business I/O. Falls back gracefully: if ionice/nice are not found, runs
/// the command directly.
pub async fn run_command_low_priority(
    program: &str,
    args: &[&str],
    timeout: Duration,
) -> Result<String, CommandError> {
    if cfg!(target_os = "linux") && command_exists("ionice") && command_exists("nice") {
        let mut full_args = vec!["-c3", "nice", "-n", "19", program];
        full_args.extend_from_slice(args);
        return run_command("ionice", &full_args, timeout).await;
    }
    if cfg!(target_os = "linux") && command_exists("nice") {
        let mut full_args = vec!["-n", "19", program];
        full_args.extend_from_slice(args);
        return run_command("nice", &full_args, timeout).await;
    }
    run_command(program, args, timeout).await
}

/// Check if a program exists on the system PATH.
pub fn command_exists(program: &str) -> bool {
    // Check common paths + PATH
    which_exists(program)
}

fn which_exists(program: &str) -> bool {
    use std::env;
    use std::path::Path;

    // Check if it's an absolute path
    if Path::new(program).is_absolute() {
        return Path::new(program).exists();
    }

    // Search PATH
    if let Ok(path_var) = env::var("PATH") {
        for dir in path_var.split(':') {
            let full_path = Path::new(dir).join(program);
            if full_path.exists() {
                return true;
            }
        }
    }

    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn echo_returns_stdout() {
        let result = run_command("echo", &["hello", "world"], Duration::from_secs(5)).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap().trim(), "hello world");
    }

    #[tokio::test]
    async fn not_found_returns_error() {
        let result = run_command(
            "this_command_does_not_exist_xyz_bat",
            &[],
            Duration::from_secs(5),
        )
        .await;
        assert!(matches!(result, Err(CommandError::NotFound)));
    }

    #[tokio::test]
    async fn exit_status_returns_error() {
        let result = run_command("false", &[], Duration::from_secs(5)).await;
        assert!(matches!(result, Err(CommandError::ExitStatus { .. })));
    }

    #[tokio::test]
    async fn timeout_returns_error() {
        let result = run_command("sleep", &["10"], Duration::from_millis(50)).await;
        assert!(matches!(result, Err(CommandError::Timeout)));
    }

    #[test]
    fn command_exists_echo() {
        assert!(command_exists("echo"));
    }

    #[test]
    fn command_exists_nonexistent() {
        assert!(!command_exists("this_command_does_not_exist_xyz_bat"));
    }

    #[test]
    fn command_error_display() {
        assert_eq!(format!("{}", CommandError::NotFound), "command not found");
        assert_eq!(format!("{}", CommandError::Timeout), "command timed out");
        assert_eq!(
            format!(
                "{}",
                CommandError::ExitStatus {
                    code: 1,
                    stdout: String::new(),
                    stderr: "oops".into()
                }
            ),
            "exit code 1: oops"
        );
    }

    #[tokio::test]
    async fn run_command_default_works() {
        let result = run_command_default("echo", &["test"]).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap().trim(), "test");
    }

    #[test]
    fn command_exists_absolute_path() {
        // /bin/echo should exist on all Unix systems
        assert!(command_exists("/bin/echo") || command_exists("/usr/bin/echo"));
        assert!(!command_exists("/nonexistent_path_xyz/fake_binary"));
    }

    #[test]
    fn command_error_display_io() {
        let io_err = std::io::Error::new(std::io::ErrorKind::PermissionDenied, "access denied");
        let err = CommandError::Io(io_err);
        let msg = format!("{err}");
        assert!(msg.contains("io error"));
        assert!(msg.contains("access denied"));
    }

    #[tokio::test]
    async fn low_priority_runs_command() {
        let result = run_command_low_priority("echo", &["low_prio"], Duration::from_secs(5)).await;
        assert!(result.is_ok());
        assert!(result.unwrap().contains("low_prio"));
    }

    #[tokio::test]
    async fn timeout_kills_child_process() {
        // Spawn a long sleep, timeout quickly, verify it completes without hanging
        let start = std::time::Instant::now();
        let result = run_command("sleep", &["60"], Duration::from_millis(100)).await;
        let elapsed = start.elapsed();

        assert!(matches!(result, Err(CommandError::Timeout)));
        // Should return almost immediately after the timeout, not wait for the child
        assert!(elapsed < Duration::from_secs(2));
    }
}
