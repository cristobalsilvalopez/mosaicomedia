-- ============================================================
-- MOSAICO PRO — Módulo Proveedores y Órdenes de Compra
-- Ejecutar en el SQL Editor de Supabase
-- DEPENDENCIA: ejecutar pos_setup.sql ANTES que este archivo
--   (usa las tablas inventory, warehouses y la función adjust_stock)
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. TABLAS
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS suppliers (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  rut          TEXT,
  contact_name TEXT,
  phone        TEXT,
  email        TEXT,
  address      TEXT,
  city         TEXT,
  category     TEXT DEFAULT 'general',  -- bebidas | almacén | limpieza | general
  notes        TEXT,
  is_active    BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id  UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  order_number TEXT,
  status       TEXT DEFAULT 'pending',   -- pending | received | partial | cancelled
  order_date   DATE DEFAULT CURRENT_DATE,
  expected_date DATE,
  received_date DATE,
  subtotal     NUMERIC(12,2) DEFAULT 0,
  tax_amount   NUMERIC(12,2) DEFAULT 0,
  total        NUMERIC(12,2) DEFAULT 0,
  notes        TEXT,
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id         UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id       UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name     TEXT NOT NULL,           -- snapshot del nombre por si se borra el producto
  sku              TEXT,
  quantity_ordered NUMERIC(10,2) NOT NULL,
  quantity_received NUMERIC(10,2) DEFAULT 0,
  unit_cost        NUMERIC(12,2) NOT NULL,
  total_cost       NUMERIC(12,2) GENERATED ALWAYS AS (quantity_ordered * unit_cost) STORED,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_suppliers_company      ON suppliers(company_id);
CREATE INDEX IF NOT EXISTS idx_po_company             ON purchase_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_po_supplier            ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_po_status              ON purchase_orders(company_id, status);
CREATE INDEX IF NOT EXISTS idx_poi_order              ON purchase_order_items(order_id);

-- ──────────────────────────────────────────────────────────────
-- 2. RLS
-- ──────────────────────────────────────────────────────────────

ALTER TABLE suppliers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;

-- Suppliers
DROP POLICY IF EXISTS "suppliers_select" ON suppliers;
DROP POLICY IF EXISTS "suppliers_insert" ON suppliers;
DROP POLICY IF EXISTS "suppliers_update" ON suppliers;
DROP POLICY IF EXISTS "suppliers_delete" ON suppliers;

CREATE POLICY "suppliers_select" ON suppliers FOR SELECT USING (company_id = get_user_company_id());
CREATE POLICY "suppliers_insert" ON suppliers FOR INSERT WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "suppliers_update" ON suppliers FOR UPDATE USING (company_id = get_user_company_id());
CREATE POLICY "suppliers_delete" ON suppliers FOR DELETE USING (company_id = get_user_company_id());

-- Purchase orders
DROP POLICY IF EXISTS "po_select" ON purchase_orders;
DROP POLICY IF EXISTS "po_insert" ON purchase_orders;
DROP POLICY IF EXISTS "po_update" ON purchase_orders;

CREATE POLICY "po_select" ON purchase_orders FOR SELECT USING (company_id = get_user_company_id());
CREATE POLICY "po_insert" ON purchase_orders FOR INSERT WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "po_update" ON purchase_orders FOR UPDATE USING (company_id = get_user_company_id());

-- Purchase order items (acceso via order)
DROP POLICY IF EXISTS "poi_select" ON purchase_order_items;
DROP POLICY IF EXISTS "poi_insert" ON purchase_order_items;
DROP POLICY IF EXISTS "poi_update" ON purchase_order_items;
DROP POLICY IF EXISTS "poi_delete" ON purchase_order_items;

CREATE POLICY "poi_select" ON purchase_order_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM purchase_orders po WHERE po.id = order_id AND po.company_id = get_user_company_id()));
CREATE POLICY "poi_insert" ON purchase_order_items FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM purchase_orders po WHERE po.id = order_id AND po.company_id = get_user_company_id()));
CREATE POLICY "poi_update" ON purchase_order_items FOR UPDATE
  USING (EXISTS (SELECT 1 FROM purchase_orders po WHERE po.id = order_id AND po.company_id = get_user_company_id()));
