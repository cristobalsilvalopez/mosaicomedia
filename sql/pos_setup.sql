-- ============================================================
-- MOSAICO PRO — Módulo POS, Caja e Inventario
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================
-- Seguro re-ejecutar (IF NOT EXISTS / CREATE OR REPLACE / ADD COLUMN IF NOT EXISTS)
-- ORDEN DE EJECUCIÓN REQUERIDO:
--   1. saas_setup.sql
--   2. pos_setup.sql          ← este archivo
--   3. proveedores_setup.sql  (depende de adjust_stock definida aquí)
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. EXTENDER TABLA products
-- ──────────────────────────────────────────────────────────────

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS sku             TEXT,
  ADD COLUMN IF NOT EXISTS barcode         TEXT,
  ADD COLUMN IF NOT EXISTS description     TEXT,
  ADD COLUMN IF NOT EXISTS cost_price      NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sale_price      NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_type        TEXT DEFAULT 'iva',
  ADD COLUMN IF NOT EXISTS category_id     UUID,
  ADD COLUMN IF NOT EXISTS min_stock_alert INT DEFAULT 5,
  ADD COLUMN IF NOT EXISTS is_active       BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS created_at      TIMESTAMPTZ DEFAULT NOW();

-- ──────────────────────────────────────────────────────────────
-- 2. EXTENDER TABLA users — PIN para cierre de caja supervisado
-- ──────────────────────────────────────────────────────────────

ALTER TABLE users ADD COLUMN IF NOT EXISTS pin TEXT;

-- ──────────────────────────────────────────────────────────────
-- 3. EXTENDER TABLA cash_sessions
-- ──────────────────────────────────────────────────────────────

ALTER TABLE cash_sessions
  ADD COLUMN IF NOT EXISTS user_id           UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS register_name     TEXT DEFAULT 'Caja 1',
  ADD COLUMN IF NOT EXISTS opening_amount    NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS closing_amount    NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS total_sales       NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_refunds     NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transaction_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_summary   JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS opened_at         TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS closed_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status            TEXT DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS notes             TEXT,
  ADD COLUMN IF NOT EXISTS opened_by_name    TEXT;

-- ──────────────────────────────────────────────────────────────
-- 4. EXTENDER TABLA sales — columnas que usa el POS
-- ──────────────────────────────────────────────────────────────

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS user_id         UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS cash_session_id UUID REFERENCES cash_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS customer_id     UUID REFERENCES customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS customer_name   TEXT,
  ADD COLUMN IF NOT EXISTS subtotal        NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS iva_amount      NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ila_amount      NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total           NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status          TEXT DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS document_type   TEXT DEFAULT 'boleta',
  ADD COLUMN IF NOT EXISTS channel         TEXT DEFAULT 'pos',
  ADD COLUMN IF NOT EXISTS items           JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS created_at      TIMESTAMPTZ DEFAULT NOW();

-- ──────────────────────────────────────────────────────────────
-- 5. EXTENDER TABLA sale_payments
-- ──────────────────────────────────────────────────────────────

ALTER TABLE sale_payments
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS amount         NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at     TIMESTAMPTZ DEFAULT NOW();

