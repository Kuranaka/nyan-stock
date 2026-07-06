-- Auth-based sync uses an opaque household_id and a separate human-facing invite_code.
-- The original normalized sync migration constrained household_id to the invite-code
-- format, which blocks account households created with gen_random_uuid()::text.

alter table public.households
  drop constraint if exists households_household_id_check;

alter table public.households
  drop constraint if exists households_invite_code_format_check;

alter table public.households
  add constraint households_invite_code_format_check
  check (invite_code ~ '^NYAN-[A-Z2-9]{4}-[A-Z2-9]{4}$')
  not valid;
