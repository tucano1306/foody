# 🥑 Foody

Aplicación para controlar el inventario de tu despensa y gestionar pagos mensuales recurrentes — con **modo Casa** y **modo Supermercado**.

---

## Funcionalidades principales

| Módulo | Descripción |
|---|---|
| 🏠 **Modo Casa** | Visualiza todos tus productos, marca los que están terminando, agrega fotos |
| 🛒 **Modo Supermercado** | Lista de compras interactiva — toca para agregar al carrito y finaliza la sesión |
| 💳 **Pagos mensuales** | Registra pagos recurrentes, marca como pagados, recibe notificaciones push |
| 📸 **Fotos de productos** | Sube fotos directamente a S3 desde el dispositivo |
| 🔔 **Notificaciones** | Recordatorios automáticos vía OneSignal X días antes del vencimiento |
| 🔐 **Auth** | Login local por email con sesion BFF (iron-session) + JWT |

---

## Stack técnico

```
apps/
  web/          → Next.js 15 + React 19 + Tailwind CSS v4
  api/          → NestJS 11 + TypeORM + PostgreSQL 15
packages/
  types/        → Tipos TypeScript compartidos
```

---

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
