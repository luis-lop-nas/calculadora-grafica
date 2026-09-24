import * as THREE from 'three'
import { definir, type PropsPanel } from '../../nucleo/tipos'
import { Grupo, Interruptor, Muestra, Numero, Rango, Segmentado } from '../../nucleo/controles'
import { hermite, laguerre, legendre } from '../../lib/especiales'
import { construirRejilla, isoParaProbabilidad, marching, nubeDeProbabilidad, type Rejilla } from '../../lib/mallado'

type Sistema = 'h' | 'caja' | 'osc'
type Modo = 'nube' | 'iso' | 'ambas'

interface S {
  sistema: Sistema
  n: number
  l: number
  m: number
  nx: number
  ny: number
  nz: number
  modo: Modo
  prob: number
  puntos: number
  corte: boolean
  /** Sonda en fracciones de la ventana (−1…1): se queda dentro al cambiar de sistema. */
  sonda: number[]
}

const ORB: Record<number, Record<string, string>> = {
  0: { '0': 's' },
  1: { '-1': 'p<sub>y</sub>', '0': 'p<sub>z</sub>', '1': 'p<sub>x</sub>' },
  2: {
    '-2': 'd<sub>xy</sub>', '-1': 'd<sub>yz</sub>', '0': 'd<sub>z²</sub>',
    '1': 'd<sub>xz</sub>', '2': 'd<sub>x²−y²</sub>',
  },
  3: {
    '-3': 'f<sub>y(3x²−y²)</sub>', '-2': 'f<sub>xyz</sub>', '-1': 'f<sub>yz²</sub>', '0': 'f<sub>z³</sub>',
    '1': 'f<sub>xz²</sub>', '2': 'f<sub>z(x²−y²)</sub>', '3': 'f<sub>x(x²−3y²)</sub>',
  },
}

export function hidrogeno(n: number, l: number, m: number) {
  const am = Math.abs(m)
  return (x: number, y: number, z: number) => {
    const r = Math.hypot(x, y, z)
    const rho = (2 * r) / n
    const R = Math.pow(rho, l) * Math.exp(-rho / 2) * laguerre(n - l - 1, 2 * l + 1, rho)
    const ct = r > 1e-9 ? z / r : 1
    const fi = Math.atan2(y, x)
    const ang = m > 0 ? Math.cos(m * fi) : m < 0 ? Math.sin(am * fi) : 1
    return R * legendre(l, am, ct) * ang
  }
}
export const caja = (a: number, b: number, c: number) => (x: number, y: number, z: number) =>
  Math.sin((a * Math.PI * (x + 1)) / 2) * Math.sin((b * Math.PI * (y + 1)) / 2) * Math.sin((c * Math.PI * (z + 1)) / 2)
export const oscilador = (a: number, b: number, c: number) => (x: number, y: number, z: number) =>
  hermite(a, x) * hermite(b, y) * hermite(c, z) * Math.exp(-(x * x + y * y + z * z) / 2)

const cache = new Map<string, Rejilla>()
function rejilla(s: S): Rejilla {
  let clave: string
  let fn: (x: number, y: number, z: number) => number
  let L: number
  if (s.sistema === 'h') {
    clave = `h${s.n}.${s.l}.${s.m}`
    L = 3 * s.n * s.n + 4
    fn = hidrogeno(s.n, s.l, s.m)
  } else if (s.sistema === 'caja') {
    clave = `c${s.nx}.${s.ny}.${s.nz}`
    L = 1
    fn = caja(s.nx, s.ny, s.nz)
  } else {
    clave = `o${s.nx}.${s.ny}.${s.nz}`
    L = Math.sqrt(2 * Math.max(s.nx, s.ny, s.nz) + 1) + 2.6
    fn = oscilador(s.nx, s.ny, s.nz)
  }
  let g = cache.get(clave)
  if (!g) {
    g = construirRejilla(fn, L)
    if (cache.size > 24) cache.clear()
    cache.set(clave, g)
  }
  return g
}

/** ψ/ψ_máx en la sonda, interpolando la rejilla ya calculada (está normalizada al máximo). */
function enSonda(s: S): { p: [number, number, number]; psi: number } {
  const g = rejilla(s)
  const p = s.sonda.map((c) => c * g.L) as [number, number, number]
  const h = (2 * g.L) / (g.N - 1)
  const idx = p.map((c) => Math.min(g.N - 1.001, Math.max(0, (c + g.L) / h)))
  const [i, j, k] = idx.map(Math.floor)
  const [a, b, c] = idx.map((v, n) => v - [i, j, k][n])
  const F = (di: number, dj: number, dk: number) => g.f[i + di + g.N * (j + dj + g.N * (k + dk))]
  let psi = 0
  for (const di of [0, 1]) for (const dj of [0, 1]) for (const dk of [0, 1])
    psi += F(di, dj, dk) * (di ? a : 1 - a) * (dj ? b : 1 - b) * (dk ? c : 1 - c)
  return { p, psi }
}

