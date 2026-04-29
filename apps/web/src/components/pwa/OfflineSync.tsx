'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';

type SyncStatus = 'online' | 'offline' | 'syncing' | 'synced';

interface SWRegWithSync extends ServiceWorkerRegistration {
  sync?: { register: (tag: string) => Promise<void> };
}

interface BannerContent {
  readonly icon: string;
  readonly text: string;
  readonly cls: string;
}

const SYNCED_HIDE_MS = 3500;

function getPendingText(pending: number): string {
  if (pending === 0) return '';
  const noun = pending === 1 ? 'acción pendiente' : 'acciones pendientes';
  return ` · ${pending} ${noun}`;
}

function getBannerContent(
  status: SyncStatus,
  pending: number,
  syncedCount: number,
): BannerContent {
  if (status === 'syncing') {
    return { icon: '🔄', text: 'Sincronizando…', cls: 'bg-indigo-700' };
  }
  if (status === 'synced') {
    const noun = syncedCount === 1 ? 'acción' : 'acciones';
    return {
      icon: '✓',
      text: `Sincronizado · ${syncedCount} ${noun} enviadas`,
      cls: 'bg-green-700',
    };
  }
  return {
    icon: '📵',
    text: `Sin conexión${getPendingText(pending)}`,
    cls: 'bg-gray-900',
  };
}

export default function OfflineSync() {
  const router = useRouter();
  const [status, setStatus] = useState<SyncStatus>('online');
  const [pending, setPending] = useState(0);
  const [syncedCount, setSyncedCount] = useState(0);
  const hideRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHide = useCallback(() => {
    if (hideRef.current) clearTimeout(hideRef.current);
  }, []);

  const scheduleHide = useCallback(() => {
    clearHide();
    hideRef.current = setTimeout(() => setStatus('online'), SYNCED_HIDE_MS);
  }, [clearHide]);

  const requestCount = useCallback(() => {
    navigator.serviceWorker?.controller?.postMessage({ type: 'GET_QUEUE_COUNT' });
  }, []);

  const triggerSync = useCallback(() => {
    setStatus('syncing');
    navigator.serviceWorker?.controller?.postMessage({ type: 'TRIGGER_SYNC' });
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (globalThis.window === undefined) return;

    setStatus(navigator.onLine ? 'online' : 'offline');
    requestCount();

    function handleOffline() {
      setStatus('offline');
      requestCount();
    }

    function registerSync(reg: ServiceWorkerRegistration) {
      const r = reg as SWRegWithSync;
      if (r.sync) {
        r.sync.register('foody-sync').catch(() => triggerSync());
      } else {
        triggerSync();
      }
    }

    function handleOnline() {
      setStatus('syncing');
      navigator.serviceWorker.ready
        .then(registerSync)
        .catch(() => triggerSync());
    }

    function handleMessage(e: MessageEvent) {
      if (e.data?.type === 'OFFLINE_QUEUE_COUNT') {
        setPending(e.data.count as number);
      }
      if (e.data?.type === 'SYNC_COMPLETE') {
        const synced = e.data.synced as number;
        const remaining = e.data.remaining as number;
        setSyncedCount(synced);
        setPending(remaining);
        if (remaining === 0) {
          setStatus('synced');
          if (synced > 0) router.refresh();
          scheduleHide();
        } else {
          setStatus('offline');
        }
      }
    }

    globalThis.addEventListener('offline', handleOffline);
    globalThis.addEventListener('online', handleOnline);
    navigator.serviceWorker.addEventListener('message', handleMessage);

    return () => {
      globalThis.removeEventListener('offline', handleOffline);
      globalThis.removeEventListener('online', handleOnline);
      navigator.serviceWorker.removeEventListener('message', handleMessage);
      clearHide();
    };
  }, [requestCount, triggerSync, router, scheduleHide, clearHide]);

  const show = status !== 'online';
  const { icon, text, cls } = getBannerContent(status, pending, syncedCount);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 28 }}
          className={`fixed top-0 inset-x-0 z-60 flex items-center justify-center gap-2 py-2 px-4 text-white text-xs font-semibold shadow-md ${cls}`}
          role="status"
          aria-live="polite"
        >
          <span
            className={status === 'syncing' ? 'animate-spin inline-block' : 'inline-block'}
          >
            {icon}
          </span>
          <span>{text}</span>
          {status === 'offline' && pending > 0 && (
            <button
              type="button"
              onClick={triggerSync}
              className="ml-2 underline underline-offset-2 opacity-75 hover:opacity-100 transition"
            >
              Reintentar
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
