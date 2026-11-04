ALTER TABLE calendar_events
  DROP CONSTRAINT IF EXISTS calendar_events_event_type_check;

ALTER TABLE calendar_events
  ADD CONSTRAINT calendar_events_event_type_check
  CHECK (event_type IN (
    'meeting','event','reminder','deadline',
    'presentation','site_visit','hkt','idk'
  ));
