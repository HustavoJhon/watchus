# Producción — WatchUs (Vercel + Supabase Cloud)

Documento de referencia para el primer despliegue. **Nada de esto se ha
ejecutado todavía** (la Fase 6 solo prepara y documenta).

## 1. Variables de entorno

Solo existen tres variables, todas de cliente:

| Variable                 | Dónde                                              | Valor ej.                  |
| ------------------------ | -------------------------------------------------- | -------------------------- |
| `VITE_SUPABASE_URL`      | Supabase → Settings → API                          | `https://xxxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Settings → API (publishable `anon` key) | `eyJhbGciOi…`              |
| `VITE_TMDB_API_KEY`      | TMDB → Settings → API                              | `a1b2…`                    |

Reglas de hierro:

- **Nunca** `SUPABASE_SERVICE_ROLE_KEY` (ni equivalente) en el frontend.
- `.env.example` se versiona con valores vacíos; `.env.local` (lo mismo que
  `.env`, `.env.production`, etc.) está en `.gitignore`. Nunca valores reales
  en Git.
- La key de TMDB es una **v3 read-only** pensada para clientes (se envía como
  query param). No hace falta backend para ocultarla.

Crear un `.env.production.local` (o definir las variables en Vercel → Project →
Settings → Environment Variables) con esos tres valores.

## 2. Supabase Cloud

1. Crear proyecto en https://supabase.com (free tier sirve).
2. Conectar el CLI local al proyecto sin reescribir lo remoto:

   ```sh
   ~/.local/bin/supabase link --project-ref <PROJECT_REF>
   # responde no a sobrescribir el archivo config.toml remoto
   ```

3. Aplicar las migraciones (ordena y ejecuta `supabase/migrations/*` en
   orden; no borra nada remoto):

   ```sh
   ~/.local/bin/supabase db push
   ```

4. Regenerar los tipos locales si el esquema produjo cambios:

   ```sh
   ~/.local/bin/supabase gen types typescript --project-id <PROJECT_REF> \
     --schema public > src/types/database.ts
   ```

### Config de Auth en el panel

- **Site URL**: la URL de Vercel (ej. `https://watchus.vercel.app`), con el
  subdominio exacto.
- **Redirect URLs**: añadir como mínimo
  `https://watchus.vercel.app/reset-password**` (el flujo de recuperación
  navega a `/reset-password?recovery=true`).
- **Email**: confirmación de email **habilitada** en Cloud (en local está
  desactivada para el dev loop). El registro ya contempla ambos casos
  (sesión inmediata vs. "revisa tu correo").
- **Rate limits**: los valores de `supabase/config.toml` son para local; en
  Cloud se controlan desde el panel.

## 3. Vercel

No hace falta configuración de build: Vite construye a `dist` (valor
predeterminado de Vercel para `vite build`).

- Framework preset: **Vite** (o Build Command `pnpm build`, Output `dist`).
- El archivo `vercel.json` solo contiene la **rewrite SPA** necesaria para que
  navegación directa a rutas del router (p.ej. `/app/catalog` o
  `/reset-password?recovery=true`) sirva `index.html` en vez de 404. No hay
  más configuración.
- Definir las tres variables de entorno anteriores y desplegar desde el repo
  (rama principal).

## 4. Checklist de puesta en producción

1. Base de datos: `supabase db push` contra el proyecto Cloud.
2. Auth: `site_url` y redirect con la URL final; confirmación de email ON.
3. Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
   `VITE_TMDB_API_KEY` en Vercel (y `.env.production.local` para `vite preview`).
4. Tipos: `supabase gen types typescript` tras la migración (paso 4 arriba).
5. Vercel: importar repo, preset Vite, redeploy.
6. Smoke manual: registro → crear hogar → invitación → búsqueda TMDB → añadir
   título → estados → review → logout → recovery.

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
