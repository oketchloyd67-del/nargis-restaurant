// ===========================
//  NARGIS ADMIN – admin.js
// ===========================

// ── CONFIG ──

const BACKEND_URL = 'https://nargis-restaurant.onrender.com';

let currentPanel = 'dashboard';

// ── AUTH ──
async function login() {
  const user = document.getElementById('admin-user').value.trim();
  const pass = document.getElementById('admin-pass').value;
  const err = document.getElementById('login-error');
  const loginBtn = document.querySelector('.btn-login');

  // Clear previous errors
  err.style.display = 'none';
  err.textContent = '';

  if (!user || !pass) {
    err.style.display = 'block';
    err.textContent = 'Please enter both username and password.';
    return false;
  }

  // Show loading
  loginBtn.textContent = 'Logging in...';
  loginBtn.disabled = true;

  try {
    const url = `${BACKEND_URL}/api/admin/login`;
    console.log('📤 POST to:', url);
    console.log('📤 Data:', { username: user, password: '***' });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: user,
        password: pass
      })
    });

    console.log('📥 Response status:', response.status);

    // Read response as text first
    const responseText = await response.text();
    console.log('📥 Raw response:', responseText);

    // Try to parse as JSON
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error('❌ Failed to parse JSON:', e);
      throw new Error('Server returned invalid response. Please check backend URL.');
    }

    console.log('📥 Parsed data:', data);

    if (response.ok && data.success) {
      sessionStorage.setItem('nargis_admin_token', data.token);
      sessionStorage.setItem('nargis_admin', '1');
      showApp();
    } else {
      err.style.display = 'block';
      err.textContent = data.message || 'Login failed. Please try again.';
    }
  } catch (error) {
    console.error('❌ Login error:', error);
    err.style.display = 'block';
    err.textContent = `Error: ${error.message}`;
  } finally {
    loginBtn.textContent = 'Sign In to Dashboard';
    loginBtn.disabled = false;
  }

  return false;
}

function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('admin-app').classList.add('show');
  loadDashboard();
  showPanel('dashboard');
}

function logout() {
  sessionStorage.removeItem('nargis_admin_token');
  sessionStorage.removeItem('nargis_admin');
  location.reload();
}

