import * as THREE from 'three'
import { definir, type PropsPanel, type Vista } from '../../nucleo/tipos'
import { accion, capaFija, capaVer, casilla, radios } from '../../nucleo/menu'
import { Boton, Expresion, Grupo, Interruptor, Muestra, Nota, Rango, Segmentado, Resultado } from '../../nucleo/controles'
import { compilarSuave } from '../../lib/expresion'
import { besselJ, cerosBessel } from '../../lib/especiales'
import { construirRejilla, marching } from '../../lib/mallado'
import { crearReloj } from '../../lib/reloj'
import { divergente } from '../../render/tema'

type Dim = 1 | 2 | 3
type Inicial = 'pinzada' | 'gaussiana' | 'modo' | 'cuadrada' | 'propia'
type ContornoOnda = 'fijo-fijo' | 'libre-libre' | 'fijo-libre'
type Velocidad = 'reposo' | 'martillo' | 'propia'
type Forma = 'rectangular' | 'circular'
type Repr = 'iso' | 'cortes'

export interface EstadoOnda {
  dim: Dim
  // 1D
  inicial: Inicial
  contorno: ContornoOnda
  velocidad: Velocidad
  exprU0: string
  exprV0: string
  terminos: number
  x0: number
  verModos: boolean
  dalembert: boolean
  // 2D y 3D
  forma: Forma
  m: number
  n: number
  q: number
  ancho: number
  alto: number
  radio: number
  largoX: number
  largoY: number
  largoZ: number
  /** Alias histórico de alto/ancho conservado para estados guardados. */
  razon: number
  mezcla: number
  repr: Repr
  corte: number
  // comunes
  c: number
  jugando: boolean
  alambre: boolean
}

const L = 1
const reloj = crearReloj(0.45)

function anchoFisico(s: EstadoOnda) { return s.ancho ?? 1 }
function altoFisico(s: EstadoOnda) {
  return s.ancho === 1 && s.alto === 1 && s.razon !== 1 ? s.razon : s.alto ?? s.razon ?? 1
}
function radioFisico(s: EstadoOnda) { return s.radio ?? 1 }
function largoXFisico(s: EstadoOnda) { return s.largoX ?? 2 }
function largoYFisico(s: EstadoOnda) { return s.largoY ?? 2 }
function largoZFisico(s: EstadoOnda) { return s.largoZ ?? 2 }
function cajaNormalizada(s: EstadoOnda) {
  return largoXFisico(s) === 2 && largoYFisico(s) === 2 && largoZFisico(s) === 2
}

function modosDegenerados(s: EstadoOnda) {
  return s.forma === 'rectangular' && Math.abs(s.m / anchoFisico(s) - s.n / altoFisico(s)) < 1e-9
}

/* ---------------- 1D ---------------- */

/** u(x, 0). */
function perfil(s: EstadoOnda): (x: number) => number {
  if (s.inicial === 'pinzada') {
    const a = s.x0
    return (x) => (x <= a ? x / a : (L - x) / (L - a))
  }
  if (s.inicial === 'gaussiana') return (x) => Math.exp(-((x - s.x0) ** 2) / (2 * 0.06 ** 2))
  if (s.inicial === 'cuadrada') return (x) => (Math.abs(x - s.x0) < 0.12 ? 1 : 0)
  if (s.inicial === 'propia') return compilarSuave(s.exprU0, ['x']).f ?? (() => 0)
  return (x) => Math.sin((s.m * Math.PI * x) / L)
}

/** u_t(x, 0): la segunda condición inicial, que una ecuación de orden 2 en t necesita. */
function perfilVelocidad(s: EstadoOnda): (x: number) => number {
  if (s.velocidad === 'reposo') return () => 0
  if (s.velocidad === 'martillo') return (x) => (Math.abs(x - s.x0) < 0.05 ? 12 : 0)
  return compilarSuave(s.exprV0, ['x']).f ?? (() => 0)
}

/**
 * Modos propios de la cuerda según cómo estén sujetos los extremos. Cada
 * contorno tiene su propia base: senos, cosenos o senos de media onda.
 */
export function modos1d(s: EstadoOnda): Array<{ lambda: number; fi: (x: number) => number; norma: number }> {
  const out: Array<{ lambda: number; fi: (x: number) => number; norma: number }> = []
  if (s.contorno === 'libre-libre') {
    // el modo λ = 0 es la traslación rígida: su amplitud crece como A + B·t
    out.push({ lambda: 0, fi: () => 1, norma: 1 })
    for (let n = 1; n <= s.terminos; n++) {
      const l = (n * Math.PI) / L
      out.push({ lambda: l, fi: (x) => Math.cos(l * x), norma: 0.5 * L })
    }
  } else if (s.contorno === 'fijo-libre') {
    for (let n = 1; n <= s.terminos; n++) {
      const l = ((n - 0.5) * Math.PI) / L
      out.push({ lambda: l, fi: (x) => Math.sin(l * x), norma: 0.5 * L })
    }
  } else {
    for (let n = 1; n <= s.terminos; n++) {
      const l = (n * Math.PI) / L
      out.push({ lambda: l, fi: (x) => Math.sin(l * x), norma: 0.5 * L })
    }
  }
  return out
}

