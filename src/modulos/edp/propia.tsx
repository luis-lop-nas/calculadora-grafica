import { definir, type PropsPanel, type Vista } from '../../nucleo/tipos'
import { Atajos, Boton, Expresion, Grupo, Interruptor, Muestra, Nota, Rango, Resultado, Segmentado } from '../../nucleo/controles'
import { aLatex, compilar } from '../../lib/expresion'
import {
  avanzar, crearEstacionaria, crearSim, expandir, extremos, gota, integral, leerParametros, preparar, VARIABLES_EDP,
  type ConfigEdp, type Contorno, type Problema, type Sim,
} from '../../lib/edp'
import { divergente, mapa } from '../../render/tema'
import type { Pintor2D } from '../../render/pintor2d'

export interface EstadoEdp {
  dim: 1 | 2
  ecU: string
  ecV: string
  parametros: string
  iniU: string
  iniUt: string
  iniV: string
  iniVt: string
  contorno: Contorno
  bordeU: string
  bordeV: string
  dominio: string
  n: number
  /** Tiempo simulado por segundo real (escala logarítmica en el control). */
  ritmo: number
  jugando: boolean
  vista: 'plano' | 'superficie'
  ver: 'u' | 'v'
  reinicio: number
  /** Solo para redibujar tras una gota con la simulación en pausa. */
  gotas: number
}

type S = EstadoEdp

interface Ejemplo {
  t: string
  s: Partial<S>
}

const CAJA = 'if(x > 26 & x < 38 & y > 26 & y < 38, 1, 0)'

const G2 = (cx: string, cy: string, a: string) => `exp(-((x-${cx})^2+(y-${cy})^2)/${a})`

