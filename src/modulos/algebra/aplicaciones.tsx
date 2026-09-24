import * as THREE from 'three'
import { definir, type Asa, type PropsPanel } from '../../nucleo/tipos'
import { Atajos, Boton, Grupo, Interruptor, Matriz, Muestra, Nota, Rango, Segmentado } from '../../nucleo/controles'
import { aplicar, autovalores3, autovector, det, nucleo, raicesPolinomio, rango, traza } from '../../lib/matrices'
import { divergente } from '../../render/tema'

type Objeto = 'cubo' | 'esfera' | 'rejilla'

interface S {
  A: number[][]
  B: number[][]
  objeto: Objeto
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

const NU = 64
const NV = 64

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

function dibujarObjeto(e: any, M: number[][], objeto: Objeto, color: THREE.Color) {
  const T = (v: number[]) => aplicar(M, v) as [number, number, number]
  if (objeto === 'cubo') {
    const V: number[][] = []
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) V.push([x, y, z])
    for (let i = 0; i < 8; i++)
      for (let j = i + 1; j < 8; j++) {
        const d = V[i].reduce((acc, c, k) => acc + Math.abs(c - V[j][k]), 0)
        if (Math.abs(d - 2) < 1e-9) e.linea([T(V[i]), T(V[j])], color, 0.8)
      }
  } else if (objeto === 'esfera') {
    const sup = e.superficie(NU, NV, {})
    sup.actualizar((i: number, j: number) => {
      const u = (i / (NU - 1)) * Math.PI
      const v = (j / (NV - 1)) * 2 * Math.PI
      const q = T([Math.sin(u) * Math.cos(v), Math.sin(u) * Math.sin(v), Math.cos(u)])
      return [q[0], q[1], q[2], [color.r, color.g, color.b]]
    })
    ;(sup.malla.material as any).opacity = 0.42
    ;(sup.malla.material as any).transparent = true
  } else {
    const n = 9
    for (let k = 0; k < n; k++) {
      const a = -1 + (2 * k) / (n - 1)
      e.linea([T([-1, a, 0]), T([1, a, 0])], color, 0.7)
      e.linea([T([a, -1, 0]), T([a, 1, 0])], color, 0.7)
    }
  }
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
          columnas={3}
          valor={s.objeto}
          opciones={[
            { v: 'cubo', t: 'Cubo' },
            { v: 'esfera', t: 'Esfera' },
            { v: 'rejilla', t: 'Rejilla' },
          ]}
          onChange={(objeto) => set({ objeto })}
        />
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
      pista: 'Arrastra las columnas de A o los puntos · Mayús: en vertical · doble clic: punto nuevo',
    },
    construir(e, s) {
      e.zArriba(true)
      e.ejes(1.6, ['x', 'y', 'z'], { rejilla: true, infinita: true, planos: ['xy'], paso: 0.5 })
      const M = mezcla(s.A, s.t)
      const T = (v: number[]) => aplicar(M, v) as [number, number, number]
      const acento = e.color('--accent')

      if (s.objeto === 'cubo') {
        const V: number[][] = []
        for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) V.push([x, y, z])
        const aristas: Array<[number, number]> = []
        for (let i = 0; i < 8; i++)
          for (let j = i + 1; j < 8; j++) {
            const d = V[i].reduce((acc, c, k) => acc + Math.abs(c - V[j][k]), 0)
            if (Math.abs(d - 2) < 1e-9) aristas.push([i, j])
          }
        for (const [i, j] of aristas) e.linea([T(V[i]), T(V[j])], acento)
      } else if (s.objeto === 'esfera') {
        const sup = e.superficie(NU, NV, {})
        sup.actualizar((i, j) => {
          const u = (i / (NU - 1)) * Math.PI
          const v = (j / (NV - 1)) * 2 * Math.PI
          const p = [Math.sin(u) * Math.cos(v), Math.sin(u) * Math.sin(v), Math.cos(u)]
          const q = T(p)
          const estira = Math.hypot(...q) - 1
          return [q[0], q[1], q[2], divergente(Math.max(-1, Math.min(1, estira)))]
        })
      } else {
        const n = 9
        for (let k = 0; k < n; k++) {
          const a = -1 + (2 * k) / (n - 1)
          for (const [p1, p2] of [
            [[-1, a, 0], [1, a, 0]],
            [[a, -1, 0], [a, 1, 0]],
          ])
            e.linea([T(p1), T(p2)], acento, 0.85)
        }
      }

      if (s.verComparacion) dibujarObjeto(e, mezcla(s.B, s.t), s.objeto, e.color('--neg'))

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
