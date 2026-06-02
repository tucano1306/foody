'use client';

import { useEffect } from 'react';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const SUBSCRIBED_KEY = 'foody_webpush_endpoint';

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replaceAll('-', '+').replaceAll('_', '/');
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.codePointAt(i) ?? 0;
  return output;
}

async function saveSubscription(sub: PushSubscription): Promise<boolean> {
  try {
    const res = await fetch('/api/users/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ pushSubscription: sub.toJSON() }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function setupPush(): Promise<void> {
  if (!VAPID_PUBLIC_KEY) return;
  if (!('serviceWorker' in navigator) || !('PushManager' in globalThis)) return;
  if (Notification.permission === 'denied') return;

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();

  if (localStorage.getItem(SUBSCRIBED_KEY) === sub?.endpoint) return;

  if (Notification.permission === 'default') {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return;
  }

  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    } catch (err) {
      console.error('[Push] subscribe failed:', err);
      return;
    }
  }

  const saved = await saveSubscription(sub);
  if (saved) localStorage.setItem(SUBSCRIBED_KEY, sub.endpoint);
}

export default function PushNotifications() {
  useEffect(() => {
    void setupPush();
  }, []);

  return null;
}
