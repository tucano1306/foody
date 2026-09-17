# Foody

App personal (PWA) para despensa, compras del súper, pagos recurrentes, deudas y
presupuesto. Monorepo pnpm + Turborepo. Producción: https://foody-web-eight.vercel.app

Todo el código y los comentarios están en español. Escribe igual.

---

## Lo primero: dónde vive el backend de verdad

**El backend en producción es `apps/web` — las rutas del App Router en
`apps/web/src/app/api/**` hablando directo con Neon Postgres.**

`apps/api` (NestJS + TypeORM) **no está en el camino de ejecución.** Antes de
tocar algo ahí, comprueba que de verdad quieres tocarlo:

- `apps/web/src/app/api/proxy/[...path]/route.ts` no reenvía a NestJS. Reenvía a
  `${origin}/api/<path>` — al propio Next, mismo origen.
- `next.config.ts` fija `NEXT_PUBLIC_API_URL: '/api/proxy'`, así que el cliente
  entra por ese proxy y acaba en las rutas de Next.
- `apps/api/vercel.json` es `{"version": 2}`. No hay build de la API.

Consecuencias prácticas:

| Lo que parece | Lo que de verdad se usa |
|---|---|
| Migraciones TypeORM en `apps/api/src/migrations/` | `apps/web/src/lib/ensure-schema.ts` |
| Entidades TypeORM | SQL a mano con `sql` de `lib/db.ts` |
| `@nestjs/schedule` | Vercel Crons en `apps/web/vercel.json` |
| AWS S3 (`@aws-sdk/client-s3` en la API) | Vercel Blob (`@vercel/blob` en la web) |
| `ScopeService` de NestJS | El ámbito se resuelve a mano en cada ruta |

El README está desactualizado en varios puntos (dice Next.js 15 — es 16.2.4;
dice S3 — son Blobs; menciona `pnpm --filter api migration:run`, script que no
existe). `.env.example` también: sigue listando `AWS_*`, `REDIS_URL` y `SMTP_*`
de la época NestJS, y le faltan `BLOB_READ_WRITE_TOKEN` y `CRON_SECRET`, que sí
se usan.

Si hay conflicto entre el README y este archivo, gana este archivo; si hay
conflicto entre este archivo y el código, gana el código — y avísame para
corregirlo aquí.

---

## Flujo de datos

```
navegador
  └─ fetch a /api/proxy/<algo>        (NEXT_PUBLIC_API_URL)
       └─ app/api/proxy/[...path]     valida sesión, bloquea path traversal
            └─ app/api/<algo>/route.ts
                 └─ lib/api.ts  o  sql`...` directo   →  Neon Postgres
```

Los Server Components llaman a `lib/api.ts` directamente, sin pasar por el proxy.

---

## Autenticación

Sin proveedor externo, y **más simple de lo que parece**: el login real es solo
el email.

`POST /api/auth/login`:

1. Rate limit por IP (5 cada 15 min) con un `Map` en memoria del proceso
2. Valida el formato del email
3. Upsert en `users` con `emailToUuid(email)` — UUID determinista por SHA-1 del
   email, así el mismo email es siempre el mismo usuario
4. Firma un JWT HS256 (`lib/server-auth.ts`, issuer `foody-web-auth`, audience
   `foody-api`, 7 días)
5. Guarda la sesión con `isLoggedIn = true` y redirige

No hay contraseña y **no hay verificación de código en este camino. Esto es a
propósito — decisión del dueño del proyecto.**

> **No añadas verificación de login, OTP, contraseñas ni un proveedor de
> autenticación externo a menos que él lo pida explícitamente.** Que cualquiera
> que escriba un email entre como ese usuario es el comportamiento buscado, no un
> fallo pendiente. No lo marques como problema de seguridad en cada revisión.

### El OTP está escrito pero desconectado

Existen `lib/login-otp.ts`, `app/api/auth/verify/route.ts` y la página
`/login/verify`, con hash SHA-256, `timingSafeEqual`, TTL de 10 minutos y máximo
5 intentos. Nada de eso llega a ejecutarse: `/api/auth/login` autentica de una
vez sin pasar por ahí. Y `sendLoginCodeEmail()` solo hace `console.info` cuando
`NODE_ENV !== 'production'` — en producción no envía nada.

