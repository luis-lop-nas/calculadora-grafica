import { useContext, useEffect, useRef, useState } from 'react'
import { Escena3D } from '../render/escena3d'
import { ContextoVista, alOrdenVista, relojLienzo, type PrefsVista } from './vista'
import { escritorio } from './escritorio'
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

/** Paso del giro con Mayús; el de la rejilla sale de las preferencias de vista (0,5 por defecto). */
const PASO_GIRO = Math.PI / 12

/** Con Mayús: solo cambia la coordenada que más se ha movido, y cae en la rejilla. */
function aEjes(p0: number[], q: number[], paso: number): { p: number[]; eje: number } {
  const d = q.map((c, i) => c - (p0[i] ?? 0))
  let k = 0
  for (let i = 1; i < d.length; i++) if (Math.abs(d[i]) > Math.abs(d[k])) k = i
  const p = p0.slice()
  p[k] = Math.round(q[k] / paso) * paso
  return { p, eje: k }
}
/** «Ajustar a la rejilla»: todas las coordenadas al paso. */
const aRejilla = (q: number[], paso: number) => q.map((c) => Math.round(c / paso) * paso)

const COLOR_EJE = ['--rosa', '--aux', '--accent']

/** Clic derecho: en la app de Mac, el menú contextual nativo (capas, añadir, vista…). */
function contextual(ev: MouseEvent) {
  if (!escritorio?.contextual) return
  ev.preventDefault()
  escritorio.contextual()
}

function ponerPrefs3D(e: Escena3D, p: PrefsVista) {
  e.rejillaCompleta = p.planos
  e.mostrarEjes = p.ejes
  e.mostrarNombres = p.nombres
  e.mostrarRejilla = p.rejilla
  e.ortografica = p.ortografica
}

const ATAJOS_3D = [
  'X / Y / Z: mirar desde ese eje · 0: vista de partida',
  'Arrastrar un punto: moverlo · ⌥: en vertical · Mayús: por un eje y a pasos de 0,5',
  'Clic en una figura movible: seleccionarla · Esc: soltarla',
  '⌘ (Ctrl) + arrastrar: mover la figura · Mayús: por un eje y a pasos de 0,5',
  'R (o ⌘R): girarla con el ratón · X / Y / Z: eje de giro · Mayús: a pasos de 15° · clic o Intro: vale · Esc: deshacer',
].join('\n')

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
  /** Lado en el modo Comparar (A por defecto): para las capturas del menú. */
  lado?: 'A' | 'B'
}

