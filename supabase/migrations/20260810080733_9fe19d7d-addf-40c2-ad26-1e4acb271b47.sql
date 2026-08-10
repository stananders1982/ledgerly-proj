CREATE TABLE public.admin_chat_threads (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'New chat',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_chat_threads TO authenticated;
GRANT ALL ON public.admin_chat_threads TO service_role;

ALTER TABLE public.admin_chat_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own assistant threads"
  ON public.admin_chat_threads FOR ALL TO authenticated
  USING (user_id = auth.uid() AND company_id = public.current_company_id())
  WITH CHECK (user_id = auth.uid() AND company_id = public.current_company_id());

CREATE TRIGGER admin_chat_threads_touch
  BEFORE UPDATE ON public.admin_chat_threads
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX admin_chat_threads_user_idx ON public.admin_chat_threads (user_id, updated_at DESC);

CREATE TABLE public.admin_chat_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id uuid NOT NULL REFERENCES public.admin_chat_threads(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','system')),
  message_id text,
  parts jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_chat_messages TO authenticated;
GRANT ALL ON public.admin_chat_messages TO service_role;

ALTER TABLE public.admin_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own assistant messages"
  ON public.admin_chat_messages FOR ALL TO authenticated
  USING (user_id = auth.uid() AND company_id = public.current_company_id())
  WITH CHECK (user_id = auth.uid() AND company_id = public.current_company_id());

CREATE TRIGGER admin_chat_messages_touch
  BEFORE UPDATE ON public.admin_chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX admin_chat_messages_thread_idx ON public.admin_chat_messages (thread_id, created_at);