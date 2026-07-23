'use client';

import { useEffect, useState } from 'react';

/**
 * Contador compartido entre instancias.
 *
 * El Navbar dibuja la navegación dos veces (barra de escritorio + cajón móvil),
 * así que este badge se monta DOS veces a la vez y antes cada copia sondeaba
 * por su cuenta cada 60 s: ~2.880 peticiones diarias por pestaña, cada una
 * despertando el compute de Neon (que suspende a los 5 min de inactividad) y
 * ejecutando el ensureSharingSchema del endpoint en cada arranque en frío.
 *
 * Ahora hay una sola petición para todas las instancias, el intervalo es de
 * 5 minutos y solo corre con la pestaña visible. Al volver a la app se refresca
 * si el dato está viejo, que es justo cuando importa que el badge esté al día.
 */
const POLL_MS = 5 * 60_000;

let cachedCount = 0;
let lastFetchedAt = 0;
let inFlight: Promise<void> | null = null;
const listeners = new Set<(n: number) => void>();

async function fetchCount(force = false): Promise<void> {
  if (!force && Date.now() - lastFetchedAt < POLL_MS) return;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const res = await fetch('/api/sharing/pending-count', { credentials: 'include' });
      if (res.ok) {
        const json = (await res.json()) as { count: number };
        cachedCount = json.count;
        lastFetchedAt = Date.now();
        for (const notify of listeners) notify(cachedCount);
      }
    } catch {
      // network failure — silent
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

export default function SharingBadge() {
  const [count, setCount] = useState(cachedCount);

  useEffect(() => {
    listeners.add(setCount);
    void fetchCount();

    const id = setInterval(() => {
      // Sondear una pestaña en segundo plano no le sirve a nadie y mantiene
      // el compute despierto.
      if (document.visibilityState === 'visible') void fetchCount();
    }, POLL_MS);

    function onVisible() {
      if (document.visibilityState === 'visible') void fetchCount();
    }
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      listeners.delete(setCount);
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  if (count === 0) return null;

  return (
    <span className="ml-auto flex items-center justify-center w-5 h-5 rounded-full bg-rose-500 text-white text-[10px] font-bold shrink-0">
      {count > 9 ? '9+' : count}
    </span>
  );
}