CREATE POLICY "poi_delete" ON purchase_order_items FOR DELETE
  USING (EXISTS (SELECT 1 FROM purchase_orders po WHERE po.id = order_id AND po.company_id = get_user_company_id()));

-- ──────────────────────────────────────────────────────────────
-- 3. FUNCIONES RPC
-- ──────────────────────────────────────────────────────────────

-- upsert_supplier: crea o edita proveedor
CREATE OR REPLACE FUNCTION upsert_supplier(p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
  v_company UUID;
BEGIN
  v_company := get_user_company_id();
  IF v_company IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'No autenticado');
  END IF;

  v_id := NULLIF(p_data->>'id', '')::UUID;

  IF v_id IS NULL THEN
    INSERT INTO suppliers (
      company_id, name, rut, contact_name, phone, email,
      address, city, category, notes
    ) VALUES (
      v_company,
      p_data->>'name',
      NULLIF(p_data->>'rut',          ''),
      NULLIF(p_data->>'contact_name', ''),
      NULLIF(p_data->>'phone',        ''),
      NULLIF(p_data->>'email',        ''),
      NULLIF(p_data->>'address',      ''),
      NULLIF(p_data->>'city',         ''),
      COALESCE(NULLIF(p_data->>'category', ''), 'general'),
      NULLIF(p_data->>'notes',        '')
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE suppliers SET
      name         = p_data->>'name',
      rut          = NULLIF(p_data->>'rut',          ''),
      contact_name = NULLIF(p_data->>'contact_name', ''),
      phone        = NULLIF(p_data->>'phone',        ''),
      email        = NULLIF(p_data->>'email',        ''),
      address      = NULLIF(p_data->>'address',      ''),
      city         = NULLIF(p_data->>'city',         ''),
      category     = COALESCE(NULLIF(p_data->>'category', ''), 'general'),
      notes        = NULLIF(p_data->>'notes',        ''),
      is_active    = COALESCE((p_data->>'is_active')::BOOLEAN, is_active),
      updated_at   = NOW()
    WHERE id = v_id AND company_id = v_company;
  END IF;

  RETURN jsonb_build_object('success', TRUE, 'id', v_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$;

-- create_purchase_order: crea OC con sus ítems
CREATE OR REPLACE FUNCTION create_purchase_order(p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_order_id UUID;
  v_company  UUID;
  v_user_id  UUID;
  v_item     JSONB;
  v_subtotal NUMERIC := 0;
  v_tax      NUMERIC := 0;
  v_total    NUMERIC := 0;
  v_num      TEXT;
BEGIN
  v_company := get_user_company_id();
  IF v_company IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'No autenticado');
  END IF;

  SELECT id INTO v_user_id FROM users WHERE auth_user_id = auth.uid() LIMIT 1;

  -- Generar número de OC automático: OC-YYYYMM-NNNN
  SELECT 'OC-' || TO_CHAR(NOW(), 'YYYYMM') || '-' ||
         LPAD((COALESCE(
           (SELECT COUNT(*) FROM purchase_orders
            WHERE company_id = v_company
              AND order_date >= DATE_TRUNC('month', NOW())),
           0
         ) + 1)::TEXT, 4, '0')
  INTO v_num;

  -- Calcular totales desde los ítems
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_data->'items')
  LOOP
    v_subtotal := v_subtotal +
      (v_item->>'quantity_ordered')::NUMERIC *
      (v_item->>'unit_cost')::NUMERIC;
  END LOOP;

  v_tax   := ROUND(v_subtotal * 0.19, 0);
  v_total := v_subtotal + v_tax;

  -- Insertar OC
  INSERT INTO purchase_orders (
    company_id, supplier_id, order_number, status,
    order_date, expected_date, subtotal, tax_amount, total,
    notes, created_by
  ) VALUES (
    v_company,
    (p_data->>'supplier_id')::UUID,
    COALESCE(NULLIF(p_data->>'order_number', ''), v_num),
    'pending',
    COALESCE(NULLIF(p_data->>'order_date', '')::DATE, CURRENT_DATE),
    NULLIF(p_data->>'expected_date', '')::DATE,
    v_subtotal,
    v_tax,
    v_total,
    NULLIF(p_data->>'notes', ''),
    v_user_id
  )
  RETURNING id INTO v_order_id;

  -- Insertar ítems
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_data->'items')
  LOOP
    INSERT INTO purchase_order_items (
      order_id, product_id, product_name, sku,
      quantity_ordered, quantity_received, unit_cost
    ) VALUES (
      v_order_id,
      NULLIF(v_item->>'product_id', '')::UUID,
      v_item->>'product_name',
      NULLIF(v_item->>'sku', ''),
      (v_item->>'quantity_ordered')::NUMERIC,
      0,
      (v_item->>'unit_cost')::NUMERIC
    );
  END LOOP;

  RETURN jsonb_build_object('success', TRUE, 'order_id', v_order_id, 'order_number', v_num);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$;

