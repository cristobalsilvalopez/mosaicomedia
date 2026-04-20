-- ============================================================
-- MOSAICO PRO — Fix: roles, empresas y datos de marketing
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. ASEGURARSE DE QUE EXISTAN LAS DOS EMPRESAS CLIENTE
-- ──────────────────────────────────────────────────────────────

-- Crear BadWoman si no existe
INSERT INTO public.companies (name, slug, industry)
VALUES ('BadWoman', 'badwoman', 'retail')
ON CONFLICT (slug) DO NOTHING;

-- Crear Centro Médico Lya si no existe
INSERT INTO public.companies (name, slug, industry)
VALUES ('Centro Médico Lya', 'centro-medico-lya', 'salud')
ON CONFLICT (slug) DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- 2. ARREGLAR EL ROL DE CRISTÓBAL
--    Cambiar de 'cajero' a 'owner' en su empresa actual
-- ──────────────────────────────────────────────────────────────
UPDATE public.users
SET role = 'owner'
FROM auth.users au
WHERE public.users.auth_user_id = au.id
  AND au.email = 'cristobal.sl511@gmail.com';

-- ──────────────────────────────────────────────────────────────
-- 3. LIMPIAR DATOS DE MARKETING MAL ASIGNADOS
--    Mover todo el contenido de Lya que esté en la empresa
--    equivocada (BadWoman) a Centro Médico Lya
-- ──────────────────────────────────────────────────────────────

DO $$
DECLARE
  lya_id   UUID;
  bad_id   UUID;
BEGIN
  SELECT id INTO lya_id FROM public.companies WHERE slug = 'centro-medico-lya';
  SELECT id INTO bad_id  FROM public.companies WHERE slug = 'badwoman';

  IF lya_id IS NULL OR bad_id IS NULL THEN
    RAISE NOTICE 'Una de las empresas no existe aún. Verifica los slugs.';
    RETURN;
  END IF;

  -- Reasignar pillars de Lya que estén en BadWoman
  UPDATE public.content_pillars
  SET company_id = lya_id
  WHERE company_id = bad_id
    AND name ILIKE ANY(ARRAY['%autoridad%','%transformación%','%receta%','%bienestar%','%conversión%',
                              '%transformacion%','%receta secreta%']);

  -- Reasignar packs de Lya que estén en BadWoman
  UPDATE public.content_packs
  SET company_id = lya_id
  WHERE company_id = bad_id
    AND name ILIKE ANY(ARRAY['%esencia%','%papá%','%papa%','%trabajador%','%vacaciones%','%receta%']);

  -- Reasignar piezas de calendario que claramente son de Lya (contienen nombres de servicios médicos)
  UPDATE public.content_calendar
  SET company_id = lya_id
  WHERE company_id = bad_id
    AND (
      title ILIKE '%lya%'
      OR title ILIKE '%médic%'
      OR title ILIKE '%medic%'
      OR title ILIKE '%receta secreta%'
      OR title ILIKE '%alopecia%'
      OR title ILIKE '%papá%'
      OR title ILIKE '%papa%'
      OR description ILIKE '%lya%'
      OR priority_service ILIKE '%lya%'
      OR priority_service ILIKE '%alopecia%'
      OR priority_service ILIKE '%receta%'
    );

  RAISE NOTICE 'Datos reasignados: Lya=% | BadWoman=%', lya_id, bad_id;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 4. VERIFICAR RESULTADO
-- ──────────────────────────────────────────────────────────────
SELECT
  c.name                                  AS empresa,
  COUNT(DISTINCT cp.id)                   AS pillars,
  COUNT(DISTINCT pk.id)                   AS packs,
  COUNT(DISTINCT cc.id)                   AS piezas_calendario
FROM public.companies c
LEFT JOIN public.content_pillars   cp ON cp.company_id = c.id
LEFT JOIN public.content_packs     pk ON pk.company_id = c.id
LEFT JOIN public.content_calendar  cc ON cc.company_id = c.id
WHERE c.slug IN ('badwoman','centro-medico-lya')
GROUP BY c.name
ORDER BY c.name;

-- ──────────────────────────────────────────────────────────────
-- 5. VER TODOS LOS USUARIOS Y SUS EMPRESAS (diagnóstico)
-- ──────────────────────────────────────────────────────────────
SELECT
  au.email,
  u.first_name,
  u.last_name,
  u.role,
  u.is_super_admin,
  co.name AS empresa
FROM public.users u
JOIN auth.users au ON au.id = u.auth_user_id
LEFT JOIN public.companies co ON co.id = u.company_id
ORDER BY au.email;