const memo1d = new Map<string, { A: number[]; B: number[] }>()

/** Proyecta u(x,0) y u_t(x,0) sobre la base propia: A_n del perfil, B_n de la velocidad. */
export function coeficientes(s: EstadoOnda): { A: number[]; B: number[] } {
  const clave = `${s.contorno}|${s.inicial}|${s.velocidad}|${s.exprU0}|${s.exprV0}|${s.m}|${s.x0.toFixed(3)}|${s.terminos}`
  const guardado = memo1d.get(clave)
  if (guardado) return guardado
  const modos = modos1d(s)
  const u0 = perfil(s)
  const v0 = perfilVelocidad(s)
  const N = 3000
  const A: number[] = []
  const B: number[] = []
  for (const { fi, norma } of modos) {
    let a = 0
    let b = 0
    // punto medio: sin sesgo en los extremos
    for (let i = 0; i < N; i++) {
      const x = (L * (i + 0.5)) / N
      const v = fi(x)
      a += u0(x) * v
      b += v0(x) * v
    }
    A.push(((a * L) / N) / norma)
    B.push(((b * L) / N) / norma)
  }
  const res = { A, B }
  if (memo1d.size > 60) memo1d.clear()
  memo1d.set(clave, res)
  return res
}

/** u(x, t) de la cuerda, con las dos condiciones iniciales y el contorno elegido. */
export function solucionCuerda(s: EstadoOnda) {
  const modos = modos1d(s)
  const { A, B } = coeficientes(s)
  return (x: number, t: number) =>
    modos.reduce((acc, { lambda, fi }, i) => {
      const w = s.c * lambda
      const temporal = w > 1e-12 ? A[i] * Math.cos(w * t) + (B[i] / w) * Math.sin(w * t) : A[i] + B[i] * t
      return acc + temporal * fi(x)
    }, 0)
}

/* ---------------- 2D y 3D ---------------- */

export function omega(s: EstadoOnda): number {
  if (s.dim === 1) return (Math.PI * s.c) / L
  if (s.dim === 3 && cajaNormalizada(s)) return s.c * Math.PI * Math.hypot(s.m, s.n, s.q)
  if (s.dim === 3) return s.c * Math.PI * Math.hypot(s.m / largoXFisico(s), s.n / largoYFisico(s), s.q / largoZFisico(s))
  if (s.forma === 'rectangular') return s.c * Math.PI * Math.hypot(s.m / anchoFisico(s), s.n / altoFisico(s))
  return (s.c * cerosBessel(s.m, s.n)[s.n - 1]) / radioFisico(s)
}

/** Parte espacial del modo, normalizada a amplitud 1. */
export function forma2d(s: EstadoOnda): (p: number, q: number) => number {
  if (s.forma === 'rectangular') {
    const base = (x: number, y: number) => Math.sin((s.m * Math.PI * x) / anchoFisico(s)) * Math.sin((s.n * Math.PI * y) / altoFisico(s))
    if (s.mezcla === 0 || !modosDegenerados(s)) return base
    const cruz = (x: number, y: number) => Math.sin((s.n * Math.PI * x) / anchoFisico(s)) * Math.sin((s.m * Math.PI * y) / altoFisico(s))
    return (x, y) => (1 - s.mezcla) * base(x, y) + s.mezcla * cruz(x, y)
  }
  const lam = cerosBessel(s.m, s.n)[s.n - 1]
  return (r, th) => besselJ(s.m, (lam * r) / radioFisico(s)) * Math.cos(s.m * th)
}

/** Modo de la caja, con coordenadas físicas centradas en el origen. */
export const forma3d = (s: EstadoOnda) => (x: number, y: number, z: number) =>
  (cajaNormalizada(s)
    ? Math.sin((s.m * Math.PI * (x + 1)) / 2) * Math.sin((s.n * Math.PI * (y + 1)) / 2) * Math.sin((s.q * Math.PI * (z + 1)) / 2)
    : Math.sin((s.m * Math.PI * (x + largoXFisico(s) / 2)) / largoXFisico(s)) *
  Math.sin((s.n * Math.PI * (y + largoYFisico(s) / 2)) / largoYFisico(s)) *
  Math.sin((s.q * Math.PI * (z + largoZFisico(s) / 2)) / largoZFisico(s)))

/* ---------------- panel ---------------- */

