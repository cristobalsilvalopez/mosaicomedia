-- ============================================================
-- MOSAICO PRO — Módulo Finanzas y Gastos
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================
-- NOTA: Si ya ejecutaste una versión anterior y falla, corre esto primero:
--   DROP TABLE IF EXISTS expenses CASCADE;
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. TABLA: expenses
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS expenses (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  cash_session_id UUID REFERENCES cash_sessions(id) ON DELETE SET NULL,
  amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  category        TEXT NOT NULL DEFAULT 'otros',
  description     TEXT,
  payment_method  TEXT NOT NULL DEFAULT 'cash',
  expense_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT expenses_category_check
    CHECK (category IN ('arriendo','proveedores','sueldos','insumos','servicios','otros')),
  CONSTRAINT expenses_payment_method_check
    CHECK (payment_method IN ('cash','transfer','debit','credit'))
);

-- Migración: añade columnas que pueden faltar si la tabla ya existía
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS cash_session_id UUID REFERENCES cash_sessions(id) ON DELETE SET NULL;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS created_by      UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_expenses_company  ON expenses(company_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date     ON expenses(company_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(company_id, category);
CREATE INDEX IF NOT EXISTS idx_expenses_session  ON expenses(cash_session_id);

-- ──────────────────────────────────────────────────────────────
-- 2. RLS
-- ──────────────────────────────────────────────────────────────

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "expenses_select" ON expenses;
DROP POLICY IF EXISTS "expenses_insert" ON expenses;
DROP POLICY IF EXISTS "expenses_update" ON expenses;
DROP POLICY IF EXISTS "expenses_delete" ON expenses;

CREATE POLICY "expenses_select" ON expenses FOR SELECT USING (company_id = get_user_company_id());
CREATE POLICY "expenses_insert" ON expenses FOR INSERT WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "expenses_update" ON expenses FOR UPDATE USING (company_id = get_user_company_id());
CREATE POLICY "expenses_delete" ON expenses FOR DELETE USING (company_id = get_user_company_id());

-- ──────────────────────────────────────────────────────────────
-- 3. FUNCIÓN: create_expense
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION create_expense(p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_company    UUID;
  v_user_id    UUID;
  v_session_id UUID;
  v_expense_id UUID;
BEGIN
  v_company := get_user_company_id();
  IF v_company IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'No autenticado');
  END IF;

  SELECT u.id INTO v_user_id
  FROM users u WHERE u.auth_user_id = auth.uid() LIMIT 1;

  IF (p_data->>'payment_method') = 'cash' THEN
    SELECT cs.id INTO v_session_id
    FROM cash_sessions cs
    WHERE cs.company_id = v_company AND cs.status = 'open'
    LIMIT 1;
  END IF;

  INSERT INTO expenses (
    company_id, cash_session_id, amount, category,
    description, payment_method, expense_date, created_by
  ) VALUES (
    v_company,
    v_session_id,
    (p_data->>'amount')::NUMERIC,
    COALESCE(NULLIF(p_data->>'category', ''), 'otros'),
    NULLIF(p_data->>'description', ''),
    COALESCE(NULLIF(p_data->>'payment_method', ''), 'cash'),
    COALESCE(NULLIF(p_data->>'expense_date', '')::DATE, CURRENT_DATE),
    v_user_id
  )
  RETURNING id INTO v_expense_id;

  RETURN jsonb_build_object(
    'success',             TRUE,
    'id',                  v_expense_id,
    'cash_session_linked', v_session_id IS NOT NULL
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 4. FUNCIÓN: delete_expense
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION delete_expense(p_expense_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_company UUID;
BEGIN
  v_company := get_user_company_id();
  IF v_company IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'No autenticado');
  END IF;

  DELETE FROM expenses
  WHERE id = p_expense_id AND company_id = v_company;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Gasto no encontrado');
  END IF;

  RETURN jsonb_build_object('success', TRUE);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 5. FUNCIÓN: get_expenses — retorna JSONB array
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_expenses(
  p_company_id  UUID,
  p_from        DATE,
  p_to          DATE,
  p_category    TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF get_user_company_id() IS DISTINCT FROM p_company_id THEN
    RETURN '[]'::JSONB;
  END IF;

  WITH expense_rows AS (
    SELECT
      expr.id              AS xid,
      expr.amount          AS xamount,
      expr.category        AS xcategory,
      expr.description     AS xdescription,
      expr.payment_method  AS xpayment_method,
      expr.expense_date    AS xexpense_date,
      expr.cash_session_id AS xcash_session_id,
      expr.created_at      AS xcreated_at,
      COALESCE(
        u.first_name || ' ' || COALESCE(u.last_name, ''),
        'Sistema'
      )                    AS xcreated_by_name
    FROM expenses expr
    LEFT JOIN users u ON u.id = expr.created_by
    WHERE expr.company_id = p_company_id
      AND expr.expense_date >= p_from
      AND expr.expense_date <= p_to
      AND (p_category IS NULL OR expr.category = p_category)
    ORDER BY expr.expense_date DESC, expr.created_at DESC
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id',              xid,
        'amount',          xamount,
        'category',        xcategory,
        'description',     xdescription,
        'payment_method',  xpayment_method,
        'expense_date',    xexpense_date::TEXT,
        'cash_session_id', xcash_session_id,
        'created_by_name', xcreated_by_name,
        'created_at',      xcreated_at
      )
    ),
    '[]'::JSONB
  )
  INTO v_result
  FROM expense_rows;

  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 6. FUNCIÓN: get_finance_summary
-- Cada agregación se calcula por separado (SELECT INTO)
-- para evitar conflictos de scope en subqueries anidadas
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_finance_summary(
  p_company_id UUID,
  p_from       DATE,
  p_to         DATE
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_sales_total NUMERIC := 0;
  v_exp_total   NUMERIC := 0;
  v_by_category JSONB   := '[]'::JSONB;
  v_by_payment  JSONB   := '[]'::JSONB;
  v_by_day      JSONB   := '[]'::JSONB;
BEGIN
  IF get_user_company_id() IS DISTINCT FROM p_company_id THEN
    RETURN jsonb_build_object('error', 'No autorizado');
  END IF;

  -- ── Ventas totales ────────────────────────────────────────
  SELECT COALESCE(SUM(s.total), 0)
  INTO v_sales_total
  FROM sales s
  WHERE s.company_id = p_company_id
    AND s.created_at::DATE >= p_from
    AND s.created_at::DATE <= p_to
    AND s.status = 'completed';

  -- ── Gastos totales ────────────────────────────────────────
  SELECT COALESCE(SUM(ex.amount), 0)
  INTO v_exp_total
  FROM expenses ex
  WHERE ex.company_id = p_company_id
    AND ex.expense_date >= p_from
    AND ex.expense_date <= p_to;

  -- ── Por categoría ─────────────────────────────────────────
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'category', r.cat,
        'total',    r.cat_total,
        'count',    r.cnt
      ) ORDER BY r.cat_total DESC
    ),
    '[]'::JSONB
  )
  INTO v_by_category
  FROM (
    SELECT
      ex2.category        AS cat,
      SUM(ex2.amount)     AS cat_total,
      COUNT(*)::BIGINT    AS cnt
    FROM expenses ex2
    WHERE ex2.company_id = p_company_id
      AND ex2.expense_date >= p_from
      AND ex2.expense_date <= p_to
    GROUP BY ex2.category
  ) r;

  -- ── Por método de pago ────────────────────────────────────
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'method', r.pm,
        'total',  r.pay_total
      ) ORDER BY r.pay_total DESC
    ),
    '[]'::JSONB
  )
  INTO v_by_payment
  FROM (
    SELECT
      ex3.payment_method  AS pm,
      SUM(ex3.amount)     AS pay_total
    FROM expenses ex3
    WHERE ex3.company_id = p_company_id
      AND ex3.expense_date >= p_from
      AND ex3.expense_date <= p_to
    GROUP BY ex3.payment_method
  ) r;

  -- ── Por día (ventas vs gastos) ────────────────────────────
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'date',     r.day::TEXT,
        'sales',    COALESCE(r.s_total, 0),
        'expenses', COALESCE(r.e_total, 0),
        'net',      COALESCE(r.s_total, 0) - COALESCE(r.e_total, 0)
      ) ORDER BY r.day
    ),
    '[]'::JSONB
  )
  INTO v_by_day
  FROM (
    SELECT
      gs::DATE AS day,
      (
        SELECT SUM(s2.total)
        FROM sales s2
        WHERE s2.company_id  = p_company_id
          AND s2.created_at::DATE = gs::DATE
          AND s2.status      = 'completed'
      ) AS s_total,
      (
        SELECT SUM(ex4.amount)
        FROM expenses ex4
        WHERE ex4.company_id  = p_company_id
          AND ex4.expense_date = gs::DATE
      ) AS e_total
    FROM generate_series(
      p_from::TIMESTAMP,
      p_to::TIMESTAMP,
      '1 day'::INTERVAL
    ) AS gs
  ) r;

  -- ── Resultado final ───────────────────────────────────────
  RETURN jsonb_build_object(
    'sales_total',    v_sales_total,
    'expenses_total', v_exp_total,
    'net_flow',       v_sales_total - v_exp_total,
    'by_category',    v_by_category,
    'by_payment',     v_by_payment,
    'by_day',         v_by_day
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM);
END;
$$;
