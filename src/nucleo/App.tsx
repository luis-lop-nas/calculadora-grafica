import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MODULOS } from './registro'
import { Navegacion } from './Navegacion'
import { Lienzo2D, Lienzo3D, type Enlace } from './lienzos'
import { Formula, Lecturas, RanuraResultado } from './controles'
import { AREAS_CORTAS, type Capa, type EntradaMenu, type ModuloAny, type Vista } from './tipos'
import { escritorio, type CapaMenu, type EntradaSerie, type Orden } from './escritorio'
import { animacion, ContextoVista, espacio, guardarPrefs, leerPrefs, ordenVista, type OrdenVista, type PrefsVista } from './vista'
import { HojaAtajos } from './Atajos'

/** ¿El foco está en un campo de texto? Ahí ⌘Z y compañía son los del propio campo. */
const enCampo = () => !!(document.activeElement as HTMLElement | null)?.matches?.('input, textarea, select, [contenteditable="true"]')

/** Copia al portapapeles el canvas del lado A recién pintado. */
function copiarImagen() {
  ordenVista({
    orden: 'captura',
    lado: 'A',
    fn: (canvas) =>
      canvas.toBlob((b) => {
        if (b) navigator.clipboard?.write?.([new ClipboardItem({ 'image/png': b })]).catch(() => {})
      }, 'image/png'),
  })
}

/** Color CSS (o variable del tema) a #rrggbb, pasando por un canvas que lo normaliza. */
let lienzoColor: CanvasRenderingContext2D | null = null
function resolverColor(c: string | undefined): string | null {
  if (!c) return null
  const valor = c.startsWith('--') ? getComputedStyle(document.documentElement).getPropertyValue(c).trim() : c
  if (!valor) return null
  lienzoColor ??= document.createElement('canvas').getContext('2d')
  if (!lienzoColor) return null
  lienzoColor.fillStyle = '#000'
  lienzoColor.fillStyle = valor
  const r = String(lienzoColor.fillStyle)
  if (r.startsWith('#')) return r
  const m = r.match(/[\d.]+/g)
  return m && m.length >= 3 ? `#${m.slice(0, 3).map((x) => Math.round(+x).toString(16).padStart(2, '0')).join('')}` : null
}

/** Graba en WebM lo que pinta el lienzo A (MediaRecorder sobre captureStream); se para con la misma orden o al minuto. */
function empezarGrabacion(id: string, alTerminar: () => void): Promise<MediaRecorder | null> {
  return new Promise((listo) => {
    let hecho = false
    ordenVista({
      orden: 'captura',
      lado: 'A',
      fn: (canvas) => {
        hecho = true
        const tipo = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t))
        const rec = new MediaRecorder(canvas.captureStream(30), tipo ? { mimeType: tipo, videoBitsPerSecond: 8_000_000 } : undefined)
        const trozos: Blob[] = []
        rec.ondataavailable = (e) => {
          if (e.data.size) trozos.push(e.data)
        }
        rec.onstop = () => {
          alTerminar()
          const url = URL.createObjectURL(new Blob(trozos, { type: 'video/webm' }))
          const a = document.createElement('a')
          a.href = url
          a.download = `calculadora-${id}.webm`
          a.click()
          setTimeout(() => URL.revokeObjectURL(url), 5000)
        }
        rec.start(250)
        setTimeout(() => rec.state === 'recording' && rec.stop(), 60_000)
        listo(rec)
      },
    })
    if (!hecho) listo(null)
  })
}

const serieEntradas = (es: EntradaMenu<any>[] | undefined): EntradaSerie[] =>
  (es ?? []).map((e) => ({
    t: e.t,
    tipo: e.tipo ?? 'accion',
    activo: !!e.activo,
    desactivado: !!e.desactivado,
    ...(e.hijos ? { hijos: serieEntradas(e.hijos) } : {}),
  }))

const serieCapas = (cs: Capa<any>[]): CapaMenu[] =>
  cs.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    color: resolverColor(c.color),
    visible: c.alternar ? c.visible !== false : null,
    alternable: !!c.alternar,
    quitable: !!c.quitar,
    ...(c.detalle ? { detalle: c.detalle } : {}),
  }))

