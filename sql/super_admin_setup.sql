-- ============================================================
-- MOSAICO PRO — Super Admin Setup
-- Ejecutar completo en el SQL Editor de Supabase
-- Agrega soporte para el dueño de la plataforma (Cristóbal)
-- quien puede acceder a TODAS las empresas clientes
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. COLUMNA is_super_admin en users
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- ──────────────────────────────────────────────────────────────
-- 2. FUNCIÓN HELPER
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(
    (SELECT is_super_admin FROM public.users WHERE auth_user_id = auth.uid()),
    FALSE
  )
$$;

-- ──────────────────────────────────────────────────────────────
-- 3. MARCAR A CRISTÓBAL COMO SUPER ADMIN
-- ──────────────────────────────────────────────────────────────
UPDATE public.users
SET is_super_admin = TRUE
FROM auth.users au
WHERE public.users.auth_user_id = au.id
  AND au.email = 'cristobal.sl511@gmail.com';

-- ──────────────────────────────────────────────────────────────
-- 4. ACTUALIZAR RLS — companies
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "companies_select" ON public.companies;
DROP POLICY IF EXISTS "companies_update" ON public.companies;
DROP POLICY IF EXISTS "companies_insert" ON public.companies;
CREATE POLICY "companies_select" ON public.companies FOR SELECT
  USING (id = get_user_company_id() OR is_super_admin());
CREATE POLICY "companies_update" ON public.companies FOR UPDATE
  USING (id = get_user_company_id() AND get_user_role() IN ('admin','owner') OR is_super_admin());
CREATE POLICY "companies_insert" ON public.companies FOR INSERT
  WITH CHECK (is_super_admin());

