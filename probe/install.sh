#!/usr/bin/env bash
# bat-probe installer
# Usage: curl -fsSL https://<dashboard>/api/probe/install.sh | bash -s -- --url <worker_url> --key <write_key>
set -euo pipefail

# ── Defaults ──
INSTALL_DIR="/usr/local/bin"
CONFIG_DIR="/etc/bat"
CONFIG_FILE="${CONFIG_DIR}/config.toml"
SERVICE_NAME="bat-probe"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
BIN_NAME="bat-probe"
BIN_BASE_URL="https://s.zhe.to/apps/bat/latest"

# Injected by dashboard API at serve time (replaced from placeholder)
DASHBOARD_URL="__DASHBOARD_URL__"

# ── CLI argument parsing ──
WORKER_URL=""
WRITE_KEY=""
UNINSTALL=false
FORCE_CONFIG=false

usage() {
    cat <<EOF
bat-probe installer

Usage:
  Install:    curl -fsSL \${DASHBOARD_URL}/api/probe/install.sh | bash -s -- --url <worker_url> --key <write_key>
  Uninstall:  curl -fsSL \${DASHBOARD_URL}/api/probe/install.sh | bash -s -- --uninstall

Options:
  --url <worker_url>   Worker API endpoint (required for install)
  --key <write_key>    Authentication key (required for install)
  --force-config       Overwrite existing config file
  --uninstall          Remove bat-probe (keeps config)
  -h, --help           Show this help message
EOF
    exit 0
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --url)
            WORKER_URL="$2"
            shift 2
            ;;
        --key)
            WRITE_KEY="$2"
            shift 2
            ;;
        --uninstall)
            UNINSTALL=true
            shift
            ;;
        --force-config)
            FORCE_CONFIG=true
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            echo "error: unknown option: $1"
            echo "Run with --help for usage"
            exit 1
            ;;
    esac
done

# ── Helpers ──

info()  { echo -e "\033[1;34m[info]\033[0m  $*"; }
ok()    { echo -e "\033[1;32m[ok]\033[0m    $*"; }
warn()  { echo -e "\033[1;33m[warn]\033[0m  $*"; }
error() { echo -e "\033[1;31m[error]\033[0m $*"; exit 1; }

require_root() {
    if [[ $EUID -ne 0 ]]; then
        error "This script must be run as root (use sudo)"
    fi
}

# Escape a string for use as a TOML basic string value (between double quotes).
# Handles: backslash, double-quote, dollar signs, and control characters.
escape_toml() {
    local val="$1"
    val="${val//\\/\\\\}"   # \ → \\
    val="${val//\"/\\\"}"   # " → \"
    printf '%s' "$val"
}

detect_arch() {
    local arch
    arch="$(uname -m)"
    case "$arch" in
        x86_64)  echo "x86_64" ;;
        aarch64) echo "aarch64" ;;
        arm64)   echo "aarch64" ;;  # macOS-style
        *)       error "Unsupported architecture: $arch (only x86_64 and aarch64 are supported)" ;;
    esac
}

# ── Uninstall ──

do_uninstall() {
    require_root
    info "Uninstalling ${SERVICE_NAME}..."

    if systemctl is-active --quiet "${SERVICE_NAME}" 2>/dev/null; then
        info "Stopping ${SERVICE_NAME}..."
        systemctl stop "${SERVICE_NAME}"
    fi

    if systemctl is-enabled --quiet "${SERVICE_NAME}" 2>/dev/null; then
        info "Disabling ${SERVICE_NAME}..."
        systemctl disable "${SERVICE_NAME}"
    fi

    if [[ -f "${SERVICE_FILE}" ]]; then
        rm -f "${SERVICE_FILE}"
        systemctl daemon-reload
        ok "Removed systemd service"
    fi

    if [[ -f "${INSTALL_DIR}/${BIN_NAME}" ]]; then
        rm -f "${INSTALL_DIR}/${BIN_NAME}"
        ok "Removed binary"
    fi

    if [[ -d "${CONFIG_DIR}" ]]; then
        warn "Config directory ${CONFIG_DIR} preserved — remove manually if desired"
    fi

    ok "Uninstall complete"
    exit 0
}

# ── Install ──

do_install() {
    require_root

    if [[ -z "$WORKER_URL" ]]; then
        error "Missing required option: --url <worker_url>"
    fi
    if [[ -z "$WRITE_KEY" ]]; then
        error "Missing required option: --key <write_key>"
    fi
    if [[ "$DASHBOARD_URL" == "__DASHBOARD_URL__" ]]; then
        error "DASHBOARD_URL was not injected — download this script from the dashboard"
    fi

    local arch
    arch="$(detect_arch)"
    info "Detected architecture: ${arch}"

    # Download binary from R2 (latest)
    local download_url="${BIN_BASE_URL}/bat-probe-linux-${arch}"
    local tmp_bin="/tmp/${BIN_NAME}"
    info "Downloading ${BIN_NAME} from ${download_url}..."
    if ! curl -fsSL "${download_url}" -o "${tmp_bin}"; then
        error "Failed to download binary — is the dashboard running and binary uploaded?"
    fi

    # Install binary
    chmod 755 "${tmp_bin}"
    mv "${tmp_bin}" "${INSTALL_DIR}/${BIN_NAME}"
    ok "Installed binary to ${INSTALL_DIR}/${BIN_NAME}"

    # Create system user
    if ! id -u bat &>/dev/null; then
        useradd --system --no-create-home --shell /usr/sbin/nologin bat
        ok "Created system user: bat"
    fi

    # Write config
    mkdir -p "${CONFIG_DIR}"
    chown bat:bat "${CONFIG_DIR}"
    if [[ -f "${CONFIG_FILE}" && "$FORCE_CONFIG" != true ]]; then
        warn "Config already exists at ${CONFIG_FILE} — skipping (use --force-config to overwrite)"
    else
        local escaped_url escaped_key
        escaped_url="$(escape_toml "$WORKER_URL")"
        escaped_key="$(escape_toml "$WRITE_KEY")"
        cat > "${CONFIG_FILE}" <<TOML
worker_url = "${escaped_url}"
write_key = "${escaped_key}"
TOML
        ok "Config written to ${CONFIG_FILE}"
    fi

    # Ensure correct ownership regardless of whether config was just written or pre-existing
    chown bat:bat "${CONFIG_FILE}"
    chmod 600 "${CONFIG_FILE}"

    # Install systemd service
    cat > "${SERVICE_FILE}" <<'SERVICE'
[Unit]
Description=bat VPS monitoring probe
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/bat-probe
Restart=always
RestartSec=5
MemoryMax=15M
User=bat
Group=bat
NoNewPrivileges=true
ProtectSystem=strict
ReadOnlyPaths=/proc /sys /etc

[Install]
WantedBy=multi-user.target
SERVICE
    ok "Installed systemd service"

    # Enable and start
    systemctl daemon-reload
    systemctl enable --now "${SERVICE_NAME}"
    ok "Service enabled and started"

    echo ""
    ok "bat-probe installed successfully!"
    info "Check status: systemctl status ${SERVICE_NAME}"
    info "View logs:    journalctl -u ${SERVICE_NAME} -f"
}

# ── Main ──

if [[ "$UNINSTALL" == true ]]; then
    do_uninstall
else
    do_install
fi
