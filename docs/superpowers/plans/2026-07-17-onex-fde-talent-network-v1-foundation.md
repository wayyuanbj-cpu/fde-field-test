# OneX FDE 人才网络 V1.0 基础切片 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不破坏现有中英文公开测试的前提下，交付可灰度启用的 OneX FDE 人才网络基础切片：独立业务数据服务、公开人才目录、首页三入口、首批人才导入工具和独立部署能力。

**Architecture:** 新增 `fde_network` Python WSGI 服务并使用独立 SQLite 数据库，与现有匿名统计服务在进程、端口、数据库和 API 路径上隔离。公开页面继续采用原生 HTML/CSS/JavaScript，通过同源 `/api/network/` 读取经过字段投影的公开人才数据；首页入口和人才目录均受服务端灰度开关控制。

**Tech Stack:** Python 3.11+ 标准库、WSGI、SQLite、原生 JavaScript、HTML/CSS、Node.js 确定性测试、Playwright 浏览器验收、Nginx、systemd。

## Global Constraints

- 现有 `/`、`/en/`、公开题量、晋级、进度、分享卡和匿名统计不得回退。
- 公开测试继续显示“不是正式毕业、认证或真实项目能力结论”的固定边界。
- 新业务身份数据必须与 `fde_analytics` 匿名统计服务逻辑隔离，数据库不得复用。
- V1.0 中文首发，公开数据结构保留 `locale` 字段；本切片不实现英文人才网络页面。
- 不公开精确考试分数排行榜，不公开手机、邮箱、微信、真实姓名和未脱敏材料。
- 未认证人才必须显示“尚未完成 OneX 认证”，且不能出现平台认证徽章。
- 首页入口使用可配置开关；关闭人才网络时不得影响现有公开测试。
- 本切片不实现手机号验证码、入库考试、认证评分或企业匹配写入；这些能力分别进入后续账号与入库、人才资料、企业需求与运营子计划。
- 所有 Python 测试使用 Python 3.11+；本机固定验证运行时为 `/Users/yuanwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3`。
- 每个任务严格执行 RED → GREEN → REFACTOR，并在独立提交前运行该任务全部测试。

## V1.0 Plan Sequence

1. `2026-07-20-fde-training-commercialization.md`：优先交付主营收入入口、商业产品、招生申请、班期与 10 人容量约束。
2. 本计划：业务服务基础、公开人才目录、首页入口、首批导入和部署灰度。
3. 账号与入库子计划：手机号验证码适配层、授权、服务端题库、考试会话、计分、风险和冷却期。
4. 人才资料子计划：编辑、证据、完整度、预览、审核、本人确认、发布与下架。
5. 企业需求与运营子计划：需求验证、人工匹配、内部角色、统一 `/ops/`、通知和审计。
6. V1.1 子计划：认证任务、双人评审、随机答辩、徽章发放与公开验证。

---

### Task 1: 独立业务服务与版本化数据库

**Files:**
- Create: `backend/fde_network/__init__.py`
- Create: `backend/fde_network/db.py`
- Create: `backend/fde_network/app.py`
- Create: `backend/tests/test_network_db.py`
- Create: `backend/tests/test_network_api.py`

**Interfaces:**
- Produces: `fde_network.db.connect(db_path: str) -> sqlite3.Connection`
- Produces: `fde_network.db.initialize(conn: sqlite3.Connection) -> None`
- Produces: `fde_network.db.set_feature_flag(conn, key: str, enabled: bool, actor: str, now: datetime) -> dict`
- Produces: `fde_network.db.public_config(conn) -> dict[str, bool]`
- Produces: `fde_network.app.create_app(db_path: str, now_provider: Callable | None = None) -> WSGIApplication`
- Produces: `GET /api/network/health` and `GET /api/network/config`

- [ ] **Step 1: Write the failing database test**

```python
class NetworkDatabaseTests(unittest.TestCase):
    def test_initialize_creates_versioned_business_schema(self):
        conn = connect(self.temp.name)
        initialize(conn)
        names = {
            row[0]
            for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
        self.assertTrue({
            "schema_migrations",
            "feature_flags",
            "talent_profiles",
            "talent_tags",
            "audit_events",
        }.issubset(names))
        self.assertNotIn("events", names)
        self.assertEqual(public_config(conn), {
            "network_enabled": False,
            "talent_directory_enabled": False,
        })
```

