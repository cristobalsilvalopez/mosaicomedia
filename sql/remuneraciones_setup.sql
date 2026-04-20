-- ============================================================
-- MOSAICO PRO — Módulo Remuneraciones, Liquidaciones y Finiquitos
-- Ejecutar completo en el SQL Editor de Supabase
-- Requiere: rrhh_setup.sql, contratos_setup.sql, finanzas_setup.sql
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. TABLAS
-- ──────────────────────────────────────────────────────────────

-- Parámetros previsionales configurables por empresa
-- Valores por defecto: Chile 2025 (referencia, actualizar según indicadores vigentes)
CREATE TABLE IF NOT EXISTS payroll_params (
  id                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id              UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE UNIQUE,
  -- Tasa trabajador AFP (capitalization, excl. SIS) — varía por AFP: ~10–10.58%
  afp_rate_worker         NUMERIC(6,4) DEFAULT 0.1045,
  -- SIS (Seguro Invalidez y Sobrevivencia) — costo empleador
  sis_rate                NUMERIC(6,4) DEFAULT 0.0143,
  -- Salud (Fonasa base) — 7% mínimo legal
  health_rate             NUMERIC(6,4) DEFAULT 0.0700,
  -- Seguro de cesantía — trabajador
  cesantia_worker         NUMERIC(6,4) DEFAULT 0.006,
  -- Seguro de cesantía — empleador, contrato indefinido
  cesantia_employer_indef NUMERIC(6,4) DEFAULT 0.024,
  -- Seguro de cesantía — empleador, contrato plazo fijo / obra / temporada
  cesantia_employer_fixed NUMERIC(6,4) DEFAULT 0.030,
  -- Salario mínimo legal vigente (IMM)
  minimum_wage            NUMERIC(12,2) DEFAULT 510000,
  -- UTM vigente (para tope gratificación: 4.75 UTM)
  utm_value               NUMERIC(12,2) DEFAULT 68306,
  -- Mutual de seguridad (accidentes laborales) tasa promedio
  mutual_rate             NUMERIC(6,4) DEFAULT 0.0093,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- Períodos de nómina (un registro por empresa-mes-año)
CREATE TABLE IF NOT EXISTS payroll_periods (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  period_year    INTEGER NOT NULL CHECK (period_year >= 2020),
  period_month   INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  status         TEXT NOT NULL DEFAULT 'open',   -- open | closed | paid
  total_liquido  NUMERIC(14,2) DEFAULT 0,
  total_bruto    NUMERIC(14,2) DEFAULT 0,
  costo_empresa  NUMERIC(14,2) DEFAULT 0,
  employee_count INTEGER DEFAULT 0,
  notes          TEXT,
  closed_at      TIMESTAMPTZ,
  paid_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, period_year, period_month)
);

-- Documentos de liquidación (una por empleado por período)
CREATE TABLE IF NOT EXISTS payroll_documents (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  period_id        UUID NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
  employee_id      UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  -- Snapshot del empleado al momento de la liquidación
  employee_name    TEXT,
  employee_rut     TEXT,
  "position"       TEXT,
  department       TEXT,
  contract_type    TEXT DEFAULT 'indefinido',
  hours_per_week   INTEGER DEFAULT 45,
  hire_date        DATE,
  -- Remuneración base (del contrato vigente o anexo de cambio de sueldo)
  base_salary      NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- Ítems adicionales: [{id, label, type, amount}]
  -- type: 'haber_imponible' | 'haber_no_imponible' | 'descuento'
  items            JSONB DEFAULT '[]',
  -- Totales calculados
  total_imponible        NUMERIC(12,2) DEFAULT 0,
  total_no_imponible     NUMERIC(12,2) DEFAULT 0,
  total_bruto            NUMERIC(12,2) DEFAULT 0,
  descuento_afp          NUMERIC(12,2) DEFAULT 0,
  descuento_salud        NUMERIC(12,2) DEFAULT 0,
  descuento_cesantia     NUMERIC(12,2) DEFAULT 0,
  total_descuentos_legales NUMERIC(12,2) DEFAULT 0,
  total_descuentos_otros   NUMERIC(12,2) DEFAULT 0,
  total_liquido          NUMERIC(12,2) DEFAULT 0,
  -- Costo empresa
  costo_sis              NUMERIC(12,2) DEFAULT 0,
  costo_cesantia_empresa NUMERIC(12,2) DEFAULT 0,
  costo_mutual           NUMERIC(12,2) DEFAULT 0,
  costo_total_empresa    NUMERIC(12,2) DEFAULT 0,
  -- Flujo
  status         TEXT NOT NULL DEFAULT 'draft',  -- draft | emitida | pagada
  ai_draft_text  TEXT,
  notes          TEXT,
  paid_at        TIMESTAMPTZ,
  paid_via       TEXT DEFAULT 'transfer',
  expense_id     UUID,                           -- enlace a finanzas.expenses
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(period_id, employee_id)
);

