-- ============================================================
-- MOSAICO PRO — Módulo RRHH y Contratos
-- Ejecutar completo en el SQL Editor de Supabase
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. TABLAS
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS employees (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  first_name     TEXT NOT NULL,
  last_name      TEXT NOT NULL,
  rut            TEXT,
  email          TEXT,
  phone          TEXT,
  "position"     TEXT,
  department     TEXT DEFAULT 'Ventas',
  hire_date      DATE,
  contract_type  TEXT DEFAULT 'indefinido',
  salary         NUMERIC(12,2),
  hours_per_week INTEGER DEFAULT 45,
  is_active      BOOLEAN DEFAULT TRUE,
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contracts (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id    UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  contract_type  TEXT DEFAULT 'indefinido',
  start_date     DATE NOT NULL,
  end_date       DATE,
  salary         NUMERIC(12,2),
  hours_per_week INTEGER DEFAULT 45,
  is_active      BOOLEAN DEFAULT TRUE,
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attendance (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id  UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  work_date    DATE NOT NULL,
  check_in     TIME,
  check_out    TIME,
  hours_worked NUMERIC(4,2),
  status       TEXT DEFAULT 'present',  -- present | absent | late | sick | holiday
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, work_date)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_employees_company        ON employees(company_id);
CREATE INDEX IF NOT EXISTS idx_contracts_employee       ON contracts(employee_id);
CREATE INDEX IF NOT EXISTS idx_contracts_company_active ON contracts(company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_attendance_emp_date      ON attendance(employee_id, work_date);
CREATE INDEX IF NOT EXISTS idx_attendance_company_date  ON attendance(company_id, work_date);

-- ──────────────────────────────────────────────────────────────
-- 2. RLS
-- ──────────────────────────────────────────────────────────────

ALTER TABLE employees  ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

-- Función auxiliar: obtiene company_id del usuario autenticado
CREATE OR REPLACE FUNCTION get_user_company_id()
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER
AS $$
  SELECT company_id FROM users WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

-- Políticas employees
DROP POLICY IF EXISTS "employees_select" ON employees;
DROP POLICY IF EXISTS "employees_insert" ON employees;
DROP POLICY IF EXISTS "employees_update" ON employees;
DROP POLICY IF EXISTS "employees_delete" ON employees;

CREATE POLICY "employees_select" ON employees FOR SELECT  USING (company_id = get_user_company_id());
CREATE POLICY "employees_insert" ON employees FOR INSERT  WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "employees_update" ON employees FOR UPDATE  USING (company_id = get_user_company_id());
CREATE POLICY "employees_delete" ON employees FOR DELETE  USING (company_id = get_user_company_id());

-- Políticas contracts
DROP POLICY IF EXISTS "contracts_select" ON contracts;
DROP POLICY IF EXISTS "contracts_insert" ON contracts;
DROP POLICY IF EXISTS "contracts_update" ON contracts;

CREATE POLICY "contracts_select" ON contracts FOR SELECT  USING (company_id = get_user_company_id());
CREATE POLICY "contracts_insert" ON contracts FOR INSERT  WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "contracts_update" ON contracts FOR UPDATE  USING (company_id = get_user_company_id());

-- Políticas attendance
DROP POLICY IF EXISTS "attendance_select" ON attendance;
DROP POLICY IF EXISTS "attendance_insert" ON attendance;
DROP POLICY IF EXISTS "attendance_update" ON attendance;

CREATE POLICY "attendance_select" ON attendance FOR SELECT  USING (company_id = get_user_company_id());
CREATE POLICY "attendance_insert" ON attendance FOR INSERT  WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "attendance_update" ON attendance FOR UPDATE  USING (company_id = get_user_company_id());

-- ──────────────────────────────────────────────────────────────
-- 3. FUNCIONES RPC
-- ──────────────────────────────────────────────────────────────

-- get_employees: lista empleados con contrato activo y asistencia de hoy
CREATE OR REPLACE FUNCTION get_employees(p_company_id UUID)
RETURNS TABLE (
  id               UUID,
  first_name       TEXT,
  last_name        TEXT,
  rut              TEXT,
  email            TEXT,
  phone            TEXT,
  "position"       TEXT,
  department       TEXT,
  hire_date        DATE,
  contract_type    TEXT,
  salary           NUMERIC,
  hours_per_week   INTEGER,
  is_active        BOOLEAN,
  notes            TEXT,
  contract_id      UUID,
  contract_start   DATE,
  contract_end     DATE,
  attendance_today TEXT
)
LANGUAGE SQL STABLE SECURITY DEFINER
AS $$
  SELECT
    e.id,
    e.first_name,
    e.last_name,
    e.rut,
    e.email,
    e.phone,
    e."position",
    e.department,
    e.hire_date,
    e.contract_type,
    e.salary,
    e.hours_per_week,
    e.is_active,
    e.notes,
    c.id         AS contract_id,
    c.start_date AS contract_start,
    c.end_date   AS contract_end,
    a.status     AS attendance_today
  FROM employees e
  LEFT JOIN contracts c  ON c.employee_id = e.id AND c.is_active = TRUE
  LEFT JOIN attendance a ON a.employee_id = e.id AND a.work_date = CURRENT_DATE
  WHERE e.company_id = p_company_id
  ORDER BY e.first_name, e.last_name;
$$;

-- get_attendance: registros de asistencia por mes/año
CREATE OR REPLACE FUNCTION get_attendance(
  p_company_id UUID,
  p_year       INTEGER,
  p_month      INTEGER
)
RETURNS TABLE (
  id            UUID,
  employee_id   UUID,
  employee_name TEXT,
  work_date     DATE,
  check_in      TIME,
  check_out     TIME,
  hours_worked  NUMERIC,
  status        TEXT,
  notes         TEXT
)
LANGUAGE SQL STABLE SECURITY DEFINER
AS $$
  SELECT
    a.id,
    a.employee_id,
    e.first_name || ' ' || e.last_name AS employee_name,
    a.work_date,
    a.check_in,
    a.check_out,
    a.hours_worked,
    a.status,
    a.notes
  FROM attendance a
  JOIN employees e ON e.id = a.employee_id
  WHERE a.company_id = p_company_id
    AND EXTRACT(YEAR  FROM a.work_date) = p_year
    AND EXTRACT(MONTH FROM a.work_date) = p_month
  ORDER BY a.work_date DESC, e.first_name;
$$;

-- upsert_employee: crea o edita un empleado
CREATE OR REPLACE FUNCTION upsert_employee(p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  v_id := NULLIF(p_data->>'id', '')::UUID;

  IF v_id IS NULL THEN
    INSERT INTO employees (
      company_id, first_name, last_name, rut, email, phone,
      "position", department, hire_date, contract_type,
      salary, hours_per_week, notes
    ) VALUES (
      (p_data->>'company_id')::UUID,
      p_data->>'first_name',
      p_data->>'last_name',
      NULLIF(p_data->>'rut', ''),
      NULLIF(p_data->>'email', ''),
      NULLIF(p_data->>'phone', ''),
      NULLIF(p_data->>'position', ''),
      COALESCE(NULLIF(p_data->>'department', ''), 'Ventas'),
      NULLIF(p_data->>'hire_date', '')::DATE,
      COALESCE(NULLIF(p_data->>'contract_type', ''), 'indefinido'),
      NULLIF(p_data->>'salary', '')::NUMERIC,
      COALESCE(NULLIF(p_data->>'hours_per_week', '')::INTEGER, 45),
      NULLIF(p_data->>'notes', '')
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE employees SET
      first_name     = p_data->>'first_name',
      last_name      = p_data->>'last_name',
      rut            = NULLIF(p_data->>'rut', ''),
      email          = NULLIF(p_data->>'email', ''),
      phone          = NULLIF(p_data->>'phone', ''),
      "position"     = NULLIF(p_data->>'position', ''),
      department     = COALESCE(NULLIF(p_data->>'department', ''), 'Ventas'),
      hire_date      = NULLIF(p_data->>'hire_date', '')::DATE,
      contract_type  = COALESCE(NULLIF(p_data->>'contract_type', ''), 'indefinido'),
      salary         = NULLIF(p_data->>'salary', '')::NUMERIC,
      hours_per_week = COALESCE(NULLIF(p_data->>'hours_per_week', '')::INTEGER, 45),
      notes          = NULLIF(p_data->>'notes', ''),
      updated_at     = NOW()
    WHERE id = v_id
      AND company_id = (p_data->>'company_id')::UUID;
  END IF;

  RETURN jsonb_build_object('success', TRUE, 'id', v_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$;

-- record_attendance: registra o actualiza asistencia (upsert por empleado+fecha)
CREATE OR REPLACE FUNCTION record_attendance(p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_check_in  TIME;
  v_check_out TIME;
  v_hours     NUMERIC;
BEGIN
  v_check_in  := NULLIF(p_data->>'check_in',  '')::TIME;
  v_check_out := NULLIF(p_data->>'check_out', '')::TIME;

  IF v_check_in IS NOT NULL AND v_check_out IS NOT NULL THEN
    v_hours := GREATEST(0, EXTRACT(EPOCH FROM (v_check_out - v_check_in)) / 3600.0);
  END IF;

  INSERT INTO attendance (
    company_id, employee_id, work_date,
    check_in, check_out, hours_worked, status, notes
  ) VALUES (
    (p_data->>'company_id')::UUID,
    (p_data->>'employee_id')::UUID,
    (p_data->>'work_date')::DATE,
    v_check_in,
    v_check_out,
    v_hours,
    COALESCE(NULLIF(p_data->>'status', ''), 'present'),
    NULLIF(p_data->>'notes', '')
  )
  ON CONFLICT (employee_id, work_date) DO UPDATE SET
    check_in     = EXCLUDED.check_in,
    check_out    = EXCLUDED.check_out,
    hours_worked = EXCLUDED.hours_worked,
    status       = EXCLUDED.status,
    notes        = EXCLUDED.notes;

  RETURN jsonb_build_object('success', TRUE);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$;

-- upsert_contract: crea contrato nuevo y desactiva el anterior del empleado
CREATE OR REPLACE FUNCTION upsert_contract(p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE contracts SET is_active = FALSE
  WHERE employee_id = (p_data->>'employee_id')::UUID
    AND company_id  = (p_data->>'company_id')::UUID
    AND is_active   = TRUE;

  INSERT INTO contracts (
    company_id, employee_id, contract_type,
    start_date, end_date, salary, hours_per_week, notes
  ) VALUES (
    (p_data->>'company_id')::UUID,
    (p_data->>'employee_id')::UUID,
    COALESCE(NULLIF(p_data->>'contract_type', ''), 'indefinido'),
    (p_data->>'start_date')::DATE,
    NULLIF(p_data->>'end_date', '')::DATE,
    NULLIF(p_data->>'salary', '')::NUMERIC,
    COALESCE(NULLIF(p_data->>'hours_per_week', '')::INTEGER, 45),
    NULLIF(p_data->>'notes', '')
  );

  UPDATE employees SET
    contract_type = COALESCE(NULLIF(p_data->>'contract_type', ''), 'indefinido'),
    updated_at    = NOW()
  WHERE id = (p_data->>'employee_id')::UUID;

  RETURN jsonb_build_object('success', TRUE);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 4. SEED — Empleados de BadWoman
-- ──────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_company UUID := 'c29512d1-20bb-4967-8b51-9395ef660ad0';
  v_paulina UUID;
  v_maite   UUID;
  v_winky   UUID;
  v_paulo   UUID;
BEGIN

  IF NOT EXISTS (SELECT 1 FROM employees WHERE company_id = v_company) THEN

    INSERT INTO employees (company_id, first_name, last_name, rut, phone, "position", department, hire_date, contract_type, salary, hours_per_week)
    VALUES (v_company, 'Paulina', 'García', '14.321.567-8', '+56 9 7890 1234', 'Encargada de tienda', 'Ventas', '2021-03-15', 'indefinido', 680000, 45)
    RETURNING id INTO v_paulina;

    INSERT INTO employees (company_id, first_name, last_name, rut, phone, "position", department, hire_date, contract_type, salary, hours_per_week)
    VALUES (v_company, 'Maite', 'Soto', '17.654.321-K', '+56 9 8765 4321', 'Vendedora', 'Ventas', '2022-08-01', 'indefinido', 560000, 45)
    RETURNING id INTO v_maite;

    INSERT INTO employees (company_id, first_name, last_name, rut, phone, "position", department, hire_date, contract_type, salary, hours_per_week)
    VALUES (v_company, 'Winky', 'Castro', '19.876.543-2', '+56 9 6543 2109', 'Vendedora', 'Ventas', '2023-04-10', 'plazo_fijo', 520000, 45)
    RETURNING id INTO v_winky;

    INSERT INTO employees (company_id, first_name, last_name, rut, phone, "position", department, hire_date, contract_type, salary, hours_per_week)
    VALUES (v_company, 'Paulo', 'Riveros', '16.543.210-9', '+56 9 5432 1098', 'Bodeguero', 'Logística', '2022-01-03', 'indefinido', 540000, 45)
    RETURNING id INTO v_paulo;

    INSERT INTO contracts (company_id, employee_id, contract_type, start_date, salary, hours_per_week)
    VALUES
      (v_company, v_paulina, 'indefinido', '2021-03-15', 680000, 45),
      (v_company, v_maite,   'indefinido', '2022-08-01', 560000, 45),
      (v_company, v_paulo,   'indefinido', '2022-01-03', 540000, 45);

    -- Winky: plazo fijo que vence en 18 días → activa alerta automática
    INSERT INTO contracts (company_id, employee_id, contract_type, start_date, end_date, salary, hours_per_week)
    VALUES (v_company, v_winky, 'plazo_fijo', '2023-04-10',
            (CURRENT_DATE + INTERVAL '18 days')::DATE,
            520000, 45);

    RAISE NOTICE 'Seed completado: 4 empleados de BadWoman insertados.';
  ELSE
    RAISE NOTICE 'Empleados ya existen — seed omitido.';
  END IF;

END;
$$;
