# 19 — Edge Dashboard

> 将 Next.js Dashboard 迁移到 Cloudflare Workers 边缘部署。
>
> 前置文档:
> - [02-architecture.md](./02-architecture.md) — 原系统架构
> - [06-dashboard.md](./06-dashboard.md) — 原 Next.js Dashboard 设计
> - [16-monitoring-api.md](./16-monitoring-api.md) — Monitoring API（Uptime Kuma 集成）
>
> 本文档取代 [06-dashboard.md](./06-dashboard.md)，迁移完成后旧文档归档。

---

## 动机

当前架构存在不必要的复杂性：

```
Browser → Next.js (Railway) → Worker (CF) → D1
              ↑
         冗余中间层
```

**目标**：个人项目，极简部署，数据都在 D1，直接合并到 Worker。

---

## 1. 拓扑设计

### 双入口分离

浏览器入口受 Access 保护，Probe/机器入口走独立域名：

```
┌─────────────────────────────────────────────────────────────────┐
│                        Cloudflare                                │
│                                                                  │
│  ┌─────────────────────┐      ┌─────────────────────┐           │
│  │   bat.hexly.ai      │      │ bat-ingest.worker.  │           │
│  │   (Access 保护)      │      │ hexly.ai (无 Access) │           │
│  └──────────┬──────────┘      └──────────┬──────────┘           │
│             │                            │                       │
│             ▼                            ▼                       │
│  ┌─────────────────────────────────────────────────────┐        │
│  │                   Worker (Hono)                      │        │
│  │                                                      │        │
│  │  路由分发逻辑：                                        │        │
│  │  1. 检查 Host header                                 │        │
│  │  2. bat-ingest.* → 仅允许机器路由                     │        │
│  │  3. bat.* → 需要 Access JWT                          │        │
│  └─────────────────────────────────────────────────────┘        │
│                              │                                   │
│                              ▼                                   │
│                          ┌──────┐                                │
│                          │  D1  │                                │
│                          └──────┘                                │
└─────────────────────────────────────────────────────────────────┘
```

### 路由分类

| 分类 | Method + 路由 | 认证方式 | 允许入口 |
|------|---------------|----------|----------|
| **Probe 写** | `POST /api/ingest`, `POST /api/identity`, `POST /api/tier2` | `BAT_WRITE_KEY` | `bat-ingest.*` only |
| **Webhook 事件** | `POST /api/events` | Webhook token (自校验) | `bat-ingest.*` only |
| **机器读** | `GET /api/monitoring/*` | `BAT_READ_KEY` | `bat-ingest.*` only |
| **公开** | `GET /api/live` | 无 | 任意 |
| **浏览器读** | `GET /api/hosts`, `GET /api/alerts`, `GET /api/events`, ... | Access JWT | `bat.*` only |
| **浏览器写** | `POST/PUT/DELETE /api/tags/*`, `/api/webhooks/*`, ... | Access JWT | `bat.*` only |
| **静态文件** | `GET /*` (非 /api) | Access (前置拦截) | `bat.*` only |

**关键设计**：`bat-ingest.*` 入口采用**白名单模式**，只允许明确列出的机器路由，其他一律 403。

### 本地开发 / E2E 测试

本地 `wrangler dev` 和 L2 E2E 测试无法获得真实的 Access JWT。需要特殊处理：

| 场景 | Host header | 认证方式 |
|------|-------------|----------|
| 本地开发 | `localhost:*` | 继续用 `BAT_READ_KEY` / `BAT_WRITE_KEY` |
| E2E 测试 | `localhost:18787` | 继续用 API key（现有行为不变） |
| 生产 bat.* | `bat.hexly.ai` | Access JWT |
| 生产 bat-ingest.* | `bat-ingest.worker.hexly.ai` | API key（白名单路由） |

**实现**：`entryControl` 和 `accessAuth` 检测 `localhost` 时回退到 API key 认证，保持现有 E2E 测试兼容。

---

## 2. 认证模型

### 入口级路由控制

Worker 中间件按 Host header 决定允许哪些路由：