const LETRA = ['s', 'p', 'd', 'f']

function Panel({ s, set }: PropsPanel<S>) {
  const xyz = s.sistema === 'caja' || s.sistema === 'osc'
  const min = s.sistema === 'caja' ? 1 : 0
  const rango = [...Array(5).keys()].map((i) => i + min)
  return (
    <>
      <Grupo titulo="Sistema">
        <Segmentado
          columnas={2}
          valor={s.sistema}
          opciones={[
            { v: 'h', t: 'Hidrógeno' },
            { v: 'caja', t: 'Caja 3D' },
            { v: 'osc', t: 'Oscilador 3D' },
          ]}
          onChange={(v) => {
            const p: Partial<S> = { sistema: v }
            if (v !== 'h') {
              const lo = v === 'caja' ? 1 : 0
              Object.assign(p, {
                nx: Math.max(lo, s.nx),
                ny: Math.max(lo, s.ny),
                nz: Math.max(lo, s.nz),
              })
            }
            set(p)
          }}
        />
      </Grupo>

      <Grupo titulo="Números cuánticos">
        {!xyz ? (
          <div className="campos">
            <Numero
              etiqueta="n"
              valor={s.n}
              opciones={[1, 2, 3, 4]}
              onChange={(n) => set({ n, l: Math.min(s.l, n - 1), m: 0 })}
            />
            <Numero
              etiqueta="ℓ"
              valor={s.l}
              opciones={[...Array(s.n).keys()]}
              onChange={(l) => set({ l, m: Math.max(-l, Math.min(l, s.m)) })}
            />
            <Numero
              etiqueta="m"
              valor={s.m}
              opciones={[...Array(2 * s.l + 1).keys()].map((i) => i - s.l)}
              onChange={(m) => set({ m })}
            />
          </div>
        ) : (
          <div className="campos">
            <Numero etiqueta={<>n<sub>x</sub></>} valor={s.nx} opciones={rango} onChange={(nx) => set({ nx })} />
            <Numero etiqueta={<>n<sub>y</sub></>} valor={s.ny} opciones={rango} onChange={(ny) => set({ ny })} />
            <Numero etiqueta={<>n<sub>z</sub></>} valor={s.nz} opciones={rango} onChange={(nz) => set({ nz })} />
          </div>
        )}
      </Grupo>

      <Grupo titulo="Representación">
        <Segmentado
          columnas={3}
          valor={s.modo}
          opciones={[
            { v: 'nube', t: 'Nube |ψ|²' },
            { v: 'iso', t: 'Isosuperficie' },
            { v: 'ambas', t: 'Ambas' },
          ]}
          onChange={(modo) => set({ modo })}
        />
        <Rango
          etiqueta="Probabilidad encerrada"
          valor={s.prob}
          min={0.3}
          max={0.95}
          paso={0.05}
          formato={(v) => `${Math.round(v * 100)} %`}
          onChange={(prob) => set({ prob })}
        />
        <Rango
          etiqueta="Puntos de la nube"
          valor={s.puntos}
          min={5000}
          max={120000}
          paso={5000}
          formato={(v) => v.toLocaleString('es-ES')}
          onChange={(puntos) => set({ puntos })}
        />
        <div className="interruptores">
          <Interruptor activo={s.corte} onChange={(corte) => set({ corte })}>
            Corte x &lt; 0
          </Interruptor>
        </div>
      </Grupo>
    </>
  )
}

const planoCorte = [new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0)]

