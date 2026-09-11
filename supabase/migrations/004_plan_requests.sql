-- ============================================================================
-- HireMe User Access Management - Free Trial & Plan Requests (v4)
--
-- Adds a free-trial experience and an in-app plan-request flow:
--   * New registrations immediately get a TRIAL: 10 minutes of usage budget.
--     Combined with the EXE's 10-question cap, the trial ends when the first
--     limit is reached.
--   * Accounts created by the PRE-004 schema that are still INACTIVE (no
--     activation / no grant) are back-filled onto the same 10-minute trial so
--     nobody is stuck waiting for an admin to "activate" them.
--   * plan_requests: when a trial (or any user) asks for more time, the EXE
--     writes a PENDING request that the admin sees on the dashboard. The admin
--     grants time with the existing Set Duration / Reset / Extend controls;
--     doing so automatically flips the user to plan_type='paid' and marks the
--     request GRANTED.
--   * Existing accounts are unaffected: they default to plan_type='paid'.
--
-- Requires migrations/003_identity_email.sql to be applied first (credential
-- lookup by email/username). This file only ALTERs columns, creates ONE new
-- table, and REPLACES RPC functions. No destructive statements.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Column sync (self-sufficiency): 004 depends on the usage-budget columns that
-- 002 adds. If 002 was skipped/errored on this database, add them here so 004
-- never fails with "column does not exist". Idempotent.
-- ----------------------------------------------------------------------------
alter table public.app_users add column if not exists grant_duration_seconds numeric;
alter table public.app_users add column if not exists used_seconds numeric not null default 0;
alter table public.app_users add column if not exists last_active_start timestamptz;

-- ----------------------------------------------------------------------------
-- plan_type: 'trial' (auto-granted free trial) vs 'paid' (admin granted).
-- Existing rows default to 'paid' so nothing about current users changes.
-- ----------------------------------------------------------------------------
alter table public.app_users
    add column if not exists plan_type text not null default 'paid';

-- ----------------------------------------------------------------------------
-- Back-fill: accounts left INACTIVE by the pre-trial schema get a free trial
-- too. Only untouched, grant-less accounts are picked up (admin-deactivated
-- users are guarded by taking accounts WITHOUT any grant/expiry on file).
-- ----------------------------------------------------------------------------
update public.app_users
set access_status = 'ACTIVE',
    plan_type = 'trial',
    activation_date = coalesce(activation_date, now()),
    access_start_time = coalesce(access_start_time, now()),
    grant_duration_seconds = 600,
    used_seconds = 0,
    last_active_start = null
where access_status = 'INACTIVE'
  and grant_duration_seconds is null
  and access_expiry_time is null;

-- ----------------------------------------------------------------------------
-- Table: plan_requests
-- In-app requests for more time, surfaced to the admin dashboard.
-- ----------------------------------------------------------------------------
create table if not exists public.plan_requests (
    id                uuid primary key default extensions.gen_random_uuid(),
    user_ref          uuid not null,
    username          text not null,
    email             text,
    requested_minutes numeric not null,
    note              text,
    status            text not null default 'PENDING'
                      check (status in ('PENDING','GRANTED','DISMISSED','DENIED')),
    created_at        timestamptz not null default now(),
    resolved_at       timestamptz
);

create index if not exists idx_plan_requests_status on public.plan_requests (status, created_at desc);
create index if not exists idx_plan_requests_user on public.plan_requests (user_ref);

alter table public.plan_requests enable row level security;

-- No policies: default-deny. Only SECURITY DEFINER RPCs touch this table.

-- ----------------------------------------------------------------------------
-- Shared credential lookup (re-declared so this file is self-sufficient even
-- if 003 was applied out of order).
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
-- register_user (replacement) - on registration the account is immediately
-- ACTIVE with a 10-minute usage-budget TRIAL so the EXE works right away.
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

    insert into public.app_users (
        user_id, username, name, email, password_hash, device_info,
        access_status, plan_type, access_start_time,
        grant_duration_seconds, used_seconds, last_active_start, activation_date
    )
    values (
        v_uid, v_username, nullif(trim(coalesce(p_name,'')),''), v_email, v_hash, p_device,
        'ACTIVE', 'trial', now(),
        600, 0, null, now()
    )
    returning id into v_id;

    insert into public.access_history (user_ref, action, detail)
    values (v_id, 'registered', 'Account registered');

    insert into public.access_history (user_ref, action, detail)
    values (v_id, 'activated', 'Trial started: 10 minutes of usage');

    return jsonb_build_object('ok', true, 'user_id', v_uid, 'id', v_id);
exception when others then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$$;

