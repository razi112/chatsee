
REVOKE EXECUTE ON FUNCTION public.create_direct_conversation(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_group_conversation(text, uuid[], text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_conversation_admin(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_conversation_participant(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
