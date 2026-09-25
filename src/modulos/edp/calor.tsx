import { definir, type Asa, type Interaccion, type PropsPanel, type Vista } from '../../nucleo/tipos'
import { accion, capaFija, capaVer, casilla, coords, radios } from '../../nucleo/menu'
import { Boton, Expresion, Grupo, Interruptor, Matriz, Muestra, Nota, Rango, Segmentado, Resultado } from '../../nucleo/controles'
import { crearReloj } from '../../lib/reloj'
import { compilarSuave } from '../../lib/expresion'
import { mapa, type NombreMapa } from '../../render/tema'

type Dim = 1 | 2 | 3
type Contorno = 'dirichlet' | 'mixta' | 'neumann' | 'robin'
type Inicial = 'escalon' | 'gaussiana' | 'rampa' | 'modo' | 'propia' | 'focos'

export interface EstadoCalor {
  dim: Dim
  contorno: Contorno
  inicial: Inicial
  modo: number
  k: number
  T0: number
  T1: number
  h: number
  expr: string
  terminos: number
  jugando: boolean
  verFamilia: boolean
  corte: number
  color: NombreMapa
  /** Focos [x, y, z, amplitud] en el cubo unidad; amplitud < 0 es un foco frío. */
  focos: number[][]
  /** Anchura σ de cada foco. */
  ancho: number
}

const gauss = (x: number, c: number, sigma: number) => Math.exp(-((x - c) ** 2) / (2 * sigma * sigma))

const reloj = crearReloj(0.06)

/**
 * En 3D el modo más bajo decae tres veces más rápido que en 1D, así que el
 * tiempo corre más despacio; cuando ya no queda nada que ver, se rebobina.
 */
function avanzar(s: EstadoCalor, pared: number) {
  const l1 = modosCalor(s).map((m) => m.lambda).filter((l) => l > 1e-9)[0] ?? Math.PI
  const t = reloj.avanzar(pared, s.jugando, 0.06 / s.dim)
  if (s.jugando && Math.exp(-s.dim * s.k * l1 * l1 * t) < 0.01) reloj.reiniciar()
  return reloj.t
}

function u0(s: EstadoCalor): (x: number) => number {
  switch (s.inicial) {
    case 'escalon':
      return (x) => (x < 0.5 ? 1 : 0)
    case 'gaussiana':
      return (x) => Math.exp(-((x - 0.5) ** 2) / (2 * 0.09 ** 2))
    case 'rampa':
      return (x) => x
    case 'propia':
      return compilarSuave(s.expr, ['x']).f ?? (() => 0)
    case 'focos':
      return (x) => s.focos.reduce((acc, f) => acc + f[3] * gauss(x, f[0], s.ancho), 0)
    default:
      return (x) => Math.sin(s.modo * Math.PI * x)
  }
}

/**
 * Autovalores de la condición de Robin u(0)=0, u_x(1) = −h·u(1):
 * λ cos λ + h sen λ = 0, con exactamente una raíz en cada ((n−½)π, nπ).
 */
export function autovaloresRobin(h: number, cuantos: number): number[] {
  const G = (l: number) => l * Math.cos(l) + h * Math.sin(l)
  const out: number[] = []
  for (let n = 1; n <= cuantos; n++) {
    let a = (n - 0.5) * Math.PI + 1e-9
    let b = n * Math.PI - 1e-9
    if (G(a) * G(b) > 0) continue
    for (let i = 0; i < 120; i++) {
      const m = (a + b) / 2
      if (G(a) * G(m) <= 0) b = m
      else a = m
    }
    out.push((a + b) / 2)
  }
  return out
}

/** Base propia de la barra según el contorno: es lo único que cambia entre casos. */
export function modosCalor(s: EstadoCalor): Array<{ lambda: number; fi: (x: number) => number; norma: number }> {
  if (s.dim > 1 || s.contorno === 'dirichlet' || s.contorno === 'mixta') {
    return [...Array(s.terminos).keys()].map((i) => {
      const l = (i + 1) * Math.PI
      return { lambda: l, fi: (x: number) => Math.sin(l * x), norma: 0.5 }
    })
  }
  if (s.contorno === 'neumann') {
    const out: Array<{ lambda: number; fi: (x: number) => number; norma: number }> = [
      { lambda: 0, fi: () => 1, norma: 1 },
    ]
    for (let n = 1; n <= s.terminos; n++) {
      const l = n * Math.PI
      out.push({ lambda: l, fi: (x: number) => Math.cos(l * x), norma: 0.5 })
    }
    return out
  }
  return autovaloresRobin(s.h, s.terminos).map((l) => ({
    lambda: l,
    fi: (x: number) => Math.sin(l * x),
    norma: 0.5 - Math.sin(2 * l) / (4 * l),
  }))
}

