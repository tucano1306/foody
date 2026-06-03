import webPush, { type PushSubscription } from 'web-push';

let configured = false;

function ensureConfigured(): boolean {
  if (configured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const contact = process.env.VAPID_CONTACT ?? 'mailto:admin@foody.app';
  if (!publicKey || !privateKey) return false;
  webPush.setVapidDetails(contact, publicKey, privateKey);
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  data?: Record<string, unknown>;
}

export async function sendWebPush(
  subscription: PushSubscription,
  payload: PushPayload,
): Promise<{ ok: boolean; gone: boolean; error?: string; statusCode?: number }> {
  if (!ensureConfigured()) {
    return { ok: false, gone: false, error: 'VAPID not configured' };
  }
  try {
    await webPush.sendNotification(subscription, JSON.stringify(payload));
    return { ok: true, gone: false };
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    // 404 / 410 → endpoint gone. 403 usually means VAPID key changed → must resubscribe.
    const gone = statusCode === 404 || statusCode === 410 || statusCode === 403;
    return { ok: false, gone, error: (err as Error).message, statusCode };
  }
}
