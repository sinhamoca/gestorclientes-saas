-- ═══════════════════════════════════════════════════════════════
--  CAMPANHAS DE ENVIO EM MASSA
--  Tabelas: campaigns, campaign_contacts
--  Storage: bucket campaign-media
-- ═══════════════════════════════════════════════════════════════

-- 1. Tabela campaigns
CREATE TABLE IF NOT EXISTS public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed')),
  -- Mensagens (1 a 3, randomizadas)
  messages JSONB NOT NULL DEFAULT '[]',  -- ["msg1", "msg2", "msg3"]
  -- Mídia (opcional)
  media_type TEXT CHECK (media_type IS NULL OR media_type IN ('image', 'video')),
  media_path TEXT,  -- path no storage bucket
  -- Agendamento
  schedule_times JSONB NOT NULL DEFAULT '["09:00"]',  -- ["09:00", "10:00"]
  batch_size INTEGER NOT NULL DEFAULT 25,
  messages_per_minute INTEGER NOT NULL DEFAULT 3,
  -- Progresso
  total_contacts INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  -- Controle de envio
  last_batch_at TIMESTAMPTZ,
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own campaigns"
  ON public.campaigns FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Users can read admin campaigns"
  ON public.campaigns FOR SELECT
  USING (user_id = public.get_admin_id(auth.uid()));

-- 2. Tabela campaign_contacts
CREATE TABLE IF NOT EXISTS public.campaign_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  whatsapp_encrypted TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  message_index INTEGER,  -- qual mensagem foi usada (0, 1, 2)
  sent_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.campaign_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage contacts of own campaigns"
  ON public.campaign_contacts FOR ALL
  USING (campaign_id IN (SELECT id FROM public.campaigns WHERE user_id = auth.uid()));

CREATE POLICY "Users can read contacts of admin campaigns"
  ON public.campaign_contacts FOR SELECT
  USING (campaign_id IN (
    SELECT id FROM public.campaigns WHERE user_id = public.get_admin_id(auth.uid())
  ));

-- 3. Índices
CREATE INDEX IF NOT EXISTS idx_campaigns_user_status ON public.campaigns(user_id, status);
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_campaign_status ON public.campaign_contacts(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_pending ON public.campaign_contacts(campaign_id, status) WHERE status = 'pending';

-- 4. Storage bucket para mídia de campanhas
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('campaign-media', 'campaign-media', false, 52428800)  -- 50MB limit
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Users can upload campaign media"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'campaign-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can read own campaign media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'campaign-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own campaign media"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'campaign-media' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Service role can read all (for edge functions)
CREATE POLICY "Service role can read all campaign media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'campaign-media');

-- 5. Verificação
DO $$
BEGIN
  RAISE NOTICE '✅ Tabela campaigns criada';
  RAISE NOTICE '✅ Tabela campaign_contacts criada';
  RAISE NOTICE '✅ Storage bucket campaign-media criado';
END $$;
