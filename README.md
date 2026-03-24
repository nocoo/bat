<p align="center"><img src="logo.png" width="128" height="128" /></p>

<h1 align="center">Bat</h1>

<p align="center"><strong>轻量级 VPS 基础设施监控系统</strong><br>实时指标采集 · 智能告警 · 可视化仪表盘</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-Linux-blue" alt="platform" />
  <img src="https://img.shields.io/badge/probe-Rust-orange" alt="probe" />
  <img src="https://img.shields.io/badge/worker-Cloudflare%20Workers-yellow" alt="worker" />
  <img src="https://img.shields.io/badge/dashboard-Next.js%2016-black" alt="dashboard" />
  <img src="https://img.shields.io/badge/tests-225-brightgreen" alt="tests" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="license" />
</p>

---

## 这是什么

Bat 是一套专为小型 VPS 集群设计的基础设施监控方案，用于替代 Netdata（120–243MB RSS）等重量级方案。整个系统由三个组件构成：Rust 编写的 Probe 采集端（~2MB RSS），运行在 Cloudflare Workers 上的数据处理和告警引擎，以及部署在 Railway 上的 Next.js 可视化仪表盘。

```
VPS hosts              Cloudflare              Railway
┌──────────┐          ┌──────────────┐         ┌──────────────┐
│ bat-probe │──POST──>│     bat      │<──GET───│  dashboard   │
│  (Rust)   │         │ (Hono + D1)  │         │ (Next.js 16) │
└──────────┘          └──────────────┘         └──────────────┘
  ~2MB RSS             CF Workers + D1          Bun standalone
  30s interval         Hourly aggregation       Google OAuth
  systemd unit         Alert evaluation         Recharts
```

## 功能

### Probe（采集端）

- **系统指标采集** — CPU usage/iowait/steal、内存、磁盘、网络流量，30 秒间隔
- **极低资源占用** — Rust 编写，~2MB RSS，静态编译 ~300KB ELF
- **一键安装** — `curl | bash` 安装脚本，自动配置 systemd 服务

### Worker（数据引擎）

- **数据接收与存储** — Hono 框架，D1 数据库，支持高频写入
- **智能告警** — 6 条内置规则（内存、磁盘、iowait、steal、主机离线等）
- **定时聚合** — Cron 触发的小时级数据聚合，自动清理过期数据

### Dashboard（仪表盘）

- **实时可视化** — Recharts 图表，CPU/内存/磁盘/网络趋势
- **Google OAuth** — 基于邮箱白名单的访问控制
- **Probe 分发** — 内置安装脚本和二进制分发，Setup 页面一键部署

## 安装

### Probe 安装（在目标 VPS 上）

```bash
curl -fsSL https://<dashboard>/api/probe/install.sh | bash -s -- --url <worker_url> --key <write_key>
```

### Worker 部署（Cloudflare Workers）

```bash
cd packages/worker
wrangler secret put BAT_WRITE_KEY --env production
wrangler secret put BAT_READ_KEY --env production
wrangler d1 execute bat-db-prod --env production --file=migrations/0001_initial.sql
wrangler deploy --env production
```

### Dashboard 部署（Railway / Docker）

```bash
docker build -f packages/dashboard/Dockerfile .
```

