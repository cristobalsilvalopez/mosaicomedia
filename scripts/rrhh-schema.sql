-- =============================================================
-- MOSAICO PRO — RRHH y Contratos
-- Ejecutar completo en Supabase → SQL Editor
-- =============================================================

-- ─── TABLAS ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS employees (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id     uuid        REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  first_name     text        NOT NULL,
  last_name      text        NOT NULL,
  rut            text,
  email          text,
  phone          text,
  position       text,          -- Vendedora, Gerente, Encargada, etc.
  department     text,          -- Ventas, Administración, Producción, etc.
  hire_date      date,
  contract_type  text        DEFAULT 'indefinido',  -- indefinido | plazo_fijo | part_time
  salary         numeric(12,0),
  hours_per_week integer     DEFAULT 45,
  is_active      boolean     DEFAULT true,
  notes          text,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attendance (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id  uuid        REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
  company_id   uuid        REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  work_date    date        NOT NULL,
  check_in     time,
  check_out    time,
  hours_worked numeric(4,2),
  status       text        DEFAULT 'present',  -- present | absent | late | sick | holiday
  notes        text,
  created_at   timestamptz DEFAULT now(),
  UNIQUE (employee_id, work_date)
);

CREATE TABLE IF NOT EXISTS contracts (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id    uuid        REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
  company_id     uuid        REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  contract_type  text        NOT NULL,
  start_date     date        NOT NULL,
  end_date       date,                        -- NULL = indefinido
  salary         numeric(12,0),
  hours_per_week integer,
  is_active      boolean     DEFAULT true,
  notes          text,
  created_at     timestamptz DEFAULT now()
);

-- ─── ÍNDICES ──────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_employees_company    ON employees(company_id);
CREATE INDEX IF NOT EXISTS idx_attendance_employee  ON attendance(employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date      ON attendance(work_date);
CREATE INDEX IF NOT EXISTS idx_attendance_company   ON attendance(company_id, work_date);
CREATE INDEX IF NOT EXISTS idx_contracts_employee   ON contracts(employee_id);

-- ─── RPC: get_employees ───────────────────────────────────────

CREATE OR REPLACE FUNCTION get_employees(p_company_id uuid)
RETURNS TABLE (
  id             uuid,
  first_name     text,
  last_name      text,
  rut            text,
  email          text,
  phone          text,
  position       text,
  department     text,
  hire_date      date,
  contract_type  text,
  salary         numeric,
  hours_per_week integer,
  is_active      boolean,
  notes          text,
  contract_id    uuid,
  contract_start date,
  contract_end   date,
  attendance_today text
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    e.id, e.first_name, e.last_name, e.rut, e.email, e.phone,
    e.position, e.department, e.hire_date, e.contract_type,
    e.salary, e.hours_per_week, e.is_active, e.notes,
    c.id        AS contract_id,
    c.start_date AS contract_start,
    c.end_date  AS contract_end,
    a.status    AS attendance_today
  FROM employees e
  LEFT JOIN contracts c  ON c.employee_id = e.id  AND c.is_active = true
  LEFT JOIN attendance a ON a.employee_id = e.id  AND a.work_date = CURRENT_DATE
  WHERE e.company_id = p_company_id
  ORDER BY e.first_name, e.last_name;
$$;

-- ─── RPC: upsert_employee ─────────────────────────────────────

CREATE OR REPLACE FUNCTION upsert_employee(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id uuid;
BEGIN
  IF p_data->>'id' IS NOT NULL THEN
    UPDATE employees SET
      first_name     = p_data->>'first_name',
      last_name      = p_data->>'last_name',
      rut            = NULLIF(p_data->>'rut',''),
      email          = NULLIF(p_data->>'email',''),
      phone          = NULLIF(p_data->>'phone',''),
      position       = NULLIF(p_data->>'position',''),
      department     = NULLIF(p_data->>'department',''),
      hire_date      = NULLIF(p_data->>'hire_date','')::date,
      contract_type  = COALESCE(NULLIF(p_data->>'contract_type',''), 'indefinido'),
      salary         = NULLIF(p_data->>'salary','')::numeric,
      hours_per_week = COALESCE(NULLIF(p_data->>'hours_per_week','')::integer, 45),
      is_active      = COALESCE((p_data->>'is_active')::boolean, true),
      notes          = NULLIF(p_data->>'notes',''),
      updated_at     = now()
    WHERE id = (p_data->>'id')::uuid
      AND company_id = (p_data->>'company_id')::uuid
    RETURNING id INTO v_id;
  ELSE
    INSERT INTO employees (
      company_id, first_name, last_name, rut, email, phone,
      position, department, hire_date, contract_type,
      salary, hours_per_week, notes
    ) VALUES (
      (p_data->>'company_id')::uuid,
      p_data->>'first_name', p_data->>'last_name',
      NULLIF(p_data->>'rut',''),  NULLIF(p_data->>'email',''), NULLIF(p_data->>'phone',''),
      NULLIF(p_data->>'position',''), NULLIF(p_data->>'department',''),
      NULLIF(p_data->>'hire_date','')::date,
      COALESCE(NULLIF(p_data->>'contract_type',''), 'indefinido'),
      NULLIF(p_data->>'salary','')::numeric,
      COALESCE(NULLIF(p_data->>'hours_per_week','')::integer, 45),
      NULLIF(p_data->>'notes','')
    )
    RETURNING id INTO v_id;
  END IF;
  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;

-- ─── RPC: record_attendance ───────────────────────────────────

CREATE OR REPLACE FUNCTION record_attendance(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id     uuid;
  v_hours  numeric;
BEGIN
  IF p_data->>'check_in' IS NOT NULL AND p_data->>'check_out' IS NOT NULL
     AND p_data->>'check_in' <> '' AND p_data->>'check_out' <> '' THEN
    v_hours := ROUND(
      EXTRACT(EPOCH FROM (
        (p_data->>'check_out')::time - (p_data->>'check_in')::time
      )) / 3600.0, 2
    );
  END IF;

  INSERT INTO attendance (
    employee_id, company_id, work_date, check_in, check_out, hours_worked, status, notes
  ) VALUES (
    (p_data->>'employee_id')::uuid,
    (p_data->>'company_id')::uuid,
    (p_data->>'work_date')::date,
    NULLIF(p_data->>'check_in','')::time,
    NULLIF(p_data->>'check_out','')::time,
    v_hours,
    COALESCE(NULLIF(p_data->>'status',''), 'present'),
    NULLIF(p_data->>'notes','')
  )
  ON CONFLICT (employee_id, work_date) DO UPDATE SET
    check_in     = EXCLUDED.check_in,
    check_out    = EXCLUDED.check_out,
    hours_worked = v_hours,
    status       = EXCLUDED.status,
    notes        = EXCLUDED.notes
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;

-- ─── RPC: get_attendance ──────────────────────────────────────

CREATE OR REPLACE FUNCTION get_attendance(p_company_id uuid, p_year int, p_month int)
RETURNS TABLE (
  id            uuid,
  employee_id   uuid,
  employee_name text,
  work_date     date,
  check_in      time,
  check_out     time,
  hours_worked  numeric,
  status        text,
  notes         text
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    a.id, a.employee_id,
    e.first_name || ' ' || e.last_name AS employee_name,
    a.work_date, a.check_in, a.check_out, a.hours_worked, a.status, a.notes
  FROM attendance a
  JOIN employees e ON e.id = a.employee_id
  WHERE a.company_id = p_company_id
    AND EXTRACT(YEAR  FROM a.work_date) = p_year
    AND EXTRACT(MONTH FROM a.work_date) = p_month
  ORDER BY a.work_date DESC, e.first_name;
$$;

-- ─── RPC: upsert_contract ────────────────────────────────────

CREATE OR REPLACE FUNCTION upsert_contract(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id uuid;
BEGIN
  -- Al crear contrato nuevo, desactivar el anterior del mismo empleado
  IF p_data->>'id' IS NULL THEN
    UPDATE contracts SET is_active = false
    WHERE employee_id = (p_data->>'employee_id')::uuid AND is_active = true;

    UPDATE employees SET
      contract_type = p_data->>'contract_type',
      salary        = NULLIF(p_data->>'salary','')::numeric,
      updated_at    = now()
    WHERE id = (p_data->>'employee_id')::uuid;
  END IF;

  INSERT INTO contracts (
    employee_id, company_id, contract_type,
    start_date, end_date, salary, hours_per_week, notes
  ) VALUES (
    (p_data->>'employee_id')::uuid,
    (p_data->>'company_id')::uuid,
    p_data->>'contract_type',
    (p_data->>'start_date')::date,
    NULLIF(p_data->>'end_date','')::date,
    NULLIF(p_data->>'salary','')::numeric,
    NULLIF(p_data->>'hours_per_week','')::integer,
    NULLIF(p_data->>'notes','')
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;

-- ─── RLS (opcional — activar si usas Row Level Security) ──────
-- ALTER TABLE employees  ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE contracts  ENABLE ROW LEVEL SECURITY;
-- (Agrega políticas según tu setup de auth)
