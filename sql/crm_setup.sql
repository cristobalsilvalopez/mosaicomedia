-- ============================================================
-- MOSAICO PRO — Módulo CRM
-- Ejecutar en el SQL Editor de Supabase
-- Es seguro re-ejecutar (usa IF NOT EXISTS / CREATE OR REPLACE)
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. EXTENDER TABLA customers (columnas CRM)
-- ──────────────────────────────────────────────────────────────

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS last_name         TEXT,
  ADD COLUMN IF NOT EXISTS rut               TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp          TEXT,
  ADD COLUMN IF NOT EXISTS address           TEXT,
  ADD COLUMN IF NOT EXISTS city              TEXT DEFAULT 'Santiago',
  ADD COLUMN IF NOT EXISTS tier              TEXT DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS points            INT  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tags              TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS acquisition_source TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS is_active         BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notes             TEXT;

ALTER TABLE customers
  DROP CONSTRAINT IF EXISTS customers_tier_check;
ALTER TABLE customers
  ADD CONSTRAINT customers_tier_check
    CHECK (tier IN ('standard','silver','gold','platinum'));

ALTER TABLE customers
  DROP CONSTRAINT IF EXISTS customers_source_check;
ALTER TABLE customers
  ADD CONSTRAINT customers_source_check
    CHECK (acquisition_source IN ('pos','manual','web','whatsapp','instagram','facebook','referral'));

-- ──────────────────────────────────────────────────────────────
-- 2. TABLA: crm_customer_notes
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_customer_notes (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  note        TEXT NOT NULL,
  note_type   TEXT NOT NULL DEFAULT 'general',
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT crm_note_type_check
    CHECK (note_type IN ('general','followup','complaint','sale'))
);

CREATE INDEX IF NOT EXISTS idx_crm_notes_customer ON crm_customer_notes(customer_id);
CREATE INDEX IF NOT EXISTS idx_crm_notes_company  ON crm_customer_notes(company_id);

-- ──────────────────────────────────────────────────────────────
-- 3. TABLA: crm_message_templates
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_message_templates (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,  -- NULL = plantilla global
  name       TEXT NOT NULL,
  content    TEXT NOT NULL,   -- puede tener {first_name}, {company}, etc.
  variables  JSONB DEFAULT '[]',
  channel    TEXT NOT NULL DEFAULT 'whatsapp',
  is_active  BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT crm_tpl_channel_check
    CHECK (channel IN ('whatsapp','email','sms'))
);

CREATE INDEX IF NOT EXISTS idx_crm_tpl_company ON crm_message_templates(company_id);

-- Migración: asegurar que variables sea JSONB (puede ser TEXT[] en instancias previas)
ALTER TABLE crm_message_templates ALTER COLUMN variables DROP DEFAULT;
ALTER TABLE crm_message_templates ALTER COLUMN variables TYPE JSONB USING '[]'::JSONB;
ALTER TABLE crm_message_templates ALTER COLUMN variables SET DEFAULT '[]'::JSONB;

