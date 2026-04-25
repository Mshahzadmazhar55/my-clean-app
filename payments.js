const express = require('express');
const { protect } = require('./auth-middleware');
const User = require('./User');

const router = express.Router();

// Simplified payment routes - placeholder until real Xendit keys are added

// POST /api/payments/create-checkout — create payment checkout (placeholder)
router.post('/create-checkout', protect, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    // Return placeholder response
    res.json({ 
      success: true, 
      message: 'Payment system will be activated when Xendit keys are added',
      url: `${process.env.FRONTEND_URL}/pricing?setup=needed`
    });
  } catch (err) { 
    next(err); 
  }
});

// POST /api/payments/portal — billing portal (placeholder)
router.post('/portal', protect, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    
    res.json({ 
      success: true, 
      message: 'Billing portal will be available when Xendit is configured',
      url: `${process.env.FRONTEND_URL}/dashboard?billing=true` 
    });
  } catch (err) { 
    next(err); 
  }
});

// GET /api/payments/status — get current subscription status
router.get('/status', protect, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    res.json({
      success: true,
      plan: user.plan,
      subscriptionStatus: user.subscriptionStatus || 'inactive',
      subscriptionCurrentPeriodEnd: user.subscriptionCurrentPeriodEnd
    });
  } catch (err) { 
    next(err); 
  }
});

// POST /api/payments/webhook — webhook handler (placeholder)
router.post('/webhook', async (req, res) => {
  try {
    console.log('[WEBHOOK] Payment webhook received (placeholder mode)');
    res.json({ received: true });
  } catch (err) {
    console.error('[WEBHOOK ERROR]', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

module.exports = router;
