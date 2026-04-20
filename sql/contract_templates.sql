-- ============================================================
-- MOSAICO PRO — Plantillas de contratos
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. TABLA contract_templates
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contract_templates (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  type        TEXT        NOT NULL DEFAULT 'contract',  -- 'contract' | 'annex'
  content     TEXT        NOT NULL DEFAULT '',          -- Texto con {{variables}}
  variables   TEXT[]      DEFAULT '{}',
  file_url    TEXT        DEFAULT NULL,                 -- URL de archivo Word/PDF en Storage
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ct_company_idx ON public.contract_templates (company_id);

ALTER TABLE public.contract_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ct_select" ON public.contract_templates;
DROP POLICY IF EXISTS "ct_insert" ON public.contract_templates;
DROP POLICY IF EXISTS "ct_update" ON public.contract_templates;
DROP POLICY IF EXISTS "ct_delete" ON public.contract_templates;

CREATE POLICY "ct_select" ON public.contract_templates
  FOR SELECT USING (company_id = get_user_company_id() OR is_super_admin());

CREATE POLICY "ct_insert" ON public.contract_templates
  FOR INSERT WITH CHECK (company_id = get_user_company_id() OR is_super_admin());

CREATE POLICY "ct_update" ON public.contract_templates
  FOR UPDATE USING (company_id = get_user_company_id() OR is_super_admin());

CREATE POLICY "ct_delete" ON public.contract_templates
  FOR DELETE USING (company_id = get_user_company_id() OR is_super_admin());

-- ──────────────────────────────────────────────────────────────
-- 2. Bucket en Storage (ejecutar en Storage > New Bucket)
-- ──────────────────────────────────────────────────────────────
-- Nombre: contract-files
-- Público: NO (acceso autenticado)
-- INSERT en storage.buckets si aún no existe:

INSERT INTO storage.buckets (id, name, public)
VALUES ('contract-files', 'contract-files', false)
ON CONFLICT (id) DO NOTHING;

-- Política de storage
DROP POLICY IF EXISTS "contract_files_select" ON storage.objects;
DROP POLICY IF EXISTS "contract_files_insert" ON storage.objects;
DROP POLICY IF EXISTS "contract_files_delete" ON storage.objects;

CREATE POLICY "contract_files_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'contract-files' AND auth.role() = 'authenticated');

CREATE POLICY "contract_files_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'contract-files' AND auth.role() = 'authenticated');

CREATE POLICY "contract_files_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'contract-files' AND auth.role() = 'authenticated');

-- ──────────────────────────────────────────────────────────────
-- 3. Plantillas de ejemplo predeterminadas (se insertan como NULL company_id)
--    Las empresas pueden ver las globales Y las propias
-- ──────────────────────────────────────────────────────────────
-- No se insertan datos de ejemplo para evitar conflictos de company_id

-- ──────────────────────────────────────────────────────────────
-- 4. VERIFICAR
-- ──────────────────────────────────────────────────────────────
SELECT COUNT(*) AS total_templates FROM public.contract_templates;
