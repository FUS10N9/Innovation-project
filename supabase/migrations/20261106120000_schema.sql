-- Nook schema. Run this file first in the Supabase SQL editor.
-- Exact addresses live in task_private_locations. The public tasks.location point is fuzzed.

create extension if not exists pgcrypto;
create extension if not exists postgis;

do $$ begin
  create type public.user_role as enum ('user', 'admin');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.verification_status as enum ('unverified', 'email_verified', 'phone_verified', 'verified', 'rejected');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.task_status as enum (
    'open',
    'applications_received',
    'assigned',
    'in_progress',
    'completion_pending',
    'completed',
    'cancelled',
    'disputed'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.application_status as enum ('pending', 'accepted', 'rejected', 'withdrawn', 'closed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.payment_method as enum ('cash', 'upi', 'gateway');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.payment_status as enum ('unpaid', 'pending', 'paid', 'refunded', 'disputed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.report_status as enum ('open', 'reviewing', 'resolved', 'dismissed');
exception when duplicate_object then null;
end $$;

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  username text,
  email text unique,
  phone text,
  avatar_url text,
  bio text,
  neighbourhood text,
  services_offered text,
  verification_status public.verification_status not null default 'unverified',
  role public.user_role not null default 'user',
  date_of_birth date,
  rating_avg numeric(3,2) not null default 0,
  rating_count integer not null default 0,
  completed_count integer not null default 0,
  is_suspended boolean not null default false,
  onboarding_completed boolean not null default false,
  notification_settings jsonb not null default '{"applications":true,"messages":true,"tasks":true,"reviews":true,"email":false}'::jsonb,
  privacy_settings jsonb not null default '{"show_neighbourhood":true}'::jsonb,
  home_lat double precision,
  home_lng double precision,
  home_location geography(Point, 4326),
  discovery_radius_m integer not null default 1000,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_username_format check (username is null or username ~ '^[a-z0-9_]{3,20}$'),
  constraint users_radius_check check (discovery_radius_m in (500, 1000, 3000, 5000)),
  constraint users_bio_len check (bio is null or char_length(bio) <= 280),
  constraint users_services_len check (services_offered is null or char_length(services_offered) <= 280),
  constraint users_name_len check (char_length(full_name) between 1 and 80),
  constraint users_rating_check check (rating_avg >= 0 and rating_avg <= 5 and rating_count >= 0)
);

create unique index if not exists users_username_lower_idx on public.users (lower(username));

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.categories (id) on delete restrict,
  name text not null,
  slug text not null unique,
  description text not null default '',
  icon text not null default 'ellipsis',
  min_age integer not null default 16,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  constraint categories_age_check check (min_age >= 16 and min_age <= 120),
  constraint categories_name_len check (char_length(name) between 2 and 60)
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.users (id) on delete restrict,
  assigned_helper_id uuid references public.users (id) on delete restrict,
  title text not null,
  description text not null,
  category_id uuid not null references public.categories (id),
  task_type text not null,
  budget numeric(12,2),
  hourly_rate numeric(12,2),
  final_amount numeric(12,2),
  payment_method public.payment_method not null,
  payment_status public.payment_status not null default 'unpaid',
  location geography(Point, 4326) not null,
  public_location_label text not null,
  scheduled_at timestamptz,
  deadline timestamptz,
  status public.task_status not null default 'open',
  allow_negotiation boolean not null default true,
  dispute_reason text,
  cancelled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_title_len check (char_length(title) between 6 and 80),
  constraint tasks_description_len check (char_length(description) between 20 and 2000),
  constraint tasks_type_check check (task_type in ('fixed', 'hourly')),
  constraint tasks_method_check check (payment_method in ('cash', 'upi')),
  constraint tasks_price_check check (
    (task_type = 'fixed' and budget is not null and hourly_rate is null and budget >= 1 and budget <= 100000)
    or
    (task_type = 'hourly' and hourly_rate is not null and budget is null and hourly_rate >= 1 and hourly_rate <= 100000)
  ),
  constraint tasks_final_amount_check check (final_amount is null or (final_amount >= 1 and final_amount <= 100000)),
  constraint tasks_schedule_check check (deadline is null or scheduled_at is null or deadline >= scheduled_at),
  constraint tasks_label_len check (char_length(public_location_label) between 2 and 80)
);

