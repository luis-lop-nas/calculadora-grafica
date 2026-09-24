import katex from 'katex'
import { definir, type PropsPanel } from '../../nucleo/tipos'
import { accion } from '../../nucleo/menu'
import { Atajos, Boton, Expresion, Grupo, Nota } from '../../nucleo/controles'
import { ejecutar, type ResultadoFila } from '../../lib/cas/cas'

interface S {
  filas: Array<{ src: string }>
}

const EJEMPLOS = [
  { t: 'Derivar', e: 'derivar(x^2 sin(x), x)' },
  { t: 'Integrar', e: 'integrar(1/(1+x^2), x)' },
  { t: 'Definida', e: 'integrar(sin(x), x, 0, pi)' },
  { t: 'Simplificar', e: 'simplificar((x^2-1)/(x-1))' },
  { t: 'Factorizar', e: 'factorizar(x^3-6x^2+11x-6)' },
  { t: 'Desarrollar', e: 'desarrollar((x+1)^5)' },
  { t: 'Resolver', e: 'resolver(x^2-5x+6=0, x)' },
  { t: 'Sistema', e: 'resolver({x+y=3, x-y=1}, {x, y})' },
  { t: 'Límite', e: 'limite(sin(x)/x, x, 0)' },
  { t: 'Taylor', e: 'taylor(e^x, x, 0, 5)' },
  { t: 'Definir', e: 'f(x) := x^3 - 3x' },
]

const PIEZAS = ['derivar(', 'integrar(', 'resolver(', 'limite(', 'taylor(', 'factorizar(', 'simplificar(', 'desarrollar(', '^', 'sqrt(', 'pi', 'inf', ':=']

// las filas se ejecutan juntas porque las definiciones valen para las de debajo
let cache: { clave: string; r: ResultadoFila[] } | null = null
function resultados(s: S): ResultadoFila[] {
  const clave = JSON.stringify(s.filas.map((f) => f.src))
  if (cache?.clave !== clave) cache = { clave, r: ejecutar(s.filas.map((f) => f.src)) }
  return cache.r
}

const html = (tex: string) => ({ __html: katex.renderToString(tex, { displayMode: true, throwOnError: false, output: 'html' }) })

function anadir(s: S, src: string): Partial<S> {
  const ultima = s.filas[s.filas.length - 1]
  if (ultima && !ultima.src.trim()) return { filas: s.filas.map((f, i) => (i === s.filas.length - 1 ? { src } : f)) }
  return { filas: [...s.filas, { src }] }
}

function Panel({ s, set }: PropsPanel<S>) {
  const rs = resultados(s)
  return (
    <>
      <Grupo titulo="Órdenes">
        <div className="objetos">
          {s.filas.map((f, i) => (
            <div className="objeto cas" key={i}>
              <span className="cas-n">{i + 1}</span>
              <Expresion
                etiqueta=""
                valor={f.src}
                variables={[]}
                piezas={PIEZAS}
                comprobar={() => rs[i]?.error ?? null}
                previa={() => rs[i]?.entrada ?? null}
                onChange={(src) => set({ filas: s.filas.map((g, k) => (k === i ? { src } : g)) })}
              />
              <button type="button" className="quitar-fila" aria-label="Quitar" onClick={() => set({ filas: s.filas.filter((_, k) => k !== i) })}>
                ×
              </button>
            </div>
          ))}
        </div>
        <Boton onClick={() => set({ filas: [...s.filas, { src: '' }] })}>Añadir fila</Boton>
        <Atajos opciones={EJEMPLOS.map((e) => ({ t: e.t, onClick: () => set(anadir(s, e.e)) }))} />
        <Nota>
          derivar(f, x, n) · integrar(f, x) o (f, x, a, b) · simplificar · desarrollar · factorizar · resolver(ecuación, x) o
          ({'{'}ec₁, ec₂{'}'}, {'{'}x, y{'}'}) · limite(f, x, a), con a = inf · taylor(f, x, a, n) · numerico(e) · sustituir(e, x, v).
          Una ecuación suelta se resuelve; f(x) := … y a := … definen para las filas de debajo. Integra por tabla, fracciones simples, cambio de variable y partes.
        </Nota>
      </Grupo>
    </>
  )
}

function Hoja({ s }: { s: S }) {
  const rs = resultados(s)
  return (
    <div className="cas-hoja">
      {rs.map((r, i) =>
        !r.entrada && !r.error ? null : (
          <div className="cas-fila" key={i}>
            <span className="cas-n">{i + 1}</span>
            <div>
              {r.entrada && <div className="cas-entrada" dangerouslySetInnerHTML={html(r.entrada)} />}
              {r.salida && <div className="cas-salida" dangerouslySetInnerHTML={html(r.salida)} />}
              {r.error && <p className="cas-error">{r.error}</p>}
              {r.nota && <p className="cas-nota">{r.nota}</p>}
            </div>
          </div>
        ),
      )}
    </div>
  )
}

export default definir<S>({
  id: 'cas',
  area: 'funciones',
  resumen: 'Cálculo simbólico: derivar, integrar, resolver, límites y Taylor',
  corto: 'Cálculo simbólico',
  titulo: 'Cálculo <i>simbólico</i>',
  entradilla: 'Una orden por fila; el resultado exacto sale a la derecha.',
  inicial: {
    filas: [
      { src: 'f(x) := x^3 - 3x' },
      { src: "derivar(f(x), x)" },
      { src: "resolver(f'(x) = 0, x)" },
      { src: 'integrar(f(x), x, 0, 2)' },
      { src: 'limite(sin(x)/x, x, 0)' },
      { src: 'taylor(e^x, x, 0, 5)' },
    ],
  },
  Panel,
  menu: () => {
    const fila = (t: string, src: string) => accion<S>(t, (x) => anadir(x, src))
    return {
      anadir: [
        fila('Fila vacía', ''),
        fila('Derivar', 'derivar(x^3 sin(x), x)'),
        fila('Integrar (primitiva)', 'integrar(x e^x, x)'),
        fila('Integral definida', 'integrar(x^2, x, 0, 1)'),
        fila('Límite', 'limite((1+1/x)^x, x, inf)'),
        fila('Serie de Taylor', 'taylor(cos(x), x, 0, 6)'),
        fila('Resolver una ecuación', 'resolver(x^2 = 2, x)'),
        fila('Sistema lineal', 'resolver({x+y=3, x-y=1}, {x, y})'),
        fila('Simplificar', 'simplificar((x^2-1)/(x+1))'),
        fila('Factorizar', 'factorizar(x^2-5x+6)'),
        fila('Desarrollar', 'desarrollar((x+2)^3)'),
        fila('Definir una función', 'f(x) := x^2'),
        fila('Transformada de Laplace', 'laplace(sin(t))'),
      ],
      ejemplos: EJEMPLOS.map((e) => fila(e.t, e.e)),
      acciones: [accion<S>('Borrar todas las filas', () => ({ filas: [{ src: '' }] }))],
    }
  },
  vista: { tipo: 'html', Componente: Hoja },
})