- [ ] **Step 2: Run the database test and verify RED**

Run:

```bash
PYTHONPATH=backend /Users/yuanwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  -m unittest backend.tests.test_network_db.NetworkDatabaseTests.test_initialize_creates_versioned_business_schema -v
```

Expected: `ERROR` with `ModuleNotFoundError: No module named 'fde_network'`.

- [ ] **Step 3: Implement the minimal versioned schema**

`db.py` must use `PRAGMA foreign_keys=ON`, `journal_mode=WAL`, a single `SCHEMA_VERSION = 1`, and an idempotent transaction. The first migration creates exact-width public/profile fields rather than storing an opaque JSON blob:

```python
SCHEMA_VERSION = 1
DEFAULT_FLAGS = {
    "network_enabled": False,
    "talent_directory_enabled": False,
}

def connect(db_path):
    conn = sqlite3.connect(db_path, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA journal_mode=WAL")
    return conn

def initialize(conn):
    with conn:
        conn.executescript(MIGRATION_1_SQL)
        conn.execute(
            "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(1, ?)",
            (_iso(),),
        )
        for key, enabled in DEFAULT_FLAGS.items():
            conn.execute(
                "INSERT OR IGNORE INTO feature_flags(key, enabled, updated_at) VALUES(?,?,?)",
                (key, int(enabled), _iso()),
            )
```

`talent_profiles` must include `slug`, `display_name`, `real_name`, `headline`, `city`, `service_mode`, `availability`, `status`, `summary`, `not_fit`, `service_package`, `evidence_summary`, `public_authorized`, `published_at`, `updated_at`, and a constrained `locale` defaulting to `zh-CN`. `real_name` is never selected by public queries.

- [ ] **Step 4: Run the database test and verify GREEN**

Run the command from Step 2.

Expected: `Ran 1 test ... OK`.

- [ ] **Step 5: Write failing feature-flag and audit tests**

```python
def test_feature_flag_change_is_audited(self):
    conn = connect(self.temp.name)
    initialize(conn)
    changed = set_feature_flag(
        conn, "network_enabled", True, actor="owner:1", now=self.now
    )
    self.assertTrue(changed["enabled"])
    row = conn.execute(
        "SELECT action, actor, object_type, object_id FROM audit_events"
    ).fetchone()
    self.assertEqual(tuple(row), (
        "feature_flag.update", "owner:1", "feature_flag", "network_enabled"
    ))
```

- [ ] **Step 6: Run the feature-flag test and verify RED**

Expected: `ImportError` or `AttributeError` because `set_feature_flag` does not exist.

- [ ] **Step 7: Implement feature flags with append-only audit records**

`set_feature_flag` must reject unknown keys, write `before_json` and `after_json`, and never update an existing audit row. The audit payload must exclude secrets and private profile fields.

- [ ] **Step 8: Run all network database tests and verify GREEN**

```bash
PYTHONPATH=backend /Users/yuanwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  -m unittest backend.tests.test_network_db -v
```

Expected: all `test_network_db` tests pass.

- [ ] **Step 9: Write failing health/config API tests**

```python
def test_health_and_public_config(self):
    health = self.request("GET", "/api/network/health")
    self.assertEqual(health["status"], 200)
    self.assertEqual(health["json"], {"status": "ok", "service": "fde_network"})
    config = self.request("GET", "/api/network/config")
    self.assertEqual(config["status"], 200)
    self.assertEqual(config["json"]["features"], {
        "network_enabled": False,
        "talent_directory_enabled": False,
    })
    self.assertEqual(config["headers"]["Cache-Control"], "public, max-age=30")
```

- [ ] **Step 10: Run the API test and verify RED**

Expected: `ModuleNotFoundError` or missing `create_app`.

- [ ] **Step 11: Implement the WSGI app routes**

The app accepts only `GET` for health/config, returns JSON with UTF-8 and explicit `Content-Length`, caps unknown routes at `404`, and closes one database connection per request. Unexpected exceptions return `500` without stack traces or database paths.

- [ ] **Step 12: Run both Task 1 test modules and verify GREEN**

