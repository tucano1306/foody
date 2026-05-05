---
applyTo: "**"
---
<!-- cspell:disable -->

# Foody — Sistema de Inventario + Comparador de Precios

Foody es una aplicación moderna diseñada para gestionar inventario de comida, escanear recibos, leer códigos de barras y comparar precios entre supermercados como Walmart y Publix.  
Construida con un stack escalable, rápido y modular basado en **Next.js 15**, **NestJS 11** y **PostgreSQL (Neon)**.

---

## Tecnologías principales

### Frontend (`apps/web`)
- **Next.js 15** — App Router, Server Components, streaming con `loading.tsx`
- **React 19** — hooks, transitions, optimistic updates
- **Tailwind CSS v4** — diseño moderno con `@theme`
- **Framer Motion** — animaciones fluidas en SupermarketView
- **Tesseract.js** — OCR client-side para escanear recibos
- **@zxing/browser** — lectura de códigos de barras desde la cámara
- **Heroicons** — iconografía SVG

### Backend (`apps/api`)
- **NestJS 11** — arquitectura modular, guards, pipes, interceptors
- **TypeORM** — ORM + migraciones
- **Passport + JWT** — autenticación segura
- **Scrapers externos** — Walmart y Publix (vía API o scraping)

### Base de datos
- **PostgreSQL 15 (Neon)** — serverless Postgres
- **@neondatabase/serverless** — SQL tagged templates desde Next.js

### Auth
- **iron-session** — sesión server-side con JWT cifrado en cookie

### APIs externas
- **Open Food Facts** — datos por código de barras
- **OneSignal** — notificaciones push (PWA)
- **AWS S3** — almacenamiento de imágenes

### Infraestructura / Tooling
- **pnpm workspaces + Turborepo** — monorepo
- **Vercel** — deploy del frontend y backend
- **Docker** — Postgres local
- **Vitest / Playwright / Jest** — testing completo

---

## Endpoints principales (NestJS)

### Auth
- `POST /auth/login`
- `POST /auth/register`
- `POST /auth/refresh`

### Products
- `GET /products/:barcode`
- `POST /products`
- `GET /products/search?q=`

### Prices
- `GET /prices/compare?productId=`
- `POST /prices/cache`

### Tickets
- `POST /tickets/parse`
- `POST /tickets/save`

### Budget
- `GET /budget/estimate?listId=`
- `GET /budget/history`

### Supermarket
- `GET /supermarket/walmart?query=`
- `GET /supermarket/publix?query=`

---

## Modelo de datos (PostgreSQL)

### `products`
| Campo | Tipo |
|---|---|
| id | uuid |
| name | text |
| normalized_name | text |
| barcode | text |
| image_url | text |
| category | text |
| created_at | timestamptz |

### `prices_cache`
| Campo | Tipo |
|---|---|
| id | uuid |
| product_id | FK → products |
| supermarket | text |
| price | numeric |
| currency | text |
| updated_at | timestamptz |

### `tickets`
| Campo | Tipo |
|---|---|
| id | uuid |
| user_id | FK |
| raw_text | text |
| total | numeric |
| created_at | timestamptz |

### `ticket_items`
| Campo | Tipo |
|---|---|
| id | uuid |
| ticket_id | FK → tickets |
| product_name | text |
| normalized_name | text |
| price | numeric |
| quantity | int |

### `shopping_list`
| Campo | Tipo |
|---|---|
| id | uuid |
| user_id | FK |
| name | text |

### `shopping_list_items`
| Campo | Tipo |
|---|---|
| id | uuid |
| list_id | FK → shopping_list |
| product_id | FK → products |
| quantity | int |

---

## Algoritmo de comparación de precios

1. Buscar en cache (si < 24h → usar)
2. Consultar Walmart (API o scraper)
3. Consultar Publix (scraper)
4. Normalizar precios por unidad
5. Guardar en cache
6. Calcular: `cheapest = min(walmart, publix)`
7. Respuesta por producto:
```json
{
  "product": "Whole Milk 1L",
  "walmart": 2.89,
  "publix": 3.19,
  "cheapest": "walmart",
  "difference": 0.30
}
```
8. Clasificar por categorías y emitir recomendaciones:
```json
{
  "walmart_total": 42.50,
  "publix_total": 47.10,
  "best_option": "walmart",
  "savings": 4.60
}
```

---

## Parser de tickets (OCR)

1. Limpiar texto
2. Dividir por líneas
3. Detectar líneas con patrón `nombre + precio`
4. Normalizar nombre
5. Intentar match con productos existentes
6. Devolver lista estructurada:
```json
[
  { "name": "Milk Whole 1L", "price": 2.99 },
  { "name": "Bread White", "price": 1.49 }
]
```

---

## Scripts útiles

```bash
pnpm dev        # iniciar frontend + backend
pnpm db:push    # aplicar migraciones
pnpm test       # ejecutar tests
```
