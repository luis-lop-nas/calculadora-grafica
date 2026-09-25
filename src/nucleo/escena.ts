import { PREFS_INICIALES, type PrefsVista } from './vista'
/**
 * Ajustes de la escena (menú Escena): cómo son los ejes y la rejilla de un lienzo 2D. Son del
 * documento, no de quien usa la app: viajan dentro del estado de cada módulo con la clave
 * reservada `_escena`, así que se guardan en el .calc, se deshacen y cada lado de Comparar tiene
 * los suyos sin que ningún módulo lo sepa.
 */
export interface AjustesEscena {
  sistema: 'cartesiano' | 'polar' | 'isometrico'
  vista: Pick<PrefsVista, 'ejes' | 'nombres' | 'rejilla' | 'planos' | 'ajustar' | 'paso'>
  pasoX: number
  pasoY: number
  pasoAngular: number
  cruceX: number
  cruceY: number
  razon: number
  fondo: string
  colorEjes: string
  ejeX: boolean
  ejeY: boolean
  ejeZ: boolean
  rotuloZ: string
  planos3d: Array<'xy'|'xz'|'yz'> | null
  imagen: { datos: string; x: number; y: number; ancho: number; alto: number; opacidad: number } | null
  guias: Array<{ eje: 'x' | 'y'; valor: number }>
  textos: Array<{ texto: string; x: number; y: number }>
  rastros: { ids:string[];segundos:number;revision:number }
  logX: boolean
  logY: boolean
  unidadX: 'numeros' | 'pi' | 'grados'
  unidadY: 'numeros' | 'pi' | 'grados'
  /** Ejes cruzados en el origen o en el borde, como una caja. */
  posicion: 'origen' | 'borde' | 'cruce'
  /** 1:1 = una unidad mide lo mismo en x y en y; libre = la ventana se estira con el lienzo. */
  proporcion: 'uno' | 'libre' | 'personalizada'
  /** Rótulos propios; vacío = los que pone el módulo. */
  rotuloX: string
  rotuloY: string
  /** Encuadre fijado por el usuario: la ventana de partida y la de «Encuadrar todo». */
  encuadre: { x: [number, number]; y: [number, number] } | null
  vistas: Array<{ nombre: string; x: [number, number]; y: [number, number] }>
}

export const CLAVE_ESCENA = '_escena'

export const ESCENA_INICIAL: AjustesEscena = {
  sistema: 'cartesiano',
  vista: { ejes: true, nombres: true, rejilla: true, planos: false, ajustar: false, paso: 0.5 },
  pasoX: 0, pasoY: 0, pasoAngular: 30, cruceX: 0, cruceY: 0, razon: 1, fondo: '', colorEjes: '',
  ejeX: true,
  ejeY: true,
  ejeZ: true, rotuloZ: '', planos3d: null,
  imagen: null, guias: [], textos: [],
  rastros: { ids:[],segundos:10,revision:0 },
  logX: false,
  logY: false,
  unidadX: 'numeros',
  unidadY: 'numeros',
  posicion: 'origen',
  proporcion: 'uno',
  rotuloX: '',
  rotuloY: '',
  encuadre: null,
  vistas: [],
}

const intervalo = (v: unknown): v is [number, number] =>
  Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'number' && Number.isFinite(x)) && v[0] < v[1]
const ventana = (v: unknown): v is { x: [number, number]; y: [number, number] } =>
  !!v && typeof v === 'object' && intervalo((v as any).x) && intervalo((v as any).y)

