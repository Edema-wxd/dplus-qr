-- 032: images staff upload for blog posts, covers and inline figures.
--
-- Uploaded through UploadThing like every other file (the `blogImage`
-- endpoint), and recorded here so each file has a known owner and key.
--
-- A table of its own on purpose: the upload cleanup sweeps `qr_files` rows
-- that no code points at, and a post's cover would look like exactly that.
-- Nothing sweeps this table.

create table blog_images (
  id           bigserial    primary key,
  file_key     text         not null,
  url          text         not null,
  name         text         not null,
  mime_type    text         not null,
  size_bytes   integer      not null,
  uploaded_by  uuid         references qr_users (id) on delete set null,
  created_at   timestamptz  not null default now(),
  constraint blog_images_file_key_key unique (file_key)
);
