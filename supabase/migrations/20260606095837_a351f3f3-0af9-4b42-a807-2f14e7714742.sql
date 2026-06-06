
CREATE TABLE public.calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid,
  caller_id uuid NOT NULL,
  callee_id uuid NOT NULL,
  call_type text NOT NULL CHECK (call_type IN ('voice','video')),
  status text NOT NULL DEFAULT 'ringing' CHECK (status IN ('ringing','accepted','rejected','missed','ended','cancelled')),
  started_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.calls TO authenticated;
GRANT ALL ON public.calls TO service_role;

ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view their calls" ON public.calls
  FOR SELECT TO authenticated
  USING (auth.uid() = caller_id OR auth.uid() = callee_id);

CREATE POLICY "Caller can insert call" ON public.calls
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = caller_id);

CREATE POLICY "Participants can update call" ON public.calls
  FOR UPDATE TO authenticated
  USING (auth.uid() = caller_id OR auth.uid() = callee_id)
  WITH CHECK (auth.uid() = caller_id OR auth.uid() = callee_id);

CREATE TRIGGER update_calls_updated_at BEFORE UPDATE ON public.calls
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_calls_caller ON public.calls(caller_id, created_at DESC);
CREATE INDEX idx_calls_callee ON public.calls(callee_id, created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;