create index if not exists tasks_location_idx on public.tasks using gist (location);
create index if not exists tasks_open_idx on public.tasks (created_at desc) where status in ('open', 'applications_received');
create index if not exists tasks_requester_idx on public.tasks (requester_id, created_at desc);
create index if not exists tasks_helper_idx on public.tasks (assigned_helper_id);
create index if not exists tasks_category_idx on public.tasks (category_id);

-- Restricted exact location. Select is limited to the requester, the assigned helper, and admins.
create table if not exists public.task_private_locations (
  task_id uuid primary key references public.tasks (id) on delete cascade,
  exact_location geography(Point, 4326) not null,
  address_line text,
  created_at timestamptz not null default now(),
  constraint task_private_address_len check (address_line is null or char_length(address_line) <= 200)
);

create index if not exists task_private_location_idx on public.task_private_locations using gist (exact_location);

create table if not exists public.task_images (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  url text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  helper_id uuid not null references public.users (id) on delete cascade,
  message text not null,
  proposed_price numeric(12,2),
  status public.application_status not null default 'pending',
  created_at timestamptz not null default now(),
  constraint applications_unique unique (task_id, helper_id),
  constraint applications_message_len check (char_length(message) between 10 and 1000),
  constraint applications_price_check check (proposed_price is null or (proposed_price >= 1 and proposed_price <= 100000))
);

create index if not exists applications_helper_idx on public.applications (helper_id, created_at desc);
create index if not exists applications_task_idx on public.applications (task_id, status);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null unique references public.tasks (id) on delete cascade,
  requester_id uuid not null references public.users (id) on delete cascade,
  helper_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists conversations_requester_idx on public.conversations (requester_id);
create index if not exists conversations_helper_idx on public.conversations (helper_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.users (id) on delete cascade,
  content text not null default '',
  attachment_url text,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint messages_body_check check (
    char_length(content) <= 2000
    and (char_length(btrim(content)) > 0 or attachment_url is not null)
  )
);

create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete restrict,
  reviewer_id uuid not null references public.users (id) on delete cascade,
  reviewee_id uuid not null references public.users (id) on delete cascade,
  rating integer not null,
  comment text,
  created_at timestamptz not null default now(),
  constraint reviews_unique unique (task_id, reviewer_id),
  constraint reviews_rating_check check (rating between 1 and 5),
  constraint reviews_comment_len check (comment is null or char_length(comment) <= 600),
  constraint reviews_not_self check (reviewer_id <> reviewee_id)
);

create index if not exists reviews_reviewee_idx on public.reviews (reviewee_id, created_at desc);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete restrict,
  payer_id uuid not null references public.users (id) on delete restrict,
  receiver_id uuid not null references public.users (id) on delete restrict,
  amount numeric(12,2) not null,
  payment_method public.payment_method not null,
  payment_provider text,
  provider_reference text,
  provider_payment_id text,
  status public.payment_status not null default 'pending',
  verification text,
  note text,
  confirmed_by_payer boolean not null default false,
  confirmed_by_receiver boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_amount_check check (amount > 0 and amount <= 100000),
  constraint payments_verification_check check (verification is null or verification in ('self_reported', 'gateway_verified')),
  constraint payments_gateway_verified_check check (verification is distinct from 'gateway_verified' or payment_provider is not null),
  constraint payments_note_len check (note is null or char_length(note) <= 300)
);

create unique index if not exists payments_direct_task_idx
  on public.payments (task_id) where payment_provider is null;
create unique index if not exists payments_provider_ref_idx
  on public.payments (payment_provider, provider_reference) where provider_reference is not null;
create unique index if not exists payments_one_open_gateway_idx
  on public.payments (task_id) where payment_provider is not null and status in ('pending', 'unpaid');
