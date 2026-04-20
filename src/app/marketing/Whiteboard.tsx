'use client'

import { useState, useRef, useEffect, useCallback, useId } from 'react'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

// ── Types ────────────────────────────────────────────────────────────────────
export type ShapeType = 'pen' | 'rect' | 'circle' | 'text' | 'sticky' | 'arrow' | 'line' | 'frame' | 'table' | 'piece'

export interface WBPieceRef {
  id: string; title: string; format: string; pillar: string
  status: string; platform: string | null; publish_date: string; hook?: string | null
}

export interface WBShape {
  id: string; type: ShapeType
  x: number; y: number; w: number; h: number
  fill: string; stroke: string; strokeWidth: number; opacity: number
  text?: string; fontSize?: number; fontBold?: boolean; fontItalic?: boolean
  points?: number[]     // flat [x1,y1,x2,y2,...] for pen/arrow/line
  arrowEnd?: boolean; arrowStart?: boolean
  imageUrl?: string
  tableData?: string[][]
  stickyColor?: string
  rotation?: number
  pieceRef?: WBPieceRef
}

type Tool = 'select' | 'pan' | 'pen' | 'text' | 'sticky' | 'rect' | 'circle' | 'arrow' | 'line' | 'frame' | 'table' | 'eraser'

interface WBProps {
  pieceId: string
  companyId: string
  initialShapes?: WBShape[]
  onShapesChange?: (shapes: WBShape[]) => void
  onPieceClick?: (pieceId: string) => void
  readOnly?: boolean
}

// ── Palettes ─────────────────────────────────────────────────────────────────
const COLORS   = ['#F0F4FF','#111827','#EF4444','#F59E0B','#22C55E','#5DE0E6','#004AAD','#A78BFA','#EC4899','#C19E4D']
const STICKY_C = ['#FEF3C7','#D1FAE5','#DBEAFE','#EDE9FE','#FCE7F3','#FEE2E2','#111827']
const gid = () => Math.random().toString(36).slice(2, 11)
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

// ── Arrow marker helper ───────────────────────────────────────────────────────
function pts(points: number[] = []) {
  const arr: string[] = []
  for (let i = 0; i < points.length - 1; i += 2) arr.push(`${points[i]},${points[i+1]}`)
  return arr.join(' ')
}

