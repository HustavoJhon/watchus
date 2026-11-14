-- Fase 9 (fix): integridad del orden de la watchlist compartida.
--
-- Diagnóstico (reproducido sobre la base local):
--
--   El cliente y el servidor definían "el conjunto pendiente" de forma distinta:
--     * cliente  -> user_title_state.watch_status = 'watchlist' de cualquier
--                   miembro del hogar (src/lib/watchlist.ts);
--     * servidor -> filas de household_watchlist_order JOIN a un estado
--                   pendiente.
--
--   ensure_watchlist_order_entry() solo creaba la fila cuando el usuario ya
--   tenía hogar (`if caller_household is not null`). Los pendientes añadidos
--   antes de crear/unirse a un hogar quedaban SIN fila de orden y nada la
--   rellenaba después. En cuanto eso pasaba, la RPC comparaba el tamaño de la
--   lista con el conteo de pendientes CON fila, no coincidía, y abortaba el
--   reordenamiento para TODOS los miembros del hogar:
--
--     ERROR:  Cannot reorder titles that are not pending in your watchlist.
--
--   Y como el cliente no mostraba el error, el update optimista se revertía en
--   silencio: "el orden no funciona".
--
-- Esta migración deja la tabla de orden como fuente única de verdad:
--
--   1. private.renumber_watchlist_order() reescribe 1..N de forma atómica y sin
--      colisiones. Estaciona cada fila por encima del máximo actual (parking
--      auto-escalado, en vez del offset fijo +1000000 de D-20: el rango 1..N
--      queda libre durante la reescritura, así que UNIQUE (household_id,
--      position) no puede violarse sea cual sea el plan que elija el planner, y
--      el CHECK (position > 0) se sigue cumpliendo). El upsert posterior
--      escribe 1..N y además inserta las filas que faltaran, de modo que la
--      lista recibida siempre gana.
--
--   2. public.sync_watchlist_order_entry() mantiene la tabla EXACTAMENTE igual
--      al conjunto pendiente del hogar: inserta al entrar en pendientes, borra y
--      compacta al salir. Se acabaron las filas "kept" de D-19 y, con ellas, los
--      huecos de numeración (#1, #3).
--
--   3. public.sync_watchlist_order_on_household_change() (trigger sobre
--      profiles.household_id) añade las filas que faltaban al entrar en un hogar
--      y limpia las propias al salir. Cierra el hueco entre "tengo pendientes" y
--      "tengo hogar", que era el origen del bug.
--
--   4. reorder_household_watchlist() toma el lock PRIMERO y valida bajo el lock
--      contra user_title_state, así que dos reordenamientos simultáneos se
--      serializan en lugar de pisarse.
--
-- Cambio de contrato (documentado como D-23): un título que sale de la lista
-- pendiente pierde su puesto y se re-pendienta al final. Antes conservaba la fila
-- detrás del bloque pendiente; ese diseño obligaba a compactar en cada
-- reordenamiento y era la fuente de la numeración con huecos.

-- ============================================================
-- 1. Renumeración atómica de la cola del hogar
-- ============================================================
-- Deja household_watchlist_order con exactamente p_title_ids en 1..N, en ese
-- orden, para el hogar indicado. Llama con el advisory lock del hogar tomado.
create or replace function private.renumber_watchlist_order(
  p_household_id uuid,
  p_title_ids   uuid[]
)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  parked_from integer;
  n integer;
begin
  n := coalesce(array_length(p_title_ids, 1), 0);

  -- Estacionar todas las filas por encima del máximo actual. Como las posiciones
  -- son enteros positivos distintos, la i-ésima siempre es >= i, así que
  -- max + 1 supera cualquier posición destino 1..N que vayamos a escribir.
  select coalesce(max(position), 0) + 1 into parked_from
  from public.household_watchlist_order
  where household_id = p_household_id;

  update public.household_watchlist_order
  set position = position + parked_from
  where household_id = p_household_id;

  -- Escribir 1..N en el orden pedido. El upsert cubre a la vez las filas que ya
  -- existían y las que faltaban (títulos pendientes sin fila de orden).
  insert into public.household_watchlist_order (household_id, title_id, position)
  select p_household_id, v.id, v.ordinality
  from unnest(p_title_ids) with ordinality as v (id, ordinality)
  on conflict (household_id, title_id) do update
    set position = excluded.position;

  -- Cualquier fila no incluida en la lista (no puede quedar ninguna tras la
  -- validación) se elimina para no dejar posiciones sueltas.
  delete from public.household_watchlist_order
  where household_id = p_household_id and position > n;
end;
$$;

revoke execute on function private.renumber_watchlist_order(uuid, uuid[])
  from public;

comment on function private.renumber_watchlist_order(uuid, uuid[]) is
  'Rewrites the household watchlist order to exactly p_title_ids at 1..N, atomically and collision-free. Caller must hold the household advisory lock.';

-- ============================================================
-- 2. La tabla de orden refleja EXACTAMENTE el conjunto pendiente
-- ============================================================
-- Entra en pendientes -> fila al final de la cola.
-- Sale de pendientes  -> se borra la fila y se compacta el resto a 1..N, salvo
--                        que otro miembro del hogar lo siga teniendo pendiente.
create or replace function public.sync_watchlist_order_entry()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  target_user uuid;
  target_title uuid;
  target_household uuid;
  is_pending boolean;
  in_order boolean;
begin
  if tg_op = 'DELETE' then
    target_user := old.user_id;
    target_title := old.title_id;
    is_pending := false;
  else
    target_user := new.user_id;
    target_title := new.title_id;
    is_pending := new.watch_status = 'watchlist';
  end if;

  select p.household_id into target_household
  from public.profiles p
  where p.id = target_user;

  if target_household is not null then
    perform pg_advisory_xact_lock(
      hashtext('watchus_watchlist:' || target_household::text)
    );

    select true into in_order
    from public.household_watchlist_order w
    where w.household_id = target_household and w.title_id = target_title;

    if is_pending then
      if not coalesce(in_order, false) then
        insert into public.household_watchlist_order (household_id, title_id, position)
        values (
          target_household,
          target_title,
          (
            select coalesce(max(w.position), 0) + 1
            from public.household_watchlist_order w
            where w.household_id = target_household
          )
        )
        on conflict (household_id, title_id) do nothing;
      end if;
    elsif coalesce(in_order, false) and not exists (
      select 1
      from public.user_title_state s
      join public.profiles p on p.id = s.user_id
      where s.title_id = target_title
        and s.watch_status = 'watchlist'
        and p.household_id = target_household
    ) then
      delete from public.household_watchlist_order
      where household_id = target_household and title_id = target_title;

      perform private.renumber_watchlist_order(
        target_household,
        (
          select coalesce(array_agg(w.title_id order by w.position), '{}'::uuid[])
          from public.household_watchlist_order w
          where w.household_id = target_household
        )
      );
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger user_title_state_sync_watchlist_order
  after insert or update of watch_status or delete on public.user_title_state
  for each row execute procedure public.sync_watchlist_order_entry();

comment on function public.sync_watchlist_order_entry() is
  'Keeps household_watchlist_order exactly equal to the household shared pending set: append on enter, remove and compact on leave.';

-- ============================================================
-- 3. Entrar o salir de un hogar: rellenar y limpiar la cola
-- ============================================================
-- Sin esto, los pendientes que alguien ya tenía antes de tener hogar se quedaban
-- sin fila de orden para siempre, y la RPC rechazaba cualquier reordenamiento del
-- hogar. Al salir se borran sus filas propias salvo que otro miembro lo siga
-- teniendo pendiente.
create or replace function public.sync_watchlist_order_on_household_change()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if new.household_id is not distinct from old.household_id then
    return new;
  end if;

  -- Hogar que se deja.
  if old.household_id is not null then
    perform pg_advisory_xact_lock(
      hashtext('watchus_watchlist:' || old.household_id::text)
    );

    delete from public.household_watchlist_order w
    where w.household_id = old.household_id
      and not exists (
        select 1
        from public.user_title_state s
        join public.profiles p on p.id = s.user_id
        where s.title_id = w.title_id
          and s.watch_status = 'watchlist'
          and p.household_id = old.household_id
      );

    perform private.renumber_watchlist_order(
      old.household_id,
      (
        select coalesce(array_agg(w2.title_id order by w2.position), '{}'::uuid[])
        from public.household_watchlist_order w2
        where w2.household_id = old.household_id
      )
    );
  end if;

  -- Hogar al que se entra: los pendientes que faltaban se añaden al final.
  if new.household_id is not null then
    perform pg_advisory_xact_lock(
      hashtext('watchus_watchlist:' || new.household_id::text)
    );

    insert into public.household_watchlist_order (household_id, title_id, position)
    select new.household_id, pending.title_id, pending.next_position
    from (
      select
        s.title_id,
        coalesce(
          (
            select max(w.position)
            from public.household_watchlist_order w
            where w.household_id = new.household_id
          ),
          0
        )
        + row_number() over (order by t.created_at desc, s.title_id) as next_position
      from public.user_title_state s
      join public.titles t on t.id = s.title_id
      where s.user_id = new.id and s.watch_status = 'watchlist'
    ) pending
    on conflict (household_id, title_id) do nothing;
  end if;

  return new;
end;
$$;

create trigger profiles_sync_watchlist_order
  after update of household_id on public.profiles
  for each row execute procedure public.sync_watchlist_order_on_household_change();

comment on function public.sync_watchlist_order_on_household_change() is
  'Appends the member pending titles to the household queue when they join and drops their own rows when they leave, keeping the queue gap-free.';

-- ============================================================
-- 4. reorder_household_watchlist: lock primero, validar bajo el lock
-- ============================================================
-- El llamante pasa la lista ordenada completa de la cola pendiente compartida.
-- La validación se hace contra user_title_state (la verdad de "¿está
-- pendiente?"), no contra la tabla de orden, así que una fila que faltara ya no
-- invalida el reordenamiento entero.
create or replace function public.reorder_household_watchlist(p_ordered_title_ids uuid[])
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  caller_id uuid;
  caller_household uuid;
  pending_count integer;
  n integer;
begin
  caller_id := auth.uid();
  if caller_id is null then
    raise exception 'Not authenticated';
  end if;

  select household_id into caller_household
  from public.profiles
  where id = caller_id;
  if caller_household is null then
    raise exception 'You do not belong to a household.'
      using errcode = 'no_data_found';
  end if;

  n := coalesce(array_length(p_ordered_title_ids, 1), 0);

  -- Serializar ANTES de validar: dos miembros reordenando a la vez se turnan en
  -- lugar de pisarse, y la validación no puede quedar obsoleta.
  perform pg_advisory_xact_lock(
    hashtext('watchus_watchlist:' || caller_household::text)
  );

  if exists (
    select 1 from unnest(p_ordered_title_ids) t (id)
    group by t.id having count(*) > 1
  ) then
    raise exception 'The reordered list contains duplicate titles.'
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1
    from unnest(p_ordered_title_ids) t (id)
    where not exists (
      select 1
      from public.user_title_state s
      join public.profiles p on p.id = s.user_id
      where s.title_id = t.id
        and s.watch_status = 'watchlist'
        and p.household_id = caller_household
    )
  ) then
    raise exception 'Cannot reorder titles that are not pending in your watchlist.'
      using errcode = 'check_violation';
  end if;

  select count(distinct s.title_id) into pending_count
  from public.user_title_state s
  join public.profiles p on p.id = s.user_id
  where s.watch_status = 'watchlist'
    and p.household_id = caller_household;

  if n <> pending_count then
    raise exception 'The reorder must include the whole pending watchlist.'
      using errcode = 'check_violation';
  end if;

  perform private.renumber_watchlist_order(caller_household, p_ordered_title_ids);
end;
$$;

comment on function public.reorder_household_watchlist(uuid[]) is
  'Serializes on the household advisory lock, validates the list against the current shared pending set, then rewrites positions 1..N atomically.';

-- ============================================================
-- 5. Saneado de datos existentes
-- ============================================================
-- 5.1 Filas que ya no corresponden a un pendiente del hogar (restos del contrato
--     "kept row" de D-19).
delete from public.household_watchlist_order w
where not exists (
  select 1
  from public.user_title_state s
  join public.profiles p on p.id = s.user_id
  where s.title_id = w.title_id
    and s.watch_status = 'watchlist'
    and p.household_id = w.household_id
);

-- 5.2 Pendientes del hogar a los que nunca se les creó fila (el bug real).
insert into public.household_watchlist_order (household_id, title_id, position)
select pending.household_id, pending.title_id, pending.next_position
from (
  select
    p.household_id,
    s.title_id,
    coalesce(
      (
        select max(w.position)
        from public.household_watchlist_order w
        where w.household_id = p.household_id
      ),
      0
    )
    + row_number() over (
        partition by p.household_id
        order by t.created_at desc, s.title_id
      ) as next_position
  from public.user_title_state s
  join public.profiles p on p.id = s.user_id
  join public.titles t on t.id = s.title_id
  where s.watch_status = 'watchlist' and p.household_id is not null
) pending
on conflict (household_id, title_id) do nothing;

-- 5.3 Compactar cada hogar a 1..N, sin huecos ni repeticiones.
do $$
declare
  rec record;
begin
  for rec in select distinct household_id from public.household_watchlist_order loop
    perform private.renumber_watchlist_order(
      rec.household_id,
      (
        select coalesce(array_agg(w.title_id order by w.position), '{}'::uuid[])
        from public.household_watchlist_order w
        where w.household_id = rec.household_id
      )
    );
  end loop;
end;
$$;