/** Aplica una tras otra funciones de estado y junta los parches (para «solo esta», «mostrar todas»…). */
function encadenar<S>(s: S, pasos: Array<(s: S) => Partial<S> | void>): Partial<S> {
  let actual = s
  let parche: Partial<S> = {}
  for (const f of pasos) {
    const p = f(actual)
    if (!p) continue
    actual = { ...actual, ...p }
    parche = { ...parche, ...p }
  }
  return parche
}

interface Historia {
  pasado: unknown[]
  futuro: unknown[]
  ultimo: unknown
}
const MAX_HISTORIA = 200

const CLAVE = 'calculadora:estado'
const VERSION_ESTADO = 1

function descargarEstado(estados: Record<string, any>, id: string) {
  const blob = new Blob([JSON.stringify({ version: VERSION_ESTADO, id, estados }, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `calculadora-${id}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function descargarLecturas(id: string, filas: Array<[string, string]> | undefined) {
  if (!filas?.length) return
  const escapar = (valor: string) => `"${valor.replaceAll('"', '""')}"`
  const csv = ['Etiqueta,Valor', ...filas.map(([etiqueta, valor]) => `${escapar(etiqueta)},${escapar(valor)}`)].join('\n')
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `calculadora-${id}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

interface Comparar {
  activo: boolean
  disposicion: 'lado' | 'encima'
  enlazar: boolean
  idB: string
  editando: 'A' | 'B'
}

type Guardado = { version?: number; id?: string; estados?: Record<string, unknown>; comparar?: Partial<Comparar>; estadosB?: Record<string, unknown> }

function leerGuardado(): Guardado {
  try {
    const valor = JSON.parse(localStorage.getItem(CLAVE) ?? '{}')
    return valor && typeof valor === 'object' ? valor : {}
  } catch {
    return {}
  }
}

function compatible(base: unknown, valor: unknown): boolean {
  if (typeof base === 'number') return typeof valor === 'number' && Number.isFinite(valor)
  if (typeof base === 'string' || typeof base === 'boolean') return typeof valor === typeof base
  if (Array.isArray(base)) {
    if (!Array.isArray(valor)) return false
    // una lista que el usuario hace crecer (vacía al empezar, o de registros) no tiene longitud fija
    if (base.length === 0) return true
    if (base[0] && typeof base[0] === 'object' && !Array.isArray(base[0])) return valor.every((v) => compatible(base[0], v))
    return valor.length === base.length && base.every((v, i) => compatible(v, valor[i]))
  }
  // un diccionario vacío al empezar (deslizadores por nombre) admite cualquier clave
  if (base && typeof base === 'object' && Object.keys(base).length === 0) return !!valor && typeof valor === 'object' && !Array.isArray(valor)
  if (base && typeof base === 'object') {
    return !!valor && typeof valor === 'object' && Object.entries(valor).every(([k, v]) => k in base && compatible((base as Record<string, unknown>)[k], v))
  }
  return valor === base
}

function estadoGuardado(base: Record<string, unknown>, valor: unknown) {
  if (!valor || typeof valor !== 'object') return {}
  const limpio: Record<string, unknown> = {}
  for (const [clave, dato] of Object.entries(valor)) {
    if (clave in base && compatible(base[clave], dato)) limpio[clave] = dato
  }
  return limpio
}

// Lo mismo sirve para el autoguardado y para abrir un documento .calc en la app de Mac
const idDe = (guardado: Guardado) => (MODULOS.find((m) => m.id === guardado.id) ? guardado.id! : MODULOS[0].id)

function estadosDe(guardado: Guardado) {
  const base: Record<string, any> = {}
  for (const m of MODULOS) {
    const guardadoModulo = guardado.version && guardado.version !== VERSION_ESTADO ? {} : estadoGuardado(m.inicial, guardado.estados?.[m.id])
    base[m.id] = { ...m.inicial, ...guardadoModulo }
  }
  return base
}

function compararDe(guardado: Guardado): Comparar {
  const c = guardado.comparar ?? {}
  return {
    activo: c.activo === true,
    disposicion: c.disposicion === 'encima' ? 'encima' : 'lado',
    enlazar: c.enlazar !== false,
    idB: MODULOS.some((m) => m.id === c.idB) ? c.idB! : MODULOS[0].id,
    editando: c.editando === 'B' ? 'B' : 'A',
  }
}

function estadosBDe(guardado: Guardado) {
  const base: Record<string, any> = {}
  for (const m of MODULOS) {
    const g = guardado.estadosB?.[m.id]
    if (g) base[m.id] = { ...m.inicial, ...estadoGuardado(m.inicial, g) }
  }
  return base
}

export default function App() {
  const guardado = useRef(leerGuardado()).current
  const [id, setId] = useState<string>(() => idDe(guardado))
  const [estados, setEstados] = useState<Record<string, any>>(() => estadosDe(guardado))
  const [giro, setGiro] = useState(false)
  const [, tic] = useState(0)
  const [atajos, setAtajos] = useState(false)
  // menú Animación: el reloj común de los lienzos lee `animacion`; aquí se guarda para el menú
  const [anim, setAnim] = useState({ pausado: false, velocidad: 1 })
  useEffect(() => {
    animacion.pausado = anim.pausado
    animacion.velocidad = anim.velocidad
  }, [anim])
  const grabacion = useRef<MediaRecorder | null>(null)
  const [grabando, setGrabando] = useState(false)

  // Preferencias de vista (menú Vista): de quien usa la app, no del documento
  const [prefs, setPrefs] = useState<PrefsVista>(leerPrefs)
  const cambiarPrefs = useCallback((p: Partial<PrefsVista>) => setPrefs((v) => ({ ...v, ...p })), [])
  useEffect(() => {
    guardarPrefs(prefs)
    const raiz = document.documentElement
    if (prefs.tema === 'sistema') raiz.removeAttribute('data-theme')
    else raiz.setAttribute('data-theme', prefs.tema === 'oscuro' ? 'dark' : 'light')
  }, [prefs])
  const contextoVista = useMemo(() => ({ prefs, cambiar: cambiarPrefs }), [prefs, cambiarPrefs])

  // Comparar: un segundo lienzo (B) con su propio módulo y su propio estado
  const [cmp, setCmp] = useState<Comparar>(() => compararDe(guardado))
  const [estadosB, setEstadosB] = useState<Record<string, any>>(() => estadosBDe(guardado))
  const enlace = useRef<Enlace>({ marca: 0, plano: null, orb: null })

  const modulo = useMemo(() => MODULOS.find((m) => m.id === id)!, [id])
  const moduloB = useMemo(() => MODULOS.find((m) => m.id === cmp.idB)!, [cmp.idB])
  const sA = estados[id]
  const setA = (parche: Partial<any>) =>
    setEstados((e) => ({ ...e, [id]: { ...e[id], ...parche } }))
  const sB = estadosB[cmp.idB] ?? (cmp.idB === id ? sA : moduloB.inicial)
  const setB = (parche: Partial<any>) =>
    setEstadosB((e) => ({ ...e, [cmp.idB]: { ...(e[cmp.idB] ?? sB), ...parche } }))
  const editandoB = cmp.activo && cmp.editando === 'B'
  const moduloP = editandoB ? moduloB : modulo
  const s = editandoB ? sB : sA
  const set = editandoB ? setB : setA

  // Historial por módulo: cada gesto (un arrastre, una tecla) se agrupa en un paso cuando el
  // estado lleva 400 ms quieto. Deshacer actúa sobre el módulo abierto (lado A).
  const historial = useRef<Record<string, Historia>>({})
  const pendiente = useRef<{ id: string; t: number } | null>(null)
  const restaurando = useRef(false)
  const estadosRef = useRef(estados)
  estadosRef.current = estados
  const [, versionHistoria] = useState(0)
  const historiaDe = (m: string) => (historial.current[m] ??= { pasado: [], futuro: [], ultimo: estadosRef.current[m] })
  const confirmar = () => {
    const p = pendiente.current
    if (!p) return
    clearTimeout(p.t)
    pendiente.current = null
    const h = historiaDe(p.id)
    const actual = estadosRef.current[p.id]
    if (actual === h.ultimo) return
    h.pasado.push(h.ultimo)
    if (h.pasado.length > MAX_HISTORIA) h.pasado.shift()
    h.ultimo = actual
    h.futuro = []
    versionHistoria((v) => v + 1)
  }
  useEffect(() => {
    historiaDe(id)
  }, [id])
  useEffect(() => {
    if (restaurando.current) {
      restaurando.current = false
      return
    }
    const h = historiaDe(id)
    if (estados[id] === h.ultimo) return
    if (pendiente.current && pendiente.current.id !== id) confirmar()
    if (pendiente.current) clearTimeout(pendiente.current.t)
    pendiente.current = { id, t: window.setTimeout(confirmar, 400) }
  }, [estados])
  const viajar = (atras: boolean) => {
    confirmar()
    const h = historiaDe(id)
    const origen = atras ? h.pasado : h.futuro
    if (!origen.length) return
    const destino = origen.pop()
    ;(atras ? h.futuro : h.pasado).push(estadosRef.current[id])
    h.ultimo = destino
    restaurando.current = true
    setEstados((e) => ({ ...e, [id]: destino }))
    versionHistoria((v) => v + 1)
  }
  const deshacer = () => viajar(true)
  const rehacer = () => viajar(false)
  const hist = historial.current[id]
  const puedeDeshacer = !!hist?.pasado.length || (!!pendiente.current && pendiente.current.id === id)
  const puedeRehacer = !!hist?.futuro.length
  const restablecer = () => setEstados((e) => ({ ...e, [id]: structuredClone(modulo.inicial) }))

  const empezarComparar = () => {
    // la primera vez, B es una copia de A: el modo «mismo módulo con otros parámetros»
    if (!estadosB[id]) setEstadosB((e) => ({ ...e, [id]: structuredClone(sA) }))
    enlace.current = { marca: 0, plano: null, orb: null }
    setCmp((c) => ({ ...c, activo: true, idB: estadosB[c.idB] || c.idB === id ? c.idB : id }))
  }

  // App de Mac: el texto del documento y el que había al abrirlo o guardarlo, para el punto de «sin guardar»
  const texto = useRef('')
  const limpio = useRef<string | null>(null)
  const [modificado, setModificado] = useState(false)

  useEffect(() => {
    texto.current = JSON.stringify({ version: VERSION_ESTADO, id, estados, comparar: cmp, estadosB })
    try {
      localStorage.setItem(CLAVE, texto.current)
    } catch {
      /* modo privado o almacenamiento lleno: no pasa nada */
    }
    if (limpio.current === null) limpio.current = texto.current
    setModificado(texto.current !== limpio.current)
  }, [id, estados, cmp, estadosB])

  useEffect(() => {
    if (!MODULOS.find((m) => m.id === id)?.lecturasVivas) return
    const h = setInterval(() => tic((v) => v + 1), 100)
    return () => clearInterval(h)
  }, [id])

  // En la web (en la app de Mac los lleva el menú): ⌘Z, ⇧⌘Z y ⌘/
  const teclasRef = useRef({ deshacer, rehacer })
  teclasRef.current = { deshacer, rehacer }
  useEffect(() => {
    if (escritorio) return
    const atajo = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      const k = e.key.toLowerCase()
      if (k === '/') {
        e.preventDefault()
        setAtajos((v) => !v)
        return
      }
      if (enCampo()) return
      if (k === 'z' || k === 'y') {
        e.preventDefault()
        if (k === 'y' || e.shiftKey) teclasRef.current.rehacer()
        else teclasRef.current.deshacer()
      }
    }
    document.addEventListener('keydown', atajo)
    return () => document.removeEventListener('keydown', atajo)
  }, [])

  // Espacio: un toque reproduce o para la animación; mantenido, arrastrar desplaza la vista
  // (los lienzos leen `espacio`); ⇧Espacio, autogiro.
  const animadoRef = useRef(false)
  useEffect(() => {
    const soltar = () => {
      espacio.pulsado = false
      document.body.classList.remove('espacio')
    }
    const abajo = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      const elemento = e.target as HTMLElement | null
      if (elemento?.matches('input, textarea, select, button, [contenteditable="true"]')) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      e.preventDefault()
      if (e.repeat) return
      if (e.shiftKey) {
        setGiro((v) => !v)
        return
      }
      espacio.pulsado = true
      espacio.usado = false
      document.body.classList.add('espacio')
    }
    const arriba = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || !espacio.pulsado) return
      soltar()
      if (!espacio.usado && animadoRef.current) setAnim((a) => ({ ...a, pausado: !a.pausado }))
    }
    document.addEventListener('keydown', abajo)
    document.addEventListener('keyup', arriba)
    window.addEventListener('blur', soltar)
    return () => {
      document.removeEventListener('keydown', abajo)
      document.removeEventListener('keyup', arriba)
      window.removeEventListener('blur', soltar)
    }
  }, [])

  const vistaDe = (m: ModuloAny, st: any): Vista<any> => (typeof m.vista === 'function' ? m.vista(st) : m.vista)
  const vistaA = vistaDe(modulo, sA)
  const vistaB = vistaDe(moduloB, sB)
  const rotulo = moduloP.rotulo?.(s)
  const formula = moduloP.formula?.(s)
  const lecturas = moduloP.lecturas?.(s)
  const es3D = vistaA.tipo === '3d' || (cmp.activo && vistaB.tipo === '3d')
  const conmutarComparar = () => (cmp.activo ? setCmp((c) => ({ ...c, activo: false, editando: 'A' })) : empezarComparar())

  const aplicar = (doc: Guardado) => {
    historial.current = {}
    if (pendiente.current) clearTimeout(pendiente.current.t)
    pendiente.current = null
    limpio.current = null
    enlace.current = { marca: 0, plano: null, orb: null }
    setId(idDe(doc))
    setEstados(estadosDe(doc))
    setCmp(compararDe(doc))
    setEstadosB(estadosBDe(doc))
  }

  // Órdenes del menú de la app de Mac; se reasigna en cada render para ver el estado actual
  const alOrden = useRef<(orden: Orden, dato: unknown) => void>(() => {})
  alOrden.current = (orden, dato) => {
    if (orden === 'modulo' && MODULOS.some((m) => m.id === dato)) setId(dato as string)
    else if (orden === 'paso') {
      const i = MODULOS.findIndex((m) => m.id === id)
      setId(MODULOS[(i + (dato as number) + MODULOS.length) % MODULOS.length].id)
    } else if (orden === 'buscar') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
    else if (orden === 'abrir' && dato && typeof dato === 'object') aplicar(dato as Guardado)
    else if (orden === 'guardar' || orden === 'guardarComo') {
      const guardadoAhora = texto.current
      escritorio?.guardar(guardadoAhora, orden === 'guardarComo', id).then((ruta) => {
        if (!ruta) return
        limpio.current = guardadoAhora
        setModificado(texto.current !== guardadoAhora)
      })
    } else if (orden === 'png') {
      // se pide el lienzo que se está editando (la barra del lienzo no lleva botón PNG en la app)
      ordenVista({
        orden: 'captura',
        lado: cmp.activo ? cmp.editando : 'A',
        fn: (canvas) => {
          const a = document.createElement('a')
          a.href = canvas.toDataURL('image/png')
          a.download = `calculadora-${id}.png`
          a.click()
        },
      })
    } else if (orden === 'csv') descargarLecturas(id, lecturas)
    else if (orden === 'json') descargarEstado(estados, id)
    else if (orden === 'comparar') conmutarComparar()
    else if (orden === 'giro') setGiro((v) => !v)
    else if (orden === 'deshacer' || orden === 'rehacer') {
      // en un campo de texto, el deshacer del propio campo
      if (enCampo()) document.execCommand(orden === 'deshacer' ? 'undo' : 'redo')
      else if (orden === 'deshacer') deshacer()
      else rehacer()
    } else if (orden === 'restablecer') restablecer()
    else if (orden === 'copiar') {
      if (dato === 'latex' && formula?.length) navigator.clipboard?.writeText(formula.join('\n'))
      else if (dato === 'lecturas' && lecturas?.length) navigator.clipboard?.writeText(lecturas.map(([a, b]) => `${a}\t${b}`).join('\n'))
      else if (dato === 'imagen') copiarImagen()
    } else if (orden === 'prefs' && dato && typeof dato === 'object') cambiarPrefs(dato as Partial<PrefsVista>)
    else if (orden === 'vista' && dato && typeof dato === 'object') ordenVista(dato as OrdenVista)
    else if (orden === 'cmp') {
      if (dato === 'copiarAenB') setEstadosB((e) => ({ ...e, [id]: structuredClone(sA) }))
      else if (dato && typeof dato === 'object') {
        if (!cmp.activo) empezarComparar()
        setCmp((c) => ({ ...c, ...(dato as Partial<Comparar>) }))
      }
    } else if (orden === 'atajos') setAtajos((v) => !v)
    else if (orden === 'animacion') {
      if (dato === 'paso') {
        animacion.pasos++
        setAnim((a) => ({ ...a, pausado: true }))
      } else if (dato === 'reiniciar') animacion.reinicios++
      else if (dato && typeof dato === 'object') setAnim((a) => ({ ...a, ...(dato as Partial<typeof a>) }))
    } else if (orden === 'transformar' && dato && typeof dato === 'object') {
      const o = vistaP.tipo !== 'html' ? vistaP.interaccion?.objeto : undefined
      const { op, eje, valor } = dato as { op: 'mover' | 'girar'; eje: 0 | 1 | 2; valor: number }
      if (o) {
        if (op === 'mover') set(o.trasladar([0, 1, 2].map((k) => (k === eje ? valor : 0)), s))
        else set(o.girar((['x', 'y', 'z'] as const)[eje], (valor * Math.PI) / 180, s))
      }
    } else if (orden === 'grabar') {
      if (grabacion.current) grabacion.current.stop()
      else
        empezarGrabacion(id, () => {
          grabacion.current = null
          setGrabando(false)
        }).then((r) => {
          grabacion.current = r
          setGrabando(!!r)
        })
    }
    else if (orden === 'menuModulo' && dato && typeof dato === 'object') {
      const { grupo, ruta } = dato as { grupo: 'anadir' | 'ejemplos' | 'acciones'; ruta: number[] }
      let lista = moduloP.menu?.(s)?.[grupo]
      let e: EntradaMenu<any> | undefined
      for (const i of ruta) {
        e = lista?.[i]
        lista = e?.hijos
      }
      const p = e?.hacer?.(s)
      if (p) set(p)
    } else if (orden === 'capa' && dato && typeof dato === 'object') {
      const { id: idCapa, op } = dato as { id?: string; op: 'alternar' | 'quitar' | 'solo' | 'todas' | 'ninguna' }
      const cs = moduloP.capas?.(s) ?? []
      const c = cs.find((x) => x.id === idCapa)
      let p: Partial<any> | void = undefined
      if (op === 'alternar') p = c?.alternar?.(s)
      else if (op === 'quitar') p = c?.quitar?.(s)
      else if (op === 'solo' && c)
        p = encadenar(s, [
          ...cs.filter((x) => x !== c && x.alternar && x.visible !== false).map((x) => x.alternar!),
          ...(c.alternar && c.visible === false ? [c.alternar] : []),
        ])
      else if (op === 'todas') p = encadenar(s, cs.filter((x) => x.alternar && x.visible === false).map((x) => x.alternar!))
      else if (op === 'ninguna') p = encadenar(s, cs.filter((x) => x.alternar && x.visible !== false).map((x) => x.alternar!))
      if (p && Object.keys(p).length) set(p)
    }
  }

  useEffect(() => {
    if (!escritorio) return
    const quitar = escritorio.alOrden((orden, dato) => alOrden.current(orden, dato))
    escritorio
      .listo(MODULOS.map((m) => ({ id: m.id, area: m.area, nombreArea: AREAS_CORTAS[m.area], nombre: m.corto ?? m.resumen })))
      .then((doc) => doc && typeof doc === 'object' && aplicar(doc as Guardado))
    return quitar
  }, [])

  const hayLienzo = vistaA.tipo !== 'html'
  const hayLecturas = !!lecturas?.length
  const hayFormula = !!formula?.length
  const vistaP = editandoB ? vistaB : vistaA
  const animado = (vistaP.tipo === '3d' ? !!vistaP.animar : vistaP.tipo === '2d' ? !!vistaP.animada?.(s) : false) || (!!s && 'jugando' in s)
  animadoRef.current = animado
  const transformable = vistaP.tipo !== 'html' && !!vistaP.interaccion?.objeto
  // capas y entradas propias del módulo que se edita; se mandan como texto para no reconstruir el menú sin motivo
  const capasMenu = JSON.stringify(serieCapas(moduloP.capas?.(s) ?? []))
  const menuPropio = moduloP.menu?.(s)
  const menuMenu = JSON.stringify({
    anadir: serieEntradas(menuPropio?.anadir),
    ejemplos: serieEntradas(menuPropio?.ejemplos),
    acciones: serieEntradas(menuPropio?.acciones),
  })
  useEffect(() => {
    escritorio?.estado({
      id,
      comparar: cmp.activo,
      giro,
      es3D,
      hayLienzo,
      hayLecturas,
      modificado,
      tipo: vistaA.tipo,
      hayFormula,
      puedeDeshacer,
      puedeRehacer,
      prefs,
      disposicion: cmp.disposicion,
      enlazar: cmp.enlazar,
      mismoModulo: cmp.idB === id,
      nombreModulo: moduloP.corto ?? moduloP.resumen,
      capas: JSON.parse(capasMenu),
      animado,
      pausado: anim.pausado,
      velocidad: anim.velocidad,
      grabando,
      transformable,
      menu: JSON.parse(menuMenu),
    })
  }, [id, cmp.activo, cmp.disposicion, cmp.enlazar, cmp.idB, giro, es3D, hayLienzo, hayLecturas, modificado, vistaA.tipo, hayFormula, puedeDeshacer, puedeRehacer, prefs, moduloP, capasMenu, menuMenu, animado, anim, grabando, transformable])
  // superponer solo tiene sentido con dos lienzos del mismo tipo
  const superpuesto = cmp.activo && cmp.disposicion === 'encima' && vistaA.tipo === vistaB.tipo && vistaA.tipo !== 'html'

  const lienzo = (lado: 'A' | 'B') => {
    const m = lado === 'A' ? modulo : moduloB
    const v = lado === 'A' ? vistaA : vistaB
    const st = lado === 'A' ? sA : sB
    const fijar = lado === 'A' ? setA : setB
    const llave = `${lado}:${m.id}:${v.tipo}:${v.clave ?? ''}:${superpuesto}`
    const extras = {
      enlace: cmp.activo && cmp.enlazar ? enlace.current : null,
      secundario: superpuesto && lado === 'B',
      lado,
    }
    if (v.tipo === 'html')
      return (
        <div className="hoja">
          <v.Componente s={st} />
        </div>
      )
    return (
      <>
        {v.tipo === '3d' ? (
          <Lienzo3D key={llave} vista={v} s={st} set={fijar} giro={giro} transparente={superpuesto && lado === 'B'} {...extras} />
        ) : (
          <Lienzo2D key={llave} vista={v} s={st} set={fijar} {...extras} />
        )}
        {prefs.leyenda && m.leyenda && !(superpuesto && lado === 'B') && <div className="leyenda">{m.leyenda(st)}</div>}
      </>
    )
  }
  const resultado =
    rotulo || (prefs.formula && formula?.length) || (prefs.lecturas && lecturas?.length) ? (
      <div className="grupo resultado">
        {rotulo && (
          <div className="titulo">
            <span dangerouslySetInnerHTML={{ __html: rotulo.nombre }} />
          </div>
        )}
        {prefs.formula && formula && formula.length > 0 && <Formula tex={formula} />}
        {prefs.lecturas && lecturas && lecturas.length > 0 && <Lecturas filas={lecturas} />}
      </div>
    ) : null

  return (
    <ContextoVista.Provider value={contextoVista}>
    <div className="app">
      <Navegacion
        modulos={MODULOS}
        id={id}
        onElegir={setId}
        acciones={
          <>
            <button
              type="button"
              className="tog"
              aria-pressed={cmp.activo}
              onClick={conmutarComparar}
              style={{ padding: '5px 11px', fontSize: 12 }}
            >
              Comparar
            </button>
            {es3D && (
              <button
                type="button"
                className="tog"
                aria-pressed={giro}
                onClick={() => setGiro((v) => !v)}
                style={{ padding: '5px 11px', fontSize: 12 }}
              >
                Autogiro
              </button>
            )}
          </>
        }
        exportar={
          <>
            <button type="button" onClick={() => descargarEstado(estados, id)}>
              Estado del módulo <small>JSON</small>
            </button>
            <button type="button" onClick={() => descargarLecturas(id, lecturas)} disabled={!lecturas?.length}>
              Lecturas <small>CSV</small>
            </button>
          </>
        }
      />

      <div className={`cuerpo${prefs.presentacion ? ' presentacion' : ''}`}>
        <aside key={`${moduloP.id}:${editandoB ? 'B' : 'A'}`}>
          <header>
            <h1 dangerouslySetInnerHTML={{ __html: moduloP.titulo }} />
          </header>
          {cmp.activo && (
            <div className="seg editar-lado" role="group" aria-label="Qué lado se edita">
              {(['A', 'B'] as const).map((l) => (
                <button key={l} type="button" aria-pressed={cmp.editando === l} onClick={() => setCmp((c) => ({ ...c, editando: l }))}>
                  {l} · {(l === 'A' ? modulo : moduloB).corto ?? (l === 'A' ? modulo : moduloB).resumen}
                </button>
              ))}
            </div>
          )}

          <RanuraResultado.Provider value={resultado}>
            <moduloP.Panel s={s} set={set} />
          </RanuraResultado.Provider>

          {!moduloP.resultadoEnPanel && resultado}
        </aside>

        <div className={`escenario${cmp.activo ? ` doble ${superpuesto ? 'encima' : 'lado'} edita-${cmp.editando}` : ''}`}>
          <div className="lienzo-lado lado-A">
            {lienzo('A')}
            {cmp.activo && <span className="etiqueta-lado">A</span>}
          </div>
          {cmp.activo && (
            <div className="lienzo-lado lado-B">
              {lienzo('B')}
              <span className="etiqueta-lado">B</span>
            </div>
          )}
          {cmp.activo && (
            <div className="barra-comparar" role="group" aria-label="Comparar">
              <select
                aria-label="Módulo de B"
                value={cmp.idB}
                onChange={(ev) => {
                  const idB = ev.target.value
                  enlace.current = { marca: 0, plano: null, orb: null }
                  if (!estadosB[idB]) setEstadosB((e) => ({ ...e, [idB]: structuredClone(idB === id ? sA : MODULOS.find((m) => m.id === idB)!.inicial) }))
                  setCmp((c) => ({ ...c, idB }))
                }}
              >
                {MODULOS.map((m) => (
                  <option key={m.id} value={m.id}>
                    B: {m.corto ?? m.resumen}
                  </option>
                ))}
              </select>
              {vistaA.tipo === vistaB.tipo && vistaA.tipo !== 'html' && (
                <>
                  <button type="button" aria-pressed={cmp.disposicion === 'lado'} onClick={() => setCmp((c) => ({ ...c, disposicion: 'lado' }))}>
                    Lado a lado
                  </button>
                  <button type="button" aria-pressed={cmp.disposicion === 'encima'} onClick={() => setCmp((c) => ({ ...c, disposicion: 'encima' }))}>
                    Superpuestos
                  </button>
                  <button type="button" aria-pressed={cmp.enlazar} onClick={() => setCmp((c) => ({ ...c, enlazar: !c.enlazar }))}>
                    Cámaras enlazadas
                  </button>
                </>
              )}
              {cmp.idB === id && (
                <button type="button" onClick={() => setEstadosB((e) => ({ ...e, [id]: structuredClone(sA) }))}>
                  Copiar A en B
                </button>
              )}
              {cmp.idB === id &&
                modulo.comparaciones?.map((c) => (
                  <button
                    key={c.t}
                    type="button"
                    onClick={() => {
                      setEstados((e) => ({ ...e, [id]: { ...e[id], ...(c.a ?? {}) } }))
                      setEstadosB((e) => ({ ...e, [id]: { ...structuredClone(sA), ...(c.a ?? {}), ...c.b } }))
                    }}
                  >
                    {c.t}
                  </button>
                ))}
            </div>
          )}
        </div>
      </div>
      {atajos && <HojaAtajos onCerrar={() => setAtajos(false)} />}
    </div>
    </ContextoVista.Provider>
  )
}