create index if not exists payments_receiver_idx on public.payments (receiver_id, created_at desc);
create index if not exists payments_payer_idx on public.payments (payer_id, created_at desc);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  title text not null,
  message text not null,
  type text not null,
  related_task_id uuid references public.tasks (id) on delete set null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.users (id) on delete cascade,
  reported_user_id uuid references public.users (id) on delete set null,
  task_id uuid references public.tasks (id) on delete set null,
  reason text not null,
  description text not null,
  status public.report_status not null default 'open',
  created_at timestamptz not null default now(),
  constraint reports_reason_check check (reason in ('safety', 'spam', 'harassment', 'scam', 'prohibited', 'other')),
  constraint reports_description_len check (char_length(description) between 10 and 1000),
  constraint reports_target_check check (reported_user_id is not null or task_id is not null),
  constraint reports_not_self check (reported_user_id is null or reported_user_id <> reporter_id)
);

create index if not exists reports_status_idx on public.reports (status, created_at desc);

create table if not exists public.saved_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint saved_tasks_unique unique (user_id, task_id)
);

create table if not exists public.user_skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  skill_name text not null,
  created_at timestamptz not null default now(),
  constraint user_skills_unique unique (user_id, skill_name),
  constraint user_skills_name_len check (char_length(skill_name) between 2 and 40)
);

