const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const User = require('../models/User');
const { getVapidPublicKey } = require('../utils/pushService');

// GET /api/push/vapid-public-key
router.get('/vapid-public-key', (req, res) => {
  const publicKey = getVapidPublicKey();
  if (!publicKey) {
    return res.status(503).json({ 
      success: false, 
      error: 'Push notifications not configured' 
    });
  }
  res.json({ success: true, publicKey });
});

// POST /api/push/subscribe
router.post('/subscribe', verifyToken, async (req, res) => {
  try {
    const { subscription } = req.body;
    const userId = req.user.id;

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid subscription object' 
      });
    }

    await User.findByIdAndUpdate(userId, { 
      pushSubscription: subscription 
    });

    res.json({ 
      success: true, 
      message: 'Push subscription saved successfully' 
    });
  } catch (error) {
    console.error('Subscribe error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to save subscription' 
    });
  }
});

// POST /api/push/unsubscribe
router.post('/unsubscribe', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    await User.findByIdAndUpdate(userId, { 
      pushSubscription: null 
    });

    res.json({ 
      success: true, 
      message: 'Push subscription removed successfully' 
    });
  } catch (error) {
    console.error('Unsubscribe error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to remove subscription' 
    });
  }
});

module.exports = router;
