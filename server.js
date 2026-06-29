// ===========================
//  NARGIS RESTAURANT – SERVER.JS
//  Backend for Kora STK Push integration
// ===========================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'db.json');

// ── MIDDLEWARE ──
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── STATIC FILES ──
app.use(express.static(__dirname));

// ── KORA CONFIG ──
const KORA_API_URL = process.env.KORA_API_URL || 'https://api.korahq.com';
const KORA_API_KEY = process.env.KORA_API_KEY;
const KORA_SECRET_KEY = process.env.KORA_SECRET_KEY;
const KORA_CALLBACK_URL = process.env.KORA_CALLBACK_URL;

// ── DB HELPERS ──
function readDB() {
  try {
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading DB:', error);
    return { 
      menu: [], 
      special_offers: [], 
      reviews: [], 
      orders: [], 
      reservations: [], 
      pending_reviews: [] 
    };
  }
}

function writeDB(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('Error writing DB:', error);
    return false;
  }
}

function generateOrderId() {
  return 'NG' + Date.now().toString().slice(-6);
}

// ── HEALTH CHECK ──
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    kora_mode: process.env.KORA_ENV || 'sandbox'
  });
});

// ── KORA STK PUSH ──
app.post('/api/mpesa/stk-push', async (req, res) => {
  try {
    const { phone, amount, type, orderId } = req.body;

    // Validate inputs
    if (!phone || !amount) {
      return res.status(400).json({ 
        success: false, 
        message: 'Phone number and amount are required' 
      });
    }

    // Validate Kora credentials
    if (!KORA_API_KEY || !KORA_SECRET_KEY) {
      console.error('Missing Kora credentials');
      return res.status(500).json({
        success: false,
        message: 'Payment configuration error. Please contact support.'
      });
    }

    // Format phone number (remove +254, 0, spaces)
    let formattedPhone = phone.replace(/\s/g, '');
    if (formattedPhone.startsWith('+254')) {
      formattedPhone = formattedPhone.substring(4);
    } else if (formattedPhone.startsWith('0')) {
      formattedPhone = formattedPhone.substring(1);
    }
    formattedPhone = '254' + formattedPhone;

    // Build STK Push payload
    const reference = orderId || generateOrderId();
    const payload = {
      phone_number: formattedPhone,
      amount: Math.round(amount),
      callback_url: KORA_CALLBACK_URL || 'https://your-domain.com/api/mpesa/callback',
      reference: reference,
      description: `Nargis Restaurant - ${type || 'Order Payment'} #${reference}`,
      business_shortcode: process.env.KORA_BUSINESS_SHORTCODE || '123456',
      passkey: process.env.KORA_PASSKEY || 'your_passkey'
    };

    console.log('📤 Sending STK Push:', { 
      phone: formattedPhone, 
      amount: amount, 
      reference: reference 
    });

    // Make request to Kora API
    const response = await axios.post(
      `${KORA_API_URL}/api/v1/mpesa/stk-push`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${KORA_API_KEY}`,
          'Content-Type': 'application/json',
          'x-secret-key': KORA_SECRET_KEY
        },
        timeout: 30000
      }
    );

    // Save pending transaction to DB
    const db = readDB();
    const pendingTransaction = {
      id: reference,
      type: type || 'order',
      amount: amount,
      phone: formattedPhone,
      status: 'pending',
      timestamp: new Date().toISOString(),
      kora_response: response.data
    };
    
    if (!db.pending_transactions) {
      db.pending_transactions = [];
    }
    db.pending_transactions.push(pendingTransaction);
    writeDB(db);

    console.log('✅ STK Push sent successfully:', reference);
    res.json({
      success: true,
      data: response.data,
      reference: reference,
      message: 'STK Push sent successfully. Check your phone to complete payment.'
    });

  } catch (error) {
    console.error('❌ Kora STK Push Error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: error.response?.data?.message || 'Payment initiation failed. Please try again.',
      error: error.response?.data || error.message
    });
  }
});

// ── KORA CALLBACK WEBHOOK ──
app.post('/api/mpesa/callback', async (req, res) => {
  try {
    const callbackData = req.body;
    console.log('📥 M-Pesa Callback Received:', JSON.stringify(callbackData, null, 2));

    const { reference, status, amount, phone_number, transaction_id, mpesa_receipt } = callbackData;

    // Update pending transaction
    const db = readDB();
    if (db.pending_transactions) {
      const txIndex = db.pending_transactions.findIndex(t => t.id === reference);
      if (txIndex !== -1) {
        db.pending_transactions[txIndex].status = status;
        db.pending_transactions[txIndex].transaction_id = transaction_id || mpesa_receipt;
        db.pending_transactions[txIndex].completed_at = new Date().toISOString();
        writeDB(db);
      }
    }

    if (status === 'completed' || status === 'success') {
      console.log(`✅ Payment successful for order ${reference}`);
      
      // Update order status in db.json
      const orderIndex = db.orders.findIndex(o => o.id === reference);
      if (orderIndex !== -1) {
        db.orders[orderIndex].status = 'paid';
        db.orders[orderIndex].transaction_id = transaction_id || mpesa_receipt;
        db.orders[orderIndex].paid_at = new Date().toISOString();
        writeDB(db);
        console.log(`✅ Order ${reference} marked as paid`);
      }
      
      // Also check reservations
      const resIndex = db.reservations.findIndex(r => r.id === reference);
      if (resIndex !== -1) {
        db.reservations[resIndex].status = 'confirmed';
        db.reservations[resIndex].transaction_id = transaction_id || mpesa_receipt;
        db.reservations[resIndex].paid_at = new Date().toISOString();
        writeDB(db);
        console.log(`✅ Reservation ${reference} marked as confirmed`);
      }
      
      res.json({ success: true, message: 'Payment processed successfully' });
    } else {
      console.log(`❌ Payment failed for order ${reference}: ${status}`);
      res.json({ success: false, message: 'Payment failed' });
    }

  } catch (error) {
    console.error('❌ Callback Error:', error);
    res.status(500).json({ success: false, message: 'Callback processing failed' });
  }
});

// ── CHECK PAYMENT STATUS ──
app.get('/api/mpesa/status/:reference', async (req, res) => {
  try {
    const { reference } = req.params;
    
    // Check local DB first
    const db = readDB();
    
    // Check pending transactions
    if (db.pending_transactions) {
      const tx = db.pending_transactions.find(t => t.id === reference);
      if (tx) {
        return res.json({
          success: true,
          data: { 
            status: tx.status || 'pending', 
            reference: reference,
            transaction_id: tx.transaction_id,
            amount: tx.amount
          }
        });
      }
    }
    
    // Check orders
    const order = db.orders.find(o => o.id === reference);
    if (order && order.status === 'paid') {
      return res.json({
        success: true,
        data: { 
          status: 'completed', 
          reference: reference,
          transaction_id: order.transaction_id,
          amount: order.total
        }
      });
    }
    
    // Check reservations
    const reservation = db.reservations.find(r => r.id === reference);
    if (reservation && reservation.status === 'confirmed') {
      return res.json({
        success: true,
        data: { 
          status: 'completed', 
          reference: reference,
          transaction_id: reservation.transaction_id,
          amount: reservation.deposit
        }
      });
    }

    // If not found locally, check Kora
    if (KORA_API_KEY && KORA_SECRET_KEY) {
      try {
        const response = await axios.get(
          `${KORA_API_URL}/api/v1/mpesa/status/${reference}`,
          {
            headers: {
              'Authorization': `Bearer ${KORA_API_KEY}`,
              'x-secret-key': KORA_SECRET_KEY
            },
            timeout: 10000
          }
        );

        return res.json({
          success: true,
          data: response.data
        });
      } catch (koraError) {
        console.log('Kora status check failed, using local data');
      }
    }

    // Default response
    res.json({
      success: true,
      data: { 
        status: 'pending', 
        reference: reference,
        message: 'Payment status pending. Please check your phone.'
      }
    });

  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment status'
    });
  }
});

// ── ORDERS API ──
app.get('/api/orders', (req, res) => {
  try {
    const db = readDB();
    res.json(db.orders || []);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch orders' });
  }
});

app.post('/api/orders', (req, res) => {
  try {
    const db = readDB();
    const newOrder = {
      ...req.body,
      created_at: new Date().toISOString()
    };
    db.orders.push(newOrder);
    writeDB(db);
    res.json({ success: true, order: newOrder });
  } catch (error) {
    console.error('Error saving order:', error);
    res.status(500).json({ success: false, message: 'Failed to save order' });
  }
});

app.put('/api/orders/:id', (req, res) => {
  try {
    const db = readDB();
    const index = db.orders.findIndex(o => o.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    db.orders[index] = { ...db.orders[index], ...req.body };
    writeDB(db);
    res.json({ success: true, order: db.orders[index] });
  } catch (error) {
    console.error('Error updating order:', error);
    res.status(500).json({ success: false, message: 'Failed to update order' });
  }
});

app.delete('/api/orders/:id', (req, res) => {
  try {
    const db = readDB();
    db.orders = db.orders.filter(o => o.id !== req.params.id);
    writeDB(db);
    res.json({ success: true, message: 'Order deleted' });
  } catch (error) {
    console.error('Error deleting order:', error);
    res.status(500).json({ success: false, message: 'Failed to delete order' });
  }
});

// ── RESERVATIONS API ──
app.get('/api/reservations', (req, res) => {
  try {
    const db = readDB();
    res.json(db.reservations || []);
  } catch (error) {
    console.error('Error fetching reservations:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch reservations' });
  }
});

app.post('/api/reservations', (req, res) => {
  try {
    const db = readDB();
    const newReservation = {
      ...req.body,
      created_at: new Date().toISOString()
    };
    db.reservations.push(newReservation);
    writeDB(db);
    res.json({ success: true, reservation: newReservation });
  } catch (error) {
    console.error('Error saving reservation:', error);
    res.status(500).json({ success: false, message: 'Failed to save reservation' });
  }
});

app.put('/api/reservations/:id', (req, res) => {
  try {
    const db = readDB();
    const index = db.reservations.findIndex(r => r.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Reservation not found' });
    }
    db.reservations[index] = { ...db.reservations[index], ...req.body };
    writeDB(db);
    res.json({ success: true, reservation: db.reservations[index] });
  } catch (error) {
    console.error('Error updating reservation:', error);
    res.status(500).json({ success: false, message: 'Failed to update reservation' });
  }
});

app.delete('/api/reservations/:id', (req, res) => {
  try {
    const db = readDB();
    db.reservations = db.reservations.filter(r => r.id !== req.params.id);
    writeDB(db);
    res.json({ success: true, message: 'Reservation deleted' });
  } catch (error) {
    console.error('Error deleting reservation:', error);
    res.status(500).json({ success: false, message: 'Failed to delete reservation' });
  }
});

// ── REVIEWS API ──
app.get('/api/reviews', (req, res) => {
  try {
    const db = readDB();
    res.json(db.reviews || []);
  } catch (error) {
    console.error('Error fetching reviews:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch reviews' });
  }
});

app.post('/api/reviews', (req, res) => {
  try {
    const db = readDB();
    const newReview = {
      ...req.body,
      approved: false,
      created_at: new Date().toISOString()
    };
    db.pending_reviews = db.pending_reviews || [];
    db.pending_reviews.push(newReview);
    writeDB(db);
    res.json({ success: true, review: newReview });
  } catch (error) {
    console.error('Error saving review:', error);
    res.status(500).json({ success: false, message: 'Failed to save review' });
  }
});

app.get('/api/pending-reviews', (req, res) => {
  try {
    const db = readDB();
    res.json(db.pending_reviews || []);
  } catch (error) {
    console.error('Error fetching pending reviews:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch pending reviews' });
  }
});

app.put('/api/reviews/:id/approve', (req, res) => {
  try {
    const db = readDB();
    const pendingIndex = (db.pending_reviews || []).findIndex(r => r.id === req.params.id);
    if (pendingIndex === -1) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }
    
    const review = db.pending_reviews[pendingIndex];
    review.approved = true;
    review.approved_at = new Date().toISOString();
    
    db.reviews = db.reviews || [];
    db.reviews.push(review);
    db.pending_reviews.splice(pendingIndex, 1);
    writeDB(db);
    
    res.json({ success: true, review: review });
  } catch (error) {
    console.error('Error approving review:', error);
    res.status(500).json({ success: false, message: 'Failed to approve review' });
  }
});

app.delete('/api/reviews/:id/reject', (req, res) => {
  try {
    const db = readDB();
    db.pending_reviews = (db.pending_reviews || []).filter(r => r.id !== req.params.id);
    writeDB(db);
    res.json({ success: true, message: 'Review rejected' });
  } catch (error) {
    console.error('Error rejecting review:', error);
    res.status(500).json({ success: false, message: 'Failed to reject review' });
  }
});

// ── MENU API ──
app.get('/api/menu', (req, res) => {
  try {
    const db = readDB();
    res.json(db.menu || []);
  } catch (error) {
    console.error('Error fetching menu:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch menu' });
  }
});

app.get('/api/offers', (req, res) => {
  try {
    const db = readDB();
    res.json(db.special_offers || []);
  } catch (error) {
    console.error('Error fetching offers:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch offers' });
  }
});

// ── STATS API ──
app.get('/api/stats', (req, res) => {
  try {
    const db = readDB();
    const orders = db.orders || [];
    const reservations = db.reservations || [];
    
    const totalRevenue = orders
      .filter(o => o.status === 'paid')
      .reduce((sum, o) => sum + (o.total || 0), 0);
    
    const totalDeposits = reservations
      .filter(r => r.status === 'confirmed')
      .reduce((sum, r) => sum + (r.deposit || 0), 0);
    
    res.json({
      total_orders: orders.length,
      total_reservations: reservations.length,
      total_revenue: totalRevenue,
      total_deposits: totalDeposits,
      total_combined: totalRevenue + totalDeposits,
      pending_reviews: (db.pending_reviews || []).length,
      active_orders: orders.filter(o => o.status === 'pending').length,
      confirmed_reservations: reservations.filter(r => r.status === 'confirmed').length
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch stats' });
  }
});

// ── ERROR HANDLING ──
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message
  });
});

// ── 404 HANDLING ──
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found'
  });
});

// ── START SERVER ──
app.listen(PORT, () => {
  console.log('🔥 ========================================');
  console.log(`🔥 Nargis Restaurant Server Running`);
  console.log('🔥 ========================================');
  console.log(`📡 Port: ${PORT}`);
  console.log(`📡 API Base: http://localhost:${PORT}/api`);
  console.log(`🔐 Kora Mode: ${process.env.KORA_ENV || 'sandbox'}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📁 DB Path: ${DB_PATH}`);
  console.log('🔥 ========================================');
  console.log('✅ Server ready for connections');
});