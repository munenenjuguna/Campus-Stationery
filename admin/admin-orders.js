// admin/admin-orders.js
// Admin screens for the main transaction: dashboard, order management and reports.
// Uses the shared helpers defined in admin.js (api, esc, money, fmtDate, toast, confirmBox, state, view, $).
// Only functions live here; admin.js calls them when the matching page is opened.

/* ---------- shared labels ---------- */

const ORDER_STATUSES = ['Pending', 'Processing', 'Ready for Collection', 'Completed', 'Cancelled'];

function statusBadge(status) {
  const cls = { 'Pending': 'badge-warn', 'Processing': 'badge-info', 'Ready for Collection': 'badge-info', 'Completed': 'badge-ok', 'Cancelled': 'badge-off' }[status] || 'badge-soft';
  return `<span class="badge ${cls}">${esc(status)}</span>`;
}

function paymentBadge(status, method) {
  const label = status === 'Pending' && method === 'Cash on Collection' ? 'Pay on collection' : status;
  const cls = { Paid: 'badge-ok', Pending: 'badge-warn', Failed: 'badge-off', Cancelled: 'badge-soft' }[status] || 'badge-soft';
  return `<span class="badge ${cls}">${esc(label || 'None')}</span>`;
}

function phoneDisplay(phone) {
  const p = String(phone || '');
  return /^254\d{9}$/.test(p) ? '0' + p.slice(3) : p;
}

const localDay = offset => new Date(Date.now() + offset * 86400000).toLocaleDateString('en-CA');

// KES 68,200 (no cents) for the big dashboard numbers
const moneyShort = v => 'KES ' + Math.round(Number(v || 0)).toLocaleString('en-KE');

// 14 Nov, 18:46
const shortDate = v => {
  const d = new Date(String(v).replace(' ', 'T'));
  return isNaN(d) ? v : d.toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};


/* ---------- dashboard ---------- */

let salesChart = null;

async function renderDashboard() {
  setActive('dashboard', 'Dashboard');
  view.innerHTML = '<div class="text-secondary">Loading dashboard...</div>';
  const d = await api('/dashboard');
  const k = d.kpis;
  $('#dbFoot').innerHTML = `<span class="dot ok me-2"></span>${esc(d.database)}<br><span class="opacity-75">MySQL ${esc(d.version)}</span>
    <br><span class="opacity-75">M-Pesa: ${d.paymentMode === 'demo' ? 'demo mode' : 'Daraja sandbox'}</span>`;

  const kpi = (icon, value, label, link, extra = '') => `
    <div class="col-6 col-xl-3">
      <a class="panel stat h-100 text-decoration-none ${extra}" href="${link}">
        <div class="stat-icon"><i class="fa-solid ${icon}"></i></div>
        <div><div class="stat-num">${value}</div><div class="stat-label">${label}</div></div>
      </a></div>`;

  view.innerHTML = `
    ${sessionStorage.getItem('adminDefaultPw') ? `<div class="alert alert-warning d-flex align-items-center"><i class="fa-solid fa-shield-halved me-2"></i>You are using the default password. <a href="#profile" class="ms-1">Change it now</a>.</div>` : ''}
    <div class="row g-3 mb-3">
      ${kpi('fa-sack-dollar', esc(moneyShort(k.revenue)), 'Total sales (all time)', '#reports', 'hero-stat')}
      ${kpi('fa-calendar-week', esc(moneyShort(k.revenue30)), 'Sales in the last 30 days', '#reports')}
      ${kpi('fa-cart-shopping', k.openOrders, `Open orders (${k.pendingOrders} new)`, '#orders')}
      ${kpi('fa-triangle-exclamation', k.lowStock, `Products at ${d.lowStockLevel} or fewer`, '#reports/inventory')}
    </div>
    <div class="row g-3 mb-3">
      <div class="col-lg-8">
        <div class="panel h-100">
          <div class="d-flex align-items-center mb-2"><h6 class="fw-bold mb-0"><i class="fa-solid fa-chart-column me-2 text-secondary"></i>Sales in the last 7 days</h6>
            <span class="ms-auto small text-secondary">${k.ordersToday} order(s) today &middot; ${k.customers} customers &middot; ${k.products} products</span></div>
          <div style="height:240px"><canvas id="salesChart" aria-label="Sales per day for the last 7 days"></canvas></div>
        </div>
      </div>
      <div class="col-lg-4">
        <div class="panel h-100">
          <div class="d-flex align-items-center mb-3"><h6 class="fw-bold mb-0"><i class="fa-solid fa-boxes-stacked me-2 text-warning"></i>Low stock</h6>
            <a class="ms-auto small" href="#reports/inventory">Stock report</a></div>
          ${d.lowStock.length ? `<table class="table table-sm mb-0"><tbody>${d.lowStock.map(r => `
            <tr><td>${esc(r.label)}</td><td class="text-end"><span class="badge ${Number(r.stock) <= 0 ? 'badge-off' : 'badge-warn'}">${Number(r.stock) <= 0 ? 'Out of stock' : esc(r.stock) + ' left'}</span></td></tr>`).join('')}</tbody></table>`
            : '<p class="text-secondary small mb-0">All products are well stocked.</p>'}
        </div>
      </div>
    </div>
    <div class="row g-3">
      <div class="col-lg-7">
        <div class="panel h-100">
          <div class="d-flex align-items-center mb-3"><h6 class="fw-bold mb-0"><i class="fa-solid fa-receipt me-2 text-secondary"></i>Latest orders</h6>
            <a class="ms-auto small" href="#orders">All orders</a></div>
          ${d.recentOrders.length ? `<table class="table table-sm align-middle mb-0"><tbody>${d.recentOrders.map(o => `
            <tr class="clickable" data-order="${o.id}">
              <td><div class="fw-semibold text-nowrap">${esc(o.order_ref)}</div><div class="small text-secondary">${esc(o.customer_name)}</div></td>
              <td class="text-nowrap">${esc(moneyShort(o.total))}</td><td>${statusBadge(o.status)}</td>
              <td class="text-end small text-secondary text-nowrap">${esc(shortDate(o.created_at))}</td></tr>`).join('')}</tbody></table>`
            : '<p class="text-secondary small mb-0">No orders yet.</p>'}
        </div>
      </div>
      <div class="col-lg-5">
        <div class="panel h-100">
          <div class="d-flex align-items-center mb-3"><h6 class="fw-bold mb-0"><i class="fa-solid fa-clock-rotate-left me-2 text-secondary"></i>Recent activity</h6>
            <a class="ms-auto small" href="#audit">Audit trail</a></div>
          ${d.recent.length ? `<table class="table table-sm mb-0"><tbody>${d.recent.map(r => `
            <tr><td><span class="badge ${actionBadge(r.action)}">${esc(r.action)}</span>
              <div class="small text-secondary text-truncate" style="max-width:260px">${esc(r.actor_email || r.actor_type)}${r.record_id && r.table_name !== 'admins' ? ' &middot; ' + esc(r.record_id) : ''}</div></td>
            <td class="small text-secondary text-end text-nowrap">${esc(shortDate(r.created_at))}</td></tr>`).join('')}</tbody></table>`
            : '<p class="text-secondary small mb-0">No activity yet.</p>'}
        </div>
      </div>
    </div>`;

  document.querySelectorAll('tr[data-order]').forEach(tr => tr.onclick = () => openOrder(Number(tr.dataset.order)));
  drawSalesChart(d.sales7);
}

