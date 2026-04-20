'use client'

import { useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { type WBShape } from './Whiteboard'

const supabase = createClient()

// ── Config ────────────────────────────────────────────────────────────────────
const PILLAR_CFG: Record<string, { label: string; color: string }> = {
  autoridad:      { label: 'Autoridad',      color: '#C19E4D' },
  transformacion: { label: 'Transformación', color: '#16A34A' },
  receta_secreta: { label: 'Receta Secreta', color: '#7C3AED' },
  bienestar:      { label: 'Bienestar',      color: '#2563EB' },
  conversion:     { label: 'Conversión',     color: '#DC2626' },
}
const FUNNEL_CFG: Record<string, { label: string; color: string }> = {
  tofu: { label: 'TOFU', color: '#60A5FA' },
  mofu: { label: 'MOFU', color: '#F59E0B' },
  bofu: { label: 'BOFU', color: '#22C55E' },
}
const FORMAT_CFG: Record<string, { label: string; emoji: string }> = {
  reel:     { label: 'Reel',     emoji: '🎬' },
  carrusel: { label: 'Carrusel', emoji: '🗂️' },
  historia: { label: 'Historia', emoji: '📱' },
  post:     { label: 'Post',     emoji: '🖼️' },
  video:    { label: 'Video',    emoji: '📹' },
  texto:    { label: 'Texto',    emoji: '✍️' },
  live:     { label: 'Live',     emoji: '🔴' },
}
const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  borrador:   { label: 'Borrador',   color: '#8899BB', bg: 'rgba(136,153,187,.15)' },
  programado: { label: 'Programado', color: '#5DE0E6', bg: 'rgba(93,224,230,.15)'  },
  publicado:  { label: 'Publicado',  color: '#22C55E', bg: 'rgba(34,197,94,.15)'   },
  pausado:    { label: 'Pausado',    color: '#F59E0B', bg: 'rgba(245,158,11,.15)'  },
  cancelado:  { label: 'Cancelado',  color: '#EF4444', bg: 'rgba(239,68,68,.15)'   },
}
const PLATFORMS  = ['instagram','facebook','tiktok','youtube','linkedin','twitter','whatsapp']
const ASPECT_OPTIONS = [
  { label: '4:5',  value: '4:5',  w: 160, h: 200 },
  { label: '9:16', value: '9:16', w: 112, h: 200 },
  { label: '16:9', value: '16:9', w: 200, h: 112 },
  { label: '1:1',  value: '1:1',  w: 160, h: 160 },
]
const TODAY = new Date().toISOString().split('T')[0]

// ── Styles ────────────────────────────────────────────────────────────────────
const inp: React.CSSProperties = {
  width: '100%', background: '#1E2A3A',
  border: '1px solid rgba(93,224,230,.2)', borderRadius: 8,
  padding: '7px 10px', color: '#F0F4FF', fontSize: 12, boxSizing: 'border-box',
  fontFamily: 'Montserrat,sans-serif',
}
const lbl: React.CSSProperties = { fontSize: 10, color: '#8899BB', display: 'block', marginBottom: 3 }
const btn: React.CSSProperties = {
  border: 'none', borderRadius: 8, cursor: 'pointer',
  fontFamily: 'Montserrat,sans-serif', fontWeight: 700,
}
const section: React.CSSProperties = {
  background: '#0D1B2E', borderRadius: 10, padding: '14px 14px 16px',
  border: '1px solid rgba(93,224,230,.08)',
}
const sectionTitle: React.CSSProperties = {
  fontSize: 10, fontWeight: 800, color: '#5DE0E6',
  letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 12,
}

// ── Interfaces ────────────────────────────────────────────────────────────────
interface ContentPillar {
  id: string; company_id: string
  name: string; color: string; percentage: number
}

export interface PieceModalProps {
  piece: PieceData | null   // null = create mode
  pillars: ContentPillar[]
  companyId: string
  boardId?: string | null
  onClose: () => void
  onSaved: () => void
  onDeleted: () => void
}

