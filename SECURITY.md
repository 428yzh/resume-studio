# SECURITY.md

## 安全策略

### P0 — 已实施（必须）

- [x] `.gitignore` 排除敏感文件（.env、__pycache__、node_modules、venv）
- [x] 文件上传大小限制（< 10MB）
- [x] 文件类型白名单（仅允许 .pdf, .txt, .json）
- [x] API Key 不硬编码，通过环境变量读取
- [x] CORS 配置白名单

### P1 — 待实施（上线前）

- [ ] 用户认证与会话管理（JWT）
- [ ] 输入校验（XSS 防护）
- [ ] Rate limiting
- [ ] SQL 注入防护（SQLAlchemy 参数化查询已默认）
- [ ] Helmet.js 安全头

### P2 — 待评估

- [ ] HTTPS 强制跳转
- [ ] Content Security Policy
- [ ] 数据备份策略
- [ ] 日志脱敏

### API Key 管理

- DeepSeek API Key 通过 `DEEPSEEK_API_KEY` 环境变量注入
- 前端不存储 API Key，所有 AI 请求通过后端代理转发
- 开发环境使用 `.env` 文件（已加入 .gitignore）

### 文件上传安全

- 上传文件类型校验（服务端 MIME 检测）
- 上传目录隔离
- 文件名随机化防路径遍历