/** Lee la escena de un estado (o de un documento guardado) quedándose solo con lo válido. */
export function leerEscena(s: unknown): AjustesEscena {
  const g = (s as Record<string, unknown> | undefined)?.[CLAVE_ESCENA]
  if (!g || typeof g !== 'object') return { ...ESCENA_INICIAL, vista: { ...ESCENA_INICIAL.vista, ...(typeof (s as any)?.ejes === 'boolean' ? { ejes: (s as any).ejes } : {}), ...(typeof (s as any)?.ajustar === 'boolean' ? { ajustar: (s as any).ajustar } : {}) } }
  const e: Record<string, unknown> = { ...ESCENA_INICIAL }
  for (const [k, v] of Object.entries(g)) {
    if (!(k in ESCENA_INICIAL)) continue
    const base = (ESCENA_INICIAL as unknown as Record<string, unknown>)[k]
    if (k === 'rastros') {
      const r=v as AjustesEscena['rastros']
      if(r && Array.isArray(r.ids) && r.ids.every(id=>typeof id==='string') && Number.isFinite(r.segundos) && r.segundos>0 && r.segundos<=120 && Number.isFinite(r.revision))e[k]={...r,ids:r.ids.slice(0,100)}
    }
    else if (k === 'imagen') {
      const i = v as AjustesEscena['imagen']
      e[k] = i && typeof i.datos === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(i.datos) && i.datos.length < 7_000_000 && [i.x,i.y,i.ancho,i.alto,i.opacidad].every(Number.isFinite) && i.ancho>0 && i.alto>0 && i.opacidad>=0 && i.opacidad<=1 ? i : null
    }
    else if (k === 'guias') e[k] = Array.isArray(v) ? v.filter(g=>g && (g.eje==='x'||g.eje==='y') && Number.isFinite(g.valor)).slice(0,100) : []
    else if (k === 'textos') e[k] = Array.isArray(v) ? v.filter(t=>t && typeof t.texto==='string' && t.texto.length<=1000 && Number.isFinite(t.x) && Number.isFinite(t.y)).slice(0,100) : []
    else if (k === 'planos3d') e[k] = Array.isArray(v) ? [...new Set(v.filter(x => ['xy','xz','yz'].includes(x)))] : null
    else if (k === 'vista') {
      const p = { ...ESCENA_INICIAL.vista }
      for (const key of Object.keys(p) as Array<keyof typeof p>) {
        const value = (v as any)?.[key]
        if (key === 'paso') { if (Number.isFinite(value) && value > 0) p.paso = value }
        else if (typeof value === 'boolean') p[key] = value
      }
      e.vista = p
    }
    else if (k === 'encuadre') e[k] = ventana(v) ? v : null
    else if (k === 'vistas') e[k] = Array.isArray(v) ? v.filter((w) => ventana(w) && typeof (w as any).nombre === 'string') : []
    else if (typeof v === typeof base) e[k] = v
  }
  // lo que no es una de las opciones conocidas vuelve a la de partida
  const opciones: Record<string, readonly string[]> = {
    sistema: ['cartesiano', 'polar', 'isometrico'],
    unidadX: ['numeros', 'pi', 'grados'],
    unidadY: ['numeros', 'pi', 'grados'],
    posicion: ['origen', 'borde', 'cruce'],
    proporcion: ['uno', 'libre', 'personalizada'],
  }
  for (const [k, ops] of Object.entries(opciones)) if (!ops.includes(e[k] as string)) e[k] = (ESCENA_INICIAL as unknown as Record<string, unknown>)[k]
  for (const k of ['pasoX', 'pasoY', 'pasoAngular', 'cruceX', 'cruceY', 'razon']) if (!Number.isFinite(e[k])) e[k] = (ESCENA_INICIAL as any)[k]
  for (const k of ['pasoX', 'pasoY']) if ((e[k] as number) < 0) e[k] = 0
  if ((e.razon as number) <= 0) e.razon = 1
  if ((e.pasoAngular as number) < 1 || (e.pasoAngular as number) > 180) e.pasoAngular = 30
  for (const k of ['fondo', 'colorEjes']) if (!/^#[0-9a-f]{6}$/i.test(e[k] as string)) e[k] = ''
  if (e.logX || e.logY) e.sistema = 'cartesiano'
  return e as unknown as AjustesEscena
}

/** Parche de estado que cambia la escena. */
export const parcheEscena = (s: unknown, p: Partial<AjustesEscena>) => ({ [CLAVE_ESCENA]: leerEscena({ [CLAVE_ESCENA]: { ...leerEscena(s), ...p } }) })

/** Preferencias visuales de usuario más las referencias guardadas en esta escena. */
export const prefsEscena = (s: unknown, prefs: PrefsVista = PREFS_INICIALES): PrefsVista => ({ ...prefs, ...leerEscena(s).vista })

export function ajustarPunto(p: number[], e: AjustesEscena): number[] {
  if (!e.vista.ajustar) return p
  const paso = e.vista.paso
  const q = (x: number) => Math.round(x / paso) * paso
  if (e.sistema === 'polar') {
    const r = q(Math.hypot(p[0], p[1]))
    const da = e.pasoAngular * Math.PI / 180
    const a = Math.round(Math.atan2(p[1], p[0]) / da) * da
    return [r * Math.cos(a), r * Math.sin(a), ...p.slice(2).map(q)]
  }
  if (e.sistema === 'isometrico') {
    const v = p[1] / (Math.sqrt(3) / 2)
    const b = q(v)
    return [q(p[0] - v / 2) + b / 2, b * Math.sqrt(3) / 2, ...p.slice(2).map(q)]
  }
  return p.map(q)
}
