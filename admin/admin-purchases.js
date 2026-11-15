// =============================================================
// CampusStationery Admin: restocking with purchase orders
// Loaded after admin-orders.js (uses its letterhead and helpers).
//
// 1. "New purchase order": pick a supplier, add products (one click adds every low and
//    out of stock product with a suggested quantity), set quantities and costs, save.
// 2. The order is sent to the supplier (print it). Stock does not change yet.
// 3. When the goods arrive, "Mark as received" adds every line to stock in one step.
// =============================================================

const poState = { status: '', search: '', low: 10 };

// A DATE value such as 2026-11-20 shown as "20 Nov 2026" (no time, so no timezone shift)
function dayOnly(value) {
  if (!value) return '';
  const d = new Date(String(value).slice(0, 10) + 'T00:00:00');
  return isNaN(d) ? String(value) : d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
}

function poBadge(status) {
  const cls = { Ordered: 'badge-info', Received: 'badge-ok', Cancelled: 'badge-off' }[status] || 'badge-soft';
  return `<span class="badge ${cls}">${esc(status)}</span>`;
}

async function renderPurchases(startNew) {
  setActive('purchases', 'Restock');
  view.innerHTML = `
    <div class="panel mb-3 d-flex flex-wrap align-items-center gap-3">
      <div class="me-auto">
        <h6 class="fw-bold mb-1"><i class="fa-solid fa-truck-ramp-box me-2 text-secondary"></i>Restock from suppliers</h6>
        <div class="small text-secondary">Order more stock from a supplier. Stock only goes up when you mark the delivery as received.</div>
      </div>
      <a class="btn btn-outline-secondary" href="#table/suppliers"><i class="fa-solid fa-building me-1"></i>Suppliers</a>
      <button class="btn btn-accent" id="newPoBtn"><i class="fa-solid fa-plus me-1"></i>New purchase order <span class="kbd ms-1">Alt+N</span></button>
    </div>
    <div class="d-flex flex-wrap gap-2 mb-3" id="poTabs"></div>
    <div class="toolbar">
      <div class="input-group search">
        <span class="input-group-text bg-white"><i class="fa-solid fa-magnifying-glass"></i></span>
        <input type="search" class="form-control" id="searchBox" placeholder="Purchase order number or supplier... (press /)" value="${esc(poState.search)}">
      </div>
    </div>
    <div class="table-wrap" id="poWrap"><div class="empty">Loading...</div></div>`;

  let timer;
  $('#searchBox').addEventListener('input', e => {
    clearTimeout(timer);
    timer = setTimeout(() => { poState.search = e.target.value.trim(); loadPurchases(); }, 300);
  });
  $('#newPoBtn').onclick = () => openNewPurchase(true);
  await loadPurchases();
  if (startNew) {
    history.replaceState(null, '', '#purchases');
    openNewPurchase(true);
  }
}