export interface PieceData {
  id: string; company_id: string
  title: string; hook: string | null; description: string | null; cta: string | null
  publish_date: string; publish_time: string | null
  format: string; pillar: string; funnel_stage: string | null
  platform: string | null; priority_service: string | null
  status: string; notes: string | null
  board_id: string | null
  board_x: number; board_y: number; board_order: number
  whiteboard_data?: WBShape[]
  media_urls?: string[]
  script_text?: string | null
  created_at: string
}

type ModalTab = 'info' | 'script' | 'media'

// ── MediaItem ─────────────────────────────────────────────────────────────────
function MediaItem({ url, aspect, onDelete }: { url: string; aspect: string; onDelete: () => void }) {
  const cfg = ASPECT_OPTIONS.find(a => a.value === aspect) ?? ASPECT_OPTIONS[3]
  const isVideo = /\.(mp4|webm|mov|avi)(\?|$)/i.test(url)
  return (
    <div style={{ position: 'relative', width: cfg.w, height: cfg.h, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(93,224,230,.2)', flexShrink: 0 }}>
      {isVideo
        ? <video src={url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} controls />
        : <img src={url} alt='' style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      }
      <button
        onClick={onDelete}
        style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,.7)', border: 'none', borderRadius: 4, color: '#EF4444', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: '2px 5px' }}>
        ×
      </button>
    </div>
  )
}

// ── Main Modal ────────────────────────────────────────────────────────────────
export function PieceModal({ piece, pillars, companyId, boardId, onClose, onSaved, onDeleted }: PieceModalProps) {
  const isNew = !piece
  const [tab, setTab]       = useState<ModalTab>('info')
  const [saving,  setSaving]  = useState(false)
  const [deleting,setDeleting]= useState(false)
  const [confirm, setConfirm] = useState(false)
  const [error,   setError]   = useState('')
  const [uploading,setUploading] = useState(false)
  const [aspect,  setAspect]  = useState('4:5')

  const [form, setForm] = useState({
    title:            piece?.title            ?? '',
    hook:             piece?.hook             ?? '',
    description:      piece?.description      ?? '',
    cta:              piece?.cta              ?? '',
    publish_date:     piece?.publish_date      ?? TODAY,
    publish_time:     piece?.publish_time      ?? '09:00',
    format:           piece?.format            ?? 'post',
    pillar:           piece?.pillar            ?? 'autoridad',
    funnel_stage:     piece?.funnel_stage      ?? 'tofu',
    platform:         piece?.platform          ?? 'instagram',
    priority_service: piece?.priority_service  ?? '',
    status:           piece?.status            ?? 'borrador',
    notes:            piece?.notes             ?? '',
  })

  const [scriptText, setScriptText] = useState(piece?.script_text ?? '')
  const [mediaUrls,  setMediaUrls]  = useState<string[]>(piece?.media_urls ?? [])
  const [wbShapes,   setWbShapes]   = useState<WBShape[]>(piece?.whiteboard_data ?? [])
  const wbRef = useRef<WBShape[]>(wbShapes)

  const f = (key: string, val: string) => setForm(p => ({ ...p, [key]: val }))

  const handleShapesChange = useCallback((shapes: WBShape[]) => {
    wbRef.current = shapes
  }, [])

  async function save() {
    if (!form.title.trim()) { setError('El título es obligatorio'); return }
    setSaving(true); setError('')
    try {
      const shapes = wbRef.current
      if (isNew) {
        const { error: e } = await supabase.from('content_calendar').insert({
          company_id: companyId, ...form,
          board_id: boardId ?? null,
          board_x: 0, board_y: 0, board_order: 0,
          script_text: scriptText || null,
          media_urls: mediaUrls,
          whiteboard_data: shapes,
        })
        if (e) throw e
      } else {
        const { data, error: e } = await supabase.rpc('update_content_piece', {
          p_data: { id: piece!.id, company_id: companyId, ...form },
        })
        if (e) throw e
        if (!data?.success) throw new Error(data?.error || 'Error al guardar')
        await supabase.rpc('update_piece_whiteboard', {
          p_id: piece!.id,
          p_company_id: companyId,
          p_whiteboard: shapes,
          p_media_urls: mediaUrls,
          p_script_text: scriptText || null,
        })
      }
      onSaved()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    }
    setSaving(false)
  }

  async function del() {
    setDeleting(true)
    await supabase.from('content_calendar').delete().eq('id', piece!.id).eq('company_id', companyId)
    setDeleting(false)
    onDeleted()
  }

  async function uploadMedia(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    const urls: string[] = []
    for (const file of Array.from(files)) {
      const path = `${companyId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error: ue } = await supabase.storage.from('content-media').upload(path, file, { upsert: false })
      if (!ue) {
        const { data } = supabase.storage.from('content-media').getPublicUrl(path)
        urls.push(data.publicUrl)
      }
    }
    setMediaUrls(prev => [...prev, ...urls])
    setUploading(false)
  }

  async function deleteMedia(url: string) {
    const path = url.split('/content-media/')[1]
    if (path) await supabase.storage.from('content-media').remove([path])
    setMediaUrls(prev => prev.filter(u => u !== url))
  }

  const pillarCfg   = PILLAR_CFG[form.pillar] ?? PILLAR_CFG['autoridad']
  const statusCfg   = STATUS_CFG[form.status]  ?? STATUS_CFG['borrador']
  const formatCfg   = FORMAT_CFG[form.format]  ?? FORMAT_CFG['post']

  const TABS: { key: ModalTab; label: string }[] = [
    { key: 'info',   label: 'Info' },
    { key: 'script', label: 'Guión' },
    { key: 'media',  label: `Archivos${mediaUrls.length > 0 ? ` (${mediaUrls.length})` : ''}` },
  ]

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(4px)',
    }}>
      {/* Modal container */}
      <div style={{
        width: 'calc(100vw - 48px)', height: 'calc(100vh - 48px)',
        background: '#111827', borderRadius: 16,
        border: '1px solid rgba(93,224,230,.15)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,.7)',
        maxWidth: 1600,
      }}>

        {/* ── Header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '0 20px', height: 56, flexShrink: 0,
          borderBottom: '1px solid rgba(93,224,230,.1)',
          background: '#0D1B2E',
        }}>
          <div style={{ width: 4, height: 28, borderRadius: 2, background: pillarCfg.color, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <input
              value={form.title}
              onChange={e => f('title', e.target.value)}
              placeholder='Título de la pieza...'
              style={{
                background: 'transparent', border: 'none', outline: 'none',
                color: '#F0F4FF', fontSize: 16, fontWeight: 800,
                fontFamily: 'Montserrat,sans-serif', width: '100%',
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: statusCfg.bg, color: statusCfg.color, fontWeight: 700 }}>
              {statusCfg.label}
            </span>
            <span style={{ fontSize: 13 }}>{formatCfg.emoji}</span>
            <span style={{ fontSize: 11, color: '#8899BB' }}>{formatCfg.label}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {!isNew && (
              <button
                onClick={() => setConfirm(true)}
                style={{ ...btn, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.2)', color: '#EF4444', padding: '7px 14px', fontSize: 12 }}>
                🗑
              </button>
            )}
            <button
              onClick={save} disabled={saving}
              style={{ ...btn, background: 'linear-gradient(90deg,#004AAD,#5DE0E6)', color: '#fff', padding: '7px 20px', fontSize: 13 }}>
              {saving ? 'Guardando…' : '💾 Guardar'}
            </button>
            <button onClick={onClose} style={{ ...btn, background: 'rgba(136,153,187,.1)', color: '#8899BB', padding: '7px 12px', fontSize: 16 }}>×</button>
          </div>
        </div>

        {/* ── Error bar ── */}
        {error && (
          <div style={{ background: 'rgba(239,68,68,.1)', borderBottom: '1px solid rgba(239,68,68,.2)', padding: '7px 20px', color: '#EF4444', fontSize: 12 }}>
            {error}
          </div>
        )}

        {/* ── Body ── */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* Content panel — full width */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Tab bar */}
            <div style={{ display: 'flex', borderBottom: '1px solid rgba(93,224,230,.08)', background: '#0D1B2E', flexShrink: 0 }}>
              {TABS.map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  style={{
                    ...btn, flex: 1, padding: '10px 4px', fontSize: 11, borderRadius: 0,
                    background: tab === t.key ? 'rgba(93,224,230,.08)' : 'transparent',
                    color: tab === t.key ? '#5DE0E6' : '#8899BB',
                    borderBottom: tab === t.key ? '2px solid #5DE0E6' : '2px solid transparent',
                  }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>

              {/* ── INFO TAB ── */}
              {tab === 'info' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={section}>
                    <div style={sectionTitle}>📋 Contenido</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div>
                        <label style={lbl}>Hook (primera frase)</label>
                        <textarea value={form.hook} onChange={e => f('hook', e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }} placeholder='Frase de apertura que engancha…' />
                      </div>
                      <div>
                        <label style={lbl}>Descripción</label>
                        <textarea value={form.description} onChange={e => f('description', e.target.value)} rows={3} style={{ ...inp, resize: 'vertical' }} placeholder='Cuerpo del contenido…' />
                      </div>
                      <div>
                        <label style={lbl}>CTA</label>
                        <input value={form.cta} onChange={e => f('cta', e.target.value)} style={inp} placeholder='Ej: Escríbenos al WhatsApp' />
                      </div>
                    </div>
                  </div>

                  <div style={section}>
                    <div style={sectionTitle}>📅 Publicación</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <label style={lbl}>Fecha</label>
                        <input type='date' value={form.publish_date} onChange={e => f('publish_date', e.target.value)} style={inp} />
                      </div>
                      <div>
                        <label style={lbl}>Hora</label>
                        <input type='time' value={form.publish_time ?? ''} onChange={e => f('publish_time', e.target.value)} style={inp} />
                      </div>
                      <div>
                        <label style={lbl}>Plataforma</label>
                        <select value={form.platform ?? ''} onChange={e => f('platform', e.target.value)} style={inp}>
                          {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={lbl}>Estado</label>
                        <select value={form.status} onChange={e => f('status', e.target.value)} style={inp}>
                          {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div style={section}>
                    <div style={sectionTitle}>🎯 Estrategia</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div>
                        <label style={lbl}>Formato</label>
                        <select value={form.format} onChange={e => f('format', e.target.value)} style={inp}>
                          {Object.entries(FORMAT_CFG).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
                        </select>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                          <label style={lbl}>Pilar</label>
                          <select value={form.pillar} onChange={e => f('pillar', e.target.value)} style={inp}>
                            {Object.entries(PILLAR_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                            {pillars.filter(p => !(p.name.toLowerCase().replace(/ /g,'_') in PILLAR_CFG)).map(p => (
                              <option key={p.id} value={p.name.toLowerCase().replace(/ /g,'_')}>{p.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label style={lbl}>Funnel</label>
                          <select value={form.funnel_stage ?? ''} onChange={e => f('funnel_stage', e.target.value)} style={inp}>
                            {Object.entries(FUNNEL_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label style={lbl}>Servicio prioritario</label>
                        <input value={form.priority_service ?? ''} onChange={e => f('priority_service', e.target.value)} style={inp} placeholder='Ej: Plan Delgada Pro' />
                      </div>
                    </div>
                  </div>

                  <div style={section}>
                    <div style={sectionTitle}>📝 Notas internas</div>
                    <textarea value={form.notes ?? ''} onChange={e => f('notes', e.target.value)} rows={3} style={{ ...inp, resize: 'vertical' }} placeholder='Notas privadas del equipo…' />
                  </div>
                </div>
              )}

              {/* ── SCRIPT TAB ── */}
              {tab === 'script' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ ...section, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={sectionTitle}>🎬 Guión / Script completo</div>
                    <p style={{ fontSize: 11, color: '#8899BB', margin: 0 }}>
                      Escribe el guión completo del video o el copy extendido. Este texto es solo para uso interno del equipo.
                    </p>
                    <textarea
                      value={scriptText}
                      onChange={e => setScriptText(e.target.value)}
                      rows={24}
                      placeholder={'HOOK:\n\n\nDESARROLLO:\n\n\nCIERRE Y CTA:\n\n'}
                      style={{
                        ...inp, resize: 'vertical',
                        fontFamily: 'monospace', fontSize: 13, lineHeight: 1.7,
                        minHeight: 420,
                      }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 10, color: '#8899BB' }}>
                        {scriptText.split(/\s+/).filter(Boolean).length} palabras · {scriptText.length} caracteres
                      </span>
                      <button
                        onClick={() => {
                          const est = Math.round(scriptText.split(/\s+/).filter(Boolean).length / 130)
                          alert(`Duración estimada: ~${est} min (130 ppm)`)
                        }}
                        style={{ ...btn, background: 'rgba(93,224,230,.08)', color: '#5DE0E6', border: '1px solid rgba(93,224,230,.15)', padding: '5px 10px', fontSize: 11 }}>
                        ⏱ Duración estimada
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── MEDIA TAB ── */}
              {tab === 'media' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={section}>
                    <div style={sectionTitle}>📁 Archivos multimedia</div>

                    {/* Aspect selector */}
                    <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
                      {ASPECT_OPTIONS.map(a => (
                        <button
                          key={a.value}
                          onClick={() => setAspect(a.value)}
                          style={{
                            ...btn, padding: '5px 10px', fontSize: 11,
                            background: aspect === a.value ? 'rgba(93,224,230,.15)' : 'rgba(255,255,255,.04)',
                            border: aspect === a.value ? '1px solid rgba(93,224,230,.5)' : '1px solid rgba(255,255,255,.08)',
                            color: aspect === a.value ? '#5DE0E6' : '#8899BB',
                          }}>
                          {a.label}
                        </button>
                      ))}
                      <span style={{ fontSize: 10, color: '#8899BB', alignSelf: 'center', marginLeft: 4 }}>vista previa</span>
                    </div>

                    {/* Upload area */}
                    <label style={{
                      display: 'block', border: '2px dashed rgba(93,224,230,.25)',
                      borderRadius: 10, padding: '24px 16px', textAlign: 'center',
                      cursor: 'pointer', marginBottom: 16,
                      background: uploading ? 'rgba(93,224,230,.05)' : 'transparent',
                    }}>
                      <input
                        type='file'
                        multiple
                        accept='image/*,video/*'
                        style={{ display: 'none' }}
                        onChange={e => uploadMedia(e.target.files)}
                      />
                      {uploading
                        ? <span style={{ color: '#5DE0E6', fontSize: 13 }}>⏳ Subiendo archivos…</span>
                        : (
                          <>
                            <div style={{ fontSize: 28, marginBottom: 6 }}>📎</div>
                            <div style={{ fontSize: 12, color: '#8899BB' }}>
                              Arrastra o haz clic para subir imágenes o videos
                            </div>
                            <div style={{ fontSize: 10, color: '#556080', marginTop: 4 }}>
                              JPG, PNG, WebP, GIF, MP4, WebM · hasta 500 MB
                            </div>
                          </>
                        )
                      }
                    </label>

                    {/* Media grid */}
                    {mediaUrls.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                        {mediaUrls.map(url => (
                          <MediaItem key={url} url={url} aspect={aspect} onDelete={() => deleteMedia(url)} />
                        ))}
                      </div>
                    )}

                    {mediaUrls.length === 0 && !uploading && (
                      <div style={{ textAlign: 'center', padding: '20px 0', color: '#556080', fontSize: 12 }}>
                        No hay archivos aún
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>

        {/* ── Delete confirm overlay ── */}
        {confirm && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 10,
            background: 'rgba(0,0,0,.65)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ background: '#111827', borderRadius: 12, padding: 28, maxWidth: 340, width: '90%', border: '1px solid rgba(239,68,68,.3)' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#EF4444', marginBottom: 10 }}>Eliminar pieza</div>
              <div style={{ fontSize: 13, color: '#8899BB', marginBottom: 20 }}>
                ¿Eliminar <strong style={{ color: '#F0F4FF' }}>{form.title}</strong>? Esta acción no se puede deshacer.
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setConfirm(false)} style={{ ...btn, flex: 1, background: 'transparent', border: '1px solid rgba(136,153,187,.3)', color: '#8899BB', padding: '9px 0' }}>Cancelar</button>
                <button onClick={del} disabled={deleting} style={{ ...btn, flex: 1, background: '#EF4444', color: '#fff', padding: '9px 0' }}>
                  {deleting ? 'Eliminando…' : 'Eliminar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
