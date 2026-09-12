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

发布流程只上传二进制与 `.sha256`，不上传 `install.sh`。仓库的 `probe/install.sh` 仍需要注入部署地址，Setup 页引用的脚本也不由当前 CD 发布；不要把它当作现成的一键安装入口。

探针基本指标默认每 30 秒采集，身份信息定期更新；扩展采集约每 30 分钟执行，其中深度磁盘扫描间隔更长。软件、Docker、systemd 和站点发现依赖目标机现有命令、配置文件和权限。探针还尝试从 `https://echo.nocoo.cloud/api/ip` 取得公网地址，该地址写在源码中；请求失败时保留可用的本地采集流程。

## 认证与 CLI

| 用途 | 凭据与入口 |
| --- | --- |
| 浏览器仪表盘 | `bat.hexly.ai` 上的 Cloudflare Access |
| 探针上报 | 机器入口的 `BAT_WRITE_KEY` |
| 外部监控查询 | `BAT_READ_KEY`，仅使用允许的 `/api/monitoring/*` 路径 |
| 外部事件上报 | `/api/events` 的独立 Webhook token |
| agent / asset / binding | 浏览器登录生成的 assets 范围 CLI token |

机器入口按方法和路径放行请求，不是所有浏览器 API 的替代地址。自定义部署需要同步检查 `entry-control.ts`、`setup.ts`、`cli-auth.ts` 中的主机名判断和返回地址，配置浏览器 Access 与机器访问策略。

`packages/cli` 是私有 workspace，没有对应的公开 npm 安装步骤。先 `bun run build` 构建 shared，再通过根 README 的源码命令使用 CLI。构建 CLI 本身可用 `bun turbo build --filter=@bat/cli`。

`login --url` 可以指定浏览器入口，回调会提供实际机器 API 地址。配置保存在 `~/.config/bat/config.json`，包括 `worker_url`、`api_key`、`source_key` 与可选心跳间隔。

CLI 的 `agent`、`asset`、`binding` 提供管理操作。`service run` 接收 `match_key:running` 或 `match_key:stopped` 列表，重复发送这些状态，不读取目标进程状态。`service install` 为 macOS 写入 `~/Library/LaunchAgents/ai.hexly.bat-cli.plist`，并打印加载命令；它不执行 launchctl，也不安装 Linux Rust 探针。需要真实进程健康检测时，调用方应提供相应检测逻辑。

## 开发配置

安装 Bun、Node.js 22.12+，探针编译使用当前 stable Rust。CI Rust job 跟踪 stable，探针镜像使用 `rust:1-alpine`；旧 README 的 Rust 1.85 不足以代表当前源码和依赖的完整要求。

`bun run build` 构建 shared 和 UI，将网页产物写入 `packages/worker/static/`，不部署资源。

普通 `bun run dev` 同时启动 Vite 7025 和本地 Wrangler 37025，但 Vite 的 `/api` 代理固定为 `https://bat.hexly.ai`，并不会连接这个本地 Worker。代理从 `packages/ui/.env.local` 读取 `CF_ACCESS_CLIENT_ID` 与 `CF_ACCESS_CLIENT_SECRET`，用于生产浏览器入口的 Access service token。页面操作会访问该远程服务。

使用自己的开发环境时，先调整 Vite 代理目标、`allowedHosts` 和对应 Access 配置。`packages/worker/.dev.vars` 保存本地 Worker 的秘密配置；生产 secrets 包括 `BAT_WRITE_KEY`、`BAT_READ_KEY`、`CF_ACCESS_TEAM_DOMAIN`、`CF_ACCESS_AUD`。D1 / KV 名称、ID 和域名需要属于自己的账号。

## 本地测试

测试使用明确的本地资源；先安装依赖并构建静态资源。API runner 为 `packages/worker/test/e2e/global-setup.ts`，显式使用 `--local --persist-to .wrangler/e2e`，逐个应用迁移、写入测试标记，然后在 17025 启动 Worker。

API runner 和浏览器测试在 `.wrangler` 下生成各自独立的测试 keyring，显式通过 `--env-file` 加载，不会覆盖个人 `.dev.vars`。测试进程不能携带 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID` 或 `CF_API_TOKEN`。

Playwright 使用 27025 与 `.wrangler/e2e-pw`，调用 `scripts/l3-webserver.sh` 初始化迁移与测试记录后启动本地 Worker。其配置在非 CI 模式可复用已有服务，因此运行前保持该端口空闲。L3 初始化脚本会忽略单条 SQL 的失败，最终应以测试结果判断，不能只看“Database ready”输出。

根 `bun run test` 运行 TypeScript 与 Rust 单元测试；API E2E 和浏览器 E2E 使用根 README 中的单独命令。维护中的测试入口以当前 package scripts 和配置为准，不把旧文档里的 coverage 数字当作运行说明。

## 数据保留与发布

当前设置允许 1、7、30 天保留期，默认 7 天。小时任务清理 `metrics_raw`、`metrics_hourly`、`tier2_snapshots` 和 `events` 时使用同一个设置。早期常量文件里仍有 raw 7 天 / hourly 90 天的值，不能据此描述当前实际保留策略。维护窗口是每日重复的 UTC 时间段，用于状态呈现和监控告警处理，不会停止采集。

生产发布由 [.github/workflows/release.yml](../.github/workflows/release.yml) 执行：main CI 成功后检出对应提交，构建 SPA，先应用 D1 迁移，再部署 Worker 并核对版本。不要在笔记本上手动执行 `wrangler deploy` 或 `bun run deploy` 与 CD 竞争。

版本发布入口是 `bun run release`，会同步版本并创建 tag；只有 tag push 才构建并上传探针到 R2。普通 main 文档提交会走 Worker CD，不会更新探针二进制或 VPS。R2 分发和主机上的探针升级是两个步骤，后者仍需维护者执行。