/** Estado estacionario en 1D: recta entre los extremos, o la media si está aislada. */
export function estacionario(s: EstadoCalor): (x: number) => number {
  if (s.dim > 1 || s.contorno === 'dirichlet' || s.contorno === 'robin') return () => 0
  if (s.contorno === 'neumann') {
    // extremos aislados: el estado final es la media, que se conserva
    const f = u0(s)
    const N = 2000
    let m = 0
    for (let i = 0; i < N; i++) m += f((i + 0.5) / N)
    m /= N
    return () => m
  }
  return (x) => s.T0 + (s.T1 - s.T0) * x
}

const memo = new Map<string, number[]>()
/** Proyección de u(x,0) − u_∞ sobre la base propia. En 2D y 3D se multiplica entre ejes. */
export function coeficientes(s: EstadoCalor): number[] {
  const clave = `${s.dim}|${s.contorno}|${s.inicial}|${s.expr}|${s.modo}|${s.T0}|${s.T1}|${s.h}|${s.terminos}|${s.inicial === 'focos' ? `${s.focos.join(';')}|${s.ancho}` : ''}`
  const guardado = memo.get(clave)
  if (guardado) return guardado
  const f = u0(s)
  const uS = estacionario(s)
  const N = 3000
  const out = modosCalor(s).map(({ fi, norma }) => {
    let acc = 0
    for (let i = 0; i < N; i++) {
      const x = (i + 0.5) / N
      acc += (f(x) - uS(x)) * fi(x)
    }
    return acc / N / norma
  })
  if (memo.size > 60) memo.clear()
  memo.set(clave, out)
  return out
}

/** Solución en 1D. */
export function solucion1d(s: EstadoCalor) {
  const c = coeficientes(s)
  const modos = modosCalor(s)
  const uS = estacionario(s)
  return (x: number, t: number) =>
    uS(x) + modos.reduce((acc, { lambda, fi }, i) => acc + c[i] * Math.exp(-s.k * lambda * lambda * t) * fi(x), 0)
}

/**
 * En 2D y 3D la condición inicial es separable, así que la solución es un
 * producto de sumas: cada eje aporta su propia serie ya amortiguada.
 */
export function solucionSeparable(s: EstadoCalor) {
  const c = coeficientes(s)
  const modos = modosCalor(s)
  return (x: number, t: number) =>
    modos.reduce((acc, { lambda, fi }, i) => acc + c[i] * Math.exp(-s.k * lambda * lambda * t) * fi(x), 0)
}

function amplitudInicial(s: EstadoCalor) {
  const eje = solucionSeparable(s)
  let mx = 0
  for (let i = 1; i < 100; i++) mx = Math.max(mx, Math.abs(eje(i / 100, 0)))
  return Math.pow(mx || 1, s.dim)
}

const memoGauss = new Map<string, number[]>()
/** Coeficientes de seno de una gaussiana centrada en c: el perfil de un foco en un eje. */
export function coefGauss(c: number, s: EstadoCalor): number[] {
  const clave = `${c}|${s.ancho}|${s.terminos}`
  const guardado = memoGauss.get(clave)
  if (guardado) return guardado
  const N = 1500
  const out = [...Array(s.terminos).keys()].map((i) => {
    const l = (i + 1) * Math.PI
    let acc = 0
    for (let k = 0; k < N; k++) {
      const x = (k + 0.5) / N
      acc += gauss(x, c, s.ancho) * Math.sin(l * x)
    }
    return (2 * acc) / N
  })
  if (memoGauss.size > 300) memoGauss.clear()
  memoGauss.set(clave, out)
  return out
}

/**
 * La solución en 2D y 3D como suma de productos: Σ peso · Π_ejes serieₑ(xₑ, t).
 * Un dato separable es un único término; cada foco aporta el suyo, y por
 * linealidad la suma sigue siendo solución exacta (hasta truncar la serie).
 */
type Termino = { peso: number; coef: number[][] }
function terminosCalor(s: EstadoCalor): Termino[] {
  if (s.inicial === 'focos')
    return s.focos.map((f) => ({ peso: f[3], coef: [0, 1, 2].slice(0, s.dim).map((k) => coefGauss(f[k], s)) }))
  const c = coeficientes(s)
  return [{ peso: 1, coef: Array(s.dim).fill(c) }]
}

/** Con focos la escala es absoluta (amplitud 1 = altura 1); si no, se normaliza al máximo. */
const normalCalor = (s: EstadoCalor) => (s.inicial === 'focos' ? 1 : amplitudInicial(s))

