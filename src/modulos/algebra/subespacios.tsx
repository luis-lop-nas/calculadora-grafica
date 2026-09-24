import { definir, type Asa, type PropsPanel } from '../../nucleo/tipos'
import { Boton, Grupo, Interruptor, Matriz, Muestra, Nota } from '../../nucleo/controles'
import { cruz, gramSchmidt, norma, producto, proyectar, rango } from '../../lib/matrices'

interface S {
  V: number[][] // dos generadores y el vector a proyectar
  V2: number[][]
  verSegundo: boolean
  verComplemento: boolean
  verGram: boolean
  verResiduo: boolean
  /** Puntos sueltos que se proyectan sobre W: se ponen con doble clic. */
  P: number[][]
}

function piezasDe(V: number[][]) {
  const v1 = V[0]
  const v2 = V[1]
  const w = V[2]
  const base = gramSchmidt([v1, v2])
  const dim = base.length
  const p = dim ? proyectar(w, base) : [0, 0, 0]
  const r = w.map((c, i) => c - p[i])
  return { v1, v2, w, base, dim, p, r }
}

function piezas(s: S) {
  return piezasDe(s.V)
}

function Panel({ s, set }: PropsPanel<S>) {
  const { dim } = piezas(s)
  return (
    <>
      <Grupo titulo="Vectores">
        <Matriz
          A={s.V}
          onChange={(V: number[][]) => set({ V })}
          paso={0.1}
          filas={[
            { nombre: 'v₁', color: 'var(--accent)' },
            { nombre: 'v₂', color: 'var(--accent)' },
            { nombre: 'w', color: 'var(--ink)' },
          ]}
        />
        <Nota>
          v₁ y v₂ generan el subespacio W; w es el que se proyecta. Ahora W es{' '}
          <b>{dim === 2 ? 'un plano' : dim === 1 ? 'una recta' : 'solo el origen'}</b> (dim {dim}).
        </Nota>
      </Grupo>

      <Grupo titulo="Puntos a proyectar">
        {s.P.length ? (
          <>
            <Matriz
              A={s.P}
              onChange={(P: number[][]) => set({ P })}
              paso={0.1}
              filas={s.P.map((_, i) => ({ nombre: `q${sub(i + 1)}`, color: 'var(--pos)' }))}
              quitar={(i) => set({ P: s.P.filter((_, k) => k !== i) })}
            />
            <div className="interruptores">
              <Boton onClick={() => set({ P: [] })}>Quitar todos</Boton>
            </div>
          </>
        ) : (
          <Nota>Doble clic en el suelo del lienzo pone un punto; con Mayús lo subes o bajas.</Nota>
        )}
      </Grupo>

      <Grupo titulo="Comparar otro subespacio">
        <Interruptor activo={s.verSegundo} onChange={(verSegundo) => set({ verSegundo })}>
          Mostrar W₂
        </Interruptor>
        {s.verSegundo && (
          <Matriz
            A={s.V2}
            onChange={(V2: number[][]) => set({ V2 })}
            paso={0.1}
            filas={[{ nombre: 'v₁', color: 'var(--aux)' }, { nombre: 'v₂', color: 'var(--aux)' }]}
          />
        )}
        <Nota>W₁ aparece en azul y W₂ en verde. Así puedes comparar planos, rectas y bases ortonormales.</Nota>
      </Grupo>

      <Grupo titulo="Qué se dibuja">
        <div className="interruptores">
          <Interruptor activo={s.verGram} onChange={(verGram) => set({ verGram })}>
            Base ortonormal
          </Interruptor>
          <Interruptor activo={s.verResiduo} onChange={(verResiduo) => set({ verResiduo })}>
            Residuo w − p
          </Interruptor>
          <Interruptor activo={s.verComplemento} onChange={(verComplemento) => set({ verComplemento })}>
            Complemento ortogonal
          </Interruptor>
        </div>
      </Grupo>
    </>
  )
}

const SUB = '₀₁₂₃₄₅₆₇₈₉'
const sub = (n: number) => String(n).split('').map((d) => SUB[+d]).join('')
const redondo = (p: number[]) => p.map((c) => Math.round(c * 100) / 100)

function asas(s: S): Asa[] {
  const out: Asa[] = [
    { id: 'V0', p: s.V[0], color: '--accent' },
    { id: 'V1', p: s.V[1], color: '--accent' },
    { id: 'V2', p: s.V[2], color: '--ink' },
  ]
  if (s.verSegundo) s.V2.forEach((v, i) => out.push({ id: `W${i}`, p: v, color: '--aux' }))
  s.P.forEach((q, i) => out.push({ id: `P${i}`, p: q, color: '--pos' }))
  return out
}