Es código muerto, conservado a propósito por si se usa en el futuro. No lo
conectes y no lo borres.

### Los tres guardianes de sesión

- `src/middleware.ts` — solo cubre 7 rutas (`/home`, `/supermarket`,
  `/products`, `/payments`, `/household`, `/stats`, `/shopping-trips`).
- `app/(app)/layout.tsx` — `getSession()` + `redirect('/login')`. **Este cubre
  todo el grupo `(app)`**, incluidas `/budget`, `/debts`, `/plan` y `/sharing`,
  que no están en el matcher del middleware. No es un agujero: no hace falta
  añadirlas al matcher.
- Cada página además revalida la sesión por su cuenta.

Sesión: iron-session, cookie `foody_session`, httpOnly, sameSite lax, 7 días.
`IRON_SESSION_PASSWORD` debe tener 32+ caracteres; en producción lanza si falta,
salvo con `E2E_TEST_MODE=true`.

En las rutas de API: `getRouteUser(request)` de `lib/route-helpers.ts`, y
`unauthorized()` / `badRequest()` / `notFound()` para los errores.

---

## Herramientas del proyecto

### Context7 — documentación al día (INSTALADO)

Dado de alta como servidor MCP stdio en la config de la app (la misma del
paquete MSIX donde está `graphify`), vía npx:

```json
"context7": {
  "command": "cmd",
  "args": ["/c", "npx", "-y", "@upstash/context7-mcp"]
}
```

No hay nada instalado en disco: npx resuelve el paquete al arrancar. Expone dos
herramientas, `resolve-library-id` y `query-docs`. Sin API key va con límite
anónimo, que sobra para un proyecto de una persona.

**Ancla las consultas a la versión.** Context7 publica `/vercel/next.js/v16.2.2`,
prácticamente la 16.2.4 que usa este repo; sin la etiqueta de versión devuelve
docs de la última, que puede no coincidir. Mismo criterio para React 19 y
Tailwind v4.

Es de la app, no de este repo, así que **sirve para cualquier proyecto**.

Si algún día se usa Claude Code, el equivalente por repo es un `.mcp.json` en la
raíz: `claude mcp add --transport http context7 https://mcp.context7.com/mcp
--scope project`.

Sirve para lo que aquí duele: foody va con **Next.js 16.2.4, React 19 y Tailwind
CSS v4**, versiones lo bastante nuevas como para que un modelo devuelva la forma
antigua de una API o invente una que no existe. Context7 trae la documentación
real de la versión instalada.

### Neon — conector (INSTALADO)

Conectado como conector de claude.ai, con OAuth. Da acceso al esquema vivo, a los
logs y a consultas.

**Dónde está la base de foody, que cuesta encontrar:** no está en tu organización
personal de Neon («Leo»), sino en la que gestiona Vercel, entre seis proyectos
con nombres autogenerados.

| | |
|---|---|
| Organización | `org-holy-hall-68938281` — «Vercel: tucano0109-5495's projects» |
| Proyecto | `sparkling-cell-19558566` — «neon-celeste-globe» |
| Postgres | 17, `aws-us-east-1` |

20 objetos en `public`: 19 tablas más la vista `trip_kind_amounts`. Ojo, varias
tablas (`debts`, `finance_goals`, `budget_settings`, `pantry_shares`…) **no** las
crea `ensure-schema.ts` sino los `ensure*` de `debt-data.ts`, `finance-data.ts` y
`ensure-sharing-schema.ts`.

El conector está en modo escritura: tiene herramientas destructivas. No las uses
sin preguntar al dueño del proyecto.

### Playwright CLI — pendiente, y a la espera de Claude Code

Distinto de los tests e2e que ya existen. Los specs de `e2e/` comprueban lo que
ya sabes que debe pasar; el CLI deja al agente abrir un navegador y mirar, sin
escribir un spec: entrar, hacer login, recorrer el modo supermercado y ver qué se
pinta de verdad.

No está instalado a propósito. Es una herramienta para agentes que corren en la
terminal (Claude Code, Copilot CLI) y aquí todavía no hay ninguno. Cuando lo
haya, **desde una PowerShell normal, nunca desde la terminal de la app**:

```bash
npm install -g @playwright/cli@latest
playwright-cli install --skills      # deja las skills donde el agente las ve
playwright-cli install-browser       # opcional; si no, se descarga al primer uso
```

### Graphify — grafo del código (INSTALADO)

Mapea el proyecto a un grafo que el agente consulta en vez de hacer `grep` por
los archivos. Apache-2.0 / MIT.

Estado actual del grafo: **4.405 nodos, 11.247 aristas, 186 comunidades**, a
partir de 474 archivos de código. Ocupa ~11 MB en `graphify-out/`, que ya está
en `.gitignore`.

Medido con `graphify benchmark` sobre este repo: **8,6× menos tokens por
consulta** que leer el corpus entero (293.666 tokens en bruto → ~34.178 de media
por consulta).

#### Reconstruir el grafo

Se hace **en local, sin LLM ni API key**, y respeta `.gitignore` — por eso se
salta `node_modules/`, `.next/` y `dist/`:

```bash
graphify extract . --code-only        # reconstruye (añade --force tras un refactor grande)
graphify cluster-only . --no-label    # regenera GRAPH_REPORT.md y graph.html
```

`--no-label` deja las comunidades como «Community N». Ponerles nombre de verdad
requiere una API key; no hace falta.

Hazlo después de cambios grandes, o deja `graphify watch .` corriendo.

#### Consultarlo

```bash
graphify query "cómo se resuelve el ámbito de un producto"
graphify explain "getRouteUser"
graphify path "SupermarketView" "sql"      # camino más corto entre dos nodos
graphify affected "getRouteUser"           # qué se rompe si cambia
graphify god-nodes --top 12                # los nodos más conectados
```

Dentro de Claude Code la skill está registrada como `/graphify`.

#### Servidor MCP (para Claude en la app de escritorio)

