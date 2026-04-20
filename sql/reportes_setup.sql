-- ============================================================
-- MOSAICO PRO — Módulo Reportes
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. get_sales_report: ventas con detalle completo por rango
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_sales_report(
  p_company_id UUID,
  p_from        DATE,
  p_to          DATE
)
RETURNS TABLE (
  sale_id        UUID,
  created_at     TIMESTAMPTZ,
  document_type  TEXT,
  channel        TEXT,
  cashier_name   TEXT,
  subtotal       NUMERIC,
  iva_amount     NUMERIC,
  ila_amount     NUMERIC,
  discount_amount NUMERIC,
  total          NUMERIC,
  status         TEXT,
  payment_methods TEXT   -- ej: "efectivo: $5000, débito: $3000"
)
LANGUAGE SQL STABLE SECURITY DEFINER
AS $$
  SELECT
    s.id            AS sale_id,
    s.created_at,
    s.document_type,
    COALESCE(s.channel, 'pos') AS channel,
    COALESCE(u.first_name || ' ' || COALESCE(u.last_name, ''), 'Sistema') AS cashier_name,
    COALESCE(s.subtotal, 0)          AS subtotal,
    COALESCE(s.iva_amount, 0)        AS iva_amount,
    COALESCE(s.ila_amount, 0)        AS ila_amount,
    COALESCE(s.discount_amount, 0)   AS discount_amount,
    COALESCE(s.total, 0)             AS total,
    s.status,
    COALESCE(
      string_agg(
        sp.payment_method || ': $' || ROUND(sp.amount)::text,
        ' | ' ORDER BY sp.payment_method
      ),
      ''
    ) AS payment_methods
  FROM sales s
  LEFT JOIN users u ON u.id = s.user_id
  LEFT JOIN sale_payments sp ON sp.sale_id = s.id
  WHERE s.company_id = p_company_id
    AND p_company_id = get_user_company_id()
    AND s.created_at::date BETWEEN p_from AND p_to
    AND s.status = 'completed'
  GROUP BY s.id, s.created_at, s.document_type, s.channel,
           u.first_name, u.last_name, s.subtotal, s.iva_amount,
           s.ila_amount, s.discount_amount, s.total, s.status
  ORDER BY s.created_at DESC;
$$;

