# foody DESIGN.md

> **⚠️ Nov 2026 — Foody Índigo.** Este inventario es ANTERIOR a los dos
> rediseños (Aurora, oct 2026, e Índigo, nov 2026). La fuente de verdad de
> colores, tipografía y superficies es `src/app/globals.css` (bloque «FOODY
> ÍNDIGO»). Las secciones 1–3 de abajo ya están al día; las demás conservan
> nombres y estructura del inventario.
>
> - **Origen**: el dueño pidió el lenguaje visual de affirm.com. Se copió el
>   estilo (paleta, píldoras, tarjetas, titulares ligeros), no los recursos:
>   ni logo, ni nombre, ni fuentes propietarias, ni imágenes ni textos.
> - **Acento**: índigo `#4a4af4` en claro · lavanda `#a8a9fc` en oscuro.
>   Botón principal: índigo con letra blanca en claro; **blanco con letra
>   `#0c0c14` en oscuro** (`--cta` / `--on-cta`).
> - **Firma**: `var(--aurora)` es un barrido de índigo (`#3b39d6 → #4a4af4 →
>   #5266ea`) que siempre lleva letra blanca encima; `.text-aurora` usa
>   `var(--aurora-ink)`, que en oscuro pasa a lavanda. `var(--aurora-soft)`
>   enciende las tarjetas protagonistas por abajo.
> - **Gamas redefinidas** con el mismo puesto de siempre: `brand` = índigo,
>   `sky` = pervinca, `blue` = violeta (aviso/atención, sin cambios),
>   `slate` = neutros casi puros, `navy` = noche índigo.
> - **Tipografía**: Geist (texto, `--font-sans`) y Outfit (titulares,
>   `--font-display`). `.t-display` en peso 300.
> - **Superficies**: `.card` casi plana (borde de 1 px, sin sombra en oscuro),
>   radio 24 px; botones `.btn-*` y rellenos `bg-brand-600/500` en píldora;
>   navegación lateral y dock en píldora. Fondo sin retícula.
> - **Oscuro**: tintes claros, textos de tinta oscura, degradados pastel y
>   animaciones con color tienen su equivalente en `html.dark` (ver
>   globals.css).

> **Leelo como inventario, no como criterio.** Generado automaticamente por
> `skillui --dir apps/web` (analisis estatico, sin IA). Los tokens y los hex son
> fiables porque salen del CSS. La *interpretacion de roles* es inferida y tiene
> fallos: la version original decia que el acento era `#ffffff` — se corrigio a
> mano a `#1a6ae8` / `#5492fb`. Ocho colores siguen marcados como `unknown`.
>
> Es una foto del diseno en el momento de generarlo. Regenerar con:
> `skillui --dir apps/web --out <destino> --name foody --no-skill`

> Auto-generated design system — reverse-engineered via static analysis by skillui.
> Frameworks: Tailwind CSS 4.0.0 + React 19.0.0 + Next.js 16.2.4
> Colors: 20 · Fonts: 1 · Components: 137
> Icon library: Heroicons · State: not detected
> Primary theme: light · Dark mode toggle: yes · Motion: expressive

---

## 1. Visual Theme & Atmosphere

Foody Índigo: casi monocromo y sereno. En oscuro, una noche índigo (`#13131f`) con tarjetas un punto más claras recortadas por un filo pervinca, sin sombras; en claro, blanco roto (`#f7f7f8`) con tarjetas blancas casi planas. Un solo acento —índigo en claro, lavanda en oscuro— reservado para lo que se toca. Botones en píldora. Titulares grandes y ligeros (Outfit 300) sobre texto Geist. Retícula de 8px — 8, 16, 24, 32, 40, 48, 56, 64. El movimiento sigue siendo expresivo (muelles, layout animations, entradas escalonadas).

---

## 2. Color Palette & Roles

| Token | Claro | Oscuro | Rol |
|---|---|---|---|
| `--accent` | `#4a4af4` | `#a8a9fc` | Enlaces, foco, estado activo, tintes de acción |
| `--on-accent` | `#ffffff` | `#0c0c14` | Texto e iconos ENCIMA del acento |
| `--cta` | `#4a4af4` | `#ffffff` | Relleno de `.btn-primary` / `.btn-energy` |
| `--cta-hover` | `#3b39d6` | `#e2e2ff` | Ídem al pasar el ratón |
| `--on-cta` | `#ffffff` | `#0c0c14` | Letra del botón principal |
| `--aurora` | `#3b39d6 → #4a4af4 → #5266ea` | `#3b39d6 → #4a4af4 → #5c66ee` | Fondo con letra blanca: pestaña activa, avatar |
| `--aurora-ink` | `#2a27a8 → #4a4af4 → #5266ea` | `#e2e2ff → #a8a9fc → #9cadfc` | Texto `.text-aurora` |

Gamas (`@theme`):

