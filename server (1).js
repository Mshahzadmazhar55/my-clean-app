const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

// ── CORS Configuration ──────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:3000',
  'https://propflow-frontend-seven.vercel.app',
  'https://propflow-frontend.vercel.app'
];

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      return callback(new Error('CORS not allowed'), false);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ── Middleware ──────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Database Connection ─────────────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/propflow';

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('[DB] MongoDB connected successfully'))
.catch(err => console.error('[DB] Connection failed:', err.message));

// ── Routes ──────────────────────────────────────────────────────
app.use('/api/auth', require('./auth-routes'));
app.use('/api/documents', require('./documents'));
app.use('/api/users', require('./users'));
app.use('/api/generate', require('./generate'));
app.use('/api/payments', require('./payments'));

// ── Health Check ────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ 
    success: true, 
    message: 'PropFlow Backend API',
    status: 'running'
  });
});

app.get('/api', (req, res) => {
  res.json({ 
    success: true, 
    message: 'PropFlow API v1.0',
    endpoints: {
      auth: '/api/auth',
      documents: '/api/documents',
      users: '/api/users',
      generate: '/api/generate',
      payments: '/api/payments'
    }
  });
});

// ── 404 Handler ─────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    message: 'Route not found' 
  });
});

// ── Error Handler ───────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  res.status(500).json({ 
    success: false, 
    message: err.message || 'Internal server error' 
  });
});

// ── Server Start ────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`[SERVER] Running on port ${PORT}`);
});
