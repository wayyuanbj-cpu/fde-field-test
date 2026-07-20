# OneX FDE 小班培训商业化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付可直接接入 OneX 商业化架构的 FDE 小班培训招生系统，包含标准产品、招生申请、商业机会、班期与入班数据契约，以及可实际提交申请的 `/fde-training/` 页面。

**Architecture:** 新增独立 `fde_commercial` Python WSGI 服务和独立 SQLite 数据库，保存含个人信息的招生与商业数据；匿名统计继续由 `fde_analytics` 处理，两者不得共享个人字段。商业服务通过 `CommercialAdapter` 和事务性 outbox 连接未来 CRM、合同、支付或财务系统；没有外部服务时使用本地适配器并明确保持 `local` 状态。

**Tech Stack:** Python 3.11+ 标准库、WSGI、SQLite、原生 HTML/CSS/JavaScript、Node.js 确定性测试、Playwright、Nginx、systemd。

## Global Constraints

- FDE 培训产品编码固定为 `FDE-TRAINING-SMALL-CLASS`。
- 培训采用申请制，每个班期容量不得超过 10 人。
- 首期不依赖具体开班日期，`starts_at` 和 `ends_at` 允许为空。
- 首期不以在线支付为上线前置条件；合同、付款只保存外部编号与核验状态。
- 报名、付款、培训完成、人才入库、综合认证和徽章必须分开保存、分开展示。
- 姓名、手机号、微信和申请正文不得写入匿名分析事件。
- 商业私密数据使用独立数据库，不写入 `fde_analytics` 或公开人才目录数据库。
- 外部 CRM、合同或支付不可用时，申请必须先可靠保存在本地，再通过 outbox 重试同步。
- 公共接口不返回内部备注、负责人、报价、合同编号、付款编号或完整手机号。
- 所有写接口具备输入校验、幂等、长度限制、蜜罐字段和审计记录。
- 所有 Python 测试使用 `/Users/yuanwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3`。
- 严格执行 RED → GREEN → REFACTOR；每个任务独立提交。

---

### Task 1: 商业服务骨架与版本化数据库

**Files:**
- Create: `backend/fde_commercial/__init__.py`
- Create: `backend/fde_commercial/db.py`
- Create: `backend/tests/test_commercial_db.py`

**Interfaces:**
- Produces: `fde_commercial.db.connect(db_path: str) -> sqlite3.Connection`
- Produces: `fde_commercial.db.initialize(conn: sqlite3.Connection, now: datetime | None = None) -> None`
- Produces: `fde_commercial.db.get_product_by_code(conn, code: str) -> dict | None`
- Produces tables: `schema_migrations`, `commercial_products`, `commercial_offers`, `training_applications`, `commercial_opportunities`, `training_cohorts`, `training_enrollments`, `commercial_audit_events`, `commercial_outbox`

- [ ] **Step 1: Write the failing schema-isolation test**

```python
class CommercialDatabaseTests(unittest.TestCase):
    def test_initialize_creates_isolated_versioned_commercial_schema(self):
        conn = connect(self.temp.name)
        initialize(conn, self.now)
        tables = {
            row[0]
            for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
        self.assertTrue({
            "schema_migrations", "commercial_products", "commercial_offers",
            "training_applications", "commercial_opportunities", "training_cohorts",
            "training_enrollments", "commercial_audit_events", "commercial_outbox",
        }.issubset(tables))
        self.assertNotIn("events", tables)
        self.assertNotIn("talent_profiles", tables)
```

- [ ] **Step 2: Run the test and verify RED**

```bash
PYTHONPATH=backend /Users/yuanwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  -m unittest backend.tests.test_commercial_db.CommercialDatabaseTests.test_initialize_creates_isolated_versioned_commercial_schema -v
```

Expected: `ModuleNotFoundError: No module named 'fde_commercial'`.

- [ ] **Step 3: Implement connection and migration 1**

`db.py` must set `foreign_keys=ON`, `journal_mode=WAL`, `busy_timeout=10000`, and use one idempotent transaction. Every mutable business table has `created_at` and `updated_at`; status fields use `CHECK` constraints copied from the approved design.

