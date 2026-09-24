export type C = [number, number]

export const c = (re: number, im = 0): C => [re, im]
export const suma = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]]
export const resta = (a: C, b: C): C => [a[0] - b[0], a[1] - b[1]]
export const mul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]]
export const div = (a: C, b: C): C => {
  const d = b[0] * b[0] + b[1] * b[1]
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]
}
export const abs2 = (a: C) => a[0] * a[0] + a[1] * a[1]
export const abs = (a: C) => Math.hypot(a[0], a[1])
export const arg = (a: C) => Math.atan2(a[1], a[0])
export const exp = (a: C): C => {
  const r = Math.exp(a[0])
  return [r * Math.cos(a[1]), r * Math.sin(a[1])]
}
export const sqrt = (a: C): C => {
  const r = Math.sqrt(abs(a))
  const t = arg(a) / 2
  return [r * Math.cos(t), r * Math.sin(t)]
}
export const cos = (a: C): C => [Math.cos(a[0]) * Math.cosh(a[1]), -Math.sin(a[0]) * Math.sinh(a[1])]
export const sin = (a: C): C => [Math.sin(a[0]) * Math.cosh(a[1]), Math.cos(a[0]) * Math.sinh(a[1])]

/** Resuelve M z = b por eliminación gaussiana con pivoteo parcial. */
export function resolver(M: C[][], b: C[]): C[] {
  const n = b.length
  if (M.length !== n || M.some((fila) => fila.length !== n)) throw new Error('sistema complejo mal dimensionado')
  const A = M.map((f, i) => [...f.map((v) => [...v] as C), [...b[i]] as C])
  for (let col = 0; col < n; col++) {
    let mejor = col
    for (let i = col; i < n; i++) if (abs(A[i][col]) > abs(A[mejor][col])) mejor = i
    ;[A[col], A[mejor]] = [A[mejor], A[col]]
    const p = A[col][col]
    if (abs(p) < 1e-14) throw new Error('sistema complejo singular o incompatible')
    for (let j = col; j <= n; j++) A[col][j] = div(A[col][j], p)
    for (let i = 0; i < n; i++) {
      if (i === col) continue
      const f = A[i][col]
      if (abs(f) < 1e-15) continue
      for (let j = col; j <= n; j++) A[i][j] = resta(A[i][j], mul(f, A[col][j]))
    }
  }
  return A.map((f) => f[n])
}

/* ---------- ceros, polos, residuos e integrales de contorno ---------- */

type FC = (z: C) => C

const finitoC = (w: C) => Number.isFinite(w[0]) && Number.isFinite(w[1])

/** ∮ f dz sobre |z − c| = ρ en sentido positivo (trapecios: exacta a la precisión de máquina si f es analítica cerca). */
export function integralContorno(f: FC, c: C, rho: number, N = 2048): C | null {
  let s: C = [0, 0]
  for (let k = 0; k < N; k++) {
    const th = (2 * Math.PI * k) / N
    const e: C = [Math.cos(th), Math.sin(th)]
    const w = f([c[0] + rho * e[0], c[1] + rho * e[1]])
    if (!finitoC(w)) return null
    // dz = i ρ e^{iθ} dθ
    s = suma(s, mul(w, [-rho * e[1], rho * e[0]]))
  }
  return [(s[0] * 2 * Math.PI) / N, (s[1] * 2 * Math.PI) / N]
}

