const webPush = require('web-push');
const User = require('../models/User');

// Configure web-push with VAPID keys from environment
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@darwinbox.com';

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.warn('⚠️  VAPID keys not configured. Push notifications will not work.');
} else {
  webPush.setVapidDetails(
    VAPID_SUBJECT,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
  console.log('✅ Web Push configured successfully');
}

/**
 * Send push notification to a user
 * @param {string} userId - User ID to send notification to
 * @param {object} payload - Notification payload
 * @returns {Promise<boolean>} - Success status
 */
async function sendPushToUser(userId, payload) {
  try {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return false;
    }

    const user = await User.findById(userId).select('pushSubscription');
    
    if (!user || !user.pushSubscription) {
      return false;
    }

    const pushPayload = JSON.stringify(payload);

    await webPush.sendNotification(user.pushSubscription, pushPayload);
    return true;
  } catch (error) {
    console.error('Push notification error:', error.message);
    
    // Remove subscription if it's expired or invalid (410 Gone)
    if (error.statusCode === 410) {
      try {
        await User.findByIdAndUpdate(userId, { pushSubscription: null });
        console.log(`Removed expired push subscription for user ${userId}`);
      } catch (err) {
        console.error('Failed to remove expired subscription:', err.message);
      }
    }
    
    return false;
  }
}

module.exports = {
  sendPushToUser,
  getVapidPublicKey: () => VAPID_PUBLIC_KEY
};
