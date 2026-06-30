// ===========================
//  NARGIS RESTAURANT – APP.JS
//  Complete Frontend with Backend URL Support
// ===========================

// ── CONFIG ──

const BACKEND_URL = 'https://nargis-restaurant.onrender.com';

// If you're testing locally, use:
// const BACKEND_URL = '';

const CONFIG = {
  PAYPAL_CLIENT_ID: 'AboL0c2f8qNqGzMFnPGkM7JkiIvJoUiX8r5aUQG9vjuJe3rYc5Jl7lMgZ5Rt',
  TABLE_DEPOSIT_KES: 500,
  CURRENCY: 'KES',
  RESTAURANT_TEL: '+254722793054',
};

// ── API HELPER ──
function getApiUrl(endpoint) {
  if (BACKEND_URL) {
    return `${BACKEND_URL}${endpoint}`;
  }
  return endpoint; // Relative URL for local development
}

// ── STATE ──
let cart = JSON.parse(localStorage.getItem('nargis_cart') || '[]');
let menuData = [];
let offersData = [];
let reviewsData = [];
let currentPaymentContext = null;
let selectedRating = 0;
let paymentPollingInterval = null;

// ── UTILS ──
const fmt = (n) => 'KES ' + Number(n).toLocaleString('en-KE');
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

function showToast(msg, type = 'info', duration = 3500) {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { 
    t.classList.remove('show'); 
    setTimeout(() => t.remove(), 400); 
  }, duration);
}

// ── DATA LOAD ──
async function loadData() {
  try {
    let db;
    try {
      const menuUrl = getApiUrl('/api/menu');
      console.log('📤 Fetching menu from:', menuUrl);
      
      const res = await fetch(menuUrl);
      if (res.ok) {
        const menuData = await res.json();
        const offersRes = await fetch(getApiUrl('/api/offers'));
        const offersData = await offersRes.json();
        const reviewsRes = await fetch(getApiUrl('/api/reviews'));
        const reviewsData = await reviewsRes.json();
        
        db = { menu: menuData, special_offers: offersData, reviews: reviewsData };
      } else {
        throw new Error('API fetch failed');
      }
    } catch (apiError) {
      console.log('Using fallback data from db.json');
      const res = await fetch('data/db.json');
      db = await res.json();
    }
    
    menuData = db.menu || [];
    offersData = db.special_offers || [];
    reviewsData = (db.reviews || []).filter(r => r.approved);
    
    renderMenu();
    renderOffers();
    renderReviews();
  } catch (e) {
    console.error('Data load failed:', e);
    showToast('Failed to load menu data. Please refresh.', 'error');
  }
}

// ── NAVBAR ──
function initNavbar() {
  const nav = $('#navbar');
  if (!nav) return;
  
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 60);
  });

  const hamburger = $('#hamburger');
  if (hamburger) {
    hamburger.addEventListener('click', () => {
      $('#mobile-menu')?.classList.toggle('open');
    });
  }

  $$('#mobile-menu a, .nav-links a').forEach(a => {
    a.addEventListener('click', () => {
      $('#mobile-menu')?.classList.remove('open');
    });
  });
}

// ── MENU ──
function renderMenu(filter = 'All') {
  const grid = $('#menu-grid');
  if (!grid) return;
  
  const items = filter === 'All' ? menuData : menuData.filter(i => i.category === filter);
  
  if (!items.length) {
    grid.innerHTML = '<p style="text-align:center;color:var(--muted);padding:40px;">No menu items found.</p>';
    return;
  }
  
  grid.innerHTML = items.map(item => `
    <div class="menu-card" onclick="quickAddToCart(${item.id})">
      <img class="menu-card-img" src="${item.image}" alt="${item.name}" loading="lazy" 
           onerror="this.src='https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=600'">
      <div class="menu-card-body">
        <div class="menu-card-header">
          <div class="menu-card-name">${item.name}</div>
          <div class="menu-card-price">${fmt(item.price)}</div>
        </div>
        <p class="menu-card-desc">${item.description}</p>
        <div class="menu-card-tags">
          ${item.vegetarian ? '<span class="tag-veg">🌿 Veg</span>' : ''}
          ${item.spice !== 'none' ? `<span class="tag-spice">🌶 ${item.spice.charAt(0).toUpperCase()+item.spice.slice(1)}</span>` : ''}
          ${item.popular ? '<span class="tag-popular">⭐ Popular</span>' : ''}
        </div>
        <button class="btn-add-cart" onclick="event.stopPropagation();addToCart(${item.id})">+ Add to Order</button>
      </div>
    </div>
  `).join('');
}