```bash
PYTHONPATH=backend /Users/yuanwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  -m unittest backend.tests.test_network_db backend.tests.test_network_api -v
```

Expected: all Task 1 tests pass.

- [ ] **Step 13: Commit Task 1**

```bash
git add backend/fde_network backend/tests/test_network_db.py backend/tests/test_network_api.py
git commit -m "feat: add isolated FDE network service foundation"
```

---

### Task 2: 公开人才投影与只读 API

**Files:**
- Create: `backend/fde_network/talents.py`
- Modify: `backend/fde_network/app.py`
- Modify: `backend/tests/test_network_db.py`
- Modify: `backend/tests/test_network_api.py`

**Interfaces:**
- Consumes: `connect`, `initialize`, `audit_events` from Task 1
- Produces: `save_profile(conn, payload: dict, actor: str, now: datetime) -> dict`
- Produces: `publish_profile(conn, profile_id: int, actor: str, now: datetime) -> dict`
- Produces: `list_public_profiles(conn, filters: dict) -> list[dict]`
- Produces: `get_public_profile(conn, slug: str) -> dict | None`
- Produces: `GET /api/network/public/talents` and `GET /api/network/public/talents/{slug}`

- [ ] **Step 1: Write failing publication-boundary tests**

```python
def test_public_projection_excludes_private_fields_and_unpublished_profiles(self):
    draft = save_profile(self.conn, PROFILE_PAYLOAD, actor="operator:1", now=self.now)
    self.assertEqual(list_public_profiles(self.conn, {}), [])
    publish_profile(self.conn, draft["id"], actor="operator:1", now=self.now)
    visible = list_public_profiles(self.conn, {})
    self.assertEqual(len(visible), 1)
    self.assertNotIn("real_name", visible[0])
    self.assertNotIn("phone", visible[0])
    self.assertNotIn("email", visible[0])
    self.assertEqual(visible[0]["certification_label"], "尚未完成 OneX 认证")
```

- [ ] **Step 2: Run the projection test and verify RED**

Expected: import failure because `fde_network.talents` does not exist.

- [ ] **Step 3: Implement strict public projection**

Define a fixed `PUBLIC_FIELDS` tuple and construct response dictionaries only from it. `publish_profile` must require `public_authorized=1`, a non-empty `evidence_summary`, and `status` in `member`, `cert_pending`, `certified`, `delivery`; `member` and `cert_pending` always return the unverified label and never return a badge object.

- [ ] **Step 4: Run the projection test and verify GREEN**

Expected: the new projection test passes.

- [ ] **Step 5: Write failing filter tests**

```python
def test_filters_use_allowlisted_status_tag_city_and_availability(self):
    results = list_public_profiles(self.conn, {
        "status": "member",
        "tag": "知识库",
        "city": "北京",
        "availability": "available",
    })
    self.assertEqual([item["slug"] for item in results], ["manufacturing-kb-fde"])
    with self.assertRaises(ValidationError):
        list_public_profiles(self.conn, {"sort": "score desc; drop table talent_profiles"})
```

- [ ] **Step 6: Implement allowlisted filters and stable ordering**

Use parameterized SQL only. Default order is `status` trust tier, non-empty evidence, `published_at DESC`, and `id ASC`; no score column or public score sort is introduced.

- [ ] **Step 7: Add failing public API tests**

Test disabled directory returns `404`, enabled directory returns `200`, a missing slug returns `404`, and private fields never appear in serialized JSON.

- [ ] **Step 8: Implement the two public talent routes**

Only serve routes when both `network_enabled` and `talent_directory_enabled` are true. List responses use `{ "items": [...], "filters": {...} }`; detail responses use `{ "talent": {...} }`; public responses use `Cache-Control: public, max-age=60`.

- [ ] **Step 9: Run Task 2 tests and the existing backend suite**

```bash
PYTHONPATH=backend /Users/yuanwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  -m unittest discover -s backend/tests -v
```

Expected: all old analytics/auth tests and all new network tests pass.

- [ ] **Step 10: Commit Task 2**

```bash
git add backend/fde_network backend/tests/test_network_db.py backend/tests/test_network_api.py
git commit -m "feat: expose privacy-safe public talent directory API"
```

