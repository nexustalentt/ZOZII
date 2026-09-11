-- ============================================================================
-- HireMe / Zozii - App Releases & Installer Storage (v5)
--
-- Adds table public.app_releases and storage bucket 'releases' to allow
-- uploading and managing desktop installer releases (EXE) directly from
-- the Admin Portal, with public download access for the landing page.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Table: app_releases
-- Tracks uploaded/configured desktop installer executables.
-- ----------------------------------------------------------------------------
create table if not exists public.app_releases (
    id              uuid primary key default gen_random_uuid(),
    version         text not null default '0.1.0',
    filename        text not null default 'DTDC Service Setup.exe',
    file_size_bytes bigint,
    download_url    text not null,
    release_notes   text,
    is_active       boolean not null default true,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index if not exists idx_app_releases_active on public.app_releases (is_active, updated_at desc);

-- ----------------------------------------------------------------------------
-- Ensure Supabase Storage bucket 'releases' exists with public read access
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'releases',
    'releases',
    true,
    null,
    array['application/vnd.microsoft.portable-executable', 'application/x-msdownload', 'application/octet-stream', 'application/x-msdos-program']
)
on conflict (id) do update set
    public = true,
    allowed_mime_types = array['application/vnd.microsoft.portable-executable', 'application/x-msdownload', 'application/octet-stream', 'application/x-msdos-program'];

-- Storage read policy for public downloads
do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'storage' and tablename = 'objects' and policyname = 'Public Access Releases'
    ) then
        create policy "Public Access Releases"
            on storage.objects for select
            using (bucket_id = 'releases');
    end if;
    if not exists (
        select 1 from pg_policies
        where schemaname = 'storage' and tablename = 'objects' and policyname = 'Allow Uploads Releases'
    ) then
        create policy "Allow Uploads Releases"
            on storage.objects for insert
            with check (bucket_id = 'releases');
    end if;
    if not exists (
        select 1 from pg_policies
        where schemaname = 'storage' and tablename = 'objects' and policyname = 'Allow Updates Releases'
    ) then
        create policy "Allow Updates Releases"
            on storage.objects for update
            using (bucket_id = 'releases');
    end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- RPC: get_active_release (publicly readable for the home page download button)
-- ----------------------------------------------------------------------------
create or replace function public.get_active_release()
returns jsonb
language plpgsql
security definer
as $$
declare
    v_rec record;
begin
    select id, version, filename, file_size_bytes, download_url, release_notes, updated_at
    into v_rec
    from public.app_releases
    where is_active = true
    order by updated_at desc
    limit 1;

    if not found then
        return jsonb_build_object(
            'ok', true,
            'has_release', false,
            'download_url', '/DTDC Service Setup.exe',
            'filename', 'DTDC Service Setup.exe',
            'version', '0.1.0'
        );
    end if;

    return jsonb_build_object(
        'ok', true,
        'has_release', true,
        'id', v_rec.id,
        'version', v_rec.version,
        'filename', v_rec.filename,
        'file_size_bytes', v_rec.file_size_bytes,
        'download_url', v_rec.download_url,
        'release_notes', v_rec.release_notes,
        'updated_at', v_rec.updated_at
    );
end;
$$;

-- ----------------------------------------------------------------------------
-- RPC: admin_set_active_release
-- ----------------------------------------------------------------------------
create or replace function public.admin_set_active_release(
    p_download_url text,
    p_filename text default 'DTDC Service Setup.exe',
    p_file_size_bytes bigint default null,
    p_version text default '0.1.0',
    p_release_notes text default null,
    p_key text default ''
)
returns jsonb
language plpgsql
security definer
as $$
declare
    v_new_id uuid;
begin
    -- Deactivate any previously active releases
    update public.app_releases
    set is_active = false
    where is_active = true;

    -- Insert new active release
    insert into public.app_releases (
        version,
        filename,
        file_size_bytes,
        download_url,
        release_notes,
        is_active,
        updated_at
    )
    values (
        coalesce(nullif(trim(p_version), ''), '0.1.0'),
        coalesce(nullif(trim(p_filename), ''), 'DTDC Service Setup.exe'),
        p_file_size_bytes,
        trim(p_download_url),
        p_release_notes,
        true,
        now()
    )
    returning id into v_new_id;

    return jsonb_build_object(
        'ok', true,
        'id', v_new_id,
        'message', 'Active release updated successfully'
    );
end;
$$;

-- ----------------------------------------------------------------------------
-- Permissions
-- ----------------------------------------------------------------------------
alter table public.app_releases enable row level security;

-- Allow public read on app_releases
do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = 'app_releases' and policyname = 'Allow public read of active releases'
    ) then
        create policy "Allow public read of active releases"
            on public.app_releases for select
            using (true);
    end if;
end;
$$;

grant execute on function public.get_active_release() to anon, authenticated, service_role;
grant execute on function public.admin_set_active_release(text, text, bigint, text, text, text) to anon, authenticated, service_role;
grant select on public.app_releases to anon, authenticated, service_role;
