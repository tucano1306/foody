'use client';

import { useCallback, useEffect, useState } from 'react';

export interface GastoPendiente {
  ref: string;
  fecha: string;
  monto: number;
  categoria: string;
  descripcion: string;
}

export interface EstadoComputo {
  disponible: true;
  activo: boolean;
  desde: string;
  empresa: string | null;
  ultimaSync: string | null;
  ultimoError: string | null;
  ultimoResumen: { porAccion: Record<string, number>; enviados: number } | null;
  pendientes: { nuevos: number; quitar: number; muestra: GastoPendiente[] } | null;
  categorias: { tickets: { foody: string; computo: string }[]; pagos: string[] };
}

export type AccionPrevista = 'creado' | 'actualizado' | 'sin_cambios' | 'vinculado';

const URL = '/api/integrations/computo';

async function leer<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { message?: string; mensaje?: string };
  if (!res.ok && res.status !== 502) throw new Error(data.message ?? data.mensaje ?? 'No se pudo hablar con Foody');
  return data;
}

/**
 * El estado del enlace con Computo y sus acciones, para el chip y la hoja.
 *
 * `null` mientras carga o cuando no está disponible para este usuario (404):
 * en ese caso el chip simplemente no aparece.
 */
export function useComputo() {
  const [estado, setEstado] = useState<EstadoComputo | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    try {
      const res = await fetch(URL, { credentials: 'include', cache: 'no-store' });
      if (res.status === 404) return setEstado(null);
      setEstado(await leer<EstadoComputo>(res));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const accion = useCallback(
    async <T,>(hacer: () => Promise<Response>): Promise<T | null> => {
      setOcupado(true);
      setError(null);
      try {
        const res = await hacer();
        const data = await leer<T & { estado?: string; mensaje?: string }>(res);
        if (data.estado === 'error') setError(data.mensaje ?? 'Algo falló');
        return data;
      } catch (e) {
        setError((e as Error).message);
        return null;
      } finally {
        setOcupado(false);
      }
    },
    [],
  );

  const guardar = useCallback(
    async (cambios: { activo?: boolean; desde?: string }) => {
      const nuevo = await accion<EstadoComputo>(() =>
        fetch(URL, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cambios),
        }),
      );
      if (nuevo) setEstado(nuevo);
    },
    [accion],
  );

  const sincronizar = useCallback(async () => {
    await accion(() => fetch(`${URL}/sync`, { method: 'POST', credentials: 'include', body: '{}' }));
    await recargar();
  }, [accion, recargar]);

  const simular = useCallback(
    (desde?: string) =>
      accion<{ estado: string; resultados?: { ref: string; accion: AccionPrevista }[] }>(() =>
        fetch(`${URL}/sync`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ simular: true, desde }),
        }),
      ),
    [accion],
  );

  const probar = useCallback(async () => {
    const r = await accion<{ ok: boolean; empresa?: { nombre: string }; mensaje?: string }>(() =>
      fetch(`${URL}/sync`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ probar: true }),
      }),
    );
    if (r && !r.ok) setError(r.mensaje ?? 'No se pudo conectar con Computo');
    await recargar();
    return r;
  }, [accion, recargar]);

  return { estado, ocupado, error, recargar, guardar, sincronizar, simular, probar };
}