-- ----------------------------------------------------------------------------
-- validate_access (replacement) - reports plan_type so the EXE can show the
-- plan-request prompt for exhausted trials instead of a generic expiry.
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
        'plan_type', v_user.plan_type,
        'grant_duration_seconds', v_user.grant_duration_seconds,
        'used_seconds', coalesce(v_user.used_seconds, 0),
        'remaining_seconds', v_remaining
    );
end;
$$;

-- ----------------------------------------------------------------------------
-- usage_start / usage_stop / usage_heartbeat (replacements) - the meter logic
-- is unchanged; only plan_type is added to the response.
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
        'name', v_user.name,
        'plan_type', v_user.plan_type
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
        'name', v_user.name,
        'plan_type', v_user.plan_type
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
        'name', v_user.name,
        'plan_type', v_user.plan_type
    );
end;
$$;

-- ============================================================================
-- PLAN REQUEST FLOW (EXE side)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- send_plan_request - the EXE prompts with preset/custom durations; this is
-- stored as a PENDING request for the admin to review and grant.
-- ----------------------------------------------------------------------------
create or replace function public.send_plan_request(
    p_identity text,
    p_password text,
    p_minutes numeric,
    p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user public.app_users%rowtype;
    v_req_id uuid;
begin
    select * into v_user from public.credential_row(p_identity);

    if v_user is null then
        return jsonb_build_object('ok', false, 'error', 'Not found.');
    end if;
    if v_user.password_hash is null or v_user.password_hash = '' or
       v_user.password_hash != extensions.crypt(coalesce(p_password,''), v_user.password_hash) then
        return jsonb_build_object('ok', false, 'error', 'Not found.');
    end if;

    if p_minutes is null or p_minutes <= 0 then
        return jsonb_build_object('ok', false, 'error', 'Please choose a valid duration.');
    end if;
    if p_minutes > 100000 then
        return jsonb_build_object('ok', false, 'error', 'Duration is too large.');
    end if;

    -- One open request per user is enough; don't let the list get spammed.
    if exists (
        select 1 from public.plan_requests
        where user_ref = v_user.id and status = 'PENDING'
    ) then
        return jsonb_build_object('ok', true, 'note', 'already_pending');
    end if;

    insert into public.plan_requests (user_ref, username, email, requested_minutes, note)
    values (v_user.id, v_user.username, v_user.email, p_minutes, nullif(trim(coalesce(p_note,'')), ''))
    returning id into v_req_id;

    insert into public.access_history (user_ref, action, detail)
    values (v_user.id, 'plan_request', p_minutes::text || ' minutes requested');

    return jsonb_build_object('ok', true);
end;
$$;

-- ============================================================================
-- ADMIN SIDE (dashboard) - plan requests + plan-type awareness
-- ============================================================================

-- ----------------------------------------------------------------------------
-- admin_get_requests - pending access requests for the dashboard.
-- ----------------------------------------------------------------------------
create or replace function public.admin_get_requests(p_key text default null)
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
                    'id', r.id,
                    'user_ref', r.user_ref,
                    'username', r.username,
                    'email', r.email,
                    'requested_minutes', r.requested_minutes,
                    'note', r.note,
                    'created_at', r.created_at,
                    'status', r.status,
                    'user_id', u.user_id,
                    'access_status', u.access_status,
                    'plan_type', u.plan_type
                )
                order by r.created_at asc
            )
            from public.plan_requests r
            left join public.app_users u on u.id = r.user_ref
            where r.status = 'PENDING'
        ), '[]'::jsonb)
    else
        '{"error":"forbidden"}'::jsonb
    end;
$$;

