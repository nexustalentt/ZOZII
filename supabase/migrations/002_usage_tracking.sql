-- ============================================================================
-- HireMe User Access Management - Usage-Budget Tracking (v2)
--
-- Moves access from a pure wall-clock countdown to a USAGE BUDGET model:
-- the admin grants a number of minutes (or a custom wall-clock expiry) and the
-- EXE only consumes the budget while it is actively listening/recording.
--   Start      -> usage_start()     opens/resumes the running interval
--   Stop/Pause -> usage_stop()      banks the elapsed seconds, closes interval
--   Periodic   -> usage_heartbeat() banks elapsed seconds and re-arms interval
--
-- Design notes:
--   * grant_duration_seconds is NULL  => wall-clock mode (old behaviour)
--   * grant_duration_seconds set      => budget mode (used_seconds consumed)
--   * last_active_start is NULL while idle; a non-null value means the meter
--     is running (consuming budget).
--
-- Requires migrations/001_rpc_functions.sql to be applied first (pgcrypto,
-- tables, base functions). This file only ALTERs columns and REPLACES RPCs,
-- so it contains no destructive statements and is safe to re-run.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- New columns (budget mode). Safe to re-run.
-- ----------------------------------------------------------------------------
alter table public.app_users add column if not exists grant_duration_seconds numeric;
alter table public.app_users add column if not exists used_seconds numeric not null default 0;
alter table public.app_users add column if not exists last_active_start timestamptz;

-- ----------------------------------------------------------------------------
-- validate_access (replacement) - now also reports remaining budget seconds and
-- auto-expires a budget user whose usage has been exhausted.
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

    select * into v_user from public.app_users where id = v_user.id;

    v_status := v_user.access_status;
    v_budget_mode := v_user.grant_duration_seconds is not null;

    -- Budget mode: remaining = grant minus used; zero/none => expired.
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

    -- Wall-clock mode: automatic expiry when the deadline passes.
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
-- usage_start - open (or resume) the consuming interval. Called when the user
-- presses Start. The interval is never reset here, so rapid toggles just keep
-- the meter aligned while the user is actively recording.
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
    select * into v_user from public.app_users
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
                -- Open/resume the interval; never restart an already-open one.
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

-- ----------------------------------------------------------------------------
-- usage_stop - close a running interval and bank the elapsed time.
-- Passed a Stop/Logout/Disconnect (pausing the meter while not recording).
-- ----------------------------------------------------------------------------
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
    select * into v_user from public.app_users
    where lower(username) = lower(trim(coalesce(p_username,'')));

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

-- ----------------------------------------------------------------------------
-- usage_heartbeat - called periodically WHILE listening: banks the elapsed
-- time and re-arms the interval, so a crash loses at most one heartbeat gap.
-- Also surfaces expiry mid-session.
-- ----------------------------------------------------------------------------
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
    select * into v_user from public.app_users
    where lower(username) = lower(trim(coalesce(p_username,'')));

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

-- ============================================================================
-- ADMIN SIDE (dashboard) - replaced to understand the budget model.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- admin_get_users - add usage-budget fields.
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
                    'grant_duration_seconds', u.grant_duration_seconds,
                    'used_seconds', u.used_seconds,
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
-- admin_get_user - add usage-budget fields to the single-user payload.
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
        'grant_duration_seconds', v_user.grant_duration_seconds,
        'used_seconds', v_user.used_seconds,
        'last_login', v_user.last_login,
        'device_info', v_user.device_info,
        'device_locked', v_user.device_locked,
        'now', now()
    ), 'history', v_history);
end;
$$;

-- ----------------------------------------------------------------------------
-- admin_set_duration (replacement)
--   minutes given   => USAGE BUDGET mode: grant minutes of listening time.
--   custom expiry   => WALL-CLOCK mode: fixed deadline from now (old behaviour).
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
    v_seconds numeric;
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

        update public.app_users
        set access_status = 'ACTIVE',
            access_start_time = v_start,
            access_expiry_time = v_expiry,
            grant_duration_seconds = null,
            used_seconds = 0,
            last_active_start = null,
            activation_date = coalesce(activation_date, v_start)
        where id = p_id;
    else
        if p_minutes is null or p_minutes <= 0 then
            return jsonb_build_object('ok', false, 'error', 'Invalid duration.');
        end if;
        v_seconds := p_minutes * 60;
        v_label := p_minutes::text || ' minutes of usage';

        update public.app_users
        set access_status = 'ACTIVE',
            access_start_time = v_start,
            access_expiry_time = null,
            grant_duration_seconds = v_seconds,
            used_seconds = 0,
            last_active_start = null,
            activation_date = coalesce(activation_date, v_start)
        where id = p_id;
    end if;

    insert into public.access_history (user_ref, action, detail)
    values (p_id, 'activated', 'Access set: ' || v_label);

    if p_custom_expiry is not null then
        return jsonb_build_object('ok', true, 'expiry', v_expiry);
    end if;
    return jsonb_build_object('ok', true, 'remaining_seconds', v_seconds);
