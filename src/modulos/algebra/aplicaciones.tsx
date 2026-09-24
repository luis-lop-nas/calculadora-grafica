import * as THREE from 'three'
import { definir, type Asa, type ObjetoMovible, type PropsPanel } from '../../nucleo/tipos'
import { Atajos, Boton, Grupo, Interruptor, Matriz, Muestra, Nota, Rango, Segmentado } from '../../nucleo/controles'
import { aplicar, autovalores3, autovector, det, nucleo, raicesPolinomio, rango, traza } from '../../lib/matrices'
import { FIGURAS, lineasDe, type Figura } from '../../lib/figuras3d'

type Objeto = Figura

interface S {
  A: number[][]
  B: number[][]
  objeto: Objeto
  /** Posición y giro de la figura en el dominio (antes de aplicar A): v ↦ figRot·v + figPos. */
  figPos?: number[]
  figRot?: number[][]
  t: number
  verComparacion: boolean
  verAutovectores: boolean
  verBase: boolean
  /** Puntos del dominio que se siguen hasta su imagen. */
  X: number[][]
}

const PRESETS: Array<{ t: string; A: number[][] }> = [
  { t: 'Identidad', A: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] },
  { t: 'Giro 45° en z', A: [[0.707, -0.707, 0], [0.707, 0.707, 0], [0, 0, 1]] },
  { t: 'Cizalla', A: [[1, 0.8, 0], [0, 1, 0], [0, 0, 1]] },
  { t: 'Proyección xy', A: [[1, 0, 0], [0, 1, 0], [0, 0, 0]] },
  { t: 'Reflexión', A: [[1, 0, 0], [0, 1, 0], [0, 0, -1]] },
  { t: 'Rango 1', A: [[1, 1, 1], [1, 1, 1], [1, 1, 1]] },
  { t: 'Estira z', A: [[0.6, 0, 0], [0, 0.6, 0], [0, 0, 2]] },
]


/** Interpola entre la identidad y A, para ver la deformación como movimiento. */
function mezcla(A: number[][], t: number): number[][] {
  return A.map((f, i) => f.map((v, j) => (i === j ? 1 : 0) * (1 - t) + v * t))
}

const SUB = '₀₁₂₃₄₅₆₇₈₉'
const sub = (n: number) => String(n).split('').map((d) => SUB[+d]).join('')
const redondo = (p: number[]) => p.map((c) => Math.round(c * 100) / 100)

/** Cramer: x tal que M·x = b, o null si M es singular. */
function resolver(M: number[][], b: number[]): number[] | null {
  const d = det(M)
  if (Math.abs(d) < 1e-6) return null
  return [0, 1, 2].map((k) => det(M.map((f, i) => f.map((v, j) => (j === k ? b[i] : v)))) / d)
}

function asas(s: S): Asa[] {
  const M = mezcla(s.A, s.t)
  const out: Asa[] = []
  // la columna i de A es A·eᵢ: arrastrar su punta reescribe la matriz
  if (s.verBase && s.t > 0.05)
    for (let i = 0; i < 3; i++) out.push({ id: `E${i}`, p: M.map((f) => f[i]), color: '--pos' })
  const invertible = Math.abs(det(M)) > 1e-6
  s.X.forEach((x, i) => {
    out.push({ id: `X${i}`, p: x, color: '--ink' })
    if (invertible) out.push({ id: `Y${i}`, p: aplicar(M, x), color: '--accent' })
  })
  return out
}

function mover(id: string, p: number[], s: S): Partial<S> | void {
  const k = +id.slice(1)
  const q = redondo(p)
  if (id[0] === 'E') {
    // M = (1−t)·I + t·A  ⇒  columna de A = (q − (1−t)·eₖ) / t
    const col = q.map((c, i) => Math.round(((c - (i === k ? 1 - s.t : 0)) / s.t) * 100) / 100)
    return { A: s.A.map((f, i) => f.map((v, j) => (j === k ? col[i] : v))) }
  }
  if (id[0] === 'X') return { X: s.X.map((x, i) => (i === k ? q : x)) }
  // mover la imagen es resolver A·x = y
  const x = resolver(mezcla(s.A, s.t), p)
  if (x) return { X: s.X.map((v, i) => (i === k ? redondo(x) : v)) }
}

