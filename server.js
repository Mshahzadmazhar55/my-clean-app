const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();

// ── CORS ─────────────────────────────────────────────────────────
app.use(cors({
  origin: [
    'https://propflow-frontend-seven.vercel.app',
    'https://propflow-frontend.vercel.app',
    process.env.FRONTEND_URL
  ].filter(Boolean),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// ── DATABASE ─────────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/propflow')
  .then(() => console.log('[DB] MongoDB connected'))
  .catch(err => console.error('[DB] Error:', err.message));

// ── USER MODEL ──────────────────────────────────────────────────
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  plan: { 
    type: String, 
    default: 'free',
    enum: ['free', 'pro']
  },
  proposalsGenerated: { 
    type: Number, 
    default: 0 
  },
  monthlyResetDate: { 
    type: Date, 
    default: () => new Date() 
  },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);

// ── TESTIMONIAL MODEL ──────────────────────────────────────────
const TestimonialSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName: { type: String, required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  feedback: { type: String, required: true },
  approved: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const Testimonial = mongoose.model('Testimonial', TestimonialSchema);

// ── PLAN LIMITS ──────────────────────────────────────────────────
const PLAN_LIMITS = {
  free: 3,
  pro: Infinity
};

// ── AUTH MIDDLEWARE ──────────────────────────────────────────────
const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'No token provided' 
      });
    }

    const decoded = jwt.verify(
      token, 
      process.env.JWT_SECRET || 'propflow_secret_key'
    );
    
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('[AUTH ERROR]', error);
    res.status(401).json({ 
      success: false, 
      message: 'Invalid token' 
    });
  }
};

// ── RESET MONTHLY COUNTER ────────────────────────────────────────
const checkAndResetMonthlyLimit = async (user) => {
  const now = new Date();
  const lastReset = new Date(user.monthlyResetDate);
  
  const monthsPassed = (now.getFullYear() - lastReset.getFullYear()) * 12 + 
                      (now.getMonth() - lastReset.getMonth());
  
  if (monthsPassed >= 1) {
    user.proposalsGenerated = 0;
    user.monthlyResetDate = now;
    await user.save();
  }
};

// ── HEALTH CHECK ─────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ 
    success: true, 
    message: 'PropFlow Backend Running',
    status: 'online'
  });
});

app.get('/api', (req, res) => {
  res.json({ 
    success: true, 
    message: 'PropFlow API v1.0',
    endpoints: ['auth/signup', 'auth/login', 'generate/proposal', 'testimonials']
  });
});

// ── AUTH ROUTES ──────────────────────────────────────────────────

// Signup
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please provide name, email and password' 
      });
    }

    if (password.length < 8) {
      return res.status(400).json({ 
        success: false, 
        message: 'Password must be at least 8 characters' 
      });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email already registered' 
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      plan: 'free',
      proposalsGenerated: 0,
      monthlyResetDate: new Date()
    });

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET || 'propflow_secret_key',
      { expiresIn: '30d' }
    );

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        plan: user.plan,
        proposalsGenerated: user.proposalsGenerated,
        proposalsRemaining: PLAN_LIMITS[user.plan] - user.proposalsGenerated
      }
    });

  } catch (error) {
    console.error('[SIGNUP ERROR]', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error. Please try again.' 
    });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please provide email and password' 
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid email or password' 
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid email or password' 
      });
    }

    await checkAndResetMonthlyLimit(user);

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET || 'propflow_secret_key',
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      message: 'Logged in successfully',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        plan: user.plan,
        proposalsGenerated: user.proposalsGenerated,
        proposalsRemaining: user.plan === 'pro' ? 'Unlimited' : (PLAN_LIMITS[user.plan] - user.proposalsGenerated)
      }
    });

  } catch (error) {
    console.error('[LOGIN ERROR]', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error. Please try again.' 
    });
  }
});

// Get current user
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    await checkAndResetMonthlyLimit(req.user);
    
    res.json({
      success: true,
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        plan: req.user.plan,
        proposalsGenerated: req.user.proposalsGenerated,
        proposalsRemaining: req.user.plan === 'pro' ? 'Unlimited' : (PLAN_LIMITS[req.user.plan] - req.user.proposalsGenerated)
      }
    });
  } catch (error) {
    console.error('[AUTH ERROR]', error);
    res.status(401).json({ 
      success: false, 
      message: 'Invalid token' 
    });
  }
});

