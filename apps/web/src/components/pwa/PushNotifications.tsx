'use client';

import { useEffect } from 'react';
import Script from 'next/script';

const APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;

declare global {
  // eslint-disable-next-line no-var
  var OneSignalDeferred: Array<(os: OneSignalSDK) => void | Promise<void>> | undefined;
}

interface OneSignalSDK {
  init(config: Record<string, unknown>): Promise<void>;
  User: {
    PushSubscription: {
      id: string | null;
      optIn(): Promise<void>;
      addEventListener(event: 'change', cb: (e: { current: { id: string | null } }) => void): void;
    };
  };
  Notifications: {
    requestPermission(): Promise<void>;
    permissionNative: string;
  };
}

async function savePlayerId(id: string) {
  try {
    await fetch('/api/proxy/users/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ onesignalPlayerId: id }),
    });
  } catch {
    // Non-critical — notifications will not work but the app is fine
  }
}

function initOneSignal(OneSignal: OneSignalSDK) {
  void (async () => {
    await OneSignal.init({
      appId: APP_ID,
      serviceWorkerParam: { scope: '/' },
      serviceWorkerPath: '/sw.js',
      serviceWorkerUpdaterPath: '/sw.js',
      notifyButton: { enable: false },
      welcomeNotification: { disable: true },
      allowLocalhostAsSecureOrigin: process.env.NODE_ENV === 'development',
    });

    // Save subscription ID whenever it changes (grant, revoke, refresh)
    OneSignal.User.PushSubscription.addEventListener('change', (event) => {
      if (event.current.id) {
        void savePlayerId(event.current.id);
      }
    });

    // If already subscribed, ensure we have the ID on record
    const existingId = OneSignal.User.PushSubscription.id;
    if (existingId) {
      void savePlayerId(existingId);
      return;
    }

    // Request permission only if the user hasn't been asked before
    if (OneSignal.Notifications.permissionNative === 'default') {
      await OneSignal.Notifications.requestPermission();
    }
  })();
}

/**
 * Bootstraps OneSignal web push notifications.
 * Requires NEXT_PUBLIC_ONESIGNAL_APP_ID to be set.
 * Silently skips if the env var is missing or the browser has no SW support.
 */
export default function PushNotifications() {
  useEffect(() => {
    if (!APP_ID || !('serviceWorker' in navigator)) return;

    globalThis.OneSignalDeferred = globalThis.OneSignalDeferred ?? [];
    globalThis.OneSignalDeferred.push(initOneSignal);
  }, []);

  if (!APP_ID) return null;

  return (
    <Script
      src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js"
      strategy="afterInteractive"
    />
  );
}