// ── Shape renderers ───────────────────────────────────────────────────────────
function ShapeEl({
  s, selected, tool, zoom,
  onMouseDown, onTextChange, editingId,
}: {
  s: WBShape; selected: boolean; tool: Tool; zoom: number
  onMouseDown: (e: React.MouseEvent, id: string) => void
  onTextChange: (id: string, t: string) => void
  editingId: string | null
}) {
  const selStyle: React.CSSProperties = selected
    ? { outline: '2px solid #5DE0E6', outlineOffset: 3 }
    : {}

  const baseDiv: React.CSSProperties = {
    position: 'absolute', left: s.x, top: s.y, width: s.w, height: s.h,
    opacity: s.opacity, cursor: tool === 'select' ? 'move' : 'crosshair',
    transform: s.rotation ? `rotate(${s.rotation}deg)` : undefined,
    transformOrigin: 'center center',
    boxSizing: 'border-box',
  }

  if (s.type === 'rect' || s.type === 'frame') return (
    <div style={{ ...baseDiv, background: s.fill, border: `${s.strokeWidth}px solid ${s.stroke}`, borderRadius: s.type === 'frame' ? 12 : 4, ...selStyle }}
      onMouseDown={e => onMouseDown(e, s.id)} />
  )

  if (s.type === 'circle') return (
    <div style={{ ...baseDiv, background: s.fill, border: `${s.strokeWidth}px solid ${s.stroke}`, borderRadius: '50%', ...selStyle }}
      onMouseDown={e => onMouseDown(e, s.id)} />
  )

  if (s.type === 'sticky') {
    const bg = s.stickyColor || '#FEF3C7'
    const textColor = bg === '#111827' ? '#F0F4FF' : '#0A1628'
    return (
      <div style={{ ...baseDiv, background: bg, borderRadius: 4, padding: 10, boxShadow: '2px 4px 12px rgba(0,0,0,.25)', border: `1.5px solid ${selected ? '#5DE0E6' : 'transparent'}` }}
        onMouseDown={e => onMouseDown(e, s.id)}>
        {editingId === s.id ? (
          <textarea autoFocus value={s.text || ''} onChange={e => onTextChange(s.id, e.target.value)}
            style={{ width: '100%', height: '100%', background: 'transparent', border: 'none', outline: 'none', resize: 'none', fontSize: (s.fontSize || 13), fontWeight: s.fontBold ? 700 : 500, color: textColor, fontFamily: 'Montserrat,sans-serif', cursor: 'text' }}
            onMouseDown={e => e.stopPropagation()} />
        ) : (
          <div style={{ fontSize: s.fontSize || 13, fontWeight: s.fontBold ? 700 : 500, color: textColor, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5, pointerEvents: 'none' }}>
            {s.text || 'Nota...'}
          </div>
        )}
      </div>
    )
  }

  if (s.type === 'text') return (
    <div style={{ ...baseDiv, ...selStyle, minWidth: 80, minHeight: 24 }}
      onMouseDown={e => onMouseDown(e, s.id)}>
      {editingId === s.id ? (
        <textarea autoFocus value={s.text || ''} onChange={e => onTextChange(s.id, e.target.value)}
          style={{ width: '100%', height: '100%', background: 'rgba(93,224,230,.05)', border: '1px solid rgba(93,224,230,.3)', outline: 'none', resize: 'none', fontSize: s.fontSize || 14, fontWeight: s.fontBold ? 700 : 500, fontStyle: s.fontItalic ? 'italic' : 'normal', color: s.fill || '#F0F4FF', fontFamily: 'Montserrat,sans-serif', borderRadius: 4, padding: '4px 6px', cursor: 'text' }}
          onMouseDown={e => e.stopPropagation()} />
      ) : (
        <div style={{ fontSize: s.fontSize || 14, fontWeight: s.fontBold ? 700 : 500, fontStyle: s.fontItalic ? 'italic' : 'normal', color: s.fill || '#F0F4FF', whiteSpace: 'pre-wrap', wordBreak: 'break-word', padding: '4px 6px', minWidth: 40 }}>
          {s.text || 'Texto'}
        </div>
      )}
    </div>
  )

  if (s.type === 'table') {
    const rows = s.tableData || [['',''],['','']]
    const cellW = s.w / (rows[0]?.length || 2)
    const cellH = s.h / rows.length
    return (
      <div style={{ ...baseDiv, border: `${s.strokeWidth}px solid ${s.stroke}`, overflow: 'hidden', ...selStyle }}
        onMouseDown={e => onMouseDown(e, s.id)}>
        <table style={{ width: '100%', height: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} style={{ border: `1px solid ${s.stroke}`, padding: '3px 5px', fontSize: 11, color: s.fill || '#F0F4FF', verticalAlign: 'top', background: ri === 0 ? `${s.stroke}20` : 'transparent' }}>
                    {editingId === s.id ? (
                      <input defaultValue={cell} onBlur={e => {
                        const newRows = rows.map((r, r2) => r2 === ri ? r.map((c, c2) => c2 === ci ? e.target.value : c) : r)
                        onTextChange(s.id, JSON.stringify(newRows))
                      }} style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: 'inherit', fontSize: 'inherit', fontFamily: 'inherit' }}
                        onMouseDown={e => e.stopPropagation()} />
                    ) : cell || ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (s.type === 'piece') {
    const ref = s.pieceRef!
    const PC: Record<string, { color: string }> = {
      autoridad: { color: '#C19E4D' }, transformacion: { color: '#16A34A' },
      receta_secreta: { color: '#7C3AED' }, bienestar: { color: '#2563EB' },
      conversion: { color: '#DC2626' },
    }
    const SC: Record<string, string> = {
      borrador: '#8899BB', programado: '#5DE0E6', publicado: '#22C55E',
      pausado: '#F59E0B', cancelado: '#EF4444',
    }
    const FE: Record<string, string> = {
      reel: '🎬', carrusel: '🗂️', historia: '📱', post: '🖼️', video: '📹', texto: '✍️', live: '🔴',
    }
    const pc = PC[ref.pillar] || { color: '#8899BB' }
    const sc = SC[ref.status] || '#8899BB'
    return (
      <div
        style={{
          ...baseDiv,
          background: '#1A2540',
          border: `2px solid ${selected ? '#5DE0E6' : pc.color + '55'}`,
          borderRadius: 12, overflow: 'hidden',
          boxShadow: selected ? `0 0 0 2px #5DE0E6,0 6px 24px rgba(0,0,0,.5)` : '0 4px 16px rgba(0,0,0,.35)',
          cursor: tool === 'select' ? 'pointer' : 'crosshair',
          display: 'flex', flexDirection: 'column',
        }}
        onMouseDown={e => onMouseDown(e, s.id)}
      >
        <div style={{ height: 3, background: pc.color, flexShrink: 0 }} />
        <div style={{ padding: '8px 10px', flex: 1, display: 'flex', flexDirection: 'column', gap: 3, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 15 }}>{FE[ref.format] || '📄'}</span>
            <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 4, background: `${sc}20`, color: sc, flexShrink: 0 }}>
              {ref.status}
            </span>
          </div>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#F0F4FF', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.4, flex: 1 }}>
            {ref.title}
          </div>
          {ref.hook && (
            <div style={{ fontSize: 9.5, color: '#8899BB', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.3 }}>
              {ref.hook}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
            <span style={{ fontSize: 9, color: '#556080' }}>{ref.publish_date?.slice(5)}</span>
            {ref.platform && <span style={{ fontSize: 9, color: pc.color }}>{ref.platform}</span>}
          </div>
        </div>
      </div>
    )
  }

  return null
}

// ── SVG vector layer (arrows, lines, pen) ─────────────────────────────────────
function SVGLayer({ shapes, selected, tool, onMouseDown }: {
  shapes: WBShape[]; selected: Set<string>; tool: Tool
  onMouseDown: (e: React.MouseEvent, id: string) => void
}) {
  const vectorShapes = shapes.filter(s => s.type === 'pen' || s.type === 'arrow' || s.type === 'line')
  if (!vectorShapes.length) return null
  return (
    <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }} width='100%' height='100%'>
      <defs>
        <marker id='arr-end' viewBox='0 0 10 10' refX='9' refY='5' markerWidth='6' markerHeight='6' orient='auto-start-reverse'>
          <path d='M 0 0 L 10 5 L 0 10 z' fill='#5DE0E6' />
        </marker>
        <marker id='arr-end-sel' viewBox='0 0 10 10' refX='9' refY='5' markerWidth='6' markerHeight='6' orient='auto-start-reverse'>
          <path d='M 0 0 L 10 5 L 0 10 z' fill='#5DE0E6' />
        </marker>
      </defs>
      {vectorShapes.map(s => {
        const sel = selected.has(s.id)
        const pts2 = s.points || []
        if (s.type === 'pen') {
          const d = pts2.length >= 4
            ? `M ${pts2[0]} ${pts2[1]} ` + Array.from({ length: (pts2.length - 2) / 2 }, (_, i) => `L ${pts2[2+i*2]} ${pts2[3+i*2]}`).join(' ')
            : ''
          return (
            <path key={s.id} d={d} fill='none' stroke={sel ? '#5DE0E6' : s.stroke} strokeWidth={s.strokeWidth} strokeLinecap='round' strokeLinejoin='round' opacity={s.opacity} style={{ pointerEvents: 'stroke', cursor: tool === 'select' ? 'move' : 'default' }}
              onMouseDown={e => { e.stopPropagation(); onMouseDown(e as unknown as React.MouseEvent, s.id) }} />
          )
        }
        if (s.type === 'line' || s.type === 'arrow') {
          const [x1=0, y1=0, x2=100, y2=100] = pts2
          return (
            <line key={s.id} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={sel ? '#5DE0E6' : s.stroke} strokeWidth={sel ? s.strokeWidth + 1 : s.strokeWidth}
              markerEnd={s.type === 'arrow' ? 'url(#arr-end)' : undefined}
              strokeLinecap='round' opacity={s.opacity}
              style={{ pointerEvents: 'stroke', cursor: tool === 'select' ? 'move' : 'default' }}
              onMouseDown={e => { e.stopPropagation(); onMouseDown(e as unknown as React.MouseEvent, s.id) }} />
          )
        }
        return null
      })}
    </svg>
  )
}