`graphify-mcp` está dado de alta como servidor MCP local, apuntando al grafo de
foody. **La app de Claude aquí está instalada como paquete MSIX, así que su
config NO está en `%APPDATA%\Claude\`** — está en:

```
C:\Users\tucan\AppData\Local\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\claude_desktop_config.json
```

Contenido añadido:

```json
"graphify": {
  "command": "C:\\Users\\tucan\\.local\\bin\\graphify-mcp.exe",
  "args": ["--graph", "C:\\Users\\tucan\\OneDrive\\Desktop\\foody\\graphify-out\\graph.json"]
}
```

Así Claude puede consultar el grafo desde una sesión normal de la app, sin
Claude Code y sin tener que leer los archivos uno por uno.

**Foody es el valor por defecto, no un límite.** Todas las herramientas aceptan
`project_path` (ruta absoluta a una carpeta que tenga su propio
`graphify-out/graph.json`), así que se puede consultar otro repo sin tocar la
config ni reiniciar la app — basta con haber corrido `graphify extract` allí.
Para preguntar por varios repos a la vez: `graphify global add`, que los fusiona
en `~/.graphify/global-graph.json`.

Qué es de la máquina y qué es de este proyecto:

| Pieza | Alcance |
|---|---|
| Comando `graphify` (en `Scripts\` de Python) | toda la máquina |
| Skill `/graphify` (en `~\.claude\skills\`) | todos los proyectos |
| Entrada MCP en la config de la app | toda la app |
| `graphify-out/` (el grafo) | **solo foody** |

Expone 10 herramientas: `query_graph`, `get_node`, `get_neighbors`, `get_community`,
`god_nodes`, `graph_stats`, `shortest_path`, `list_prs`, `get_pr_impact`,
`triage_prs`.

**Gotcha de sesión:** tras añadir el servidor y reiniciar la app, una sesión que
ya estaba abierta ve el servidor como `announced` pero no recibe sus
herramientas. Hay que refrescar la lista de herramientas MCP, o abrir una sesión
nueva. Verlo `announced` no basta.

Cuál usar: `query_graph` hace BFS y devuelve mucho ruido — sirve para explorar.
Para respuestas precisas van mejor `shortest_path` (traza la cadena real de
imports/llamadas entre dos símbolos) y `get_node`.

Hay copia del config original en `claude_desktop_config.json.bak`.

Requiere el extra `[mcp]`: sin él, `graphify-mcp` arranca y muere con
`ModuleNotFound: mcp`. Está instalado como `graphifyy[sql,mcp]`.

#### Detalles de esta instalación

- Paquete de PyPI: `graphifyy` (dos íes griegas); el comando es `graphify` (una).
- Instalado con `pip install "graphifyy[sql,mcp]"` **desde una PowerShell
  normal**. Los dos extras importan: sin `[sql]`, `neon-schema.sql` no aporta
  nada al grafo; sin `[mcp]`, el servidor MCP no arranca.
- Ejecutables en `C:\Users\tucan\AppData\Local\Programs\Python\Python310\Scripts\`,
  que ya está en el PATH de usuario.

> **No instalar nada de esto desde la terminal que Claude usa dentro de la app
> de escritorio.** Esa terminal vive dentro del paquete MSIX de Claude y Windows
> redirige sus escrituras en `AppData` a
> `...\Packages\Claude_pzs8sxrjxfjjc\LocalCache\...`. El primer intento se hizo
> con `uv tool install` desde ahí: los `.exe` quedaron en `~\.local\bin` (ruta
> real) pero el entorno de Python al que apuntan quedó encerrado en la carpeta
> del paquete. Resultado: funcionaba al ejecutarlo Claude y fallaba en la
> terminal del usuario con `uv trampoline failed to canonicalize script path`.
> Lo mismo vale para editar `claude_desktop_config.json`: hacerlo desde fuera.
- La skill vive en `~/.claude/skills/graphify/`, fuera del repo. `graphify
  install` también creó un `~/.claude/CLAUDE.md` global de tres líneas que solo
  apunta a la skill.
- Desinstalar del todo: `graphify uninstall --purge` (borra `graphify-out/`).

#### Lo que el grafo confirma

Los nodos más conectados del repo son `sql` (207 aristas), `getRouteUser()`
(162) y `unauthorized()` (161). Es decir: el centro de gravedad de foody son las
rutas de Next hablando con Neon. Coincide con lo que dice la sección de arriba
sobre dónde vive el backend, pero calculado desde el AST en vez de leído a mano.

### SkillUI — extractor del sistema de diseño (INSTALADO)

`npm install -g skillui` (v1.3.4, MIT). Análisis estático puro: **sin IA y sin
API key**, así que no cuesta tokens.

Se apuntó a foody, no a webs ajenas. Produjo
[`apps/web/DESIGN.md`](apps/web/DESIGN.md) — ver la sección «Estilo».

```bash
skillui --dir apps/web --out <destino> --name foody --no-skill
```

`--no-skill` porque el archivo `.skill` que empaqueta solo lo lee Claude Code, y
aquí no hay. El `DESIGN.md` es markdown normal y se lee sin nada.

`--mode ultra` renderiza el sitio con Playwright para capturar animaciones y
scroll; no se usó, y requiere descargar Chromium.

### Evaluadas y descartadas, por ahora

- **Strix** (pentesting con IA, Docker + API key de pago): su hallazgo principal
  sería el login sin verificación, que es deliberado. Ver «Decisiones tomadas».
  Matiz: hay clases que **no** dependen de esa decisión y siguen sin auditar —
  subida de archivos (`upload/photo`, `upload/heic`), el guardián anti path
  traversal de `api/proxy`, SSRF vía Open Food Facts, y XSS en `Markdown.tsx`.
  Si se retoma, correrlo contra `localhost`, **nunca** contra la URL de Vercel.

---

## Comandos

Desde la raíz:

```bash
pnpm dev          # turbo: web en :3000 + api en :3001 (la api casi nunca hace falta)
pnpm build        # build del monorepo
pnpm lint         # turbo run lint
pnpm docker:up    # PostgreSQL local
pnpm docker:down
```

Por paquete:

```bash
pnpm --filter @foody/web dev           # solo la web — esto es lo normal
pnpm --filter @foody/web lint          # OJO: es `tsc --noEmit`, no eslint
pnpm --filter @foody/web test          # vitest run
pnpm --filter @foody/web test:watch
pnpm --filter @foody/web test:e2e      # playwright
pnpm --filter @foody/web test:security # playwright e2e/security.spec.ts
pnpm --filter @foody/api lint          # aquí sí es eslint
pnpm --filter @foody/api test          # jest
```

Antes de dar algo por terminado: `pnpm --filter @foody/web lint` y
`pnpm --filter @foody/web test`. El lint de la web es el compilador de
TypeScript, así que un error de tipos rompe el lint.

Los e2e levantan el servidor solos (`pnpm --filter @foody/web start`) con
`E2E_TEST_MODE=true`. Para correrlos contra un servidor ya levantado:
`PLAYWRIGHT_SKIP_WEBSERVER=1`. Specs en `apps/web/e2e/`: `home`, `payments`,
`products`, `security`, `supermarket`.

---

## Estructura

```
apps/web/src/
  app/(app)/        páginas con sesión (layout con el guardián)
  app/(auth)/       login y verify
  app/api/          LAS RUTAS DE API REALES
  components/       por dominio: debts, finance, payments, products, shopping,
                    stats, sharing, household, home, layout, ui, pwa, voice, fx
  lib/              lógica de negocio + los tests unitarios al lado
  middleware.ts