// ── VERIFY SESSION ──
async function verifyAdminSession() {
  const token = sessionStorage.getItem('nargis_admin_token');
  if (!token) return false;

  try {
    const response = await fetch(`${BACKEND_URL}/api/admin/verify`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const text = await response.text();
    const data = JSON.parse(text);
    return response.ok && data.success;
  } catch (e) {
    return false;
  }
}

// ── PANEL SWITCHING ──
function showPanel(name) {
  currentPanel = name;
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const panel = document.getElementById('panel-' + name);
  if (panel) panel.classList.add('active');
  const navItem = document.querySelector(`[data-panel="${name}"]`);
  if (navItem) navItem.classList.add('active');

  const titles = {
    dashboard: 'Dashboard',
    orders: 'Orders',
    reservations: 'Reservations',
    reviews: 'Reviews Moderation',
    menu: 'Menu Manager',
  };
  document.getElementById('topbar-title').textContent = titles[name] || name;

  switch(name) {
    case 'dashboard':   loadDashboard(); break;
    case 'orders':      loadOrders(); break;
    case 'reservations':loadReservations(); break;
    case 'reviews':     loadReviews(); break;
    case 'menu':        loadMenuManager(); break;
  }
}

// ── DATA HELPERS ──
function getOrders() { return JSON.parse(localStorage.getItem('nargis_orders') || '[]'); }
function getReservations() { return JSON.parse(localStorage.getItem('nargis_reservations') || '[]'); }
function getPending() { return JSON.parse(localStorage.getItem('nargis_pending_reviews') || '[]'); }

function fmtKes(n) { return 'KES ' + Number(n).toLocaleString('en-KE'); }
function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-KE', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

// ── DASHBOARD ──
function loadDashboard() {
  const orders = getOrders();
  const reservations = getReservations();
  const pending = getPending();

  const orderTotal = orders.reduce((sum, o) => {
    if (o.status === 'paid') return sum + (o.total || 0);
    return sum;
  }, 0);
  
  const reservationTotal = reservations.reduce((sum, r) => {
    if (r.status === 'confirmed') return sum + (r.deposit || 0);
    return sum;
  }, 0);

  document.getElementById('stat-revenue').textContent = fmtKes(orderTotal + reservationTotal);
  document.getElementById('stat-orders').textContent = orders.length;
  document.getElementById('stat-reservations').textContent = reservations.length;
  document.getElementById('stat-pending').textContent = pending.length;

  updatePendingBadge(pending.length);
  renderRecentActivity(orders, reservations);
}

function updatePendingBadge(count) {
  const badge = document.getElementById('pending-badge');
  if (badge) { 
    badge.textContent = count; 
    badge.classList.toggle('visible', count > 0);
  }
}

function renderRecentActivity(orders, reservations) {
  const tbody = document.getElementById('recent-activity');
  if (!tbody) return;

  const allActivity = [
    ...orders.map(o => ({ ...o, actType: 'Order' })),
    ...reservations.map(r => ({ ...r, actType: 'Reservation' }))
  ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 10);

  if (!allActivity.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">No activity yet.</td></tr>';
    return;
  }

  tbody.innerHTML = allActivity.map(a => `
    <tr>
      <td><strong>${a.id}</strong></td>
      <td><span class="status-badge badge-${a.actType === 'Order' ? 'paid' : 'confirmed'}">${a.actType}</span></td>
      <td>${a.actType === 'Order' ? (a.items?.length + ' item(s)') : (a.name || '-')}</td>
      <td>${fmtKes(a.total || a.deposit || 0)}</td>
      <td>${fmtDate(a.timestamp)}</td>
    </tr>
  `).join('');
}

// ── ORDERS ──
function loadOrders(filter = 'all') {
  let orders = getOrders();
  if (filter !== 'all') orders = orders.filter(o => o.status === filter);

  const tbody = document.getElementById('orders-tbody');
  if (!tbody) return;

  if (!orders.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7">No orders found.</td></tr>';
    return;
  }

  tbody.innerHTML = orders.map(o => `
    <tr>
      <td><strong>${o.id}</strong></td>
      <td>${o.items?.map(i => i.name + ' ×' + i.qty).join(', ') || '-'}</td>
      <td>${fmtKes(o.total)}</td>
      <td><span class="status-badge badge-${o.status}">${o.status.toUpperCase()}</span></td>
      <td>${o.method?.toUpperCase() || '-'}</td>
      <td>${fmtDate(o.timestamp)}</td>
      <td>
        <button class="btn-sm btn-view" onclick="viewOrder('${o.id}')">View</button>
      </td>
    </tr>
  `).join('');
}

function viewOrder(id) {
  const order = getOrders().find(o => o.id === id);
  if (!order) return;

  const body = document.getElementById('detail-modal-body');
  document.getElementById('detail-modal-title').textContent = 'Order #' + order.id;

  body.innerHTML = `
    <div class="detail-row"><span class="key">Status</span><span class="val"><span class="status-badge badge-${order.status}">${order.status.toUpperCase()}</span></span></div>
    <div class="detail-row"><span class="key">Payment</span><span class="val">${order.method?.toUpperCase()}</span></div>
    <div class="detail-row"><span class="key">Ref</span><span class="val">${order.ref || 'N/A'}</span></div>
    <div class="detail-row"><span class="key">Date</span><span class="val">${fmtDate(order.timestamp)}</span></div>
    <div class="detail-row"><span class="key">Total</span><span class="val"><strong>${fmtKes(order.total)}</strong></span></div>
    <hr style="margin:16px 0;border-color:#F5EDE0">
    <div style="font-weight:700;margin-bottom:10px;">ITEMS</div>
    ${(order.items || []).map(i => `
      <div class="detail-row">
        <span class="key">${i.name}</span>
        <span class="val">×${i.qty} = ${fmtKes(i.price * i.qty)}</span>
      </div>
    `).join('')}
  `;
  openDetailModal();
}

// ── RESERVATIONS ──
function loadReservations(filter = 'all') {
  let res = getReservations();
  if (filter !== 'all') res = res.filter(r => r.status === filter);

  const tbody = document.getElementById('reservations-tbody');
  if (!tbody) return;

  if (!res.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8">No reservations found.</td></tr>';
    return;
  }

  tbody.innerHTML = res.map(r => `
    <tr>
      <td><strong>${r.id}</strong></td>
      <td>${r.name || '-'}</td>
      <td>${r.phone || '-'}</td>
      <td>${r.date || '-'} ${r.time || ''}</td>
      <td>${r.guests || '-'}</td>
      <td><span class="status-badge badge-${r.status}">${r.status?.toUpperCase()}</span></td>
      <td>${fmtKes(r.deposit || 0)}</td>
      <td>
        <button class="btn-sm btn-view" onclick="viewReservation('${r.id}')">View</button>
        <button class="btn-sm btn-reject" onclick="deleteReservation('${r.id}')">🗑 Delete</button>
      </td>
    </tr>
  `).join('');
}

function deleteReservation(id) {
  if (!confirm(`Delete reservation #${id}?`)) return;
  let reservations = getReservations().filter(r => r.id !== id);
  localStorage.setItem('nargis_reservations', JSON.stringify(reservations));
  showAdminToast('Reservation deleted.', 'error');
  loadReservations();
  loadDashboard();
}

function viewReservation(id) {
  const r = getReservations().find(r => r.id === id);
  if (!r) return;

  const body = document.getElementById('detail-modal-body');
  document.getElementById('detail-modal-title').textContent = 'Reservation #' + r.id;

  body.innerHTML = `
    <div class="detail-row"><span class="key">Name</span><span class="val">${r.name}</span></div>
    <div class="detail-row"><span class="key">Email</span><span class="val">${r.email}</span></div>
    <div class="detail-row"><span class="key">Phone</span><span class="val">${r.phone}</span></div>
    <div class="detail-row"><span class="key">Date & Time</span><span class="val">${r.date} at ${r.time}</span></div>
    <div class="detail-row"><span class="key">Guests</span><span class="val">${r.guests}</span></div>
    <div class="detail-row"><span class="key">Deposit</span><span class="val"><strong>${fmtKes(r.deposit || 0)}</strong></span></div>
  `;
  openDetailModal();
}

// ── REVIEWS ──
function loadReviews(filter = 'pending') {
  const pending = getPending();
  const tbody = document.getElementById('reviews-tbody');
  if (!tbody) return;

  if (!pending.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No pending reviews. ✅</td></tr>';
    return;
  }

  tbody.innerHTML = pending.map(r => `
    <tr class="review-row">
      <td><strong>${r.author}</strong></td>
      <td>${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</td>
      <td>${r.type || '-'}</td>
      <td>${r.text.slice(0, 80)}${r.text.length > 80 ? '...' : ''}</td>
      <td>${r.date}</td>
      <td>
        <button class="btn-sm btn-approve" onclick="approveReview('${r.id}')">✓ Approve</button>
        <button class="btn-sm btn-reject" onclick="rejectReview('${r.id}')">✕ Reject</button>
      </td>
    </tr>
  `).join('');
}

function approveReview(id) {
  let pending = getPending();
  const review = pending.find(r => r.id === id);
  if (!review) return;
  pending = pending.filter(r => r.id !== id);
  localStorage.setItem('nargis_pending_reviews', JSON.stringify(pending));
  showAdminToast('Review approved! ✅', 'success');
  loadReviews();
  loadDashboard();
}

function rejectReview(id) {
  if (!confirm('Reject this review?')) return;
  let pending = getPending().filter(r => r.id !== id);
  localStorage.setItem('nargis_pending_reviews', JSON.stringify(pending));
  showAdminToast('Review rejected.', 'error');
  loadReviews();
  loadDashboard();
}

// ── MENU MANAGER ──
async function loadMenuManager() {
  const tbody = document.getElementById('menu-tbody');
  if (!tbody) return;
  
  try {
    const response = await fetch('/api/menu');
    if (!response.ok) throw new Error('API failed');
    const menuItems = await response.json();
    
    if (!menuItems.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="8">No menu items.</td></tr>';
      return;
    }
    
    tbody.innerHTML = menuItems.map(item => `
      <tr>
        <td><strong>${item.id}</strong></td>
        <td>
          <img src="${item.image || 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=100'}" 
               style="width:44px;height:44px;object-fit:cover;border-radius:6px" 
               onerror="this.src='https://via.placeholder.com/44x44?text=🍽'">
        </td>
        <td><strong>${item.name}</strong></td>
        <td>${item.category}</td>
        <td><strong>KES ${Number(item.price).toLocaleString()}</strong></td>
        <td>${item.vegetarian ? '🌿 Veg' : 'Non-Veg'}</td>
        <td>${item.popular ? '⭐ Yes' : 'No'}</td>
        <td>
          <button class="btn-sm btn-reject" onclick="deleteMenuItem(${item.id})">🗑 Delete</button>
        </td>
      </tr>
    `).join('');
  } catch (error) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8">Error loading menu.</td></tr>';
  }
}

