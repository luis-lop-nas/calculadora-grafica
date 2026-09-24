import { useEffect, useMemo, useRef, useState } from 'react'
import { MODULOS } from './registro'
import { Navegacion } from './Navegacion'
import { Lienzo2D, Lienzo3D, type Enlace } from './lienzos'
import { Formula, Lecturas, RanuraResultado } from './controles'
import { AREAS_CORTAS, type ModuloAny, type Vista } from './tipos'
import { escritorio, type Orden } from './escritorio'

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

  useEffect(() => {
    const atajo = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      const elemento = e.target as HTMLElement | null
      if (elemento?.matches('input, textarea, select, button, [contenteditable="true"]')) return
      e.preventDefault()
      setGiro((v) => !v)
    }
    document.addEventListener('keydown', atajo)
    return () => document.removeEventListener('keydown', atajo)
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
      // el mismo botón PNG del lienzo que se está editando (el B superpuesto no tiene: cae al de A)
      const boton = (sel: string) => document.querySelector<HTMLButtonElement>(`${sel} button[title="Descargar imagen PNG"]`)
      ;(boton(`.lado-${cmp.activo ? cmp.editando : 'A'}`) ?? boton('.escenario'))?.click()
    } else if (orden === 'csv') descargarLecturas(id, lecturas)
    else if (orden === 'comparar') conmutarComparar()
    else if (orden === 'giro') setGiro((v) => !v)
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
  useEffect(() => {
    escritorio?.estado({ id, comparar: cmp.activo, giro, es3D, hayLienzo, hayLecturas, modificado })
  }, [id, cmp.activo, giro, es3D, hayLienzo, hayLecturas, modificado])
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
        {m.leyenda && !(superpuesto && lado === 'B') && <div className="leyenda">{m.leyenda(st)}</div>}
      </>
    )
  }
  const resultado =
    rotulo || formula?.length || lecturas?.length ? (
      <div className="grupo resultado">
        {rotulo && (
          <div className="titulo">
            <span dangerouslySetInnerHTML={{ __html: rotulo.nombre }} />
          </div>
        )}
        {formula && formula.length > 0 && <Formula tex={formula} />}
        {lecturas && lecturas.length > 0 && <Lecturas filas={lecturas} />}
      </div>
    ) : null

  return (
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

      <div className="cuerpo">
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
    </div>
  )
}
