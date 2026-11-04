-- Record the actual submission date separately from the internal process start date.
-- NULL is intentional for legacy cases: no historical date is guessed or backfilled.
ALTER TABLE ced_cases
  ADD COLUMN application_submitted_on date;