function initMenuTabs() {
  const tabsEl = $('#menu-tabs');
  if (!tabsEl || !menuData.length) return;
  
  const categories = ['All', ...new Set(menuData.map(i => i.category))];
  tabsEl.innerHTML = categories.map((c, i) =>
    `<button class="menu-tab ${i === 0 ? 'active' : ''}" data-cat="${c}">${c}</button>`
  ).join('');
  
  tabsEl.addEventListener('click', e => {
    if (!e.target.classList.contains('menu-tab')) return;
    $$('.menu-tab').forEach(t => t.classList.remove('active'));
    e.target.classList.add('active');
    renderMenu(e.target.dataset.cat);
  });
}

// ── CART ──
function saveCart() { 
  localStorage.setItem('nargis_cart', JSON.stringify(cart)); 
}

function addToCart(id) {
  const item = menuData.find(i => i.id === id);
  if (!item) {
    showToast('Item not found', 'error');
    return;
  }
  const existing = cart.find(c => c.id === id);
  if (existing) { 
    existing.qty++; 
  } else { 
    cart.push({ ...item, qty: 1 }); 
  }
  saveCart(); 
  renderCart(); 
  updateCartBadge();
  showToast(`${item.name} added to order 🔥`, 'success');
}

function quickAddToCart(id) { 
  addToCart(id); 
}

function removeFromCart(id) {
  cart = cart.filter(c => c.id !== id);
  saveCart(); 
  renderCart(); 
  updateCartBadge();
}

function changeQty(id, delta) {
  const item = cart.find(c => c.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) {
    removeFromCart(id);
  } else {
    saveCart(); 
    renderCart(); 
    updateCartBadge();
  }
}

function getCartTotals() {
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  return { subtotal, total: subtotal };
}

function renderCart() {
  const itemsEl = $('#cart-items');
  const totalsEl = $('#cart-totals');
  if (!itemsEl) return;

  if (cart.length === 0) {
    itemsEl.innerHTML = `<div class="cart-empty"><span>🍽</span><p>Your order is empty.<br>Browse the menu and add items!</p></div>`;
    if (totalsEl) totalsEl.style.display = 'none';
    return;
  }

  if (totalsEl) totalsEl.style.display = 'block';
  itemsEl.innerHTML = cart.map(item => `
    <div class="cart-item">
      <img class="cart-item-img" src="${item.image}" alt="${item.name}" 
           onerror="this.src='https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=400'">
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-price">${fmt(item.price * item.qty)}</div>
        <div class="cart-qty">
          <button class="qty-btn" onclick="changeQty(${item.id}, -1)">−</button>
          <span class="qty-num">${item.qty}</span>
          <button class="qty-btn" onclick="changeQty(${item.id}, 1)">+</button>
        </div>
      </div>
      <button class="cart-remove" onclick="removeFromCart(${item.id})" title="Remove">✕</button>
    </div>
  `).join('');

  const { subtotal, total } = getCartTotals();
  totalsEl.innerHTML = `
    <div class="cart-total-row"><span>Subtotal</span><span>${fmt(subtotal)}</span></div>
    <div class="cart-total-row grand"><span>Total</span><span>${fmt(total)}</span></div>
    <button class="btn-checkout" onclick="openPayment('order')">Pay Now →</button>
  `;
}