const EJEMPLOS: Ejemplo[] = [
  { t: 'Calor', s: { dim: 1, ecU: 'u_t = 0.5*u_xx', ecV: '', iniU: 'sin(pi*x) + 0.5*sin(4*pi*x)', contorno: 'dirichlet', bordeU: '0', dominio: '0, 1', ritmo: 0.1 } },
  { t: 'Onda amortiguada', s: { dim: 1, ecU: 'u_tt = u_xx - 0.3*u_t', ecV: '', iniU: 'exp(-200*(x-0.3)^2)', iniUt: '0', contorno: 'dirichlet', bordeU: '0', dominio: '0, 1', ritmo: 0.4 } },
  { t: 'Burgers', s: { dim: 1, ecU: 'u_t = -u*u_x + nu*u_xx', parametros: 'nu = 0.01', ecV: '', iniU: 'sin(2*pi*x)', contorno: 'periodica', dominio: '0, 1', ritmo: 0.15 } },
  { t: 'Fisher–KPP', s: { dim: 1, ecU: 'u_t = u_xx + u*(1 - u)', ecV: '', iniU: 'exp(-x^2)', contorno: 'neumann', bordeU: '0', dominio: '-10, 60', ritmo: 2 } },
  { t: 'Transporte', s: { dim: 1, ecU: 'u_t = -c*u_x', parametros: 'c = 1', ecV: '', iniU: 'exp(-100*(x-0.3)^2)', contorno: 'periodica', dominio: '0, 1', ritmo: 0.3 } },
  { t: 'Allen–Cahn', s: { dim: 1, ecU: 'u_t = eps^2*u_xx + u - u^3', parametros: 'eps = 0.02', ecV: '', iniU: '0.2*sin(7*pi*x) + 0.1*cos(19*x)', contorno: 'neumann', bordeU: '0', dominio: '0, 1', ritmo: 3 } },
  { t: 'Calor con fuente', s: { dim: 1, ecU: 'u_t = u_xx + 1', ecV: '', iniU: '0', contorno: 'dirichlet', bordeU: '0', dominio: '0, 1', ritmo: 0.1 } },
  { t: 'Contorno en t', s: { dim: 1, ecU: 'u_t = u_xx', ecV: '', iniU: '0', contorno: 'dirichlet', bordeU: 'if(x < 0.5, sin(4*t), 0)', dominio: '0, 1', ritmo: 0.5 } },
  { t: 'Poisson 1D', s: { dim: 1, ecU: 'u_xx = -1', ecV: '', iniU: '0', contorno: 'dirichlet', bordeU: '0', dominio: '0, 1' } },
  { t: 'Calor 2D', s: { dim: 2, ecU: 'u_t = lap(u)', ecV: '', iniU: `${G2('0.35', '0.4', '0.01')} + ${G2('0.7', '0.65', '0.005')}`, contorno: 'dirichlet', bordeU: '0', dominio: '0, 1', ritmo: 0.01 } },
  { t: 'Membrana', s: { dim: 2, ecU: 'u_tt = lap(u)', ecV: '', iniU: G2('0.4', '0.5', '0.003'), iniUt: '0', contorno: 'dirichlet', bordeU: '0', dominio: '0, 1', ritmo: 0.25 } },
  { t: 'Poisson 2D', s: { dim: 2, ecU: 'lap(u) = -10*' + G2('0.5', '0.5', '0.02'), ecV: '', iniU: '0', contorno: 'dirichlet', bordeU: '0', dominio: '0, 1' } },
  { t: 'Laplace, borde dado', s: { dim: 2, ecU: 'lap(u) = 0', ecV: '', iniU: '0', contorno: 'dirichlet', bordeU: 'sin(3*pi*x)*y + x*(1 - x)*(1 - y)', dominio: '0, 1' } },
  {
    t: 'Turing (Gray–Scott)',
    s: {
      dim: 2,
      ecU: 'u_t = du*lap(u) - u*v^2 + f*(1 - u)',
      ecV: 'v_t = dv*lap(v) + u*v^2 - (f + k)*v',
      parametros: 'du = 1, dv = 0.5, f = 0.037, k = 0.06',
      // una semilla cuadrada con algo de ruido: con una gaussiana suave el patrón no llega a prender
      iniU: `1 - 0.5*${CAJA}`,
      iniV: `0.25*${CAJA} + 0.02*sin(0.7*x)*sin(0.9*y)*if(x > 20 & x < 44 & y > 20 & y < 44, 1, 0)`,
      contorno: 'periodica',
      dominio: '0, 64',
      n: 65,
      ritmo: 150,
      ver: 'v',
    },
  },
  {
    t: 'Espiral (FitzHugh–Nagumo)',
    s: {
      dim: 2,
      ecU: 'u_t = lap(u) + u - u^3 - v',
      ecV: 'v_t = eps*(u - 0.5*v - 0.1)',
      parametros: 'eps = 0.05',
      // media línea excitada junto a una zona refractaria: el frente se enrosca en espiral
      iniU: 'if(x < 8 & y > 30, 1, -1)',
      iniV: 'if(y < 30, 0.4, -0.4)',
      contorno: 'neumann',
      bordeU: '0',
      bordeV: '0',
      dominio: '0, 60',
      n: 65,
      ritmo: 4,
      ver: 'u',
    },
  },
  {
    t: 'Manchas (Schnakenberg)',
    s: {
      dim: 2,
      ecU: 'u_t = lap(u) + a - u + u^2*v',
      ecV: 'v_t = d*lap(v) + b - u^2*v',
      parametros: 'a = 0.1, b = 0.9, d = 20',
      iniU: '1 + 0.1*sin(0.53*x)*cos(0.71*y) + 0.05*cos(1.3*x + 0.4*y)',
      iniV: '0.9',
      contorno: 'periodica',
      dominio: '0, 60',
      n: 65,
      ritmo: 3,
      ver: 'u',
    },
  },
]

/* ---------- configuración y simulación ---------- */

function dominio(src: string): [number, number] {
  const p = src.split(/[,;]/)
  if (p.length !== 2) throw new Error('el dominio se escribe «a, b»')
  const [a, b] = p.map((t) => compilar(t, [])())
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) throw new Error('el dominio tiene que ser a < b')
  return [a, b]
}

function config(s: S): ConfigEdp {
  return {
    dim: s.dim, ecU: s.ecU, ecV: s.ecV, parametros: s.parametros, iniU: s.iniU, iniUt: s.iniUt, iniV: s.iniV, iniVt: s.iniVt,
    contorno: s.contorno, bordeU: s.bordeU, bordeV: s.bordeV, x: dominio(s.dominio),
    // una malla de 1D en 2D serían 40 000 nodos: se recorta
    n: s.dim === 2 ? Math.min(s.n, 97) : s.n,
  }
}

const cacheProblema = new Map<string, { p: Problema | null; error: string | null }>()

