# 探针安装、开发与发布

[中文 README](../README.md) · [English README](README.en.md)

当前入口是单个 Hono Worker 与 Vite SPA。D1 持久化指标和资产，生产可选 `BAT_KV` 缓存 token、心跳、主机状态和部分仪表盘响应；它没有替代 D1 历史数据。旧架构文档中的 Next.js、Railway 和固定资源占用数字不作为当前安装依据。

## 安装 Linux 探针

以下步骤在要接入的 Linux 主机执行，需要 systemd、root 安装权限，以及实例维护者提供的 write key。日常探针进程使用专用 `bat` 用户。

先选择二进制来源。已发布版本由 CI 构建 x86_64 / aarch64 的静态 musl 二进制，并上传到 `https://s.zhe.to/apps/bat/` 下的版本目录与 `latest/`。可在临时目录下载匹配架构的文件及校验文件：

```bash
probe_arch=$(uname -m)
case "$probe_arch" in
  x86_64|aarch64) ;;
  *) echo "Unsupported release architecture: $probe_arch" >&2; exit 1 ;;
esac
probe_download_dir=$(mktemp -d)
curl -fsSL -o "$probe_download_dir/bat-probe-linux-$probe_arch" \
  "https://s.zhe.to/apps/bat/latest/bat-probe-linux-$probe_arch"
curl -fsSL -o "$probe_download_dir/bat-probe-linux-$probe_arch.sha256" \
  "https://s.zhe.to/apps/bat/latest/bat-probe-linux-$probe_arch.sha256"
(cd "$probe_download_dir" && sha256sum -c "bat-probe-linux-$probe_arch.sha256")
```

确认校验成功后，用 root 权限将对应二进制安装为 `/usr/local/bin/bat-probe`，权限 755。如果下载入口不可用，可在 Linux 上安装当前 stable Rust，从仓库根目录编译 `cargo build --release --locked --manifest-path probe/Cargo.toml`，安装 `probe/target/release/bat-probe`。从源码编译出的本机二进制与 CI 的 musl 分发产物不是同一构建方式。

准备用户和配置目录：

```bash
id -u bat >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin bat
install -d -m 700 -o bat -g bat /etc/bat
```

创建 `/etc/bat/config.toml`，填写根 README 的 `worker_url`、`write_key` 和可选 `interval`。可用 `host_id` 覆盖默认主机名，`[disk]` 设置 `exclude_mounts` / `exclude_fs_types`，`[network]` 设置 `exclude_interfaces`。保存后将文件 owner 设为 `bat:bat`、权限设为 600。

从仓库根目录复制当前 unit 并启动：

```bash
install -m 644 probe/dist/bat-probe.service /etc/systemd/system/bat-probe.service
systemctl daemon-reload
systemctl enable --now bat-probe
systemctl status bat-probe
```

使用完整的 `probe/dist/bat-probe.service`：它配置 `AmbientCapabilities=CAP_DAC_READ_SEARCH`、只读系统路径、`NoNewPrivileges` 和 15M 内存上限。该上限不是实测内存占用。不要从历史设计文档复制缺少 capabilities 的 unit 片段。

发布流程上传二进制、`.sha256`、systemd unit 和 `manifest.json`，不上传 `install.sh`。仓库的 `probe/install.sh` 需要注入部署地址，会与线上部署漂移，不要把它当作安装入口；懒加载的机器（含 agent）读取 `https://s.zhe.to/apps/bat/latest/manifest.json` 拿当前版本、按架构的下载地址、SHA-256 与 unit 地址，Setup 页也以它为准。

探针基本指标默认每 30 秒采集，身份信息定期更新；扩展采集约每 30 分钟执行，其中深度磁盘扫描间隔更长。软件、Docker、systemd 和站点发现依赖目标机现有命令、配置文件和权限。探针还尝试从 `https://echo.nocoo.cloud/api/ip` 取得公网地址，该地址写在源码中；请求失败时保留可用的本地采集流程。

CLI 自带两项运维命令：`bat doctor` 只读自检（运行时、assets profile 与 token、workstation 凭据与 ingest 可达性、调度注册、探针锁、最近一次上报写入；`--offline` 跳过网络检查，`--json` 输出机器可读结果，只有失败项才返回非零）；`bat update` 先查 npmjs、再查腾讯镜像，安装也按同一顺序回退。

## 认证与 CLI

| 用途                    | 凭据与入口                                            |
| ----------------------- | ----------------------------------------------------- |
| 浏览器仪表盘            | `bat.hexly.ai` 上的 Cloudflare Access                 |
| 探针上报                | 机器入口的 `BAT_WRITE_KEY`                            |
| 外部监控查询            | `BAT_READ_KEY`，仅使用允许的 `/api/monitoring/*` 路径 |
| 外部事件上报            | `/api/events` 的独立 Webhook token                    |
| agent / asset / binding | 浏览器登录生成的 assets 范围 CLI token                |

