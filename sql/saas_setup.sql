-- ============================================================
-- MOSAICO PRO — SaaS Multi-tenant Setup
-- Ejecutar completo en el SQL Editor de Supabase
-- Es seguro re-ejecutar (usa IF NOT EXISTS / CREATE OR REPLACE)
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. EXTENDER TABLA companies
-- ──────────────────────────────────────────────────────────────

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS rut       TEXT,
  ADD COLUMN IF NOT EXISTS address   TEXT,
  ADD COLUMN IF NOT EXISTS city      TEXT DEFAULT 'Santiago',
  ADD COLUMN IF NOT EXISTS logo_url  TEXT,
  ADD COLUMN IF NOT EXISTS plan      TEXT DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- ──────────────────────────────────────────────────────────────
-- 2. EXTENDER TABLA users
-- ──────────────────────────────────────────────────────────────

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_name  TEXT,
  ADD COLUMN IF NOT EXISTS role       TEXT DEFAULT 'cajero',
  ADD COLUMN IF NOT EXISTS is_active  BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS email      TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Todos los usuarios existentes son admin (ya estaban en el sistema antes de roles)
UPDATE users SET role = 'admin' WHERE role IS NULL OR role = '';

-- ──────────────────────────────────────────────────────────────
-- 3. FUNCIONES HELPER (SECURITY DEFINER — bypasan RLS internamente)
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_user_company_id()
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER
AS $$
  SELECT company_id FROM users WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT
LANGUAGE SQL STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(role, 'cajero') FROM users WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

-- ──────────────────────────────────────────────────────────────
-- 4. RLS — companies
-- ──────────────────────────────────────────────────────────────

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "companies_select" ON companies;
DROP POLICY IF EXISTS "companies_update" ON companies;
DROP POLICY IF EXISTS "companies_insert" ON companies;

CREATE POLICY "companies_select" ON companies FOR SELECT
  USING (id = get_user_company_id());

CREATE POLICY "companies_update" ON companies FOR UPDATE
  USING (id = get_user_company_id() AND get_user_role() = 'admin');

-- INSERT abierto: necesario para onboarding (el usuario aún no tiene company_id)
CREATE POLICY "companies_insert" ON companies FOR INSERT
  WITH CHECK (TRUE);

-- ──────────────────────────────────────────────────────────────
-- 5. RLS — users
-- ──────────────────────────────────────────────────────────────

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select" ON users;
DROP POLICY IF EXISTS "users_update" ON users;
DROP POLICY IF EXISTS "users_insert" ON users;

-- Ver: propios datos (para onboarding) + compañeros de empresa
CREATE POLICY "users_select" ON users FOR SELECT
  USING (auth_user_id = auth.uid() OR company_id = get_user_company_id());

CREATE POLICY "users_update" ON users FOR UPDATE
  USING (company_id = get_user_company_id());

-- INSERT abierto: necesario para onboarding y para la API route /api/users/create
CREATE POLICY "users_insert" ON users FOR INSERT
  WITH CHECK (TRUE);

-- ──────────────────────────────────────────────────────────────
-- 6. RLS — sales
-- ──────────────────────────────────────────────────────────────

ALTER TABLE sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sales_select" ON sales;
DROP POLICY IF EXISTS "sales_insert" ON sales;
DROP POLICY IF EXISTS "sales_update" ON sales;

CREATE POLICY "sales_select" ON sales FOR SELECT
  USING (company_id = get_user_company_id());
CREATE POLICY "sales_insert" ON sales FOR INSERT
  WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "sales_update" ON sales FOR UPDATE
  USING (company_id = get_user_company_id());

-- ──────────────────────────────────────────────────────────────
-- 7. RLS — products
-- ──────────────────────────────────────────────────────────────

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_select" ON products;
DROP POLICY IF EXISTS "products_insert" ON products;
DROP POLICY IF EXISTS "products_update" ON products;
DROP POLICY IF EXISTS "products_delete" ON products;

CREATE POLICY "products_select" ON products FOR SELECT USING (company_id = get_user_company_id());
CREATE POLICY "products_insert" ON products FOR INSERT WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "products_update" ON products FOR UPDATE USING (company_id = get_user_company_id());
CREATE POLICY "products_delete" ON products FOR DELETE USING (company_id = get_user_company_id());

-- ──────────────────────────────────────────────────────────────
-- 8. RLS — customers
-- ──────────────────────────────────────────────────────────────

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customers_select" ON customers;
DROP POLICY IF EXISTS "customers_insert" ON customers;
DROP POLICY IF EXISTS "customers_update" ON customers;

CREATE POLICY "customers_select" ON customers FOR SELECT USING (company_id = get_user_company_id());
CREATE POLICY "customers_insert" ON customers FOR INSERT WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "customers_update" ON customers FOR UPDATE USING (company_id = get_user_company_id());

-- ──────────────────────────────────────────────────────────────
-- 9. RLS — cash_sessions
-- ──────────────────────────────────────────────────────────────

ALTER TABLE cash_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cash_sessions_select" ON cash_sessions;
DROP POLICY IF EXISTS "cash_sessions_insert" ON cash_sessions;
DROP POLICY IF EXISTS "cash_sessions_update" ON cash_sessions;