// ── Selection handles ─────────────────────────────────────────────────────────
function SelectionHandles({ shapes, selected, zoom, onResizeStart }: {
  shapes: WBShape[]; selected: Set<string>; zoom: number
  onResizeStart: (e: React.MouseEvent, id: string, handle: string) => void
}) {
  const hs = 8 / zoom
  const selectedShapes = shapes.filter(s => selected.has(s.id) && s.type !== 'pen' && s.type !== 'line' && s.type !== 'arrow')
  if (!selectedShapes.length) return null
  return (
    <>
      {selectedShapes.map(s => {
        const handles = [
          { id: 'nw', x: s.x - hs/2,       y: s.y - hs/2 },
          { id: 'n',  x: s.x + s.w/2 - hs/2, y: s.y - hs/2 },
          { id: 'ne', x: s.x + s.w - hs/2, y: s.y - hs/2 },
          { id: 'e',  x: s.x + s.w - hs/2, y: s.y + s.h/2 - hs/2 },
          { id: 'se', x: s.x + s.w - hs/2, y: s.y + s.h - hs/2 },
          { id: 's',  x: s.x + s.w/2 - hs/2, y: s.y + s.h - hs/2 },
          { id: 'sw', x: s.x - hs/2,       y: s.y + s.h - hs/2 },
          { id: 'w',  x: s.x - hs/2,       y: s.y + s.h/2 - hs/2 },
        ]
        return handles.map(h => (
          <div key={`${s.id}-${h.id}`}
            style={{
              position: 'absolute', left: h.x, top: h.y, width: hs, height: hs,
              background: '#fff', border: '1.5px solid #5DE0E6', borderRadius: 2,
              cursor: `${h.id}-resize`, zIndex: 100,
            }}
            onMouseDown={e => { e.stopPropagation(); onResizeStart(e, s.id, h.id) }}
          />
        ))
      })}
    </>
  )
}

// ── Collaborator cursors ──────────────────────────────────────────────────────
interface Cursor { name: string; x: number; y: number; color: string }
const CURSOR_COLORS = ['#EF4444','#22C55E','#F59E0B','#A78BFA','#EC4899']

