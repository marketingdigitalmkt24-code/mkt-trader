create table public.iq_display_reset (
  id integer primary key default 1 check (id = 1),
  cutoff timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update on public.iq_display_reset to authenticated;
grant all on public.iq_display_reset to service_role;

alter table public.iq_display_reset enable row level security;

create policy "Authenticated users read the display reset cutoff"
  on public.iq_display_reset for select
  to authenticated
  using (true);

create policy "Admins can set the display reset cutoff"
  on public.iq_display_reset for insert
  to authenticated
  with check (public.has_role(auth.uid(), 'admin'));

create policy "Admins can update the display reset cutoff"
  on public.iq_display_reset for update
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

insert into public.iq_display_reset (id) values (1)
  on conflict (id) do nothing;