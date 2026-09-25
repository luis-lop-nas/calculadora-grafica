import { definir, type PropsPanel, type Vista } from '../../nucleo/tipos'
import { accion, radios, submenu } from '../../nucleo/menu'
import { Atajos, Expresion, Grupo, Muestra, Resultado, Segmentado } from '../../nucleo/controles'
import { compilar } from '../../lib/expresion'
import { tex } from '../../lib/cas/tex'
import {
  campoEspacio, campoPlano, centroide, circulacionBorde, circulacionPlana, curvaPlana, estrellada, flujoCerrado, flujoPlano,
  flujoRotacional, integralDivergencia, integralRegion, parametrizacion, type Curva2, type Espacio, type Param, type Plano,
} from '../../lib/teoremas'
import type { Pintor2D } from '../../render/pintor2d'
import type { Escena3D } from '../../render/escena3d'

type Modo = 'green' | 'flujo' | 'stokes' | 'gauss'

export interface EstadoTeoremas {
  modo: Modo
  P: string
  Q: string
  cx: string
  cy: string
  t0: string
  t1: string
  F3: [string, string, string]
  sup: [string, string, string]
  supR: [string, string, string, string]
  vol: [string, string, string]
  volR: [string, string, string, string, string, string]
}

const CURVAS = [
  { t: 'Círculo', cx: 'cos(t)', cy: 'sin(t)' },
  { t: 'Elipse', cx: '0.4 + 2*cos(t)', cy: '-0.2 + 1.3*sin(t)' },
  { t: 'Cardioide', cx: '0.3 + (1 + 0.4*cos(t))*cos(t)', cy: '-0.1 + (1 + 0.4*cos(t))*sin(t)' },
  { t: 'Flor', cx: '(1.2 + 0.3*sin(5*t))*cos(t)', cy: '(1.2 + 0.3*sin(5*t))*sin(t)' },
]
const CAMPOS2 = [
  { t: '(−y, x)/2', P: '-y/2', Q: 'x/2' },
  { t: '(x, y)', P: 'x', Q: 'y' },
  { t: 'Sin simetrías', P: 'exp(x)*sin(y) - y^3', Q: 'x^3 + x*y' },
]
const SUPERFICIES: Array<{ t: string; sup: [string, string, string]; supR: [string, string, string, string] }> = [
  { t: 'Semiesfera', sup: ['sin(u)*cos(v)', 'sin(u)*sin(v)', 'cos(u)'], supR: ['0', 'pi/2', '0', '2*pi'] },
  { t: 'Paraboloide', sup: ['u*cos(v)', 'u*sin(v)', '1 - u^2'], supR: ['0', '1', '0', '2*pi'] },
  { t: 'Silla', sup: ['u', 'v', '(u^2 - v^2)/2'], supR: ['-1', '1', '-1', '1'] },
]
const SOLIDOS: Array<{ t: string; vol: [string, string, string]; volR: [string, string, string, string, string, string] }> = [
  { t: 'Bola', vol: ['u*sin(v)*cos(w)', 'u*sin(v)*sin(w)', 'u*cos(v)'], volR: ['0', '1', '0', 'pi', '0', '2*pi'] },
  { t: 'Cilindro', vol: ['u*cos(v)', 'u*sin(v)', 'w'], volR: ['0', '0.9', '0', '2*pi', '-0.6', '0.8'] },
  { t: 'Cubo', vol: ['u', 'v', 'w'], volR: ['-0.8', '0.8', '-0.8', '0.8', '-0.8', '0.8'] },
]
const CAMPOS3 = [
  { t: '(−y, x, 0)', F3: ['-y', 'x', '0'] as [string, string, string] },
  { t: '(x³, y³, z³)', F3: ['x^3', 'y^3', 'z^3'] as [string, string, string] },
  { t: 'Sin simetrías', F3: ['y*z^2', 'x^2 - z', 'exp(x)*y'] as [string, string, string] },
]

const num = (s: string) => {
  const v = compilar(s, [])()
  if (!Number.isFinite(v)) throw new Error(`«${s}» no es un número`)
  return v
}

type Calculo =
  | { tipo: 'plano'; F: Plano; C: Curva2; centro: [number, number]; borde: number; region: number; estrella: boolean }
  | { tipo: 'espacio'; F: Espacio; S: Param; borde: number; region: number }
  | { error: string }