function serie(coef: number[], x: number, amort: number[]) {
  let v = 0
  for (let n = 0; n < coef.length; n++) v += coef[n] * amort[n] * Math.sin((n + 1) * Math.PI * x)
  return v
}

const amortiguacion = (s: EstadoCalor, t: number) =>
  [...Array(s.terminos).keys()].map((n) => Math.exp(-s.k * ((n + 1) * Math.PI) ** 2 * t))

const tablasSeno = new Map<string, Float64Array>()
/** sen(nπxₖ) en una rejilla de N puntos de [0, 1], para no recalcularlo en cada fotograma. */
function tablaSeno(N: number, terminos: number) {
  const clave = `${N}|${terminos}`
  let T = tablasSeno.get(clave)
  if (!T) {
    T = new Float64Array(N * terminos)
    for (let n = 0; n < terminos; n++)
      for (let k = 0; k < N; k++) T[n * N + k] = Math.sin((n + 1) * Math.PI * (k / (N - 1)))
    tablasSeno.set(clave, T)
  }
  return T
}

function perfil(coef: number[], amort: number[], N: number) {
  const T = tablaSeno(N, coef.length)
  const out = new Float64Array(N)
  for (let n = 0; n < coef.length; n++) {
    const c = coef[n] * amort[n]
    if (c === 0) continue
    for (let k = 0; k < N; k++) out[k] += c * T[n * N + k]
  }
  return out
}

/** Valor puntual, para las lecturas. */
export function valorCalor(s: EstadoCalor, p: number[], t: number) {
  const amort = amortiguacion(s, t)
  return terminosCalor(s).reduce((acc, { peso, coef }) => acc + peso * coef.reduce((m, c, k) => m * serie(c, p[k], amort), 1), 0) / normalCalor(s)
}

const SUB = '₀₁₂₃₄₅₆₇₈₉'
const sub = (n: number) => String(n).split('').map((d) => SUB[+d]).join('')
/** Qué componentes de [x, y, z, a] se ven y se editan en cada dimensión. */
const COMPONENTES: Record<Dim, number[]> = { 1: [0, 3], 2: [0, 1, 3], 3: [0, 1, 2, 3] }

function PanelFocos({ s, set }: PropsPanel<EstadoCalor>) {
  const cols = COMPONENTES[s.dim]
  return (
    <>
      {s.focos.length > 0 && (
        <Matriz
          A={s.focos.map((f) => cols.map((c) => f[c]))}
          onChange={(A: number[][]) =>
            set({
              focos: s.focos.map((f, i) => {
                const g = f.slice()
                cols.forEach((c, j) => (g[c] = c === 3 ? Math.max(-1.5, Math.min(1.5, A[i][j])) : Math.max(0, Math.min(1, A[i][j]))))
                return g
              }),
            })
          }
          paso={0.02}
          filas={s.focos.map((f, i) => ({ nombre: `F${sub(i + 1)}`, color: f[3] >= 0 ? 'var(--pos)' : 'var(--neg)' }))}
          quitar={(i) => set({ focos: s.focos.filter((_, k) => k !== i) })}
        />
      )}
      <Rango etiqueta="Anchura σ de los focos" valor={s.ancho} min={0.03} max={0.2} paso={0.005} formato={(v) => v.toFixed(3)} onChange={(ancho) => set({ ancho })} />
      <Nota>
        Columnas: {cols.map((c) => ['x', 'y', 'z', 'amplitud'][c]).join(', ')}. Amplitud negativa = foco frío.
        Arrástralos en el lienzo {s.dim === 1 ? '(la altura es la amplitud)' : s.dim === 2 ? '(con ⌥ cambias la amplitud)' : '(con ⌥ suben o bajan)'};
        doble clic pone uno nuevo.
      </Nota>
    </>
  )
}

