use std::fmt;
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
    ExitStatus { code: i32, stderr: String },
    /// An I/O error occurred.
    Io(std::io::Error),
}

impl fmt::Display for CommandError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotFound => write!(f, "command not found"),
            Self::Timeout => write!(f, "command timed out"),
            Self::ExitStatus { code, stderr } => {
                write!(f, "exit code {code}: {stderr}")
            }
            Self::Io(e) => write!(f, "io error: {e}"),
        }
    }
}

/// Run an external command with a timeout, returning stdout as a String.
///
/// # Errors
///
/// Returns [`CommandError`] if the command fails, times out, or is not found.
pub async fn run_command(
    program: &str,
    args: &[&str],
    timeout: Duration,
) -> Result<String, CommandError> {
    let result = tokio::time::timeout(timeout, Command::new(program).args(args).output()).await;

    match result {
        Err(_) => Err(CommandError::Timeout),
        Ok(Err(e)) => {
            if e.kind() == std::io::ErrorKind::NotFound {
                Err(CommandError::NotFound)
            } else {
                Err(CommandError::Io(e))
            }
        }
        Ok(Ok(output)) => {
            if output.status.success() {
                String::from_utf8(output.stdout).map_err(|e| {
                    CommandError::Io(std::io::Error::new(std::io::ErrorKind::InvalidData, e))
                })
            } else {
                let code = output.status.code().unwrap_or(-1);
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                Err(CommandError::ExitStatus { code, stderr })
            }
        }
    }
}

/// Run an external command with the default timeout.
pub async fn run_command_default(program: &str, args: &[&str]) -> Result<String, CommandError> {
    run_command(program, args, DEFAULT_TIMEOUT).await
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
}
