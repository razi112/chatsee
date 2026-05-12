
-- ============= STATUS FEATURE =============
CREATE TABLE public.statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('text','image','video')),
  content TEXT NOT NULL,
  background_color TEXT,
  font_style TEXT,
  caption TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours')
);
CREATE INDEX idx_statuses_user ON public.statuses(user_id);
CREATE INDEX idx_statuses_expires ON public.statuses(expires_at);
ALTER TABLE public.statuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view active statuses"
ON public.statuses FOR SELECT TO authenticated
USING (expires_at > now());

CREATE POLICY "Users insert own status"
ON public.statuses FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own status"
ON public.statuses FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- Status views
CREATE TABLE public.status_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status_id UUID NOT NULL REFERENCES public.statuses(id) ON DELETE CASCADE,
  viewer_id UUID NOT NULL,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (status_id, viewer_id)
);
ALTER TABLE public.status_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can see views of own status"
ON public.status_views FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.statuses s WHERE s.id = status_id AND s.user_id = auth.uid()));

CREATE POLICY "Viewer can see own views"
ON public.status_views FOR SELECT TO authenticated
USING (viewer_id = auth.uid());

CREATE POLICY "Viewer inserts own view"
ON public.status_views FOR INSERT TO authenticated
WITH CHECK (viewer_id = auth.uid());

-- Status replies
CREATE TABLE public.status_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status_id UUID NOT NULL REFERENCES public.statuses(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.status_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner or sender can view reply"
ON public.status_replies FOR SELECT TO authenticated
USING (
  sender_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.statuses s WHERE s.id = status_id AND s.user_id = auth.uid())
);

CREATE POLICY "Sender inserts own reply"
ON public.status_replies FOR INSERT TO authenticated
WITH CHECK (sender_id = auth.uid());

-- ============= GROUP CHAT =============
ALTER TABLE public.conversations
  ADD COLUMN is_group BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN name TEXT,
  ADD COLUMN avatar_url TEXT,
  ADD COLUMN created_by UUID;

ALTER TABLE public.conversation_participants
  ADD COLUMN role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member'));

-- Allow group admins to update conversation metadata
CREATE OR REPLACE FUNCTION public.is_conversation_admin(_conv_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = _conv_id AND user_id = _user_id AND role = 'admin'
  )
$$;

CREATE POLICY "Admins can update group conversation"
ON public.conversations FOR UPDATE TO authenticated
USING (is_conversation_admin(id, auth.uid()))
WITH CHECK (is_conversation_admin(id, auth.uid()));

-- Allow admins to remove participants
CREATE POLICY "Admins can remove participants"
ON public.conversation_participants FOR DELETE TO authenticated
USING (is_conversation_admin(conversation_id, auth.uid()) OR user_id = auth.uid());

-- RPC to create a group conversation
CREATE OR REPLACE FUNCTION public.create_group_conversation(_name text, _member_ids uuid[], _avatar_url text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  _conv_id uuid;
  _me uuid := auth.uid();
  _uid uuid;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO public.conversations (is_group, name, avatar_url, created_by)
    VALUES (true, _name, _avatar_url, _me)
    RETURNING id INTO _conv_id;
  INSERT INTO public.conversation_participants (conversation_id, user_id, role)
    VALUES (_conv_id, _me, 'admin');
  FOREACH _uid IN ARRAY _member_ids LOOP
    IF _uid <> _me THEN
      INSERT INTO public.conversation_participants (conversation_id, user_id, role)
        VALUES (_conv_id, _uid, 'member')
        ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
  RETURN _conv_id;
END;
$$;

-- Storage bucket for status media
INSERT INTO storage.buckets (id, name, public) VALUES ('status-media','status-media', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public can view status media"
ON storage.objects FOR SELECT
USING (bucket_id = 'status-media');

CREATE POLICY "Users upload own status media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'status-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own status media"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'status-media' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.statuses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.status_replies;