```typescript
// middleware/entry-control.ts

// 机器入口白名单：method + path
const MACHINE_ROUTES: Array<{ method: string; path: string; prefix?: boolean }> = [
  // Probe 写路由
  { method: "POST", path: "/api/ingest" },
  { method: "POST", path: "/api/identity" },
  { method: "POST", path: "/api/tier2" },
  // Webhook 事件接收（POST only，自带 token 校验）
  { method: "POST", path: "/api/events" },
  // 机器读路由（Uptime Kuma）
  { method: "GET", path: "/api/monitoring", prefix: true },
  // 公开路由
  { method: "GET", path: "/api/live" },
];

function isAllowedMachineRoute(method: string, path: string): boolean {
  return MACHINE_ROUTES.some(route => {
    if (route.method !== method) return false;
    if (route.prefix) {
      return path === route.path || path.startsWith(route.path + "/");
    }
    return path === route.path;
  });
}

function isLocalhost(host: string): boolean {
  return host.startsWith("localhost") || host.startsWith("127.0.0.1");
}

export function entryControl(c: Context, next: Next) {
  const host = c.req.header("host") || "";
  const path = c.req.path;
  const method = c.req.method;
  
  // localhost：跳过入口控制，继续用 apiKeyAuth（本地开发 / E2E 测试）
  if (isLocalhost(host)) {
    return next();
  }
  
  // bat-ingest.* 入口：白名单模式（method + path）
  if (host.includes("bat-ingest")) {
    if (!isAllowedMachineRoute(method, path)) {
      return c.json({ error: "Route not allowed on machine endpoint" }, 403);
    }
    // 允许的路由继续走 apiKeyAuth
    return next();
  }
  
  // bat.* 入口：需要 Access JWT
  return next(); // 后续由 accessAuth 处理
}
```

### Access JWT 验证

**必须验证 JWT 签名**，不能只检查 header 存在：

```typescript
// middleware/access-auth.ts
import { createRemoteJWKSet, jwtVerify } from "jose";

// 从 CF Access Application 获取
const TEAM_DOMAIN = "hexly.cloudflareaccess.com";
const AUD = "<access-application-aud>"; // 从 Access 控制台复制

const JWKS = createRemoteJWKSet(
  new URL(`https://${TEAM_DOMAIN}/cdn-cgi/access/certs`)
);

function isLocalhost(host: string): boolean {
  return host.startsWith("localhost") || host.startsWith("127.0.0.1");
}

export async function accessAuth(c: Context<AppEnv>, next: Next) {
  const host = c.req.header("host") || "";
  
  // localhost：跳过 Access JWT，继续用 apiKeyAuth（本地开发 / E2E 测试）
  if (isLocalhost(host)) {
    return next();
  }
  
  // bat-ingest.* 入口已由 entryControl 处理，这里跳过
  if (host.includes("bat-ingest")) {
    return next();
  }
  
  // 公开路由不需要 JWT
  if (c.req.path === "/api/live") {
    return next();
  }
  
  const jwt = c.req.header("Cf-Access-Jwt-Assertion");
  if (!jwt) {
    return c.json({ error: "Missing Access JWT" }, 401);
  }
  
  try {
    await jwtVerify(jwt, JWKS, {
      issuer: `https://${TEAM_DOMAIN}`,
      audience: AUD,
    });
  } catch (e) {
    return c.json({ error: "Invalid Access JWT" }, 403);
  }
  
  return next();
}
```

### 中间件组合

```typescript
// src/index.ts
import { entryControl } from "./middleware/entry-control.js";
import { accessAuth } from "./middleware/access-auth.js";
import { apiKeyAuth } from "./middleware/api-key.js";

const app = new Hono<AppEnv>();

// 1. 入口控制（白名单机器路由）
app.use("*", entryControl);

// 2. 认证分流
//    - localhost → apiKeyAuth（兼容本地开发 / E2E）
//    - bat-ingest.* → apiKeyAuth
//    - bat.* → accessAuth
app.use("/api/*", accessAuth);
app.use("/api/*", apiKeyAuth);  // accessAuth 通过后，apiKeyAuth 对 bat.* 读路由放行