function Panel({ s, set }: PropsPanel<EstadoCalor>) {
  return (
    <>
      <Grupo titulo="Dimensiones">
        <Segmentado
          columnas={3}
          valor={s.dim}
          opciones={[
            { v: 1 as Dim, t: 'Barra 1D' },
            { v: 2 as Dim, t: 'Placa 2D' },
            { v: 3 as Dim, t: 'Cubo 3D' },
          ]}
          onChange={(dim) => {
            reloj.reiniciar()
            set({ dim })
          }}
        />
        {s.dim > 1 && (
          <Nota>
            En 2D y 3D el borde se queda a cero y la temperatura inicial es <b>separable</b>: el
            mismo perfil en cada eje. Los coeficientes son entonces productos de los de 1D. Con
            focos, cada uno es separable por su cuenta y la solución es su suma.
          </Nota>
        )}
      </Grupo>

      <Resultado />

      {s.dim === 1 && (
        <Grupo titulo="Condiciones de contorno">
          <Segmentado
            columnas={3}
            valor={s.contorno}
            opciones={[
              { v: 'dirichlet' as Contorno, t: 'u = 0' },
              { v: 'mixta' as Contorno, t: 'u = T₀, T₁' },
              { v: 'neumann' as Contorno, t: 'Aislada' },
              { v: 'robin' as Contorno, t: 'Convección' },
            ]}
            onChange={(contorno) => set({ contorno })}
          />
          {s.contorno === 'robin' && (
            <>
              <Rango
                etiqueta="Transferencia h"
                valor={s.h}
                min={0.1}
                max={20}
                paso={0.1}
                formato={(v) => v.toFixed(1)}
                onChange={(h) => set({ h })}
              />
              <Nota>
                Condición de tercera especie: <b>u(0)=0</b> y <b>u_x(1) = −h·u(1)</b>, el extremo
                derecho pierde calor hacia el ambiente. Los autovalores ya no son nπ: salen de
                λ cos λ + h sen λ = 0, uno en cada ((n−½)π, nπ).
              </Nota>
            </>
          )}
          {s.contorno === 'mixta' && (
            <>
              <Rango etiqueta="T₀ (extremo izquierdo)" valor={s.T0} min={-1} max={1} paso={0.05} formato={(v) => v.toFixed(2)} onChange={(T0) => set({ T0 })} />
              <Rango etiqueta="T₁ (extremo derecho)" valor={s.T1} min={-1} max={1} paso={0.05} formato={(v) => v.toFixed(2)} onChange={(T1) => set({ T1 })} />
            </>
          )}
        </Grupo>
      )}

      <Grupo titulo="Temperatura inicial">
        <Segmentado
          columnas={2}
          valor={s.inicial}
          opciones={[
            { v: 'escalon' as Inicial, t: 'Escalón' },
            { v: 'gaussiana' as Inicial, t: 'Punto caliente' },
            { v: 'rampa' as Inicial, t: 'Rampa' },
            { v: 'modo' as Inicial, t: 'Modo puro' },
            { v: 'propia' as Inicial, t: 'La mía' },
            { v: 'focos' as Inicial, t: 'Focos' },
          ]}
          onChange={(inicial) => set({ inicial })}
        />
        {s.inicial === 'focos' && <PanelFocos s={s} set={set} />}
        {s.inicial === 'modo' && (
          <Rango etiqueta="Modo n" valor={s.modo} min={1} max={10} paso={1} formato={(v) => `${v}`} onChange={(modo) => set({ modo })} />
        )}
        {s.inicial === 'propia' && (
          <Expresion etiqueta="u(x,0) =" valor={s.expr} variables={['x']} onChange={(expr: string) => set({ expr })} />
        )}
      </Grupo>

      <Grupo titulo="Difusión">
        <Rango etiqueta="Difusividad k" valor={s.k} min={0.05} max={2} paso={0.05} formato={(v) => v.toFixed(2)} onChange={(k) => set({ k })} />
        <Rango etiqueta="Términos de la serie" valor={s.terminos} min={1} max={80} paso={1} formato={(v) => `${v}`} onChange={(terminos) => set({ terminos })} />
        {s.dim === 3 && (
          <Rango etiqueta="Posición de los cortes" valor={s.corte} min={0.08} max={0.92} paso={0.02} formato={(v) => v.toFixed(2)} onChange={(corte) => set({ corte })} />
        )}
        {s.dim > 1 && (
          <Segmentado
            columnas={3}
            valor={s.color}
            opciones={[
              { v: 'fuego' as NombreMapa, t: 'Temperatura' },
              { v: 'arcoiris' as NombreMapa, t: 'Arcoíris' },
              { v: 'divergente' as NombreMapa, t: 'Con signo' },
            ]}
            onChange={(color) => set({ color })}
          />
        )}
        <div className="interruptores">
          <Interruptor activo={s.jugando} onChange={(jugando) => set({ jugando })}>
            Animación
          </Interruptor>
          {s.dim === 1 && (
            <Interruptor activo={s.verFamilia} onChange={(verFamilia) => set({ verFamilia })}>
              Familia de instantes
            </Interruptor>
          )}
          <Boton onClick={() => reloj.reiniciar()}>Reiniciar</Boton>
        </div>
      </Grupo>
    </>
  )
}

