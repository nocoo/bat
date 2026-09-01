<p align="center"><img src="logo.png" width="128" height="128" /></p>

<h1 align="center">Bat</h1>

<p align="center"><strong>轻量级 VPS 基础设施监控系统</strong><br>实时指标采集 · 智能告警 · 可视化仪表盘</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-Linux-blue" alt="platform" />
  <img src="https://img.shields.io/badge/probe-Rust-orange" alt="probe" />
  <img src="https://img.shields.io/badge/worker-Cloudflare%20Workers-yellow" alt="worker" />
  <img src="https://img.shields.io/badge/dashboard-Vite-black" alt="dashboard" />
  <img src="https://img.shields.io/badge/coverage-90%2B-brightgreen" alt="coverage" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="license" />
</p>

---

## 这是什么

Bat 是一套专为小型 VPS 集群设计的基础设施监控方案，用于替代 Netdata（120–243MB RSS）等重量级方案。三个组件：Rust Probe（~2MB RSS）、Cloudflare Worker（Hono + D1，同时托管 API 与 SPA）、Vite 仪表盘。架构以 [docs/02-architecture.md](docs/02-architecture.md) 为准。

```
VPS hosts                         Cloudflare
┌──────────┐          ┌──────────────────────────────────┐
│ bat-probe │──POST──>│  bat-ingest.worker.hexly.ai      │
│  (Rust)   │         │  (no Access, write/read keys)    │
└──────────┘          │                                  │
                      │  bat.hexly.ai  (Access)          │
Browser ─────────────>│  Worker = API + Vite SPA assets  │
                      └──────────────────────────────────┘
```

## 功能

### Probe（采集端）

- **系统指标采集** — CPU usage/iowait/steal、内存、磁盘、网络流量，30 秒间隔
- **极低资源占用** — Rust 编写，~2MB RSS；当前发布的 x86_64 静态二进制约 3.4MB
- **手动安装** — R2 二进制 + 仓库内 `probe/dist/bat-probe.service`。CD **不**上传 `install.sh`；Setup 页的 `latest/install.sh` 目前 404

### Worker（数据引擎）

- **数据接收与存储** — Hono 框架，D1 数据库，支持高频写入
- **智能告警** — `ALL_ALERT_RULES`（当前 28 条）在 Worker 侧评估
- **定时聚合** — Cron 触发的小时级数据聚合，自动清理过期数据

### Dashboard（仪表盘）

- **实时可视化** — Recharts 图表，CPU/内存/磁盘/网络趋势
- **Cloudflare Access** — 浏览器走 `bat.hexly.ai`；机器流量走 ingest 域名
- **Probe 分发** — R2 `latest/bat-probe-linux-{x86_64,aarch64}`（及 `.sha256`）。没有已发布的一键脚本

## 安装

### Probe 安装（在目标 VPS 上）

CD 只把 probe 二进制和 checksum 传到 R2，**不上传** `install.sh`。未注入 `DASHBOARD_URL` 的 `probe/install.sh` 会退出。Setup 页的 `latest/install.sh` 目前 404。新机器（root，x86_64）：

```bash
curl -fsSL -o /usr/local/bin/bat-probe https://s.zhe.to/apps/bat/latest/bat-probe-linux-x86_64
chmod 755 /usr/local/bin/bat-probe
id -u bat >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin bat
mkdir -p /etc/bat
cat > /etc/bat/config.toml <<'EOF'
worker_url = "https://bat-ingest.worker.hexly.ai"
write_key = "<write_key>"
EOF
chown -R bat:bat /etc/bat
chmod 600 /etc/bat/config.toml
cat > /etc/systemd/system/bat-probe.service <<'EOF'
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
AmbientCapabilities=CAP_DAC_READ_SEARCH
NoNewPrivileges=true
ProtectSystem=strict
ReadOnlyPaths=/proc /sys /etc

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now bat-probe
```

aarch64 把二进制文件名换成 `bat-probe-linux-aarch64`。unit 内容必须与仓库 `probe/dist/bat-probe.service` 一致，不要用缺 `AmbientCapabilities` 的 docs/04 片段。

### Worker 部署

不要在本机 `wrangler deploy`，也不要使用不存在的 `bat-db-prod` 或只 apply `0001`。生产 D1 迁移必须先于引用新列的 Worker 代码。版本入口 `bun run release`；CD 见 `.github/workflows/release.yml` 与 [docs/19-edge-deployment.md](docs/19-edge-deployment.md)。

### Dashboard

