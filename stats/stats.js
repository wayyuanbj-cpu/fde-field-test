const state = { user: null, csrf: null, range: "7d", users: [] };
const $ = (selector) => document.querySelector(selector);

function showOnly(id) {
  ["login-view", "change-password-view", "app-view"].forEach((view) => { $(`#${view}`).hidden = view !== id; });
}

async function api(path, options = {}) {
  const headers = { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers ?? {}) };
  if (options.mutation && state.csrf) headers["X-CSRF-Token"] = state.csrf;
  const response = await fetch(`/api/analytics${path}`, {
    method: options.method ?? "GET",
    credentials: "same-origin",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(data?.message ?? data?.error ?? `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function number(value) {
  return new Intl.NumberFormat("zh-CN").format(value ?? 0);
}

function setUser(user, csrf) {
  state.user = user;
  state.csrf = csrf;
  if (user?.must_change_password) {
    showOnly("change-password-view");
    return;
  }
  if (user) showApp(); else showOnly("login-view");
}

function showApp() {
  showOnly("app-view");
  $("#account-name").textContent = state.user.username;
  $("#account-role").textContent = state.user.role.toUpperCase();
  const userNav = $("[data-view='users']");
  userNav.hidden = state.user.role !== "owner";
  openWorkspace("overview");
}

function openWorkspace(view) {
  if (view === "users" && state.user.role !== "owner") return;
  $("#overview-view").hidden = view !== "overview";
  $("#users-view").hidden = view !== "users";
  document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("is-active", button.dataset.view === view));
  if (view === "overview") loadDashboard(); else loadUsers();
}

function bars(container, items, labelKey = "label", valueKey = "value") {
  const max = Math.max(1, ...items.map((item) => item[valueKey]));
  container.replaceChildren(...(items.length ? items.map((item) => {
    const row = document.createElement("div");
    row.className = "dimension-row";
    row.innerHTML = `<div class="row-head"><span></span><strong></strong></div><div class="track"><i></i></div>`;
    row.querySelector("span").textContent = item[labelKey];
    row.querySelector("strong").textContent = number(item[valueKey]);
    row.querySelector("i").style.width = `${item[valueKey] / max * 100}%`;
    return row;
  }) : [Object.assign(document.createElement("p"), { className: "empty", textContent: "暂无数据" })]));
}

function renderDashboard(data) {
  $("#metric-pv").textContent = number(data.summary.pv);
  $("#metric-uv").textContent = number(data.summary.uv);
  $("#metric-sessions").textContent = number(data.summary.sessions);
  const maxPv = Math.max(1, ...data.daily.map((day) => day.pv));
  $("#daily-chart").replaceChildren(...(data.daily.length ? data.daily.map((day) => {
    const bar = document.createElement("div");
    bar.className = "daily-bar";
    const value = document.createElement("i");
    value.style.height = `${day.pv / maxPv * 100}%`;
    value.dataset.value = number(day.pv);
    const label = document.createElement("span");
    label.textContent = day.day.slice(5);
    bar.append(value, label);
    return bar;
  }) : [Object.assign(document.createElement("p"), { className: "empty", textContent: "暂无趋势数据" })]));

  const funnelLabels = [
    ["page_view", "访问页面"], ["quick_start", "开始快测"], ["quick_complete", "完成快测"],
    ["level_start", "开始分级"], ["level_complete", "完成分级"], ["final_complete", "完成三级"], ["share_generate", "生成分享"],
  ];
  const funnelBase = Math.max(1, data.funnel.page_view ?? 0);
  $("#funnel-chart").replaceChildren(...funnelLabels.map(([key, label]) => {
    const row = document.createElement("div");
    row.className = "funnel-row";
    const value = data.funnel[key] ?? 0;
    row.innerHTML = `<div class="row-head"><span></span><strong></strong></div><div class="track"><i></i></div>`;
    row.querySelector("span").textContent = label;
    row.querySelector("strong").textContent = `${number(value)} · ${Math.round(value / funnelBase * 100)}%`;
    row.querySelector("i").style.width = `${Math.min(100, value / funnelBase * 100)}%`;
    return row;
  }));

  const levelLabels = { junior: "L1 / 初级", intermediate: "L2 / 中级", advanced: "L3 / 高级" };
  $("#level-chart").replaceChildren(...Object.entries(levelLabels).map(([key, label]) => {
    const values = data.levels[key] ?? { start: 0, complete: 0, unlock: 0 };
    const row = document.createElement("div");
    row.className = "level-row";
    row.innerHTML = `<div class="row-head"><span></span><strong></strong></div><div class="level-numbers"><div><span>START</span><strong></strong></div><div><span>COMPLETE</span><strong></strong></div><div><span>UNLOCK</span><strong></strong></div></div>`;
    row.querySelector(".row-head span").textContent = label;
    row.querySelector(".row-head strong").textContent = values.start ? `${Math.round(values.complete / values.start * 100)}% 完成` : "--";
    [...row.querySelectorAll(".level-numbers strong")].forEach((node, index) => { node.textContent = number([values.start, values.complete, values.unlock][index]); });
    return row;
  }));
  bars($("#source-list"), data.sources);
  bars($("#device-list"), data.devices);
  bars($("#score-chart"), data.scores, "bucket", "value");
  $("#score-chart").querySelectorAll(".dimension-row").forEach((row) => { row.className = "score-row"; });
}

async function loadDashboard() {
  $("#overview-error").textContent = "";
  try {
    const data = await api(`/dashboard?range=${state.range}`);
    renderDashboard(data);
  } catch (error) {
    $("#overview-error").textContent = `数据加载失败：${error.message}`;
  }
}

function showCredential(username, password) {
  $("#credential-user").textContent = username;
  $("#credential-password").textContent = password;
  $("#credential-panel").hidden = false;
}

function renderUsers() {
  $("#user-list").replaceChildren(...state.users.map((user) => {
    const row = document.createElement("article");
    row.className = "user-row";
    row.dataset.userIdRow = user.id;
    row.innerHTML = `<div class="user-identity"><strong></strong><span></span></div><select aria-label="账号角色"><option value="analyst">Analyst</option><option value="owner">Owner</option></select><div class="user-actions"><button type="button" data-user-action="toggle"></button><button type="button" data-user-action="reset">重置密码</button></div>`;
    row.querySelector(".user-identity strong").textContent = user.username;
    const status = row.querySelector(".user-identity span");
    status.textContent = user.active ? `${user.role.toUpperCase()} · 正常` : `${user.role.toUpperCase()} · 已停用`;
    status.classList.toggle("status-off", !user.active);
    const select = row.querySelector("select");
    select.value = user.role;
    select.dataset.userAction = "role";
    select.dataset.userId = user.id;
    row.querySelectorAll("button").forEach((button) => { button.dataset.userId = user.id; });
    row.querySelector("[data-user-action='toggle']").textContent = user.active ? "停用" : "启用";
    return row;
  }));
}

async function loadUsers() {
  $("#users-error").textContent = "";
  try {
    const data = await api("/users");
    state.users = data.users;
    renderUsers();
  } catch (error) {
    $("#users-error").textContent = `账号加载失败：${error.message}`;
  }
}

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("#login-error").textContent = "";
  const form = new FormData(event.currentTarget);
  try {
    const data = await api("/auth/login", { method: "POST", body: Object.fromEntries(form) });
    setUser(data.user, data.csrf);
  } catch (error) {
    $("#login-error").textContent = error.message === "locked" ? "账号已暂时锁定，请 15 分钟后重试。" : "账号或密码错误。";
  }
});

$("#change-password-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("#change-error").textContent = "";
  const form = new FormData(event.currentTarget);
  try {
    const data = await api("/auth/change-password", { method: "POST", body: Object.fromEntries(form), mutation: true });
    setUser(data.user, data.csrf);
  } catch (error) {
    $("#change-error").textContent = `改密失败：${error.message}`;
  }
});

document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => openWorkspace(button.dataset.view)));
document.querySelectorAll("[data-range]").forEach((button) => button.addEventListener("click", () => {
  state.range = button.dataset.range;
  document.querySelectorAll("[data-range]").forEach((item) => item.classList.toggle("is-active", item === button));
  loadDashboard();
}));

$("#create-user-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("#users-error").textContent = "";
  try {
    const data = await api("/users", { method: "POST", body: Object.fromEntries(new FormData(event.currentTarget)), mutation: true });
    showCredential(data.user.username, data.one_time_password);
    event.currentTarget.reset();
    await loadUsers();
  } catch (error) {
    $("#users-error").textContent = `创建失败：${error.message}`;
  }
});

$("#user-list").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-user-action]");
  if (!button) return;
  const userId = Number(button.dataset.userId);
  const user = state.users.find((entry) => entry.id === userId);
  try {
    if (button.dataset.userAction === "toggle") {
      await api(`/users/${userId}`, { method: "PATCH", body: { active: !user.active }, mutation: true });
      await loadUsers();
    } else if (button.dataset.userAction === "reset") {
      const data = await api(`/users/${userId}/reset-password`, { method: "POST", body: {}, mutation: true });
      showCredential(user.username, data.one_time_password);
    }
  } catch (error) {
    $("#users-error").textContent = `操作失败：${error.message}`;
  }
});

$("#user-list").addEventListener("change", async (event) => {
  const select = event.target.closest("[data-user-action='role']");
  if (!select) return;
  try {
    await api(`/users/${select.dataset.userId}`, { method: "PATCH", body: { role: select.value }, mutation: true });
    await loadUsers();
  } catch (error) {
    $("#users-error").textContent = `角色更新失败：${error.message}`;
    await loadUsers();
  }
});

$("#logout-button").addEventListener("click", async () => {
  try { await api("/auth/logout", { method: "POST", mutation: true }); } catch { /* clear local UI regardless */ }
  state.user = null;
  state.csrf = null;
  showOnly("login-view");
});

(async () => {
  try {
    const data = await api("/auth/me");
    setUser(data.user, data.csrf);
  } catch {
    setUser(null, null);
  }
})();