-- ──────────────────────────────────────────────────────────────
-- 6. TABLA: categories
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS categories (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  slug       TEXT,
  color      TEXT DEFAULT '#5DE0E6',
  is_active  BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_categories_company ON categories(company_id);

-- ──────────────────────────────────────────────────────────────
-- 7. TABLA: warehouses
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS warehouses (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name       TEXT NOT NULL DEFAULT 'Bodega Principal',
  is_default BOOLEAN DEFAULT FALSE,
  is_active  BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_warehouses_company ON warehouses(company_id);

-- ──────────────────────────────────────────────────────────────
-- 8. TABLA: inventory  (stock por producto × bodega)
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inventory (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id   UUID NOT NULL REFERENCES products(id)  ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  quantity     NUMERIC(12,3) DEFAULT 0,
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_id, warehouse_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_product   ON inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_warehouse ON inventory(warehouse_id);

-- ──────────────────────────────────────────────────────────────
-- 9. TABLA: product_movements
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS product_movements (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES products(id)  ON DELETE CASCADE,
  warehouse_id    UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  sale_id         UUID REFERENCES sales(id)      ON DELETE SET NULL,
  movement_type   TEXT NOT NULL DEFAULT 'adjustment',
  quantity        NUMERIC(12,3) NOT NULL,
  quantity_before NUMERIC(12,3) NOT NULL DEFAULT 0,
  quantity_after  NUMERIC(12,3) NOT NULL DEFAULT 0,
  notes           TEXT,
  user_id         UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT movements_type_check
    CHECK (movement_type IN ('sale','purchase','adjustment','return','void','opening','merma','count'))
);

CREATE INDEX IF NOT EXISTS idx_movements_company ON product_movements(company_id);
CREATE INDEX IF NOT EXISTS idx_movements_product ON product_movements(company_id, product_id);
CREATE INDEX IF NOT EXISTS idx_movements_date    ON product_movements(company_id, created_at DESC);

-- ──────────────────────────────────────────────────────────────
-- 10. TABLA: cash_arqueos
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cash_arqueos (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id      UUID NOT NULL REFERENCES companies(id)    ON DELETE CASCADE,
  cash_session_id UUID REFERENCES cash_sessions(id)        ON DELETE SET NULL,
  user_id         UUID REFERENCES users(id),
  -- Billetes
  bills_20000     INT DEFAULT 0,
  bills_10000     INT DEFAULT 0,
  bills_5000      INT DEFAULT 0,
  bills_2000      INT DEFAULT 0,
  bills_1000      INT DEFAULT 0,
  -- Monedas
  coins_500       INT DEFAULT 0,
  coins_100       INT DEFAULT 0,
  coins_50        INT DEFAULT 0,
  coins_10        INT DEFAULT 0,
  -- Totales
  expected_cash   NUMERIC(12,2) DEFAULT 0,
  difference      NUMERIC(12,2) DEFAULT 0,
  arqueo_type     TEXT DEFAULT 'close',
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_arqueos_company ON cash_arqueos(company_id);
CREATE INDEX IF NOT EXISTS idx_arqueos_session ON cash_arqueos(cash_session_id);

-- ──────────────────────────────────────────────────────────────
-- 11. RLS — categories
-- ──────────────────────────────────────────────────────────────

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "categories_select" ON categories;
DROP POLICY IF EXISTS "categories_insert" ON categories;
DROP POLICY IF EXISTS "categories_update" ON categories;
DROP POLICY IF EXISTS "categories_delete" ON categories;

CREATE POLICY "categories_select" ON categories FOR SELECT USING (company_id = get_user_company_id());
CREATE POLICY "categories_insert" ON categories FOR INSERT WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "categories_update" ON categories FOR UPDATE USING (company_id = get_user_company_id());
CREATE POLICY "categories_delete" ON categories FOR DELETE USING (company_id = get_user_company_id());

-- ──────────────────────────────────────────────────────────────
-- 12. RLS — warehouses
-- ──────────────────────────────────────────────────────────────

ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "warehouses_select" ON warehouses;
DROP POLICY IF EXISTS "warehouses_insert" ON warehouses;
DROP POLICY IF EXISTS "warehouses_update" ON warehouses;

CREATE POLICY "warehouses_select" ON warehouses FOR SELECT USING (company_id = get_user_company_id());
CREATE POLICY "warehouses_insert" ON warehouses FOR INSERT WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "warehouses_update" ON warehouses FOR UPDATE USING (company_id = get_user_company_id());

-- ──────────────────────────────────────────────────────────────
-- 13. RLS — inventory (via join a products que sí tiene company_id)
-- ──────────────────────────────────────────────────────────────

ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory_select" ON inventory;
DROP POLICY IF EXISTS "inventory_insert" ON inventory;
DROP POLICY IF EXISTS "inventory_update" ON inventory;

CREATE POLICY "inventory_select" ON inventory FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM products p
    WHERE p.id = inventory.product_id AND p.company_id = get_user_company_id()
  ));

CREATE POLICY "inventory_insert" ON inventory FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM products p
    WHERE p.id = inventory.product_id AND p.company_id = get_user_company_id()
  ));

CREATE POLICY "inventory_update" ON inventory FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM products p
    WHERE p.id = inventory.product_id AND p.company_id = get_user_company_id()
  ));

-- ──────────────────────────────────────────────────────────────
-- 14. RLS — product_movements
-- ──────────────────────────────────────────────────────────────

