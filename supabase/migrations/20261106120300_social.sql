-- Reviews, direct payments, profiles, activity, chat, and notifications.

create or replace function public.create_review(
  p_task_id uuid,
  p_rating integer,
  p_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_task public.tasks%rowtype;
  v_reviewee uuid;
begin
  perform public.assert_can_participate();
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Choose a rating from 1 to 5';
  end if;
  if p_comment is not null and char_length(trim(p_comment)) > 600 then
    raise exception 'Keep the review under 600 characters';
  end if;
  perform public.assert_safe_text(coalesce(p_comment, ''));
  select * into v_task from public.tasks where id = p_task_id for update;
  if not found or v_task.status <> 'completed' then
    raise exception 'Reviews are available after the task is completed';
  end if;
  if v_uid = v_task.requester_id then
    v_reviewee := v_task.assigned_helper_id;
  elsif v_uid = v_task.assigned_helper_id then
    v_reviewee := v_task.requester_id;
  else
    raise exception 'You cannot review this task';
  end if;
  if v_reviewee is null then
    raise exception 'You cannot review this task';
  end if;
  if exists (select 1 from public.reviews where task_id = p_task_id and reviewer_id = v_uid) then
    raise exception 'You have already reviewed this task';
  end if;
  perform 1 from public.users where id = v_reviewee for update;
  insert into public.reviews (task_id, reviewer_id, reviewee_id, rating, comment)
  values (p_task_id, v_uid, v_reviewee, p_rating, nullif(trim(coalesce(p_comment, '')), ''));
  update public.users
  set rating_count = rating_count + 1,
      rating_avg = round(((rating_avg * rating_count) + p_rating)::numeric / (rating_count + 1), 2),
      updated_at = now()
  where id = v_reviewee;
  perform public.notify(v_reviewee, 'New review', 'You received a review for "' || v_task.title || '".', 'review', p_task_id);
  return jsonb_build_object('task_id', p_task_id, 'reviewee_id', v_reviewee, 'title', v_task.title);
end;
$$;

create or replace function public.record_direct_payment(
  p_task_id uuid,
  p_amount numeric,
  p_method text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_task public.tasks%rowtype;
  v_pay public.payments%rowtype;
  v_is_payer boolean;
  v_paid boolean;
begin
  perform public.assert_can_participate();
  if p_amount is null or p_amount <= 0 or p_amount > 100000 then
    raise exception 'Enter a valid amount';
  end if;
  if p_method not in ('cash', 'upi') then
    raise exception 'Direct payments are cash or UPI';
  end if;
  if p_note is not null and char_length(p_note) > 300 then
    raise exception 'Keep the note under 300 characters';
  end if;

  select * into v_task from public.tasks where id = p_task_id for update;
  if not found then
    raise exception 'Task not found';
  end if;
  if v_uid <> v_task.requester_id and v_uid is distinct from v_task.assigned_helper_id then
    raise exception 'Only the people on this task can record a payment';
  end if;
  if v_task.assigned_helper_id is null or v_task.status not in ('assigned', 'in_progress', 'completion_pending', 'completed') then
    raise exception 'Payment can be recorded after a helper is assigned';
  end if;
  if exists (
    select 1 from public.payments
    where task_id = p_task_id and payment_provider is not null and status = 'paid'
  ) then
    raise exception 'This task already has a verified gateway payment';
  end if;

  v_is_payer := v_uid = v_task.requester_id;
  select * into v_pay from public.payments where task_id = p_task_id and payment_provider is null for update;

  if found and v_pay.status = 'paid' then
    raise exception 'This payment is already confirmed by both people';
  end if;
  if found and (
    (v_pay.confirmed_by_payer and not v_is_payer)
    or (v_pay.confirmed_by_receiver and v_is_payer)
  ) and (v_pay.amount <> p_amount or v_pay.payment_method::text <> p_method) then
    raise exception 'Confirm the amount and method already recorded. Ask the other person to correct it if it is wrong.';
  end if;

  if not found then
    insert into public.payments (
      task_id, payer_id, receiver_id, amount, payment_method, status, verification, note,
      confirmed_by_payer, confirmed_by_receiver
    ) values (
      p_task_id, v_task.requester_id, v_task.assigned_helper_id, p_amount, p_method::public.payment_method,
      'pending', 'self_reported', nullif(trim(coalesce(p_note, '')), ''),
      v_is_payer, not v_is_payer
    ) returning * into v_pay;
  else
    update public.payments set
      amount = p_amount,
      payment_method = p_method::public.payment_method,
      note = coalesce(nullif(trim(coalesce(p_note, '')), ''), note),
      confirmed_by_payer = confirmed_by_payer or v_is_payer,
      confirmed_by_receiver = confirmed_by_receiver or (not v_is_payer),
      updated_at = now()
    where id = v_pay.id
    returning * into v_pay;
  end if;

  v_paid := v_pay.confirmed_by_payer and v_pay.confirmed_by_receiver;
  if v_paid then
    update public.payments set status = 'paid', updated_at = now() where id = v_pay.id;
  end if;
  update public.tasks
  set payment_status = case when v_paid then 'paid'::public.payment_status else 'pending'::public.payment_status end,
      updated_at = now()
  where id = p_task_id;

  perform public.notify(
    case when v_is_payer then v_task.assigned_helper_id else v_task.requester_id end,
    'Payment update',
    'A cash or UPI payment was recorded for "' || v_task.title || '". It stays self-reported until both people confirm.',
    'payment',
    p_task_id
  );

  return jsonb_build_object(
    'id', v_pay.id,
    'task_id', p_task_id,
    'amount', p_amount,
    'status', case when v_paid then 'paid' else 'pending' end,
    'verification', 'self_reported',
    'confirmed_by_payer', v_pay.confirmed_by_payer,
    'confirmed_by_receiver', v_pay.confirmed_by_receiver,
    'label', 'Self-reported',
    'other_id', case when v_is_payer then v_task.assigned_helper_id else v_task.requester_id end,
    'title', v_task.title
  );
end;
$$;

create or replace function public.get_public_profile(p_user_id uuid)
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
    'avatar_url', u.avatar_url,
    'bio', u.bio,
    'neighbourhood', case when coalesce((u.privacy_settings->>'show_neighbourhood')::boolean, true) then u.neighbourhood else null end,
    'services_offered', u.services_offered,
    'verification_status', u.verification_status,
    'rating_avg', u.rating_avg,
    'rating_count', u.rating_count,
    'completed_count', u.completed_count,
    'created_at', u.created_at,
    'skills', coalesce((
      select jsonb_agg(s.skill_name order by s.skill_name) from public.user_skills s where s.user_id = u.id
    ), '[]'::jsonb),
    'reviews', coalesce((
      select jsonb_agg(jsonb_build_object(
        'rating', r.rating,
        'comment', r.comment,
        'created_at', r.created_at,
        'reviewer_name', reviewer.full_name,
        'reviewer_avatar', reviewer.avatar_url
      ) order by r.created_at desc)
      from (
        select rev.rating, rev.comment, rev.created_at, rev.reviewer_id
        from public.reviews rev
        where rev.reviewee_id = u.id
        order by rev.created_at desc
        limit 20
      ) r
      join public.users reviewer on reviewer.id = r.reviewer_id
    ), '[]'::jsonb)
  ) into result
  from public.users u
  where u.id = p_user_id
    and (u.is_suspended = false or u.id = auth.uid() or public.is_admin());
  if result is null then
    raise exception 'Profile not found';
  end if;
  return result;
end;
$$;

create or replace function public.get_activities(p_tab text)
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
  if p_tab not in ('posted', 'applied', 'active', 'completed', 'cancelled') then
    raise exception 'That activity tab is not available';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(s) order by s.updated_at desc)
    from (
      select
        t.id,
        t.title,
        t.status,
        t.task_type,
        t.budget,
        t.hourly_rate,
        t.final_amount,
        t.payment_method,
        t.payment_status,
        t.scheduled_at,
        t.public_location_label,
        t.updated_at,
        c.name as category_name,
        c.icon as category_icon,
        case when t.requester_id = v_uid then 'requester' else 'helper' end as viewer_role,
        a.status as application_status,
        case when t.requester_id = v_uid then hu.full_name else ru.full_name end as counterpart_name,
        case when t.requester_id = v_uid then hu.avatar_url else ru.avatar_url end as counterpart_avatar
      from public.tasks t
      join public.categories c on c.id = t.category_id
      join public.users ru on ru.id = t.requester_id
      left join public.users hu on hu.id = t.assigned_helper_id
      left join public.applications a on a.task_id = t.id and a.helper_id = v_uid
      where
        (p_tab = 'posted' and t.requester_id = v_uid)
        or (p_tab = 'applied' and a.id is not null and t.requester_id <> v_uid)
        or (p_tab = 'active' and t.status in ('assigned', 'in_progress', 'completion_pending', 'disputed') and (t.requester_id = v_uid or t.assigned_helper_id = v_uid))
        or (p_tab = 'completed' and t.status = 'completed' and (t.requester_id = v_uid or t.assigned_helper_id = v_uid))
        or (p_tab = 'cancelled' and t.status = 'cancelled' and (t.requester_id = v_uid or t.assigned_helper_id = v_uid or a.id is not null))
      order by t.updated_at desc
      limit 100
    ) s
  ), '[]'::jsonb);