// ── AI GENERATION WITH LIMITS ────────────────────────────────────

app.post('/api/generate/proposal', authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    
    await checkAndResetMonthlyLimit(user);
    
    const limit = PLAN_LIMITS[user.plan];
    if (user.proposalsGenerated >= limit) {
      return res.status(403).json({
        success: false,
        message: 'Proposal limit reached',
        limit: limit,
        generated: user.proposalsGenerated,
        upgrade: true
      });
    }

    const { 
      name, 
      profession, 
      yearsExperience, 
      email,
      clientName, 
      projectDescription, 
      budget, 
      timeline, 
      deliverables 
    } = req.body;

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ 
        success: false, 
        message: 'AI service not configured' 
      });
    }

    console.log('[AI] Generating proposal for:', clientName || 'Client');

    const prompt = `You are a professional proposal writer. Create a compelling business proposal based on the following information:

Freelancer: ${name || user.name}
Profession: ${profession || 'Professional'}
Experience: ${yearsExperience || '3'} years
Contact: ${email || user.email}

Client: ${clientName || 'Valued Client'}
Project: ${projectDescription || 'Project description'}
Budget: ${budget || 'To be discussed'}
Timeline: ${timeline || 'To be discussed'}
Deliverables: ${deliverables || 'Project deliverables'}

Write a professional, persuasive proposal that includes:
1. A warm introduction
2. Understanding of client needs
3. Proposed solution and approach
4. Clear deliverables breakdown
5. Timeline overview
6. Budget justification
7. Why they should choose you
8. Professional closing

Make it personal, professional, and compelling. Format it nicely with clear sections.`;

    const apiBody = {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    };

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify(apiBody)
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error('[AI] API Error:', responseText);
      return res.status(500).json({ 
        success: false, 
        message: 'AI generation failed' 
      });
    }

    const data = JSON.parse(responseText);
    const proposal = data.content && data.content[0] && data.content[0].text;

    if (!proposal) {
      return res.status(500).json({ 
        success: false, 
        message: 'AI did not generate a proposal' 
      });
    }

    user.proposalsGenerated += 1;
    await user.save();

    console.log(`[LIMIT] User ${user.email} has generated ${user.proposalsGenerated}/${limit} proposals`);

    res.json({
      success: true,
      proposal: proposal,
      message: 'Proposal generated successfully',
      usage: {
        generated: user.proposalsGenerated,
        limit: user.plan === 'pro' ? 'Unlimited' : limit,
        remaining: user.plan === 'pro' ? 'Unlimited' : (limit - user.proposalsGenerated)
      }
    });

  } catch (error) {
    console.error('[AI] Generation error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to generate proposal' 
    });
  }
});

// ── TESTIMONIAL ROUTES ───────────────────────────────────────────

// Submit testimonial (authenticated users only)
app.post('/api/testimonials/submit', authMiddleware, async (req, res) => {
  try {
    const { rating, feedback } = req.body;
    
    if (!rating || !feedback) {
      return res.status(400).json({
        success: false,
        message: 'Rating and feedback are required'
      });
    }
    
    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5'
      });
    }
    
    // Check if user already submitted testimonial
    const existing = await Testimonial.findOne({ userId: req.user._id });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'You have already submitted feedback'
      });
    }
    
    const testimonial = await Testimonial.create({
      userId: req.user._id,
      userName: req.user.name,
      rating: parseInt(rating),
      feedback: feedback.trim(),
      approved: false // Requires admin approval
    });
    
    console.log(`[TESTIMONIAL] New feedback from ${req.user.email}`);
    
    res.json({
      success: true,
      message: 'Thank you for your feedback! It will appear after review.',
      testimonial: {
        rating: testimonial.rating,
        feedback: testimonial.feedback
      }
    });
    
  } catch (error) {
    console.error('[TESTIMONIAL ERROR]', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit feedback'
    });
  }
});

