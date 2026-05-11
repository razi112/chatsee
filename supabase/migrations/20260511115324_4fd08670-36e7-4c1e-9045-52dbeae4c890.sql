CREATE TABLE public.user_chat_state (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  cleared_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, conversation_id)
);

ALTER TABLE public.user_chat_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own chat state"
ON public.user_chat_state FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own chat state"
ON public.user_chat_state FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own chat state"
ON public.user_chat_state FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own chat state"
ON public.user_chat_state FOR DELETE
USING (auth.uid() = user_id);

CREATE TRIGGER update_user_chat_state_updated_at
BEFORE UPDATE ON public.user_chat_state
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_user_chat_state_user_conv ON public.user_chat_state(user_id, conversation_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.user_chat_state;
ALTER TABLE public.user_chat_state REPLICA IDENTITY FULL;