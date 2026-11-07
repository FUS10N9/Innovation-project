-- Task reads, creation, applications, and the status lifecycle.

create or replace function public.get_task(
  p_task_id uuid,
  p_lat double precision default null,
  p_lng double precision default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, auth
as $$
declare
  v_uid uuid := auth.uid();
  result jsonb;
  origin geography;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_lat is not null and p_lng is not null then
    origin := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;
  end if;

  select jsonb_build_object(
    'id', t.id,
    'title', t.title,
    'description', t.description,
    'task_type', t.task_type,
    'budget', t.budget,
    'hourly_rate', t.hourly_rate,
    'payment_method', t.payment_method,
    'payment_status', case when t.requester_id = v_uid or t.assigned_helper_id = v_uid then t.payment_status else null end,
    'final_amount', case when t.requester_id = v_uid or t.assigned_helper_id = v_uid then t.final_amount else null end,
    'public_location_label', t.public_location_label,
    'latitude', ST_Y(t.location::geometry),
    'longitude', ST_X(t.location::geometry),
    'distance_m', case when origin is null then null else round(ST_Distance(t.location, origin))::integer end,
    'scheduled_at', t.scheduled_at,
    'deadline', t.deadline,
    'status', t.status,
    'allow_negotiation', t.allow_negotiation,
    'created_at', t.created_at,
    'updated_at', t.updated_at,
    'dispute_reason', case when t.requester_id = v_uid or t.assigned_helper_id = v_uid or public.is_admin() then t.dispute_reason else null end,
    'cancelled_reason', t.cancelled_reason,
    'category_id', c.id,
    'category_name', c.name,
    'category_icon', c.icon,
    'parent_category_name', parent.name,
    'requester_id', ru.id,
    'requester_name', ru.full_name,
    'requester_avatar', ru.avatar_url,
    'requester_rating', ru.rating_avg,
    'requester_rating_count', ru.rating_count,
    'requester_completed_count', ru.completed_count,
    'requester_neighbourhood', case when coalesce((ru.privacy_settings->>'show_neighbourhood')::boolean, true) then ru.neighbourhood else null end,
    'helper_id', hu.id,
    'helper_name', hu.full_name,
    'helper_avatar', hu.avatar_url,
    'helper_rating', hu.rating_avg,
    'helper_rating_count', hu.rating_count,
    'application_count', (select count(*) from public.applications a where a.task_id = t.id),
    'saved', exists(select 1 from public.saved_tasks sv where sv.task_id = t.id and sv.user_id = v_uid),
    'viewer_role', case
      when t.requester_id = v_uid then 'requester'
      when t.assigned_helper_id = v_uid then 'helper'
      when exists (select 1 from public.applications a where a.task_id = t.id and a.helper_id = v_uid) then 'applicant'
      else 'visitor'
    end,
    'my_application', (
      select jsonb_build_object('id', a.id, 'status', a.status, 'message', a.message, 'proposed_price', a.proposed_price, 'created_at', a.created_at)
      from public.applications a
      where a.task_id = t.id and a.helper_id = v_uid
    ),
    'my_review', (
      select jsonb_build_object('rating', r.rating, 'comment', r.comment)
      from public.reviews r
      where r.task_id = t.id and r.reviewer_id = v_uid
    ),
    'conversation_id', (
      select cv.id from public.conversations cv
      where cv.task_id = t.id and (cv.requester_id = v_uid or cv.helper_id = v_uid)
    ),
    'images', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'url', i.url) order by i.created_at)
      from public.task_images i where i.task_id = t.id
    ), '[]'::jsonb),
    'exact_location', case
      when t.requester_id = v_uid or t.assigned_helper_id = v_uid or public.is_admin() then (
        select jsonb_build_object(
          'latitude', ST_Y(pl.exact_location::geometry),
          'longitude', ST_X(pl.exact_location::geometry),
          'address', pl.address_line
        )
        from public.task_private_locations pl where pl.task_id = t.id
      )
      else null
    end,
    'payment', case
      when t.requester_id = v_uid or t.assigned_helper_id = v_uid then (
        select jsonb_build_object(
          'id', p.id,
          'amount', p.amount,
          'status', p.status,
          'payment_method', p.payment_method,
          'payment_provider', p.payment_provider,
          'provider_reference', p.provider_reference,
          'verification', p.verification,
          'confirmed_by_payer', p.confirmed_by_payer,
          'confirmed_by_receiver', p.confirmed_by_receiver,
          'label', case
            when p.verification = 'gateway_verified' then 'Verified by payment provider'
            when p.verification = 'self_reported' then 'Self-reported'
            else 'Not verified'
          end
        )
        from public.payments p
        where p.task_id = t.id
        order by p.created_at desc
        limit 1
      )
      else null
    end
  ) into result
  from public.tasks t
  join public.categories c on c.id = t.category_id
  left join public.categories parent on parent.id = c.parent_id
  join public.users ru on ru.id = t.requester_id
  left join public.users hu on hu.id = t.assigned_helper_id
  where t.id = p_task_id
    and (
      public.is_admin()
      or t.requester_id = v_uid
      or t.assigned_helper_id = v_uid
      or exists (select 1 from public.applications a where a.task_id = t.id and a.helper_id = v_uid)
      or (
        t.status in ('open', 'applications_received')
        and c.is_active
        and c.min_age <= coalesce(public.current_user_age(), 0)
        and public.can_discover_requester(t.requester_id)
      )
    );

  if result is null then
    raise exception 'Task not found';
  end if;
  return result;
