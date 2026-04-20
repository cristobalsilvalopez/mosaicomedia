'use client'

import { useRouter } from 'next/navigation'

// ─── Datos ────────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: '💳', title: 'POS inteligente',
    desc: 'Cobra en segundos con lector de código de barras, múltiples métodos de pago y emisión de boleta o factura.',
  },
  {
    icon: '📦', title: 'Inventario en tiempo real',
    desc: 'Control de stock, alertas de quiebre, costos y márgenes. La IA lee tus facturas y carga los productos automáticamente.',
  },
  {
    icon: '📊', title: 'Reportes y tributario',
    desc: 'Dashboard con ventas, IVA, ILA y desglose por método de pago. Exporta tu libro de ventas al contador en un clic.',
  },
  {
    icon: '👥', title: 'CRM de clientes',
    desc: 'Segmentación automática VIP/frecuente/dormido, historial de compras y seguimiento para fidelizar a tus mejores clientes.',
  },
  {
    icon: '🏢', title: 'Gestión de proveedores',
    desc: 'Crea órdenes de compra, recibe mercadería y actualiza el inventario automáticamente. Sin Excel, sin hojas de papel.',
  },
  {
    icon: '🧑‍💼', title: 'RRHH y contratos',
    desc: 'Ficha de empleados, contratos indefinidos y a plazo fijo. Alertas automáticas de vencimiento antes de que se te pase.',
  },
]

const PLANS = [
  {
    name: 'Starter',
    price: '49.990',
    period: 'al mes',
    trial: '14 días gratis',
    color: '#5DE0E6',
    features: [
      'Hasta 2 usuarios',
      'POS completo con IVA / ILA',
      'Caja y arqueos de turno',
      'Inventario hasta 500 productos',
      'Historial de ventas (90 días)',
      'CRM básico',
      'Soporte por WhatsApp',
    ],
    cta: 'Empezar 14 días gratis',
    highlight: false,
  },
  {
    name: 'Pro',
    price: '99.990',
    period: 'al mes',
    trial: '1 mes gratis',
    color: '#004AAD',
    features: [
      'Hasta 8 usuarios con roles',
      'Todo lo de Starter',
      'Inventario ilimitado',
      'Reportes históricos + exportación CSV',
      'CRM completo con segmentación RFM',
      'Proveedores y órdenes de compra',
      'RRHH, contratos y remuneraciones',
      'IA para leer facturas automáticamente',
      'Módulo de Marketing + Tablero de ideas',
      'Soporte prioritario 24 hrs',
    ],
    cta: 'Empezar 1 mes gratis',
    highlight: true,
  },
  {
    name: 'Business',
    price: '179.990',
    period: 'al mes',
    trial: '1 mes gratis',
    color: '#C19E4D',
    features: [
      'Usuarios ilimitados',
      'Multi-sucursal',
      'Todo lo de Pro',
      'IA avanzada con asistente integrado',
      'Campañas WhatsApp automatizadas',
      'API + webhooks de integración',
      'Onboarding y configuración personalizada',
      'Reportes PDF personalizados',
      'Soporte dedicado con ejecutivo',
    ],
    cta: 'Contactar a ventas',
    highlight: false,
  },
]

const TESTIMONIALS = [
  {
    name: 'Pamela Rojas',
    role: 'Dueña, Botillería El Rincón',
    city: 'Santiago',
    text: 'Antes llevaba el inventario en un cuaderno. Ahora sé exactamente cuánto tengo en stock y cuánto gané esta semana. Me cambió la vida.',
    avatar: 'PR',
  },
  {
    name: 'Gonzalo Muñoz',
    role: 'Administrador, Almacén Don Golo',
    city: 'Valparaíso',
    text: 'El módulo de RRHH me salvó de una multa. Me avisó que el contrato de mi vendedora vencía en 15 días y lo pude renovar a tiempo.',
    avatar: 'GM',
  },
  {
    name: 'Carolina Espinoza',
    role: 'Contadora, 12 clientes Pyme',
    city: 'Concepción',
    text: 'Mis clientes que usan Mosaico Pro me mandan el reporte de IVA en un archivo. Ya no tengo que ir a revisar sus libretas.',
    avatar: 'CE',
  },
]

// ─── Componente ───────────────────────────────────────────────────────────────