// 3. 路由注册
app.get("/api/live", liveHandler);
app.post("/api/ingest", ingestHandler);
// ... 其他路由
```

**apiKeyAuth 调整**：对于 `bat.*` 入口的浏览器路由，`accessAuth` 已验证 JWT，`apiKeyAuth` 需要识别并放行（不要求 API key）。可通过检查 `Cf-Access-Jwt-Assertion` header 存在来判断。

### API Key 认证（机器路由）

机器路由继续使用现有的 `apiKeyAuth` 中间件：
- Probe 写路由：`BAT_WRITE_KEY`
- Monitoring 读路由：`BAT_READ_KEY`（Uptime Kuma 用）
- `/api/events`：自带 webhook token 校验

### 移除 BAT_READ_KEY 的范围

**只移除浏览器路由的 BAT_READ_KEY 依赖**。`/api/monitoring/*` 仍需 `BAT_READ_KEY`，因为 Uptime Kuma 是机器客户端，走 `bat-ingest.*` 入口。

---

## 3. 操作员写权限

现有写操作（tags, webhooks, maintenance, allowed-ports）：
- 原方案：Dashboard 代理，用 `BAT_WRITE_KEY`
- 新方案：浏览器直接调用，用 Access JWT

**无需额外权限模型**：单用户系统，通过 Access JWT 即可识别操作员身份。

### Setup 页面处理

现有 `/api/setup` 返回 `BAT_WRITE_KEY` 给前端——这是安全隐患。

**迁移方案：手动填入**

Setup 页面只显示安装命令模板（带 `YOUR_WRITE_KEY` 占位符），用户需要：
1. 从 Cloudflare 控制台 Workers → Settings → Variables 获取 `BAT_WRITE_KEY`
2. 手动替换占位符

**不提供任何 API 返回或复制 key 的功能**。这是唯一安全的做法。

---

## 4. 静态资源部署

使用 Wrangler v4 的 `[assets]`（`[site]` 已废弃）：

### wrangler.toml 配置

```toml
# packages/worker/wrangler.toml

name = "bat"
main = "src/index.ts"
compatibility_date = "2025-03-14"

# 静态资源配置 (Wrangler v4)
[assets]
directory = "./static"
binding = "ASSETS"
# API 优先：请求先到 Worker 代码，非 API 再 fallback 到静态资源
run_worker_first = true
# SPA fallback：404 返回 index.html
not_found_handling = "single-page-application"

# ... cron, d1 等配置保持不变

[env.production]
name = "bat"

# 双域名路由
[[env.production.routes]]
pattern = "bat-ingest.worker.hexly.ai"
custom_domain = true

[[env.production.routes]]
pattern = "bat.hexly.ai"
custom_domain = true

# ... 其余配置
```

### 路由优先级

`run_worker_first = true` 确保：
1. 所有请求先到 Worker 代码
2. `/api/*` 由 Hono 路由处理
3. 非匹配请求 fallback 到 `static/` 目录
4. 静态文件 404 → `index.html`（SPA 路由）

---

## 5. 项目结构

### 新增 packages/ui

```
packages/ui/                  # Vite + React SPA
├── package.json
├── vite.config.ts
├── index.html
├── tsconfig.json
└── src/
    ├── main.tsx
    ├── App.tsx              # React Router 路由
    ├── api.ts               # fetch wrapper（直接调用 /api/*）
    ├── routes/
    │   ├── hosts.tsx
    │   ├── host-detail.tsx
    │   ├── alerts.tsx
    │   ├── events.tsx
    │   ├── tags.tsx
    │   ├── webhooks.tsx
    │   └── setup.tsx
    ├── components/          # 从 dashboard 迁移
    │   ├── ui/              # shadcn/ui
    │   ├── layout/          # AppShell, Sidebar
    │   ├── host-card.tsx
    │   ├── status-badge.tsx
    │   └── charts/
    └── hooks/               # SWR hooks（URL 不变）
```

### Vite 配置

```typescript
// packages/ui/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "../worker/static",
    emptyOutDir: true,
  },
});
```

---

## 6. 质量门迁移

### turbo.json 更新

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", "static/**"]
    },
    "@bat/ui#build": {
      "dependsOn": ["^build"],
      "outputs": ["../worker/static/**"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "test:e2e": {
      "dependsOn": ["^build"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

### 根 package.json 更新

移除 `@bat/dashboard` 相关脚本，添加 `@bat/ui`。

### L3 测试处理

现有 L3 是 Playwright 浏览器测试，定义在 [07-testing.md § L3](./07-testing.md)。

**本次迁移暂时移除 L3**，原因：
- Dashboard → UI 重写，原 E2E 测试不可复用
- 优先保证功能上线

**质量体系调整**：
- 迁移期间质量等级从 **Tier A** 降至 **Tier B**（L1 + G1）
- Phase 5 完成后，需更新 [07-testing.md](./07-testing.md)：
  - 移除 `@bat/dashboard` 相关 L3 描述
  - 标注 `@bat/ui` 的 L3 为 **TODO**
- 后续版本补齐 L3（Playwright 对接 `wrangler dev`）

**声明**：这是有意识的质量降级决策，不是遗漏。

### Husky hooks 更新

确保 pre-commit/pre-push 运行新的包结构：
- `@bat/ui` 替代 `@bat/dashboard`
- 路径更新

---

## 7. Cloudflare Access 配置

### 创建 Access Application

1. Cloudflare Zero Trust → Access → Applications
2. Add application → Self-hosted
3. Application name: `Bat Dashboard`
4. Application domain: `bat.hexly.ai`
5. Session duration: 24 hours

### 创建 Policy

1. Policy name: `Owner Access`
2. Action: Allow
3. Include rules:
   - Emails: `your-email@example.com`

### 获取配置值

Application 创建后，记录：
- **Team domain**: `<team>.cloudflareaccess.com`（用于 JWKS URL）
- **Application Audience (AUD)**: 用于 JWT 验证

---

## 8. 实施步骤

### Phase 1: Worker 认证改造 ✅

| # | 任务 | 状态 |
|---|------|------|
| 1.1 | 添加 `entryControl` 中间件（白名单机器路由） | ✅ |
| 1.2 | 添加 `accessAuth` 中间件（JWT 验证，用 jose 库） | ✅ |
| 1.3 | 调整中间件顺序：`entryControl` → `accessAuth` / `apiKeyAuth` | ✅ |
| 1.4 | 浏览器读写路由移除 `BAT_READ_KEY` 依赖 | ✅ |
| 1.5 | `/api/monitoring/*` 保留 `BAT_READ_KEY`（机器路由） | ✅ |

### Phase 2: Worker 静态资源 ✅

| # | 任务 | 状态 |
|---|------|------|
| 2.1 | 配置 `wrangler.toml` 的 `[assets]` | ✅ |
| 2.2 | 添加 `bat.hexly.ai` 路由（双域名） | ✅ |
| 2.3 | 本地 `wrangler dev` 验证 | ✅ |

### Phase 3: 构建 UI

| # | 任务 |
|---|------|
| 3.1 | 创建 `packages/ui`，配置 Vite 6 + React 19 + Tailwind |
| 3.2 | 迁移 UI 组件（shadcn/ui, layout, charts） |
| 3.3 | 迁移页面（去掉 SSR/代理逻辑） |
| 3.4 | 迁移 SWR hooks（URL 不变） |
| 3.5 | Setup 页面改造（不返回 write key） |

### Phase 4: 上线

| # | 任务 |
|---|------|
| 4.1 | 配置 Cloudflare Access（bat.hexly.ai） |
| 4.2 | 部署 Worker（含静态资源） |
| 4.3 | 验证：浏览器入口需登录，API 正常 |
| 4.4 | 验证：Probe 写入正常（bat-ingest.*） |
| 4.5 | 验证：Uptime Kuma monitoring API 正常 |

### Phase 5: 清理

| # | 任务 |
|---|------|
| 5.1 | 删除 `packages/dashboard` |
| 5.2 | 更新 `turbo.json` 和根 `package.json` |
| 5.3 | 更新 Husky hooks |
| 5.4 | 关闭 Railway 部署 |
| 5.5 | 更新 CLAUDE.md 和相关文档 |

---

## 9. 依赖清单

### Worker 新增依赖

```bash
cd packages/worker
bun add jose  # JWT 验证
```

### UI 包依赖

```bash
cd packages/ui
bun add react react-dom react-router swr recharts
bun add -d vite @vitejs/plugin-react @tailwindcss/vite tailwindcss typescript @types/react @types/react-dom
```

（shadcn/ui 组件直接从 dashboard 复制，无需额外安装）

---

## 10. 成功指标

| 指标 | 目标 |
|------|------|
| 部署命令 | `bun run build && wrangler deploy` |
| 基础设施 | 仅 Cloudflare（无 Railway） |
| API Key | `BAT_WRITE_KEY`（Probe）+ `BAT_READ_KEY`（Uptime Kuma） |
| 浏览器认证 | Cloudflare Access + JWT 签名验证 |
| 机器入口 | 白名单路由，非允许路由返回 403 |
