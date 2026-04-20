-- ============================================================
-- MOSAICO PRO — Pizarra colaborativa por pieza de contenido
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. Nuevas columnas en content_calendar
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.content_calendar
  ADD COLUMN IF NOT EXISTS whiteboard_data JSONB    NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS media_urls      TEXT[]   NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS script_text     TEXT              DEFAULT NULL;

-- ──────────────────────────────────────────────────────────────
-- 2. Bucket de Storage para archivos de contenido
-- ──────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'content-media',
  'content-media',
  true,
  524288000,  -- 500 MB
  ARRAY[
    'image/jpeg','image/png','image/webp','image/gif','image/svg+xml',
    'video/mp4','video/quicktime','video/webm','video/x-msvideo',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 524288000;

-- Políticas de storage
DROP POLICY IF EXISTS "content_media_select" ON storage.objects;
DROP POLICY IF EXISTS "content_media_insert" ON storage.objects;
DROP POLICY IF EXISTS "content_media_delete" ON storage.objects;

CREATE POLICY "content_media_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'content-media');

CREATE POLICY "content_media_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'content-media' AND auth.role() = 'authenticated');

CREATE POLICY "content_media_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'content-media' AND auth.role() = 'authenticated');

-- ──────────────────────────────────────────────────────────────
-- 3. RPC: Actualizar pizarra y datos de pieza
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_piece_whiteboard(
  p_id            UUID,
  p_company_id    UUID,
  p_whiteboard    JSONB    DEFAULT NULL,
  p_media_urls    TEXT[]   DEFAULT NULL,
  p_script_text   TEXT     DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.content_calendar
  SET
    whiteboard_data = COALESCE(p_whiteboard,  whiteboard_data),
    media_urls      = COALESCE(p_media_urls,  media_urls),
    script_text     = COALESCE(p_script_text, script_text)
  WHERE id = p_id AND company_id = p_company_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_piece_whiteboard(UUID, UUID, JSONB, TEXT[], TEXT) TO authenticated;

-- ──────────────────────────────────────────────────────────────
-- 4. VERIFICAR
-- ──────────────────────────────────────────────────────────────
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'content_calendar'
  AND column_name IN ('whiteboard_data','media_urls','script_text')
ORDER BY column_name;