---

### Task 3: 首批人才模板与幂等导入工具

**Files:**
- Create: `data/first-batch-talents.schema.json`
- Create: `data/first-batch-talents.example.json`
- Create: `backend/fde_network/import_talents.py`
- Create: `backend/tests/test_network_import.py`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `save_profile`, `publish_profile` from Task 2
- Produces: `validate_record(record: dict) -> dict`
- Produces: `import_records(conn, records: list[dict], actor: str, now: datetime) -> dict`
- Produces CLI: `python -m fde_network.import_talents --db PATH --input PATH --actor owner:1 --dry-run`

- [ ] **Step 1: Write failing validation and idempotency tests**

```python
def test_import_rejects_private_or_unapproved_public_data(self):
    record = dict(EXAMPLE_RECORD, public_authorized=False)
    with self.assertRaises(ValidationError):
        validate_record(record)

def test_import_is_idempotent_by_slug(self):
    first = import_records(self.conn, [EXAMPLE_RECORD], "owner:1", self.now)
    second = import_records(self.conn, [EXAMPLE_RECORD], "owner:1", self.now)
    self.assertEqual(first, {"created": 1, "updated": 0})
    self.assertEqual(second, {"created": 0, "updated": 1})
    self.assertEqual(
        self.conn.execute("SELECT COUNT(*) FROM talent_profiles").fetchone()[0], 1
    )
```

- [ ] **Step 2: Run the import tests and verify RED**

Expected: import failure because the module is missing.

- [ ] **Step 3: Define and implement the exact import contract**

The JSON schema requires `slug`, `display_name`, `real_name`, `headline`, `city`, `service_mode`, `availability`, `status`, `summary`, `not_fit`, `service_package`, `evidence_summary`, `tags`, `public_authorized`, and `locale`. Reject phone, email, ID number, client raw name, contract body, unredacted URL, and unknown keys. The example file contains only fictional demonstration data and is never auto-published in production.

- [ ] **Step 4: Implement dry-run and transactional import**

`--dry-run` validates and prints counts without writing. Normal import performs all records in one transaction, audits create/update actions, and leaves publication disabled unless `--publish` is explicitly supplied and every record passes publication rules.

- [ ] **Step 5: Run import tests and verify GREEN**

```bash
PYTHONPATH=backend /Users/yuanwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  -m unittest backend.tests.test_network_import -v
```

Expected: all import tests pass.

- [ ] **Step 6: Protect real first-batch data from Git**

Add `data/first-batch-talents.local.json` to `.gitignore`. Run `git check-ignore -v data/first-batch-talents.local.json` and expect the new ignore rule.

- [ ] **Step 7: Commit Task 3**

```bash
git add .gitignore data/first-batch-talents.schema.json data/first-batch-talents.example.json \
  backend/fde_network/import_talents.py backend/tests/test_network_import.py
git commit -m "feat: add safe first-batch talent import workflow"
```

---

### Task 4: 首页三入口与公开人才目录页面

> **Required sub-skill:** Use `design-taste-frontend` before editing public UI files.

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Create: `network-entry.js`
- Create: `become-fde/index.html`
- Create: `talent/apply/index.html`
- Create: `enterprise/index.html`
- Create: `talents/index.html`
- Create: `talents/talents.css`
- Create: `talents/talents.js`
- Create: `tests/fde-talent-network.test.mjs`
- Modify: `tests/fde-regression.test.mjs`

**Interfaces:**
- Consumes: `GET /api/network/config` and `GET /api/network/public/talents`
- Produces: `loadNetworkConfig(fetchImpl) -> Promise<FeatureConfig>`
- Produces: `normalizeFilters(searchParams) -> TalentFilters`
- Produces: `renderTalentCard(talent) -> HTMLElement`
- Produces: the exact public routes `/become-fde/`, `/talent/apply/`, `/enterprise/`, `/talents/`

- [ ] **Step 1: Write failing deterministic DOM/content tests**

```javascript
assert.match(homeHtml, /我想成为 FDE/);
assert.match(homeHtml, /我是 FDE/);
assert.match(homeHtml, /我需要 FDE/);
assert.match(homeHtml, /人才库成员不等于 OneX 认证 FDE/);
assert.equal(normalizeFilters(new URLSearchParams('status=member&city=北京')), {
  status: 'member', city: '北京', tag: '', availability: ''
});
```

