'use client';

import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import type { Map as MapaLeaflet, LayerGroup } from 'leaflet';
import type { Posicion, Punto } from '@/lib/geo';

/**
 * Mapa de OpenStreetMap con Leaflet. Gratis y sin clave; a cambio pide la
 * atribución visible («© OpenStreetMap»), que Leaflet pinta en la esquina.
 *
 * Leaflet toca `window` al importarse, así que se carga dentro del efecto y
 * nunca en el servidor. Los mosaicos salen de tile.openstreetmap.org: está
 * en la CSP (`img-src`) y el service worker los deja pasar sin guardarlos.
 *
 * El mapa es un añadido, no la única vía: todo lo que se toca en él está
 * también en la lista de al lado como botón.
 */

export interface PuntoDelMapa extends Punto {
  readonly id: string;
  readonly etiqueta: string;
  /** `sucursal`: tuya, guardada. `resultado`: de la búsqueda. `elegido`: el que se va a guardar. */
  readonly tipo: 'sucursal' | 'resultado' | 'elegido';
}

interface Props {
  readonly puntos: readonly PuntoDelMapa[];
  readonly yo?: Posicion | null;
  /** Dónde mirar si no hay puntos ni posición. */
  readonly centro?: Punto | null;
  readonly onTocarPunto?: (id: string) => void;
  readonly onTocarMapa?: (p: Punto) => void;
  readonly etiqueta: string;
  readonly className?: string;
}

const COLOR: Record<PuntoDelMapa['tipo'], string> = {
  sucursal: 'bg-brand-600 text-white',
  resultado: 'bg-white text-brand-700 ring-2 ring-brand-500',
  elegido: 'bg-emerald-500 text-white scale-110',
};

function htmlDelPin(p: PuntoDelMapa, indice: number): string {
  const texto = p.tipo === 'resultado' ? String(indice + 1) : '';
  // Pin en forma de gota: un círculo con la punta abajo, girado 45°.
  return `<span class="grid place-items-center w-8 h-8 -rotate-45 rounded-[50%_50%_50%_0] shadow-lg ${COLOR[p.tipo]}"><span class="rotate-45 text-[13px] font-extrabold">${texto}</span></span>`;
}

export default function MapaTiendas({ puntos, yo, centro, onTocarPunto, onTocarMapa, etiqueta, className = 'h-56' }: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaLeaflet | null>(null);
  const capa = useRef<LayerGroup | null>(null);
  const leaflet = useRef<typeof import('leaflet') | null>(null);
  // Los callbacks cambian en cada render; el mapa se crea una vez.
  const alTocarPunto = useRef(onTocarPunto);
  const alTocarMapa = useRef(onTocarMapa);
  alTocarPunto.current = onTocarPunto;
  alTocarMapa.current = onTocarMapa;
  // null hasta el primer encuadre: con '' de inicio, un mapa sin puntos
  // (buscar una tienda nueva) daba la clave vacía, «ya encuadrado», y se
  // quedaba mirando el mundo entero en vez de tu zona.
  const encuadrado = useRef<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    void import('leaflet').then((L) => {
      if (cancelado || !contenedor.current || mapa.current) return;
      leaflet.current = L;
      const m = L.map(contenedor.current, { zoomControl: false, attributionControl: true });
      m.attributionControl.setPrefix(false);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
      }).addTo(m);
      m.on('click', (e) => alTocarMapa.current?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
      capa.current = L.layerGroup().addTo(m);
      mapa.current = m;
      m.setView([20, -40], 2);
      // Primer pintado con lo que ya había.
      contenedor.current.dispatchEvent(new Event('foody:pintar'));
    });
    return () => {
      cancelado = true;
      mapa.current?.remove();
      mapa.current = null;
      capa.current = null;
    };
  }, []);

  // Pines y encuadre cada vez que cambian los puntos o tu posición.
  useEffect(() => {
    const pintar = () => {
      const L = leaflet.current;
      const m = mapa.current;
      const c = capa.current;
      if (!L || !m || !c) return;
      c.clearLayers();
      puntos.forEach((p, i) => {
        const marca = L.marker([p.lat, p.lng], {
          // La gota es un cuadrado de 32 px girado 45°: la punta queda centrada,
          // 16·√2 ≈ 23 px por debajo del centro. Ahí va el ancla, en el sitio exacto.
          icon: L.divIcon({ className: '', html: htmlDelPin(p, i), iconSize: [32, 32], iconAnchor: [16, 39] }),
          title: p.etiqueta,
          keyboard: true,
        });
        marca.on('click', () => alTocarPunto.current?.(p.id));
        c.addLayer(marca);
      });
      if (yo) {
        c.addLayer(L.circle([yo.lat, yo.lng], { radius: Math.min(yo.precision, 300), weight: 0, fillOpacity: 0.12, color: '#4a4af4' }));
        c.addLayer(L.circleMarker([yo.lat, yo.lng], { radius: 7, weight: 3, color: '#ffffff', fillColor: '#4a4af4', fillOpacity: 1 }));
      }

      // Encuadra solo cuando cambia QUÉ hay que ver, no con cada lectura del
      // GPS: si no, el mapa salta mientras el dueño lo está moviendo.
      // El centro solo cuenta cuando no hay nada más que enseñar; si no, el
      // temblor del GPS movería un mapa que ya tiene sus pines.
      const soloCentro = puntos.length === 0 && !yo && centro ? `centro:${centro.lat.toFixed(3)},${centro.lng.toFixed(3)}` : '';
      const clave = puntos.map((p) => p.id).join('|') + (yo ? '|yo' : '') + soloCentro;
      if (clave === encuadrado.current) return;
      encuadrado.current = clave;
      const todos: [number, number][] = puntos.map((p) => [p.lat, p.lng]);
      if (yo) todos.push([yo.lat, yo.lng]);
      // Más margen arriba: la gota sube ~40 px desde su punta, y con un
      // margen parejo el pin de más al norte salía cortado por el borde.
      if (todos.length > 1) {
        m.fitBounds(L.latLngBounds(todos), { paddingTopLeft: [32, 56], paddingBottomRight: [32, 20], maxZoom: 16 });
      }
      else if (todos.length === 1) m.setView(todos[0], 16);
      else if (centro) m.setView([centro.lat, centro.lng], 13);
    };
    pintar();
    const el = contenedor.current;
    el?.addEventListener('foody:pintar', pintar);
    return () => el?.removeEventListener('foody:pintar', pintar);
  }, [puntos, yo, centro]);

  return (
    // `relative z-0` crea un contexto de apilamiento propio: los paneles de
    // Leaflet usan z-index 400–1000 y, sin esto, se pintarían por encima de
    // la barra de pestañas y del botón flotante.
    <div
      ref={contenedor}
      role="application"
      aria-label={etiqueta}
      className={`relative z-0 w-full overflow-hidden rounded-3xl bg-[var(--surface-2)] ${className}`}
    />
  );
}