-- ----------------------------------------------------------------------------
-- admin_set_plan_request - resolve a request manually (DENIED / DISMISSED).
-- GRANTED is applied automatically whenever an admin grants access time.
-- ----------------------------------------------------------------------------
create or replace function public.admin_set_plan_request(
    p_id uuid,
    p_status text,
    p_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public.admin_key_ok(p_key) then
        return jsonb_build_object('ok', false, 'error', 'forbidden');
    end if;
    if p_status not in ('PENDING','GRANTED','DISMISSED','DENIED') then
        return jsonb_build_object('ok', false, 'error', 'Invalid status.');
    end if;

    update public.plan_requests
    set status = p_status, resolved_at = now()
    where id = p_id;

    return jsonb_build_object('ok', true);
end;
$$;

-- ----------------------------------------------------------------------------
-- Helper (not exposed as an endpoint): mark every pending request GRANTED once
-- an admin grants the user access time.
-- ----------------------------------------------------------------------------
create or replace function public.resolve_pending_requests(p_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
    update public.plan_requests
    set status = 'GRANTED', resolved_at = now()
    where user_ref = p_user_id and status = 'PENDING';
$$;

-- ----------------------------------------------------------------------------
-- admin_set_status (replacement) - activating a user also makes them 'paid'
-- and resolves their pending requests.
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
        plan_type = case when p_status = 'ACTIVE' then 'paid' else plan_type end,
        activation_date = case when p_status = 'ACTIVE' then coalesce(activation_date, now()) else activation_date end,
        access_start_time = case
            when p_status = 'ACTIVE' and access_start_time is null then now()
            when p_status = 'ACTIVE' and access_expiry_time is not null and now() > access_expiry_time then now()
            else access_start_time
        end
    where id = p_id;

    if p_status = 'ACTIVE' then
        perform public.resolve_pending_requests(p_id);
    end if;

    insert into public.access_history (user_ref, action, detail)
    values (p_id, p_action, coalesce(p_detail, ''));

    return jsonb_build_object('ok', true);
end;
$$;

-- ----------------------------------------------------------------------------
-- admin_get_users / admin_get_user (replacements) - expose plan_type.
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
                    'plan_type', u.plan_type,
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
        'plan_type', v_user.plan_type,
        'last_login', v_user.last_login,
        'device_info', v_user.device_info,
        'device_locked', v_user.device_locked,
        'now', now()
    ), 'history', v_history);
end;
$$;

-- ----------------------------------------------------------------------------
-- admin_set_duration / admin_reset_access / admin_extend_access (replacements)
-- - grants always flip the user to plan_type='paid' and resolve requests.
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
            plan_type = 'paid',
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
            plan_type = 'paid',
            access_start_time = v_start,
            access_expiry_time = null,
            grant_duration_seconds = v_seconds,
            used_seconds = 0,
            last_active_start = null,
            activation_date = coalesce(activation_date, v_start)
        where id = p_id;
    end if;

    perform public.resolve_pending_requests(p_id);

    insert into public.access_history (user_ref, action, detail)
    values (p_id, 'activated', 'Access set: ' || v_label);

    if p_custom_expiry is not null then
        return jsonb_build_object('ok', true, 'expiry', v_expiry);
    end if;
    return jsonb_build_object('ok', true, 'remaining_seconds', v_seconds);
end;
$$;

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
            plan_type = 'paid',
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
            plan_type = 'paid',
            access_start_time = v_start,
            access_expiry_time = null,
            grant_duration_seconds = v_seconds,
            used_seconds = 0,
            last_active_start = null,
            activation_date = coalesce(activation_date, v_start)
        where id = p_id;
    end if;

    perform public.resolve_pending_requests(p_id);

    insert into public.access_history (user_ref, action, detail)
    values (p_id, 'reset', 'Access reset: ' || v_label);

    if p_custom_expiry is not null then
        return jsonb_build_object('ok', true, 'expiry', v_expiry);
    end if;
    return jsonb_build_object('ok', true, 'remaining_seconds', v_seconds);
end;
$$;

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
        update public.app_users
        set access_status = 'ACTIVE',
            plan_type = 'paid',
            grant_duration_seconds = coalesce(v_user.grant_duration_seconds, 0) + v_add,
            access_start_time = case when access_start_time is null then now() else access_start_time end,
            activation_date = coalesce(activation_date, now())
        where id = p_id;

        v_remaining := (coalesce(v_user.grant_duration_seconds, 0) + v_add) - coalesce(v_user.used_seconds, 0);
        insert into public.access_history (user_ref, action, detail)
        values (p_id, 'extended', 'Usage extended by ' || array_to_string(v_parts, ', '));

        perform public.resolve_pending_requests(p_id);

        return jsonb_build_object('ok', true, 'remaining_seconds', v_remaining);
    end if;

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
        plan_type = 'paid',
        access_expiry_time = v_expiry,
        activation_date = coalesce(activation_date, now()),
        access_start_time = case when access_start_time is null then now() else access_start_time end
    where id = p_id;

    insert into public.access_history (user_ref, action, detail)
    values (p_id, 'extended', 'Extended by ' || array_to_string(v_parts, ', '));

    perform public.resolve_pending_requests(p_id);

    return jsonb_build_object('ok', true, 'expiry', v_expiry);
end;
$$;

-- ============================================================================
-- Grants (new functions only; replaced ones keep their existing grants).
-- ============================================================================
grant execute on function public.send_plan_request(text, text, numeric, text) to anon, authenticated, service_role;
grant execute on function public.admin_get_requests(text) to anon, authenticated, service_role;
grant execute on function public.admin_set_plan_request(uuid, text, text) to anon, authenticated, service_role;