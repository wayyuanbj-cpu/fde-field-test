# FDE Analytics Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 FDE 挑战站点交付不影响前台的匿名转化统计服务，以及具备 Owner/Analyst 账号登录、权限管理和审计日志的私有数据后台。

**Architecture:** 前台 `analytics.js` 使用 `sendBeacon` 向同源公开事件接口发送白名单数据。Python 标准库 WSGI 服务只监听 localhost，将事件、账号、会话和审计记录存入站点目录外的 SQLite。Nginx 代理 API，`/stats/` 提供登录、数据概览和 Owner 账号权限页。

**Tech Stack:** Python 3 standard library (`sqlite3`, `hashlib.scrypt`, WSGI), native HTML/CSS/JS, systemd, Nginx, Node browser tests.

## Global Constraints

- 不存储姓名、答案、原始 IP 或完整 User-Agent。
- DNT、localhost/file 和 `navigator.webdriver` 环境不上报。
- 账号不开放公众注册；首个 Owner 强制首次改密。
- 密码至少 12 字符，scrypt 加盐存储。
- 会话 12 小时，Cookie 必须 Secure/HttpOnly/SameSite=Strict，只存 token 哈希。
- Owner: `analytics:read`, `users:manage`; Analyst: `analytics:read` only.
- 不能停用或降级最后一个有效 Owner。
- 统计故障不得影响站点主流程。

---

### Task 1: SQLite analytics store and aggregate queries

**Files:**
- Create: `backend/fde_analytics/__init__.py`
- Create: `backend/fde_analytics/db.py`
- Create: `backend/tests/test_analytics_db.py`

**Interfaces:**
- Produces: `connect(db_path)`, `initialize(conn)`, `validate_event(payload)`, `record_event(conn, payload, now)`, `dashboard(conn, range_key, now)`, `purge_old_events(conn, now)`.

- [ ] **Step 1: Write RED validation tests**

Use `unittest` and a temporary SQLite database. Require unknown events, extra keys, overlong IDs, invalid level/mode/score, and payloads containing `name` or `answers` to raise `ValidationError`.

- [ ] **Step 2: Verify RED**

Run: `PYTHONPATH=backend python3 -m unittest backend.tests.test_analytics_db -v`

Expected: import failure because the package does not exist.

- [ ] **Step 3: Implement schema and validation**

Create tables `events`, `daily_events`, `daily_visitors`, and `daily_sessions` with indexes on timestamp/event/level/mode. Accept only the explicit event enum and fields from the spec. Use server time, never client time, for storage.

- [ ] **Step 4: Implement aggregates**

Return JSON-safe data:

```python
{
  "range": "7d",
  "summary": {"pv": 10, "uv": 7, "sessions": 8},
  "daily": [{"day": "2026-07-16", "pv": 10, "uv": 7}],
  "funnel": {"page_view": 10, "quick_start": 6, "quick_complete": 4},
  "levels": {"junior": {"start": 5, "complete": 3, "unlock": 1}},
  "sources": [], "devices": [], "scores": []
}
```

- [ ] **Step 5: Add 180-day purge and rollup preservation test**

Insert old raw events, purge, and verify `daily_events` counts remain while raw rows are deleted.

- [ ] **Step 6: Run tests and commit**

```bash
PYTHONPATH=backend python3 -m unittest backend.tests.test_analytics_db -v
git add backend
git commit -m "Add anonymous analytics storage"
```

### Task 2: Account, password, session, CSRF, and roles

**Files:**
- Create: `backend/fde_analytics/auth.py`
- Create: `backend/tests/test_auth.py`

**Interfaces:**
- Produces: `create_user`, `verify_login`, `create_session`, `authenticate_session`, `require_permission`, `change_password`, `set_user_role`, `set_user_active`, `reset_password`.

- [ ] **Step 1: Write RED auth tests**

Cover scrypt non-plaintext hashes, password length, forced first change, five-failure lockout, 12-hour expiry, auth-version session invalidation, CSRF, owner/analyst permissions, disabled accounts, and last-owner protection.