-- ──────────────────────────────────────────────────────────────
-- 2. get_report_summary: totales y agrupaciones para el período
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_report_summary(
  p_company_id UUID,
  p_from        DATE,
  p_to          DATE
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF get_user_company_id() IS DISTINCT FROM p_company_id THEN
    RETURN jsonb_build_object('error', 'No autorizado');
  END IF;

  SELECT jsonb_build_object(
    -- Totales
    'total_sales',     COALESCE(SUM(s.total), 0),
    'total_count',     COUNT(*),
    'avg_ticket',      COALESCE(AVG(s.total), 0),
    'subtotal_net',    COALESCE(SUM(s.subtotal), 0),
    'iva_total',       COALESCE(SUM(s.iva_amount), 0),
    'ila_total',       COALESCE(SUM(s.ila_amount), 0),
    'discount_total',  COALESCE(SUM(s.discount_amount), 0),

    -- Por método de pago
    'cash_total',      COALESCE(SUM(CASE WHEN sp.payment_method = 'cash'     THEN sp.amount ELSE 0 END), 0),
    'debit_total',     COALESCE(SUM(CASE WHEN sp.payment_method = 'debit'    THEN sp.amount ELSE 0 END), 0),
    'credit_total',    COALESCE(SUM(CASE WHEN sp.payment_method = 'credit'   THEN sp.amount ELSE 0 END), 0),
    'transfer_total',  COALESCE(SUM(CASE WHEN sp.payment_method = 'transfer' THEN sp.amount ELSE 0 END), 0),

    -- Por tipo documento
    'boleta_count',    COUNT(*) FILTER (WHERE s.document_type = 'boleta'),
    'factura_count',   COUNT(*) FILTER (WHERE s.document_type = 'factura'),

    -- Por día (para el gráfico)
    'by_day', (
      SELECT jsonb_agg(jsonb_build_object('date', day, 'total', total, 'count', cnt) ORDER BY day)
      FROM (
        SELECT s2.created_at::date AS day,
               SUM(s2.total)       AS total,
               COUNT(*)            AS cnt
        FROM sales s2
        WHERE s2.company_id = p_company_id
          AND s2.created_at::date BETWEEN p_from AND p_to
          AND s2.status = 'completed'
        GROUP BY s2.created_at::date
      ) d
    ),

    -- Top 10 productos
    'top_products', (
      SELECT jsonb_agg(jsonb_build_object(
        'name',      p.name,
        'sku',       p.sku,
        'qty',       SUM((item->>'quantity')::numeric),
        'revenue',   SUM((item->>'total_price')::numeric)
      ) ORDER BY SUM((item->>'total_price')::numeric) DESC)
      FROM sales s3
      CROSS JOIN LATERAL jsonb_array_elements(s3.items) AS item
      JOIN products p ON p.id = (item->>'product_id')::uuid
      WHERE s3.company_id = p_company_id
        AND s3.created_at::date BETWEEN p_from AND p_to
        AND s3.status = 'completed'
      GROUP BY p.id, p.name, p.sku
      LIMIT 10
    )
  )
  INTO v_result
  FROM sales s
  LEFT JOIN sale_payments sp ON sp.sale_id = s.id
  WHERE s.company_id = p_company_id
    AND s.created_at::date BETWEEN p_from AND p_to
    AND s.status = 'completed';

  RETURN v_result;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 3. get_dashboard_data: todos los KPIs del dashboard principal
--    p_period: 'today' | 'week' | 'month'
-- ──────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS get_dashboard_data(UUID, TEXT);

CREATE OR REPLACE FUNCTION get_dashboard_data(
  p_company_id UUID,
  p_period     TEXT DEFAULT 'today'
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  v_today       DATE    := CURRENT_DATE;
  v_from        DATE;
  v_to          DATE;
  v_prev_from   DATE;
  v_prev_to     DATE;

  v_sales_total    NUMERIC := 0;
  v_sales_count    BIGINT  := 0;
  v_avg_ticket     NUMERIC := 0;
  v_iva_total      NUMERIC := 0;
  v_ila_total      NUMERIC := 0;
  v_cash_sales     NUMERIC := 0;
  v_debit_sales    NUMERIC := 0;
  v_credit_sales   NUMERIC := 0;
  v_transfer_sales NUMERIC := 0;
  v_prev_total     NUMERIC := 0;
  v_prev_count     BIGINT  := 0;
  v_growth_pct     NUMERIC;

  v_low_stock     JSONB := '[]'::JSONB;
  v_top_products  JSONB := '[]'::JSONB;
  v_sales_by_hour JSONB := '[]'::JSONB;
  v_recent_sales  JSONB := '[]'::JSONB;
  v_cash_session  JSONB;
BEGIN
  IF get_user_company_id() IS DISTINCT FROM p_company_id THEN
    RETURN jsonb_build_object('error', 'No autorizado');
  END IF;

  -- ── Rango de fechas según período ────────────────────────────
  CASE p_period
    WHEN 'week' THEN
      v_from      := date_trunc('week', v_today)::DATE;
      v_to        := v_today;
      v_prev_from := (date_trunc('week', v_today) - INTERVAL '7 days')::DATE;
      v_prev_to   := (date_trunc('week', v_today) - INTERVAL '1 day')::DATE;
    WHEN 'month' THEN
      v_from      := date_trunc('month', v_today)::DATE;
      v_to        := v_today;
      v_prev_from := (date_trunc('month', v_today) - INTERVAL '1 month')::DATE;
      v_prev_to   := (date_trunc('month', v_today) - INTERVAL '1 day')::DATE;
    ELSE -- 'today'
      v_from      := v_today;
      v_to        := v_today;
      v_prev_from := v_today - 1;
      v_prev_to   := v_today - 1;
  END CASE;

  -- ── KPIs principales ─────────────────────────────────────────
  SELECT
    COALESCE(SUM(s.total),       0),
    COUNT(*),
    COALESCE(AVG(s.total),       0),
    COALESCE(SUM(s.iva_amount),  0),
    COALESCE(SUM(s.ila_amount),  0)
  INTO v_sales_total, v_sales_count, v_avg_ticket, v_iva_total, v_ila_total
  FROM sales s
  WHERE s.company_id         = p_company_id
    AND s.created_at::DATE BETWEEN v_from AND v_to
    AND s.status             = 'completed';

  -- ── Desglose por método de pago ───────────────────────────────
  SELECT
    COALESCE(SUM(CASE WHEN sp.payment_method = 'cash'     THEN sp.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN sp.payment_method = 'debit'    THEN sp.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN sp.payment_method = 'credit'   THEN sp.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN sp.payment_method = 'transfer' THEN sp.amount ELSE 0 END), 0)
  INTO v_cash_sales, v_debit_sales, v_credit_sales, v_transfer_sales
  FROM sale_payments sp
  JOIN sales s ON s.id = sp.sale_id
  WHERE s.company_id         = p_company_id
    AND s.created_at::DATE BETWEEN v_from AND v_to
    AND s.status             = 'completed';

  -- ── Período anterior ──────────────────────────────────────────
  SELECT COALESCE(SUM(s.total), 0), COUNT(*)
  INTO v_prev_total, v_prev_count
  FROM sales s
  WHERE s.company_id         = p_company_id
    AND s.created_at::DATE BETWEEN v_prev_from AND v_prev_to
    AND s.status             = 'completed';

  IF v_prev_total > 0 THEN
    v_growth_pct := ROUND(((v_sales_total - v_prev_total) / v_prev_total) * 100, 1);
  END IF;

  -- ── Top 5 productos del período ───────────────────────────────
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'name',         r.pname,
        'total_amount', r.tamount,
        'total_qty',    r.tqty
      ) ORDER BY r.tamount DESC
    ),
    '[]'::JSONB
  )
  INTO v_top_products
  FROM (
    SELECT
      p.name                                     AS pname,
      SUM((item->>'total')::NUMERIC)             AS tamount,
      SUM((item->>'quantity')::NUMERIC)          AS tqty
    FROM sales s
    CROSS JOIN LATERAL jsonb_array_elements(s.items) AS item
    JOIN products p ON p.id = (item->>'product_id')::UUID
    WHERE s.company_id         = p_company_id
      AND s.created_at::DATE BETWEEN v_from AND v_to
      AND s.status             = 'completed'
    GROUP BY p.id, p.name
    ORDER BY tamount DESC
    LIMIT 5
  ) r;

  -- ── Productos con stock bajo ──────────────────────────────────
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id',        p.id,
        'name',      p.name,
        'sku',       COALESCE(p.sku, ''),
        'stock',     COALESCE(inv.total_qty, 0),
        'min_stock', COALESCE(p.min_stock_alert, 5),
        'category',  COALESCE(cat.name, '')
      ) ORDER BY inv.total_qty ASC NULLS FIRST
    ),
    '[]'::JSONB
  )
  INTO v_low_stock
  FROM products p
  LEFT JOIN categories cat ON cat.id = p.category_id
  LEFT JOIN (
    SELECT product_id, SUM(quantity) AS total_qty
    FROM inventory
    GROUP BY product_id
  ) inv ON inv.product_id = p.id
  WHERE p.company_id = p_company_id
    AND p.is_active  = TRUE
    AND COALESCE(inv.total_qty, 0) <= COALESCE(p.min_stock_alert, 5);

  -- ── Ventas por hora (siempre hoy — para el heatmap) ──────────
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'hour',  r.h,
        'total', r.total,
        'count', r.cnt
      ) ORDER BY r.h
    ),
    '[]'::JSONB
  )
  INTO v_sales_by_hour
  FROM (
    SELECT
      EXTRACT(HOUR FROM s.created_at AT TIME ZONE 'America/Santiago')::INT AS h,
      SUM(s.total)  AS total,
      COUNT(*)      AS cnt
    FROM sales s
    WHERE s.company_id     = p_company_id
      AND s.created_at::DATE = v_today
      AND s.status         = 'completed'
    GROUP BY h
  ) r;

  -- ── Últimas 10 ventas ─────────────────────────────────────────
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'created_at', s.created_at,
        'total',      s.total,
        'cashier',    COALESCE(TRIM(u.first_name || ' ' || COALESCE(u.last_name, '')), 'Sistema')
      ) ORDER BY s.created_at DESC
    ),
    '[]'::JSONB
  )
  INTO v_recent_sales
  FROM (
    SELECT id, created_at, total, user_id
    FROM sales
    WHERE company_id = p_company_id AND status = 'completed'
    ORDER BY created_at DESC
    LIMIT 10
  ) s
  LEFT JOIN users u ON u.id = s.user_id;

  -- ── Sesión de caja activa ─────────────────────────────────────
  SELECT jsonb_build_object(
    'id',                cs.id,
    'register_name',     COALESCE(cs.register_name, 'Caja 1'),
    'opening_amount',    COALESCE(cs.opening_amount, 0),
    'opened_at',         cs.opened_at,
    'total_sales',       COALESCE(cs.total_sales, 0),
    'transaction_count', COALESCE(cs.transaction_count, 0),
    'payment_summary',   COALESCE(cs.payment_summary, '{}'),
    'opened_by_name',    COALESCE(cs.opened_by_name, '')
  )
  INTO v_cash_session
  FROM cash_sessions cs
  WHERE cs.company_id = p_company_id AND cs.status = 'open'
  ORDER BY cs.opened_at DESC
  LIMIT 1;

  -- ── Resultado ─────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'period',          p_period,
    'sales_total',     v_sales_total,
    'sales_count',     v_sales_count,
    'avg_ticket',      v_avg_ticket,
    'iva_total',       v_iva_total,
    'ila_total',       v_ila_total,
    'prev_total',      v_prev_total,
    'prev_count',      v_prev_count,
    'growth_pct',      v_growth_pct,
    'cash_sales',      v_cash_sales,
    'debit_sales',     v_debit_sales,
    'credit_sales',    v_credit_sales,
    'transfer_sales',  v_transfer_sales,
    'low_stock',       v_low_stock,
    'top_products',    v_top_products,
    'sales_by_hour',   v_sales_by_hour,
    'recent_sales',    v_recent_sales,
    'cash_session',    v_cash_session
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM);
END;
$$;
