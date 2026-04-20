-- ============================================================
-- MOSAICO PRO — Módulo Marketing y Contenido (setup completo)
-- Ejecutar completo en el SQL Editor de Supabase
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. TABLAS
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.content_pillars (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id  UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  color       TEXT        DEFAULT '#5DE0E6',
  percentage  NUMERIC(5,2) DEFAULT 20,
  formats     TEXT[]      DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.content_packs (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id  UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  price       NUMERIC(12,2) NOT NULL DEFAULT 0,
  real_value  NUMERIC(12,2),
  savings     NUMERIC(12,2),
  items       TEXT[]      DEFAULT '{}',
  valid_until DATE,
  status      TEXT        NOT NULL DEFAULT 'activo',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.content_calendar (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id       UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title            TEXT        NOT NULL DEFAULT '',
  hook             TEXT,
  description      TEXT,
  cta              TEXT,
  publish_date     DATE        NOT NULL DEFAULT CURRENT_DATE,
  publish_time     TIME,
  format           TEXT        NOT NULL DEFAULT 'post',
  pillar           TEXT        NOT NULL DEFAULT 'autoridad',
  funnel_stage     TEXT        DEFAULT 'tofu',
  platform         TEXT,
  priority_service TEXT,
  status           TEXT        NOT NULL DEFAULT 'borrador',
  notes            TEXT,
  board_x          INTEGER     DEFAULT 0,
  board_y          INTEGER     DEFAULT 0,
  board_order      INTEGER     DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_cpillars_company  ON public.content_pillars(company_id);
CREATE INDEX IF NOT EXISTS idx_cpacks_company    ON public.content_packs(company_id);
CREATE INDEX IF NOT EXISTS idx_ccal_company      ON public.content_calendar(company_id);
CREATE INDEX IF NOT EXISTS idx_ccal_date         ON public.content_calendar(company_id, publish_date);
CREATE INDEX IF NOT EXISTS idx_ccal_status       ON public.content_calendar(company_id, status);

-- ──────────────────────────────────────────────────────────────
-- 2. RLS
-- ──────────────────────────────────────────────────────────────

ALTER TABLE public.content_pillars   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_packs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_calendar  ENABLE ROW LEVEL SECURITY;

-- content_pillars
DROP POLICY IF EXISTS "cpillars_select" ON public.content_pillars;
DROP POLICY IF EXISTS "cpillars_insert" ON public.content_pillars;
DROP POLICY IF EXISTS "cpillars_update" ON public.content_pillars;
DROP POLICY IF EXISTS "cpillars_delete" ON public.content_pillars;
CREATE POLICY "cpillars_select" ON public.content_pillars FOR SELECT USING (company_id = get_user_company_id());
CREATE POLICY "cpillars_insert" ON public.content_pillars FOR INSERT WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "cpillars_update" ON public.content_pillars FOR UPDATE USING (company_id = get_user_company_id());
CREATE POLICY "cpillars_delete" ON public.content_pillars FOR DELETE USING (company_id = get_user_company_id());

-- content_packs
DROP POLICY IF EXISTS "cpacks_select" ON public.content_packs;
DROP POLICY IF EXISTS "cpacks_insert" ON public.content_packs;
DROP POLICY IF EXISTS "cpacks_update" ON public.content_packs;
DROP POLICY IF EXISTS "cpacks_delete" ON public.content_packs;
CREATE POLICY "cpacks_select" ON public.content_packs FOR SELECT USING (company_id = get_user_company_id());
CREATE POLICY "cpacks_insert" ON public.content_packs FOR INSERT WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "cpacks_update" ON public.content_packs FOR UPDATE USING (company_id = get_user_company_id());
CREATE POLICY "cpacks_delete" ON public.content_packs FOR DELETE USING (company_id = get_user_company_id());

-- content_calendar
DROP POLICY IF EXISTS "ccal_select" ON public.content_calendar;
DROP POLICY IF EXISTS "ccal_insert" ON public.content_calendar;
DROP POLICY IF EXISTS "ccal_update" ON public.content_calendar;
DROP POLICY IF EXISTS "ccal_delete" ON public.content_calendar;
CREATE POLICY "ccal_select" ON public.content_calendar FOR SELECT USING (company_id = get_user_company_id());
CREATE POLICY "ccal_insert" ON public.content_calendar FOR INSERT WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "ccal_update" ON public.content_calendar FOR UPDATE USING (company_id = get_user_company_id());
CREATE POLICY "ccal_delete" ON public.content_calendar FOR DELETE USING (company_id = get_user_company_id());

-- ──────────────────────────────────────────────────────────────
-- 3. FUNCIONES RPC
-- ──────────────────────────────────────────────────────────────

-- Actualizar posición de un bloque en el tablero
CREATE OR REPLACE FUNCTION update_content_position(
  p_id         UUID,
  p_company_id UUID,
  p_x          INTEGER,
  p_y          INTEGER,
  p_order      INTEGER
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.content_calendar
  SET board_x = p_x, board_y = p_y, board_order = p_order
  WHERE id = p_id AND company_id = p_company_id;
  RETURN jsonb_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION update_content_position(UUID, UUID, INTEGER, INTEGER, INTEGER) TO authenticated;

-- Actualizar contenido de una pieza
CREATE OR REPLACE FUNCTION update_content_piece(p_data JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id UUID;
BEGIN
  v_id := (p_data->>'id')::UUID;
  UPDATE public.content_calendar SET
    title            = COALESCE(NULLIF(p_data->>'title', ''),        title),
    hook             = p_data->>'hook',
    description      = p_data->>'description',
    cta              = p_data->>'cta',
    publish_date     = COALESCE(NULLIF(p_data->>'publish_date','')::DATE, publish_date),
    publish_time     = COALESCE(NULLIF(p_data->>'publish_time','')::TIME, publish_time),
    format           = COALESCE(NULLIF(p_data->>'format', ''),        format),
    pillar           = COALESCE(NULLIF(p_data->>'pillar', ''),        pillar),
    funnel_stage     = COALESCE(NULLIF(p_data->>'funnel_stage', ''),  funnel_stage),
    status           = COALESCE(NULLIF(p_data->>'status', ''),        status),
    notes            = p_data->>'notes',
    platform         = COALESCE(NULLIF(p_data->>'platform', ''),      platform),
    priority_service = COALESCE(NULLIF(p_data->>'priority_service',''), priority_service),
    updated_at       = NOW()
  WHERE id = v_id AND company_id = (p_data->>'company_id')::UUID;
  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;
GRANT EXECUTE ON FUNCTION update_content_piece(JSONB) TO authenticated;

-- ──────────────────────────────────────────────────────────────
-- 4. SEED — Pilares por defecto para BadWoman
-- ──────────────────────────────────────────────────────────────

INSERT INTO public.content_pillars (company_id, name, color, percentage, formats)
VALUES
  ('c29512d1-20bb-4967-8b51-9395ef660ad0', 'Autoridad',      '#C19E4D', 20, ARRAY['carrusel','post','video']),
  ('c29512d1-20bb-4967-8b51-9395ef660ad0', 'Transformación', '#16A34A', 25, ARRAY['reel','carrusel','historia']),
  ('c29512d1-20bb-4967-8b51-9395ef660ad0', 'Receta Secreta', '#7C3AED', 20, ARRAY['reel','video','post']),
  ('c29512d1-20bb-4967-8b51-9395ef660ad0', 'Bienestar',      '#2563EB', 20, ARRAY['historia','post','reel']),
  ('c29512d1-20bb-4967-8b51-9395ef660ad0', 'Conversión',     '#DC2626', 15, ARRAY['reel','historia','post'])
ON CONFLICT DO NOTHING;
