# 🥑 Foody

Aplicación personal para gestionar el inventario de despensa, compras del supermercado, pagos recurrentes y estadísticas de consumo — con modo **Casa** y modo **Supermercado**.

Desplegada en producción: **https://foody-web-eight.vercel.app**

---

## Funcionalidades

| Módulo | Descripción |
|---|---|
| 🏠 **Modo Casa** | Visualiza productos, stock levels (lleno / mitad / vacío), fotos |
| 🛒 **Modo Supermercado** | Lista de compras interactiva — toca para carrito, finaliza y el inventario se actualiza solo |
| 🧾 **Nueva compra** | Registra tickets con total, tienda, estrategia de reparto de precios y escaneo de recibo OCR |
| 📄 **Escaneo de recibo** | OCR con Tesseract.js — fotografía el ticket y detecta productos, precios y total automáticamente |
| 📷 **Código de barras** | Escanea EAN-13 / UPC-A con la cámara y autocompleta nombre, categoría e imagen del producto vía Open Food Facts |
| 💳 **Pagos mensuales** | Registra pagos recurrentes, márcalos como pagados, recibe notificaciones push días antes del vencimiento |
| 📊 **Estadísticas** | Gasto por categoría, este mes vs mes anterior, supermercados más usados y gráficas de consumo |
| 🏪 **Comparador de precios** | Compara qué supermercado tiene cada producto más barato según historial de compras |
| 👨‍👩‍👧 **Hogares** | Comparte despensa y lista de compras con otros miembros del hogar |
| 📸 **Fotos de productos** | Sube fotos directamente a AWS S3 |
| 🔔 **Notificaciones push** | Recordatorios automáticos vía OneSignal |
| 🔐 **Autenticación** | Login por email con sesión BFF (iron-session + JWT) |

---

## Stack técnico

```
apps/
  web/          → Next.js 15 · React 19 · Tailwind CSS v4
  api/          → NestJS 11 · TypeORM · PostgreSQL 15
packages/
  types/        → Tipos TypeScript compartidos (@foody/types)
```

### Frontend — `apps/web`

| Tecnología | Uso |
|---|---|
| **Next.js 15** | App Router, Server Components, API Routes, streaming |
| **React 19** | Hooks, transitions, optimistic updates |
| **Tailwind CSS v4** | CSS-first con `@theme` en `globals.css` |
| **Framer Motion** | Animaciones fluidas en listas y modales |
| **Tesseract.js** | OCR client-side para escanear recibos de supermercado |
| **@zxing/browser** | Lectura de códigos de barras EAN/UPC vía cámara |
| **Recharts** | Gráficas de consumo y estadísticas |
| **Heroicons** | Iconografía SVG |
| **iron-session** | Sesión server-side con cookie cifrada |

### Backend — `apps/api`

| Tecnología | Uso |
|---|---|
| **NestJS 11** | Módulos, guards, decoradores, Swagger |
| **TypeORM** | ORM + sistema de migraciones |
| **Passport / JWT** | Autenticación con `@nestjs/passport` + `@nestjs/jwt` |
| **@neondatabase/serverless** | SQL tagged templates desde Next.js API routes |

### Infraestructura

| Tecnología | Uso |
|---|---|
| **PostgreSQL 15 / Neon** | Base de datos serverless |
| **AWS S3** | Almacenamiento de imágenes de productos |
| **Open Food Facts** | Datos de productos por código de barras (sin API key) |
| **OneSignal** | Notificaciones push PWA |
| **Vercel** | Deploy de web y api |
| **Docker** | PostgreSQL local para desarrollo |
| **pnpm workspaces + Turborepo** | Monorepo con builds incrementales |

---

## Modelo de datos (simplificado)

```
products          → inventario personal con stockLevel: full | half | empty
shopping_list_items → productos pendientes de comprar (sincronizados con stock)
shopping_trips    → historial de tickets por tienda
product_purchases → línea de cada producto comprado con precio y cantidad
payments          → pagos recurrentes mensuales
households        → hogares compartidos entre usuarios
```

El `stockLevel` es la fuente de verdad. Al marcarlo como `half` o `empty` el producto se agrega automáticamente a la lista de compras. Al finalizar la sesión de supermercado se resetea a `full`.

---

