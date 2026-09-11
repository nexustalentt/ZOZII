-- ============================================================================
-- HireMe User Access Management - Email as the identity (v3)
--
-- Registration no longer requires a separate username: the email address is
-- the primary identity. `register_user` now falls back to the email when no
-- username is supplied, and every credential lookup (validate_access /
-- usage_start / usage_stop / usage_heartbeat) accepts the email OR a legacy
-- username, so older accounts keep working.
--
-- Requires migrations/002_usage_tracking.sql to be applied first. This file
-- only REPLACES RPC functions; it contains no destructive statements and may
-- be re-run safely.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- register_user (replacement) - email is required; username becomes optional
-- and is derived from the email when omitted.
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
    v_username text;
    v_email text;
begin
    v_email := lower(nullif(trim(coalesce(p_email, '')), ''));
    if v_email is null then
        return jsonb_build_object('ok', false, 'error', 'Email is required.');
    end if;
    if v_email !~ '@' then
        return jsonb_build_object('ok', false, 'error', 'Please enter a valid email address.');
    end if;
    if p_password is null or length(p_password) < 4 then
        return jsonb_build_object('ok', false, 'error', 'Password must be at least 4 characters.');
    end if;

    -- Primary identity is the email; an explicit username is optional.
    v_username := nullif(trim(coalesce(p_username, '')), '');
    if v_username is null then
        v_username := v_email;
    end if;

    if exists (select 1 from public.app_users where lower(username) = lower(v_username)) then
        return jsonb_build_object('ok', false, 'error', 'This email / username is already registered.');
    end if;
    if exists (select 1 from public.app_users where lower(email) = v_email) then
        return jsonb_build_object('ok', false, 'error', 'This email is already registered.');
    end if;

    v_hash := extensions.crypt(p_password, extensions.gen_salt('bf', 10));
    v_uid := 'U-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));

    insert into public.app_users (user_id, username, name, email, password_hash, device_info)
    values (v_uid, v_username, nullif(trim(coalesce(p_name,'')),''), v_email, v_hash, p_device)
    returning id into v_id;

    insert into public.access_history (user_ref, action, detail)
    values (v_id, 'registered', 'Account registered');

    return jsonb_build_object('ok', true, 'user_id', v_uid, 'id', v_id);
exception when others then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$$;

-- ----------------------------------------------------------------------------
-- Shared credential lookup: match the email OR a legacy username.
-- ----------------------------------------------------------------------------
create or replace function public.credential_row(p_identity text)
returns public.app_users
language sql
security definer
set search_path = public
stable
as $$
    select u.*
    from public.app_users u
    where lower(username) = lower(trim(coalesce(p_identity,'')))
       or (email is not null and lower(email) = lower(trim(coalesce(p_identity,''))))
    order by case when lower(username) = lower(trim(coalesce(p_identity,''))) then 0 else 1 end
    limit 1;
$$;

-- ----------------------------------------------------------------------------
-- validate_access (replacement) - identity may be an email or a username.
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
    v_remaining numeric;
    v_budget_mode boolean;
begin
    select * into v_user from public.credential_row(p_username);

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

    select * into v_user from public.app_users where id = v_user.id;

    v_status := v_user.access_status;
    v_budget_mode := v_user.grant_duration_seconds is not null;

    if v_status = 'ACTIVE' and v_budget_mode then
        v_remaining := v_user.grant_duration_seconds - coalesce(v_user.used_seconds, 0);
        if v_remaining <= 0 then
            v_status := 'EXPIRED';
            update public.app_users
            set access_status = 'EXPIRED',
                used_seconds = v_user.grant_duration_seconds,
                last_active_start = null
            where id = v_user.id;
            insert into public.access_history (user_ref, action, detail)
            values (v_user.id, 'expired', 'Usage budget exhausted');
        end if;
    end if;

    if v_status = 'ACTIVE' and not v_budget_mode
       and v_user.access_expiry_time is not null and v_now > v_user.access_expiry_time then
        v_status := 'EXPIRED';
        update public.app_users set access_status = 'EXPIRED' where id = v_user.id;
        insert into public.access_history (user_ref, action, detail)
        values (v_user.id, 'expired', 'Access automatically expired');
    end if;

    if v_status = 'ACTIVE' or v_status = 'EXPIRED' then
        update public.app_users set last_login = v_now where id = v_user.id;
    end if;

    select * into v_user from public.app_users where id = v_user.id;

    v_remaining := case
        when v_user.grant_duration_seconds is not null
            then v_user.grant_duration_seconds - coalesce(v_user.used_seconds, 0)
        when v_user.access_expiry_time is not null
            then extract(epoch from (v_user.access_expiry_time - v_now))
        else null
    end;

    return jsonb_build_object(
        'status', v_status,
        'access_expiry_time', v_user.access_expiry_time,
        'access_start_time', v_user.access_start_time,
        'user_id', v_user.user_id,
        'name', v_user.name,
        'grant_duration_seconds', v_user.grant_duration_seconds,
        'used_seconds', coalesce(v_user.used_seconds, 0),
        'remaining_seconds', v_remaining
    );
