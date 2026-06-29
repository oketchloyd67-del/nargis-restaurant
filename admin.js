// ===========================
//  NARGIS ADMIN – admin.js
// ===========================

// ── CREDENTIALS ──
const ADMIN_CREDS = {
  username: 'admin',
  password: 'NargisAdmin2024!'
};

let currentPanel = 'dashboard';
let detailTarget = null;
let isEditingMenuItem = false;

// ── AUTH ──
function login() {
  const user = document.getElementById('admin-user').value.trim();
  const pass = document.getElementById('admin-pass').value;
  const err = document.getElementById('login-error');

  if (user === ADMIN_CREDS.username && pass === ADMIN_CREDS.password) {
    sessionStorage.setItem('nargis_admin', '1');
    showApp();
  } else {
    err.style.display = 'block';
    err.textContent = 'Invalid username or password.';
    setTimeout(() => err.style.display = 'none', 3000);
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
  sessionStorage.removeItem('nargis_admin');
  location.reload();
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

// ── CALCULATE OVERTIME AMOUNT ──
function calculateOvertimeAmount() {
  const orders = getOrders();
  const reservations = getReservations();
  
  const orderTotal = orders.reduce((sum, o) => {
    if (o.status === 'paid' || o.status === 'confirmed') {
      return sum + (o.total || 0);
    }
    return sum;
  }, 0);
  
  const reservationTotal = reservations.reduce((sum, r) => {
    if (r.status === 'confirmed' || r.status === 'completed') {
      return sum + (r.deposit || 0);
    }
    return sum;
  }, 0);
  
  const total = orderTotal + reservationTotal;
  
  return {
    orderTotal,
    reservationTotal,
    total,
    formatted: fmtKes(total)
  };
}

// ── DASHBOARD ──
function loadDashboard() {
  const orders = getOrders();
  const reservations = getReservations();
  const pending = getPending();

  const totals = calculateOvertimeAmount();
  
  document.getElementById('stat-revenue').textContent = totals.formatted;
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
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">No activity yet. Orders and reservations will appear here.</td></tr>';
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
  const title = document.getElementById('detail-modal-title');
  title.textContent = 'Order #' + order.id;

  body.innerHTML = `
    <div class="detail-row"><span class="key">Status</span><span class="val"><span class="status-badge badge-${order.status}">${order.status.toUpperCase()}</span></span></div>
    <div class="detail-row"><span class="key">Payment Method</span><span class="val">${order.method?.toUpperCase()}</span></div>
    <div class="detail-row"><span class="key">Payment Ref</span><span class="val">${order.ref || 'N/A'}</span></div>
    <div class="detail-row"><span class="key">Date</span><span class="val">${fmtDate(order.timestamp)}</span></div>
    <div class="detail-row"><span class="key">Total</span><span class="val"><strong>${fmtKes(order.total)}</strong></span></div>
    <hr style="margin:16px 0;border-color:#F5EDE0">
    <div style="font-weight:700;margin-bottom:10px;font-size:.85rem;">ORDER ITEMS</div>
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
      <td>${r.guests || '-'} guest(s)</td>
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
  if (!confirm(`Are you sure you want to delete reservation #${id}? This action cannot be undone.`)) return;
  
  let reservations = getReservations();
  reservations = reservations.filter(r => r.id !== id);
  localStorage.setItem('nargis_reservations', JSON.stringify(reservations));
  
  showAdminToast(`Reservation #${id} deleted successfully.`, 'error');
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
    <div class="detail-row"><span class="key">Occasion</span><span class="val">${r.occasion || 'None'}</span></div>
    <div class="detail-row"><span class="key">Special Notes</span><span class="val">${r.notes || 'None'}</span></div>
    <div class="detail-row"><span class="key">Deposit Paid</span><span class="val"><strong>${fmtKes(r.deposit || 0)} (${r.method?.toUpperCase()})</strong></span></div>
    <div class="detail-row"><span class="key">Status</span><span class="val"><span class="status-badge badge-${r.status}">${r.status?.toUpperCase()}</span></span></div>
  `;
  openDetailModal();
}

// ── REVIEWS MODERATION ──
function loadReviews(filter = 'pending') {
  const pending = getPending();
  const filterEl = document.getElementById('review-filter');
  const currentFilter = filterEl ? filterEl.value : filter;

  const tbody = document.getElementById('reviews-tbody');
  if (!tbody) return;

  const items = currentFilter === 'pending' ? pending : [];
  document.getElementById('pending-count').textContent = pending.length;

  if (!items.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">No ${currentFilter} reviews. All caught up! ✅</td></tr>`;
    return;
  }

  tbody.innerHTML = items.map(r => `
    <tr class="review-row">
      <td><strong>${r.author}</strong></td>
      <td>${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</td>
      <td>${r.type || '-'} / ${r.visitor || '-'}</td>
      <td title="${r.text}">${r.text.slice(0, 80)}${r.text.length > 80 ? '...' : ''}</td>
      <td>${r.date}</td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn-sm btn-approve" onclick="approveReview('${r.id}')">✓ Approve</button>
          <button class="btn-sm btn-reject" onclick="rejectReview('${r.id}')">✕ Reject</button>
          <button class="btn-sm btn-view" onclick="previewReview('${r.id}')">👁 View</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function approveReview(id) {
  let pending = getPending();
  const review = pending.find(r => r.id === id);
  if (!review) return;

  const approved = JSON.parse(localStorage.getItem('nargis_approved_reviews') || '[]');
  review.approved = true;
  approved.push(review);
  localStorage.setItem('nargis_approved_reviews', JSON.stringify(approved));

  pending = pending.filter(r => r.id !== id);
  localStorage.setItem('nargis_pending_reviews', JSON.stringify(pending));

  showAdminToast('Review approved and published! ✅', 'success');
  loadReviews();
  loadDashboard();
}

function rejectReview(id) {
  if (!confirm('Are you sure you want to reject and delete this review?')) return;
  let pending = getPending().filter(r => r.id !== id);
  localStorage.setItem('nargis_pending_reviews', JSON.stringify(pending));
  showAdminToast('Review rejected and removed.', 'error');
  loadReviews();
  loadDashboard();
}

function previewReview(id) {
  const r = getPending().find(r => r.id === id);
  if (!r) return;
  const body = document.getElementById('detail-modal-body');
  document.getElementById('detail-modal-title').textContent = 'Review Preview';
  body.innerHTML = `
    <div class="detail-row"><span class="key">Author</span><span class="val">${r.author}</span></div>
    <div class="detail-row"><span class="key">Email</span><span class="val">${r.email}</span></div>
    <div class="detail-row"><span class="key">Rating</span><span class="val">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</span></div>
    <div class="detail-row"><span class="key">Type</span><span class="val">${r.type} / ${r.visitor}</span></div>
    <div class="detail-row"><span class="key">Date</span><span class="val">${r.date}</span></div>
    <div style="margin-top:14px;font-weight:700;font-size:.82rem;color:#8C7A6A;margin-bottom:8px;">REVIEW TEXT</div>
    <div class="review-text-full">"${r.text}"</div>
    <div style="display:flex;gap:10px;margin-top:4px">
      <button class="btn-sm btn-approve" onclick="approveReview('${r.id}');closeDetailModal()">✓ Approve</button>
      <button class="btn-sm btn-reject" onclick="rejectReview('${r.id}');closeDetailModal()">✕ Reject</button>
    </div>
  `;
  openDetailModal();
}

// ── MENU MANAGER ──
async function loadMenuManager() {
  const tbody = document.getElementById('menu-tbody');
  if (!tbody) return;
  
  try {
    // Try to fetch from API first
    let menuItems = [];
    try {
      const response = await fetch('/api/menu');
      if (response.ok) {
        menuItems = await response.json();
      } else {
        throw new Error('API fetch failed');
      }
    } catch (apiError) {
      // Fallback to db.json
      console.log('Using fallback menu data');
      const res = await fetch('data/db.json');
      const db = await res.json();
      menuItems = db.menu || [];
    }
    
    // Also check localStorage for any added items
    const localMenu = JSON.parse(localStorage.getItem('nargis_menu') || '[]');
    
    // Merge and deduplicate by ID (local items override)
    const allItems = [...menuItems];
    localMenu.forEach(localItem => {
      const existingIndex = allItems.findIndex(item => item.id === localItem.id);
      if (existingIndex !== -1) {
        allItems[existingIndex] = localItem;
      } else {
        allItems.push(localItem);
      }
    });
    
    if (!allItems.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="8">No menu items found. Click "Add Item" to get started.</td></tr>';
      return;
    }
    
    tbody.innerHTML = allItems.map(item => `
      <tr>
        <td><strong>${item.id}</strong></td>
        <td>
          <img src="${item.image || 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=100'}" 
               style="width:44px;height:44px;object-fit:cover;border-radius:6px" 
               onerror="this.src='https://via.placeholder.com/44x44?text=🍽'">
        </td>
        <td><strong>${item.name}</strong></td>
        <td><span class="status-badge badge-confirmed">${item.category}</span></td>
        <td><strong>KES ${Number(item.price).toLocaleString()}</strong></td>
        <td>${item.vegetarian ? '<span class="status-badge badge-confirmed">🌿 Veg</span>' : '<span class="status-badge badge-pending">Non-Veg</span>'}</td>
        <td>${item.popular ? '⭐ Yes' : 'No'}</td>
        <td>
          <div style="display:flex;gap:4px;flex-wrap:wrap;">
            <button class="btn-sm btn-view" onclick="editMenuItem(${item.id})">✏️ Edit</button>
            <button class="btn-sm btn-reject" onclick="deleteMenuItem(${item.id})">🗑 Delete</button>
          </div>
        </td>
      </tr>
    `).join('');
    
  } catch (error) {
    console.error('Error loading menu:', error);
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8">Error loading menu data. Please refresh.</td></tr>';
  }
}

// ── ADD MENU ITEM ──
function openAddMenuItem() {
  isEditingMenuItem = false;
  document.getElementById('menu-modal-title').textContent = '➕ Add New Menu Item';
  document.getElementById('menu-submit-btn').textContent = '💾 Save Item';
  document.getElementById('menu-form').reset();
  document.getElementById('menu-edit-id').value = '';
  document.getElementById('new-category-group').style.display = 'none';
  document.getElementById('menu-modal').classList.add('open');
}

function openEditMenuItem(id) {
  editMenuItem(id);
}

function editMenuItem(id) {
  isEditingMenuItem = true;
  document.getElementById('menu-modal-title').textContent = '✏️ Edit Menu Item';
  document.getElementById('menu-submit-btn').textContent = '💾 Update Item';
  
  // Get the item data
  loadMenuItemData(id).then(item => {
    if (!item) {
      showAdminToast('Item not found', 'error');
      return;
    }
    
    document.getElementById('menu-edit-id').value = id;
    document.getElementById('menu-name').value = item.name || '';
    document.getElementById('menu-price').value = item.price || '';
    document.getElementById('menu-category').value = item.category || 'BBQ Specials';
    document.getElementById('menu-description').value = item.description || '';
    document.getElementById('menu-spice').value = item.spice || 'medium';
    document.getElementById('menu-image').value = item.image || '';
    document.getElementById('menu-popular').checked = item.popular || false;
    document.getElementById('menu-vegetarian').checked = item.vegetarian || false;
    document.getElementById('new-category-group').style.display = 'none';
    
    document.getElementById('menu-modal').classList.add('open');
  });
}

async function loadMenuItemData(id) {
  try {
    // Try API first
    const response = await fetch('/api/menu');
    if (response.ok) {
      const items = await response.json();
      const item = items.find(i => i.id === id);
      if (item) return item;
    }
  } catch (e) {
    console.log('API fetch failed, checking local');
  }
  
  // Check localStorage
  const localMenu = JSON.parse(localStorage.getItem('nargis_menu') || '[]');
  const localItem = localMenu.find(i => i.id === id);
  if (localItem) return localItem;
  
  // Fallback to db.json
  try {
    const res = await fetch('data/db.json');
    const db = await res.json();
    return db.menu.find(i => i.id === id);
  } catch (e) {
    return null;
  }
}

// ── SAVE MENU ITEM ──
async function saveMenuItem(e) {
  e.preventDefault();
  
  const editId = document.getElementById('menu-edit-id').value;
  const name = document.getElementById('menu-name').value.trim();
  const price = parseFloat(document.getElementById('menu-price').value);
  const category = document.getElementById('menu-category').value;
  const newCategory = document.getElementById('menu-new-category').value.trim();
  const description = document.getElementById('menu-description').value.trim();
  const spice = document.getElementById('menu-spice').value;
  const image = document.getElementById('menu-image').value.trim() || 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=600';
  const popular = document.getElementById('menu-popular').checked;
  const vegetarian = document.getElementById('menu-vegetarian').checked;
  
  // Validate
  if (!name || !price || !description) {
    showAdminToast('Please fill in all required fields', 'error');
    return;
  }
  
  const finalCategory = category === 'new' ? newCategory : category;
  if (category === 'new' && !newCategory) {
    showAdminToast('Please enter a new category name', 'error');
    return;
  }
  
  const itemData = {
    name,
    price,
    category: finalCategory,
    description,
    spice,
    image,
    popular,
    vegetarian,
    currency: 'KES'
  };
  
  try {
    if (editId) {
      // Update existing item
      itemData.id = parseInt(editId);
      
      // Try API update
      try {
        const response = await fetch(`/api/menu/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(itemData)
        });
        
        if (response.ok) {
          showAdminToast(`✅ "${name}" updated successfully!`, 'success');
          closeMenuModal();
          loadMenuManager();
          // Also update the frontend menu data
          updateFrontendMenu(itemData);
          return;
        }
      } catch (apiError) {
        console.log('API update failed, using fallback');
      }
      
      // Fallback: update in localStorage
      let localMenu = JSON.parse(localStorage.getItem('nargis_menu') || '[]');
      const index = localMenu.findIndex(item => item.id === parseInt(editId));
      if (index !== -1) {
        localMenu[index] = { ...localMenu[index], ...itemData };
      } else {
        localMenu.push({ id: parseInt(editId), ...itemData });
      }
      localStorage.setItem('nargis_menu', JSON.stringify(localMenu));
      
      // Also try to update db.json via fetch
      updateDbJson(itemData);
      
      showAdminToast(`✅ "${name}" updated successfully (local)`, 'success');
      closeMenuModal();
      loadMenuManager();
      updateFrontendMenu(itemData);
      
    } else {
      // Add new item
      // Get current max ID
      let maxId = 0;
      try {
        const response = await fetch('/api/menu');
        if (response.ok) {
          const items = await response.json();
          maxId = items.reduce((max, item) => Math.max(max, item.id || 0), 0);
        }
      } catch (e) {
        console.log('API fetch failed for ID generation');
      }
      
      // Check localStorage as well
      const localMenu = JSON.parse(localStorage.getItem('nargis_menu') || '[]');
      const localMaxId = localMenu.reduce((max, item) => Math.max(max, item.id || 0), 0);
      maxId = Math.max(maxId, localMaxId);
      
      const newId = maxId + 1;
      itemData.id = newId;
      
      // Try API save
      try {
        const response = await fetch('/api/menu', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(itemData)
        });
        
        if (response.ok) {
          showAdminToast(`✅ "${name}" added to menu!`, 'success');
          closeMenuModal();
          loadMenuManager();
          updateFrontendMenu(itemData);
          return;
        }
      } catch (apiError) {
        console.log('API save failed, using fallback');
      }
      
      // Fallback: save to localStorage
      localMenu.push(itemData);
      localStorage.setItem('nargis_menu', JSON.stringify(localMenu));
      
      // Also try to update db.json
      updateDbJson(itemData);
      
      showAdminToast(`✅ "${name}" added to menu (local)`, 'success');
      closeMenuModal();
      loadMenuManager();
      updateFrontendMenu(itemData);
    }
    
  } catch (error) {
    console.error('Error saving menu item:', error);
    showAdminToast('Error saving menu item. Please try again.', 'error');
  }
}