end;
$$;

create or replace function public.get_earnings()
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
  return jsonb_build_object(
    'verified_total', coalesce((
      select sum(amount) from public.payments
      where receiver_id = v_uid and status = 'paid' and verification = 'gateway_verified'
    ), 0),
    'reported_total', coalesce((
      select sum(amount) from public.payments
      where receiver_id = v_uid and status = 'paid' and verification = 'self_reported'
    ), 0),
    'pending_total', coalesce((
      select sum(amount) from public.payments
      where receiver_id = v_uid and status in ('pending', 'unpaid')
    ), 0),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'task_id', p.task_id,
        'task_title', t.title,
        'amount', p.amount,
        'status', p.status,
        'payment_method', p.payment_method,
        'payment_provider', p.payment_provider,
        'verification', p.verification,
        'label', case
          when p.verification = 'gateway_verified' then 'Verified by payment provider'
          when p.verification = 'self_reported' then 'Self-reported'
          else 'Not verified'
        end,
        'direction', case when p.receiver_id = v_uid then 'received' else 'paid' end,
        'confirmed_by_payer', p.confirmed_by_payer,
        'confirmed_by_receiver', p.confirmed_by_receiver,
        'created_at', p.created_at
      ) order by p.created_at desc)
      from public.payments p
      join public.tasks t on t.id = p.task_id
      where p.receiver_id = v_uid or p.payer_id = v_uid
    ), '[]'::jsonb),
    'awaiting_record', coalesce((
      select jsonb_agg(jsonb_build_object(
        'task_id', t.id,
        'title', t.title,
        'amount', coalesce(t.final_amount, t.budget, t.hourly_rate),
        'payment_method', t.payment_method,
        'payment_status', t.payment_status
      ))
      from public.tasks t
      where t.assigned_helper_id = v_uid
        and t.status = 'completed'
        and t.payment_status in ('unpaid', 'pending')
        and not exists (
          select 1 from public.payments p
          where p.task_id = t.id and p.status = 'paid'
        )
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.list_conversations()
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
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id,
      'task_id', c.task_id,
      'task_title', t.title,
      'task_status', t.status,
      'updated_at', coalesce(last_msg.created_at, c.created_at),
      'last_message', last_msg.content,
      'last_attachment', last_msg.attachment_url is not null,
      'unread_count', (
        select count(*) from public.messages m
        where m.conversation_id = c.id and m.sender_id <> v_uid and m.read_at is null
      ),
      'other_user', jsonb_build_object(
        'id', other.id,
        'full_name', other.full_name,
        'avatar_url', other.avatar_url,
        'rating_avg', other.rating_avg
      )
    ) order by coalesce(last_msg.created_at, c.created_at) desc)
    from public.conversations c
    join public.tasks t on t.id = c.task_id
    join public.users other on other.id = case when c.requester_id = v_uid then c.helper_id else c.requester_id end
    left join lateral (
      select content, attachment_url, created_at
      from public.messages m
      where m.conversation_id = c.id
      order by m.created_at desc
      limit 1
    ) last_msg on true
    where c.requester_id = v_uid or c.helper_id = v_uid
  ), '[]'::jsonb);