function Panel({ s, set }: PropsPanel<EstadoOnda>) {
  return (
    <>
      <Grupo titulo="Dimensiones">
        <Segmentado
          columnas={3}
          valor={s.dim}
          opciones={[
            { v: 1 as Dim, t: 'Cuerda 1D' },
            { v: 2 as Dim, t: 'Membrana 2D' },
            { v: 3 as Dim, t: 'Caja 3D' },
          ]}
          onChange={(dim) => set({ dim })}
        />
      </Grupo>

      <Resultado />

      {s.dim === 1 && (
        <>
          <Grupo titulo="Extremos de la cuerda">
            <Segmentado
              columnas={3}
              valor={s.contorno}
              opciones={[
                { v: 'fijo-fijo' as ContornoOnda, t: 'Fijo-fijo' },
                { v: 'fijo-libre' as ContornoOnda, t: 'Fijo-libre' },
                { v: 'libre-libre' as ContornoOnda, t: 'Libre-libre' },
              ]}
              onChange={(contorno) => set({ contorno, dalembert: contorno === 'fijo-fijo' && s.dalembert })}
            />
            <Nota>
              {s.contorno === 'fijo-fijo' ? (
                <>u(0)=u(L)=0. La base son los senos y las frecuencias van como <b>n</b>.</>
              ) : s.contorno === 'fijo-libre' ? (
                <>u(0)=0 y u_x(L)=0. La base son senos de <b>media onda</b>: las frecuencias van como n−½.</>
              ) : (
                <>u_x(0)=u_x(L)=0. La base son los cosenos, y el modo λ=0 deja que la cuerda <b>se traslade</b>.</>
              )}
            </Nota>
          </Grupo>

          <Grupo titulo="Condición inicial u(x, 0)">
            <Segmentado
              columnas={3}
              valor={s.inicial}
              opciones={[
                { v: 'pinzada' as Inicial, t: 'Pinzada' },
                { v: 'gaussiana' as Inicial, t: 'Gaussiana' },
                { v: 'cuadrada' as Inicial, t: 'Escalón' },
                { v: 'modo' as Inicial, t: 'Modo puro' },
                { v: 'propia' as Inicial, t: 'La mía' },
              ]}
              onChange={(inicial) => set({ inicial })}
            />
            {s.inicial === 'propia' ? (
              <Expresion etiqueta="u(x,0) =" valor={s.exprU0} variables={['x']} onChange={(exprU0: string) => set({ exprU0 })} />
            ) : s.inicial === 'modo' ? (
              <Rango etiqueta="Modo n" valor={s.m} min={1} max={12} paso={1} formato={(v) => `${v}`} onChange={(m) => set({ m })} />
            ) : (
              <Rango etiqueta="Posición x₀" valor={s.x0} min={0.08} max={0.92} paso={0.01} formato={(v) => v.toFixed(2)} onChange={(x0) => set({ x0 })} />
            )}
          </Grupo>

          <Grupo titulo="Condición inicial u_t(x, 0)">
            <Segmentado
              columnas={3}
              valor={s.velocidad}
              opciones={[
                { v: 'reposo' as Velocidad, t: 'En reposo' },
                { v: 'martillo' as Velocidad, t: 'Martillo' },
                { v: 'propia' as Velocidad, t: 'La mía' },
              ]}
              onChange={(velocidad) => set({ velocidad, dalembert: velocidad === 'reposo' && s.dalembert })}
            />
            {s.velocidad === 'propia' && (
              <Expresion etiqueta="u_t(x,0) =" valor={s.exprV0} variables={['x']} onChange={(exprV0: string) => set({ exprV0 })} />
            )}
            <Nota>
              Una ecuación de segundo orden en el tiempo necesita <b>dos</b> condiciones iniciales:
              la forma de partida y la velocidad con que sale.
            </Nota>
            <Rango etiqueta="Términos de la serie" valor={s.terminos} min={1} max={60} paso={1} formato={(v) => `${v}`} onChange={(terminos) => set({ terminos })} />
          </Grupo>
        </>
      )}

      {s.dim === 2 && (
        <Grupo titulo="Membrana">
          <Segmentado
            valor={s.forma}
            opciones={[
              { v: 'rectangular' as Forma, t: 'Rectangular' },
              { v: 'circular' as Forma, t: 'Circular' },
            ]}
            onChange={(forma) => set({ forma, m: forma === 'circular' ? 1 : 2, n: 1 })}
          />
          {s.forma === 'rectangular' ? (
            <>
              <Rango etiqueta="Ancho a" valor={anchoFisico(s)} min={0.5} max={6} paso={0.1} formato={(v) => v.toFixed(1)} onChange={(ancho) => set({ ancho, razon: altoFisico(s) / ancho })} />
              <Rango etiqueta="Alto b" valor={altoFisico(s)} min={0.5} max={6} paso={0.1} formato={(v) => v.toFixed(1)} onChange={(alto) => set({ alto, razon: alto / anchoFisico(s) })} />
            </>
          ) : (
            <Rango etiqueta="Radio R" valor={radioFisico(s)} min={0.5} max={5} paso={0.1} formato={(v) => v.toFixed(1)} onChange={(radio) => set({ radio })} />
          )}
          <Rango etiqueta={s.forma === 'circular' ? 'Orden m' : 'm'} valor={s.m} min={s.forma === 'circular' ? 0 : 1} max={6} paso={1} formato={(v) => `${v}`} onChange={(m) => set({ m })} />
          <Rango etiqueta={s.forma === 'circular' ? 'Cero n' : 'n'} valor={s.n} min={1} max={6} paso={1} formato={(v) => `${v}`} onChange={(n) => set({ n })} />
          {s.forma === 'rectangular' && (
            <>
              {modosDegenerados(s) ? (
                <Rango etiqueta="Mezcla con el modo (n, m)" valor={s.mezcla} min={0} max={1} paso={0.05} formato={(v) => v.toFixed(2)} onChange={(mezcla) => set({ mezcla })} />
              ) : (
                <Nota>La mezcla solo es un modo propio cuando ambos modos tienen la misma frecuencia. Iguala la geometría o los índices para activarla.</Nota>
              )}
            </>
          )}
        </Grupo>
      )}

      {s.dim === 3 && (
        <Grupo titulo="Modo de la caja">
          <Rango etiqueta="Largo x" valor={largoXFisico(s)} min={0.5} max={6} paso={0.1} formato={(v) => v.toFixed(1)} onChange={(largoX) => set({ largoX })} />
          <Rango etiqueta="Largo y" valor={largoYFisico(s)} min={0.5} max={6} paso={0.1} formato={(v) => v.toFixed(1)} onChange={(largoY) => set({ largoY })} />
          <Rango etiqueta="Largo z" valor={largoZFisico(s)} min={0.5} max={6} paso={0.1} formato={(v) => v.toFixed(1)} onChange={(largoZ) => set({ largoZ })} />
          <Rango etiqueta="m (eje x)" valor={s.m} min={1} max={5} paso={1} formato={(v) => `${v}`} onChange={(m) => set({ m })} />
          <Rango etiqueta="n (eje y)" valor={s.n} min={1} max={5} paso={1} formato={(v) => `${v}`} onChange={(n) => set({ n })} />
          <Rango etiqueta="p (eje z)" valor={s.q} min={1} max={5} paso={1} formato={(v) => `${v}`} onChange={(q) => set({ q })} />
          <Segmentado
            valor={s.repr}
            opciones={[
              { v: 'iso' as Repr, t: 'Isosuperficies' },
              { v: 'cortes' as Repr, t: 'Cortes' },
            ]}
            onChange={(repr) => set({ repr })}
          />
          {s.repr === 'cortes' && (
            <Rango etiqueta="Posición de los cortes" valor={s.corte} min={-0.9} max={0.9} paso={0.02} formato={(v) => v.toFixed(2)} onChange={(corte) => set({ corte })} />
          )}
        </Grupo>
      )}

      <Grupo titulo="Propagación">
        <Rango etiqueta="Velocidad c" valor={s.c} min={0.2} max={3} paso={0.1} formato={(v) => v.toFixed(1)} onChange={(c) => set({ c })} />
        <div className="interruptores">
          <Interruptor activo={s.jugando} onChange={(jugando) => set({ jugando })}>
            Animación
          </Interruptor>
          {s.dim === 1 && (
            <>
              <Interruptor activo={s.verModos} onChange={(verModos) => set({ verModos })}>
                Ver modos
              </Interruptor>
              {s.contorno === 'fijo-fijo' && s.velocidad === 'reposo' && (
                <Interruptor activo={s.dalembert} onChange={(dalembert) => set({ dalembert })}>
                  d'Alembert
                </Interruptor>
              )}
            </>
          )}
          {s.dim === 2 && (
            <Interruptor activo={s.alambre} onChange={(alambre) => set({ alambre })}>
              Malla
            </Interruptor>
          )}
          <Boton onClick={() => reloj.reiniciar()}>Reiniciar</Boton>
        </div>
      </Grupo>
    </>
  )
}

