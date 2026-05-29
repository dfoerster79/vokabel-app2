# Supabase Setup – profiles Tabelle

Führe dieses SQL einmalig im Supabase SQL Editor aus:

```sql
-- Profiltabelle mit Rollenverwaltung
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  vorname text,
  nachname text,
  rolle text not null default 'schueler' check (rolle in ('schueler', 'lehrer', 'admin')),
  created_at timestamptz default now()
);

-- Row Level Security aktivieren
alter table public.profiles enable row level security;

-- Jeder kann sein eigenes Profil lesen
create policy "Eigenes Profil lesen"
  on public.profiles for select
  using (auth.uid() = id);

-- Jeder kann sein eigenes Profil anlegen
create policy "Eigenes Profil anlegen"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Rolle nur durch Admin änderbar (via Supabase Dashboard oder Service Role Key)
-- Normaler Nutzer kann seine Rolle NICHT selbst ändern
create policy "Profil aktualisieren"
  on public.profiles for update
  using (auth.uid() = id)
  with check (rolle = (select rolle from public.profiles where id = auth.uid()));
```

## Rolle eines Nutzers ändern (Admin-Aufgabe)

Im Supabase Dashboard → Table Editor → profiles → Zeile suchen → Feld `rolle` auf `lehrer` oder `admin` setzen.