end;
$$;

create or replace function public.create_task(
  p_title text,
  p_description text,
  p_category_id uuid,
  p_task_type text,
  p_budget numeric,
  p_hourly_rate numeric,
  p_payment_method text,
  p_lat double precision,
  p_lng double precision,
  p_address text,
  p_public_label text,
  p_scheduled_at timestamptz,
  p_deadline timestamptz,
  p_allow_negotiation boolean default true,
  p_image_urls text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_category public.categories%rowtype;
  v_id uuid;
  v_url text;
  v_count integer := 0;
begin
  perform public.assert_can_participate();
  if (select count(*) from public.tasks where requester_id = v_uid and created_at > now() - interval '1 day') >= 10 then
    raise exception 'You have reached the daily limit for posting tasks';
  end if;
  if p_title is null or char_length(trim(p_title)) < 6 or char_length(trim(p_title)) > 80 then
    raise exception 'Give the task a title between 6 and 80 characters';
  end if;
  if p_description is null or char_length(trim(p_description)) < 20 or char_length(trim(p_description)) > 2000 then
    raise exception 'Describe the task in 20 to 2000 characters';
  end if;
  perform public.assert_safe_text(p_title || ' ' || p_description || ' ' || coalesce(p_public_label, '') || ' ' || coalesce(p_address, ''));
  select * into v_category from public.categories where id = p_category_id and is_active and parent_id is not null;
  if not found then
    raise exception 'Choose a specific category';
  end if;
  if coalesce(public.current_user_age(), 0) < v_category.min_age then
    raise exception 'This category is not available for your age';
  end if;
  if p_task_type not in ('fixed', 'hourly') then
    raise exception 'Choose a fixed price or an hourly rate';
  end if;
  if p_payment_method not in ('cash', 'upi') then
    raise exception 'Choose cash or UPI';
  end if;
  if p_task_type = 'fixed' and (p_budget is null or p_budget < 1 or p_budget > 100000 or p_hourly_rate is not null) then
    raise exception 'Enter a fixed budget between 1 and 100000';
  end if;
  if p_task_type = 'hourly' and (p_hourly_rate is null or p_hourly_rate < 1 or p_hourly_rate > 100000 or p_budget is not null) then
    raise exception 'Enter an hourly rate between 1 and 100000';
  end if;
  if p_lat is null or p_lng is null or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception 'Choose the task location';
  end if;
  if p_public_label is null or char_length(trim(p_public_label)) < 2 then
    raise exception 'Add the neighbourhood people should see';
  end if;
  if trim(p_public_label) ~ '\d{4,}' or trim(p_public_label) ~* '(flat|apartment|house no|h\.?\s?no)' then
    raise exception 'Use a neighbourhood name, not a street address';
  end if;
  if p_address is null or char_length(trim(p_address)) < 4 then
    raise exception 'Add the exact meeting spot. Only you and the chosen helper can see it.';
  end if;
  if p_scheduled_at is not null and p_scheduled_at < now() - interval '5 minutes' then
    raise exception 'Choose a time in the future';
  end if;
  if p_deadline is not null and p_deadline < now() - interval '5 minutes' then
    raise exception 'Choose a deadline in the future';
  end if;
  if p_scheduled_at is not null and p_deadline is not null and p_deadline < p_scheduled_at then
    raise exception 'The deadline needs to be after the start time';
  end if;
  if p_image_urls is not null then
    foreach v_url in array p_image_urls loop
      if v_url is null or btrim(v_url) = '' then
        continue;
      end if;
      v_count := v_count + 1;
      if v_url !~ ('^https://.+/storage/v1/object/public/task-images/' || v_uid::text || '/[A-Za-z0-9._-]+$') then
        raise exception 'Upload task photos through your account';
      end if;
    end loop;
  end if;
  if v_count > 4 then
    raise exception 'You can add up to 4 photos';
  end if;

  insert into public.tasks (
    requester_id, title, description, category_id, task_type, budget, hourly_rate,
    payment_method, location, public_location_label, scheduled_at, deadline, allow_negotiation
  ) values (
    v_uid, trim(p_title), trim(p_description), p_category_id, p_task_type,
    case when p_task_type = 'fixed' then p_budget else null end,
    case when p_task_type = 'hourly' then p_hourly_rate else null end,
    p_payment_method::public.payment_method,
    public.fuzz_geography(p_lat, p_lng),
    trim(p_public_label),
    p_scheduled_at,
    p_deadline,
    coalesce(p_allow_negotiation, true)
  ) returning id into v_id;

  insert into public.task_private_locations (task_id, exact_location, address_line)
  values (
    v_id,
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    trim(p_address)
  );

  insert into public.task_images (task_id, url)
  select v_id, u
  from unnest(coalesce(p_image_urls, array[]::text[])) as u
  where u is not null and btrim(u) <> '';

  return public.get_task(v_id, p_lat, p_lng);
end;
$$;

create or replace function public.get_applications(p_task_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (
    select 1 from public.tasks t
    where t.id = p_task_id and (t.requester_id = v_uid or public.is_admin())
  ) then
    raise exception 'Only the requester can view applications';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id,
      'message', a.message,
      'proposed_price', a.proposed_price,
      'status', a.status,
      'created_at', a.created_at,
      'helper_id', u.id,
      'helper_name', u.full_name,
      'helper_avatar', u.avatar_url,
      'helper_rating', u.rating_avg,
      'helper_rating_count', u.rating_count,
      'helper_completed_count', u.completed_count,
      'helper_neighbourhood', case when coalesce((u.privacy_settings->>'show_neighbourhood')::boolean, true) then u.neighbourhood else null end,
      'helper_bio', u.bio,
      'skills', coalesce((
        select jsonb_agg(s.skill_name order by s.skill_name)
        from public.user_skills s where s.user_id = u.id
      ), '[]'::jsonb)
    ) order by a.created_at)
    from public.applications a
    join public.users u on u.id = a.helper_id
    where a.task_id = p_task_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.apply_to_task(
  p_task_id uuid,
  p_message text,
  p_proposed_price numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_task public.tasks%rowtype;
  v_min integer;
  v_id uuid;
begin
  perform public.assert_can_participate();
  if p_message is null or char_length(trim(p_message)) < 10 then
    raise exception 'Introduce yourself in at least 10 characters';
  end if;
  if char_length(trim(p_message)) > 1000 then
    raise exception 'Keep your application under 1000 characters';
  end if;
  perform public.assert_safe_text(p_message);
  if (select count(*) from public.applications where helper_id = v_uid and created_at > now() - interval '1 day') >= 20 then
    raise exception 'You have reached the daily application limit';
  end if;

  select * into v_task from public.tasks where id = p_task_id for update;
  if not found then
    raise exception 'Task not found';
  end if;
  if v_task.requester_id = v_uid then
    raise exception 'You cannot apply to your own task';
  end if;
  if v_task.status not in ('open', 'applications_received') then
    raise exception 'This task is not accepting applications';
  end if;
  select min_age into v_min from public.categories where id = v_task.category_id and is_active;
  if v_min is null or coalesce(public.current_user_age(), 0) < v_min then
    raise exception 'This task is not available for your age';
  end if;
  if not public.can_discover_requester(v_task.requester_id) then
    raise exception 'You cannot apply to this task';
  end if;
  if exists (select 1 from public.applications where task_id = p_task_id and helper_id = v_uid) then
    raise exception 'You have already applied to this task';
  end if;
  if p_proposed_price is not null and (v_task.allow_negotiation is not true or p_proposed_price < 1 or p_proposed_price > 100000) then
    raise exception 'That proposed price is not accepted for this task';
  end if;

  insert into public.applications (task_id, helper_id, message, proposed_price)
  values (p_task_id, v_uid, trim(p_message), p_proposed_price)
  returning id into v_id;

  if v_task.status = 'open' then
    update public.tasks set status = 'applications_received', updated_at = now() where id = p_task_id;
  end if;

  perform public.notify(
    v_task.requester_id,
    'New application',
    'Someone applied to your task: ' || v_task.title,
    'application_received',
    p_task_id
  );

  return jsonb_build_object(
    'application_id', v_id,
    'task_id', p_task_id,
    'requester_id', v_task.requester_id,
    'title', v_task.title
  );
end;
$$;

create or replace function public.withdraw_application(p_application_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_app public.applications%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  select * into v_app from public.applications where id = p_application_id for update;
  if not found or v_app.helper_id <> v_uid then
    raise exception 'Application not found';
  end if;
  if v_app.status <> 'pending' then
    raise exception 'This application can no longer be withdrawn';
  end if;
  update public.applications set status = 'withdrawn' where id = v_app.id;
  if not exists (
    select 1 from public.applications where task_id = v_app.task_id and status = 'pending'
  ) then
    update public.tasks
    set status = 'open', updated_at = now()
    where id = v_app.task_id and status = 'applications_received';
  end if;
  return jsonb_build_object('application_id', v_app.id, 'task_id', v_app.task_id);
end;
$$;

create or replace function public.accept_application(p_application_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_app public.applications%rowtype;
  v_task public.tasks%rowtype;
  v_helper uuid;
  v_conversation uuid;
begin
  perform public.assert_can_participate();
  select * into v_app from public.applications where id = p_application_id for update;
  if not found then
    raise exception 'Application not found';
  end if;
  select * into v_task from public.tasks where id = v_app.task_id for update;
  if v_task.requester_id <> v_uid then
    raise exception 'Only the requester can choose a helper';
  end if;
  if v_app.status <> 'pending' then
    raise exception 'This application is no longer pending';
  end if;
  if v_task.status not in ('open', 'applications_received') then
    raise exception 'This task is no longer open';
  end if;

  update public.applications set status = 'accepted' where id = v_app.id;
  for v_helper in
    update public.applications
    set status = 'closed'
    where task_id = v_task.id and id <> v_app.id and status = 'pending'
    returning helper_id
  loop
    perform public.notify(v_helper, 'Task filled', 'Another neighbour was selected for "' || v_task.title || '".', 'application_closed', v_task.id);
  end loop;

  update public.tasks
  set status = 'assigned', assigned_helper_id = v_app.helper_id, updated_at = now()
  where id = v_task.id;

  insert into public.conversations (task_id, requester_id, helper_id)
  values (v_task.id, v_task.requester_id, v_app.helper_id)
  on conflict (task_id) do update set helper_id = excluded.helper_id
  returning id into v_conversation;

  perform public.notify(
    v_app.helper_id,
    'You were selected',
    'You can now message about "' || v_task.title || '".',
    'application_accepted',
    v_task.id
  );

  return jsonb_build_object(
    'conversation_id', v_conversation,
    'task_id', v_task.id,
    'helper_id', v_app.helper_id,
    'title', v_task.title
  );
end;
$$;

create or replace function public.reject_application(p_application_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_app public.applications%rowtype;
  v_task public.tasks%rowtype;
begin
  perform public.assert_can_participate();
  select * into v_app from public.applications where id = p_application_id for update;
  if not found then
    raise exception 'Application not found';
  end if;
  select * into v_task from public.tasks where id = v_app.task_id for update;
  if v_task.requester_id <> v_uid then
    raise exception 'Only the requester can decline an application';
  end if;
  if v_app.status <> 'pending' then
    raise exception 'This application is no longer pending';
  end if;
  update public.applications set status = 'rejected' where id = v_app.id;
  if not exists (select 1 from public.applications where task_id = v_task.id and status = 'pending') then
    update public.tasks set status = 'open', updated_at = now()
    where id = v_task.id and status = 'applications_received';
  end if;
  perform public.notify(v_app.helper_id, 'Application update', 'Your application for "' || v_task.title || '" was not selected.', 'application_rejected', v_task.id);
  return jsonb_build_object('application_id', v_app.id, 'task_id', v_task.id, 'helper_id', v_app.helper_id, 'title', v_task.title);
end;
$$;

create or replace function public.cancel_task(p_task_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_task public.tasks%rowtype;
  v_helper uuid;
begin
  perform public.assert_can_participate();
  if p_reason is null or char_length(trim(p_reason)) < 4 then
    raise exception 'Add a short reason for cancelling';
  end if;
  select * into v_task from public.tasks where id = p_task_id for update;
  if not found or v_task.requester_id <> v_uid then
    raise exception 'Only the requester can cancel this task';
  end if;
  if v_task.status not in ('open', 'applications_received', 'assigned') then
    raise exception 'This task can no longer be cancelled';
  end if;
  update public.tasks
  set status = 'cancelled', cancelled_reason = left(trim(p_reason), 300), updated_at = now()
  where id = v_task.id;
  for v_helper in
    update public.applications
    set status = 'closed'
    where task_id = v_task.id and status = 'pending'
    returning helper_id
  loop
    perform public.notify(v_helper, 'Task cancelled', '"' || v_task.title || '" was cancelled.', 'task_cancelled', v_task.id);
  end loop;
  if v_task.assigned_helper_id is not null then
    perform public.notify(v_task.assigned_helper_id, 'Task cancelled', '"' || v_task.title || '" was cancelled.', 'task_cancelled', v_task.id);
  end if;
  return jsonb_build_object('task_id', v_task.id, 'title', v_task.title);
end;
$$;

create or replace function public.start_task(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_task public.tasks%rowtype;
begin
  perform public.assert_can_participate();
  select * into v_task from public.tasks where id = p_task_id for update;
  if not found or v_task.assigned_helper_id is distinct from v_uid then
    raise exception 'Only the assigned helper can start this task';
  end if;
  if v_task.status <> 'assigned' then
    raise exception 'This task is not ready to start';
  end if;
  update public.tasks set status = 'in_progress', updated_at = now() where id = v_task.id;
  perform public.notify(v_task.requester_id, 'Task started', 'Work has started on "' || v_task.title || '".', 'task_started', v_task.id);
  return jsonb_build_object('task_id', v_task.id, 'requester_id', v_task.requester_id, 'title', v_task.title);
end;
$$;

create or replace function public.submit_completion(p_task_id uuid, p_final_amount numeric)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_task public.tasks%rowtype;
begin
  perform public.assert_can_participate();
  if p_final_amount is null or p_final_amount < 1 or p_final_amount > 100000 then
    raise exception 'Enter the final amount between 1 and 100000';
  end if;
  select * into v_task from public.tasks where id = p_task_id for update;
  if not found or v_task.assigned_helper_id is distinct from v_uid then
    raise exception 'Only the assigned helper can submit completion';
  end if;
  if v_task.status <> 'in_progress' then
    raise exception 'Start the task before submitting completion';
  end if;
  update public.tasks
  set status = 'completion_pending', final_amount = p_final_amount, updated_at = now()
  where id = v_task.id;
  perform public.notify(
    v_task.requester_id,
    'Completion submitted',
    'Confirm "' || v_task.title || '" if the work is done. Final amount: ' || p_final_amount::text || '.',
    'completion_submitted',
    v_task.id
  );
  return jsonb_build_object('task_id', v_task.id, 'requester_id', v_task.requester_id, 'title', v_task.title, 'final_amount', p_final_amount);
end;
$$;

create or replace function public.confirm_completion(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_task public.tasks%rowtype;
begin
  perform public.assert_can_participate();
  select * into v_task from public.tasks where id = p_task_id for update;
  if not found or v_task.requester_id <> v_uid then
    raise exception 'Only the requester can confirm completion';
  end if;
  if v_task.status <> 'completion_pending' then
    raise exception 'There is no completion waiting for confirmation';
  end if;
  update public.tasks
  set status = 'completed',
      payment_status = case when payment_status in ('paid', 'pending', 'disputed', 'refunded') then payment_status else 'unpaid'::public.payment_status end,
      updated_at = now()
  where id = v_task.id;
  update public.users set completed_count = completed_count + 1 where id = v_task.assigned_helper_id;
  perform public.notify(
    v_task.assigned_helper_id,
    'Task completed',
    '"' || v_task.title || '" is complete. Record the payment if you have not already.',
    'task_completed',
    v_task.id
  );
  return jsonb_build_object('task_id', v_task.id, 'helper_id', v_task.assigned_helper_id, 'title', v_task.title);
end;
$$;

create or replace function public.dispute_task(p_task_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_task public.tasks%rowtype;
  v_other uuid;
begin
  perform public.assert_can_participate();
  if p_reason is null or char_length(trim(p_reason)) < 10 then
    raise exception 'Describe the problem in at least 10 characters';
  end if;
  perform public.assert_safe_text(p_reason);
  select * into v_task from public.tasks where id = p_task_id for update;
  if not found then
    raise exception 'Task not found';
  end if;
  if v_uid <> v_task.requester_id and v_uid is distinct from v_task.assigned_helper_id then
    raise exception 'Only the people on this task can report a problem';
  end if;
  if v_task.status not in ('assigned', 'in_progress', 'completion_pending') then
    raise exception 'This task cannot be disputed in its current state';
  end if;
  v_other := case when v_uid = v_task.requester_id then v_task.assigned_helper_id else v_task.requester_id end;
  update public.tasks
  set status = 'disputed', dispute_reason = left(trim(p_reason), 500), updated_at = now()
  where id = v_task.id;
  update public.payments
  set status = 'disputed', updated_at = now()
  where task_id = v_task.id and status in ('unpaid', 'pending');
  update public.tasks set payment_status = 'disputed' where id = v_task.id and payment_status in ('unpaid', 'pending');
  insert into public.reports (reporter_id, reported_user_id, task_id, reason, description)
  values (v_uid, v_other, v_task.id, 'other', left(trim(p_reason), 1000));
  perform public.notify(v_other, 'Problem reported', 'A problem was reported on "' || v_task.title || '".', 'task_disputed', v_task.id);
  return jsonb_build_object('task_id', v_task.id, 'other_id', v_other, 'title', v_task.title);
end;
$$;