function problema(s: S): { p: Problema | null; error: string | null } {
  const llave = JSON.stringify([s.dim, s.ecU, s.ecV, s.parametros, s.iniU, s.iniUt, s.iniV, s.iniVt, s.contorno, s.bordeU, s.bordeV, s.dominio, s.n])
  const hecho = cacheProblema.get(llave)
  if (hecho) return hecho
  let r: { p: Problema | null; error: string | null }
  try {
    r = { p: preparar(config(s)), error: null }
  } catch (e) {
    r = { p: null, error: (e as Error).message }
  }
  if (cacheProblema.size > 30) cacheProblema.delete(cacheProblema.keys().next().value!)
  cacheProblema.set(llave, r)
  return r
}

interface Corrida {
  firma: string
  sim: Sim
  pared: number | null
  /** Escala de color y de altura: sigue al máximo pero baja despacio, para que el decaimiento se vea. */
  rango: number[]
}

/** Una simulación por lienzo: en Comparar, cada lado lleva la suya. */
const corridas = new WeakMap<object, Corrida>()
let ultima: Corrida | null = null

function corrida(dueno: object, s: S): Corrida | null {
  const { p } = problema(s)
  if (!p) return null
  const firma = `${JSON.stringify(p.cfg)}|${s.reinicio}`
  let c = corridas.get(dueno)
  if (!c || c.firma !== firma) {
    const sim = p.estacionaria ? crearEstacionaria(p) : crearSim(p)
    c = { firma, sim, pared: null, rango: sim.u.map((a) => rangoDe(a, 1e-9)) }
    corridas.set(dueno, c)
  }
  ultima = c
  return c
}

function rangoDe(a: Float64Array, previo: number) {
  const [lo, hi] = extremos(a)
  return Math.max(previo, Math.abs(lo), Math.abs(hi), 1e-9)
}

/** Avanza lo que toca según el reloj de pared y el ritmo elegido. */
function mover(c: Corrida, s: S, pared: number) {
  const dtReal = c.pared === null ? 0 : Math.min(0.1, pared - c.pared)
  c.pared = pared
  if (!s.jugando) return
  if (c.sim.p.estacionaria) c.sim = avanzar(c.sim, 14)
  else c.sim = avanzar(c.sim, 22, c.sim.t + s.ritmo * dtReal)
  // baja un 1,5 % por fotograma como mucho: una onda que se reparte sigue viéndose y un calor que se apaga se ve apagarse
  c.rango = c.sim.u.map((a, k) => rangoDe(a, c.sim.p.estacionaria ? 1e-9 : 0.985 * (c.rango[k] ?? 1e-9)))
}

const conSigno = (a: Float64Array) => extremos(a)[0] < -1e-9 * rangoDe(a, 0)

function colorDe(v: number, R: number, signo: boolean, fuera: (u: number) => [number, number, number]): [number, number, number] {
  return signo ? divergente(v / R) : fuera(v / R)
}

/* ---------- panel ---------- */