```python
SCHEMA_VERSION = 1

def connect(db_path):
    conn = sqlite3.connect(db_path, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=10000")
    return conn

def initialize(conn, now=None):
    stamp = _iso(now)
    with conn:
        conn.executescript(MIGRATION_1_SQL)
        conn.execute(
            "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(?,?)",
            (SCHEMA_VERSION, stamp),
        )
```

- [ ] **Step 4: Run the schema test and verify GREEN**

Expected: `Ran 1 test ... OK`.

- [ ] **Step 5: Write the failing FDE product seed test**

```python
def test_initialize_seeds_small_class_product_and_open_offer(self):
    conn = connect(self.temp.name)
    initialize(conn, self.now)
    product = get_product_by_code(conn, "FDE-TRAINING-SMALL-CLASS")
    self.assertEqual(product["name"], "OneX FDE 小班实战培训")
    self.assertEqual(product["type"], "training")
    self.assertEqual(product["capacity_per_cohort"], 10)
    self.assertEqual(product["application_mode"], "review_required")
    offer = conn.execute("SELECT * FROM commercial_offers").fetchone()
    self.assertEqual(offer["status"], "open")
    self.assertIsNone(offer["starts_at"])
    self.assertIsNone(offer["ends_at"])
```

- [ ] **Step 6: Run the seed test and verify RED**

Expected: `TypeError` or `AssertionError` because the product/offer seed is absent.

- [ ] **Step 7: Implement immutable product code and idempotent seed**

Seed exact values from the approved spec. Re-running `initialize` updates neither operator-edited product copy nor offer status; only missing seed rows are inserted. Product code and offer code are unique.

- [ ] **Step 8: Add failing audit/outbox append-only tests**

```python
def test_audit_and_outbox_are_append_only(self):
    audit_id = append_audit(
        self.conn, actor="system", action="product.seed",
        object_type="commercial_product", object_id="FDE-TRAINING-SMALL-CLASS",
        before=None, after={"status": "active"}, now=self.now,
    )
    outbox_id = enqueue_outbox(
        self.conn, topic="commercial.product.synced",
        object_type="commercial_product", object_id="FDE-TRAINING-SMALL-CLASS",
        payload={"code": "FDE-TRAINING-SMALL-CLASS"}, now=self.now,
    )
    self.assertGreater(audit_id, 0)
    self.assertGreater(outbox_id, 0)
    with self.assertRaises(sqlite3.IntegrityError):
        self.conn.execute("UPDATE commercial_audit_events SET action='changed'")
```

- [ ] **Step 9: Implement append-only triggers and secret-key rejection**

Audit/outbox helpers reject dictionary keys containing `password`, `token`, `csrf`, `raw_ip`, `full_user_agent`, `id_number`, or `answer`. SQLite triggers abort `UPDATE` and `DELETE` on `commercial_audit_events`.

- [ ] **Step 10: Run all Task 1 tests and existing backend tests**

```bash
PYTHONPATH=backend /Users/yuanwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  -m unittest discover -s backend/tests -v
```

Expected: all commercial and existing analytics/auth tests pass.

- [ ] **Step 11: Commit Task 1**

```bash
git add backend/fde_commercial backend/tests/test_commercial_db.py
git commit -m "feat: add FDE commercial service data foundation"
```

---

### Task 2: 公开产品接口与幂等招生申请

**Files:**
- Create: `backend/fde_commercial/applications.py`
- Create: `backend/fde_commercial/app.py`
- Create: `backend/tests/test_commercial_applications.py`
- Create: `backend/tests/test_commercial_api.py`

**Interfaces:**
- Consumes: Task 1 database, audit and outbox helpers
- Produces: `public_product(conn, code: str) -> dict | None`
- Produces: `create_application(conn, payload: dict, idempotency_key: str, now: datetime) -> dict`
- Produces: `find_active_application_by_mobile(conn, product_id: int, mobile: str) -> dict | None`
- Produces: `create_app(db_path: str, now_provider: Callable | None = None) -> WSGIApplication`
- Produces: `GET /api/commercial/health`
- Produces: `GET /api/commercial/public/products/FDE-TRAINING-SMALL-CLASS`
- Produces: `POST /api/commercial/public/training-applications`

- [ ] **Step 1: Write the failing public-product projection test**

