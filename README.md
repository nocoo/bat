<p align="center">
  <img src="assets/brand/icon-rounded.png" width="128" alt="Bat logo" />
</p>
<h1 align="center">Bat</h1>
<p align="center">采集 Linux 主机指标，集中查看状态、告警和基础设施资产。</p>
<p align="center">
  <a href="https://bat.hexly.ai">站点</a> ·
  <a href="docs/README.en.md">English</a>
</p>

## 这是什么

Bat 面向需要照看多台 VPS 的个人或小团队。Rust 探针在 Linux 主机采集指标，Cloudflare Worker 接收数据并评估告警，React 仪表盘展示主机趋势、事件和资产关联。

同一个 Hono Worker 托管 API 与 SPA，D1 保存数据，生产配置的 KV 为部分热点查询提供缓存。浏览器通过 Cloudflare Access 访问 `bat.hexly.ai`；探针、监控集成与 CLI 使用机器入口及各自的凭据。当前探针分发面向 Linux x86_64 和 aarch64。

## 功能

- 采集 CPU、内存、磁盘、网络、PSI、TCP 和进程指标，基本指标默认每 30 秒上报，可配置间隔。
- 发现主机硬件、软件、Docker、systemd 服务、监听端口和部分 Web 服务配置；采集内容取决于目标主机可用的命令与读取权限。
- 在主机列表与详情中查看历史趋势、告警、标签和事件，设置端口允许名单与每日 UTC 维护窗口。
- 提供监控查询 API，可供 Uptime Kuma 等外部系统按主机或组读取健康状态；Webhook 接口接收外部脚本上报的事件。
- 管理 agent、资产及两者的关联，记录 agent 心跳。CLI 提供对应的查询和管理命令。
- 通过 Connect 为 Agent 创建可授权多台服务器的 read / write Bearer token，同一服务器可授权多把 key；发现 `/api/v1` 能力与 OpenAPI 契约，支持授权集合编辑、重复查看、轮换、撤销，默认永不过期。
- 每小时聚合并清理历史数据，保留期可选 1、7 或 30 天，默认 7 天；该设置同时作用于原始指标、小时聚合、扩展快照和事件。

KV 是可选缓存，缺失或读取失败时回到 D1。告警由服务端规则评估；Webhook 是事件接收入口，仓库没有通用的告警消息推送渠道。

## 使用

获得 Access 权限后打开[仪表盘](https://bat.hexly.ai)。要接入一台 Linux 主机，先由实例维护者准备 `BAT_WRITE_KEY`，按[探针安装说明](docs/21-development.md#安装-linux-探针)安装二进制和仓库提供的 systemd unit，再填写 `/etc/bat/config.toml`：

```toml
worker_url = "https://bat-ingest.worker.hexly.ai"
write_key = "<your-write-key>"
interval = 30
```

`worker_url` 需要 HTTPS，loopback 开发地址除外；间隔不能低于 10 秒。Setup API 只返回地址，不提供 write key。发布流程上传探针二进制和校验文件，没有发布可直接使用的一键安装脚本。

资产 CLI 是仓库内的私有 workspace 包。完成下节的依赖安装和构建后，可从源码运行：

```bash
bun packages/cli/src/bin/bat-cli.ts login
bun packages/cli/src/bin/bat-cli.ts agent list
```

CLI 登录通过浏览器回调保存资产范围的 token。它的心跳服务定期发送用户传入的 `running` / `stopped` 状态，不检测进程是否真的运行；macOS 的 `service install` 生成 launchd plist，仍需另行加载。Linux 指标采集使用 Rust 探针。

## 开发

使用 Bun、Node.js 22.12+；编译或测试探针还需要当前 stable Rust 工具链。

```bash
git clone https://github.com/nocoo/bat.git
cd bat
bun install --frozen-lockfile
bun run build
cargo build --release --locked --manifest-path probe/Cargo.toml
```

`build` 构建共享包和 UI，SPA 写入 `packages/worker/static/`。`packages/shared/` 保存类型与规则，`packages/worker/` 是 API 和数据层，`packages/ui/` 是网页，`packages/cli/` 管理资产，`probe/` 是 Rust 采集端。

普通开发的 Vite 代理固定指向生产浏览器入口，需要 `packages/ui/.env.local` 中的 Access service token；它不会自动使用同时启动的本地 Worker。先按[开发配置](docs/21-development.md#开发配置)准备自己的目标和凭据，再启动：

```bash
bun run dev
```

此命令启动 Vite 7025 与本地 Worker 37025。生产发布由 GitHub Actions 先应用 D1 迁移，再部署 Worker；探针二进制只在版本 tag 发布时构建，VPS 上的更新仍需手动进行。

## 测试

先安装依赖并运行 `bun run build`，准备 Worker 的静态资源。API 与浏览器测试分别在 `.wrangler` 下生成独立测试 keyring，不会覆盖个人 `.dev.vars` 配置。

```bash
bun run test
bun run turbo test:e2e --filter=@bat/worker
bunx playwright install chromium
bun run test:e2e:pw
```

第一条命令运行 TypeScript 与 Rust 单元测试。API E2E 为每次运行选择临时 loopback 端口，并使用独有的 `packages/worker/.wrangler/e2e/<random>` 状态目录；浏览器测试使用 27025 和 `.wrangler/e2e-pw`。两者均显式使用本地 Wrangler 资源。

保持浏览器测试的 27025 端口空闲，并在测试进程中取消 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`、`CF_API_TOKEN`；API runner 会拒绝携带这些远程凭据启动。浏览器测试需要 Playwright Chromium。它们使用测试记录，不需要真实探针或 VPS 凭据。

## 技术栈

| 技术 | 用途 |
| --- | --- |
| Rust / Tokio / reqwest | Linux 指标采集与上报 |
| TypeScript / Bun / Turborepo | 共享代码、workspace 与 CLI 工具 |
| Hono / Cloudflare Workers | 数据接收、API、定时任务与静态资源 |
| Cloudflare D1 / KV | 数据持久化与可选热点缓存 |
| Vite / React / React Router / Recharts | 仪表盘、路由与趋势图 |
| Tailwind CSS / Radix UI | 样式与交互组件 |
| Cloudflare Access / `@nocoo/base-cli` | 浏览器认证与 CLI 登录 |
| Vitest / Playwright / Cargo | TypeScript、浏览器和 Rust 测试 |
| Cloudflare R2 | 发布探针二进制及校验文件 |

## 文档

- [文档索引](docs/README.md)
- [探针安装、开发与发布](docs/21-development.md)
- [架构与设计背景](docs/02-architecture.md)
- [监控 API](docs/16-monitoring-api.md)
- [Connect API、权限与安全部署](docs/22-connect.md)
- [D1 / KV 调整](docs/20-d1-to-kv-migration.md)

## 许可证

[MIT](LICENSE)
