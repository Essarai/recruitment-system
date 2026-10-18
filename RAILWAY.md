# Railway 部署

## 从 GitHub 创建服务

1. 在既有 MySQL、MinIO 所在 Railway 项目中新增服务，选择 GitHub 仓库 `Essarai/recruitment-system`，分支 `main`，Root Directory 保持 `/`。
2. 项目已有 `railway.json`：Railpack 构建，执行 `npm run build`，使用 `npm start` 启动；Node 固定使用 22 系列（至少 22.13）。健康检查 `/healthz`，启动等待最多 300 秒。
3. 在服务 Settings → Networking 生成公共域名。
4. 在 Variables → Raw Editor 导入本机的 `.env.railway`，保存并重新部署。该文件含现有 MySQL/MinIO 凭据，已忽略且不会进入 GitHub。它将 `PUBLIC_ORIGIN` 设置为 `https://${{RAILWAY_PUBLIC_DOMAIN}}`；使用自定义域名时改为实际完整 HTTPS 来源，不带结尾 `/`。
5. 部署完成后打开生成的域名，使用原有账号登录。`/healthz` 应返回 `{"ok":true}`。面试官的 MCP 地址自动变为此域名下的 `/mcp`。

`.env.railway` 沿用当前已验证的数据库和对象存储配置，不创建新库、不清空数据，也不重置既有管理员密码。不要更换 S3 Bucket，否则既有简历引用无法读取。同项目、同环境可将 MySQL 主机/端口替换为数据库服务的私网地址/3306，其余凭据及 TLS CA 配置保持对应实例。

## 关键变量

| 变量 | Railway 设置 |
| --- | --- |
| `NODE_ENV` | `production` |
| `API_HOST` | `0.0.0.0` |
| `COOKIE_SECURE` | `true` |
| `PUBLIC_ORIGIN` | `https://${{RAILWAY_PUBLIC_DOMAIN}}`，或实际自定义域名 |
| `MYSQL_HOST` / `MYSQL_PORT` / `MYSQL_DATABASE` / `MYSQL_USER` / `MYSQL_PASSWORD` | 沿用现有实例配置，不能只提供 `MYSQL_URL` |
| `MYSQL_SSL_CA_FILE` | `server/certs/mysql-ca.pem`（仓库只包含公开 CA 证书，无私钥） |
| `MYSQL_SSL_VERIFY_IDENTITY` | 当前代理及实例自动证书使用 `false`，仍校验 CA |
| `S3_ENDPOINT` / `S3_REGION` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` / `S3_FORCE_PATH_STYLE` / `S3_BUCKET` | 沿用现有 MinIO 配置；端点必须包含 `https://` 或 `http://` |
| `INITIAL_ADMIN_PASSWORD` | 仅首次空库初始化使用；既有用户不会被改写 |
| `PORT` | Railway 自动注入，不从本机复制 |

部署的是同一个 Node 服务：它提供前端、API、私有文件跳转和 MCP，不需要另建 Vite 服务或持久卷。简历文件存储于 MinIO，业务记录位于 MySQL。健康检查只确认服务已完成启动，不替代持续监控。

若部署时报错：

- `Missing server environment variable`：检查 Variables 是否导入齐全、变量名是否与 `.env.example` 一致。
- 数据库连接失败：确认服务与数据库的项目/环境一致，私网主机配 3306，公网代理主机配代理端口。
- `请求来源不匹配`：确认访问域名与 `PUBLIC_ORIGIN` 完全一致。
- MCP 返回主机校验错误：检查 `PUBLIC_ORIGIN` 与访问域名一致。
- HTTPS 下登录后返回登录页：确认 `NODE_ENV=production`、`COOKIE_SECURE=true`，用生成的 HTTPS 域名访问。

参考：[Railway 配置文件](https://docs.railway.com/config-as-code)、[Railpack Node 版本](https://railpack.com/languages/node)、[Railway 引用变量](https://docs.railway.com/variables)。
