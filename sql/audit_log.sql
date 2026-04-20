-- ============================================================
-- MOSAICO PRO — Audit Log (historial de cambios)
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. TABLA audit_log
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID        REFERENCES public.companies(id) ON DELETE SET NULL,
  user_id      UUID        REFERENCES public.users(id)     ON DELETE SET NULL,
  auth_user_id UUID,
  table_name   TEXT        NOT NULL,
  operation    TEXT        NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE')),
  record_id    TEXT,                   -- PK del registro afectado
  old_data     JSONB,                  -- datos antes del cambio (UPDATE/DELETE)
  new_data     JSONB,                  -- datos después del cambio (INSERT/UPDATE)
  changed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_log_company_idx    ON public.audit_log (company_id);
CREATE INDEX IF NOT EXISTS audit_log_user_idx       ON public.audit_log (user_id);
CREATE INDEX IF NOT EXISTS audit_log_table_idx      ON public.audit_log (table_name);
CREATE INDEX IF NOT EXISTS audit_log_changed_at_idx ON public.audit_log (changed_at DESC);

-- RLS: solo super_admin y owner/admin de la empresa pueden ver el historial
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_select" ON public.audit_log
  FOR SELECT USING (
    is_super_admin()
    OR (
      company_id = get_user_company_id()
      AND get_user_role() IN ('admin', 'owner')
    )
  );

-- La inserción la hacen los triggers (SECURITY DEFINER), no los usuarios directamente
CREATE POLICY "audit_insert_service" ON public.audit_log
  FOR INSERT WITH CHECK (true);

-- ──────────────────────────────────────────────────────────────
-- 2. FUNCIÓN TRIGGER genérica
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_audit_trigger()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_company_id   UUID;
  v_user_id      UUID;
  v_auth_user_id UUID := auth.uid();
  v_record_id    TEXT;
  v_old          JSONB;
  v_new          JSONB;
BEGIN
  -- Obtener company_id del registro.
  -- La tabla companies no tiene company_id — ella misma es la empresa.
  IF TG_OP = 'DELETE' THEN
    v_record_id  := (OLD.id)::TEXT;
    v_old        := to_jsonb(OLD);
    v_new        := NULL;
    IF TG_TABLE_NAME = 'companies' THEN
      v_company_id := (OLD.id)::UUID;
    ELSE
      v_company_id := (OLD.company_id)::UUID;
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    v_record_id  := (NEW.id)::TEXT;
    v_old        := NULL;
    v_new        := to_jsonb(NEW);
    IF TG_TABLE_NAME = 'companies' THEN
      v_company_id := (NEW.id)::UUID;
    ELSE
      v_company_id := (NEW.company_id)::UUID;
    END IF;
  ELSE -- UPDATE
    v_record_id  := COALESCE((NEW.id)::TEXT, (OLD.id)::TEXT);
    v_old        := to_jsonb(OLD);
    v_new        := to_jsonb(NEW);
    IF TG_TABLE_NAME = 'companies' THEN
      v_company_id := COALESCE((NEW.id)::UUID, (OLD.id)::UUID);
    ELSE
      v_company_id := COALESCE((NEW.company_id)::UUID, (OLD.company_id)::UUID);
    END IF;
  END IF;

  -- Buscar el user_id en public.users por auth_user_id
  IF v_auth_user_id IS NOT NULL THEN
    SELECT id INTO v_user_id FROM public.users WHERE auth_user_id = v_auth_user_id LIMIT 1;
  END IF;

  -- Evitar ruido: no loguear si solo cambia updated_at
  IF TG_OP = 'UPDATE' AND (v_old - 'updated_at') = (v_new - 'updated_at') THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.audit_log
    (company_id, user_id, auth_user_id, table_name, operation, record_id, old_data, new_data)
  VALUES
    (v_company_id, v_user_id, v_auth_user_id, TG_TABLE_NAME, TG_OP, v_record_id, v_old, v_new);

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 3. APLICAR TRIGGERS A TABLAS CLAVE
-- ──────────────────────────────────────────────────────────────

-- content_calendar (marketing)
DROP TRIGGER IF EXISTS audit_content_calendar ON public.content_calendar;
CREATE TRIGGER audit_content_calendar
  AFTER INSERT OR UPDATE OR DELETE ON public.content_calendar
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

-- content_pillars
DROP TRIGGER IF EXISTS audit_content_pillars ON public.content_pillars;
CREATE TRIGGER audit_content_pillars
  AFTER INSERT OR UPDATE OR DELETE ON public.content_pillars
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

-- content_packs
DROP TRIGGER IF EXISTS audit_content_packs ON public.content_packs;
CREATE TRIGGER audit_content_packs
  AFTER INSERT OR UPDATE OR DELETE ON public.content_packs
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

-- users (cambios de rol, activación, etc.)
DROP TRIGGER IF EXISTS audit_users ON public.users;
CREATE TRIGGER audit_users
  AFTER INSERT OR UPDATE OR DELETE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

-- companies (cambios de configuración)
DROP TRIGGER IF EXISTS audit_companies ON public.companies;
CREATE TRIGGER audit_companies
  AFTER INSERT OR UPDATE OR DELETE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

-- employees
DROP TRIGGER IF EXISTS audit_employees ON public.employees;
CREATE TRIGGER audit_employees
  AFTER INSERT OR UPDATE OR DELETE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

-- contracts
DROP TRIGGER IF EXISTS audit_contracts ON public.contracts;
CREATE TRIGGER audit_contracts
  AFTER INSERT OR UPDATE OR DELETE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

-- expenses
DROP TRIGGER IF EXISTS audit_expenses ON public.expenses;
CREATE TRIGGER audit_expenses
  AFTER INSERT OR UPDATE OR DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

-- ──────────────────────────────────────────────────────────────
-- 4. FUNCIÓN RPC para leer el historial (con join a users)
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_audit_log(
  p_company_id UUID,
  p_limit      INT DEFAULT 100,
  p_offset     INT DEFAULT 0
)
RETURNS TABLE (
  id           UUID,
  table_name   TEXT,
  operation    TEXT,
  record_id    TEXT,
  old_data     JSONB,
  new_data     JSONB,
  changed_at   TIMESTAMPTZ,
  user_name    TEXT,
  user_email   TEXT
) LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
BEGIN
  RETURN QUERY
  SELECT
    al.id,
    al.table_name,
    al.operation,
    al.record_id,
    al.old_data,
    al.new_data,
    al.changed_at,
    COALESCE(u.first_name || ' ' || u.last_name, 'Sistema') AS user_name,
    au.email::TEXT AS user_email
  FROM public.audit_log al
  LEFT JOIN public.users u  ON u.id  = al.user_id
  LEFT JOIN auth.users au   ON au.id = al.auth_user_id
  WHERE al.company_id = p_company_id
     OR (p_company_id IS NULL AND is_super_admin())
  ORDER BY al.changed_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;