function updateCartBadge() {
  const badge = $('#cart-badge');
  const total = cart.reduce((s, i) => s + i.qty, 0);
  if (badge) { 
    badge.textContent = total; 
    badge.style.display = total > 0 ? 'flex' : 'none'; 
  }
}

function initCart() {
  $('#cart-toggle')?.addEventListener('click', () => {
    $('#cart-sidebar')?.classList.toggle('open');
    $('#overlay-bg')?.classList.toggle('show');
  });
  
  $('#cart-close')?.addEventListener('click', closeCart);
  
  $('#overlay-bg')?.addEventListener('click', () => { 
    closeCart(); 
    closePaymentModal(); 
  });
  
  renderCart(); 
  updateCartBadge();
}

function closeCart() {
  $('#cart-sidebar')?.classList.remove('open');
  $('#overlay-bg')?.classList.remove('show');
}

// ── SPECIAL OFFERS ──
function renderOffers() {
  const grid = $('#offers-grid');
  if (!grid) return;
  
  if (!offersData.length) {
    grid.innerHTML = '<p style="text-align:center;color:rgba(255,255,255,.5);padding:40px;">No special offers available.</p>';
    return;
  }
  
  grid.innerHTML = offersData.map(o => `
    <div class="offer-card">
      <div class="offer-badge">${o.badge}</div>
      <h3 class="offer-title">${o.title}</h3>
      <p class="offer-desc">${o.description}</p>
      <div class="offer-pricing">
        <span class="offer-original">${fmt(o.original_price)}</span>
        <span class="offer-price">${fmt(o.offer_price)}</span>
      </div>
      <span class="offer-valid">Valid until ${new Date(o.valid_until).toLocaleDateString('en-KE',{day:'numeric',month:'long',year:'numeric'})}</span>
      <button class="btn-offer" onclick="addOfferToCart('${o.id}')">Order This Deal 🔥</button>
    </div>
  `).join('');
}

function addOfferToCart(offerId) {
  const offer = offersData.find(o => o.id === offerId);
  if (!offer) return;
  
  const existing = cart.find(c => c.offerId === offerId);
  if (existing) { 
    existing.qty++; 
  } else {
    cart.push({
      id: 'offer_' + offerId,
      offerId,
      name: offer.title + ' (Special Deal)',
      price: offer.offer_price,
      qty: 1,
      image: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400'
    });
  }
  saveCart(); 
  renderCart(); 
  updateCartBadge();
  showToast(`${offer.title} deal added to order! 🎉`, 'success');
  $('#cart-sidebar')?.classList.add('open');
  $('#overlay-bg')?.classList.add('show');
}

// ── RESERVATIONS ──
function initReservation() {
  const form = $('#reservation-form');
  if (!form) return;

  const dateInput = form.querySelector('#res-date');
  if (dateInput) { 
    dateInput.min = new Date().toISOString().split('T')[0]; 
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const data = {
      name: form.querySelector('#res-name').value.trim(),
      email: form.querySelector('#res-email').value.trim(),
      phone: form.querySelector('#res-phone').value.trim(),
      date: form.querySelector('#res-date').value,
      time: form.querySelector('#res-time').value,
      guests: form.querySelector('#res-guests').value,
      occasion: form.querySelector('#res-occasion').value || 'None',
      notes: form.querySelector('#res-notes').value || 'None',
    };
    
    if (!data.name || !data.email || !data.phone || !data.date || !data.time || !data.guests) {
      showToast('Please fill in all required fields', 'error');
      return;
    }
    
    currentPaymentContext = { type: 'reservation', data };
    openPayment('reservation');
  });
}