```python
def test_public_product_returns_only_sellable_copy(self):
    item = public_product(self.conn, "FDE-TRAINING-SMALL-CLASS")
    self.assertEqual(item, {
        "code": "FDE-TRAINING-SMALL-CLASS",
        "name": "OneX FDE 小班实战培训",
        "capacity_per_cohort": 10,
        "application_status": "open",
        "price_display": "沟通后确认",
        "public_path": "/fde-training/",
    })
```

- [ ] **Step 2: Run and verify RED**

Expected: import failure because `applications.py` is missing.

- [ ] **Step 3: Implement the strict public projection**

Construct a new dictionary from an explicit tuple of public fields. Never serialize rows with `dict(row)` on a public route. Product `paused`, `waitlist_only`, and `closed` map to explicit public application statuses.

- [ ] **Step 4: Write failing application validation tests**

```python
def test_create_application_validates_and_normalizes_fields(self):
    created = create_application(self.conn, VALID_PAYLOAD, "idem-001", self.now)
    self.assertRegex(created["public_id"], r"^FDE-A-[A-Z0-9]{10}$")
    self.assertEqual(created["status"], "submitted")
    row = self.conn.execute("SELECT * FROM training_applications").fetchone()
    self.assertEqual(row["mobile"], "13800138000")
    self.assertEqual(row["source"], "public_test")

def test_honeypot_unknown_fields_and_oversized_text_are_rejected(self):
    with self.assertRaises(ValidationError):
        create_application(self.conn, {**VALID_PAYLOAD, "company_website": "bot"}, "idem-2", self.now)
    with self.assertRaises(ValidationError):
        create_application(self.conn, {**VALID_PAYLOAD, "learning_goal": "x" * 2001}, "idem-3", self.now)
```

- [ ] **Step 5: Implement exact allowlists and normalization**

Allow only approved request fields plus an empty `_company` honeypot. Normalize Chinese mobile numbers to 11 digits, trim text, cap short fields at 120 characters and narrative fields at 2000 characters, and validate enums. Store `mobile_verification_status='pending'`; do not claim SMS verification in this slice.

- [ ] **Step 6: Write failing idempotency and duplicate-mobile tests**

```python
def test_same_idempotency_key_returns_same_application(self):
    first = create_application(self.conn, VALID_PAYLOAD, "same-key", self.now)
    second = create_application(self.conn, VALID_PAYLOAD, "same-key", self.now)
    self.assertEqual(first["public_id"], second["public_id"])
    self.assertEqual(self.conn.execute("SELECT COUNT(*) FROM training_applications").fetchone()[0], 1)

def test_second_active_application_for_same_mobile_is_rejected(self):
    create_application(self.conn, VALID_PAYLOAD, "first-key", self.now)
    with self.assertRaises(ExistingApplicationError):
        create_application(self.conn, VALID_PAYLOAD, "other-key", self.now)
```

- [ ] **Step 7: Implement idempotency and active-application uniqueness**

Hash idempotency keys before storage. A second request with the same key returns the original public response. A different key for the same product/mobile and a nonterminal application returns an `existing_application` result without exposing the original application contents.

- [ ] **Step 8: Add failing WSGI route tests**

Test health `200`, public product `200`, valid application `201`, repeated idempotent application `200`, missing idempotency header `400`, closed offer `409`, malformed JSON `400`, body over `32 KiB` `413`, and unknown path `404`.

- [ ] **Step 9: Implement the WSGI routes**

Every response has explicit JSON content type and length. Application success returns only `public_id`, `status`, `message`, and `next_step`; error responses do not contain Python exception text or database paths.

- [ ] **Step 10: Run Task 2 and full backend tests**

```bash
PYTHONPATH=backend /Users/yuanwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  -m unittest backend.tests.test_commercial_applications backend.tests.test_commercial_api -v
PYTHONPATH=backend /Users/yuanwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  -m unittest discover -s backend/tests -v
```

Expected: both commands pass.

- [ ] **Step 11: Commit Task 2**

```bash
git add backend/fde_commercial backend/tests/test_commercial_applications.py backend/tests/test_commercial_api.py
git commit -m "feat: accept idempotent FDE training applications"
```

---

### Task 3: 商业适配器与可靠同步队列

**Files:**
- Create: `backend/fde_commercial/adapters.py`
- Create: `backend/fde_commercial/outbox.py`
- Create: `backend/tests/test_commercial_outbox.py`