async function loadPurchases() {
  const params = new URLSearchParams();
  if (poState.status) params.set('status', poState.status);
  if (poState.search) params.set('search', poState.search);
  let d;
  try {
    d = await api(`/purchase-orders?${params}`);
  } catch (err) {
    $('#poWrap').innerHTML = errorPanel(err.message);
    return;
  }
  const all = Object.values(d.statusCounts).reduce((a, b) => a + b, 0);
  $('#poTabs').innerHTML = [['', 'All', all], ...['Ordered', 'Received', 'Cancelled'].map(st => [st, st === 'Ordered' ? 'On the way' : st, d.statusCounts[st]])]
    .map(([value, label, n]) => `<button class="btn btn-sm ${poState.status === value ? 'btn-accent' : 'btn-light'}" data-status="${esc(value)}">${esc(label)} <span class="badge badge-soft ms-1">${n}</span></button>`).join('');
  document.querySelectorAll('#poTabs [data-status]').forEach(b => b.onclick = () => { poState.status = b.dataset.status; loadPurchases(); });

  $('#poWrap').innerHTML = d.rows.length ? `
    <table class="table data-table mb-0">
      <thead><tr><th>Purchase order</th><th>Date</th><th>Supplier</th><th>Products</th><th>Units</th><th>Total cost</th><th>Expected</th><th>Status</th><th class="text-end">Actions</th></tr></thead>
      <tbody>${d.rows.map(p => `
        <tr class="clickable" data-po="${p.id}">
          <td class="fw-semibold">${esc(p.po_ref)}</td>
          <td>${esc(fmtDate(p.created_at))}</td>
          <td>${esc(p.supplier_name)}</td>
          <td>${p.line_count}</td>
          <td>${p.units}</td>
          <td>${esc(money(p.total_cost))}</td>
          <td>${p.expected_date ? esc(dayOnly(p.expected_date)) : '<span class="text-secondary">Not set</span>'}</td>
          <td>${poBadge(p.status)}</td>
          <td class="text-end row-actions"><button class="btn btn-sm btn-light" title="Open purchase order"><i class="fa-solid fa-eye"></i></button></td>
        </tr>`).join('')}</tbody>
    </table>`
    : `<div class="empty"><i class="fa-solid fa-truck-ramp-box d-block"></i>No purchase orders yet. Click <b>New purchase order</b> to restock.</div>`;
  document.querySelectorAll('#poWrap tr[data-po]').forEach(tr => tr.onclick = () => openPurchase(Number(tr.dataset.po)));
}

/* ---------- new purchase order ---------- */