// ── PAYMENT ──
function openPayment(type) {
  const modal = $('#payment-modal');
  if (!modal) return;

  let amount = 0;
  let label = '';

  if (type === 'order') {
    const { total } = getCartTotals();
    if (cart.length === 0) { 
      showToast('Your cart is empty!', 'error'); 
      return; 
    }
    amount = total;
    label = 'Order Total';
    currentPaymentContext = { type: 'order' };
  } else if (type === 'reservation') {
    amount = CONFIG.TABLE_DEPOSIT_KES;
    label = 'Table Deposit';
  }

  $('#payment-amount-label').textContent = label;
  $('#payment-amount-value').textContent = `KES ${Number(amount).toLocaleString('en-KE')}`;
  modal.dataset.amount = amount;
  modal.dataset.type = type;

  $$('.pay-method-btn').forEach(b => b.classList.remove('active'));
  $$('.mpesa-form, .paypal-form').forEach(f => f.classList.remove('show'));

  closeCart();
  modal.classList.add('open');
}

function closePaymentModal() {
  $('#payment-modal')?.classList.remove('open');
  if (paymentPollingInterval) {
    clearInterval(paymentPollingInterval);
    paymentPollingInterval = null;
  }
}

function selectPayMethod(method) {
  $$('.pay-method-btn').forEach(b => b.classList.remove('active'));
  $(`[data-method="${method}"]`)?.classList.add('active');
  $$('.mpesa-form, .paypal-form').forEach(f => f.classList.remove('show'));
  $(`.${method}-form`)?.classList.add('show');
}

// ── M-PESA PAYMENT (FIXED) ──
async function processMpesa() {
  const phone = $('#mpesa-phone')?.value?.trim();
  const amount = parseInt($('#payment-modal')?.dataset.amount || 0);
  const type = $('#payment-modal')?.dataset.type;

  if (!phone || phone.length < 9) { 
    showToast('Please enter a valid M-Pesa number (e.g. 0712 345678)', 'error'); 
    return; 
  }

  const btn = $('#btn-mpesa-pay');
  btn.textContent = 'Sending...'; 
  btn.disabled = true;
  
  const orderId = 'NG' + Date.now().toString().slice(-6);

  try {
    // Use the API helper to get the full URL
    const url = getApiUrl('/api/mpesa/stk-push');
    console.log('📤 Sending STK Push to:', url);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        phone: phone,
        amount: amount,
        type: type,
        orderId: orderId
      })
    });

    // Read response as text first for debugging
    const responseText = await response.text();
    console.log('📥 Raw response:', responseText);
    
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (e) {
      console.error('❌ Failed to parse JSON:', e);
      throw new Error('Server returned invalid response. Please check backend URL.');
    }

    if (result.success) {
      showToast('📱 M-Pesa STK Push sent! Check your phone and enter PIN.', 'info', 8000);
      
      // Poll for payment status
      let attempts = 0;
      const maxAttempts = 20;
      
      if (paymentPollingInterval) {
        clearInterval(paymentPollingInterval);
      }
      
      paymentPollingInterval = setInterval(async () => {
        attempts++;
        try {
          const statusUrl = getApiUrl(`/api/mpesa/status/${orderId}`);
          const statusRes = await fetch(statusUrl);
          const statusText = await statusRes.text();
          const statusData = JSON.parse(statusText);
          
          if (statusData.data?.status === 'completed' || statusData.data?.status === 'success') {
            clearInterval(paymentPollingInterval);
            paymentPollingInterval = null;
            onPaymentSuccess(type, amount, 'mpesa', 'MP' + Date.now().toString().slice(-8));
            btn.textContent = 'Pay with M-Pesa'; 
            btn.disabled = false;
            showToast('✅ Payment confirmed!', 'success');
          } else if (statusData.data?.status === 'failed' || statusData.data?.status === 'cancelled') {
            clearInterval(paymentPollingInterval);
            paymentPollingInterval = null;
            showToast('❌ Payment failed. Please try again.', 'error');
            btn.textContent = 'Pay with M-Pesa'; 
            btn.disabled = false;
          } else if (attempts >= maxAttempts) {
            clearInterval(paymentPollingInterval);
            paymentPollingInterval = null;
            showToast('⏰ Payment timed out. Please check your M-Pesa for confirmation.', 'info');
            btn.textContent = 'Pay with M-Pesa'; 
            btn.disabled = false;
          }
        } catch (e) {
          console.error('Status check error:', e);
          if (attempts >= maxAttempts) {
            clearInterval(paymentPollingInterval);
            paymentPollingInterval = null;
            btn.textContent = 'Pay with M-Pesa'; 
            btn.disabled = false;
          }
        }
      }, 3000);
      
    } else {
      showToast(result.message || 'Payment initiation failed. Please try again.', 'error');
      btn.textContent = 'Pay with M-Pesa'; 
      btn.disabled = false;
    }

  } catch (error) {
    console.error('❌ M-Pesa Error:', error);
    showToast(`Network error: ${error.message || 'Please check your connection.'}`, 'error');
    btn.textContent = 'Pay with M-Pesa'; 
    btn.disabled = false;
  }
}

