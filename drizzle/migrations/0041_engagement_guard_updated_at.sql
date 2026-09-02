CREATE OR REPLACE FUNCTION public.tg_engagement_client_field_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.freelancer_id IS DISTINCT FROM OLD.freelancer_id
     OR NEW.team_id IS DISTINCT FROM OLD.team_id
     OR NEW.request_id IS DISTINCT FROM OLD.request_id
     OR NEW.match_id IS DISTINCT FROM OLD.match_id
     OR NEW.proposed_by IS DISTINCT FROM OLD.proposed_by
     OR NEW.is_test IS DISTINCT FROM OLD.is_test
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.updated_at IS DISTINCT FROM OLD.updated_at THEN
    RAISE EXCEPTION 'Engagement ownership, identity, or timestamps are server-authoritative';
  END IF;

  IF NEW.covered_days IS DISTINCT FROM OLD.covered_days
     OR NEW.start_date IS DISTINCT FROM OLD.start_date
     OR NEW.end_date IS DISTINCT FROM OLD.end_date
     OR NEW.fee IS DISTINCT FROM OLD.fee
     OR NEW.currency IS DISTINCT FROM OLD.currency THEN
    RAISE EXCEPTION 'Engagement contract terms are server-authoritative';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at
     OR NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at
     OR NEW.cancelled_by IS DISTINCT FROM OLD.cancelled_by
     OR NEW.cancellation_kind IS DISTINCT FROM OLD.cancellation_kind
     OR NEW.cancellation_reason IS DISTINCT FROM OLD.cancellation_reason
     OR NEW.no_show IS DISTINCT FROM OLD.no_show
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.extension_count IS DISTINCT FROM OLD.extension_count
     OR NEW.declined_at IS DISTINCT FROM OLD.declined_at
     OR NEW.expired_at IS DISTINCT FROM OLD.expired_at
     OR NEW.reminder_24_sent_at IS DISTINCT FROM OLD.reminder_24_sent_at
     OR NEW.reminder_12_sent_at IS DISTINCT FROM OLD.reminder_12_sent_at
     OR NEW.freelancer_contacted IS DISTINCT FROM OLD.freelancer_contacted
     OR NEW.freelancer_contacted_at IS DISTINCT FROM OLD.freelancer_contacted_at
     OR NEW.team_confirmed_contact IS DISTINCT FROM OLD.team_confirmed_contact
     OR NEW.team_confirmed_contact_at IS DISTINCT FROM OLD.team_confirmed_contact_at
     OR NEW.contact_check_sent_at IS DISTINCT FROM OLD.contact_check_sent_at
     OR NEW.team_reminder1_sent_at IS DISTINCT FROM OLD.team_reminder1_sent_at
     OR NEW.team_reminder2_sent_at IS DISTINCT FROM OLD.team_reminder2_sent_at
     OR NEW.ghosting_released_at IS DISTINCT FROM OLD.ghosting_released_at THEN
    RAISE EXCEPTION 'Engagement lifecycle state is server-authoritative';
  END IF;

  IF NEW.freelancer_marked_complete IS DISTINCT FROM OLD.freelancer_marked_complete
     AND _uid IS DISTINCT FROM OLD.freelancer_id THEN
    RAISE EXCEPTION 'Only the freelancer can change freelancer_marked_complete';
  END IF;
  IF NEW.team_marked_complete IS DISTINCT FROM OLD.team_marked_complete
     AND _uid IS DISTINCT FROM OLD.team_id THEN
    RAISE EXCEPTION 'Only the team can change team_marked_complete';
  END IF;

  IF NEW.notes IS DISTINCT FROM OLD.notes AND _uid IS DISTINCT FROM OLD.proposed_by THEN
    RAISE EXCEPTION 'Only the proposer can change engagement notes';
  END IF;

  RETURN NEW;
END;
$$;