function Panel({ s, set }: PropsPanel<S>) {
  const { p, error } = problema(s)
  const orden = (campo: 'u' | 'v') => p?.ecs.find((e) => e.campo === campo)?.orden ?? 1
  const vars = s.dim === 2 ? ['x', 'y'] : ['x']
  const params = (() => {
    try {
      return Object.keys(leerParametros(s.parametros))
    } catch {
      return []
    }
  })()
  const comprobarEc = (v: string, campo: 'u' | 'v') => {
    if (campo === 'v' && !v.trim()) return null
    try {
      preparar({ ...config(s), ecU: campo === 'u' ? v : s.ecU, ecV: campo === 'v' ? v : s.ecV })
      return null
    } catch (e) {
      return (e as Error).message
    }
  }
  const previa = (v: string) => {
    const t = expandir(v, s.dim)
    const i = t.indexOf('=')
    if (i < 0) return null
    const ctx = { variables: [...VARIABLES_EDP, ...params] }
    const a = aLatex(t.slice(0, i), ctx)
    const b = aLatex(t.slice(i + 1), ctx)
    return a && b ? `${a} = ${b}` : null
  }
  const expr = (etiqueta: string, valor: string, clave: keyof S, extra: string[] = []) => (
    <Expresion
      etiqueta={etiqueta}
      valor={valor}
      variables={[...vars, ...extra, ...params]}
      onChange={(v: string) => set({ [clave]: v } as Partial<S>)}
    />
  )
  const nuevo = (e: Ejemplo) =>
    set({ ecV: '', parametros: '', iniUt: '0', iniV: '0', iniVt: '0', bordeV: '0', ver: 'u', ...e.s, reinicio: s.reinicio + 1, jugando: true })

  return (
    <>
      <Grupo titulo="Ecuación">
        <Segmentado
          valor={s.dim}
          opciones={[
            { v: 1, t: '1D: u(x, t)' },
            { v: 2, t: '2D: u(x, y, t)' },
          ]}
          onChange={(dim) => set({ dim, n: dim === 2 ? 65 : 201 })}
        />
        <Expresion
          etiqueta=""
          valor={s.ecU}
          variables={['u_t', 'u_tt', 'u', 'u_x', 'u_xx', ...(s.dim === 2 ? ['u_y', 'u_yy', 'lap(u)'] : [])]}
          piezas={['=', 'sin(', 'exp(', '^', 'pi', ...params]}
          comprobar={(v) => comprobarEc(v, 'u')}
          previa={previa}
          onChange={(ecU: string) => set({ ecU })}
        />
        <Expresion
          etiqueta={s.ecV.trim() ? '' : 'v (opcional)'}
          valor={s.ecV}
          variables={['v_t', 'v', 'v_xx', 'u', ...(s.dim === 2 ? ['lap(v)'] : [])]}
          piezas={['=', '^', ...params]}
          comprobar={(v) => comprobarEc(v, 'v')}
          previa={previa}
          onChange={(ecV: string) => set({ ecV })}
        />
        <Nota>
          <b>u_t = …</b> (difusión, reacción, transporte), <b>u_tt = …</b> (ondas) o sin derivada en t (<b>estacionaria</b>:
          Poisson, Laplace). A la derecha valen x{s.dim === 2 ? ', y' : ''}, t, u y sus derivadas u_x, u_xx
          {s.dim === 2 ? ', u_y, u_yy, u_xy y lap(u)' : ''}; en las de onda también u_t. La segunda fila es opcional: un
          segundo campo v acoplado (reacción–difusión). Método de líneas: diferencias centradas de 2.º orden y RK4 con el
          paso de tiempo ajustado a la estabilidad.
        </Nota>
        <Expresion
          etiqueta="parámetros"
          valor={s.parametros}
          variables={[]}
          piezas={[' = ', ', ']}
          comprobar={(v) => {
            try {
              leerParametros(v)
              return null
            } catch (e) {
              return (e as Error).message
            }
          }}
          previa={() => null}
          onChange={(parametros: string) => set({ parametros })}
        />
        <Atajos opciones={EJEMPLOS.filter((e) => e.s.dim === s.dim).map((e) => ({ t: e.t, activo: s.ecU === e.s.ecU && s.iniU === e.s.iniU, onClick: () => nuevo(e) }))} />
      </Grupo>

      <Resultado />

      <Grupo titulo="Dominio y contorno">
        <Expresion
          etiqueta={s.dim === 2 ? 'x, y ∈' : 'x ∈'}
          valor={s.dominio}
          variables={[]}
          comprobar={(v) => {
            try {
              dominio(v)
              return null
            } catch (e) {
              return (e as Error).message
            }
          }}
          previa={(v) => {
            try {
              const [a, b] = dominio(v)
              return `[${+a.toFixed(4)}, ${+b.toFixed(4)}]${s.dim === 2 ? '^2' : ''}`
            } catch {
              return null
            }
          }}
          onChange={(dominio: string) => set({ dominio })}
        />
        <Segmentado
          columnas={3}
          valor={s.contorno}
          opciones={[
            { v: 'dirichlet', t: 'Dirichlet' },
            { v: 'neumann', t: 'Neumann' },
            { v: 'periodica', t: 'Periódica' },
          ]}
          onChange={(contorno) => set({ contorno })}
        />
        {s.contorno !== 'periodica' && expr(s.contorno === 'dirichlet' ? 'u =' : '∂u/∂n =', s.bordeU, 'bordeU', ['t'])}
        {s.contorno !== 'periodica' && s.ecV.trim() && expr(s.contorno === 'dirichlet' ? 'v =' : '∂v/∂n =', s.bordeV, 'bordeV', ['t'])}
        <Nota>
          El valor en el borde puede depender de x{s.dim === 2 ? ', y' : ''} y t. En Neumann es la derivada normal hacia fuera:
          0 es borde aislado.
        </Nota>
      </Grupo>

      <Grupo titulo="Condición inicial">
        {expr(p?.estacionaria ? 'u de partida =' : 'u(x, 0) =', s.iniU, 'iniU')}
        {orden('u') === 2 && expr('u_t(x, 0) =', s.iniUt, 'iniUt')}
        {s.ecV.trim() && expr('v(x, 0) =', s.iniV, 'iniV')}
        {s.ecV.trim() && orden('v') === 2 && expr('v_t(x, 0) =', s.iniVt, 'iniVt')}
      </Grupo>

      <Grupo titulo="Simulación">
        <div className="interruptores">
          <Interruptor activo={s.jugando} onChange={(jugando) => set({ jugando })}>
            En marcha
          </Interruptor>
        </div>
        <Boton onClick={() => set({ reinicio: s.reinicio + 1 })}>Reiniciar</Boton>
        {!p?.estacionaria && (
          <Rango
            etiqueta="Ritmo"
            valor={Math.log10(s.ritmo)}
            min={-3}
            max={3}
            paso={0.05}
            formato={(v) => `${+(10 ** v).toPrecision(2)} de t por segundo`}
            onChange={(v) => set({ ritmo: +(10 ** v).toPrecision(3) })}
          />
        )}
        <Segmentado
          columnas={3}
          valor={s.n}
          opciones={s.dim === 1 ? [{ v: 101, t: '101' }, { v: 201, t: '201' }, { v: 401, t: '401' }] : [{ v: 41, t: '41²' }, { v: 65, t: '65²' }, { v: 97, t: '97²' }]}
          onChange={(n) => set({ n })}
        />
        <Segmentado
          valor={s.vista}
          opciones={[
            { v: 'plano', t: s.dim === 1 ? 'Perfil y x–t' : 'Mapa de color' },
            { v: 'superficie', t: s.dim === 1 ? 'Superficie u(x, t)' : 'Superficie' },
          ]}
          onChange={(vista) => set({ vista })}
        />
        {s.ecV.trim() && s.dim === 2 && (
          <Segmentado
            valor={s.ver}
            opciones={[
              { v: 'u', t: 'ver u' },
              { v: 'v', t: 'ver v' },
            ]}
            onChange={(ver) => set({ ver })}
          />
        )}
        {error && <span className="aviso">{error}</span>}
      </Grupo>
    </>
  )
}