async function openNewPurchase(withSuggestions) {
  let opts, sugg;
  try {
    [opts, sugg] = await Promise.all([api('/purchase-orders/options'), api('/purchase-orders/suggestions')]);
  } catch (err) {
    return toast(err.message, 'danger');
  }
  if (!opts.suppliers.length) {
    if (await confirmBox('Add a supplier first', 'A purchase order needs a supplier, and none is set up yet. Open the Suppliers list to add one now?', 'Add a supplier')) location.hash = 'table/suppliers';
    return;
  }
  poState.low = sugg.lowStockLevel || poState.low;
  const products = opts.products;
  const productOptions = selected => `<option value="">Choose a product...</option>` + products.map(p =>
    `<option value="${p.id}" ${Number(selected) === p.id ? 'selected' : ''}>${esc(p.name)} (${p.stock_quantity <= 0 ? 'out of stock' : p.stock_quantity + ' in stock'})</option>`).join('');

  const lineRow = (productId = '', quantity = '', cost = '') => `
    <tr class="po-line">
      <td><select class="form-select form-select-sm" name="product_id">${productOptions(productId)}</select></td>
      <td style="width:110px"><input type="number" class="form-control form-control-sm" name="quantity" min="1" max="10000" step="1" value="${quantity}" required></td>
      <td style="width:130px"><input type="number" class="form-control form-control-sm" name="unit_cost" min="0" step="0.01" value="${cost}" placeholder="0.00"></td>
      <td class="text-end line-total" style="width:120px">KES 0</td>
      <td class="text-end" style="width:44px"><button type="button" class="btn btn-sm btn-light remove-line" title="Remove this line"><i class="fa-solid fa-xmark"></i></button></td>
    </tr>`;

  $('#orderTitle').innerHTML = '<i class="fa-solid fa-truck-ramp-box me-2"></i>New purchase order';
  $('#orderBody').innerHTML = `
    <form id="poForm" novalidate>
      <div class="row g-3 mb-3">
        <div class="col-md-6"><label class="form-label required">Supplier</label>
          <select class="form-select" name="supplier_id" required>
            <option value="">Choose a supplier...</option>
            ${opts.suppliers.map(s => `<option value="${s.id}">${esc(s.name)}${s.contact_person ? ' (' + esc(s.contact_person) + ')' : ''}</option>`).join('')}
          </select>
          <div class="invalid-feedback">Please choose a supplier.</div></div>
        <div class="col-md-3"><label class="form-label">Expected delivery</label>
          <input type="date" class="form-control" name="expected_date" min="${localDay(0)}"></div>
        <div class="col-md-3 d-flex align-items-end">
          <button type="button" class="btn btn-outline-secondary w-100" id="addLowBtn" title="Adds every product at or below the low stock level">
            <i class="fa-solid fa-wand-magic-sparkles me-1"></i>Add low stock (${sugg.rows.length})</button></div>
      </div>
      <table class="table table-sm align-middle mb-2">
        <thead><tr><th>Product</th><th>Quantity</th><th>Unit cost (KES)</th><th class="text-end">Amount</th><th></th></tr></thead>
        <tbody id="poLines"></tbody>
        <tfoot><tr><td colspan="3"><button type="button" class="btn btn-sm btn-light" id="addLineBtn"><i class="fa-solid fa-plus me-1"></i>Add a product</button></td>
          <td class="text-end fw-bold" id="poTotal">KES 0</td><td></td></tr></tfoot>
      </table>
      <label class="form-label mt-2">Notes for the supplier</label>
      <textarea class="form-control" name="notes" rows="2" maxlength="500" placeholder="For example: deliver to the shop store room before 10 am"></textarea>
      <div class="small text-secondary mt-2">Saving does not change stock. Stock goes up when you open this purchase order later and click <b>Mark as received</b>.</div>
    </form>`;
  $('#orderActions').innerHTML = `
    <button class="btn btn-light me-auto" data-bs-dismiss="modal">Close</button>
    <button class="btn btn-accent" id="savePoBtn"><i class="fa-solid fa-floppy-disk me-1"></i>Save purchase order</button>`;

  const tbody = $('#poLines');
  const recalc = () => {
    let total = 0;
    tbody.querySelectorAll('.po-line').forEach(tr => {
      const q = Number(tr.querySelector('[name=quantity]').value) || 0;
      const c = Number(tr.querySelector('[name=unit_cost]').value) || 0;
      tr.querySelector('.line-total').textContent = moneyShort(q * c);
      total += q * c;
    });
    $('#poTotal').textContent = moneyShort(total);
  };
  const addLine = (productId, quantity, cost) => {
    // A product already in the list gets its quantity raised instead of a second line
    const existing = [...tbody.querySelectorAll('.po-line')].find(tr => tr.querySelector('[name=product_id]').value === String(productId) && productId);
    if (existing) { existing.querySelector('[name=quantity]').value = quantity; return; }
    tbody.insertAdjacentHTML('beforeend', lineRow(productId, quantity, cost));
  };
  const addSuggestions = () => {
    if (!sugg.rows.length) return toast('Every product is above the low stock level, so nothing needs restocking.', 'info');
    // Remove empty lines first
    tbody.querySelectorAll('.po-line').forEach(tr => { if (!tr.querySelector('[name=product_id]').value) tr.remove(); });
    sugg.rows.forEach(r => addLine(r.product_id, r.suggested_quantity, ''));
    recalc();
    toast(`${sugg.rows.length} low or out of stock product(s) added with suggested quantities.`);
  };

  tbody.addEventListener('input', recalc);
  tbody.addEventListener('change', recalc);
  tbody.addEventListener('click', e => {
    const btn = e.target.closest('.remove-line');
    if (btn) { btn.closest('tr').remove(); recalc(); }
  });
  $('#addLineBtn').onclick = () => { addLine('', 1, ''); tbody.lastElementChild.querySelector('select').focus(); };
  $('#addLowBtn').onclick = addSuggestions;

  if (withSuggestions && sugg.rows.length) {
    sugg.rows.forEach(r => addLine(r.product_id, r.suggested_quantity, ''));
  } else {
    addLine('', 1, '');
  }
  recalc();

  const modal = bootstrap.Modal.getOrCreateInstance($('#orderModal'));
  modal.show();

  $('#savePoBtn').onclick = async () => {
    const form = $('#poForm');
    form.classList.add('was-validated');
    const lines = [...tbody.querySelectorAll('.po-line')].map(tr => ({
      product_id: tr.querySelector('[name=product_id]').value,
      quantity: tr.querySelector('[name=quantity]').value,
      unit_cost: tr.querySelector('[name=unit_cost]').value
    }));
    if (!form.supplier_id.value) return toast('Please choose a supplier.', 'danger');
    if (!lines.length) return toast('Add at least one product.', 'danger');
    if (lines.some(l => !l.product_id)) return toast('Choose a product on every line, or remove the empty line.', 'danger');
    if (lines.some(l => !/^\d+$/.test(l.quantity) || Number(l.quantity) < 1)) return toast('Every quantity must be a whole number of at least 1.', 'danger');
    try {
      const r = await api('/purchase-orders', {
        method: 'POST',
        body: {
          supplier_id: Number(form.supplier_id.value),
          expected_date: form.expected_date.value || null,
          notes: form.notes.value,
          items: lines.map(l => ({ product_id: Number(l.product_id), quantity: Number(l.quantity), unit_cost: l.unit_cost === '' ? 0 : Number(l.unit_cost) }))
        }
      });
      toast(r.message);
      modal.hide();
      poState.status = '';
      if (location.hash !== '#purchases') location.hash = 'purchases'; else loadPurchases();
      setTimeout(() => openPurchase(r.id), 400);
    } catch (err) {
      toast(err.message, 'danger');
    }
  };
}

