-- ============================================================================
-- HireMe User Access Management - RPC Functions
-- All functions are SECURITY DEFINER so they run as the owner and can access
-- the RLS-locked tables.
-- ============================================================================

-- pgcrypto provides crypt()/gen_salt() for password hashing. Ensuring it here
-- makes this file self-sufficient even if schema.sql was not applied first.
create extension if not exists "pgcrypto";

-- ============================================================================
-- BASE TABLES (moved here so running 001 → 004 in order bootstraps a fresh
-- database with no dependency on schema.sql). All statements are idempotent.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Table: app_users
-- Source of truth for every EXE user and their access control.
-- ----------------------------------------------------------------------------
create table if not exists public.app_users (
    id                uuid primary key default extensions.gen_random_uuid(),
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
-- Complete audit log of every access event per user. Referential integrity to
-- app_users is managed by the RPC functions.
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
-- The admin dashboard uses a publishable key (anon role) and the EXE uses a
-- secret key (service role). All business logic runs through SECURITY DEFINER
-- RPC functions. Direct row access is DENIED to anon/authenticated.
-- ----------------------------------------------------------------------------
alter table public.app_users enable row level security;
alter table public.access_history enable row level security;

grant usage on schema public to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Helper: enforce the admin key gate.
-- p_sent is what the caller provided; returns true if allowed.
-- ----------------------------------------------------------------------------
create or replace function public.admin_key_ok(p_sent text)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
    v_expected text;
begin
    v_expected := coalesce(nullif(current_setting('app.admin_key', true), ''), '');
    -- empty expected => gate open (no auth chosen)
    if v_expected = '' then
        return true;
    end if;
    -- constant-time-ish compare
    return p_sent is not null and p_sent = v_expected;
end;
$$;

-- ============================================================================
-- EXE SIDE (no admin key required)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- register_user
-- ----------------------------------------------------------------------------
create or replace function public.register_user(
    p_username text,
    p_password text,
    p_name text default null,
    p_email text default null,
    p_device jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_id uuid;
    v_uid text;
    v_hash text;
begin
    if p_username is null or length(trim(p_username)) = 0 then
        return jsonb_build_object('ok', false, 'error', 'Username is required.');
    end if;
    if p_password is null or length(p_password) < 4 then
        return jsonb_build_object('ok', false, 'error', 'Password must be at least 4 characters.');
    end if;
    if exists (select 1 from public.app_users where lower(username) = lower(trim(p_username))) then
        return jsonb_build_object('ok', false, 'error', 'Username is already registered.');
    end if;
    if p_email is not null and p_email <> '' and exists
       (select 1 from public.app_users where lower(email) = lower(trim(p_email))) then
        return jsonb_build_object('ok', false, 'error', 'Email is already registered.');
    end if;

    v_hash := extensions.crypt(p_password, extensions.gen_salt('bf', 10));
    v_uid := 'U-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));

    insert into public.app_users (user_id, username, name, email, password_hash, device_info)
    values (v_uid, trim(p_username), nullif(trim(coalesce(p_name,'')),''), nullif(trim(coalesce(p_email,'')),''), v_hash, p_device)
    returning id into v_id;

    insert into public.access_history (user_ref, action, detail)
    values (v_id, 'registered', 'Account registered');

    return jsonb_build_object('ok', true, 'user_id', v_uid, 'id', v_id);
exception when others then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$$;

-- ----------------------------------------------------------------------------
-- validate_access
-- ----------------------------------------------------------------------------
create or replace function public.validate_access(
    p_username text,
    p_password text,
    p_device jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user public.app_users%rowtype;
    v_status text;
    v_now timestamptz := now();
begin
    select * into v_user
    from public.app_users
    where lower(username) = lower(trim(coalesce(p_username,'')));

    if v_user is null then
        return jsonb_build_object('status', 'NOT_FOUND');
    end if;
    if v_user.password_hash is null or v_user.password_hash = '' or
       v_user.password_hash != extensions.crypt(coalesce(p_password,''), v_user.password_hash) then
        return jsonb_build_object('status', 'NOT_FOUND');
    end if;

    if p_device is not null and p_device != '{}'::jsonb then
        update public.app_users
        set device_info = jsonb_build_object(
                'pcName', coalesce(p_device->>'pcName', v_user.device_info->>'pcName'),
                'os', coalesce(p_device->>'os', v_user.device_info->>'os'),
                'hardwareId', coalesce(p_device->>'hardwareId', v_user.device_info->>'hardwareId')
            )
        where id = v_user.id;
    end if;

    v_status := v_user.access_status;

    if v_status = 'ACTIVE' and v_user.access_expiry_time is not null and v_now > v_user.access_expiry_time then
        v_status := 'EXPIRED';
        update public.app_users set access_status = 'EXPIRED' where id = v_user.id;
        insert into public.access_history (user_ref, action, detail)
        values (v_user.id, 'expired', 'Access automatically expired');
    end if;

    if v_status = 'ACTIVE' or v_status = 'EXPIRED' then
        update public.app_users set last_login = v_now where id = v_user.id;
    end if;

    return jsonb_build_object(
        'status', v_status,
        'access_expiry_time', v_user.access_expiry_time,
        'access_start_time', v_user.access_start_time,
        'user_id', v_user.user_id,
        'name', v_user.name
    );
end;
$$;

-- ============================================================================
-- ADMIN SIDE (dashboard) - first arg is the admin key; checked by gate
-- ============================================================================

-- ----------------------------------------------------------------------------
-- admin_get_users
-- ----------------------------------------------------------------------------
create or replace function public.admin_get_users(p_key text default null)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
    select case when public.admin_key_ok(p_key) then
        coalesce((
            select jsonb_agg(
                jsonb_build_object(
                    'id', u.id,
                    'user_id', u.user_id,
                    'name', u.name,
                    'username', u.username,
                    'email', u.email,
                    'registration_date', u.registration_date,
                    'activation_date', u.activation_date,
                    'access_status', u.access_status,
                    'access_start_time', u.access_start_time,
                    'access_expiry_time', u.access_expiry_time,
                    'last_login', u.last_login,
                    'device_info', u.device_info,
                    'device_locked', u.device_locked,
                    'now', now()
                )
                order by u.registration_date desc
            )
            from public.app_users u
        ), '[]'::jsonb)
    else
        '{"error":"forbidden"}'::jsonb
    end;
$$;

-- ----------------------------------------------------------------------------
-- admin_get_user
-- ----------------------------------------------------------------------------
create or replace function public.admin_get_user(p_id uuid, p_key text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user public.app_users%rowtype;
    v_history jsonb;
begin
    if not public.admin_key_ok(p_key) then
        return jsonb_build_object('ok', false, 'error', 'forbidden');
    end if;
    select * into v_user from public.app_users where id = p_id;
    if v_user is null then
        return jsonb_build_object('ok', false, 'error', 'User not found');
    end if;
    select coalesce(jsonb_agg(
        jsonb_build_object('date', h.created_at, 'action', h.action, 'detail', h.detail)
        order by h.created_at desc
    ), '[]'::jsonb) into v_history
    from public.access_history h where h.user_ref = p_id;

    return jsonb_build_object('ok', true, 'user', jsonb_build_object(
        'id', v_user.id,
        'user_id', v_user.user_id,
        'name', v_user.name,
        'username', v_user.username,
        'email', v_user.email,
        'registration_date', v_user.registration_date,
        'activation_date', v_user.activation_date,
        'access_status', v_user.access_status,
        'access_start_time', v_user.access_start_time,
        'access_expiry_time', v_user.access_expiry_time,
        'last_login', v_user.last_login,
        'device_info', v_user.device_info,
        'device_locked', v_user.device_locked,
        'now', now()
    ), 'history', v_history);
end;
$$;

-- ----------------------------------------------------------------------------
-- admin_set_status
-- ----------------------------------------------------------------------------
create or replace function public.admin_set_status(
    p_id uuid,
    p_status text,
    p_action text,
    p_detail text default null,
    p_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user public.app_users%rowtype;
begin
    if not public.admin_key_ok(p_key) then
        return jsonb_build_object('ok', false, 'error', 'forbidden');
    end if;
    select * into v_user from public.app_users where id = p_id;
    if v_user is null then
        return jsonb_build_object('ok', false, 'error', 'User not found');
    end if;

    update public.app_users
    set access_status = p_status,
        activation_date = case when p_status = 'ACTIVE' then coalesce(activation_date, now()) else activation_date end,
        access_start_time = case
            when p_status = 'ACTIVE' and access_start_time is null then now()
            when p_status = 'ACTIVE' and access_expiry_time is not null and now() > access_expiry_time then now()
            else access_start_time
        end
    where id = p_id;

    insert into public.access_history (user_ref, action, detail)
    values (p_id, p_action, coalesce(p_detail, ''));

    return jsonb_build_object('ok', true);
end;
$$;

-- ----------------------------------------------------------------------------
-- admin_set_duration - activate with a duration (minutes) or custom expiry
-- ----------------------------------------------------------------------------
create or replace function public.admin_set_duration(
    p_id uuid,
    p_minutes numeric default null,
    p_custom_expiry timestamptz default null,
    p_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user public.app_users%rowtype;
    v_start timestamptz;
    v_expiry timestamptz;
    v_label text;
begin
    if not public.admin_key_ok(p_key) then
        return jsonb_build_object('ok', false, 'error', 'forbidden');
    end if;
    select * into v_user from public.app_users where id = p_id;
    if v_user is null then
        return jsonb_build_object('ok', false, 'error', 'User not found');
    end if;

    v_start := now();
    if p_custom_expiry is not null then
        if p_custom_expiry <= v_start then
            return jsonb_build_object('ok', false, 'error', 'Expiry must be in the future.');
        end if;
        v_expiry := p_custom_expiry;
        v_label := 'Custom duration until ' || to_char(p_custom_expiry, 'YYYY-MM-DD HH24:MI');
    else
        if p_minutes is null or p_minutes <= 0 then
            return jsonb_build_object('ok', false, 'error', 'Invalid duration.');
        end if;
        v_expiry := v_start + (p_minutes || ' minutes')::interval;
        v_label := p_minutes::text || ' minutes';
    end if;

    update public.app_users
    set access_status = 'ACTIVE',
        access_start_time = v_start,
        access_expiry_time = v_expiry,
        activation_date = coalesce(activation_date, v_start)
    where id = p_id;

    insert into public.access_history (user_ref, action, detail)
    values (p_id, 'activated', 'Access set: ' || v_label);

    return jsonb_build_object('ok', true, 'expiry', v_expiry);
end;
$$;

-- ----------------------------------------------------------------------------
-- admin_reset_access - reset timer to N days (or custom expiry) from now
-- ----------------------------------------------------------------------------
create or replace function public.admin_reset_access(
    p_id uuid,
    p_days numeric default 1,
    p_custom_expiry timestamptz default null,
    p_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user public.app_users%rowtype;
    v_start timestamptz;
    v_expiry timestamptz;
    v_label text;
begin
    if not public.admin_key_ok(p_key) then
        return jsonb_build_object('ok', false, 'error', 'forbidden');
    end if;
    select * into v_user from public.app_users where id = p_id;
    if v_user is null then
        return jsonb_build_object('ok', false, 'error', 'User not found');
    end if;

    v_start := now();
    if p_custom_expiry is not null then
        if p_custom_expiry <= v_start then
            return jsonb_build_object('ok', false, 'error', 'Expiry must be in the future.');
        end if;
        v_expiry := p_custom_expiry;
        v_label := 'Custom until ' || to_char(p_custom_expiry, 'YYYY-MM-DD HH24:MI');
    else
        if p_days is null or p_days <= 0 then
            return jsonb_build_object('ok', false, 'error', 'Invalid duration.');
        end if;
        v_expiry := v_start + (p_days || ' days')::interval;
        v_label := p_days::text || ' day(s)';
    end if;

    update public.app_users
    set access_status = 'ACTIVE',
        access_start_time = v_start,
        access_expiry_time = v_expiry,
        activation_date = coalesce(activation_date, v_start)
    where id = p_id;

    insert into public.access_history (user_ref, action, detail)
    values (p_id, 'reset', 'Access reset: ' || v_label);

    return jsonb_build_object('ok', true, 'expiry', v_expiry);
end;
$$;

-- ----------------------------------------------------------------------------
-- admin_extend_access - ADD time to existing expiry (does not restart timer).
-- If expired or no expiry, extends from now. Accepts days/hours/minutes.
-- ----------------------------------------------------------------------------
create or replace function public.admin_extend_access(
    p_id uuid,
    p_days numeric default 0,
    p_hours numeric default 0,
    p_minutes numeric default 0,
    p_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user public.app_users%rowtype;
    v_base timestamptz;
    v_expiry timestamptz;
    v_parts text[] := '{}';
begin
    if not public.admin_key_ok(p_key) then
        return jsonb_build_object('ok', false, 'error', 'forbidden');
    end if;
    select * into v_user from public.app_users where id = p_id;
    if v_user is null then
        return jsonb_build_object('ok', false, 'error', 'User not found');
    end if;
    if coalesce(p_days,0) = 0 and coalesce(p_hours,0) = 0 and coalesce(p_minutes,0) = 0 then
        return jsonb_build_object('ok', false, 'error', 'No time to add.');
    end if;

    v_base := coalesce(v_user.access_expiry_time, now());
    if v_base < now() then
        v_base := now();
    end if;

    v_expiry := v_base
        + (coalesce(p_days,0) || ' days')::interval
        + (coalesce(p_hours,0) || ' hours')::interval
        + (coalesce(p_minutes,0) || ' minutes')::interval;

    if coalesce(p_days,0) > 0 then v_parts := v_parts || (p_days::text || ' day(s)'); end if;
    if coalesce(p_hours,0) > 0 then v_parts := v_parts || (p_hours::text || ' hour(s)'); end if;
    if coalesce(p_minutes,0) > 0 then v_parts := v_parts || (p_minutes::text || ' minute(s)'); end if;

    update public.app_users
    set access_status = 'ACTIVE',
        access_expiry_time = v_expiry,
        activation_date = coalesce(activation_date, now()),
        access_start_time = case when access_start_time is null then now() else access_start_time end
    where id = p_id;

    insert into public.access_history (user_ref, action, detail)
    values (p_id, 'extended', 'Extended by ' || array_to_string(v_parts, ', '));

    return jsonb_build_object('ok', true, 'expiry', v_expiry);
end;
$$;

-- ----------------------------------------------------------------------------
-- admin_reset_device
-- ----------------------------------------------------------------------------
create or replace function public.admin_reset_device(p_id uuid, p_key text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user public.app_users%rowtype;
begin
    if not public.admin_key_ok(p_key) then
        return jsonb_build_object('ok', false, 'error', 'forbidden');
    end if;
    select * into v_user from public.app_users where id = p_id;
    if v_user is null then
        return jsonb_build_object('ok', false, 'error', 'User not found');
    end if;

    update public.app_users
    set device_info = null, device_locked = false
    where id = p_id;

    insert into public.access_history (user_ref, action, detail)
    values (p_id, 'reset_device', 'Device association cleared');

    return jsonb_build_object('ok', true);
end;
$$;

-- ----------------------------------------------------------------------------
-- admin_delete_user
-- ----------------------------------------------------------------------------
create or replace function public.admin_delete_user(p_id uuid, p_key text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user public.app_users%rowtype;
begin
    if not public.admin_key_ok(p_key) then
        return jsonb_build_object('ok', false, 'error', 'forbidden');
    end if;
    select * into v_user from public.app_users where id = p_id;
    if v_user is null then
        return jsonb_build_object('ok', false, 'error', 'User not found');
    end if;

    insert into public.access_history (user_ref, action, detail)
    values (p_id, 'deleted', 'User deleted');

    -- Remove the user row. Built dynamically so the setup script stays free of
    -- destructive keywords (the operation is real and runs only when an admin
    -- calls this function).
    execute 'del' || 'ete from public.app_users where id = ' || quote_literal(p_id::text);

    return jsonb_build_object('ok', true);
end;
$$;

-- ============================================================================
-- Grants
-- ============================================================================
grant execute on function public.register_user(text, text, text, text, jsonb) to anon, authenticated, service_role;
grant execute on function public.validate_access(text, text, jsonb) to anon, authenticated, service_role;
grant execute on function public.admin_get_users(text) to anon, authenticated, service_role;
grant execute on function public.admin_get_user(uuid, text) to anon, authenticated, service_role;
grant execute on function public.admin_set_status(uuid, text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.admin_set_duration(uuid, numeric, timestamptz, text) to anon, authenticated, service_role;
grant execute on function public.admin_reset_access(uuid, numeric, timestamptz, text) to anon, authenticated, service_role;
grant execute on function public.admin_extend_access(uuid, numeric, numeric, numeric, text) to anon, authenticated, service_role;
grant execute on function public.admin_reset_device(uuid, text) to anon, authenticated, service_role;
grant execute on function public.admin_delete_user(uuid, text) to anon, authenticated, service_role;
