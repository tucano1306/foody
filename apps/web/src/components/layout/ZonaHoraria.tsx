'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { COOKIE_ZONA, ZONA_POR_DEFECTO, zonaDelDispositivo } from '@/lib/zona';

const ZonaContext = createContext<string>(ZONA_POR_DEFECTO);

function cookieZona(): string | null {
  const par = document.cookie.split('; ').find((c) => c.startsWith(`${COOKIE_ZONA}=`));
  return par ? decodeURIComponent(par.slice(COOKIE_ZONA.length + 1)) : null;
}

/**
 * La zona horaria del dispositivo, para el servidor y para las pantallas.
 *
 * El servidor no sabe dónde está el teléfono: se lo dice esta cookie. Si la
 * que usó para pintar la página no es la del dispositivo —la primera vez, o
 * tras un viaje—, se corrige la cookie y se vuelve a pedir la página, para que
 * «hoy» y «este mes» se recalculen con la buena.
 *
 * Las pantallas leen la zona de aquí y no de `Intl` directamente: el HTML del
 * servidor y el del navegador tienen que decir la misma fecha, o React se queja
 * al hidratar. Arranca con la del servidor y cambia a la vez que la cookie.
 */
export function ZonaHorariaProvider({
  zonaServidor,
  children,
}: {
  readonly zonaServidor: string;
  readonly children: React.ReactNode;
}) {
  const router = useRouter();
  const [zona, setZona] = useState(zonaServidor);

  useEffect(() => {
    const delDispositivo = zonaDelDispositivo();
    if (cookieZona() !== delDispositivo) {
      document.cookie = `${COOKIE_ZONA}=${encodeURIComponent(delDispositivo)}; path=/; max-age=31536000; samesite=lax`;
    }
    // Solo si la cookie quedó puesta: con las cookies bloqueadas el servidor
    // seguiría sin enterarse, y pedir la página otra vez no serviría de nada.
    if (delDispositivo !== zonaServidor && cookieZona() === delDispositivo) {
      setZona(delDispositivo);
      router.refresh();
    }
  }, [zonaServidor, router]);

  return <ZonaContext.Provider value={zona}>{children}</ZonaContext.Provider>;
}

/** La zona en la que hay que enseñar las fechas. */
export function useZonaHoraria(): string {
  return useContext(ZonaContext);
}