/* ---------- one purchase order ---------- */

async function openPurchase(id) {
  let p;
  try {
    p = await api(`/purchase-orders/${id}`);
  } catch (err) {
    return toast(err.message, 'danger');
  }
  $('#orderTitle').innerHTML = `Purchase order ${esc(p.po_ref)} ${poBadge(p.status)}`;
  $('#orderBody').innerHTML = `
    <div class="row g-3 mb-3">
      <div class="col-md-6"><div class="panel p-3 h-100">
        <h6 class="fw-bold"><i class="fa-solid fa-building me-2 text-secondary"></i>Supplier</h6>
        <div>${esc(p.supplier_name)}</div>
        <div class="small text-secondary">${esc([p.contact_person, p.supplier_phone, p.supplier_email].filter(Boolean).join(' | ') || 'No contact details saved')}</div>
      </div></div>
      <div class="col-md-6"><div class="panel p-3 h-100">
        <h6 class="fw-bold"><i class="fa-regular fa-calendar me-2 text-secondary"></i>Dates</h6>
        <div class="small">Ordered ${esc(fmtDate(p.created_at))}${p.created_by_name ? ' by ' + esc(p.created_by_name) : ''}</div>
        <div class="small">Expected ${p.expected_date ? esc(dayOnly(p.expected_date)) : 'not set'}</div>
        ${p.received_at ? `<div class="small text-success">Received ${esc(fmtDate(p.received_at))}${p.received_by_name ? ' by ' + esc(p.received_by_name) : ''}</div>` : ''}
      </div></div>
    </div>
    <table class="table table-sm align-middle">
      <thead><tr><th>Product</th><th class="text-end">Quantity</th><th class="text-end">Unit cost</th><th class="text-end">Amount</th><th class="text-end">Stock now</th></tr></thead>
      <tbody>${p.items.map(i => `<tr><td>${esc(i.product_name)}<div class="small text-secondary">${esc(i.category_name)}</div></td>
        <td class="text-end">${i.quantity}</td><td class="text-end">${esc(money(i.unit_cost))}</td><td class="text-end">${esc(money(i.line_total))}</td>
        <td class="text-end"><span class="badge ${i.current_stock <= 0 ? 'badge-off' : i.current_stock <= poState.low ? 'badge-warn' : 'badge-ok'}">${i.current_stock}</span></td></tr>`).join('')}
        <tr><td class="fw-bold">Total</td><td class="text-end fw-bold">${p.units}</td><td></td><td class="text-end fw-bold">${esc(money(p.total_cost))}</td><td></td></tr></tbody>
    </table>
    ${p.notes ? `<div class="small bg-light rounded p-2"><b>Notes:</b> ${esc(p.notes)}</div>` : ''}
    ${p.status === 'Ordered' ? `<div class="small text-secondary mt-2">When the delivery arrives and you have counted it, click <b>Mark as received</b>. Each quantity above is then added to stock.</div>` : ''}`;
  $('#orderActions').innerHTML = `
    <button class="btn btn-light me-auto" id="printPoBtn"><i class="fa-solid fa-print me-1"></i>Print purchase order</button>
    ${p.status === 'Ordered' ? `
      <button class="btn btn-outline-danger" id="cancelPoBtn"><i class="fa-solid fa-ban me-1"></i>Cancel</button>
      <button class="btn btn-success" id="receivePoBtn"><i class="fa-solid fa-box-open me-1"></i>Mark as received</button>`
      : '<span class="text-secondary small">This purchase order is closed. No further changes.</span>'}`;

  const modal = bootstrap.Modal.getOrCreateInstance($('#orderModal'));
  modal.show();

  $('#printPoBtn').onclick = () => printPurchase(p);
  const receive = $('#receivePoBtn');
  if (receive) receive.onclick = async () => {
    if (!(await confirmBox('Mark as received?', `${p.units} units from ${p.supplier_name} will be added to stock. Do this only after the delivery has arrived and been counted.`, 'Yes, add to stock'))) return;
    try {
      const r = await api(`/purchase-orders/${id}/receive`, { method: 'POST', body: {} });
      toast(r.message);
      modal.hide();
      if (location.hash === '#purchases') loadPurchases(); else renderDashboard();
    } catch (err) { toast(err.message, 'danger'); }
  };
  const cancel = $('#cancelPoBtn');
  if (cancel) cancel.onclick = async () => {
    if (!(await confirmBox('Cancel this purchase order?', `${p.po_ref} will be marked as cancelled. Stock does not change.`, 'Yes, cancel it'))) return;
    try {
      const r = await api(`/purchase-orders/${id}/cancel`, { method: 'POST', body: {} });
      toast(r.message);
      modal.hide();
      loadPurchases();
    } catch (err) { toast(err.message, 'danger'); }
  };
}

