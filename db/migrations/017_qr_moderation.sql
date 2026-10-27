-- 017: staff moderation -- archived codes, archived and erased accounts.
--
-- Nothing here deletes a row. A code that staff take down is blocked, paused
-- or archived; an account is suspended, archived or erased. In every case the
-- `qr_codes` row stays, so its short code is held by the unique index forever
-- and can never be issued to someone else while the old artwork is still in
-- circulation.
--
-- All three columns are nullable with no default, so adding them to
-- `qr_codes` is a catalogue change and takes no long lock on the redirect
-- table.

-- Archived: taken out of service and out of the owner's dashboard by staff.
-- The redirect answers it as an unknown code. Reversible by staff.
alter table qr_codes add column archived_at timestamptz;

-- An archived account is suspended and its codes archived with the same
-- timestamp, which is how unarchiving finds exactly the codes it archived and
-- leaves alone any that staff had archived on their own before.
alter table qr_users add column archived_at timestamptz;

-- Erased: personal data and content removed for good, on an erasure request
-- or for a junk account. The profile and code rows remain as anonymous
-- skeletons, holding the short codes and the foreign keys.
alter table qr_users add column erased_at timestamptz;

-- The staff list of every code, newest first.
create index qr_codes_created_idx on qr_codes (created_at desc);
