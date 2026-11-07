-- Row level security, grants, storage, and realtime.
-- Authenticated clients cannot update privileged columns or payment verification.

create or replace function public.protect_user_privileges()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('postgres', 'supabase_admin', 'service_role') then
    new.role := old.role;
    new.is_suspended := old.is_suspended;
    new.verification_status := old.verification_status;
    new.rating_avg := old.rating_avg;
    new.rating_count := old.rating_count;
    new.completed_count := old.completed_count;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_user_privileges on public.users;
create trigger protect_user_privileges
  before update on public.users
  for each row execute function public.protect_user_privileges();

create or replace function public.protect_payment_verification()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('postgres', 'supabase_admin', 'service_role') then
    if new.verification = 'gateway_verified' and new.verification is distinct from old.verification then
      raise exception 'Payment verification cannot be set from the client';
    end if;
    if new.payment_provider is distinct from old.payment_provider or new.provider_reference is distinct from old.provider_reference then
      raise exception 'Payment provider details cannot be changed from the client';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_payment_verification on public.payments;
create trigger protect_payment_verification
  before update on public.payments
  for each row execute function public.protect_payment_verification();

alter table public.users enable row level security;
alter table public.categories enable row level security;
alter table public.tasks enable row level security;
alter table public.task_private_locations enable row level security;
alter table public.task_images enable row level security;
alter table public.applications enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.reviews enable row level security;
alter table public.payments enable row level security;
alter table public.notifications enable row level security;
alter table public.reports enable row level security;
alter table public.saved_tasks enable row level security;
alter table public.user_skills enable row level security;
alter table public.blocks enable row level security;

DROP POLICY IF EXISTS "users_select_own" ON public.users;
create policy users_select_own on public.users
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

DROP POLICY IF EXISTS "categories_select" ON public.categories;
create policy categories_select on public.categories
  for select to anon, authenticated
  using (is_active or public.is_admin());

DROP POLICY IF EXISTS "tasks_select" ON public.tasks;
create policy tasks_select on public.tasks
  for select to authenticated
  using (
    public.is_admin()
    or requester_id = auth.uid()
    or assigned_helper_id = auth.uid()
    or exists (
      select 1 from public.applications a
      where a.task_id = tasks.id and a.helper_id = auth.uid()
    )
    or (
      status in ('open', 'applications_received')
      and exists (
        select 1 from public.categories c
        where c.id = tasks.category_id
          and c.is_active
          and c.min_age <= coalesce(public.current_user_age(), 0)
      )
      and public.can_discover_requester(requester_id)
    )
  );

DROP POLICY IF EXISTS "task_private_select" ON public.task_private_locations;
create policy task_private_select on public.task_private_locations
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.tasks t
      where t.id = task_private_locations.task_id
        and (t.requester_id = auth.uid() or t.assigned_helper_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "task_images_select" ON public.task_images;
create policy task_images_select on public.task_images
  for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_images.task_id));

