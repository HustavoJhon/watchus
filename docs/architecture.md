# Arquitectura

## Stack

| Capa             | Tecnología                  | Rol                                |
| ---------------- | --------------------------- | ---------------------------------- |
| Frontend         | React + TypeScript + Vite   | SPA                                |
| Routing          | TanStack Router             | Navegación y protección de rutas   |
| Datos cliente    | TanStack Query              | Caché, estados loading/error/empty |
| UI               | Tailwind CSS v4 + shadcn/ui | Diseño y componentes               |
| Backend (BaaS)   | Supabase                    | PostgreSQL + Auth + RLS            |
| Catálogo externo | TMDB API                    | Información de películas y series  |
| Deploy           | Vercel                      | Frontend                           |

## Principios

- **Simplicidad** — sin backend separado. Supabase como BaaS cubre datos, autenticación y seguridad.
- **Un título, una fila** — la colección es compartida; la calificación, el estado y los favoritos son relaciones usuario-título.
- **RLS como frontera de seguridad** — cada política se define en la base de datos, no en el cliente.
- **TMDB bajo demanda** — en la BD solo se guarda lo mínimo para la UI de WatchUs.

## Decisiones de arquitectura

### D-01: Sin backend separado

Supabase cubre Postgres, Auth y RLS. Un backend (Elysia/Bun) no aporta nada por ahora: no hay lógica que deba ocultarse al cliente más allá de la TMDB read key (que TMDB publica para uso en cliente). Si en el futuro apareciera una necesidad real (webhooks, cron, secretos reales), se evaluará.

### D-02: Un "hogar" (household) modela el grupo de dos

Aunque la app está pensada para dos personas, los nombres y la relación entre ambos no deben estar hardcodeados en componentes ni consultas. Una tabla `households` y `profiles.household_id` materializan "quiénes pertenecen a mi grupo", lo que permite derivar conceptos como "visto por ambos" o "¿qué vemos hoy?" consultando al otro usuario por datos, no por constante. Costo: dos tablas pequeñas.

### D-03: TMDB se consulta desde el frontend (v3)