机器入口按方法和路径放行请求，不是所有浏览器 API 的替代地址。自定义部署需要同步检查 `entry-control.ts`、`setup.ts`、`cli-auth.ts` 中的主机名判断和返回地址，配置浏览器 Access 与机器访问策略。

`packages/cli` builds the public `@nocoo/bat` package with the sole `bat` executable. `bun run build` includes its self-contained Node.js bundle; `bun turbo build --filter=@nocoo/bat` builds just the CLI and shared prerequisite. npm publication is separate from Worker deployment. Before publication, use the source commands in the root README. Workstation functionality uses its own credentials and scheduler; see [Workstations](24-workstations.md).

`login --url` 可以指定浏览器入口，回调会提供实际机器 API 地址。配置保存在 `~/.config/bat/config.json`，包括 `worker_url`、`api_key`、`source_key` 与可选心跳间隔。

CLI 的 `agent`、`asset`、`binding` 提供管理操作。`service run` 接收 `match_key:running` 或 `match_key:stopped` 列表，重复发送这些状态，不读取目标进程状态。`service install` 为 macOS 写入 `~/Library/LaunchAgents/ai.hexly.bat.plist`，并打印加载命令；它不执行 launchctl，也不安装 Linux Rust 探针。需要真实进程健康检测时，调用方应提供相应检测逻辑。

## 开发配置

安装 Bun、Node.js 22.12+，探针编译使用当前 stable Rust。CI Rust job 跟踪 stable，探针镜像使用 `rust:1-alpine`；旧 README 的 Rust 1.85 不足以代表当前源码和依赖的完整要求。

`bun run build` builds shared, UI and CLI, writing the SPA to `packages/worker/static/` and the Node.js CLI to `packages/cli/dist/`. It does not deploy resources or register workstation tasks.

The canonical entry is `bun run dev`: a local gateway on 7025 starts persistent
Demo data, with Vite and native Wrangler on private ephemeral ports. The top-right
Demo / E2E / Prod control selects a fixed server instance. Manual E2E is disposable
and switchable; dedicated test entrypoints lock E2E server-side.

See [local environments](23-local-environments.md) for exact startup, reset,
test and screenshot commands, ownership safeguards, authentication, configuration
parity and the feature-to-fixture matrix. Production service credentials remain
server-side in `packages/ui/.env.local`; they are required only for explicit Prod.
The launcher does not use or rewrite daily Worker `.dev.vars`.

## Local tests

Build first, then run `bun turbo test:e2e --filter=@bat/worker` and
`bun run test:e2e:pw`. Each invocation creates its own D1, KV, Durable Objects,
identity and ephemeral ports. Tests reject production credentials, apply all
numbered migrations, verify ownership and remove only their own temporary store.
Playwright runs conflicting mutations serially. Settings tests use the real API.

## 数据保留与发布

当前设置允许 1、7、30 天保留期，默认 7 天。小时任务清理 `metrics_raw`、`metrics_hourly`、`tier2_snapshots` 和 `events` 时使用同一个设置。早期常量文件里仍有 raw 7 天 / hourly 90 天的值，不能据此描述当前实际保留策略。维护窗口是每日重复的 UTC 时间段，用于状态呈现和监控告警处理，不会停止采集。

生产发布由 [.github/workflows/release.yml](../.github/workflows/release.yml) 执行：main CI 成功后检出对应提交，构建 SPA，先应用 D1 迁移，再部署 Worker 并核对版本。不要在笔记本上手动执行 `wrangler deploy` 或 `bun run deploy` 与 CD 竞争。

版本发布入口是 `bun run release`，会同步版本并创建 tag；只有 tag push 才构建并上传探针到 R2。普通 main 文档提交会走 Worker CD，不会更新探针二进制或 VPS。R2 分发和主机上的探针升级是两个步骤，后者仍需维护者执行。

## Dashboard controls

The dashboard uses the installed Basalt 3.2.1 control and surface contract.
Use component size/variant props, `LayerCard` slots and `AppHeader`; do not copy
control CSS or restore the removed card/breadcrumb wrappers. Body/control text
uses `text-basalt-base`, supporting text uses `text-basalt-sm`, and fonts come
from the package tokens. Native time/number behavior is retained through `Input`.

Bat owns metric formatting, chart geometry and persisted ten-color tag indices.
The `--bat-chart-*` palette therefore remains separate from Basalt control accents.
Tags use a standard Badge with hue-preserving readable ink and a standard Select
with decorative swatches; do not remap stored indices to TagColorPicker names.
Host tag creation is an explicit MultiSelect option, never a blur side effect.
Connect's reveal/challenge/expiry safeguards remain application-owned; a generic
sensitive-input toggle must not bypass them. Its browser tests keep secret
screenshots, video and traces disabled.
