'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Posicion } from './geo';

/**
 * La posición del teléfono, con el mínimo de batería y de permisos.
 *
 * - `pedir()`: una lectura suelta, para «📍 Estoy aquí».
 * - `vigilar`: lecturas seguidas mientras la pantalla está a la vista, como
 *   mucho `maxMs` por cada vez que se abre la app. Un GPS en alta precisión
 *   durante toda la compra gasta batería para nada: la tienda se decide en
 *   los primeros minutos, al llegar. Al volver a la app se vigila otra vez.
 *
 * La posición no sale de aquí hacia ningún sitio; quien la usa decide.
 */

export type Permiso = 'concedido' | 'preguntar' | 'denegado' | 'desconocido';
export type EstadoPosicion = 'quieta' | 'buscando' | 'lista' | 'denegada' | 'no-disponible' | 'fallo';

/**
 * Lo que da una lectura suelta. El motivo va en la respuesta y no solo en
 * `estado`: quien espera el resultado lo necesita YA, y el `estado` que ve
 * en su closure es el de antes de pedir.
 */
export type Lectura =
  | { readonly ok: true; readonly posicion: Posicion }
  | { readonly ok: false; readonly motivo: 'denegada' | 'no-disponible' | 'fallo' };

const OPCIONES: PositionOptions = { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 };

function aPosicion(p: GeolocationPosition): Posicion {
  return { lat: p.coords.latitude, lng: p.coords.longitude, precision: p.coords.accuracy };
}

function hayGeolocalizacion(): boolean {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator && !!navigator.geolocation;
}

export function usePosicion({ vigilar, maxMs = 3 * 60_000 }: { readonly vigilar: boolean; readonly maxMs?: number }) {
  const [posicion, setPosicion] = useState<Posicion | null>(null);
  const [estado, setEstado] = useState<EstadoPosicion>('quieta');
  const [permiso, setPermiso] = useState<Permiso>('desconocido');
  const [visible, setVisible] = useState(true);
  const vivo = useRef(true);

  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);

  // El permiso, sin preguntar: saber si ya está concedido decide si se vigila
  // sola al entrar o si espera a que el dueño toque algo.
  useEffect(() => {
    if (!hayGeolocalizacion()) {
      setEstado('no-disponible');
      return;
    }
    let estadoPermiso: PermissionStatus | null = null;
    const leer = (s: PermissionState) =>
      setPermiso(s === 'granted' ? 'concedido' : s === 'denied' ? 'denegado' : 'preguntar');
    const alCambiar = () => estadoPermiso && leer(estadoPermiso.state);
    navigator.permissions
      ?.query({ name: 'geolocation' as PermissionName })
      .then((s) => {
        estadoPermiso = s;
        leer(s.state);
        s.addEventListener?.('change', alCambiar);
      })
      .catch(() => setPermiso('desconocido'));
    return () => estadoPermiso?.removeEventListener?.('change', alCambiar);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const alCambiar = () => setVisible(document.visibilityState !== 'hidden');
    alCambiar();
    document.addEventListener('visibilitychange', alCambiar);
    return () => document.removeEventListener('visibilitychange', alCambiar);
  }, []);

  const alFallar = useCallback((e: GeolocationPositionError) => {
    if (!vivo.current) return;
    if (e.code === e.PERMISSION_DENIED) {
      setEstado('denegada');
      setPermiso('denegado');
    } else if (e.code !== e.TIMEOUT) {
      setEstado('fallo');
    }
  }, []);

  useEffect(() => {
    if (!vigilar || !visible || !hayGeolocalizacion() || permiso === 'denegado') return;
    setEstado((e) => (e === 'lista' ? e : 'buscando'));
    const id = navigator.geolocation.watchPosition(
      (p) => {
        if (!vivo.current) return;
        setPosicion(aPosicion(p));
        setEstado('lista');
        if (permiso !== 'concedido') setPermiso('concedido');
      },
      alFallar,
      OPCIONES,
    );
    const fin = setTimeout(() => navigator.geolocation.clearWatch(id), maxMs);
    return () => {
      clearTimeout(fin);
      navigator.geolocation.clearWatch(id);
    };
  }, [vigilar, visible, permiso, maxMs, alFallar]);

  const pedir = useCallback(
    (): Promise<Lectura> =>
      new Promise((resolve) => {
        if (!hayGeolocalizacion()) {
          setEstado('no-disponible');
          resolve({ ok: false, motivo: 'no-disponible' });
          return;
        }
        setEstado('buscando');
        navigator.geolocation.getCurrentPosition(
          (p) => {
            const pos = aPosicion(p);
            if (vivo.current) {
              setPosicion(pos);
              setEstado('lista');
              setPermiso('concedido');
            }
            resolve({ ok: true, posicion: pos });
          },
          (e) => {
            alFallar(e);
            // Un TIMEOUT en una lectura suelta sí es un fallo: el dueño está esperando.
            if (e.code === e.TIMEOUT && vivo.current) setEstado('fallo');
            resolve({ ok: false, motivo: e.code === e.PERMISSION_DENIED ? 'denegada' : 'fallo' });
          },
          { ...OPCIONES, maximumAge: 5_000 },
        );
      }),
    [alFallar],
  );

  return { posicion, estado, permiso, pedir };
}

/** El aviso cuando una lectura no salió, en una línea. */
export function textoDeFalloDePosicion(estado: EstadoPosicion): string {
  if (estado === 'denegada') return 'Foody no tiene permiso para ver tu ubicación';
  if (estado === 'no-disponible') return 'Este navegador no da la ubicación';
  return 'No se pudo saber dónde estás';
}