**Interfaces:**
- Produces: `CommercialAdapter.sync_lead(application: dict) -> str | None`
- Produces: `CommercialAdapter.sync_opportunity(opportunity: dict) -> str | None`
- Produces: `LocalCommercialAdapter`
- Produces: `dispatch_pending(conn, adapter: CommercialAdapter, now: datetime, limit: int = 50) -> dict`

- [ ] **Step 1: Write failing adapter-contract tests**

```python
def test_local_adapter_returns_stable_local_reference(self):
    adapter = LocalCommercialAdapter()
    self.assertEqual(adapter.sync_lead({"public_id": "FDE-A-ABC1234567"}), "local:FDE-A-ABC1234567")
```

- [ ] **Step 2: Implement the protocol and local adapter**

The local adapter does not perform network calls. It returns stable `local:` references and never labels itself as CRM, contract, or payment integration.

- [ ] **Step 3: Write failing retry/outbox tests**

Test success marks `delivered`, failure increments `attempt_count`, sets `available_at` with bounded backoff, preserves the original payload, and moves to `dead` only after 10 failures.

- [ ] **Step 4: Implement transactional dispatch**

Select only `pending` messages whose `available_at <= now`, claim rows inside a transaction, dispatch outside the claim transaction, then record success/failure without deleting history. Do not log request payloads containing PII.

- [ ] **Step 5: Run Task 3 tests and verify GREEN**

```bash
PYTHONPATH=backend /Users/yuanwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  -m unittest backend.tests.test_commercial_outbox -v
```

Expected: all outbox tests pass.

- [ ] **Step 6: Commit Task 3**

```bash
git add backend/fde_commercial/adapters.py backend/fde_commercial/outbox.py backend/tests/test_commercial_outbox.py
git commit -m "feat: add reliable commercial integration outbox"
```

---

### Task 4: FDE 小班培训招生页面

> **Required sub-skills:** Use `design-taste-frontend` before UI edits and `playwright` for browser verification.

**Files:**
- Create: `fde-training/index.html`
- Create: `fde-training/training.css`
- Create: `fde-training/training.js`
- Create: `tests/fde-training.test.mjs`
- Create: `tests/fde-training-browser.mjs`
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `app.js`
- Modify: `exam-app.js`
- Modify: `analytics.js`
- Modify: `backend/fde_analytics/db.py`
- Modify: `backend/tests/test_analytics_db.py`

**Interfaces:**
- Consumes: Task 2 public product and application endpoints
- Produces: `/fde-training/`
- Produces: `loadTrainingProduct(fetchImpl) -> Promise<Product>`
- Produces: `buildApplicationPayload(form: HTMLFormElement, source: string) -> object`
- Produces anonymous events: `training_page_view`, `training_apply_start`, `training_apply_submit`, `training_apply_error`

- [ ] **Step 1: Write failing deterministic content and payload tests**

```javascript
assert.match(html, /OneX FDE 小班实战培训/);
assert.match(html, /每期最多 10 人/);
assert.match(html, /完成培训或支付培训费用，不代表自动进入/);
assert.deepEqual(buildApplicationPayload(formFixture, 'public_test'), {
  product_code: 'FDE-TRAINING-SMALL-CLASS',
  offer_id: 'fde-small-class-open-application',
  name: '张三', mobile: '13800138000', wechat: '', current_role: '产品经理',
  ai_experience: 'practitioner', fde_experience: '参与过知识库项目',
  learning_goal: '建立完整企业 AI 交付能力', time_commitment: '每周 10 小时',
  source: 'public_test', consent_version: 'training-application-v1', _company: '',
});
```

- [ ] **Step 2: Run deterministic test and verify RED**

```bash
node tests/fde-training.test.mjs
```

Expected: failure because the page/module is absent.

- [ ] **Step 3: Implement the approved page structure**

Build the hero, audience, outcomes, six capability modules, small-class mechanism, training-to-talent pathway, application process, form, FAQ and fixed boundary. Do not show fabricated dates, prices, teachers, case outcomes or remaining seats.

- [ ] **Step 4: Implement product-state and application behavior**

Load the public product first. Map `open`, `waitlist_only`, `paused`, and `closed` to explicit UI states. Generate a cryptographically random idempotency key per form submission, keep it through recoverable retries, and replace it only after success or form reset.