ALTER TABLE product_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "movements_select" ON product_movements;
DROP POLICY IF EXISTS "movements_insert" ON product_movements;

CREATE POLICY "movements_select" ON product_movements FOR SELECT USING (company_id = get_user_company_id());
CREATE POLICY "movements_insert" ON product_movements FOR INSERT WITH CHECK (company_id = get_user_company_id());

-- ──────────────────────────────────────────────────────────────
-- 15. RLS — cash_arqueos
-- ──────────────────────────────────────────────────────────────

ALTER TABLE cash_arqueos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "arqueos_select" ON cash_arqueos;
DROP POLICY IF EXISTS "arqueos_insert" ON cash_arqueos;

CREATE POLICY "arqueos_select" ON cash_arqueos FOR SELECT USING (company_id = get_user_company_id());
CREATE POLICY "arqueos_insert" ON cash_arqueos FOR INSERT WITH CHECK (company_id = get_user_company_id());

-- ──────────────────────────────────────────────────────────────
-- 16. DROP FUNCTIONS (evita errores al cambiar firmas)
-- ──────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS get_active_cash_session(UUID);
DROP FUNCTION IF EXISTS open_cash_session(UUID, UUID, TEXT, NUMERIC, TEXT);
DROP FUNCTION IF EXISTS close_cash_session(UUID, UUID, NUMERIC, TEXT);
DROP FUNCTION IF EXISTS get_cash_session_history(UUID);
DROP FUNCTION IF EXISTS verify_user_pin(UUID, TEXT);
DROP FUNCTION IF EXISTS create_sale_simple(UUID, UUID, JSONB, NUMERIC, NUMERIC, UUID, TEXT);
DROP FUNCTION IF EXISTS get_inventory(UUID);
DROP FUNCTION IF EXISTS upsert_product(JSONB);
DROP FUNCTION IF EXISTS adjust_stock(UUID, UUID, UUID, TEXT, NUMERIC, TEXT, UUID);
DROP FUNCTION IF EXISTS get_product_movements(UUID, UUID, INT);

