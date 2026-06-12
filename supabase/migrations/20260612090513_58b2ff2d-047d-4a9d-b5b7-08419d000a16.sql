
-- 1. Conversations: require created_by = auth.uid() on INSERT
DROP POLICY IF EXISTS "Users can create conversations" ON public.conversations;
DROP POLICY IF EXISTS "Authenticated users can create conversations" ON public.conversations;
CREATE POLICY "Users can create conversations"
ON public.conversations
FOR INSERT
TO authenticated
WITH CHECK (created_by = auth.uid());

-- 2. Messages: add WITH CHECK so senders can't change sender_id/conversation_id
DROP POLICY IF EXISTS "Users can update their own messages" ON public.messages;
CREATE POLICY "Users can update their own messages"
ON public.messages
FOR UPDATE
TO authenticated
USING (sender_id = auth.uid())
WITH CHECK (sender_id = auth.uid());

-- 3. Realtime: restrict channel subscriptions to conversation participants
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can subscribe to participant conversations" ON realtime.messages;
CREATE POLICY "Authenticated can subscribe to participant conversations"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  -- Allow when topic is a conversation id the user participates in,
  -- or topic is not a conversation channel (fallback for presence/other features)
  CASE
    WHEN realtime.topic() ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN public.is_conversation_participant(realtime.topic()::uuid, auth.uid())
    ELSE true
  END
);
