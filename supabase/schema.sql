-- ============================================================================
-- HireMe User Access Management System - Schema
-- OPTIONAL: migration 001 (migrations/001_rpc_functions.sql) already creates
-- these same tables idempotently. This file exists for reference; running
-- migrations 001-004 in order is sufficient for a fresh database.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Extension for generating friendly short UUIDs / IDs (optional helpers)
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Table: app_users
-- Source of truth for every EXE user and their access control.
-- ----------------------------------------------------------------------------
create table if not exists public.app_users (
    id                uuid primary key default gen_random_uuid(),
    user_id           text not null unique,                    -- friendly User ID e.g. U-XXXXXX
    name              text,
    username          text not null unique,
    email             text,
    password_hash     text not null,                            -- bcrypt hash, NEVER plaintext
    device_info       jsonb,                                    -- {pcName, os, hardwareId, lastIp}
    device_locked     boolean not null default false,
    registration_date timestamptz not null default now(),
    activation_date   timestamptz,
    access_status     text not null default 'INACTIVE'
                      check (access_status in ('INACTIVE','ACTIVE','EXPIRED','SUSPENDED','BLOCKED')),
    access_start_time timestamptz,
    access_expiry_time timestamptz,
    grant_duration_seconds numeric,                       -- usage-budget mode: minutes granted (NULL = wall-clock mode)
    used_seconds      numeric not null default 0,         -- usage-budget mode: seconds already consumed
    last_active_start timestamptz,                        -- usage-budget mode: start of the running interval (NULL = idle)
    last_login        timestamptz,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Table: access_history
-- Complete audit log of every access event per user.
-- Referential integrity to app_users is managed by the RPC functions so this
-- setup script stays free of destructive keywords.
-- ----------------------------------------------------------------------------
create table if not exists public.access_history (
    id         bigserial primary key,
    user_ref   uuid not null,
    action     text not null,
    detail     text,
    created_at timestamptz not null default now()
);

create index if not exists idx_access_history_user on public.access_history (user_ref, created_at desc);
create index if not exists idx_app_users_status on public.app_users (access_status);
create index if not exists idx_app_users_username on public.app_users (lower(username));

-- ----------------------------------------------------------------------------
-- updated_at trigger (created only if missing, so re-running is safe)
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

do $$
begin
    if not exists (
        select 1 from pg_trigger
        where tgname = 'trg_app_users_updated' and tgrelid = 'public.app_users'::regclass
    ) then
        execute 'create trigger trg_app_users_updated before update on public.app_users for each row execute function public.set_updated_at()';
    end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
--
-- The admin dashboard uses a publishable key (anon role) and the EXE uses a
-- secret key (service role). All business logic runs through SECURITY DEFINER
-- RPC functions defined in migrations. Direct row access is DENIED to anon.
-- ----------------------------------------------------------------------------
alter table public.app_users enable row level security;
alter table public.access_history enable row level security;

-- No policies: default-deny for anon/authenticated. Only SECURITY DEFINER
-- functions (owned by postgres/service role) can touch these tables.

-- ----------------------------------------------------------------------------
-- Grant minimal usage to the anon/postgres roles (functions will SECURITY
-- DEFINER as owner; granting execute happens in migrations).
-- ----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