Se usa la **API v3** de TMDB: la clave es un query param `api_key` pensado para clientes. Se expone únicamente vía `VITE_TMDB_API_KEY` (`.env.example`); nunca se escribe en la BD, en storage ni en logs. El idioma de las respuestas es `es-ES`. Ningún secreto de Supabase va al cliente: solo `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. Si `VITE_TMDB_API_KEY` está vacía, la UI muestra un `TmdbError` de tipo `missing-key` sin romper el resto de la app. Cada petición se aborta a los 8 s (`TMDB_TIMEOUT_MS`) para que una conexión colgada muestre un error comprensible en vez de un spinner infinito; los estados HTTP se mapean a mensajes en español (`unauthorized`, `not-found`, `rate-limited`, `server`).

### D-04: la colección de títulos es compartida a nivel de hogar

`titles` no lleva `household_id`: con un único hogar de facto, la colección pertenece a todos los autenticados. Las filas personales (`user_title_state`, `reviews`) sí se restringen por usuario. Tradeoff: si algún día hubiera varios hogares, habría que añadir `household_id` a `titles`. Se acepta para mantener las consultas simples.

### D-05: escritura protegida por RLS, lectura compartida dentro del hogar

Cada usuario escribe únicamente sus filas (`user_id = auth.uid()`), pero lee las de su hogar para poder ver la colección completa y "visto por ambos".

### D-06 (Fase 3): estado de sesión en un store de módulo, no en localStorage

La sesión la gestiona Supabase (`supabase.auth`) vía `onAuthStateChange`. El estado de autenticación vive en un store de módulo (`src/lib/auth`) con publicación-suscripción (`subscribeToAuth`) y se expone a React con `useSyncExternalStore` (`useAuth`). `ensureAuthLoaded()` resuelve la sesión inicial antes de pintar rutas protegidas. Nada de tokens en `localStorage` manual.

### D-07 (Fase 3): guardas de rutas con `beforeLoad`

- `/` redirige a `/app` si hay sesión y a `/login` si no.
- Los layouts `_public` y `_authenticated` son pathless: el primero redirige a `/` a usuarios autenticados; el segundo a `/login` si no hay sesión.
- `reset-password` **no** cuelga de `_public`: el flujo de recuperación crea una sesión y un guard `_public` lo desviaría en bucle.

### D-08 (Fase 3): la invitación es un `join_code` rotable

El hogar expone un código corto (`households.join_code`, 8 hex) y las transiciones se hacen por RPC `security definer` (`create_household`, `generate_invitation_code`, `accept_invitation_code`), no por INSERTS directos. La trazabilidad del "quién se puede unir" queda en el trigger `profiles_household_limit` (máximo 2), con `pg_advisory_xact_lock` para evitar carreras.

### D-09 (Fase 4): get-or-create race-safe en una sola llamada

`titles` es compartido: dos usuarios pueden añadir el mismo título a la vez. En vez del flujo cliente de dos pasos (select → insert), la migración `20260907190000_catalog.sql` expone la RPC `security definer get_or_create_title(...)` que hace `insert ... on conflict (tmdb_id, media_type) do nothing` seguido de un `select`, y devuelve la fila canónica. La unicidad la garantiza la constraint única en la BD, no la lógica del cliente. El catálogo la invoca y luego hace un `upsert` (`ignoreDuplicates`) sobre `user_title_state`.

### D-10 (Fase 4): la BD, no el cliente, es la autoridad de `watched_at`

El trigger `private.sync_title_watched_at()` (BEFORE INSERT OR UPDATE sobre `user_title_state`) llena `watched_at` al marcar `watched` y lo limpia al salir de ese estado. El CHECK `watched_at is null or watch_status = 'watched'` queda como respaldo. Así el cliente nunca puede dejar la fila inconsistente.

### D-11 (Fase 4): nombres de género resueltos desde listas cacheadas

TMDB no devuelve nombres en `/search/*`, solo `genre_ids`. La capa `src/lib/tmdb/` obtiene `/genre/movie/list` y `/genre/tv/list` una vez por sesión (promesa cacheada en módulo) y resuelve los ids a nombres en el mapper. El detalle on-demand sí trae `genres[]` con nombres (TMDB v3).

### D-12 (Fase 4): detalle siempre on-demand

La página `/app/title/$titleId` muestra la metadata mínima de `titles` y, si hay clave TMDB, carga en vivo cast, director, creadores, duración, trailer y fechas (`append_to_response=credits,videos`). Nada de eso se persiste; se mantiene el principio "en la BD solo lo mínimo para la UI de WatchUs".

### D-13 (Fase 5): estadísticas y "actividad" derivadas en cliente

Dashboard, estadísticas (`/app/stats`) y actividad reciente NO agregan nada en la BD. Parten de dos queries ya existentes y cacheadas (`useCatalog`, `useAllReviews`) y calculan en memoria con funciones puras (`src/lib/stats.ts`, `src/lib/format.ts`): totales, movie/tv, vistos por ambos, rating promedio por usuario, distribución de ratings y géneros más vistos. Las stats de cada miembro se leen de las columnas `own*` (quien ve) y `partner*` (el compañero): `computeStats` recibe `viewerId` y reparte los campos. Para un sistema de dos personas, una query bien diseñada + derivación en cliente pesa menos que RPCs de agregación; no hay tablas de estadísticas.

### D-14 (Fase 5): "¿Qué vemos hoy?" con candidatos deterministas y selección aleatoria

La selección es un sorteo (fácil "Elegir otra") sobre un conjunto determinista: 1) títulos que ambos tienen en pendientes, si los hay; 2) si no, títulos donde al menos uno lo tiene en pendientes; siempre excluyendo los vistos por ambos. La lógica pura (`src/lib/watch.ts`) es testeable con un RNG inyectado; el componente repite la tirada sin almacenar nada (ni tabla, ni `recommended_title_id`). Sin IA ni recomendaciones TMDB.

### D-15 (Fase 5): reviews con PK natural y RLS sin cambios

No hubo migración: la tabla `reviews` (PK `(user_id, title_id)`, `checks` de contenido no vacío) y sus políticas de Fase 1 ya cubrían el modelo aprobado (una review por usuario/título, editable, sin historial). El cliente solo usa upsert por PK y delete; la RLS impide crear/editar/eliminar reviews ajenas y aislar hogares (suite `06_phase5.sql`).

### D-16 (Fase 6): errores de render y rutas inválidas con fallback en español

La raíz del router define `errorComponent` (mensaje "Algo salió mal" + Reintentar, sin stack traces; el detalle técnico se loguea en consola) y `notFoundComponent` (pantalla 404 con enlace al inicio). Se eligió no mostrar texto técnico al usuario. Ver también `docs/production.md`, que documenta el checklist de despliegue y las evaluaciones diferidas de **PWA** (no aporta valor offline real con este stack: red necesaria para TMDB/Supabase y auth; se aplaza) y **tests E2E** (la suite RLS SQL + los tests unitarios cubren lo crítico; Playwright se reintroduciría solo con smoke tests si hay regresiones de flujo).

### D-17 (Fase 8): eliminación de títulos solo vía RPC, por usuario y con guarda de orfandad

Ver `docs/data-model.md` (tabla de políticas de `titles`). El DELETE directo sobre `titles` se cerró (se cayó la política permisiva y el `grant`); el borrado pasa por `remove_title_from_catalog`, que elimina solo el estado y la reseña del llamante y borra la fila compartida únicamente cuando queda huérfana. Esto preserva el contrato del catálogo compartido: quitar un título propio nunca afecta los datos de la pareja ni de otros hogares.

### D-18 (Fase 8): filtros de catálogo en search params compartibles + búsqueda local en memoria

Los filtros (tipo, estado, favoritos) viven en los search params de `/app/catalog` (tipados por `validateSearch`), así la URL es compartible, refrescable y el historial mantiene el estado al volver del detalle. El filtrado a aplicar es puro (`src/lib/catalog-filter.ts`) y corre en memoria sobre la query ya cacheada: sin llamadas TMDB extra. La búsqueda del lado del catálogo es local (por nombre). El orden predeterminado sigue siendo `created_at` descendente (recientes agregados); no se añadió control de ordenamiento para no complicar el listado, y la etiqueta de conteo usa concordancia de género derivada del tipo filtrado («3 películas pendientes»).

### D-19 (Fase 9): la cola del hogar vive en su propia tabla, no por usuario ni en `titles`

El ordenamiento de pendientes es una propiedad **compartida** (ambos miembros ven la misma cola), así que no puede ir en `user_title_state` (son filas por usuario) ni en `titles` (tabla global entre hogares). Nueva tabla `household_watchlist_order` con PK `(household_id, title_id)`, `UNIQUE (household_id, position)`, FK `ON DELETE CASCADE` desde `titles` (la eliminación de Fase 8 limpia la orden sola) y `CHECK (position > 0)`. El RLS filtra por `household_id = private.my_household_id()`. La **semántica de estados** la fija D-23 (solo pendientes). Único cambio de contrato con Fase 8: `remove_title_from_catalog` borra la fila de orden vía CASCADE, sin tocar nada de la pareja.

### D-20 (Fase 9): reordenamiento atómico vía RPC que reescribe solo el bloque pendiente

El drag & drop reordena un **subconjunto** visible (puede haber filtro de tipo), pero la cola real del hogar es otra cosa. La RPC `security definer reorder_household_watchlist(uuid[])` valida que el array pasado sea **exactamente** el conjunto pendiente actual del hogar (sin duplicados ni faltantes) y reescribe posiciones en una transacción con `pg_advisory_xact_lock` por hogar: `offset position + 1000000` a todas las filas, 1..N al bloque pendiente en el orden dado. El cliente pasa siempre la lista pendiente completa: en el drag visible sobre un filtro, `reorderWithSubset` (puro y testeado) reinserta el título movido en la posición del subconjunto y mantiene el resto relativo; el update optimista usa `applyPendingOrder` más `applyOptimisticPositions` para que los números `#N` de las tarjetas reflejen lo enviado. El fallback de accesibilidad/teclado son botones ↑/↓ (misma RPC, mismo camino), con `PointerSensor` de dnd-kit a 8 px para no disparar drags en toques accidentales.

El rechazo de la RPC significa que la vista del cliente estaba obsoleta (la pareja reordenó a la vez, o un título dejó de estar pendiente). El update optimista se revierte siempre y `describeReorderError` traduce el mensaje de Postgres a algo accionable en vez de dejar que el arrastre se deshaga en silencio.

### D-23 (Fase 9): las colas de orden contienen solo pendientes

Salir de pendientes **borra** la fila de orden y compacta las posiciones siguientes; volver a entra al final. Antes se conservaba la fila y un título que salía a «viendo» iba dejando un hueco detrás del bloque pendiente, lo que complicaba `max(position)+1` y hacía que la RPC tuviera que compactar filas "conservadas" que no eran pendientes.

Con la regla nueva, la tabla es una proyección exacta del conjunto pendiente y por eso la validación de la RPC es la misma para toda la cola: sin filas que preservar, `offset + renumerar` basta. Efecto secundario útil: `max(position)+1` sigue siendo correcto cuando los dos miembros añaden títulos a la vez, porque el renumerado ocurre dentro de la misma transacción con el lock tomado. El trigger también reacciona a los cambios de composición del hogar, así que la cola compartida se recalcula para ambos miembros a la vez.

### D-24 (Fase 9): dos colas de pendientes, ámbito por relación usuario-título

El modelo inicial solo tenía una cola: la del hogar. Faltaba la personal, que es el caso de uso más frecuente («quiero ver esto yo, luego lo propongo»). El ámbito vive en `user_title_state.watch_scope` (`watch_scope` enum, `'shared'` por defecto) y no en `titles`, porque es una decisión **de la relación** usuario-título: los dos miembros pueden tener el mismo título pendiente en colas distintas.

Consecuencias de diseño:

- **Dos tablas de orden, no una con columna discriminante.** `household_watchlist_order` (RLS por hogar, se ve entre los dos) y `personal_watchlist_order` (RLS `user_id = auth.uid()`, opaca incluso para la pareja). Una tabla única obligaría a que cada política contemplara las dos reglas de visibilidad, y el RPC compartido aceptaría writes sobre filas que ese usuario no puede leer.
- **Posiciones independientes.** Un título puede estar en las dos colas a la vez (la pareja lo marcó `shared`, yo `personal`), así que cada fila tiene su propia numeración 1..N y `CatalogItem` lleva `sharedPosition` y `personalPosition` por separado. Mover un título entre colas lo añade al final de la destino y compacta la de origen, todo en el trigger.
- **Un solo trigger para ambas.** `public.sync_watchlist_order_entry()` sustituye a los dos triggers anteriores de Fase 9 y mantiene las dos colas desde un solo sitio, disparándose también por cambios de `watch_scope`.
- **El cliente reordena una cola cada vez.** `useCatalogMutations` expone `reorderShared` y `reorderPersonal` sobre un mismo hook parametrizado por ámbito. Con las dos secciones visibles a la vez, cada una reordena la suya; el filtro `scope` en los search params (compartible, como el resto en D-18) deja ver una sola.
- **El filtro de estado cede al ámbito.** Con `scope` sin narrowing, «Pendientes» conserva su significado previo (lo que el viewer tiene pendiente en cola alguna). Con `scope=shared|personal` manda `isPendingInScope`, que es partner-aware en la cola del hogar: si no, filtrar por «Pendientes · Hogar» escondería justo los títulos que la pareja añadió.
- **Realtime respeta el RLS.** Las tres tablas están publicadas; `useCatalogRealtime` invalida la query del catálogo ante cualquier cambio, y Supabase solo entrega filas visibles para el llamante, así que la cola personal de la pareja nunca llega al navegador.

### D-21 (Fase 10): las tarjetas comparten un contracto de layout mínimo

`TitleCard`, la tarjeta de resultados de búsqueda y la sugerencia de "¿Qué vemos hoy?" son componentes distintos (datos distintos: `CatalogItem` vs `TitleCandidate` vs título suelto), pero comparten el mismo contrato visual para no descuadrarse: póster en proporción TMDB `aspect-[2/3]`, bloque de contenido con `min-w-0` + títulos en `line-clamp-1`, **footer anclado al fondo** (`flex flex-col` + `flex-1` en el bloque superior) y `RatingPicker compact` (estrellas `size-4`) dentro de los pies de tarjeta estrechos. En la watchlist, los controles de reorden (↑/↓/grip) van apilados en una columna de ≤32 px sobre el póster para no solaparse con los badges de la esquina superior izquierda en columnas móviles; el drag solo se activa desde el grip (`PointerSensor` a 8 px, botones/flechas con `onClick`). Se evitan alturas rígidas: la uniformidad sale de anchor el footer y de truncar, no de fijar `min-h`.

### D-22 (Fase 10): estadísticas con gráficos SVG propios y estado canónico por título

**Sin librería de gráficos nueva.** Las necesidades reales son dos tipos simples (dona de distribución y barras de actividad) que se resuelven con SVG inline en `src/components/stats-charts.tsx` (~2 kB añadidos al chunk de stats, verificar un build): cero dependencias, colores directamente de los tokens de tema (`var(--color-*)`), sin peso ni API a mantener. Cada gráfico lleva leyenda visible con conteos y %, `title` por segmento y una lista `sr-only` como alternativa textual; los vacíos se cubren con estados explícitos. **Estado canónico por título** (`householdStatusOf`) evita el doble conteo cuando ambos miembros tienen estados distintos (prevalece `watched` > `watching` > `watchlist`); los campos `own*`/`partner*` siguen alimentando las stats por usuario. La agregación sigue siendo pura en `src/lib/stats.ts` (testeada), sobre las queries ya cacheadas (`useCatalog`, `useAllReviews`), sin requests extra: coherente con D-13. La actividad por mes usa `watched_at` (autoridad del trigger de BD, D-10), ventana acotada a 24 meses para no inundar el eje.

### D-25 (Fase 11): notas por episodio, datos de TMDB bajo demanda y nueva tabla propia

Una serie se puntuaba como un todo, pero el uso real es puntuar capítulos. La nota por episodio va a una tabla nueva, `episode_ratings`, y no a una columna JSON en `user_title_state`: así cada fila conserva su propia RLS de escritura y el `upsert`/`delete` de un capítulo no reescribe la fila del título (ni dispara sus triggers). La llave es `(user_id, title_id, tmdb_episode_id)`, con `season_number`/`episode_number` denormalizados para pintar sin otra llamada.

Los episodios **no se persisten**: `fetchTitleDetails` trae las temporadas y `fetchSeasonEpisodes` pide solo la temporada abierta, cacheada 10 min por TanStack Query. Guardar todos los episodios de todas las series en la BD sería duplicar TMDB y añadir mantenimiento (cambios de numeración, especiales, series en emisión) sin mejorar la latencia de forma medible.

El cliente no se suscribe a `episode_ratings` por Realtime: el detalle se pide al abrir la serie y se invalida tras cada cambio propio; la nota de la pareja aparece en la siguiente carga (30 s de `staleTime`). Si se quisiera sincronía en vivo, basta publicar la tabla y suscribir el detalle, ya que sus filas no son privadas dentro del hogar.

## Flujo de datos

```
Browser ── Query (TanStack Query) ──> TMDB API (search, detail, images)
Browser ── Query ────────────────────> Supabase (titles, states, reviews)
Browser ── Supabase Auth (email) ────> auth.users + public.profiles
```

## Seguridad

- RLS activada en todas las tablas expuestas.
- Solo el rol `authenticated` recibe grants de las tablas de negocio; `anon` no accede a nada de negocio.
- `service_role` nunca se usa en el cliente.
- El perfil se crea en `auth.users` mediante trigger `security definer` (`set search_path = ''`).

Ver todo el detalle de políticas en [data-model.md](./data-model.md).
