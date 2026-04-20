-- ============================================================
-- FIX: fn_audit_trigger — soporte para tabla companies
-- La tabla companies no tiene company_id; usa su propio id.
-- Ejecutar ANTES de mosaico_media_setup.sql
-- ============================================================

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

  -- Buscar user_id en public.users
  IF v_auth_user_id IS NOT NULL THEN
    SELECT id INTO v_user_id
    FROM public.users
    WHERE auth_user_id = v_auth_user_id
    LIMIT 1;
  END IF;

  -- No loguear si solo cambia updated_at
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
