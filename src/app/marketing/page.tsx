'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { getAuthContext, getStoredCompany } from '@/lib/auth-company'
import { PieceModal } from './PieceModal'
import Whiteboard from './Whiteboard'

const supabase = createClient()

// ── Formatters ────────────────────────────────────────────────
const fmtDate = (d: string | null | undefined) => {
  if (!d) return '—'
  const p = d.split('T')[0].split('-')
  return `${p[2]}/${p[1]}/${p[0]}`
}
const TODAY = new Date().toISOString().split('T')[0]

// ── Pillar config ─────────────────────────────────────────────
const PILLAR_CFG: Record<string, { label: string; bg: string; color: string; border: string }> = {
  autoridad:      { label: 'Autoridad',       bg: '#FEF3DC', color: '#C19E4D', border: 'rgba(193,158,77,.4)' },
  transformacion: { label: 'Transformación',  bg: '#E1F5EE', color: '#16A34A', border: 'rgba(22,163,74,.4)'  },
  receta_secreta: { label: 'Receta Secreta',  bg: '#EEEDFE', color: '#7C3AED', border: 'rgba(124,58,237,.4)' },
  bienestar:      { label: 'Bienestar',       bg: '#E6F1FB', color: '#2563EB', border: 'rgba(37,99,235,.4)'  },
  conversion:     { label: 'Conversión',      bg: '#FCEBEB', color: '#DC2626', border: 'rgba(220,38,38,.4)'  },
}

const FUNNEL_CFG: Record<string, { label: string; color: string; bg: string }> = {
  tofu: { label: 'TOFU', color: '#60A5FA', bg: 'rgba(37,99,235,.15)'  },
  mofu: { label: 'MOFU', color: '#F59E0B', bg: 'rgba(193,158,77,.15)' },
  bofu: { label: 'BOFU', color: '#22C55E', bg: 'rgba(22,197,94,.15)'  },
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
  borrador:    { label: 'Borrador',    color: '#8899BB', bg: 'rgba(136,153,187,.15)' },
  programado:  { label: 'Programado',  color: '#5DE0E6', bg: 'rgba(93,224,230,.15)'  },
  publicado:   { label: 'Publicado',   color: '#22C55E', bg: 'rgba(34,197,94,.15)'   },
  pausado:     { label: 'Pausado',     color: '#F59E0B', bg: 'rgba(245,158,11,.15)'  },
  cancelado:   { label: 'Cancelado',   color: '#EF4444', bg: 'rgba(239,68,68,.15)'   },
}

const PLATFORMS = ['instagram','facebook','tiktok','youtube','linkedin','twitter','whatsapp']

// ── Interfaces ────────────────────────────────────────────────
interface User    { id: string; first_name: string; last_name: string; role: string; company_id: string }
interface Company { id: string; name: string; slug?: string }

interface ContentBoard {
  id: string; company_id: string
  name: string; is_definitive: boolean; order_index: number; created_at: string
}

interface ContentPiece {
  id: string; company_id: string
  title: string; hook: string | null; description: string | null; cta: string | null
  publish_date: string; publish_time: string | null
  format: string; pillar: string; funnel_stage: string | null
  platform: string | null; priority_service: string | null
  status: string; notes: string | null
  board_id: string | null
  board_x: number; board_y: number; board_order: number
  whiteboard_data?: import('./Whiteboard').WBShape[]
  media_urls?: string[]
  script_text?: string | null
  created_at: string
}

interface ContentPillar {
  id: string; company_id: string
  name: string; color: string; percentage: number
  formats: string[] | null
}

interface ContentPack {
  id: string; company_id: string
  name: string; price: number; real_value: number | null; savings: number | null
  items: string[] | null; valid_until: string | null; status: string
  created_at: string
}

// ── Inline style helpers ───────────────────────────────────────
const inp: React.CSSProperties = {
  width: '100%', background: '#1E2A3A',
  border: '1px solid rgba(93,224,230,.2)', borderRadius: 8,
  padding: '7px 10px', color: '#F0F4FF', fontSize: 12, boxSizing: 'border-box',
}
const lbl: React.CSSProperties = { fontSize: 10, color: '#8899BB', display: 'block', marginBottom: 3 }
const btn: React.CSSProperties = { border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'Montserrat,sans-serif', fontWeight: 700 }

// ============================================================
// SIDE PANEL — edit / create a piece
// ============================================================
interface SidePanelProps {
  piece: ContentPiece | null     // null = create mode
  pillars: ContentPillar[]
  companyId: string
  boardId?: string | null
  onClose: () => void
  onSaved: () => void
  onDeleted: () => void
  onOpenAI?: (ctx: { pillar: string; format: string; platform: string; funnel: string; service: string }) => void
}

