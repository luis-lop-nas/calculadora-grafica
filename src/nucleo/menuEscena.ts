import type { EntradaMenu } from './tipos'
import type { PrefsVista } from './vista'
import { leerEscena, parcheEscena, type AjustesEscena } from './escena'
import { separador } from './menu'

export interface ContextoEscena {
  s: unknown
  tipo: '2d' | '3d' | 'html'
  logaritmica: boolean
  prefs: PrefsVista
  cambiarPrefs: (p: Partial<PrefsVista>) => void
  /** Abre «Editar ejes y encuadre…». */
  editar: () => void
  imagen: () => void
  guia: () => void
  texto: () => void
  guardarVista: () => void
  renombrarVista: (i: number) => void
  irAVista: (v: { x: [number, number]; y: [number, number] }) => void
}

/**
 * Menú Escena, igual para todos los módulos: ejes, escalas, unidades, rejilla y encuadre. Lo de la
 * escena 2D va al estado del módulo (`_escena`); ejes, rejilla y ajuste siguen siendo preferencias.
 */
export function menuEscena(c: ContextoEscena): EntradaMenu<any>[] {
  const e = leerEscena(c.s)
  const es2D = c.tipo === '2d'
  const hay = c.tipo !== 'html'
  const poner = (p: Partial<AjustesEscena>) => () => parcheEscena(c.s, p)
  const pref = (t: string, clave: 'ejes' | 'nombres' | 'rejilla' | 'planos' | 'ajustar', extra: Partial<EntradaMenu<any>> = {}): EntradaMenu<any> => ({
    t,
    tipo: 'casilla',
    activo: c.prefs[clave],
    desactivado: !hay,
    hacer: () => c.cambiarPrefs({ [clave]: !c.prefs[clave] }),
    ...extra,
  })
  const opciones = <K extends keyof AjustesEscena>(t: string, clave: K, ops: Array<[AjustesEscena[K], string]>): EntradaMenu<any> => ({
    t,
    desactivado: !es2D,
    hijos: ops.map(([v, tv]) => ({ t: tv, tipo: 'radio', activo: e[clave] === v, desactivado: !es2D || ((clave==='logX'||clave==='logY') && v===true && !c.logaritmica), hacer: poner({ [clave]: v } as Partial<AjustesEscena>) })),
  })
  const casilla = (t: string, clave: 'ejeX' | 'ejeY' | 'ejeZ'): EntradaMenu<any> => ({ t, tipo: 'casilla', activo: e[clave], desactivado: !hay || (clave === 'ejeZ' && c.tipo !== '3d'), hacer: poner({ [clave]: !e[clave] }) })

  return [
    { t: 'Fondo y guías', desactivado: !es2D, hijos: [
      {t:'Importar imagen calibrada…',hacer:c.imagen},
      {t:'Eliminar imagen',desactivado:!e.imagen,hacer:poner({imagen:null})},
      {t:'Añadir guía…',hacer:c.guia},
      ...e.guias.map((g,i)=>({t:`Eliminar guía ${g.eje} = ${g.valor}`,hacer:poner({guias:e.guias.filter((_,j)=>j!==i)})})),
      {t:'Añadir anotación de texto…',hacer:c.texto},
      ...e.textos.map((t,i)=>({t:`Eliminar «${t.texto.slice(0,35)}»`,hacer:poner({textos:e.textos.filter((_,j)=>j!==i)})})),
    ]},
    {
      t: 'Ejes',
      hijos: [
        pref('Mostrar ejes', 'ejes'),
        pref('Nombres de los ejes', 'nombres'),
        separador,
        casilla('Eje X', 'ejeX'),
        casilla('Eje Y', 'ejeY'),
        casilla('Eje Z', 'ejeZ'),
        separador,
        opciones('Escala del eje X', 'logX', [
          [false, 'Lineal'],
          [true, 'Logarítmica'],
        ]),
        opciones('Escala del eje Y', 'logY', [
          [false, 'Lineal'],
          [true, 'Logarítmica'],
        ]),
        opciones('Unidades del eje X', 'unidadX', [
          ['numeros', 'Números'],
          ['pi', 'Múltiplos de π'],
          ['grados', 'Ángulos en grados'],
        ]),
        opciones('Unidades del eje Y', 'unidadY', [
          ['numeros', 'Números'],
          ['pi', 'Múltiplos de π'],
          ['grados', 'Ángulos en grados'],
        ]),
        opciones('Posición', 'posicion', [
          ['origen', 'Cruzados en el origen'],
          ['borde', 'En el borde (caja)'],
          ['cruce', 'Cruce personalizado'],
        ]),
        separador,
        { t: 'Propiedades de la escena…', desactivado: !es2D, hacer: () => c.editar() },
      ],
    },
    opciones('Proporción', 'proporcion', [
      ['uno', '1:1 (misma unidad en x y en y)'],
      ['libre', 'Libre'],
      ['personalizada', 'Personalizada'],
    ]),
    {
      t: 'Rejilla',
      hijos: [
        pref('Mostrar rejilla', 'rejilla'),
        opciones('Tipo de rejilla', 'sistema', [['cartesiano', 'Cartesiana'], ['polar', 'Polar'], ['isometrico', 'Isométrica']]),
        ...(['xy','xz','yz'] as const).map(plano => ({ t:`Plano ${plano.toUpperCase()}`,tipo:'casilla' as const,desactivado:c.tipo !== '3d',activo:(e.planos3d ?? (c.prefs.planos ? ['xy','xz','yz'] : ['xy'])).includes(plano),hacer:()=>{const actuales: Array<'xy'|'xz'|'yz'>=e.planos3d ?? (c.prefs.planos ? ['xy','xz','yz'] : ['xy']);return parcheEscena(c.s,{planos3d:actuales.includes(plano)?actuales.filter(p=>p!==plano):[...actuales,plano]})} })),
        separador,
        pref('Ajustar a la rejilla', 'ajustar', { atajo: "Shift+CmdOrCtrl+'" }),
        {
          t: 'Paso',
          desactivado: !hay,
          hijos: [0.1, 0.25, 0.5, 1].map((v) => ({ t: String(v).replace('.', ','), tipo: 'radio', activo: c.prefs.paso === v, hacer: () => c.cambiarPrefs({ paso: v }) })),
        },
      ],
    },
  ]
}

export function menuVistaEscena(c: ContextoEscena): EntradaMenu<any>[] {
  const e = leerEscena(c.s)
  const poner = (p: Partial<AjustesEscena>) => () => parcheEscena(c.s, p)
  return [{
      t: 'Encuadre y vistas guardadas',
      desactivado: c.tipo !== '2d',
      hijos: [
        { t: 'Definir ventana visible…', hacer: () => c.editar() },
        { t: 'Volver al encuadre del módulo', desactivado: !e.encuadre, hacer: poner({ encuadre: null }) },
        separador,
        { t: 'Guardar esta vista', hacer: () => c.guardarVista() },
        ...e.vistas.map((v,i) => ({ t: v.nombre, hijos: [ {t:'Recuperar',hacer:()=>c.irAVista(v)}, {t:'Renombrar…',hacer:()=>c.renombrarVista(i)}, {t:'Eliminar',hacer:poner({vistas:e.vistas.filter((_,j)=>i!==j)}) } ] })),
        { t: 'Borrar las vistas guardadas', desactivado: !e.vistas.length, hacer: poner({ vistas: [] }) },
      ],
    },
  ]
}