create table if not exists public.blocks (
  blocker_id uuid not null references public.users (id) on delete cascade,
  blocked_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(coalesce(new.email, 'neighbour'), '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

insert into public.categories (id, parent_id, name, slug, description, icon, min_age, sort_order) values
  ('10000000-0000-4000-8000-000000000001', null, 'Daily Errands', 'daily-errands', 'Everyday errands around the neighbourhood.', 'shopping-bag', 16, 10),
  ('10000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000001', 'Grocery shopping', 'grocery-shopping', 'Pick up groceries and everyday supplies.', 'shopping-bag', 16, 11),
  ('10000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000001', 'Parcel collection', 'parcel-collection', 'Collect a parcel from a nearby counter.', 'package', 16, 12),
  ('10000000-0000-4000-8000-000000000013', '10000000-0000-4000-8000-000000000001', 'Shopping assistance', 'shopping-assistance', 'Help someone shop nearby.', 'shopping-basket', 16, 13),
  ('10000000-0000-4000-8000-000000000014', '10000000-0000-4000-8000-000000000001', 'Local deliveries', 'local-deliveries', 'Carry a small item within the neighbourhood.', 'bike', 18, 14),
  ('10000000-0000-4000-8000-000000000002', null, 'Education', 'education', 'Learning help between neighbours.', 'graduation-cap', 16, 20),
  ('10000000-0000-4000-8000-000000000021', '10000000-0000-4000-8000-000000000002', 'Tutoring', 'tutoring', 'Subject tutoring for school or college.', 'graduation-cap', 16, 21),
  ('10000000-0000-4000-8000-000000000022', '10000000-0000-4000-8000-000000000002', 'Homework guidance', 'homework-guidance', 'Sit with someone while they work through homework.', 'book-open', 16, 22),
  ('10000000-0000-4000-8000-000000000023', '10000000-0000-4000-8000-000000000002', 'Language practice', 'language-practice', 'Conversation practice in a language you know.', 'languages', 16, 23),
  ('10000000-0000-4000-8000-000000000024', '10000000-0000-4000-8000-000000000002', 'Academic assistance', 'academic-assistance', 'Help with study planning or a specific topic.', 'school', 16, 24),
  ('10000000-0000-4000-8000-000000000003', null, 'Technology', 'technology', 'Everyday device and computer help.', 'laptop', 16, 30),
  ('10000000-0000-4000-8000-000000000031', '10000000-0000-4000-8000-000000000003', 'Computer setup', 'computer-setup', 'Set up a computer for ordinary home use.', 'laptop', 16, 31),
  ('10000000-0000-4000-8000-000000000032', '10000000-0000-4000-8000-000000000003', 'Software installation', 'software-installation', 'Install everyday software the owner already has.', 'download', 16, 32),
  ('10000000-0000-4000-8000-000000000033', '10000000-0000-4000-8000-000000000003', 'Basic troubleshooting', 'basic-troubleshooting', 'Help with common computer or phone problems.', 'wrench', 16, 33),
  ('10000000-0000-4000-8000-000000000034', '10000000-0000-4000-8000-000000000003', 'Device assistance', 'device-assistance', 'Help with a phone, tablet, or printer.', 'smartphone', 16, 34),
  ('10000000-0000-4000-8000-000000000004', null, 'Home Assistance', 'home-assistance', 'Light help at home. Not licensed trade work.', 'house', 18, 40),
  ('10000000-0000-4000-8000-000000000041', '10000000-0000-4000-8000-000000000004', 'Furniture assembly', 'furniture-assembly', 'Assemble household furniture from a kit.', 'armchair', 18, 41),
  ('10000000-0000-4000-8000-000000000042', '10000000-0000-4000-8000-000000000004', 'Organising', 'organising', 'Help sort or organise a room.', 'layout-grid', 18, 42),
  ('10000000-0000-4000-8000-000000000043', '10000000-0000-4000-8000-000000000004', 'Basic household assistance', 'basic-household-assistance', 'Light household help that does not need a licence.', 'house', 18, 43),
  ('10000000-0000-4000-8000-000000000005', null, 'Pet Care', 'pet-care', 'Short visits and walks for pets.', 'paw-print', 16, 50),
  ('10000000-0000-4000-8000-000000000051', '10000000-0000-4000-8000-000000000005', 'Dog walking', 'dog-walking', 'Walk a dog in the neighbourhood.', 'paw-print', 16, 51),
  ('10000000-0000-4000-8000-000000000052', '10000000-0000-4000-8000-000000000005', 'Pet feeding', 'pet-feeding', 'Feed a pet at the agreed time.', 'bone', 16, 52),
  ('10000000-0000-4000-8000-000000000053', '10000000-0000-4000-8000-000000000005', 'Pet sitting', 'pet-sitting', 'Stay with a pet for a short period.', 'house', 18, 53),
  ('10000000-0000-4000-8000-000000000006', null, 'Creative Services', 'creative-services', 'Small creative jobs for neighbours.', 'palette', 16, 60),
  ('10000000-0000-4000-8000-000000000061', '10000000-0000-4000-8000-000000000006', 'Graphic design', 'graphic-design', 'A poster, invite, or simple graphic.', 'palette', 16, 61),
  ('10000000-0000-4000-8000-000000000062', '10000000-0000-4000-8000-000000000006', 'Video editing', 'video-editing', 'Edit a short personal video.', 'clapperboard', 16, 62),
  ('10000000-0000-4000-8000-000000000063', '10000000-0000-4000-8000-000000000006', 'Photography', 'photography', 'Take photos at a small local moment.', 'camera', 16, 63),
  ('10000000-0000-4000-8000-000000000064', '10000000-0000-4000-8000-000000000006', 'Content writing', 'content-writing', 'Write a short caption, note, or post.', 'pen-line', 16, 64),
  ('10000000-0000-4000-8000-000000000007', null, 'Event Assistance', 'event-assistance', 'Help setting up a small gathering.', 'party-popper', 18, 70),
  ('10000000-0000-4000-8000-000000000071', '10000000-0000-4000-8000-000000000007', 'Event setup', 'event-setup', 'Help set up a small home gathering.', 'party-popper', 18, 71),
  ('10000000-0000-4000-8000-000000000072', '10000000-0000-4000-8000-000000000007', 'Photography assistance', 'photography-assistance', 'Assist a neighbour taking photos.', 'camera', 18, 72),
  ('10000000-0000-4000-8000-000000000073', '10000000-0000-4000-8000-000000000007', 'Decoration assistance', 'decoration-assistance', 'Help with simple decorations.', 'sparkles', 18, 73),
  ('10000000-0000-4000-8000-000000000008', null, 'Other', 'other', 'Miscellaneous tasks that fit the house rules.', 'ellipsis', 18, 80),
  ('10000000-0000-4000-8000-000000000081', '10000000-0000-4000-8000-000000000008', 'Miscellaneous approved tasks', 'miscellaneous', 'A lawful everyday task that fits another category poorly.', 'shapes', 18, 81)
on conflict (id) do nothing;