/** Vueltas que da f(z) alrededor de 0 cuando z recorre la circunferencia: ceros − polos dentro. */
export function vueltas(f: FC, c: C, rho: number, N = 1024): number | null {
  const ws: C[] = []
  for (let k = 0; k <= N; k++) {
    const th = (2 * Math.PI * k) / N
    const w = f([c[0] + rho * Math.cos(th), c[1] + rho * Math.sin(th)])
    if (!finitoC(w) || (w[0] === 0 && w[1] === 0)) return null
    ws.push(w)
  }
  // f tiene que ser continua sobre la circunferencia: un salto (corte de rama de ln o √) no cuenta vueltas
  // (en relativo: e^(1/z) cerca de 0 cambia de tamaño muchísimo, pero de forma continua)
  const pasos = ws.slice(1).map((w, k) => abs(resta(w, ws[k])) / Math.max(abs(w), abs(ws[k])))
  const tipico = [...pasos].sort((a, b) => a - b)[Math.floor(pasos.length / 2)]
  if (Math.max(...pasos) > 50 * tipico + 0.05) return null
  let total = 0
  for (let k = 1; k < ws.length; k++) {
    let d = arg(ws[k]) - arg(ws[k - 1])
    if (Math.abs(d) > Math.PI) d -= 2 * Math.PI * Math.sign(d)
    total += d
  }
  return Math.round(total / (2 * Math.PI))
}

export interface Singular {
  z: C
  tipo: 'cero' | 'polo' | 'singularidad esencial' | 'corte de rama'
  orden: number | null
  /** Solo en polos y singularidades aisladas: (1/2πi) ∮ f dz en un circulito. */
  residuo: C | null
}

/** Newton complejo sobre g con derivada numérica; null si no converge a un cero de g. */
function newton(g: FC, z0: C): C | null {
  let z = z0
  for (let it = 0; it < 60; it++) {
    const w = g(z)
    if (!finitoC(w)) return null
    if (abs(w) < 1e-14) return z
    const h = 1e-7 * Math.max(1, abs(z))
    const d = div(resta(g([z[0] + h, z[1]]), g([z[0] - h, z[1]])), [2 * h, 0])
    if (!finitoC(d) || abs(d) < 1e-300) return null
    const paso = div(w, d)
    z = resta(z, paso)
    if (abs(paso) < 1e-13 * Math.max(1, abs(z))) return abs(g(z)) < 1e-8 ? z : null
  }
  return abs(g(z)) < 1e-10 ? z : null
}

/**
 * Ceros, polos y otras singularidades en un rectángulo: mínimos de |f| (ceros) y
 * de |1/f| (polos) en una malla, afinados por Newton; el orden sale del número
 * de vueltas y el residuo, de una integral en un circulito.
 */
