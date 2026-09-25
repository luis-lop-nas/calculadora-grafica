import { MenuRapido, abrirMenuRapido, leerFavoritos, claveOrden, type AccionRapida } from './MenuRapido'
import { CabeceraPanel } from './CabeceraPanel'
import { leerAnimacion, useAnimacionParametro } from './animarParametro'
import { BarraWeb } from './BarraWeb'
import { PanelResultados, leerResultados } from './Resultados'
import { ImportarImagen } from './ImportarImagen'
import { menuObjetos, menuSeleccion } from './menuObjetos'
import { DialogoValores, type SolicitudValores } from './DialogoValores'
import { ImportarCSV } from './ImportarCSV'
import { descargarTexto, escaparHTML } from './archivos'
import { serializarEntradas as serieEntradas, buscarComando } from './comandos'
import { actualizarDerivados, desvincularEdiciones, fuenteParaHerramienta, leerDependencias } from './derivados'
import { HERRAMIENTAS_CALCULO, numeroHerramienta, numeroFuente, type Herramienta, type ResultadoHerramienta } from '../lib/herramientas'
import { DialogoHerramienta } from './DialogoHerramienta'
import { Inspector } from './Inspector'
import { CLAVE_OBJETOS, conIdentidad, leerPropiedades, idDeAsa, objetosModulo, ejecutarObjetos } from './objetos'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MODULOS } from './registro'
import { Navegacion } from './Navegacion'
import { Lienzo2D, Lienzo3D, type Enlace } from './lienzos'
import { Formula, Lecturas, RanuraResultado } from './controles'
import { AREAS_CORTAS, type Capa, type EntradaMenu, type ModuloAny, type Vista } from './tipos'
import { escritorio, type CapaMenu, type Orden } from './escritorio'
import { animacion, ContextoVista, espacio, guardarPrefs, leerPrefs, validarPrefs, ordenVista, type OrdenVista, type PrefsVista } from './vista'
import { HojaAtajos } from './Atajos'
import { fusionar, HERRAMIENTAS } from './barra'
import { aplanar, PaletaOrdenes, type OrdenPaleta } from './Ordenes'
import { CLAVE_ESCENA, leerEscena, parcheEscena, prefsEscena } from './escena'
import { menuEscena, menuVistaEscena } from './menuEscena'
import { DialogoEscena } from './DialogoEscena'

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
    return !!valor && typeof valor === 'object' && Object.entries(valor).every(([k, v]) => (k === '_id' && typeof v === 'string') || (k in base && compatible((base as Record<string, unknown>)[k], v)))
  }
  return valor === base
}

function estadoGuardado(base: Record<string, unknown>, valor: unknown) {
  if (!valor || typeof valor !== 'object') return {}
  const limpio: Record<string, unknown> = {}
  for (const [clave, dato] of Object.entries(valor)) {
    if (clave in base && compatible(base[clave], dato)) limpio[clave] = dato
    // la escena del menú Escena no está en el estado inicial de ningún módulo: se valida aparte
    else if (clave === '_animacion') limpio[clave] = leerAnimacion({ _animacion: dato })
    else if (clave === '_resultados') limpio[clave] = leerResultados({ _resultados: dato })
    else if (clave === '_derivados') limpio[clave] = leerDependencias({ _derivados: dato })
    else if (clave === CLAVE_OBJETOS) limpio[clave] = leerPropiedades({ [CLAVE_OBJETOS]: dato })
    else if (clave === CLAVE_ESCENA) limpio[clave] = leerEscena({ [CLAVE_ESCENA]: dato })
  }
  return limpio
}

// Lo mismo sirve para el autoguardado y para abrir un documento .calc en la app de Mac
const idDe = (guardado: Guardado) => (MODULOS.find((m) => m.id === guardado.id) ? guardado.id! : MODULOS[0].id)