function deleteMenuItem(id) {
  if (!confirm('Delete this item?')) return;
  // TODO: Implement delete API
  showAdminToast('Item deleted (local only)', 'error');
  loadMenuManager();
}

function refreshMenu() {
  loadMenuManager();
  showAdminToast('🔄 Refreshed', 'info');
}

function openAddMenuItem() {
  showAdminToast('Add menu feature coming soon', 'info');
}

// ── MODALS ──
function openDetailModal() {
  document.getElementById('detail-modal').classList.add('open');
}

function closeDetailModal() {
  document.getElementById('detail-modal').class.classList.remove('open');
}

function closeMenuModal() {
  document.getElementById('menu-modal').classList.remove('open');
}

// ── TOAST ──
function showAdminToast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `admin-toast ${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.remove(); }, 3000);
}

// ── EXPORT ──
function exportCSV(type) {
  const data = type === 'orders' ? getOrders() : getReservations();
  if (!data.length) { showAdminToast('No data to export.', 'error'); return; }

  const keys = Object.keys(data[0]).filter(k => k !== 'items');
  const rows = [keys.join(','), ...data.map(r => keys.map(k => JSON.stringify(r[k] || '')).join(','))];
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url;
  a.download = `nargis_${type}_${new Date().toISOString().split('T')[0]}.csv`;
  a.click(); URL.revokeObjectURL(url);
  showAdminToast(`${type} exported! ✅`, 'success');
}

// ── MOBILE SIDEBAR ──
function initMobileSidebar() {
  const toggleBtn = document.getElementById('mobile-sidebar-toggle');
  const sidebar = document.getElementById('admin-sidebar');
  const closeBtn = document.getElementById('sidebar-close');
  const overlay = document.getElementById('sidebar-overlay');

  function openSidebar() {
    sidebar.classList.add('open');
    toggleBtn.classList.add('active');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
    toggleBtn.classList.remove('active');
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      if (sidebar.classList.contains('open')) closeSidebar();
      else openSidebar();
    });
  }

  if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
  if (overlay) overlay.addEventListener('click', closeSidebar);

  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      if (window.innerWidth <= 768) closeSidebar();
    });
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 768 && sidebar.classList.contains('open')) closeSidebar();
  });
}

// ── INIT ──
document.addEventListener('DOMContentLoaded', async function() {
  console.log('🔐 Admin panel loading...');
  console.log('📡 Backend URL:', BACKEND_URL);

  const isValid = await verifyAdminSession();
  
  if (isValid) {
    console.log('✅ Session valid');
    showApp();
  } else {
    console.log('❌ Session invalid');
    sessionStorage.removeItem('nargis_admin_token');
    sessionStorage.removeItem('nargis_admin');
  }

  document.getElementById('login-form')?.addEventListener('submit', (e) => {
    e.preventDefault(); 
    login();
  });
  
  initMobileSidebar();
});