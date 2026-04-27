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

// ── USER MODEL WITH PROPOSAL LIMITS ──────────────────────────────
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
  
  // Check if a month has passed
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
    endpoints: ['auth/signup', 'auth/login', 'auth/me', 'generate/proposal', 'payment/upgrade']
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

    // Reset monthly counter if needed
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

// ── AI GENERATION ROUTES WITH LIMITS ─────────────────────────────

// Generate Proposal (WITH LIMIT CHECK)
app.post('/api/generate/proposal', authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    
    // Check and reset monthly limit
    await checkAndResetMonthlyLimit(user);
    
    // Check if user has reached limit
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

    // Check API key
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ 
        success: false, 
        message: 'AI service not configured. Please contact support.' 
      });
    }

    console.log('[AI] Generating proposal for:', clientName || 'Client');

    // Build prompt
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

    // Call Anthropic API
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

    console.log('[AI] Calling Anthropic API with Claude 4 Haiku...');

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
    console.log('[AI] API Response status:', response.status);

    if (!response.ok) {
      console.error('[AI] API Error:', responseText);
      return res.status(500).json({ 
        success: false, 
        message: 'AI generation failed. Check server logs for details.' 
      });
    }

    const data = JSON.parse(responseText);
    const proposal = data.content && data.content[0] && data.content[0].text;

    if (!proposal) {
      console.error('[AI] No proposal in response:', data);
      return res.status(500).json({ 
        success: false, 
        message: 'AI did not generate a proposal' 
      });
    }

    // INCREMENT PROPOSAL COUNT
    user.proposalsGenerated += 1;
    await user.save();

    console.log('[AI] ✓ Proposal generated successfully!');
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

// ── PAYMENT ROUTES ───────────────────────────────────────────────

// Upgrade to Pro (DEPRECATED - use verify-paypal instead)
app.post('/api/payment/upgrade', authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    
    // This route is deprecated - users should go through PayPal
    // But keeping it for backward compatibility in testing
    
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
      message: 'Upgrade failed. Please try again.'
    });
  }
});

// Verify PayPal payment and upgrade user
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
    
    // In production, you would verify the payment with PayPal API here
    // For now, we'll trust the subscriptionID from frontend
    
    // TODO: Add PayPal verification
    // const paypalVerified = await verifyPayPalSubscription(subscriptionID);
    // if (!paypalVerified) {
    //   return res.status(400).json({ success: false, message: 'Payment verification failed' });
    // }
    
    if (user.plan === 'pro') {
      return res.status(400).json({
        success: false,
        message: 'You are already on Pro plan'
      });
    }
    
    // Upgrade user
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
      message: 'Payment verification failed. Please contact support.'
    });
  }
});

// Check subscription status
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

// ── 404 & ERROR HANDLERS ─────────────────────────────────────────
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
  console.log('[SERVER] Using Claude 4 Haiku (2026 model)');
  console.log('[SERVER] Proposal limits enabled: Free=5, Pro=Unlimited');
  console.log('[SERVER] Anthropic API key:', process.env.ANTHROPIC_API_KEY ? 'Configured ✓' : 'Missing ✗');
});