/* ---------- vistas ---------- */

const lienzos = new WeakMap<Pintor2D, HTMLCanvasElement>()

function imagen(g: Pintor2D, ancho: number, alto: number) {
  let c = lienzos.get(g)
  if (!c) {
    c = document.createElement('canvas')
    lienzos.set(g, c)
  }
  if (c.width !== ancho || c.height !== alto) {
    c.width = ancho
    c.height = alto
  }
  return c
}

/** Pinta una matriz de valores (fila 0 abajo) en el rectángulo del mundo [xa, xb]×[ya, yb]. */
function mapaDeCalor(g: Pintor2D, vals: (i: number, j: number) => number, nx: number, ny: number, R: number, signo: boolean, caja: [number, number, number, number]) {
  const c = imagen(g, nx, ny)
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(nx, ny)
  const fuera = mapa('altura')
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const [r, gg, b] = colorDe(vals(i, j), R, signo, fuera)
      const k = ((ny - 1 - j) * nx + i) * 4
      img.data[k] = r * 255
      img.data[k + 1] = gg * 255
      img.data[k + 2] = b * 255
      img.data[k + 3] = 255
    }
  ctx.putImageData(img, 0, 0)
  const [xa, xb, ya, yb] = caja
  g.ctx.imageSmoothingEnabled = true
  g.ctx.drawImage(c, g.X(xa), g.Y(yb), g.X(xb) - g.X(xa), g.Y(ya) - g.Y(yb))
}

