import { dimPozo } from '../dimensional'
import { definir, type PropsPanel } from '../../nucleo/tipos'
import { capaFija, capaVer, casilla, radios } from '../../nucleo/menu'
import { Grupo, Interruptor, Muestra, Rango, Segmentado } from '../../nucleo/controles'
import { hermite, factorial } from '../../lib/especiales'
import * as K from '../../lib/complejo'

type Sistema = 'infinito' | 'finito' | 'armonico' | 'barrera'

export interface EstadoPozo {
  sistema: Sistema
  n: number
  V0: number
  a: number
  omega: number
  E: number
  densidad: boolean
  transmision: boolean
}

// ħ = m = 1 en todo el módulo.

/** Energías del pozo infinito de anchura 2a. */
const nivelesInfinito = (a: number, cuantos = 6) =>
  [...Array(cuantos).keys()].map((i) => (((i + 1) ** 2) * Math.PI ** 2) / (2 * (2 * a) ** 2))

/**
 * Energías ligadas del pozo finito de semianchura a y profundidad V₀.
 *
 * Se resuelve en la variable z = ka, no en E: en z, cada rama tiene
 * exactamente una raíz por intervalo (mπ, mπ+π/2) para los estados pares y
 * (mπ+π/2, (m+1)π) para los impares, así que basta bisecar intervalo a
 * intervalo. Barrer E con paso fijo, en cambio, se salta niveles en cuanto el
 * pozo es profundo: las raíces se apelotonan contra las asíntotas de la tangente.
 */
export function nivelesFinito(a: number, V0: number): Array<{ E: number; par: boolean }> {
  const z0 = a * Math.sqrt(2 * V0)
  const out: Array<{ E: number; par: boolean }> = []
  const eps = 1e-9
  const raiz = (par: boolean, lo: number, hi: number) => {
    const g = (z: number) => {
      const derecha = Math.sqrt(Math.max(0, z0 * z0 - z * z))
      return par ? z * Math.tan(z) - derecha : -z / Math.tan(z) - derecha
    }
    let A = lo + eps
    let B = Math.min(hi - eps, z0 - eps)
    if (B <= A) return null
    const gA = g(A)
    const gB = g(B)
    if (!Number.isFinite(gA) || !Number.isFinite(gB) || gA * gB > 0) return null
    for (let i = 0; i < 200; i++) {
      const m = (A + B) / 2
      if (g(A) * g(m) <= 0) B = m
      else A = m
    }
    return (A + B) / 2
  }
  for (let m = 0; m * Math.PI < z0; m++) {
    const par = raiz(true, m * Math.PI, m * Math.PI + Math.PI / 2)
    if (par !== null) out.push({ E: (par * par) / (2 * a * a), par: true })
    const impar = raiz(false, m * Math.PI + Math.PI / 2, (m + 1) * Math.PI)
    if (impar !== null) out.push({ E: (impar * impar) / (2 * a * a), par: false })
  }
  return out.sort((x, y) => x.E - y.E)
}

function psiInfinito(n: number, a: number) {
  const L = 2 * a
  return (x: number) => (Math.abs(x) > a ? 0 : Math.sqrt(2 / L) * Math.sin((n * Math.PI * (x + a)) / L))
}

function psiFinito(E: number, par: boolean, a: number, V0: number) {
  const k = Math.sqrt(2 * E)
  const q = Math.sqrt(2 * (V0 - E))
  const dentro = par ? Math.cos(k * a) : Math.sin(k * a)
  return (x: number) => {
    if (Math.abs(x) <= a) return par ? Math.cos(k * x) : Math.sin(k * x)
    const s = x > 0 ? 1 : par ? 1 : -1
    return s * dentro * Math.exp(-q * (Math.abs(x) - a))
  }
}

function psiArmonico(n: number, w: number) {
  const norm = Math.pow(w / Math.PI, 0.25) / Math.sqrt(Math.pow(2, n) * factorial(n))
  return (x: number) => {
    const xi = x * Math.sqrt(w)
    return norm * hermite(n, xi) * Math.exp(-(xi * xi) / 2)
  }
}