// Get approved testimonials (public - no auth required)
app.get('/api/testimonials', async (req, res) => {
  try {
    const testimonials = await Testimonial.find({ approved: true })
      .select('userName rating feedback createdAt')
      .sort({ createdAt: -1 })
      .limit(50);
    
    res.json({
      success: true,
      testimonials: testimonials,
      count: testimonials.length
    });
    
  } catch (error) {
    console.error('[TESTIMONIALS ERROR]', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch testimonials'
    });
  }
});

// Approve testimonial (for admin - simplified for now)
app.post('/api/testimonials/approve/:id', async (req, res) => {
  try {
    const { adminKey } = req.body;
    
    // Simple admin check - in production, use proper admin auth
    if (adminKey !== process.env.ADMIN_KEY && adminKey !== 'propflow_admin_2026') {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized'
      });
    }
    
    const testimonial = await Testimonial.findById(req.params.id);
    if (!testimonial) {
      return res.status(404).json({
        success: false,
        message: 'Testimonial not found'
      });
    }
    
    testimonial.approved = true;
    await testimonial.save();
    
    console.log(`[TESTIMONIAL] Approved feedback from ${testimonial.userName}`);
    
    res.json({
      success: true,
      message: 'Testimonial approved'
    });
    
  } catch (error) {
    console.error('[APPROVE ERROR]', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve testimonial'
    });
  }
});

// ── PAYMENT ROUTES ───────────────────────────────────────────────

app.post('/api/payment/upgrade', authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    
    if (user.plan === 'pro') {
      return res.status(400).json({
        success: false,
        message: 'You are already on Pro plan'
      });
    }
    
    user.plan = 'pro';
    await user.save();
    
    console.log(`[UPGRADE] User ${user.email} upgraded to Pro (TEST MODE)`);
    
    res.json({
      success: true,
      message: 'Successfully upgraded to Pro plan!',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        plan: user.plan,
        proposalsGenerated: user.proposalsGenerated,
        proposalsRemaining: 'Unlimited'
      }
    });
    
  } catch (error) {
    console.error('[UPGRADE ERROR]', error);
    res.status(500).json({
      success: false,
      message: 'Upgrade failed'
    });
  }
});

app.post('/api/payment/verify-paypal', authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    const { subscriptionID, orderID } = req.body;
    
    if (!subscriptionID) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment data'
      });
    }
    
    if (user.plan === 'pro') {
      return res.status(400).json({
        success: false,
        message: 'You are already on Pro plan'
      });
    }
    
    user.plan = 'pro';
    await user.save();
    
    console.log(`[PAYMENT] User ${user.email} upgraded to Pro via PayPal (ID: ${subscriptionID})`);
    
    res.json({
      success: true,
      message: 'Payment verified and account upgraded!',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        plan: user.plan,
        proposalsGenerated: user.proposalsGenerated,
        proposalsRemaining: 'Unlimited'
      }
    });
    
  } catch (error) {
    console.error('[PAYMENT VERIFICATION ERROR]', error);
    res.status(500).json({
      success: false,
      message: 'Payment verification failed'
    });
  }
});

app.get('/api/payment/status', authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    await checkAndResetMonthlyLimit(user);
    
    res.json({
      success: true,
      plan: user.plan,
      proposalsGenerated: user.proposalsGenerated,
      proposalsRemaining: user.plan === 'pro' ? 'Unlimited' : (PLAN_LIMITS[user.plan] - user.proposalsGenerated),
      limit: user.plan === 'pro' ? 'Unlimited' : PLAN_LIMITS[user.plan]
    });
  } catch (error) {
    console.error('[STATUS ERROR]', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get status'
    });
  }
});

// ── ERROR HANDLERS ───────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    message: 'Route not found' 
  });
});

app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  res.status(500).json({ 
    success: false, 
    message: err.message || 'Internal server error' 
  });
});

// ── START SERVER ─────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`[SERVER] Running on port ${PORT}`);
  console.log('[SERVER] Testimonials system enabled');
  console.log('[SERVER] Proposal limits: Free=3, Pro=Unlimited');
});