export default definir<S>({
  id: 'orbitales',
  area: 'cuantica',
  resumen: 'Orbitales y estados ligados 3D',
  corto: 'Orbitales 3D',
  titulo: 'Atlas de <i>ψ</i>',
  entradilla: 'Funciones de onda en 3D: arrastra para girar, rueda o pellizco para acercar.',
  inicial: { sistema: 'h', n: 3, l: 2, m: 0, nx: 2, ny: 1, nz: 3, modo: 'ambas', prob: 0.8, puntos: 50000, corte: false, sonda: [0.3, 0, 0.3] },
  Panel,
  rotulo: (s) => {
    if (s.sistema === 'h')
      return { nombre: `${s.n}${ORB[s.l]?.[String(s.m)] ?? 's'}`, apunte: 'orbital real, átomo de H' }
    return {
      nombre: `(${s.nx}, ${s.ny}, ${s.nz})`,
      apunte: s.sistema === 'caja' ? 'pozo cúbico infinito' : 'oscilador armónico isótropo',
    }
  },
  formula: (s) =>
    s.sistema === 'h'
      ? [
          String.raw`\psi_{n\ell m}(r,\theta,\varphi)=R_{n\ell}(r)\,Y_{\ell m}(\theta,\varphi)`,
          String.raw`R_{n\ell}\propto \rho^{\ell}e^{-\rho/2}L^{2\ell+1}_{n-\ell-1}(\rho),\quad \rho=\frac{2r}{na_0}`,
          String.raw`E_n=-\frac{13{,}6\,\text{eV}}{n^2}`,
        ]
      : s.sistema === 'caja'
        ? [
            String.raw`\psi=\left(\tfrac{2}{L}\right)^{3/2}\sin\frac{n_x\pi x}{L}\sin\frac{n_y\pi y}{L}\sin\frac{n_z\pi z}{L}`,
            String.raw`E=\frac{\pi^2\hbar^2}{2mL^2}\left(n_x^2+n_y^2+n_z^2\right)`,
          ]
        : [
            String.raw`\psi\propto H_{n_x}(\xi_x)H_{n_y}(\xi_y)H_{n_z}(\xi_z)\,e^{-\xi^2/2}`,
            String.raw`\xi=x\sqrt{\tfrac{m\omega}{\hbar}},\quad E=\hbar\omega\left(n_x+n_y+n_z+\tfrac32\right)`,
          ],
  lecturas: (s) => {
    const { p, psi } = enSonda(s)
    const sonda: Array<[string, string]> = [
      ['Sonda', `(${p.map((c) => c.toFixed(2)).join(', ')})`],
      ['ψ / ψ_máx en la sonda', psi.toFixed(4)],
      ['|ψ|² / |ψ|²_máx', (psi * psi).toFixed(4)],
    ]
    if (s.sistema === 'h')
      return [
        ...sonda,
        ['Energía', `${(-13.6057 / (s.n * s.n)).toFixed(3)} eV`],
        ['Degeneración (sin espín)', `${s.n * s.n}`],
        ['Nodos radiales', `${s.n - s.l - 1}`],
        ['Nodos angulares', `${s.l}`],
        ['Ventana de visualización', `${3 * s.n * s.n + 4} a₀`],
      ]
    const q = s.nx ** 2 + s.ny ** 2 + s.nz ** 2
    if (s.sistema === 'caja') {
      let deg = 0
      for (let a = 1; a <= 12; a++)
        for (let b = 1; b <= 12; b++)
          for (let c = 1; c <= 12; c++) if (a * a + b * b + c * c === q) deg++
      return [
        ...sonda,
        ['Energía', `${q} · π²ħ²/2mL²`],
        ['E / E₁₁₁', (q / 3).toFixed(3)],
        ['Degeneración', `${deg}`],
        ['Planos nodales', `${s.nx - 1 + s.ny - 1 + s.nz - 1}`],
      ]
    }
    const n = s.nx + s.ny + s.nz
    return [
      ...sonda,
      ['Energía', `${(n + 1.5).toFixed(1)} ħω`],
      ['Degeneración', `${((n + 1) * (n + 2)) / 2}`],
      ['Planos nodales', `${n}`],
      ['ℓ compatibles', `${LETRA.slice(0, Math.floor(n / 2) + 1).join(', ')}`],
    ]
  },
  leyenda: () => (
    <>
      <Muestra color="var(--pos)">ψ &gt; 0</Muestra>
      <Muestra color="var(--neg)">ψ &lt; 0</Muestra>
    </>
  ),
  vista: {
    tipo: '3d',
    pesada: true,
    camara: { theta: 0.9, phi: 1.1, r: 4.2 },
    construir(e, s) {
      const g = rejilla(s)
      e.zArriba(true)
      e.escala = g.L
      e.orb.r = 4.2 * g.L
      e.ejes(1.15 * g.L, ['x', 'y', 'z'], { caja: s.sistema === 'caja' ? g.L : false })
      const planos = s.corte ? planoCorte : []
      if (s.modo !== 'nube') {
        const iso = Math.max(1e-4, isoParaProbabilidad(g, s.prob))
        const ambas = s.modo === 'ambas'
        for (const [sgn, color] of [
          [1, e.color('--pos')],
          [-1, e.color('--neg')],
        ] as const) {
          const m = marching(g, sgn as number, iso)
          e.malla(m.pos, m.nor, color as THREE.Color, { opacidad: ambas ? 0.32 : 1, planos })
        }
      }
      if (s.modo !== 'iso') {
        const cP = e.color('--pos')
        const cN = e.color('--neg')
        const nube = nubeDeProbabilidad(g, s.puntos, cP, cN)
        const tam = s.puntos > 80000 ? 0.014 : s.puntos > 30000 ? 0.018 : 0.024
        const pts = e.nube(nube.pos, nube.col, tam, 0.8)
        ;(pts.material as THREE.PointsMaterial).clippingPlanes = planos
      }
    },
    interaccion: {
      asas: (s) => [{ id: 'P', p: enSonda(s).p, color: '--ink', nombre: 'P' }],
      mover(_id, t, s) {
        const L = rejilla(s).L
        return { sonda: t.p.map((c) => Math.round(Math.max(-1, Math.min(1, c / L)) * 1000) / 1000) }
      },
      pista: 'Arrastra la sonda (⌥: en vertical) y lee ψ en ese punto',
    },
  },
})
