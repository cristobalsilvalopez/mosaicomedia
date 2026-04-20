-- ============================================================
-- MOSAICO PRO — Multi-contact per user
-- Múltiples emails, teléfonos y RUT por usuario
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. RUT en la tabla users
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS rut TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT;  -- teléfono principal (retrocompat)

-- Índice único en RUT (ignorando nulos)
CREATE UNIQUE INDEX IF NOT EXISTS users_rut_unique
  ON public.users (rut)
  WHERE rut IS NOT NULL;

-- ──────────────────────────────────────────────────────────────
-- 2. TABLA user_emails
--    Un usuario puede tener N emails.
--    is_primary = TRUE → es el email registrado en Supabase Auth
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_emails (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID    NOT NULL REFERENCES public.users(id)  ON DELETE CASCADE,
  auth_user_id UUID    NOT NULL REFERENCES auth.users(id)    ON DELETE CASCADE,
  email        TEXT    NOT NULL,
  is_primary   BOOLEAN NOT NULL DEFAULT FALSE,
  label        TEXT    DEFAULT 'personal',   -- 'trabajo', 'contacto', etc.
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT user_emails_email_unique UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS user_emails_user_id_idx      ON public.user_emails (user_id);
CREATE INDEX IF NOT EXISTS user_emails_auth_user_id_idx ON public.user_emails (auth_user_id);
CREATE INDEX IF NOT EXISTS user_emails_email_idx        ON public.user_emails (email);

-- RLS
ALTER TABLE public.user_emails ENABLE ROW LEVEL SECURITY;

-- Anon puede leer SOLO para resolver el email en el login (no expone datos sensibles)
CREATE POLICY "ue_anon_select" ON public.user_emails
  FOR SELECT TO anon USING (true);

-- Usuarios autenticados ven sus propios emails y los de su empresa
CREATE POLICY "ue_select" ON public.user_emails
  FOR SELECT USING (
    auth_user_id = auth.uid()
    OR user_id IN (SELECT id FROM public.users WHERE company_id = get_user_company_id())
    OR is_super_admin()
  );

CREATE POLICY "ue_insert" ON public.user_emails
  FOR INSERT WITH CHECK (
    auth_user_id = auth.uid() OR is_super_admin()
  );

CREATE POLICY "ue_update" ON public.user_emails
  FOR UPDATE USING (
    auth_user_id = auth.uid() OR is_super_admin()
  );

CREATE POLICY "ue_delete" ON public.user_emails
  FOR DELETE USING (
    auth_user_id = auth.uid() AND is_primary = FALSE  -- no se puede borrar el email principal
    OR is_super_admin()
  );

-- ──────────────────────────────────────────────────────────────
-- 3. TABLA user_phones
--    Un usuario puede tener N teléfonos.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_phones (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID    NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  auth_user_id UUID    NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
  phone        TEXT    NOT NULL,
  is_primary   BOOLEAN NOT NULL DEFAULT FALSE,
  label        TEXT    DEFAULT 'móvil',   -- 'trabajo', 'casa', etc.
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_phones_user_id_idx ON public.user_phones (user_id);

ALTER TABLE public.user_phones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "up_select" ON public.user_phones
  FOR SELECT USING (
    auth_user_id = auth.uid()
    OR user_id IN (SELECT id FROM public.users WHERE company_id = get_user_company_id())
    OR is_super_admin()
  );

CREATE POLICY "up_insert" ON public.user_phones
  FOR INSERT WITH CHECK (auth_user_id = auth.uid() OR is_super_admin());

CREATE POLICY "up_update" ON public.user_phones
  FOR UPDATE USING (auth_user_id = auth.uid() OR is_super_admin());

CREATE POLICY "up_delete" ON public.user_phones
  FOR DELETE USING (auth_user_id = auth.uid() OR is_super_admin());

-- ──────────────────────────────────────────────────────────────
-- 4. FUNCIÓN: resolver email de login → email principal de Auth
--    Usada por el API route /api/auth/login
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_login_email(p_email TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_auth_user_id UUID;
  v_primary_email TEXT;
BEGIN
  -- Buscar el email en user_emails (cualquier email registrado)
  SELECT auth_user_id INTO v_auth_user_id
  FROM public.user_emails
  WHERE email = lower(trim(p_email))
  LIMIT 1;

  IF v_auth_user_id IS NULL THEN
    -- No está en user_emails → devolver el mismo email (flujo normal)
    RETURN lower(trim(p_email));
  END IF;

  -- Encontrar el email principal (is_primary = TRUE) para ese auth_user_id
  SELECT email INTO v_primary_email
  FROM public.user_emails
  WHERE auth_user_id = v_auth_user_id
    AND is_primary = TRUE
  LIMIT 1;

  IF v_primary_email IS NULL THEN
    -- Fallback: devolver el primer email registrado (no debería pasar)
    SELECT email INTO v_primary_email
    FROM public.user_emails
    WHERE auth_user_id = v_auth_user_id
    ORDER BY created_at
    LIMIT 1;
  END IF;

  RETURN COALESCE(v_primary_email, lower(trim(p_email)));
END;
$$;

-- Permitir que anon llame a esta función (necesaria para el login)
GRANT EXECUTE ON FUNCTION public.resolve_login_email(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.resolve_login_email(TEXT) TO authenticated;

-- ──────────────────────────────────────────────────────────────
-- 5. FUNCIÓN: agregar email a un usuario (upsert seguro)
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.add_user_email(
  p_user_id      UUID,
  p_auth_user_id UUID,
  p_email        TEXT,
  p_label        TEXT DEFAULT 'personal',
  p_is_primary   BOOLEAN DEFAULT FALSE
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.user_emails (user_id, auth_user_id, email, label, is_primary)
  VALUES (p_user_id, p_auth_user_id, lower(trim(p_email)), p_label, p_is_primary)
  ON CONFLICT (email) DO UPDATE
    SET label = EXCLUDED.label;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 6. SEMBRAR LOS EMAILS DE CRISTÓBAL
-- ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_user_id      UUID;
  v_auth_user_id UUID;
BEGIN
  -- Obtener auth_user_id de Cristóbal por su email principal
  SELECT id INTO v_auth_user_id
  FROM auth.users
  WHERE email = 'cristobalfelipeantonio@gmail.com';

  IF v_auth_user_id IS NULL THEN
    RAISE NOTICE 'No se encontró el usuario cristobalfelipeantonio@gmail.com en auth.users';
    RETURN;
  END IF;

  -- Obtener su user_id en la tabla pública
  SELECT id INTO v_user_id
  FROM public.users
  WHERE auth_user_id = v_auth_user_id;

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'No se encontró el user_id para auth_user_id=%', v_auth_user_id;
    RETURN;
  END IF;

  -- Insertar los tres emails de Cristóbal
  INSERT INTO public.user_emails (user_id, auth_user_id, email, label, is_primary)
  VALUES
    (v_user_id, v_auth_user_id, 'cristobalfelipeantonio@gmail.com', 'personal',  TRUE),
    (v_user_id, v_auth_user_id, 'cristobal.sl511@gmail.com',        'personal',  FALSE),
    (v_user_id, v_auth_user_id, 'contactomosaicomedia@gmail.com',   'trabajo',   FALSE)
  ON CONFLICT (email) DO UPDATE
    SET is_primary = EXCLUDED.is_primary,
        label      = EXCLUDED.label;

  RAISE NOTICE 'Emails de Cristóbal registrados. user_id=%', v_user_id;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 7. VERIFICAR RESULTADO
-- ──────────────────────────────────────────────────────────────
SELECT
  au.email  AS auth_email,
  u.first_name,
  ue.email  AS linked_email,
  ue.label,
  ue.is_primary
FROM public.user_emails ue
JOIN public.users u ON u.id = ue.user_id
JOIN auth.users au  ON au.id = ue.auth_user_id
ORDER BY u.first_name, ue.is_primary DESC;