/** Estado estacionario de dispersión sobre una barrera [0, a] de altura V0. */
export function dispersion(E: number, V0: number, a: number) {
  const k = Math.sqrt(2 * E)
  const k2 = K.sqrt(K.c(2 * (E - V0)))
  const ik = K.c(0, k)
  // incógnitas: r, C, D, t   con ψ_II = C cos(k2 x) + D sin(k2 x)
  const ca = K.cos(K.mul(k2, K.c(a)))
  const sa = K.sin(K.mul(k2, K.c(a)))
  const eika = K.exp(K.c(0, k * a))
  const M: K.C[][] = [
    [K.c(1), K.c(-1), K.c(0), K.c(0)],
    [K.mul(K.c(-1), ik), K.c(0), K.mul(K.c(-1), k2), K.c(0)],
    [K.c(0), ca, sa, K.mul(K.c(-1), eika)],
    [K.c(0), K.mul(K.mul(K.c(-1), k2), sa), K.mul(k2, ca), K.mul(K.mul(K.c(-1), ik), eika)],
  ]
  const b: K.C[] = [K.c(-1), K.mul(K.c(-1), ik), K.c(0), K.c(0)]
  const [r, C, D, t] = K.resolver(M, b)
  const psi = (x: number): K.C => {
    if (x < 0) return K.suma(K.exp(K.c(0, k * x)), K.mul(r, K.exp(K.c(0, -k * x))))
    if (x > a) return K.mul(t, K.exp(K.c(0, k * x)))
    const kx = K.mul(k2, K.c(x))
    return K.suma(K.mul(C, K.cos(kx)), K.mul(D, K.sin(kx)))
  }
  return { psi, T: K.abs2(t), R: K.abs2(r), k }
}

/** Coeficiente de transmisión analítico de la barrera rectangular. */
export function transmision(E: number, V0: number, a: number): number {
  if (E <= 0) return 0
  if (Math.abs(E - V0) < 1e-9) return 1 / (1 + (a * a * V0) / 2)
  if (E < V0) {
    const q = Math.sqrt(2 * (V0 - E))
    return 1 / (1 + (V0 * V0 * Math.sinh(q * a) ** 2) / (4 * E * (V0 - E)))
  }
  const k2 = Math.sqrt(2 * (E - V0))
  return 1 / (1 + (V0 * V0 * Math.sin(k2 * a) ** 2) / (4 * E * (E - V0)))
}

function potencial(s: EstadoPozo) {
  if (s.sistema === 'armonico') return (x: number) => 0.5 * s.omega * s.omega * x * x
  if (s.sistema === 'barrera') return (x: number) => (x >= 0 && x <= s.a ? s.V0 : 0)
  if (s.sistema === 'finito') return (x: number) => (Math.abs(x) <= s.a ? 0 : s.V0)
  return (x: number) => (Math.abs(x) <= s.a ? 0 : 60)
}

function niveles(s: EstadoPozo): number[] {
  if (s.sistema === 'infinito') return nivelesInfinito(s.a)
  if (s.sistema === 'finito') return nivelesFinito(s.a, s.V0).map((v) => v.E)
  if (s.sistema === 'armonico') return [...Array(7).keys()].map((n) => (n + 0.5) * s.omega)
  return []
}