SPA 由 Worker `[assets]` 托管，不再走 Railway / Next.js。浏览器认证是 Cloudflare Access。详见 [docs/19-edge-deployment.md](docs/19-edge-deployment.md)。

## 项目结构

```
bat/
├── packages/
│   ├── ui/                 # Vite SPA :7025
│   ├── worker/             # Hono Worker + D1（wrangler :37025）
│   ├── shared/             # 共享类型
│   └── cli/
├── probe/                  # Rust 采集端
├── docs/                   # 编号设计文档
└── scripts/
```

## 技术栈

| 层 | 技术 |
|---|------|
| Probe | [Rust](https://www.rust-lang.org/) · [tokio](https://tokio.rs/) · [reqwest](https://docs.rs/reqwest) |
| Worker | [Hono](https://hono.dev/) · [Cloudflare Workers](https://workers.cloudflare.com/) · [D1](https://developers.cloudflare.com/d1/) |
| Dashboard | [Vite](https://vite.dev/) · React · Recharts |
| 认证 | Cloudflare Access（浏览器）；ingest 用 write/read key |
| 工具链 | [Bun](https://bun.sh/) · [Turbo](https://turbo.build/) · [Biome](https://biomejs.dev/) · [Husky](https://typicode.github.io/husky/) |

## 开发

### 环境要求

- Bun 1.3+、Rust 1.85+（edition 2024）
- Wrangler CLI（Worker 开发）

### 快速开始

```bash
bun install
bun run dev                         # Vite :7025 + wrangler :37025
cd probe && cargo build --release   # Probe
```

### 常用命令

| 命令 | 说明 |
|------|------|
| `bun turbo typecheck` | 全量类型检查 |
| `bun turbo test` | 运行所有测试 |
| `bun run lint` | Biome 代码检查 |
| `bun run lint:fix` | 自动修复 lint 问题 |
| `bun run release` | 同步全部子包（含 `packages/cli`）并打 tag |
| `scripts/resize-logos.py` | 从 logo.png 生成所有派生图标 |

## 测试

| 层 | 内容 | 触发时机 |
|----|------|----------|
| L1 | TS line ≥90% pre-commit（`check-coverage.sh 90 95`）；CI `test:unit:coverage` 默认 TS 95% / Rust llvm-cov 90%；另有 `cargo test` probe job | pre-commit + CI |
| G1 | tsc + Biome；probe clippy/fmt | pre-commit + CI |
| L2 | wrangler `--local` :17025；`gate:routes` 静态 method/path | pre-push + CI |
| L3 | Playwright Chromium :27025 | CI only |
| G2 | gitleaks pre-commit+pre-push+CI；osv `bun.lock` pre-push+CI；osv `probe/Cargo.lock` 仅 pre-push | |

覆盖率以 `scripts/check-coverage.sh` 为准，不要沿用旧的 225 / `@bat/dashboard` 计数。

```bash
bun turbo test          # TypeScript 测试
cd probe && cargo test  # Rust 测试
```

## 告警规则

规则条数以 `packages/shared/src/alerts.ts` 的 `ALL_ALERT_RULES` 为准（当前 28 条）。Probe 上报原始数据，Worker 服务端评估。

## 文档

| 文档 | 内容 |
|------|------|
| [01-metrics-catalogue](./docs/01-metrics-catalogue.md) | 信号目录（告警条数可能过期；以 `ALL_ALERT_RULES` 为准） |
| [02-architecture](./docs/02-architecture.md) | 系统架构、关键决策、MVP 范围、部署方案 |
| [03-data-structures](./docs/03-data-structures.md) | D1 Schema、Migration 策略、Payload 类型 |
| [04-probe](./docs/04-probe.md) | Rust Probe：采集器、主循环、配置、systemd |
| [05-worker](./docs/05-worker.md) | CF Worker：路由、数据接收、告警、聚合 Cron |
| [06-ui](./docs/06-ui.md) | Vite SPA（旧 Next/代理描述可能过期） |
| [07-testing](./docs/07-testing.md) | 四层测试策略、Husky hooks |
| [08-commits](./docs/08-commits.md) | 原子化提交计划（Phase 0–5，46 commits） |
| [09-tier3-signals](./docs/09-tier3-signals.md) | Tier 3 设计：PSI 压力、磁盘 I/O、TCP 状态、OOM kills |
| [10-host-inventory](./docs/10-host-inventory.md) | 主机清单设计：CPU 拓扑、虚拟化、网络接口、块设备 |

## License

[MIT](LICENSE) © 2026