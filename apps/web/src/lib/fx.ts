/**
 * Lightweight DOM particle effects (Web Animations API — no dependencies).
 * Purely decorative: skipped entirely when the user prefers reduced motion.
 */

const CELEBRATION_COLORS = ['#a7ce39', '#22c55e', '#f59e0b', '#38bdf8', '#f472b6', '#facc15'];

function reducedMotion(): boolean {
  return (
    globalThis.window === undefined ||
    globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function makeLayer(): HTMLDivElement {
  const layer = document.createElement('div');
  layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden;';
  document.body.append(layer);
  return layer;
}

/** Small emoji burst radiating from a screen point (e.g. the tapped card). */
export function burstAt(x: number, y: number, emojis: readonly string[] = ['✨', '🎉', '⭐']): void {
  if (reducedMotion()) return;
  const layer = makeLayer();
  const count = 10;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('span');
    p.textContent = emojis[i % emojis.length];
    p.style.cssText = `position:absolute;left:${x}px;top:${y}px;font-size:${14 + Math.random() * 10}px;will-change:transform,opacity;`;
    layer.append(p);
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.6;
    const dist = 50 + Math.random() * 60;
    p.animate(
      [
        { transform: 'translate(-50%,-50%) scale(0.4) rotate(0deg)', opacity: 1 },
        {
          transform: `translate(calc(-50% + ${Math.cos(angle) * dist}px), calc(-50% + ${Math.sin(angle) * dist - 20}px)) scale(1.1) rotate(${(Math.random() - 0.5) * 240}deg)`,
          opacity: 0,
        },
      ],
      { duration: 650 + Math.random() * 300, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)', fill: 'forwards' },
    );
  }
  setTimeout(() => layer.remove(), 1100);
}

export function burstFromElement(el: Element | null | undefined, emojis?: readonly string[]): void {
  if (!el) return;
  const r = el.getBoundingClientRect();
  burstAt(r.left + r.width / 2, r.top + r.height / 2, emojis);
}

/** Full-screen confetti + emoji rain for the big wins (purchase done, payment confirmed). */
export function confettiRain(emojis: readonly string[] = ['🎉', '✨']): void {
  if (reducedMotion()) return;
  const layer = makeLayer();
  const w = window.innerWidth;
  const fall = window.innerHeight + 60;
  const total = 70;
  for (let i = 0; i < total; i++) {
    const p = document.createElement('span');
    const x = Math.random() * w;
    if (i % 9 === 0) {
      p.textContent = emojis[i % emojis.length];
      p.style.cssText = `position:absolute;left:${x}px;top:-30px;font-size:${16 + Math.random() * 12}px;will-change:transform,opacity;`;
    } else {
      const c = CELEBRATION_COLORS[i % CELEBRATION_COLORS.length];
      const size = 6 + Math.random() * 6;
      p.style.cssText = `position:absolute;left:${x}px;top:-20px;width:${size}px;height:${size * (Math.random() > 0.5 ? 1 : 0.4)}px;background:${c};border-radius:${Math.random() > 0.6 ? '50%' : '2px'};will-change:transform,opacity;`;
    }
    layer.append(p);
    const sway = (Math.random() - 0.5) * 160;
    p.animate(
      [
        { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
        { transform: `translate(${sway}px, ${fall}px) rotate(${(Math.random() - 0.5) * 720}deg)`, opacity: 0.9 },
      ],
      {
        duration: 1400 + Math.random() * 1200,
        delay: Math.random() * 350,
        easing: 'cubic-bezier(0.3, 0, 0.8, 1)',
        fill: 'forwards',
      },
    );
  }
  setTimeout(() => layer.remove(), 3300);
}

/**
 * «Se me acabó»: el humo sube y el carrito se lo lleva.
 *
 * Antes esto era un `burstFromElement` con una nubecita, y el estallido radial
 * no contaba nada: las partículas salían igual hacia arriba que hacia abajo.
 * Aquí el humo SUBE —como algo que se evapora— y detrás asoma un carrito que
 * también sube, que es la mitad de la historia que faltaba: lo que se acaba no
 * desaparece, se va a la lista de la compra.
 */
export function ranOutFrom(el: Element | null | undefined): void {
  if (!el || reducedMotion()) return;
  const r = el.getBoundingClientRect();
  const layer = makeLayer();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;

  // El humo: varias bocanadas que suben abriéndose, cada una a su ritmo.
  for (let i = 0; i < 7; i++) {
    const p = document.createElement('span');
    p.textContent = '💨';
    const from = cx + (Math.random() - 0.5) * r.width * 0.6;
    p.style.cssText = `position:absolute;left:${from}px;top:${cy}px;font-size:${16 + Math.random() * 12}px;will-change:transform,opacity;`;
    layer.append(p);
    p.animate(
      [
        { transform: 'translate(-50%,-50%) scale(0.5)', opacity: 0 },
        { transform: `translate(calc(-50% + ${(Math.random() - 0.5) * 70}px), -${70 + Math.random() * 50}px) scale(1.25)`, opacity: 0.95, offset: 0.35 },
        { transform: `translate(calc(-50% + ${(Math.random() - 0.5) * 110}px), -${130 + Math.random() * 70}px) scale(1.5)`, opacity: 0 },
      ],
      {
        duration: 900 + Math.random() * 400,
        delay: i * 45,
        easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
        fill: 'forwards',
      },
    );
  }

  // Y el carrito, que dice a dónde se fue.
  const cart = document.createElement('span');
  cart.textContent = '🛒';
  cart.style.cssText = `position:absolute;left:${cx}px;top:${cy}px;font-size:30px;will-change:transform,opacity;`;
  layer.append(cart);
  cart.animate(
    [
      { transform: 'translate(-50%,-50%) scale(0.4) rotate(-12deg)', opacity: 0 },
      { transform: 'translate(-50%,-115%) scale(1.15) rotate(4deg)', opacity: 1, offset: 0.45 },
      { transform: 'translate(-50%,-210%) scale(0.9) rotate(-4deg)', opacity: 0 },
    ],
    { duration: 1150, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)', fill: 'forwards' },
  );

  setTimeout(() => layer.remove(), 1700);
}

/**
 * «Me equivoqué, sí lo tengo»: lo que se había ido a la lista vuelve al estante.
 *
 * Es el espejo exacto de `ranOutFrom`, y a propósito: allí el humo sube y el
 * carrito se lleva el producto; aquí el carrito BAJA y se deshace, y las
 * chispas van hacia DENTRO en vez de estallar hacia fuera. Ese detalle —que
 * converjan— es lo que se lee como «vuelve a su sitio» en lugar de «pasó algo
 * nuevo»: deshacer no es celebrar, es recoger.
 */
export function cameBackTo(el: Element | null | undefined): void {
  if (!el || reducedMotion()) return;
  const r = el.getBoundingClientRect();
  const layer = makeLayer();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;

  // El carrito baja y se deshace: el producto sale de la lista de la compra.
  const cart = document.createElement('span');
  cart.textContent = '🛒';
  cart.style.cssText = `position:absolute;left:${cx}px;top:${cy}px;font-size:28px;will-change:transform,opacity;`;
  layer.append(cart);
  cart.animate(
    [
      { transform: 'translate(-50%,-210%) scale(0.9) rotate(6deg)', opacity: 0 },
      { transform: 'translate(-50%,-120%) scale(1.1) rotate(-4deg)', opacity: 1, offset: 0.4 },
      { transform: 'translate(-50%,-50%) scale(0.5) rotate(0deg)', opacity: 0 },
    ],
    { duration: 780, easing: 'cubic-bezier(0.34, 1.2, 0.64, 1)', fill: 'forwards' },
  );

  // Y las chispas CONVERGEN al centro: lo disperso se recoge.
  const count = 10;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('span');
    p.textContent = i % 3 === 0 ? '✅' : '✨';
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const from = 70 + Math.random() * 45;
    p.style.cssText = `position:absolute;left:${cx}px;top:${cy}px;font-size:${13 + Math.random() * 9}px;will-change:transform,opacity;`;
    layer.append(p);
    p.animate(
      [
        {
          transform: `translate(calc(-50% + ${Math.cos(angle) * from}px), calc(-50% + ${Math.sin(angle) * from}px)) scale(0.5)`,
          opacity: 0,
        },
        {
          transform: `translate(calc(-50% + ${Math.cos(angle) * from * 0.5}px), calc(-50% + ${Math.sin(angle) * from * 0.5}px)) scale(1)`,
          opacity: 1,
          offset: 0.55,
        },
        { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0 },
      ],
      {
        duration: 620 + Math.random() * 220,
        delay: 180 + Math.random() * 160,
        easing: 'cubic-bezier(0.4, 0, 0.3, 1)',
        fill: 'forwards',
      },
    );
  }

  setTimeout(() => layer.remove(), 1300);
}
