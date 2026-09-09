-- Fase 8: catalog management. Adds safe per-user catalog title removal.
--
-- Yesterday, `titles_delete_authenticated` (using true) meant any
-- authenticated user could DELETE any share title; because user_title_state
-- and reviews reference titles with ON DELETE CASCADE, that would silently
-- destroy both their partner's rows and other households' rows. This
-- migration:
--
--   1. Closes the dangerous path: drops the permissive delete policy and
--      revokes DELETE on titles for authenticated.
--   2. Adds a security-definer RPC `remove_title_from_catalog(p_title_id)`
--      that removes ONLY the caller's own state/review rows and deletes the
--      shared title only when it becomes fully orphaned (no other
--      user_title_state or reviews reference it). Returns true when the
--      title itself was removed.false when the title stays in the shared
--      catalog because the partner still has state/review on it.

-- ============================================================
-- 1. Close the permissive titles delete path
-- ============================================================
drop policy if exists "titles_delete_authenticated" on public.titles;
revoke delete on table public.titles from authenticated;

-- ============================================================
-- 2. remove_title_from_catalog: safe, household-scoped removal
-- ============================================================
create or replace function public.remove_title_from_catalog(p_title_id uuid)
returns boolean
language plpgsql
security definer set search_path = ''
as $$
declare
  caller_id uuid;
begin
  caller_id := auth.uid();

  if caller_id is null then
    raise exception 'Not authenticated';
  end if;

  -- The caller may only remove a title they have a state row for. This
  -- guarantees nobody touches rows that belong to a different household
  -- (a caller has no state row for titles other members use).
  if not exists (
    select 1
    from public.user_title_state
    where title_id = p_title_id and user_id = caller_id
  ) then
    raise exception 'The title is not in your catalog.'
      using errcode = 'check_violation';
  end if;

  -- Remove ONLY the caller's own rows (state + review). The partner's rows
  -- are untouched: their state and review keep the title in the shared
  -- catalog, which is exactly the shared-catalog contract.
  delete from public.user_title_state
  where title_id = p_title_id and user_id = caller_id;

  delete from public.reviews
  where title_id = p_title_id and user_id = caller_id;

  -- Finally, delete the shared title only when nothing references it
  -- anymore. Depending on whether the household still holds it, return
  -- true (fully removed) or false (stays for the partner).
  delete from public.titles t
  where t.id = p_title_id
    and not exists (
      select 1 from public.user_title_state s where s.title_id = t.id
    )
    and not exists (
      select 1 from public.reviews r where r.title_id = t.id
    );

  return found;
end;
$$;

grant execute on function public.remove_title_from_catalog(uuid) to authenticated;

comment on function public.remove_title_from_catalog(uuid) is
  'Removes the caller''s own user_title_state and reviews for a title and deletes the shared title row only when it becomes orphaned. Returns true when the title itself was deleted, false when the household still holds it.';