end;
$$;

create or replace function public.get_conversation(p_conversation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_conversation public.conversations%rowtype;
  result jsonb;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  select * into v_conversation from public.conversations where id = p_conversation_id;
  if not found or (v_conversation.requester_id <> v_uid and v_conversation.helper_id <> v_uid and not public.is_admin()) then
    raise exception 'Conversation not found';
  end if;
  select jsonb_build_object(
    'id', v_conversation.id,
    'task', jsonb_build_object(
      'id', t.id,
      'title', t.title,
      'status', t.status,
      'task_type', t.task_type,
      'budget', t.budget,
      'hourly_rate', t.hourly_rate,
      'final_amount', t.final_amount,
      'payment_method', t.payment_method,
      'public_location_label', t.public_location_label
    ),
    'other_user', jsonb_build_object(
      'id', other.id,
      'full_name', other.full_name,
      'avatar_url', other.avatar_url,
      'rating_avg', other.rating_avg,
      'rating_count', other.rating_count
    ),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'sender_id', m.sender_id,
        'content', m.content,
        'attachment_url', m.attachment_url,
        'created_at', m.created_at,
        'read_at', m.read_at
      ) order by m.created_at)
      from (
        select * from public.messages
        where conversation_id = v_conversation.id
        order by created_at desc
        limit 200
      ) m
    ), '[]'::jsonb)
  ) into result
  from public.tasks t
  join public.users other on other.id = case when v_conversation.requester_id = v_uid then v_conversation.helper_id else v_conversation.requester_id end
  where t.id = v_conversation.task_id;
  return result;