const vistaPlano: Vista<S> = {
  tipo: '2d',
  clave: 'plano',
  navegable: false,
  animada: (s) => s.jugando,
  alPulsar(q, s) {
    const c = ultima
    if (!c) return
    const [a, b] = c.sim.p.cfg.x
    if (q.x < a || q.x > b) return
    if (c.sim.p.cfg.dim === 2 && (q.y < a || q.y > b)) return
    const k = s.ver === 'v' && c.sim.u.length > 1 ? 1 : 0
    gota(c.sim, q.x, c.sim.p.cfg.dim === 2 ? q.y : 0, k, 0.5 * c.rango[k])
    return { gotas: s.gotas + 1 }
  },
  dibujar(g, s, pared) {
    const { p, error } = problema(s)
    const c = corrida(g, s)
    if (!p || !c) {
      g.ventana = { x: [0, 1], y: [0, 1] }
      g.texto(error ?? 'no se entiende la ecuación', 0.03, 0.95, g.color('--pos'))
      return
    }
    mover(c, s, pared)
    const sim = c.sim
    const [a, b] = p.cfg.x
    const L = b - a

    if (p.cfg.dim === 2) {
      const k = s.ver === 'v' && sim.u.length > 1 ? 1 : 0
      // ventana cuadrada en píxeles, con el dominio centrado
      const asp = g.ancho / Math.max(1, g.alto)
      const m = 0.08 * L
      const alto = L + 2 * m
      const anchoW = Math.max(alto * asp, L + 2 * m)
      const altoW = anchoW / asp
      g.ventana = { x: [(a + b) / 2 - anchoW / 2, (a + b) / 2 + anchoW / 2], y: [(a + b) / 2 - altoW / 2, (a + b) / 2 + altoW / 2] }
      const arr = sim.u[k]
      const signo = conSigno(arr)
      const per = p.cfg.contorno === 'periodica'
      const hx = sim.hx
      mapaDeCalor(g, (i, j) => arr[j * sim.n + i], sim.n, sim.ny, c.rango[k], signo, [a - (per ? 0 : hx / 2), per ? b : b + hx / 2, a - (per ? 0 : hx / 2), per ? b : b + hx / 2])
      g.ejes({ etiquetaX: 'x', etiquetaY: 'y', rejilla: false })
      pie(g, sim, s)
      return
    }

    // 1D: arriba el perfil, abajo el diagrama x–t
    const R = Math.max(...c.rango)
    g.region(0, 0, 1, 0.56)
    g.ventana = { x: [a - 0.04 * L, b + 0.04 * L], y: [-1.15 * R, 1.15 * R] }
    const todoPositivo = sim.u.every((arr) => !conSigno(arr))
    if (todoPositivo && !p.estacionaria) g.ventana.y = [-0.12 * R, 1.15 * R]
    g.ejes({ etiquetaX: 'x', etiquetaY: 'u' })
    const colores = ['--accent', '--pos']
    const per = p.cfg.contorno === 'periodica'
    sim.u.forEach((arr, k) => {
      const pts: Array<[number, number]> = []
      for (let i = 0; i < sim.n; i++) pts.push([sim.xs[i], arr[i]])
      if (per) pts.push([b, arr[0]])
      g.curva(pts, g.color(colores[k]), 2.2)
    })
    pie(g, sim, s)
    g.finRegion()

    g.region(0, 0.6, 1, 0.4)
    const filas = sim.historia.length
    const t1 = Math.max(1e-9, sim.tiemposHistoria[filas - 1] ?? 0)
    g.ventana = { x: [a - 0.04 * L, b + 0.04 * L], y: [-0.06 * t1, 1.08 * t1] }
    if (filas > 1 && !p.estacionaria) {
      const signo = sim.historia.some((h) => conSigno(h))
      // una fila de la imagen por fila de la historia; el tiempo no es uniforme, así que se pinta por franjas
      const ancho = sim.n
      const cimg = imagen(g, ancho, 1)
      const ctx2 = cimg.getContext('2d')!
      const fuera = mapa('altura')
      for (let f = 0; f < filas; f++) {
        const img = ctx2.createImageData(ancho, 1)
        for (let i = 0; i < ancho; i++) {
          const [r, gg, bb] = colorDe(sim.historia[f][i], c.rango[0], signo, fuera)
          img.data[i * 4] = r * 255
          img.data[i * 4 + 1] = gg * 255
          img.data[i * 4 + 2] = bb * 255
          img.data[i * 4 + 3] = 255
        }
        ctx2.putImageData(img, 0, 0)
        const ta = sim.tiemposHistoria[f]
        const tb = f + 1 < filas ? sim.tiemposHistoria[f + 1] : ta + (t1 - (sim.tiemposHistoria[f - 1] ?? 0)) / Math.max(1, filas)
        const y0 = g.Y(ta)
        const y1 = g.Y(tb)
        g.ctx.imageSmoothingEnabled = false
        g.ctx.drawImage(cimg, g.X(a), Math.min(y0, y1) - 0.5, g.X(per ? b : sim.xs[sim.n - 1]) - g.X(a), Math.abs(y1 - y0) + 1)
      }
    }
    g.ejes({ etiquetaX: 'x', etiquetaY: 't', rejilla: false })
    if (p.estacionaria) g.texto('estacionaria: no hay evolución en t', a, 0.5 * t1, g.color('--ink-soft'), { dx: 8 })
    g.finRegion()
  },
}