function estadosDe(guardado: Guardado) {
  const base: Record<string, any> = {}
  for (const m of MODULOS) {
    const guardadoModulo = guardado.version && guardado.version !== VERSION_ESTADO ? {} : estadoGuardado(m.inicial, guardado.estados?.[m.id])
    base[m.id] = actualizarDerivados(conIdentidad({ ...m.inicial, ...guardadoModulo }))
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
    if (g) base[m.id] = actualizarDerivados(conIdentidad({ ...m.inicial, ...estadoGuardado(m.inicial, g) }))
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
  const [solicitud, setSolicitud] = useState<SolicitudValores | null>(null)
  const [importarImagen, setImportarImagen] = useState(false)
  const [verResultados, setVerResultados] = useState(false)
  const [verHistorial, setVerHistorial] = useState(false)
  const [importarCSV, setImportarCSV] = useState(false)
  const [camposRepetidos,setCamposRepetidos] = useState<Record<string,string>|undefined>()
  const [herramienta, setHerramienta] = useState<Herramienta | null>(null)
  const [ultimoResultado, setUltimoResultado] = useState<{ r: ResultadoHerramienta; campos: Record<string,string> } | null>(null)
  const [inspector, setInspector] = useState(false)
  const [panelAcoplado, setPanelAcoplado] = useState(false)
  useEffect(()=>{if(inspector){setVerResultados(false);setVerHistorial(false)}},[inspector])
  const [selecciones, setSelecciones] = useState<Record<string,string[]>>({})
  const [rapido,setRapido] = useState<{x:number;y:number}|null>(null)
  useEffect(()=>{
    let puntero={x:window.innerWidth/2,y:window.innerHeight/2}
    const mover=(e:PointerEvent)=>{puntero={x:e.clientX,y:e.clientY}}
    const abrir=(e:Event)=>setRapido((e as CustomEvent).detail)
    const tecla=(e:KeyboardEvent)=>{if(e.key.toLowerCase()==='q'&&!e.metaKey&&!e.ctrlKey&&!e.altKey&&!enCampo()&&!document.querySelector('[role=dialog]')){e.preventDefault();setRapido(puntero)}}
    window.addEventListener('pointermove',mover);window.addEventListener('calculadora:menu-rapido',abrir);document.addEventListener('keydown',tecla)
    return()=>{window.removeEventListener('pointermove',mover);window.removeEventListener('calculadora:menu-rapido',abrir);document.removeEventListener('keydown',tecla)}
  },[])
  const [ordenes, setOrdenes] = useState(false)
  const [ordenesNativas, setOrdenesNativas] = useState<OrdenPaleta[] | null>(null)
  useEffect(()=>{
    if((!ordenes && !rapido) || !escritorio)return
    let vigente=true
    const nativo = escritorio
    nativo.ordenes().then(os=>{if(vigente)setOrdenesNativas(os.map(o=>({...o,hacer:()=>{void nativo.ejecutarOrden(o.id)}})))}).catch(()=>{})
    return()=>{vigente=false;setOrdenesNativas(null)}
  },[ordenes,rapido])
  const [dialogoEscena, setDialogoEscena] = useState<{ x: [number, number]; y: [number, number] } | null>(null)
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
    setEstados((e) => ({ ...e, [id]: actualizarDerivados(desvincularEdiciones(e[id],conIdentidad({ ...e[id], ...parche }))) }))
  const sB = estadosB[cmp.idB] ?? (cmp.idB === id ? sA : moduloB.inicial)
  const setB = (parche: Partial<any>) =>
    setEstadosB((e) => ({ ...e, [cmp.idB]: actualizarDerivados(desvincularEdiciones(e[cmp.idB] ?? sB,conIdentidad({ ...(e[cmp.idB] ?? sB), ...parche }))) }))
  useAnimacionParametro(modulo,sA,setA)
  useAnimacionParametro(moduloB,sB,setB,cmp.activo)
  const editandoB = cmp.activo && cmp.editando === 'B'
  const moduloP = editandoB ? moduloB : modulo
  const s = editandoB ? sB : sA
  const set = editandoB ? setB : setA

  const claveSeleccion = `${editandoB ? 'B' : 'A'}:${moduloP.id}`
  const resultadoActual = leerResultados(s).at(-1)?.r
  useEffect(()=>{setUltimoResultado(null);setHerramienta(null);setCamposRepetidos(undefined)},[claveSeleccion])
  const objetos = objetosModulo(moduloP, s)
  const seleccion = (selecciones[claveSeleccion] ?? []).filter(id => objetos.some(o => o.id === id))
  const principal = moduloP.seleccion?.actual(s)
  useEffect(()=>{
    if(principal===undefined)return
    setSelecciones(prev=>{
      const actual=prev[claveSeleccion]??[]
      if(principal ? actual.includes(principal) : actual.length===0)return prev
      return {...prev,[claveSeleccion]:principal?[principal]:[]}
    })
  },[principal,claveSeleccion])
  const elegirObjetos = (ids: string[]) => {
    setSelecciones(x => ({ ...x, [claveSeleccion]: ids }))
    const p = moduloP.seleccion?.poner(ids.at(-1)??null,s) ?? objetos.find(o => o.id === ids.at(-1))?.seleccionar?.(s)
    if (p) set(p)
  }

  useEffect(() => {
    const copiar = (e: ClipboardEvent) => {
      if (enCampo() || !Array.isArray(s.filas)) return
      const elegidos = objetos.filter(o => seleccion.includes(o.id) && o.fuente !== undefined)
      if (!elegidos.length || !e.clipboardData) return
      e.preventDefault()
      const datos = JSON.stringify({ tipo: 'calculadora-objetos', version: 1, filas: elegidos.map(o => ({ src: o.fuente, visible: o.visible !== false })) })
      e.clipboardData.setData('application/x-calculadora-objetos', datos)
      e.clipboardData.setData('text/plain', datos)
      if (e.type === 'cut') set(ejecutarObjetos(s, objetos, elegidos.map(o => o.id), 'eliminar'))
    }
    const pegar = (e: ClipboardEvent) => {
      if (enCampo() || !Array.isArray(s.filas)) return
      try {
        const datos = JSON.parse(e.clipboardData?.getData('application/x-calculadora-objetos') || e.clipboardData?.getData('text/plain') || '')
        if (datos.tipo !== 'calculadora-objetos' || datos.version !== 1 || !Array.isArray(datos.filas) || datos.filas.length > 1000) return
        const filas = datos.filas.filter((f:any) => typeof f?.src === 'string' && f.src.length < 10000).map((f:any) => ({src:f.src,visible:f.visible !== false}))
        e.preventDefault();set({filas:[...s.filas,...filas]})
      } catch { /* otro formato de portapapeles */ }
    }
    document.addEventListener('copy',copiar);document.addEventListener('cut',copiar);document.addEventListener('paste',pegar)
    return () => {document.removeEventListener('copy',copiar);document.removeEventListener('cut',copiar);document.removeEventListener('paste',pegar)}
  }, [s, seleccion.join('|'), moduloP])

  const objetosTeclado = useRef({s,set,objetos,seleccion,elegirObjetos})
  objetosTeclado.current={s,set,objetos,seleccion,elegirObjetos}
  useEffect(()=>{
    const tecla=(e:KeyboardEvent)=>{
      if(enCampo() || document.querySelector('[role="dialog"], .paleta'))return
      const t=objetosTeclado.current,mod=e.metaKey||e.ctrlKey,k=e.key.toLowerCase()
      if(mod && k==='i' && !escritorio){e.preventDefault();setInspector(true)}
      else if(mod && k==='a'){e.preventDefault();t.elegirObjetos(t.objetos.map(o=>o.id))}
      else if((mod&&k==='d') || (!mod&&(k==='delete'||k==='backspace'))) {
        const op=mod?'duplicar':'eliminar'
        if(!t.objetos.some(o=>t.seleccion.includes(o.id)&&(op==='duplicar'?o.duplicar:o.quitar)))return
        e.preventDefault();e.stopPropagation();t.set(ejecutarObjetos(t.s,t.objetos,t.seleccion,op))
      }
    }
    document.addEventListener('keydown',tecla)
    return()=>document.removeEventListener('keydown',tecla)
  },[])

  // Historial por módulo: cada gesto (un arrastre, una tecla) se agrupa en un paso cuando el
  // estado lleva 400 ms quieto. Deshacer actúa sobre el módulo abierto (lado A).
  const historial = useRef<Record<string, Historia>>({})
  const pendiente = useRef<{ id: string; t: number } | null>(null)
  const restaurando = useRef(false)
  const todosEstados = { ...Object.fromEntries(Object.entries(estados).map(([k,v]) => [`A:${k}`,v])), ...Object.fromEntries(Object.entries(estadosB).map(([k,v]) => [`B:${k}`,v])) }
  const estadosRef = useRef(todosEstados)
  estadosRef.current = todosEstados
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
    historiaDe(claveSeleccion)
  }, [claveSeleccion])
  useEffect(() => {
    if (restaurando.current) {
      restaurando.current = false
      return
    }
    const h = historiaDe(claveSeleccion)
    if (s === h.ultimo) return
    if (pendiente.current && pendiente.current.id !== claveSeleccion) confirmar()
    if (pendiente.current) clearTimeout(pendiente.current.t)
    pendiente.current = { id: claveSeleccion, t: window.setTimeout(confirmar, 400) }
  }, [estados, estadosB, claveSeleccion])
  const viajar = (atras: boolean) => {
    confirmar()
    const h = historiaDe(claveSeleccion)
    const origen = atras ? h.pasado : h.futuro
    if (!origen.length) return
    const destino = origen.pop()
    ;(atras ? h.futuro : h.pasado).push(estadosRef.current[claveSeleccion])
    h.ultimo = destino
    restaurando.current = true
    if (editandoB) setEstadosB(e => ({ ...e, [cmp.idB]: destino }))
    else setEstados(e => ({ ...e, [id]: destino }))
    versionHistoria((v) => v + 1)
  }
  const deshacer = () => viajar(true)
  const rehacer = () => viajar(false)
  const hist = historial.current[claveSeleccion]
  const puedeDeshacer = !!hist?.pasado.length || (!!pendiente.current && pendiente.current.id === claveSeleccion)
  const puedeRehacer = !!hist?.futuro.length
  const restablecer = () => {set({...conIdentidad(structuredClone(moduloP.inicial)),_escena:leerEscena(moduloP.inicial),_objetos:{},_derivados:[],_resultados:[],_animacion:null});setSelecciones(v=>({...v,[claveSeleccion]:[]}))}

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

  // ⇧⌘P lo escucha la página en la web y en la app (el menú solo lo muestra, como ⌘K)
  useEffect(() => {
    const atajo = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        setOrdenes((v) => !v)
      }
    }
    document.addEventListener('keydown', atajo)
    return () => document.removeEventListener('keydown', atajo)
  }, [])

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
    else if (orden === 'resultados') {setVerResultados(v=>!v);setInspector(false);setVerHistorial(false)}
    else if (orden === 'historial') { setVerHistorial(v=>!v); setInspector(false); setVerResultados(false) }
    else if (orden === 'ajustes') setSolicitud({titulo:'Ajustes de la aplicación',campos:[{id:'tema',texto:'Tema',valor:prefs.tema,opciones:['sistema','claro','oscuro']}],aplicar:({tema})=>cambiarPrefs({tema:tema as PrefsVista['tema']})})
    else if (orden === 'espacioTrabajo') {
      if(dato==='guardar') { setSolicitud({titulo:'Guardar espacio de trabajo',campos:[{id:'nombre',texto:'Nombre',valor:'Mi espacio'}],aplicar:({nombre})=>{if(!nombre.trim())throw new Error('Escribe un nombre');localStorage.setItem('calculadora:espacio',JSON.stringify({nombre,prefs,inspector,panelAcoplado}))}}) }
      else if(dato==='recuperar') { try { const v=JSON.parse(localStorage.getItem('calculadora:espacio')??'null');if(v){cambiarPrefs(validarPrefs(v.prefs));setInspector(!!v.inspector);setPanelAcoplado(!!v.panelAcoplado)} } catch {} }
      else { cambiarPrefs({presentacion:dato==='presentacion'});setInspector(dato==='geometria');if(dato==='comparacion'&&!cmp.activo)empezarComparar() }
    }
    else if (orden === 'importarImagen') setImportarImagen(true)
    else if (orden === 'importarCSV') setImportarCSV(true)
    else if (orden === 'svg') ordenVista({ orden: 'svg', lado: editandoB ? 'B' : 'A', fn: svg => descargarTexto(`calculadora-${moduloP.id}.svg`,svg,'image/svg+xml') })
    else if (orden === 'informe') {
      const r = resultadoActual
      const rows = r?.filas ?? lecturas ?? []
      const contenido = `<!doctype html><html lang="es"><meta charset="utf-8"><title>Resultados de Calculadora</title><body><h1>${escaparHTML(moduloP.corto ?? moduloP.resumen)}</h1><p>${escaparHTML(r?.metodo ?? '')}</p><pre>${escaparHTML(r?.fuente ?? r?.tex ?? '')}</pre><table>${rows.map(([a,b]) => `<tr><th>${escaparHTML(a)}</th><td>${escaparHTML(b)}</td></tr>`).join('')}</table></body></html>`
      descargarTexto('resultados-calculadora.html',contenido,'text/html')
    }
    else if (orden === 'rapido') abrirMenuRapido()
    else if (orden === 'seleccionarTodo') {if(enCampo())document.execCommand('selectAll');else elegirObjetos(objetos.map(o=>o.id))}
    else if (orden === 'propiedades') setInspector(v => !v)
    else if (orden === 'ordenes') setOrdenes((v) => !v)
    else if (orden === 'animarParametro') {
      const ps=moduloP.parametrosAnimables?.(s)??[]
      if(!ps.length)return
      const a=leerAnimacion(s),p=ps.find(p=>p.id===a?.parametro)??ps[0]
      setSolicitud({titulo:'Animar parámetro',campos:[{id:'parametro',texto:'Parámetro',valor:p.id,opciones:ps.map(p=>p.id)},{id:'desde',texto:'Desde',valor:String(a?.desde??p.min)},{id:'hasta',texto:'Hasta',valor:String(a?.hasta??p.max)},{id:'duracion',texto:'Duración (segundos)',valor:String(a?.duracion??4)},{id:'modo',texto:'Repetición',valor:a?.modo??'ida y vuelta',opciones:['una vez','bucle','ida y vuelta']}],aplicar:c=>{const a=leerAnimacion({_animacion:{...c,desde:numeroHerramienta(c.desde),hasta:numeroHerramienta(c.hasta),duracion:numeroHerramienta(c.duracion),activa:true}});if(!a)throw new Error('Rango creciente y duración mínima de 0,1 segundos');set({_animacion:a});setAnim(v=>({...v,pausado:false}))}})
    }
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
      const { grupo, ruta, id: comandoId } = dato as { grupo: 'anadir' | 'ejemplos' | 'acciones' | 'herramientas' | 'escena' | 'vistaEscena' | 'objeto' | 'seleccion' | 'animacionExtra'; ruta?: number[]; id?: string }
      const propio = moduloP.menu?.(s)
      let lista = grupo === 'herramientas' ? herramientasMenu : grupo === 'escena' ? escenaMenu : grupo === 'vistaEscena' ? vistaEscenaMenu : grupo === 'objeto' ? objetoMenu : grupo === 'seleccion' ? seleccionMenu : grupo === 'animacionExtra' ? animacionExtraMenu : propio?.[grupo]
      let e: EntradaMenu<any> | undefined
      if (comandoId) e = buscarComando(lista ?? [], comandoId)
      for (const i of ruta ?? []) {
        e = lista?.[i]
        if (e?.desactivado) return
        lista = e?.hijos
      }
      if (e?.desactivado) return
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

  const hayLienzo = (editandoB ? vistaB : vistaA).tipo !== 'html'
  const hayLecturas = !!lecturas?.length
  const hayFormula = !!formula?.length
  const vistaP = editandoB ? vistaB : vistaA
  const animado = (vistaP.tipo === '3d' ? !!vistaP.animar : vistaP.tipo === '2d' ? !!vistaP.animada?.(s) : false) || (!!s && 'jugando' in s) || !!leerAnimacion(s)?.activa
  animadoRef.current = animado
  const transformable = vistaP.tipo !== 'html' && !!vistaP.interaccion?.objeto
  // capas y entradas propias del módulo que se edita; se mandan como texto para no reconstruir el menú sin motivo
  const capasMenu = JSON.stringify(serieCapas(objetos))
  const menuPropio = moduloP.menu?.(s)
  const herramientasComunes = Object.fromEntries(HERRAMIENTAS_CALCULO.map(h => [h.id, { t: h.nombre, hacer: () => { setUltimoResultado(null); setCamposRepetidos(undefined); setHerramienta(h) } }]))
  const herramientasMenu = fusionar(HERRAMIENTAS, { ...menuPropio?.herramientas, ...herramientasComunes })
  const ladoP: 'A' | 'B' = editandoB ? 'B' : 'A'
  const vistaTipo = (editandoB ? vistaB : vistaA).tipo
  const contextoEscena = {
    s,
    tipo: vistaTipo,
    logaritmica: vistaP.tipo === '2d' && !!vistaP.logaritmica,
    prefs: prefsEscena(s, prefs),
    cambiarPrefs: (p: Partial<PrefsVista>) => set(parcheEscena(s, { vista: { ...leerEscena(s).vista, ...p } })),
    editar: () => ordenVista({ orden: 'leerVentana', lado: ladoP, fn: (v) => setDialogoEscena(v) }),
    imagen: () => setImportarImagen(true),
    guia: () => setSolicitud({titulo:'Añadir guía',campos:[{id:'eje',texto:'Orientación',valor:'vertical',opciones:['vertical','horizontal']},{id:'valor',texto:'Coordenada',valor:'0'}],aplicar:({eje,valor})=>set(parcheEscena(s,{guias:[...leerEscena(s).guias,{eje:eje==='vertical'?'x':'y',valor:numeroHerramienta(valor)}]}))}),
    texto: () => setSolicitud({titulo:'Añadir anotación',campos:[{id:'texto',texto:'Texto',valor:''},{id:'x',texto:'X',valor:'0'},{id:'y',texto:'Y',valor:'0'}],aplicar:({texto,x,y})=>{if(!texto.trim())throw new Error('Escribe un texto');set(parcheEscena(s,{textos:[...leerEscena(s).textos,{texto,x:numeroHerramienta(x),y:numeroHerramienta(y)}]}))}}),
    guardarVista: () =>
      ordenVista({
        orden: 'leerVentana',
        lado: ladoP,
        fn: (v) => {
          const vistas = leerEscena(s).vistas
          setSolicitud({ titulo: 'Guardar vista', campos: [{id:'nombre',texto:'Nombre',valor:`Vista ${vistas.length+1}`}], aplicar: ({nombre}) => { if (!nombre.trim()) throw new Error('Escribe un nombre'); set(parcheEscena(s,{vistas:[...vistas,{nombre:nombre.trim(),...v}]})) } })
        },
      }),
    renombrarVista: (i: number) => { const vistas=leerEscena(s).vistas; setSolicitud({ titulo: 'Renombrar vista', campos: [{id:'nombre',texto:'Nombre',valor:vistas[i].nombre}], aplicar: ({nombre}) => { if(!nombre.trim()) throw new Error('Escribe un nombre'); set(parcheEscena(s,{vistas:vistas.map((v,j)=>j===i?{...v,nombre:nombre.trim()}:v)})) } }) },
    irAVista: (v: { x: [number, number]; y: [number, number] }) => ordenVista({ orden: 'ventana', lado: ladoP, x: v.x, y: v.y }),
  }
  const escenaMenu = menuEscena(contextoEscena)
  const vistaEscenaMenu = menuVistaEscena(contextoEscena)
  const contextoObjetos = { s, objetos, seleccion, elegir: elegirObjetos, propiedades: () => setInspector(true), ordenar: moduloP.id === 'grafica' }
  const objetoMenu = [{id:'objeto.rapido',t:'Edición rápida (Q)',hacer:()=>abrirMenuRapido()},...menuObjetos(contextoObjetos), ...menuPropio?.objeto ?? []]
  const ultimoCalculo = leerResultados(s).at(-1)
  const ajustarUltimo = () => {
    const h = HERRAMIENTAS_CALCULO.find(h=>h.id===ultimoCalculo?.herramienta)
    if(h && ultimoCalculo){setCamposRepetidos(ultimoCalculo.campos);setUltimoResultado(null);setHerramienta(h)}
  }
  const ajustarRef = useRef(ajustarUltimo);ajustarRef.current=ajustarUltimo
  useEffect(()=>{if(escritorio)return;const tecla=(e:KeyboardEvent)=>{if(e.key==='F9'&&!enCampo()&&!document.querySelector('[role=dialog]')){e.preventDefault();ajustarRef.current()}};document.addEventListener('keydown',tecla);return()=>document.removeEventListener('keydown',tecla)},[])
  const seleccionMenu: EntradaMenu<any>[] = [...menuSeleccion(contextoObjetos),{id:'edicion.ajustarCalculo',t:'Ajustar último cálculo…',atajo:'F9',desactivado:!ultimoCalculo,hacer:ajustarUltimo}]
  const rastro = leerEscena(s).rastros
  const idsRastreables = vistaP.tipo==='2d' ? (vistaP.interaccion?.asas(s)??[]).map(a=>idDeAsa(s,a.id)).filter(id=>seleccion.includes(id)) : []
  const animacionExtraMenu: EntradaMenu<any>[] = [
    ...menuPropio?.animacion ?? [],
    {id:'animacion.parametro',t:'Animar parámetro…',desactivado:!moduloP.parametrosAnimables?.(s).length,hacer:()=>alOrden.current('animarParametro',undefined)},
    {id:'animacion.detenerParametro',t:'Detener animación de parámetro',desactivado:!leerAnimacion(s)?.activa,hacer:()=>({_animacion:{...leerAnimacion(s),activa:false}})},
    {id:'animacion.rastros',t:'Rastros de puntos',hijos:[
      {id:'rastros.activar',t:'Activar en puntos seleccionados',desactivado:!idsRastreables.length,hacer:()=>parcheEscena(s,{rastros:{...rastro,ids:[...new Set([...rastro.ids,...idsRastreables])]}})},
      {id:'rastros.duracion',t:'Persistencia…',desactivado:vistaP.tipo!=='2d',hacer:()=>setSolicitud({titulo:'Persistencia del rastro',campos:[{id:'segundos',texto:'Segundos',valor:String(rastro.segundos)}],aplicar:({segundos})=>{const n=numeroHerramienta(segundos);if(n<=0||n>120)throw new Error('Duración entre 0 y 120 segundos');set(parcheEscena(s,{rastros:{...rastro,segundos:n}}))}})},
      {id:'rastros.borrar',t:'Borrar rastros',desactivado:!rastro.ids.length,hacer:()=>parcheEscena(s,{rastros:{...rastro,revision:rastro.revision+1}})},
      {id:'rastros.desactivar',t:'Desactivar rastros',desactivado:!rastro.ids.length,hacer:()=>parcheEscena(s,{rastros:{...rastro,ids:[]}})},
    ]},
  ]

  const menuMenu = JSON.stringify({
    objeto: serieEntradas(objetoMenu),
    seleccion: serieEntradas(seleccionMenu),
    animacionExtra: serieEntradas(animacionExtraMenu),
    anadir: serieEntradas(menuPropio?.anadir),
    ejemplos: serieEntradas(menuPropio?.ejemplos),
    acciones: serieEntradas(menuPropio?.acciones),
    herramientas: serieEntradas(herramientasMenu),
    escena: serieEntradas(escenaMenu),
    vistaEscena: serieEntradas(vistaEscenaMenu),
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
      tipo: vistaP.tipo,
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
      parametrosAnimables: !!moduloP.parametrosAnimables?.(s).length,
      pausado: anim.pausado,
      velocidad: anim.velocidad,
      grabando,
      transformable,
      menu: JSON.parse(menuMenu),
    })
  }, [id, cmp.activo, cmp.disposicion, cmp.enlazar, cmp.idB, giro, es3D, hayLienzo, hayLecturas, modificado, vistaA.tipo, hayFormula, puedeDeshacer, puedeRehacer, prefs, moduloP, capasMenu, menuMenu, animado, anim, grabando, transformable])
  const listaOrdenes = (): OrdenPaleta[] => {
    const ejecutar = (e: EntradaMenu<any>) => {
      if (e.desactivado) return
      const p = e.hacer?.(s)
      if (p) set(p)
    }
    const pref = (camino: string[], clave: 'leyenda' | 'formula' | 'lecturas' | 'presentacion'): OrdenPaleta => ({
      camino,
      activo: prefs[clave],
      hacer: () => cambiarPrefs({ [clave]: !prefs[clave] }),
    })
    return [
      { camino: ['Ventana','Resultados y pasos'], hacer: () => alOrden.current('resultados',undefined) },
      { camino: ['Ayuda','Buscar orden…'], hacer: () => setOrdenes(true) },
      { camino: ['Ayuda','Atajos de teclado'], hacer: () => setAtajos(true) },
      ...['png','csv','json'].map(dato=>({camino:['Archivo','Exportar',dato.toUpperCase()],hacer:()=>alOrden.current(dato as Orden,undefined)})),
      ...aplanar(animacionExtraMenu, ['Animación'], ejecutar),
      { camino: ['Animación','Reproducir / pausar'], desactivado: !animado, hacer: () => alOrden.current('animacion',{pausado:!anim.pausado}) },
      { camino: ['Animación','Avanzar fotograma'], desactivado: !animado, hacer: () => alOrden.current('animacion','paso') },
      { camino: ['Animación','Volver al inicio'], hacer: () => alOrden.current('animacion','reiniciar') },
      { camino: ['Ventana','Historial'], hacer: () => alOrden.current('historial',undefined) },
      { camino: ['Calculadora','Ajustes…'], hacer: () => alOrden.current('ajustes',undefined) },
      ...['estudio','geometria','presentacion','comparacion','guardar','recuperar'].map(dato => ({camino:['Ventana','Espacios de trabajo',dato],hacer:()=>alOrden.current('espacioTrabajo',dato)})),
      { camino: ['Archivo','Importar','Imagen de fondo…'], desactivado: vistaP.tipo !== '2d', hacer: () => setImportarImagen(true) },
      { camino: ['Archivo','Importar','Datos CSV en Gráficas…'], hacer: () => setImportarCSV(true) },
      { camino: ['Archivo','Exportar','SVG…'], desactivado: vistaP.tipo !== '2d', hacer: () => alOrden.current('svg', undefined) },
      { camino: ['Archivo','Exportar','Informe de resultados…'], hacer: () => alOrden.current('informe', undefined) },
      ...aplanar(objetoMenu, ['Objeto'], ejecutar),
      ...aplanar(seleccionMenu, ['Edición'], ejecutar),
      ...aplanar(menuPropio?.anadir, ['Objeto', 'Añadir'], ejecutar),
      ...aplanar(herramientasMenu, ['Herramientas'], ejecutar),
      ...aplanar(escenaMenu, ['Escena'], ejecutar),
      ...aplanar(vistaEscenaMenu, ['Vista'], ejecutar),
      { camino: ['Vista', 'Encuadrar todo'], hacer: () => ordenVista({ orden: 'encuadrar' }) },
      pref(['Vista', 'Mostrar', 'Leyenda'], 'leyenda'),
      pref(['Vista', 'Mostrar', 'Fórmula'], 'formula'),
      pref(['Vista', 'Mostrar', 'Lecturas'], 'lecturas'),
      pref(['Vista', 'Modo presentación'], 'presentacion'),
      { camino: ['Edición', 'Deshacer'], hacer: deshacer },
      { camino: ['Edición', 'Rehacer'], hacer: rehacer },
      ...aplanar(menuPropio?.ejemplos, ['Módulo', 'Ejemplos'], ejecutar),
      ...aplanar(menuPropio?.acciones, ['Módulo', moduloP.corto ?? moduloP.resumen], ejecutar),
      { camino: ['Módulo', 'Restablecer el módulo'], hacer: restablecer },
    ]
  }
  const accionesRapidas=():AccionRapida[]=>{
    const lista=listaOrdenes(),favoritos=leerFavoritos()
    const objeto=(id:string):OrdenPaleta|undefined=>{const e=buscarComando(objetoMenu,id);return e?{camino:['Objeto',e.t],desactivado:e.desactivado,hacer:()=>{const p=e.hacer?.(s);if(p)set(p)}}:undefined}
    return [
      {nombre:'Propiedades',icono:'⚙',orden:objeto('objeto.propiedades')},
      {nombre:'Añadir',icono:'＋',hijos:lista.filter(o=>o.camino[0]==='Objeto'&&o.camino[1]==='Añadir')},
      {nombre:'Duplicar',icono:'▣',orden:objeto('objeto.duplicar')},
      {nombre:'Ocultar',icono:'◉',orden:objeto('objeto.ocultar')},
      {nombre:'Eliminar',icono:'×',orden:objeto('objeto.eliminar')},
      {nombre:'Bloquear',icono:'▧',orden:objeto('objeto.bloquear')},
      {nombre:'Herramientas',icono:'ƒ',hijos:lista.filter(o=>o.camino[0]==='Herramientas')},
      {nombre:'Favoritos',icono:'★',hijos:(ordenesNativas??lista).filter(o=>favoritos.includes(claveOrden(o)))},
    ]
  }
  // superponer solo tiene sentido con dos lienzos del mismo tipo
  const superpuesto = cmp.activo && cmp.disposicion === 'encima' && vistaA.tipo === vistaB.tipo && vistaA.tipo !== 'html'

  const lienzo = (lado: 'A' | 'B') => {
    const m = lado === 'A' ? modulo : moduloB
    const v = lado === 'A' ? vistaA : vistaB
    const st = lado === 'A' ? sA : sB
    const fijar = lado === 'A' ? setA : setB
    const llave = `${lado}:${m.id}:${v.tipo}:${v.clave ?? ''}:${superpuesto}`
    const extras = {
      onActivar: () => {if(cmp.activo)setCmp(c=>({...c,editando:lado}))},
      enlace: cmp.activo && cmp.enlazar ? enlace.current : null,
      secundario: superpuesto && lado === 'B',
      lado,
      onSeleccion: (idObjeto: string | null, multiple: boolean) => {
        if (cmp.activo) setCmp(c => ({ ...c, editando: lado }))
        const clave = `${lado}:${m.id}`
        setSelecciones(v => ({ ...v, [clave]: idObjeto ? multiple ? [...new Set([...(v[clave] ?? []), idObjeto])] : [idObjeto] : [] }))
        const p = m.seleccion?.poner(idObjeto,st) ?? objetosModulo(m,st).find(o => o.id === idObjeto)?.seleccionar?.(st)
        if (p) fijar(p)
      },
    }
    if (v.tipo === 'html')
      return (
        <div className="hoja">
          <v.Componente s={st} />
        </div>
      )
    return (
      <ContextoVista.Provider value={{ prefs: prefsEscena(st, prefs), cambiar: (p) => fijar(parcheEscena(st, { vista: { ...leerEscena(st).vista, ...p } })) }}>
        {v.tipo === '3d' ? (
          <Lienzo3D key={llave} vista={v} s={st} set={fijar} giro={giro} transparente={superpuesto && lado === 'B'} {...extras} />
        ) : (
          <Lienzo2D key={llave} vista={v} s={st} set={fijar} {...extras} />
        )}
        {prefs.leyenda && m.leyenda && !(superpuesto && lado === 'B') && <div className="leyenda">{m.leyenda(st)}</div>}
      </ContextoVista.Provider>
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
    <div className={`app${escritorio ? '' : ' con-barra-web'}${panelAcoplado && (inspector || verResultados || verHistorial) ? ' panel-acoplado' : ''}`}>
      {!escritorio && <BarraWeb ordenes={listaOrdenes()} />}
      <Navegacion
        modulos={MODULOS}
        id={id}
        onElegir={setId}
        acciones={
          <>
            <button type="button" className="tog" onClick={() => setOrdenes(true)}>Órdenes</button>
            <button type="button" className="tog" onClick={()=>abrirMenuRapido()}>Edición rápida</button>
            <button type="button" className="tog" aria-pressed={inspector} onClick={() => setInspector(v => !v)}>Objetos</button>
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
          {resultadoActual && <section className="grupo resultado" aria-label="Último cálculo"><b>Último cálculo</b><p>{resultadoActual.metodo}</p>{resultadoActual.tex && <Formula tex={[resultadoActual.tex]} />}{resultadoActual.filas && <Lecturas filas={resultadoActual.filas} />}</section>}
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
      {solicitud && <DialogoValores solicitud={solicitud} onCerrar={()=>setSolicitud(null)} />}

      {verResultados && <PanelResultados acoplado={panelAcoplado} alternar={()=>setPanelAcoplado(v=>!v)} resultados={leerResultados(s)} cerrar={()=>setVerResultados(false)} borrar={id=>set({_resultados:leerResultados(s).filter(r=>r.id!==id)})} abrirCAS={fuente=>{setEstados(e=>({...e,cas:conIdentidad({...e.cas,filas:[...e.cas.filas,{src:fuente}]})}));setId('cas');setCmp(c=>({...c,activo:false,editando:'A'}));setVerResultados(false)}} />}
      {verHistorial && <section className="inspector" aria-label="Historial"><CabeceraPanel titulo={`Historial · ${moduloP.corto}`} cierre="Cerrar historial" cerrar={()=>setVerHistorial(false)} acoplado={panelAcoplado} alternar={()=>setPanelAcoplado(v=>!v)}/><p>{hist?.pasado.length??0} pasos anteriores · {hist?.futuro.length??0} pasos posteriores</p><button disabled={!puedeDeshacer} onClick={deshacer}>Deshacer</button><button disabled={!puedeRehacer} onClick={rehacer}>Rehacer</button>{hist?.pasado.map((_,i)=><button className="paso-historia" key={i} onClick={()=>{confirmar();const h=historiaDe(claveSeleccion);const actual=h.ultimo;const destino=h.pasado[i];h.futuro.push(actual,...h.pasado.slice(i+1).reverse());h.pasado=h.pasado.slice(0,i);h.ultimo=destino;restaurando.current=true;if(editandoB)setEstadosB(e=>({...e,[cmp.idB]:destino}));else setEstados(e=>({...e,[id]:destino}));versionHistoria(v=>v+1)}}>Volver al paso {i+1}</button>)}</section>}
      {importarImagen && <ImportarImagen onCerrar={()=>setImportarImagen(false)} onImportar={imagen=>{set(parcheEscena(s,{imagen}));setImportarImagen(false)}} />}
      {importarCSV && <ImportarCSV onCerrar={() => setImportarCSV(false)} onImportar={puntos => { setEstados(e => ({ ...e, grafica: conIdentidad({ ...e.grafica, filas: [...e.grafica.filas, ...puntos.map(([x,y]) => ({src:`(${numeroFuente(x)},${numeroFuente(y)})`,visible:true}))] }) })); setId('grafica'); setCmp(c => ({ ...c, activo:false, editando:'A' })); setImportarCSV(false) }} />}
      {herramienta && <DialogoHerramienta key={herramienta.id + claveSeleccion} herramienta={herramienta} iniciales={camposRepetidos} fuente={fuenteParaHerramienta(s,objetos.find(o => seleccion.includes(o.id))?.fuente ?? objetos.find(o => o.fuente)?.fuente ?? '')} onCerrar={() => setHerramienta(null)} onResultado={(r, campos) => {setUltimoResultado({r,campos});set({_resultados:[...leerResultados(s),{id:crypto.randomUUID(),herramienta:herramienta.id,nombre:herramienta.nombre,campos,r}].slice(-20)})}} onInsertarLista={Array.isArray(s.filas) ? fuentes=>{set({filas:[...s.filas,...fuentes.map(src=>({src,visible:true,_id:`obj-${crypto.randomUUID()}`}))]});setHerramienta(null);setInspector(true)} : undefined} onInsertar={Array.isArray(s.filas) ? (src) => { const nuevo = `obj-${crypto.randomUUID()}`; const origen = objetos.find(o => seleccion.includes(o.id)); set({ filas: [...s.filas, { src, visible: true, _id: nuevo }], ...(origen?.fuente && ultimoResultado && ultimoResultado.campos.f === fuenteParaHerramienta(s,origen.fuente) && s.filas.some((f:any) => f._id === origen.id) ? { _derivados: [...leerDependencias(s), { objeto: nuevo, origen: origen.id, operacion: herramienta.id, campos: ultimoResultado.campos }] } : {}) }); setHerramienta(null); setInspector(true) } : undefined} />}
      {inspector && <Inspector acoplado={panelAcoplado} alternar={()=>setPanelAcoplado(v=>!v)} objetos={objetos} seleccion={seleccion} elegir={elegirObjetos} s={s} set={set} cerrar={() => setInspector(false)} />}
      {atajos && <HojaAtajos onCerrar={() => setAtajos(false)} />}
      {rapido && <MenuRapido {...rapido} acciones={accionesRapidas()} cerrar={()=>setRapido(null)} buscar={()=>setOrdenes(true)} nativo={escritorio?.contextual} />}
      {ordenes && <PaletaOrdenes ordenes={ordenesNativas ?? listaOrdenes()} onCerrar={() => setOrdenes(false)} />}
      {dialogoEscena && (
        <DialogoEscena
          ventana={dialogoEscena}
          escena={leerEscena(s)}
          onCerrar={() => setDialogoEscena(null)}
          onAplicar={(p) => {
            set(parcheEscena(s, p))
            if (p.encuadre) ordenVista({ orden: 'ventana', lado: ladoP, ...p.encuadre })
            setDialogoEscena(null)
          }}
        />
      )}
    </div>
    </ContextoVista.Provider>
  )
}