环境变量：`BAT_API_URL`、`BAT_READ_KEY`、`BAT_WRITE_KEY`、`AUTH_SECRET`、`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`ALLOWED_EMAILS`。

## 项目结构

```
bat/
├── packages/
│   ├── dashboard/          # Next.js 16 仪表盘
│   ├── worker/             # Cloudflare Workers 数据引擎
│   └── shared/             # 共享类型定义
├── probe/                  # Rust 采集端
│   ├── src/collectors/     # CPU/memory/disk/network 采集器
│   ├── dist/               # systemd unit 文件
│   └── install.sh          # 安装脚本
├── docs/                   # 设计文档（10 篇）
└── scripts/                # 版本同步、覆盖率检查、logo 生成
```

## 技术栈

| 层 | 技术 |
|---|------|
| Probe | [Rust](https://www.rust-lang.org/) · [tokio](https://tokio.rs/) · [reqwest](https://docs.rs/reqwest) |
| Worker | [Hono](https://hono.dev/) · [Cloudflare Workers](https://workers.cloudflare.com/) · [D1](https://developers.cloudflare.com/d1/) |
| Dashboard | [Next.js 16](https://nextjs.org/) · [React 19](https://react.dev/) · [SWR](https://swr.vercel.app/) · [Recharts](https://recharts.org/) |
| 认证 | [NextAuth.js](https://next-auth.js.org/) · Google OAuth |
| 工具链 | [pnpm](https://pnpm.io/) · [Turbo](https://turbo.build/) · [Biome](https://biomejs.dev/) · [Husky](https://typicode.github.io/husky/) |

## 开发

### 环境要求

- Node.js 22+、pnpm 10+、Rust 1.80+
- Wrangler CLI（Worker 开发）

### 快速开始

```bash
pnpm install
pnpm --filter @bat/worker dev       # Worker: localhost:8787
pnpm --filter @bat/dashboard dev    # Dashboard: localhost:7020
cd probe && cargo build --release   # Probe
```

### 常用命令

| 命令 | 说明 |
|------|------|
| `pnpm turbo typecheck` | 全量类型检查 |
| `pnpm turbo test` | 运行所有测试 |
| `pnpm lint` | Biome 代码检查 |
| `pnpm lint:fix` | 自动修复 lint 问题 |
| `scripts/sync-version.sh` | 同步版本号到所有子包 |
| `scripts/resize-logos.py` | 从 logo.png 生成所有派生图标 |

## 测试

| 层 | 内容 | 触发时机 |
|----|------|----------|
| L1 UT | 单元测试（225 个，覆盖率 90%+） | pre-commit |
| L2 Lint | Biome + TypeScript 类型检查 | pre-commit |
| L3 API E2E | Worker API 端到端测试 | pre-push |
| L4 BDD E2E | Playwright 浏览器测试 | 按需 |

| 模块 | 测试数 | 覆盖率 |
|------|--------|--------|
| @bat/shared | 26 | 100% |
| @bat/worker | 85 | 90%+ |
| @bat/dashboard | 47 | 90%+ |
| probe (Rust) | 67 | — |
| **合计** | **225** | |

```bash
pnpm turbo test        # TypeScript 测试
cd probe && cargo test  # Rust 测试
```

## 告警规则

21 条告警规则，全部已实现。Probe 上报原始数据，Worker 服务端评估告警。

### Tier 1（每次 ingest 评估）

| 规则 | 条件 | 严重度 |
|------|------|--------|
| `mem_high` | mem > 85% AND swap > 50% | Critical |
| `no_swap` | swap = 0 AND mem > 70% | Critical |
| `disk_full` | 任一挂载点 > 85% | Critical |
| `iowait_high` | iowait > 20% 持续 5min | Warning |
| `steal_high` | steal > 10% 持续 5min | Warning |
| `host_offline` | 超过 120s 未上报 | Critical |
| `uptime_anomaly` | uptime < 300s | Info |

### Tier 2（每次 tier2 上报评估）

| 规则 | 条件 | 严重度 |
|------|------|--------|
| `ssh_password_auth` | SSH 密码认证开启 | Critical |
| `ssh_root_login` | SSH root 登录=yes | Critical |
| `no_firewall` | 防火墙未启用 | Critical |
| `public_port` | 非白名单端口暴露在 0.0.0.0 | Warning |
| `security_updates` | 安全更新待安装 > 7d | Warning |
| `container_restart` | 容器重启次数 > 5 | Critical |
| `systemd_failed` | 有 failed systemd 单元 | Warning |
| `reboot_required` | 需要重启 > 7d | Info |

### Tier 3（每次 ingest 评估，可选字段）

| 规则 | 条件 | 严重度 |
|------|------|--------|
| `cpu_pressure` | PSI cpu avg60 > 25% 持续 5min | Warning |
| `mem_pressure` | PSI mem avg60 > 10% 持续 5min | Warning |
| `io_pressure` | PSI io avg60 > 20% 持续 5min | Warning |
| `disk_io_saturated` | 任一设备利用率 > 80% 持续 5min | Warning |
| `tcp_conn_leak` | TIME_WAIT > 500 持续 5min | Warning |
| `oom_kill` | OOM kill 次数 > 0 | Critical |

## 文档

| 文档 | 内容 |
|------|------|
| [01-metrics-catalogue](./docs/01-metrics-catalogue.md) | 信号目录：T1/T2/T3/Identity 全量信号、procfs 数据源、21 条告警规则 |
| [02-architecture](./docs/02-architecture.md) | 系统架构、关键决策、MVP 范围、部署方案 |
| [03-data-structures](./docs/03-data-structures.md) | D1 Schema、Migration 策略、Payload 类型 |
| [04-probe](./docs/04-probe.md) | Rust Probe：采集器、主循环、配置、systemd |
| [05-worker](./docs/05-worker.md) | CF Worker：路由、数据接收、告警、聚合 Cron |
| [06-dashboard](./docs/06-dashboard.md) | Next.js 仪表盘：OAuth、代理架构、图表 |
| [07-testing](./docs/07-testing.md) | 四层测试策略、Husky hooks |
| [08-commits](./docs/08-commits.md) | 原子化提交计划（Phase 0–5，46 commits） |
| [09-tier3-signals](./docs/09-tier3-signals.md) | Tier 3 设计：PSI 压力、磁盘 I/O、TCP 状态、OOM kills |
| [10-host-inventory](./docs/10-host-inventory.md) | 主机清单设计：CPU 拓扑、虚拟化、网络接口、块设备 |

## License

[MIT](LICENSE) © 2026