/* ---------------- vistas ---------------- */

const NU = 96
const NC = 64

const vista1d: Vista<EstadoOnda> = {
  tipo: '2d',
  clave: '1d',
  navegable: false,
  interaccion: {
    // x₀ se arrastra por un carril bajo la cuerda: la cuerda se mueve y el asa no debe saltar con ella
    asas: (s) =>
      ['pinzada', 'gaussiana', 'cuadrada'].includes(s.inicial) || s.velocidad === 'martillo'
        ? [{ id: 'x0', p: [s.x0, -1.35], color: '--pos', nombre: 'x₀', eje: 'x' as const }]
        : [],
    mover: (_id, t) => ({ x0: Math.round(Math.max(0.08, Math.min(0.92, t.p[0])) * 100) / 100 }),
  },
  animada: (s) => s.jugando,
  dibujar(g, s, pared) {
    const t = reloj.avanzar(pared, s.jugando)
    g.ventana = { x: [-0.08, 1.08], y: [-1.6, 1.6] }
    g.ejes({ etiquetaX: 'x', etiquetaY: 'u', paso: 0.25 })
    const suave = g.color('--ink-soft')
    const modos = modos1d(s)
    const { A, B } = coeficientes(s)
    const u = solucionCuerda(s)

    // los extremos: barra si está fijo, marca hueca si está libre
    const fijoIzq = s.contorno !== 'libre-libre'
    const fijoDer = s.contorno === 'fijo-fijo'
    for (const [x, fijo] of [
      [0, fijoIzq],
      [L, fijoDer],
    ] as const) {
      if (fijo) g.curva([[x, -1.4], [x, 1.4]], suave, 1.4)
      else {
        g.curva([[x, -1.4], [x, 1.4]], suave, 1, true)
        g.texto('libre', x, 1.45, suave, { dx: x === 0 ? 4 : -34 })
      }
    }

    // perfil de partida, de referencia
    const ini: Array<[number, number]> = []
    for (let i = 0; i <= 400; i++) ini.push([(L * i) / 400, u((L * i) / 400, 0)])
    g.curva(ini, suave, 1, true)

    if (s.verModos && !s.dalembert) {
      const neg = g.color('--aux')
      modos.forEach(({ lambda, fi }, k) => {
        if (Math.abs(A[k]) + Math.abs(B[k]) < 0.01) return
        const w = s.c * lambda
        const amp = w > 1e-12 ? A[k] * Math.cos(w * t) + (B[k] / w) * Math.sin(w * t) : A[k] + B[k] * t
        const pts: Array<[number, number]> = []
        for (let j = 0; j <= 200; j++) {
          const x = (L * j) / 200
          pts.push([x, amp * fi(x)])
        }
        g.curva(pts, neg, 1)
      })
    }

    if (s.dalembert) {
      const pos = g.color('--pos')
      const f = (x: number) => u(x, 0)
      const impar = (x: number) => {
        const y = ((x % (2 * L)) + 2 * L) % (2 * L)
        return y <= L ? f(y) : -f(2 * L - y)
      }
      for (const signo of [-1, 1]) {
        const pts: Array<[number, number]> = []
        for (let i = 0; i <= 500; i++) {
          const x = -0.08 + (1.16 * i) / 500
          pts.push([x, 0.5 * impar(x + signo * s.c * t)])
        }
        g.curva(pts, pos, 1.2)
      }
    }

    const pts: Array<[number, number]> = []
    for (let i = 0; i <= 700; i++) pts.push([(L * i) / 700, u((L * i) / 700, t)])
    g.curva(pts, g.color('--accent'), 2.6)
  },
}

