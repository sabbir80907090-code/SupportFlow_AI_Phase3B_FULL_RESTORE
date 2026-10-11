-- Phase 3B extension. Run AFTER the Phase 3A schema, ONCE in your existing Supabase project.
-- No existing orders, customers, or Telegram messages are deleted.
ALTER TABLE public.telegram_conversations
  ADD COLUMN IF NOT EXISTS ai_paused boolean NOT NULL DEFAULT false;
ALTER TABLE public.telegram_messages
  ADD COLUMN IF NOT EXISTS ai_generated boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.telegram_ai_settings (
  business_id uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  auto_reply_enabled boolean NOT NULL DEFAULT false,
  system_prompt text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT telegram_ai_prompt_length CHECK (length(system_prompt) <= 2500)
);

CREATE TABLE IF NOT EXISTS public.telegram_ai_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  inbound_message_id uuid NOT NULL REFERENCES public.telegram_messages(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','sent','skipped','failed','needs_review')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  FOREIGN KEY (business_id, conversation_id) REFERENCES public.telegram_conversations(business_id,id) ON DELETE CASCADE,
  UNIQUE (business_id,inbound_message_id)
);
CREATE INDEX IF NOT EXISTS telegram_ai_jobs_pending_idx ON public.telegram_ai_jobs(business_id,conversation_id,created_at) WHERE status='queued';
-- A conversation may never have two processing jobs concurrently.
CREATE UNIQUE INDEX IF NOT EXISTS telegram_ai_jobs_one_processing_per_chat_idx
  ON public.telegram_ai_jobs(conversation_id) WHERE status='processing';

ALTER TABLE public.telegram_ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_ai_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telegram_ai_settings, public.telegram_ai_jobs FROM anon, authenticated;
GRANT SELECT ON public.telegram_ai_settings, public.telegram_ai_jobs TO authenticated;
DROP POLICY IF EXISTS telegram_ai_settings_member_read ON public.telegram_ai_settings;
CREATE POLICY telegram_ai_settings_member_read ON public.telegram_ai_settings FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.business_members m WHERE m.business_id=telegram_ai_settings.business_id AND m.user_id=(SELECT auth.uid()))
);
DROP POLICY IF EXISTS telegram_ai_jobs_member_read ON public.telegram_ai_jobs;
CREATE POLICY telegram_ai_jobs_member_read ON public.telegram_ai_jobs FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.business_members m WHERE m.business_id=telegram_ai_jobs.business_id AND m.user_id=(SELECT auth.uid()))
);

-- Atomic claim: prevents repeated Telegram webhooks from causing duplicate AI replies.
-- Security invoker + REVOKE means only the server's service-role credentials can claim jobs.
CREATE OR REPLACE FUNCTION public.claim_telegram_ai_job(p_job_id uuid, p_business_id uuid)
RETURNS SETOF public.telegram_ai_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RETURN QUERY
  UPDATE public.telegram_ai_jobs AS j SET status='processing',started_at=now()
  WHERE j.id=p_job_id AND j.business_id=p_business_id AND j.status='queued'
    AND NOT EXISTS (SELECT 1 FROM public.telegram_ai_jobs AS other
      WHERE other.conversation_id=j.conversation_id AND other.status='processing')
  RETURNING j.*;
EXCEPTION WHEN unique_violation THEN
  RETURN;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_telegram_ai_job(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_telegram_ai_job(uuid,uuid) TO service_role;