apps/web/e2e/       playwright
apps/web/scripts/   mantenimiento (.mjs); su lógica también se testea
apps/api/           NestJS — ver el aviso de arriba
packages/types/     @foody/types, tipos compartidos (src/index.ts)
```

Los tests unitarios viven junto al archivo que prueban (`debt-engine.ts` +
`debt-engine.test.ts`). Vitest recoge `{src,scripts}/**/*.{test,spec}.{ts,tsx}`.

Alias: `@/` → `apps/web/src/`.

Archivos grandes de referencia: `lib/finance-engine.ts` (~77 KB),
`lib/api.ts` (~47 KB), `lib/debt-engine.ts` (~46 KB),
`lib/debt-data.ts` (~46 KB), `components/shopping/SupermarketView.tsx` (~99 KB),
`components/payments/PaymentDetailSheet.tsx` (~67 KB). Léelos por partes.

---

## Esquema de la base de datos

No hay migraciones. `lib/ensure-schema.ts` crea y parchea con
`CREATE TABLE IF NOT EXISTS` y `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, y se
llama desde las rutas en cada arranque en frío. Funciones disponibles:

`ensurePurchaseSchema`, `ensureProductSharingSchema`, `ensureStockSignalSchema`,
`ensureExpenseScopeSchema`, `ensureExpenseKindSchema`, `ensureTripSplitsSchema`

**Para añadir una columna: añádela a la función `ensure*` que corresponda con
`ADD COLUMN IF NOT EXISTS`, y llama a esa función desde toda ruta que la use.**
No escribas una migración de TypeORM — no se ejecuta nunca.

`neon-schema.sql` en la raíz es la foto del esquema, no la fuente de verdad.

### Reglas de alcance (esto se equivoca fácil)

- **Productos**: al leer, solo los del `user_id`. Al crear, se sella `user_id`
  **y** `household_id`, más `is_private`. Que exista `household_id` no significa
  que el GET filtre por hogar — no lo hace.
- **Lista de la compra**: estrictamente por usuario. Se inserta con
  `household_id = NULL` a propósito. Nunca la filtres por hogar.
- **`ScopeFilter`** (`lib/expense-scope.ts`): `'all' | 'personal' | 'business'`,
  llega por `?scope=` y solo se acepta `personal` o `business`; cualquier otra
  cosa cae a `'all'`. Es un filtro de gasto, no tiene que ver con hogares.

### `stockLevel`

Es la fuente de verdad del inventario: `full | half | empty`, derivado de
`needsShopping` / `isRunningLow` (`deriveStockLevel`). `half` o `empty` mete el
producto en la lista de la compra; al cerrar la sesión de súper vuelve a `full`.

---

## Trampas conocidas

**`ON CONFLICT DO NOTHING` sin restricción única no hace nada.** Esto ya pasó y
**ya está arreglado** — el comentario largo en `ensure-schema.ts` es la autopsia,
no un aviso pendiente. El índice existe hoy en producción:
`uq_shopping_list_user_product` sobre `(user_id, product_id)`, verificado contra
la base. Cero duplicados en los datos.