-- ──────────────────────────────────────────────────────────────
-- 17. FUNCIÓN: get_active_cash_session
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_active_cash_session(p_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  v_session JSONB;
BEGIN
  IF get_user_company_id() IS DISTINCT FROM p_company_id THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'id',                cs.id,
    'register_name',     COALESCE(cs.register_name, 'Caja 1'),
    'opening_amount',    COALESCE(cs.opening_amount, 0),
    'opened_at',         cs.opened_at,
    'total_sales',       COALESCE(cs.total_sales, 0),
    'total_refunds',     COALESCE(cs.total_refunds, 0),
    'transaction_count', COALESCE(cs.transaction_count, 0),
    'payment_summary',   COALESCE(cs.payment_summary, '{}'),
    'opened_by_name',    COALESCE(cs.opened_by_name, '')
  )
  INTO v_session
  FROM cash_sessions cs
  WHERE cs.company_id = p_company_id
    AND cs.status     = 'open'
  ORDER BY cs.opened_at DESC
  LIMIT 1;

  RETURN v_session;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 18. FUNCIÓN: open_cash_session
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION open_cash_session(
  p_company_id     UUID,
  p_user_id        UUID,
  p_register_name  TEXT,
  p_opening_amount NUMERIC,
  p_notes          TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_session_id  UUID;
  v_opener_name TEXT;
BEGIN
  IF get_user_company_id() IS DISTINCT FROM p_company_id THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'No autorizado');
  END IF;

  IF EXISTS (
    SELECT 1 FROM cash_sessions
    WHERE company_id = p_company_id AND status = 'open'
  ) THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Ya hay una caja abierta');
  END IF;

  SELECT TRIM(first_name || ' ' || COALESCE(last_name, ''))
  INTO v_opener_name
  FROM users WHERE id = p_user_id LIMIT 1;

  INSERT INTO cash_sessions (
    company_id, user_id, register_name, opening_amount,
    total_sales, total_refunds, transaction_count, payment_summary,
    opened_at, status, notes, opened_by_name
  ) VALUES (
    p_company_id, p_user_id,
    COALESCE(NULLIF(TRIM(p_register_name), ''), 'Caja 1'),
    COALESCE(p_opening_amount, 0),
    0, 0, 0, '{}',
    NOW(), 'open', p_notes, v_opener_name
  )
  RETURNING id INTO v_session_id;

  RETURN jsonb_build_object('success', TRUE, 'id', v_session_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 19. FUNCIÓN: close_cash_session
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION close_cash_session(
  p_session_id     UUID,
  p_user_id        UUID,
  p_closing_amount NUMERIC,
  p_notes          TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_company UUID;
  v_session RECORD;
BEGIN
  v_company := get_user_company_id();
  IF v_company IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'No autenticado');
  END IF;

  SELECT * INTO v_session
  FROM cash_sessions
  WHERE id = p_session_id AND company_id = v_company AND status = 'open';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Sesión no encontrada o ya cerrada');
  END IF;

  UPDATE cash_sessions SET
    status         = 'closed',
    closing_amount = p_closing_amount,
    closed_at      = NOW(),
    notes          = COALESCE(p_notes, notes)
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'success',           TRUE,
    'register_name',     COALESCE(v_session.register_name, 'Caja 1'),
    'opening_amount',    COALESCE(v_session.opening_amount, 0),
    'closing_amount',    p_closing_amount,
    'total_sales',       COALESCE(v_session.total_sales, 0),
    'total_refunds',     COALESCE(v_session.total_refunds, 0),
    'transaction_count', COALESCE(v_session.transaction_count, 0),
    'payment_summary',   COALESCE(v_session.payment_summary, '{}'),
    'opened_at',         v_session.opened_at,
    'closed_at',         NOW()
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 20. FUNCIÓN: get_cash_session_history
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_cash_session_history(p_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF get_user_company_id() IS DISTINCT FROM p_company_id THEN
    RETURN '[]'::JSONB;
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id',                cs.id,
        'register_name',     COALESCE(cs.register_name, 'Caja 1'),
        'status',            COALESCE(cs.status, 'closed'),
        'opening_amount',    COALESCE(cs.opening_amount, 0),
        'closing_amount',    cs.closing_amount,
        'total_sales',       COALESCE(cs.total_sales, 0),
        'total_refunds',     COALESCE(cs.total_refunds, 0),
        'transaction_count', COALESCE(cs.transaction_count, 0),
        'payment_summary',   COALESCE(cs.payment_summary, '{}'),
        'opened_at',         cs.opened_at,
        'closed_at',         cs.closed_at,
        'opened_by_name',    COALESCE(cs.opened_by_name, ''),
        'notes',             cs.notes
      ) ORDER BY cs.opened_at DESC
    ),
    '[]'::JSONB
  )
  INTO v_result
  FROM cash_sessions cs
  WHERE cs.company_id = p_company_id;

  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  RETURN '[]'::JSONB;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 21. FUNCIÓN: verify_user_pin
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION verify_user_pin(p_user_id UUID, p_pin TEXT)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  v_company UUID;
  v_match   BOOLEAN;
BEGIN
  v_company := get_user_company_id();
  IF v_company IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'No autenticado');
  END IF;

  SELECT (pin = p_pin) INTO v_match
  FROM users
  WHERE id = p_user_id AND company_id = v_company;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Usuario no encontrado');
  END IF;

  IF NOT COALESCE(v_match, FALSE) THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'PIN incorrecto');
  END IF;

  RETURN jsonb_build_object('success', TRUE);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 22. FUNCIÓN: create_sale_simple