// ── UPDATE DB.JSON ──
async function updateDbJson(itemData) {
  try {
    // Read current db.json
    const response = await fetch('data/db.json');
    const db = await response.json();
    
    // Update menu
    const existingIndex = db.menu.findIndex(item => item.id === itemData.id);
    if (existingIndex !== -1) {
      db.menu[existingIndex] = itemData;
    } else {
      db.menu.push(itemData);
    }
    
    // Write back (this would need a server endpoint, but we'll use localStorage as fallback)
    localStorage.setItem('nargis_menu_backup', JSON.stringify(db.menu));
    
    // Also send to server via PUT if available
    try {
      await fetch('/api/menu/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ menu: db.menu })
      });
    } catch (e) {
      console.log('Server sync not available, changes saved locally');
    }
    
  } catch (error) {
    console.log('Could not update db.json directly, changes saved in localStorage');
  }
}

// ── UPDATE FRONTEND MENU ──
function updateFrontendMenu(itemData) {
  // This ensures the main website sees the updated menu
  try {
    // Store in a global variable for the frontend
    if (window.menuData) {
      const existingIndex = window.menuData.findIndex(item => item.id === itemData.id);
      if (existingIndex !== -1) {
        window.menuData[existingIndex] = itemData;
      } else {
        window.menuData.push(itemData);
      }
      // Re-render menu if on main page
      if (typeof renderMenu === 'function') {
        renderMenu();
      }
    }
  } catch (e) {
    console.log('Frontend update skipped');
  }
}

