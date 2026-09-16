# CYC Private Swim Lessons — deploy guide

The site runs in two modes:

- **Local preview mode** (out of the box) — data lives in the browser's own storage. Fine for clicking through, but every device sees its own copy.
- **Live mode** — Supabase holds the shared schedule, roster and holds, so every device sees the same thing.

The footer of the site tells you which mode you're in.

---

## 1. Create the Supabase project

1. supabase.com → **New project**. Pick a region near you, save the database password.
2. Open **SQL Editor** → **New query**, paste everything in section 2, and run it.
3. Go to **Project Settings → API** and copy:
   - `Project URL`
   - `anon` `public` key

## 2. Database schema

```sql
-- ── tables ───────────────────────────────────────────────────────────────
create table if not exists lesson_dates (
  id           text primary key,               -- '2026-10-07'
  lesson_date  date not null,
  staff_count  int  not null default 4          -- coaches on deck = spots per time slot
);

create table if not exists lesson_slots (
  id          text primary key,                 -- '2026-10-07#15:45'
  date_id     text not null references lesson_dates(id) on delete cascade,
  start_time  text not null,                    -- '15:45' (24h)
  end_time    text not null,                    -- '16:15'
  capacity    int                               -- null = inherit staff_count
);

create table if not exists bookings (
  id           text primary key,
  slot_id      text not null references lesson_slots(id) on delete cascade,
  child_first  text not null,
  child_last   text,
  child_age    int,
  goals        text,
  parent_email text,
  created_at   timestamptz default now()
);

create table if not exists holds (
  id         text primary key,                  -- '<session>|<slot_id>'
  slot_id    text not null references lesson_slots(id) on delete cascade,
  session_id text not null,
  expires_at timestamptz not null
);

create index if not exists bookings_slot_idx on bookings(slot_id);
create index if not exists holds_expiry_idx  on holds(expires_at);

-- ── realtime (so every device updates without a refresh) ─────────────────
alter publication supabase_realtime add table lesson_dates;
alter publication supabase_realtime add table lesson_slots;
alter publication supabase_realtime add table bookings;
alter publication supabase_realtime add table holds;

-- ── row level security ───────────────────────────────────────────────────
alter table lesson_dates enable row level security;
alter table lesson_slots enable row level security;
alter table bookings     enable row level security;
alter table holds        enable row level security;

-- Public site: anyone can read the schedule and write their own booking/hold.
create policy "read dates"    on lesson_dates for select using (true);
create policy "read slots"    on lesson_slots for select using (true);
create policy "read bookings" on bookings     for select using (true);
create policy "read holds"    on holds        for select using (true);

create policy "book"          on bookings for insert with check (true);
create policy "hold"          on holds    for all    using (true) with check (true);

-- Coach console writes (the password gate is in the page, not the database).
create policy "manage dates"    on lesson_dates for all using (true) with check (true);
create policy "manage slots"    on lesson_slots for all using (true) with check (true);
create policy "manage bookings" on bookings     for all using (true) with check (true);

-- ── housekeeping: drop expired holds ─────────────────────────────────────
-- Optional but recommended. Enable pg_cron under Database → Extensions first.
-- select cron.schedule('expire-holds', '*/5 * * * *',
--   $$ delete from holds where expires_at < now() $$);
```

The first time the site loads against an empty database it seeds itself from your
2026 CSV (July 15 – Oct 31, Wednesdays and Saturdays) and pushes it up.

> **Security note.** These policies let anonymous visitors write, because the coach
> password is checked in the browser. That is normal for a small community-club site
> but it is not bank-grade: a determined person could write directly to the tables.
> When you want it tightened, move the coach console behind Supabase Auth
> (email magic link for staff accounts) and change the `manage *` policies to
> `using (auth.role() = 'authenticated')`.

## 3. Point the site at Supabase

Open `index.html`, find the config block near the top of the script, and replace:

```js
const SUPABASE_URL = "YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
```

The anon key is safe to ship in a public HTML file — that is what it is for.

## 4. Deploy on Netlify

1. Push this folder to `colbyathompson-ux/privateswim`.
2. Netlify → **Add new site → Import an existing project** → pick the repo.
3. Build command: *(leave empty)*. Publish directory: `.` (the repo root).
4. Deploy. `netlify.toml` in this repo already sets that up.

Any later change: commit and push, Netlify redeploys.

## 5. Confirmation emails (SendGrid)

The email function is already written: `netlify/functions/notify.js`.
It sends three kinds of mail, all from **cthompson@cycmail.org** with replies
going to the same address:

| Kind | Fires when |
|---|---|
| `confirmation` | a parent claims their lesson(s) |
| `cancelled` | you cancel a booking in the coach console and hit **Save changes** |
| `changed` | you move a booking to a different time and hit **Save changes** |

Cancel/change emails are queued as you edit and sent only when you publish, so
a parent gets one clean message instead of one per keystroke.

### One-time setup

1. **Make a SendGrid account** at sendgrid.com (the free tier covers 100
   emails/day, well past what you need).
2. **Verify the sender.** Settings → Sender Authentication → *Verify a Single
   Sender*. Use `cthompson@cycmail.org`. SendGrid emails that address a
   confirmation link — click it. (Single Sender is the shortcut; if CYC ever
   lets you add DNS records for cycmail.org, do *Domain Authentication*
   instead — deliverability is noticeably better.)
3. **Make an API key.** Settings → API Keys → Create API Key → *Restricted
   Access* with only **Mail Send** enabled. Copy it; SendGrid shows it once.
4. **Add it to Netlify.** Site configuration → Environment variables → Add:
   - Key: `SENDGRID_API_KEY`
   - Value: the key you just copied
5. **Redeploy** (Deploys → Trigger deploy). Env vars only apply to new builds.

That's it — `EMAIL_ENDPOINT` in `index.html` is already pointed at the
function.

### What's in the parent's email

Confirmation code, every swimmer with age, each date and time, an
**+ Calendar** link per lesson (Google Calendar), arrive-five-minutes-early
check-in instructions, the $30-per-lesson payment note with their total, and
your contact line.

### Things you may want to change

All of it lives in the `CONFIG` block at the top of
`netlify/functions/notify.js`:

- `paymentNote` — how and where parents pay
- `pricePerLesson` — currently `30`
- `bcc` — add `["aquatics@cycmail.org"]` to copy staff on every email
- `timeZone` — `America/Chicago`; this is what the calendar links use, so
  fix it if CYC is in another zone
- `location` — shown in the calendar entry
- `coachName` / `coachEmail` — the signature and footer

### Testing it

Book a lesson using your own email address on the live Netlify site (not local
preview — the function only exists on Netlify). If nothing arrives:

- Netlify → Functions → `notify` → check the log for a `SendGrid 401`
  (bad/missing key) or `403` (sender not verified).
- SendGrid → Activity Feed shows every send attempt and whether it bounced.
- Email never blocks a booking — if sending fails, the parent still gets the
  confirmation screen and the roster still records the lesson.

### Not built yet

Day-before reminders would need a scheduled function (Netlify cron) that reads
tomorrow's bookings from Supabase and posts them to `notify.js` with
`kind: "confirmation"` swapped for a new `reminder` builder. Say the word.

## Coach console

- Reached from **Coach / Staff** in the top nav.
- Password: `artihatesswim` (case sensitive). Change `COACH_PASSWORD` in `index.html`.
- Edits are staged as a draft — nothing reaches the parent dashboard until you press
  **Save changes**. **Discard** throws the draft away.
- **Coaches on deck** on each date sets how many private lessons can run at once, so
  bumping it from 3 to 4 opens one more spot in every time slot that day.