DROP POLICY IF EXISTS "applications_select" ON public.applications;
create policy applications_select on public.applications
  for select to authenticated
  using (
    public.is_admin()
    or helper_id = auth.uid()
    or exists (
      select 1 from public.tasks t
      where t.id = applications.task_id and t.requester_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "conversations_select" ON public.conversations;
create policy conversations_select on public.conversations
  for select to authenticated
  using (public.is_admin() or requester_id = auth.uid() or helper_id = auth.uid());

DROP POLICY IF EXISTS "messages_select" ON public.messages;
create policy messages_select on public.messages
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and (c.requester_id = auth.uid() or c.helper_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "reviews_select" ON public.reviews;
create policy reviews_select on public.reviews
  for select to authenticated
  using (true);

DROP POLICY IF EXISTS "payments_select" ON public.payments;
create policy payments_select on public.payments
  for select to authenticated
  using (public.is_admin() or payer_id = auth.uid() or receiver_id = auth.uid());

DROP POLICY IF EXISTS "notifications_select" ON public.notifications;
create policy notifications_select on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

DROP POLICY IF EXISTS "reports_select" ON public.reports;
create policy reports_select on public.reports
  for select to authenticated
  using (reporter_id = auth.uid() or public.is_admin());

DROP POLICY IF EXISTS "reports_insert" ON public.reports;
create policy reports_insert on public.reports
  for insert to authenticated
  with check (reporter_id = auth.uid());

DROP POLICY IF EXISTS "saved_all" ON public.saved_tasks;
create policy saved_all on public.saved_tasks
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

DROP POLICY IF EXISTS "skills_select" ON public.user_skills;
create policy skills_select on public.user_skills
  for select to authenticated
  using (true);

DROP POLICY IF EXISTS "blocks_select" ON public.blocks;
create policy blocks_select on public.blocks
  for select to authenticated
  using (blocker_id = auth.uid());

DROP POLICY IF EXISTS "blocks_insert" ON public.blocks;
create policy blocks_insert on public.blocks
  for insert to authenticated
  with check (blocker_id = auth.uid() and blocker_id <> blocked_id);

DROP POLICY IF EXISTS "blocks_delete" ON public.blocks;
create policy blocks_delete on public.blocks
  for delete to authenticated
  using (blocker_id = auth.uid());

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to postgres, service_role;
grant all on all sequences in schema public to postgres, service_role;

grant select on public.users to authenticated;
grant select on public.categories to anon, authenticated;
grant select on public.tasks to authenticated;
grant select on public.task_private_locations to authenticated;
grant select on public.task_images to authenticated;
grant select on public.applications to authenticated;
grant select on public.conversations to authenticated;
grant select on public.messages to authenticated;
grant select on public.reviews to authenticated;
grant select on public.payments to authenticated;
grant select on public.notifications to authenticated;
grant select, insert on public.reports to authenticated;
grant select, insert, delete on public.saved_tasks to authenticated;
grant select on public.user_skills to authenticated;
grant select, insert, delete on public.blocks to authenticated;

revoke all on function public.notify(uuid, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.assert_safe_text(text) from public, anon, authenticated;
revoke all on function public.assert_can_participate() from public, anon, authenticated;
revoke all on function public.fuzz_geography(double precision, double precision) from public, anon, authenticated;
revoke all on function public.protect_user_privileges() from public, anon, authenticated;
revoke all on function public.protect_payment_verification() from public, anon, authenticated;
grant execute on function public.notify(uuid, text, text, text, uuid) to postgres;
grant execute on function public.assert_safe_text(text) to postgres;
grant execute on function public.assert_can_participate() to postgres;
grant execute on function public.fuzz_geography(double precision, double precision) to postgres;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.current_user_age() to authenticated;
grant execute on function public.can_discover_requester(uuid) to authenticated;
grant execute on function public.list_categories() to anon, authenticated;
grant execute on function public.nearby_tasks(double precision, double precision, integer, uuid, numeric, numeric, text, text, text, date, text, text, text) to authenticated;
grant execute on function public.get_task(uuid, double precision, double precision) to authenticated;
grant execute on function public.create_task(text, text, uuid, text, numeric, numeric, text, double precision, double precision, text, text, timestamptz, timestamptz, boolean, text[]) to authenticated;
grant execute on function public.get_applications(uuid) to authenticated;
grant execute on function public.apply_to_task(uuid, text, numeric) to authenticated;
grant execute on function public.withdraw_application(uuid) to authenticated;
grant execute on function public.accept_application(uuid) to authenticated;
grant execute on function public.reject_application(uuid) to authenticated;
grant execute on function public.cancel_task(uuid, text) to authenticated;
grant execute on function public.start_task(uuid) to authenticated;
grant execute on function public.submit_completion(uuid, numeric) to authenticated;
grant execute on function public.confirm_completion(uuid) to authenticated;
grant execute on function public.dispute_task(uuid, text) to authenticated;
grant execute on function public.create_review(uuid, integer, text) to authenticated;
grant execute on function public.record_direct_payment(uuid, numeric, text, text) to authenticated;
grant execute on function public.own_profile() to authenticated;
grant execute on function public.update_profile(text, text, text, text, date, text, text, text, double precision, double precision, text[], jsonb, jsonb, integer) to authenticated;
grant execute on function public.get_public_profile(uuid) to authenticated;
grant execute on function public.get_activities(text) to authenticated;
grant execute on function public.get_earnings() to authenticated;
grant execute on function public.list_conversations() to authenticated;
grant execute on function public.get_conversation(uuid) to authenticated;
grant execute on function public.send_message(uuid, text, text) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.list_notifications() to authenticated;
grant execute on function public.mark_notifications_read(uuid) to authenticated;
grant execute on function public.touch_last_seen() to authenticated;

-- Default privileges grant execute to PUBLIC. Remove that so anonymous clients
-- cannot call functions that were also granted to signed-in users.
revoke all on function public.is_admin() from public;
revoke all on function public.current_user_age() from public;
revoke all on function public.can_discover_requester(uuid) from public;
revoke all on function public.list_categories() from public;
revoke all on function public.nearby_tasks(double precision, double precision, integer, uuid, numeric, numeric, text, text, text, date, text, text, text) from public;
revoke all on function public.get_task(uuid, double precision, double precision) from public;
revoke all on function public.create_task(text, text, uuid, text, numeric, numeric, text, double precision, double precision, text, text, timestamptz, timestamptz, boolean, text[]) from public;
revoke all on function public.get_applications(uuid) from public;
revoke all on function public.apply_to_task(uuid, text, numeric) from public;
revoke all on function public.withdraw_application(uuid) from public;
revoke all on function public.accept_application(uuid) from public;
revoke all on function public.reject_application(uuid) from public;
revoke all on function public.cancel_task(uuid, text) from public;
revoke all on function public.start_task(uuid) from public;
revoke all on function public.submit_completion(uuid, numeric) from public;
revoke all on function public.confirm_completion(uuid) from public;
revoke all on function public.dispute_task(uuid, text) from public;
revoke all on function public.create_review(uuid, integer, text) from public;
revoke all on function public.record_direct_payment(uuid, numeric, text, text) from public;
revoke all on function public.own_profile() from public;
revoke all on function public.update_profile(text, text, text, text, date, text, text, text, double precision, double precision, text[], jsonb, jsonb, integer) from public;
revoke all on function public.get_public_profile(uuid) from public;
revoke all on function public.get_activities(text) from public;
revoke all on function public.get_earnings() from public;
revoke all on function public.list_conversations() from public;
revoke all on function public.get_conversation(uuid) from public;
revoke all on function public.send_message(uuid, text, text) from public;
revoke all on function public.mark_conversation_read(uuid) from public;
revoke all on function public.list_notifications() from public;
revoke all on function public.mark_notifications_read(uuid) from public;
revoke all on function public.touch_last_seen() from public;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']::text[]),
  ('task-images', 'task-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']::text[]),
  ('message-attachments', 'message-attachments', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']::text[])
on conflict (id) do nothing;
DROP POLICY IF EXISTS "avatars_read" ON storage.objects;
create policy avatars_read on storage.objects
  for select to public
  using (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_insert" ON storage.objects;
create policy avatars_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatars_update" ON storage.objects;
create policy avatars_update on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatars_delete" ON storage.objects;
create policy avatars_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "task_images_read" ON storage.objects;
create policy task_images_read on storage.objects
  for select to public
  using (bucket_id = 'task-images');

DROP POLICY IF EXISTS "task_images_insert" ON storage.objects;
create policy task_images_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'task-images' and (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "task_images_delete" ON storage.objects;
create policy task_images_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'task-images' and (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "message_files_insert" ON storage.objects;
create policy message_files_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'message-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "message_files_read_own" ON storage.objects;
create policy message_files_read_own on storage.objects
  for select to authenticated
  using (bucket_id = 'message-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

alter table public.messages replica identity full;
alter table public.notifications replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when others then
  raise notice 'Messages realtime publication was not changed: %', sqlerrm;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception when others then
  raise notice 'Notifications realtime publication was not changed: %', sqlerrm;
end $$;
