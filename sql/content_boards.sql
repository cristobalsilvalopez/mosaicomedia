-- ============================================================
-- MOSAICO PRO — Tableros de contenido (multi-pestaña)
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. TABLA content_boards
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.content_boards (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL DEFAULT 'Principal',
  is_definitive BOOLEAN     NOT NULL DEFAULT FALSE,
  order_index   INT         NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Solo puede haber un board DEFINITIVO por empresa
CREATE UNIQUE INDEX IF NOT EXISTS content_boards_one_definitive
  ON public.content_boards (company_id)
  WHERE is_definitive = TRUE;

CREATE INDEX IF NOT EXISTS content_boards_company_idx ON public.content_boards (company_id);

ALTER TABLE public.content_boards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cb_select" ON public.content_boards
  FOR SELECT USING (company_id = get_user_company_id() OR is_super_admin());

CREATE POLICY "cb_insert" ON public.content_boards
  FOR INSERT WITH CHECK (company_id = get_user_company_id() OR is_super_admin());

CREATE POLICY "cb_update" ON public.content_boards
  FOR UPDATE USING (company_id = get_user_company_id() OR is_super_admin());

CREATE POLICY "cb_delete" ON public.content_boards
  FOR DELETE USING (company_id = get_user_company_id() OR is_super_admin());

-- ──────────────────────────────────────────────────────────────
-- 2. AGREGAR board_id a content_calendar
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.content_calendar
  ADD COLUMN IF NOT EXISTS board_id UUID REFERENCES public.content_boards(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS content_calendar_board_idx ON public.content_calendar (board_id);

-- ──────────────────────────────────────────────────────────────
-- 3. RPC: marcar un board como DEFINITIVO (quita el flag del anterior)
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_definitive_board(
  p_board_id   UUID,
  p_company_id UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Quitar definitivo de todos los boards de la empresa
  UPDATE public.content_boards
  SET is_definitive = FALSE
  WHERE company_id = p_company_id;

  -- Marcar el seleccionado
  UPDATE public.content_boards
  SET is_definitive = TRUE
  WHERE id = p_board_id AND company_id = p_company_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_definitive_board(UUID, UUID) TO authenticated;

-- ──────────────────────────────────────────────────────────────
-- 4. RPC: crear board y (opcionalmente) copiar piezas de otro
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_content_board(
  p_company_id  UUID,
  p_name        TEXT,
  p_copy_from   UUID DEFAULT NULL   -- board_id a clonar (null = board vacío)
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_new_board_id UUID;
BEGIN
  INSERT INTO public.content_boards (company_id, name, is_definitive, order_index)
  VALUES (
    p_company_id, p_name, FALSE,
    COALESCE((SELECT MAX(order_index) + 1 FROM public.content_boards WHERE company_id = p_company_id), 0)
  )
  RETURNING id INTO v_new_board_id;

  IF p_copy_from IS NOT NULL THEN
    INSERT INTO public.content_calendar (
      company_id, board_id, title, hook, description, cta,
      publish_date, publish_time, format, pillar, funnel_stage,
      platform, priority_service, status, notes, board_x, board_y, board_order
    )
    SELECT
      company_id, v_new_board_id, title, hook, description, cta,
      publish_date, publish_time, format, pillar, funnel_stage,
      platform, priority_service, 'borrador', notes, board_x, board_y, board_order
    FROM public.content_calendar
    WHERE board_id = p_copy_from AND company_id = p_company_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'board_id', v_new_board_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_content_board(UUID, TEXT, UUID) TO authenticated;

-- ──────────────────────────────────────────────────────────────
-- 5. MIGRAR piezas existentes sin board_id al board principal
--    Crea un board "Principal" por empresa y asigna las piezas
-- ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  rec RECORD;
  v_board_id UUID;
BEGIN
  FOR rec IN
    SELECT DISTINCT company_id FROM public.content_calendar WHERE board_id IS NULL
  LOOP
    -- Buscar si ya existe un board para esta empresa
    SELECT id INTO v_board_id
    FROM public.content_boards
    WHERE company_id = rec.company_id
    ORDER BY created_at LIMIT 1;

    -- Si no existe, crear el board "Principal" como DEFINITIVO
    IF v_board_id IS NULL THEN
      INSERT INTO public.content_boards (company_id, name, is_definitive, order_index)
      VALUES (rec.company_id, 'Principal', TRUE, 0)
      RETURNING id INTO v_board_id;
    END IF;

    -- Asignar piezas sin board a este board
    UPDATE public.content_calendar
    SET board_id = v_board_id
    WHERE company_id = rec.company_id AND board_id IS NULL;
  END LOOP;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 6. VERIFICAR
-- ──────────────────────────────────────────────────────────────
SELECT
  cb.name        AS board_name,
  cb.is_definitive,
  c.name         AS company,
  COUNT(cc.id)   AS piezas
FROM public.content_boards cb
JOIN public.companies c    ON c.id  = cb.company_id
LEFT JOIN public.content_calendar cc ON cc.board_id = cb.id
GROUP BY cb.id, cb.name, cb.is_definitive, c.name
ORDER BY c.name, cb.order_index;
