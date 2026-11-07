-- Business rules. These functions are the only supported way to change tasks,
-- applications, messages, reviews, and direct payments.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role = 'admin' and is_suspended = false
  );
$$;

create or replace function public.current_user_age()
returns integer
language sql
stable
security definer
set search_path = public, auth
as $$
  select extract(year from age(current_date, date_of_birth))::integer
  from public.users
  where id = auth.uid();
$$;

create or replace function public.can_discover_requester(p_requester uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.users u
    where u.id = p_requester and u.is_suspended = false
  )
  and not exists (
    select 1 from public.blocks b
    where (b.blocker_id = auth.uid() and b.blocked_id = p_requester)
       or (b.blocker_id = p_requester and b.blocked_id = auth.uid())
  );
$$;

create or replace function public.notify(
  p_user uuid,
  p_title text,
  p_message text,
  p_type text,
  p_task uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  prefs jsonb;
  pref_key text;
begin
  if p_user is null then
    return;
  end if;
  select notification_settings into prefs from public.users where id = p_user;
  pref_key := case
    when p_type in ('application_received', 'application_accepted', 'application_rejected', 'application_closed') then 'applications'
    when p_type = 'message' then 'messages'
    when p_type = 'review' then 'reviews'
    else 'tasks'
  end;
  if coalesce((prefs ->> pref_key)::boolean, true) is not true then
    return;
  end if;
  insert into public.notifications (user_id, title, message, type, related_task_id)
  values (p_user, left(p_title, 120), left(p_message, 400), p_type, p_task);
end;
$$;

create or replace function public.assert_safe_text(p_text text)
returns void
language plpgsql
set search_path = public
as $$
declare
  value text := lower(coalesce(p_text, ''));
  term text;
  terms text[] := array[
    'firearm', 'ammunition', 'explosive', 'cocaine', 'heroin', 'methamphetamine',
    'childcare', 'babysitting', 'escort service', 'phishing', 'locksmith',
    'electrical rewiring', 'gas fitting', 'prescription medication', 'controlled substance',
    'fake passport', 'counterfeit', 'weapon delivery', 'break into account'
  ];
begin
  if value ~ '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}' or value ~ '\d{10,}' then
    raise exception 'Remove phone numbers and email addresses. You can message each other in the app after you connect.';
  end if;
  foreach term in array terms loop
    if position(term in value) > 0 then
      raise exception 'This request includes a service Nook cannot safely support.';
    end if;
  end loop;
end;
$$;

create or replace function public.assert_can_participate()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  profile public.users%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  select * into profile from public.users where id = auth.uid();
  if not found then
    raise exception 'Your profile is not ready. Apply the database migration, then sign in again.';
  end if;
  if profile.is_suspended then
    raise exception 'This account is suspended';
  end if;
  if profile.onboarding_completed is not true then
    raise exception 'Finish setting up your profile first';
  end if;
  if profile.date_of_birth is null or extract(year from age(current_date, profile.date_of_birth)) < 16 then
    raise exception 'You need to be at least 16 to use Nook';
  end if;
  if not exists (
    select 1 from auth.users where id = auth.uid() and email_confirmed_at is not null
  ) then
    raise exception 'Confirm your email before continuing';
  end if;
end;
$$;

create or replace function public.fuzz_geography(p_lat double precision, p_lng double precision)
returns geography
language plpgsql
immutable
set search_path = public, extensions
as $$
declare
  hash_value integer := abs(hashtext(p_lat::text || ',' || p_lng::text));
  angle double precision := radians(hash_value % 360);
  dist double precision := 80 + (hash_value % 70);
  lat double precision;
  lng double precision;
begin
  lat := p_lat + (dist * cos(angle)) / 110540.0;
  lng := p_lng + (dist * sin(angle)) / (111320.0 * greatest(cos(radians(p_lat)), 0.2));
  return ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography;
end;
$$;

create or replace function public.own_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  select jsonb_build_object(
    'id', u.id,
    'full_name', u.full_name,
    'username', u.username,
    'email', u.email,
    'phone', u.phone,
    'avatar_url', u.avatar_url,
    'bio', u.bio,
    'neighbourhood', u.neighbourhood,
    'services_offered', u.services_offered,
    'verification_status', u.verification_status,
    'role', u.role,
    'date_of_birth', u.date_of_birth,
    'rating_avg', u.rating_avg,
    'rating_count', u.rating_count,
    'completed_count', u.completed_count,
    'is_suspended', u.is_suspended,
    'onboarding_completed', u.onboarding_completed,
    'notification_settings', u.notification_settings,
    'privacy_settings', u.privacy_settings,
    'home_lat', u.home_lat,
    'home_lng', u.home_lng,
    'discovery_radius_m', u.discovery_radius_m,
    'created_at', u.created_at,
    'skills', coalesce((
      select jsonb_agg(s.skill_name order by s.skill_name)
      from public.user_skills s where s.user_id = u.id
    ), '[]'::jsonb)
  ) into result
  from public.users u
  where u.id = auth.uid();
  if result is null then
    raise exception 'Your profile is not ready. Apply the database migration, then sign in again.';
  end if;
  return result;
end;
$$;

create or replace function public.update_profile(
  p_full_name text,
  p_username text,
  p_bio text,
  p_neighbourhood text,
  p_date_of_birth date,
  p_phone text,
  p_services_offered text,
  p_avatar_url text,
  p_lat double precision,
  p_lng double precision,
  p_skills text[],
  p_notification_settings jsonb,
  p_privacy_settings jsonb,
  p_discovery_radius_m integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_age integer;
  v_eligible boolean;
  v_prefs jsonb;
  v_privacy jsonb;
  v_skill text;
  v_neighbourhood text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if exists (select 1 from public.users where id = v_uid and is_suspended) then
    raise exception 'This account is suspended';
  end if;
  if p_full_name is null or char_length(trim(p_full_name)) < 2 or char_length(trim(p_full_name)) > 80 then
    raise exception 'Enter your full name';
  end if;
  if p_username is null or p_username !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'Usernames use 3 to 20 lowercase letters, numbers, or underscores';
  end if;
  if exists (select 1 from public.users where lower(username) = lower(p_username) and id <> v_uid) then
    raise exception 'That username is taken';
  end if;
  if p_date_of_birth is null or p_date_of_birth > current_date or p_date_of_birth < current_date - interval '110 years' then
    raise exception 'Enter a valid date of birth';
  end if;
  v_age := extract(year from age(current_date, p_date_of_birth))::integer;
  v_eligible := v_age >= 16;
  v_neighbourhood := nullif(trim(coalesce(p_neighbourhood, '')), '');
  if v_eligible and (v_neighbourhood is null or char_length(v_neighbourhood) < 2 or p_lat is null or p_lng is null) then
    raise exception 'Add your neighbourhood so nearby tasks can be found';
  end if;
  if v_neighbourhood is not null and v_neighbourhood ~* '(flat|apartment|house no|h\.?\s?no)' then
    raise exception 'Use your neighbourhood name, not your street address';
  end if;
  if p_lat is not null and (p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180) then
    raise exception 'That location is not valid';
  end if;
  if p_discovery_radius_m is not null and p_discovery_radius_m not in (500, 1000, 3000, 5000) then
    raise exception 'Choose a radius of 500 m, 1 km, 3 km, or 5 km';
  end if;
  if p_phone is not null and btrim(p_phone) <> '' and btrim(p_phone) !~ '^\+?[0-9]{8,15}$' then
    raise exception 'Enter a phone number with country code, digits only';
  end if;
  if p_avatar_url is not null and btrim(p_avatar_url) <> ''
     and p_avatar_url !~ ('^https://.+/storage/v1/object/public/avatars/' || v_uid::text || '/[A-Za-z0-9._-]+$') then
    raise exception 'Upload a profile photo through Nook';
  end if;
  if p_bio is not null and char_length(p_bio) > 280 then
    raise exception 'Keep your introduction under 280 characters';
  end if;
  if p_services_offered is not null and char_length(p_services_offered) > 280 then
    raise exception 'Keep your services under 280 characters';
  end if;
  perform public.assert_safe_text(coalesce(p_bio, '') || ' ' || coalesce(p_services_offered, ''));
  if p_skills is not null and cardinality(p_skills) > 12 then
    raise exception 'You can add up to 12 skills';
  end if;
  if p_skills is not null then
    foreach v_skill in array p_skills loop
      perform public.assert_safe_text(v_skill);
    end loop;
  end if;

  v_prefs := case
    when p_notification_settings is null then null
    else jsonb_build_object(
      'applications', coalesce((p_notification_settings->>'applications')::boolean, true),
      'messages', coalesce((p_notification_settings->>'messages')::boolean, true),
      'tasks', coalesce((p_notification_settings->>'tasks')::boolean, true),
      'reviews', coalesce((p_notification_settings->>'reviews')::boolean, true),
      'email', coalesce((p_notification_settings->>'email')::boolean, false)
    )
  end;
  v_privacy := case
    when p_privacy_settings is null then null
    else jsonb_build_object(
      'show_neighbourhood', coalesce((p_privacy_settings->>'show_neighbourhood')::boolean, true)
    )
  end;

  update public.users set
    full_name = trim(p_full_name),
    username = p_username,
    bio = nullif(trim(coalesce(p_bio, '')), ''),
    neighbourhood = v_neighbourhood,
    date_of_birth = p_date_of_birth,
    phone = nullif(regexp_replace(coalesce(p_phone, ''), '\s', '', 'g'), ''),
    services_offered = nullif(trim(coalesce(p_services_offered, '')), ''),
    avatar_url = nullif(trim(coalesce(p_avatar_url, '')), ''),
    home_lat = p_lat,
    home_lng = p_lng,
    home_location = case
      when p_lat is null or p_lng is null then null
      else ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
    end,
    discovery_radius_m = coalesce(p_discovery_radius_m, discovery_radius_m),
    notification_settings = coalesce(v_prefs, notification_settings),
    privacy_settings = coalesce(v_privacy, privacy_settings),
    onboarding_completed = v_eligible and v_neighbourhood is not null and p_lat is not null,
    updated_at = now()
  where id = v_uid;

  if p_skills is not null then
    delete from public.user_skills where user_id = v_uid;
    insert into public.user_skills (user_id, skill_name)
    select v_uid, left(trim(s), 40)
    from unnest(p_skills) as s
    where char_length(trim(s)) >= 2
    group by left(trim(s), 40);
  end if;

  return jsonb_build_object(
    'status', case when v_eligible then 'ok' else 'ineligible' end,
    'profile', public.own_profile()
  );
end;
$$;

create or replace function public.list_categories()
returns jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'parent_id', c.parent_id,
    'name', c.name,
    'slug', c.slug,
    'description', c.description,
    'icon', c.icon,
    'min_age', c.min_age,
    'is_active', c.is_active,
    'sort_order', c.sort_order
  ) order by c.sort_order), '[]'::jsonb)
  from public.categories c
  where c.is_active
    and (
      auth.uid() is null
      or c.min_age <= coalesce(public.current_user_age(), 0)
      or c.parent_id is null
    );