const INSTANTES = [0, 0.001, 0.003, 0.008, 0.02, 0.05, 0.12, 0.3]
const NU = 90
const NC = 64

const vista1d: Vista<EstadoCalor> = {
  tipo: '2d',
  clave: '1d',
  navegable: false,
  interaccion: interaccionFocos(1),
  animada: (s) => s.jugando,
  dibujar(g, s, pared) {
    const t = reloj.avanzar(pared, s.jugando)
    g.ventana = { x: [-0.08, 1.08], y: [-1.25, 1.35] }
    g.ejes({ etiquetaX: 'x', etiquetaY: 'u', paso: 0.25 })
    const u = solucion1d(s)
    const uS = estacionario(s)
    const curva = (tt: number, color: string, grosor: number, punteada = false) => {
      const pts: Array<[number, number]> = []
      for (let i = 0; i <= 500; i++) pts.push([i / 500, u(i / 500, tt)])
      g.curva(pts, color, grosor, punteada)
    }
    if (s.verFamilia) {
      const neg = g.color('--aux')
      for (const tt of INSTANTES) curva(tt / s.k, neg, 1)
    }
    g.curva(
      [
        [0, uS(0)],
        [1, uS(1)],
      ],
      g.color('--pos'),
      1.6,
      true,
    )
    curva(t, g.color('--accent'), 2.8)
    g.texto(`t = ${t.toFixed(4)}`, 0.02, 1.25, g.color('--ink'))
  },
}

const recorta01 = (v: number) => Math.round(Math.max(0.02, Math.min(0.98, v)) * 1000) / 1000
const recortaA = (v: number) => Math.round(Math.max(-1.5, Math.min(1.5, v)) * 100) / 100

/**
 * Asas de los focos. En 1D el asa es (x, amplitud); en la placa flota a la
 * altura de su amplitud sobre (x, y); en el cubo es el punto (x, y, z).
 */
function interaccionFocos(dim: Dim): Interaccion<EstadoCalor> {
  const alMundo = (v: number) => 2 * v - 1
  const desdeMundo = (v: number) => recorta01((v + 1) / 2)
  return {
    asas: (s): Asa[] =>
      s.inicial !== 'focos'
        ? []
        : s.focos.map((f, i) => ({
            id: `F${i}`,
            p: dim === 1 ? [f[0], f[3]] : dim === 2 ? [alMundo(f[0]), alMundo(f[1]), f[3] * 0.7] : [alMundo(f[0]), alMundo(f[1]), alMundo(f[2])],
            color: f[3] >= 0 ? '--pos' : '--neg',
            nombre: dim === 1 ? `F${sub(i + 1)}` : undefined,
          })),
    mover(id, t, s) {
      const k = +id.slice(1)
      const f = s.focos[k].slice()
      if (dim === 1) {
        f[0] = recorta01(t.p[0])
        f[3] = recortaA(t.p[1])
      } else if (dim === 2) {
        // ⌥ sube o baja el asa: en la placa eso es cambiar la amplitud
        if (t.mayus) f[3] = recortaA(t.p[2] / 0.7)
        else {
          f[0] = desdeMundo(t.p[0])
          f[1] = desdeMundo(t.p[1])
        }
      } else {
        f[0] = desdeMundo(t.p[0])
        f[1] = desdeMundo(t.p[1])
        f[2] = desdeMundo(t.p[2])
      }
      // al tocar el dato la difusión vuelve a empezar: si no, se ve ya apagada
      reloj.reiniciar()
      return { focos: s.focos.map((g, i) => (i === k ? f : g)) }
    },
    anadir(t, s) {
      const [x, y] = dim === 1 ? [recorta01(t.p[0]), 0.5] : [desdeMundo(t.p[0]), desdeMundo(t.p[1])]
      const a = dim === 1 ? recortaA(t.p[1]) || 1 : 1
      const nuevo = [x, y, 0.5, a]
      reloj.reiniciar()
      // doble clic con otro dato inicial: se pasa a focos empezando por este
      return { inicial: 'focos', focos: s.inicial === 'focos' ? [...s.focos, nuevo] : [nuevo] }
    },
    quitar: (id, s) => ({ focos: s.focos.filter((_, i) => i !== +id.slice(1)) }),
    pista:
      dim === 1
        ? 'Arrastra los focos (la altura es la amplitud) · doble clic: foco nuevo · doble clic o Supr: quitarlo'
        : dim === 2
          ? 'Arrastra los focos por la placa · ⌥: amplitud · doble clic: foco nuevo · Supr: quitarlo'
          : 'Arrastra los focos · ⌥: en vertical · doble clic: foco nuevo · Supr: quitarlo',
  }
}