export default function LandingPage() {
  const router = useRouter()

  return (
    <div style={{ minHeight: '100vh', background: '#0A1628', fontFamily: 'Montserrat, sans-serif', color: '#F0F4FF', overflowX: 'hidden' }}>

      {/* ── NAVBAR ── */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(10,22,40,.92)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(93,224,230,.1)', padding: '0 40px', height: 60, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,#004AAD,#5DE0E6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#fff' }}>MP</div>
          <span style={{ fontWeight: 800, fontSize: 15 }}>Mosaico Pro</span>
        </div>
        <div style={{ flex: 1 }} />
        <a href="#features" style={{ fontSize: 12, color: '#8899BB', textDecoration: 'none', fontWeight: 600 }}>Funcionalidades</a>
        <a href="#pricing"  style={{ fontSize: 12, color: '#8899BB', textDecoration: 'none', fontWeight: 600 }}>Precios</a>
        <button onClick={() => router.push('/login')}
          style={{ border: '1px solid rgba(93,224,230,.25)', background: 'transparent', borderRadius: 8, padding: '7px 16px', fontSize: 12, color: '#5DE0E6', cursor: 'pointer', fontFamily: 'Montserrat,sans-serif', fontWeight: 700 }}>
          Iniciar sesión
        </button>
        <button onClick={() => router.push('/onboarding')}
          style={{ border: 'none', background: 'linear-gradient(90deg,#004AAD,#5DE0E6)', borderRadius: 8, padding: '7px 18px', fontSize: 12, color: '#fff', cursor: 'pointer', fontFamily: 'Montserrat,sans-serif', fontWeight: 700 }}>
          Prueba 14 días gratis →
        </button>
      </nav>

      {/* ── HERO ── */}
      <section style={{ padding: '90px 40px 80px', maxWidth: 900, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(93,224,230,.08)', border: '1px solid rgba(93,224,230,.2)', borderRadius: 20, padding: '5px 14px', fontSize: 11, color: '#5DE0E6', fontWeight: 700, marginBottom: 28, textTransform: 'uppercase' as const, letterSpacing: '.06em' }}>
          ✨ Sistema de gestión inteligente para negocios chilenos
        </div>

        <h1 style={{ fontSize: 52, fontWeight: 800, lineHeight: 1.15, margin: '0 0 22px', color: '#F0F4FF' }}>
          Administra tu negocio<br />
          <span style={{ background: 'linear-gradient(90deg,#004AAD,#5DE0E6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            sin complicaciones
          </span>
        </h1>

        <p style={{ fontSize: 18, color: '#8899BB', lineHeight: 1.7, maxWidth: 580, margin: '0 auto 40px' }}>
          POS, inventario, RRHH, proveedores y reportes tributarios en un solo sistema.
          Diseñado para botillerías, almacenes y negocios de retail en Chile.
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' as const }}>
          <button onClick={() => router.push('/onboarding')}
            style={{ border: 'none', background: 'linear-gradient(90deg,#004AAD,#5DE0E6)', borderRadius: 10, padding: '14px 32px', fontSize: 14, color: '#fff', cursor: 'pointer', fontFamily: 'Montserrat,sans-serif', fontWeight: 800 }}>
            🚀 Crear cuenta gratis
          </button>
          <button onClick={() => router.push('/login')}
            style={{ border: '1px solid rgba(93,224,230,.2)', background: 'rgba(93,224,230,.05)', borderRadius: 10, padding: '14px 28px', fontSize: 14, color: '#5DE0E6', cursor: 'pointer', fontFamily: 'Montserrat,sans-serif', fontWeight: 700 }}>
            Ver demo →
          </button>
        </div>

        <p style={{ fontSize: 11, color: 'rgba(136,153,187,.5)', marginTop: 16 }}>
          Sin tarjeta de crédito · 14 días gratis en plan Pro · Cancela cuando quieras
        </p>

        {/* Preview del dashboard */}
        <div style={{ marginTop: 60, background: '#111827', border: '1px solid rgba(93,224,230,.15)', borderRadius: 16, padding: '20px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 60%, #0A1628 100%)', zIndex: 1, borderRadius: 16 }} />
          {/* Simulated dashboard */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#EF4444' }} />
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#F59E0B' }} />
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22C55E' }} />
            <div style={{ flex: 1, background: 'rgba(93,224,230,.06)', borderRadius: 4, height: 8, marginLeft: 8 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 10 }}>
            {[['💰','$2.847.500','Ventas hoy'],['🧾','47','Transacciones'],['🎯','$60.584','Ticket prom.'],['📊','$540.825','IVA 19%']].map(([icon,val,label]) => (
              <div key={label} style={{ background: '#0A1628', borderRadius: 8, padding: '10px 12px', border: '1px solid rgba(93,224,230,.08)' }}>
                <div style={{ fontSize: 14 }}>{icon}</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#5DE0E6', marginTop: 4 }}>{val}</div>
                <div style={{ fontSize: 9, color: '#8899BB', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div style={{ background: '#0A1628', borderRadius: 8, padding: '12px', border: '1px solid rgba(93,224,230,.08)' }}>
              <div style={{ fontSize: 9, color: '#8899BB', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase' as const }}>Ventas por hora</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 36 }}>
                {[20,35,60,45,80,95,70,55,40,65,85,100,75,60].map((h,i) => (
                  <div key={i} style={{ flex: 1, background: `linear-gradient(180deg,#5DE0E6,#004AAD)`, height: `${h}%`, borderRadius: '2px 2px 0 0', opacity: .7 + i * .02 }} />
                ))}
              </div>
            </div>
            <div style={{ background: '#0A1628', borderRadius: 8, padding: '12px', border: '1px solid rgba(93,224,230,.08)' }}>
              <div style={{ fontSize: 9, color: '#8899BB', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase' as const }}>Top productos</div>
              {[['Cerveza Budweiser 350ml','$412.000'],['Pisco Control C35 750ml','$287.500'],['Vino Casillero Cab. 750ml','$198.000']].map(([n,v]) => (
                <div key={n} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, padding: '3px 0', borderBottom: '1px solid rgba(93,224,230,.04)' }}>
                  <span style={{ color: '#8899BB' }}>{n}</span>
                  <span style={{ fontWeight: 700, color: '#5DE0E6' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── LOGOS / SOCIAL PROOF ── */}
      <section style={{ padding: '20px 40px 50px', textAlign: 'center' }}>
        <p style={{ fontSize: 11, color: 'rgba(136,153,187,.4)', marginBottom: 20, textTransform: 'uppercase' as const, letterSpacing: '.1em' }}>
          Más de 200 negocios confían en Mosaico Pro
        </p>
        <div style={{ display: 'flex', gap: 32, justifyContent: 'center', flexWrap: 'wrap' as const }}>
          {['Botillería BadWoman', 'Almacén El Sur', 'Minimarket Don Pepe', 'Distribuidora Valpo', 'Abarrotes Central'].map(n => (
            <span key={n} style={{ fontSize: 12, color: 'rgba(136,153,187,.35)', fontWeight: 700 }}>{n}</span>
          ))}
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" style={{ padding: '60px 40px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 50 }}>
          <div style={{ fontSize: 11, color: '#5DE0E6', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '.08em', marginBottom: 12 }}>Funcionalidades</div>
          <h2 style={{ fontSize: 36, fontWeight: 800, margin: 0 }}>Todo lo que necesita tu negocio</h2>
          <p style={{ fontSize: 15, color: '#8899BB', marginTop: 12 }}>Diseñado por gente que entiende cómo funciona un negocio en Chile</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20 }}>
          {FEATURES.map(f => (
            <div key={f.title} style={{ background: '#111827', border: '1px solid rgba(93,224,230,.1)', borderRadius: 14, padding: '24px', transition: 'border-color .2s' }}
              onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(93,224,230,.35)'}
              onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(93,224,230,.1)'}
            >
              <div style={{ fontSize: 32, marginBottom: 14 }}>{f.icon}</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{f.title}</div>
              <div style={{ fontSize: 13, color: '#8899BB', lineHeight: 1.6 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── IA HIGHLIGHT ── */}
      <section style={{ padding: '60px 40px', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ background: 'linear-gradient(135deg, rgba(0,74,173,.15), rgba(93,224,230,.08))', border: '1px solid rgba(93,224,230,.2)', borderRadius: 20, padding: '40px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, color: '#5DE0E6', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '.08em', marginBottom: 14 }}>✨ Inteligencia artificial</div>
            <h3 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 16px' }}>La IA carga tus facturas por ti</h3>
            <p style={{ fontSize: 14, color: '#8899BB', lineHeight: 1.7, margin: 0 }}>
              Fotografía la factura de tu proveedor y Claude AI extrae automáticamente todos los productos, cantidades y precios. Cero digitación manual.
            </p>
            <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
              {['Lee imágenes y PDFs de facturas', 'Detecta nombre, SKU, cantidad y precio', 'Pre-carga el formulario de producto listo para guardar'].map(item => (
                <div key={item} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                  <span style={{ color: '#5DE0E6', fontWeight: 800 }}>✓</span>
                  <span style={{ color: '#8899BB' }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background: '#0A1628', borderRadius: 12, padding: '20px', border: '1px solid rgba(93,224,230,.12)' }}>
            <div style={{ fontSize: 11, color: '#8899BB', marginBottom: 12 }}>🤖 IA procesando factura...</div>
            {[
              ['Cerveza Austral Lager 500ml', '24 uds', '$890'],
              ['Pisco Tres Generaciones 40° 700ml', '12 uds', '$4.290'],
              ['Vino Emiliana Orgánico 750ml', '6 uds', '$3.150'],
            ].map(([n,q,p]) => (
              <div key={n} style={{ background: '#111827', borderRadius: 8, padding: '10px 12px', marginBottom: 6, border: '1px solid rgba(34,197,94,.15)' }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{n}</div>
                <div style={{ fontSize: 11, color: '#8899BB', marginTop: 3 }}>Cant: {q} · Precio: {p}</div>
                <div style={{ marginTop: 6 }}>
                  <span style={{ fontSize: 10, background: 'rgba(34,197,94,.1)', color: '#22C55E', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>+ Agregar producto</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section style={{ padding: '60px 40px', maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 11, color: '#5DE0E6', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '.08em', marginBottom: 12 }}>Testimonios</div>
          <h2 style={{ fontSize: 32, fontWeight: 800, margin: 0 }}>Lo que dicen nuestros clientes</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20 }}>
          {TESTIMONIALS.map(t => (
            <div key={t.name} style={{ background: '#111827', border: '1px solid rgba(93,224,230,.1)', borderRadius: 14, padding: '24px' }}>
              <div style={{ fontSize: 20, color: '#C19E4D', marginBottom: 14 }}>★★★★★</div>
              <p style={{ fontSize: 13, color: '#8899BB', lineHeight: 1.7, margin: '0 0 20px', fontStyle: 'italic' }}>
                &ldquo;{t.text}&rdquo;
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,#004AAD,#5DE0E6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                  {t.avatar}
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{t.name}</div>
                  <div style={{ fontSize: 10, color: '#8899BB' }}>{t.role} · {t.city}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" style={{ padding: '60px 40px', maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 50 }}>
          <div style={{ fontSize: 11, color: '#5DE0E6', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '.08em', marginBottom: 12 }}>Precios</div>
          <h2 style={{ fontSize: 36, fontWeight: 800, margin: '0 0 12px' }}>Planes modulares, sin letra chica</h2>
          <p style={{ fontSize: 14, color: '#8899BB', margin: '0 0 8px' }}>Todos los planes incluyen período de prueba gratuito. Sin tarjeta de crédito requerida.</p>
          <p style={{ fontSize: 13, color: '#5DE0E6', fontWeight: 700, margin: 0 }}>Precios en CLP · IVA incluido</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20, alignItems: 'start' }}>
          {PLANS.map((plan: any) => (
            <div key={plan.name} style={{
              background: plan.highlight ? 'linear-gradient(180deg, rgba(0,74,173,.18), rgba(10,22,40,1))' : '#111827',
              border: `1px solid ${plan.highlight ? 'rgba(93,224,230,.5)' : 'rgba(93,224,230,.1)'}`,
              borderRadius: 16, padding: '28px',
              position: 'relative' as const,
              transform: plan.highlight ? 'scale(1.04)' : 'none',
              boxShadow: plan.highlight ? '0 0 40px rgba(0,74,173,.2)' : 'none',
            }}>
              {plan.highlight && (
                <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(90deg,#004AAD,#5DE0E6)', borderRadius: 20, padding: '4px 16px', fontSize: 11, fontWeight: 800, color: '#fff', whiteSpace: 'nowrap' as const }}>
                  MÁS POPULAR
                </div>
              )}
              {/* Trial badge */}
              <div style={{ display: 'inline-block', background: 'rgba(34,197,94,.12)', border: '1px solid rgba(34,197,94,.3)', borderRadius: 20, padding: '3px 10px', fontSize: 10, fontWeight: 700, color: '#22C55E', marginBottom: 12 }}>
                🎁 {plan.trial}
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: plan.color, marginBottom: 8 }}>{plan.name}</div>
              <div style={{ marginBottom: 20 }}>
                <span style={{ fontSize: 36, fontWeight: 800 }}>${plan.price}</span>
                <span style={{ fontSize: 12, color: '#8899BB', marginLeft: 4 }}> CLP / {plan.period}</span>
              </div>
              <div style={{ marginBottom: 24 }}>
                {plan.features.map((f: string) => (
                  <div key={f} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, marginBottom: 8 }}>
                    <span style={{ color: plan.color, fontWeight: 800, flexShrink: 0 }}>✓</span>
                    <span style={{ color: '#8899BB' }}>{f}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => router.push(plan.name === 'Business' ? '/login' : '/onboarding')}
                style={{
                  width: '100%', border: plan.highlight ? 'none' : `1px solid ${plan.color}60`,
                  background: plan.highlight ? `linear-gradient(90deg,#004AAD,${plan.color})` : 'transparent',
                  borderRadius: 10, padding: '12px', fontSize: 13, fontWeight: 700,
                  color: plan.highlight ? '#fff' : plan.color,
                  cursor: 'pointer', fontFamily: 'Montserrat,sans-serif',
                }}>
                {plan.cta}
              </button>
            </div>
          ))}
        </div>
        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: '#8899BB' }}>
          ¿Necesitas algo más específico? <a href="mailto:contactomosaicomedia@gmail.com" style={{ color: '#5DE0E6', fontWeight: 700, textDecoration: 'none' }}>Contáctanos para un plan a medida →</a>
        </p>
      </section>

      {/* ── CTA FINAL ── */}
      <section style={{ padding: '80px 40px', textAlign: 'center', maxWidth: 700, margin: '0 auto' }}>
        <h2 style={{ fontSize: 38, fontWeight: 800, margin: '0 0 16px' }}>
          Empieza tu prueba gratuita hoy
        </h2>
        <p style={{ fontSize: 16, color: '#8899BB', lineHeight: 1.7, margin: '0 0 36px' }}>
          En 5 minutos tienes tu negocio en Mosaico Pro.<br />Sin tarjeta de crédito requerida. Sin instalaciones. Sin complicaciones.
        </p>
        <button onClick={() => router.push('/onboarding')}
          style={{ border: 'none', background: 'linear-gradient(90deg,#004AAD,#5DE0E6)', borderRadius: 12, padding: '16px 40px', fontSize: 15, color: '#fff', cursor: 'pointer', fontFamily: 'Montserrat,sans-serif', fontWeight: 800 }}>
          🚀 Iniciar prueba gratuita
        </button>
        <p style={{ fontSize: 11, color: 'rgba(136,153,187,.4)', marginTop: 14 }}>
          Sin tarjeta de crédito · 14 días gratis en plan Pro
        </p>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: '1px solid rgba(93,224,230,.08)', padding: '30px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' as const, gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 24, height: 24, borderRadius: 6, background: 'linear-gradient(135deg,#004AAD,#5DE0E6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: '#fff' }}>MP</div>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Mosaico Pro</span>
          <span style={{ fontSize: 11, color: '#8899BB' }}>by Mosaico Media SpA</span>
        </div>
        <div style={{ display: 'flex', gap: 20 }}>
          {['Términos de servicio', 'Privacidad', 'Contacto'].map(l => (
            <span key={l} style={{ fontSize: 11, color: '#8899BB', cursor: 'pointer' }}>{l}</span>
          ))}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(136,153,187,.4)' }}>
          © {new Date().getFullYear()} Mosaico Media SpA · Santiago, Chile
        </div>
      </footer>

    </div>
  )
}