function drawSalesChart(days) {
  const canvas = $('#salesChart');
  if (!canvas) return;
  if (typeof Chart === 'undefined') {
    canvas.parentElement.innerHTML = `<table class="table table-sm">${days.map(x => `<tr><td>${esc(x.day)}</td><td>${esc(money(x.total))}</td></tr>`).join('')}</table>`;
    return;
  }
  if (salesChart) salesChart.destroy();
  const labels = days.map(x => new Date(x.day + 'T00:00:00').toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric' }));
  salesChart = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Sales (KES)', data: days.map(x => x.total), backgroundColor: '#172b4d', hoverBackgroundColor: '#e58b45', borderRadius: 6, maxBarThickness: 46 }] },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${money(c.raw)} from ${days[c.dataIndex].orders} order(s)` } } },
      scales: { y: { beginAtZero: true, ticks: { callback: v => 'KES ' + Number(v).toLocaleString() }, grid: { color: '#eeeeee' } }, x: { grid: { display: false } } }
    }
  });
}


/* ---------- orders ---------- */

const ordersState = { status: '', search: '', payment: '', from: '', to: '', page: 1, limit: 10, sort: 'date', dir: 'desc' };

async function renderOrders() {
  setActive('orders', 'Orders');
  view.innerHTML = `
    <div class="d-flex flex-wrap gap-2 mb-3" id="statusTabs"></div>
    <div class="toolbar">
      <div class="input-group search">
        <span class="input-group-text bg-white"><i class="fa-solid fa-magnifying-glass"></i></span>
        <input type="search" class="form-control" id="searchBox" placeholder="Order ref, customer or phone... (press /)" value="${esc(ordersState.search)}">
      </div>
      <select class="form-select w-auto" id="payFilter" title="Payment status">
        <option value="">Any payment</option>
        ${['Pending', 'Paid', 'Failed', 'Cancelled'].map(s => `<option ${ordersState.payment === s ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
      <input type="date" class="form-control w-auto" id="fromDate" value="${ordersState.from}" title="From date">
      <input type="date" class="form-control w-auto" id="toDate" value="${ordersState.to}" title="To date">
      <button class="btn btn-light" id="clearFilters" title="Clear filters"><i class="fa-solid fa-xmark"></i></button>
      <a class="btn btn-outline-secondary ms-auto" href="#reports/orders"><i class="fa-solid fa-file-lines me-1"></i>Orders report</a>
    </div>
    <div class="table-wrap" id="ordersWrap"><div class="empty">Loading...</div></div>
    <div class="d-flex align-items-center mt-3 pager" id="pager"></div>`;

  let timer;
  $('#searchBox').addEventListener('input', e => {
    clearTimeout(timer);
    timer = setTimeout(() => { ordersState.search = e.target.value.trim(); ordersState.page = 1; loadOrders(); }, 300);
  });
  $('#payFilter').onchange = e => { ordersState.payment = e.target.value; ordersState.page = 1; loadOrders(); };
  $('#fromDate').onchange = e => { ordersState.from = e.target.value; ordersState.page = 1; loadOrders(); };
  $('#toDate').onchange = e => { ordersState.to = e.target.value; ordersState.page = 1; loadOrders(); };
  $('#clearFilters').onclick = () => { Object.assign(ordersState, { status: '', search: '', payment: '', from: '', to: '', page: 1 }); renderOrders(); };
  await loadOrders();
}

async function loadOrders() {
  const s = ordersState;
  const params = new URLSearchParams({ page: s.page, limit: s.limit, sort: s.sort, dir: s.dir });
  ['status', 'search', 'payment', 'from', 'to'].forEach(key => { if (s[key]) params.set(key, s[key]); });
  if (s.payment) params.set('payment', s.payment);
  let d;
  try {
    d = await api(`/orders?${params}`);
  } catch (err) {
    $('#ordersWrap').innerHTML = errorPanel(err.message);
    return;
  }

  const counts = Object.fromEntries(d.statusCounts.map(c => [c.status, c.n]));
  const all = d.statusCounts.reduce((sum, c) => sum + c.n, 0);
  $('#statusTabs').innerHTML = [['', 'All', all], ...ORDER_STATUSES.map(st => [st, st, counts[st] || 0])].map(([value, label, n]) => `
    <button class="btn btn-sm ${s.status === value ? 'btn-accent' : 'btn-light'}" data-status="${esc(value)}">${esc(label)} <span class="badge badge-soft ms-1">${n}</span></button>`).join('');
  document.querySelectorAll('#statusTabs [data-status]').forEach(b => b.onclick = () => { s.status = b.dataset.status; s.page = 1; loadOrders(); });

  const sortHead = (key, label) => `<th data-sort="${key}" class="${s.sort === key ? 'sorted' : ''}">${label}
    <i class="fa-solid ${s.sort === key ? (s.dir === 'asc' ? 'fa-sort-up' : 'fa-sort-down') : 'fa-sort'} sort-icon"></i></th>`;

  $('#ordersWrap').innerHTML = d.rows.length ? `
    <table class="table data-table mb-0">
      <thead><tr>${sortHead('ref', 'Order')}${sortHead('date', 'Date')}${sortHead('customer', 'Customer')}<th class="no-sort">Items</th>
        ${sortHead('total', 'Total')}${sortHead('payment', 'Payment')}${sortHead('status', 'Status')}<th class="no-sort text-end">Actions</th></tr></thead>
      <tbody>${d.rows.map(o => `
        <tr class="clickable" data-order="${o.id}">
          <td class="fw-semibold">${esc(o.order_ref)}</td>
          <td>${esc(fmtDate(o.created_at))}</td>
          <td>${esc(o.customer_name)}<div class="small text-secondary">${esc(phoneDisplay(o.contact_phone))}</div></td>
          <td>${esc(o.item_count)}</td>
          <td>${esc(money(o.total))}</td>
          <td><div class="small">${esc(o.payment_method || '')}</div>${paymentBadge(o.payment_status, o.payment_method)}</td>
          <td>${statusBadge(o.status)}</td>
          <td class="text-end row-actions"><button class="btn btn-sm btn-light" title="Open order"><i class="fa-solid fa-eye"></i></button></td>
        </tr>`).join('')}</tbody>
    </table>` : `<div class="empty"><i class="fa-regular fa-folder-open d-block"></i>No orders match these filters.</div>`;

  document.querySelectorAll('#ordersWrap tr[data-order]').forEach(tr => tr.onclick = () => openOrder(Number(tr.dataset.order)));
  document.querySelectorAll('#ordersWrap th[data-sort]').forEach(th => th.onclick = () => {
    s.dir = s.sort === th.dataset.sort && s.dir === 'desc' ? 'asc' : 'desc';
    s.sort = th.dataset.sort;
    loadOrders();
  });

  const pages = Math.max(Math.ceil(d.total / d.limit), 1);
  $('#pager').innerHTML = `<span class="text-secondary small">${d.total} order(s)</span>
    <div class="ms-auto btn-group">
      <button class="btn btn-light btn-sm" id="prevPg" ${s.page <= 1 ? 'disabled' : ''}><i class="fa-solid fa-chevron-left"></i></button>
      <button class="btn btn-light btn-sm" disabled>Page ${s.page} of ${pages}</button>
      <button class="btn btn-light btn-sm" id="nextPg" ${s.page >= pages ? 'disabled' : ''}><i class="fa-solid fa-chevron-right"></i></button>
    </div>`;
  $('#prevPg').onclick = () => { s.page--; loadOrders(); };
  $('#nextPg').onclick = () => { s.page++; loadOrders(); };
}

// Order detail window with the allowed next steps
async function openOrder(id) {
  let d;
  try {
    d = await api(`/orders/${id}`);
  } catch (err) {
    return toast(err.message, 'danger');
  }
  const o = d.order;
  const paid = o.payments.some(p => p.status === 'Paid');
  const last = o.payments[o.payments.length - 1] || {};
  const nextButtons = d.next.map(st => st === 'Cancelled'
    ? `<button class="btn btn-outline-danger" data-next="Cancelled"><i class="fa-solid fa-ban me-1"></i>Cancel order</button>`
    : `<button class="btn btn-accent" data-next="${esc(st)}"><i class="fa-solid fa-arrow-right me-1"></i>Mark as ${esc(st)}</button>`).join('');

  $('#orderTitle').innerHTML = `Order ${esc(o.order_ref)} ${statusBadge(o.status)}`;
  $('#orderBody').innerHTML = `
    <div class="row g-3 mb-3">
      <div class="col-md-6"><div class="panel p-3 h-100">
        <h6 class="fw-bold"><i class="fa-solid fa-user me-2 text-secondary"></i>Customer</h6>
        <div>${esc(o.customer_name)}</div><div class="small text-secondary">${esc(o.customer_email)}</div>
        <div class="small text-secondary">${esc(phoneDisplay(o.contact_phone))}</div>
      </div></div>
      <div class="col-md-6"><div class="panel p-3 h-100">
        <h6 class="fw-bold"><i class="fa-solid fa-truck me-2 text-secondary"></i>Delivery</h6>
        <div>${esc(o.delivery_method)}</div><div class="small text-secondary">${esc(o.delivery_location || 'Collect from the shop')}</div>
        <div class="small text-secondary">Placed ${esc(fmtDate(o.created_at))}</div>
      </div></div>
    </div>
    <table class="table table-sm align-middle">
      <thead><tr><th>Item</th><th class="text-end">Qty</th><th class="text-end">Unit price</th><th class="text-end">Amount</th></tr></thead>
      <tbody>${o.items.map(i => `<tr><td>${esc(i.name)}</td><td class="text-end">${i.quantity}</td><td class="text-end">${esc(money(i.unit_price))}</td><td class="text-end">${esc(money(i.quantity * i.unit_price))}</td></tr>`).join('')}
        <tr><td colspan="3" class="text-end text-secondary">Subtotal</td><td class="text-end">${esc(money(o.subtotal))}</td></tr>
        <tr><td colspan="3" class="text-end text-secondary">Delivery</td><td class="text-end">${esc(money(o.delivery_fee))}</td></tr>
        <tr><td colspan="3" class="text-end fw-bold">Total</td><td class="text-end fw-bold">${esc(money(o.total))}</td></tr></tbody>
    </table>
    <h6 class="fw-bold mt-3"><i class="fa-solid fa-money-bill-wave me-2 text-secondary"></i>Payments</h6>
    <table class="table table-sm small">
      <thead><tr><th>Method</th><th>Amount</th><th>Status</th><th>Receipt</th><th>Note</th><th>Date</th></tr></thead>
      <tbody>${o.payments.map(p => `<tr><td>${esc(p.method)}</td><td>${esc(money(p.amount))}</td><td>${paymentBadge(p.status, p.method)}</td>
        <td>${esc(p.mpesa_receipt || '')}</td><td>${esc(p.result_message || '')}</td><td>${esc(fmtDate(p.paid_at || p.created_at))}</td></tr>`).join('')}</tbody>
    </table>
    ${!paid && o.status !== 'Cancelled' ? `
      <div class="d-flex flex-wrap gap-2 align-items-center bg-light rounded p-2">
        <span class="small text-secondary me-1">Payment not received yet.</span>
        <input class="form-control form-control-sm w-auto" id="receiptInput" placeholder="M-Pesa receipt (optional)" maxlength="30">
        <button class="btn btn-sm btn-success" id="markPaidBtn"><i class="fa-solid fa-check me-1"></i>Record payment received</button>
        ${last.method === 'M-Pesa' && last.status === 'Pending' && last.checkout_request_id ? `<button class="btn btn-sm btn-light" id="checkMpesaBtn"><i class="fa-solid fa-rotate me-1"></i>Check M-Pesa</button>` : ''}
      </div>` : ''}`;
  $('#orderActions').innerHTML = `
    <button class="btn btn-light me-auto" id="printInvoiceBtn"><i class="fa-solid fa-print me-1"></i>Print invoice</button>
    ${nextButtons || '<span class="text-secondary small">This order is closed. No further changes.</span>'}`;

  const modal = bootstrap.Modal.getOrCreateInstance($('#orderModal'));
  modal.show();

  document.querySelectorAll('#orderActions [data-next]').forEach(b => b.onclick = async () => {
    const next = b.dataset.next;
    if (next === 'Cancelled' && !(await confirmBox('Cancel this order?', `${o.order_ref} will be cancelled and its items returned to stock.${paid ? ' It is already paid, so a refund will be due.' : ''}`, 'Yes, cancel order'))) return;
    try {
      const r = await api(`/orders/${id}/status`, { method: 'PUT', body: { status: next } });
      toast(r.refundDue ? 'Order cancelled. A refund is due to the customer.' : `Order marked as ${next}.`);
      modal.hide();
      refreshAfterOrderChange();
    } catch (err) { toast(err.message, 'danger'); }
  });
  const markPaid = $('#markPaidBtn');
  if (markPaid) markPaid.onclick = async () => {
    try {
      await api(`/orders/${id}/payment/paid`, { method: 'POST', body: { receipt: $('#receiptInput').value } });
      toast('Payment recorded.');
      openOrder(id);
      refreshAfterOrderChange();
    } catch (err) { toast(err.message, 'danger'); }
  };
  const check = $('#checkMpesaBtn');
  if (check) check.onclick = async () => {
    try {
      const r = await api(`/orders/${id}/payment/check`, { method: 'POST' });
      toast(`M-Pesa says: ${r.status}${r.message ? ' (' + r.message + ')' : ''}`, r.status === 'Paid' ? 'success' : 'warning');
      openOrder(id);
    } catch (err) { toast(err.message, 'danger'); }
  };
  $('#printInvoiceBtn').onclick = () => printInvoice(o);
}

function refreshAfterOrderChange() {
  const hash = location.hash.replace('#', '');
  if (hash === 'orders') loadOrders();
  else if (hash === 'dashboard' || hash === '') renderDashboard();
}

function printInvoice(o) {
  const w = window.open('', '_blank');
  if (!w) return toast('Allow pop ups for this site to print.', 'warning');
  const paid = o.payments.find(p => p.status === 'Paid');
  w.document.write(`${letterhead(`Invoice ${esc(o.order_ref)}`)}
    <div class="meta">Customer: <strong>${esc(o.customer_name)}</strong> (${esc(o.customer_email)}, ${esc(phoneDisplay(o.contact_phone))})<br>
      Order date: ${esc(fmtDate(o.created_at))} &nbsp; | &nbsp; Status: ${esc(o.status)}<br>
      Delivery: ${esc(o.delivery_method)}${o.delivery_location ? ', ' + esc(o.delivery_location) : ''}<br>
      Payment: ${paid ? `${esc(paid.method)}, paid ${esc(fmtDate(paid.paid_at))}${paid.mpesa_receipt ? ', receipt ' + esc(paid.mpesa_receipt) : ''}` : 'Not yet paid'}</div>
    <table><thead><tr><th>Item</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead><tbody>
      ${o.items.map(i => `<tr><td>${esc(i.name)}</td><td>${i.quantity}</td><td>${esc(money(i.unit_price))}</td><td>${esc(money(i.quantity * i.unit_price))}</td></tr>`).join('')}
      <tr><td colspan="3">Subtotal</td><td>${esc(money(o.subtotal))}</td></tr>
      <tr><td colspan="3">Delivery</td><td>${esc(money(o.delivery_fee))}</td></tr>
      <tr class="total"><td colspan="3">Total</td><td>${esc(money(o.total))}</td></tr></tbody></table>
    ${letterfoot()}`);
  w.document.close();
}


/* ---------- reports ---------- */

const reportState = {
  type: 'sales',
  sales: { from: localDay(-29), to: localDay(0), group: 'day', paid: false, sort: '', dir: '' },
  orders: { from: localDay(-29), to: localDay(0), status: '', payment: '', method: '', sort: 'date', dir: 'desc' },
  inventory: { category: '', stock: '', sort: 'name', dir: 'asc' },
  last: null
};

const REPORT_TITLES = { sales: 'Sales Report', orders: 'Orders Report', inventory: 'Inventory and Stock Report' };

async function renderReports(type) {
  if (type && REPORT_TITLES[type]) reportState.type = type;
  setActive('reports', 'Reports');
  const t = reportState.type;
  let categories = [];
  if (t === 'inventory') {
    try { categories = (await api('/categories')).rows; } catch (e) { categories = []; }
  }
  const f = reportState[t];
  const sel = (id, options, value) => `<select class="form-select" id="${id}">${options.map(([v, l]) => `<option value="${esc(v)}" ${String(value) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const field = (label, html, col = 'col-md-3 col-6') => `<div class="${col}"><label class="form-label">${label}</label>${html}</div>`;

  let filters = '';
  if (t === 'sales') {
    filters = field('From', `<input type="date" class="form-control" id="fFrom" value="${f.from}">`) +
      field('To', `<input type="date" class="form-control" id="fTo" value="${f.to}">`) +
      field('Group by', sel('fGroup', [['day', 'Day'], ['product', 'Product'], ['category', 'Category'], ['method', 'Payment method']], f.group)) +
      field('Sort by', sel('fSort', [['', 'Default'], ['label', 'Name / date'], ['orders', 'Orders'], ['items', 'Items sold'], ['total', 'Amount']], f.sort), 'col-md-2 col-6') +
      field('Order', sel('fDir', [['', 'Default'], ['asc', 'Ascending'], ['desc', 'Descending']], f.dir), 'col-md-2 col-6') +
      `<div class="col-md-3 col-6 d-flex align-items-end"><div class="form-check"><input class="form-check-input" type="checkbox" id="fPaid" ${f.paid ? 'checked' : ''}>
         <label class="form-check-label" for="fPaid">Paid orders only</label></div></div>`;
  } else if (t === 'orders') {
    filters = field('From', `<input type="date" class="form-control" id="fFrom" value="${f.from}">`) +
      field('To', `<input type="date" class="form-control" id="fTo" value="${f.to}">`) +
      field('Order status', sel('fStatus', [['', 'Any status'], ...ORDER_STATUSES.map(s => [s, s])], f.status)) +
      field('Payment', sel('fPayment', [['', 'Any'], ['Paid', 'Paid'], ['Pending', 'Pending'], ['Failed', 'Failed'], ['Cancelled', 'Cancelled']], f.payment)) +
      field('Method', sel('fMethod', [['', 'Any method'], ['M-Pesa', 'M-Pesa'], ['Cash on Collection', 'Cash on Collection']], f.method)) +
      field('Sort by', sel('fSort', [['date', 'Date'], ['ref', 'Order ref'], ['customer', 'Customer'], ['total', 'Total'], ['status', 'Status']], f.sort)) +
      field('Order', sel('fDir', [['desc', 'Descending'], ['asc', 'Ascending']], f.dir), 'col-md-2 col-6');
  } else {
    filters = field('Category', sel('fCategory', [['', 'All categories'], ...categories.map(c => [c.slug, c.name])], f.category)) +
      field('Stock level', sel('fStock', [['', 'All products'], ['low', 'Low stock'], ['out', 'Out of stock']], f.stock)) +
      field('Sort by', sel('fSort', [['name', 'Product name'], ['category', 'Category'], ['price', 'Price'], ['stock', 'Stock'], ['value', 'Stock value'], ['sold', 'Units sold']], f.sort)) +
      field('Order', sel('fDir', [['asc', 'Ascending'], ['desc', 'Descending']], f.dir));
  }

  view.innerHTML = `
    <ul class="nav nav-pills report-tabs mb-3">
      ${Object.entries(REPORT_TITLES).map(([key, title]) => `<li class="nav-item"><a class="nav-link ${t === key ? 'active' : ''}" href="#reports/${key}">${esc(title)}</a></li>`).join('')}
    </ul>
    <form class="panel mb-3" id="reportForm">
      <div class="row g-3">${filters}</div>
      <div class="d-flex flex-wrap gap-2 mt-3">
        <button class="btn btn-accent" type="submit"><i class="fa-solid fa-play me-1"></i>Run report</button>
        <button class="btn btn-outline-secondary" type="button" id="printReportBtn" disabled><i class="fa-solid fa-print me-1"></i>Print / Save as PDF</button>
        <button class="btn btn-outline-secondary" type="button" id="csvReportBtn" disabled><i class="fa-solid fa-file-csv me-1"></i>Export CSV</button>
      </div>
    </form>
    <div id="reportOut"></div>`;

  $('#reportForm').addEventListener('submit', e => { e.preventDefault(); runReport(); });
  $('#printReportBtn').onclick = printCurrentReport;
  $('#csvReportBtn').onclick = csvCurrentReport;
  await runReport();
}

function readReportFilters() {
  const t = reportState.type;
  const f = reportState[t];
  const val = id => ($(id) ? $(id).value : '');
  if (t === 'sales') Object.assign(f, { from: val('#fFrom'), to: val('#fTo'), group: val('#fGroup'), sort: val('#fSort'), dir: val('#fDir'), paid: $('#fPaid').checked });
  if (t === 'orders') Object.assign(f, { from: val('#fFrom'), to: val('#fTo'), status: val('#fStatus'), payment: val('#fPayment'), method: val('#fMethod'), sort: val('#fSort'), dir: val('#fDir') });
  if (t === 'inventory') Object.assign(f, { category: val('#fCategory'), stock: val('#fStock'), sort: val('#fSort'), dir: val('#fDir') });
  return f;
}

// Column definitions for each report: [heading, value function, is it money?]
function reportColumns(type, group) {
  if (type === 'sales') {
    const first = { day: 'Date', product: 'Product', category: 'Category', method: 'Payment method' }[group];
    const cols = [[first, r => group === 'day' ? fmtDate(r.label) : r.label]];
    if (group === 'product') cols.push(['Category', r => r.category]);
    cols.push(['Orders', r => r.orders], ['Items sold', r => r.items]);
    if (group === 'day' || group === 'method') cols.push(['Goods', r => money(r.goods)], ['Delivery fees', r => money(r.delivery)]);
    cols.push([group === 'day' || group === 'method' ? 'Total sales' : 'Goods sold (excl. delivery)', r => money(r.total)]);
    return cols;
  }
  if (type === 'orders') {
    return [['Order', r => r.order_ref], ['Date', r => fmtDate(r.created_at)], ['Customer', r => r.customer_name], ['Phone', r => phoneDisplay(r.contact_phone)],
      ['Items', r => r.item_count], ['Total', r => money(r.total)], ['Payment', r => `${r.payment_method || ''} (${r.payment_status || ''})`], ['Status', r => r.status]];
  }
  return [['Product', r => r.name], ['Category', r => r.category], ['Price', r => money(r.price)], ['In stock', r => r.stock_quantity],
    ['Stock value', r => money(r.stock_value)], ['Units sold', r => r.sold], ['Status', r => r.stock_status]];
}

function summaryCards(type, s) {
  const card = (label, value) => `<div class="col-6 col-md-3"><div class="panel py-3"><div class="stat-label">${label}</div><div class="stat-num fs-4">${value}</div></div></div>`;
  if (type === 'sales') return [s.orders !== null ? card('Orders', s.orders) : '', card('Items sold', s.items), card('Total sales', esc(money(s.total)))].join('');
  if (type === 'orders') return [card('Orders', s.orders), card('Cancelled', s.cancelled), card('Value (not cancelled)', esc(money(s.total))), card('Paid', esc(money(s.paid)))].join('');
  return [card('Products', s.products), card('Units in stock', s.units), card('Stock value', esc(money(s.value))), card('Low / out of stock', `${s.low} / ${s.out}`)].join('');
}

async function runReport() {
  const t = reportState.type;
  const f = readReportFilters();
  const params = new URLSearchParams();
  Object.entries(f).forEach(([k, v]) => { if (v !== '' && v !== false && v != null) params.set(k, v === true ? '1' : v); });
  $('#reportOut').innerHTML = '<div class="text-secondary">Running report...</div>';
  try {
    const d = await api(`/reports/${t}?${params}`);
    const cols = reportColumns(t, d.filters.group);
    reportState.last = { type: t, data: d, cols };
    $('#reportOut').innerHTML = `
      <div class="row g-3 mb-3">${summaryCards(t, d.summary)}</div>
      <div class="table-wrap">${d.rows.length ? `
        <table class="table data-table mb-0"><thead><tr>${cols.map(c => `<th class="no-sort">${esc(c[0])}</th>`).join('')}</tr></thead>
        <tbody>${d.rows.map(r => `<tr>${cols.map(c => `<td>${esc(c[1](r))}</td>`).join('')}</tr>`).join('')}</tbody></table>`
        : '<div class="empty"><i class="fa-regular fa-folder-open d-block"></i>No records match these filters.</div>'}</div>`;
    $('#printReportBtn').disabled = !d.rows.length;
    $('#csvReportBtn').disabled = !d.rows.length;
  } catch (err) {
    reportState.last = null;
    $('#reportOut').innerHTML = errorPanel(err.message);
  }
}

function filterSummary(type, f) {
  const parts = [];
  if (f.from) parts.push(`Period: ${fmtDate(f.from)} to ${fmtDate(f.to)}`);
  if (type === 'sales') parts.push(`Grouped by ${{ day: 'day', product: 'product', category: 'category', method: 'payment method' }[f.group]}`, f.paidOnly ? 'Paid orders only' : 'All orders except cancelled');
  if (type === 'orders') parts.push(`Status: ${f.status || 'any'}`, `Payment: ${f.payment || 'any'}`, `Method: ${f.method || 'any'}`);
  if (type === 'inventory') parts.push(`Category: ${f.category || 'all'}`, `Stock: ${f.stock === 'low' ? 'low stock only' : f.stock === 'out' ? 'out of stock only' : 'all'}`);
  parts.push(`Sorted by ${f.sort || 'default'} (${String(f.dir).toLowerCase() === 'asc' ? 'ascending' : 'descending'})`);
  return parts.map(esc).join(' &nbsp;|&nbsp; ');
}

// Company letterhead used by every printed report and invoice
function letterhead(title) {
  const now = new Date().toLocaleString('en-KE', { dateStyle: 'full', timeStyle: 'short' });
  return `<!DOCTYPE html><html><head><title>${title}</title>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600&family=Playfair+Display:wght@700&display=swap" rel="stylesheet">
    <style>
      @page { margin: 16mm; }
      body{font-family:'DM Sans',Arial,sans-serif;color:#263238;margin:28px}
      .head{display:flex;align-items:center;gap:14px;border-bottom:3px solid #e58b45;padding-bottom:14px;margin-bottom:16px}
      .logo{width:52px;height:52px;border-radius:50%;background:#172b4d;color:#e58b45;display:grid;place-items:center;font-family:'Playfair Display',Georgia,serif;font-weight:700;font-size:21px}
      h1{margin:0;font-size:25px;font-family:'Playfair Display',Georgia,serif;color:#172b4d} h1 span{color:#e58b45}
      h2{margin:2px 0 0;font-size:15px;font-weight:600;color:#555}
      .gen{margin-left:auto;text-align:right;font-size:11px;color:#555}
      .meta{font-size:12px;color:#444;margin-bottom:14px;line-height:1.7;background:#faf8f3;padding:10px 12px;border-radius:6px}
      .sum{display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap} .sum div{border:1px solid #eee;border-radius:6px;padding:8px 12px;font-size:12px} .sum b{display:block;font-size:16px;color:#172b4d}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th{background:#172b4d;color:#fff;text-align:left;padding:8px}
      td{padding:6px 8px;border-bottom:1px solid #eee}
      tr:nth-child(even) td{background:#faf8f3} tr.total td{font-weight:700;border-top:2px solid #172b4d}
      .foot{margin-top:18px;font-size:11px;color:#777;display:flex;justify-content:space-between;border-top:1px solid #eee;padding-top:8px}
      button{padding:8px 16px;margin-left:10px} @media print{button{display:none}}
    </style></head><body>
    <div class="head"><div class="logo">CS</div><div><h1>Campus<span>Stationery.</span></h1><h2>${title}</h2></div>
      <div class="gen">Generated ${esc(now)}<br>by ${esc(state.admin.name || state.admin.email)}<button onclick="window.print()">Print</button></div></div>`;
}

function letterfoot() {
  return `<div class="foot"><span>CampusStationery Admin Panel</span><span>Confidential: for internal use</span></div></body></html>`;
}

function printCurrentReport() {
  const r = reportState.last;
  if (!r) return;
  const w = window.open('', '_blank');
  if (!w) return toast('Allow pop ups for this site to print reports.', 'warning');
  const s = r.data.summary;
  const sums = Object.entries(s).filter(([, v]) => v !== null).map(([k, v]) =>
    `<div>${esc(pretty(k))}<b>${['total', 'paid', 'value'].includes(k) ? esc(money(v)) : esc(v)}</b></div>`).join('');
  w.document.write(`${letterhead(REPORT_TITLES[r.type])}
    <div class="meta">${filterSummary(r.type, r.data.filters)}<br>Records: ${r.data.rows.length}</div>
    <div class="sum">${sums}</div>
    <table><thead><tr>${r.cols.map(c => `<th>${esc(c[0])}</th>`).join('')}</tr></thead>
    <tbody>${r.data.rows.map(row => `<tr>${r.cols.map(c => `<td>${esc(c[1](row))}</td>`).join('')}</tr>`).join('')}</tbody></table>
    ${letterfoot()}`);
  w.document.close();
}

function csvCurrentReport() {
  const r = reportState.last;
  if (!r) return;
  const cell = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const lines = [
    cell(`CampusStationery ${REPORT_TITLES[r.type]}`),
    cell(`Generated ${new Date().toLocaleString('en-KE')}`),
    '',
    r.cols.map(c => cell(c[0])).join(','),
    ...r.data.rows.map(row => r.cols.map(c => cell(c[1](row))).join(','))
  ];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  a.download = `${r.type}_report_${localDay(0)}.csv`;
  a.click();
  toast(`Exported ${r.data.rows.length} row(s).`);
}