// ── Main Whiteboard ───────────────────────────────────────────────────────────
export default function Whiteboard({ pieceId, companyId, initialShapes = [], onShapesChange, onPieceClick, readOnly = false }: WBProps) {
  const [shapes,   setShapes]   = useState<WBShape[]>(initialShapes)
  const [tool,     setTool]     = useState<Tool>('select')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [zoom,     setZoom]     = useState(1)
  const [pan,      setPan]      = useState({ x: 0, y: 0 })
  const [color,    setColor]    = useState('#F0F4FF')
  const [fillColor,setFillColor]= useState('transparent')
  const [strokeW,  setStrokeW]  = useState(2)
  const [fontSize, setFontSize] = useState(14)
  const [stickyC,  setStickyC]  = useState('#FEF3C7')
  const [editingId,setEditingId]= useState<string | null>(null)
  const [history,  setHistory]  = useState<WBShape[][]>([initialShapes])
  const [histIdx,  setHistIdx]  = useState(0)
  const [cursors,  setCursors]  = useState<Record<string, Cursor>>({})
  const [onlineCount, setOnlineCount] = useState(1)

  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const dragRef      = useRef<{ type: string; id?: string; handle?: string; startX: number; startY: number; origX?: number; origY?: number; origW?: number; origH?: number } | null>(null)
  const drawRef      = useRef<{ type: Tool; x0: number; y0: number; points?: number[] } | null>(null)
  const channelRef   = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const saveTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const myColor      = useRef(CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)])
  const myName       = useRef(`User ${Math.floor(Math.random() * 100)}`)

  // ── Real-time channel ──────────────────────────────────────────────────────
  useEffect(() => {
    const ch = supabase.channel(`wb:${pieceId}`, { config: { broadcast: { self: false }, presence: { key: myName.current } } })
    ch
      .on('broadcast', { event: 'shapes' }, ({ payload }) => {
        if (payload?.shapes) setShapes(payload.shapes)
      })
      .on('broadcast', { event: 'cursor' }, ({ payload }) => {
        if (payload?.name) {
          setCursors(prev => ({ ...prev, [payload.name]: { name: payload.name, x: payload.x, y: payload.y, color: payload.color } }))
          setTimeout(() => setCursors(prev => { const n = { ...prev }; delete n[payload.name]; return n }), 3000)
        }
      })
      .on('presence', { event: 'sync' }, () => {
        const state = ch.presenceState()
        setOnlineCount(Object.keys(state).length + 1)
      })
      .subscribe()
    channelRef.current = ch
    return () => { supabase.removeChannel(ch) }
  }, [pieceId])

  // ── Broadcast shapes (debounced) ──────────────────────────────────────────
  const broadcastShapes = useCallback((s: WBShape[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      channelRef.current?.send({ type: 'broadcast', event: 'shapes', payload: { shapes: s } })
      onShapesChange?.(s)
    }, 400)
  }, [onShapesChange])

  // ── Push to history ────────────────────────────────────────────────────────
  const pushHistory = useCallback((s: WBShape[]) => {
    setHistory(h => [...h.slice(0, histIdx + 1), s])
    setHistIdx(i => i + 1)
  }, [histIdx])

  const commitShapes = useCallback((s: WBShape[]) => {
    setShapes(s); broadcastShapes(s); pushHistory(s)
  }, [broadcastShapes, pushHistory])

  // ── Undo / Redo ────────────────────────────────────────────────────────────
  const undo = useCallback(() => {
    if (histIdx <= 0) return
    const ni = histIdx - 1
    setHistIdx(ni); setShapes(history[ni]); broadcastShapes(history[ni])
  }, [histIdx, history, broadcastShapes])

  const redo = useCallback(() => {
    if (histIdx >= history.length - 1) return
    const ni = histIdx + 1
    setHistIdx(ni); setShapes(history[ni]); broadcastShapes(history[ni])
  }, [histIdx, history, broadcastShapes])

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'Escape') { setSelected(new Set()); setEditingId(null) }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo() }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) { e.preventDefault(); redo() }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected.size > 0 && !editingId) {
        e.preventDefault()
        const ns = shapes.filter(s => !selected.has(s.id) || s.type === 'piece')
        commitShapes(ns); setSelected(new Set())
      }
      if (e.key === 'v' && !e.ctrlKey) setTool('select')
      if (e.key === 'p') setTool('pen')
      if (e.key === 't') setTool('text')
      if (e.key === 'n') setTool('sticky')
      if (e.key === 'r') setTool('rect')
      if (e.key === 'c') setTool('circle')
      if (e.key === 'a') setTool('arrow')
      if (e.key === ' ') { e.preventDefault(); setTool('pan') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, shapes, editingId, undo, redo, commitShapes])

  // ── Coordinate transform ──────────────────────────────────────────────────
  function clientToCanvas(cx: number, cy: number) {
    const rect = containerRef.current!.getBoundingClientRect()
    return {
      x: (cx - rect.left - pan.x) / zoom,
      y: (cy - rect.top  - pan.y) / zoom,
    }
  }

  // ── Mouse events ──────────────────────────────────────────────────────────
  function onMouseDown(e: React.MouseEvent) {
    if (e.button === 1 || tool === 'pan') {
      dragRef.current = { type: 'pan', startX: e.clientX, startY: e.clientY }
      return
    }
    if (readOnly) return
    const { x, y } = clientToCanvas(e.clientX, e.clientY)

    if (tool === 'select') {
      setSelected(new Set()); setEditingId(null)
      dragRef.current = { type: 'drag-select', startX: x, startY: y }
      return
    }
    if (tool === 'eraser') {
      // handled on mouseMove
      return
    }
    if (tool === 'pen') {
      drawRef.current = { type: 'pen', x0: x, y0: y, points: [x, y] }
      startPenCanvas(e.clientX, e.clientY)
      return
    }
    if (tool === 'text' || tool === 'sticky' || tool === 'rect' || tool === 'circle' || tool === 'frame' || tool === 'table') {
      drawRef.current = { type: tool, x0: x, y0: y }
      return
    }
    if (tool === 'arrow' || tool === 'line') {
      drawRef.current = { type: tool, x0: x, y0: y, points: [x, y, x, y] }
      return
    }
  }

  function onShapeMouseDown(e: React.MouseEvent, id: string) {
    if (readOnly) return
    e.stopPropagation()
    if (tool !== 'select' && tool !== 'eraser') return
    if (tool === 'eraser') {
      commitShapes(shapes.filter(s => s.id !== id)); return
    }
    if (e.detail === 2) {
      const shape = shapes.find(ss => ss.id === id)
      if (shape?.type === 'piece') { onPieceClick?.(shape.pieceRef!.id); return }
      setEditingId(id); return
    }
    setEditingId(null)
    const shape = shapes.find(s => s.id === id)!
    if (!shape) return
    if (e.shiftKey) {
      setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
    } else {
      if (!selected.has(id)) setSelected(new Set([id]))
    }
    dragRef.current = { type: 'move', id, startX: e.clientX, startY: e.clientY, origX: shape.x, origY: shape.y }
  }

  function onResizeStart(e: React.MouseEvent, id: string, handle: string) {
    const shape = shapes.find(s => s.id === id)!
    dragRef.current = { type: 'resize', id, handle, startX: e.clientX, startY: e.clientY, origX: shape.x, origY: shape.y, origW: shape.w, origH: shape.h }
  }

  function onMouseMove(e: React.MouseEvent) {
    const { x, y } = clientToCanvas(e.clientX, e.clientY)

    // Broadcast cursor
    channelRef.current?.send({ type: 'broadcast', event: 'cursor', payload: { name: myName.current, x, y, color: myColor.current } })

    if (dragRef.current) {
      const d = dragRef.current
      if (d.type === 'pan') {
        setPan(p => ({ x: p.x + e.clientX - d.startX, y: p.y + e.clientY - d.startY }))
        dragRef.current = { ...d, startX: e.clientX, startY: e.clientY }
        return
      }
      if (d.type === 'move' && d.id) {
        const dx = (e.clientX - d.startX) / zoom
        const dy = (e.clientY - d.startY) / zoom
        setShapes(prev => prev.map(s => {
          if (!selected.has(s.id) && s.id !== d.id) return s
          if (s.type === 'arrow' || s.type === 'line' || s.type === 'pen') {
            const pts2 = s.points?.map((v, i) => i % 2 === 0 ? v + dx : v + dy) || []
            return { ...s, points: pts2 }
          }
          return { ...s, x: (d.origX ?? s.x) + dx, y: (d.origY ?? s.y) + dy }
        }))
        return
      }
      if (d.type === 'resize' && d.id) {
        const dx = (e.clientX - d.startX) / zoom
        const dy = (e.clientY - d.startY) / zoom
        setShapes(prev => prev.map(s => {
          if (s.id !== d.id) return s
          let { x, y, w, h } = { x: d.origX ?? s.x, y: d.origY ?? s.y, w: d.origW ?? s.w, h: d.origH ?? s.h }
          if (d.handle?.includes('e')) w = Math.max(40, (d.origW ?? s.w) + dx)
          if (d.handle?.includes('s')) h = Math.max(30, (d.origH ?? s.h) + dy)
          if (d.handle?.includes('w')) { x = (d.origX ?? s.x) + dx; w = Math.max(40, (d.origW ?? s.w) - dx) }
          if (d.handle?.includes('n')) { y = (d.origY ?? s.y) + dy; h = Math.max(30, (d.origH ?? s.h) - dy) }
          return { ...s, x, y, w, h }
        }))
        return
      }
    }

    if (drawRef.current) {
      const dr = drawRef.current
      if (dr.type === 'pen' && dr.points) {
        dr.points = [...dr.points, x, y]
        continuePenCanvas(e.clientX, e.clientY)
        return
      }
      if (dr.type === 'arrow' || dr.type === 'line') {
        drawRef.current = { ...dr, points: [dr.x0, dr.y0, x, y] }
      }
    }
  }

  function onMouseUp(e: React.MouseEvent) {
    const { x, y } = clientToCanvas(e.clientX, e.clientY)

    if (dragRef.current?.type === 'move') {
      commitShapes([...shapes])
    }
    if (dragRef.current?.type === 'resize') {
      commitShapes([...shapes])
    }
    dragRef.current = null

    if (drawRef.current) {
      const dr = drawRef.current
      const w = Math.abs(x - dr.x0); const h = Math.abs(y - dr.y0)
      const nx = Math.min(x, dr.x0); const ny = Math.min(y, dr.y0)

      if (dr.type === 'pen' && dr.points && dr.points.length >= 4) {
        const newShape: WBShape = { id: gid(), type: 'pen', x: 0, y: 0, w: 0, h: 0, fill: 'none', stroke: color, strokeWidth: strokeW, opacity: 1, points: dr.points }
        commitShapes([...shapes, newShape])
        clearPenCanvas()
      } else if ((dr.type === 'arrow' || dr.type === 'line') && (w > 5 || h > 5)) {
        const pts2 = dr.points || [dr.x0, dr.y0, x, y]
        const newShape: WBShape = { id: gid(), type: dr.type as ShapeType, x: 0, y: 0, w: 0, h: 0, fill: 'none', stroke: color, strokeWidth: strokeW, opacity: 1, points: pts2, arrowEnd: dr.type === 'arrow' }
        commitShapes([...shapes, newShape])
      } else if (dr.type === 'rect' || dr.type === 'frame') {
        if (w < 10 && h < 10) { drawRef.current = null; return }
        const newShape: WBShape = { id: gid(), type: dr.type as ShapeType, x: nx, y: ny, w: Math.max(w, 40), h: Math.max(h, 30), fill: fillColor, stroke: color, strokeWidth: strokeW, opacity: 1 }
        commitShapes([...shapes, newShape])
      } else if (dr.type === 'circle') {
        if (w < 10 && h < 10) { drawRef.current = null; return }
        const newShape: WBShape = { id: gid(), type: 'circle', x: nx, y: ny, w: Math.max(w, 30), h: Math.max(h, 30), fill: fillColor, stroke: color, strokeWidth: strokeW, opacity: 1 }
        commitShapes([...shapes, newShape])
      } else if (dr.type === 'text') {
        const newShape: WBShape = { id: gid(), type: 'text', x: dr.x0, y: dr.y0, w: Math.max(w, 120), h: Math.max(h, 40), fill: color, stroke: 'transparent', strokeWidth: 0, opacity: 1, text: '', fontSize }
        const ns = [...shapes, newShape]
        commitShapes(ns); setEditingId(newShape.id); setSelected(new Set([newShape.id]))
      } else if (dr.type === 'sticky') {
        const newShape: WBShape = { id: gid(), type: 'sticky', x: dr.x0, y: dr.y0, w: Math.max(w || 180, 160), h: Math.max(h || 120, 100), fill: '#0A1628', stroke: 'transparent', strokeWidth: 0, opacity: 1, text: '', fontSize, stickyColor: stickyC }
        const ns = [...shapes, newShape]
        commitShapes(ns); setEditingId(newShape.id); setSelected(new Set([newShape.id]))
      } else if (dr.type === 'table') {
        const newShape: WBShape = { id: gid(), type: 'table', x: nx, y: ny, w: Math.max(w, 200), h: Math.max(h, 100), fill: '#F0F4FF', stroke: '#5DE0E6', strokeWidth: 1, opacity: 1, tableData: [['Columna 1','Columna 2','Columna 3'],['','',''],[' ','','']] }
        commitShapes([...shapes, newShape])
      }
      drawRef.current = null
    }
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault()
    if (e.ctrlKey || e.metaKey) {
      const delta = e.deltaY > 0 ? 0.9 : 1.1
      setZoom(z => clamp(z * delta, 0.2, 4))
    } else {
      setPan(p => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }))
    }
  }

  // ── Pen canvas helpers ────────────────────────────────────────────────────
  function startPenCanvas(cx: number, cy: number) {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const { x, y } = clientToCanvas(cx, cy)
    ctx.strokeStyle = color; ctx.lineWidth = strokeW / zoom; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.beginPath(); ctx.moveTo(x, y)
  }
  function continuePenCanvas(cx: number, cy: number) {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const { x, y } = clientToCanvas(cx, cy)
    ctx.lineTo(x, y); ctx.stroke()
  }
  function clearPenCanvas() {
    const canvas = canvasRef.current; if (!canvas) return
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
  }

  // ── Text & table changes ──────────────────────────────────────────────────
  function onTextChange(id: string, t: string) {
    setShapes(prev => prev.map(s => {
      if (s.id !== id) return s
      if (s.type === 'table') {
        try { return { ...s, tableData: JSON.parse(t) } } catch { return s }
      }
      return { ...s, text: t }
    }))
  }

  // ── Copy/Paste ─────────────────────────────────────────────────────────────
  useEffect(() => {
    function onCopy(e: ClipboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (!selected.size) return
      const data = shapes.filter(s => selected.has(s.id))
      e.clipboardData?.setData('application/x-wb-shapes', JSON.stringify(data))
      e.preventDefault()
    }
    function onPaste(e: ClipboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      const raw = e.clipboardData?.getData('application/x-wb-shapes')
      if (!raw) return
      try {
        const pasted = JSON.parse(raw) as WBShape[]
        const offset = 20
        const newShapes = pasted.map(s => ({ ...s, id: gid(), x: s.x + offset, y: s.y + offset }))
        commitShapes([...shapes, ...newShapes])
        setSelected(new Set(newShapes.map(s => s.id)))
      } catch {}
      e.preventDefault()
    }
    window.addEventListener('copy', onCopy)
    window.addEventListener('paste', onPaste)
    return () => { window.removeEventListener('copy', onCopy); window.removeEventListener('paste', onPaste) }
  }, [selected, shapes, commitShapes])

  // ── Drawing preview overlays ───────────────────────────────────────────────
  function DrawingPreview() {
    if (!drawRef.current) return null
    const dr = drawRef.current
    if (dr.type === 'arrow' || dr.type === 'line') {
      const [x1=dr.x0, y1=dr.y0, x2=dr.x0, y2=dr.y0] = dr.points || []
      return (
        <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}>
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={strokeW} strokeDasharray='4 3' strokeLinecap='round' />
        </svg>
      )
    }
    return null
  }

  const sortedShapes = [...shapes].sort((a, b) => {
    const v = ['piece','pen','line','arrow','rect','frame','circle','table','text','sticky']
    const ai = v.indexOf(a.type); const bi = v.indexOf(b.type)
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)
  })

  const toolCursor: Record<Tool, string> = {
    select: 'default', pan: 'grab', pen: 'crosshair', text: 'text',
    sticky: 'crosshair', rect: 'crosshair', circle: 'crosshair', arrow: 'crosshair',
    line: 'crosshair', frame: 'crosshair', table: 'crosshair', eraser: 'cell',
  }

  const T = ({ toolKey, icon, title, k }: { toolKey: string; icon: string; title: string; k: string }) => (
    <button
      title={`${title} [${k}]`}
      onClick={() => setTool(toolKey as Tool)}
      style={{
        width: 34, height: 34, borderRadius: 7, border: 'none', cursor: 'pointer',
        background: tool === toolKey ? 'rgba(93,224,230,.2)' : 'transparent',
        outline: tool === toolKey ? '1.5px solid rgba(93,224,230,.5)' : '1px solid transparent',
        fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: tool === toolKey ? '#5DE0E6' : '#8899BB', transition: 'all .1s',
      }}>
      {icon}
    </button>
  )

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#0A1628', position: 'relative', userSelect: 'none' }}>

      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderBottom: '1px solid rgba(93,224,230,.1)', background: '#111827', flexWrap: 'wrap', flexShrink: 0 }}>

        {/* Tools */}
        <div style={{ display: 'flex', gap: 2, background: 'rgba(93,224,230,.04)', borderRadius: 8, padding: '2px' }}>
          {[
            { key:'select', icon:'🖱️', title:'Seleccionar',  k:'V' },
            { key:'pan',    icon:'✋', title:'Mover canvas', k:'Espacio' },
            { key:'pen',    icon:'✏️', title:'Lápiz libre',  k:'P' },
            { key:'text',   icon:'T',  title:'Texto',        k:'T' },
            { key:'sticky', icon:'📝', title:'Post-it',      k:'N' },
            { key:'rect',   icon:'▭',  title:'Rectángulo',   k:'R' },
            { key:'circle', icon:'○',  title:'Círculo',      k:'C' },
            { key:'arrow',  icon:'→',  title:'Flecha',       k:'A' },
            { key:'line',   icon:'╱',  title:'Línea',        k:'L' },
            { key:'frame',  icon:'⬜', title:'Marco/Grupo',  k:'F' },
            { key:'table',  icon:'⊞',  title:'Tabla',        k:'' },
            { key:'eraser', icon:'⌫',  title:'Borrador',     k:'' },
          ].map(t => <T key={t.key} toolKey={t.key} icon={t.icon} title={t.title} k={t.k} />)}
        </div>

        <div style={{ width: 1, height: 24, background: 'rgba(93,224,230,.15)', margin: '0 4px' }} />

        {/* Colors */}
        <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
          <span style={{ fontSize: 9, color: '#8899BB' }}>Trazo</span>
          {COLORS.map(c => (
            <button key={c} onClick={() => setColor(c)} style={{ width: 18, height: 18, borderRadius: '50%', background: c === 'transparent' ? 'none' : c, border: `2px solid ${color === c ? '#5DE0E6' : (c === '#F0F4FF' ? '#444' : 'transparent')}`, cursor: 'pointer', boxSizing: 'border-box' }} />
          ))}
        </div>

        <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
          <span style={{ fontSize: 9, color: '#8899BB' }}>Relleno</span>
          {['transparent', ...COLORS.slice(0, 6)].map(c => (
            <button key={c} onClick={() => setFillColor(c)} style={{ width: 18, height: 18, borderRadius: 3, background: c === 'transparent' ? 'none' : c, border: `2px solid ${fillColor === c ? '#5DE0E6' : (c === '#F0F4FF' ? '#444' : 'transparent')}`, cursor: 'pointer', boxSizing: 'border-box', position: 'relative' }}>
              {c === 'transparent' && <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#8899BB' }}>∅</span>}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 24, background: 'rgba(93,224,230,.15)', margin: '0 4px' }} />

        {/* Stroke width */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {[1,2,4,6].map(w => (
            <button key={w} onClick={() => setStrokeW(w)} style={{ width: 28, height: 22, borderRadius: 5, background: strokeW === w ? 'rgba(93,224,230,.15)' : 'transparent', border: `1px solid ${strokeW === w ? 'rgba(93,224,230,.4)' : 'transparent'}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ height: w, width: 16, background: '#8899BB', borderRadius: w }} />
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 24, background: 'rgba(93,224,230,.15)', margin: '0 4px' }} />

        {/* Sticky colors */}
        {(tool === 'sticky') && (
          <>
            <span style={{ fontSize: 9, color: '#8899BB' }}>Post-it</span>
            {STICKY_C.map(c => (
              <button key={c} onClick={() => setStickyC(c)} style={{ width: 18, height: 18, borderRadius: 3, background: c, border: `2px solid ${stickyC === c ? '#5DE0E6' : 'transparent'}`, cursor: 'pointer' }} />
            ))}
            <div style={{ width: 1, height: 24, background: 'rgba(93,224,230,.15)', margin: '0 4px' }} />
          </>
        )}

        {/* Font size */}
        {(tool === 'text' || tool === 'sticky') && (
          <select value={fontSize} onChange={e => setFontSize(Number(e.target.value))} style={{ background: '#1E2A3A', border: '1px solid rgba(93,224,230,.2)', borderRadius: 6, padding: '3px 6px', color: '#F0F4FF', fontSize: 11 }}>
            {[10,12,13,14,16,18,20,24,28,32,40,48].map(n => <option key={n} value={n}>{n}px</option>)}
          </select>
        )}

        <div style={{ flex: 1 }} />

        {/* Undo/Redo */}
        <button onClick={undo} disabled={histIdx <= 0} title='Deshacer [Ctrl+Z]' style={{ ...btnStyle, opacity: histIdx <= 0 ? .4 : 1 }}>↩</button>
        <button onClick={redo} disabled={histIdx >= history.length - 1} title='Rehacer [Ctrl+Y]' style={{ ...btnStyle, opacity: histIdx >= history.length - 1 ? .4 : 1 }}>↪</button>

        {/* Zoom */}
        <button onClick={() => setZoom(z => clamp(z - 0.1, 0.2, 4))} style={btnStyle}>−</button>
        <span style={{ fontSize: 10, color: '#8899BB', minWidth: 36, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => clamp(z + 0.1, 0.2, 4))} style={btnStyle}>+</button>
        <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }} style={{ ...btnStyle, fontSize: 9 }}>⊡</button>

        {/* Clear */}
        {!readOnly && <button onClick={() => { if (confirm('¿Limpiar pizarra?')) commitShapes([]) }} title='Limpiar pizarra' style={{ ...btnStyle, color: '#EF4444' }}>🗑</button>}

        {/* Online */}
        <div style={{ fontSize: 9, color: '#22C55E', background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.2)', borderRadius: 10, padding: '2px 8px' }}>
          {onlineCount > 1 ? `👥 ${onlineCount}` : '●'} online
        </div>
      </div>

      {/* ── Canvas area ─────────────────────────────────────────────────────── */}
      <div ref={containerRef}
        style={{ flex: 1, overflow: 'hidden', position: 'relative', cursor: toolCursor[tool] }}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp} onWheel={onWheel}>

        {/* Transformed container */}
        <div style={{ width: '100%', height: '100%', transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`, transformOrigin: '0 0', position: 'relative' }}>

          {/* Dot grid */}
          <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none', width: 4000, height: 3000 }}>
            <defs>
              <pattern id='wbdots' x='0' y='0' width='40' height='40' patternUnits='userSpaceOnUse'>
                <circle cx='1' cy='1' r='1' fill='rgba(93,224,230,.1)' />
              </pattern>
            </defs>
            <rect width='100%' height='100%' fill='url(#wbdots)' />
          </svg>

          {/* SVG vector layer (pen, arrows, lines) */}
          <SVGLayer shapes={sortedShapes} selected={selected} tool={tool} onMouseDown={onShapeMouseDown} />

          {/* DOM shapes */}
          {sortedShapes.filter(s => s.type !== 'pen' && s.type !== 'arrow' && s.type !== 'line').map(s => (
            <ShapeEl key={s.id} s={s} selected={selected.has(s.id)} tool={tool} zoom={zoom}
              onMouseDown={onShapeMouseDown} onTextChange={onTextChange} editingId={editingId} />
          ))}

          {/* Selection handles */}
          <SelectionHandles shapes={shapes} selected={selected} zoom={zoom} onResizeStart={onResizeStart} />

          {/* Drawing preview */}
          <DrawingPreview />

          {/* Collaborator cursors */}
          {Object.values(cursors).map(c => (
            <div key={c.name} style={{ position: 'absolute', left: c.x, top: c.y, pointerEvents: 'none', zIndex: 200 }}>
              <div style={{ fontSize: 16 }}>🖱</div>
              <div style={{ background: c.color, color: '#fff', fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 8, whiteSpace: 'nowrap', marginTop: -4 }}>{c.name}</div>
            </div>
          ))}
        </div>

        {/* Pen canvas overlay */}
        <canvas ref={canvasRef} width={3000} height={3000}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none', transform: `translate(${pan.x}px,${pan.y}px)`, transformOrigin: '0 0' }} />
      </div>

      {/* Hint bar */}
      <div style={{ padding: '3px 10px', fontSize: 9, color: '#8899BB', borderTop: '1px solid rgba(93,224,230,.06)', background: '#111827', display: 'flex', gap: 14, flexShrink: 0 }}>
        <span>Scroll → pan  •  Ctrl+Scroll → zoom  •  Doble clic → editar texto  •  Supr → borrar selección</span>
        <span style={{ marginLeft: 'auto' }}>Shapes: {shapes.length} · Selec: {selected.size}</span>
      </div>
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  background: 'transparent', border: '1px solid rgba(93,224,230,.15)', borderRadius: 6,
  width: 28, height: 28, cursor: 'pointer', fontSize: 14, color: '#8899BB',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}