function Panel({ s, set }: PropsPanel<EstadoPozo>) {
  const ns = niveles(s)
  return (
    <>
      <Grupo titulo="Sistema">
        <Segmentado
          columnas={2}
          valor={s.sistema}
          opciones={[
            { v: 'infinito', t: 'Pozo infinito' },
            { v: 'finito', t: 'Pozo finito' },
            { v: 'armonico', t: 'Armónico' },
            { v: 'barrera', t: 'Barrera / túnel' },
          ]}
          onChange={(sistema) => set({ sistema, n: 1 })}
        />
      </Grupo>

      {s.sistema !== 'barrera' ? (
        <Grupo titulo="Estado">
          <Rango
            etiqueta="Nivel n"
            valor={s.n}
            min={1}
            max={Math.max(1, ns.length)}
            paso={1}
            formato={(v) => `${v} de ${ns.length}`}
            onChange={(n) => set({ n })}
          />
          {s.sistema === 'armonico' ? (
            <Rango
              etiqueta="Frecuencia ω"
              valor={s.omega}
              min={0.3}
              max={4}
              paso={0.1}
              formato={(v) => v.toFixed(1)}
              onChange={(omega) => set({ omega })}
            />
          ) : (
            <Rango
              etiqueta="Semianchura a"
              valor={s.a}
              min={0.5}
              max={4}
              paso={0.1}
              formato={(v) => v.toFixed(1)}
              onChange={(a) => set({ a })}
            />
          )}
          {s.sistema === 'finito' && (
            <Rango
              etiqueta="Profundidad V₀"
              valor={s.V0}
              min={0.5}
              max={20}
              paso={0.5}
              formato={(v) => v.toFixed(1)}
              onChange={(V0) => set({ V0 })}
            />
          )}
        </Grupo>
      ) : (
        <Grupo titulo="Barrera">
          <Rango
            etiqueta="Altura V₀"
            valor={s.V0}
            min={0.5}
            max={20}
            paso={0.5}
            formato={(v) => v.toFixed(1)}
            onChange={(V0) => set({ V0 })}
          />
          <Rango
            etiqueta="Anchura a"
            valor={s.a}
            min={0.2}
            max={5}
            paso={0.1}
            formato={(v) => v.toFixed(1)}
            onChange={(a) => set({ a })}
          />
          <Rango
            etiqueta="Energía E"
            valor={s.E}
            min={0.1}
            max={24}
            paso={0.1}
            formato={(v) => v.toFixed(1)}
            onChange={(E) => set({ E })}
          />
          <div className="interruptores">
            <Interruptor activo={s.transmision} onChange={(transmision) => set({ transmision })}>
              Curva T(E)
            </Interruptor>
          </div>
        </Grupo>
      )}

      <Grupo titulo="Representación">
        <div className="interruptores">
          <Interruptor activo={s.densidad} onChange={(densidad) => set({ densidad })}>
            |ψ|² en vez de ψ
          </Interruptor>
        </div>
      </Grupo>
    </>
  )
}