## Desarrollo local

### Requisitos

- Node ≥ 20
- pnpm ≥ 9
- Docker (para PostgreSQL local)

### Setup

```bash
# Instalar dependencias
pnpm install

# Levantar base de datos local
pnpm docker:up

# Correr migraciones
pnpm --filter api migration:run

# Arrancar en modo desarrollo (web + api en paralelo)
pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:3001
- Swagger: http://localhost:3001/api/docs

### Variables de entorno

Crea `apps/web/.env.local` y `apps/api/.env` con:

```env
# apps/api/.env
DATABASE_URL=postgresql://...
JWT_SECRET=...

# apps/web/.env.local
NEXT_PUBLIC_API_URL=http://localhost:3001
SESSION_SECRET=...
AWS_S3_BUCKET=...
AWS_REGION=...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
ONESIGNAL_APP_ID=...
ONESIGNAL_REST_API_KEY=...
```

---

## Scripts

```bash
pnpm dev          # Arranca web + api en paralelo
pnpm build        # Build completo del monorepo
pnpm lint         # Lint de todos los paquetes
pnpm docker:up    # Levanta PostgreSQL local
pnpm docker:down  # Para PostgreSQL local
```

---

## Testing

```bash
# Unit tests (web)
pnpm --filter @foody/web test

# E2E tests (web)
pnpm --filter @foody/web test:e2e

# Unit tests (api)
pnpm --filter @foody/api test
```


## Requisitos

- Node 20+
- pnpm 9+
- Docker (para PostgreSQL + Redis)

---

## Inicio rápido

### 1. Clonar e instalar

```bash
pnpm install
```

### 2. Variables de entorno

```bash
cp .env.example .env
# Edita .env con tus credenciales reales
```

Variables requeridas:
- `IRON_SESSION_PASSWORD` — string aleatorio ≥ 32 chars
- `JWT_SECRET` — string aleatorio ≥ 32 chars
- `AWS_*` — Credenciales S3 para fotos (opcional)
- `ONESIGNAL_APP_ID` / `ONESIGNAL_API_KEY` — para push notifications (opcional)

### 3. Base de datos

```bash
pnpm docker:up
```

### 4. Correr en desarrollo

```bash
pnpm dev
```

Esto inicia los dos servicios en paralelo:

| Servicio | URL |
|---|---|
| Web (Next.js) | http://localhost:3000 |
| API (NestJS) | http://localhost:3001 |
| Swagger docs | http://localhost:3001/api/docs |

---

## Flujo de autenticación

```
Browser → Next.js (iron-session BFF)
  → /api/auth/login (email local)
  → JWT firmado → NestJS API (passport-jwt guard)
```

1. El usuario inicia sesion con su email en `/login`
2. Next.js genera un `userId` deterministico por email
3. Next.js firma un JWT con `JWT_SECRET`
4. El JWT se guarda en iron-session (cookie `httpOnly`)
5. Todas las llamadas a la API usan ese JWT como `Authorization: Bearer`

---

## Flujo de Modo Supermercado

1. En **modo Casa**, marca productos como "bajo stock" (botón ⚠) o actualiza la cantidad
2. Los productos se agregan automáticamente a la lista de compras
3. Cuando vayas al super, cambia a **modo Supermercado** (toggle en la barra)
4. Toca cada producto para marcarlo como "en carrito"
5. Al terminar, presiona **Finalizar compra** — los productos se marcan como comprados y las flags se resetean

---

## Notificaciones push

Se usa **OneSignal** con un cron job diario (9 AM) que:
1. Obtiene todos los pagos activos
2. Calcula `daysUntilDue` para cada uno
3. Envía una notificación push si `daysUntilDue <= notificationDaysBefore`

Para activarlas el usuario debe guardar su `onesignalPlayerId` via `PATCH /users/me`.

---

## Estructura de la base de datos

```
users
  └── products (1:N)
        └── shopping_list_items (1:N, via product)
  └── monthly_payments (1:N)
        └── payment_records (1:N, un registro por mes/año)
```

---

## Comandos útiles

```bash
pnpm build          # Build de todos los apps
pnpm lint           # Lint de todos los apps
pnpm docker:up      # Inicia PostgreSQL + Redis
pnpm docker:down    # Detiene los contenedores
```
