import api from '../api/axios';

const urlBase64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

export const registerServiceWorker = async () => {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service Workers not supported');
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    console.log('Service Worker registered:', registration);
    return registration;
  } catch (error) {
    console.error('Service Worker registration failed:', error);
    return false;
  }
};

export const requestNotificationPermission = async () => {
  if (!('Notification' in window)) {
    console.warn('Notifications not supported');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
};

export const subscribeToPushNotifications = async () => {
  try {
    const registration = await navigator.serviceWorker.ready;

    if (!registration.pushManager) {
      console.warn('Push Manager not supported');
      return false;
    }

    // Get VAPID public key from backend
    const { data } = await api.get('/push/vapid-public-key');
    if (!data.success || !data.publicKey) {
      console.warn('VAPID key not available');
      return false;
    }

    const applicationServerKey = urlBase64ToUint8Array(data.publicKey);

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey
    });

    // Send subscription to backend
    await api.post('/push/subscribe', { subscription });
    console.log('Push subscription saved');
    return true;
  } catch (error) {
    console.error('Push subscription failed:', error);
    return false;
  }
};

export const unsubscribeFromPushNotifications = async () => {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      await subscription.unsubscribe();
      await api.post('/push/unsubscribe');
      console.log('Unsubscribed from push notifications');
    }
  } catch (error) {
    console.error('Unsubscribe failed:', error);
  }
};

export const initializePushNotifications = async () => {
  const swRegistered = await registerServiceWorker();
  if (!swRegistered) return false;

  const permissionGranted = await requestNotificationPermission();
  if (!permissionGranted) return false;

  const subscribed = await subscribeToPushNotifications();
  return subscribed;
};
