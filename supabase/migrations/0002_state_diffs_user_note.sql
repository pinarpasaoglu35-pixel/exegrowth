-- The user's push-back reason when rejecting a proposal. Product data:
-- Phase 2's calibration machinery consumes it on the next assessment.
alter table public.state_diffs add column user_note text;