/** Tiempo y estado, en una esquina del lienzo. */
function pie(g: Pintor2D, sim: Sim, s: S) {
  const [, x1] = g.ventana.x
  const [, y1] = g.ventana.y
  const texto = sim.roto
    ? sim.roto
    : sim.p.estacionaria
      ? sim.convergida
        ? `convergida en ${sim.pasos} iteraciones · malla ${sim.n}`
        : `iterando · malla ${sim.n} · residuo ${sim.residuo.toExponential(1)}`
      : `t = ${sim.t.toFixed(sim.t < 10 ? 3 : 1)}${s.jugando ? '' : ' · en pausa'}`
  const der = { dx: -14, alinea: 'right' as const }
  g.texto(texto, x1, y1, g.color(sim.roto ? '--neg' : '--ink-soft'), { ...der, dy: 18 })
  if (sim.p.aviso && !sim.roto) g.texto(sim.p.aviso, x1, y1, g.color('--neg'), { ...der, dy: 36 })
}

const NS = 72

const vistaSuperficie: Vista<S> = {
  tipo: '3d',
  clave: 'superficie',
  camara: { theta: 0.9, phi: 1.1, r: 3.4 },
  construir(e, s) {
    e.zArriba(true)
    const dos = s.dim === 2
    e.ejes(1.2, ['x', dos ? 'y' : 't', dos ? (s.ver === 'v' ? 'v' : 'u') : 'u'], { rejilla: true, paso: 0.4 })
    e.datos.sup = e.superficie(NS, NS)
    const c = corrida(e, s)
    if (c) pintarSuperficie(e, s, c)
  },
  animar(e, s, pared) {
    const c = corrida(e, s)
    if (!c) return
    mover(c, s, pared)
    if (s.jugando) pintarSuperficie(e, s, c)
  },
}

function pintarSuperficie(e: { datos: Record<string, any> }, s: S, c: Corrida) {
  const sim = c.sim
  const sup = e.datos.sup
  if (!sup) return
  const A = 0.6
  const fuera = mapa('altura')
  if (sim.p.cfg.dim === 2) {
    const k = s.ver === 'v' && sim.u.length > 1 ? 1 : 0
    const arr = sim.u[k]
    const R = c.rango[k]
    const signo = conSigno(arr)
    const muestra = (fx: number, fy: number) => {
      const i = Math.min(sim.n - 1, Math.round(fx * (sim.n - 1)))
      const j = Math.min(sim.ny - 1, Math.round(fy * (sim.ny - 1)))
      return arr[j * sim.n + i]
    }
    sup.actualizar((i: number, j: number) => {
      const v = muestra(i / (NS - 1), j / (NS - 1))
      return [(2 * i) / (NS - 1) - 1, (2 * j) / (NS - 1) - 1, (A * v) / R, colorDe(v, R, signo, fuera)]
    })
    return
  }
  // 1D: la historia entera como superficie sobre el plano (x, t)
  const h = sim.historia
  if (!h.length) return
  const R = c.rango[0]
  const signo = h.some((f) => conSigno(f))
  sup.actualizar((i: number, j: number) => {
    const f = h[Math.min(h.length - 1, Math.round((j / (NS - 1)) * (h.length - 1)))]
    const v = f[Math.min(sim.n - 1, Math.round((i / (NS - 1)) * (sim.n - 1)))]
    return [(2 * i) / (NS - 1) - 1, (2 * j) / (NS - 1) - 1, (A * v) / R, colorDe(v, R, signo, fuera)]
  })
}

/* ---------- el módulo ---------- */