export function cerosYPolos(f: FC, [xa, xb, ya, yb]: [number, number, number, number], n = 90): Singular[] {
  const hx = (xb - xa) / n
  const hy = (yb - ya) / n
  const M: number[][] = []
  for (let j = 0; j <= n; j++) {
    M.push([])
    for (let i = 0; i <= n; i++) {
      const w = f([xa + i * hx, ya + j * hy])
      M[j].push(finitoC(w) ? Math.log(abs(w) + 1e-300) : Infinity)
    }
  }
  const out: Singular[] = []
  const cerca = (z: C) => out.some((s) => abs(resta(s.z, z)) < 1e-6 * Math.max(1, abs(z)))
  const dentro = (z: C) => z[0] >= xa - hx && z[0] <= xb + hx && z[1] >= ya - hy && z[1] <= yb + hy
  const inv: FC = (z) => div([1, 0], f(z))
  for (let j = 1; j < n; j++)
    for (let i = 1; i < n; i++) {
      const v = M[j][i]
      const vecinos = [M[j - 1][i], M[j + 1][i], M[j][i - 1], M[j][i + 1], M[j - 1][i - 1], M[j + 1][i + 1], M[j - 1][i + 1], M[j + 1][i - 1]]
      const z0: C = [xa + i * hx, ya + j * hy]
      if (vecinos.every((u) => v <= u) && Number.isFinite(v)) {
        const z = newton(f, z0)
        if (z && dentro(z) && !cerca(z)) out.push({ z, tipo: 'cero', orden: null, residuo: null })
      } else if (vecinos.every((u) => v >= u) || !Number.isFinite(v)) {
        // si la malla cae justo en el polo, Newton arranca un poco al lado
        const z = newton(inv, Number.isFinite(v) ? z0 : [z0[0] + 0.13 * hx, z0[1] + 0.07 * hy])
        // un polo de verdad hace que f dé vueltas hacia atrás a su alrededor (e^(1/z) no las da)
        // y |f| crece hacia él desde todas las direcciones (en e^(1/z), por la izquierda tiende a 0)
        const explota = (p: C) =>
          [0, 1, 2, 3, 4, 5, 6, 7].every((k) => {
            const e: C = [Math.cos((k * Math.PI) / 4 + 0.3), Math.sin((k * Math.PI) / 4 + 0.3)]
            const a = abs(f([p[0] + 1e-4 * e[0], p[1] + 1e-4 * e[1]]))
            const b = abs(f([p[0] + 1e-6 * e[0], p[1] + 1e-6 * e[1]]))
            return Number.isFinite(a) && Number.isFinite(b) && b > 10 * a
          })
        const esPolo = !!z && explota(z) && (vueltas(f, z, Math.min(0.02, 0.2 * Math.min(hx, hy))) ?? 0) < 0
        // si la malla cayó justo en él, ese punto es el polo exacto
        const zp = !Number.isFinite(v) ? z0 : z
        if (z && zp && esPolo && dentro(zp) && !cerca(zp)) out.push({ z: zp, tipo: 'polo', orden: null, residuo: null })
        else if (!Number.isFinite(v) && !cerca(z0)) {
          // no es un polo: ¿esencial (el residuo tiene sentido) o un corte de rama?
          const r = 0.5 * Math.min(hx, hy)
          const vu = vueltas(f, z0, r)
          out.push({ z: z0, tipo: vu === null ? 'corte de rama' : 'singularidad esencial', orden: null, residuo: null })
        }
      }
    }
  // un «cero» que no da vueltas es un mínimo muy hondo (e^(1/z) cerca de 0 por la izquierda), no un cero
  for (let k = out.length - 1; k >= 0; k--) {
    const s = out[k]
    if (s.tipo !== 'cero') continue
    const v = vueltas(f, s.z, Math.min(0.02, 0.2 * Math.min(hx, hy)))
    if (!v) out.splice(k, 1)
  }
  // orden y residuo con un circulito que no llegue a los vecinos
  for (const s of out) {
    const otros = out.filter((t) => t !== s).map((t) => abs(resta(t.z, s.z)))
    const r = Math.min(0.1, 0.4 * Math.min(Infinity, ...otros), 0.4 * Math.min(hx, hy) * 4)
    const v = vueltas(f, s.z, r)
    if (s.tipo === 'cero' || s.tipo === 'polo') s.orden = v === null ? null : Math.abs(v)
    // Newton converge despacio a una raíz múltiple: con el orden m se afina con z ← z − m·g/g′
    if (s.orden && s.orden > 1) {
      const g = s.tipo === 'cero' ? f : (z: C) => div([1, 0], f(z))
      let z = s.z
      for (let it = 0; it < 30; it++) {
        const w = g(z)
        const h = 1e-7 * Math.max(1, abs(z))
        const d = div(resta(g([z[0] + h, z[1]]), g([z[0] - h, z[1]])), [2 * h, 0])
        if (!finitoC(w) || !finitoC(d) || abs(d) < 1e-300) break
        const paso = mul([s.orden, 0], div(w, d))
        z = resta(z, paso)
        if (abs(paso) < 1e-14 * Math.max(1, abs(z))) break
      }
      if (finitoC(z) && abs(resta(z, s.z)) < 0.1) s.z = z
    }
    if (s.tipo !== 'cero' && s.tipo !== 'corte de rama') {
      const I = integralContorno(f, s.z, r)
      s.residuo = I ? div(I, [0, 2 * Math.PI]) : null
    }
  }
  return out.sort((a, b) => a.z[0] - b.z[0] || a.z[1] - b.z[1])
}