function pintar2d(e: any, s: EstadoCalor, t: number) {
  const sup = e.datos.sup
  if (!sup) return
  const terminos = e.datos.terminos as Termino[]
  const norma = e.datos.norma as number
  const amort = amortiguacion(s, t)
  const acc = new Float64Array(NU * NU)
  for (const { peso, coef } of terminos) {
    const px = perfil(coef[0], amort, NU)
    const py = perfil(coef[1], amort, NU)
    for (let j = 0; j < NU; j++) {
      const w = peso * py[j]
      if (w === 0) continue
      for (let i = 0; i < NU; i++) acc[j * NU + i] += w * px[i]
    }
  }
  const col = mapa(s.color)
  sup.actualizar((i: number, j: number) => {
    const u = acc[j * NU + i] / norma
    const c = s.color === 'divergente' ? (u + 1) / 2 : u
    return [(2 * i) / (NU - 1) - 1, (2 * j) / (NU - 1) - 1, u * 0.7, col(Math.max(0, Math.min(1, c)))]
  })
}

const vista2d: Vista<EstadoCalor> = {
  tipo: '3d',
  clave: '2d',
  camara: { theta: 0.85, phi: 1.2, r: 3.4 },
  interaccion: interaccionFocos(2),
  construir(e, s) {
    e.zArriba(true)
    e.ejes(1.2, ['x', 'y', 'u'])
    e.datos.sup = e.superficie(NU, NU, {})
    e.datos.terminos = terminosCalor(s)
    e.datos.norma = normalCalor(s)
    if (s.inicial === 'focos')
      for (const f of s.focos) e.linea([[2 * f[0] - 1, 2 * f[1] - 1, 0], [2 * f[0] - 1, 2 * f[1] - 1, f[3] * 0.7]], e.color('--ink-soft'), 0.5)
    pintar2d(e, s, reloj.t)
  },
  animar(e, s, pared) {
    pintar2d(e, s, avanzar(s, pared))
  },
}

function pintar3d(e: any, s: EstadoCalor, t: number) {
  const cortes = e.datos.cortes as Array<{ actualizar: (f: any) => void }> | undefined
  if (!cortes) return
  const terminos = e.datos.terminos as Termino[]
  const norma = e.datos.norma as number
  const amort = amortiguacion(s, t)
  const a = s.corte
  // por cada término: perfiles en la rejilla de los tres ejes y su valor en el corte
  const piezas = terminos.map(({ peso, coef }) => ({
    peso,
    p: coef.map((c) => perfil(c, amort, NC)),
    enCorte: coef.map((c) => serie(c, a, amort)),
  }))
  const col = mapa(s.color)
  const tono = (u: number) => col(Math.max(0, Math.min(1, s.color === 'divergente' ? (u + 1) / 2 : u)))
  const local = (x: number) => 2 * x - 1
  const c = (k: number) => k / (NC - 1)
  // plano k: fija el eje `fijo` en el corte y recorre los otros dos
  const plano = (fijo: number, u: number, v: number) => (i: number, j: number) => {
    let val = 0
    for (const q of piezas) val += q.peso * q.enCorte[fijo] * q.p[u][i] * q.p[v][j]
    const pt = [0, 0, 0]
    pt[fijo] = local(a)
    pt[u] = local(c(i))
    pt[v] = local(c(j))
    return [pt[0], pt[1], pt[2], tono(val / norma)]
  }
  cortes[0].actualizar(plano(2, 0, 1))
  cortes[1].actualizar(plano(1, 0, 2))
  cortes[2].actualizar(plano(0, 1, 2))
}

const vista3d: Vista<EstadoCalor> = {
  tipo: '3d',
  clave: '3d',
  camara: { theta: 0.9, phi: 1.1, r: 4 },
  interaccion: interaccionFocos(3),
  construir(e, s) {
    e.zArriba(true)
    e.ejes(1.15, ['x', 'y', 'z'], { caja: 1 })
    e.datos.terminos = terminosCalor(s)
    e.datos.norma = normalCalor(s)
    e.datos.cortes = [0, 1, 2].map(() => e.superficie(NC, NC, {}))
    pintar3d(e, s, reloj.t)
  },
  animar(e, s, pared) {
    pintar3d(e, s, avanzar(s, pared))
  },
}

