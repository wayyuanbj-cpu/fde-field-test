# OneX FDE Field Test

面向 FDE（Field Deployment Engineer）候选人、从业者与对企业 AI 交付感兴趣的参与者，提供中英文公开能力挑战与 FDE 参考指南。

## 公开路由

- `/`：中文 FDE 潜质测试与三级挑战
- `/en/`：完整英文镜像，包含同样的 12 / 100 / 60 / 40 题与晋级规则
- `/fde-guide/`：中文 FDE 定义、职责、五维能力模型、角色对比与评估方法
- `/en/fde-guide/`：独立撰写的英文 FDE 参考页
- `/robots.txt`、`/sitemap.xml`、`/llms.txt`：搜索与 AI 发现入口
- `/stats/`：需账号登录的中文私有统计后台

## 测评结构

- 12 道企业情境题，约 8 分钟生成 FDE 潜质侧写
- 初级 / Foundation：100 道完整题，随机模拟 50 题
- 中级 / Delivery：60 道完整题，随机模拟 30 题
- 高级 / Command：40 道完整题，随机模拟 20 题
- 三级不可跳级：完整挑战总分不低于 85，且每个模块不低于 70，才解锁下一级
- 多选题明确标识；少选、多选、错选均为 0 分；随机模拟不解锁等级
- 支持分模块诊断、错题解析、进度自动保存和选填署名分享卡
- 中英文题库共用同一 ID、题型、模块、答案索引、评分与晋级逻辑；英文文案经独立编辑，不是逐句机翻

## SEO 与 GEO

四个公开 HTML 页面都包含：

- 本地化 title、description、canonical、Open Graph 与 Twitter Card
- `zh-CN` / `en` / `x-default` 双向 `hreflang`
- 与可见内容一致的 `Organization`、`WebSite` 或 `TechArticle` JSON-LD
- 1200×630 中英文社交分享图
- 答案优先的定义、职责、角色对比、评估方法与结果边界

`robots.txt` 允许 Googlebot、bingbot、OAI-SearchBot、PerplexityBot、Claude-SearchBot 和 Claude-User 读取公开内容，但排除 `/api/` 与 `/stats/`。与模型训练或模型改进相关的 GPTBot、ClaudeBot 和 Google-Extended 默认禁止。`llms.txt` 只是补充索引，公开 HTML 始终是内容事实源。

GEO 只提高搜索、检索、引用和回答生成的可理解性与候选资格，不保证收录、排名、推荐或引用。

## 匿名统计与隐私

统计客户端只上报白名单事件、匿名 visitor/session ID、设备类型、语言版本和归一化来源。AI 来源仅记录 `chatgpt`、`perplexity`、`copilot`、`claude` 或 `gemini` 分类，不保存完整 referrer、搜索词、姓名、答案、原始 IP 或完整 User-Agent。

后端使用 SQLite 保存日级聚合和有限保留期的原始匿名事件。Owner 可管理内部账号，Analyst 只读；不开放公众注册，首次登录必须改密。

## 本地运行与测试

静态站无构建步骤：

```bash
python3 -m http.server 4173
```

然后访问 `http://127.0.0.1:4173/`。

执行确定性测试和后端测试：

```bash
for test in tests/*.test.mjs; do node "$test"; done
PYTHONPATH=backend python3 -m unittest discover -s backend/tests -v
```

需要 Playwright 的浏览器验收脚本：

```bash
FDE_TEST_URL=http://127.0.0.1:4173/ NODE_PATH=/path/to/node_modules node tests/fde-progression-browser.mjs
FDE_TEST_URL=http://127.0.0.1:4173/ NODE_PATH=/path/to/node_modules node tests/fde-english-browser.mjs
FDE_TEST_URL=http://127.0.0.1:4173/ NODE_PATH=/path/to/node_modules node tests/fde-stats-browser.mjs
```

统计后端需要支持 scrypt 的 Python 3.11+：

```bash
PYTHONPATH=backend FDE_ANALYTICS_DB=/tmp/fde-analytics.db python3 -m fde_analytics.app
```

服务默认只监听 `127.0.0.1:8765`，生产环境通过 Nginx 同源代理。

## 服务器发布

OneX ECS 从 GitHub `main` 部署：

```bash
sudo bash deploy/install-or-update.sh
```

脚本会下载 GitHub 主分支归档、同步公开文件、升级统计数据库、校验 Nginx，并为 `fde.onex.plus` 申请或续用 HTTPS 证书。Nginx 以精确路由提供 robots、sitemap、llms 和 IndexNow key，缺失时返回 404，不回退到首页 HTML。

ECS 的 443 端口同时承载 Xray。部署脚本使用 Nginx SNI 预读将 `fde.onex.plus` 分流到网站，其余 TLS 流量继续转发给 Xray。

## 站长平台手工操作

部署后仍需在已完成域名所有权验证的账号中执行：

1. Google Search Console：添加 `https://fde.onex.plus/` 资产，提交 `https://fde.onex.plus/sitemap.xml`，分别检查四个 canonical URL。
2. Bing Webmaster Tools：导入或添加站点，提交同一 sitemap，检查 IndexNow 通知与抓取状态。
3. 不在未登录账号的情况下声称已完成站长平台所有权或 URL 提交。

## 产品边界与权利声明

本站是用于传播的 FDE 公开能力挑战，不是正式毕业认证。线上结果不代表正式毕业、认证或真实项目能力结论。

基于 OneX FDE 考核培训体系。

版权所有 © 2026 OneX AI 社区。保留所有权利。