La lección sigue en pie para código nuevo: un upsert con `ON CONFLICT` no hace
nada si no hay una restricción única que provoque el conflicto. Compruébalo al
escribir uno, no lo des por hecho.

**`photo_url` fue la columna cara, y esa migración también está terminada.**
Antes eran base64 en la base y agotaron la cuota de transferencia de Neon.
Verificado en producción: **0 filas con base64**, 97 en Vercel Blob, la columna
entera pesa 14 kB y la tabla `products` 208 kB.
`scripts/migrate-photos-to-blob.mjs` fue la migración y no dejó restos.

Lo que sí sigue vigente: **no metas `SELECT *` de productos en algo que corra en
cada navegación.** Por eso existe `?lite=true` en `/api/products` (devuelve solo
`id, name, category, unit, last_purchase_price`) y por eso el layout de `(app)`
usa `api.products.listForPalette()`.

**El host de Blob tiene dos niveles** (`<store>.public.blob.vercel-storage.com`),
así que en CSP y en `images.remotePatterns` hace falta `**` y no `*`. Con un
solo comodín la miniatura se veía (pasa por `/_next/image`) pero el zoom, que
usa la URL directa, salía roto.

**La CSP de `next.config.ts` está afinada a mano** para Tesseract (WASM,
`cdn.jsdelivr.net`, `worker-src blob:`) y Neon (`https://*.neon.tech`). Si
añades un dominio externo, hay que tocarla o el navegador lo bloquea en
producción sin avisar en local.

**`prebuild` copia el worker de Tesseract** (`scripts/copy-tesseract-worker.mjs`).
Si el OCR falla tras un build, empieza por ahí.

**`lib/db.ts` es un Proxy perezoso.** `DATABASE_URL` no existe en la fase de
"Collecting page data" de Next, así que el cliente Neon se crea en la primera
llamada, no al importar. No lo conviertas en una constante normal.

**El rate limit del login es un `Map` en memoria del proceso.** En Vercel cada
lambda tiene el suyo y se reinicia en frío, así que el límite real es mucho más
flojo que 5 por 15 minutos.

**El asistente de voz no usa IA.** `app/api/voice/route.ts` resuelve intenciones
con expresiones regulares en español (`ADD_PATTERNS`, `STOCK_PATTERNS`…) sobre el
texto normalizado sin acentos. `@anthropic-ai/sdk` está en las dependencias pero
no aparece en esa ruta — si vas a usarlo, compruébalo antes.

**`middleware.ts` está deprecado en Next 16.** El servidor de desarrollo lo avisa
al arrancar: *«The "middleware" file convention is deprecated. Please use "proxy"
instead»*. Sigue funcionando, así que no se ha migrado — pero es deuda con fecha
de caducidad. Ver https://nextjs.org/docs/messages/middleware-to-proxy.

**Swagger solo existe fuera de producción** (`main.ts`), y de todos modos
describe la API que no se usa.

**Correr `pnpm dev` reescribe `apps/web/next-env.d.ts`** (apunta a
`.next/dev/types/` en vez de `.next/types/`). Es autogenerado y vuelve solo con
`next build`; no lo commitees como cambio propio.

---

## Estilo

Los comentarios explican **por qué**, no qué. El estándar de la casa es contar
el problema real que motivó el código, en español, con frases completas. Así:

```ts
// `brand`: qué marca se compró ESTA vez. Va en la compra y no en el
// producto porque para la despensa «queso parmesano» es un solo artículo —
// lo que cambia entre compras es la marca y su precio.
```

No pongas comentarios que repitan el nombre de la función. Si un comentario no
aporta una razón, sobra.

### El sistema de diseño está inventariado

**`apps/web/DESIGN.md`** tiene la paleta con tokens y hex, el mapeo claro/oscuro
variable por variable, la retícula de 8px con su escala, 137 componentes
clasificados, la escala de z-index, los patrones de Framer Motion, y recetas para
construir tarjetas, botones, formularios y layouts **siguiendo el diseño que ya
existe**. Léelo antes de escribir UI nueva, para no inventar un estilo paralelo.