end;
$$;

-- ----------------------------------------------------------------------------
-- admin_reset_access (replacement)
--   days given      => USAGE BUDGET mode: grant days of listening time.
--   custom expiry   => WALL-CLOCK mode: fixed deadline from now.
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
    v_seconds numeric;
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

        update public.app_users
        set access_status = 'ACTIVE',
            access_start_time = v_start,
            access_expiry_time = v_expiry,
            grant_duration_seconds = null,
            used_seconds = 0,
            last_active_start = null,
            activation_date = coalesce(activation_date, v_start)
        where id = p_id;
    else
        if p_days is null or p_days <= 0 then
            return jsonb_build_object('ok', false, 'error', 'Invalid duration.');
        end if;
        v_seconds := p_days * 86400;
        v_label := p_days::text || ' day(s) of usage';

        update public.app_users
        set access_status = 'ACTIVE',
            access_start_time = v_start,
            access_expiry_time = null,
            grant_duration_seconds = v_seconds,
            used_seconds = 0,
            last_active_start = null,
            activation_date = coalesce(activation_date, v_start)
        where id = p_id;
    end if;

    insert into public.access_history (user_ref, action, detail)
    values (p_id, 'reset', 'Access reset: ' || v_label);

    if p_custom_expiry is not null then
        return jsonb_build_object('ok', true, 'expiry', v_expiry);
    end if;
    return jsonb_build_object('ok', true, 'remaining_seconds', v_seconds);
end;
$$;

-- ----------------------------------------------------------------------------
-- admin_extend_access (replacement)
--   Budget-mode user  => ADD listening minutes to the granted budget.
--   Wall-clock user   => ADD time to the existing deadline (old behaviour).
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
    v_add numeric;
    v_base timestamptz;
    v_expiry timestamptz;
    v_remaining numeric;
    v_parts text[] := '{}';
begin
    if not public.admin_key_ok(p_key) then
        return jsonb_build_object('ok', false, 'error', 'forbidden');
    end if;
    select * into v_user from public.app_users where id = p_id;
    if v_user is null then
        return jsonb_build_object('ok', false, 'error', 'User not found');
    end if;

    v_add := coalesce(p_days,0)*86400 + coalesce(p_hours,0)*3600 + coalesce(p_minutes,0)*60;
    if v_add <= 0 then
        return jsonb_build_object('ok', false, 'error', 'No time to add.');
    end if;

    if coalesce(p_days,0) > 0 then v_parts := v_parts || (p_days::text || ' day(s)'); end if;
    if coalesce(p_hours,0) > 0 then v_parts := v_parts || (p_hours::text || ' hour(s)'); end if;
    if coalesce(p_minutes,0) > 0 then v_parts := v_parts || (p_minutes::text || ' minute(s)'); end if;

    if v_user.grant_duration_seconds is not null then
        -- Budget mode: grow the grant; the running interval keeps running.
        update public.app_users
        set access_status = 'ACTIVE',
            grant_duration_seconds = coalesce(v_user.grant_duration_seconds, 0) + v_add,
            access_start_time = case when access_start_time is null then now() else access_start_time end,
            activation_date = coalesce(activation_date, now())
        where id = p_id;

        v_remaining := (coalesce(v_user.grant_duration_seconds, 0) + v_add) - coalesce(v_user.used_seconds, 0);
        insert into public.access_history (user_ref, action, detail)
        values (p_id, 'extended', 'Usage extended by ' || array_to_string(v_parts, ', '));

        return jsonb_build_object('ok', true, 'remaining_seconds', v_remaining);
    end if;

    -- Wall-clock mode: add to the deadline; extend from now if already past.
    v_base := coalesce(v_user.access_expiry_time, now());
    if v_base < now() then
        v_base := now();
    end if;

    v_expiry := v_base
        + (coalesce(p_days,0) || ' days')::interval
        + (coalesce(p_hours,0) || ' hours')::interval
        + (coalesce(p_minutes,0) || ' minutes')::interval;

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

-- ============================================================================
-- Grants (new functions only; the replaced ones keep their existing grants).
-- ============================================================================
grant execute on function public.usage_start(text, text, jsonb) to anon, authenticated, service_role;
grant execute on function public.usage_stop(text, text) to anon, authenticated, service_role;
grant execute on function public.usage_heartbeat(text, text) to anon, authenticated, service_role;