function amplitudMaxima(s: EstadoOnda, f: (p: number, q: number) => number) {
  let mx = 0
  for (let i = 0; i < 64; i++)
    for (let j = 0; j < 64; j++) {
      const z = s.forma === 'rectangular' ? f((i / 63) * anchoFisico(s), (j / 63) * altoFisico(s)) : f((j / 63) * radioFisico(s), (i / 63) * 2 * Math.PI)
      mx = Math.max(mx, Math.abs(z))
    }
  return mx || 1
}

function pintar2d(e: any, s: EstadoOnda, fase: number) {
  const sup = e.datos.sup
  if (!sup) return
  const f = e.datos.f as (p: number, q: number) => number
  const amp = (e.datos.amp as number) || 1
  const A = 0.46
  const esc = Math.max(anchoFisico(s), altoFisico(s), 1e-6)
  sup.actualizar((i: number, j: number) => {
    const u = i / (NU - 1)
    const v = j / (NU - 1)
    if (s.forma === 'rectangular') {
      const x = u * anchoFisico(s)
      const y = v * altoFisico(s)
      const z = (f(x, y) / amp) * fase
      return [(2 * x - anchoFisico(s)) / esc, (2 * y - altoFisico(s)) / esc, z * A, divergente(z)]
    }
    const th = v * 2 * Math.PI
    const z = (f(u * radioFisico(s), th) / amp) * fase
    return [u * Math.cos(th), u * Math.sin(th), z * A, divergente(z)]
  })
}

const vista2d: Vista<EstadoOnda> = {
  tipo: '3d',
  clave: '2d',
  camara: { theta: 0.85, phi: 1.24, r: 3.1 },
  construir(e, s) {
    e.zArriba(true)
    e.ejes(1.2, ['x', 'y', 'z'], { rejilla: true, paso: 0.4 })
    e.datos.sup = e.superficie(NU, NU, { alambre: s.alambre })
    e.datos.f = forma2d(s)
    e.datos.w = omega(s)
    e.datos.amp = amplitudMaxima(s, e.datos.f)
    pintar2d(e, s, 1)
  },
  animar(e, s, pared) {
    const t = reloj.avanzar(pared, s.jugando)
    pintar2d(e, s, Math.cos(e.datos.w * t))
  },
}

const ARISTAS: Array<[number[], number[]]> = []
for (const a of [-1, 1]) for (const b of [-1, 1]) {
  ARISTAS.push([[-1, a, b], [1, a, b]], [[a, -1, b], [a, 1, b]], [[a, b, -1], [a, b, 1]])
}