function SidePanel({ piece, pillars, companyId, boardId, onClose, onSaved, onDeleted, onOpenAI }: SidePanelProps) {
  const isNew = !piece
  const [form, setForm] = useState({
    title:            piece?.title            ?? '',
    hook:             piece?.hook             ?? '',
    description:      piece?.description      ?? '',
    cta:              piece?.cta              ?? '',
    publish_date:     piece?.publish_date      ?? TODAY,
    publish_time:     piece?.publish_time      ?? '09:00',
    format:           piece?.format            ?? 'post',
    pillar:           piece?.pillar            ?? (pillars[0]?.name?.toLowerCase().replace(/ /g,'_') ?? 'autoridad'),
    funnel_stage:     piece?.funnel_stage      ?? 'tofu',
    platform:         piece?.platform          ?? 'instagram',
    priority_service: piece?.priority_service  ?? '',
    status:           piece?.status            ?? 'borrador',
    notes:            piece?.notes             ?? '',
  })
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirm,  setConfirm]  = useState(false)
  const [error,    setError]    = useState('')

  const f = (key: string, val: string) => setForm(p => ({ ...p, [key]: val }))

  async function save() {
    if (!form.title.trim()) { setError('El título es obligatorio'); return }
    setSaving(true); setError('')
    try {
      if (isNew) {
        const { error: e } = await supabase.from('content_calendar').insert({
          company_id: companyId, ...form,
          board_id: boardId ?? null,
          board_x: 0, board_y: 0, board_order: 0,
        })
        if (e) throw e
      } else {
        const { data, error: e } = await supabase.rpc('update_content_piece', {
          p_data: { id: piece!.id, company_id: companyId, ...form },
        })
        if (e) throw e
        if (!data?.success) throw new Error(data?.error || 'Error al guardar')
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

  const pillarKey = form.pillar in PILLAR_CFG ? form.pillar : 'autoridad'
  const pc = PILLAR_CFG[pillarKey]

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', justifyContent: 'flex-end' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      {/* backdrop */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)' }} onClick={onClose} />

      {/* panel */}
      <div style={{ position: 'relative', width: 380, background: '#111827', borderLeft: '1px solid rgba(93,224,230,.15)', height: '100vh', overflowY: 'auto', padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#F0F4FF' }}>{isNew ? '+ Nueva pieza' : 'Editar pieza'}</div>
          <button onClick={onClose} style={{ ...btn, background: 'none', color: '#8899BB', fontSize: 20, padding: 0 }}>×</button>
        </div>

        {error && <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, padding: '7px 10px', color: '#EF4444', fontSize: 11 }}>{error}</div>}

        {/* Pillar color strip */}
        <div style={{ height: 4, borderRadius: 2, background: pc.color, opacity: 0.7 }} />

        <div>
          <label style={lbl}>Título *</label>
          <input value={form.title} onChange={e => f('title', e.target.value)} style={inp} placeholder='Nombre de la pieza' />
        </div>
        <div>
          <label style={lbl}>Hook (primera frase)</label>
          <textarea value={form.hook} onChange={e => f('hook', e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }} placeholder='Frase de apertura...' />
        </div>
        <div>
          <label style={lbl}>Descripción / guión</label>
          <textarea value={form.description} onChange={e => f('description', e.target.value)} rows={3} style={{ ...inp, resize: 'vertical' }} placeholder='Contenido del post...' />
        </div>
        <div>
          <label style={lbl}>CTA</label>
          <input value={form.cta} onChange={e => f('cta', e.target.value)} style={inp} placeholder='Ej: Escríbenos al WhatsApp' />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={lbl}>Fecha publicación</label>
            <input type='date' value={form.publish_date} onChange={e => f('publish_date', e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>Hora</label>
            <input type='time' value={form.publish_time ?? ''} onChange={e => f('publish_time', e.target.value)} style={inp} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={lbl}>Formato</label>
            <select value={form.format} onChange={e => f('format', e.target.value)} style={inp}>
              {Object.entries(FORMAT_CFG).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Plataforma</label>
            <select value={form.platform ?? ''} onChange={e => f('platform', e.target.value)} style={inp}>
              {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label style={lbl}>Pilar</label>
          <select value={form.pillar} onChange={e => f('pillar', e.target.value)} style={inp}>
            {Object.entries(PILLAR_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            {pillars.filter(p => !(p.name.toLowerCase().replace(/ /g,'_') in PILLAR_CFG)).map(p => (
              <option key={p.id} value={p.name.toLowerCase().replace(/ /g,'_')}>{p.name}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={lbl}>Etapa del funnel</label>
            <select value={form.funnel_stage ?? ''} onChange={e => f('funnel_stage', e.target.value)} style={inp}>
              {Object.entries(FUNNEL_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Estado</label>
            <select value={form.status} onChange={e => f('status', e.target.value)} style={inp}>
              {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label style={lbl}>Servicio prioritario</label>
          <input value={form.priority_service ?? ''} onChange={e => f('priority_service', e.target.value)} style={inp} placeholder='Ej: Plan Delgada Pro' />
        </div>

        <div>
          <label style={lbl}>Notas internas</label>
          <textarea value={form.notes ?? ''} onChange={e => f('notes', e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }} />
        </div>

        {onOpenAI && (
          <button
            onClick={() => onOpenAI({ pillar: form.pillar, format: form.format, platform: form.platform, funnel: form.funnel_stage, service: form.priority_service })}
            style={{ ...btn, width: '100%', background: 'linear-gradient(90deg,rgba(0,74,173,.4),rgba(93,224,230,.2))', border: '1px solid rgba(93,224,230,.25)', color: '#5DE0E6', padding: '9px 0', fontSize: 12 }}>
            ✨ Generar con IA para esta pieza
          </button>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button onClick={onClose} style={{ ...btn, flex: 1, background: 'transparent', border: '1px solid rgba(136,153,187,.3)', color: '#8899BB', padding: '9px 0', fontSize: 12 }}>Cancelar</button>
          <button onClick={save} disabled={saving} style={{ ...btn, flex: 2, background: 'linear-gradient(90deg,#004AAD,#5DE0E6)', color: '#fff', padding: '9px 0', fontSize: 12 }}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>

        {!isNew && (
          <div style={{ marginTop: 4 }}>
            {!confirm ? (
              <button onClick={() => setConfirm(true)} style={{ ...btn, width: '100%', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', color: '#EF4444', padding: '8px 0', fontSize: 11 }}>
                🗑 Eliminar pieza
              </button>
            ) : (
              <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 11, color: '#EF4444', marginBottom: 8 }}>¿Eliminar esta pieza?</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setConfirm(false)} style={{ ...btn, flex: 1, background: 'transparent', border: '1px solid rgba(136,153,187,.3)', color: '#8899BB', padding: '7px 0', fontSize: 11 }}>No</button>
                  <button onClick={del} disabled={deleting} style={{ ...btn, flex: 1, background: '#EF4444', color: '#fff', padding: '7px 0', fontSize: 11 }}>{deleting ? '...' : 'Eliminar'}</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================
// BOARD TAB — Miro-style collaborative whiteboard
// ============================================================
interface BoardTabProps {
  pieces: ContentPiece[]
  pillars: ContentPillar[]
  companyId: string
  boards: ContentBoard[]
  activeBoardId: string | null
  onBoardChange: (id: string) => void
  onSetDefinitive: (id: string) => Promise<void>
  onBoardCreate: (name: string, copyFrom: string | null) => Promise<void>
  onEdit: (p: ContentPiece) => void
  onNew: (boardId: string | null) => void
  onRefresh: () => void
}

function BoardTab({ pieces, pillars, companyId, boards, activeBoardId, onBoardChange, onSetDefinitive, onBoardCreate, onEdit, onNew, onRefresh }: BoardTabProps) {
  // ── Board management ─────────────────────────────────────────
  const [newBoardName,  setNewBoardName]  = useState('')
  const [showNewBoard,  setShowNewBoard]  = useState(false)
  const [copyFrom,      setCopyFrom]      = useState<string | null>(null)
  const [creatingBoard, setCreatingBoard] = useState(false)
  const [settingDef,    setSettingDef]    = useState(false)

  async function handleCreateBoard() {
    if (!newBoardName.trim()) return
    setCreatingBoard(true)
    await onBoardCreate(newBoardName.trim(), copyFrom)
    setNewBoardName(''); setCopyFrom(null); setShowNewBoard(false); setCreatingBoard(false)
  }

  // ── Original canvas state ────────────────────────────────────
  const BLOCK_W = 200; const BLOCK_H = 110
  const CANVAS_W = 4000; const CANVAS_H = 1400
  const SNAP_THRESHOLD = 8; const SNAP_RELEASE = 20

  const [zoom,        setZoom]        = useState(1)
  const [positions,   setPositions]   = useState<Record<string, { x: number; y: number }>>({})
  const [filterMonth, setFilterMonth] = useState('')
  const [filterPillar,setFilterPillar]= useState('')
  const [filterStatus,setFilterStatus]= useState('')
  const [inlineEdit,  setInlineEdit]  = useState<{ id: string; title: string } | null>(null)
  const [guides,      setGuides]      = useState<{ axis: 'x'|'y'; pos: number }[]>([])

  const dragRef     = useRef<{ id: string; startMX: number; startMY: number; origX: number; origY: number } | null>(null)
  const canvasRef   = useRef<HTMLDivElement>(null)
  const outerRef    = useRef<HTMLDivElement>(null)
  const otherPosRef = useRef<{ x: number; y: number }[]>([])
  const snapRef     = useRef({ xActive: false, xPos: 0, xGuide: 0, yActive: false, yPos: 0, yGuide: 0 })

  const activeBoard  = boards.find(b => b.id === activeBoardId)
  const boardPieces  = activeBoardId ? pieces.filter(p => p.board_id === activeBoardId) : pieces

  useEffect(() => {
    const pos: Record<string, { x: number; y: number }> = {}
    pieces.forEach((p, i) => {
      pos[p.id] = { x: p.board_x || (40 + (i % 12) * (BLOCK_W + 20)), y: p.board_y || (40 + Math.floor(i / 12) * (BLOCK_H + 20)) }
    })
    setPositions(pos)
  }, [pieces])

  const months  = Array.from(new Set(boardPieces.map(p => p.publish_date?.slice(0, 7)).filter(Boolean))).sort()
  const visible = boardPieces.filter(p => {
    if (filterMonth  && p.publish_date?.slice(0, 7) !== filterMonth)  return false
    if (filterPillar && p.pillar !== filterPillar) return false
    if (filterStatus && p.status !== filterStatus) return false
    return true
  })

  function onMouseDown(e: React.MouseEvent, id: string) {
    if (drawTool !== 'none') return
    e.preventDefault(); e.stopPropagation()
    const pos = positions[id] || { x: 0, y: 0 }
    otherPosRef.current = Object.entries(positions).filter(([pid]) => pid !== id).map(([, p]) => p)
    snapRef.current = { xActive: false, xPos: 0, xGuide: 0, yActive: false, yPos: 0, yGuide: 0 }
    dragRef.current = { id, startMX: e.clientX, startMY: e.clientY, origX: pos.x, origY: pos.y }
  }

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current) return
    const { id, startMX, startMY, origX, origY } = dragRef.current
    const rawX = Math.max(0, origX + (e.clientX - startMX) / zoom)
    const rawY = Math.max(0, origY + (e.clientY - startMY) / zoom)
    const others = otherPosRef.current; const snap = snapRef.current
    const newGuides: { axis: 'x'|'y'; pos: number }[] = []
    type Cand = { rawEdge: number; snapEdge: number; guide: number }
    const xC: Cand[] = [{ rawEdge: rawX + BLOCK_W / 2, snapEdge: CANVAS_W / 2, guide: CANVAS_W / 2 }]
    for (const op of others) {
      xC.push({ rawEdge: rawX, snapEdge: op.x, guide: op.x }, { rawEdge: rawX + BLOCK_W/2, snapEdge: op.x + BLOCK_W/2, guide: op.x + BLOCK_W/2 }, { rawEdge: rawX + BLOCK_W, snapEdge: op.x + BLOCK_W, guide: op.x + BLOCK_W })
    }
    let bX: Cand | null = null; let bXd = Infinity
    for (const c of xC) { const d = Math.abs(c.rawEdge - c.snapEdge); if (d < bXd) { bXd = d; bX = c } }
    const yC: Cand[] = [{ rawEdge: rawY + BLOCK_H / 2, snapEdge: CANVAS_H / 2, guide: CANVAS_H / 2 }]
    for (const op of others) {
      yC.push({ rawEdge: rawY, snapEdge: op.y, guide: op.y }, { rawEdge: rawY + BLOCK_H/2, snapEdge: op.y + BLOCK_H/2, guide: op.y + BLOCK_H/2 }, { rawEdge: rawY + BLOCK_H, snapEdge: op.y + BLOCK_H, guide: op.y + BLOCK_H })
    }
    let bY: Cand | null = null; let bYd = Infinity
    for (const c of yC) { const d = Math.abs(c.rawEdge - c.snapEdge); if (d < bYd) { bYd = d; bY = c } }
    let finalX = rawX; let finalY = rawY
    if (bX && bXd < SNAP_THRESHOLD) { snap.xActive = true; snap.xPos = rawX; snap.xGuide = bX.guide; finalX = bX.snapEdge - (bX.rawEdge - rawX) }
    else if (snap.xActive && Math.abs(rawX - snap.xPos) < SNAP_RELEASE) finalX = snap.xPos
    else snap.xActive = false
    if (bY && bYd < SNAP_THRESHOLD) { snap.yActive = true; snap.yPos = rawY; snap.yGuide = bY.guide; finalY = bY.snapEdge - (bY.rawEdge - rawY) }
    else if (snap.yActive && Math.abs(rawY - snap.yPos) < SNAP_RELEASE) finalY = snap.yPos
    else snap.yActive = false
    if (snap.xActive) newGuides.push({ axis: 'x', pos: snap.xGuide })
    if (snap.yActive) newGuides.push({ axis: 'y', pos: snap.yGuide })
    setGuides(newGuides)
    setPositions(prev => ({ ...prev, [id]: { x: Math.round(finalX), y: Math.round(finalY) } }))
  }, [zoom])

  const onMouseUp = useCallback(async () => {
    if (!dragRef.current) return
    const { id, origX, origY } = dragRef.current
    dragRef.current = null; setGuides([])
    const pos = positions[id]
    if (pos && (Math.abs(pos.x - origX) > 2 || Math.abs(pos.y - origY) > 2)) {
      await supabase.from('content_calendar').update({ board_x: pos.x, board_y: pos.y }).eq('id', id).eq('company_id', companyId)
    }
  }, [positions, companyId])

  async function saveInlineTitle() {
    if (!inlineEdit) return
    await supabase.rpc('update_content_piece', { p_data: { id: inlineEdit.id, company_id: companyId, title: inlineEdit.title } })
    setInlineEdit(null); onRefresh()
  }

  // ── Drawing / annotation layer ───────────────────────────────
  type DrawTool = 'none' | 'pen' | 'arrow' | 'sticky' | 'text' | 'title' | 'eraser'
  type Annot = { id: string; type: 'pen'|'arrow'|'sticky'|'text'|'title'; points?: number[]; x1?: number; y1?: number; x2?: number; y2?: number; x?: number; y?: number; w?: number; h?: number; text?: string; color: string; width?: number; fontSize?: number }

  const [drawTool,        setDrawTool]        = useState<DrawTool>('none')
  const [drawColor,       setDrawColor]       = useState('#5DE0E6')
  const [drawWidth,       setDrawWidth]       = useState(2)
  const [annotations,     setAnnotations]     = useState<Annot[]>([])
  const [editAnnot,       setEditAnnot]       = useState<string | null>(null)
  const [selectedAnnotId, setSelectedAnnotId] = useState<string | null>(null)
  const drawingRef    = useRef<{ type: DrawTool; points?: number[]; x1?: number; y1?: number } | null>(null)
  const annotDragRef  = useRef<{ id: string; startMX: number; startMY: number; orig: Annot } | null>(null)
  const drawPlacedRef = useRef(false)
  const [inProgressDraw, setInProgressDraw]   = useState<Annot | null>(null)

  useEffect(() => {
    if (!activeBoardId) return
    try { setAnnotations(JSON.parse(localStorage.getItem(`mp_board_annots_${activeBoardId}`) || '[]')) } catch { setAnnotations([]) }
  }, [activeBoardId])

  // ── Undo history ─────────────────────────────────────────────
  const annotHistoryRef = useRef<Annot[][]>([])
  const [canUndo, setCanUndo] = useState(false)

  function saveAnnots(a: Annot[], skipHistory = false) {
    if (!skipHistory) {
      annotHistoryRef.current = [...annotHistoryRef.current.slice(-30), annotations]
      setCanUndo(true)
    }
    setAnnotations(a)
    if (activeBoardId) try { localStorage.setItem(`mp_board_annots_${activeBoardId}`, JSON.stringify(a)) } catch {}
  }

  function undoAnnot() {
    const history = annotHistoryRef.current
    if (history.length === 0) return
    const prev = history[history.length - 1]
    annotHistoryRef.current = history.slice(0, -1)
    setCanUndo(annotHistoryRef.current.length > 0)
    setAnnotations(prev)
    setSelectedAnnotId(null)
    if (activeBoardId) try { localStorage.setItem(`mp_board_annots_${activeBoardId}`, JSON.stringify(prev)) } catch {}
  }

  // ── Eraser hover state ────────────────────────────────────────
  const ERASER_RADIUS = 22
  const eraserHeldRef    = useRef(false)
  const eraserGestureRef = useRef(false) // tracks if we pushed history for this gesture
  const [eraserPos, setEraserPos] = useState<{ x: number; y: number } | null>(null)

  function eraseAtPoint(cx: number, cy: number) {
    setAnnotations(prev => {
      const next = prev.filter(a => {
        if (a.type === 'pen') {
          const pts = a.points || []
          for (let i = 0; i < pts.length - 1; i += 2) {
            const dx = pts[i] - cx, dy = pts[i+1] - cy
            if (dx*dx + dy*dy <= ERASER_RADIUS * ERASER_RADIUS) return false
          }
          return true
        }
        if (a.type === 'arrow') {
          const x1 = a.x1||0, y1 = a.y1||0, x2 = a.x2||0, y2 = a.y2||0
          const len2 = (x2-x1)**2 + (y2-y1)**2
          const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((cx-x1)*(x2-x1)+(cy-y1)*(y2-y1))/len2))
          const nx = x1 + t*(x2-x1), ny = y1 + t*(y2-y1)
          return (nx-cx)**2 + (ny-cy)**2 > (ERASER_RADIUS * 2) ** 2
        }
        if (a.type === 'sticky' || a.type === 'text' || a.type === 'title') {
          const w = a.w || (a.type === 'title' ? 400 : 140), h = a.type === 'text' ? 28 : a.type === 'title' ? 60 : (a.h || 90)
          return !(cx >= (a.x||0) && cx <= (a.x||0)+w && cy >= (a.y||0) && cy <= (a.y||0)+h)
        }
        return true
      })
      if (next.length !== prev.length) {
        if (!eraserGestureRef.current) {
          // Push history once per mouse-down gesture
          annotHistoryRef.current = [...annotHistoryRef.current.slice(-30), prev]
          setCanUndo(true)
          eraserGestureRef.current = true
        }
        if (activeBoardId) try { localStorage.setItem(`mp_board_annots_${activeBoardId}`, JSON.stringify(next)) } catch {}
      }
      return next
    })
  }

  // ── Keyboard: Delete, Escape, Ctrl+Z ─────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Ctrl/Cmd + Z → undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault()
        const history = annotHistoryRef.current
        if (history.length === 0) return
        const prev = history[history.length - 1]
        annotHistoryRef.current = history.slice(0, -1)
        setCanUndo(annotHistoryRef.current.length > 0)
        setAnnotations(prev)
        setSelectedAnnotId(null)
        if (activeBoardId) try { localStorage.setItem(`mp_board_annots_${activeBoardId}`, JSON.stringify(prev)) } catch {}
        return
      }
      if (!selectedAnnotId) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        setAnnotations(prev => {
          const next = prev.filter(a => a.id !== selectedAnnotId)
          annotHistoryRef.current = [...annotHistoryRef.current.slice(-30), prev]
          setCanUndo(true)
          if (activeBoardId) try { localStorage.setItem(`mp_board_annots_${activeBoardId}`, JSON.stringify(next)) } catch {}
          return next
        })
        setSelectedAnnotId(null)
      }
      if (e.key === 'Escape') setSelectedAnnotId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedAnnotId, activeBoardId])

  function translateAnnot(a: Annot, dx: number, dy: number): Annot {
    if (a.type === 'sticky' || a.type === 'text' || a.type === 'title') return { ...a, x: (a.x || 0) + dx, y: (a.y || 0) + dy }
    if (a.type === 'arrow') return { ...a, x1: (a.x1||0)+dx, y1: (a.y1||0)+dy, x2: (a.x2||0)+dx, y2: (a.y2||0)+dy }
    if (a.type === 'pen') return { ...a, points: (a.points||[]).map((v,i) => v + (i%2===0 ? dx : dy)) }
    return a
  }

  function canvasCoords(e: React.MouseEvent): { x: number; y: number } {
    const outer = outerRef.current!
    const rect  = outer.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left + outer.scrollLeft) / zoom,
      y: (e.clientY - rect.top  + outer.scrollTop ) / zoom,
    }
  }

  function onDrawMouseDown(e: React.MouseEvent) {
    if (drawTool === 'none' || drawTool === 'eraser') return
    e.stopPropagation()
    const { x, y } = canvasCoords(e)
    if (drawTool === 'text' || drawTool === 'title' || drawTool === 'sticky') {
      if (drawPlacedRef.current) return
      drawPlacedRef.current = true
      const id = `a${Date.now()}`
      if (drawTool === 'text')   saveAnnots([...annotations, { id, type: 'text',   x, y, text: '', color: drawColor }])
      if (drawTool === 'title')  saveAnnots([...annotations, { id, type: 'title',  x, y, text: '', color: drawColor, fontSize: titleSize }])
      if (drawTool === 'sticky') saveAnnots([...annotations, { id, type: 'sticky', x, y, w: 140, h: 90, text: '', color: '#FEF3C7' }])
      setDrawTool('none')
      setTimeout(() => { drawPlacedRef.current = false; setEditAnnot(id) }, 80)
      return
    }
    if (drawTool === 'pen') {
      drawingRef.current = { type: 'pen', points: [x, y] }
      setInProgressDraw(null)
    }
    if (drawTool === 'arrow') {
      drawingRef.current = { type: 'arrow', x1: x, y1: y }
      setInProgressDraw({ id: 'preview', type: 'arrow', x1: x, y1: y, x2: x, y2: y, color: drawColor, width: drawWidth })
    }
  }

  function onDrawMouseMove(e: React.MouseEvent) {
    if (!drawingRef.current) return
    const { x, y } = canvasCoords(e)
    if (drawingRef.current.type === 'pen' && drawingRef.current.points) {
      // Subsample: only add point if moved enough (reduces jitter)
      const pts = drawingRef.current.points
      const last2 = pts.length - 2
      const ddx = x - pts[last2], ddy = y - pts[last2+1]
      if (ddx*ddx + ddy*ddy >= 4) {
        drawingRef.current.points = [...pts, x, y]
        setInProgressDraw({ id: 'preview', type: 'pen', points: [...drawingRef.current.points], color: drawColor, width: drawWidth })
      }
    }
    if (drawingRef.current.type === 'arrow') {
      setInProgressDraw({ id: 'preview', type: 'arrow', x1: drawingRef.current.x1, y1: drawingRef.current.y1, x2: x, y2: y, color: drawColor, width: drawWidth })
    }
  }

  function onDrawMouseUp(e: React.MouseEvent) {
    if (!drawingRef.current) return
    const { x, y } = canvasCoords(e)
    const dr = drawingRef.current
    if (dr.type === 'pen' && dr.points && dr.points.length >= 4) {
      saveAnnots([...annotations, { id: `a${Date.now()}`, type: 'pen', points: dr.points, color: drawColor, width: drawWidth }])
    }
    if (dr.type === 'arrow') {
      const ddx = x - (dr.x1 || 0); const ddy = y - (dr.y1 || 0)
      if (Math.sqrt(ddx*ddx + ddy*ddy) > 10) {
        saveAnnots([...annotations, { id: `a${Date.now()}`, type: 'arrow', x1: dr.x1, y1: dr.y1, x2: x, y2: y, color: drawColor, width: drawWidth }])
      }
    }
    drawingRef.current = null; setInProgressDraw(null)
  }

  // Annotation drag (select mode)
  function onAnnotMouseDown(e: React.MouseEvent, a: Annot) {
    if (drawTool !== 'none') return
    e.stopPropagation()
    setSelectedAnnotId(a.id)
    const orig: Annot = { ...a, points: a.points ? [...a.points] : undefined }
    annotDragRef.current = { id: a.id, startMX: e.clientX, startMY: e.clientY, orig }
  }

  function onAnnotMouseMove(e: React.MouseEvent) {
    if (!annotDragRef.current) return
    const { id, startMX, startMY, orig } = annotDragRef.current
    const dx = (e.clientX - startMX) / zoom
    const dy = (e.clientY - startMY) / zoom
    setAnnotations(prev => prev.map(a => a.id === id ? translateAnnot(orig, dx, dy) : a))
  }

  function onAnnotMouseUp() {
    if (!annotDragRef.current) return
    setAnnotations(prev => {
      if (activeBoardId) try { localStorage.setItem(`mp_board_annots_${activeBoardId}`, JSON.stringify(prev)) } catch {}
      return prev
    })
    annotDragRef.current = null
  }

  // Smooth Bezier pen path (quadratic midpoint curves)
  function penPath(points: number[]) {
    if (points.length < 4) return ''
    let d = `M${points[0]},${points[1]}`
    if (points.length === 4) return d + ` L${points[2]},${points[3]}`
    for (let i = 2; i < points.length - 2; i += 2) {
      const mx = (points[i] + points[i+2]) / 2
      const my = (points[i+1] + points[i+3]) / 2
      d += ` Q${points[i]},${points[i+1]} ${mx},${my}`
    }
    d += ` L${points[points.length-2]},${points[points.length-1]}`
    return d
  }

  // ── Minimap ──────────────────────────────────────────────────
  const mmW = 160; const mmH = 80
  const scaleX = mmW / CANVAS_W; const scaleY = mmH / CANVAS_H
  const [scrollX, setScrollX] = useState(0); const [scrollY, setScrollY] = useState(0)
  const [viewW,   setViewW]   = useState(0);  const [viewH,  setViewH]   = useState(0)
  useEffect(() => {
    const el = outerRef.current; if (!el) return
    const elRef = el
    function update() {
      setScrollX(elRef.scrollLeft * scaleX); setScrollY(elRef.scrollTop * scaleY)
      setViewW(elRef.clientWidth * scaleX / zoom); setViewH(elRef.clientHeight * scaleY / zoom)
    }
    update(); elRef.addEventListener('scroll', update); window.addEventListener('resize', update)
    return () => { elRef.removeEventListener('scroll', update); window.removeEventListener('resize', update) }
  }, [zoom, scaleX, scaleY])

  const drawToolCfg: { key: DrawTool; icon: string; title: string }[] = [
    { key: 'none',   icon: '↖',  title: 'Seleccionar y mover (S)' },
    { key: 'pen',    icon: '✏️', title: 'Lápiz libre (P)' },
    { key: 'arrow',  icon: '→',  title: 'Flecha / Conector (A)' },
    { key: 'sticky', icon: '📝', title: 'Post-it (N)' },
    { key: 'text',   icon: 'T',  title: 'Texto (X)' },
    { key: 'title',  icon: 'H1', title: 'Título grande (H)' },
    { key: 'eraser', icon: '⌫',  title: 'Borrador — clic en elemento para eliminar (E)' },
  ]
  const DRAW_COLORS = ['#5DE0E6','#F0F4FF','#EF4444','#22C55E','#F59E0B','#A78BFA','#FEF3C7','#111827']
  const DRAW_WIDTHS = [{ w: 1, label: 'Fino' }, { w: 2, label: 'Normal' }, { w: 4, label: 'Grueso' }, { w: 8, label: 'Marcador' }]
  const TITLE_SIZES = [{ s: 24, label: 'S' }, { s: 36, label: 'M' }, { s: 52, label: 'L' }, { s: 72, label: 'XL' }]
  const [titleSize, setTitleSize] = useState(36)

  const cursorStyle = drawTool === 'eraser' ? 'cell' : drawTool === 'pen' || drawTool === 'arrow' ? 'crosshair' : drawTool === 'sticky' || drawTool === 'text' || drawTool === 'title' ? 'copy' : 'default'

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Board tab strip ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderBottom: '1px solid rgba(93,224,230,.08)', background: '#0D1B2E', flexShrink: 0, overflowX: 'auto' }}>
        {boards.map(board => (
          <button key={board.id} onClick={() => onBoardChange(board.id)}
            style={{ ...btn, padding: '4px 12px', fontSize: 11, borderRadius: 6, flexShrink: 0,
              background: activeBoardId === board.id ? 'rgba(93,224,230,.15)' : 'transparent',
              border: activeBoardId === board.id ? '1px solid rgba(93,224,230,.4)' : '1px solid rgba(255,255,255,.06)',
              color: activeBoardId === board.id ? '#5DE0E6' : '#8899BB',
            }}>
            {board.is_definitive && <span style={{ color: '#22C55E', marginRight: 4 }}>★</span>}
            {board.name}
          </button>
        ))}
        <button onClick={() => setShowNewBoard(v => !v)}
          style={{ ...btn, background: 'rgba(93,224,230,.06)', border: '1px solid rgba(93,224,230,.15)', color: '#5DE0E6', padding: '4px 10px', fontSize: 11, flexShrink: 0 }}>
          + Tablero
        </button>
        {activeBoard && (
          <button onClick={async () => { setSettingDef(true); await onSetDefinitive(activeBoard.id); setSettingDef(false) }}
            disabled={settingDef || activeBoard.is_definitive}
            style={{ ...btn, background: activeBoard.is_definitive ? 'rgba(34,197,94,.1)' : 'transparent', border: `1px solid ${activeBoard.is_definitive ? 'rgba(34,197,94,.3)' : 'rgba(255,255,255,.08)'}`, color: activeBoard.is_definitive ? '#22C55E' : '#8899BB', padding: '4px 10px', fontSize: 10, flexShrink: 0 }}>
            {activeBoard.is_definitive ? '★ DEFINITIVO' : 'Marcar Definitivo'}
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={() => onNew(activeBoardId)}
          style={{ ...btn, background: 'linear-gradient(90deg,#004AAD,#5DE0E6)', color: '#fff', padding: '5px 14px', fontSize: 11, flexShrink: 0 }}>
          + Nueva pieza
        </button>
      </div>

      {/* New board form */}
      {showNewBoard && (
        <div style={{ display: 'flex', gap: 8, padding: '8px 12px', background: '#0D1B2E', borderBottom: '1px solid rgba(93,224,230,.08)', flexShrink: 0 }}>
          <input value={newBoardName} onChange={e => setNewBoardName(e.target.value)} placeholder='Nombre del tablero…' style={{ ...inp, flex: 1, fontSize: 12, padding: '5px 10px' }} />
          <select value={copyFrom ?? ''} onChange={e => setCopyFrom(e.target.value || null)} style={{ ...inp, width: 160, fontSize: 11, padding: '5px 8px' }}>
            <option value=''>Tablero vacío</option>
            {boards.map(b => <option key={b.id} value={b.id}>Copiar de: {b.name}</option>)}
          </select>
          <button onClick={handleCreateBoard} disabled={creatingBoard} style={{ ...btn, background: '#5DE0E6', color: '#0A1628', padding: '5px 14px', fontSize: 12 }}>{creatingBoard ? '…' : 'Crear'}</button>
          <button onClick={() => setShowNewBoard(false)} style={{ ...btn, background: 'transparent', border: '1px solid rgba(136,153,187,.2)', color: '#8899BB', padding: '5px 10px', fontSize: 12 }}>✕</button>
        </div>
      )}

      {/* ── Toolbar row: filters + draw tools + zoom ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderBottom: '1px solid rgba(93,224,230,.06)', background: '#111827', flexShrink: 0, flexWrap: 'wrap' }}>
        {/* Filters */}
        <select value={filterMonth}   onChange={e => setFilterMonth(e.target.value)}   style={{ ...inp, width: 110, fontSize: 11, padding: '3px 7px' }}>
          <option value=''>Todos los meses</option>
          {months.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={filterPillar}  onChange={e => setFilterPillar(e.target.value)}  style={{ ...inp, width: 120, fontSize: 11, padding: '3px 7px' }}>
          <option value=''>Todos los pilares</option>
          {Object.entries(PILLAR_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterStatus}  onChange={e => setFilterStatus(e.target.value)}  style={{ ...inp, width: 120, fontSize: 11, padding: '3px 7px' }}>
          <option value=''>Todos los estados</option>
          {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>

        <div style={{ width: 1, height: 20, background: 'rgba(93,224,230,.15)' }} />

        {/* Draw tools */}
        <div style={{ display: 'flex', gap: 2, background: 'rgba(93,224,230,.04)', borderRadius: 8, padding: 2 }}>
          {drawToolCfg.map(t => (
            <button key={t.key} onClick={() => setDrawTool(t.key)} title={t.title}
              style={{ ...btn, width: 30, height: 30, borderRadius: 6, fontSize: 14,
                background: drawTool === t.key ? 'rgba(93,224,230,.2)' : 'transparent',
                outline: drawTool === t.key ? '1.5px solid rgba(93,224,230,.5)' : 'none',
                color: drawTool === t.key ? '#5DE0E6' : '#8899BB',
              }}>
              {t.icon}
            </button>
          ))}
        </div>

        {/* Color picker for draw */}
        {drawTool !== 'none' && drawTool !== 'eraser' && (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {DRAW_COLORS.map(c => (
              <button key={c} onClick={() => setDrawColor(c)}
                style={{ width: 18, height: 18, borderRadius: 4, background: c, border: drawColor === c ? '2px solid #fff' : '2px solid transparent', cursor: 'pointer', padding: 0 }} />
            ))}
          </div>
        )}

        {/* Title size selector */}
        {drawTool === 'title' && (
          <div style={{ display: 'flex', gap: 3, alignItems: 'center', background: 'rgba(93,224,230,.04)', borderRadius: 7, padding: '3px 5px' }}>
            {TITLE_SIZES.map(({ s, label }) => (
              <button key={s} onClick={() => setTitleSize(s)} title={`${s}px`}
                style={{ width: 30, height: 28, borderRadius: 5, cursor: 'pointer', fontWeight: 900, fontSize: s > 48 ? 10 : 11, fontFamily: 'Montserrat,sans-serif',
                  background: titleSize === s ? 'rgba(93,224,230,.18)' : 'transparent',
                  border: titleSize === s ? '1px solid rgba(93,224,230,.5)' : '1px solid transparent',
                  color: titleSize === s ? '#5DE0E6' : '#8899BB' }}>
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Stroke width presets (pen / arrow only) */}
        {(drawTool === 'pen' || drawTool === 'arrow') && (
          <div style={{ display: 'flex', gap: 3, alignItems: 'center', background: 'rgba(93,224,230,.04)', borderRadius: 7, padding: '3px 5px' }}>
            {DRAW_WIDTHS.map(({ w, label }) => (
              <button key={w} onClick={() => setDrawWidth(w)} title={label}
                style={{ width: 30, height: 28, borderRadius: 5, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                  background: drawWidth === w ? 'rgba(93,224,230,.18)' : 'transparent',
                  border: drawWidth === w ? '1px solid rgba(93,224,230,.5)' : '1px solid transparent' }}>
                <div style={{ width: 16, height: Math.min(w, 6), background: drawWidth === w ? '#5DE0E6' : '#8899BB', borderRadius: 3 }} />
              </button>
            ))}
          </div>
        )}

        {/* Eraser: clear all + hint */}
        {drawTool === 'eraser' && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: '#8899BB' }}>Clic en elemento para borrar</span>
            <button onClick={() => { saveAnnots([]); setSelectedAnnotId(null) }}
              style={{ ...btn, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', color: '#EF4444', padding: '3px 10px', fontSize: 11 }}>
              Borrar todo
            </button>
          </div>
        )}

        {/* Selected annotation: delete button */}
        {drawTool === 'none' && selectedAnnotId && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', background: 'rgba(93,224,230,.06)', border: '1px solid rgba(93,224,230,.2)', borderRadius: 7, padding: '3px 10px' }}>
            <span style={{ fontSize: 10, color: '#5DE0E6' }}>1 elemento seleccionado</span>
            <button onClick={() => { saveAnnots(annotations.filter(a => a.id !== selectedAnnotId)); setSelectedAnnotId(null) }}
              style={{ ...btn, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)', color: '#EF4444', padding: '2px 8px', fontSize: 10 }}>
              🗑 Eliminar (Del)
            </button>
            <button onClick={() => setSelectedAnnotId(null)}
              style={{ ...btn, background: 'transparent', border: 'none', color: '#8899BB', padding: '2px 6px', fontSize: 11 }}>
              ✕
            </button>
          </div>
        )}

        {/* Undo */}
        <button onClick={undoAnnot} disabled={!canUndo} title='Deshacer (Ctrl+Z)'
          style={{ ...btn, background: canUndo ? 'rgba(93,224,230,.06)' : 'transparent', border: `1px solid ${canUndo ? 'rgba(93,224,230,.2)' : 'rgba(93,224,230,.08)'}`, color: canUndo ? '#5DE0E6' : '#556080', padding: '3px 10px', fontSize: 11, opacity: canUndo ? 1 : .5 }}>
          ↩ Deshacer
        </button>

        <div style={{ flex: 1 }} />

        {/* Zoom */}
        <button onClick={() => setZoom(z => Math.max(.3, +(z - .1).toFixed(1)))} style={{ ...btn, background: 'rgba(93,224,230,.06)', border: '1px solid rgba(93,224,230,.15)', color: '#5DE0E6', width: 28, height: 28, fontSize: 16 }}>−</button>
        <span style={{ fontSize: 11, color: '#8899BB', minWidth: 36, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.min(2,  +(z + .1).toFixed(1)))} style={{ ...btn, background: 'rgba(93,224,230,.06)', border: '1px solid rgba(93,224,230,.15)', color: '#5DE0E6', width: 28, height: 28, fontSize: 16 }}>+</button>
        <button onClick={() => setZoom(1)} style={{ ...btn, background: 'transparent', border: '1px solid rgba(93,224,230,.1)', color: '#8899BB', padding: '3px 8px', fontSize: 10 }}>Reset</button>
      </div>

      {/* ── Main canvas area ── */}
      <div ref={outerRef} style={{ flex: 1, overflow: 'auto', position: 'relative', background: '#0A1628', cursor: cursorStyle }}
        onMouseDown={e => {
          if (drawTool === 'eraser') {
            eraserHeldRef.current = true
            eraserGestureRef.current = false
            eraseAtPoint(canvasCoords(e).x, canvasCoords(e).y)
          }
        }}
        onMouseMove={e => {
          onMouseMove(e)
          if (drawingRef.current) onDrawMouseMove(e)
          if (annotDragRef.current) onAnnotMouseMove(e)
          if (drawTool === 'eraser') {
            const { x, y } = canvasCoords(e)
            setEraserPos({ x, y })
            if (eraserHeldRef.current) eraseAtPoint(x, y)
          }
        }}
        onMouseUp={e => {
          onMouseUp(); onDrawMouseUp(e); onAnnotMouseUp()
          eraserHeldRef.current = false; eraserGestureRef.current = false
        }}
        onMouseLeave={() => {
          onMouseUp(); drawingRef.current = null; setInProgressDraw(null); onAnnotMouseUp()
          eraserHeldRef.current = false; eraserGestureRef.current = false
          setEraserPos(null)
        }}
        onClick={e => { if (e.target === e.currentTarget || (e.target as HTMLElement).closest?.('[data-canvas]')) setSelectedAnnotId(null) }}
      >
        {/* Scaled canvas */}
        <div ref={canvasRef} style={{ position: 'relative', width: CANVAS_W * zoom, height: CANVAS_H * zoom, flexShrink: 0 }}>
          {/* Inner canvas at native coordinates, scaled via CSS */}
          <div style={{ position: 'absolute', top: 0, left: 0, width: CANVAS_W, height: CANVAS_H, transformOrigin: 'top left', transform: `scale(${zoom})` }}>

            {/* Dot grid background */}
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
              <defs>
                <pattern id='bdots' width={24} height={24} patternUnits='userSpaceOnUse'>
                  <circle cx={1.5} cy={1.5} r={1.5} fill='rgba(93,224,230,0.13)' />
                </pattern>
              </defs>
              <rect width='100%' height='100%' fill='url(#bdots)' />
            </svg>

            {/* Alignment guide lines */}
            {guides.map((g, i) => g.axis === 'x' ? (
              <div key={i} style={{ position: 'absolute', left: g.pos, top: 0, width: 1, height: CANVAS_H, background: 'rgba(93,224,230,.65)', pointerEvents: 'none', zIndex: 20 }} />
            ) : (
              <div key={i} style={{ position: 'absolute', top: g.pos, left: 0, height: 1, width: CANVAS_W, background: 'rgba(93,224,230,.65)', pointerEvents: 'none', zIndex: 20 }} />
            ))}

            {/* Eraser cursor indicator */}
            {drawTool === 'eraser' && eraserPos && (
              <div style={{
                position: 'absolute',
                left: eraserPos.x - ERASER_RADIUS, top: eraserPos.y - ERASER_RADIUS,
                width: ERASER_RADIUS * 2, height: ERASER_RADIUS * 2,
                borderRadius: '50%',
                border: `2px solid ${eraserHeldRef.current ? '#EF4444' : 'rgba(239,68,68,.5)'}`,
                background: eraserHeldRef.current ? 'rgba(239,68,68,.12)' : 'rgba(239,68,68,.04)',
                pointerEvents: 'none', zIndex: 30, transition: 'background .1s',
              }} />
            )}

            {/* ── Annotation layer (SVG: pen + arrows) ── */}
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 15, overflow: 'visible' }}>
              <defs>
                <marker id='arrowhead' markerWidth='8' markerHeight='8' refX='6' refY='3' orient='auto'>
                  <path d='M0,0 L0,6 L8,3 z' fill='currentColor' />
                </marker>
              </defs>
              {annotations.filter(a => a.type === 'pen').map(a => {
                const isSel = selectedAnnotId === a.id
                const w = a.width || 2
                return (
                  <g key={a.id}>
                    {isSel && <path d={penPath(a.points||[])} stroke='rgba(93,224,230,.5)' strokeWidth={w+10} fill='none' strokeLinecap='round' strokeLinejoin='round' />}
                    <path d={penPath(a.points||[])} stroke={a.color} strokeWidth={w} fill='none' strokeLinecap='round' strokeLinejoin='round'
                      style={{ pointerEvents: drawTool === 'none' || drawTool === 'eraser' ? 'auto' : 'none', cursor: drawTool === 'eraser' ? 'cell' : drawTool === 'none' ? 'grab' : 'default' }}
                      onClick={e => { e.stopPropagation(); if (drawTool === 'eraser') { saveAnnots(annotations.filter(x => x.id !== a.id)); return } }}
                      onMouseDown={e => onAnnotMouseDown(e, a)}
                    />
                  </g>
                )
              })}
              {annotations.filter(a => a.type === 'arrow').map(a => {
                const isSel = selectedAnnotId === a.id
                const w = a.width || 2
                return (
                  <g key={a.id}>
                    {isSel && <line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke='rgba(93,224,230,.5)' strokeWidth={w+10} strokeLinecap='round' />}
                    <line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2}
                      stroke={a.color} strokeWidth={w} strokeLinecap='round'
                      markerEnd='url(#arrowhead)' style={{ color: a.color, pointerEvents: drawTool === 'none' || drawTool === 'eraser' ? 'auto' : 'none', cursor: drawTool === 'eraser' ? 'cell' : drawTool === 'none' ? 'grab' : 'default' }}
                      onClick={e => { e.stopPropagation(); if (drawTool === 'eraser') { saveAnnots(annotations.filter(x => x.id !== a.id)); return } }}
                      onMouseDown={e => onAnnotMouseDown(e, a)}
                    />
                  </g>
                )
              })}
              {/* In-progress drawing preview */}
              {inProgressDraw?.type === 'pen' && (
                <path d={penPath(inProgressDraw.points || [])} stroke={drawColor} strokeWidth={drawWidth} fill='none' strokeLinecap='round' strokeLinejoin='round' opacity={0.7} />
              )}
              {inProgressDraw?.type === 'arrow' && (
                <line x1={inProgressDraw.x1} y1={inProgressDraw.y1} x2={inProgressDraw.x2} y2={inProgressDraw.y2}
                  stroke={drawColor} strokeWidth={drawWidth} strokeLinecap='round'
                  strokeDasharray='5 3' markerEnd='url(#arrowhead)' style={{ color: drawColor }} />
              )}
            </svg>

            {/* ── Title annotations ── */}
            {annotations.filter(a => a.type === 'title').map(a => {
              const isSel = selectedAnnotId === a.id
              const fs = a.fontSize || 36
              return (
                <div key={a.id} style={{
                  position: 'absolute', left: a.x, top: a.y, zIndex: isSel ? 22 : 17,
                  minWidth: 200, maxWidth: 800,
                  cursor: editAnnot === a.id ? 'text' : drawTool === 'none' ? 'grab' : drawTool === 'eraser' ? 'cell' : 'default',
                  outline: isSel ? '2px solid rgba(93,224,230,.7)' : 'none',
                  borderRadius: 4, padding: '4px 8px',
                  pointerEvents: 'auto', userSelect: editAnnot === a.id ? 'text' : 'none',
                }}
                  onMouseDown={e => {
                    if (editAnnot === a.id) return
                    if (drawTool === 'eraser') { saveAnnots(annotations.filter(x => x.id !== a.id)); return }
                    if (drawTool === 'none') onAnnotMouseDown(e, a)
                  }}
                  onDoubleClick={e => { e.stopPropagation(); setEditAnnot(a.id) }}
                >
                  {editAnnot === a.id ? (
                    <input autoFocus value={a.text || ''}
                      onChange={e => setAnnotations(prev => prev.map(x => x.id === a.id ? { ...x, text: e.target.value } : x))}
                      onBlur={e => {
                        saveAnnots(annotations.map(x => x.id === a.id ? { ...x, text: e.target.value } : x))
                        setEditAnnot(null)
                      }}
                      onMouseDown={e => e.stopPropagation()}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditAnnot(null) }}
                      style={{ background: 'transparent', border: 'none', outline: 'none', width: '100%',
                        fontSize: fs, fontWeight: 900, fontFamily: 'Montserrat,sans-serif', color: a.color,
                        letterSpacing: '-0.02em', lineHeight: 1.1, userSelect: 'text' }}
                    />
                  ) : (
                    <span style={{ fontSize: fs, fontWeight: 900, color: a.color, letterSpacing: '-0.02em',
                      lineHeight: 1.1, whiteSpace: 'nowrap', display: 'block',
                      textShadow: '0 2px 12px rgba(0,0,0,.4)' }}>
                      {a.text || 'Título'}
                    </span>
                  )}
                </div>
              )
            })}

            {/* ── Sticky note & text annotations ── */}
            {annotations.filter(a => a.type === 'sticky' || a.type === 'text').map(a => {
              const isSel = selectedAnnotId === a.id
              const isLight = a.color === '#FEF3C7' || a.color === '#D1FAE5' || a.color === '#DBEAFE' || a.color === '#F0F4FF'
              return (
                <div key={a.id} style={{
                  position: 'absolute', left: a.x, top: a.y, zIndex: isSel ? 22 : 18,
                  ...(a.type === 'sticky' ? {
                    width: a.w || 140, minHeight: a.h || 90,
                    background: a.color, borderRadius: 4, padding: 8,
                    boxShadow: isSel ? `0 0 0 2px #5DE0E6, 2px 4px 16px rgba(0,0,0,.4)` : '2px 4px 12px rgba(0,0,0,.3)',
                    cursor: drawTool === 'none' ? 'grab' : drawTool === 'eraser' ? 'cell' : 'default',
                  } : {
                    cursor: drawTool === 'none' ? 'grab' : drawTool === 'eraser' ? 'cell' : 'default',
                    color: a.color, fontWeight: 700, fontSize: 13,
                    outline: isSel ? '2px solid rgba(93,224,230,.7)' : 'none', borderRadius: 3,
                  }),
                  pointerEvents: 'auto',
                  userSelect: editAnnot === a.id ? 'text' : 'none',
                  cursor: editAnnot === a.id ? 'text' : drawTool === 'none' ? 'grab' : drawTool === 'eraser' ? 'cell' : 'default',
                }}
                  onMouseDown={e => {
                    if (editAnnot === a.id) return
                    if (drawTool === 'eraser') { saveAnnots(annotations.filter(x => x.id !== a.id)); return }
                    if (drawTool === 'none') onAnnotMouseDown(e, a)
                  }}
                  onDoubleClick={e => { e.stopPropagation(); setEditAnnot(a.id) }}
                >
                  {editAnnot === a.id ? (
                    <textarea autoFocus value={a.text || ''}
                      onChange={e => setAnnotations(prev => prev.map(x => x.id === a.id ? { ...x, text: e.target.value } : x))}
                      onBlur={e => {
                        saveAnnots(annotations.map(x => x.id === a.id ? { ...x, text: e.target.value } : x))
                        setEditAnnot(null)
                      }}
                      onMouseDown={e => e.stopPropagation()}
                      onKeyDown={e => { if (e.key === 'Escape') setEditAnnot(null) }}
                      style={{ background: 'transparent', border: 'none', outline: 'none', resize: 'none', width: '100%', minHeight: 60, fontSize: 12, fontFamily: 'Montserrat,sans-serif', color: isLight ? '#0A1628' : '#F0F4FF', userSelect: 'text' }} />
                  ) : (
                    <span style={{ fontSize: 12, color: isLight ? '#0A1628' : '#F0F4FF', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5 }}>
                      {a.text || ''}
                    </span>
                  )}
                </div>
              )
            })}

            {/* ── Piece cards ── */}
            {visible.map(piece => {
              const pos = positions[piece.id] || { x: 40, y: 40 }
              const pc  = PILLAR_CFG[piece.pillar] || PILLAR_CFG.autoridad
              const fc  = FORMAT_CFG[piece.format]
              const sc  = STATUS_CFG[piece.status] || STATUS_CFG.borrador
              const isInline = inlineEdit?.id === piece.id
              return (
                <div key={piece.id}
                  style={{
                    position: 'absolute', left: pos.x, top: pos.y,
                    width: BLOCK_W, height: BLOCK_H,
                    background: '#111827', border: `1.5px solid ${pc.border}`,
                    borderRadius: 12, padding: '10px 12px',
                    cursor: drawTool !== 'none' ? 'crosshair' : 'grab',
                    userSelect: 'none', boxSizing: 'border-box',
                    boxShadow: '0 2px 12px rgba(0,0,0,.3)',
                    display: 'flex', flexDirection: 'column', gap: 4,
                    zIndex: 10,
                  }}
                  onMouseDown={e => drawTool === 'none' && onMouseDown(e, piece.id)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 16 }}>{fc?.emoji ?? '📝'}</span>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <span style={{ fontSize: 9, fontWeight: 700, background: sc.bg, color: sc.color, padding: '2px 6px', borderRadius: 20 }}>{sc.label}</span>
                      <button onMouseDown={e => e.stopPropagation()} onClick={() => onEdit(piece)}
                        style={{ ...btn, background: 'none', color: '#8899BB', fontSize: 13, padding: 0, lineHeight: 1 }}>✏️</button>
                    </div>
                  </div>
                  {isInline ? (
                    <input autoFocus value={inlineEdit.title} onChange={e => setInlineEdit({ id: piece.id, title: e.target.value })}
                      onBlur={saveInlineTitle} onKeyDown={e => { if (e.key === 'Enter') saveInlineTitle(); if (e.key === 'Escape') setInlineEdit(null) }}
                      onMouseDown={e => e.stopPropagation()} style={{ ...inp, fontSize: 11, padding: '3px 6px', height: 24 }} />
                  ) : (
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#F0F4FF', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
                      onDoubleClick={e => { e.stopPropagation(); setInlineEdit({ id: piece.id, title: piece.title }) }} title='Doble clic para editar'>
                      {piece.title}
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'auto' }}>
                    <div>
                      <div style={{ fontSize: 9, color: '#8899BB' }}>{fmtDate(piece.publish_date)} {piece.publish_time?.slice(0, 5) ?? ''}</div>
                      <span style={{ fontSize: 9, fontWeight: 700, background: pc.bg, color: pc.color, padding: '1px 5px', borderRadius: 20, display: 'inline-block', marginTop: 2 }}>{pc.label}</span>
                    </div>
                    {piece.funnel_stage && (
                      <span style={{ fontSize: 8, fontWeight: 800, background: FUNNEL_CFG[piece.funnel_stage]?.bg ?? 'transparent', color: FUNNEL_CFG[piece.funnel_stage]?.color ?? '#8899BB', padding: '2px 5px', borderRadius: 20 }}>
                        {FUNNEL_CFG[piece.funnel_stage]?.label}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}

            {/* Draw overlay — captures events for all draw tools */}
            {drawTool !== 'none' && drawTool !== 'eraser' && (
              <div data-canvas='1' style={{ position: 'absolute', inset: 0, zIndex: 25, cursor: cursorStyle }}
                onMouseDown={onDrawMouseDown}
                onMouseMove={onDrawMouseMove}
                onMouseUp={onDrawMouseUp}
              />
            )}
          </div>
        </div>

        {/* Minimap */}
        <div style={{ position: 'sticky', bottom: 12, left: '100%', marginRight: 12, width: mmW + 2, height: mmH + 2, background: 'rgba(13,25,38,.9)', border: '1px solid rgba(93,224,230,.15)', borderRadius: 8, overflow: 'hidden', pointerEvents: 'none' }}>
          {visible.map(piece => {
            const pos = positions[piece.id] || { x: 0, y: 0 }
            const pc  = PILLAR_CFG[piece.pillar] || PILLAR_CFG.autoridad
            return (
              <div key={piece.id} style={{ position: 'absolute', left: pos.x * scaleX, top: pos.y * scaleY, width: BLOCK_W * scaleX, height: BLOCK_H * scaleY, background: pc.color, borderRadius: 1, opacity: .7 }} />
            )
          })}
          <div style={{ position: 'absolute', left: scrollX, top: scrollY, width: viewW, height: viewH, border: '1px solid rgba(93,224,230,.6)', borderRadius: 2, pointerEvents: 'none' }} />
        </div>
      </div>
    </div>
  )
}
// ============================================================
// CALENDAR TAB
// ============================================================
interface CalendarTabProps {
  pieces: ContentPiece[]
  companyId: string
  onEdit: (p: ContentPiece) => void
  onRefresh: () => void
}

function CalendarTab({ pieces, onEdit, companyId, onRefresh }: CalendarTabProps) {
  const now = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth()) // 0-indexed
  const [draggingId, setDraggingId] = useState<string | null>(null)

  const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
  const DAY_NAMES   = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  function piecesForDay(d: number) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    return pieces.filter(p => p.publish_date?.startsWith(dateStr))
  }

  async function dropOnDay(d: number) {
    if (!draggingId) return
    const newDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    await supabase.rpc('update_content_piece', {
      p_data: { id: draggingId, company_id: companyId, publish_date: newDate },
    })
    setDraggingId(null)
    onRefresh()
  }

  function prevMonth() { if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1) }
  function nextMonth() { if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1) }

  return (
    <div>
      {/* Month selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={prevMonth} style={{ ...btn, background: 'rgba(93,224,230,.08)', border: '1px solid rgba(93,224,230,.15)', color: '#5DE0E6', width: 32, height: 32, fontSize: 16 }}>‹</button>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#F0F4FF', minWidth: 180, textAlign: 'center' }}>{MONTH_NAMES[month]} {year}</div>
        <button onClick={nextMonth} style={{ ...btn, background: 'rgba(93,224,230,.08)', border: '1px solid rgba(93,224,230,.15)', color: '#5DE0E6', width: 32, height: 32, fontSize: 16 }}>›</button>
      </div>

      {/* Grid header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 4 }}>
        {DAY_NAMES.map(d => <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: '#8899BB', padding: '4px 0' }}>{d}</div>)}
      </div>

      {/* Grid days */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
        {cells.map((day, i) => {
          const dayPieces = day ? piecesForDay(day) : []
          const isToday = day !== null && new Date().getDate() === day && new Date().getMonth() === month && new Date().getFullYear() === year
          return (
            <div key={i}
              style={{ minHeight: 80, background: day ? '#111827' : 'transparent', border: day ? (isToday ? '1.5px solid rgba(93,224,230,.5)' : '1px solid rgba(93,224,230,.08)') : 'none', borderRadius: 8, padding: day ? '6px 7px' : 0, position: 'relative' }}
              onDragOver={e => { if (day) e.preventDefault() }}
              onDrop={() => { if (day) dropOnDay(day) }}
            >
              {day && (
                <>
                  <div style={{ fontSize: 11, fontWeight: 700, color: isToday ? '#5DE0E6' : '#8899BB', marginBottom: 4 }}>{day}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {dayPieces.slice(0, 3).map(p => {
                      const pc = PILLAR_CFG[p.pillar] || PILLAR_CFG.autoridad
                      return (
                        <div key={p.id}
                          draggable
                          onDragStart={() => setDraggingId(p.id)}
                          onDragEnd={() => setDraggingId(null)}
                          onClick={() => onEdit(p)}
                          style={{ background: pc.bg, color: pc.color, fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 4, cursor: 'pointer', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}
                        >
                          {FORMAT_CFG[p.format]?.emoji} {p.title}
                        </div>
                      )
                    })}
                    {dayPieces.length > 3 && <div style={{ fontSize: 9, color: '#8899BB' }}>+{dayPieces.length - 3} más</div>}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================
// LIST TAB
// ============================================================
interface ListTabProps {
  pieces: ContentPiece[]
  onEdit: (p: ContentPiece) => void
}

function ListTab({ pieces, onEdit }: ListTabProps) {
  const [filterMonth,  setFilterMonth]  = useState('')
  const [filterPillar, setFilterPillar] = useState('')
  const [filterFormat, setFilterFormat] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [search,       setSearch]       = useState('')
  const [selected,     setSelected]     = useState<Set<string>>(new Set())

  const months = Array.from(new Set(pieces.map(p => p.publish_date?.slice(0, 7)).filter(Boolean))).sort()

  const visible = pieces.filter(p => {
    if (filterMonth  && p.publish_date?.slice(0, 7) !== filterMonth)  return false
    if (filterPillar && p.pillar !== filterPillar) return false
    if (filterFormat && p.format !== filterFormat) return false
    if (filterStatus && p.status !== filterStatus) return false
    if (search && !p.title.toLowerCase().includes(search.toLowerCase()) && !(p.hook ?? '').toLowerCase().includes(search.toLowerCase())) return false
    return true
  }).sort((a, b) => a.publish_date < b.publish_date ? -1 : 1)

  function toggleSelect(id: string) {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }
  function toggleAll() {
    if (selected.size === visible.length) setSelected(new Set())
    else setSelected(new Set(visible.map(p => p.id)))
  }

  function exportCSV() {
    const rows = [['Fecha','Hora','Formato','Pilar','Título','Hook','CTA','Estado']]
    visible.forEach(p => rows.push([
      p.publish_date, p.publish_time ?? '', p.format, p.pillar,
      p.title, p.hook ?? '', p.cta ?? '', p.status,
    ]))
    const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a'); a.href = url; a.download = 'contenido.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder='Buscar...' style={{ ...inp, flex: 1, minWidth: 140 }} />
        <select value={filterMonth}  onChange={e => setFilterMonth(e.target.value)}  style={{ ...inp, width: 130 }}>
          <option value=''>Todos los meses</option>
          {months.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={filterPillar} onChange={e => setFilterPillar(e.target.value)} style={{ ...inp, width: 130 }}>
          <option value=''>Todos los pilares</option>
          {Object.entries(PILLAR_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterFormat} onChange={e => setFilterFormat(e.target.value)} style={{ ...inp, width: 120 }}>
          <option value=''>Todos los formatos</option>
          {Object.entries(FORMAT_CFG).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...inp, width: 130 }}>
          <option value=''>Todos los estados</option>
          {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button onClick={exportCSV} style={{ ...btn, background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.2)', color: '#22C55E', padding: '7px 14px', fontSize: 11 }}>
          ↓ CSV
        </button>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(93,224,230,.1)' }}>
              <th style={{ padding: '8px 10px', textAlign: 'left', color: '#8899BB', fontWeight: 600, fontSize: 10 }}>
                <input type='checkbox' checked={selected.size === visible.length && visible.length > 0} onChange={toggleAll} />
              </th>
              {['Fecha','Hora','Formato','Pilar','Título','Hook','CTA','Estado'].map(h => (
                <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: '#8899BB', fontWeight: 600, fontSize: 10, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map(p => {
              const pc = PILLAR_CFG[p.pillar] || PILLAR_CFG.autoridad
              const sc = STATUS_CFG[p.status] || STATUS_CFG.borrador
              const fc = FORMAT_CFG[p.format]
              return (
                <tr key={p.id} onClick={() => onEdit(p)}
                  style={{ borderBottom: '1px solid rgba(93,224,230,.05)', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(93,224,230,.04)'}
                  onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}
                >
                  <td style={{ padding: '8px 10px' }} onClick={e => { e.stopPropagation(); toggleSelect(p.id) }}>
                    <input type='checkbox' checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} />
                  </td>
                  <td style={{ padding: '8px 10px', color: '#F0F4FF', whiteSpace: 'nowrap' }}>{fmtDate(p.publish_date)}</td>
                  <td style={{ padding: '8px 10px', color: '#8899BB', whiteSpace: 'nowrap' }}>{p.publish_time?.slice(0, 5) ?? '—'}</td>
                  <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{fc?.emoji} {fc?.label ?? p.format}</td>
                  <td style={{ padding: '8px 10px' }}>
                    <span style={{ background: pc.bg, color: pc.color, fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, whiteSpace: 'nowrap' }}>{pc.label}</span>
                  </td>
                  <td style={{ padding: '8px 10px', color: '#F0F4FF', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</td>
                  <td style={{ padding: '8px 10px', color: '#8899BB', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.hook ?? '—'}</td>
                  <td style={{ padding: '8px 10px', color: '#8899BB', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.cta ?? '—'}</td>
                  <td style={{ padding: '8px 10px' }}>
                    <span style={{ background: sc.bg, color: sc.color, fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, whiteSpace: 'nowrap' }}>{sc.label}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {visible.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px 0', color: '#8899BB', fontSize: 12 }}>No hay piezas con estos filtros</div>
        )}
      </div>

      {selected.size > 0 && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#111827', border: '1px solid rgba(93,224,230,.2)', borderRadius: 12, padding: '10px 20px', display: 'flex', gap: 12, alignItems: 'center', zIndex: 50 }}>
          <span style={{ fontSize: 12, color: '#5DE0E6' }}>{selected.size} seleccionadas</span>
          {Object.entries(STATUS_CFG).map(([k, v]) => (
            <button key={k} onClick={async () => {
              await Promise.all(Array.from(selected).map(id => supabase.rpc('update_content_piece', { p_data: { id, company_id: '', status: k } })))
              setSelected(new Set())
            }} style={{ ...btn, background: v.bg, color: v.color, padding: '5px 12px', fontSize: 11 }}>→ {v.label}</button>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================
// PACKS TAB
// ============================================================
interface PacksTabProps {
  packs: ContentPack[]
  companyId: string
  onRefresh: () => void
}

function PacksTab({ packs, companyId, onRefresh }: PacksTabProps) {
  const [editing, setEditing] = useState<ContentPack | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', price: '', real_value: '', valid_until: '', items: '' })
  const [saving, setSaving] = useState(false)

  function packStatus(p: ContentPack) {
    if (!p.valid_until) return 'activo'
    const d = new Date(p.valid_until)
    const now = new Date()
    if (d < now) return 'vencido'
    const diff = (d.getTime() - now.getTime()) / 86400000
    return diff <= 30 ? 'proximo' : 'activo'
  }
  const statusColors = { activo: { color: '#22C55E', bg: 'rgba(34,197,94,.1)' }, vencido: { color: '#EF4444', bg: 'rgba(239,68,68,.1)' }, proximo: { color: '#F59E0B', bg: 'rgba(245,158,11,.1)' } }

  function startEdit(p: ContentPack) {
    setEditing(p)
    setForm({ name: p.name, price: String(p.price), real_value: String(p.real_value ?? ''), valid_until: p.valid_until ?? '', items: (p.items ?? []).join('\n') })
  }
  function startCreate() {
    setEditing(null); setCreating(true)
    setForm({ name: '', price: '', real_value: '', valid_until: '', items: '' })
  }

  async function save() {
    setSaving(true)
    const payload = {
      company_id: companyId,
      name: form.name,
      price: parseFloat(form.price) || 0,
      real_value: parseFloat(form.real_value) || null,
      savings: form.real_value && form.price ? (parseFloat(form.real_value) - parseFloat(form.price)) : null,
      valid_until: form.valid_until || null,
      items: form.items.split('\n').map(s => s.trim()).filter(Boolean),
    }
    if (editing) {
      await supabase.from('content_packs').update(payload).eq('id', editing.id).eq('company_id', companyId)
    } else {
      await supabase.from('content_packs').insert(payload)
    }
    setSaving(false); setEditing(null); setCreating(false); onRefresh()
  }

  async function del(id: string) {
    if (!confirm('¿Eliminar este pack?')) return
    await supabase.from('content_packs').delete().eq('id', id).eq('company_id', companyId)
    onRefresh()
  }

  const isFormOpen = editing !== null || creating

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#F0F4FF' }}>Packs y Promociones</div>
        <button onClick={startCreate} style={{ ...btn, background: 'linear-gradient(90deg,#004AAD,#5DE0E6)', color: '#fff', padding: '7px 16px', fontSize: 12 }}>+ Nuevo pack</button>
      </div>

      {isFormOpen && (
        <div style={{ background: '#1E2A3A', border: '1px solid rgba(93,224,230,.15)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>{editing ? 'Editar pack' : 'Nuevo pack'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={lbl}>Nombre del pack</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inp} placeholder='Pack Bienestar Activo' />
            </div>
            <div>
              <label style={lbl}>Precio (CLP)</label>
              <input type='number' value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} style={inp} />
            </div>
            <div>
              <label style={lbl}>Valor real (CLP)</label>
              <input type='number' value={form.real_value} onChange={e => setForm(f => ({ ...f, real_value: e.target.value }))} style={inp} />
            </div>
            <div>
              <label style={lbl}>Válido hasta</label>
              <input type='date' value={form.valid_until} onChange={e => setForm(f => ({ ...f, valid_until: e.target.value }))} style={inp} />
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={lbl}>Ítems incluidos (un ítem por línea)</label>
              <textarea value={form.items} onChange={e => setForm(f => ({ ...f, items: e.target.value }))} rows={4} style={{ ...inp, resize: 'vertical' }} placeholder={'Plan 1 mes\n2 sesiones grupales\nAcceso app'} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => { setEditing(null); setCreating(false) }} style={{ ...btn, background: 'transparent', border: '1px solid rgba(136,153,187,.3)', color: '#8899BB', padding: '7px 16px', fontSize: 12 }}>Cancelar</button>
            <button onClick={save} disabled={saving} style={{ ...btn, background: 'linear-gradient(90deg,#004AAD,#5DE0E6)', color: '#fff', padding: '7px 20px', fontSize: 12 }}>{saving ? '...' : 'Guardar'}</button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 14 }}>
        {packs.map(p => {
          const st = packStatus(p); const stc = statusColors[st]
          const savings = (p.real_value ?? 0) - p.price
          return (
            <div key={p.id} style={{ background: '#111827', border: '1px solid rgba(93,224,230,.1)', borderRadius: 12, padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#F0F4FF', flex: 1 }}>{p.name}</div>
                <span style={{ fontSize: 9, fontWeight: 700, background: stc.bg, color: stc.color, padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap', marginLeft: 8 }}>
                  {st === 'activo' ? 'Activo' : st === 'vencido' ? 'Vencido' : 'Próx. vencer'}
                </span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#5DE0E6', marginBottom: 4 }}>${Math.round(p.price).toLocaleString('es-CL')}</div>
              {p.real_value && <div style={{ fontSize: 11, color: '#8899BB', textDecoration: 'line-through', marginBottom: 2 }}>${Math.round(p.real_value).toLocaleString('es-CL')}</div>}
              {savings > 0 && <div style={{ fontSize: 11, color: '#22C55E', marginBottom: 8 }}>Ahorro: ${Math.round(savings).toLocaleString('es-CL')}</div>}
              {p.valid_until && <div style={{ fontSize: 10, color: '#8899BB', marginBottom: 8 }}>Válido hasta: {fmtDate(p.valid_until)}</div>}
              {(p.items ?? []).length > 0 && (
                <ul style={{ margin: '0 0 12px', padding: '0 0 0 14px', fontSize: 11, color: '#C8D4E8' }}>
                  {(p.items ?? []).map((item, i) => <li key={i}>{item}</li>)}
                </ul>
              )}
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => startEdit(p)} style={{ ...btn, flex: 1, background: 'rgba(93,224,230,.08)', border: '1px solid rgba(93,224,230,.15)', color: '#5DE0E6', padding: '6px 0', fontSize: 11 }}>Editar</button>
                <button onClick={() => del(p.id)} style={{ ...btn, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.15)', color: '#EF4444', padding: '6px 10px', fontSize: 11 }}>🗑</button>
              </div>
            </div>
          )
        })}
        {packs.length === 0 && <div style={{ color: '#8899BB', fontSize: 12, gridColumn: '1/-1', textAlign: 'center', padding: 32 }}>No hay packs creados todavía.</div>}
      </div>
    </div>
  )
}

// ============================================================
// PILLARS TAB
// ============================================================
interface PillarsTabProps {
  pillars: ContentPillar[]
  pieces: ContentPiece[]
  companyId: string
  onRefresh: () => void
}

function DonutChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1
  const R = 48; const cx = 60; const cy = 60; const stroke = 16
  let cumAngle = -Math.PI / 2
  const slices = data.map(d => {
    const angle = (d.value / total) * 2 * Math.PI
    const x1 = cx + R * Math.cos(cumAngle); const y1 = cy + R * Math.sin(cumAngle)
    cumAngle += angle
    const x2 = cx + R * Math.cos(cumAngle); const y2 = cy + R * Math.sin(cumAngle)
    const large = angle > Math.PI ? 1 : 0
    return { ...d, d: `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2}`, angle }
  })
  return (
    <svg width={120} height={120}>
      <circle cx={cx} cy={cy} r={R} fill='none' stroke='rgba(93,224,230,.08)' strokeWidth={stroke} />
      {slices.map((s, i) => s.angle > 0.01 && (
        <path key={i} d={s.d} fill='none' stroke={s.color} strokeWidth={stroke} strokeLinecap='round' />
      ))}
      <text x={cx} y={cy + 4} textAnchor='middle' fontSize='11' fill='#F0F4FF' fontWeight='bold'>{total}</text>
    </svg>
  )
}

function PillarsTab({ pillars, pieces, companyId, onRefresh }: PillarsTabProps) {
  const [editing, setEditing] = useState<Record<string, { percentage: string; formats: string }>>({})

  function startEdit(p: ContentPillar) {
    setEditing(prev => ({ ...prev, [p.id]: { percentage: String(p.percentage ?? 20), formats: (p.formats ?? []).join(', ') } }))
  }

  async function save(p: ContentPillar) {
    const e = editing[p.id]
    if (!e) return
    await supabase.from('content_pillars').update({
      percentage: parseFloat(e.percentage) || 0,
      formats: e.formats.split(',').map(s => s.trim()).filter(Boolean),
    }).eq('id', p.id).eq('company_id', companyId)
    setEditing(prev => { const n = { ...prev }; delete n[p.id]; return n })
    onRefresh()
  }

  function piecesByPillar(pillarName: string) {
    const key = pillarName.toLowerCase().replace(/ /g, '_')
    return pieces.filter(p => p.pillar === key || p.pillar === pillarName).length
  }

  const donutData = pillars.map(p => {
    const key = p.name.toLowerCase().replace(/ /g, '_')
    const cfg = PILLAR_CFG[key]
    return { label: p.name, value: piecesByPillar(p.name), color: cfg?.color ?? p.color ?? '#5DE0E6' }
  })

  return (
    <div>
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Donut */}
        <div style={{ background: '#111827', border: '1px solid rgba(93,224,230,.1)', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, minWidth: 200 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#8899BB', marginBottom: 4 }}>Distribución real</div>
          <DonutChart data={donutData} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
            {donutData.map((d, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <span style={{ color: d.color }}>● {d.label}</span>
                <span style={{ color: '#F0F4FF', fontWeight: 700 }}>{d.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Pillar cards */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 12 }}>
          {pillars.map(p => {
            const key = p.name.toLowerCase().replace(/ /g, '_')
            const cfg = PILLAR_CFG[key]
            const count = piecesByPillar(p.name)
            const e = editing[p.id]
            return (
              <div key={p.id} style={{ background: '#111827', border: `1.5px solid ${cfg?.border ?? 'rgba(93,224,230,.1)'}`, borderRadius: 12, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: cfg?.color ?? '#F0F4FF' }}>{p.name}</div>
                  <span style={{ fontSize: 20, fontWeight: 800, color: cfg?.color ?? '#5DE0E6' }}>{p.percentage ?? 20}%</span>
                </div>
                <div style={{ fontSize: 11, color: '#8899BB', marginBottom: 8 }}>{count} piezas creadas</div>
                {/* progress bar */}
                <div style={{ height: 6, background: 'rgba(93,224,230,.08)', borderRadius: 3, overflow: 'hidden', marginBottom: 10 }}>
                  <div style={{ height: '100%', width: `${Math.min(100, (count / Math.max(1, pieces.length)) * 100)}%`, background: cfg?.color ?? '#5DE0E6', borderRadius: 3 }} />
                </div>
                {(p.formats ?? []).length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
                    {(p.formats ?? []).map(f => (
                      <span key={f} style={{ fontSize: 9, background: cfg?.bg ?? 'rgba(93,224,230,.08)', color: cfg?.color ?? '#5DE0E6', padding: '2px 6px', borderRadius: 10 }}>{FORMAT_CFG[f]?.emoji} {f}</span>
                    ))}
                  </div>
                )}
                {e ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div>
                      <label style={lbl}>% objetivo</label>
                      <input type='number' value={e.percentage} onChange={ev => setEditing(prev => ({ ...prev, [p.id]: { ...prev[p.id], percentage: ev.target.value } }))} style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Formatos (separados por coma)</label>
                      <input value={e.formats} onChange={ev => setEditing(prev => ({ ...prev, [p.id]: { ...prev[p.id], formats: ev.target.value } }))} style={inp} placeholder='reel, post, carrusel' />
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => setEditing(prev => { const n = { ...prev }; delete n[p.id]; return n })} style={{ ...btn, flex: 1, background: 'transparent', border: '1px solid rgba(136,153,187,.3)', color: '#8899BB', padding: '6px 0', fontSize: 11 }}>Cancelar</button>
                      <button onClick={() => save(p)} style={{ ...btn, flex: 1, background: cfg?.color ?? '#5DE0E6', color: '#fff', padding: '6px 0', fontSize: 11 }}>Guardar</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => startEdit(p)} style={{ ...btn, width: '100%', background: cfg ? `${cfg.bg}` : 'rgba(93,224,230,.08)', border: `1px solid ${cfg?.border ?? 'rgba(93,224,230,.15)'}`, color: cfg?.color ?? '#5DE0E6', padding: '6px 0', fontSize: 11 }}>
                    Editar
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// PLAN TAB — Strategic plan dashboard
// ============================================================
interface PlanItem {
  date: string; time: string; format: string; title: string
  hook: string; tags: string[]; pillar: string; funnel: string
}

const LYA_PLAN: { month: string; weeks: { label: string; items: PlanItem[] }[] }[] = [
  {
    month: 'Mayo 2026 — Día del Trabajador + Día de la Madre + Lanzamiento',
    weeks: [
      {
        label: 'Semana 1 — 28 abr al 4 may | Día del Trabajador',
        items: [
          { date: 'Lun 28 abr', time: '9:00', format: 'reel', pillar: 'autoridad', funnel: 'tofu',
            title: 'Ya no somos solo estética. Somos Centro Médico Lya',
            hook: '"Lo que estás a punto de ver cambia todo lo que sabías sobre Clínica Lya."',
            tags: ['Lanzamiento', 'Autoridad'] },
          { date: 'Mié 30 abr', time: '12:00', format: 'reel', pillar: 'conversion', funnel: 'bofu',
            title: 'El cuerpo que más trabaja también merece descanso',
            hook: '"Tu cuerpo trabajó todo el mes. ¿Lo has cuidado al menos una vez?"',
            tags: ['Día del Trabajador', 'Pack $55.000'] },
          { date: 'Vie 1 may', time: '9:00', format: 'post', pillar: 'conversion', funnel: 'bofu',
            title: 'Promoción Pack Trabajador Lya — Solo hoy',
            hook: '"Pack Masaje + Evaluación médica $55.000 (ahorro $45.000). Solo durante el feriado."',
            tags: ['Conversión directa', 'Urgencia'] },
        ],
      },
      {
        label: 'Semana 2 — 5 al 11 may | Pre Día de la Madre',
        items: [
          { date: 'Lun 5 may', time: '9:00', format: 'reel', pillar: 'autoridad', funnel: 'tofu',
            title: '"¿Sabías que la caída de cabello tiene tratamiento médico real?"',
            hook: '"Si tu cabello cae más de lo normal, tu cuerpo te está avisando algo."',
            tags: ['Alopecia', 'Educativo'] },
          { date: 'Mié 7 may', time: '12:00', format: 'carrusel', pillar: 'transformacion', funnel: 'mofu',
            title: 'Testimonio: "Lo que el regalo de mamá debería ser este año"',
            hook: '"Inicio de campaña Día de la Madre. Testimonio real + pack especial."',
            tags: ['Día de la Madre', 'Prueba social'] },
          { date: 'Vie 9 may', time: '18:00', format: 'reel', pillar: 'conversion', funnel: 'bofu',
            title: 'Pack Día de la Madre Lya — Precio visible, fecha límite',
            hook: '"El mejor regalo de mamá no se compra en una tienda."',
            tags: ['Pack $149.990', 'Urgencia', 'Conversión máxima'] },
          { date: 'Dom 11 may', time: '10:00', format: 'post', pillar: 'conversion', funnel: 'bofu',
            title: 'Feliz Día de la Madre + Última hora para el pack',
            hook: '"Story + post emocional. Último recordatorio de urgencia."',
            tags: ['Fidelización', 'Cierre'] },
        ],
      },
      {
        label: 'Semana 3 — 12 al 18 may | La Receta Secreta',
        items: [
          { date: 'Lun 12 may', time: '9:00', format: 'reel', pillar: 'receta_secreta', funnel: 'mofu',
            title: '"Tenemos un protocolo que no existe en ninguna otra clínica de la VI Región"',
            hook: '"Llevo años atendiendo pacientes. Este es el resultado que más orgullo me da... y no puedo contarte cómo lo logramos."',
            tags: ['Receta Secreta', 'Diferenciación', 'Misterio'] },
          { date: 'Jue 15 may', time: '20:00', format: 'video', pillar: 'autoridad', funnel: 'tofu',
            title: 'Podcast Lya Contigo EP.1: "Medicina general + estética: por qué van juntas"',
            hook: '"Primera grabación del podcast. La Dra. como conductora. 20-30 min."',
            tags: ['Podcast', 'Lanzamiento'] },
        ],
      },
      {
        label: 'Semana 4 — 19 al 31 may | Conversión y cierre',
        items: [
          { date: 'Lun 19 may', time: '9:00', format: 'video', pillar: 'bienestar', funnel: 'tofu',
            title: 'Perfil del mes: La Kinesióloga de Lya',
            hook: '"Video corto de presentación. Humaniza el equipo y amplía la base de pacientes."',
            tags: ['Bienestar', 'Equipo'] },
          { date: 'Vie 23 may', time: '18:00', format: 'post', pillar: 'conversion', funnel: 'bofu',
            title: 'Cierre de mayo: "Agenda tu hora antes de que termine el mes"',
            hook: '"Mayo termina. Las horas de esta semana tienen prioridad de agenda para junio."',
            tags: ['Conversión', 'Urgencia'] },
        ],
      },
    ],
  },
  {
    month: 'Junio 2026 — Día del Kinesiólogo + Día del Padre + Campaña Invierno',
    weeks: [
      {
        label: 'Semana 1 — 2 al 8 jun | Día del Kinesiólogo',
        items: [
          { date: 'Lun 2 jun', time: '9:00', format: 'reel', pillar: 'autoridad', funnel: 'tofu',
            title: '"3 señales de que tu cuerpo necesita kinesiología ahora mismo"',
            hook: '"Si te despiertas con dolor todos los días, tu cuerpo no está siendo dramático. Está pidiendo ayuda."',
            tags: ['Kinesiología', 'Educativo'] },
          { date: 'Vie 6 jun', time: '18:00', format: 'post', pillar: 'conversion', funnel: 'bofu',
            title: 'Oferta especial 48 horas: Primera consulta kinesiología $49.000',
            hook: '"Promo exclusiva: Primera consulta + evaluación postural. Solo 6 y 7 de junio. Máx 10 cupos."',
            tags: ['Escasez real', 'Día del Kinesiólogo'] },
        ],
      },
      {
        label: 'Semana 2 — 9 al 15 jun | Invierno + Alopecia',
        items: [
          { date: 'Lun 9 jun', time: '9:00', format: 'reel', pillar: 'autoridad', funnel: 'tofu',
            title: '"El invierno también afecta tu cabello. ¿Lo sabías?"',
            hook: '"Educación sobre caída de cabello en invierno. Conecta la estación con alopecia."',
            tags: ['Alopecia', 'Invierno', 'Educativo'] },
          { date: 'Mié 11 jun', time: '12:00', format: 'reel', pillar: 'receta_secreta', funnel: 'mofu',
            title: 'La Receta Secreta Lya — Episodio 2: "El resultado habla solo"',
            hook: '"Antes/después potente. Sin revelar qué es. \'¿Quieres saber cómo lo logramos? Escríbenos.\'"',
            tags: ['Receta Secreta', 'Misterio'] },
        ],
      },
      {
        label: 'Semana 3 — 16 al 22 jun | Día del Padre',
        items: [
          { date: 'Lun 16 jun', time: '9:00', format: 'post', pillar: 'conversion', funnel: 'mofu',
            title: 'Pre-campaña Día del Padre: "¿Qué le regalas al papá que lo tiene todo?"',
            hook: '"Teaser del pack especial. Segmento mixto: hombres que quieren regalarse + familias."',
            tags: ['Día del Padre', 'Teaser'] },
          { date: 'Jue 19 jun', time: '20:00', format: 'video', pillar: 'autoridad', funnel: 'tofu',
            title: 'Podcast EP.5: "Hombres y salud: lo que nadie habla"',
            hook: '"Alopecia, salud masculina, estética sin tabú. Lya atiende hombres con seriedad médica."',
            tags: ['Podcast', 'Masculino'] },
          { date: 'Vie 20 jun', time: '18:00', format: 'post', pillar: 'conversion', funnel: 'bofu',
            title: 'Pack Día del Padre Lya — $75.000 | Solo hasta el 21 de junio',
            hook: '"Papá siempre cuida a todos. ¿Cuándo fue la última vez que alguien lo cuidó a él?"',
            tags: ['Pack $75.000', 'Alopecia + masaje'] },
        ],
      },
      {
        label: 'Semana 4 — 23 al 30 jun | Autoridad y diferenciación',
        items: [
          { date: 'Lun 23 jun', time: '9:00', format: 'reel', pillar: 'autoridad', funnel: 'tofu',
            title: '"Por qué elegir un centro médico y no solo una clínica estética"',
            hook: '"La Dra. explica la diferencia entre un centro médico integral y una clínica estética."',
            tags: ['Autoridad', 'Diferenciación', 'Posicionamiento'] },
        ],
      },
    ],
  },
  {
    month: 'Julio 2026 — Día del Médico + Mes del Nutricionista + Vacaciones de Invierno',
    weeks: [
      {
        label: 'Semana 1 — 1 al 6 jul | Día del Médico',
        items: [
          { date: 'Jue 3 jul', time: '9:00', format: 'video', pillar: 'autoridad', funnel: 'tofu',
            title: 'Celebración Día del Médico — Historia de la Dra. Leidy Boscán',
            hook: '"Nadie me pregunta por qué elegí ser médico. Hoy se los voy a contar."',
            tags: ['Autoridad', 'Branding personal', 'Viral'] },
          { date: 'Vie 4 jul', time: '18:00', format: 'post', pillar: 'conversion', funnel: 'bofu',
            title: 'Promo Día del Médico: "Consulta médica general $99.000 esta semana"',
            hook: '"Precio especial solo durante la primera semana de julio. Nuevos pacientes al centro."',
            tags: ['Medicina general', 'Conversión'] },
        ],
      },
      {
        label: 'Semana 2 — 7 al 13 jul | Nutricionista + Alopecia',
        items: [
          { date: 'Lun 7 jul', time: '9:00', format: 'reel', pillar: 'bienestar', funnel: 'tofu',
            title: '"5 hábitos de alimentación que te están haciendo daño sin que lo sepas"',
            hook: '"Alto potencial TOFU. Conecta con consulta de nutricionista. Precio visible al final."',
            tags: ['Nutrición', 'Educativo'] },
          { date: 'Mié 9 jul', time: '12:00', format: 'reel', pillar: 'receta_secreta', funnel: 'mofu',
            title: 'La Receta Secreta Lya — Episodio 3: "Te damos una pista"',
            hook: '"Tres meses llevamos mostrando resultados. Hoy les damos la primera pista."',
            tags: ['Receta Secreta', 'Intriga acumulada'] },
        ],
      },
      {
        label: 'Semana 3 — 14 al 20 jul | Vacaciones de Invierno',
        items: [
          { date: 'Lun 14 jul', time: '9:00', format: 'post', pillar: 'transformacion', funnel: 'mofu',
            title: '"Las vacaciones son el mejor momento para ese tratamiento que siempre postergaste"',
            hook: '"Contenido para personas con tiempo libre. Lista tratamientos de recuperación corta."',
            tags: ['Vacaciones de invierno', 'MOFU'] },
          { date: 'Vie 18 jul', time: '18:00', format: 'post', pillar: 'conversion', funnel: 'bofu',
            title: 'Pack Vacaciones Lya — $179.000 | Solo 2 semanas',
            hook: '"Limpieza Facial Premium + Radiofrecuencia 4 sesiones + Consulta médica. Ahorro $160.990."',
            tags: ['Pack vacaciones', 'Conversión'] },
        ],
      },
      {
        label: 'Semana 4 — 21 al 31 jul | Psicología y cierre de trimestre',
        items: [
          { date: 'Lun 21 jul', time: '9:00', format: 'video', pillar: 'bienestar', funnel: 'tofu',
            title: 'Podcast EP.9: "Salud mental en invierno — cómo cuidar tu mente cuando el frío pesa"',
            hook: '"Episodio especial con la psicóloga. Tristeza estacional, ansiedad. Posiciona en psicología."',
            tags: ['Podcast', 'Psicología'] },
          { date: 'Vie 25 jul', time: '18:00', format: 'post', pillar: 'autoridad', funnel: 'tofu',
            title: 'Preview agosto: "El mes de la Estética Lya se acerca"',
            hook: '"Teaser del mes de agosto. Genera expectativa. Seguir para ser los primeros en enterarse."',
            tags: ['Anticipación', 'Teaser'] },
        ],
      },
    ],
  },
]

const WEEKLY_SCHEDULE = [
  { day: 'Lunes',    time: '9:00',  type: 'Reel educativo "¿Sabías que...?"',     pillar: 'autoridad' },
  { day: 'Martes',   time: '18:00', type: 'Story informativa + CTA agendamiento',  pillar: 'conversion' },
  { day: 'Miércoles',time: '12:00', type: 'Testimonio real o antes/después',       pillar: 'transformacion' },
  { day: 'Jueves',   time: '20:00', type: 'Podcast "Lya Contigo" (Reel resumen)',  pillar: 'autoridad' },
  { day: 'Viernes',  time: '18:00', type: 'Promoción semanal con precio',          pillar: 'conversion' },
  { day: 'Sábado',   time: '10:00', type: 'La Receta Secreta Lya o campaña',       pillar: 'receta_secreta' },
  { day: 'Domingo',  time: '19:00', type: 'Contenido de bienestar + recordatorio', pillar: 'bienestar' },
]

const PRIORITY_SERVICES = [
  { name: 'La Receta Secreta Lya', priority: '1 — Alto volumen', price: '$210.000', min: 4, note: 'Nunca mencionar componentes. El misterio es el diferenciador.' },
  { name: 'Tratamiento Alopecia', priority: '2 — Alto margen', price: '$210.000', min: 3, note: 'PRP + Dutasteride / Plasma Capilar. Segmento 25-50 años.' },
]

function PlanTab({ pieces, company }: { pieces: ContentPiece[]; company: Company | null }) {
  const isLya = !!(company?.name?.toLowerCase().includes('lya') || company?.slug?.includes('lya'))

  if (!isLya) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>🗺</div>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#F0F4FF', marginBottom: 8 }}>
          Sin plan estratégico configurado
        </div>
        <div style={{ fontSize: 12, color: '#8899BB', maxWidth: 360, margin: '0 auto', lineHeight: 1.7 }}>
          El plan estratégico de contenidos para <strong style={{ color: '#5DE0E6' }}>{company?.name || 'esta empresa'}</strong> aún no ha sido creado.
          Crea las piezas de contenido desde las otras pestañas y aquí aparecerá el resumen.
        </div>
      </div>
    )
  }
  const [openMonth, setOpenMonth] = useState<number | null>(0)

  const totalPlan = LYA_PLAN.reduce((s, m) => s + m.weeks.reduce((w, wk) => w + wk.items.length, 0), 0)
  const createdTitles = new Set(pieces.map(p => p.title.toLowerCase().trim()))

  function isCreated(title: string) {
    return createdTitles.has(title.toLowerCase().trim())
  }

  const funnelDist = [
    { label: 'TOFU', pct: 40, color: '#60A5FA', desc: 'Reels educativos, podcast, hooks virales. Reach masivo en VI Región.' },
    { label: 'MOFU', pct: 35, color: '#F59E0B', desc: 'Testimonios reales, antes/después, perfil de la Dra. como autoridad médica.' },
    { label: 'BOFU', pct: 25, color: '#22C55E', desc: 'Promociones con fecha, packs con precio visible, CTA a WhatsApp.' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header concept */}
      <div style={{ background: 'linear-gradient(135deg,rgba(0,74,173,.15),rgba(93,224,230,.08))', border: '1px solid rgba(93,224,230,.15)', borderRadius: 14, padding: 20 }}>
        <div style={{ fontSize: 10, color: '#5DE0E6', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 6 }}>Concepto rector — Mayo a Julio 2026</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#F0F4FF', marginBottom: 8 }}>"medicina te cuida por dentro y por fuera"</div>
        <div style={{ fontSize: 12, color: '#8899BB', maxWidth: 640 }}>
          La narrativa posiciona la transición de clínica estética a centro médico natural: misma doctora, mismo cuidado, ahora con más especialidades. Bienestar real con confianza profesional.
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 14 }}>
          <div style={{ textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 800, color: '#5DE0E6' }}>24</div><div style={{ fontSize: 10, color: '#8899BB' }}>piezas/mes</div></div>
          <div style={{ textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 800, color: '#5DE0E6' }}>6</div><div style={{ fontSize: 10, color: '#8899BB' }}>piezas/semana</div></div>
          <div style={{ textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 800, color: '#5DE0E6' }}>5</div><div style={{ fontSize: 10, color: '#8899BB' }}>pilares</div></div>
          <div style={{ textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 800, color: '#5DE0E6' }}>3</div><div style={{ fontSize: 10, color: '#8899BB' }}>meses</div></div>
          <div style={{ textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 800, color: '#22C55E' }}>{pieces.length}/{totalPlan}</div><div style={{ fontSize: 10, color: '#8899BB' }}>creadas</div></div>
        </div>
      </div>

      {/* Funnel + Weekly schedule */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Funnel */}
        <div style={{ background: '#111827', border: '1px solid rgba(93,224,230,.1)', borderRadius: 12, padding: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#F0F4FF', marginBottom: 14 }}>Embudo de Conversión</div>
          {funnelDist.map(f => (
            <div key={f.label} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: f.color }}>{f.label}</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: f.color }}>{f.pct}%</span>
              </div>
              <div style={{ height: 6, background: 'rgba(255,255,255,.06)', borderRadius: 3, marginBottom: 5 }}>
                <div style={{ height: '100%', width: `${f.pct}%`, background: f.color, borderRadius: 3 }} />
              </div>
              <div style={{ fontSize: 10, color: '#8899BB' }}>{f.desc}</div>
            </div>
          ))}
        </div>

        {/* Weekly schedule */}
        <div style={{ background: '#111827', border: '1px solid rgba(93,224,230,.1)', borderRadius: 12, padding: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#F0F4FF', marginBottom: 14 }}>Frecuencia Semanal</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {WEEKLY_SCHEDULE.map(s => {
              const pc = PILLAR_CFG[s.pillar] || PILLAR_CFG.autoridad
              return (
                <div key={s.day} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ minWidth: 70, fontSize: 11, fontWeight: 700, color: pc.color }}>{s.day}</div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#5DE0E6', minWidth: 36 }}>{s.time}</div>
                  <div style={{ fontSize: 10, color: '#C8D4E8', flex: 1 }}>{s.type}</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Priority services */}
      <div style={{ background: '#111827', border: '1px solid rgba(93,224,230,.1)', borderRadius: 12, padding: 18 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#F0F4FF', marginBottom: 12 }}>Servicios Prioritarios</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {PRIORITY_SERVICES.map(s => (
            <div key={s.name} style={{ background: '#0D1926', border: '1px solid rgba(93,224,230,.08)', borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#F0F4FF', marginBottom: 2 }}>{s.name}</div>
              <div style={{ fontSize: 10, color: '#C19E4D', marginBottom: 6 }}>Prioridad {s.priority}</div>
              <div style={{ display: 'flex', gap: 16, marginBottom: 6 }}>
                <div><div style={{ fontSize: 16, fontWeight: 800, color: '#5DE0E6' }}>{s.price}</div><div style={{ fontSize: 9, color: '#8899BB' }}>precio</div></div>
                <div><div style={{ fontSize: 16, fontWeight: 800, color: '#22C55E' }}>{s.min}</div><div style={{ fontSize: 9, color: '#8899BB' }}>piezas mín/mes</div></div>
              </div>
              <div style={{ fontSize: 10, color: '#8899BB', fontStyle: 'italic' }}>{s.note}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Monthly timeline */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#F0F4FF', marginBottom: 12 }}>Timeline de Contenido</div>
        {LYA_PLAN.map((month, mi) => (
          <div key={mi} style={{ marginBottom: 10, background: '#111827', border: '1px solid rgba(93,224,230,.1)', borderRadius: 12, overflow: 'hidden' }}>
            <div
              onClick={() => setOpenMonth(openMonth === mi ? null : mi)}
              style={{ padding: '14px 18px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <div style={{ fontSize: 12, fontWeight: 800, color: '#F0F4FF' }}>{month.month}</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: '#8899BB' }}>{month.weeks.reduce((s, w) => s + w.items.length, 0)} piezas</span>
                <span style={{ color: '#5DE0E6', fontSize: 14 }}>{openMonth === mi ? '▲' : '▼'}</span>
              </div>
            </div>

            {openMonth === mi && (
              <div style={{ padding: '0 18px 18px' }}>
                {month.weeks.map((week, wi) => (
                  <div key={wi} style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#5DE0E6', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8, borderBottom: '1px solid rgba(93,224,230,.08)', paddingBottom: 6 }}>
                      {week.label}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {week.items.map((item, ii) => {
                        const pc  = PILLAR_CFG[item.pillar] || PILLAR_CFG.autoridad
                        const fc  = FORMAT_CFG[item.format]
                        const frc = FUNNEL_CFG[item.funnel]
                        const done = isCreated(item.title)
                        return (
                          <div key={ii} style={{ background: done ? 'rgba(34,197,94,.05)' : '#0D1926', border: `1px solid ${done ? 'rgba(34,197,94,.2)' : 'rgba(93,224,230,.07)'}`, borderRadius: 10, padding: '10px 14px' }}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                              <div style={{ minWidth: 80, fontSize: 9, color: '#5DE0E6', fontWeight: 700, paddingTop: 2 }}>{item.date} {item.time}</div>
                              <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: 9, background: pc.bg, color: pc.color, padding: '1px 6px', borderRadius: 10, fontWeight: 700 }}>{pc.label}</span>
                                  <span style={{ fontSize: 9, background: frc?.bg ?? 'transparent', color: frc?.color ?? '#8899BB', padding: '1px 6px', borderRadius: 10, fontWeight: 700 }}>{frc?.label}</span>
                                  <span style={{ fontSize: 9, color: '#8899BB' }}>{fc?.emoji} {fc?.label ?? item.format}</span>
                                  {done && <span style={{ fontSize: 9, background: 'rgba(34,197,94,.1)', color: '#22C55E', padding: '1px 6px', borderRadius: 10, fontWeight: 700 }}>✓ Creada</span>}
                                </div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#F0F4FF', marginBottom: 3 }}>{item.title}</div>
                                <div style={{ fontSize: 10, color: '#8899BB', fontStyle: 'italic' }}>{item.hook}</div>
                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                                  {item.tags.map(t => <span key={t} style={{ fontSize: 8, background: 'rgba(93,224,230,.06)', color: '#5DE0E6', padding: '1px 5px', borderRadius: 8 }}>{t}</span>)}
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================
// AI TAB — IA Marketing Assistant
// ============================================================
const AI_TYPES = [
  { key: 'hook',        label: 'Hook',        icon: '🪝', desc: 'Primera frase que detiene el scroll' },
  { key: 'titulo',      label: 'Título',      icon: '📌', desc: 'Nombre atractivo para la pieza' },
  { key: 'descripcion', label: 'Descripción', icon: '📝', desc: 'Guión o copy completo' },
  { key: 'cta',         label: 'CTA',         icon: '👉', desc: 'Llamado a la acción poderoso' },
  { key: 'promocion',   label: 'Promoción',   icon: '🎁', desc: 'Ideas de packs u ofertas' },
  { key: 'campana',     label: 'Campaña',     icon: '📣', desc: 'Concepto completo de campaña' },
  { key: 'eslogan',     label: 'Eslogan',     icon: '✨', desc: 'Frase memorable de marca' },
  { key: 'dialogo',     label: 'Diálogo',     icon: '🎬', desc: 'Guión de video o reel' },
] as const

interface IATabProps {
  company: { id: string; name: string } | null
  prefillContext?: Partial<{ type: string; pillar: string; format: string; service: string; platform: string; funnel: string; context: string }>
}

function IATab({ company, prefillContext }: IATabProps) {
  const [aiType,   setAiType]   = useState(prefillContext?.type ?? 'hook')
  const [pillar,   setPillar]   = useState(prefillContext?.pillar ?? '')
  const [format,   setFormat]   = useState(prefillContext?.format ?? '')
  const [platform, setPlatform] = useState(prefillContext?.platform ?? 'instagram')
  const [funnel,   setFunnel]   = useState(prefillContext?.funnel ?? 'tofu')
  const [service,  setService]  = useState(prefillContext?.service ?? '')
  const [context,  setContext]  = useState(prefillContext?.context ?? '')
  const [loading,  setLoading]  = useState(false)
  const [result,   setResult]   = useState('')
  const [error,    setError]    = useState('')
  const [copied,   setCopied]   = useState(false)
  const [history,  setHistory]  = useState<{ type: string; result: string; ts: number }[]>([])

  async function generate() {
    setLoading(true); setError(''); setResult('')
    try {
      const res = await fetch('/api/ai-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: aiType, pillar, format, platform, funnel,
          service, context, companyName: company?.name ?? '',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al generar')
      setResult(data.result)
      setHistory(h => [{ type: aiType, result: data.result, ts: Date.now() }, ...h.slice(0, 9)])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al contactar la IA')
    }
    setLoading(false)
  }

  async function copyText(text: string) {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const selectedType = AI_TYPES.find(t => t.key === aiType)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20, height: '100%' }}>
      {/* Main panel */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Type selector */}
        <div style={{ background: '#111827', border: '1px solid rgba(93,224,230,.1)', borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 11, color: '#8899BB', marginBottom: 10 }}>¿Qué quieres generar?</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
            {AI_TYPES.map(t => (
              <button key={t.key} onClick={() => setAiType(t.key)}
                style={{ border: 'none', cursor: 'pointer', fontFamily: 'Montserrat,sans-serif', borderRadius: 10, padding: '10px 8px', textAlign: 'center', background: aiType === t.key ? 'linear-gradient(135deg,#004AAD,#5DE0E6)' : 'rgba(93,224,230,.06)', outline: aiType === t.key ? 'none' : '1px solid rgba(93,224,230,.1)', transition: 'all .15s' }}>
                <div style={{ fontSize: 18, marginBottom: 3 }}>{t.icon}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: aiType === t.key ? '#fff' : '#C8D4E8' }}>{t.label}</div>
                <div style={{ fontSize: 9, color: aiType === t.key ? 'rgba(255,255,255,.7)' : '#8899BB', marginTop: 2, lineHeight: 1.3 }}>{t.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Context form */}
        <div style={{ background: '#111827', border: '1px solid rgba(93,224,230,.1)', borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 11, color: '#8899BB', marginBottom: 12 }}>Contexto para la generación</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={lbl}>Pilar de contenido</label>
              <select value={pillar} onChange={e => setPillar(e.target.value)} style={inp}>
                <option value=''>Sin especificar</option>
                {Object.entries(PILLAR_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Formato</label>
              <select value={format} onChange={e => setFormat(e.target.value)} style={inp}>
                <option value=''>Sin especificar</option>
                {Object.entries(FORMAT_CFG).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Plataforma</label>
              <select value={platform} onChange={e => setPlatform(e.target.value)} style={inp}>
                {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Etapa del funnel</label>
              <select value={funnel} onChange={e => setFunnel(e.target.value)} style={inp}>
                {Object.entries(FUNNEL_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: '2/-1' }}>
              <label style={lbl}>Servicio / tema principal</label>
              <input value={service} onChange={e => setService(e.target.value)} style={inp} placeholder='Ej: La Receta Secreta, Alopecia, Pack Vacaciones...' />
            </div>
          </div>
          <div>
            <label style={lbl}>Contexto adicional (opcional)</label>
            <textarea value={context} onChange={e => setContext(e.target.value)} rows={2}
              style={{ ...inp, resize: 'vertical' }}
              placeholder='Ej: La Dra. Leidy es médica estética con 10 años de experiencia en Rancagua...' />
          </div>
        </div>

        {/* Generate button */}
        <button onClick={generate} disabled={loading}
          style={{ border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 14, borderRadius: 10, padding: '14px', background: loading ? 'rgba(93,224,230,.2)' : 'linear-gradient(90deg,#004AAD,#5DE0E6)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          {loading ? (
            <>
              <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              Generando con IA...
            </>
          ) : (
            <>{selectedType?.icon} Generar {selectedType?.label}</>
          )}
        </button>

        {error && (
          <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 10, padding: '12px 16px', color: '#EF4444', fontSize: 12 }}>
            ⚠ {error}
          </div>
        )}

        {result && (
          <div style={{ background: '#111827', border: '1px solid rgba(93,224,230,.15)', borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#5DE0E6' }}>✨ Resultado — {selectedType?.label}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => copyText(result)}
                  style={{ border: 'none', cursor: 'pointer', fontFamily: 'Montserrat,sans-serif', background: copied ? 'rgba(34,197,94,.15)' : 'rgba(93,224,230,.08)', color: copied ? '#22C55E' : '#5DE0E6', padding: '5px 12px', borderRadius: 7, fontSize: 11, fontWeight: 700, outline: '1px solid rgba(93,224,230,.15)' }}>
                  {copied ? '✓ Copiado' : '⎘ Copiar'}
                </button>
                <button onClick={generate}
                  style={{ border: 'none', cursor: 'pointer', fontFamily: 'Montserrat,sans-serif', background: 'rgba(93,224,230,.08)', color: '#8899BB', padding: '5px 12px', borderRadius: 7, fontSize: 11, outline: '1px solid rgba(93,224,230,.15)' }}>
                  ↺ Regenerar
                </button>
              </div>
            </div>
            <div style={{ fontSize: 13, color: '#F0F4FF', lineHeight: 1.7, whiteSpace: 'pre-wrap', background: '#0D1926', borderRadius: 8, padding: 14 }}>{result}</div>
          </div>
        )}
      </div>

      {/* History sidebar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ background: '#111827', border: '1px solid rgba(93,224,230,.1)', borderRadius: 12, padding: 16, flex: 1, overflow: 'auto' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#8899BB', marginBottom: 12 }}>Historial reciente</div>
          {history.length === 0 && (
            <div style={{ fontSize: 11, color: '#4A5568', textAlign: 'center', padding: '24px 0' }}>
              Las generaciones aparecerán aquí
            </div>
          )}
          {history.map((h, i) => {
            const t = AI_TYPES.find(tt => tt.key === h.type)
            return (
              <div key={i} style={{ background: '#0D1926', border: '1px solid rgba(93,224,230,.07)', borderRadius: 9, padding: 12, marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#5DE0E6' }}>{t?.icon} {t?.label}</span>
                  <button onClick={() => copyText(h.result)}
                    style={{ border: 'none', background: 'none', color: '#8899BB', cursor: 'pointer', fontSize: 10 }}>⎘ Copiar</button>
                </div>
                <div style={{ fontSize: 10, color: '#8899BB', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>{h.result}</div>
              </div>
            )
          })}
        </div>

        {/* Quick prompts */}
        <div style={{ background: '#111827', border: '1px solid rgba(93,224,230,.1)', borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#8899BB', marginBottom: 10 }}>Accesos rápidos</div>
          {[
            { label: 'Hook de alopecia', type: 'hook', service: 'Tratamiento Alopecia', pillar: 'autoridad' },
            { label: 'CTA Receta Secreta', type: 'cta', service: 'La Receta Secreta Lya', pillar: 'receta_secreta' },
            { label: 'Eslogan centro médico', type: 'eslogan', service: 'Centro Médico Integral', pillar: 'autoridad' },
            { label: 'Promo Día de la Madre', type: 'promocion', service: 'Pack Día de la Madre', pillar: 'conversion' },
          ].map((q, i) => (
            <button key={i}
              onClick={() => { setAiType(q.type as typeof aiType); setService(q.service); setPillar(q.pillar) }}
              style={{ display: 'block', width: '100%', marginBottom: 6, border: 'none', background: 'rgba(93,224,230,.05)', color: '#C8D4E8', cursor: 'pointer', fontFamily: 'Montserrat,sans-serif', fontSize: 11, padding: '8px 10px', borderRadius: 7, textAlign: 'left', outline: '1px solid rgba(93,224,230,.08)' }}>
              {q.label}
            </button>
          ))}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

// ============================================================
// MAIN PAGE
// ============================================================
export default function MarketingPage() {
  const router = useRouter()

  const [user,          setUser]          = useState<User | null>(null)
  const [company,       setCompany]       = useState<Company | null>(null)
  const [pieces,        setPieces]        = useState<ContentPiece[]>([])
  const [pillars,       setPillars]       = useState<ContentPillar[]>([])
  const [packs,         setPacks]         = useState<ContentPack[]>([])
  const [boards,        setBoards]        = useState<ContentBoard[]>([])
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null)
  const [loading,       setLoading]       = useState(true)
  const [tab,           setTab]           = useState<'board'|'calendar'|'list'|'packs'|'pillars'|'plan'|'ia'>('board')

  const [sideOpen,    setSideOpen]    = useState(false)
  const [sidePiece,   setSidePiece]   = useState<ContentPiece | null>(null)
  const [aiPrefill,   setAiPrefill]   = useState<{ pillar?: string; format?: string; platform?: string; funnel?: string; service?: string } | undefined>(undefined)

  async function loadPieces(cid: string) {
    const { data } = await supabase.from('content_calendar').select('*').eq('company_id', cid).order('publish_date', { ascending: true })
    if (data) setPieces(data as ContentPiece[])
  }
  async function loadPillars(cid: string) {
    const { data } = await supabase.from('content_pillars').select('*').eq('company_id', cid)
    if (data) setPillars(data as ContentPillar[])
  }
  async function loadPacks(cid: string) {
    const { data } = await supabase.from('content_packs').select('*').eq('company_id', cid).order('created_at', { ascending: false })
    if (data) setPacks(data as ContentPack[])
  }
  async function loadBoards(cid: string) {
    const { data } = await supabase.from('content_boards').select('*').eq('company_id', cid).order('order_index')
    if (data && data.length > 0) {
      setBoards(data as ContentBoard[])
      const def = (data as ContentBoard[]).find(b => b.is_definitive)
      setActiveBoardId(prev => prev ?? def?.id ?? data[0].id)
    }
  }

  useEffect(() => {
    async function init() {
      const ctx = await getAuthContext()
      if (!ctx) { router.push('/login'); return }
      if (ctx.isSuperAdmin && !getStoredCompany()) { router.push('/empresas'); return }
      if (!ctx.isSuperAdmin && !['admin', 'supervisor', 'owner'].includes(ctx.user.role)) { router.push('/dashboard'); return }
      setUser(ctx.user as any)
      setCompany(ctx.company)
      await Promise.all([
        loadPieces(ctx.companyId), loadPillars(ctx.companyId),
        loadPacks(ctx.companyId), loadBoards(ctx.companyId),
      ])
      setLoading(false)
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function refresh() {
    if (!company) return
    loadPieces(company.id)
    loadPillars(company.id)
    loadPacks(company.id)
    loadBoards(company.id)
  }

  async function handleSetDefinitive(boardId: string) {
    if (!company) return
    await supabase.rpc('set_definitive_board', { p_board_id: boardId, p_company_id: company.id })
    await loadBoards(company.id)
  }

  async function handleBoardCreate(name: string, copyFrom: string | null) {
    if (!company) return
    const { data } = await supabase.rpc('create_content_board', {
      p_company_id: company.id, p_name: name, p_copy_from: copyFrom,
    })
    await Promise.all([loadBoards(company.id), loadPieces(company.id)])
    if (data?.board_id) setActiveBoardId(data.board_id)
  }

  // Pieces from definitive board for non-board views
  const definitiveBoard = boards.find(b => b.is_definitive)
  const definitivePieces = definitiveBoard
    ? pieces.filter(p => p.board_id === definitiveBoard.id)
    : pieces

  function openEdit(p: ContentPiece) { setSidePiece(p); setSideOpen(true) }
  function openNew()                  { setSidePiece(null); setSideOpen(true) }
  function closePanel()               { setSideOpen(false); setSidePiece(null) }

  // KPI summary
  const now   = new Date()
  const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay() + 1); startOfWeek.setHours(0,0,0,0)
  const endOfWeek   = new Date(startOfWeek); endOfWeek.setDate(startOfWeek.getDate() + 6)
  const weekPieces  = pieces.filter(p => { const d = new Date(p.publish_date); return d >= startOfWeek && d <= endOfWeek })
  const pendingWeek = weekPieces.filter(p => p.status === 'borrador' || p.status === 'programado').length
  const published   = pieces.filter(p => p.status === 'publicado').length
  const pending     = pieces.filter(p => p.status === 'borrador' || p.status === 'programado').length

  const TABS = [
    { key: 'board',    label: '🗂 Tablero'    },
    { key: 'calendar', label: '📅 Calendario'  },
    { key: 'list',     label: '📋 Lista'       },
    { key: 'packs',    label: '🎁 Packs'       },
    { key: 'pillars',  label: '🏛 Pilares'     },
    { key: 'plan',     label: '🗺 Plan'         },
    { key: 'ia',       label: '✨ IA Asistente' },
  ] as const

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0A1628', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5DE0E6', fontFamily: 'Montserrat,sans-serif' }}>
      ⏳ Cargando marketing...
    </div>
  )

  const S: Record<string, React.CSSProperties> = {
    page:   { minHeight: '100vh', background: 'var(--mp-bg, #0A1628)', fontFamily: 'Montserrat,sans-serif', color: 'var(--mp-text, #F0F4FF)', display: 'flex', flexDirection: 'column', transition: 'background .25s, color .25s' },
    topbar: { height: 50, background: '#111827', borderBottom: '1px solid rgba(93,224,230,.12)', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 10, flexShrink: 0 },
    logo:   { width: 28, height: 28, borderRadius: 7, background: 'linear-gradient(135deg,#004AAD,#5DE0E6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', cursor: 'pointer', flexShrink: 0 },
    body:   { flex: 1, padding: 20, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
    card:   { background: '#111827', border: '1px solid rgba(93,224,230,.1)', borderRadius: 12, padding: '14px 16px' },
  }

  return (
    <div style={S.page}>
      {/* TOPBAR */}
      <div style={S.topbar}>
        <div style={S.logo} onClick={() => router.push('/dashboard')}>MP</div>
        <span style={{ fontWeight: 800, fontSize: 13 }}>📣 Marketing</span>
        <span style={{ fontSize: 11, color: '#8899BB' }}>{company?.name}</span>
        {user?.role && (
          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: 'rgba(93,224,230,.08)', border: '1px solid rgba(93,224,230,.15)', color: '#5DE0E6', textTransform: 'uppercase', letterSpacing: '.05em' }}>
            {user.role}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={() => router.push('/dashboard')} style={{ ...btn, background: 'rgba(93,224,230,.08)', border: '1px solid rgba(93,224,230,.2)', color: '#5DE0E6', padding: '4px 12px', fontSize: 11 }}>
          ← Dashboard
        </button>
      </div>

      <div style={S.body}>
        {/* KPI header */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 18 }}>
          {[
            { icon: '📦', label: 'Total piezas', value: pieces.length, color: '#5DE0E6' },
            { icon: '✅', label: 'Publicadas',   value: published,    color: '#22C55E' },
            { icon: '⏳', label: 'Pendientes',   value: pending,      color: '#F59E0B' },
            { icon: '📅', label: 'Pendientes esta semana', value: pendingWeek, color: '#EF4444' },
          ].map(k => (
            <div key={k.label} style={{ ...S.card, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 22 }}>{k.icon}</span>
              <div>
                <div style={{ fontSize: 11, color: '#8899BB' }}>{k.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: k.color }}>{k.value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* TABS */}
        <div style={{ display: 'flex', gap: 4, background: '#111827', border: '1px solid rgba(93,224,230,.1)', borderRadius: 10, padding: 4, marginBottom: 18, width: 'fit-content', flexShrink: 0 }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ ...btn, padding: '6px 18px', fontSize: 12, borderRadius: 7, background: tab === t.key ? 'linear-gradient(90deg,#004AAD,#5DE0E6)' : 'transparent', color: tab === t.key ? '#fff' : '#8899BB' }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* TAB CONTENT */}
        <div style={{ flex: 1, overflow: tab === 'board' ? 'hidden' : 'auto', minHeight: 0 }}>
          {tab === 'board' && (
            <BoardTab
              pieces={pieces} pillars={pillars} companyId={company!.id}
              boards={boards} activeBoardId={activeBoardId}
              onBoardChange={setActiveBoardId}
              onSetDefinitive={handleSetDefinitive}
              onBoardCreate={handleBoardCreate}
              onEdit={openEdit}
              onNew={(boardId) => { setSidePiece(null); setSideOpen(true) }}
              onRefresh={refresh}
            />
          )}
          {tab !== 'board' && tab !== 'packs' && tab !== 'ia' && definitiveBoard && (
            <div style={{ fontSize: 10, color: '#22C55E', background: 'rgba(22,197,94,.08)', border: '1px solid rgba(22,197,94,.2)', borderRadius: 6, padding: '4px 10px', marginBottom: 12, display: 'inline-block' }}>
              ✓ Mostrando tablero DEFINITIVO: <strong>{definitiveBoard.name}</strong>
            </div>
          )}
          {tab === 'calendar' && (
            <CalendarTab pieces={definitivePieces} companyId={company!.id} onEdit={openEdit} onRefresh={refresh} />
          )}
          {tab === 'list' && (
            <ListTab pieces={definitivePieces} onEdit={openEdit} />
          )}
          {tab === 'packs' && (
            <PacksTab packs={packs} companyId={company!.id} onRefresh={refresh} />
          )}
          {tab === 'pillars' && (
            <PillarsTab pillars={pillars} pieces={definitivePieces} companyId={company!.id} onRefresh={refresh} />
          )}
          {tab === 'plan' && (
            <PlanTab pieces={definitivePieces} company={company} />
          )}
          {tab === 'ia' && (
            <IATab company={company} prefillContext={aiPrefill} />
          )}
        </div>
      </div>

      {/* PIECE MODAL */}
      {sideOpen && user && (
        <PieceModal
          piece={sidePiece as import('./PieceModal').PieceData | null}
          pillars={pillars}
          companyId={company!.id}
          boardId={sidePiece ? sidePiece.board_id : (tab === 'board' ? activeBoardId : definitiveBoard?.id ?? null)}
          onClose={closePanel}
          onSaved={() => { closePanel(); refresh() }}
          onDeleted={() => { closePanel(); refresh() }}
        />
      )}
    </div>
  )
}