function onPaymentSuccess(type, amount, method, ref) {
  closePaymentModal();

  const orderId = 'NG' + Date.now().toString().slice(-6);
  const timestamp = new Date().toISOString();

  if (type === 'order') {
    const order = {
      id: orderId, 
      type: 'order', 
      status: 'paid',
      items: [...cart], 
      total: amount,
      method, 
      ref, 
      timestamp,
    };
    saveToStore('nargis_orders', order);
    cart = []; 
    saveCart(); 
    renderCart(); 
    updateCartBadge();
    showToast(`✅ Order #${orderId} confirmed! You'll receive an SMS shortly.`, 'success', 6000);

  } else if (type === 'reservation') {
    const reservation = {
      id: orderId, 
      type: 'reservation', 
      status: 'confirmed',
      ...currentPaymentContext?.data,
      deposit: amount, 
      method, 
      ref, 
      timestamp,
    };
    saveToStore('nargis_reservations', reservation);
    showToast(`✅ Table reserved! Confirmation sent to your email.`, 'success', 6000);
    $('#reservation-form')?.reset();
  }
  currentPaymentContext = null;
}

function saveToStore(key, record) {
  const existing = JSON.parse(localStorage.getItem(key) || '[]');
  existing.push(record);
  localStorage.setItem(key, JSON.stringify(existing));
}

// ── PAYPAL ──
function loadPayPal() {
  if (document.querySelector('#paypal-sdk')) return;
  const script = document.createElement('script');
  script.id = 'paypal-sdk';
  script.src = `https://www.paypal.com/sdk/js?client-id=${CONFIG.PAYPAL_CLIENT_ID}&currency=USD&intent=capture`;
  script.onload = initPayPalButtons;
  document.head.appendChild(script);
}

function initPayPalButtons() {
  if (!window.paypal) return;
  const container = $('#paypal-btn-container');
  if (!container || container.children.length > 0) return;

  try {
    paypal.Buttons({
      style: { layout: 'horizontal', color: 'blue', shape: 'rect', label: 'pay', height: 45 },
      createOrder: (data, actions) => {
        const kes = parseInt($('#payment-modal')?.dataset.amount || 0);
        const usd = (kes / 130).toFixed(2);
        return actions.order.create({ 
          purchase_units: [{ 
            amount: { value: usd }, 
            description: 'Nargis Restaurant - ' + ($('#payment-modal')?.dataset.type || 'order')
          }] 
        });
      },
      onApprove: (data, actions) => actions.order.capture().then(details => {
        const type = $('#payment-modal')?.dataset.type;
        const amount = parseInt($('#payment-modal')?.dataset.amount || 0);
        onPaymentSuccess(type, amount, 'paypal', details.id);
        showToast('✅ PayPal payment successful!', 'success');
      }),
      onError: (err) => {
        console.error('PayPal Error:', err);
        showToast('PayPal payment failed. Please try again.', 'error');
      },
    }).render('#paypal-btn-container');
  } catch (e) {
    console.error('PayPal init error:', e);
  }
}

