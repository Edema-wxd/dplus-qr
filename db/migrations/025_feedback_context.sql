-- 025: where a feedback answer came from, as a scan records it.
--
-- The owner's CSV of answers carries country, city, device type and
-- operating system beside each rating, so a restaurant can tell the Lagos
-- branch's answers from Abuja's. Filled the same way a scan is: the hosting
-- network's geographic headers and the parsed User-Agent. Still no IP and no
-- hashed visitor value with an answer.
--
-- Nullable, with no default: answers left before this have none of it, and
-- a request without the headers (local, or another host) records nulls.
-- qr_feedback is not on the redirect path, so this takes no lock a scan waits on.

alter table qr_feedback
  add column country      text,
  add column city         text,
  add column device_type  text,
  add column os           text;
