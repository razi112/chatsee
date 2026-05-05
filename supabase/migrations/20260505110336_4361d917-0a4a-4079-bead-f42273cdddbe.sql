
CREATE OR REPLACE FUNCTION public.create_direct_conversation(_other_user uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _conv_id uuid;
  _me uuid := auth.uid();
BEGIN
  IF _me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Try to find existing 1-on-1 conversation between the two users
  SELECT c.id INTO _conv_id
  FROM public.conversations c
  WHERE EXISTS (SELECT 1 FROM public.conversation_participants p WHERE p.conversation_id = c.id AND p.user_id = _me)
    AND EXISTS (SELECT 1 FROM public.conversation_participants p WHERE p.conversation_id = c.id AND p.user_id = _other_user)
    AND (SELECT count(*) FROM public.conversation_participants p WHERE p.conversation_id = c.id) = 2
  LIMIT 1;

  IF _conv_id IS NOT NULL THEN
    RETURN _conv_id;
  END IF;

  INSERT INTO public.conversations DEFAULT VALUES RETURNING id INTO _conv_id;
  INSERT INTO public.conversation_participants (conversation_id, user_id) VALUES (_conv_id, _me), (_conv_id, _other_user);
  RETURN _conv_id;
END;
$$;