export default definir<EstadoPozo>({
  id: 'pozo',
  area: 'cuantica',
  dimensiones: dimPozo,
  resumen: 'Pozos, barrera y efecto túnel',
  corto: 'Pozos y efecto túnel',
  titulo: 'Pozos y <i>efecto túnel</i>',
  entradilla: 'Estados ligados en 1D y transmisión a través de una barrera.',
  inicial: { sistema: 'finito', n: 1, V0: 8, a: 2, omega: 1, E: 4, densidad: false, transmision: false },
  Panel,
  capas: (s) => [
    capaFija<EstadoPozo>('V', 'Potencial V(x)', '--ink-soft'),
    capaFija<EstadoPozo>('E', `Nivel n = ${s.n}`, '--pos'),
    capaVer(s, 'densidad', 'Densidad |ψ|²', '--accent'),
    capaVer(s, 'transmision', 'Transmisión T(E)', '--accent'),
  ],
  menu: (s) => ({
    acciones: [
      radios<EstadoPozo, Sistema>('Sistema', [{ v: 'infinito', t: 'Pozo infinito' }, { v: 'finito', t: 'Pozo finito' }, { v: 'armonico', t: 'Oscilador armónico' }, { v: 'barrera', t: 'Barrera (efecto túnel)' }], s.sistema, (sistema) => ({ sistema })),
      radios<EstadoPozo, number>('Nivel n', [1, 2, 3, 4, 5, 6, 7, 8].map((v) => ({ v, t: String(v) })), s.n, (n) => ({ n })),
      casilla<EstadoPozo>('Densidad |ψ|²', s.densidad, (densidad) => ({ densidad })),
    ],
  }),
  rotulo: (s) => {
    const nombres: Record<Sistema, string> = {
      infinito: 'Pozo infinito',
      finito: 'Pozo finito',
      armonico: 'Oscilador armónico',
      barrera: 'Barrera rectangular',
    }
    return { nombre: nombres[s.sistema], apunte: 'ħ = m = 1' }
  },
  formula: (s) =>
    s.sistema === 'infinito'
      ? [
          String.raw`E_n=\frac{n^2\pi^2\hbar^2}{2mL^2},\quad L=2a`,
          String.raw`\psi_n(x)=\sqrt{\tfrac{2}{L}}\,\sin\frac{n\pi(x+a)}{L}`,
        ]
      : s.sistema === 'finito'
        ? [
            String.raw`k\tan(ka)=\kappa \quad (\text{estados pares})`,
            String.raw`-k\cot(ka)=\kappa \quad (\text{estados impares})`,
            String.raw`k=\tfrac{\sqrt{2mE}}{\hbar},\ \ \kappa=\tfrac{\sqrt{2m(V_0-E)}}{\hbar}`,
          ]
        : s.sistema === 'armonico'
          ? [
              String.raw`\psi_n(x)=\tfrac{1}{\sqrt{2^n n!}}\left(\tfrac{m\omega}{\pi\hbar}\right)^{1/4}H_n(\xi)e^{-\xi^2/2}`,
              String.raw`E_n=\hbar\omega\left(n+\tfrac12\right),\ \ \xi=x\sqrt{m\omega/\hbar}`,
            ]
          : [
              String.raw`T=\left[1+\frac{V_0^2\sinh^2(\kappa a)}{4E(V_0-E)}\right]^{-1}\ (E<V_0)`,
              String.raw`T=\left[1+\frac{V_0^2\sin^2(k_2 a)}{4E(E-V_0)}\right]^{-1}\ (E>V_0)`,
            ],
  lecturas: (s) => {
    if (s.sistema === 'barrera') {
      const { T, R } = dispersion(s.E, s.V0, s.a)
      const q = s.E < s.V0 ? Math.sqrt(2 * (s.V0 - s.E)) : 0
      return [
        ['E / V₀', (s.E / s.V0).toFixed(3)],
        ['Transmisión T', T.toFixed(5)],
        ['Reflexión R', R.toFixed(5)],
        ['T + R', (T + R).toFixed(6)],
        ['Penetración 1/κ', q > 0 ? (1 / q).toFixed(3) : '—'],
        ['κa', q > 0 ? (q * s.a).toFixed(3) : '—'],
      ]
    }
    const ns = niveles(s)
    const E = ns[Math.min(s.n, ns.length) - 1] ?? 0
    const filas: Array<[string, string]> = [
      ['Estados ligados', `${ns.length}`],
      [`E${s.n}`, E.toFixed(4)],
    ]
    if (s.sistema === 'finito') {
      const q = Math.sqrt(2 * (s.V0 - E))
      filas.push(['Penetración 1/κ', (1 / q).toFixed(3)])
      filas.push(['E / V₀', (E / s.V0).toFixed(3)])
      const z0 = s.a * Math.sqrt(2 * s.V0)
      filas.push(['z₀ = a√(2mV₀)/ħ', z0.toFixed(3)])
      filas.push(['Predicción ⌈z₀/(π/2)⌉', `${Math.ceil(z0 / (Math.PI / 2))}`])
    }
    if (s.sistema === 'armonico') filas.push(['Separación ħω', s.omega.toFixed(2)])
    if (ns.length > 1) filas.push(['E₂ − E₁', (ns[1] - ns[0]).toFixed(4)])
    return filas
  },
  leyenda: (s) =>
    s.sistema === 'barrera' && s.transmision ? (
      <>
        <Muestra color="var(--accent)">T(E)</Muestra>
        <Muestra color="var(--pos)">E actual</Muestra>
      </>
    ) : (
      <>
        <Muestra color="var(--ink-soft)">V(x)</Muestra>
        <Muestra color="var(--accent)">{s.densidad ? '|ψ|²' : 'ψ'} sobre su nivel</Muestra>
        <Muestra color="var(--pos)">nivel de energía</Muestra>
      </>
    ),
  vista: {
    tipo: '2d',
    ventana: { x: [-6, 6], y: [-2, 12] },
    interaccion: {
      asas(s) {
        if (s.sistema !== 'barrera') return []
        // en la gráfica T(E) la energía es el eje horizontal; en el perfil, una línea a la altura E
        if (s.transmision) return [{ id: 'E', p: [s.E, transmision(s.E, s.V0, s.a)], color: '--pos', nombre: 'E', eje: 'x' as const }]
        return [{ id: 'E', p: [-4.5, s.E], color: '--pos', nombre: 'E', eje: 'y' as const }]
      },
      mover: (_id, t, s) => ({ E: Math.round(Math.max(0.1, Math.min(24, s.transmision ? t.p[0] : t.p[1])) * 10) / 10 }),
    },
    dibujar(g, s) {
      const ink = g.color('--ink')
      const suave = g.color('--ink-soft')
      const acento = g.color('--accent')
      const pos = g.color('--pos')

      if (s.sistema === 'barrera' && s.transmision) {
        g.ventana = { x: [0, Math.max(3 * s.V0, s.E * 1.3)], y: [-0.08, 1.12] }
        g.ejes({ etiquetaX: 'E', etiquetaY: 'T' })
        g.funcion((E) => transmision(E, s.V0, s.a), acento, 2.2)
        g.curva(
          [
            [s.V0, -0.08],
            [s.V0, 1.12],
          ],
          suave,
          1,
          true,
        )
        g.texto('E = V₀', s.V0, 1.06, suave, { dx: 6 })
        const T = transmision(s.E, s.V0, s.a)
        g.punto(s.E, T, pos, 5)
        g.texto(`T = ${T.toFixed(4)}`, s.E, T, ink, { dx: 9, dy: -10 })
        return
      }

      const V = potencial(s)
      const techo =
        s.sistema === 'armonico' ? (s.n + 3) * s.omega : s.sistema === 'barrera' ? s.V0 * 1.6 : s.V0 * 1.35
      const ancho = s.sistema === 'armonico' ? Math.sqrt((2 * (s.n + 2)) / s.omega) * 1.9 : s.a * 3.2
      g.ventana = { x: [-ancho, ancho], y: [-techo * 0.35, techo] }
      g.ejes({ etiquetaX: 'x', etiquetaY: 'E' })

      // potencial
      const pts: Array<[number, number]> = []
      for (let i = 0; i <= 900; i++) {
        const x = -ancho + (2 * ancho * i) / 900
        pts.push([x, Math.min(V(x), techo * 1.4)])
      }
      g.curva(pts, suave, 2)

      if (s.sistema === 'barrera') {
        const { psi } = dispersion(s.E, s.V0, s.a)
        g.curva(
          [
            [-ancho, s.E],
            [ancho, s.E],
          ],
          pos,
          1.4,
          true,
        )
        g.texto(`E = ${s.E.toFixed(1)}`, -ancho, s.E, pos, { dx: 8, dy: -9 })
        const escala = techo * 0.16
        const onda: Array<[number, number]> = []
        for (let i = 0; i <= 1400; i++) {
          const x = -ancho + (2 * ancho * i) / 1400
          const z = psi(x)
          onda.push([x, s.E + escala * (s.densidad ? K.abs2(z) : z[0])])
        }
        g.curva(onda, acento, 1.8)
        return
      }

      const ns = niveles(s)
      const idx = Math.min(s.n, ns.length) - 1
      ns.forEach((E, i) => {
        const activo = i === idx
        g.curva(
          [
            [-ancho, E],
            [ancho, E],
          ],
          activo ? pos : suave,
          activo ? 1.4 : 0.8,
          !activo,
        )
      })
      if (idx < 0) return
      const E = ns[idx]
      let f: (x: number) => number
      if (s.sistema === 'infinito') f = psiInfinito(s.n, s.a)
      else if (s.sistema === 'armonico') f = psiArmonico(s.n - 1, s.omega)
      else {
        const es = nivelesFinito(s.a, s.V0)[idx]
        f = psiFinito(es.E, es.par, s.a, s.V0)
      }
      let mx = 0
      for (let i = 0; i <= 600; i++) {
        const x = -ancho + (2 * ancho * i) / 600
        mx = Math.max(mx, Math.abs(f(x)))
      }
      const escala = (techo * 0.17) / (mx || 1) ** (s.densidad ? 2 : 1)
      const onda: Array<[number, number]> = []
      for (let i = 0; i <= 1200; i++) {
        const x = -ancho + (2 * ancho * i) / 1200
        const v = f(x)
        onda.push([x, E + escala * (s.densidad ? v * v : v)])
      }
      g.curva(onda, acento, 2)
      g.texto(`E${s.n} = ${E.toFixed(3)}`, -ancho, E, ink, { dx: 8, dy: -10 })
    },
  },
})