const I3 = () => [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
const pos = (s: S) => s.figPos ?? [0, 0, 0]
const rot = (s: S) => s.figRot ?? I3()
const producto = (P: number[][], Q: number[][]) => P.map((f) => [0, 1, 2].map((j) => f[0] * Q[0][j] + f[1] * Q[1][j] + f[2] * Q[2][j]))
/** Giro de ángulo a alrededor del eje k (0 x, 1 y, 2 z). */
function giro(k: number, a: number): number[][] {
  const [c, n] = [Math.cos(a), Math.sin(a)]
  const [i, j] = [0, 1, 2].filter((m) => m !== k)
  const R = I3()
  R[i][i] = c
  R[i][j] = -n
  R[j][i] = n
  R[j][j] = c
  return R
}
/** Punto de la figura colocado en el dominio: figRot·v + figPos. */
const colocar = (s: S, v: number[]) => {
  const [R, p] = [rot(s), pos(s)]
  return [0, 1, 2].map((i) => R[i][0] * v[0] + R[i][1] * v[1] + R[i][2] * v[2] + p[i])
}

/** La figura en alambre, colocada y con cada punto pasado por M: así se ven todas como el cubo. */
function dibujarObjeto(e: any, M: number[][], s: S, color: THREE.Color, opacidad = 1) {
  for (const l of lineasDe(s.objeto)) e.linea(l.map((v) => aplicar(M, colocar(s, v)) as [number, number, number]), color, opacidad)
}

/** La figura se agarra entera: ⌘+arrastrar la mueve y R la gira (en el dominio, antes de deformarla). */
const objetoMovible: ObjetoMovible<S> = {
  nombre: 'figura',
  caja(s) {
    const M = mezcla(s.A, s.t)
    const min = [Infinity, Infinity, Infinity]
    const max = [-Infinity, -Infinity, -Infinity]
    for (const l of lineasDe(s.objeto))
      for (const v of l) {
        const q = aplicar(M, colocar(s, v))
        for (let i = 0; i < 3; i++) {
          if (q[i] < min[i]) min[i] = q[i]
          if (q[i] > max[i]) max[i] = q[i]
        }
      }
    return Number.isFinite(min[0]) ? { min, max } : null
  },
  centro: (s) => aplicar(mezcla(s.A, s.t), pos(s)),
  trasladar(d, s) {
    // lo que se ve se desplaza d: en el dominio es M⁻¹·d (si M aplasta, se mueve lo que se pueda)
    const M = mezcla(s.A, s.t)
    const D = resolver(M, d) ?? d
    return { figPos: pos(s).map((c, i) => Math.round((c + D[i]) * 1e4) / 1e4) }
  },
  girar: (eje, a, s) => ({ figRot: producto(giro('xyz'.indexOf(eje), a), rot(s)) }),
}

function Panel({ s, set }: PropsPanel<S>) {
  return (
    <>
      <Grupo titulo="Matriz de la aplicación">
        <Matriz A={s.A} onChange={(A: number[][]) => set({ A })} />
        <Atajos
          opciones={PRESETS.map((p) => ({
            t: p.t,
            activo: JSON.stringify(p.A) === JSON.stringify(s.A),
            onClick: () => set({ A: p.A.map((f) => f.slice()) }),
          }))}
        />
      </Grupo>

      <Grupo titulo="Puntos y su imagen">
        {s.X.length ? (
          <>
            <Matriz
              A={s.X}
              onChange={(X: number[][]) => set({ X })}
              paso={0.1}
              filas={s.X.map((_, i) => ({ nombre: `x${sub(i + 1)}`, color: 'var(--ink)' }))}
              quitar={(i) => set({ X: s.X.filter((_, k) => k !== i) })}
            />
            <div className="interruptores">
              <Boton onClick={() => set({ X: [] })}>Quitar todos</Boton>
            </div>
          </>
        ) : null}
        <Nota>
          Doble clic en el suelo pone un punto x y su imagen A·x. Arrastra x o arrastra A·x: si A es
          invertible, x se recalcula resolviendo el sistema. Las puntas de A·e₁, A·e₂ y A·e₃ son las columnas de A: arrástralas y la matriz cambia.
        </Nota>
      </Grupo>

      <Grupo titulo="Qué se deforma">
        <Segmentado
          valor={s.objeto}
          opciones={(Object.keys(FIGURAS) as Figura[]).map((v) => ({ v, t: FIGURAS[v].t }))}
          onChange={(objeto) => set({ objeto })}
        />
        {(s.figPos || s.figRot) && (
          <div className="interruptores">
            <Boton onClick={() => set({ figPos: undefined, figRot: undefined })}>Recolocar la figura</Boton>
          </div>
        )}
        <Rango
          etiqueta="Deformación"
          valor={s.t}
          min={0}
          max={1}
          paso={0.01}
          formato={(v) => `${Math.round(v * 100)} %`}
          onChange={(t) => set({ t })}
        />
        <Interruptor activo={s.verComparacion} onChange={(verComparacion) => set({ verComparacion })}>
          Comparar con B
        </Interruptor>
        {s.verComparacion && <Matriz A={s.B} onChange={(B: number[][]) => set({ B })} paso={0.1} />}
        <div className="interruptores">
          <Interruptor activo={s.verBase} onChange={(verBase) => set({ verBase })}>
            Imagen de la base
          </Interruptor>
          <Interruptor activo={s.verAutovectores} onChange={(verAutovectores) => set({ verAutovectores })}>
            Autovectores
          </Interruptor>
        </div>
      </Grupo>
    </>
  )
}

export default definir<S>({
  id: 'aplicaciones',
  area: 'algebra',
  resumen: 'Aplicaciones lineales en R³',
  corto: 'Aplicaciones lineales',
  titulo: 'Aplicaciones <i>lineales</i>',
  entradilla: 'Una matriz es lo que le hace al espacio: mira cómo deforma el objeto.',
  inicial: {
    A: [[1, 0.8, 0], [0, 1, 0], [0, 0, 1]],
    B: [[1, 0, 0], [0, 1, 0.6], [0, 0, 1]],
    objeto: 'cubo',
    t: 1,
    verComparacion: false,
    verAutovectores: true,
    verBase: true,
    X: [],
  },
  Panel,
  comparaciones: [{ t: 'Dominio ↔ imagen', a: { t: 0 }, b: { t: 1 } }],
  rotulo: (s) => {
    const r = rango(s.A)
    const d = det(s.A)
    return {
      nombre: r === 3 ? 'Isomorfismo' : r === 2 ? 'Aplasta a un plano' : r === 1 ? 'Aplasta a una recta' : 'Aplasta al origen',
      apunte: `rango ${r}, det ${d.toFixed(3)}`,
    }
  },
  formula: (s) => [
    String.raw`A=\begin{pmatrix}${s.A.map((f) => f.map((v) => v.toFixed(2)).join(' & ')).join(' \\\\ ')}\end{pmatrix}`,
    String.raw`\dim\ker A + \operatorname{rg} A = 3`,
    String.raw`\operatorname{vol}(A\,C)=|\det A|\cdot\operatorname{vol}(C)`,
  ],
  lecturas: (s) => {
    const d = det(s.A)
    const r = rango(s.A)
    const ker = nucleo(s.A)
    const lam = autovalores3(s.A)
    const filas: Array<[string, string]> = [
      ['Determinante', d.toFixed(5)],
      ['Traza', traza(s.A).toFixed(5)],
      ['Rango', `${r}`],
      ['dim ker', `${3 - r}`],
      ['Orientación', d > 1e-9 ? 'se conserva' : d < -1e-9 ? 'se invierte' : 'se pierde'],
    ]
    lam.forEach((l, i) => filas.push([`λ${i + 1} (real)`, l.toFixed(5)]))
    if (lam.length < 3) {
      // polinomio característico λ³ − tr λ² + c₁ λ − det, con c₁ la suma de los menores principales 2×2
      const A = s.A
      const c1 = A[0][0] * A[1][1] - A[0][1] * A[1][0] + A[0][0] * A[2][2] - A[0][2] * A[2][0] + A[1][1] * A[2][2] - A[1][2] * A[2][1]
      const par = raicesPolinomio([-d, c1, -traza(A), 1]).filter(([, im]) => im > 1e-9)[0]
      if (par) {
        const [re, im] = par
        filas.push(
          ['λ complejos', `${re.toFixed(5)} ± ${im.toFixed(5)}i`],
          ['En su plano invariante', `gira ${((Math.atan2(im, re) * 180) / Math.PI).toFixed(2)}° y escala × ${Math.hypot(re, im).toFixed(5)}`],
        )
      }
    }
    ker.forEach((v, i) => filas.push([`ker ${i + 1}`, `(${v.map((c) => c.toFixed(2)).join(', ')})`]))
    return filas
  },
  leyenda: (s) => (
    <>
      <Muestra color="var(--accent)">objeto deformado</Muestra>
      {s.verBase && <Muestra color="var(--pos)">A·e₁, A·e₂, A·e₃</Muestra>}
      {s.verAutovectores && <Muestra color="var(--neg)">autovectores (direcciones fijas)</Muestra>}
    </>
  ),
  vista: {
    tipo: '3d',
    camara: { theta: 0.8, phi: 1.12, r: 6.2 },
    interaccion: {
      asas,
      mover: (id, t, s) => mover(id, t.p, s),
      anadir: (t, s) => ({ X: [...s.X, redondo(t.p)] }),
      quitar: (id, s) => (id[0] === 'E' ? undefined : { X: s.X.filter((_, i) => i !== +id.slice(1)) }),
      objeto: objetoMovible,
      pista: 'Arrastra las columnas de A o los puntos (⌥: en vertical) · ⌘+arrastrar mueve la figura · R la gira · Mayús: ejes y pasos · X/Y/Z/0: vista',
    },
    construir(e, s) {
      e.zArriba(true)
      e.ejes(1.6, ['x', 'y', 'z'], { rejilla: true, infinita: true, planos: ['xy'], paso: 0.5 })
      const M = mezcla(s.A, s.t)
      const T = (v: number[]) => aplicar(M, v) as [number, number, number]
      const acento = e.color('--accent')

      dibujarObjeto(e, M, s, acento)

      if (s.verComparacion) dibujarObjeto(e, mezcla(s.B, s.t), s, e.color('--neg'))

      if (s.verBase) {
        const pos = e.color('--pos')
        for (const b of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) e.flecha(T(b), pos)
      }

      s.X.forEach((x, i) => {
        const y = T(x)
        e.linea([x as [number, number, number], y], e.color('--ink-soft'), 0.6)
        if (Math.abs(det(M)) <= 1e-6) e.punto(y, acento, 0.03)
        e.rotulo(`x${sub(i + 1)}`, [x[0] + 0.1, x[1] + 0.1, x[2] + 0.12], 0.2)
        e.rotulo(`Ax${sub(i + 1)}`, [y[0] + 0.12, y[1] + 0.12, y[2] + 0.12], 0.26)
      })

      if (s.verAutovectores) {
        const neg = e.color('--neg')
        for (const l of autovalores3(s.A)) {
          const v = autovector(s.A, l)
          if (!v) continue
          const k = 1.5
          e.linea([[-v[0] * k, -v[1] * k, -v[2] * k], [v[0] * k, v[1] * k, v[2] * k]], neg)
          e.flecha([v[0] * l, v[1] * l, v[2] * l] as [number, number, number], neg)
        }
      }
    },
  },
})
