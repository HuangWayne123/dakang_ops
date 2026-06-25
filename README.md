# 达康站群运营服务

用于四个官网的统一埋点采集、AI 代理指标汇总和内部老板看板。

## 功能

- `POST /api/track`
  - 接收站点埋点事件，如 `page_view`、`page_exit`、`faq_open`、`contact_click`
- `POST /api/agent-audit`
  - 记录人工抽检问题是否被豆包等智能体命中
- `GET /api/summary`
  - 返回近 N 天汇总指标
- `GET /dashboard`
  - 内部汇报看板

## 启动

1. `npm install`
2. 复制 `.env.example` 配置环境变量
3. `npm start`

## 建议的站点反向代理

- 看板入口: `/ops/dashboard`
- 采集接口: `/ops/api/track`
- 汇总接口: `/ops/api/summary`

反向代理需要把 `/ops/*` 转发到 `dakang_ops` 服务，并去掉路径前缀 `/ops`。例如：

- `/ops/api/track` -> `http://127.0.0.1:3200/api/track`
- `/ops/dashboard` -> `http://127.0.0.1:3200/dashboard`

推荐线上保持这种同域 `/ops` 入口，前端无需写死后台域名；只有在静态站本地直连调试时，才用绝对地址覆盖。

当前版本不再要求 dashboard、summary 或 agent-audit 携带 token。

## 跨域说明

- `/api/track` 默认允许 `http://127.0.0.1:*`、`http://localhost:*` 和 `file://` 预览页对应的 `Origin: null` 访问，方便本地静态调试。
- 正式环境如果需要跨域直连，请通过 `TRACK_ALLOWED_ORIGINS` 显式配置允许域名。

## 数据落盘

- `data/events.jsonl`
- `data/agent-audits.jsonl`

## GitHub Actions 与部署

- CI: `.github/workflows/ci.yml`
  - 使用 Node 22
  - 执行 `npm ci`
  - 执行 `npm test`
- Deploy: `.github/workflows/deploy.yml`
  - 只有 CI 成功后，或手动触发时才会部署
  - 代码同步到 `/var/www/dakang/ops`
  - 远端执行 `scripts/restart-service.sh` 安装生产依赖、重启进程并检查 `/api/health`

### Deploy 依赖的 GitHub Secrets

- `SERVER_HOST`
- `SERVER_USER`
- `SERVER_SSH_KEY`
- `OPS_ENV_FILE`（可选）

如果没有配置 `OPS_ENV_FILE`，服务会沿用服务器已有的 `.env`；如果服务器上也没有 `.env`，则使用应用内默认值启动。

### Nginx 代理示例

- 示例文件：`deploy/nginx.ops-location.conf.example`
- 建议把它合并到当前承载官网的 server block 中，让站点通过同域 `/ops/*` 访问该服务
- 当前服务器实查中，几个官网的公开入口挂在 `group.dakangjt.com` 对应的 HTTPS server block 上，尚未存在 `/ops` 代理规则
