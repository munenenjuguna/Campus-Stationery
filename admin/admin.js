// admin/admin.js
// Front end logic for the CampusStationery admin panel.
// Talks to the Express API in routes/admin.js, which talks to MySQL.

const API = '/api/admin';
const SHOP_NAME = 'CampusStationery';

const state = {
  token: sessionStorage.getItem('adminToken'),
  admin: JSON.parse(sessionStorage.getItem('adminUser') || 'null'),
  tables: [],
  table: null // { name, meta, search, sort, dir, page, limit, rows, total }
};

if (!state.token) location.href = 'login.html';

/* ---------- small helpers ---------- */

const $ = sel => document.querySelector(sel);
const view = $('#view');

function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const LABELS = { twofa_enabled: 'Two step login', is_active: 'Active' };

function pretty(name) {
  if (LABELS[name]) return LABELS[name];
  // "category_id" becomes "Category", "stock_quantity" becomes "Stock quantity"
  const s = String(name).replace(/(.)_id$/, '$1').replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function tableIcon(name) {
  const n = name.toLowerCase();
  if (/order_?item|detail|line/.test(n)) return 'fa-list-check';
  if (/order|sale/.test(n)) return 'fa-cart-shopping';
  if (/product|item|stock|inventory/.test(n)) return 'fa-box-open';
  if (/categor/.test(n)) return 'fa-tags';
  if (/user|customer|student|member/.test(n)) return 'fa-users';
  if (/payment|transaction|mpesa/.test(n)) return 'fa-money-bill-wave';
  if (/supplier|vendor/.test(n)) return 'fa-truck-field';
  if (/review|rating|feedback/.test(n)) return 'fa-star';
  if (/cart|wishlist/.test(n)) return 'fa-basket-shopping';
  if (/deliver|shipping|address/.test(n)) return 'fa-truck';
  return 'fa-table';
}

function money(v) {
  return 'KES ' + Number(v || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(v) {
  if (!v) return '';
  const d = new Date(String(v).replace(' ', 'T'));
  return isNaN(d) ? v : d.toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: String(v).length > 10 ? 'short' : undefined });
}

let loadingCount = 0;
function loading(on) {
  loadingCount += on ? 1 : -1;
  const bar = $('#loadingBar');
  bar.style.width = loadingCount > 0 ? '70%' : '100%';
  if (loadingCount <= 0) setTimeout(() => { bar.style.width = '0'; }, 250);
}

async function api(path, options = {}) {
  loading(true);
  try {
    const res = await fetch(API + path, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + state.token, ...(options.headers || {}) },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    let data = {};
    try { data = await res.json(); } catch (e) { /* empty body */ }
    if (res.status === 401) {
      sessionStorage.clear();
      alert(data.error || 'Your session has expired. Please log in again.');
      location.href = 'login.html';
      throw new Error('Session expired');
    }
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  } catch (err) {
    if (err instanceof TypeError) throw new Error('Cannot reach the server. Is the backend running?');
    throw err;
  } finally {
    loading(false);
  }
}

function toast(message, type = 'success') {
  const icons = { success: 'fa-circle-check text-success', danger: 'fa-circle-exclamation text-danger', warning: 'fa-triangle-exclamation text-warning', info: 'fa-circle-info text-primary' };
  const el = document.createElement('div');
  el.className = 'toast align-items-center border-0 shadow';
  el.innerHTML = `<div class="d-flex"><div class="toast-body"><i class="fa-solid ${icons[type] || icons.info} me-2"></i>${esc(message)}</div>
    <button type="button" class="btn-close me-2 m-auto" data-bs-dismiss="toast"></button></div>`;
  $('#toasts').appendChild(el);
  const t = new bootstrap.Toast(el, { delay: type === 'danger' ? 6000 : 3000 });
  t.show();
  el.addEventListener('hidden.bs.toast', () => el.remove());
}

function confirmBox(title, text, yesLabel = 'Yes, delete') {
  return new Promise(resolve => {
    $('#confirmTitle').textContent = title;
    $('#confirmText').textContent = text;
    $('#confirmYes').textContent = yesLabel;
    const modalEl = $('#confirmModal');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    let answered = false;
    $('#confirmYes').onclick = () => { answered = true; modal.hide(); resolve(true); };
    modalEl.addEventListener('hidden.bs.modal', () => { if (!answered) resolve(false); }, { once: true });
    modal.show();
  });
}

function errorPanel(message) {
  return `<div class="panel empty"><i class="fa-solid fa-plug-circle-xmark d-block"></i><p class="mb-1 fw-semibold">Could not load this page</p><p class="small">${esc(message)}</p></div>`;
}

/* ---------- shell ---------- */

function renderShell() {
  const a = state.admin || {};
  $('#whoName').textContent = a.name || a.email || '';
  $('#whoRole').textContent = a.role === 'super_admin' ? 'Super admin' : 'Admin';
  $('#whoAvatar').textContent = (a.name || a.email || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  document.querySelectorAll('.super-only').forEach(el => el.classList.toggle('d-none', a.role !== 'super_admin'));
  $('#tableLinks').innerHTML = state.tables.map(t =>
    `<a href="#table/${encodeURIComponent(t)}" class="side-link" data-view="table/${esc(t)}"><i class="fa-solid ${tableIcon(t)}"></i> ${esc(pretty(t))}</a>`).join('')
    || '<div class="px-4 small text-secondary">No tables found yet.</div>';
}

function setActive(key, title) {
  document.querySelectorAll('.side-link').forEach(l => l.classList.toggle('active', l.dataset.view === key));
  $('#pageTitle').textContent = title;
  document.title = `${title} | ${SHOP_NAME} Admin`;
  $('#sidebar').classList.remove('open');
}

async function route() {
  const hash = decodeURIComponent(location.hash.replace(/^#/, '')) || 'dashboard';
  try {
    if (hash === 'dashboard') return await renderDashboard();
    if (hash === 'orders') return await renderOrders();
    if (hash === 'reports' || hash.startsWith('reports/')) return await renderReports(hash.split('/')[1]);
    if (hash.startsWith('table/')) return await renderTable(hash.slice(6));
    if (hash === 'audit') return await renderAudit();
    if (hash === 'admins') return await renderAdmins();
    if (hash === 'profile') return renderProfile();
    location.hash = 'dashboard';
  } catch (err) {
    view.innerHTML = errorPanel(err.message);
  }
}

/* ---------- dashboard ---------- */

// renderDashboard() lives in admin-orders.js with the orders and reports screens

function actionBadge(action) {
  if (/DELETE|FAILED/.test(action)) return 'badge-off';
  if (/CREATE|LOGIN$/.test(action)) return 'badge-ok';
  if (/UPDATE|RESET|PASSWORD/.test(action)) return 'badge-warn';
  return 'badge-soft';
}

/* ---------- table management ---------- */

async function renderTable(name) {
  if (!state.table || state.table.name !== name) {
    const meta = await api(`/tables/${encodeURIComponent(name)}/meta`);
    state.table = { name, meta, search: '', sort: meta.primaryKey, dir: 'desc', page: 1, limit: 10, fkLabels: {} };
    // Show names instead of numbers for linked records (for example the category of a product)
    for (const col of meta.columns.filter(c => c.foreignKey)) {
      try {
        const { options } = await api(`/tables/${encodeURIComponent(col.foreignKey.table)}/options?column=${encodeURIComponent(col.foreignKey.column)}`);
        state.table.fkLabels[col.name] = Object.fromEntries(options.map(o => [String(o.value), o.label]));
      } catch (e) { /* fall back to showing the number */ }
    }
  }
  setActive('table/' + name, pretty(name));
  const t = state.table;
  view.innerHTML = `
    <div class="toolbar">
      <div class="input-group search">
        <span class="input-group-text bg-white"><i class="fa-solid fa-magnifying-glass"></i></span>
        <input type="search" class="form-control" id="searchBox" placeholder="Search ${esc(pretty(name).toLowerCase())}... (press /)" value="${esc(t.search)}">
      </div>
      <select class="form-select w-auto" id="pageSize" title="Rows per page">
        ${[10, 25, 50, 100].map(n => `<option ${n === t.limit ? 'selected' : ''}>${n}</option>`).join('')}
      </select>
      <div class="ms-auto d-flex gap-2 flex-wrap">
        <button class="btn btn-outline-secondary" id="csvBtn"><i class="fa-solid fa-file-csv me-1"></i>Export CSV</button>
        <button class="btn btn-outline-secondary" id="printBtn"><i class="fa-solid fa-print me-1"></i>Print report</button>
        <button class="btn btn-accent" id="addBtn"><i class="fa-solid fa-plus me-1"></i>Add new</button>
      </div>
    </div>
    <div class="table-wrap" id="tableWrap"><div class="empty">Loading...</div></div>
    <div class="d-flex align-items-center mt-3 pager" id="pager"></div>`;

  let timer;
  $('#searchBox').addEventListener('input', e => {
    clearTimeout(timer);
    timer = setTimeout(() => { t.search = e.target.value.trim(); t.page = 1; loadRows(); }, 300);
  });
  $('#pageSize').onchange = e => { t.limit = Number(e.target.value); t.page = 1; loadRows(); };
  $('#addBtn').onclick = () => openRecordForm(null);
  $('#csvBtn').onclick = exportCsv;
  $('#printBtn').onclick = printReport;
  await loadRows();
}

function visibleColumns() {
  return state.table.meta.columns.filter(c => !c.sensitive);
}

async function loadRows() {
  const t = state.table;
  const params = new URLSearchParams({ search: t.search, sort: t.sort || '', dir: t.dir, page: t.page, limit: t.limit });
  try {
    const data = await api(`/tables/${encodeURIComponent(t.name)}/rows?${params}`);
    t.rows = data.rows; t.total = data.total; t.sort = data.sort; t.dir = data.dir.toLowerCase();
    drawRows();
  } catch (err) {
    $('#tableWrap').innerHTML = errorPanel(err.message);
  }
}

function cellHtml(col, value) {
  if (value === null || value === undefined || value === '') return '<span class="text-secondary">-</span>';
  const labels = state.table && state.table.fkLabels && state.table.fkLabels[col.name];
  if (labels && labels[String(value)] !== undefined) return esc(labels[String(value)]);
  const n = col.name.toLowerCase();
  if (/image|img|photo|picture|thumbnail/.test(n) && typeof value === 'string') {
    const src = /^(https?:)?\/\//.test(value) || value.startsWith('/') ? value : '../' + value;
    return `<img class="thumb" src="${esc(src)}" alt="" onerror="this.style.visibility='hidden'">`;
  }
  if (col.columnType === 'tinyint(1)' || /^is_|^has_|active|available/.test(n) && ['tinyint', 'bit'].includes(col.type)) {
    return Number(value) ? '<span class="badge badge-ok">Yes</span>' : '<span class="badge badge-off">No</span>';
  }
  if (/price|amount|total|cost|subtotal/.test(n) && !isNaN(value)) return esc(money(value));
  if (['date', 'datetime', 'timestamp'].includes(col.type)) return esc(fmtDate(value));
  if (col.type === 'enum' || /status/.test(n)) {
    const v = String(value).toLowerCase();
    const cls = /paid|complete|deliver|active|approved|success/.test(v) ? 'badge-ok' : /cancel|fail|reject|inactive/.test(v) ? 'badge-off' : /pending|process|ship/.test(v) ? 'badge-warn' : 'badge-soft';
    return `<span class="badge ${cls}">${esc(value)}</span>`;
  }
  if (/stock|quantity|qty/.test(n) && Number(value) <= 10) return `<span class="badge ${Number(value) <= 0 ? 'badge-off' : 'badge-warn'}">${esc(value)}</span>`;
  return esc(value);
}

function drawRows() {
  const t = state.table;
  const cols = visibleColumns();
  const pk = t.meta.primaryKey;
  if (!t.rows.length) {
    $('#tableWrap').innerHTML = `<div class="empty"><i class="fa-regular fa-folder-open d-block"></i>
      ${t.search ? `No ${esc(pretty(t.name).toLowerCase())} match "${esc(t.search)}".` : `No ${esc(pretty(t.name).toLowerCase())} yet. Click <b>Add new</b> to create the first one.`}</div>`;
  } else {
    $('#tableWrap').innerHTML = `
      <table class="table data-table mb-0">
        <thead><tr>
          ${cols.map(c => `<th data-col="${esc(c.name)}" class="${t.sort === c.name ? 'sorted' : ''}">${esc(pretty(c.name))}
            <i class="fa-solid ${t.sort === c.name ? (t.dir === 'asc' ? 'fa-sort-up' : 'fa-sort-down') : 'fa-sort'} sort-icon"></i></th>`).join('')}
          ${pk ? '<th class="no-sort text-end row-actions">Actions</th>' : ''}
        </tr></thead>
        <tbody>
          ${t.rows.map(r => `<tr>
            ${cols.map(c => `<td title="${esc(r[c.name])}">${cellHtml(c, r[c.name])}</td>`).join('')}
            ${pk ? `<td class="text-end text-nowrap row-actions">
              <button class="btn btn-sm btn-light" data-edit="${esc(r[pk])}" title="Edit"><i class="fa-solid fa-pen"></i></button>
              <button class="btn btn-sm btn-light text-danger" data-del="${esc(r[pk])}" title="Delete"><i class="fa-solid fa-trash"></i></button>
            </td>` : ''}
          </tr>`).join('')}
        </tbody>
      </table>`;
    document.querySelectorAll('th[data-col]').forEach(th => th.onclick = () => {
      const c = th.dataset.col;
      t.dir = t.sort === c && t.dir === 'asc' ? 'desc' : 'asc';
      t.sort = c; t.page = 1; loadRows();
    });
    document.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openRecordForm(b.dataset.edit));
    document.querySelectorAll('[data-del]').forEach(b => b.onclick = () => deleteRecord(b.dataset.del));
  }

  const pages = Math.max(Math.ceil(t.total / t.limit), 1);
  const from = t.total ? (t.page - 1) * t.limit + 1 : 0;
  const to = Math.min(t.page * t.limit, t.total);
  $('#pager').innerHTML = `
    <span class="text-secondary small">Showing ${from} to ${to} of ${t.total.toLocaleString()} record(s)</span>
    <div class="ms-auto btn-group">
      <button class="btn btn-light btn-sm" id="prevPg" ${t.page <= 1 ? 'disabled' : ''}><i class="fa-solid fa-chevron-left"></i></button>
      <button class="btn btn-light btn-sm" disabled>Page ${t.page} of ${pages}</button>
      <button class="btn btn-light btn-sm" id="nextPg" ${t.page >= pages ? 'disabled' : ''}><i class="fa-solid fa-chevron-right"></i></button>
    </div>`;
  $('#prevPg').onclick = () => { t.page--; loadRows(); };
  $('#nextPg').onclick = () => { t.page++; loadRows(); };
}

/* ---------- add / edit form ---------- */

function inputFor(col, value, isEdit) {
  const n = col.name;
  const id = 'f_' + n;
  const required = !col.nullable && !col.hasDefault && !col.autoIncrement && !(col.sensitive && isEdit);
  const label = `<label class="form-label ${required ? 'required' : ''}" for="${esc(id)}">${esc(pretty(n))}</label>`;
  const v = value == null ? '' : value;
  const req = required ? 'required' : '';
  let input;

  if (col.foreignKey) {
    input = `<select class="form-select" id="${esc(id)}" name="${esc(n)}" ${req} data-fk="${esc(col.foreignKey.table)}" data-fkcol="${esc(col.foreignKey.column)}" data-value="${esc(v)}">
      <option value="">Loading ${esc(pretty(col.foreignKey.table).toLowerCase())}...</option></select>`;
  } else if (col.options) {
    input = `<select class="form-select" id="${esc(id)}" name="${esc(n)}" ${req}>
      ${col.nullable || !required ? '<option value="">Choose...</option>' : ''}
      ${col.options.map(o => `<option ${String(o) === String(v) ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  } else if (col.columnType === 'tinyint(1)') {
    input = `<select class="form-select" id="${esc(id)}" name="${esc(n)}" ${req}>
      <option value="1" ${String(v) === '1' || v === '' ? 'selected' : ''}>Yes</option><option value="0" ${String(v) === '0' ? 'selected' : ''}>No</option></select>`;
  } else if (col.sensitive) {
    input = `<input type="password" class="form-control" id="${esc(id)}" name="${esc(n)}" autocomplete="new-password" ${req}
      placeholder="${isEdit ? 'Leave blank to keep the current password' : 'At least 8 characters, letters and numbers'}">`;
  } else if (['text', 'mediumtext', 'longtext', 'json'].includes(col.type)) {
    input = `<textarea class="form-control" id="${esc(id)}" name="${esc(n)}" rows="3" ${req}>${esc(v)}</textarea>`;
  } else {
    let type = 'text', extra = '';
    if (['int', 'smallint', 'mediumint', 'bigint', 'tinyint'].includes(col.type)) { type = 'number'; extra = 'step="1"'; }
    if (['decimal', 'float', 'double'].includes(col.type)) { type = 'number'; extra = 'step="0.01"'; }
    if (/unsigned/i.test(col.columnType) || /price|stock|quantity|qty|amount/i.test(n)) extra += ' min="0"';
    if (col.type === 'date') type = 'date';
    if (col.type === 'datetime' || col.type === 'timestamp') type = 'datetime-local';
    if (/email/i.test(n)) type = 'email';
    if (/phone|mobile|tel/i.test(n)) { type = 'tel'; extra += ' pattern="^(\\+?254|0)[17]\\d{8}$"'; }
    let val = v;
    if (type === 'datetime-local' && val) val = String(val).replace(' ', 'T').slice(0, 16);
    if (type === 'date' && val) val = String(val).slice(0, 10);
    input = `<input type="${type}" class="form-control" id="${esc(id)}" name="${esc(n)}" value="${esc(val)}" ${extra} ${req}
      ${col.maxLength && type === 'text' ? `maxlength="${col.maxLength}"` : ''}>`;
  }

  let hint = '';
  if (col.sensitive && /pass/i.test(n)) hint = 'Stored as a secure hash, never as plain text.';
  else if (/image|img|photo/i.test(n)) hint = 'Image path or URL, for example assets/images/pen.jpg';
  else if (/phone|mobile/i.test(n)) hint = 'Kenyan format, for example 0712345678';
  const wide = ['text', 'mediumtext', 'longtext', 'json'].includes(col.type);
  return `<div class="${wide ? 'col-12' : 'col-md-6'}">${label}${input}
    <div class="invalid-feedback">Please fill in ${esc(pretty(n).toLowerCase())} correctly.</div>
    ${hint ? `<div class="form-text">${esc(hint)}</div>` : ''}</div>`;
}

async function openRecordForm(id) {
  const t = state.table;
  const isEdit = id !== null;
  let row = {};
  if (isEdit) {
    try { row = (await api(`/tables/${encodeURIComponent(t.name)}/rows/${encodeURIComponent(id)}`)).row; }
    catch (err) { return toast(err.message, 'danger'); }
  }
  const editable = t.meta.columns.filter(c => !c.autoIncrement && !c.autoTimestamp && !(isEdit && c.primary));
  $('#recordTitle').innerHTML = `<i class="fa-solid ${tableIcon(t.name)} me-2"></i>${isEdit ? 'Edit' : 'Add'} ${esc(pretty(t.name).replace(/s$/, ''))}${isEdit ? ` <span class="text-secondary fs-6">#${esc(id)}</span>` : ''}`;
  $('#recordError').classList.add('d-none');
  $('#recordFields').innerHTML = editable.map(c => inputFor(c, row[c.name], isEdit)).join('')
    || '<p class="text-secondary">This table has no editable fields.</p>';
  $('#recordForm').classList.remove('was-validated');
  $('#recordForm').dataset.id = isEdit ? id : '';

  // fill dropdowns for linked tables
  document.querySelectorAll('#recordFields select[data-fk]').forEach(async sel => {
    try {
      const { options } = await api(`/tables/${encodeURIComponent(sel.dataset.fk)}/options?column=${encodeURIComponent(sel.dataset.fkcol)}`);
      const current = sel.dataset.value;
      sel.innerHTML = `<option value="">Choose a ${esc(pretty(sel.dataset.fk).toLowerCase().replace(/ies$/, "y").replace(/s$/, ""))}...</option>` +
        options.map(o => `<option value="${esc(o.value)}" ${String(o.value) === String(current) ? 'selected' : ''}>${esc(o.label)} (#${esc(o.value)})</option>`).join('');
    } catch (err) {
      sel.innerHTML = `<option value="${esc(sel.dataset.value)}">${esc(sel.dataset.value || 'Could not load options')}</option>`;
    }
  });

  formDirty = false;
  bootstrap.Modal.getOrCreateInstance($('#recordModal')).show();
  setTimeout(() => { const first = $('#recordFields input, #recordFields select, #recordFields textarea'); if (first) first.focus(); }, 350);
}

$('#recordForm').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  form.classList.add('was-validated');
  if (!form.checkValidity()) {
    const bad = form.querySelector(':invalid');
    if (bad) bad.focus();
    $('#recordError').textContent = 'Some fields need your attention. They are highlighted in red.';
    $('#recordError').classList.remove('d-none');
    return;
  }
  const t = state.table;
  const id = form.dataset.id;
  const data = {};
  form.querySelectorAll('[name]').forEach(el => { data[el.name] = el.value; });
  const btn = $('#recordSave');
  btn.disabled = true;
  try {
    if (id) await api(`/tables/${encodeURIComponent(t.name)}/rows/${encodeURIComponent(id)}`, { method: 'PUT', body: { data } });
    else await api(`/tables/${encodeURIComponent(t.name)}/rows`, { method: 'POST', body: { data } });
    formDirty = false;
    bootstrap.Modal.getInstance($('#recordModal')).hide();
    toast(id ? 'Changes saved.' : 'Record added.');
    loadRows();
  } catch (err) {
    $('#recordError').textContent = err.message;
    $('#recordError').classList.remove('d-none');
  } finally {
    btn.disabled = false;
  }
});

async function deleteRecord(id) {
  const t = state.table;
  const ok = await confirmBox(`Delete this ${pretty(t.name).replace(/s$/, '').toLowerCase()}?`, `Record #${id} will be removed from the database. This cannot be undone.`);
  if (!ok) return;
  try {
    await api(`/tables/${encodeURIComponent(t.name)}/rows/${encodeURIComponent(id)}`, { method: 'DELETE' });
    toast('Record deleted.');
    if (t.rows.length === 1 && t.page > 1) t.page--;
    loadRows();
  } catch (err) {
    toast(err.message, 'danger');
  }
}

/* ---------- reports ---------- */

async function fetchAllRows() {
  const t = state.table;
  const params = new URLSearchParams({ search: t.search, sort: t.sort || '', dir: t.dir, limit: 'all' });
  return (await api(`/tables/${encodeURIComponent(t.name)}/rows?${params}`)).rows;
}

async function exportCsv() {
  try {
    const t = state.table;
    const cols = visibleColumns();
    const rows = await fetchAllRows();
    const cell = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const csv = [cols.map(c => cell(pretty(c.name))).join(','), ...rows.map(r => cols.map(c => cell(r[c.name])).join(','))].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `${t.name}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    toast(`Exported ${rows.length} record(s).`);
  } catch (err) {
    toast(err.message, 'danger');
  }
}

async function printReport() {
  try {
    const t = state.table;
    const cols = visibleColumns();
    const rows = await fetchAllRows();
    const w = window.open('', '_blank');
    if (!w) return toast('Allow pop ups for this site to print reports.', 'warning');
    const now = new Date().toLocaleString('en-KE', { dateStyle: 'full', timeStyle: 'short' });
    w.document.write(`<!DOCTYPE html><html><head><title>${esc(pretty(t.name))} report</title><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600&family=Playfair+Display:wght@700&display=swap" rel="stylesheet">
      <style>
        body{font-family:'DM Sans',Arial,sans-serif;color:#263238;margin:32px}
        .head{display:flex;align-items:center;gap:14px;border-bottom:3px solid #e58b45;padding-bottom:14px;margin-bottom:18px}
        .logo{width:48px;height:48px;border-radius:50%;background:#172b4d;color:#e58b45;display:grid;place-items:center;font-family:'Playfair Display',Georgia,serif;font-weight:700;font-size:20px}
        h1{margin:0;font-size:24px;font-family:'Playfair Display',Georgia,serif;color:#172b4d} h2{margin:2px 0 0;font-size:15px;font-weight:500;color:#555}
        .meta{font-size:12px;color:#555;margin-bottom:14px}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th{background:#172b4d;color:#fff;text-align:left;padding:8px}
        td{padding:6px 7px;border-bottom:1px solid #e5e7ef}
        tr:nth-child(even) td{background:#faf8f3}
        .foot{margin-top:18px;font-size:11px;color:#777;display:flex;justify-content:space-between}
        @media print{button{display:none}}
      </style></head><body>
      <div class="head"><div class="logo">CS</div><div><h1>${SHOP_NAME}</h1><h2>${esc(pretty(t.name))} report</h2></div>
        <button style="margin-left:auto;padding:8px 16px" onclick="window.print()">Print</button></div>
      <div class="meta">Generated: ${esc(now)}<br>Prepared by: ${esc(state.admin.name || state.admin.email)}<br>
        Filter: ${t.search ? '"' + esc(t.search) + '"' : 'none'} &nbsp; | &nbsp; Sorted by: ${esc(pretty(t.sort || ''))} (${t.dir === 'asc' ? 'ascending' : 'descending'})
        &nbsp; | &nbsp; Records: ${rows.length}</div>
      <table><thead><tr>${cols.map(c => `<th>${esc(pretty(c.name))}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr>${cols.map(c => `<td>${esc(['date', 'datetime', 'timestamp'].includes(c.type) ? fmtDate(r[c.name]) : r[c.name])}</td>`).join('')}</tr>`).join('')}</tbody></table>
      <div class="foot"><span>${SHOP_NAME} Admin Panel</span><span>Confidential</span></div>
      </body></html>`);
    w.document.close();
  } catch (err) {
    toast(err.message, 'danger');
  }
}

/* ---------- audit trail ---------- */

const auditState = { search: '', page: 1, actor: '' };

async function renderAudit() {
  setActive('audit', 'Audit trail');
  view.innerHTML = `
    <div class="toolbar">
      <div class="input-group search">
        <span class="input-group-text bg-white"><i class="fa-solid fa-magnifying-glass"></i></span>
        <input type="search" class="form-control" id="searchBox" placeholder="Search by user, action, table or record... (press /)" value="${esc(auditState.search)}">
      </div>
      <select class="form-select w-auto" id="actorFilter" title="Who did it">
        <option value="">Everyone</option>
        <option value="admin" ${auditState.actor === 'admin' ? 'selected' : ''}>Admins</option>
        <option value="customer" ${auditState.actor === 'customer' ? 'selected' : ''}>Customers</option>
        <option value="system" ${auditState.actor === 'system' ? 'selected' : ''}>System</option>
      </select>
      <span class="ms-auto text-secondary small">Every login, order, payment and change is recorded here and cannot be edited from the panel.</span>
    </div>
    <div class="table-wrap" id="auditWrap"><div class="empty">Loading...</div></div>
    <div class="d-flex align-items-center mt-3 pager" id="pager"></div>`;
  let timer;
  $('#searchBox').addEventListener('input', e => {
    clearTimeout(timer);
    timer = setTimeout(() => { auditState.search = e.target.value.trim(); auditState.page = 1; loadAudit(); }, 300);
  });
  $('#actorFilter').onchange = e => { auditState.actor = e.target.value; auditState.page = 1; loadAudit(); };
  await loadAudit();
}

async function loadAudit() {
  const d = await api(`/audit?${new URLSearchParams({ search: auditState.search, actor: auditState.actor, page: auditState.page, limit: 20 })}`);
  $('#auditWrap').innerHTML = d.rows.length ? `
    <table class="table data-table mb-0"><thead><tr>
      <th class="no-sort">When</th><th class="no-sort">Who</th><th class="no-sort">Action</th><th class="no-sort">Table</th><th class="no-sort">Record</th><th class="no-sort">Details</th><th class="no-sort">IP</th>
    </tr></thead><tbody>
    ${d.rows.map(r => `<tr><td class="small">${esc(fmtDate(r.created_at))}</td><td>${esc(r.actor_email || '')}<div class="small text-secondary text-capitalize">${esc(r.actor_type)}</div></td>
      <td><span class="badge ${actionBadge(r.action)}">${esc(r.action)}</span></td>
      <td>${esc(r.table_name ? pretty(r.table_name) : '')}</td><td>${esc(r.record_id || '')}</td>
      <td class="small text-secondary" title="${esc(r.details || '')}">${esc(r.details || '')}</td><td class="small">${esc(r.ip_address || '')}</td></tr>`).join('')}
    </tbody></table>` : '<div class="empty"><i class="fa-regular fa-folder-open d-block"></i>No matching activity.</div>';
  const pages = Math.max(Math.ceil(d.total / d.limit), 1);
  $('#pager').innerHTML = `<span class="text-secondary small">${d.total.toLocaleString()} entr${d.total === 1 ? 'y' : 'ies'}</span>
    <div class="ms-auto btn-group">
      <button class="btn btn-light btn-sm" id="prevPg" ${auditState.page <= 1 ? 'disabled' : ''}><i class="fa-solid fa-chevron-left"></i></button>
      <button class="btn btn-light btn-sm" disabled>Page ${auditState.page} of ${pages}</button>
      <button class="btn btn-light btn-sm" id="nextPg" ${auditState.page >= pages ? 'disabled' : ''}><i class="fa-solid fa-chevron-right"></i></button></div>`;
  $('#prevPg').onclick = () => { auditState.page--; loadAudit(); };
  $('#nextPg').onclick = () => { auditState.page++; loadAudit(); };
}

/* ---------- admin accounts ---------- */

async function renderAdmins() {
  if (state.admin.role !== 'super_admin') { location.hash = 'dashboard'; return; }
  setActive('admins', 'Admin accounts');
  const { rows } = await api('/admins');
  view.innerHTML = `
    <div class="row g-3">
      <div class="col-lg-8">
        <div class="table-wrap"><table class="table data-table mb-0"><thead><tr>
          <th class="no-sort">Name</th><th class="no-sort">Email</th><th class="no-sort">Role</th><th class="no-sort">Status</th><th class="no-sort">2FA</th><th class="no-sort">Last login</th><th class="no-sort text-end">Actions</th></tr></thead>
          <tbody>${rows.map(a => `<tr>
            <td>${esc(a.full_name)}${a.id === state.admin.id ? ' <span class="badge badge-soft">You</span>' : ''}</td>
            <td>${esc(a.email)}</td>
            <td><span class="badge ${a.role === 'super_admin' ? 'badge-warn' : 'badge-soft'}">${a.role === 'super_admin' ? 'Super admin' : 'Admin'}</span></td>
            <td><span class="badge ${a.is_active ? 'badge-ok' : 'badge-off'}">${a.is_active ? 'Active' : 'Disabled'}</span></td>
            <td class="small">${a.twofa_enabled ? '<i class="fa-solid fa-mobile-screen-button me-1"></i>App' : '<i class="fa-regular fa-envelope me-1"></i>Email code'}</td>
            <td class="small">${esc(fmtDate(a.last_login) || 'Never')}</td>
            <td class="text-end text-nowrap">${a.id === state.admin.id ? '' : `
              <button class="btn btn-sm btn-light" title="${a.is_active ? 'Disable' : 'Enable'}" onclick="toggleAdmin(${a.id}, ${a.is_active ? 0 : 1})"><i class="fa-solid ${a.is_active ? 'fa-user-slash' : 'fa-user-check'}"></i></button>
              <button class="btn btn-sm btn-light" title="Switch role" onclick="switchRole(${a.id}, '${a.role === 'super_admin' ? 'admin' : 'super_admin'}')"><i class="fa-solid fa-user-gear"></i></button>
              <button class="btn btn-sm btn-light" title="Reset password" onclick="resetAdminPw(${a.id}, '${esc(a.email)}')"><i class="fa-solid fa-key"></i></button>
              ${a.twofa_enabled ? `<button class="btn btn-sm btn-light" title="Reset two factor (back to email codes)" onclick="resetAdmin2fa(${a.id}, '${esc(a.email)}')"><i class="fa-solid fa-shield-halved"></i></button>` : ''}
              <button class="btn btn-sm btn-light text-danger" title="Delete" onclick="deleteAdmin(${a.id}, '${esc(a.email)}')"><i class="fa-solid fa-trash"></i></button>`}</td>
          </tr>`).join('')}</tbody></table></div>
      </div>
      <div class="col-lg-4">
        <form class="panel" id="newAdminForm" novalidate>
          <h6 class="fw-bold mb-3"><i class="fa-solid fa-user-plus me-2"></i>Add admin</h6>
          <div class="mb-2"><label class="form-label required">Full name</label><input class="form-control" name="full_name" required maxlength="100"></div>
          <div class="mb-2"><label class="form-label required">Email</label><input type="email" class="form-control" name="email" required></div>
          <div class="mb-2"><label class="form-label required">Role</label><select class="form-select" name="role"><option value="admin">Admin</option><option value="super_admin">Super admin</option></select></div>
          <div class="mb-3"><label class="form-label required">Temporary password</label><input type="password" class="form-control" name="password" required minlength="8" autocomplete="new-password">
            <div class="form-text">At least 8 characters, letters and numbers.</div></div>
          <button class="btn btn-accent w-100">Create admin</button>
        </form>
      </div>
    </div>`;
  $('#newAdminForm').onsubmit = async e => {
    e.preventDefault();
    const f = e.target;
    f.classList.add('was-validated');
    if (!f.checkValidity()) return;
    try {
      await api('/admins', { method: 'POST', body: Object.fromEntries(new FormData(f)) });
      toast('Admin account created.');
      renderAdmins();
    } catch (err) { toast(err.message, 'danger'); }
  };
}

async function toggleAdmin(id, active) {
  try { await api(`/admins/${id}`, { method: 'PUT', body: { is_active: active } }); toast(active ? 'Admin enabled.' : 'Admin disabled.'); renderAdmins(); }
  catch (err) { toast(err.message, 'danger'); }
}
async function switchRole(id, role) {
  try { await api(`/admins/${id}`, { method: 'PUT', body: { role } }); toast('Role updated.'); renderAdmins(); }
  catch (err) { toast(err.message, 'danger'); }
}
async function resetAdminPw(id, email) {
  const pw = prompt(`New password for ${email} (at least 8 characters, letters and numbers):`);
  if (!pw) return;
  try { await api(`/admins/${id}/reset-password`, { method: 'POST', body: { password: pw } }); toast('Password reset.'); }
  catch (err) { toast(err.message, 'danger'); }
}
async function resetAdmin2fa(id, email) {
  if (!(await confirmBox('Reset two factor authentication?', `${email} will get sign in codes by email until they link a new authenticator app.`, 'Yes, reset'))) return;
  try { await api(`/admins/${id}/reset-2fa`, { method: 'POST', body: {} }); toast('Two factor setting reset.'); renderAdmins(); }
  catch (err) { toast(err.message, 'danger'); }
}
async function deleteAdmin(id, email) {
  if (!(await confirmBox('Delete admin account?', `${email} will lose access to the admin panel.`))) return;
  try { await api(`/admins/${id}`, { method: 'DELETE' }); toast('Admin deleted.'); renderAdmins(); }
  catch (err) { toast(err.message, 'danger'); }
}

/* ---------- my security: password and two factor authentication ---------- */

async function renderProfile() {
  setActive('profile', 'Security');
  view.innerHTML = `
    <div class="row g-3">
      <div class="col-lg-5">
        <form class="panel" id="pwForm" novalidate>
          <h6 class="fw-bold mb-3"><i class="fa-solid fa-key me-2"></i>Change your password</h6>
          <div class="mb-3"><label class="form-label required">Current password</label><input type="password" class="form-control" name="currentPassword" required autocomplete="current-password"></div>
          <div class="mb-3"><label class="form-label required">New password</label><input type="password" class="form-control" name="newPassword" required minlength="8" autocomplete="new-password">
            <div class="form-text">At least 8 characters, with letters and numbers.</div></div>
          <div class="mb-3"><label class="form-label required">Confirm new password</label><input type="password" class="form-control" name="confirm" required autocomplete="new-password">
            <div class="invalid-feedback">Passwords do not match.</div></div>
          <button class="btn btn-accent">Update password</button>
        </form>
      </div>
      <div class="col-lg-7"><div class="panel" id="twofaPanel"><div class="empty">Loading...</div></div></div>
    </div>`;
  $('#pwForm').onsubmit = async e => {
    e.preventDefault();
    const f = e.target;
    f.confirm.setCustomValidity(f.confirm.value === f.newPassword.value ? '' : 'mismatch');
    f.classList.add('was-validated');
    if (!f.checkValidity()) return;
    try {
      await api('/me/password', { method: 'POST', body: { currentPassword: f.currentPassword.value, newPassword: f.newPassword.value } });
      sessionStorage.removeItem('adminDefaultPw');
      toast('Password updated.');
      f.reset(); f.classList.remove('was-validated');
    } catch (err) { toast(err.message, 'danger'); }
  };
  await renderTwoFactor();
}

// Only digits in 6 digit code boxes (key trapping)
function digitsOnly(input) {
  input.addEventListener('keydown', e => {
    const allowed = ['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter'];
    if (e.ctrlKey || e.metaKey || allowed.includes(e.key)) return;
    if (!/^[0-9]$/.test(e.key)) e.preventDefault();
  });
  input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 6); });
}

async function renderTwoFactor() {
  const panel = $('#twofaPanel');
  let info;
  try { info = await api('/me/2fa'); } catch (err) { panel.innerHTML = `<div class="text-danger">${esc(err.message)}</div>`; return; }

  const title = `<h6 class="fw-bold mb-2"><i class="fa-solid fa-shield-halved me-2"></i>Two factor authentication</h6>`;
  if (info.appEnabled) {
    panel.innerHTML = `${title}
      <p class="mb-2"><span class="badge badge-ok">On</span> Codes come from your <strong>authenticator app</strong>.</p>
      <p class="small text-secondary">Every sign in needs your password and the 6 digit code from the app. If you lose your phone,
        choose "Use an email code instead" on the sign in page, or ask a super admin to reset your two factor setting.</p>
      <form id="removeAppForm" class="mt-3" novalidate style="max-width:360px">
        <div class="small fw-semibold mb-1">Remove the app and go back to emailed codes</div>
        <div class="input-group">
          <input type="password" class="form-control" name="password" placeholder="Your password" required autocomplete="current-password">
          <button class="btn btn-outline-danger">Remove app</button>
        </div>
      </form>`;
    $('#removeAppForm').onsubmit = async e => {
      e.preventDefault();
      if (!e.target.password.value) return toast('Enter your password.', 'danger');
      try { const r = await api('/me/2fa/disable', { method: 'POST', body: { password: e.target.password.value } }); toast(r.message); renderTwoFactor(); }
      catch (err) { toast(err.message, 'danger'); }
    };
    return;
  }

  panel.innerHTML = `${title}
    <p class="mb-2"><span class="badge badge-ok">On</span> Codes are sent by <strong>email</strong> to ${esc(info.email)}.</p>
    <p class="small text-secondary">Every sign in needs your password and a 6 digit code. For stronger security, link an authenticator app
      such as Google Authenticator or Microsoft Authenticator. The app works without internet or email.</p>
    <button class="btn btn-accent" id="setupAppBtn"><i class="fa-solid fa-mobile-screen-button me-2"></i>Set up authenticator app</button>
    <div id="setupArea"></div>`;

  $('#setupAppBtn').onclick = async () => {
    let d;
    try { d = await api('/me/2fa/setup', { method: 'POST', body: {} }); } catch (err) { return toast(err.message, 'danger'); }
    $('#setupAppBtn').classList.add('d-none');
    $('#setupArea').innerHTML = `
      <ol class="small mt-2 ps-3">
        <li>Open the authenticator app on your phone and choose <strong>Add account</strong> or <strong>+</strong>.</li>
        <li>Scan this QR code. If you cannot scan, choose "Enter a setup key" and type the key below.</li>
        <li>Type the 6 digit code the app shows, then click <strong>Confirm</strong>.</li>
      </ol>
      <div class="d-flex flex-wrap gap-3 align-items-center">
        <div class="qr-box"><img src="${d.qr}" alt="QR code for your authenticator app" width="180" height="180"></div>
        <div>
          <div class="small text-secondary mb-1">Setup key</div>
          <div class="secret-key mb-3">${esc(d.formattedSecret)}</div>
          <form id="confirmAppForm" novalidate>
            <div class="input-group" style="max-width:260px">
              <input class="form-control code-input" style="font-size:20px;letter-spacing:6px" name="code" inputmode="numeric" maxlength="6" placeholder="000000" autocomplete="one-time-code" required>
              <button class="btn btn-accent">Confirm</button>
            </div>
          </form>
        </div>
      </div>`;
    const codeBox = $('#confirmAppForm').code;
    digitsOnly(codeBox);
    codeBox.focus();
    $('#confirmAppForm').onsubmit = async e => {
      e.preventDefault();
      if (!/^\d{6}$/.test(codeBox.value)) return toast('Enter the 6 digit code from the app.', 'danger');
      try { const r = await api('/me/2fa/enable', { method: 'POST', body: { code: codeBox.value } }); toast(r.message); renderTwoFactor(); }
      catch (err) { toast(err.message, 'danger'); codeBox.select(); }
    };
  };
}

/* ---------- key trapping and recovery ---------- */

// Number boxes: browsers let "e", "+" and "-" through, so block them here.
// Whole number boxes (stock, quantity) also refuse a decimal point.
document.addEventListener('keydown', e => {
  const t = e.target;
  if (!(t instanceof HTMLInputElement) || t.type !== 'number') return;
  if (['e', 'E', '+', '-'].includes(e.key) || (e.key === '.' && t.step === '1')) e.preventDefault();
});

// Unsaved changes: closing a form by mistake (Esc, the X or a click outside) asks first
let formDirty = false;
$('#recordForm').addEventListener('input', () => { formDirty = true; });
$('#recordModal').addEventListener('hide.bs.modal', e => {
  if (formDirty && !window.confirm('You have changes that are not saved. Close the form and lose them?')) e.preventDefault();
  else formDirty = false;
});

// Lost connection: say so, and nothing typed in an open form is lost
window.addEventListener('offline', () => toast('The connection was lost. Keep this page open; you can save again once it is back.', 'danger'));
window.addEventListener('online', () => toast('Connection is back.'));

/* ---------- keyboard shortcuts ---------- */

document.addEventListener('keydown', e => {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
  if (e.key === 'F1') { e.preventDefault(); bootstrap.Modal.getOrCreateInstance($('#helpModal')).show(); }
  else if (e.key === '/' && !typing) { const s = $('#searchBox'); if (s) { e.preventDefault(); s.focus(); } }
  else if (e.altKey && e.key.toLowerCase() === 'n') { const b = $('#addBtn'); if (b) { e.preventDefault(); b.click(); } }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && $('#recordModal').classList.contains('show')) {
    e.preventDefault(); $('#recordForm').requestSubmit();
  }
});

/* ---------- start ---------- */

$('#helpLink').onclick = e => { e.preventDefault(); bootstrap.Modal.getOrCreateInstance($('#helpModal')).show(); };
$('#menuBtn').onclick = () => $('#sidebar').classList.toggle('open');
$('#logoutBtn').onclick = async () => {
  try { await api('/logout', { method: 'POST' }); } catch (e) { /* still log out locally */ }
  sessionStorage.clear();
  location.href = 'login.html';
};
window.addEventListener('hashchange', route);

(async function start() {
  try {
    const { tables } = await api('/tables');
    state.tables = tables;
  } catch (err) {
    view.innerHTML = errorPanel(err.message);
  }
  renderShell();
  route();
})();