| Gama | 50 | 100 | 300 | 500 | 600 | 900 | Puesto |
|---|---|---|---|---|---|---|---|
| `brand` | `#f0f0ff` | `#e2e2ff` | `#a8a9fc` | `#6162f6` | `#4a4af4` | `#14127a` | Índigo, acción principal |
| `sky` | `#f4f6ff` | `#e9edff` | `#b6c4fd` | `#5266ea` | `#4255d0` | `#212b66` | Pervinca: tintes, bordes, enlaces |
| `blue` | `#f6f2ff` | `#ede5ff` | `#c2a8ff` | `#8a57f7` | `#7640e6` | `#3e2180` | Violeta: aviso, atención |
| `slate` | `#f7f7f8` | `#efeff3` | `#c8c8d3` | `#696a7a` | `#4f505e` | `#121320` | Neutros, texto |
| `navy` | `#eeeef7` | `#dcdcee` | `#8d8db8` | `#3d3d61` | `#2a2a45` | `#0c0c14` | Noche índigo (800 = `#13131f`) |

Contrastes medidos: blanco sobre brand-600 = 5.9:1, sobre sky-500 = 4.7:1; slate-500 sobre blanco = 5.3:1; lavanda sobre `#0c0c14` = 9:1.

### Dark Mode Token Mapping

| Variable | Light | Dark |
|---|---|---|
| `--page` | `#f7f7f8` | `#13131f` |
| `--surface` | `#ffffff` | `#1a1a2c` |
| `--surface-2` | `#f2f2f6` | `#212137` |
| `--surface-3` | `#e8e8f0` | `#2a2a44` |
| `--line` | `#e6e6ee` | `#272941` |
| `--line-strong` | `#d1d1de` | `#353857` |
| `--ink` | `#101820` | `#f7f7f8` |
| `--ink-muted` | `#595e6c` | `#a1a1b0` |
| `--ink-subtle` | `#868b99` | `#77788f` |
| `--accent` | `#4a4af4` | `#a8a9fc` |
| `--accent-soft` | `#f0f0ff` | `#2a2a47` |
| `--on-accent` | `#ffffff` | `#0c0c14` |
| `--aurora-soft` | `#ffffff → #f3f4ff → #e6eaff` (vertical) | `#1a1a2c → #1e1f35 → #2c3150` (vertical) |
| `--glow` | `0 8px 22px -10px rgb(74 74 244 / 0.45)` | filo pervinca 14 % + halo pervinca |
| `--shadow-xs` | `0 1px 2px rgb(16 24 32 / 0.04)` | `0 1px 2px rgb(0 0 0 / 0.4)` |
| `--shadow-sm` | `0 1px 2px rgb(16 24 32 / 0.04), 0 4px 12px -6px rgb(16 24 32 / 0.08)` | `0 1px 2px rgb(0 0 0 / 0.35), 0 4px 14px -4px rgb(0 0 0 / 0.5)` |
| `--shadow-md` | `0 2px 6px rgb(16 24 32 / 0.05), 0 16px 32px -16px rgb(16 24 32 / 0.18)` | `0 2px 6px rgb(0 0 0 / 0.4), 0 14px 32px -12px rgb(0 0 0 / 0.65)` |
| `--shadow-lg` | `0 20px 48px -20px rgb(16 24 32 / 0.28)` | `0 18px 50px -16px rgb(0 0 0 / 0.75)` |

En oscuro `.card` y `.stat-card` van sin sombra: el filo (`--line`) las recorta.

### CSS Variable Tokens

```css
--radius-card: 1.5rem;   /* 24 px */
--radius-sheet: 2rem;
--accent: #4a4af4;       /* oscuro: #a8a9fc */
--cta: #4a4af4;          /* oscuro: #ffffff */
--on-cta: #ffffff;       /* oscuro: #0c0c14 */
```


---

## 3. Typography Rules

**Font Stack:**
- **Geist** (`--font-sans`) — texto, cifras (`tabular-nums` en todo el body)
- **Outfit** (`--font-display`) — `h1–h3`, `.t-display`, la marca
- Serifa del sistema (`--font-reading`) — solo los consejos del Plan Financiero

| Role | Font | Size | Weight |
|---|---|---|---|
| Título de pantalla (`.t-display`) | Outfit | `clamp(1.75rem, 1.25rem + 2vw, 2.75rem)` | 300, tracking -0.035em |
| Heading 2–3 | Outfit | según el componente | el del componente, tracking -0.02em |
| Body | Geist | 14–16px | 400 |
| Etiqueta (`.t-label`) | Geist | 12px | 600 |
| Metadato (`.t-meta`) | Geist | 12px | 500 |

**Typographic Rules:**
- Titulares grandes en peso LIGERO: se imponen por tamaño, no por grosor
- Cifras con `.t-num` (700, tracking -0.02em); importes que deben caber, `.stat-amount`
- No más de 3–4 tamaños por pantalla; la jerarquía secundaria va por color (`--ink-muted`, `--ink-subtle`)
- Nada de MAYÚSCULAS con tracking abierto en etiquetas

---

## 4. Component Stylings

### Layout (52)

**DebtCard** — `src/components/debts/DebtCard.tsx`
- Props: `debt`, `onOpen`, `onPay`
- Key Styles: `rounded-3xl`, `border-sky-200`, `bg-slate-100`, `gap-4`, `text-base`, `font-bold`, `opacity-70`, `hover:bg-sky-600`
- Animation: tw-transitions: transition-all, duration-200, duration-150

