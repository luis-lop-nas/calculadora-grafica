import { useEffect, useRef, useState } from 'react'
import { Escena3D } from '../render/escena3d'
import { Pintor2D } from '../render/pintor2d'
import { alCambiarTema } from '../render/tema'
import * as THREE from 'three'
import { varCss } from '../render/tema'
import type { Asa, Vista2D, Vista3D } from './tipos'

/** Acepta `--pos`, `var(--pos)` o un color literal. */
function colorDeAsa(c: string | undefined) {
  const nombre = c?.match(/^(?:var\()?(--[\w-]+)\)?$/)?.[1]
  return nombre ? varCss(nombre) : c || varCss('--accent')
}

/** Nada de borrar asas mientras se escribe en el panel. */
function escribiendo(ev: KeyboardEvent) {
  const t = ev.target as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
}

function descargarCanvas(canvas: HTMLCanvasElement, nombre: string) {
  const a = document.createElement('a')
  a.href = canvas.toDataURL('image/png')
  a.download = `${nombre}.png`
  a.click()
}

/**
 * Cámara compartida entre dos lienzos (modo Comparar). En 2D se comparte el
 * centro y los píxeles por unidad, no la ventana: cada lienzo conserva sus
 * proporciones. Quien cambia la cámara sube `marca` y el otro la adopta.
 */
export interface Enlace {
  marca: number
  plano: { cx: number; cy: number; escala: number } | null
  orb: { theta: number; phi: number; r: number } | null
}

interface Extras {
  enlace?: Enlace | null
  /** Sin fondo propio: va encima de otro lienzo. */
  transparente?: boolean
  /** Sin botones propios (el de debajo ya los tiene). */
  secundario?: boolean
}