Datos duros que conviene tener a mano:

| | |
|---|---|
| Acento | `#1a6ae8` claro · `#5492fb` oscuro |
| Texto sobre el acento | `#ffffff` claro · `#071022` oscuro |
| Retícula | 8px — 8, 16, 24, 32, 40, 48, 56, 64 |
| Modo oscuro | `@custom-variant dark (&:where(.dark, .dark *))`, clase en `html` |
| Iconos | Heroicons |

Ese archivo lo generó `skillui` y es una foto, no un espejo: los tokens y los hex
salen del CSS y son fiables, la interpretación de roles es inferida y falla (ya
se corrigió a mano el acento, que decía `#ffffff`). Ante la duda, manda
`globals.css`.

Otras convenciones observadas:

- TypeScript estricto, sin `any`. Hay helpers (`asNumber`, `asInteger`,
  `asText`, `asIsoString` en `lib/api.ts`) para normalizar lo que vuelve de SQL:
  Postgres devuelve los `DECIMAL` como string.
- SQL siempre con plantillas etiquetadas de Neon (`sql\`...\``), que parametriza
  sola. Nunca concatenes valores en la consulta.
- En las rutas de API, errores con los helpers de `lib/route-helpers.ts`.
  422 para validación, 400 para JSON inválido, 401 sin sesión.
- `id` con `randomUUID()` de `node:crypto` en el lado de la app, no en la base.
- Los tipos compartidos entre web y api van en `@foody/types`, no duplicados.
- Cada carga de datos que pueda fallar sin romper la página va con `.catch()` y
  un valor vacío por defecto (ver `debts/page.tsx`).

---

## Cosas que no hay que hacer

- No escribas migraciones de TypeORM ni toques `apps/api` esperando cambiar el
  comportamiento de producción.
- No metas `SELECT *` sobre `products` en código que corra en cada página.
- No filtres la lista de la compra por `household_id`.
- No asumas que `pnpm lint` en la web pasa eslint — es `tsc --noEmit`.
- No leas ni escribas `.env`, `.env.local`, `.env.vercel.local` ni `cookies.txt`.
  Están en `.gitignore` y llevan credenciales reales.
- No cambies el nombre de la cookie (`foody_session`) ni el issuer/audience del
  JWT sin migrar las sesiones activas.

---

## Variables de entorno

Confirmadas en el código de la web:

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Neon Postgres |
| `IRON_SESSION_PASSWORD` | sesión; 32+ caracteres, obligatoria en producción |
| `JWT_SECRET` | firma del JWT |
| `BLOB_READ_WRITE_TOKEN` | fotos de productos (lo inyecta Vercel al conectar el store) |
| `CRON_SECRET` | cabecera `authorization` de las rutas de cron |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_CONTACT` | web push (`lib/web-push.ts`) |
| `E2E_TEST_MODE` | relaja comprobaciones para los e2e |

`.env.example` está desactualizado: le faltan `BLOB_READ_WRITE_TOKEN` y
`CRON_SECRET`, y le sobran `AWS_*`, `REDIS_URL` y `SMTP_*`.

## Crons

En `apps/web/vercel.json`, no en NestJS. Protegidos por `CRON_SECRET`:

| Ruta | Horario |
|---|---|
| `/api/cron/payments-reminder` | `0 9 * * *` |
| `/api/cron/payments-daily` | `0 9 * * *` |
| `/api/cron/stock-alerts` | `0 8 * * *` |

---

## Decisiones tomadas

**El login sin verificación se queda así.** Se planteó conectar el OTP o meter un
proveedor externo; se descartó. Es una app personal y el dueño acepta el modelo:
el email es la identidad, sin más comprobación. No lo reabras.

Lo que sí sigue siendo cierto y conviene tener presente al escribir código nuevo:
la sesión identifica, pero no demuestra nada. No construyas encima de ella nada
que dependa de que el usuario sea quien dice ser — pagos reales, datos de
terceros, acciones irreversibles hacia fuera. Para lo que hay hoy (despensa,
gastos, deudas propias) el modelo da lo que tiene que dar.
