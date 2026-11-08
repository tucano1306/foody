import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import type { SeleccionTienda } from '@/lib/geo';
import type { Sucursal, TiendaResumen } from '@/lib/tiendas';
import { ToastProvider } from '@/components/ui/Toast';
import TiendaDelViaje, { ordenarParaElegir, sucursalAlElegir } from './TiendaDelViaje';

/**
 * La tienda de la compra en el Súper: elegirla al empezar y que se ponga sola
 * al llegar. Lo que tiene que cumplirse:
 *
 * - Al llegar sin tienda puesta, se pone la de al lado y se avisa.
 * - Lo elegido a mano manda: estando en otra, se PROPONE el cambio.
 * - Con dos tiendas pegadas, se pregunta en cuál; «✕» no vuelve a preguntar.
 * - Elegir a mano estando al lado de otra no hace saltar el aviso.
 * - «voy a Aldi» dictado elige Aldi.
 */

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
// El mapa no se prueba aquí (Leaflet necesita un navegador de verdad).
vi.mock('@/components/stores/MapaTiendas', () => ({ default: () => null }));

// Un grado de latitud son ~111 km: 0,0001° ≈ 11 m.
const PUBLIX: Sucursal = { id: 'p1', nombre: 'Publix', direccion: '12800 Pines Blvd, Pembroke Pines', lat: 26.0, lng: -80.3 };
const CVS: Sucursal = { id: 'c1', nombre: 'CVS', direccion: '200 Main St', lat: 26.0004, lng: -80.3 }; // ~45 m del Publix
const ALDI: Sucursal = { id: 'a1', nombre: 'Aldi', direccion: null, lat: 26.05, lng: -80.3 }; // ~5,5 km

function tienda(nombre: string, usos: number, sucursales: Sucursal[]): TiendaResumen {
  return { nombre, usos, ultima: null, kind: 'grocery', sucursales };
}

// ─── GPS falso ───────────────────────────────────────────────────────────────
type Exito = (p: GeolocationPosition) => void;
let alMoverse: Exito | null = null;

function posicion(lat: number, lng: number, accuracy = 15): GeolocationPosition {
  return { coords: { latitude: lat, longitude: lng, accuracy }, timestamp: Date.now() } as unknown as GeolocationPosition;
}

function moverA(lat: number, lng: number) {
  act(() => alMoverse?.(posicion(lat, lng)));
}

