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

// ── USER MODEL ───────────────────────────────────────────────────
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  plan: { type: String, default: 'free' },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);

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
    endpoints: ['auth/signup', 'auth/login', 'auth/me', 'generate/proposal', 'generate/invoice']
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
      password: hashedPassword
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
        plan: user.plan
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
        plan: user.plan
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
app.get('/api/auth/me', async (req, res) => {
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
    
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        plan: user.plan
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

// ── AI GENERATION ROUTES ─────────────────────────────────────────

// Generate Proposal
app.post('/api/generate/proposal', async (req, res) => {
  try {
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

    console.log('[AI] Generating proposal for:', clientName);

    // Build prompt
    const prompt = `You are a professional proposal writer. Create a compelling business proposal based on the following information:

Freelancer: ${name || 'Professional'}
Profession: ${profession || 'Freelancer'}
Experience: ${yearsExperience || '3'} years
Contact: ${email || 'contact@email.com'}

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

    // Call Anthropic API with proper structure
    const apiBody = {
    model: "claude-3-5-sonnet-20241022",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    };

    console.log('[AI] Calling Anthropic API...');

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
        message: 'AI generation failed. Please check your API credits.' 
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

    console.log('[AI] Proposal generated successfully!');

    res.json({
      success: true,
      proposal: proposal,
      message: 'Proposal generated successfully'
    });

  } catch (error) {
    console.error('[AI] Generation error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to generate proposal' 
    });
  }
});

// Generate Invoice  
app.post('/api/generate/invoice', async (req, res) => {
  try {
    const { 
      name, 
      email,
      clientName, 
      items, 
      dueDate,
      notes 
    } = req.body;

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ 
        success: false, 
        message: 'AI service not configured' 
      });
    }

    const prompt = `Create a professional invoice with the following details:

From: ${name || 'Professional'}
Contact: ${email || 'contact@email.com'}
To: ${clientName || 'Client'}
Due Date: ${dueDate || 'Upon receipt'}
Items/Services: ${items || 'Services rendered'}
Additional Notes: ${notes || 'Thank you for your business'}

Format it as a clear, professional invoice with itemized services, subtotal, and total.`;

    const apiBody = {
 model: "claude-3-5-sonnet-20241022",
      max_tokens: 1500,
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
      console.error('[AI] Invoice API Error:', responseText);
      return res.status(500).json({ 
        success: false, 
        message: 'AI generation failed' 
      });
    }

    const data = JSON.parse(responseText);
    const invoice = data.content && data.content[0] && data.content[0].text;

    res.json({
      success: true,
      invoice: invoice,
      message: 'Invoice generated successfully'
    });

  } catch (error) {
    console.error('[AI] Invoice error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to generate invoice' 
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
  console.log('[SERVER] Anthropic API key:', process.env.ANTHROPIC_API_KEY ? 'Configured ✓' : 'Missing ✗');
});