end;
$$;

-- ----------------------------------------------------------------------------
-- usage_start / usage_stop / usage_heartbeat (replacements) - identity may be
-- an email or a username. The meter logic is unchanged from v2.
-- ----------------------------------------------------------------------------
create or replace function public.usage_start(
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
    v_remaining numeric;
    v_budget_mode boolean;
begin
    select * into v_user from public.credential_row(p_username);

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

    select * into v_user from public.app_users where id = v_user.id;

    v_status := v_user.access_status;
    v_budget_mode := v_user.grant_duration_seconds is not null;

    if v_status = 'ACTIVE' then
        if v_budget_mode then
            v_remaining := v_user.grant_duration_seconds - coalesce(v_user.used_seconds, 0);
            if v_remaining <= 0 then
                v_status := 'EXPIRED';
                update public.app_users
                set access_status = 'EXPIRED',
                    used_seconds = v_user.grant_duration_seconds,
                    last_active_start = null
                where id = v_user.id;
                insert into public.access_history (user_ref, action, detail)
                values (v_user.id, 'expired', 'Usage budget exhausted');
            else
                update public.app_users
                set last_active_start = coalesce(last_active_start, v_now),
                    last_login = v_now
                where id = v_user.id;
            end if;
        else
            update public.app_users set last_login = v_now where id = v_user.id;
        end if;
    end if;

    if v_status = 'ACTIVE' and not v_budget_mode
       and v_user.access_expiry_time is not null and v_now > v_user.access_expiry_time then
        v_status := 'EXPIRED';
        update public.app_users set access_status = 'EXPIRED' where id = v_user.id;
        insert into public.access_history (user_ref, action, detail)
        values (v_user.id, 'expired', 'Access automatically expired');
    end if;

    select * into v_user from public.app_users where id = v_user.id;

    v_remaining := case
        when v_user.grant_duration_seconds is not null
            then v_user.grant_duration_seconds - coalesce(v_user.used_seconds, 0)
        when v_user.access_expiry_time is not null
            then extract(epoch from (v_user.access_expiry_time - v_now))
        else null
    end;

    return jsonb_build_object(
        'status', v_status,
        'remaining_seconds', v_remaining,
        'used_seconds', coalesce(v_user.used_seconds, 0),
        'access_expiry_time', v_user.access_expiry_time,
        'user_id', v_user.user_id,
        'name', v_user.name
    );
end;
$$;

create or replace function public.usage_stop(
    p_username text,
    p_password text
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
    v_remaining numeric;
    v_budget_mode boolean;
    v_elapsed numeric;
    v_used numeric;
begin
    select * into v_user from public.credential_row(p_username);

    if v_user is null then
        return jsonb_build_object('status', 'NOT_FOUND');
    end if;
    if v_user.password_hash is null or v_user.password_hash = '' or
       v_user.password_hash != extensions.crypt(coalesce(p_password,''), v_user.password_hash) then
        return jsonb_build_object('status', 'NOT_FOUND');
    end if;

    select * into v_user from public.app_users where id = v_user.id;

    v_status := v_user.access_status;
    v_budget_mode := v_user.grant_duration_seconds is not null;

    if v_status = 'ACTIVE' and v_budget_mode and v_user.last_active_start is not null then
        v_elapsed := greatest(extract(epoch from (v_now - v_user.last_active_start)), 0);
        v_used := least(coalesce(v_user.used_seconds, 0) + v_elapsed, v_user.grant_duration_seconds);
        update public.app_users
        set used_seconds = v_used,
            last_active_start = null
        where id = v_user.id;

        select * into v_user from public.app_users where id = v_user.id;

        if (v_user.grant_duration_seconds - v_user.used_seconds) <= 0 then
            v_status := 'EXPIRED';
            update public.app_users set access_status = 'EXPIRED', last_active_start = null where id = v_user.id;
            insert into public.access_history (user_ref, action, detail)
            values (v_user.id, 'expired', 'Usage budget exhausted');
        end if;
    end if;

    if v_status = 'ACTIVE' and not v_budget_mode
       and v_user.access_expiry_time is not null and v_now > v_user.access_expiry_time then
        v_status := 'EXPIRED';
        update public.app_users set access_status = 'EXPIRED' where id = v_user.id;
        insert into public.access_history (user_ref, action, detail)
        values (v_user.id, 'expired', 'Access automatically expired');
    end if;

    select * into v_user from public.app_users where id = v_user.id;

    v_remaining := case
        when v_user.grant_duration_seconds is not null
            then v_user.grant_duration_seconds - coalesce(v_user.used_seconds, 0)
        when v_user.access_expiry_time is not null
            then extract(epoch from (v_user.access_expiry_time - v_now))
        else null
    end;

    return jsonb_build_object(
        'status', v_status,
        'remaining_seconds', v_remaining,
        'used_seconds', coalesce(v_user.used_seconds, 0),
        'access_expiry_time', v_user.access_expiry_time,
        'user_id', v_user.user_id,
        'name', v_user.name
    );
end;
$$;

create or replace function public.usage_heartbeat(
    p_username text,
    p_password text
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
    v_remaining numeric;
    v_budget_mode boolean;
    v_elapsed numeric;
    v_used numeric;
begin
    select * into v_user from public.credential_row(p_username);

    if v_user is null then
        return jsonb_build_object('status', 'NOT_FOUND');
    end if;
    if v_user.password_hash is null or v_user.password_hash = '' or
       v_user.password_hash != extensions.crypt(coalesce(p_password,''), v_user.password_hash) then
        return jsonb_build_object('status', 'NOT_FOUND');
    end if;

    select * into v_user from public.app_users where id = v_user.id;

    v_status := v_user.access_status;
    v_budget_mode := v_user.grant_duration_seconds is not null;

    if v_status = 'ACTIVE' and v_budget_mode and v_user.last_active_start is not null then
        v_elapsed := greatest(extract(epoch from (v_now - v_user.last_active_start)), 0);
        v_used := least(coalesce(v_user.used_seconds, 0) + v_elapsed, v_user.grant_duration_seconds);
        update public.app_users
        set used_seconds = v_used,
            last_active_start = v_now
        where id = v_user.id;

        select * into v_user from public.app_users where id = v_user.id;

        if (v_user.grant_duration_seconds - v_user.used_seconds) <= 0 then
            v_status := 'EXPIRED';
            update public.app_users set access_status = 'EXPIRED', last_active_start = null where id = v_user.id;
            insert into public.access_history (user_ref, action, detail)
            values (v_user.id, 'expired', 'Usage budget exhausted');
        end if;
    end if;

    if v_status = 'ACTIVE' and not v_budget_mode
       and v_user.access_expiry_time is not null and v_now > v_user.access_expiry_time then
        v_status := 'EXPIRED';
        update public.app_users set access_status = 'EXPIRED' where id = v_user.id;
        insert into public.access_history (user_ref, action, detail)
        values (v_user.id, 'expired', 'Access automatically expired');
    end if;

    select * into v_user from public.app_users where id = v_user.id;

    v_remaining := case
        when v_user.grant_duration_seconds is not null
            then v_user.grant_duration_seconds - coalesce(v_user.used_seconds, 0)
        when v_user.access_expiry_time is not null
            then extract(epoch from (v_user.access_expiry_time - v_now))
        else null
    end;

    return jsonb_build_object(
        'status', v_status,
        'remaining_seconds', v_remaining,
        'used_seconds', coalesce(v_user.used_seconds, 0),
        'access_expiry_time', v_user.access_expiry_time,
        'user_id', v_user.user_id,
        'name', v_user.name
    );
end;
$$;