function mover(id: string, p: number[], s: S): Partial<S> {
  const k = +id.slice(1)
  const q = redondo(p)
  const cambia = (A: number[][]) => A.map((f, i) => (i === k ? q : f))
  if (id[0] === 'V') return { V: cambia(s.V) }
  if (id[0] === 'W') return { V2: cambia(s.V2) }
  return { P: cambia(s.P) }
}

export default definir<S>({
  id: 'subespacios',
  area: 'algebra',
  resumen: 'Subespacios y proyección ortogonal',
  corto: 'Subespacios',
  titulo: 'Subespacios y <i>proyección</i>',
  entradilla: 'La proyección es el punto del subespacio más cercano a w; el resto es perpendicular.',
  inicial: {
    V: [
      [1, 0, 0],
      [0.4, 1, 0],
      [0.6, 0.5, 1.2],
    ],
    V2: [
      [1, 0.2, 0.2],
      [-0.2, 1, 0.4],
    ],
    verSegundo: false,
    verComplemento: true,
    verGram: true,
    verResiduo: true,
    P: [],
  },
  Panel,
  rotulo: (s) => {
    const { dim } = piezas(s)
    return {
      nombre: dim === 2 ? 'Plano por el origen' : dim === 1 ? 'Recta por el origen' : 'Subespacio trivial',
      apunte: `dim W = ${dim}, dim W⊥ = ${3 - dim}`,
    }
  },
  formula: () => [
    String.raw`P_W w=\sum_i \langle w, u_i\rangle\, u_i \quad (u_i \text{ ortonormal})`,
    String.raw`\|w\|^2=\|P_W w\|^2+\|w-P_W w\|^2`,
    String.raw`\mathbb{R}^3 = W \oplus W^{\perp}`,
  ],
  lecturas: (s) => {
    const { w, base, dim, p, r } = piezas(s)
    const nw = norma(w)
    const np = norma(p)
    const nr = norma(r)
    const filas: Array<[string, string]> = [
      ['dim W', `${dim}`],
      ['rango de {v₁, v₂}', `${rango(s.V.slice(0, 2))}`],
      ['‖w‖', nw.toFixed(5)],
      ['‖P_W w‖', np.toFixed(5)],
      ['‖w − P_W w‖', nr.toFixed(5)],
      ['Pitágoras ‖p‖²+‖r‖²', (np * np + nr * nr).toFixed(5)],
      ['‖w‖²', (nw * nw).toFixed(5)],
      ['⟨p, r⟩', producto(p, r).toFixed(8)],
    ]
    if (nw > 1e-9 && np > 1e-9)
      filas.push(['Ángulo w–W', `${((Math.acos(Math.min(1, np / nw)) * 180) / Math.PI).toFixed(2)}°`])
    base.forEach((u, i) => filas.push([`u${i + 1}`, `(${u.map((c) => c.toFixed(3)).join(', ')})`]))
    return filas
  },
  leyenda: (s) => (
    <>
      <Muestra color="var(--accent)">subespacio W</Muestra>
      <Muestra color="var(--ink)">w</Muestra>
      <Muestra color="var(--pos)">proyección P_W w</Muestra>
      {s.verResiduo && <Muestra color="var(--aux)">residuo ⊥ W</Muestra>}
    </>
  ),
  vista: {
    tipo: '3d',
    camara: { theta: 0.9, phi: 1.05, r: 4.2 },
    interaccion: {
      asas,
      mover: (id, t, s) => mover(id, t.p, s),
      anadir: (t, s) => ({ P: [...s.P, redondo(t.p)] }),
      quitar: (id, s) => (id[0] === 'P' ? { P: s.P.filter((_, i) => i !== +id.slice(1)) } : undefined),
      pista: 'Arrastra las puntas · Mayús: en vertical · doble clic: punto nuevo · doble clic o Supr: quitarlo',
    },
    construir(e, s) {
      e.zArriba(true)
      e.ejes(1.6, ['x', 'y', 'z'], { rejilla: true, infinita: true, planos: ['xy'], paso: 0.5 })
      const { v1, v2, w, base, dim, p, r } = piezas(s)
      const acento = e.color('--accent')
      const suave = e.color('--ink-soft')

      // el subespacio
      if (dim === 2) {
        const sup = e.superficie(2, 2, {})
        const [u1, u2] = base
        const k = 1.5
        sup.actualizar((i, j) => {
          const a = (i === 0 ? -1 : 1) * k
          const b = (j === 0 ? -1 : 1) * k
          const q = [0, 1, 2].map((c) => a * u1[c] + b * u2[c])
          return [q[0], q[1], q[2], [acento.r, acento.g, acento.b]]
        })
        ;(sup.malla.material as any).opacity = 0.22
        ;(sup.malla.material as any).transparent = true
        for (const u of base) e.linea([[-u[0] * k, -u[1] * k, -u[2] * k], [u[0] * k, u[1] * k, u[2] * k]], acento, 0.5)
      } else if (dim === 1) {
        const u = base[0]
        const k = 1.7
        e.linea([[-u[0] * k, -u[1] * k, -u[2] * k], [u[0] * k, u[1] * k, u[2] * k]], acento)
      }

      if (s.verSegundo) {
        const base2 = gramSchmidt(s.V2)
        const otro = e.color('--aux')
        if (base2.length === 2) {
          const sup2 = e.superficie(2, 2, {})
          const k2 = 1.5
          sup2.actualizar((i, j) => {
            const a = (i === 0 ? -1 : 1) * k2
            const b = (j === 0 ? -1 : 1) * k2
            const q = [0, 1, 2].map((c) => a * base2[0][c] + b * base2[1][c])
            return [q[0], q[1], q[2], [otro.r, otro.g, otro.b]]
          })
          ;(sup2.malla.material as any).opacity = 0.18
          ;(sup2.malla.material as any).transparent = true
          for (const u of base2) e.linea([[-u[0] * k2, -u[1] * k2, -u[2] * k2], [u[0] * k2, u[1] * k2, u[2] * k2]], otro, 0.8)
        } else if (base2.length === 1) {
          const u = base2[0]
          const k2 = 1.7
          e.linea([[-u[0] * k2, -u[1] * k2, -u[2] * k2], [u[0] * k2, u[1] * k2, u[2] * k2]], otro, 0.9)
        }
        for (const u of base2) e.flecha(u as [number, number, number], otro, [0, 0, 0], 0.009)
      }

      // generadores originales, en gris
      for (const v of [v1, v2]) if (norma(v) > 1e-9) e.flecha(v as [number, number, number], suave, [0, 0, 0], 0.007)

      if (s.verGram) for (const u of base) e.flecha(u as [number, number, number], acento, [0, 0, 0], 0.011)

      e.flecha(w as [number, number, number], e.color('--ink'), [0, 0, 0], 0.014)
      e.rotulo('w', [w[0] * 1.12, w[1] * 1.12, w[2] * 1.12], 0.2)

      if (dim > 0) {
        e.flecha(p as [number, number, number], e.color('--pos'), [0, 0, 0], 0.014)
        if (s.verResiduo) {
          e.linea([p as [number, number, number], w as [number, number, number]], e.color('--aux'))
          e.flecha(r as [number, number, number], e.color('--aux'), p as [number, number, number], 0.009)
        }
      }

      // puntos sueltos: su proyección y el segmento perpendicular que los une
      s.P.forEach((q, i) => {
        const pq = dim ? proyectar(q, base) : [0, 0, 0]
        e.linea([q as [number, number, number], pq as [number, number, number]], e.color('--aux'), 0.8)
        e.punto(pq as [number, number, number], e.color('--pos'), 0.026)
        e.rotulo(`q${sub(i + 1)}`, [q[0] + 0.1, q[1] + 0.1, q[2] + 0.12], 0.2)
      })

      if (s.verComplemento) {
        const k = 1.5
        if (dim === 2) {
          const n = cruz(base[0], base[1])
          e.linea([[-n[0] * k, -n[1] * k, -n[2] * k], [n[0] * k, n[1] * k, n[2] * k]], e.color('--aux'), 0.7)
        } else if (dim === 1) {
          const u = base[0]
          const aux = Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]
          const [a, b] = gramSchmidt([cruz(u, aux), cruz(u, cruz(u, aux))])
          const sup = e.superficie(2, 2, {})
          const c = e.color('--aux')
          sup.actualizar((i, j) => {
            const x = (i === 0 ? -1 : 1) * k
            const y = (j === 0 ? -1 : 1) * k
            const q = [0, 1, 2].map((t) => x * a[t] + y * b[t])
            return [q[0], q[1], q[2], [c.r, c.g, c.b]]
          })
          ;(sup.malla.material as any).opacity = 0.16
          ;(sup.malla.material as any).transparent = true
        }
      }
    },
  },
})