const memo = new Map<string, Calculo>()
function calcular(s: EstadoTeoremas): Calculo {
  const clave = JSON.stringify(s.modo === 'green' || s.modo === 'flujo' ? [s.modo, s.P, s.Q, s.cx, s.cy, s.t0, s.t1] : [s.modo, s.F3, s.modo === 'stokes' ? [s.sup, s.supR] : [s.vol, s.volR]])
  let c = memo.get(clave)
  if (c) return c
  try {
    if (s.modo === 'green' || s.modo === 'flujo') {
      const F = campoPlano(s.P, s.Q)
      const C = curvaPlana(s.cx, s.cy, num(s.t0), num(s.t1))
      const centro = centroide(C)
      const estrella = estrellada(C, centro)
      const borde = s.modo === 'green' ? circulacionPlana(F, C) : flujoPlano(F, C)
      const region = estrella ? integralRegion(s.modo === 'green' ? F.rot : F.div, C, centro) : NaN
      c = { tipo: 'plano', F, C, centro, borde, region, estrella }
    } else if (s.modo === 'stokes') {
      const F = campoEspacio(...s.F3)
      const r = s.supR.map(num)
      const S = parametrizacion(s.sup, ['u', 'v'], [[r[0], r[1]], [r[2], r[3]]])
      c = { tipo: 'espacio', F, S, borde: circulacionBorde(F, S), region: flujoRotacional(F, S) }
    } else {
      const F = campoEspacio(...s.F3)
      const r = s.volR.map(num)
      const V = parametrizacion(s.vol, ['u', 'v', 'w'], [[r[0], r[1]], [r[2], r[3]], [r[4], r[5]]])
      c = { tipo: 'espacio', F, S: V, borde: flujoCerrado(F, V), region: integralDivergencia(F, V) }
    }
  } catch (e) {
    c = { error: (e as Error).message }
  }
  if (memo.size > 40) memo.clear()
  memo.set(clave, c)
  return c
}

function Panel({ s, set }: PropsPanel<EstadoTeoremas>) {
  const plano = s.modo === 'green' || s.modo === 'flujo'
  const c = calcular(s)
  return (
    <>
      <Grupo titulo="Teorema">
        <Segmentado valor={s.modo} opciones={[{ v: 'green', t: 'Green' }, { v: 'flujo', t: 'Divergencia (plano)' }, { v: 'stokes', t: 'Stokes' }, { v: 'gauss', t: 'Gauss' }]} onChange={(modo) => set({ modo })} />
      </Grupo>
      {plano ? (
        <>
          <Grupo titulo="Campo F = (P, Q)">
            <Atajos opciones={CAMPOS2.map((p) => ({ t: p.t, activo: s.P === p.P && s.Q === p.Q, onClick: () => set({ P: p.P, Q: p.Q }) }))} />
            <Expresion etiqueta="P =" valor={s.P} variables={['x', 'y']} onChange={(P) => set({ P })} />
            <Expresion etiqueta="Q =" valor={s.Q} variables={['x', 'y']} onChange={(Q) => set({ Q })} />
          </Grupo>
          <Grupo titulo="Curva cerrada r(t)">
            <Atajos opciones={CURVAS.map((p) => ({ t: p.t, activo: s.cx === p.cx && s.cy === p.cy, onClick: () => set({ cx: p.cx, cy: p.cy, t0: '0', t1: '2*pi' }) }))} />
            <Expresion etiqueta="x(t) =" valor={s.cx} variables={['t']} onChange={(cx) => set({ cx })} />
            <Expresion etiqueta="y(t) =" valor={s.cy} variables={['t']} onChange={(cy) => set({ cy })} />
            <Expresion etiqueta="t desde" valor={s.t0} variables={[]} onChange={(t0) => set({ t0 })} />
            <Expresion etiqueta="hasta" valor={s.t1} variables={[]} onChange={(t1) => set({ t1 })} />
          </Grupo>
        </>
      ) : (
        <>
          <Grupo titulo="Campo F = (P, Q, R)">
            <Atajos opciones={CAMPOS3.map((p) => ({ t: p.t, activo: s.F3.join() === p.F3.join(), onClick: () => set({ F3: p.F3 }) }))} />
            {(['P', 'Q', 'R'] as const).map((n, i) => (
              <Expresion key={n} etiqueta={`${n} =`} valor={s.F3[i]} variables={['x', 'y', 'z']} onChange={(v) => set({ F3: s.F3.map((w, j) => (j === i ? v : w)) as [string, string, string] })} />
            ))}
          </Grupo>
          {s.modo === 'stokes' ? (
            <Grupo titulo="Superficie r(u, v)">
              <Atajos opciones={SUPERFICIES.map((p) => ({ t: p.t, activo: s.sup.join() === p.sup.join(), onClick: () => set({ sup: p.sup, supR: p.supR }) }))} />
              {(['x', 'y', 'z'] as const).map((n, i) => (
                <Expresion key={n} etiqueta={`${n} =`} valor={s.sup[i]} variables={['u', 'v']} onChange={(v) => set({ sup: s.sup.map((w, j) => (j === i ? v : w)) as [string, string, string] })} />
              ))}
              {['u desde', 'u hasta', 'v desde', 'v hasta'].map((n, i) => (
                <Expresion key={n} etiqueta={n} valor={s.supR[i]} variables={[]} onChange={(v) => set({ supR: s.supR.map((w, j) => (j === i ? v : w)) as EstadoTeoremas['supR'] })} />
              ))}
            </Grupo>
          ) : (
            <Grupo titulo="Sólido r(u, v, w)">
              <Atajos opciones={SOLIDOS.map((p) => ({ t: p.t, activo: s.vol.join() === p.vol.join(), onClick: () => set({ vol: p.vol, volR: p.volR }) }))} />
              {(['x', 'y', 'z'] as const).map((n, i) => (
                <Expresion key={n} etiqueta={`${n} =`} valor={s.vol[i]} variables={['u', 'v', 'w']} onChange={(v) => set({ vol: s.vol.map((w, j) => (j === i ? v : w)) as [string, string, string] })} />
              ))}
              {['u desde', 'u hasta', 'v desde', 'v hasta', 'w desde', 'w hasta'].map((n, i) => (
                <Expresion key={n} etiqueta={n} valor={s.volR[i]} variables={[]} onChange={(v) => set({ volR: s.volR.map((w, j) => (j === i ? v : w)) as EstadoTeoremas['volR'] })} />
              ))}
            </Grupo>
          )}
        </>
      )}
      {'error' in c && <p className="aviso">{c.error}</p>}
      <Resultado />
    </>
  )
}