-- receive_purchase_order: marca recepción y ajusta stock
CREATE OR REPLACE FUNCTION receive_purchase_order(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_company   UUID;
  v_user_id   UUID;
  v_warehouse UUID;
  v_item      RECORD;
BEGIN
  v_company := get_user_company_id();
  IF v_company IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'No autenticado');
  END IF;

  -- Verificar que la OC pertenece a la empresa
  IF NOT EXISTS (
    SELECT 1 FROM purchase_orders
    WHERE id = p_order_id AND company_id = v_company AND status = 'pending'
  ) THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Orden no encontrada o ya procesada');
  END IF;

  SELECT id INTO v_user_id    FROM users      WHERE auth_user_id = auth.uid() LIMIT 1;
  SELECT id INTO v_warehouse  FROM warehouses WHERE company_id   = v_company AND is_active = TRUE LIMIT 1;

  -- Ajustar stock de cada ítem que tenga product_id
  FOR v_item IN
    SELECT * FROM purchase_order_items WHERE order_id = p_order_id AND product_id IS NOT NULL
  LOOP
    PERFORM adjust_stock(
      v_company,
      v_item.product_id,
      v_warehouse,
      'purchase',
      v_item.quantity_ordered,
      'Recepción OC ' || (SELECT order_number FROM purchase_orders WHERE id = p_order_id),
      v_user_id
    );

    UPDATE purchase_order_items
    SET quantity_received = quantity_ordered
    WHERE id = v_item.id;

    -- Actualizar costo en el producto
    UPDATE products
    SET cost_price = v_item.unit_cost, updated_at = NOW()
    WHERE id = v_item.product_id AND company_id = v_company;
  END LOOP;

  -- Marcar OC como recibida
  UPDATE purchase_orders
  SET status = 'received', received_date = CURRENT_DATE, updated_at = NOW()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', TRUE);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$;

-- get_purchase_orders: lista OC con nombre del proveedor
-- Nota: usa plpgsql con RETURN QUERY para evitar conflicto de nombres
-- entre los parámetros de RETURNS TABLE y las columnas de la tabla.
CREATE OR REPLACE FUNCTION get_purchase_orders(p_company_id UUID)
RETURNS TABLE (
  id            UUID,
  order_number  TEXT,
  status        TEXT,
  order_date    DATE,
  expected_date DATE,
  received_date DATE,
  supplier_id   UUID,
  supplier_name TEXT,
  subtotal      NUMERIC,
  tax_amount    NUMERIC,
  total         NUMERIC,
  notes         TEXT,
  item_count    BIGINT,
  created_at    TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
BEGIN
  IF get_user_company_id() IS DISTINCT FROM p_company_id THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    po.id,
    po.order_number,
    po.status,
    po.order_date,
    po.expected_date,
    po.received_date,
    po.supplier_id,
    s.name         AS supplier_name,
    po.subtotal,
    po.tax_amount,
    po.total,
    po.notes,
    COUNT(poi.id)  AS item_count,
    po.created_at
  FROM purchase_orders po
  JOIN suppliers s ON s.id = po.supplier_id
  LEFT JOIN purchase_order_items poi ON poi.order_id = po.id
  WHERE po.company_id = p_company_id
  GROUP BY po.id, s.name
  ORDER BY po.created_at DESC;
END;
$$;