-- ──────────────────────────────────────────────────────────────
-- 5. ACTUALIZAR RLS — users
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "users_select" ON public.users;
DROP POLICY IF EXISTS "users_update" ON public.users;
DROP POLICY IF EXISTS "users_insert" ON public.users;
CREATE POLICY "users_select" ON public.users FOR SELECT
  USING (auth_user_id = auth.uid() OR company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "users_update" ON public.users FOR UPDATE
  USING (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "users_insert" ON public.users FOR INSERT
  WITH CHECK (company_id = get_user_company_id() OR is_super_admin());

-- ──────────────────────────────────────────────────────────────
-- 6. ACTUALIZAR RLS — sales
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "sales_select" ON public.sales;
DROP POLICY IF EXISTS "sales_insert" ON public.sales;
DROP POLICY IF EXISTS "sales_update" ON public.sales;
CREATE POLICY "sales_select" ON public.sales FOR SELECT
  USING (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "sales_insert" ON public.sales FOR INSERT
  WITH CHECK (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "sales_update" ON public.sales FOR UPDATE
  USING (company_id = get_user_company_id() OR is_super_admin());

-- ──────────────────────────────────────────────────────────────
-- 7. ACTUALIZAR RLS — products
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "products_select" ON public.products;
DROP POLICY IF EXISTS "products_insert" ON public.products;
DROP POLICY IF EXISTS "products_update" ON public.products;
DROP POLICY IF EXISTS "products_delete" ON public.products;
CREATE POLICY "products_select" ON public.products FOR SELECT USING (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "products_insert" ON public.products FOR INSERT WITH CHECK (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "products_update" ON public.products FOR UPDATE USING (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "products_delete" ON public.products FOR DELETE USING (company_id = get_user_company_id() OR is_super_admin());

-- ──────────────────────────────────────────────────────────────
-- 8. ACTUALIZAR RLS — customers
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "customers_select" ON public.customers;
DROP POLICY IF EXISTS "customers_insert" ON public.customers;
DROP POLICY IF EXISTS "customers_update" ON public.customers;
CREATE POLICY "customers_select" ON public.customers FOR SELECT USING (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "customers_insert" ON public.customers FOR INSERT WITH CHECK (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "customers_update" ON public.customers FOR UPDATE USING (company_id = get_user_company_id() OR is_super_admin());

-- ──────────────────────────────────────────────────────────────
-- 9. ACTUALIZAR RLS — cash_sessions
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "cash_sessions_select" ON public.cash_sessions;
DROP POLICY IF EXISTS "cash_sessions_insert" ON public.cash_sessions;
DROP POLICY IF EXISTS "cash_sessions_update" ON public.cash_sessions;
CREATE POLICY "cash_sessions_select" ON public.cash_sessions FOR SELECT USING (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "cash_sessions_insert" ON public.cash_sessions FOR INSERT WITH CHECK (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "cash_sessions_update" ON public.cash_sessions FOR UPDATE USING (company_id = get_user_company_id() OR is_super_admin());

-- ──────────────────────────────────────────────────────────────
-- 10. ACTUALIZAR RLS — sale_payments
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "sale_payments_select" ON public.sale_payments;
DROP POLICY IF EXISTS "sale_payments_insert" ON public.sale_payments;
CREATE POLICY "sale_payments_select" ON public.sale_payments FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.sales WHERE sales.id = sale_payments.sale_id AND (sales.company_id = get_user_company_id() OR is_super_admin())));
CREATE POLICY "sale_payments_insert" ON public.sale_payments FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.sales WHERE sales.id = sale_payments.sale_id AND (sales.company_id = get_user_company_id() OR is_super_admin())));

-- ──────────────────────────────────────────────────────────────
-- 11. ACTUALIZAR RLS — categories, warehouses, inventory, product_movements, cash_arqueos
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "categories_select" ON public.categories;
DROP POLICY IF EXISTS "categories_insert" ON public.categories;
DROP POLICY IF EXISTS "categories_update" ON public.categories;
DROP POLICY IF EXISTS "categories_delete" ON public.categories;
CREATE POLICY "categories_select" ON public.categories FOR SELECT USING (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "categories_insert" ON public.categories FOR INSERT WITH CHECK (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "categories_update" ON public.categories FOR UPDATE USING (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "categories_delete" ON public.categories FOR DELETE USING (company_id = get_user_company_id() OR is_super_admin());

DROP POLICY IF EXISTS "warehouses_select" ON public.warehouses;
DROP POLICY IF EXISTS "warehouses_insert" ON public.warehouses;
DROP POLICY IF EXISTS "warehouses_update" ON public.warehouses;
CREATE POLICY "warehouses_select" ON public.warehouses FOR SELECT USING (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "warehouses_insert" ON public.warehouses FOR INSERT WITH CHECK (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "warehouses_update" ON public.warehouses FOR UPDATE USING (company_id = get_user_company_id() OR is_super_admin());

DROP POLICY IF EXISTS "inventory_select" ON public.inventory;
DROP POLICY IF EXISTS "inventory_insert" ON public.inventory;
DROP POLICY IF EXISTS "inventory_update" ON public.inventory;
CREATE POLICY "inventory_select" ON public.inventory FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.warehouses w WHERE w.id = inventory.warehouse_id AND (w.company_id = get_user_company_id() OR is_super_admin())));
CREATE POLICY "inventory_insert" ON public.inventory FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.warehouses w WHERE w.id = inventory.warehouse_id AND (w.company_id = get_user_company_id() OR is_super_admin())));
CREATE POLICY "inventory_update" ON public.inventory FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.warehouses w WHERE w.id = inventory.warehouse_id AND (w.company_id = get_user_company_id() OR is_super_admin())));

DROP POLICY IF EXISTS "movements_select" ON public.product_movements;
DROP POLICY IF EXISTS "movements_insert" ON public.product_movements;
CREATE POLICY "movements_select" ON public.product_movements FOR SELECT USING (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "movements_insert" ON public.product_movements FOR INSERT WITH CHECK (company_id = get_user_company_id() OR is_super_admin());

DROP POLICY IF EXISTS "arqueos_select" ON public.cash_arqueos;
DROP POLICY IF EXISTS "arqueos_insert" ON public.cash_arqueos;
CREATE POLICY "arqueos_select" ON public.cash_arqueos FOR SELECT USING (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "arqueos_insert" ON public.cash_arqueos FOR INSERT WITH CHECK (company_id = get_user_company_id() OR is_super_admin());

-- ──────────────────────────────────────────────────────────────
-- 12. ACTUALIZAR RLS — suppliers, purchase_orders, purchase_order_items
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "suppliers_select" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_insert" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_update" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_delete" ON public.suppliers;
CREATE POLICY "suppliers_select" ON public.suppliers FOR SELECT USING (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "suppliers_insert" ON public.suppliers FOR INSERT WITH CHECK (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "suppliers_update" ON public.suppliers FOR UPDATE USING (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "suppliers_delete" ON public.suppliers FOR DELETE USING (company_id = get_user_company_id() OR is_super_admin());

DROP POLICY IF EXISTS "po_select" ON public.purchase_orders;
DROP POLICY IF EXISTS "po_insert" ON public.purchase_orders;
DROP POLICY IF EXISTS "po_update" ON public.purchase_orders;
CREATE POLICY "po_select" ON public.purchase_orders FOR SELECT USING (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "po_insert" ON public.purchase_orders FOR INSERT WITH CHECK (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "po_update" ON public.purchase_orders FOR UPDATE USING (company_id = get_user_company_id() OR is_super_admin());

DROP POLICY IF EXISTS "poi_select" ON public.purchase_order_items;
DROP POLICY IF EXISTS "poi_insert" ON public.purchase_order_items;
CREATE POLICY "poi_select" ON public.purchase_order_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = purchase_order_items.order_id AND (po.company_id = get_user_company_id() OR is_super_admin())));
CREATE POLICY "poi_insert" ON public.purchase_order_items FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = purchase_order_items.order_id AND (po.company_id = get_user_company_id() OR is_super_admin())));

-- ──────────────────────────────────────────────────────────────
-- 13. ACTUALIZAR RLS — remuneraciones
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "ppar_select" ON public.payroll_params;
DROP POLICY IF EXISTS "ppar_insert" ON public.payroll_params;
DROP POLICY IF EXISTS "ppar_update" ON public.payroll_params;
CREATE POLICY "ppar_select" ON public.payroll_params FOR SELECT USING (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "ppar_insert" ON public.payroll_params FOR INSERT WITH CHECK (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "ppar_update" ON public.payroll_params FOR UPDATE USING (company_id = get_user_company_id() OR is_super_admin());

DROP POLICY IF EXISTS "pper_select" ON public.payroll_periods;
DROP POLICY IF EXISTS "pper_insert" ON public.payroll_periods;
DROP POLICY IF EXISTS "pper_update" ON public.payroll_periods;
CREATE POLICY "pper_select" ON public.payroll_periods FOR SELECT USING (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "pper_insert" ON public.payroll_periods FOR INSERT WITH CHECK (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "pper_update" ON public.payroll_periods FOR UPDATE USING (company_id = get_user_company_id() OR is_super_admin());

DROP POLICY IF EXISTS "pdoc_select" ON public.payroll_documents;
DROP POLICY IF EXISTS "pdoc_insert" ON public.payroll_documents;
DROP POLICY IF EXISTS "pdoc_update" ON public.payroll_documents;
CREATE POLICY "pdoc_select" ON public.payroll_documents FOR SELECT USING (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "pdoc_insert" ON public.payroll_documents FOR INSERT WITH CHECK (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "pdoc_update" ON public.payroll_documents FOR UPDATE USING (company_id = get_user_company_id() OR is_super_admin());

DROP POLICY IF EXISTS "sev_select" ON public.severance_documents;
DROP POLICY IF EXISTS "sev_insert" ON public.severance_documents;
DROP POLICY IF EXISTS "sev_update" ON public.severance_documents;
CREATE POLICY "sev_select" ON public.severance_documents FOR SELECT USING (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "sev_insert" ON public.severance_documents FOR INSERT WITH CHECK (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "sev_update" ON public.severance_documents FOR UPDATE USING (company_id = get_user_company_id() OR is_super_admin());

-- ──────────────────────────────────────────────────────────────
-- 14. ACTUALIZAR RLS — employees, contracts, attendance
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "employees_select" ON public.employees;
DROP POLICY IF EXISTS "employees_insert" ON public.employees;
DROP POLICY IF EXISTS "employees_update" ON public.employees;
DROP POLICY IF EXISTS "employees_delete" ON public.employees;
CREATE POLICY "employees_select" ON public.employees FOR SELECT USING (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "employees_insert" ON public.employees FOR INSERT WITH CHECK (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "employees_update" ON public.employees FOR UPDATE USING (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "employees_delete" ON public.employees FOR DELETE USING (company_id = get_user_company_id() OR is_super_admin());

DROP POLICY IF EXISTS "contracts_select" ON public.contracts;
DROP POLICY IF EXISTS "contracts_insert" ON public.contracts;
DROP POLICY IF EXISTS "contracts_update" ON public.contracts;
CREATE POLICY "contracts_select" ON public.contracts FOR SELECT USING (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "contracts_insert" ON public.contracts FOR INSERT WITH CHECK (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "contracts_update" ON public.contracts FOR UPDATE USING (company_id = get_user_company_id() OR is_super_admin());

DROP POLICY IF EXISTS "attendance_select" ON public.attendance;
DROP POLICY IF EXISTS "attendance_insert" ON public.attendance;
DROP POLICY IF EXISTS "attendance_update" ON public.attendance;
CREATE POLICY "attendance_select" ON public.attendance FOR SELECT USING (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "attendance_insert" ON public.attendance FOR INSERT WITH CHECK (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "attendance_update" ON public.attendance FOR UPDATE USING (company_id = get_user_company_id() OR is_super_admin());

-- ──────────────────────────────────────────────────────────────
-- 15. ACTUALIZAR RLS — contract_documents, annexes, templates, history
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "cd_select" ON public.contract_documents;
DROP POLICY IF EXISTS "cd_insert" ON public.contract_documents;
DROP POLICY IF EXISTS "cd_update" ON public.contract_documents;
CREATE POLICY "cd_select" ON public.contract_documents FOR SELECT USING (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "cd_insert" ON public.contract_documents FOR INSERT WITH CHECK (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "cd_update" ON public.contract_documents FOR UPDATE USING (company_id = get_user_company_id() OR is_super_admin());

DROP POLICY IF EXISTS "ca_select" ON public.contract_annexes;
DROP POLICY IF EXISTS "ca_insert" ON public.contract_annexes;
DROP POLICY IF EXISTS "ca_update" ON public.contract_annexes;
CREATE POLICY "ca_select" ON public.contract_annexes FOR SELECT USING (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "ca_insert" ON public.contract_annexes FOR INSERT WITH CHECK (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "ca_update" ON public.contract_annexes FOR UPDATE USING (company_id = get_user_company_id() OR is_super_admin());

DROP POLICY IF EXISTS "ct_select" ON public.contract_templates;
DROP POLICY IF EXISTS "ct_insert" ON public.contract_templates;
DROP POLICY IF EXISTS "ct_update" ON public.contract_templates;
CREATE POLICY "ct_select" ON public.contract_templates FOR SELECT USING (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "ct_insert" ON public.contract_templates FOR INSERT WITH CHECK (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "ct_update" ON public.contract_templates FOR UPDATE USING (company_id = get_user_company_id() OR is_super_admin());

DROP POLICY IF EXISTS "cdh_select" ON public.contract_document_history;
DROP POLICY IF EXISTS "cdh_insert" ON public.contract_document_history;
CREATE POLICY "cdh_select" ON public.contract_document_history FOR SELECT USING (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "cdh_insert" ON public.contract_document_history FOR INSERT WITH CHECK (company_id = get_user_company_id() OR is_super_admin());

-- ──────────────────────────────────────────────────────────────
-- 16. ACTUALIZAR RLS — CRM
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "crm_notes_select" ON public.crm_customer_notes;
DROP POLICY IF EXISTS "crm_notes_insert" ON public.crm_customer_notes;
DROP POLICY IF EXISTS "crm_notes_delete" ON public.crm_customer_notes;
CREATE POLICY "crm_notes_select" ON public.crm_customer_notes FOR SELECT USING (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "crm_notes_insert" ON public.crm_customer_notes FOR INSERT WITH CHECK (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "crm_notes_delete" ON public.crm_customer_notes FOR DELETE USING (company_id = get_user_company_id() OR is_super_admin());

DROP POLICY IF EXISTS "crm_tpl_select" ON public.crm_message_templates;
DROP POLICY IF EXISTS "crm_tpl_insert" ON public.crm_message_templates;
CREATE POLICY "crm_tpl_select" ON public.crm_message_templates FOR SELECT USING (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "crm_tpl_insert" ON public.crm_message_templates FOR INSERT WITH CHECK (company_id = get_user_company_id() OR is_super_admin());

DROP POLICY IF EXISTS "crm_camp_select" ON public.crm_campaigns;
DROP POLICY IF EXISTS "crm_camp_insert" ON public.crm_campaigns;
DROP POLICY IF EXISTS "crm_camp_update" ON public.crm_campaigns;
CREATE POLICY "crm_camp_select" ON public.crm_campaigns FOR SELECT USING (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "crm_camp_insert" ON public.crm_campaigns FOR INSERT WITH CHECK (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "crm_camp_update" ON public.crm_campaigns FOR UPDATE USING (company_id = get_user_company_id() OR is_super_admin());

DROP POLICY IF EXISTS "crm_msgs_select" ON public.crm_messages;
DROP POLICY IF EXISTS "crm_msgs_insert" ON public.crm_messages;
DROP POLICY IF EXISTS "crm_msgs_update" ON public.crm_messages;
CREATE POLICY "crm_msgs_select" ON public.crm_messages FOR SELECT USING (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "crm_msgs_insert" ON public.crm_messages FOR INSERT WITH CHECK (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "crm_msgs_update" ON public.crm_messages FOR UPDATE USING (company_id = get_user_company_id() OR is_super_admin());

-- ──────────────────────────────────────────────────────────────
-- 17. ACTUALIZAR RLS — expenses (finanzas)
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "expenses_select" ON public.expenses;
DROP POLICY IF EXISTS "expenses_insert" ON public.expenses;
DROP POLICY IF EXISTS "expenses_update" ON public.expenses;
DROP POLICY IF EXISTS "expenses_delete" ON public.expenses;
CREATE POLICY "expenses_select" ON public.expenses FOR SELECT USING (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "expenses_insert" ON public.expenses FOR INSERT WITH CHECK (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "expenses_update" ON public.expenses FOR UPDATE USING (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "expenses_delete" ON public.expenses FOR DELETE USING (company_id = get_user_company_id() OR is_super_admin());

-- ──────────────────────────────────────────────────────────────
-- 18. ACTUALIZAR RLS — content_pillars, content_packs, content_calendar
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "cpillars_select" ON public.content_pillars;
DROP POLICY IF EXISTS "cpillars_insert" ON public.content_pillars;
DROP POLICY IF EXISTS "cpillars_update" ON public.content_pillars;
DROP POLICY IF EXISTS "cpillars_delete" ON public.content_pillars;
CREATE POLICY "cpillars_select" ON public.content_pillars FOR SELECT USING (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "cpillars_insert" ON public.content_pillars FOR INSERT WITH CHECK (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "cpillars_update" ON public.content_pillars FOR UPDATE USING (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "cpillars_delete" ON public.content_pillars FOR DELETE USING (company_id = get_user_company_id() OR is_super_admin());

DROP POLICY IF EXISTS "cpacks_select" ON public.content_packs;
DROP POLICY IF EXISTS "cpacks_insert" ON public.content_packs;
DROP POLICY IF EXISTS "cpacks_update" ON public.content_packs;
DROP POLICY IF EXISTS "cpacks_delete" ON public.content_packs;
CREATE POLICY "cpacks_select" ON public.content_packs FOR SELECT USING (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "cpacks_insert" ON public.content_packs FOR INSERT WITH CHECK (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "cpacks_update" ON public.content_packs FOR UPDATE USING (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "cpacks_delete" ON public.content_packs FOR DELETE USING (company_id = get_user_company_id() OR is_super_admin());

DROP POLICY IF EXISTS "ccal_select" ON public.content_calendar;
DROP POLICY IF EXISTS "ccal_insert" ON public.content_calendar;
DROP POLICY IF EXISTS "ccal_update" ON public.content_calendar;
DROP POLICY IF EXISTS "ccal_delete" ON public.content_calendar;
CREATE POLICY "ccal_select" ON public.content_calendar FOR SELECT USING (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "ccal_insert" ON public.content_calendar FOR INSERT WITH CHECK (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "ccal_update" ON public.content_calendar FOR UPDATE USING (company_id = get_user_company_id() OR is_super_admin());
CREATE POLICY "ccal_delete" ON public.content_calendar FOR DELETE USING (company_id = get_user_company_id() OR is_super_admin());

-- ──────────────────────────────────────────────────────────────
-- LISTO — Cristóbal ya es super admin y puede ver todas las empresas
-- ──────────────────────────────────────────────────────────────