beforeEach(() => {
  alMoverse = null;
  Object.defineProperty(globalThis.navigator, 'geolocation', {
    configurable: true,
    value: {
      watchPosition: vi.fn((ok: Exito) => {
        alMoverse = ok;
        return 1;
      }),
      clearWatch: vi.fn(),
      getCurrentPosition: vi.fn(),
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** El Súper de verdad guarda la selección; aquí, un estado que hace lo mismo. */
function Banco({
  tiendas,
  sucursales,
  inicial = null,
  onCambio = () => undefined,
}: {
  readonly tiendas: TiendaResumen[];
  readonly sucursales: Sucursal[];
  readonly inicial?: SeleccionTienda | null;
  readonly onCambio?: (s: SeleccionTienda | null) => void;
}) {
  const [sel, setSel] = useState<SeleccionTienda | null>(inicial);
  return (
    <ToastProvider>
      <TiendaDelViaje
        tiendas={tiendas}
        sucursales={sucursales}
        seleccion={sel}
        onCambiar={(s) => {
          onCambio(s);
          setSel(s);
        }}
      />
    </ToastProvider>
  );
}

const TODAS = [tienda('Publix', 16, [PUBLIX]), tienda('CVS', 8, [CVS]), tienda('Aldi', 3, [ALDI])];

describe('al llegar', () => {
  it('sin tienda puesta, pone la de al lado y avisa', async () => {
    const onCambio = vi.fn();
    render(<Banco tiendas={[tienda('Publix', 16, [PUBLIX])]} sucursales={[PUBLIX]} onCambio={onCambio} />);
    expect(screen.getByRole('button', { name: 'Elegir tienda' })).toBeInTheDocument();

    moverA(26.0002, -80.3); // ~22 m

    expect(onCambio).toHaveBeenCalledWith({ nombre: 'Publix', storeId: 'p1', origen: 'llegada' });
    expect(await screen.findByText('Estás en Publix · Pines Blvd')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tienda: Publix · Pines Blvd/ })).toBeInTheDocument();
  });

  it('lejos de todo, no toca nada', () => {
    const onCambio = vi.fn();
    render(<Banco tiendas={TODAS} sucursales={[PUBLIX, CVS, ALDI]} onCambio={onCambio} />);
    moverA(26.02, -80.3); // ~2 km
    expect(onCambio).not.toHaveBeenCalled();
  });

  it('con un GPS que aún no sabe dónde estás, no decide', () => {
    const onCambio = vi.fn();
    render(<Banco tiendas={TODAS} sucursales={[PUBLIX]} onCambio={onCambio} />);
    act(() => alMoverse?.(posicion(26.0, -80.3, 900)));
    expect(onCambio).not.toHaveBeenCalled();
  });

  it('elegiste Publix y estás en Aldi: lo propone, no lo cambia', async () => {
    const onCambio = vi.fn();
    render(
      <Banco
        tiendas={TODAS}
        sucursales={[PUBLIX, CVS, ALDI]}
        inicial={{ nombre: 'Publix', storeId: 'p1', origen: 'elegida' }}
        onCambio={onCambio}
      />,
    );
    moverA(26.0501, -80.3);

    expect(await screen.findByText('¿Estás en Aldi?')).toBeInTheDocument();
    expect(onCambio).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Sí, cambiar' }));
    expect(onCambio).toHaveBeenCalledWith({ nombre: 'Aldi', storeId: 'a1', origen: 'elegida' });
  });

  it('«✕» en la propuesta no la vuelve a sacar con la siguiente lectura', async () => {
    render(
      <Banco tiendas={TODAS} sucursales={[PUBLIX, ALDI]} inicial={{ nombre: 'Publix', storeId: 'p1', origen: 'elegida' }} />,
    );
    moverA(26.0501, -80.3);
    fireEvent.click(await screen.findByRole('button', { name: 'No' }));
    await waitFor(() => expect(screen.queryByText('¿Estás en Aldi?')).not.toBeInTheDocument());

    moverA(26.05005, -80.3);
    expect(screen.queryByText('¿Estás en Aldi?')).not.toBeInTheDocument();
  });

  it('dijiste «Publix» sin sucursal y llegas a uno: se apunta cuál, sin avisar', () => {
    const onCambio = vi.fn();
    render(
      <Banco
        tiendas={TODAS}
        sucursales={[PUBLIX, ALDI]}
        inicial={{ nombre: 'Publix', storeId: null, origen: 'elegida' }}
        onCambio={onCambio}
      />,
    );
    moverA(26.0001, -80.3);
    expect(onCambio).toHaveBeenCalledWith({ nombre: 'Publix', storeId: 'p1', origen: 'elegida' });
    expect(screen.queryByText(/^Estás en/)).not.toBeInTheDocument();
  });

  it('dos tiendas pegadas: pregunta en cuál, con un botón por tienda', async () => {
    const onCambio = vi.fn();
    render(<Banco tiendas={TODAS} sucursales={[PUBLIX, CVS]} onCambio={onCambio} />);
    moverA(26.0002, -80.3); // entre las dos: ~22 m de cada una

    expect(await screen.findByText('¿En cuál estás?')).toBeInTheDocument();
    expect(onCambio).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'CVS · Main St' }));
    expect(onCambio).toHaveBeenCalledWith({ nombre: 'CVS', storeId: 'c1', origen: 'elegida' });
  });
});