- [ ] **Step 5: Write failing analytics allowlist tests**

Assert all four training events are accepted with anonymous allowlisted attributes, while payloads containing `name`, `mobile`, `wechat`, `learning_goal`, or `application_id` are rejected.

- [ ] **Step 6: Implement anonymous training events**

Extend the client and backend allowlists without adding PII fields. `training_apply_submit` records source and coarse result type only; the public application number remains exclusively in the commercial service response and UI success state.

- [ ] **Step 7: Connect existing conversion surfaces**

Add a visible FDE training link to the homepage, quick-test result, and level-test result. Existing result language continues to say the public test is not certification. Links use source parameters that normalize to the approved source enum.

- [ ] **Step 8: Write and run browser tests**

At `1440×1000` and `390×844`, assert no horizontal overflow, full keyboard completion, correctly associated labels, explicit validation errors, loading/paused/waitlist/success states, and no console errors. Stub the two commercial API routes; do not call production.

```bash
FDE_TEST_URL=http://127.0.0.1:4173/ NODE_PATH="$NODE_PATH" node tests/fde-training-browser.mjs
```

Expected: browser test passes after the minimal UI fixes.

- [ ] **Step 9: Run all deterministic frontend and backend tests**

```bash
for test in tests/*.test.mjs; do node "$test"; done
PYTHONPATH=backend /Users/yuanwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  -m unittest discover -s backend/tests -v
```

Expected: all tests pass.

- [ ] **Step 10: Commit Task 4**

```bash
git add fde-training tests/fde-training.test.mjs tests/fde-training-browser.mjs \
  index.html styles.css app.js exam-app.js analytics.js backend/fde_analytics/db.py backend/tests/test_analytics_db.py
git commit -m "feat: add FDE small-class training enrollment page"
```

---

### Task 5: 招生运营、班期与 10 人容量约束

**Files:**
- Create: `backend/fde_commercial/operations.py`
- Create: `backend/fde_commercial/manage.py`
- Create: `backend/tests/test_commercial_operations.py`
- Modify: `backend/fde_commercial/app.py`

**Interfaces:**
- Produces: `assign_application(conn, application_id: int, operator_id: str, actor: str, now: datetime) -> dict`
- Produces: `transition_application(conn, application_id: int, status: str, reason: str | None, actor: str, now: datetime) -> dict`
- Produces: `create_cohort(conn, payload: dict, actor: str, now: datetime) -> dict`
- Produces: `enroll_application(conn, application_id: int, cohort_id: int, actor: str, now: datetime) -> dict`
- Produces CLI: `python -m fde_commercial.manage ...`

- [ ] **Step 1: Write failing state-transition tests**

Test valid `submitted → reviewing → contacted → qualified → waitlisted/admitted → enrolled`, reject invalid jumps, and require a reason for `rejected`, `withdrawn`, or `closed`.

- [ ] **Step 2: Implement explicit transition map and audit**

Use a constant transition map; do not infer transitions from UI. Each transition writes before/after state, actor and reason to the append-only commercial audit table.

- [ ] **Step 3: Write failing cohort capacity tests**

```python
def test_cohort_capacity_cannot_exceed_ten(self):
    with self.assertRaises(ValidationError):
        create_cohort(self.conn, {"name": "超大班", "capacity": 11}, "owner:1", self.now)

def test_eleventh_confirmed_enrollment_is_rejected(self):
    cohort = create_cohort(self.conn, {"name": "首期", "capacity": 10}, "owner:1", self.now)
    for application_id in self.application_ids[:10]:
        enroll_application(self.conn, application_id, cohort["id"], "operator:1", self.now)
    with self.assertRaises(CohortFullError):
        enroll_application(self.conn, self.application_ids[10], cohort["id"], "operator:1", self.now)
```

- [ ] **Step 4: Implement database and domain capacity guards**

Reject `capacity < 1` or `capacity > 10`. Use a transaction with `BEGIN IMMEDIATE` before counting/assigning seats so concurrent requests cannot create an 11th confirmed seat. Seat numbers are unique within a cohort.

- [ ] **Step 5: Implement auditable management CLI**

Commands: `list-applications`, `assign`, `transition`, `create-cohort`, `enroll`, `list-cohorts`, and `show-audit`. Every mutating command requires `--actor`; no command prints full mobile numbers unless `--show-private` is explicitly provided and an audit record is written.