CREATE POLICY "cash_sessions_select" ON cash_sessions FOR SELECT USING (company_id = get_user_company_id());
CREATE POLICY "cash_sessions_insert" ON cash_sessions FOR INSERT WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "cash_sessions_update" ON cash_sessions FOR UPDATE USING (company_id = get_user_company_id());

-- ──────────────────────────────────────────────────────────────
-- 10. RLS — sale_payments (sin company_id directo → via sales)
-- ──────────────────────────────────────────────────────────────

ALTER TABLE sale_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sale_payments_select" ON sale_payments;
DROP POLICY IF EXISTS "sale_payments_insert" ON sale_payments;

CREATE POLICY "sale_payments_select" ON sale_payments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM sales
      WHERE sales.id = sale_payments.sale_id
        AND sales.company_id = get_user_company_id()
    )
  );

CREATE POLICY "sale_payments_insert" ON sale_payments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sales
      WHERE sales.id = sale_payments.sale_id
        AND sales.company_id = get_user_company_id()
    )
  );

-- ──────────────────────────────────────────────────────────────
-- 11. FUNCIÓN: update_company
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_company(p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_company_id UUID;
BEGIN
  v_company_id := get_user_company_id();
  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'No autenticado');
  END IF;
  IF get_user_role() != 'admin' THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Solo administradores pueden editar la empresa');
  END IF;

  UPDATE companies SET
    name     = COALESCE(NULLIF(p_data->>'name',     ''), name),
    rut      = NULLIF(p_data->>'rut',      ''),
    address  = NULLIF(p_data->>'address',  ''),
    city     = NULLIF(p_data->>'city',     ''),
    logo_url = NULLIF(p_data->>'logo_url', '')
  WHERE id = v_company_id;

  RETURN jsonb_build_object('success', TRUE);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 12. FUNCIÓN: get_company_users
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_company_users(p_company_id UUID)
RETURNS TABLE (
  id         UUID,
  first_name TEXT,
  last_name  TEXT,
  email      TEXT,
  role       TEXT,
  is_active  BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE SQL STABLE SECURITY DEFINER
AS $$
  SELECT id, first_name, last_name, email, role, is_active, created_at
  FROM users
  WHERE company_id = p_company_id
    AND p_company_id = get_user_company_id()  -- solo la empresa del caller
  ORDER BY created_at;
$$;

-- ──────────────────────────────────────────────────────────────
-- 13. FUNCIÓN: update_user_role
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_user_role(
  p_user_id   UUID,
  p_role      TEXT,
  p_is_active BOOLEAN DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF get_user_role() != 'admin' THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Solo administradores pueden cambiar roles');
  END IF;

  UPDATE users SET
    role      = p_role,
    is_active = COALESCE(p_is_active, is_active)
  WHERE id         = p_user_id
    AND company_id = get_user_company_id();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Usuario no encontrado en tu empresa');
  END IF;

  RETURN jsonb_build_object('success', TRUE);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 14. FUNCIÓN: create_company_with_owner (onboarding)
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION create_company_with_owner(p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_company_id UUID;
  v_user_id    UUID;
  v_slug       TEXT;
  v_auth_id    UUID;
BEGIN
  v_auth_id := (p_data->>'auth_user_id')::UUID;

  -- El caller debe ser el auth user que pasa
  IF auth.uid() IS DISTINCT FROM v_auth_id THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'No autorizado');
  END IF;

  -- Verificar que no tenga empresa ya
  IF EXISTS (SELECT 1 FROM users WHERE auth_user_id = v_auth_id AND company_id IS NOT NULL) THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Ya tienes una empresa registrada');
  END IF;

  -- Generar slug único a partir del nombre
  v_slug := lower(regexp_replace(
    COALESCE(NULLIF(p_data->>'slug', ''), p_data->>'company_name'),
    '[^a-zA-Z0-9]+', '-', 'g'
  ));
  v_slug := trim(both '-' from v_slug);
  IF v_slug = '' THEN v_slug := 'empresa'; END IF;

  WHILE EXISTS (SELECT 1 FROM companies WHERE slug = v_slug) LOOP
    v_slug := v_slug || '-' || floor(random() * 9000 + 1000)::text;
  END LOOP;

  -- Crear empresa
  INSERT INTO companies (name, slug, rut, address, city, plan, is_active)
  VALUES (
    p_data->>'company_name',
    v_slug,
    NULLIF(p_data->>'rut',     ''),
    NULLIF(p_data->>'address', ''),
    COALESCE(NULLIF(p_data->>'city', ''), 'Santiago'),
    'free',
    TRUE
  )
  RETURNING id INTO v_company_id;

  -- Crear registro de usuario
  INSERT INTO users (company_id, auth_user_id, first_name, last_name, email, role, is_active)
  VALUES (
    v_company_id,
    v_auth_id,
    p_data->>'first_name',
    NULLIF(p_data->>'last_name', ''),
    NULLIF(p_data->>'email', ''),
    'admin',
    TRUE
  )
  RETURNING id INTO v_user_id;

  RETURN jsonb_build_object('success', TRUE, 'company_id', v_company_id, 'user_id', v_user_id, 'slug', v_slug);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$;
