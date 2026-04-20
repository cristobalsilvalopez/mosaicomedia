-- ============================================================
-- MOSAICO PRO — Módulo Contratos
-- Ejecutar completo en el SQL Editor de Supabase
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. TABLAS
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS contract_documents (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id       UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  contract_id       UUID REFERENCES contracts(id),
  contract_type     TEXT NOT NULL DEFAULT 'indefinido',
  title             TEXT,
  start_date        DATE NOT NULL,
  end_date          DATE,
  salary            NUMERIC(12,2),
  hours_per_week    INTEGER DEFAULT 45,
  "position"        TEXT,
  department        TEXT,
  status            TEXT NOT NULL DEFAULT 'draft',
  content           JSONB DEFAULT '{}',
  ai_draft_text     TEXT,
  notes             TEXT,
  signed_at         TIMESTAMPTZ,
  terminated_at     TIMESTAMPTZ,
  termination_notes TEXT,
  expiry_alert_sent BOOLEAN DEFAULT FALSE,
  created_by        UUID,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contract_annexes (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id           UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contract_document_id UUID NOT NULL REFERENCES contract_documents(id) ON DELETE CASCADE,
  employee_id          UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  annex_type           TEXT NOT NULL DEFAULT 'other',
  title                TEXT,
  effective_date       DATE NOT NULL,
  content              JSONB DEFAULT '{}',
  ai_draft_text        TEXT,
  status               TEXT NOT NULL DEFAULT 'draft',
  notes                TEXT,
  signed_at            TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contract_templates (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contract_type TEXT NOT NULL DEFAULT 'indefinido',
  name          TEXT NOT NULL,
  clauses       JSONB DEFAULT '[]',
  variables     JSONB DEFAULT '{}',
  is_default    BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contract_document_history (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id           UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contract_document_id UUID NOT NULL REFERENCES contract_documents(id) ON DELETE CASCADE,
  action               TEXT NOT NULL,
  from_status          TEXT,
  to_status            TEXT,
  performed_by         UUID,
  notes                TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cdocs_company       ON contract_documents(company_id);
CREATE INDEX IF NOT EXISTS idx_cdocs_employee      ON contract_documents(employee_id, status);
CREATE INDEX IF NOT EXISTS idx_cdocs_status        ON contract_documents(company_id, status);
CREATE INDEX IF NOT EXISTS idx_cannexes_contract   ON contract_annexes(contract_document_id);
CREATE INDEX IF NOT EXISTS idx_cannexes_company    ON contract_annexes(company_id);
CREATE INDEX IF NOT EXISTS idx_ctemplates_company  ON contract_templates(company_id, contract_type);
CREATE INDEX IF NOT EXISTS idx_chistory_doc        ON contract_document_history(contract_document_id);

-- ──────────────────────────────────────────────────────────────
-- 2. RLS
-- ──────────────────────────────────────────────────────────────

ALTER TABLE contract_documents        ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_annexes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_templates        ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_document_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cd_select" ON contract_documents;
DROP POLICY IF EXISTS "cd_insert" ON contract_documents;
DROP POLICY IF EXISTS "cd_update" ON contract_documents;

CREATE POLICY "cd_select" ON contract_documents FOR SELECT  USING (company_id = get_user_company_id());
CREATE POLICY "cd_insert" ON contract_documents FOR INSERT  WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "cd_update" ON contract_documents FOR UPDATE  USING (company_id = get_user_company_id());

DROP POLICY IF EXISTS "ca_select" ON contract_annexes;
DROP POLICY IF EXISTS "ca_insert" ON contract_annexes;
DROP POLICY IF EXISTS "ca_update" ON contract_annexes;

CREATE POLICY "ca_select" ON contract_annexes FOR SELECT  USING (company_id = get_user_company_id());
CREATE POLICY "ca_insert" ON contract_annexes FOR INSERT  WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "ca_update" ON contract_annexes FOR UPDATE  USING (company_id = get_user_company_id());

DROP POLICY IF EXISTS "ct_select" ON contract_templates;
DROP POLICY IF EXISTS "ct_insert" ON contract_templates;
DROP POLICY IF EXISTS "ct_update" ON contract_templates;

CREATE POLICY "ct_select" ON contract_templates FOR SELECT  USING (company_id = get_user_company_id());
CREATE POLICY "ct_insert" ON contract_templates FOR INSERT  WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "ct_update" ON contract_templates FOR UPDATE  USING (company_id = get_user_company_id());

DROP POLICY IF EXISTS "cdh_select" ON contract_document_history;
DROP POLICY IF EXISTS "cdh_insert" ON contract_document_history;

CREATE POLICY "cdh_select" ON contract_document_history FOR SELECT  USING (company_id = get_user_company_id());
CREATE POLICY "cdh_insert" ON contract_document_history FOR INSERT  WITH CHECK (company_id = get_user_company_id());

-- ──────────────────────────────────────────────────────────────
-- 3. FUNCIONES RPC
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_contract_documents(
  p_company_id  UUID,
  p_employee_id UUID DEFAULT NULL,
  p_status      TEXT DEFAULT NULL
)
RETURNS TABLE (
  id                UUID,
  employee_id       UUID,
  employee_name     TEXT,
  employee_rut      TEXT,
  employee_position TEXT,
  contract_type     TEXT,
  title             TEXT,
  start_date        DATE,
  end_date          DATE,
  salary            NUMERIC,
  hours_per_week    INTEGER,
  "position"        TEXT,
  department        TEXT,
  status            TEXT,
  content           JSONB,
  ai_draft_text     TEXT,
  notes             TEXT,
  signed_at         TIMESTAMPTZ,
  terminated_at     TIMESTAMPTZ,
  termination_notes TEXT,
  annex_count       BIGINT,
  created_at        TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ
)
LANGUAGE SQL STABLE SECURITY DEFINER
AS $$
  SELECT
    cd.id,
    cd.employee_id,
    e.first_name || ' ' || e.last_name                         AS employee_name,
    e.rut                                                       AS employee_rut,
    e."position"                                               AS employee_position,
    cd.contract_type,
    COALESCE(cd.title,
      (CASE cd.contract_type
        WHEN 'indefinido'   THEN 'Contrato Indefinido'
        WHEN 'plazo_fijo'   THEN 'Contrato a Plazo Fijo'
        WHEN 'obra_faena'   THEN 'Contrato por Obra o Faena'
        WHEN 'part_time'    THEN 'Contrato Part-Time'
        WHEN 'temporada'    THEN 'Contrato de Temporada'
        WHEN 'aprendizaje'  THEN 'Contrato de Aprendizaje'
        ELSE                     'Contrato'
      END) || ' — ' || e.first_name || ' ' || e.last_name
    )                                                          AS title,
    cd.start_date,
    cd.end_date,
    cd.salary,
    cd.hours_per_week,
    cd."position",
    cd.department,
    cd.status,
    cd.content,
    cd.ai_draft_text,
    cd.notes,
    cd.signed_at,
    cd.terminated_at,
    cd.termination_notes,
    COUNT(ca.id)                                               AS annex_count,
    cd.created_at,
    cd.updated_at
  FROM contract_documents cd
  JOIN employees e ON e.id = cd.employee_id
  LEFT JOIN contract_annexes ca ON ca.contract_document_id = cd.id
  WHERE cd.company_id = p_company_id
    AND (p_employee_id IS NULL OR cd.employee_id = p_employee_id)
    AND (p_status      IS NULL OR cd.status      = p_status)
  GROUP BY cd.id, e.first_name, e.last_name, e.rut, e."position"
  ORDER BY cd.updated_at DESC;
$$;

CREATE OR REPLACE FUNCTION get_contract_annexes(
  p_company_id          UUID,
  p_contract_document_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id                   UUID,
  contract_document_id UUID,
  employee_id          UUID,
  employee_name        TEXT,
  annex_type           TEXT,
  title                TEXT,
  effective_date       DATE,
  content              JSONB,
  ai_draft_text        TEXT,
  status               TEXT,
  notes                TEXT,
  signed_at            TIMESTAMPTZ,
  created_at           TIMESTAMPTZ
)
LANGUAGE SQL STABLE SECURITY DEFINER
AS $$
  SELECT
    ca.id,
    ca.contract_document_id,
    ca.employee_id,
    e.first_name || ' ' || e.last_name AS employee_name,
    ca.annex_type,
    COALESCE(ca.title,
      CASE ca.annex_type
        WHEN 'salary_change'   THEN 'Anexo: Modificación de Remuneración'
        WHEN 'position_change' THEN 'Anexo: Cambio de Cargo'
        WHEN 'hours_change'    THEN 'Anexo: Modificación de Jornada'
        WHEN 'bonus'           THEN 'Anexo: Bono / Incentivo'
        WHEN 'remote_work'     THEN 'Anexo: Teletrabajo'
        WHEN 'confidentiality' THEN 'Anexo: Confidencialidad'
        ELSE                        'Anexo de Contrato'
      END
    )                          AS title,
    ca.effective_date,
    ca.content,
    ca.ai_draft_text,
    ca.status,
    ca.notes,
    ca.signed_at,
    ca.created_at
  FROM contract_annexes ca
  JOIN employees e ON e.id = ca.employee_id
  WHERE ca.company_id = p_company_id
    AND (p_contract_document_id IS NULL OR ca.contract_document_id = p_contract_document_id)
  ORDER BY ca.effective_date DESC, ca.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION upsert_contract_document(p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_id         UUID;
  v_company_id UUID;
  v_user_id    UUID;
  v_old_status TEXT;
  v_new_status TEXT;
BEGIN
  v_id         := NULLIF(p_data->>'id', '')::UUID;
  v_company_id := (p_data->>'company_id')::UUID;
  v_new_status := COALESCE(NULLIF(p_data->>'status', ''), 'draft');

  SELECT id INTO v_user_id FROM users WHERE auth_user_id = auth.uid() LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO contract_documents (
      company_id, employee_id, contract_id, contract_type,
      title, start_date, end_date, salary, hours_per_week,
      "position", department, status, content, ai_draft_text,
      notes, signed_at, terminated_at, termination_notes, created_by
    ) VALUES (
      v_company_id,
      (p_data->>'employee_id')::UUID,
      NULLIF(p_data->>'contract_id', '')::UUID,
      COALESCE(NULLIF(p_data->>'contract_type', ''), 'indefinido'),
      NULLIF(p_data->>'title', ''),
      (p_data->>'start_date')::DATE,
      NULLIF(p_data->>'end_date', '')::DATE,
      NULLIF(p_data->>'salary', '')::NUMERIC,
      COALESCE(NULLIF(p_data->>'hours_per_week', '')::INTEGER, 45),
      NULLIF(p_data->>'position', ''),
      NULLIF(p_data->>'department', ''),
      v_new_status,
      COALESCE(p_data->'content', '{}'),
      NULLIF(p_data->>'ai_draft_text', ''),
      NULLIF(p_data->>'notes', ''),
      NULLIF(p_data->>'signed_at', '')::TIMESTAMPTZ,
      NULLIF(p_data->>'terminated_at', '')::TIMESTAMPTZ,
      NULLIF(p_data->>'termination_notes', ''),
      v_user_id
    )
    RETURNING id INTO v_id;

    INSERT INTO contract_document_history
      (company_id, contract_document_id, action, to_status, performed_by)
    VALUES (v_company_id, v_id, 'created', v_new_status, v_user_id);

  ELSE
    SELECT status INTO v_old_status
    FROM contract_documents WHERE id = v_id AND company_id = v_company_id;

    UPDATE contract_documents SET
      contract_type     = COALESCE(NULLIF(p_data->>'contract_type', ''), contract_type),
      title             = COALESCE(NULLIF(p_data->>'title', ''),          title),
      start_date        = COALESCE(NULLIF(p_data->>'start_date', '')::DATE, start_date),
      end_date          = CASE WHEN p_data ? 'end_date' THEN NULLIF(p_data->>'end_date','')::DATE ELSE end_date END,
      salary            = COALESCE(NULLIF(p_data->>'salary', '')::NUMERIC,  salary),
      hours_per_week    = COALESCE(NULLIF(p_data->>'hours_per_week','')::INTEGER, hours_per_week),
      "position"        = COALESCE(NULLIF(p_data->>'position',''),         "position"),
      department        = COALESCE(NULLIF(p_data->>'department',''),       department),
      status            = v_new_status,
      content           = COALESCE(p_data->'content',                      content),
      ai_draft_text     = COALESCE(NULLIF(p_data->>'ai_draft_text',''),    ai_draft_text),
      notes             = CASE WHEN p_data ? 'notes' THEN NULLIF(p_data->>'notes','') ELSE notes END,
      signed_at         = COALESCE(NULLIF(p_data->>'signed_at','')::TIMESTAMPTZ,     signed_at),
      terminated_at     = COALESCE(NULLIF(p_data->>'terminated_at','')::TIMESTAMPTZ, terminated_at),
      termination_notes = COALESCE(NULLIF(p_data->>'termination_notes',''), termination_notes),
      updated_at        = NOW()
    WHERE id = v_id AND company_id = v_company_id;

    IF v_old_status IS DISTINCT FROM v_new_status THEN
      INSERT INTO contract_document_history
        (company_id, contract_document_id, action, from_status, to_status, performed_by, notes)
      VALUES
        (v_company_id, v_id, 'status_changed', v_old_status, v_new_status, v_user_id,
         NULLIF(p_data->>'notes',''));
    END IF;
  END IF;

  RETURN jsonb_build_object('success', TRUE, 'id', v_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION upsert_contract_annex(p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_id         UUID;
  v_company_id UUID;
  v_user_id    UUID;
BEGIN
  v_id         := NULLIF(p_data->>'id', '')::UUID;
  v_company_id := (p_data->>'company_id')::UUID;

  SELECT id INTO v_user_id FROM users WHERE auth_user_id = auth.uid() LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO contract_annexes (
      company_id, contract_document_id, employee_id,
      annex_type, title, effective_date,
      content, ai_draft_text, status, notes, signed_at
    ) VALUES (
      v_company_id,
      (p_data->>'contract_document_id')::UUID,
      (p_data->>'employee_id')::UUID,
      COALESCE(NULLIF(p_data->>'annex_type',''), 'other'),
      NULLIF(p_data->>'title',''),
      (p_data->>'effective_date')::DATE,
      COALESCE(p_data->'content', '{}'),
      NULLIF(p_data->>'ai_draft_text',''),
      COALESCE(NULLIF(p_data->>'status',''), 'draft'),
      NULLIF(p_data->>'notes',''),
      NULLIF(p_data->>'signed_at','')::TIMESTAMPTZ
    )
    RETURNING id INTO v_id;

    INSERT INTO contract_document_history
      (company_id, contract_document_id, action, performed_by, notes)
    VALUES
      (v_company_id, (p_data->>'contract_document_id')::UUID,
       'annex_added', v_user_id, NULLIF(p_data->>'annex_type',''));

  ELSE
    UPDATE contract_annexes SET
      annex_type     = COALESCE(NULLIF(p_data->>'annex_type',''),      annex_type),
      title          = COALESCE(NULLIF(p_data->>'title',''),            title),
      effective_date = COALESCE(NULLIF(p_data->>'effective_date','')::DATE, effective_date),
      content        = COALESCE(p_data->'content',                      content),
      ai_draft_text  = COALESCE(NULLIF(p_data->>'ai_draft_text',''),   ai_draft_text),
      status         = COALESCE(NULLIF(p_data->>'status',''),           status),
      notes          = CASE WHEN p_data ? 'notes' THEN NULLIF(p_data->>'notes','') ELSE notes END,
      signed_at      = COALESCE(NULLIF(p_data->>'signed_at','')::TIMESTAMPTZ, signed_at),
      updated_at     = NOW()
    WHERE id = v_id AND company_id = v_company_id;
  END IF;

  RETURN jsonb_build_object('success', TRUE, 'id', v_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION get_contract_templates(p_company_id UUID)
RETURNS TABLE (
  id            UUID,
  contract_type TEXT,
  name          TEXT,
  clauses       JSONB,
  variables     JSONB,
  is_default    BOOLEAN,
  created_at    TIMESTAMPTZ
)
LANGUAGE SQL STABLE SECURITY DEFINER
AS $$
  SELECT id, contract_type, name, clauses, variables, is_default, created_at
  FROM contract_templates
  WHERE company_id = p_company_id
  ORDER BY contract_type, name;
$$;

CREATE OR REPLACE FUNCTION upsert_contract_template(p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_id UUID;
BEGIN
  v_id := NULLIF(p_data->>'id','')::UUID;
  IF v_id IS NULL THEN
    INSERT INTO contract_templates (company_id, contract_type, name, clauses, variables, is_default)
    VALUES (
      (p_data->>'company_id')::UUID,
      COALESCE(NULLIF(p_data->>'contract_type',''), 'indefinido'),
      COALESCE(NULLIF(p_data->>'name',''), 'Plantilla'),
      COALESCE(p_data->'clauses', '[]'),
      COALESCE(p_data->'variables', '{}'),
      COALESCE((p_data->>'is_default')::BOOLEAN, FALSE)
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE contract_templates SET
      name       = COALESCE(NULLIF(p_data->>'name',''),    name),
      clauses    = COALESCE(p_data->'clauses',              clauses),
      variables  = COALESCE(p_data->'variables',            variables),
      is_default = COALESCE((p_data->>'is_default')::BOOLEAN, is_default),
      updated_at = NOW()
    WHERE id = v_id AND company_id = (p_data->>'company_id')::UUID;
  END IF;
  RETURN jsonb_build_object('success', TRUE, 'id', v_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION get_contract_summary(p_company_id UUID)
RETURNS JSONB
LANGUAGE SQL STABLE SECURITY DEFINER
AS $$
  SELECT jsonb_build_object(
    'total',         COUNT(*),
    'draft',         COUNT(*) FILTER (WHERE status = 'draft'),
    'final',         COUNT(*) FILTER (WHERE status = 'final'),
    'signed',        COUNT(*) FILTER (WHERE status = 'signed'),
    'expired',       COUNT(*) FILTER (WHERE status = 'expired'),
    'terminated',    COUNT(*) FILTER (WHERE status = 'terminated'),
    'expiring_soon', COUNT(*) FILTER (
      WHERE status = 'signed'
        AND end_date IS NOT NULL
        AND end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
    )
  )
  FROM contract_documents
  WHERE company_id = p_company_id;
$$;
