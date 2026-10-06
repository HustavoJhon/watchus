-- Fase 10 (cierre): el ámbito `personal` no puede ser legible por la pareja.
--
-- Hallazgo de la validación manual con dos cuentas reales del mismo hogar: la
-- política SELECT de `user_title_state` (creada en `20260907154700`, sin cambios
-- en la migración de ámbitos) permite a un miembro leer TODAS las filas del otro
-- miembro del hogar:
--
--   using (user_id = auth.uid() or user_id in (select private.my_watch_partners()))
--
-- Ese permiso es anterior a los ámbitos y era razonable:Servía para derivar
-- "visto por ambos" y las notas del hogar. Pero al meter `watch_scope` en esa
-- misma tabla, la lectura que la pareja ya tenía pasó a revelar el contenido de
-- la cola privada:
--
--   GET /rest/v1/user_title_state?select=title_id,watch_scope&user_id=eq.<pareja>
--
-- devolvía los N títulos pendientes de su lista "Solo para mí", y Realtime
-- (que aplica la misma comprobación de RLS) avisaba en el momento en que su
-- pareja añadía algo a su lista privada. La tabla `personal_watchlist_order`
-- seguía opaca, pero la pertenencia a la cola ya no lo estaba.
--
-- El arreglo solo endurece la lectura:
--
--   * Se siguen viendo las filas propias (igual que antes).
--   * La pareja sigue viendo los pendientes del hogar (`scope='shared'`), que
--     son la cola compartida por definición.
--   * La pareja sigue viendo los estados NO pendientes de la otra persona
--     (`watching`/`watched`, con el ámbito que sea). Esto es imprescindible
--     para no romper la derivación de "visto por ambos" / "visto por uno solo" y
--     las notas del hogar; y no filtra nada de la cola privada, porque solo hay
--     fila de orden mientras la fila está pendiente (invariante pending-only).
--   * La pareja deja de ver los pendientes con `scope='personal'`. Y como el
--     ámbito solo importa cuando la fila está pendiente, esa es exactamente la
--     información de la lista privada.
--
-- No cambia ninguna fila, ni el modelo de `watch_scope`, ni el cliente: solo
-- cierra el hueco de lectura que la migration de ámbitos dejó abierto.

drop policy if exists "user_title_state_select_self_or_household"
  on public.user_title_state;

create policy "user_title_state_select_self_or_household"
  on public.user_title_state
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      user_id in (select private.my_watch_partners())
      and (watch_status is distinct from 'watchlist' or watch_scope <> 'personal')
    )
  );

comment on policy "user_title_state_select_self_or_household" on public.user_title_state is
  'Own rows always; partner rows only when they are not pending in the personal scope, so the private queue stays private (Fase 10 close-out).';