/* ── 2D ── */

function dibujarPlano(g: Pintor2D, s: EstadoTeoremas) {
  const c = calcular(s)
  if ('error' in c || c.tipo !== 'plano') {
    g.ejes()
    return
  }
  const { C, F } = c
  const pts: Array<[number, number]> = []
  const n = 600
  for (let i = 0; i <= n; i++) {
    const t = C.t0 + ((C.t1 - C.t0) * i) / n
    pts.push([C.x(t), C.y(t)])
  }
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const m = 0.35 * Math.max(x1 - x0, y1 - y0)
  g.ventana = { x: [x0 - m, x1 + m], y: [y0 - m, y1 + m] }
  g.igualarEscala()
  g.ejes()
  const { x: [X0, X1], y: [Y0, Y1] } = g.ventana
  // mapa del integrando de la región (rotacional o divergencia) dentro de la curva
  const f = s.modo === 'green' ? F.rot : F.div
  const N = 70
  const hx = (X1 - X0) / N
  const hy = (Y1 - Y0) / N
  const dentro = (x: number, y: number) => {
    // número de vueltas de la poligonal alrededor del punto
    let w = 0
    for (let i = 0; i < n; i++) {
      const [ax, ay] = pts[i]
      const [bx, by] = pts[i + 1]
      if (ay <= y) {
        if (by > y && (bx - ax) * (y - ay) - (x - ax) * (by - ay) > 0) w++
      } else if (by <= y && (bx - ax) * (y - ay) - (x - ax) * (by - ay) < 0) w--
    }
    return w !== 0
  }
  const celdas: Array<{ x: number; y: number; v: number }> = []
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      const x = X0 + (i + 0.5) * hx
      const y = Y0 + (j + 0.5) * hy
      if (dentro(x, y)) celdas.push({ x, y, v: f(x, y) })
    }
  const vmax = Math.max(1e-12, ...celdas.map((q) => Math.abs(q.v)))
  for (const q of celdas)
    if (Number.isFinite(q.v))
      g.rellenar([[q.x - hx / 2, q.y - hy / 2], [q.x + hx / 2, q.y - hy / 2], [q.x + hx / 2, q.y + hy / 2], [q.x - hx / 2, q.y + hy / 2]], g.color(q.v >= 0 ? '--pos' : '--neg'), 0.08 + 0.5 * (Math.abs(q.v) / vmax))
  // campo
  const M = 16
  for (let i = 0; i <= M; i++)
    for (let j = 0; j <= M; j++) {
      const x = X0 + ((X1 - X0) * i) / M
      const y = Y0 + ((Y1 - Y0) * j) / M
      const u = F.P(x, y)
      const v = F.Q(x, y)
      const r = Math.hypot(u, v)
      if (!(r > 0) || !Number.isFinite(r)) continue
      const l = (0.45 * (X1 - X0)) / M
      g.flecha(x, y, (l * u) / r, (l * v) / r, g.color('--ink-soft'), 1, 4)
    }
  g.curva(pts, g.color('--aux'), 2.2)
  for (let k = 0; k < 8; k++) {
    const t = C.t0 + ((C.t1 - C.t0) * (k + 0.25)) / 8
    const [dx, dy] = [C.dx(t), C.dy(t)]
    const r = Math.hypot(dx, dy)
    if (!(r > 0)) continue
    const l = 0.08 * (X1 - X0)
    if (s.modo === 'green') g.flecha(C.x(t), C.y(t), (l * dx) / r, (l * dy) / r, g.color('--aux'), 2, 7)
    else g.flecha(C.x(t), C.y(t), (l * dy) / r, (-l * dx) / r, g.color('--aux'), 2, 7)
  }
}