- [ ] **Step 2: Run the new Node test and verify RED**

```bash
node tests/fde-talent-network.test.mjs
```

Expected: failure because the three entry cards and talent module do not exist.

- [ ] **Step 3: Add the homepage three-entry section behind the config switch**

The section is hidden before config resolves. `network-entry.js` fetches `/api/network/config`; when `network_enabled` is true it removes `hidden`, otherwise it leaves the existing page unchanged. The cards use the exact PRD titles, audience copy, primary actions, and visible boundary text. Fetch failure must fail closed without console errors.

- [ ] **Step 4: Build the three landing pages with fixed boundaries**

`/become-fde/` explains public challenge → training → admission → certification. `/talent/apply/` states that admission is invite-only during gray release and never equates public-test results with admission. `/enterprise/` links to the talent directory and labels structured need submission as the next V1.0 slice, without a nonfunctional fake form.

- [ ] **Step 5: Build the talent directory UI**

The page fetches only the public API, shows status/tag/city/availability filters, renders evidence and service-package summaries, and gives `member`/`cert_pending` cards a persistent “尚未完成 OneX 认证” label. Empty, loading, API-disabled, and recoverable-error states all have visible text and retry behavior.

- [ ] **Step 6: Run the deterministic test and verify GREEN**

```bash
node tests/fde-talent-network.test.mjs
node tests/fde-regression.test.mjs
```

Expected: both tests pass.

- [ ] **Step 7: Run every deterministic frontend test**

```bash
for test in tests/*.test.mjs; do node "$test"; done
```

Expected: all deterministic frontend tests pass with no warnings.

- [ ] **Step 8: Commit Task 4**

```bash
git add index.html styles.css network-entry.js become-fde talent enterprise talents \
  tests/fde-talent-network.test.mjs tests/fde-regression.test.mjs
git commit -m "feat: add FDE talent network entry and directory UI"
```

---

### Task 5: 浏览器、移动端、隐私与回归验收

**Files:**
- Create: `tests/fde-talent-network-browser.mjs`
- Modify: `robots.txt`
- Modify: `sitemap.xml`
- Modify: `llms.txt`

**Interfaces:**
- Consumes: Task 4 public routes and Task 2 public API schema
- Produces: browser proof for desktop `1440×1000` and mobile `390×844`

- [ ] **Step 1: Write the failing Playwright route test**

The test stubs `/api/network/config` with enabled flags and `/api/network/public/talents` with one `member` fixture. It asserts the three homepage cards, directory card, unverified label, filter interaction, keyboard focus, and no horizontal overflow at 390 px.

- [ ] **Step 2: Run the browser test and verify RED**

```bash
FDE_TEST_URL=http://127.0.0.1:4173/ NODE_PATH="$NODE_PATH" \
  node tests/fde-talent-network-browser.mjs
```

Expected: failure on the first missing route, selector, or overflow assertion.

- [ ] **Step 3: Make the smallest UI/accessibility fixes required by the test**

Use semantic links/buttons, visible focus, correctly associated labels, `aria-live` for load states, and CSS that keeps every page within `document.documentElement.scrollWidth <= window.innerWidth` at 390 px.

- [ ] **Step 4: Update public discovery controls**

Add `/become-fde/`, `/enterprise/`, and `/talents/` to `sitemap.xml`; keep `/talent/apply/`, `/account/`, `/ops/`, `/api/`, and private materials excluded or `noindex`. `llms.txt` may describe public directory boundaries but must not imply platform certification for unverified members.

- [ ] **Step 5: Run browser and discovery regression tests**

```bash
FDE_TEST_URL=http://127.0.0.1:4173/ NODE_PATH="$NODE_PATH" \
  node tests/fde-talent-network-browser.mjs
node tests/fde-seo-geo.test.mjs
```

Expected: both tests pass.

- [ ] **Step 6: Commit Task 5**

```bash
git add tests/fde-talent-network-browser.mjs robots.txt sitemap.xml llms.txt \
  index.html styles.css network-entry.js become-fde talent enterprise talents
git commit -m "test: verify FDE talent network public experience"
```