-- ──────────────────────────────────────────────────────────────
-- 4. TABLA: crm_campaigns
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_campaigns (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  segment      TEXT NOT NULL DEFAULT 'all',
  channel      TEXT NOT NULL DEFAULT 'whatsapp',
  template_id  UUID REFERENCES crm_message_templates(id) ON DELETE SET NULL,
  status       TEXT NOT NULL DEFAULT 'running',
  target_count INT  NOT NULL DEFAULT 0,
  sent_count   INT  NOT NULL DEFAULT 0,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  CONSTRAINT crm_campaign_status_check
    CHECK (status IN ('running','completed','cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_crm_campaigns_company ON crm_campaigns(company_id);

-- ──────────────────────────────────────────────────────────────
-- 5. TABLA: crm_messages (cola de mensajes por campaña)
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_messages (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES crm_campaigns(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  first_name  TEXT,
  last_name   TEXT,
  to_phone    TEXT NOT NULL,
  message     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',
  sent_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT crm_msg_status_check
    CHECK (status IN ('pending','sent','failed'))
);

CREATE INDEX IF NOT EXISTS idx_crm_msgs_campaign ON crm_messages(campaign_id);
CREATE INDEX IF NOT EXISTS idx_crm_msgs_company  ON crm_messages(company_id, status);

-- ──────────────────────────────────────────────────────────────
-- 6. RLS
-- ──────────────────────────────────────────────────────────────

ALTER TABLE crm_customer_notes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_campaigns         ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_messages          ENABLE ROW LEVEL SECURITY;

-- crm_customer_notes
DROP POLICY IF EXISTS "crm_notes_select" ON crm_customer_notes;
DROP POLICY IF EXISTS "crm_notes_insert" ON crm_customer_notes;
DROP POLICY IF EXISTS "crm_notes_delete" ON crm_customer_notes;
CREATE POLICY "crm_notes_select" ON crm_customer_notes FOR SELECT USING (company_id = get_user_company_id());
CREATE POLICY "crm_notes_insert" ON crm_customer_notes FOR INSERT WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "crm_notes_delete" ON crm_customer_notes FOR DELETE USING (company_id = get_user_company_id());

-- crm_message_templates (globales o propias)
DROP POLICY IF EXISTS "crm_tpl_select" ON crm_message_templates;
DROP POLICY IF EXISTS "crm_tpl_insert" ON crm_message_templates;
CREATE POLICY "crm_tpl_select" ON crm_message_templates FOR SELECT
  USING (company_id IS NULL OR company_id = get_user_company_id());
CREATE POLICY "crm_tpl_insert" ON crm_message_templates FOR INSERT
  WITH CHECK (company_id = get_user_company_id());

-- crm_campaigns
DROP POLICY IF EXISTS "crm_camp_select" ON crm_campaigns;
DROP POLICY IF EXISTS "crm_camp_insert" ON crm_campaigns;
DROP POLICY IF EXISTS "crm_camp_update" ON crm_campaigns;
CREATE POLICY "crm_camp_select" ON crm_campaigns FOR SELECT USING (company_id = get_user_company_id());
CREATE POLICY "crm_camp_insert" ON crm_campaigns FOR INSERT WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "crm_camp_update" ON crm_campaigns FOR UPDATE USING (company_id = get_user_company_id());

-- crm_messages
DROP POLICY IF EXISTS "crm_msgs_select" ON crm_messages;
DROP POLICY IF EXISTS "crm_msgs_insert" ON crm_messages;
DROP POLICY IF EXISTS "crm_msgs_update" ON crm_messages;
CREATE POLICY "crm_msgs_select" ON crm_messages FOR SELECT USING (company_id = get_user_company_id());
CREATE POLICY "crm_msgs_insert" ON crm_messages FOR INSERT WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "crm_msgs_update" ON crm_messages FOR UPDATE USING (company_id = get_user_company_id());

-- ──────────────────────────────────────────────────────────────
-- 7. DROP funciones existentes (necesario para cambios de firma)
-- ──────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS crm_segment(INT,TEXT,INT,INT);
DROP FUNCTION IF EXISTS upsert_customer(JSONB);
DROP FUNCTION IF EXISTS get_customers(UUID,TEXT,INT,INT);
DROP FUNCTION IF EXISTS get_crm_summary(UUID);
DROP FUNCTION IF EXISTS get_customer_profile(UUID,UUID);
DROP FUNCTION IF EXISTS get_crm_intelligence(UUID);
DROP FUNCTION IF EXISTS add_customer_note(UUID,UUID,TEXT,TEXT,UUID);
DROP FUNCTION IF EXISTS launch_campaign(UUID,TEXT,TEXT,UUID,TEXT);
DROP FUNCTION IF EXISTS get_pending_messages(UUID,INT);
DROP FUNCTION IF EXISTS update_message_status(UUID,TEXT);

-- ──────────────────────────────────────────────────────────────
-- 9. HELPER: segment calculation
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION crm_segment(
  p_total_purchases INT,
  p_tier            TEXT,
  p_days_since      INT,
  p_created_days    INT
) RETURNS TEXT
LANGUAGE SQL IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_total_purchases = 0              THEN 'no_purchase'
    WHEN p_tier IN ('gold','platinum')      THEN 'vip'
    WHEN p_days_since > 90
     AND p_total_purchases >= 3             THEN 'at_risk'
    WHEN p_days_since > 60                  THEN 'dormant'
    WHEN p_created_days <= 30
     AND p_total_purchases <= 2             THEN 'new'
    WHEN p_days_since <= 30
     AND p_total_purchases >= 5             THEN 'frequent'
    ELSE                                         'regular'
  END
$$;

-- ──────────────────────────────────────────────────────────────
-- 8. FUNCIÓN: upsert_customer
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION upsert_customer(p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_company UUID;
  v_id      UUID;
BEGIN
  v_company := get_user_company_id();
  IF v_company IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'No autenticado');
  END IF;

  IF (p_data->>'id') IS NOT NULL THEN
    -- UPDATE
    UPDATE customers SET
      first_name          = COALESCE(NULLIF(p_data->>'first_name',''), first_name),
      last_name           = NULLIF(p_data->>'last_name', ''),
      rut                 = NULLIF(p_data->>'rut', ''),
      email               = NULLIF(p_data->>'email', ''),
      phone               = NULLIF(p_data->>'phone', ''),
      whatsapp            = NULLIF(p_data->>'whatsapp', ''),
      address             = NULLIF(p_data->>'address', ''),
      city                = COALESCE(NULLIF(p_data->>'city',''), city),
      acquisition_source  = COALESCE(NULLIF(p_data->>'acquisition_source',''), acquisition_source),
      tags                = COALESCE(
                              ARRAY(SELECT jsonb_array_elements_text(p_data->'tags')),
                              tags
                            )
    WHERE id = (p_data->>'id')::UUID AND company_id = v_company
    RETURNING id INTO v_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', FALSE, 'error', 'Cliente no encontrado');
    END IF;
  ELSE
    -- INSERT
    INSERT INTO customers (
      company_id, first_name, last_name, rut, email, phone, whatsapp,
      address, city, acquisition_source, tags, tier, points, is_active
    ) VALUES (
      v_company,
      p_data->>'first_name',
      NULLIF(p_data->>'last_name', ''),
      NULLIF(p_data->>'rut', ''),
      NULLIF(p_data->>'email', ''),
      NULLIF(p_data->>'phone', ''),
      NULLIF(p_data->>'whatsapp', ''),
      NULLIF(p_data->>'address', ''),
      COALESCE(NULLIF(p_data->>'city',''), 'Santiago'),
      COALESCE(NULLIF(p_data->>'acquisition_source',''), 'manual'),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_data->'tags')), '{}'),
      'standard', 0, TRUE
    )
    RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object('success', TRUE, 'id', v_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 9. FUNCIÓN: get_customers
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_customers(
  p_company_id UUID,
  p_search     TEXT    DEFAULT NULL,
  p_limit      INT     DEFAULT 200,
  p_offset     INT     DEFAULT 0
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

  WITH base AS (
    SELECT
      c.id,
      c.first_name,
      COALESCE(c.last_name, '') AS last_name,
      (c.first_name || ' ' || COALESCE(c.last_name, '')) AS full_name,
      c.rut, c.email, c.phone,
      COALESCE(c.whatsapp, c.phone) AS whatsapp,
      COALESCE(c.address, '') AS address,
      COALESCE(c.city, 'Santiago') AS city,
      COALESCE(c.tier, 'standard') AS tier,
      COALESCE(c.points, 0) AS points,
      COALESCE(c.tags, '{}') AS tags,
      COALESCE(c.acquisition_source, 'manual') AS acquisition_source,
      COALESCE(c.is_active, TRUE) AS is_active,
      c.created_at,
      -- Agregados de ventas
      COUNT(s.id)::INT                       AS total_purchases,
      COALESCE(SUM(s.total), 0)              AS total_spent,
      COALESCE(AVG(s.total), 0)              AS avg_ticket,
      MAX(s.created_at)                      AS last_purchase_at
    FROM customers c
    LEFT JOIN sales s ON s.customer_id = c.id
      AND s.company_id = p_company_id
      AND s.status = 'completed'
    WHERE c.company_id = p_company_id
      AND COALESCE(c.is_active, TRUE) = TRUE
      AND (
        p_search IS NULL
        OR c.first_name ILIKE '%' || p_search || '%'
        OR COALESCE(c.last_name,'') ILIKE '%' || p_search || '%'
        OR COALESCE(c.email,'')  ILIKE '%' || p_search || '%'
        OR COALESCE(c.phone,'')  ILIKE '%' || p_search || '%'
        OR COALESCE(c.rut,'')    ILIKE '%' || p_search || '%'
      )
    GROUP BY c.id
  ),
  enriched AS (
    SELECT
      b.*,
      EXTRACT(DAY FROM NOW() - b.last_purchase_at)::INT AS days_since_purchase,
      EXTRACT(DAY FROM NOW() - b.created_at)::INT       AS created_days,
      -- Customer score RFM (0-100)
      LEAST(100,
        -- Frecuencia (35 pts)
        CASE
          WHEN b.total_purchases >= 10 THEN 35
          WHEN b.total_purchases >= 5  THEN 25
          WHEN b.total_purchases >= 3  THEN 15
          WHEN b.total_purchases >= 1  THEN 8
          ELSE 0
        END
        +
        -- Recencia (35 pts)
        CASE
          WHEN b.last_purchase_at IS NULL THEN 0
          WHEN NOW() - b.last_purchase_at <= INTERVAL '7 days'   THEN 35
          WHEN NOW() - b.last_purchase_at <= INTERVAL '30 days'  THEN 28
          WHEN NOW() - b.last_purchase_at <= INTERVAL '60 days'  THEN 18
          WHEN NOW() - b.last_purchase_at <= INTERVAL '90 days'  THEN 10
          WHEN NOW() - b.last_purchase_at <= INTERVAL '180 days' THEN 4
          ELSE 0
        END
        +
        -- Valor (30 pts)
        CASE
          WHEN b.total_spent >= 1000000 THEN 30
          WHEN b.total_spent >= 500000  THEN 22
          WHEN b.total_spent >= 200000  THEN 15
          WHEN b.total_spent >= 50000   THEN 8
          WHEN b.total_spent >= 10000   THEN 3
          ELSE 0
        END
      )::INT AS customer_score
    FROM base b
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id',                  e.id,
        'first_name',          e.first_name,
        'last_name',           e.last_name,
        'full_name',           trim(e.full_name),
        'rut',                 e.rut,
        'email',               e.email,
        'phone',               e.phone,
        'whatsapp',            e.whatsapp,
        'address',             e.address,
        'city',                e.city,
        'tier',                e.tier,
        'points',              e.points,
        'tags',                e.tags,
        'acquisition_source',  e.acquisition_source,
        'is_active',           e.is_active,
        'created_at',          e.created_at,
        'total_purchases',     e.total_purchases,
        'total_spent',         ROUND(e.total_spent),
        'avg_ticket',          ROUND(e.avg_ticket),
        'last_purchase_at',    e.last_purchase_at,
        'days_since_purchase', e.days_since_purchase,
        'customer_score',      e.customer_score,
        'segment',             crm_segment(
                                 e.total_purchases, e.tier,
                                 COALESCE(e.days_since_purchase, 9999),
                                 COALESCE(e.created_days, 0)
                               )
      ) ORDER BY e.total_spent DESC NULLS LAST
    ),
    '[]'::JSONB
  )
  INTO v_result
  FROM (SELECT * FROM enriched LIMIT p_limit OFFSET p_offset) e;

  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 10. FUNCIÓN: get_crm_summary
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_crm_summary(p_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_total      INT := 0;
  v_new_30d    INT := 0;
  v_vip        INT := 0;
  v_at_risk    INT := 0;
  v_no_purchase INT := 0;
BEGIN
  IF get_user_company_id() IS DISTINCT FROM p_company_id THEN
    RETURN jsonb_build_object('error', 'No autorizado');
  END IF;

  SELECT COUNT(*) INTO v_total
  FROM customers WHERE company_id = p_company_id AND COALESCE(is_active, TRUE);

  SELECT COUNT(*) INTO v_new_30d
  FROM customers WHERE company_id = p_company_id AND created_at >= NOW() - INTERVAL '30 days';

  SELECT COUNT(*) INTO v_vip
  FROM customers WHERE company_id = p_company_id AND tier IN ('gold','platinum');

  -- at_risk: sin comprar > 90 días con al menos 3 compras
  SELECT COUNT(DISTINCT c.id) INTO v_at_risk
  FROM customers c
  WHERE c.company_id = p_company_id
    AND COALESCE(c.is_active, TRUE)
    AND (
      SELECT MAX(s.created_at) FROM sales s
      WHERE s.customer_id = c.id AND s.status = 'completed'
    ) < NOW() - INTERVAL '90 days'
    AND (
      SELECT COUNT(*) FROM sales s
      WHERE s.customer_id = c.id AND s.status = 'completed'
    ) >= 3;

  SELECT COUNT(DISTINCT c.id) INTO v_no_purchase
  FROM customers c
  WHERE c.company_id = p_company_id
    AND NOT EXISTS (
      SELECT 1 FROM sales s WHERE s.customer_id = c.id AND s.status = 'completed'
    );

  RETURN jsonb_build_object(
    'total',       v_total,
    'new_30d',     v_new_30d,
    'vip',         v_vip,
    'at_risk',     v_at_risk,
    'no_purchase', v_no_purchase
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 11. FUNCIÓN: get_customer_profile
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_customer_profile(
  p_company_id  UUID,
  p_customer_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_sales        JSONB;
  v_notes        JSONB;
  v_top_products JSONB;
  v_pay_methods  JSONB;
BEGIN
  IF get_user_company_id() IS DISTINCT FROM p_company_id THEN
    RETURN jsonb_build_object('error', 'No autorizado');
  END IF;

  -- Últimas 20 ventas con sus items
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',         s.id,
      'total',      s.total,
      'created_at', s.created_at,
      'items',      COALESCE(s.items, '[]'::JSONB)
    ) ORDER BY s.created_at DESC
  ), '[]'::JSONB)
  INTO v_sales
  FROM (
    SELECT id, total, created_at, items
    FROM sales
    WHERE customer_id = p_customer_id
      AND company_id  = p_company_id
      AND status      = 'completed'
    ORDER BY created_at DESC
    LIMIT 20
  ) s;

  -- Notas del cliente
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',          n.id,
      'note',        n.note,
      'note_type',   n.note_type,
      'created_at',  n.created_at,
      'created_by',  COALESCE(u.first_name || ' ' || COALESCE(u.last_name,''), 'Sistema')
    ) ORDER BY n.created_at DESC
  ), '[]'::JSONB)
  INTO v_notes
  FROM crm_customer_notes n
  LEFT JOIN users u ON u.id = n.created_by
  WHERE n.customer_id = p_customer_id AND n.company_id = p_company_id;

  -- Top productos comprados
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('name', r.name, 'qty', r.qty, 'total', r.total)
    ORDER BY r.total DESC
  ), '[]'::JSONB)
  INTO v_top_products
  FROM (
    SELECT
      item->>'name' AS name,
      SUM((item->>'quantity')::NUMERIC) AS qty,
      SUM((item->>'total')::NUMERIC)    AS total
    FROM sales s,
         jsonb_array_elements(COALESCE(s.items,'[]'::JSONB)) AS item
    WHERE s.customer_id = p_customer_id
      AND s.company_id  = p_company_id
      AND s.status      = 'completed'
    GROUP BY item->>'name'
    ORDER BY total DESC
    LIMIT 5
  ) r;

  -- Métodos de pago
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('method', r.pm, 'total', r.tot)
    ORDER BY r.tot DESC
  ), '[]'::JSONB)
  INTO v_pay_methods
  FROM (
    SELECT
      sp.payment_method AS pm,
      SUM(sp.amount)     AS tot
    FROM sales s
    JOIN sale_payments sp ON sp.sale_id = s.id
    WHERE s.customer_id = p_customer_id
      AND s.company_id  = p_company_id
      AND s.status      = 'completed'
    GROUP BY sp.payment_method
  ) r;

  RETURN jsonb_build_object(
    'sales',           v_sales,
    'notes',           v_notes,
    'top_products',    v_top_products,
    'payment_methods', v_pay_methods
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 12. FUNCIÓN: get_crm_intelligence
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_crm_intelligence(p_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_avg_score   NUMERIC := 0;
  v_high_churn  INT := 0;
  v_vip_ready   INT := 0;
  v_pending     INT := 0;
  v_at_risk_list  JSONB := '[]'::JSONB;
  v_vip_ready_list JSONB := '[]'::JSONB;
BEGIN
  IF get_user_company_id() IS DISTINCT FROM p_company_id THEN
    RETURN jsonb_build_object('error', 'No autorizado');
  END IF;

  -- Calcular scores básicos para inteligencia
  WITH scored AS (
    SELECT
      c.id,
      trim(c.first_name || ' ' || COALESCE(c.last_name,'')) AS full_name,
      COALESCE(c.phone, c.whatsapp) AS phone,
      COALESCE(c.tier, 'standard') AS tier,
      COUNT(s.id)::INT AS total_purchases,
      COALESCE(SUM(s.total), 0) AS total_spent,
      EXTRACT(DAY FROM NOW() - MAX(s.created_at))::INT AS days_since,
      EXTRACT(DAY FROM NOW() - c.created_at)::INT AS created_days,
      LEAST(100,
        CASE WHEN COUNT(s.id) >= 10 THEN 35 WHEN COUNT(s.id) >= 5 THEN 25 WHEN COUNT(s.id) >= 3 THEN 15 WHEN COUNT(s.id) >= 1 THEN 8 ELSE 0 END
        + CASE
            WHEN MAX(s.created_at) IS NULL THEN 0
            WHEN NOW() - MAX(s.created_at) <= INTERVAL '7 days'   THEN 35
            WHEN NOW() - MAX(s.created_at) <= INTERVAL '30 days'  THEN 28
            WHEN NOW() - MAX(s.created_at) <= INTERVAL '60 days'  THEN 18
            WHEN NOW() - MAX(s.created_at) <= INTERVAL '90 days'  THEN 10
            WHEN NOW() - MAX(s.created_at) <= INTERVAL '180 days' THEN 4
            ELSE 0
          END
        + CASE WHEN COALESCE(SUM(s.total),0) >= 1000000 THEN 30 WHEN COALESCE(SUM(s.total),0) >= 500000 THEN 22 WHEN COALESCE(SUM(s.total),0) >= 200000 THEN 15 WHEN COALESCE(SUM(s.total),0) >= 50000 THEN 8 WHEN COALESCE(SUM(s.total),0) >= 10000 THEN 3 ELSE 0 END
      )::INT AS customer_score
    FROM customers c
    LEFT JOIN sales s ON s.customer_id = c.id AND s.company_id = p_company_id AND s.status = 'completed'
    WHERE c.company_id = p_company_id AND COALESCE(c.is_active, TRUE)
    GROUP BY c.id
  )
  SELECT
    COALESCE(AVG(customer_score), 0),
    COUNT(*) FILTER (WHERE crm_segment(total_purchases, tier, COALESCE(days_since,9999), COALESCE(created_days,0)) = 'at_risk'),
    COUNT(*) FILTER (WHERE customer_score >= 60 AND tier NOT IN ('gold','platinum'))
  INTO v_avg_score, v_high_churn, v_vip_ready
  FROM scored;

  -- Pending messages
  SELECT COUNT(*) INTO v_pending
  FROM crm_messages WHERE company_id = p_company_id AND status = 'pending';

  -- At-risk list (top 10)
  WITH scored AS (
    SELECT c.id,
      trim(c.first_name || ' ' || COALESCE(c.last_name,'')) AS full_name,
      COALESCE(c.phone, c.whatsapp) AS phone,
      COUNT(s.id)::INT AS total_purchases,
      EXTRACT(DAY FROM NOW() - MAX(s.created_at))::INT AS days_since,
      -- churn_risk: 100 - score mais proporção de dias
      LEAST(100, 20 + LEAST(80, COALESCE(EXTRACT(DAY FROM NOW() - MAX(s.created_at)), 365) / 3.65))::INT AS churn_risk
    FROM customers c
    LEFT JOIN sales s ON s.customer_id = c.id AND s.company_id = p_company_id AND s.status = 'completed'
    WHERE c.company_id = p_company_id AND COALESCE(c.is_active, TRUE)
    GROUP BY c.id
    HAVING COUNT(s.id) >= 3 AND EXTRACT(DAY FROM NOW() - MAX(s.created_at)) > 90
    ORDER BY churn_risk DESC NULLS LAST
    LIMIT 10
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('id', id, 'full_name', full_name, 'phone', phone, 'days_since', days_since, 'churn_risk', churn_risk)
  ), '[]'::JSONB) INTO v_at_risk_list FROM scored;

  -- VIP-ready list (top 8)
  WITH scored AS (
    SELECT c.id,
      trim(c.first_name || ' ' || COALESCE(c.last_name,'')) AS full_name,
      COALESCE(c.phone, c.whatsapp) AS phone,
      COALESCE(SUM(s.total), 0) AS total_spent,
      LEAST(100,
        CASE WHEN COUNT(s.id) >= 10 THEN 35 WHEN COUNT(s.id) >= 5 THEN 25 WHEN COUNT(s.id) >= 3 THEN 15 WHEN COUNT(s.id) >= 1 THEN 8 ELSE 0 END
        + CASE WHEN NOW() - MAX(s.created_at) <= INTERVAL '30 days' THEN 28 WHEN NOW() - MAX(s.created_at) <= INTERVAL '60 days' THEN 18 ELSE 4 END
        + CASE WHEN COALESCE(SUM(s.total),0) >= 1000000 THEN 30 WHEN COALESCE(SUM(s.total),0) >= 500000 THEN 22 WHEN COALESCE(SUM(s.total),0) >= 200000 THEN 15 WHEN COALESCE(SUM(s.total),0) >= 50000 THEN 8 ELSE 3 END
      )::INT AS customer_score
    FROM customers c
    LEFT JOIN sales s ON s.customer_id = c.id AND s.company_id = p_company_id AND s.status = 'completed'
    WHERE c.company_id = p_company_id AND COALESCE(c.is_active, TRUE)
      AND COALESCE(c.tier,'standard') NOT IN ('gold','platinum')
    GROUP BY c.id
    HAVING LEAST(100,
        CASE WHEN COUNT(s.id) >= 10 THEN 35 WHEN COUNT(s.id) >= 5 THEN 25 WHEN COUNT(s.id) >= 3 THEN 15 WHEN COUNT(s.id) >= 1 THEN 8 ELSE 0 END
        + CASE WHEN NOW() - MAX(s.created_at) <= INTERVAL '30 days' THEN 28 WHEN NOW() - MAX(s.created_at) <= INTERVAL '60 days' THEN 18 ELSE 4 END
        + CASE WHEN COALESCE(SUM(s.total),0) >= 1000000 THEN 30 WHEN COALESCE(SUM(s.total),0) >= 500000 THEN 22 WHEN COALESCE(SUM(s.total),0) >= 200000 THEN 15 WHEN COALESCE(SUM(s.total),0) >= 50000 THEN 8 ELSE 3 END
      ) >= 60
    ORDER BY customer_score DESC
    LIMIT 8
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('id', id, 'full_name', full_name, 'phone', phone, 'total_spent', ROUND(total_spent), 'customer_score', customer_score)
  ), '[]'::JSONB) INTO v_vip_ready_list FROM scored;

  RETURN jsonb_build_object(
    'avg_score',      ROUND(v_avg_score),
    'high_churn',     v_high_churn,
    'vip_ready',      v_vip_ready,
    'pending_msgs',   v_pending,
    'at_risk_list',   v_at_risk_list,
    'vip_ready_list', v_vip_ready_list
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 13. FUNCIÓN: add_customer_note
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION add_customer_note(
  p_company_id  UUID,
  p_customer_id UUID,
  p_note        TEXT,
  p_note_type   TEXT,
  p_user_id     UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF get_user_company_id() IS DISTINCT FROM p_company_id THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'No autorizado');
  END IF;

  INSERT INTO crm_customer_notes (company_id, customer_id, note, note_type, created_by)
  VALUES (p_company_id, p_customer_id, p_note, COALESCE(NULLIF(p_note_type,''), 'general'), p_user_id);

  RETURN jsonb_build_object('success', TRUE);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 14. FUNCIÓN: launch_campaign
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION launch_campaign(
  p_company_id  UUID,
  p_name        TEXT,
  p_segment     TEXT,
  p_template_id UUID,
  p_channel     TEXT DEFAULT 'whatsapp'
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_campaign_id UUID;
  v_template    RECORD;
  v_queued      INT := 0;
  v_user_id     UUID;
  v_rec         RECORD;
  v_msg         TEXT;
BEGIN
  IF get_user_company_id() IS DISTINCT FROM p_company_id THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'No autorizado');
  END IF;

  -- Obtener plantilla
  SELECT id, content INTO v_template
  FROM crm_message_templates
  WHERE id = p_template_id AND (company_id IS NULL OR company_id = p_company_id) AND is_active;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Plantilla no encontrada');
  END IF;

  -- Usuario actual
  SELECT id INTO v_user_id FROM users WHERE auth_user_id = auth.uid() LIMIT 1;

  -- Crear campaña
  INSERT INTO crm_campaigns (company_id, name, segment, channel, template_id, status, target_count, created_by)
  VALUES (p_company_id, p_name, p_segment, p_channel, p_template_id, 'running', 0, v_user_id)
  RETURNING id INTO v_campaign_id;

  -- Encolar mensajes por segmento
  FOR v_rec IN
    WITH customer_stats AS (
      SELECT
        c.id, c.first_name, c.last_name,
        COALESCE(c.whatsapp, c.phone) AS phone,
        COALESCE(c.tier, 'standard') AS tier,
        COUNT(s.id)::INT AS total_purchases,
        COALESCE(SUM(s.total), 0) AS total_spent,
        EXTRACT(DAY FROM NOW() - MAX(s.created_at))::INT AS days_since,
        EXTRACT(DAY FROM NOW() - c.created_at)::INT AS created_days
      FROM customers c
      LEFT JOIN sales s ON s.customer_id = c.id AND s.company_id = p_company_id AND s.status = 'completed'
      WHERE c.company_id = p_company_id
        AND COALESCE(c.is_active, TRUE)
        AND (COALESCE(c.whatsapp,'') != '' OR COALESCE(c.phone,'') != '')
      GROUP BY c.id
    )
    SELECT cs.*,
      crm_segment(cs.total_purchases, cs.tier, COALESCE(cs.days_since,9999), COALESCE(cs.created_days,0)) AS seg
    FROM customer_stats cs
    WHERE
      p_segment = 'all'
      OR crm_segment(cs.total_purchases, cs.tier, COALESCE(cs.days_since,9999), COALESCE(cs.created_days,0)) = p_segment
  LOOP
    -- Personalizar mensaje
    v_msg := v_template.content;
    v_msg := replace(v_msg, '{first_name}', COALESCE(v_rec.first_name, ''));
    v_msg := replace(v_msg, '{name}', trim(COALESCE(v_rec.first_name,'') || ' ' || COALESCE(v_rec.last_name,'')));

    INSERT INTO crm_messages (company_id, campaign_id, customer_id, first_name, last_name, to_phone, message, status)
    VALUES (p_company_id, v_campaign_id, v_rec.id, v_rec.first_name, v_rec.last_name, v_rec.phone, v_msg, 'pending');

    v_queued := v_queued + 1;
  END LOOP;

  -- Actualizar target_count en campaña
  UPDATE crm_campaigns SET target_count = v_queued WHERE id = v_campaign_id;

  RETURN jsonb_build_object('success', TRUE, 'campaign_id', v_campaign_id, 'queued', v_queued);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 15. FUNCIÓN: get_pending_messages
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_pending_messages(
  p_company_id UUID,
  p_limit      INT DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_result JSONB;
BEGIN
  IF get_user_company_id() IS DISTINCT FROM p_company_id THEN RETURN '[]'::JSONB; END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',         m.id,
      'campaign_id', m.campaign_id,
      'customer_id', m.customer_id,
      'first_name', m.first_name,
      'last_name',  m.last_name,
      'to_phone',   m.to_phone,
      'message',    m.message,
      'status',     m.status,
      'created_at', m.created_at
    ) ORDER BY m.created_at
  ), '[]'::JSONB)
  INTO v_result
  FROM (
    SELECT * FROM crm_messages
    WHERE company_id = p_company_id AND status = 'pending'
    ORDER BY created_at
    LIMIT p_limit
  ) m;

  RETURN v_result;