/* ── 3D ── */

function colorEscala(e: Escena3D) {
  const neg = e.color('--neg')
  const pos = e.color('--pos')
  const cero = e.color('--ink-soft')
  return (v: number, vmax: number): [number, number, number] => {
    const k = Math.min(1, Math.abs(v) / (vmax || 1))
    const c = cero.clone().lerp(v >= 0 ? pos : neg, k)
    return [c.r, c.g, c.b]
  }
}

function construir3D(e: Escena3D, s: EstadoTeoremas) {
  const c = calcular(s)
  e.ejes(1.3, ['x', 'y', 'z'])
  if ('error' in c || c.tipo !== 'espacio') return
  const { S, F } = c
  const escala = colorEscala(e)
  // caras que dibujar: la superficie (Stokes) o las seis caras de la caja de parámetros (Gauss)
  const caras: Array<(a: number, b: number) => { p: number[]; n: number[] }> = []
  const ev = (fs: Param['r'], x: number[]) => [fs[0](...x), fs[1](...x), fs[2](...x)]
  const cruz = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
  if (s.modo === 'stokes') {
    const [[u0, u1], [v0, v1]] = S.rangos
    caras.push((a, b) => {
      const x = [u0 + (u1 - u0) * a, v0 + (v1 - v0) * b]
      return { p: ev(S.r, x), n: cruz(ev(S.dr[0], x), ev(S.dr[1], x)) }
    })
  } else {
    for (let k = 0; k < 3; k++)
      for (const [lado, signo] of [[1, 1], [0, -1]] as const) {
        const [ia, ib] = [(k + 1) % 3, (k + 2) % 3]
        caras.push((a, b) => {
          const x = [0, 0, 0]
          x[k] = S.rangos[k][lado]
          x[ia] = S.rangos[ia][0] + (S.rangos[ia][1] - S.rangos[ia][0]) * a
          x[ib] = S.rangos[ib][0] + (S.rangos[ib][1] - S.rangos[ib][0]) * b
          const n = cruz(ev(S.dr[ia], x), ev(S.dr[ib], x))
          return { p: ev(S.r, x), n: n.map((q) => signo * q) }
        })
      }
  }
  const nu = 48
  const muestras = caras.map((cara) => {
    const out: Array<{ p: number[]; v: number }> = []
    for (let j = 0; j < nu; j++)
      for (let i = 0; i < nu; i++) {
        const { p, n } = cara(i / (nu - 1), j / (nu - 1))
        const nn = Math.hypot(n[0], n[1], n[2])
        const campo = s.modo === 'stokes' ? [F.rot[0](p[0], p[1], p[2]), F.rot[1](p[0], p[1], p[2]), F.rot[2](p[0], p[1], p[2])] : [F.F[0](p[0], p[1], p[2]), F.F[1](p[0], p[1], p[2]), F.F[2](p[0], p[1], p[2])]
        out.push({ p, v: nn > 1e-12 ? (campo[0] * n[0] + campo[1] * n[1] + campo[2] * n[2]) / nn : 0 })
      }
    return out
  })
  const todos = muestras.flat()
  const ext = Math.max(0.3, ...todos.map((q) => Math.max(Math.abs(q.p[0]), Math.abs(q.p[1]), Math.abs(q.p[2]))))
  const k = 1.1 / ext
  const vmax = Math.max(1e-12, ...todos.map((q) => Math.abs(q.v)).filter(Number.isFinite))
  for (const m of muestras) {
    const sup = e.superficie(nu, nu, { opacidad: s.modo === 'gauss' ? 0.55 : 0.8 })
    sup.actualizar((i, j) => {
      const q = m[j * nu + i]
      return [q.p[0] * k, q.p[1] * k, q.p[2] * k, escala(q.v, vmax)]
    })
  }
  if (s.modo === 'stokes') {
    // borde orientado: el rectángulo de parámetros recorrido en sentido positivo
    const [[u0, u1], [v0, v1]] = S.rangos
    const borde: Array<[number, number, number]> = []
    const recorrido = [[u0, v0, u1, v0], [u1, v0, u1, v1], [u1, v1, u0, v1], [u0, v1, u0, v0]]
    for (const [a, b, c2, d] of recorrido)
      for (let i = 0; i <= 80; i++) {
        const x = [a + ((c2 - a) * i) / 80, b + ((d - b) * i) / 80]
        const p = ev(S.r, x)
        borde.push([p[0] * k, p[1] * k, p[2] * k])
      }
    e.linea(borde, e.color('--aux'))
    for (let i = 20; i < borde.length - 1; i += 60) {
      const [p, q] = [borde[i], borde[i + 1]]
      const dd: [number, number, number] = [q[0] - p[0], q[1] - p[1], q[2] - p[2]]
      const r = Math.hypot(...dd)
      if (r > 1e-9) e.flecha([(0.14 * dd[0]) / r, (0.14 * dd[1]) / r, (0.14 * dd[2]) / r], e.color('--aux'), p, 0.012)
    }
  }
  // flechas del campo F en una rejilla
  const pos: number[] = []
  const col: number[] = []
  const tinta = e.color('--ink-soft')
  const n = 7
  const Fm: number[] = []
  const puntos: number[][] = []
  for (let a = 0; a < n; a++)
    for (let b = 0; b < n; b++)
      for (let c2 = 0; c2 < n; c2++) {
        const p = [a, b, c2].map((i) => ext * (-1 + (2 * i) / (n - 1)))
        const v = [F.F[0](p[0], p[1], p[2]), F.F[1](p[0], p[1], p[2]), F.F[2](p[0], p[1], p[2])]
        if (v.every(Number.isFinite)) {
          puntos.push([...p, ...v])
          Fm.push(Math.hypot(v[0], v[1], v[2]))
        }
      }
  const fmax = Math.max(1e-12, ...Fm)
  for (const q of puntos) {
    const l = (0.14 * Math.hypot(q[3], q[4], q[5])) / fmax / Math.max(Math.hypot(q[3], q[4], q[5]), 1e-300)
    pos.push(q[0] * k, q[1] * k, q[2] * k, q[0] * k + q[3] * l * ext * k, q[1] * k + q[4] * l * ext * k, q[2] * k + q[5] * l * ext * k)
    col.push(tinta.r, tinta.g, tinta.b, tinta.r, tinta.g, tinta.b)
  }
  e.segmentos(new Float32Array(pos), new Float32Array(col))
}

