# OneX FDE Field Test

面向 FDE（Field Deployment Engineer）候选人、从业者与对企业 AI 交付感兴趣的参与者，提供中英文公开能力挑战与 FDE 参考指南。

## 公开路由

- `/`：中文 FDE 潜质测试与三级挑战
- `/en/`：完整英文镜像，包含同样的 12 / 100 / 60 / 40 题与晋级规则
- `/fde-guide/`：中文 FDE 定义、职责、五维能力模型、角色对比与评估方法
- `/en/fde-guide/`：独立撰写的英文 FDE 参考页
- `/fde-training/`：OneX FDE 小班实战培训招生页，每班最多 10 人
- `/talents/`：企业找 FDE 优先的公开人才目录，可按状态、城市、能力标签和档期筛选
- `/talents/<slug>/`：每位已授权、已发布工程师的独立公开主页
- `/robots.txt`、`/sitemap.xml`、`/llms.txt`：搜索与 AI 发现入口
- `/stats/`：需账号登录的中文私有统计后台

## 测评结构

- 12 道企业情境题，约 8 分钟生成 FDE 潜质侧写
- 初级 / Foundation：100 道完整题（60 单选、30 多选、10 判断，含 10 道关键题），随机模拟 50 题
- 中级 / Delivery：60 道完整题（48 单选、12 多选，含 8 道关键题），随机模拟 30 题
- 高级 / Command：40 道完整题（30 单选、10 多选，含 6 道关键题），随机模拟 20 题
- 三级不可跳级；只有完整挑战可以晋级，随机模拟只用于练习
- 晋级严格分不低于 85、每个模块严格分不低于 70、关键题零错题且答题可信度不能为“需要独立复测”
- 多选题明确标识。能力分会对只选中部分正确项给出诊断性分值，同时扣除误选；晋级严格分仍按完全匹配计分，少选、错选或多选均不得分
- 题目顺序和选项顺序每次新挑战都会随机，刷新后保留当前进度和本次随机顺序
- 支持分模块诊断、错题解析、进度自动保存和选填署名分享卡
- 中英文题库共用同一 ID、题型、模块、答案索引、评分与晋级逻辑；英文文案经独立编辑，不是逐句机翻

## 答题可信度与评分边界

结果页同时展示两个口径：

- **能力分**：用于更细地呈现当前能力，多选题可获得经过误选扣减的部分诊断分
- **晋级严格分**：用于解锁下一等级，所有题都要求完全答对，并受模块线、关键题和可信度共同约束

站点只在当前考试区域记录复制/粘贴尝试、页面切换、离开时长、答题速度和总用时等有限信号，并将其保存在本机续答状态中。速度信号采用合并上限，单凭答得快不会被判为最低可信度；只有多个独立风险信号叠加才会阻断晋级。中文和英文都使用中性复测提示，不把低可信结果直接表述为作弊。

统计接口只接收 `trusted` / `review` / `low` 可信度档位和粗粒度整数桶，不接收答案、题目 ID、姓名或原始时间戳。第 3 版考试与晋级状态不兼容旧版缓存，升级后会从新挑战开始。

这是一套无需账号的公开传播型能力挑战。静态网页不能证明参与者没有使用第二台设备、截图识图或人工协助，因此可信度只能改善结果解释，不能替代监考、身份核验和正式认证。题库通过结构化低诱导检查；上线后的区分度仍应通过至少 20 人盲测校准，不能只根据当前分数线判断题目质量。

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

统计客户端只上报白名单事件、匿名 visitor/session ID、设备类型、语言版本、归一化来源，以及完成挑战时的粗粒度可信度桶。AI 来源仅记录 `chatgpt`、`perplexity`、`copilot`、`claude` 或 `gemini` 分类，不保存完整 referrer、搜索词、姓名、答案、题目 ID、原始时间戳、原始 IP 或完整 User-Agent。

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

## FDE 培训商业化服务

培训产品固定编号为 `FDE-TRAINING-SMALL-CLASS`，采用“先申请、后审核、再确认班期”的小班模式。无需预先配置具体开班日期或在线支付，任何班期的容量都不得超过 10 人。招生申请、缴费、培训结业、人才库录入、正式认证和徽章是分离的业务状态。

本地启动需要 Python 3.11+：