- [ ] **Step 2: Verify RED**

Run: `PYTHONPATH=backend python3 -m unittest backend.tests.test_auth -v`

Expected: import failure.

- [ ] **Step 3: Extend schema**

Add `users`, `sessions`, and `audit_log`. Store `password_salt`, `password_hash`, `role`, `active`, `must_change_password`, failed count, lock timestamp, and auth version. Store only SHA-256 session token hashes.

- [ ] **Step 4: Implement auth rules**

Use `hashlib.scrypt(password, salt=salt, n=2**14, r=8, p=1, dklen=64)` and `hmac.compare_digest`. Increment auth version and revoke sessions on password, role, or active-state changes.

- [ ] **Step 5: Verify audit redaction**

Assert audit detail JSON never contains password, raw session token, CSRF token, or IP.

- [ ] **Step 6: Run tests and commit**

```bash
PYTHONPATH=backend python3 -m unittest backend.tests.test_auth -v
git add backend
git commit -m "Add analytics account permissions"
```

### Task 3: WSGI JSON API and management CLI

**Files:**
- Create: `backend/fde_analytics/app.py`
- Create: `backend/fde_analytics/manage.py`
- Create: `backend/tests/test_api.py`

**Interfaces:**
- Public: `POST /api/analytics/events`.
- Auth: `POST /api/analytics/auth/login`, `POST /logout`, `GET /me`, `POST /change-password`.
- Stats: `GET /api/analytics/dashboard?range=today|7d|30d|all`.
- Owner: `GET/POST /api/analytics/users`, `PATCH /api/analytics/users/:id`, `POST /api/analytics/users/:id/reset-password`.

- [ ] **Step 1: Write WSGI RED tests**

Build WSGI environ dictionaries directly. Assert malformed JSON 400, body over 16 KiB 413, unauthenticated dashboard 401, analyst user management 403, owner management 200, and mutation without CSRF 403.

- [ ] **Step 2: Implement JSON routing and cookies**

All admin responses use `Cache-Control: no-store`. Login sets `fde_admin_session={random_session_token}; Path=/; Max-Age=43200; Secure; HttpOnly; SameSite=Strict`. Login returns a CSRF token in JSON after successful authentication.

- [ ] **Step 3: Implement the CLI**

Support:

```bash
python3 -m fde_analytics.manage bootstrap --db PATH --username owner --credentials PATH
python3 -m fde_analytics.manage reset-password --db PATH --username owner --credentials PATH
python3 -m fde_analytics.manage unlock --db PATH --username owner
```

Bootstrap is idempotent and creates credentials only when no owner exists.

- [ ] **Step 4: Add a threaded WSGI entrypoint**

Listen only on environment `FDE_ANALYTICS_HOST=127.0.0.1` and `FDE_ANALYTICS_PORT=8765`; read DB path from `FDE_ANALYTICS_DB`.

- [ ] **Step 5: Run API tests and commit**

```bash
PYTHONPATH=backend python3 -m unittest discover -s backend/tests -v
git add backend
git commit -m "Expose secure analytics API"
```

### Task 4: Frontend event client and instrumentation

**Files:**
- Create: `analytics.js`
- Modify: `index.html`
- Modify: `app.js`
- Modify: `exam-app.js`
- Create: `tests/fde-analytics-client.test.mjs`

**Interfaces:**
- Produces: `track(event, properties = {})`, `analyticsEnabled()`.

- [ ] **Step 1: Write client RED tests**

Use injected window/navigator/location/storage adapters to require disabled behavior for file, localhost, DNT, and webdriver; require allowed payload keys and prove `name` and `answers` are dropped.

- [ ] **Step 2: Implement non-blocking client**

Create opaque visitor ID in localStorage and session ID in sessionStorage using `crypto.randomUUID()`. Send JSON with `navigator.sendBeacon("/api/analytics/events", blob)`, fall back to `fetch("/api/analytics/events", {method: "POST", body: json, headers: {"Content-Type": "application/json"}, keepalive: true})`, and swallow failures.

- [ ] **Step 3: Instrument the funnel**