const texEc = (src: string, dim: 1 | 2, params: string[]) => {
  const t = expandir(src, dim)
  const i = t.indexOf('=')
  if (i < 0) return null
  const ctx = { variables: [...VARIABLES_EDP, ...params] }
  const a = aLatex(t.slice(0, i), ctx)
  const b = aLatex(t.slice(i + 1), ctx)
  return a && b ? `${a} = ${b}` : null
}

export default definir<S>({
  id: 'edp-propia',
  area: 'edp',
  resumen: 'Escribe tu EDP: calor, ondas, transporte, reacción–difusión y Poisson en 1D y 2D',
  corto: 'Escribe tu EDP',
  titulo: 'Escribe tu <i>EDP</i>',
  entradilla: 'La ecuación, el contorno y el dato inicial, tal cual: la resuelve y la anima. Un clic deja caer una gota.',
  inicial: {
    dim: 1,
    ecU: 'u_t = 0.5*u_xx',
    ecV: '',
    parametros: '',
    iniU: 'sin(pi*x) + 0.5*sin(4*pi*x)',
    iniUt: '0',
    iniV: '0',
    iniVt: '0',
    contorno: 'dirichlet',
    bordeU: '0',
    bordeV: '0',
    dominio: '0, 1',
    n: 101,
    ritmo: 0.1,
    jugando: true,
    vista: 'plano',
    ver: 'u',
    reinicio: 0,
    gotas: 0,
  },
  Panel,
  resultadoEnPanel: true,
  rotulo: (s) => {
    const { p, error } = problema(s)
    if (!p) return { nombre: 'No se entiende', apunte: error ?? '' }
    const tipo = p.estacionaria ? 'estacionaria (elíptica)' : p.ecs.some((e) => e.orden === 2) ? 'de onda (orden 2 en t)' : 'de evolución (orden 1 en t)'
    return { nombre: `EDP ${p.cfg.dim}D ${tipo}`, apunte: `${p.ecs.length === 2 ? 'sistema de dos campos, ' : ''}contorno ${p.cfg.contorno}` }
  },
  formula: (s) => {
    const { p } = problema(s)
    if (!p) return []
    const params = Object.keys(p.params)
    const out: string[] = []
    for (const e of p.ecs) {
      const t = texEc(e.campo === 'u' ? s.ecU : s.ecV, s.dim, params)
      if (t) out.push(t)
    }
    return out
  },
  lecturasVivas: true,
  lecturas: (s) => {
    const { p, error } = problema(s)
    if (!p) return [['Estado', error ?? '—']]
    const c = ultima && ultima.sim.p === p ? ultima : null
    const f: Array<[string, string]> = []
    if (p.aviso) f.push(['Aviso', p.aviso])
    if (!c) return f
    const sim = c.sim
    if (sim.roto) f.push(['Estado', sim.roto])
    if (p.estacionaria) {
      f.push(['Iteraciones', String(sim.pasos)], ['Malla', `${sim.n}${p.cfg.dim === 2 ? '²' : ''} (de ${p.cfg.n})`], ['Residuo', sim.residuo.toExponential(2)])
      if (sim.convergida) f.push(['Estado', 'convergida'])
    } else f.push(['t', sim.t.toFixed(4)], ['Paso dt', sim.dt.toExponential(2)], ['Pasos', String(sim.pasos)])
    sim.u.forEach((arr, k) => {
      const [lo, hi] = extremos(arr)
      const n = p.ecs[k].campo
      f.push([`${n} mín / máx`, `${lo.toFixed(4)} / ${hi.toFixed(4)}`])
      f.push([`∫${n}`, integral(sim, k).toFixed(5)])
    })
    return f
  },
  leyenda: (s) => {
    const { p } = problema(s)
    if (s.dim === 1 && s.vista === 'plano')
      return (
        <>
          <Muestra color="var(--accent)">u(x, t)</Muestra>
          {p && p.ecs.length > 1 && <Muestra color="var(--pos)">v(x, t)</Muestra>}
          <span>abajo, el diagrama x–t</span>
        </>
      )
    return <span>{s.vista === 'plano' ? 'clic: gota en el campo' : 'arrastra para girar'}</span>
  },
  pista: 'Clic en el lienzo: añade una gota al campo',
  vista: (s) => (s.vista === 'superficie' ? vistaSuperficie : vistaPlano),
})