/** Lienzo WebGL con cámara en órbita. */
export function Lienzo3D({ vista, s, set, giro, enlace, transparente, secundario, lado }: { vista: Vista3D<any>; s: any; set: (p: any) => void; giro: boolean } & Extras) {
  const ref = useRef<HTMLCanvasElement>(null)
  const estado = useRef({ vista, s, set, giro, enlace })
  estado.current = { vista, s, set, giro, enlace }
  const escena = useRef<Escena3D | null>(null)
  const sucio = useRef(true)
  const construyendo = useRef(false)
  const [plano, setPlano] = useState<'3d' | 'x' | 'y' | 'z' | 'iso'>('3d')
  const { prefs, cambiar: cambiarPrefs } = useContext(ContextoVista)
  const prefsRef = useRef<PrefsVista>(prefs)
  prefsRef.current = prefs
  const [calculando, setCalculando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const alinear = (modo: '3d' | 'x' | 'y' | 'z' | 'iso') => {
    setPlano(modo)
    const cam = escena.current
    if (!cam) return
    // la órbita va en el marco de three (y arriba); con z arriba, el eje y de la física es −z de three
    const { r } = cam.orb
    const zArr = cam.conZArriba
    cam.objetivo.set(0, 0, 0)
    if (modo === 'x') cam.orb = { theta: 0, phi: Math.PI / 2, r }
    if (modo === (zArr ? 'z' : 'y')) cam.orb = { theta: Math.PI / 2, phi: 0.08, r }
    if (modo === (zArr ? 'y' : 'z')) cam.orb = { theta: Math.PI / 2, phi: Math.PI / 2, r }
    // isométrica: desde (1, 1, 1) de la física
    if (modo === 'iso') cam.orb = { theta: zArr ? -Math.PI / 4 : Math.PI / 4, phi: Math.acos(1 / Math.sqrt(3)), r }
    if (modo === '3d' && vista.camara) cam.orb = { ...vista.camara }
    sucio.current = true
  }
  const alinearRef = useRef(alinear)
  alinearRef.current = alinear

  useEffect(() => {
    const canvas = ref.current!
    const e = new Escena3D(canvas, !!transparente)
    ponerPrefs3D(e, prefsRef.current)
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
    let mano: { id: string; desfase: number[]; p0: number[] } | null = null
    // objeto entero: seleccionado, moviéndose (⌘ + arrastrar) o girando (R)
    let seleccionado = false
    let movObj: { s0: any; c0: number[]; desfase: number[]; eje: number | null } | null = null
    let girando: { s0: any; x0: number; eje: 'x' | 'y' | 'z'; ang: number } | null = null
    let bajoEn: { x: number; y: number } | null = null
    let ultimo = { x: 0, y: 0, mayus: false }
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
    const objeto = () => estado.current.vista.interaccion?.objeto ?? null
    /** ¿Cae el punto dentro del marco del objeto en pantalla? */
    const sobreObjeto = (x: number, y: number) => {
      const o = objeto()
      const caja = o?.caja(estado.current.s)
      if (!caja) return false
      const pts: Array<{ x: number; y: number }> = []
      for (const a of [caja.min[0], caja.max[0]]) for (const b of [caja.min[1], caja.max[1]]) for (const c of [caja.min[2], caja.max[2]]) {
        const q = e.aPantalla([a, b, c])
        if (q) pts.push(q)
      }
      if (!pts.length) return false
      const m = 6
      return x >= Math.min(...pts.map((q) => q.x)) - m && x <= Math.max(...pts.map((q) => q.x)) + m && y >= Math.min(...pts.map((q) => q.y)) - m && y <= Math.max(...pts.map((q) => q.y)) + m
    }
    /** Marco fino del objeto seleccionado y, al moverlo o girarlo, la guía del eje. */
    const guias = () => {
      const o = objeto()
      const caja = o && seleccionado ? o.caja(estado.current.s) : null
      setAviso(
        !o || !seleccionado
          ? null
          : girando
            ? `Girando en ${girando.eje.toUpperCase()} · ${Math.round((girando.ang * 180) / Math.PI)}° · X/Y/Z: eje · Mayús: 15° · clic: vale · Esc: deshacer`
            : movObj
              ? movObj.eje !== null ? `Moviendo por el eje ${'XYZ'[movObj.eje]} · pasos de 0,5` : 'Moviendo · Mayús: por un eje y a pasos de 0,5 · ⌥: en vertical'
              : `${o.nombre[0].toUpperCase()}${o.nombre.slice(1)} seleccionada · ⌘+arrastrar: mover · R o ⌘R: girar · Esc: soltar`,
      )
      if (!o || !caja) {
        e.ponerGuias([])
        pedir = true
        return
      }
      const [a, b] = [caja.min, caja.max]
      const V = (i: number, j: number, k: number) => [i ? b[0] : a[0], j ? b[1] : a[1], k ? b[2] : a[2]]
      const suave = e.color('--ink-soft')
      const lineas: Array<{ pts: number[][]; color: THREE.Color; opacidad?: number; discontinua?: boolean }> = []
      for (const [p, q] of [
        [V(0, 0, 0), V(1, 0, 0)], [V(0, 1, 0), V(1, 1, 0)], [V(0, 0, 1), V(1, 0, 1)], [V(0, 1, 1), V(1, 1, 1)],
        [V(0, 0, 0), V(0, 1, 0)], [V(1, 0, 0), V(1, 1, 0)], [V(0, 0, 1), V(0, 1, 1)], [V(1, 0, 1), V(1, 1, 1)],
        [V(0, 0, 0), V(0, 0, 1)], [V(1, 0, 0), V(1, 0, 1)], [V(0, 1, 0), V(0, 1, 1)], [V(1, 1, 0), V(1, 1, 1)],
      ])
        lineas.push({ pts: [p, q], color: suave, opacidad: 0.55, discontinua: true })
      const c = o.centro(estado.current.s)
      const R = 0.55 * Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 1
      const recta = (k: number) => {
        const u = [0, 0, 0]
        u[k] = 1
        return { pts: [c.map((v, i) => v - 1.6 * R * u[i]), c.map((v, i) => v + 1.6 * R * u[i])], color: e.color(COLOR_EJE[k]), opacidad: 0.9 }
      }
      if (movObj && movObj.eje !== null) lineas.push(recta(movObj.eje))
      if (girando) {
        const k = 'xyz'.indexOf(girando.eje)
        const [i, j] = [0, 1, 2].filter((m) => m !== k)
        const circ: number[][] = []
        for (let n = 0; n <= 96; n++) {
          const t = (2 * Math.PI * n) / 96
          const p = c.slice()
          p[i] += R * Math.cos(t)
          p[j] += R * Math.sin(t)
          circ.push(p)
        }
        lineas.push({ pts: circ, color: e.color(COLOR_EJE[k]), opacidad: 0.9 }, recta(k))
      }
      e.ponerGuias(lineas)
      pedir = true
    }
    const girarA = (x: number, mayus: boolean) => {
      const o = objeto()
      if (!o || !girando) return
      let ang = (x - girando.x0) * 0.01
      if (mayus) ang = Math.round(ang / PASO_GIRO) * PASO_GIRO
      girando.ang = ang
      aplicar(o.girar(girando.eje, ang, girando.s0))
      guias()
    }
    const cursor = () => {
      canvas.style.cursor = mano ? 'grabbing' : encima ? 'pointer' : ''
    }
    void cursor

    const abajo = (ev: PointerEvent) => {
      // un clic mientras se gira confirma el giro
      if (girando) {
        girando = null
        guias()
        return
      }
      canvas.setPointerCapture(ev.pointerId)
      punteros.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
      const inter = estado.current.vista.interaccion
      if (punteros.size === 1 && inter) {
        const { x, y } = local(ev)
        bajoEn = { x, y }
        const id = e.asaEn(x, y)
        const asa = id ? asas.find((a) => a.id === id) : null
        if (asa) {
          // se guarda el desfase para que el punto no salte al agarrarlo por el borde
          const bajo = asa.sobre === 'superficie' ? null : e.puntoEnPlano(x, y, asa.p, ev.altKey)
          mano = { id: asa.id, desfase: bajo ? asa.p.map((c, i) => c - bajo[i]) : [0, 0, 0], p0: asa.p.slice() }
          repintarAsas()
          cursor()
          return
        }
        const o = objeto()
        if (o && sobreObjeto(x, y)) {
          seleccionado = true
          if (ev.metaKey || ev.ctrlKey) {
            const c0 = o.centro(estado.current.s)
            const bajo = e.puntoEnPlano(x, y, c0, ev.altKey)
            movObj = { s0: estado.current.s, c0, desfase: bajo ? c0.map((c, i) => c - bajo[i]) : [0, 0, 0], eje: null }
            canvas.style.cursor = 'grabbing'
            guias()
            return
          }
          guias()
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
      ultimo = { x, y, mayus: ev.shiftKey }
      if (girando) {
        girarA(x, ev.shiftKey)
        return
      }
      if (movObj) {
        const o = objeto()
        if (!o) return
        const q = e.puntoEnPlano(x, y, movObj.c0, ev.altKey)
        if (!q) return
        let destino = q.map((c, i) => c + (ev.altKey && i < 2 ? 0 : movObj!.desfase[i] ?? 0))
        movObj.eje = null
        const paso = prefsRef.current.paso
        if (ev.shiftKey) {
          const r = aEjes(movObj.c0, destino, paso)
          destino = r.p
          movObj.eje = r.eje
        } else if (prefsRef.current.ajustar) destino = aRejilla(destino, paso)
        aplicar(o.trasladar(destino.map((c, i) => c - movObj!.c0[i]), movObj.s0))
        guias()
        return
      }
      if (mano && inter) {
        const asa = asas.find((a) => a.id === mano!.id)
        if (!asa) return
        let toque: { p: number[]; uv?: [number, number] } | null = null
        if (asa.sobre === 'superficie' && !ev.altKey && !ev.shiftKey) toque = e.puntoEnMalla(x, y)
        if (!toque) {
          const q = e.puntoEnPlano(x, y, asa.p, ev.altKey)
          if (q) toque = { p: q.map((c, i) => c + (ev.altKey && i < 2 ? 0 : mano!.desfase[i] ?? 0)) }
        }
        // Mayús: por el eje en que más se ha movido, y a escalones de la rejilla
        const paso = prefsRef.current.paso
        if (toque && ev.shiftKey) toque = { p: aEjes(mano.p0, toque.p, paso).p }
        else if (toque && prefsRef.current.ajustar && !toque.uv) toque = { p: aRejilla(toque.p, paso) }
        if (toque) aplicar(inter.mover(asa.id, { ...toque, mayus: ev.altKey }, estado.current.s))
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
      if (movObj) {
        movObj = null
        cursor()
        guias()
      }
      // un clic (sin arrastrar) fuera del objeto lo deselecciona
      const { x, y } = local(ev)
      if (bajoEn && Math.hypot(x - bajoEn.x, y - bajoEn.y) < 4 && seleccionado && !mano && !sobreObjeto(x, y)) {
        seleccionado = false
        guias()
      }
      bajoEn = null
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
      if (toque) aplicar(inter.anadir({ ...toque, mayus: ev.altKey }, estado.current.s))
    }
    const tecla = (ev: KeyboardEvent) => {
      if (escribiendo(ev)) return
      const inter = estado.current.vista.interaccion
      const k = ev.key.toLowerCase()
      const o = objeto()
      // ⌘R (Ctrl+R) con la figura seleccionada gira igual que R, en vez de recargar la página
      const girarConMando = k === 'r' && !!o && seleccionado && !girando
      if ((ev.metaKey || ev.ctrlKey) && !girarConMando) return
      // girando: X, Y, Z eligen el eje; Mayús, a pasos de 15°; Esc deshace; Intro confirma
      if (girando && o) {
        if (k === 'x' || k === 'y' || k === 'z') {
          ev.preventDefault()
          // se vuelve al estado de partida y se gira alrededor del eje nuevo
          aplicar(o.girar(girando.eje, 0, girando.s0))
          girando.eje = k
          girarA(ultimo.x, ev.shiftKey || ultimo.mayus)
          return
        }
        if (k === 'escape') {
          ev.preventDefault()
          aplicar(o.girar(girando.eje, 0, girando.s0))
          girando = null
          guias()
          return
        }
        if (k === 'enter') {
          girando = null
          guias()
          return
        }
        if (k === 'shift') girarA(ultimo.x, true)
        return
      }
      if (k === 'r' && o && seleccionado && !ev.altKey) {
        ev.preventDefault()
        girando = { s0: estado.current.s, x0: ultimo.x, eje: 'z', ang: 0 }
        guias()
        return
      }
      if (k === 'escape' && seleccionado) {
        seleccionado = false
        guias()
        return
      }
      // X, Y, Z alinean la cámara con ese eje; 0 vuelve a la vista de partida (solo el lienzo principal)
      if (!secundario && !ev.altKey && (k === 'x' || k === 'y' || k === 'z' || k === '0')) {
        ev.preventDefault()
        alinearRef.current(k === '0' ? '3d' : k)
        return
      }
      if (!encima || !inter?.quitar) return
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
    canvas.addEventListener('contextmenu', contextual)
    canvas.addEventListener('pointerleave', fuera)
    window.addEventListener('keydown', tecla)

    const quitarTema = alCambiarTema(() => {
      e.fondo()
      sucio.current = true
      pedir = true
    })

    const lento = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let previo = performance.now()
    // el tiempo de la animación sigue al reloj común (pausa, velocidad, paso a paso)
    const reloj = relojLienzo()
    let vivo = true
    const bucle = (ahora: number) => {
      if (!vivo) return
      const dtReal = Math.min(0.05, (ahora - previo) / 1000)
      previo = ahora
      const { t, dt } = reloj(dtReal)
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
          guias()
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
      if (g && !lento && punteros.size === 0) e.orb.theta += dtReal * 0.25
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
      const camara = `${e.orb.theta}|${e.orb.phi}|${e.orb.r}|${e.objetivo.x}|${e.objetivo.y}|${e.objetivo.z}|${e.ortografica}`
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
      canvas.removeEventListener('contextmenu', contextual)
      window.removeEventListener('keydown', tecla)
      e.destruir()
      escena.current = null
      setAviso(null)
      // una construcción diferida que no llegó a correr no puede dejar el lienzo nuevo bloqueado
      construyendo.current = false
      sucio.current = true
    }
  }, [vista])

  // Cambia el estado → hay que reconstruir la escena.
  useEffect(() => {
    sucio.current = true
  }, [s])

  // Superposiciones y proyección del menú Vista
  useEffect(() => {
    const e = escena.current
    if (!e) return
    ponerPrefs3D(e, prefs)
    sucio.current = true
  }, [prefs])

  // Órdenes del menú Vista: solo el lienzo principal (el superpuesto sigue al enlazado)
  useEffect(() => {
    return alOrdenVista((o) => {
      const e = escena.current
      if (!e) return
      if (o.orden === 'captura') {
        // sin preserveDrawingBuffer el búfer se vacía tras componer: se pinta justo antes de leerlo
        if (o.lado === (lado ?? 'A')) {
          e.pintar()
          o.fn(e.renderer.domElement)
        }
        return
      }
      if (secundario) return
      if (o.orden === 'punto') alinearRef.current(o.modo)
      else if (o.orden === 'encuadrar') e.encuadrar()
      else if (o.orden === 'acercar') e.acercar(o.factor)
      sucio.current = true
    })
  }, [secundario, lado])

  return (
    <>
      <canvas ref={ref} className="arrastrable" />
      {calculando && <div className="calculando" role="status">Calculando…</div>}
      {aviso && <div className="aviso-3d" role="status">{aviso}</div>}
      {!secundario && <div className="controles-3d" role="group" aria-label="Orientación de la escena">
        {(['3d', 'x', 'y', 'z'] as const).map((modo) => (
          <button
            key={modo}
            type="button"
            className={plano === modo ? 'activo' : undefined}
            aria-pressed={plano === modo}
            title={modo === '3d' ? 'Vista de partida (tecla 0)' : `Mirar desde el eje ${modo} (tecla ${modo.toUpperCase()})`}
            onClick={() => alinear(modo)}
          >
            {modo === '3d' ? '3D' : modo.toUpperCase()}
          </button>
        ))}
        <button
          type="button"
          className={prefs.planos ? 'activo' : undefined}
          aria-pressed={prefs.planos}
          title="Mostrar cuadrículas en XY, XZ e YZ"
          onClick={() => cambiarPrefs({ planos: !prefs.planos })}
        >
          Planos
        </button>
        <button
          type="button"
          title="Descargar imagen PNG"
          onClick={() => {
            escena.current?.pintar()
            if (ref.current) descargarCanvas(ref.current, 'calculadora-3d')
          }}
        >
          PNG
        </button>
        <button type="button" className="ayuda-atajos" aria-label="Atajos de teclado" title={ATAJOS_3D}>
          ?
        </button>
      </div>}
    </>
  )
}

/** Lienzo 2D con paneo, zoom y coordenadas del mundo. */
export function Lienzo2D({ vista, s, set, enlace, secundario, lado }: { vista: Vista2D<any>; s: any; set: (p: any) => void } & Extras) {
  const ref = useRef<HTMLCanvasElement>(null)
  const estado = useRef({ vista, s, set, enlace })
  estado.current = { vista, s, set, enlace }
  const sucio = useRef(true)
  const { prefs } = useContext(ContextoVista)
  const prefsRef = useRef<PrefsVista>(prefs)
  prefsRef.current = prefs

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
        let p = [asa.eje === 'y' ? asa.p[0] : m.x + mano.dx, asa.eje === 'x' ? asa.p[1] : m.y + mano.dy]
        if (prefsRef.current.ajustar) p = p.map((c, i) => ((i === 0 && asa.eje === 'y') || (i === 1 && asa.eje === 'x') ? c : Math.round(c / prefsRef.current.paso) * prefsRef.current.paso))
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
    canvas.addEventListener('contextmenu', contextual)
    canvas.addEventListener('pointerleave', fuera)
    window.addEventListener('keydown', tecla)

    const quitarTema = alCambiarTema(() => {
      sucio.current = true
    })

    let previo = performance.now()
    const reloj = relojLienzo()
    let vivo = true
    let miMarca = -1
    let ultimaFirma = ''
    const bucle = (ahora: number) => {
      if (!vivo) return
      const { t: tAnim } = reloj(Math.min(0.05, (ahora - previo) / 1000))
      previo = ahora
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
        g.mostrarEjes = prefsRef.current.ejes
        g.mostrarNombres = prefsRef.current.nombres
        g.mostrarRejilla = prefsRef.current.rejilla
        g.limpiar()
        v.dibujar(g, st, tAnim)
        asas = v.interaccion?.asas(st) ?? []
        if (encima && !asas.some((a) => a.id === encima)) encima = null
        pintarAsas2d(g, asas, mano?.id ?? encima)
      }
      requestAnimationFrame(bucle)
    }
    requestAnimationFrame(bucle)

    // Órdenes del menú Vista: encuadrar vuelve a la ventana de partida; acercar escala desde el centro
    const quitarOrdenes = alOrdenVista((o) => {
          if (o.orden === 'captura') {
            if (o.lado === (lado ?? 'A')) o.fn(canvas)
            return
          }
          if (secundario || !navegable) return
          const cx = (g.ventana.x[0] + g.ventana.x[1]) / 2
          const cy = (g.ventana.y[0] + g.ventana.y[1]) / 2
          if (o.orden === 'encuadrar') {
            g.ventana = v0.ventana ? { x: [...v0.ventana.x], y: [...v0.ventana.y] } : { x: [-5, 5], y: [-5, 5] }
            primeraVez = true
          }
          else if (o.orden === 'acercar')
            g.ventana = {
              x: [cx + (g.ventana.x[0] - cx) * o.factor, cx + (g.ventana.x[1] - cx) * o.factor],
              y: [cy + (g.ventana.y[0] - cy) * o.factor, cy + (g.ventana.y[1] - cy) * o.factor],
            }
          else return
          medir()
          sucio.current = true
        })

    return () => {
      vivo = false
      quitarOrdenes()
      ro.disconnect()
      quitarTema()
      canvas.removeEventListener('pointerdown', abajo)
      canvas.removeEventListener('pointermove', mover)
      canvas.removeEventListener('pointerup', arriba)
      canvas.removeEventListener('wheel', rueda)
      canvas.removeEventListener('dblclick', doble)
      canvas.removeEventListener('pointerleave', fuera)
      canvas.removeEventListener('contextmenu', contextual)
      window.removeEventListener('keydown', tecla)
    }
  }, [vista])

  useEffect(() => {
    sucio.current = true
  }, [s, prefs])

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