describe('«¿A dónde vas?»', () => {
  it('lo dictado con «voy a…» filtra y elige', async () => {
    const onCambio = vi.fn();
    render(<Banco tiendas={TODAS} sucursales={[PUBLIX, CVS, ALDI]} onCambio={onCambio} />);
    fireEvent.click(screen.getByRole('button', { name: 'Elegir tienda' }));

    const hoja = await screen.findByRole('dialog', { name: '¿A dónde vas?' });
    fireEvent.change(within(hoja).getByRole('searchbox', { name: 'Tienda' }), { target: { value: 'Voy a Aldi.' } });
    const lista = within(hoja).getByRole('list', { name: 'Tus tiendas' });
    expect(within(lista).getAllByRole('button')).toHaveLength(1);

    fireEvent.click(within(lista).getByRole('button', { name: /Aldi/ }));
    // Una sola sucursal y sin posición: se pone esa.
    expect(onCambio).toHaveBeenCalledWith({ nombre: 'Aldi', storeId: 'a1', origen: 'elegida' });
  });

  it('una tienda nueva se usa tal cual se escribió', async () => {
    const onCambio = vi.fn();
    render(<Banco tiendas={TODAS} sucursales={[]} onCambio={onCambio} />);
    fireEvent.click(screen.getByRole('button', { name: 'Elegir tienda' }));
    const hoja = await screen.findByRole('dialog', { name: '¿A dónde vas?' });
    fireEvent.change(within(hoja).getByRole('searchbox'), { target: { value: 'voy al Trader Joe' } });

    fireEvent.click(within(hoja).getByRole('button', { name: 'Usar «Trader Joe»' }));
    expect(onCambio).toHaveBeenCalledWith({ nombre: 'Trader Joe', storeId: null, origen: 'elegida' });
  });

  it('elegir Aldi estando en el Publix no hace saltar «¿Estás en Publix?»', async () => {
    render(<Banco tiendas={TODAS} sucursales={[PUBLIX, ALDI]} />);
    moverA(26.0001, -80.3); // en el Publix: se pone solo
    await screen.findByText('Estás en Publix · Pines Blvd');

    fireEvent.click(screen.getByRole('button', { name: /Tienda: Publix/ }));
    const hoja = await screen.findByRole('dialog', { name: '¿A dónde vas?' });
    fireEvent.click(within(within(hoja).getByRole('list', { name: 'Tus tiendas' })).getByRole('button', { name: /Aldi/ }));

    moverA(26.00012, -80.3);
    expect(screen.queryByText(/¿Estás en Publix/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tienda: Aldi/ })).toBeInTheDocument();
  });

  it('quitar la tienda estando dentro no la vuelve a poner sola', async () => {
    const onCambio = vi.fn();
    render(<Banco tiendas={TODAS} sucursales={[PUBLIX]} onCambio={onCambio} />);
    moverA(26.0001, -80.3);
    await screen.findByText('Estás en Publix · Pines Blvd');

    fireEvent.click(screen.getByRole('button', { name: /Tienda: Publix/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Quitar tienda' }));
    expect(onCambio).toHaveBeenLastCalledWith(null);

    moverA(26.00011, -80.3);
    expect(onCambio).toHaveBeenLastCalledWith(null);
  });
});

describe('«Cómo llegar»', () => {
  it('con una sucursal puesta y lejos, abre la ruta en Google Maps', () => {
    render(<Banco tiendas={TODAS} sucursales={[ALDI]} inicial={{ nombre: 'Aldi', storeId: 'a1', origen: 'elegida' }} />);
    const enlace = screen.getByRole('link', { name: /Cómo llegar/ });
    expect(enlace).toHaveAttribute('href', 'https://www.google.com/maps/dir/?api=1&destination=26.050000,-80.300000');
    expect(enlace).toHaveAttribute('target', '_blank');
  });

  it('ya en la puerta, no hace falta', () => {
    render(<Banco tiendas={TODAS} sucursales={[ALDI]} inicial={{ nombre: 'Aldi', storeId: 'a1', origen: 'elegida' }} />);
    moverA(26.0501, -80.3);
    expect(screen.queryByRole('link', { name: /Cómo llegar/ })).not.toBeInTheDocument();
  });

  it('sin ubicación guardada, no hay ruta que abrir', () => {
    render(<Banco tiendas={TODAS} sucursales={[]} inicial={{ nombre: 'Publix', storeId: null, origen: 'elegida' }} />);
    expect(screen.queryByRole('link', { name: /Cómo llegar/ })).not.toBeInTheDocument();
  });
});

describe('orden del selector', () => {
  const tiendas = [tienda('Publix', 16, [PUBLIX]), tienda('Walmart', 10, []), tienda('Aldi', 3, [ALDI])];

  it('sin posición, por uso; con ella, lo cercano primero', () => {
    expect(ordenarParaElegir(tiendas, [PUBLIX, ALDI], null, '').map((f) => f.tienda.nombre)).toEqual([
      'Publix',
      'Walmart',
      'Aldi',
    ]);
    const enAldi = { lat: 26.05, lng: -80.3, precision: 10 };
    expect(ordenarParaElegir(tiendas, [PUBLIX, ALDI], enAldi, '').map((f) => f.tienda.nombre)).toEqual([
      'Aldi',
      'Publix',
      'Walmart',
    ]);
  });

  it('una sucursal recién guardada cuenta aunque la tienda aún no la tenga', () => {
    const [fila] = ordenarParaElegir([tienda('Walmart', 10, [])], [{ id: 'w1', nombre: 'walmart', direccion: null, lat: 26, lng: -80 }], null, 'wal');
    expect(fila.ubicadas.map((s) => s.id)).toEqual(['w1']);
  });

  it('al elegir una tienda con varias sucursales: la más cercana, o ninguna sin posición', () => {
    const otro = { ...PUBLIX, id: 'p2', lat: 26.1, lng: -80.3 };
    expect(sucursalAlElegir([PUBLIX, otro] as never, { lat: 26.099, lng: -80.3, precision: 10 })?.id).toBe('p2');
    expect(sucursalAlElegir([PUBLIX, otro] as never, null)).toBeNull();
    expect(sucursalAlElegir([PUBLIX] as never, null)?.id).toBe('p1');
  });
});