```tsx
<div className="relative rounded-3xl">
      {/* Tocar la tarjeta abre el detalle; para abonar está el botón de abajo,
          siempre visible. Aquí había el mismo gesto de deslizar que en Pagos, y
          se quitó por lo mismo: con ratón solo hacía bailar la tarjeta, y
          escondía tras un gesto una acción que ya tiene su propio botón. */}
      <button
        type="button"
        onClick={onOpen}
        className={`relative flex w-full flex-col gap-4 rounded-3xl border border-sky-100 bg-white p-5 text-left shadow-sm transition-all duration-200 hover:shadow-md active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400${
          // Se le pasó el día de pago y no hay abono este mes. Un color fijo se
          // vuelve invisible a los dos días; esto respira muy despacio.
          debt.isOverdue ? ' pulse-overdue' : ''
```

**DebtEditModal** — `src/components/debts/DebtEditModal.tsx`
- Variants: `by_date`
- Props: `debt`, `onClose`, `onSaved`
- Key Styles: `rounded-2xl`, `border-sky-200`, `bg-blue-50`, `gap-2`, `text-sm`, `font-bold`, `pointer-events-none`
- State: useState

```tsx
<ModalShell
      title="Editar deuda"
      subtitle={debt.name}
      emoji={KIND_META[kind].emoji}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className={`flex-1 rounded-2xl py-3.5 text-sm ${BTN_SOFT}`}>
            Cancelar
          </button>
          <button
            type="button"
```

**DebtPaymentModal** — `src/components/debts/DebtPaymentModal.tsx`
- Props: `debt`, `onClose`, `onPaid`
- Key Styles: `rounded-2xl`, `border-2`, `bg-blue-50`, `gap-2`, `text-sm`, `font-bold`, `pointer-events-none`
- Animation: tw-transitions: transition-all, duration-150
- State: useState

```tsx
<ModalShell
      title="Abonar"
      subtitle={`${debt.name} · debes ${fmtMoney(debt.currentBalance, debt.currency
```

**DuplicateBanner** — `src/components/debts/DuplicateBanner.tsx`
- Variants: `link`, `dismiss`
- Props: `suspect`, `onResolved`, `debt`
- Key Styles: `rounded-3xl`, `border-2`, `bg-blue-50`, `p-4`, `text-sm`, `font-black`, `shadow-sm`, `active:scale-95`
- State: useState

```tsx
<div className="rounded-3xl border-2 border-blue-200 bg-blue-50 p-4">
      <p className="text-sm font-black text-black">
        👀 ¿«{suspect.paymentName}» y «{suspect.debtName}» son el mismo pago?
      </p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-slate-700">
        En Pagos tienes <strong>{suspect.paymentName}</strong> por{' '}
        <strong>{fmtMoney(suspect.amount
```

**SplitBar** — `src/components/debts/SplitBar.tsx`
- Props: `interest`, `principal`, `currency`, `Compacta`, `compact`
- Key Styles: `rounded-full`, `bg-sky-100`, `mt-2.5`, `text-sm`, `font-semibold`
- Animation: tw-transitions: duration-500, ease-out

```tsx
<div className="w-full">
      <div
        className="flex h-4 w-full overflow-hidden rounded-full bg-sky-100"
        role="img"
        aria-label={`De ${fmtMoney(total, currency
```

**AdviceFeed** — `src/components/finance/AdviceFeed.tsx`
- Props: `advice`, `onAction`, `action`
- Key Styles: `rounded-2xl`, `mt-2.5`, `text-2xl`, `font-bold`
- Animation: framer-motion, transition: {delay: index * 0.05, type: 'spring', stiffness: 280, damping: 26}, animate: {opacity: 1, x: 0}

```tsx
<Wrapper
      {...(action
        ? {
            type: 'button' as const,
            onClick: (
```

**BusinessPanel** — `src/components/finance/BusinessPanel.tsx`
- Props: `scopes`, `items`
- Key Styles: `rounded-3xl`, `border-sky-200`, `bg-linear-to-br`, `gap-3`, `text-xs`, `font-bold`, `active:scale-[0.98]`
- State: useState

```tsx
<div className="flex items-center justify-between gap-3 py-2">
      <span className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
        <span aria-hidden="true">{emoji}</span>
        {label}
      </span>
      <span className={`text-sm font-black tabular-nums ${NUM}`}>{value}</span>
    </div>
```

*...and 44 more layout components.*

### Navigation (25)

**BudgetView** — `src/components/budget/BudgetView.tsx`
- Props: `initialData`, `initialScope`
- Key Styles: `rounded-t-3xl`, `border-dashed`, `bg-black/50`, `py-4`, `text-xs`, `font-bold`, `backdrop-blur-sm`, `cursor-default`
- Animation: framer-motion, transition: {duration: 1.1, ease: [0.22, 0.61, 0.36, 1]}, animate-presence
- State: useState, useRef

```tsx
<svg viewBox="0 0 200 200" className="w-full h-full -rotate-90" aria-hidden="true">
      {/* Track */}
      <circle cx="100" cy="100" r={RADIUS} fill="none" stroke="#e2e8f0" strokeWidth="16" />
      {/* Progress */}
      <motion.circle
        cx="100"
        cy="100"
        r={RADIUS}
        fill="none"
        stroke={color}
        strokeWidth="16"
        strokeLinecap="round"
```

**CategoryDetailSheet.amounts.test** — `src/components/finance/CategoryDetailSheet.amounts.test.tsx`
- Props: `useRouter`, `refresh`

```tsx
{
  useRouter: (
```

**CategoryDetailSheet** — `src/components/finance/CategoryDetailSheet.tsx`
- Variants: `category`, `unitemized`
- Props: `category`, `onClose`, `recalcularse`, `onChanged`
- Key Styles: `rounded-2xl`, `border-sky-200`, `bg-white`, `py-3`, `text-sm`, `font-bold`, `shadow-sm`, `active:scale-[0.98]`
- Animation: tw-transitions: transition-transform
- State: useState

```tsx
<ModalShell
      emoji={emojiFor(category
```

**DebtPanel** — `src/components/finance/DebtPanel.tsx`
- Props: `debts`, `deuda`, `onChanged`
- Key Styles: `rounded-3xl`, `border-sky-200`, `bg-linear-to-br`, `space-y-4`, `text-sm`, `font-black`, `shadow-sm`, `active:scale-[0.99]`
- Animation: framer-motion, transition: {delay: i * 0.07}, animate: {opacity: 1, x: 0}
- State: useState

```tsx
<div className="space-y-4">
      {/* ─── Tarjetas y créditos ───────────────────────────────────────────
          Van primero porque son la deuda que CUESTA: mientras exista el saldo
          genera interés cada mes, cosa que un recibo atrasado no hace. */}
      {debts.creditBalance > 0 && (
        <section className="rounded-3xl border border-sky-200 bg-linear-to-br from-sky-100 to-blue-100 p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-black text-black">
                💳 Tarjetas y créditos
              </h2>
              <p className="mt-1 text-xs text-slate-600">
```

**ExpenseDetailSheet** — `src/components/finance/ExpenseDetailSheet.tsx`
- Props: `expenseKind`, `onClose`, `cambiar`, `onChanged`
- Key Styles: `rounded-2xl`, `border-sky-200`, `bg-white`, `py-3`, `text-sm`, `font-bold`, `shadow-sm`, `active:scale-[0.98]`
- Animation: tw-transitions: transition-transform
- State: useState

```tsx
<ModalShell
      emoji={meta.emoji}
      title={meta.groupLabel}
      headerClass="from-blue-100 to-sky-100"
      subtitle={
        expenses === null
          ? 'Cargando…'
          : `${fmtMoneyFine(total
```

**FinancePlanView** — `src/components/finance/FinancePlanView.tsx`
- Props: `initialData`
- Key Styles: `rounded-3xl`, `border-sky-200`, `bg-linear-to-br`, `space-y-5`, `text-sm`, `font-black`, `shadow-sm`, `active:scale-[0.99]`
- Animation: framer-motion, transition: {duration: 1.2, ease: [0.22, 0.61, 0.36, 1]}, animate-presence
- State: useState, useRef

```tsx
<div className="relative w-28 h-28 shrink-0">
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90" aria-hidden="true">
        <circle cx="60" cy="60" r={RADIUS} fill="none" stroke="currentColor" className="text-white/70" strokeWidth="11" />
        <motion.circle
          cx="60"
          cy="60"
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={CIRC}
```

**ScanTicketButton** — `src/components/finance/ScanTicketButton.tsx`
- Key Styles: `rounded-2xl`, `bg-sky-500`, `gap-2`, `text-sm`, `font-bold`, `shadow-sm`, `hover:bg-sky-600`

```tsx
<Link
      href="/shopping-trips/new"
      className="shrink-0 flex items-center gap-2 px-4 py-3 rounded-2xl bg-sky-500 hover:bg-sky-600 active:bg-sky-600 active:scale-95 text-white text-sm font-bold shadow-sm transition"
    >
      <CameraIcon className="w-5 h-5" />
      Escanear ticket
    </Link>
```

**DashboardStats** — `src/components/home/DashboardStats.tsx`
- Props: `totalProducts`, `runningLowCount`
- Key Styles: `rounded-[var(--radius-card)]`, `gap-3`, `text-4xl`, `font-extrabold`, `shadow-[var(--shadow-sm)]`, `hover:shadow-[var(--shadow-md)]`
- Animation: motion-variant: variants={{ hidden: {}, motion-variant: variants={{ hidden: { opacity: 0, y: 16 }, framer-motion

```tsx
<motion.div
      className="grid grid-cols-2 gap-3"
      initial="hidden"
      animate="visible"
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.07 } } }}
    >
      {stats.map((stat
```

*...and 17 more navigation components.*

### Data Display (10)

**DebtDetailSheet** — `src/components/debts/DebtDetailSheet.tsx`
- Variants: `summary`, `plan`, `ledger`
- Props: `debt`, `onClose`, `onChanged`, `onDeleted`, `id`, `onPay`, `onEdit`
- Key Styles: `rounded-2xl`, `border-sky-200`, `bg-sky-100/70`, `gap-3`, `text-xs`, `font-semibold`, `focus:border-sky-400`
- Animation: framer-motion, transition: {type: 'spring', stiffness: 380, damping: 32}, layout-animation
- State: useState

```tsx
<div className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      <span className={`${strong ? 'text-lg font-extrabold' : 'text-sm font-bold'} text-black`}>
        {value}
      </span>
    </div>
```

**ProgressRing** — `src/components/debts/ProgressRing.tsx`
- Props: `value`, `color`, `size`, `emoji`, `label`
- Animation: tw-transitions: duration-700, ease-out

```tsx
<div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={label ?? `${Math.round(clamped
```

**ChartCard** — `src/components/home/ChartCard.tsx`
- Key Styles: `rounded-[var(--radius-card)]`, `border-[var(--line)]`, `bg-[var(--surface)]`, `p-5`, `text-base`, `font-extrabold`, `shadow-[var(--shadow-sm)]`

```tsx
<section className="relative bg-[var(--surface
```

**ChartZoom** — `src/components/home/ChartZoom.tsx`
- Props: `title`, `children`
- Key Styles: `rounded-lg`, `bg-slate-100`, `gap-3`, `text-lg`, `font-bold`, `hover:bg-slate-200`
- State: useState

**StatsBars** — `src/components/home/StatsBars.tsx`
- Props: `data`, `unit`, `maxBarHeight`
- Key Styles: `rounded-t-lg`, `gap-2`, `font-medium`, `shadow-sm`, `focus:outline-none`
- Animation: tw-transitions: transition-all, duration-300, duration-500, ease-out
- State: useState

```tsx
<div className="w-full">
      <div
        className="flex items-end justify-around gap-2 sm:gap-4 w-full px-2 pt-10"
        style={{ minHeight: maxBarHeight + 60 }}
      >
        {data.map((item, i
```

**StatsWheel** — `src/components/home/StatsWheel.tsx`
- Props: `data`, `totalLabel`, `totalValue`, `size`, `thickness`, `formatValue`, `value`, `maxLegendItems`
- Key Styles: `rounded-sm`, `border-slate-100`, `bg-white`, `gap-4`, `text-base`, `font-bold`, `cursor-pointer`
- Animation: tw-transitions: transition-all, duration-300, transition-colors, duration-200
- State: useState

```tsx
<div className="flex flex-row items-center gap-4 w-full min-w-0">
      {/* ── Donut ─────────────────────────────────────────── */}
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
          aria-hidden="true"
        >
          {/* Track — adapts to dark mode via currentColor trick */}
          <circle
```

**StatsContent** — `src/components/stats/StatsContent.tsx`
- Props: `stock`, `full`, `half`, `empty`, `topStores`, `monthlySpending`, `totalProducts`, `topProducts` (+8 more)
- Key Styles: `rounded-2xl`, `border-slate-100`, `bg-white`, `gap-3`, `text-base`, `font-bold`, `shadow-sm`, `cursor-pointer`
- Animation: tw-transitions: transition-colors, duration-300, transition-transform, hover-transforms
- State: useState

```tsx
<div className="flex items-center gap-3 mb-4">
      <span
        className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0 ${chipClass}`}
        aria-hidden="true"
      >
        {emoji}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      {trailing}
```

**StatsDetailSheet** — `src/components/stats/StatsDetailSheet.tsx`
- Variants: `stock`, `store`, `product`, `month`
- Props: `open`, `detail`, `onClose`, `knownStores`, `onDataChanged`
- Key Styles: `rounded-xl`, `border-slate-100`, `bg-brand-50`, `gap-3`, `text-xl`, `font-medium`, `backdrop:bg-black/60`, `pointer-events-none`
- State: useState, useRef

*...and 2 more data display components.*

### Data Input (9)

**LoginCard** — `src/components/auth/LoginCard.tsx`
- Props: `error`, `callbackUrl`
- Key Styles: `rounded-[var(--radius-sheet)]`, `border-[var(--line)]`, `bg-[var(--surface)]`, `mx-4`, `text-3xl`, `font-extrabold`, `shadow-[var(--shadow-md)]`, `focus:border-brand-500`

```tsx
<div className="w-full max-w-sm mx-4">
      <div className="flex flex-col items-center text-center mb-8">
        <Image src="/logo-fy.png" alt="" width={64} height={64} className="object-contain" priority />
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-[var(--ink
```

**VerifyLoginCard** — `src/components/auth/VerifyLoginCard.tsx`
- Props: `email`, `callbackUrl`, `error`, `name`
- Key Styles: `rounded-3xl`, `border-slate-100`, `bg-white`, `mx-4`, `text-3xl`, `font-bold`, `shadow-xl`, `focus:border-brand-500`
- Animation: tw-transitions: transition-all

```tsx
<div className="w-full max-w-md mx-4">
      <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
        <div className="bg-linear-to-br from-brand-500 to-brand-600 p-8 text-center text-white">
          <div className="text-6xl mb-3">🔐</div>
          <h1 className="text-3xl font-bold">Verifica tu acceso</h1>
          <p className="text-brand-100 mt-2 text-sm">Introduce el codigo de verificacion</p>
        </div>

        <div className="p-8">
          {error && (
            <div className="mb-4 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-700 text-sm">
              {ERROR_MESSAGES[error] ?? 'No se pudo verificar el codigo.'}
```

**MarkPaidModal** — `src/components/payments/MarkPaidModal.tsx`
- Variants: `transfer`
- Props: `payment`, `open`, `onClose`, `onConfirmed`, `applied`, `recentBankAccounts`
- Key Styles: `rounded-t-3xl`, `border-sky-200`, `bg-transparent`, `m-0`, `text-xl`, `font-bold`, `backdrop:bg-black/60`, `pointer-events-none`
- Animation: tw-animate-fade-up
- State: useState, useRef

**PaymentDetailSheet** — `src/components/payments/PaymentDetailSheet.tsx`
- Variants: `days`, `view`, `edit`, `dueDay`, `notify`, `months`
- Props: `payment`, `isPaid`, `open`, `onClose`, `onPaidToggle`, `onUpdated`, `p`, `onDeleted`
- Key Styles: `rounded-2xl`, `border-white/20`, `bg-white/10`, `gap-4`, `text-2xl`, `font-bold`, `hover:bg-white/20`
- Animation: tw-animate-fade-up, tw-transitions: transition-all, hover-transforms
- State: useState, useRef

**PaymentForm** — `src/components/payments/PaymentForm.tsx`
- Variants: `days`, `months`
- Props: `name`, `amount`, `dueDay`, `frequency`, `anchorMonth`, `currency`, `category`, `description` (+6 more)
- Key Styles: `rounded-xl`, `border-sky-200`, `bg-blue-50`, `space-y-6`, `text-sm`, `font-semibold`, `focus:outline-none`
- Animation: tw-transitions: transition-all
- State: useState

```tsx
<form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-700 text-sm">
          {error}
        </div>
```

**ProductForm** — `src/components/products/ProductForm.tsx`
- Variants: `string`
- Props: `product`, `inHousehold`, `me`, `isOwner`, `img`, `release`
- Key Styles: `rounded-xl`, `border-2`, `bg-blue-50`, `space-y-5`, `text-sm`, `font-medium`, `shadow`, `hover:bg-brand-600`
- Animation: tw-animate-spin, tw-transitions: transition-colors, transition-transform
- State: useState, useRef

```tsx
<form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-700 text-sm">
          {error}
        </div>
```

**RegisterPurchaseModal** — `src/components/products/RegisterPurchaseModal.tsx`
- Variants: `unit`, `total`
- Props: `open`, `product`, `onClose`, `onSaved`, `updated`, `product.unit`
- Key Styles: `rounded-t-3xl`, `border-slate-200`, `bg-transparent`, `m-0`, `text-xs`, `font-semibold`, `backdrop:bg-black/50`, `pointer-events-none`
- Animation: tw-animate-fade-up
- State: useState, useRef

**SendGiftModal** — `src/components/sharing/SendGiftModal.tsx`
- Props: `productId`, `productName`, `onClose`
- Key Styles: `rounded-t-3xl`, `border-slate-200`, `bg-transparent`, `m-0`, `text-lg`, `font-bold`, `backdrop:bg-black/50`, `pointer-events-none`
- Animation: tw-animate-fade-up, hover-transforms
- State: useState, useRef

```tsx
<dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e
```

*...and 1 more data input components.*

### Feedback (2)

**NotificationsTestPanel** — `src/components/payments/NotificationsTestPanel.tsx`
- Variants: `test`, `trigger`, `snooze`, `resubscribe`
- Props: `payments`, `onSnoozed`, `id`, `snoozedUntil`
- Key Styles: `rounded-2xl`, `border-sky-100`, `bg-white`, `px-5`, `text-lg`, `font-semibold`, `shadow-sm`, `hover:bg-sky-50/70`
- Animation: tw-transitions: transition-transform
- State: useState

```tsx
<div className="bg-white rounded-2xl border border-sky-100 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={(
```

**Toast** — `src/components/ui/Toast.tsx`
- Variants: `success`, `error`, `info`
- Props: `show`
- Key Styles: `rounded-full`, `bg-[#0b1220]`, `gap-2`, `text-sm`, `font-semibold`, `shadow-[var(--shadow-lg)]`, `pointer-events-none`
- Animation: framer-motion, transition: {type: 'spring', stiffness: 420, damping: 32}, animate-presence
- State: useState, useContext

```tsx
prev: Toast[]
```

### Overlay (11)

**DebtsView** — `src/components/debts/DebtsView.tsx`
- Props: `initial`, `cliente`, `payments`, `initialScope`
- Key Styles: `rounded-3xl`, `border-sky-200`, `bg-linear-to-br`, `space-y-5`, `text-xs`, `font-semibold`, `shadow-sm`, `active:scale-[0.99]`
- Animation: tw-transitions: transition-all, duration-150
- State: useState

```tsx
<div className="space-y-5">
      {/* ─── Personal / Negocio ───────────────────────────────────────────
          Encima de TODO, porque cambia hasta el titular: la cartera, el
          consejo de a cuál atacar y la lista hablan del lado elegido. */}
      <ScopeTabs
        value={scope}
        onChange={setScope}
        summary={scopeSummary}
        format={(n
```

**DebtWizardModal** — `src/components/debts/DebtWizardModal.tsx`
- Props: `currency`, `onClose`, `onCreated`, `debt`
- Key Styles: `rounded-full`, `border-sky-200`, `bg-sky-500`, `gap-2`, `text-sm`, `font-bold`, `focus:border-sky-400`
- Animation: tw-animate-fade-up, tw-transitions: transition-all, duration-300, ease-out, duration-150
- State: useState

```tsx
<ModalShell
      title={['¿Qué debes?', '¿Cuánto y a qué tasa?', '¿Cómo lo pagas?'][step]}
      subtitle={`Paso ${step + 1} de 3`}
      emoji={KIND_META[kind].emoji}
      onClose={onClose}
      footer={
        <div className="flex items-center gap-2">
          {step > 0 && (
            <button
              type="button"
              onClick={(
```

**IncomeModal** — `src/components/finance/IncomeModal.tsx`
- Props: `incomes`, `onCreate`, `payload`, `onToggle`, `id`, `isActive`, `onDelete`, `onClose`
- Key Styles: `rounded-2xl`, `border-dashed`, `bg-linear-to-r`, `gap-3`, `text-xl`, `font-bold`, `shadow-lg`, `disabled:opacity-50`
- Animation: framer-motion, animate-presence, animate: {opacity: 1, y: 0}
- State: useState

```tsx
<ModalShell
      title="Tus ingresos"
      emoji="💼"
      headerClass="from-sky-100 to-blue-100"
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] text-slate-500 font-bold">
              {oneTime > 0 ? 'Entra este mes' : 'Total mensual'}
            </p>
            <p className="text-xl font-black text-black tabular-nums">{fmtMoney(recurring + oneTime
```

**ModalShell.test** — `src/components/finance/ModalShell.test.tsx`

```tsx
<ModalShell title={title} onClose={(
```

**ModalShell** — `src/components/finance/ModalShell.tsx`
- Props: `title`, `subtitle`, `emoji`, `headerClass`, `onClose`, `children`, `footer`
- Key Styles: `rounded-t-3xl`, `border-sky-100`, `bg-slate-900/40`, `mx-auto`, `text-lg`, `font-black`, `backdrop-blur-sm`, `cursor-default`
- Animation: framer-motion, transition: {duration: 0.18}, animate-presence

**MemberSheet** — `src/components/household/MemberSheet.tsx`
- Props: `member`, `isSelf`, `isHouseholdOwner`, `viewerIsOwner`, `onClose`, `onRename`, `id`, `name` (+3 more)
- Key Styles: `rounded-t-3xl`, `border-slate-200`, `bg-black/50`, `p-6`, `text-lg`, `font-bold`, `backdrop-blur-sm`, `cursor-default`
- Animation: framer-motion, transition: {type: 'spring', stiffness: 380, damping: 28}, animate-presence
- State: useState

```tsx
<>
      {/* The key is what lets AnimatePresence swap members: without it the
          exiting sheet keeps the slot and the next member never renders. */}
      <AnimatePresence>
        {member && (
          <ModalLayer key={member.id}>
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
            <motion.button
              type="button"
              aria-label="Cerrar"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
```

**CommandPalette** — `src/components/layout/CommandPalette.tsx`
- Props: `products`
- Key Styles: `rounded-[var(--radius-sheet)]`, `border-[var(--line)]`, `bg-transparent`, `m-0`, `text-base`, `font-medium`, `backdrop:bg-black/50`
- Animation: tw-animate-fade-up, tw-animate-pulse
- State: useState, useRef

**PriceScannerModal** — `src/components/shopping/PriceScannerModal.tsx`
- Variants: `idle`, `camera`, `processing`, `preview`, `error`
- Props: `productName`, `onPrice`, `price`, `onClose`, `tessedit_pageseg_mode`
- Key Styles: `rounded-t-3xl`, `border-slate-200`, `bg-black/60`, `p-5`, `text-base`, `font-bold`, `backdrop-blur-sm`, `cursor-default`
- Animation: tw-animate-spin
- State: useState, useRef

*...and 3 more overlay components.*

### Typography (2)

**Markdown.test** — `src/components/ui/Markdown.test.tsx`

**Markdown** — `src/components/ui/Markdown.tsx`
- Props: `children`, `className`
- Key Styles: `hover:prose-a:underline`

```tsx
<a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
```

### Other (26)

**DebtDetailSheet.promo.test** — `src/components/debts/DebtDetailSheet.promo.test.tsx`
- Variants: `custom`, `by_date`
- Props: `balance`, `rate`, `ratePeriod`, `strategy`, `termMonths`, `payoffDate`, `customPayment`, `minPercent` (+7 more)

**DebtLedgerEdit.test** — `src/components/debts/DebtLedgerEdit.test.tsx`
- Props: `balance`, `rate`, `ratePeriod`, `strategy`, `minFloor`, `cycleDays`, `dueDay`, `now`

```tsx
c[1] as RequestInit
```

**DebtsView.scope.test** — `src/components/debts/DebtsView.scope.test.tsx`
- Props: `balance`, `rate`, `ratePeriod`, `strategy`, `termMonths`, `payoffDate`, `customPayment`, `minPercent` (+2 more)

**DebtsView.test** — `src/components/debts/DebtsView.test.tsx`
- Props: `balance`, `rate`, `ratePeriod`, `strategy`, `termMonths`, `payoffDate`, `customPayment`, `minPercent` (+2 more)

**AdviceFeed.test** — `src/components/finance/AdviceFeed.test.tsx`
- Props: `id`, `title`

**GoalReorderList.test** — `src/components/finance/GoalReorderList.test.tsx`
- State: useState

```tsx
<GoalReorderList
      goals={goals}
      onReorder={setOrder}
      onCommit={(
```

**GroceryCategoryBreakdown.test** — `src/components/finance/GroceryCategoryBreakdown.test.tsx`
- Props: `spentThisMonth`

```tsx
{
  ...EMPTY_GROCERY_INSIGHT,
  spentThisMonth: 176.94,
  ...extra,
}
```

**IncomeModal.test** — `src/components/finance/IncomeModal.test.tsx`
- Props: `name`, `amount`, `frequency`

*...and 18 more other components.*



---

## 5. Layout Principles

- **Base spacing unit:** 8px
- **Spacing scale:** 8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96
- **Border radius:** 0.6rem, 2px, 3px 0 0 3px, 4px, 6px, 8px, 12px, 16px, 24px, 99px
- **Grid usage:** `grid-cols-2`, `grid-cols-4`, `grid-cols-3`, `grid-cols-6`, `grid-cols-1`
- **Container:** Tailwind `container` class with responsive padding

**Spacing as Meaning:**
| Spacing | Use |
|---|---|
| 4-8px | Tight: related items within a group |
| 16px | Medium: between groups |
| 24-32px | Wide: between sections |
| 48px+ | Vast: major section breaks |


---

## 6. Depth & Elevation

### Raised — cards, buttons, interactive elements

- `var(--shadow-sm)`
- `var(--shadow-md)`

### Floating — dropdowns, popovers, modals

- `0 1px 2px rgb(17 69 163/0.16),0 8px 20px -8px rgb(18 87 204/0.5)`
- `0 1px 2px rgb(17 69 163/0.16),0 8px 20px -8px rgb(26 106 232/0.5)`

### Overlay — full-screen overlays, top-level dialogs

- `0 2px 4px rgb(17 69 163/0.2),0 12px 26px -8px rgb(18 87 204/0.6)`
- `0 10px 25px -5px rgb(26 106 232/0.45)`
- `0 10px 40px 2px rgb(26 106 232/0.7)`

### Z-Index Scale

`0`



---

## 7. Animation & Motion

This project uses **expressive motion**. Animations are an integral part of the experience.

### Framer Motion Patterns

```tsx
// Standard enter animation
<motion.div
  initial={{ opacity: 0, y: 8 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.3, ease: "easeOut" }}
/>

// List stagger
const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } }
}
const item = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0 }
}
```

### CSS Animations

- `@keyframes foody-count-up`
- `@keyframes foody-fade-up`
- `@keyframes fadeIn`
- `@keyframes photoIn`
- `@keyframes foody-pop`
- `@keyframes foody-shimmer`
- `@keyframes foody-blob-drift`
- `@keyframes foody-card-in`

### Animated Components

- **VerifyLoginCard**: tw-transitions: transition-all
- **BudgetView**: framer-motion, transition: {duration: 1.1, ease: [0.22, 0.61, 0.36, 1]}, animate-presence
- **DebtCard**: tw-transitions: transition-all, duration-200, duration-150
- **DebtDetailSheet**: framer-motion, transition: {type: 'spring', stiffness: 380, damping: 32}, layout-animation
- **DebtPaymentModal**: tw-transitions: transition-all, duration-150

### Motion Guidelines

- Duration: 150-300ms for micro-interactions, 300-500ms for page transitions
- Easing: `ease-out` for enters, `ease-in` for exits
- Always respect `prefers-reduced-motion`


---

## 8. Do's and Don'ts

### Do's

- Use `#ffffff` for interactive elements (buttons, links, focus rings)
- Use `#eef5ff` as the primary page background
- Use **sans-serif** for all UI text
- Follow the **8px** spacing grid for all margins, padding, and gaps
- Use the defined shadow tokens for elevation — see Section 6
- Use border-radius from the scale: 0.6rem, 2px, 3px 0 0 3px, 4px, 6px
- Reuse existing components from Section 4 before creating new ones
- Use **Heroicons** for all icons
- Always use CSS variables for colors — never hardcode hex
- Test both light and dark modes for contrast

### Don'ts

- Don't introduce colors outside this palette — extend the design tokens first
- Don't mix font families — use sans-serif consistently
- Don't use arbitrary spacing values — stick to multiples of 8px
- Don't create custom box-shadow values outside the system tokens
- Don't use arbitrary border-radius values — pick from the defined scale
- Don't duplicate component patterns — check Section 4 first
- Don't mix icon libraries — consistency matters


---

## 9. Responsive Behavior

No breakpoints detected. Consider adding responsive breakpoints to the design system.

---

## 10. Agent Prompt Guide

Use these as starting points when building new UI:

### Build a Card

```
Background: #d9e7ff
Border: 1px solid var(--border)
Radius: 8px
Padding: 32px
Font: sans-serif
Use shadow tokens from Section 6.
```

### Build a Button

```
Primary: bg #ffffff, text white
Ghost: bg transparent, border var(--border)
Padding: 16px 32px
Radius: 8px
Hover: opacity 0.9 or lighter shade
Focus: ring with #ffffff
```

### Build a Page Layout

```
Background: #eef5ff
Max-width: 1280px, centered
Grid: 8px base
Responsive: mobile-first, breakpoints from Section 9
```

### Build a Stats Card

```
Surface: #d9e7ff
Label: #4f6ba3 (muted, 12px, uppercase)
Value: #152442 (primary, 24-32px, bold)
Status: use success/warning/danger from Section 2
```

### Build a Form

```
Input bg: #eef5ff
Input border: 1px solid var(--border)
Focus: border-color #ffffff
Label: #4f6ba3 12px
Spacing: 32px between fields
Radius: 8px
```

### General Component

```
1. Read DESIGN.md Sections 2-6 for tokens
2. Colors: only from palette
3. Font: sans-serif, type scale from Section 3
4. Spacing: 8px grid
5. Components: match patterns from Section 4
6. Elevation: shadow tokens
```