--   Crea la venta, registra los pagos y descuenta el inventario.
--   Retorna el UUID de la venta (escalar) para que el cliente
--   lo use directamente como saleId.
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION create_sale_simple(
  p_company_id     UUID,
  p_user_id        UUID,
  p_items          JSONB,
  p_subtotal       NUMERIC,
  p_total          NUMERIC,
  p_session_id     UUID    DEFAULT NULL,
  p_payment_method TEXT    DEFAULT 'cash'
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_sale_id    UUID;
  v_iva        NUMERIC := 0;
  v_ila        NUMERIC := 0;
  v_item       JSONB;
  v_product_id UUID;
  v_qty        NUMERIC;
  v_wh_id      UUID;
  v_before     NUMERIC;
BEGIN
  IF get_user_company_id() IS DISTINCT FROM p_company_id THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  -- Acumular IVA e ILA desde los items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_iva := v_iva + COALESCE((v_item->>'iva_amount')::NUMERIC, 0);
    v_ila := v_ila + COALESCE((v_item->>'ila_amount')::NUMERIC, 0);
  END LOOP;

  -- Insertar venta
  INSERT INTO sales (
    company_id, user_id, cash_session_id,
    subtotal, iva_amount, ila_amount, discount_amount, total,
    status, document_type, channel, items, created_at
  ) VALUES (
    p_company_id, p_user_id, p_session_id,
    p_subtotal, v_iva, v_ila, 0, p_total,
    'completed', 'boleta', 'pos', p_items, NOW()
  )
  RETURNING id INTO v_sale_id;

  -- Insertar pago
  INSERT INTO sale_payments (sale_id, payment_method, amount)
  VALUES (v_sale_id, p_payment_method, p_total);

  -- Obtener bodega default de la empresa (o cualquier bodega)
  SELECT id INTO v_wh_id
  FROM warehouses
  WHERE company_id = p_company_id
  ORDER BY is_default DESC, created_at
  LIMIT 1;

  -- Descontar inventario y registrar movimientos
  IF v_wh_id IS NOT NULL THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
      v_product_id := (v_item->>'product_id')::UUID;
      v_qty        := COALESCE((v_item->>'quantity')::NUMERIC, 1);

      -- Stock antes del movimiento
      SELECT COALESCE(quantity, 0) INTO v_before
      FROM inventory
      WHERE product_id = v_product_id AND warehouse_id = v_wh_id;

      IF NOT FOUND THEN
        v_before := 0;
        INSERT INTO inventory (product_id, warehouse_id, quantity)
        VALUES (v_product_id, v_wh_id, 0)
        ON CONFLICT (product_id, warehouse_id) DO NOTHING;
      END IF;

      -- Registrar movimiento
      INSERT INTO product_movements (
        company_id, product_id, warehouse_id,
        movement_type, quantity,
        quantity_before, quantity_after,
        notes, user_id, sale_id
      ) VALUES (
        p_company_id, v_product_id, v_wh_id,
        'sale', -v_qty,
        v_before, GREATEST(0, v_before - v_qty),
        'Venta POS', p_user_id, v_sale_id
      );

      -- Reducir stock
      UPDATE inventory SET
        quantity   = GREATEST(0, quantity - v_qty),
        updated_at = NOW()
      WHERE product_id = v_product_id AND warehouse_id = v_wh_id;
    END LOOP;
  END IF;

  -- Actualizar contadores de la sesión de caja
  IF p_session_id IS NOT NULL THEN
    UPDATE cash_sessions SET
      total_sales       = COALESCE(total_sales, 0) + p_total,
      transaction_count = COALESCE(transaction_count, 0) + 1,
      payment_summary   = jsonb_set(
        COALESCE(payment_summary, '{}'),
        ARRAY[p_payment_method],
        to_jsonb(
          COALESCE((payment_summary ->> p_payment_method)::NUMERIC, 0) + p_total
        )
      )
    WHERE id = p_session_id;
  END IF;

  RETURN v_sale_id;
EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 23. FUNCIÓN: get_inventory
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_inventory(p_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF get_user_company_id() IS DISTINCT FROM p_company_id THEN
    RETURN '[]'::JSONB;
  END IF;

  WITH stock_agg AS (
    SELECT
      inv.product_id,
      SUM(inv.quantity)  AS total_qty,
      MAX(inv.updated_at) AS last_updated
    FROM inventory inv
    JOIN warehouses w ON w.id = inv.warehouse_id AND w.company_id = p_company_id
    GROUP BY inv.product_id
  ),
  sales_30d AS (
    SELECT
      (item->>'product_id')::UUID      AS product_id,
      SUM((item->>'quantity')::NUMERIC) AS sold_qty,
      SUM((item->>'total')::NUMERIC)    AS revenue
    FROM sales s
    CROSS JOIN LATERAL jsonb_array_elements(s.items) AS item
    WHERE s.company_id = p_company_id
      AND s.status     = 'completed'
      AND s.created_at >= NOW() - INTERVAL '30 days'
    GROUP BY (item->>'product_id')::UUID
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id',              p.id,
        'name',            p.name,
        'sku',             COALESCE(p.sku, ''),
        'barcode',         COALESCE(p.barcode, ''),
        'description',     COALESCE(p.description, ''),
        'sale_price',      COALESCE(p.sale_price, 0),
        'cost_price',      COALESCE(p.cost_price, 0),
        'margin_percent',  CASE
                             WHEN COALESCE(p.sale_price, 0) > 0
                             THEN ROUND(
                               ((p.sale_price - COALESCE(p.cost_price, 0)) / p.sale_price) * 100,
                               1
                             )
                             ELSE 0
                           END,
        'tax_type',        COALESCE(p.tax_type, 'iva'),
        'category_id',     p.category_id,
        'category_name',   COALESCE(cat.name, ''),
        'min_stock_alert', COALESCE(p.min_stock_alert, 5),
        'is_active',       COALESCE(p.is_active, TRUE),
        'stock',           COALESCE(sa.total_qty, 0),
        'available_stock', COALESCE(sa.total_qty, 0),
        'stock_status',    CASE
                             WHEN COALESCE(sa.total_qty, 0) <= 0
                             THEN 'out'
                             WHEN COALESCE(sa.total_qty, 0) <= COALESCE(p.min_stock_alert, 5) * 0.5
                             THEN 'critical'
                             WHEN COALESCE(sa.total_qty, 0) <= COALESCE(p.min_stock_alert, 5)
                             THEN 'low'
                             ELSE 'ok'
                           END,
        'sold_30d',        COALESCE(s30.sold_qty, 0),
        'revenue_30d',     COALESCE(s30.revenue, 0),
        'last_updated',    sa.last_updated
      ) ORDER BY p.name
    ),
    '[]'::JSONB
  )
  INTO v_result
  FROM products p
  LEFT JOIN categories cat ON cat.id = p.category_id
  LEFT JOIN stock_agg   sa  ON sa.product_id  = p.id
  LEFT JOIN sales_30d   s30 ON s30.product_id = p.id
  WHERE p.company_id = p_company_id;

  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 24. FUNCIÓN: upsert_product
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION upsert_product(p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_company    UUID;
  v_product_id UUID;
  v_wh_id      UUID;
  v_init_stock NUMERIC;
  v_is_new     BOOLEAN := FALSE;
BEGIN
  v_company := get_user_company_id();
  IF v_company IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'No autenticado');
  END IF;

  v_product_id := NULLIF(p_data->>'id', '')::UUID;
  v_init_stock := COALESCE(NULLIF(p_data->>'initial_stock', '')::NUMERIC, 0);

  IF v_product_id IS NOT NULL THEN
    -- ── UPDATE ──────────────────────────────────────────────
    UPDATE products SET
      name            = COALESCE(NULLIF(p_data->>'name', ''),         name),
      sku             = NULLIF(p_data->>'sku',         ''),
      barcode         = NULLIF(p_data->>'barcode',     ''),
      description     = NULLIF(p_data->>'description', ''),
      sale_price      = COALESCE(NULLIF(p_data->>'sale_price',      '')::NUMERIC, sale_price),
      cost_price      = COALESCE(NULLIF(p_data->>'cost_price',      '')::NUMERIC, 0),
      tax_type        = COALESCE(NULLIF(p_data->>'tax_type',        ''), 'iva'),
      category_id     = NULLIF(p_data->>'category_id', '')::UUID,
      min_stock_alert = COALESCE(NULLIF(p_data->>'min_stock_alert', '')::INT, 5),
      is_active       = COALESCE((p_data->>'is_active')::BOOLEAN, TRUE)
    WHERE id = v_product_id AND company_id = v_company;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', FALSE, 'error', 'Producto no encontrado');
    END IF;
  ELSE
    -- ── INSERT ──────────────────────────────────────────────
    v_is_new := TRUE;

    INSERT INTO products (
      company_id, name, sku, barcode, description,
      sale_price, cost_price, tax_type, category_id,
      min_stock_alert, is_active
    ) VALUES (
      v_company,
      p_data->>'name',
      NULLIF(p_data->>'sku',         ''),
      NULLIF(p_data->>'barcode',     ''),
      NULLIF(p_data->>'description', ''),
      COALESCE(NULLIF(p_data->>'sale_price',  '')::NUMERIC, 0),
      COALESCE(NULLIF(p_data->>'cost_price',  '')::NUMERIC, 0),
      COALESCE(NULLIF(p_data->>'tax_type',    ''), 'iva'),
      NULLIF(p_data->>'category_id', '')::UUID,
      COALESCE(NULLIF(p_data->>'min_stock_alert', '')::INT, 5),
      TRUE
    )
    RETURNING id INTO v_product_id;

    -- Obtener o crear bodega por defecto
    SELECT id INTO v_wh_id
    FROM warehouses
    WHERE company_id = v_company
    ORDER BY is_default DESC, created_at
    LIMIT 1;

    IF v_wh_id IS NULL THEN
      INSERT INTO warehouses (company_id, name, is_default)
      VALUES (v_company, 'Bodega Principal', TRUE)
      RETURNING id INTO v_wh_id;
    END IF;

    -- Crear registro de inventario con stock inicial
    INSERT INTO inventory (product_id, warehouse_id, quantity)
    VALUES (v_product_id, v_wh_id, v_init_stock)
    ON CONFLICT (product_id, warehouse_id)
    DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = NOW();

    -- Movimiento de apertura si hay stock inicial
    IF v_init_stock > 0 THEN
      INSERT INTO product_movements (
        company_id, product_id, warehouse_id,
        movement_type, quantity, quantity_before, quantity_after, notes
      ) VALUES (
        v_company, v_product_id, v_wh_id,
        'opening', v_init_stock, 0, v_init_stock, 'Stock inicial'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('success', TRUE, 'id', v_product_id, 'is_new', v_is_new);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 25. FUNCIÓN: adjust_stock
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION adjust_stock(
  p_company_id   UUID,
  p_product_id   UUID,
  p_warehouse_id UUID,
  p_type         TEXT,
  p_quantity     NUMERIC,
  p_notes        TEXT    DEFAULT NULL,
  p_user_id      UUID    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_before NUMERIC := 0;
  v_after  NUMERIC;
BEGIN
  IF get_user_company_id() IS DISTINCT FROM p_company_id THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'No autorizado');
  END IF;

  -- Leer stock actual; crear fila si no existe
  SELECT quantity INTO v_before
  FROM inventory
  WHERE product_id = p_product_id AND warehouse_id = p_warehouse_id;

  IF NOT FOUND THEN
    INSERT INTO inventory (product_id, warehouse_id, quantity)
    VALUES (p_product_id, p_warehouse_id, 0)
    ON CONFLICT (product_id, warehouse_id) DO NOTHING;
    v_before := 0;
  END IF;

  -- p_quantity es el delta (puede ser negativo para adjustment / merma / sale)
  v_after := GREATEST(0, v_before + p_quantity);

  UPDATE inventory SET
    quantity   = v_after,
    updated_at = NOW()
  WHERE product_id = p_product_id AND warehouse_id = p_warehouse_id;

  INSERT INTO product_movements (
    company_id, product_id, warehouse_id,
    movement_type, quantity, quantity_before, quantity_after,
    notes, user_id
  ) VALUES (
    p_company_id, p_product_id, p_warehouse_id,
    p_type, p_quantity, v_before, v_after,
    p_notes, p_user_id
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'before',  v_before,
    'after',   v_after,
    'delta',   p_quantity
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 26. FUNCIÓN: get_product_movements
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_product_movements(
  p_company_id UUID,
  p_product_id UUID,
  p_limit      INT DEFAULT 50
)
RETURNS TABLE (
  id              UUID,
  movement_type   TEXT,
  quantity        NUMERIC,
  quantity_before NUMERIC,
  quantity_after  NUMERIC,
  notes           TEXT,
  created_at      TIMESTAMPTZ,
  user_name       TEXT
)
LANGUAGE SQL STABLE SECURITY DEFINER
AS $$
  SELECT
    pm.id,
    pm.movement_type,
    pm.quantity,
    pm.quantity_before,
    pm.quantity_after,
    pm.notes,
    pm.created_at,
    COALESCE(TRIM(u.first_name || ' ' || COALESCE(u.last_name, '')), 'Sistema') AS user_name
  FROM product_movements pm
  LEFT JOIN users u ON u.id = pm.user_id
  WHERE pm.company_id = p_company_id
    AND pm.product_id = p_product_id
    AND p_company_id  = get_user_company_id()
  ORDER BY pm.created_at DESC
  LIMIT p_limit;
$$;