/** Lleva una malla del cubo [−1,1]³ a la caja de semiejes hs; las normales, con la inversa. */
function estirar(pos: Float32Array, nor: Float32Array, hs: number[]) {
  for (let i = 0; i < pos.length; i += 3) {
    let l = 0
    for (let k = 0; k < 3; k++) {
      pos[i + k] *= hs[k]
      nor[i + k] /= hs[k]
      l += nor[i + k] ** 2
    }
    l = Math.sqrt(l) || 1
    for (let k = 0; k < 3; k++) nor[i + k] /= l
  }
}

const vista3d: Vista<EstadoOnda> = {
  tipo: '3d',
  clave: '3d',
  pesada: true,
  camara: { theta: 0.85, phi: 1.1, r: 4.2 },
  construir(e, s) {
    e.zArriba(true)
    // la caja se dibuja con sus proporciones: el lado más largo mide 2
    const Ls = [largoXFisico(s), largoYFisico(s), largoZFisico(s)]
    const Lmax = Math.max(...Ls)
    const hs = Ls.map((l) => l / Lmax)
    e.datos.hs = hs
    e.ejes(1.15, ['x', 'y', 'z'], { rejilla: true, paso: 0.4 })
    for (const [a, b] of ARISTAS) e.linea([a.map((c, k) => c * hs[k]) as [number, number, number], b.map((c, k) => c * hs[k]) as [number, number, number]], e.color('--ink-soft'), 0.4)
    const fFisica = forma3d(s)
    const f = (x: number, y: number, z: number) => fFisica(x * Ls[0] / 2, y * Ls[1] / 2, z * Ls[2] / 2)
    e.datos.w = omega(s)
    if (s.repr === 'iso') {
      const g = construirRejilla(f, 1, 48)
      // nivel bajo: se ciñe a las paredes y enseña la caja; nivel alto: los lóbulos
      for (const [nivel, opacidad] of [[0.16, 0.2], [0.55, 0.7]] as const)
        for (const [signo, color] of [
          [1, e.color('--pos')],
          [-1, e.color('--neg')],
        ] as const) {
          const m = marching(g, signo as number, nivel)
          estirar(m.pos, m.nor, hs)
          e.malla(m.pos, m.nor, color as THREE.Color, { opacidad })
        }
      return
    }
    // tres cortes ortogonales; solo cambia el color con el tiempo
    e.datos.f = f
    e.datos.cortes = [0, 1, 2].map(() => e.superficie(NC, NC, {}))
    pintarCortes(e, s, 1)
  },
  animar(e, s, pared) {
    const t = reloj.avanzar(pared, s.jugando)
    if (s.repr !== 'cortes') return
    pintarCortes(e, s, Math.cos(e.datos.w * t))
  },
}

function pintarCortes(e: any, s: EstadoOnda, fase: number) {
  const cortes = e.datos.cortes as Array<{ actualizar: (f: any) => void }> | undefined
  if (!cortes) return
  const f0 = e.datos.f as (x: number, y: number, z: number) => number
  const [hx, hy, hz] = (e.datos.hs as number[]) ?? [1, 1, 1]
  const a = s.corte
  // se muestrea en el cubo unidad y se coloca en la caja real
  const en = (x: number, y: number, z: number) => divergente(f0(x, y, z) * fase)
  const coord = (k: number) => -1 + (2 * k) / (NC - 1)
  cortes[0].actualizar((i: number, j: number) => {
    const x = coord(i)
    const y = coord(j)
    return [x * hx, y * hy, a * hz, en(x, y, a)]
  })
  cortes[1].actualizar((i: number, j: number) => {
    const x = coord(i)
    const z = coord(j)
    return [x * hx, a * hy, z * hz, en(x, a, z)]
  })
  cortes[2].actualizar((i: number, j: number) => {
    const y = coord(i)
    const z = coord(j)
    return [a * hx, y * hy, z * hz, en(a, y, z)]
  })
}

/* ---------------- módulo ---------------- */