const VISTAS: Record<'2d' | '3d', Vista<EstadoTeoremas>> = {
  '2d': { tipo: '2d', clave: '2d', navegable: false, dibujar: (g, st) => dibujarPlano(g, st) },
  '3d': { tipo: '3d', clave: '3d', pesada: true, camara: { theta: 0.6, phi: 1.1, r: 4.2 }, construir: construir3D },
}

const f8 = (x: number) => (Number.isFinite(x) ? x.toFixed(10) : '—')

export default definir<EstadoTeoremas>({
  id: 'teoremas',
  area: 'campos',
  resumen: 'Teoremas integrales: Green, divergencia en el plano, Stokes y Gauss, con los dos lados calculados por separado',
  corto: 'Teoremas integrales',
  titulo: 'Teoremas <i>integrales</i>',
  entradilla: 'Escribe el campo y la curva, superficie o sólido: la integral del borde y la del interior salen por caminos distintos.',
  inicial: {
    modo: 'green',
    P: CAMPOS2[2].P,
    Q: CAMPOS2[2].Q,
    cx: CURVAS[2].cx,
    cy: CURVAS[2].cy,
    t0: '0',
    t1: '2*pi',
    F3: CAMPOS3[2].F3,
    sup: SUPERFICIES[1].sup,
    supR: SUPERFICIES[1].supR,
    vol: SOLIDOS[0].vol,
    volR: SOLIDOS[0].volR,
  },
  Panel,
  menu: (s) => ({
    ejemplos: [
      submenu<EstadoTeoremas>('Curvas (Green y flujo)', CURVAS.map((p) => accion<EstadoTeoremas>(p.t, (t) => ({ cx: p.cx, cy: p.cy, t0: '0', t1: '2*pi', modo: t.modo === 'flujo' ? 'flujo' : 'green' })))),
      submenu<EstadoTeoremas>('Superficies (Stokes)', SUPERFICIES.map((p) => accion<EstadoTeoremas>(p.t, () => ({ sup: p.sup, supR: p.supR, modo: 'stokes' })))),
      submenu<EstadoTeoremas>('Sólidos (Gauss)', SOLIDOS.map((p) => accion<EstadoTeoremas>(p.t, () => ({ vol: p.vol, volR: p.volR, modo: 'gauss' })))),
    ],
    acciones: [
      radios<EstadoTeoremas, Modo>('Teorema', [{ v: 'green', t: 'Green' }, { v: 'flujo', t: 'Divergencia en el plano' }, { v: 'stokes', t: 'Stokes' }, { v: 'gauss', t: 'Gauss' }], s.modo, (modo) => ({ modo })),
    ],
  }),
  resultadoEnPanel: true,
  rotulo: (s) => ({ nombre: { green: 'Green', flujo: 'Divergencia en el plano', stokes: 'Stokes', gauss: 'Gauss' }[s.modo], apunte: 'borde = interior' }),
  formula: (s) => {
    const c = calcular(s)
    const base = {
      green: String.raw`\oint_{\partial D}P\,dx+Q\,dy=\iint_D\left(\frac{\partial Q}{\partial x}-\frac{\partial P}{\partial y}\right)dA`,
      flujo: String.raw`\oint_{\partial D}\mathbf F\cdot\mathbf n\,ds=\iint_D\nabla\cdot\mathbf F\,dA`,
      stokes: String.raw`\oint_{\partial S}\mathbf F\cdot d\mathbf r=\iint_S(\nabla\times\mathbf F)\cdot d\mathbf S`,
      gauss: String.raw`\oiint_{\partial V}\mathbf F\cdot d\mathbf S=\iiint_V\nabla\cdot\mathbf F\,dV`,
    }[s.modo]
    if ('error' in c) return [base]
    if (c.tipo === 'plano') return [base, s.modo === 'green' ? String.raw`Q_x-P_y=${tex(c.F.texRot)}` : String.raw`\nabla\cdot\mathbf F=${tex(c.F.texDiv)}`]
    return [base, s.modo === 'stokes' ? String.raw`\nabla\times\mathbf F=\left(${c.F.texRot.map((e) => tex(e)).join(',\\;')}\right)` : String.raw`\nabla\cdot\mathbf F=${tex(c.F.texDiv)}`]
  },
  lecturas: (s) => {
    const c = calcular(s)
    if ('error' in c) return [['No se puede', c.error]]
    const nombres = { green: ['∮ P dx + Q dy', '∬ (Q_x − P_y) dA'], flujo: ['∮ F·n ds', '∬ div F dA'], stokes: ['∮ F·dr (borde)', '∬ rot F·dS'], gauss: ['∯ F·dS (caras)', '∭ div F dV'] }[s.modo]
    const filas: Array<[string, string]> = [[nombres[0], f8(c.borde)], [nombres[1], f8(c.region)]]
    if (c.tipo === 'plano' && !c.estrella) filas.push(['Región', 'no es estrellada respecto del centroide: no sé integrar su interior'])
    else filas.push(['Diferencia', Math.abs(c.borde - c.region).toExponential(2)])
    return filas
  },
  leyenda: (s) => (
    <>
      <Muestra color="var(--pos)">{s.modo === 'green' ? 'rotacional' : s.modo === 'stokes' ? 'rot F·n' : s.modo === 'gauss' ? 'F·n' : 'divergencia'} &gt; 0</Muestra>
      <Muestra color="var(--neg)">&lt; 0</Muestra>
      {s.modo !== 'gauss' && <Muestra color="var(--aux)">borde orientado</Muestra>}
      <Muestra color="var(--ink-soft)">F</Muestra>
    </>
  ),
  vista: (s) => VISTAS[s.modo === 'green' || s.modo === 'flujo' ? '2d' : '3d'],
})