- [ ] **Step 6: Run operations tests and full backend suite**

```bash
PYTHONPATH=backend /Users/yuanwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  -m unittest backend.tests.test_commercial_operations -v
PYTHONPATH=backend /Users/yuanwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  -m unittest discover -s backend/tests -v
```

Expected: all tests pass.

- [ ] **Step 7: Commit Task 5**

```bash
git add backend/fde_commercial backend/tests/test_commercial_operations.py
git commit -m "feat: manage FDE training applications and cohorts"
```

---

### Task 6: 部署、隐私与端到端验收

**Files:**
- Create: `deploy/fde-commercial.service`
- Modify: `deploy/fde.onex.plus.nginx.conf`
- Modify: `deploy/fde.onex.plus.acme.nginx.conf`
- Modify: `deploy/install-or-update.sh`
- Create: `tests/fde-commercial-deploy.test.mjs`
- Modify: `robots.txt`
- Modify: `sitemap.xml`
- Modify: `llms.txt`
- Modify: `README.md`

**Interfaces:**
- Produces: service on `127.0.0.1:8767`
- Produces: database `/var/lib/fde-commercial/commercial.db`
- Produces: same-origin proxy `/api/commercial/`

- [ ] **Step 1: Write failing deployment contract tests**

```javascript
assert.match(service, /FDE_COMMERCIAL_DB=\/var\/lib\/fde-commercial\/commercial\.db/);
assert.match(service, /FDE_COMMERCIAL_PORT=8767/);
assert.match(nginx, /location \^~ \/api\/commercial\//);
assert.match(nginx, /proxy_pass http:\/\/127\.0\.0\.1:8767/);
assert.match(install, /fde-commercial\.service/);
```

- [ ] **Step 2: Implement hardened systemd and Nginx configuration**

The service may write only `/var/lib/fde-commercial`. Nginx limits public application requests separately, caps bodies at `32k`, adds `no-store` to application responses, and does not log request bodies. `/fde-training/` is public; `/api/`, future `/ops/`, and application status routes stay excluded from indexing.

- [ ] **Step 3: Extend the idempotent deploy script**

Create data directory mode `0750`, initialize schema, install/restart service, preserve existing analytics/network services, run `nginx -t`, and require the local commercial health endpoint before printing success.

- [ ] **Step 4: Update discovery and documentation**

Add `/fde-training/` to sitemap and public documentation. README includes Python 3.11+, local service start, application smoke request using fictional data, operations CLI, outbox dispatch, rollback by pausing the offer, and the explicit statement that no external CRM/payment connector is live until configured.

- [ ] **Step 5: Run fresh complete verification**

```bash
for test in tests/*.test.mjs; do node "$test"; done
PYTHONPATH=backend /Users/yuanwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  -m unittest discover -s backend/tests -v
bash -n deploy/install-or-update.sh deploy/configure-xray-sni.sh
git diff --check
```

Expected: every command exits `0`; `git diff --check` prints no output.

- [ ] **Step 6: Run real browser smoke tests against local services**

Start the static site and commercial WSGI service locally. Submit fictional data, verify one database application row and one outbox row, retry the same idempotency key and verify no duplicate, then inspect desktop/mobile screenshots for clipping, overlap and false certification claims.

- [ ] **Step 7: Commit Task 6**

```bash
git add deploy tests/fde-commercial-deploy.test.mjs robots.txt sitemap.xml llms.txt README.md
git commit -m "feat: deploy FDE training commercialization service"
```

---

## Completion Gate

- [ ] Product capacity is exactly 10 and every cohort enforces `capacity <= 10`.
- [ ] The page works with no date and no configured online payment provider.
- [ ] One application produces one local record, one audit record and one syncable outbox message.
- [ ] Repeated idempotent submission cannot create duplicate applications.
- [ ] Anonymous analytics contains no PII or application content.
- [ ] External adapter failure never loses the local application.
- [ ] Payment/training/talent/certification/badge boundaries are visible and covered by tests.
- [ ] Existing Chinese/English public tests and `/stats/` remain green.
- [ ] Desktop and 390 px mobile browser checks show no horizontal overflow or form blockers.
- [ ] Full test/build/shell/diff verification is rerun immediately before any completion claim.