// ── DELETE MENU ITEM ──
async function deleteMenuItem(id) {
  if (!confirm('Are you sure you want to delete this menu item? This action cannot be undone.')) return;
  
  // Get item name for toast message
  let itemName = 'Item';
  try {
    const items = await loadAllMenuItems();
    const item = items.find(i => i.id === id);
    if (item) itemName = item.name;
  } catch (e) {}
  
  try {
    // Try API delete
    try {
      const response = await fetch(`/api/menu/${id}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        showAdminToast(`✅ "${itemName}" deleted from menu`, 'success');
        loadMenuManager();
        removeFromFrontendMenu(id);
        return;
      }
    } catch (apiError) {
      console.log('API delete failed, using fallback');
    }
    
    // Fallback: remove from localStorage
    let localMenu = JSON.parse(localStorage.getItem('nargis_menu') || '[]');
    localMenu = localMenu.filter(item => item.id !== id);
    localStorage.setItem('nargis_menu', JSON.stringify(localMenu));
    
    // Also try to remove from db.json
    try {
      const response = await fetch('data/db.json');
      const db = await response.json();
      db.menu = db.menu.filter(item => item.id !== id);
      localStorage.setItem('nargis_menu_backup', JSON.stringify(db.menu));
    } catch (e) {
      console.log('Could not update db.json');
    }
    
    showAdminToast(`✅ "${itemName}" deleted from menu (local)`, 'success');
    loadMenuManager();
    removeFromFrontendMenu(id);
    
  } catch (error) {
    console.error('Error deleting menu item:', error);
    showAdminToast('Error deleting menu item. Please try again.', 'error');
  }
}

// ── REMOVE FROM FRONTEND MENU ──
function removeFromFrontendMenu(id) {
  try {
    if (window.menuData) {
      window.menuData = window.menuData.filter(item => item.id !== id);
      if (typeof renderMenu === 'function') {
        renderMenu();
      }
    }
  } catch (e) {
    console.log('Frontend removal skipped');
  }
}

// ── LOAD ALL MENU ITEMS ──
async function loadAllMenuItems() {
  let allItems = [];
  
  try {
    const response = await fetch('/api/menu');
    if (response.ok) {
      allItems = await response.json();
    }
  } catch (e) {
    console.log('API fetch failed');
  }
  
  // Check localStorage
  const localMenu = JSON.parse(localStorage.getItem('nargis_menu') || '[]');
  
  // Merge and deduplicate
  const merged = [...allItems];
  localMenu.forEach(localItem => {
    const existingIndex = merged.findIndex(item => item.id === localItem.id);
    if (existingIndex !== -1) {
      merged[existingIndex] = localItem;
    } else {
      merged.push(localItem);
    }
  });
  
  // Also check db.json
  try {
    const res = await fetch('data/db.json');
    const db = await res.json();
    db.menu.forEach(dbItem => {
      const existingIndex = merged.findIndex(item => item.id === dbItem.id);
      if (existingIndex === -1) {
        merged.push(dbItem);
      }
    });
  } catch (e) {}
  
  return merged;
}

// ── REFRESH MENU ──
function refreshMenu() {
  showAdminToast('🔄 Refreshing menu...', 'info');
  loadMenuManager();
}

// ── CLOSE MENU MODAL ──
function closeMenuModal() {
  document.getElementById('menu-modal').classList.remove('open');
}

// ── MODAL ──
function openDetailModal() {
  document.getElementById('detail-modal').classList.add('open');
}

function closeDetailModal() {
  document.getElementById('detail-modal').classList.remove('open');
}

// ── TOAST ──
function showAdminToast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `admin-toast ${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { 
    t.classList.remove('show'); 
    setTimeout(() => t.remove(), 400); 
  }, 3500);
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

// ── CATEGORY CHANGE HANDLER ──
document.addEventListener('DOMContentLoaded', function() {
  // Category change handler for new category
  const categorySelect = document.getElementById('menu-category');
  if (categorySelect) {
    categorySelect.addEventListener('change', function() {
      const newCatGroup = document.getElementById('new-category-group');
      const newCatInput = document.getElementById('menu-new-category');
      if (this.value === 'new') {
        newCatGroup.style.display = 'block';
        newCatInput.required = true;
      } else {
        newCatGroup.style.display = 'none';
        newCatInput.required = false;
        newCatInput.value = '';
      }
    });
  }
  
  // Modal close on background click
  document.getElementById('menu-modal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('menu-modal')) closeMenuModal();
  });
  
  document.getElementById('detail-modal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('detail-modal')) closeDetailModal();
  });
});

// ── INIT ──
document.addEventListener('DOMContentLoaded', () => {
  if (sessionStorage.getItem('nargis_admin') === '1') {
    showApp();
  }

  document.getElementById('login-form')?.addEventListener('submit', (e) => {
    e.preventDefault(); 
    login();
  });
});