Add page view, quick start/complete, level start/complete, unlock, final complete, and share generate at the exact state transition points. Never send per-question data or the final share name.

- [ ] **Step 4: Add anonymous analytics disclosure**

Add concise footer copy explaining anonymous, cookie-free operational statistics.

- [ ] **Step 5: Run tests and commit**

```bash
node tests/fde-analytics-client.test.mjs
git add analytics.js app.js exam-app.js index.html tests/
git commit -m "Track anonymous FDE conversion events"
```

### Task 5: Login, dashboard, and account-permission UI

**Files:**
- Create: `stats/index.html`
- Create: `stats/stats.css`
- Create: `stats/stats.js`
- Create: `tests/fde-stats-browser.mjs`

- [ ] **Step 1: Write mocked-API browser RED tests**

Intercept `/api/analytics/*`. Verify unauthenticated users see login; forced-change users see only change password; analyst sees dashboard but no account navigation; owner sees account list and can create/disable/reset an account.

- [ ] **Step 2: Implement auth state machine**

On load call `/me`; render login, forced change, dashboard, or user management based on response. Keep CSRF token only in memory and attach it to mutation headers.

- [ ] **Step 3: Implement the data dashboard**

Render range buttons, PV/UV/sessions cards, daily CSS/SVG chart, funnel rows, level conversion, device/source lists, score distribution, and clear empty states. Do not render raw event rows.

- [ ] **Step 4: Implement Owner account management**

Create username/role form, active toggle, reset-password action, and last-owner error display. Do not display stored password hashes or sessions.

- [ ] **Step 5: Run responsive browser tests and commit**

Verify 1365x900 and 390x844, no horizontal overflow or console errors.

```bash
NODE_PATH=/Users/yuanwei/.npm/_npx/e41f203b7505f1fb/node_modules node tests/fde-stats-browser.mjs
git add stats tests/fde-stats-browser.mjs
git commit -m "Build analytics login and admin dashboard"
```

### Task 6: Nginx, systemd, deployment, and online acceptance

**Files:**
- Create: `deploy/fde-analytics.service`
- Modify: `deploy/fde.onex.plus.nginx.conf`
- Modify: `deploy/install-or-update.sh`
- Modify: `README.md`

- [ ] **Step 1: Add deployment checks before mutation**

Run local shell syntax checks and Python tests. Ensure deploy excludes `backend/`, `tests/`, and `docs/` from the public web root while keeping `stats/` public assets.

- [ ] **Step 2: Install the service**

Create `/var/lib/fde-analytics` owned by `www-data`, install the systemd unit, bootstrap owner only when absent, enable/restart the service, and verify `127.0.0.1:8765` is listening.

- [ ] **Step 3: Add Nginx proxy and rate limits**

Proxy `/api/analytics/` to localhost. Apply stricter limits to login and event paths, `client_max_body_size 16k`, no-store headers for admin API, and preserve the existing SNI/Xray routing.

- [ ] **Step 4: Test failure isolation**

Stop the analytics service temporarily and verify `/` and all static exam assets still return 200 while event requests fail without breaking the front end. Restart the service.

- [ ] **Step 5: Run the full local suite**

Run all Node, Playwright, Python, `bash -n`, and `nginx -t` checks. Expected: zero failures.

- [ ] **Step 6: Commit, push, and deploy from GitHub main**

```bash
git add deploy README.md
git commit -m "Deploy secure FDE analytics backend"
git push origin main
ssh -o BatchMode=yes -i /Users/yuanwei/.ssh/51tokens_deploy root@123.56.153.120 'bash /opt/fde-field-test/deploy/install-or-update.sh'
```

- [ ] **Step 7: Online permission acceptance**

Verify public site 200; unauthenticated dashboard data 401; owner login forces password change; changed owner can view dashboard and manage users; analyst can view data but user API returns 403. Never print cookies or passwords in test logs.

- [ ] **Step 8: Deliver credentials securely in the task**

Read the one-time credential file without including it in command output logs, then communicate the URL, username, and one-time password only in the final user response. Confirm the user must change it on first login.