$$;

create or replace function public.nearby_tasks(
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer default 1000,
  p_category uuid default null,
  p_min_budget numeric default null,
  p_max_budget numeric default null,
  p_pricing text default null,
  p_payment text default null,
  p_search text default null,
  p_on date default null,
  p_available text default null,
  p_tz text default 'UTC',
  p_sort text default 'nearest'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, auth
as $$
declare
  v_uid uuid := auth.uid();
  origin geography;
  v_tz text := coalesce(nullif(p_tz, ''), 'UTC');
  v_search text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_lat is null or p_lng is null or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception 'Choose a location to see nearby tasks';
  end if;
  if p_radius_m not in (500, 1000, 3000, 5000) then
    raise exception 'Choose a radius of 500 m, 1 km, 3 km, or 5 km';
  end if;
  if p_sort not in ('nearest', 'latest', 'budget', 'recommended') then
    raise exception 'That sort option is not available';
  end if;
  if p_pricing is not null and p_pricing not in ('fixed', 'hourly') then
    raise exception 'That task type is not available';
  end if;
  if p_payment is not null and p_payment not in ('cash', 'upi') then
    raise exception 'That payment method is not available';
  end if;
  if p_search is not null and char_length(p_search) > 80 then
    raise exception 'Search is too long';
  end if;
  if not exists (select 1 from pg_timezone_names where name = v_tz) then
    v_tz := 'UTC';
  end if;
  origin := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;
  v_search := case
    when p_search is null or btrim(p_search) = '' then null
    else '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  end;

  return coalesce((
    select jsonb_agg(row_payload order by ord)
    from (
      select s.ord, to_jsonb(s) - 'ord' as row_payload
      from (
      select ranked.*
      from (
        select
          t.id,
          t.title,
          t.description,
          t.task_type,
          t.budget,
          t.hourly_rate,
          t.payment_method,
          t.public_location_label,
          t.scheduled_at,
          t.deadline,
          t.status,
          t.allow_negotiation,
          t.created_at,
          c.name as category_name,
          c.icon as category_icon,
          c.id as category_id,
          parent.name as parent_category_name,
          ru.id as requester_id,
          ru.full_name as requester_name,
          ru.avatar_url as requester_avatar,
          ru.rating_avg as requester_rating,
          ru.rating_count as requester_rating_count,
          round(ST_Distance(t.location, origin))::integer as distance_m,
          ST_Y(t.location::geometry) as latitude,
          ST_X(t.location::geometry) as longitude,
          (select count(*) from public.applications a where a.task_id = t.id) as application_count,
          exists(select 1 from public.saved_tasks sv where sv.task_id = t.id and sv.user_id = v_uid) as saved,
          row_number() over (
            order by
              case when p_sort = 'latest' then extract(epoch from t.created_at) end desc nulls last,
              case when p_sort = 'budget' then coalesce(t.budget, t.hourly_rate) end desc nulls last,
              case when p_sort = 'recommended' then (coalesce(ru.rating_avg, 0) * 1000000 - extract(epoch from (now() - t.created_at))) end desc nulls last,
              ST_Distance(t.location, origin) asc
          ) as ord
        from public.tasks t
        join public.categories c on c.id = t.category_id
        left join public.categories parent on parent.id = c.parent_id
        join public.users ru on ru.id = t.requester_id
        where t.status in ('open', 'applications_received')
          and t.requester_id <> v_uid
          and c.is_active
          and c.min_age <= coalesce(public.current_user_age(), 0)
          and public.can_discover_requester(t.requester_id)
          and (t.deadline is null or t.deadline > now())
          and ST_DWithin(t.location, origin, p_radius_m)
          and (p_category is null or t.category_id = p_category or c.parent_id = p_category)
          and (p_min_budget is null or coalesce(t.budget, t.hourly_rate) >= p_min_budget)
          and (p_max_budget is null or coalesce(t.budget, t.hourly_rate) <= p_max_budget)
          and (p_pricing is null or t.task_type = p_pricing)
          and (p_payment is null or t.payment_method::text = p_payment)
          and (
            v_search is null
            or t.title ilike v_search escape '\'
            or t.description ilike v_search escape '\'
          )
          and (
            p_on is null
            or (t.scheduled_at at time zone v_tz)::date = p_on
          )
          and (
            p_available is null
            or p_available = 'any'
            or (p_available = 'today' and (t.scheduled_at at time zone v_tz)::date = (now() at time zone v_tz)::date)
            or (p_available = 'week' and t.scheduled_at >= now() and t.scheduled_at < now() + interval '7 days')
          )
      ) ranked
      where ranked.ord <= 60
    ) s
    ) listed
  ), '[]'::jsonb);
end;
$$;
