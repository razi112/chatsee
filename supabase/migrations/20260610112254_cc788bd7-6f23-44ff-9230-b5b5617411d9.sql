-- Revoke anon SELECT on all public tables (RLS gated; no anon access needed)
REVOKE SELECT ON public.messages, public.conversations, public.conversation_participants,
  public.user_chat_state, public.calls, public.statuses, public.status_views, public.status_replies
  FROM anon;

-- Tighten conversations INSERT policy
DROP POLICY IF EXISTS "Authenticated users can create conversations" ON public.conversations;
CREATE POLICY "Users can create their own conversations"
  ON public.conversations FOR INSERT TO authenticated
  WITH CHECK (created_by IS NULL OR created_by = auth.uid());

-- Revoke EXECUTE on internal helper SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.is_conversation_admin(uuid, uuid) FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_conversation_participant(uuid, uuid) FROM authenticated, anon, PUBLIC;
