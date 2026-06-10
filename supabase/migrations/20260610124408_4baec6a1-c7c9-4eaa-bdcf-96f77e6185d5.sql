GRANT EXECUTE ON FUNCTION public.is_conversation_participant(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_conversation_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_direct_conversation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_group_conversation(text, uuid[], text) TO authenticated;