function printPurchase(p) {
  const w = window.open('', '_blank');
  if (!w) return toast('Allow pop ups for this site to print.', 'warning');
  w.document.write(`${letterhead(`Purchase Order ${esc(p.po_ref)}`)}
    <div class="meta">Supplier: <strong>${esc(p.supplier_name)}</strong>${p.contact_person ? ', attention ' + esc(p.contact_person) : ''}
      ${p.supplier_phone ? '<br>Phone: ' + esc(p.supplier_phone) : ''}${p.supplier_email ? ' &nbsp; Email: ' + esc(p.supplier_email) : ''}<br>
      Order date: ${esc(fmtDate(p.created_at))} &nbsp; | &nbsp; Expected delivery: ${p.expected_date ? esc(dayOnly(p.expected_date)) : 'as soon as possible'} &nbsp; | &nbsp; Status: ${esc(p.status)}
      ${p.notes ? '<br>Notes: ' + esc(p.notes) : ''}</div>
    <table><thead><tr><th>Product</th><th>Category</th><th>Quantity</th><th>Unit cost</th><th>Amount</th></tr></thead><tbody>
      ${p.items.map(i => `<tr><td>${esc(i.product_name)}</td><td>${esc(i.category_name)}</td><td>${i.quantity}</td><td>${esc(money(i.unit_cost))}</td><td>${esc(money(i.line_total))}</td></tr>`).join('')}
      <tr class="total"><td colspan="2">Total</td><td>${p.units}</td><td></td><td>${esc(money(p.total_cost))}</td></tr></tbody></table>
    <p style="font-size:12px;margin-top:22px">Please deliver to the CampusStationery shop and quote ${esc(p.po_ref)} on the delivery note and invoice.</p>
    <p style="font-size:12px;margin-top:30px">Authorised by: ____________________________ &nbsp;&nbsp; Date: ______________</p>
    ${letterfoot()}`);
  w.document.close();
}
