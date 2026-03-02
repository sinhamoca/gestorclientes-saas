-- ============================================================
-- GestãoPro - Migration: 2FA TOTP (Google Authenticator)
-- Adiciona suporte a autenticação em 2 fatores para users
-- ============================================================

-- Adicionar colunas na tabela profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS totp_secret TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT false;

-- Comentários
COMMENT ON COLUMN public.profiles.totp_secret IS 'TOTP secret encriptado (base32) para Google Authenticator';
COMMENT ON COLUMN public.profiles.totp_enabled IS 'Se 2FA está ativo para este usuário';

-- Garantir que a RLS existente já cobre essas colunas (profiles já tem RLS)
-- Nenhuma policy nova necessária pois profiles já está protegido

-- Verificar
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'totp_enabled'
  ) THEN
    RAISE NOTICE '✅ Coluna totp_enabled criada com sucesso';
  ELSE
    RAISE NOTICE '❌ Erro ao criar coluna totp_enabled';
  END IF;
END $$;