export default definir<EstadoCalor>({
  id: 'calor',
  area: 'edp',
  resumen: 'Ecuación del calor en 1D, 2D y 3D',
  corto: 'Ecuación del calor',
  titulo: 'Ecuación del <i>calor</i>',
  entradilla: 'u_t = kΔu: cada modo se apaga como e^(−kλt), y el más alto se va primero.',
  inicial: {
    dim: 1, contorno: 'dirichlet', inicial: 'escalon', modo: 3, k: 0.4, T0: -0.6, T1: 0.8,
    h: 4, expr: 'x*(1-x)*4', terminos: 40, jugando: true, verFamilia: true, corte: 0.5, color: 'fuego',
    focos: [[0.3, 0.35, 0.5, 1], [0.72, 0.6, 0.4, 0.7]], ancho: 0.08,
  },
  ejemplos: [
    { t: 'Barra con extremos a distinta temperatura', e: { dim: 1, contorno: 'dirichlet', inicial: 'escalon', T0: -0.6, T1: 0.8 } },
    { t: 'Un modo que decae (e^{−k n²π² t})', e: { dim: 1, contorno: 'dirichlet', inicial: 'modo', modo: 3, T0: 0, T1: 0 } },
    { t: 'Barra aislada (Neumann): se iguala a la media', e: { dim: 1, contorno: 'neumann', inicial: 'gaussiana' } },
    { t: 'Enfriamiento con Robin', e: { dim: 1, contorno: 'robin', inicial: 'rampa', h: 4 } },
    { t: 'Placa 2D con focos', e: { dim: 2, inicial: 'focos' } },
    { t: 'Cubo 3D con focos', e: { dim: 3, inicial: 'focos' } },
  ],
  Panel,
  capas: (s) =>
    s.dim === 1
      ? [capaFija<EstadoCalor>('u', 'u(x, t)', '--accent'), capaVer(s, 'verFamilia', 'Instantes fijos', '--aux'), capaFija<EstadoCalor>('est', 'Estado estacionario', '--pos')]
      : s.inicial === 'focos'
        ? s.focos.map((f, i) => ({ id: `F${i}`, nombre: `Foco ${i + 1}`, color: '--rosa', detalle: coords(f.slice(0, s.dim)), quitar: (t: EstadoCalor) => ({ focos: t.focos.filter((_, k) => k !== i) }) }))
        : [],
  menu: (s) => ({
    anadir: s.dim > 1 ? [accion<EstadoCalor>('Foco de calor', (t) => {
      reloj.reiniciar()
      return { inicial: 'focos', focos: [...(t.inicial === 'focos' ? t.focos : []), [0.5, 0.5, 0.5, 1]] }
    })] : [],
    acciones: [
      casilla<EstadoCalor>('Reproducir', s.jugando, (jugando) => ({ jugando })),
      accion<EstadoCalor>('Reiniciar', () => {
        reloj.reiniciar()
      }),
      radios<EstadoCalor, Dim>('Dimensión', [{ v: 1, t: 'Barra 1D' }, { v: 2, t: 'Placa 2D' }, { v: 3, t: 'Cubo 3D' }], s.dim, (dim) => {
        reloj.reiniciar()
        return { dim }
      }),
      ...(s.dim === 1
        ? [radios<EstadoCalor, Contorno>('Extremos', [{ v: 'dirichlet', t: 'A cero (Dirichlet)' }, { v: 'mixta', t: 'A T₀ y T₁' }, { v: 'neumann', t: 'Aislados (Neumann)' }, { v: 'robin', t: 'Convección (Robin)' }], s.contorno, (contorno) => ({ contorno }))]
        : []),
      radios<EstadoCalor, Inicial>(
        'Temperatura inicial',
        [{ v: 'escalon', t: 'Escalón' }, { v: 'gaussiana', t: 'Punto caliente' }, { v: 'rampa', t: 'Rampa' }, { v: 'modo', t: 'Modo puro' }, { v: 'propia', t: 'La mía' }, { v: 'focos', t: 'Focos' }],
        s.inicial,
        (inicial) => {
          reloj.reiniciar()
          return { inicial }
        },
      ),
    ],
  }),
  resultadoEnPanel: true,
  lecturasVivas: true,
  rotulo: (s) =>
    s.dim === 1
      ? {
          nombre: 'Difusión en una barra',
          apunte:
            s.contorno === 'neumann'
              ? 'extremos aislados: se conserva la media'
              : s.contorno === 'dirichlet'
                ? 'extremos a cero: todo decae'
                : s.contorno === 'robin'
                  ? 'un extremo convecta al ambiente'
                  : 'extremos fijos: tiende a la recta',
        }
      : s.dim === 2
        ? { nombre: 'Difusión en una placa', apunte: s.inicial === 'focos' ? `borde a cero, ${s.focos.length} ${s.focos.length === 1 ? 'foco' : 'focos'}` : 'borde a cero, dato separable' }
        : { nombre: 'Difusión en un cubo', apunte: 'tres cortes ortogonales' },
  formula: (s) =>
    s.dim === 1
      ? s.contorno === 'neumann'
        ? [
            String.raw`u=\frac{a_0}{2}+\sum_{n\ge1} a_n e^{-k n^2\pi^2 t}\cos(n\pi x)`,
            String.raw`u_x(0,t)=u_x(1,t)=0 \Rightarrow \int_0^1 u\,dx \ \text{constante}`,
          ]
        : s.contorno === 'robin'
          ? [
              String.raw`u=\sum_n c_n e^{-k\lambda_n^2 t}\sin(\lambda_n x)`,
              String.raw`u(0,t)=0,\qquad u_x(1,t)=-h\,u(1,t)`,
              String.raw`\lambda\cos\lambda + h\sin\lambda = 0`,
            ]
          : [
            String.raw`u=u_\infty(x)+\sum_{n\ge1} b_n e^{-k n^2\pi^2 t}\sin(n\pi x)`,
            String.raw`b_n=2\int_0^1\big[u(x,0)-u_\infty\big]\sin(n\pi x)\,dx`,
            String.raw`\tau_n=\frac{1}{k n^2\pi^2}`,
          ]
      : s.dim === 2
        ? [
            String.raw`u=\sum_{m,n} b_m b_n\, e^{-k(m^2+n^2)\pi^2 t}\sin(m\pi x)\sin(n\pi y)`,
            String.raw`\lambda_{mn}=(m^2+n^2)\pi^2`,
          ]
        : [
            String.raw`u=\sum_{m,n,p} b_m b_n b_p\, e^{-k(m^2+n^2+p^2)\pi^2 t}\sin(m\pi x)\sin(n\pi y)\sin(p\pi z)`,
            String.raw`\lambda_{mnp}=(m^2+n^2+p^2)\pi^2`,
          ],
  lecturas: (s) => {
    const b = coeficientes(s)
    const t = reloj.t
    const lambda1 = modosCalor(s).map((m) => m.lambda).filter((l) => l > 1e-9)[0] ?? Math.PI
    const filas: Array<[string, string]> = [
      ['t', t.toFixed(4)],
      ['λ₁', lambda1.toFixed(5)],
      ['τ del modo más bajo', (1 / (s.k * lambda1 * lambda1 * s.dim)).toFixed(4)],
      ['b₁', b[0]?.toFixed(4) ?? '—'],
      ['b₂', b[1]?.toFixed(4) ?? '—'],
      ['Amortiguación e^(−kλ₁²t)', Math.exp(-s.k * lambda1 * lambda1 * t).toFixed(5)],
    ]
    if (s.dim === 1) {
      const u = solucion1d(s)
      let e2 = 0
      for (let i = 0; i <= 400; i++) e2 += u(i / 400, t) ** 2
      filas.push(['‖u‖₂', Math.sqrt(e2 / 401).toFixed(5)])
      if (s.contorno === 'robin') filas.push(['Flujo −u_x(1)', ((u(1 - 1e-4, t) - u(1 + 0e-4, t)) / 1e-4).toFixed(4)])
      else filas.push(['τ₁ / τ₅', '25'])
    } else {
      const mitad = [0.5, 0.5, 0.5]
      const centro = valorCalor(s, mitad, t)
      const inicio = valorCalor(s, mitad, 0)
      filas.push(['Modo más bajo', `λ = ${s.dim}π² = ${(s.dim * Math.PI ** 2).toFixed(3)}`])
      filas.push(['u en el centro', centro.toFixed(5)])
      if (Math.abs(inicio) > 1e-6) filas.push(['Caída desde t = 0', `${(100 * (1 - centro / inicio)).toFixed(1)} %`])
      if (s.inicial === 'focos')
        s.focos.forEach((f, i) => filas.push([`u en F${sub(i + 1)}`, valorCalor(s, f, t).toFixed(5)]))
    }
    return filas
  },
  leyenda: (s) =>
    s.dim === 1 ? (
      <>
        <Muestra color="var(--accent)">u(x, t)</Muestra>
        {s.verFamilia && <Muestra color="var(--aux)">instantes fijos</Muestra>}
        <Muestra color="var(--pos)">estado estacionario</Muestra>
      </>
    ) : (
      <>
        <span>color = temperatura</span>
        <span>{s.dim === 3 ? 'tres cortes ortogonales' : 'altura = temperatura'}</span>
      </>
    ),
  vista: (s) => (s.dim === 1 ? vista1d : s.dim === 2 ? vista2d : vista3d),
})