```bash
PYTHONPATH=backend FDE_COMMERCIAL_DB=/tmp/fde-commercial.db python3 -m fde_commercial.app
```

服务只监听 `127.0.0.1:8767`，网站通过同源 `/api/commercial/` 代理。可使用以下虚构资料做幂等申请验收：

```bash
curl -i http://127.0.0.1:8767/api/commercial/public/training-applications \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: fictional-smoke-001' \
  --data '{"product_code":"FDE-TRAINING-SMALL-CLASS","offer_id":"fde-small-class-open-application","name":"测试申请人","mobile":"13800000000","wechat":"","current_role":"产品经理","ai_experience":"practitioner","fde_experience":"参与过企业数字化项目","learning_goal":"建立完整企业 AI 交付能力","time_commitment":"每周 10 小时","source":"direct","consent_version":"training-application-v1","_company":""}'
```

招生运营命令默认遮蔽姓名和手机号；查看完整私密信息必须显式填写审计操作人：

```bash
PYTHONPATH=backend FDE_COMMERCIAL_DB=/tmp/fde-commercial.db \
  python -m fde_commercial.manage list-applications
PYTHONPATH=backend FDE_COMMERCIAL_DB=/tmp/fde-commercial.db \
  python -m fde_commercial.manage list-applications --show-private --actor auditor:1
PYTHONPATH=backend FDE_COMMERCIAL_DB=/tmp/fde-commercial.db \
  python -m fde_commercial.manage create-cohort --name '首期' --capacity 10 --actor owner:1
PYTHONPATH=backend FDE_COMMERCIAL_DB=/tmp/fde-commercial.db \
  python -m fde_commercial.manage set-offer-status --status paused --actor owner:1
```

Outbox 是本地事务记录，可调用 `fde_commercial.outbox.dispatch_pending` 与明确的 adapter 同步。默认 `LocalCommercialAdapter` 只返回本地引用；未配置外部 CRM、合同、支付或企业管理系统连接器，不应声称已完成这些集成。

如需立即回滚招生入口，应先执行上面的 `set-offer-status --status paused` 完成可审计的暂停招生，再回滚页面或服务版本。这样不会删除已有申请、审计和 outbox 记录。

## FDE 人才网络服务

人才网络使用独立 SQLite 数据库和 `127.0.0.1:8766`，不与匿名统计或招生商业库混用。本地启动需要 Python 3.11+：

人才卡片与独立主页只读取 `fde_network` 的公开字段投影。工程师主页使用稳定 `slug` URL，不公开真实姓名、联系方式、客户机密或精确考试分数；企业合作先进入 OneX 统一需求入口。

```bash
PYTHONPATH=backend FDE_NETWORK_DB=/tmp/fde-network.db python3 -m fde_network.app
```

首批真实资料使用已被 Git 忽略的 `data/first-batch-talents.local.json`。先验证，再显式决定是否发布：

每条导入记录必须分别填写 `certification_status` (`not_certified|pending|certified`) 和 `delivery_status` (`unverified|verified`)。`status` 仅用于目录展示和筛选，不能授予认证徽章；交付核验也不会自动转为 OneX 认证。服务首次启动时会将旧库安全迁移到 schema v2：旧 `certified` 状态回填认证，旧 `delivery` 状态只回填交付核验。

```bash
PYTHONPATH=backend python3 -m fde_network.import_talents --db /tmp/fde-network.db \
  --input data/first-batch-talents.local.json --actor owner:1 --dry-run
PYTHONPATH=backend python3 -m fde_network.import_talents --db /tmp/fde-network.db \
  --input data/first-batch-talents.local.json --actor owner:1 --publish
```

两个灰度开关默认都是关闭的。完成资料审核后才依次开启：

```bash
PYTHONPATH=backend FDE_NETWORK_DB=/tmp/fde-network.db \
  python3 -m fde_network.manage set-flag network_enabled true --actor owner:1
PYTHONPATH=backend FDE_NETWORK_DB=/tmp/fde-network.db \
  python3 -m fde_network.manage set-flag talent_directory_enabled true --actor owner:1
```

回滚时只关闭总开关，不删除档案，也不修改公开测试文件：

```bash
PYTHONPATH=backend FDE_NETWORK_DB=/tmp/fde-network.db \
  python3 -m fde_network.manage set-flag network_enabled false --actor owner:1
```

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
