-- ============================================================
-- MOSAICO PRO — Mosaico Media (empresa dueña de la plataforma)
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. COLUMNA is_platform_owner en companies
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS is_platform_owner BOOLEAN NOT NULL DEFAULT FALSE;

-- ──────────────────────────────────────────────────────────────
-- 2. CREAR (o actualizar) Mosaico Media
-- ──────────────────────────────────────────────────────────────
INSERT INTO public.companies (name, slug, industry, plan, is_platform_owner)
VALUES ('Mosaico Media', 'mosaico-media', 'tecnologia', 'enterprise', TRUE)
ON CONFLICT (slug) DO UPDATE
  SET name              = 'Mosaico Media',
      industry          = 'tecnologia',
      plan              = 'enterprise',
      is_platform_owner = TRUE;

-- ──────────────────────────────────────────────────────────────
-- 3. VINCULAR a Cristóbal con Mosaico Media
--    Busca por cualquiera de sus 3 emails conocidos
-- ──────────────────────────────────────────────────────────────
UPDATE public.users
SET
  company_id     = (SELECT id FROM public.companies WHERE slug = 'mosaico-media'),
  role           = 'owner',
  is_super_admin = TRUE
WHERE auth_user_id IN (
  SELECT id FROM auth.users
  WHERE email IN (
    'cristobalfelipeantonio@gmail.com',
    'cristobal.sl511@gmail.com',
    'contactomosaicomedia@gmail.com'
  )
);

-- ──────────────────────────────────────────────────────────────
-- 4. RPC: resumen de todas las empresas cliente (solo super_admin)
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_platform_overview()
RETURNS TABLE (
  company_id        UUID,
  company_name      TEXT,
  slug              TEXT,
  industry          TEXT,
  plan              TEXT,
  user_count        BIGINT,
  content_count     BIGINT,
  last_activity     TIMESTAMPTZ
) LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Acceso denegado';
  END IF;

  RETURN QUERY
  SELECT
    c.id                              AS company_id,
    c.name                            AS company_name,
    c.slug                            AS slug,
    COALESCE(c.industry, 'sin rubro') AS industry,
    COALESCE(c.plan, 'free')          AS plan,
    COUNT(DISTINCT u.id)::BIGINT      AS user_count,
    COUNT(DISTINCT cc.id)::BIGINT     AS content_count,
    MAX(al.changed_at)                AS last_activity
  FROM public.companies c
  LEFT JOIN public.users           u  ON u.company_id  = c.id
  LEFT JOIN public.content_calendar cc ON cc.company_id = c.id
  LEFT JOIN public.audit_log       al ON al.company_id  = c.id
  WHERE c.is_platform_owner = FALSE
  GROUP BY c.id, c.name, c.slug, c.industry, c.plan
  ORDER BY c.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_platform_overview() TO authenticated;

-- ──────────────────────────────────────────────────────────────
-- 5. VERIFICAR
-- ──────────────────────────────────────────────────────────────
SELECT
  c.name,
  c.slug,
  c.industry,
  c.plan,
  c.is_platform_owner,
  u.first_name,
  u.role,
  u.is_super_admin
FROM public.companies c
LEFT JOIN public.users u ON u.company_id = c.id
WHERE c.is_platform_owner = TRUE OR u.is_super_admin = TRUE;