export default definir<EstadoOnda>({
  id: 'onda',
  area: 'edp',
  resumen: 'Ecuación de onda en 1D, 2D y 3D',
  corto: 'Ecuación de onda',
  titulo: 'Ecuación de <i>onda</i>',
  entradilla: 'u_tt = c²Δu: la misma ecuación en una cuerda, una membrana y una caja, con sus dos condiciones iniciales.',
  inicial: {
    dim: 1, inicial: 'pinzada', contorno: 'fijo-fijo', velocidad: 'reposo',
    exprU0: 'exp(-40*(x-0.5)^2)', exprV0: 'sin(2*pi*x)',
    terminos: 24, x0: 0.3, verModos: true, dalembert: false,
    forma: 'rectangular', m: 3, n: 1, q: 1, ancho: 1, alto: 1, radio: 1, largoX: 2, largoY: 2, largoZ: 2, razon: 1, mezcla: 0, repr: 'iso', corte: 0,
    c: 1, jugando: true, alambre: false,
  },
  Panel,
  capas: (s) =>
    s.dim === 1
      ? [capaFija<EstadoOnda>('u', 'u(x, t)', '--accent'), capaVer(s, 'verModos', 'Modos por separado', '--aux'), capaVer(s, 'dalembert', "Ondas viajeras (d'Alembert)", '--pos')]
      : [capaFija<EstadoOnda>('pos', 'u > 0', '--pos'), capaFija<EstadoOnda>('neg', 'u < 0', '--neg'), ...(s.dim === 2 ? [capaVer(s, 'alambre', 'Malla de alambre', '--ink-soft')] : [])],
  menu: (s) => ({
    acciones: [
      casilla<EstadoOnda>('Reproducir', s.jugando, (jugando) => ({ jugando })),
      accion<EstadoOnda>('Reiniciar', () => {
        reloj.reiniciar()
      }),
      radios<EstadoOnda, Dim>('Dimensión', [{ v: 1, t: 'Cuerda 1D' }, { v: 2, t: 'Membrana 2D' }, { v: 3, t: 'Caja 3D' }], s.dim, (dim) => ({ dim })),
      ...(s.dim === 1
        ? [
            radios<EstadoOnda, ContornoOnda>('Extremos', [{ v: 'fijo-fijo', t: 'Fijo-fijo' }, { v: 'fijo-libre', t: 'Fijo-libre' }, { v: 'libre-libre', t: 'Libre-libre' }], s.contorno, (contorno) => ({ contorno })),
            radios<EstadoOnda, Inicial>('Forma inicial', [{ v: 'pinzada', t: 'Pinzada' }, { v: 'gaussiana', t: 'Gaussiana' }, { v: 'cuadrada', t: 'Escalón' }, { v: 'modo', t: 'Modo puro' }, { v: 'propia', t: 'La mía' }], s.inicial, (inicial) => ({ inicial })),
            radios<EstadoOnda, Velocidad>('Velocidad inicial', [{ v: 'reposo', t: 'En reposo' }, { v: 'martillo', t: 'Martillo' }, { v: 'propia', t: 'La mía' }], s.velocidad, (velocidad) => ({ velocidad })),
          ]
        : s.dim === 2
          ? [radios<EstadoOnda, Forma>('Membrana', [{ v: 'rectangular', t: 'Rectangular' }, { v: 'circular', t: 'Circular' }], s.forma, (forma) => ({ forma }))]
          : [radios<EstadoOnda, Repr>('Representación', [{ v: 'iso', t: 'Isosuperficies' }, { v: 'cortes', t: 'Cortes' }], s.repr, (repr) => ({ repr }))]),
    ],
  }),
  resultadoEnPanel: true,
  lecturasVivas: true,
  rotulo: (s) =>
    s.dim === 1
      ? {
          nombre: 'Cuerda',
          apunte: s.dalembert
            ? "d'Alembert: dos ondas viajeras"
            : `${s.contorno}, ${s.velocidad === 'reposo' ? 'soltada en reposo' : 'con velocidad inicial'}`,
        }
      : s.dim === 2
        ? {
            nombre: s.forma === 'rectangular' ? `Modo (${s.m}, ${s.n})` : `Modo J<sub>${s.m}</sub>, cero ${s.n}`,
            apunte: s.forma === 'rectangular' ? 'rectángulo con borde fijo' : 'disco con borde fijo',
          }
        : { nombre: `Modo (${s.m}, ${s.n}, ${s.q})`, apunte: 'caja con las paredes fijas' },
  formula: (s) =>
    s.dim === 1
      ? s.dalembert
        ? [
            String.raw`u(x,t)=\tfrac12\big[\tilde f(x-ct)+\tilde f(x+ct)\big]`,
            String.raw`\tilde f = \text{extensión impar } 2L\text{-periódica de } u(x,0)`,
          ]
        : [
            String.raw`u=\sum_n \left[A_n\cos(c\lambda_n t)+\frac{B_n}{c\lambda_n}\sin(c\lambda_n t)\right]\varphi_n(x)`,
            s.contorno === 'fijo-fijo'
              ? String.raw`\varphi_n=\sin(\lambda_n x),\quad \lambda_n=\frac{n\pi}{L}`
              : s.contorno === 'fijo-libre'
                ? String.raw`\varphi_n=\sin(\lambda_n x),\quad \lambda_n=\frac{(n-\frac12)\pi}{L}`
                : String.raw`\varphi_0=1,\ \varphi_n=\cos(\lambda_n x),\quad \lambda_n=\frac{n\pi}{L}`,
            String.raw`A_n=\frac{\langle u(\cdot,0),\varphi_n\rangle}{\|\varphi_n\|^2},\qquad B_n=\frac{\langle u_t(\cdot,0),\varphi_n\rangle}{\|\varphi_n\|^2}`,
          ]
      : s.dim === 2
        ? s.forma === 'rectangular'
          ? [
              String.raw`u_{mn}=\sin\frac{m\pi x}{a}\sin\frac{n\pi y}{b}\cos(\omega t)`,
              String.raw`\omega_{mn}=c\pi\sqrt{\left(\tfrac{m}{a}\right)^2+\left(\tfrac{n}{b}\right)^2}`,
            ]
          : [
              String.raw`u_{mn}=J_m\!\left(\tfrac{\lambda_{mn}r}{R}\right)\cos(m\theta)\cos(\omega t)`,
              String.raw`\omega_{mn}=\tfrac{c\lambda_{mn}}{R},\qquad J_m(\lambda_{mn})=0`,
            ]
        : [
            String.raw`u_{mnp}=\sin(m\pi x)\sin(n\pi y)\sin(p\pi z)\cos(\omega t)`,
            String.raw`\omega_{mnp}=c\pi\sqrt{m^2+n^2+p^2}`,
          ],
  lecturas: (s) => {
    const w = omega(s)
    const filas: Array<[string, string]> = [
      ['t', reloj.t.toFixed(2)],
      ['Frecuencia ω', w.toFixed(4)],
      ['Periodo T', ((2 * Math.PI) / w).toFixed(4)],
    ]
    if (s.dim === 1) {
      const modos = modos1d(s)
      const { A, B } = coeficientes(s)
      filas.push([
        'Extremos',
        s.contorno === 'fijo-fijo' ? 'fijo-fijo' : s.contorno === 'fijo-libre' ? 'fijo-libre' : 'libre-libre',
      ])
      filas.push(['A₁', A[0]?.toFixed(4) ?? '—'])
      filas.push(['A₂', A[1]?.toFixed(4) ?? '—'])
      if (s.velocidad !== 'reposo') {
        filas.push(['B₁', B[0]?.toFixed(4) ?? '—'])
        filas.push(['B₂', B[1]?.toFixed(4) ?? '—'])
      }
      // energía de cada modo ∝ (λ_n A_n)² + B_n²
      const energias = modos.map(({ lambda }, i) => (lambda * A[i]) ** 2 + B[i] ** 2)
      const tot = energias.reduce((a, b) => a + b, 0)
      if (tot > 0) {
        const mejor = energias.indexOf(Math.max(...energias))
        filas.push(['Modo dominante', `${mejor + (s.contorno === 'libre-libre' ? 0 : 1)} (${((energias[mejor] / tot) * 100).toFixed(1)} %)`])
      }
      if (s.contorno === 'libre-libre') filas.push(['Deriva del centro de masas', `${B[0].toFixed(4)} · t`])
    } else if (s.dim === 2) {
      if (s.forma === 'rectangular') {
        filas.push(['ω / ω₁₁', (w / (s.c * Math.PI * Math.hypot(1 / anchoFisico(s), 1 / altoFisico(s)))).toFixed(4)])
        filas.push(['Líneas nodales', `${s.m - 1} + ${s.n - 1}`])
        if (Math.abs(anchoFisico(s) - altoFisico(s)) < 1e-6 && s.m !== s.n) filas.push(['Degeneración', '(m,n) y (n,m)'])
      } else {
        const lam = cerosBessel(s.m, s.n)[s.n - 1]
        filas.push(['Cero λ', lam.toFixed(5)])
        filas.push(['Círculos nodales', `${s.n - 1}`])
        filas.push(['Diámetros nodales', `${s.m}`])
      }
    } else {
      const q = s.m ** 2 + s.n ** 2 + s.q ** 2
      let deg = 0
      for (let a = 1; a <= 9; a++)
        for (let b = 1; b <= 9; b++)
          for (let c = 1; c <= 9; c++) if (a * a + b * b + c * c === q) deg++
      filas.push(['m²+n²+p²', `${q}`])
      filas.push(['ω / ω₁₁₁', Math.sqrt(q / 3).toFixed(4)])
      filas.push(['Degeneración', `${deg}`])
      filas.push(['Planos nodales', `${s.m - 1 + s.n - 1 + s.q - 1}`])
    }
    return filas
  },
  leyenda: (s) =>
    s.dim === 1 ? (
      <>
        <Muestra color="var(--accent)">u(x, t)</Muestra>
        {s.verModos && <Muestra color="var(--aux)">modos por separado</Muestra>}
        {s.dalembert && <Muestra color="var(--pos)">ondas viajeras</Muestra>}
      </>
    ) : (
      <>
        <Muestra color="var(--pos)">u &gt; 0</Muestra>
        <Muestra color="var(--neg)">u &lt; 0</Muestra>
        <span>{s.dim === 3 && s.repr === 'iso' ? 'isosuperficies del modo' : 'gris = nodos'}</span>
      </>
    ),
  vista: (s) => (s.dim === 1 ? vista1d : s.dim === 2 ? vista2d : vista3d),
})