end;
$$;

create or replace function public.send_message(
  p_conversation_id uuid,
  p_content text,
  p_attachment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_conversation public.conversations%rowtype;
  v_other uuid;
  v_content text := trim(coalesce(p_content, ''));
  v_id uuid;
  v_created timestamptz;
begin
  perform public.assert_can_participate();
  select * into v_conversation from public.conversations where id = p_conversation_id;
  if not found or (v_conversation.requester_id <> v_uid and v_conversation.helper_id <> v_uid) then
    raise exception 'Conversation not found';
  end if;
  v_other := case when v_conversation.requester_id = v_uid then v_conversation.helper_id else v_conversation.requester_id end;
  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = v_uid and b.blocked_id = v_other)
       or (b.blocker_id = v_other and b.blocked_id = v_uid)
  ) then
    raise exception 'You cannot message this person';
  end if;
  if p_attachment is not null and p_attachment !~ ('^' || v_uid::text || '/[A-Za-z0-9._-]+$') then
    raise exception 'Upload the photo through Nabor before sending it';
  end if;
  if char_length(v_content) = 0 and p_attachment is null then
    raise exception 'Write a message or attach a photo';
  end if;
  if char_length(v_content) > 2000 then
    raise exception 'Keep the message under 2000 characters';
  end if;
  perform public.assert_safe_text(v_content);
  insert into public.messages (conversation_id, sender_id, content, attachment_url)
  values (p_conversation_id, v_uid, v_content, p_attachment)
  returning id, created_at into v_id, v_created;
  perform public.notify(
    v_other,
    'New message',
    case when char_length(v_content) = 0 then 'Sent a photo' else left(v_content, 140) end,
    'message',
    v_conversation.task_id
  );
  return jsonb_build_object(
    'id', v_id,
    'conversation_id', p_conversation_id,
    'sender_id', v_uid,
    'content', v_content,
    'attachment_url', p_attachment,
    'created_at', v_created,
    'recipient_id', v_other,
    'task_id', v_conversation.task_id
  );
end;
$$;

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
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
    select 1 from public.conversations c
    where c.id = p_conversation_id and (c.requester_id = v_uid or c.helper_id = v_uid)
  ) then
    raise exception 'Conversation not found';
  end if;
  update public.messages
  set read_at = now()
  where conversation_id = p_conversation_id and sender_id <> v_uid and read_at is null;
end;
$$;

create or replace function public.list_notifications()
returns jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', n.id,
    'title', n.title,
    'message', n.message,
    'type', n.type,
    'related_task_id', n.related_task_id,
    'is_read', n.is_read,
    'created_at', n.created_at
  ) order by n.created_at desc), '[]'::jsonb)
  from (
    select * from public.notifications
    where user_id = auth.uid()
    order by created_at desc
    limit 50
  ) n;
$$;

create or replace function public.mark_notifications_read(p_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  update public.notifications
  set is_read = true
  where user_id = auth.uid() and (p_id is null or id = p_id);
end;
$$;

create or replace function public.touch_last_seen()
returns void
language sql
security definer
set search_path = public, auth
as $$
  update public.users set last_seen_at = now() where id = auth.uid();
$$;