---

### Task 6: 独立部署、灰度开关与回滚

**Files:**
- Create: `deploy/fde-network.service`
- Modify: `deploy/fde.onex.plus.nginx.conf`
- Modify: `deploy/fde.onex.plus.acme.nginx.conf`
- Modify: `deploy/install-or-update.sh`
- Create: `tests/fde-network-deploy.test.mjs`
- Modify: `README.md`

**Interfaces:**
- Produces: systemd service on `127.0.0.1:8766`
- Produces: independent database `/var/lib/fde-network/network.db`
- Produces: same-origin proxy `/api/network/`
- Produces: rollback switch `network_enabled=false`

- [ ] **Step 1: Write failing deployment contract tests**

```javascript
assert.match(service, /FDE_NETWORK_DB=\/var\/lib\/fde-network\/network\.db/);
assert.match(service, /FDE_NETWORK_PORT=8766/);
assert.match(nginx, /location \^~ \/api\/network\//);
assert.match(nginx, /proxy_pass http:\/\/127\.0\.0\.1:8766/);
assert.match(install, /fde-network\.service/);
assert.match(install, /\/var\/lib\/fde-network/);
```

- [ ] **Step 2: Run the deployment test and verify RED**

```bash
node tests/fde-network-deploy.test.mjs
```

Expected: failure because the service and proxy are absent.

- [ ] **Step 3: Add the hardened systemd service**

Mirror the analytics service hardening, but use a distinct user-writable directory, `PYTHONDONTWRITEBYTECODE=1`, `FDE_NETWORK_HOST=127.0.0.1`, `FDE_NETWORK_PORT=8766`, and `ExecStart=/usr/bin/python3 -m fde_network.app`. Do not grant write access to the analytics database or web root.

- [ ] **Step 4: Add Nginx proxy and rate/body guards**

Proxy `/api/network/` to `8766`, set `client_max_body_size 32k` for this foundation slice, use `Cache-Control: no-store` by default, and allow only the public config/talent endpoints to emit their application-defined public cache headers. Keep `/stats/` unchanged.

- [ ] **Step 5: Extend install/update with idempotent initialization and health check**

Create `/var/lib/fde-network` mode `0750`, initialize the schema before restart, install/enable/restart `fde-network.service`, run `nginx -t`, and require `curl http://127.0.0.1:8766/api/network/health` before printing success. Existing analytics bootstrap and health checks remain intact.

- [ ] **Step 6: Document local run, feature flag, import and rollback commands**

README commands must include Python 3.11+, local `FDE_NETWORK_DB`, dry-run import, enabling both flags through the management command, and rollback by disabling `network_enabled` without changing public-test files.

- [ ] **Step 7: Run deployment contract and shell checks**

```bash
node tests/fde-network-deploy.test.mjs
bash -n deploy/install-or-update.sh deploy/configure-xray-sni.sh
```

Expected: deployment test passes and both shell files parse with exit code `0`.

- [ ] **Step 8: Run the complete local verification suite**

```bash
for test in tests/*.test.mjs; do node "$test"; done
PYTHONPATH=backend /Users/yuanwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  -m unittest discover -s backend/tests -v
git diff --check
```

Expected: all deterministic frontend tests pass; all backend tests pass; `git diff --check` prints no output.

- [ ] **Step 9: Commit Task 6**

```bash
git add deploy backend/fde_network tests/fde-network-deploy.test.mjs README.md
git commit -m "feat: deploy isolated FDE talent network service"
```

---

## Completion Gate

- [ ] Review every V1.0 foundation requirement in this plan against the PRD.
- [ ] Confirm no public response contains `real_name`, phone, email, WeChat, ID number, raw client name, private file path, answer, risk detail, or audit details.
- [ ] Confirm `network_enabled=false` leaves the current public test unchanged.
- [ ] Confirm `network_enabled=true` and `talent_directory_enabled=true` expose only approved profiles.
- [ ] Confirm the exact unverified-member boundary appears on homepage, directory cards, directory detail and apply page.
- [ ] Confirm existing English public test and `/stats/` tests remain green.
- [ ] Run `git status --short`, `git log --oneline --decorate -8`, and the full verification commands immediately before completion claims.
