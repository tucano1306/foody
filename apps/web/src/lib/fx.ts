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