-- Documentos de finiquito
CREATE TABLE IF NOT EXISTS severance_documents (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id           UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id          UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  contract_document_id UUID REFERENCES contract_documents(id),
  -- Snapshot del empleado
  employee_name        TEXT,
  employee_rut         TEXT,
  "position"           TEXT,
  hire_date            DATE,
  -- Datos del finiquito
  termination_date     DATE NOT NULL,
  termination_cause    TEXT NOT NULL DEFAULT 'mutuo_acuerdo',
  base_salary          NUMERIC(12,2) DEFAULT 0,
  -- Cálculo vacaciones proporcionales
  pending_vacation_days NUMERIC(6,2) DEFAULT 0,
  vacation_amount      NUMERIC(12,2) DEFAULT 0,
  -- Indemnización art 161 (si aplica)
  severance_years      NUMERIC(6,2) DEFAULT 0,
  severance_months     NUMERIC(6,2) DEFAULT 0,
  severance_amount     NUMERIC(12,2) DEFAULT 0,
  -- Días trabajados del mes en curso (si el cese es a mitad de mes)
  pending_salary_days  NUMERIC(6,2) DEFAULT 0,
  pending_salary_amount NUMERIC(12,2) DEFAULT 0,
  -- Ítems adicionales [{id, label, type, amount}] type: 'haber'|'descuento'
  other_items          JSONB DEFAULT '[]',
  -- Totales
  total_amount         NUMERIC(12,2) DEFAULT 0,
  -- Estado y documento
  status               TEXT NOT NULL DEFAULT 'draft',  -- draft | final | signed
  ai_draft_text        TEXT,
  notes                TEXT,
  signed_at            TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_pp_company     ON payroll_periods(company_id, period_year DESC, period_month DESC);
CREATE INDEX IF NOT EXISTS idx_pd_period      ON payroll_documents(period_id);
CREATE INDEX IF NOT EXISTS idx_pd_company_emp ON payroll_documents(company_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_sd_company     ON severance_documents(company_id);
CREATE INDEX IF NOT EXISTS idx_sd_employee    ON severance_documents(employee_id);

-- ──────────────────────────────────────────────────────────────
-- 2. RLS
-- ──────────────────────────────────────────────────────────────

ALTER TABLE payroll_params    ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_periods   ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE severance_documents ENABLE ROW LEVEL SECURITY;

-- payroll_params
DROP POLICY IF EXISTS "ppar_select" ON payroll_params;
DROP POLICY IF EXISTS "ppar_insert" ON payroll_params;
DROP POLICY IF EXISTS "ppar_update" ON payroll_params;
CREATE POLICY "ppar_select" ON payroll_params FOR SELECT  USING (company_id = get_user_company_id());
CREATE POLICY "ppar_insert" ON payroll_params FOR INSERT  WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "ppar_update" ON payroll_params FOR UPDATE  USING (company_id = get_user_company_id());

-- payroll_periods
DROP POLICY IF EXISTS "pper_select" ON payroll_periods;
DROP POLICY IF EXISTS "pper_insert" ON payroll_periods;
DROP POLICY IF EXISTS "pper_update" ON payroll_periods;
CREATE POLICY "pper_select" ON payroll_periods FOR SELECT  USING (company_id = get_user_company_id());
CREATE POLICY "pper_insert" ON payroll_periods FOR INSERT  WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "pper_update" ON payroll_periods FOR UPDATE  USING (company_id = get_user_company_id());

-- payroll_documents
DROP POLICY IF EXISTS "pdoc_select" ON payroll_documents;
DROP POLICY IF EXISTS "pdoc_insert" ON payroll_documents;
DROP POLICY IF EXISTS "pdoc_update" ON payroll_documents;
CREATE POLICY "pdoc_select" ON payroll_documents FOR SELECT  USING (company_id = get_user_company_id());
CREATE POLICY "pdoc_insert" ON payroll_documents FOR INSERT  WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "pdoc_update" ON payroll_documents FOR UPDATE  USING (company_id = get_user_company_id());

-- severance_documents
DROP POLICY IF EXISTS "sev_select" ON severance_documents;
DROP POLICY IF EXISTS "sev_insert" ON severance_documents;
DROP POLICY IF EXISTS "sev_update" ON severance_documents;
CREATE POLICY "sev_select" ON severance_documents FOR SELECT  USING (company_id = get_user_company_id());
CREATE POLICY "sev_insert" ON severance_documents FOR INSERT  WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "sev_update" ON severance_documents FOR UPDATE  USING (company_id = get_user_company_id());

-- ──────────────────────────────────────────────────────────────
-- 3. FUNCIONES RPC
-- ──────────────────────────────────────────────────────────────

-- get_payroll_params: devuelve los params o inserta los defaults
CREATE OR REPLACE FUNCTION get_payroll_params(p_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_row payroll_params;
BEGIN
  IF get_user_company_id() IS DISTINCT FROM p_company_id THEN
    RETURN jsonb_build_object('error', 'No autorizado');
  END IF;

  SELECT * INTO v_row FROM payroll_params WHERE company_id = p_company_id;

  IF NOT FOUND THEN
    INSERT INTO payroll_params (company_id) VALUES (p_company_id)
    RETURNING * INTO v_row;
  END IF;

  RETURN row_to_json(v_row)::JSONB;
END;
$$;

-- upsert_payroll_params
CREATE OR REPLACE FUNCTION upsert_payroll_params(p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_cid UUID;
BEGIN
  v_cid := (p_data->>'company_id')::UUID;
  IF get_user_company_id() IS DISTINCT FROM v_cid THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'No autorizado');
  END IF;

  INSERT INTO payroll_params (
    company_id, afp_rate_worker, sis_rate, health_rate,
    cesantia_worker, cesantia_employer_indef, cesantia_employer_fixed,
    minimum_wage, utm_value, mutual_rate
  ) VALUES (
    v_cid,
    COALESCE(NULLIF(p_data->>'afp_rate_worker','')::NUMERIC, 0.1045),
    COALESCE(NULLIF(p_data->>'sis_rate','')::NUMERIC, 0.0143),
    COALESCE(NULLIF(p_data->>'health_rate','')::NUMERIC, 0.0700),
    COALESCE(NULLIF(p_data->>'cesantia_worker','')::NUMERIC, 0.006),
    COALESCE(NULLIF(p_data->>'cesantia_employer_indef','')::NUMERIC, 0.024),
    COALESCE(NULLIF(p_data->>'cesantia_employer_fixed','')::NUMERIC, 0.030),
    COALESCE(NULLIF(p_data->>'minimum_wage','')::NUMERIC, 510000),
    COALESCE(NULLIF(p_data->>'utm_value','')::NUMERIC, 68306),
    COALESCE(NULLIF(p_data->>'mutual_rate','')::NUMERIC, 0.0093)
  )
  ON CONFLICT (company_id) DO UPDATE SET
    afp_rate_worker         = COALESCE(NULLIF(p_data->>'afp_rate_worker','')::NUMERIC, payroll_params.afp_rate_worker),
    sis_rate                = COALESCE(NULLIF(p_data->>'sis_rate','')::NUMERIC, payroll_params.sis_rate),
    health_rate             = COALESCE(NULLIF(p_data->>'health_rate','')::NUMERIC, payroll_params.health_rate),
    cesantia_worker         = COALESCE(NULLIF(p_data->>'cesantia_worker','')::NUMERIC, payroll_params.cesantia_worker),
    cesantia_employer_indef = COALESCE(NULLIF(p_data->>'cesantia_employer_indef','')::NUMERIC, payroll_params.cesantia_employer_indef),
    cesantia_employer_fixed = COALESCE(NULLIF(p_data->>'cesantia_employer_fixed','')::NUMERIC, payroll_params.cesantia_employer_fixed),
    minimum_wage            = COALESCE(NULLIF(p_data->>'minimum_wage','')::NUMERIC, payroll_params.minimum_wage),
    utm_value               = COALESCE(NULLIF(p_data->>'utm_value','')::NUMERIC, payroll_params.utm_value),
    mutual_rate             = COALESCE(NULLIF(p_data->>'mutual_rate','')::NUMERIC, payroll_params.mutual_rate),
    updated_at              = NOW();

  RETURN jsonb_build_object('success', TRUE);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$;

-- get_employee_current_conditions: salary efectivo tomando contrato + anexo de cambio de sueldo
CREATE OR REPLACE FUNCTION get_employee_current_conditions(
  p_company_id  UUID,
  p_employee_id UUID,
  p_as_of_date  DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  employee_id          UUID,
  employee_name        TEXT,
  employee_rut         TEXT,
  "position"           TEXT,
  department           TEXT,
  hire_date            DATE,
  contract_type        TEXT,
  hours_per_week       INTEGER,
  base_salary          NUMERIC,
  contract_document_id UUID,
  salary_annex_id      UUID
)
LANGUAGE SQL STABLE SECURITY DEFINER
AS $$
  WITH active_cd AS (
    SELECT cd.id, cd.contract_type, cd.salary, cd.hours_per_week,
           cd."position", cd.department
    FROM contract_documents cd
    WHERE cd.company_id  = p_company_id
      AND cd.employee_id = p_employee_id
      AND cd.status IN ('signed','final')
      AND cd.start_date <= p_as_of_date
    ORDER BY cd.start_date DESC
    LIMIT 1
  ),
  salary_annex AS (
    SELECT ca.id,
           (ca.content->>'new_salary')::NUMERIC AS new_salary
    FROM contract_annexes ca
    JOIN active_cd ac ON ca.contract_document_id = ac.id
    WHERE ca.annex_type    = 'salary_change'
      AND ca.status        = 'signed'
      AND ca.effective_date <= p_as_of_date
    ORDER BY ca.effective_date DESC
    LIMIT 1
  )
  SELECT
    e.id,
    e.first_name || ' ' || e.last_name,
    e.rut,
    COALESCE(ac."position",  e."position"),
    COALESCE(ac.department,  e.department),
    e.hire_date,
    COALESCE(ac.contract_type,  e.contract_type),
    COALESCE(ac.hours_per_week, e.hours_per_week),
    COALESCE(sa.new_salary, ac.salary, e.salary, 0)::NUMERIC AS base_salary,
    ac.id  AS contract_document_id,
    sa.id  AS salary_annex_id
  FROM employees e
  LEFT JOIN active_cd ac ON TRUE
  LEFT JOIN salary_annex sa ON TRUE
  WHERE e.id         = p_employee_id
    AND e.company_id = p_company_id;
$$;

-- get_payroll_periods
CREATE OR REPLACE FUNCTION get_payroll_periods(p_company_id UUID)
RETURNS TABLE (
  id             UUID,
  period_year    INTEGER,
  period_month   INTEGER,
  status         TEXT,
  total_liquido  NUMERIC,
  total_bruto    NUMERIC,
  costo_empresa  NUMERIC,
  employee_count INTEGER,
  notes          TEXT,
  closed_at      TIMESTAMPTZ,
  paid_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ
)
LANGUAGE SQL STABLE SECURITY DEFINER
AS $$
  SELECT id, period_year, period_month, status,
         total_liquido, total_bruto, costo_empresa,
         employee_count, notes, closed_at, paid_at, created_at
  FROM payroll_periods
  WHERE company_id = p_company_id
  ORDER BY period_year DESC, period_month DESC;
$$;

-- upsert_payroll_period
CREATE OR REPLACE FUNCTION upsert_payroll_period(p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_id UUID; v_cid UUID;
BEGIN
  v_id  := NULLIF(p_data->>'id','')::UUID;
  v_cid := (p_data->>'company_id')::UUID;

  IF v_id IS NULL THEN
    INSERT INTO payroll_periods (company_id, period_year, period_month, notes)
    VALUES (
      v_cid,
      (p_data->>'period_year')::INTEGER,
      (p_data->>'period_month')::INTEGER,
      NULLIF(p_data->>'notes','')
    )
    ON CONFLICT (company_id, period_year, period_month) DO NOTHING
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      SELECT id INTO v_id FROM payroll_periods
      WHERE company_id  = v_cid
        AND period_year  = (p_data->>'period_year')::INTEGER
        AND period_month = (p_data->>'period_month')::INTEGER;
    END IF;
  ELSE
    UPDATE payroll_periods SET
      notes       = COALESCE(NULLIF(p_data->>'notes',''), notes),
      updated_at  = NOW()
    WHERE id = v_id AND company_id = v_cid;
  END IF;

  RETURN jsonb_build_object('success', TRUE, 'id', v_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$;

-- get_payroll_documents: lista liquidaciones de un período
CREATE OR REPLACE FUNCTION get_payroll_documents(
  p_company_id UUID,
  p_period_id  UUID DEFAULT NULL
)
RETURNS TABLE (
  id                     UUID,
  period_id              UUID,
  employee_id            UUID,
  employee_name          TEXT,
  employee_rut           TEXT,
  "position"             TEXT,
  department             TEXT,
  contract_type          TEXT,
  hours_per_week         INTEGER,
  hire_date              DATE,
  base_salary            NUMERIC,
  items                  JSONB,
  total_imponible        NUMERIC,
  total_no_imponible     NUMERIC,
  total_bruto            NUMERIC,
  descuento_afp          NUMERIC,
  descuento_salud        NUMERIC,
  descuento_cesantia     NUMERIC,
  total_descuentos_legales NUMERIC,
  total_descuentos_otros   NUMERIC,
  total_liquido          NUMERIC,
  costo_sis              NUMERIC,
  costo_cesantia_empresa NUMERIC,
  costo_total_empresa    NUMERIC,
  status                 TEXT,
  ai_draft_text          TEXT,
  notes                  TEXT,
  paid_at                TIMESTAMPTZ,
  paid_via               TEXT,
  expense_id             UUID,
  created_at             TIMESTAMPTZ,
  updated_at             TIMESTAMPTZ
)
LANGUAGE SQL STABLE SECURITY DEFINER
AS $$
  SELECT
    id, period_id, employee_id, employee_name, employee_rut,
    "position", department, contract_type, hours_per_week, hire_date,
    base_salary, items,
    total_imponible, total_no_imponible, total_bruto,
    descuento_afp, descuento_salud, descuento_cesantia,
    total_descuentos_legales, total_descuentos_otros, total_liquido,
    costo_sis, costo_cesantia_empresa, costo_total_empresa,
    status, ai_draft_text, notes, paid_at, paid_via, expense_id,
    created_at, updated_at
  FROM payroll_documents
  WHERE company_id = p_company_id
    AND (p_period_id IS NULL OR period_id = p_period_id)
  ORDER BY employee_name;
$$;

-- upsert_payroll_document
CREATE OR REPLACE FUNCTION upsert_payroll_document(p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_id UUID; v_cid UUID;
BEGIN
  v_id  := NULLIF(p_data->>'id','')::UUID;
  v_cid := (p_data->>'company_id')::UUID;

  IF v_id IS NULL THEN
    INSERT INTO payroll_documents (
      company_id, period_id, employee_id,
      employee_name, employee_rut, "position", department,
      contract_type, hours_per_week, hire_date, base_salary, items,
      total_imponible, total_no_imponible, total_bruto,
      descuento_afp, descuento_salud, descuento_cesantia,
      total_descuentos_legales, total_descuentos_otros, total_liquido,
      costo_sis, costo_cesantia_empresa, costo_total_empresa,
      status, ai_draft_text, notes
    ) VALUES (
      v_cid,
      (p_data->>'period_id')::UUID,
      (p_data->>'employee_id')::UUID,
      NULLIF(p_data->>'employee_name',''),
      NULLIF(p_data->>'employee_rut',''),
      NULLIF(p_data->>'position',''),
      NULLIF(p_data->>'department',''),
      COALESCE(NULLIF(p_data->>'contract_type',''), 'indefinido'),
      COALESCE(NULLIF(p_data->>'hours_per_week','')::INTEGER, 45),
      NULLIF(p_data->>'hire_date','')::DATE,
      COALESCE(NULLIF(p_data->>'base_salary','')::NUMERIC, 0),
      COALESCE(p_data->'items', '[]'),
      COALESCE(NULLIF(p_data->>'total_imponible','')::NUMERIC, 0),
      COALESCE(NULLIF(p_data->>'total_no_imponible','')::NUMERIC, 0),
      COALESCE(NULLIF(p_data->>'total_bruto','')::NUMERIC, 0),
      COALESCE(NULLIF(p_data->>'descuento_afp','')::NUMERIC, 0),
      COALESCE(NULLIF(p_data->>'descuento_salud','')::NUMERIC, 0),
      COALESCE(NULLIF(p_data->>'descuento_cesantia','')::NUMERIC, 0),
      COALESCE(NULLIF(p_data->>'total_descuentos_legales','')::NUMERIC, 0),
      COALESCE(NULLIF(p_data->>'total_descuentos_otros','')::NUMERIC, 0),
      COALESCE(NULLIF(p_data->>'total_liquido','')::NUMERIC, 0),
      COALESCE(NULLIF(p_data->>'costo_sis','')::NUMERIC, 0),
      COALESCE(NULLIF(p_data->>'costo_cesantia_empresa','')::NUMERIC, 0),
      COALESCE(NULLIF(p_data->>'costo_total_empresa','')::NUMERIC, 0),
      COALESCE(NULLIF(p_data->>'status',''), 'draft'),
      NULLIF(p_data->>'ai_draft_text',''),
      NULLIF(p_data->>'notes','')
    )
    ON CONFLICT (period_id, employee_id) DO UPDATE SET
      base_salary            = EXCLUDED.base_salary,
      items                  = EXCLUDED.items,
      total_imponible        = EXCLUDED.total_imponible,
      total_no_imponible     = EXCLUDED.total_no_imponible,
      total_bruto            = EXCLUDED.total_bruto,
      descuento_afp          = EXCLUDED.descuento_afp,
      descuento_salud        = EXCLUDED.descuento_salud,
      descuento_cesantia     = EXCLUDED.descuento_cesantia,
      total_descuentos_legales = EXCLUDED.total_descuentos_legales,
      total_descuentos_otros = EXCLUDED.total_descuentos_otros,
      total_liquido          = EXCLUDED.total_liquido,
      costo_sis              = EXCLUDED.costo_sis,
      costo_cesantia_empresa = EXCLUDED.costo_cesantia_empresa,
      costo_total_empresa    = EXCLUDED.costo_total_empresa,
      status                 = EXCLUDED.status,
      ai_draft_text          = COALESCE(EXCLUDED.ai_draft_text, payroll_documents.ai_draft_text),
      notes                  = EXCLUDED.notes,
      updated_at             = NOW()
    RETURNING id INTO v_id;
  ELSE
    UPDATE payroll_documents SET
      base_salary            = COALESCE(NULLIF(p_data->>'base_salary','')::NUMERIC,   base_salary),
      items                  = COALESCE(p_data->'items', items),
      total_imponible        = COALESCE(NULLIF(p_data->>'total_imponible','')::NUMERIC,        total_imponible),
      total_no_imponible     = COALESCE(NULLIF(p_data->>'total_no_imponible','')::NUMERIC,     total_no_imponible),
      total_bruto            = COALESCE(NULLIF(p_data->>'total_bruto','')::NUMERIC,            total_bruto),
      descuento_afp          = COALESCE(NULLIF(p_data->>'descuento_afp','')::NUMERIC,          descuento_afp),
      descuento_salud        = COALESCE(NULLIF(p_data->>'descuento_salud','')::NUMERIC,        descuento_salud),
      descuento_cesantia     = COALESCE(NULLIF(p_data->>'descuento_cesantia','')::NUMERIC,     descuento_cesantia),
      total_descuentos_legales = COALESCE(NULLIF(p_data->>'total_descuentos_legales','')::NUMERIC, total_descuentos_legales),
      total_descuentos_otros = COALESCE(NULLIF(p_data->>'total_descuentos_otros','')::NUMERIC, total_descuentos_otros),
      total_liquido          = COALESCE(NULLIF(p_data->>'total_liquido','')::NUMERIC,          total_liquido),
      costo_sis              = COALESCE(NULLIF(p_data->>'costo_sis','')::NUMERIC,              costo_sis),
      costo_cesantia_empresa = COALESCE(NULLIF(p_data->>'costo_cesantia_empresa','')::NUMERIC, costo_cesantia_empresa),
      costo_total_empresa    = COALESCE(NULLIF(p_data->>'costo_total_empresa','')::NUMERIC,    costo_total_empresa),
      status                 = COALESCE(NULLIF(p_data->>'status',''), status),
      ai_draft_text          = COALESCE(NULLIF(p_data->>'ai_draft_text',''), ai_draft_text),
      notes                  = CASE WHEN p_data ? 'notes' THEN NULLIF(p_data->>'notes','') ELSE notes END,
      updated_at             = NOW()
    WHERE id = v_id AND company_id = v_cid;
  END IF;

  -- Sync period totals
  UPDATE payroll_periods SET
    total_liquido  = (SELECT COALESCE(SUM(total_liquido),0)  FROM payroll_documents WHERE period_id = (p_data->>'period_id')::UUID),
    total_bruto    = (SELECT COALESCE(SUM(total_bruto),0)    FROM payroll_documents WHERE period_id = (p_data->>'period_id')::UUID),
    costo_empresa  = (SELECT COALESCE(SUM(costo_total_empresa),0) FROM payroll_documents WHERE period_id = (p_data->>'period_id')::UUID),
    employee_count = (SELECT COUNT(*) FROM payroll_documents WHERE period_id = (p_data->>'period_id')::UUID),
    updated_at     = NOW()
  WHERE id = (p_data->>'period_id')::UUID;

  RETURN jsonb_build_object('success', TRUE, 'id', v_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$;

-- close_payroll_period: cierra y opcionalmente paga (crea expenses en finanzas)
CREATE OR REPLACE FUNCTION close_payroll_period(p_period_id UUID, p_company_id UUID, p_mark_paid BOOLEAN DEFAULT FALSE)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_doc   payroll_documents;
  v_period payroll_periods;
  v_expense_id UUID;
  v_pay_date DATE;
BEGIN
  IF get_user_company_id() IS DISTINCT FROM p_company_id THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'No autorizado');
  END IF;

  SELECT * INTO v_period FROM payroll_periods WHERE id = p_period_id AND company_id = p_company_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Período no encontrado');
  END IF;

  v_pay_date := make_date(v_period.period_year, v_period.period_month, 1) + INTERVAL '1 month - 1 day';

  IF p_mark_paid THEN
    -- Crear expenses en finanzas por cada liquidación emitida
    FOR v_doc IN
      SELECT * FROM payroll_documents
      WHERE period_id = p_period_id AND status = 'emitida'
    LOOP
      INSERT INTO expenses (
        company_id, amount, category, description,
        payment_method, expense_date, created_by
      )
      SELECT
        p_company_id,
        v_doc.total_liquido,
        'sueldos',
        'Remuneración ' || COALESCE(v_doc.employee_name, '') || ' ' ||
          LPAD(v_period.period_month::TEXT,2,'0') || '/' || v_period.period_year::TEXT,
        COALESCE(v_doc.paid_via, 'transfer'),
        v_pay_date,
        id FROM users WHERE auth_user_id = auth.uid() LIMIT 1
      RETURNING id INTO v_expense_id;

      UPDATE payroll_documents SET
        status     = 'pagada',
        paid_at    = NOW(),
        expense_id = v_expense_id,
        updated_at = NOW()
      WHERE id = v_doc.id;
    END LOOP;

    UPDATE payroll_periods SET
      status  = 'paid',
      paid_at = NOW(),
      updated_at = NOW()
    WHERE id = p_period_id;
  ELSE
    -- Solo cerrar (emitir)
    UPDATE payroll_documents SET status = 'emitida', updated_at = NOW()
    WHERE period_id = p_period_id AND status = 'draft';

    UPDATE payroll_periods SET
      status     = 'closed',
      closed_at  = NOW(),
      updated_at = NOW()
    WHERE id = p_period_id;
  END IF;

  RETURN jsonb_build_object('success', TRUE);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$;

-- get_severance_documents
CREATE OR REPLACE FUNCTION get_severance_documents(p_company_id UUID)
RETURNS TABLE (
  id                    UUID,
  employee_id           UUID,
  employee_name         TEXT,
  employee_rut          TEXT,
  "position"            TEXT,
  hire_date             DATE,
  termination_date      DATE,
  termination_cause     TEXT,
  base_salary           NUMERIC,
  pending_vacation_days NUMERIC,
  vacation_amount       NUMERIC,
  severance_months      NUMERIC,
  severance_amount      NUMERIC,
  pending_salary_days   NUMERIC,
  pending_salary_amount NUMERIC,
  other_items           JSONB,
  total_amount          NUMERIC,
  status                TEXT,
  ai_draft_text         TEXT,
  notes                 TEXT,
  signed_at             TIMESTAMPTZ,
  created_at            TIMESTAMPTZ
)
LANGUAGE SQL STABLE SECURITY DEFINER
AS $$
  SELECT
    id, employee_id, employee_name, employee_rut, "position",
    hire_date, termination_date, termination_cause, base_salary,
    pending_vacation_days, vacation_amount, severance_months, severance_amount,
    pending_salary_days, pending_salary_amount, other_items, total_amount,
    status, ai_draft_text, notes, signed_at, created_at
  FROM severance_documents
  WHERE company_id = p_company_id
  ORDER BY termination_date DESC, created_at DESC;
$$;

-- upsert_severance_document
CREATE OR REPLACE FUNCTION upsert_severance_document(p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_id UUID; v_cid UUID;
BEGIN
  v_id  := NULLIF(p_data->>'id','')::UUID;
  v_cid := (p_data->>'company_id')::UUID;

  IF v_id IS NULL THEN
    INSERT INTO severance_documents (
      company_id, employee_id, contract_document_id,
      employee_name, employee_rut, "position", hire_date,
      termination_date, termination_cause, base_salary,
      pending_vacation_days, vacation_amount,
      severance_years, severance_months, severance_amount,
      pending_salary_days, pending_salary_amount,
      other_items, total_amount, status, ai_draft_text, notes
    ) VALUES (
      v_cid,
      (p_data->>'employee_id')::UUID,
      NULLIF(p_data->>'contract_document_id','')::UUID,
      NULLIF(p_data->>'employee_name',''),
      NULLIF(p_data->>'employee_rut',''),
      NULLIF(p_data->>'position',''),
      NULLIF(p_data->>'hire_date','')::DATE,
      (p_data->>'termination_date')::DATE,
      COALESCE(NULLIF(p_data->>'termination_cause',''), 'mutuo_acuerdo'),
      COALESCE(NULLIF(p_data->>'base_salary','')::NUMERIC, 0),
      COALESCE(NULLIF(p_data->>'pending_vacation_days','')::NUMERIC, 0),
      COALESCE(NULLIF(p_data->>'vacation_amount','')::NUMERIC, 0),
      COALESCE(NULLIF(p_data->>'severance_years','')::NUMERIC, 0),
      COALESCE(NULLIF(p_data->>'severance_months','')::NUMERIC, 0),
      COALESCE(NULLIF(p_data->>'severance_amount','')::NUMERIC, 0),
      COALESCE(NULLIF(p_data->>'pending_salary_days','')::NUMERIC, 0),
      COALESCE(NULLIF(p_data->>'pending_salary_amount','')::NUMERIC, 0),
      COALESCE(p_data->'other_items', '[]'),
      COALESCE(NULLIF(p_data->>'total_amount','')::NUMERIC, 0),
      COALESCE(NULLIF(p_data->>'status',''), 'draft'),
      NULLIF(p_data->>'ai_draft_text',''),
      NULLIF(p_data->>'notes','')
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE severance_documents SET
      termination_date      = COALESCE(NULLIF(p_data->>'termination_date','')::DATE, termination_date),
      termination_cause     = COALESCE(NULLIF(p_data->>'termination_cause',''), termination_cause),
      base_salary           = COALESCE(NULLIF(p_data->>'base_salary','')::NUMERIC, base_salary),
      pending_vacation_days = COALESCE(NULLIF(p_data->>'pending_vacation_days','')::NUMERIC, pending_vacation_days),
      vacation_amount       = COALESCE(NULLIF(p_data->>'vacation_amount','')::NUMERIC, vacation_amount),
      severance_years       = COALESCE(NULLIF(p_data->>'severance_years','')::NUMERIC, severance_years),
      severance_months      = COALESCE(NULLIF(p_data->>'severance_months','')::NUMERIC, severance_months),
      severance_amount      = COALESCE(NULLIF(p_data->>'severance_amount','')::NUMERIC, severance_amount),
      pending_salary_days   = COALESCE(NULLIF(p_data->>'pending_salary_days','')::NUMERIC, pending_salary_days),
      pending_salary_amount = COALESCE(NULLIF(p_data->>'pending_salary_amount','')::NUMERIC, pending_salary_amount),
      other_items           = COALESCE(p_data->'other_items', other_items),
      total_amount          = COALESCE(NULLIF(p_data->>'total_amount','')::NUMERIC, total_amount),
      status                = COALESCE(NULLIF(p_data->>'status',''), status),
      ai_draft_text         = COALESCE(NULLIF(p_data->>'ai_draft_text',''), ai_draft_text),
      notes                 = CASE WHEN p_data ? 'notes' THEN NULLIF(p_data->>'notes','') ELSE notes END,
      signed_at             = COALESCE(NULLIF(p_data->>'signed_at','')::TIMESTAMPTZ, signed_at),
      updated_at            = NOW()
    WHERE id = v_id AND company_id = v_cid;
  END IF;

  RETURN jsonb_build_object('success', TRUE, 'id', v_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$;

-- get_payroll_labor_report: resumen de costos laborales por mes (último año)
CREATE OR REPLACE FUNCTION get_payroll_labor_report(p_company_id UUID, p_year INTEGER DEFAULT NULL)
RETURNS TABLE (
  period_year       INTEGER,
  period_month      INTEGER,
  employee_count    INTEGER,
  total_bruto       NUMERIC,
  total_liquido     NUMERIC,
  costo_empresa     NUMERIC,
  total_descuentos_legales NUMERIC
)
LANGUAGE SQL STABLE SECURITY DEFINER
AS $$
  SELECT
    pp.period_year,
    pp.period_month,
    pp.employee_count,
    pp.total_bruto,
    pp.total_liquido,
    pp.costo_empresa,
    COALESCE(SUM(pd.total_descuentos_legales), 0) AS total_descuentos_legales
  FROM payroll_periods pp
  LEFT JOIN payroll_documents pd ON pd.period_id = pp.id
  WHERE pp.company_id = p_company_id
    AND (p_year IS NULL OR pp.period_year = p_year)
    AND pp.status IN ('closed','paid')
  GROUP BY pp.id, pp.period_year, pp.period_month, pp.employee_count,
           pp.total_bruto, pp.total_liquido, pp.costo_empresa
  ORDER BY pp.period_year DESC, pp.period_month DESC;
$$;