/** Lienzo WebGL con cámara en órbita. */
export function Lienzo3D({ vista, s, set, giro, enlace, transparente, secundario }: { vista: Vista3D<any>; s: any; set: (p: any) => void; giro: boolean } & Extras) {
  const ref = useRef<HTMLCanvasElement>(null)
  const estado = useRef({ vista, s, set, giro, enlace })
  estado.current = { vista, s, set, giro, enlace }
  const escena = useRef<Escena3D | null>(null)
  const sucio = useRef(true)
  const construyendo = useRef(false)
  const [plano, setPlano] = useState<'3d' | 'x' | 'y' | 'z'>('3d')
  const [rejillaCompleta, setRejillaCompleta] = useState(false)
  const [calculando, setCalculando] = useState(false)

  useEffect(() => {
    const canvas = ref.current!
    const e = new Escena3D(canvas, !!transparente)
    e.rejillaCompleta = rejillaCompleta
    escena.current = e
    e.fondo()
    const cam = estado.current.vista.camara
    if (cam) e.orb = { ...cam }

    // Solo se pinta cuando algo cambia: una escena quieta no gasta GPU (ni batería).
    let pedir = true
    let ultimaCamara = ''
    let miMarca = -1

    const ro = new ResizeObserver(() => {
      const p = canvas.parentElement!
      e.dimensionar(p.clientWidth, p.clientHeight)
      pedir = true
    })
    ro.observe(canvas.parentElement!)

    const punteros = new Map<number, { x: number; y: number }>()
    let pellizco = 0
    // Asas: la lista vigente, la que está bajo el ratón y la que se arrastra.
    let asas: Asa[] = []
    let encima: string | null = null
    let mano: { id: string; desfase: number[] } | null = null
    const local = (ev: { clientX: number; clientY: number }) => {
      const r = canvas.getBoundingClientRect()
      return { x: ev.clientX - r.left, y: ev.clientY - r.top }
    }
    const repintarAsas = () => {
      pedir = true
      e.ponerAsas(
        asas.map((a) => ({ id: a.id, p: a.p, color: new THREE.Color(colorDeAsa(a.color)) })),
        mano?.id ?? encima,
      )
    }
    const aplicar = (parche: any) => {
      if (parche) estado.current.set(parche)
    }
    const cursor = () => {
      canvas.style.cursor = mano ? 'grabbing' : encima ? 'pointer' : ''
    }

    const abajo = (ev: PointerEvent) => {
      canvas.setPointerCapture(ev.pointerId)
      punteros.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
      const inter = estado.current.vista.interaccion
      if (punteros.size === 1 && inter) {
        const { x, y } = local(ev)
        const id = e.asaEn(x, y)
        const asa = id ? asas.find((a) => a.id === id) : null
        if (asa) {
          // se guarda el desfase para que el punto no salte al agarrarlo por el borde
          const bajo = asa.sobre === 'superficie' ? null : e.puntoEnPlano(x, y, asa.p, ev.shiftKey)
          mano = { id: asa.id, desfase: bajo ? asa.p.map((c, i) => c - bajo[i]) : [0, 0, 0] }
          repintarAsas()
          cursor()
          return
        }
      }
      if (punteros.size === 2) {
        mano = null
        const [a, b] = [...punteros.values()]
        pellizco = Math.hypot(a.x - b.x, a.y - b.y)
      }
    }
    const mover = (ev: PointerEvent) => {
      const inter = estado.current.vista.interaccion
      const { x, y } = local(ev)
      if (mano && inter) {
        const asa = asas.find((a) => a.id === mano!.id)
        if (!asa) return
        let toque: { p: number[]; uv?: [number, number] } | null = null
        if (asa.sobre === 'superficie' && !ev.shiftKey) toque = e.puntoEnMalla(x, y)
        if (!toque) {
          const q = e.puntoEnPlano(x, y, asa.p, ev.shiftKey)
          if (q) toque = { p: q.map((c, i) => c + (ev.shiftKey && i < 2 ? 0 : mano!.desfase[i] ?? 0)) }
        }
        if (toque) aplicar(inter.mover(asa.id, { ...toque, mayus: ev.shiftKey }, estado.current.s))
        return
      }
      const p = punteros.get(ev.pointerId)
      if (!p) {
        // solo pasando por encima: resaltar lo que se puede agarrar
        if (inter) {
          const id = e.asaEn(x, y)
          if (id !== encima) {
            encima = id
            repintarAsas()
            cursor()
          }
        }
        return
      }
      if (punteros.size === 1) {
        e.orb.theta += (ev.clientX - p.x) * 0.008
        e.orb.phi = Math.min(3.05, Math.max(0.09, e.orb.phi - (ev.clientY - p.y) * 0.008))
      }
      p.x = ev.clientX
      p.y = ev.clientY
      if (punteros.size === 2) {
        const [a, b] = [...punteros.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        if (pellizco) e.acercar(pellizco / d)
        pellizco = d
      }
    }
    const arriba = (ev: PointerEvent) => {
      punteros.delete(ev.pointerId)
      pellizco = 0
      if (mano) {
        mano = null
        repintarAsas()
        cursor()
      }
    }
    const doble = (ev: MouseEvent) => {
      const inter = estado.current.vista.interaccion
      if (!inter) return
      const { x, y } = local(ev)
      const id = e.asaEn(x, y)
      if (id) {
        if (inter.quitar) aplicar(inter.quitar(id, estado.current.s))
        return
      }
      if (!inter.anadir) return
      let toque: { p: number[]; uv?: [number, number] } | null = e.puntoEnMalla(x, y)
      if (!toque) {
        const q = e.puntoEnPlano(x, y, [0, 0, inter.suelo ?? 0], false)
        if (q) toque = { p: q }
      }
      if (toque) aplicar(inter.anadir({ ...toque, mayus: ev.shiftKey }, estado.current.s))
    }
    const tecla = (ev: KeyboardEvent) => {
      const inter = estado.current.vista.interaccion
      if (!encima || !inter?.quitar || escribiendo(ev)) return
      if (ev.key !== 'Delete' && ev.key !== 'Backspace') return
      ev.preventDefault()
      aplicar(inter.quitar(encima, estado.current.s))
      encima = null
      cursor()
    }
    const fuera = () => {
      if (encima && !mano) {
        encima = null
        repintarAsas()
        cursor()
      }
    }
    const rueda = (ev: WheelEvent) => {
      ev.preventDefault()
      e.acercar(Math.exp(ev.deltaY * 0.001))
    }
    canvas.addEventListener('pointerdown', abajo)
    canvas.addEventListener('pointermove', mover)
    canvas.addEventListener('pointerup', arriba)
    canvas.addEventListener('pointercancel', arriba)
    canvas.addEventListener('wheel', rueda, { passive: false })
    canvas.addEventListener('dblclick', doble)
    canvas.addEventListener('pointerleave', fuera)
    window.addEventListener('keydown', tecla)

    const quitarTema = alCambiarTema(() => {
      e.fondo()
      sucio.current = true
      pedir = true
    })

    const lento = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let t0 = performance.now()
    let previo = t0
    let vivo = true
    const bucle = (ahora: number) => {
      if (!vivo) return
      const dt = Math.min(0.05, (ahora - previo) / 1000)
      previo = ahora
      const t = (ahora - t0) / 1000
      const { vista: v, s: st, giro: g } = estado.current
      if (sucio.current && !construyendo.current) {
        sucio.current = false
        const construir = () => {
          if (!vivo) return
          e.limpiar()
          v.construir(e, st)
          asas = v.interaccion?.asas(st) ?? []
          if (encima && !asas.some((a) => a.id === encima)) encima = null
          repintarAsas()
          construyendo.current = false
          setCalculando(false)
        }
        // mientras se arrastra un asa no se enseña «calculando»: parpadearía a cada paso
        if (v.pesada && !mano) {
          construyendo.current = true
          setCalculando(true)
          requestAnimationFrame(construir)
        } else construir()
      }
      if (g && !lento && punteros.size === 0) e.orb.theta += dt * 0.25
      v.animar?.(e, st, t, dt)
      const enl = estado.current.enlace
      if (enl) {
        // se adopta la órbita del otro lienzo, o se publica la propia si ha cambiado aquí
        if (enl.marca !== miMarca && enl.orb) {
          e.orb = { ...enl.orb }
          miMarca = enl.marca
        } else if (`${e.orb.theta}|${e.orb.phi}|${e.orb.r}` !== ultimaCamara) {
          enl.orb = { ...e.orb }
          enl.marca++
          miMarca = enl.marca
        }
      }
      const camara = `${e.orb.theta}|${e.orb.phi}|${e.orb.r}`
      if (pedir || camara !== ultimaCamara || v.animar) {
        e.pintar()
        pedir = false
        ultimaCamara = camara
      }
      requestAnimationFrame(bucle)
    }
    requestAnimationFrame(bucle)

    return () => {
      vivo = false
      ro.disconnect()
      quitarTema()
      canvas.removeEventListener('pointerdown', abajo)
      canvas.removeEventListener('pointermove', mover)
      canvas.removeEventListener('pointerup', arriba)
      canvas.removeEventListener('pointercancel', arriba)
      canvas.removeEventListener('wheel', rueda)
      canvas.removeEventListener('dblclick', doble)
      canvas.removeEventListener('pointerleave', fuera)
      window.removeEventListener('keydown', tecla)
      e.destruir()
      escena.current = null
      // una construcción diferida que no llegó a correr no puede dejar el lienzo nuevo bloqueado
      construyendo.current = false
      sucio.current = true
    }
  }, [vista])

  // Cambia el estado → hay que reconstruir la escena.
  useEffect(() => {
    sucio.current = true
  }, [s])

  return (
    <>
      <canvas ref={ref} className="arrastrable" />
      {calculando && <div className="calculando" role="status">Calculando…</div>}
      {!secundario && <div className="controles-3d" role="group" aria-label="Orientación de la escena">
        {(['3d', 'x', 'y', 'z'] as const).map((modo) => (
          <button
            key={modo}
            type="button"
            className={plano === modo ? 'activo' : undefined}
            aria-pressed={plano === modo}
            onClick={() => {
              setPlano(modo)
              const cam = escena.current
              if (!cam) return
              if (modo === 'x') cam.orb = { theta: 0, phi: Math.PI / 2, r: cam.orb.r }
              if (modo === 'y') cam.orb = { theta: 0, phi: 0.08, r: cam.orb.r }
              if (modo === 'z') cam.orb = { theta: Math.PI / 2, phi: Math.PI / 2, r: cam.orb.r }
              if (modo === '3d' && vista.camara) cam.orb = { ...vista.camara }
              sucio.current = true
            }}
          >
            {modo === '3d' ? '3D' : modo.toUpperCase()}
          </button>
        ))}
        <button
          type="button"
          className={rejillaCompleta ? 'activo' : undefined}
          aria-pressed={rejillaCompleta}
          title="Mostrar cuadrículas en XY, XZ e YZ"
          onClick={() => {
            const cam = escena.current
            if (!cam) return
            const siguiente = !cam.rejillaCompleta
            cam.rejillaCompleta = siguiente
            setRejillaCompleta(siguiente)
            sucio.current = true
          }}
        >
          Planos
        </button>
        <button type="button" title="Descargar imagen PNG" onClick={() => ref.current && descargarCanvas(ref.current, 'calculadora-3d')}>
          PNG
        </button>
      </div>}
    </>
  )
}

/** Lienzo 2D con paneo, zoom y coordenadas del mundo. */
export function Lienzo2D({ vista, s, set, enlace, secundario }: { vista: Vista2D<any>; s: any; set: (p: any) => void } & Extras) {
  const ref = useRef<HTMLCanvasElement>(null)
  const estado = useRef({ vista, s, set, enlace })
  estado.current = { vista, s, set, enlace }
  const sucio = useRef(true)

  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')!
    const g = new Pintor2D(ctx)
    const v0 = estado.current.vista
    g.ventana = v0.ventana ? { x: [...v0.ventana.x], y: [...v0.ventana.y] } : { x: [-5, 5], y: [-5, 5] }
    const navegable = v0.navegable !== false
    let primeraVez = true

    const medir = () => {
      const p = canvas.parentElement!
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      g.ancho = p.clientWidth
      g.alto = p.clientHeight
      canvas.width = Math.round(g.ancho * dpr)
      canvas.height = Math.round(g.alto * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (primeraVez && g.ancho > 0) {
        g.igualarEscala()
        primeraVez = false
      }
      sucio.current = true
    }
    const ro = new ResizeObserver(medir)
    ro.observe(canvas.parentElement!)
    medir()

    let arrastre: { x: number; y: number; movido: boolean } | null = null
    let asas: Asa[] = []
    let encima: string | null = null
    let mano: { id: string; dx: number; dy: number } | null = null
    const local = (ev: { clientX: number; clientY: number }) => {
      const r = canvas.getBoundingClientRect()
      return { x: ev.clientX - r.left, y: ev.clientY - r.top }
    }
    const asaEn = (x: number, y: number) => {
      let mejor: string | null = null
      let dmin = 12
      for (const a of asas) {
        const d = Math.hypot(g.X(a.p[0]) - x, g.Y(a.p[1]) - y)
        if (d < dmin) {
          dmin = d
          mejor = a.id
        }
      }
      return mejor
    }
    const aplicar = (parche: any) => {
      if (parche) estado.current.set(parche)
    }
    const cursor = () => {
      canvas.style.cursor = mano ? 'grabbing' : encima ? 'pointer' : ''
    }

    const abajo = (ev: PointerEvent) => {
      canvas.setPointerCapture(ev.pointerId)
      const { x, y } = local(ev)
      const id = estado.current.vista.interaccion ? asaEn(x, y) : null
      const asa = id ? asas.find((q) => q.id === id) : null
      if (asa) {
        const m = g.aMundo(x, y)
        mano = { id: asa.id, dx: asa.p[0] - m.x, dy: asa.p[1] - m.y }
        sucio.current = true
        cursor()
        return
      }
      arrastre = { x: ev.clientX, y: ev.clientY, movido: false }
    }
    const mover = (ev: PointerEvent) => {
      const inter = estado.current.vista.interaccion
      const { x, y } = local(ev)
      if (mano && inter) {
        const asa = asas.find((q) => q.id === mano!.id)
        if (!asa) return
        const m = g.aMundo(x, y)
        const p = [asa.eje === 'y' ? asa.p[0] : m.x + mano.dx, asa.eje === 'x' ? asa.p[1] : m.y + mano.dy]
        aplicar(inter.mover(asa.id, { p, mayus: ev.shiftKey }, estado.current.s))
        return
      }
      if (!arrastre) {
        if (inter) {
          const id = asaEn(x, y)
          if (id !== encima) {
            encima = id
            sucio.current = true
            cursor()
          }
        }
        return
      }
      const dx = ev.clientX - arrastre.x
      const dy = ev.clientY - arrastre.y
      if (Math.abs(dx) + Math.abs(dy) > 3) arrastre.movido = true
      if (!navegable) return
      const ux = dx / g.escalaX
      const uy = dy / g.escalaY
      g.ventana = {
        x: [g.ventana.x[0] - ux, g.ventana.x[1] - ux],
        y: [g.ventana.y[0] + uy, g.ventana.y[1] + uy],
      }
      arrastre.x = ev.clientX
      arrastre.y = ev.clientY
      sucio.current = true
    }
    const arriba = (ev: PointerEvent) => {
      if (mano) {
        mano = null
        sucio.current = true
        cursor()
        return
      }
      const alPulsar = estado.current.vista.alPulsar
      if (arrastre && !arrastre.movido && alPulsar) {
        const { x, y } = local(ev)
        const parche = alPulsar(g.aMundo(x, y), estado.current.s)
        if (parche) estado.current.set(parche)
      }
      arrastre = null
    }
    const doble = (ev: MouseEvent) => {
      const inter = estado.current.vista.interaccion
      if (!inter) return
      const { x, y } = local(ev)
      const id = asaEn(x, y)
      if (id) {
        if (inter.quitar) aplicar(inter.quitar(id, estado.current.s))
        return
      }
      const m = g.aMundo(x, y)
      if (inter.anadir) aplicar(inter.anadir({ p: [m.x, m.y], mayus: ev.shiftKey }, estado.current.s))
    }
    const tecla = (ev: KeyboardEvent) => {
      const inter = estado.current.vista.interaccion
      if (!encima || !inter?.quitar || escribiendo(ev)) return
      if (ev.key !== 'Delete' && ev.key !== 'Backspace') return
      ev.preventDefault()
      aplicar(inter.quitar(encima, estado.current.s))
      encima = null
      cursor()
    }
    const fuera = () => {
      if (encima && !mano) {
        encima = null
        sucio.current = true
        cursor()
      }
    }
    const rueda = (ev: WheelEvent) => {
      if (!navegable) return
      ev.preventDefault()
      const r = canvas.getBoundingClientRect()
      const c = g.aMundo(ev.clientX - r.left, ev.clientY - r.top)
      const k = Math.exp(ev.deltaY * 0.0012)
      g.ventana = {
        x: [c.x + (g.ventana.x[0] - c.x) * k, c.x + (g.ventana.x[1] - c.x) * k],
        y: [c.y + (g.ventana.y[0] - c.y) * k, c.y + (g.ventana.y[1] - c.y) * k],
      }
      sucio.current = true
    }
    canvas.addEventListener('pointerdown', abajo)
    canvas.addEventListener('pointermove', mover)
    canvas.addEventListener('pointerup', arriba)
    canvas.addEventListener('pointercancel', () => (arrastre = null))
    canvas.addEventListener('wheel', rueda, { passive: false })
    canvas.addEventListener('dblclick', doble)
    canvas.addEventListener('pointerleave', fuera)
    window.addEventListener('keydown', tecla)

    const quitarTema = alCambiarTema(() => {
      sucio.current = true
    })

    let t0 = performance.now()
    let vivo = true
    let miMarca = -1
    let ultimaFirma = ''
    const bucle = (ahora: number) => {
      if (!vivo) return
      const { vista: v, s: st, enlace: enl } = estado.current
      if (enl && g.ancho > 0) {
        // la firma se saca siempre de la ventana, con la misma cuenta: si al adoptar
        // se guardara la del otro lado, el redondeo haría que los dos se la
        // devolvieran en cada fotograma y no pararían de redibujar
        const firmaDe = () => {
          const cx = (g.ventana.x[0] + g.ventana.x[1]) / 2
          const cy = (g.ventana.y[0] + g.ventana.y[1]) / 2
          const escala = g.ancho / (g.ventana.x[1] - g.ventana.x[0])
          return { cx, cy, escala, firma: `${cx}|${cy}|${escala}` }
        }
        const { cx, cy, escala, firma } = firmaDe()
        if (enl.marca !== miMarca && enl.plano) {
          const { cx: X, cy: Y, escala: k } = enl.plano
          g.ventana = { x: [X - g.ancho / 2 / k, X + g.ancho / 2 / k], y: [Y - g.alto / 2 / k, Y + g.alto / 2 / k] }
          miMarca = enl.marca
          ultimaFirma = firmaDe().firma
          sucio.current = true
        } else if (firma !== ultimaFirma) {
          enl.plano = { cx, cy, escala }
          enl.marca++
          miMarca = enl.marca
          ultimaFirma = firma
        }
      }
      const anima = v.animada?.(st) ?? false
      if (sucio.current || anima) {
        sucio.current = false
        g.limpiar()
        v.dibujar(g, st, (ahora - t0) / 1000)
        asas = v.interaccion?.asas(st) ?? []
        if (encima && !asas.some((a) => a.id === encima)) encima = null
        pintarAsas2d(g, asas, mano?.id ?? encima)
      }
      requestAnimationFrame(bucle)
    }
    requestAnimationFrame(bucle)

    return () => {
      vivo = false
      ro.disconnect()
      quitarTema()
      canvas.removeEventListener('pointerdown', abajo)
      canvas.removeEventListener('pointermove', mover)
      canvas.removeEventListener('pointerup', arriba)
      canvas.removeEventListener('wheel', rueda)
      canvas.removeEventListener('dblclick', doble)
      canvas.removeEventListener('pointerleave', fuera)
      window.removeEventListener('keydown', tecla)
    }
  }, [vista])

  useEffect(() => {
    sucio.current = true
  }, [s])

  return (
    <>
      <canvas ref={ref} className={vista.navegable === false ? undefined : 'arrastrable'} />
      {!secundario && (
        <button className="exportar-lienzo" type="button" title="Descargar imagen PNG" onClick={() => ref.current && descargarCanvas(ref.current, 'calculadora-2d')}>
          PNG
        </button>
      )}
    </>
  )
}

function pintarAsas2d(g: Pintor2D, asas: Asa[], activa: string | null) {
  const ctx = g.ctx
  const tinta = varCss('--ink')
  const fondo = varCss('--stage')
  ctx.save()
  for (const a of asas) {
    const x = g.X(a.p[0])
    const y = g.Y(a.p[1])
    const r = a.id === activa ? 8 : 6
    ctx.beginPath()
    ctx.arc(x, y, r + 2, 0, 2 * Math.PI)
    ctx.fillStyle = fondo
    ctx.fill()
    ctx.beginPath()
    ctx.arc(x, y, r, 0, 2 * Math.PI)
    ctx.fillStyle = colorDeAsa(a.color)
    ctx.fill()
    if (a.id === activa) {
      ctx.beginPath()
      ctx.arc(x, y, r + 5, 0, 2 * Math.PI)
      ctx.strokeStyle = tinta
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
    if (a.nombre) {
      ctx.font = `italic 15px ${varCss('--serif') || 'Georgia, serif'}`
      ctx.fillStyle = tinta
      ctx.textBaseline = 'bottom'
      ctx.fillText(a.nombre, x + r + 4, y - r)
    }
  }
  ctx.restore()
}