// ── REVIEWS ──
function renderReviews() {
  const grid = $('#review-cards');
  if (!grid) return;
  
  if (!reviewsData.length) {
    grid.innerHTML = '<p style="text-align:center;color:rgba(255,255,255,.5);padding:40px;">No reviews yet. Be the first to share your experience!</p>';
    return;
  }
  
  grid.innerHTML = reviewsData.map(r => `
    <div class="review-card">
      <div class="review-header">
        <div>
          <div class="review-author">${r.author}</div>
          <div class="review-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</div>
        </div>
        <span class="review-platform">${r.platform}</span>
      </div>
      <p class="review-text">"${r.text}"</p>
      <div class="review-date">${new Date(r.date).toLocaleDateString('en-KE', {day:'numeric',month:'long',year:'numeric'})}</div>
      <div class="review-type">${r.visitor === 'tourist' ? '✈ International Guest' : '🇰🇪 Local Kenyan'} · ${r.type}</div>
    </div>
  `).join('');
}

function initReviewForm() {
  const stars = $$('.star-btn');
  stars.forEach((btn, i) => {
    btn.addEventListener('click', () => {
      selectedRating = i + 1;
      stars.forEach((s, j) => s.classList.toggle('active', j <= i));
    });
  });

  $('#review-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedRating) { 
      showToast('Please select a star rating!', 'error'); 
      return; 
    }
    
    const name = $('#rv-name')?.value?.trim();
    if (!name) {
      showToast('Please enter your name', 'error');
      return;
    }
    
    const text = $('#rv-text')?.value?.trim();
    if (!text || text.length < 10) {
      showToast('Please write a review with at least 10 characters', 'error');
      return;
    }
    
    const review = {
      id: 'pending_' + Date.now(),
      author: name,
      email: $('#rv-email')?.value?.trim() || '',
      text: text,
      rating: selectedRating,
      platform: 'Website',
      type: $('#rv-type')?.value || 'dine-in',
      visitor: $('#rv-visitor')?.value || 'local',
      date: new Date().toISOString().split('T')[0],
      approved: false,
    };
    
    try {
      const response = await fetch(getApiUrl('/api/reviews'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(review)
      });
      
      if (!response.ok) throw new Error('API save failed');
      
      showToast('✅ Thank you! Your review has been submitted and is awaiting approval.', 'success', 5000);
    } catch (apiError) {
      console.log('Using localStorage fallback for review');
      const pending = JSON.parse(localStorage.getItem('nargis_pending_reviews') || '[]');
      pending.push(review);
      localStorage.setItem('nargis_pending_reviews', JSON.stringify(pending));
      showToast('✅ Thank you! Your review has been submitted and is awaiting approval.', 'success', 5000);
    }
    
    $('#review-form')?.reset();
    selectedRating = 0;
    $$('.star-btn').forEach(s => s.classList.remove('active'));
  });
}

// ── SCROLL ANIMATIONS ──
function initScrollReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) { 
        e.target.style.opacity = '1'; 
        e.target.style.transform = 'translateY(0)'; 
      }
    });
  }, { threshold: 0.1 });

  $$('.menu-card, .offer-card, .review-card, .form-card').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(24px)';
    el.style.transition = 'opacity .5s ease, transform .5s ease';
    observer.observe(el);
  });
}

// ── INIT ──
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 App starting...');
  console.log('📡 Backend URL:', BACKEND_URL || '(using relative path)');
  
  await loadData();
  initNavbar();
  initMenuTabs();
  initCart();
  initReservation();
  initReviewForm();
  loadPayPal();
  initScrollReveal();

  $('#payment-modal')?.addEventListener('click', (e) => {
    if (e.target === $('#payment-modal')) closePaymentModal();
  });
  
  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) {
      $('#mobile-menu')?.classList.remove('open');
    }
  });
});