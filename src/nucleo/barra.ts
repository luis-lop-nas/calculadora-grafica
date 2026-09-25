import { HERRAMIENTAS_CALCULO } from '../lib/herramientas'
import { HERRAMIENTAS as GEOMETRIA } from '../lib/geometria'
import type { EntradaMenu } from './tipos'

/**
 * Esqueleto fijo del menú Herramientas. Cada hoja tiene un id `grupo.nombre`; el módulo aporta
 * lo que sabe hacer en `menu(s).herramientas` con esos ids y lo que no aporta sale en gris.
 * Así el menú es el mismo en todos los módulos, como los de Photoshop o Blender.
 */
export interface NodoBarra {
  id: string
  t: string
  hijos?: NodoBarra[]
}

export const CONSTRUCCIONES = ['medio','interseccion','centro','perpendicular','paralela','mediatriz','bisectriz','tangente','incirculo','compas','angulo','distancia','area','perimetro','pendiente','lugar']

export const HERRAMIENTAS: NodoBarra[] = [
  {
    id: 'estudio',
    t: 'Estudio de la función',
    hijos: [
      { id: 'estudio.raices', t: 'Cortes con el eje X (raíces)' },
      { id: 'estudio.asintotas', t: 'Asíntotas' },
      { id: 'estudio.extremos', t: 'Extremos' },
      { id: 'estudio.inflexiones', t: 'Inflexiones' },
      { id: 'estudio.completo', t: 'Estudio completo' },
      { id: 'estudio.tabla', t: 'Tabla de valores' },
    ],
  },
  {
    id: 'derivacion',
    t: 'Derivación',
    hijos: [
      { id: 'derivacion.derivada', t: 'Derivada f′' },
      { id: 'derivacion.tangente', t: 'Recta tangente en x₀' },
    ],
  },
  {
    id: 'integracion',
    t: 'Integración',
    hijos: [
      { id: 'integracion.area', t: 'Área' },
      { id: 'integracion.riemann', t: 'Sumas de Riemann' },
    ],
  },
  {
    id: 'series',
    t: 'Límites y series',
    hijos: [{ id: 'series.taylor', t: 'Polinomio de Taylor' }],
  },
  {
    id: 'construccion',
    t: 'Construcción y medida',
    hijos: [{ id: 'intersecciones.cortes', t: 'Cortes entre curvas' }, ...CONSTRUCCIONES.map(id=>({id:`geometria.${id}`,t:GEOMETRIA[id].nombre}))],
  },
  {
    id: 'multivariable',
    t: 'Multivariable',
    hijos: [
      { id: 'multivariable.plano', t: 'Plano tangente' },
      { id: 'multivariable.gradiente', t: 'Gradiente' },
      { id: 'multivariable.nivel', t: 'Curvas de nivel' },
      { id: 'multivariable.cortes', t: 'Cortes x = a, y = b' },
    ],
  },
]

for (const h of HERRAMIENTAS_CALCULO) {
  let grupo = HERRAMIENTAS.find(g => g.t === h.grupo)
  if (!grupo) { grupo = { id: `grupo.${encodeURIComponent(h.grupo)}`, t: h.grupo, hijos: [] }; HERRAMIENTAS.push(grupo) }
  grupo.hijos!.push({ id: h.id, t: h.nombre })
}

export type Herramientas<S> = Partial<Record<string, EntradaMenu<S>>>

/** Esqueleto + lo que aporta el módulo: el texto es siempre el del esqueleto. */
export function fusionar<S>(nodos: NodoBarra[], propias: Herramientas<S> | undefined): EntradaMenu<S>[] {
  return nodos.map((n) => {
    if (n.hijos) return { t: n.t, hijos: fusionar(n.hijos, propias) }
    const e = propias?.[n.id]
    return e ? { ...e, id: n.id, t: n.t } : { id: n.id, t: n.t, desactivado: true }
  })
}

/** Ids de hoja del esqueleto, para comprobar que los módulos no declaran ids que no existen. */
export function idsHoja(nodos: NodoBarra[] = HERRAMIENTAS): string[] {
  return nodos.flatMap((n) => (n.hijos ? idsHoja(n.hijos) : [n.id]))
}