EXCEPTION WHEN OTHERS THEN RETURN '[]'::JSONB;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 16. FUNCIÓN: update_message_status
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_message_status(
  p_message_id UUID,
  p_status     TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_company UUID;
  v_campaign_id UUID;
BEGIN
  v_company := get_user_company_id();
  IF v_company IS NULL THEN RETURN jsonb_build_object('success', FALSE, 'error', 'No autenticado'); END IF;

  UPDATE crm_messages
  SET status = p_status,
      sent_at = CASE WHEN p_status = 'sent' THEN NOW() ELSE sent_at END
  WHERE id = p_message_id AND company_id = v_company
  RETURNING campaign_id INTO v_campaign_id;

  IF NOT FOUND THEN RETURN jsonb_build_object('success', FALSE, 'error', 'Mensaje no encontrado'); END IF;

  -- Actualizar sent_count en la campaña
  UPDATE crm_campaigns
  SET sent_count = (
    SELECT COUNT(*) FROM crm_messages
    WHERE campaign_id = v_campaign_id AND status = 'sent'
  ),
  status = CASE
    WHEN (
      SELECT COUNT(*) FROM crm_messages WHERE campaign_id = v_campaign_id AND status = 'pending'
    ) = 0 THEN 'completed'
    ELSE status
  END,
  completed_at = CASE
    WHEN (
      SELECT COUNT(*) FROM crm_messages WHERE campaign_id = v_campaign_id AND status = 'pending'
    ) = 0 THEN NOW()
    ELSE completed_at
  END
  WHERE id = v_campaign_id;

  RETURN jsonb_build_object('success', TRUE);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 17. DATOS INICIALES: plantillas de mensaje globales
-- ──────────────────────────────────────────────────────────────

INSERT INTO crm_message_templates (company_id, name, content, variables, channel, is_active)
VALUES
  (NULL, 'Bienvenida nuevo cliente',
   'Hola {first_name}! 👋 Te damos la bienvenida. Gracias por elegirnos. Cualquier consulta, escríbenos aquí.',
   '["first_name"]'::JSONB, 'whatsapp', TRUE),

  (NULL, 'Reactivación cliente dormido',
   'Hola {first_name}! 😊 Te extrañamos. Tenemos novedades y ofertas especiales esperándote. ¡Te esperamos!',
   '["first_name"]'::JSONB, 'whatsapp', TRUE),

  (NULL, 'Oferta cliente VIP',
   'Hola {first_name} ⭐ Como cliente especial, tienes acceso anticipado a nuestra nueva colección. ¡Aprovecha!',
   '["first_name"]'::JSONB, 'whatsapp', TRUE),

  (NULL, 'Segunda compra',
   'Hola {first_name}! 🎯 Por tu primera compra, tienes un descuento especial en tu próxima visita. ¡No te lo pierdas!',
   '["first_name"]'::JSONB, 'whatsapp', TRUE),

  (NULL, 'Recordatorio de visita',
   'Hola {first_name}! 🛒 Han pasado algunos días desde tu última visita. ¿Qué te pareció tu experiencia? Nos encantaría verte de nuevo.',
   '["first_name"]'::JSONB, 'whatsapp', TRUE)
ON CONFLICT DO NOTHING;
