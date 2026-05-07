CREATE POLICY "Participants can mark messages as read"
ON public.messages
FOR UPDATE
USING (
  sender_id <> auth.uid()
  AND public.is_conversation_participant(conversation_id, auth.uid())
)
WITH CHECK (
  sender_id <> auth.uid()
  AND public.is_conversation_participant(conversation_id, auth.uid())
);