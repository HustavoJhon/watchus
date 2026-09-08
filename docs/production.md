# Producción — WatchUs (Vercel + Supabase Cloud)

Estado: **desplegado y validado** (Fase 7, 2026-09-08). Referencia operativa
del entorno de producción real.

## 1. Variables de entorno

Solo existen tres variables, todas de cliente. En producción están definidas
en Vercel → Project → Settings → Environment Variables (targets production,
preview y development):

| Variable                 | Dónde                                              | Valor en prod (ref)        |
| ------------------------ | -------------------------------------------------- | -------------------------- |
| `VITE_SUPABASE_URL`      | Supabase → Settings → API                          | `https://qgrjvafeqlrimttyekxq.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Settings → API (publishable `anon` key) | key `anon` del proyecto    |
| `VITE_TMDB_API_KEY`      | TMDB → Settings → API (v3 read-only)               | key `bbbcd87…`             |

Reglas de hierro:

- **Nunca** `SUPABASE_SERVICE_ROLE_KEY` (ni equivalente) en el frontend.
- `.env.example` se versiona con valores vacíos; `.env.local` (lo mismo que
  `.env`, `.env.production`, etc.) está en `.gitignore`. Nunca valores reales
  en Git.
- La key de TMDB es una **v3 read-only** pensada para clientes (se envía como
  query param). No hace falta backend para ocultarla.

Para `vite preview` local con valores de prod, crear un `.env.production.local`
(ignorado) con los tres valores.

## 2. Supabase Cloud

Proyecto real: org `itsqmorajxzinebaiptl`, project **`watchus`**, ref
`qgrjvafeqlrimttyekxq` (región Oeste-US, plan free). El CLI local está
enlazado (`supabase link`) con ese proyecto.

1. Conectar el CLI local al proyecto sin reescribir lo remoto:

   ```sh
   ~/.local/bin/supabase link --project-ref qgrjvafeqlrimttyekxq
   ```

2. Aplicar las migraciones (ordena y ejecuta `supabase/migrations/*` en
   orden; no borra nada remoto):

   ```sh
   ~/.local/bin/supabase db push
   ```

   Nota: en el esquema los defaults de `join_code` e `invitations.token`
   usan `extensions.gen_random_bytes(...)` **cualificado** — en Cloud la
   función de `pgcrypto` vive en el schema `extensions`, fuera del
   `search_path` de la sesión de migración (commit `b7a45eb`).

3. Regenerar los tipos locales si el esquema produjo cambios:

   ```sh
   ~/.local/bin/supabase gen types typescript --project-id qgrjvafeqlrimttyekxq \
     --schema public > src/types/database.ts
   ```

### Config de Auth (aplicada en el panel/proyecto)

- **Site URL**: `https://watchus-orcin.vercel.app`.
- **Redirect URLs** (`uri_allow_list`): mínimo
  `https://watchus-orcin.vercel.app/reset-password?recovery=true` (el flujo
  de recuperación navega a `/reset-password?recovery=true`).
- **Email**: confirmación de email **habilitada** en Cloud (en local está
  desactivada para el dev loop). El registro ya contempla ambos casos
  (sesión inmediata vs. "revisa tu correo").
- **Rate limits**: los valores de `supabase/config.toml` son para local; en
  Cloud se controlan desde el panel.

## 3. Vercel

Proyecto real: **`watchus`** bajo la cuenta `hustavojhon`, conectado al repo
GitHub `HustavoJhon/watchus` (rama `main`). URL de producción:
`https://watchus-orcin.vercel.app` (deploy automático al hacer push).

No hace falta configuración de build: Vite construye a `dist` (valor
predeterminado de Vercel para `vite build`).

- Framework preset: **Vite** (o Build Command `pnpm build`, Output `dist`).
- El archivo `vercel.json` solo contiene la **rewrite SPA** necesaria para que
  navegación directa a rutas del router (p.ej. `/app/catalog` o
  `/reset-password?recovery=true`) sirva `index.html` en vez de 404. No hay
  más configuración.
- Las tres variables de entorno están definidas en Vercel (production,
  preview y development). Desplegar desde el repo (rama principal) o con
  `npx vercel --prod` desde local.

## 4. Checklist de puesta en producción

Estado en Fase 7: **completado y validado en prod** (2026-09-08).

1. Base de datos: `supabase db push` contra el proyecto Cloud — aplicadas las
   4 migraciones.
2. Auth: `site_url` y `uri_allow_list` con la URL final; confirmación de email
   ON.
3. Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
   `VITE_TMDB_API_KEY` en Vercel.
4. Tipos: `supabase gen types typescript` tras la migración.
5. Vercel: proyecto conectado a Git, preset Vite, deploy automático.
6. Smoke (realizado en el deploy de Fase 7): registro/creación de usuario
   (confirmado vía Admin API), login → dashboard, crear hogar + unirse +
   rotar código, aislamiento RLS entre hogares (2 usuarios por hogar, límite
   activo), catálogo TMDB (búsqueda y get-or-create), estados y reviews
   (compartidos dentro del hogar, ocultos fuera), recovery 200.

## 5. Decisiones evaluadas y diferidas

### PWA — evaluada, no implementada

Una PWA daría "instalar y abrir en móvil" y una caché offline del shell, pero:

- La app necesita red para casi todo (TMDB, Supabase) y usa Auth con refresh
  tokens; el valor offline real es casi nulo.
- Añade: service worker (estrategia de caché), manifest, manejo de
  actualizaciones y más superficie de bugs por poco beneficio para una app de
  dos usuarios.
- **Decisión**: diferir. Una "app" móvil real con este stack sería una SPA
  responsive en el navegador (ya lo es), o una app nativa futura que reúse la
  base de datos, no el frontend.

### Tests E2E — evaluados, no añadidos

No hay infraestructura E2E previa. Playwright aportaría regeneración de acceso
(login→hogar→catálogo) pero:

- La cobertura crítica ya está cubierta por la suite RLS SQL (aislamiento,
  permisos, constraints) y los tests unitarios (catalog, stats, watch, tmdb).
- Levantar Playwright (browsers + proyecto + CI) es una infraestructura que
  esta fase pidió explícitamente no inflar.
- **Decisión**: no añadir ahora; el smoke se hace a mano antes de cada
  despliegue. Si aparecen regresiones de flujo recurrentes, se reintroduce con
  "smoke tests críticos" únicamente (login→app, búsqueda→resultado,
  añadir→catálogo, cambio de estado→actualizado).

## 6. Notas de seguridad re-verificadas

- No existe `service_role` ni credencial equivalente en el frontend (`rg` en
  `src/` y `.env.*` no devuelve nada).
- `search_path = ''` en todos los objetos `security definer`.
- Las políticas `profiles|user_title_state|reviews_*_self` impiden escribir
  filas ajenas; la lectura se limita al propio hogar vía
  `private.my_watch_partners()`.
- Las páginas y rutas son privadas (layout `_authenticated` con `beforeLoad`);
  no se necesitan robots ni metadatos SEO (no indexar).
