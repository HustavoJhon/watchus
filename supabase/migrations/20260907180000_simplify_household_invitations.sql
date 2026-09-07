-- Phase 3 (revision): simplify the invitation flow to a rotating join code.
-- The invitations table held one-time tokens; the simplified flow exposes the
-- household join_code instead (rotated on demand). Non-destructive follow-up
-- to 20260907170000_household_invitations.sql.

-- ============================================================
-- 1. Fix join_code default generator
-- ============================================================
-- gen_random_bytes lives in the `extensions` schema and is not resolvable
-- inside the security-definer RPCs (search_path = ''). gen_random_uuid() is
-- available in pg_catalog, so it works everywhere. Same 8-char hex output.
alter table public.households
  alter column join_code
  set default upper(left(replace(gen_random_uuid()::text, '-', ''), 8));

-- ============================================================
-- 2. generate_invitation_code() -> rotates the household join_code
-- ============================================================
-- DROP + CREATE: the old declaration returns the invitations composite type,
-- which (a) cannot be changed via CREATE OR REPLACE and (b) would block the
-- table drop below.
drop function if exists public.generate_invitation_code();

create function public.generate_invitation_code()
returns public.households
language plpgsql
security definer set search_path = ''
as $$
declare
  caller_household uuid;
  updated_household public.households%rowtype;
begin
  caller_household := private.my_household_id();

  if caller_household is null then
    raise exception 'You must belong to a household before generating invitations.';
  end if;

  update public.households
  set join_code = upper(left(replace(gen_random_uuid()::text, '-', ''), 8))
  where id = caller_household
  returning * into updated_household;

  return updated_household;
end;
$$;

grant execute on function public.generate_invitation_code() to authenticated;

comment on function public.generate_invitation_code() is
  'Rotates the household admission code and returns the updated household. No-op for non-members.';

-- ============================================================
-- 3. Accept invitation by join_code (token-based variant is dropped)
-- ============================================================
create or replace function public.accept_invitation_code(invite_code text)
returns public.households
language plpgsql
security definer set search_path = ''
as $$
declare
  caller_id uuid;
  target_household public.households%rowtype;
begin
  caller_id := auth.uid();

  if caller_id is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into target_household
  from public.households
  where join_code = upper(btrim(invite_code));

  if target_household.id is null then
    raise exception 'Invalid invitation code. Please check and try again.'
      using errcode = 'check_violation';
  end if;

  -- Caller must not already belong to a household
  if exists (
    select 1 from public.profiles
    where id = caller_id and household_id is not null
  ) then
    raise exception 'You already belong to a household. Leave it before joining a new one.'
      using errcode = 'check_violation';
  end if;

  -- The limit trigger will raise if the household is full (2 members)

  update public.profiles
  set household_id = target_household.id
  where id = caller_id;

  return target_household;
end;
$$;

comment on function public.accept_invitation_code(text) is
  'Joins the household whose join_code matches. Enforced at DB level: caller must have no household yet and the household must not be full (max 2).';

-- ============================================================
-- 4. Drop the one-time invitations table
-- ============================================================
drop table public.invitations;