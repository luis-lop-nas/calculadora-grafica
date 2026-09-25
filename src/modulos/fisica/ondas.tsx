import * as THREE from 'three'
import { definir, type PropsPanel, type Vista } from '../../nucleo/tipos'
import { accion, casilla, radios } from '../../nucleo/menu'
import { Atajos, Expresion, Grupo, Interruptor, Muestra, Rango, Resultado, Segmentado } from '../../nucleo/controles'
import { brewster, critico, dispersion, elipse, fase, fresnel, paquete } from '../../lib/ondas'
import type { Pintor2D } from '../../render/pintor2d'
import type { Escena3D } from '../../render/escena3d'

type Modo = 'polarizacion' | 'fresnel' | 'grupo'

export interface EstadoOndas {
  modo: Modo
  a: number
  b: number
  delta: number
  n1: number
  n2: number
  theta: number
  omega: string
  k0: number
  sk: number
  dos: boolean
  velocidad: number
}

const DISPERSIONES = [
  { t: 'Sin dispersión ω = ck', w: '1.5*k' },
  { t: 'Aguas profundas √(gk)', w: 'sqrt(9.8*k)' },
  { t: 'Partícula libre k²/2', w: 'k^2/2' },
  { t: 'Plasma √(ωp² + k²)', w: 'sqrt(4 + k^2)' },
  { t: 'Capilares √(k³)', w: 'sqrt(k^3)' },
]

const grados = (x: number) => `${((x * 180) / Math.PI).toFixed(2)}°`
const f4 = (x: number) => (Number.isFinite(x) ? x.toFixed(4) : '—')

function leerDispersion(src: string) {
  try {
    const d = dispersion(src)
    if (!Number.isFinite(d.w(1)) || !Number.isFinite(d.dw(1))) throw new Error('ω(k) no es finita en k = 1')
    return d
  } catch (e) {
    return { error: (e as Error).message }
  }
}

function Panel({ s, set }: PropsPanel<EstadoOndas>) {
  const d = s.modo === 'grupo' ? leerDispersion(s.omega) : null
  return (
    <>
      <Grupo titulo="Ondas">
        <Segmentado valor={s.modo} opciones={[{ v: 'polarizacion', t: 'Polarización' }, { v: 'fresnel', t: 'Fresnel' }, { v: 'grupo', t: 'Fase y grupo' }]} onChange={(modo) => set({ modo })} />
      </Grupo>
      {s.modo === 'polarizacion' && (
        <Grupo titulo="E = (a cos(kz − ωt), b cos(kz − ωt + δ))">
          <Atajos
            opciones={[
              { t: 'Lineal', onClick: () => set({ a: 1, b: 0.6, delta: 0 }) },
              { t: 'Circular', onClick: () => set({ a: 1, b: 1, delta: Math.PI / 2 }) },
              { t: 'Elíptica', onClick: () => set({ a: 1, b: 0.6, delta: 1.1 }) },
            ]}
          />
          <Rango etiqueta="a" valor={s.a} min={0} max={1.5} paso={0.01} onChange={(a) => set({ a })} />
          <Rango etiqueta="b" valor={s.b} min={0} max={1.5} paso={0.01} onChange={(b) => set({ b })} />
          <Rango etiqueta="desfase δ" valor={s.delta} min={-Math.PI} max={Math.PI} paso={0.01} formato={grados} onChange={(delta) => set({ delta })} />
          <Rango etiqueta="velocidad" valor={s.velocidad} min={0} max={3} paso={0.05} onChange={(velocidad) => set({ velocidad })} />
        </Grupo>
      )}
      {s.modo === 'fresnel' && (
        <Grupo titulo="Interfaz plana">
          <Atajos
            opciones={[
              { t: 'Aire → vidrio', onClick: () => set({ n1: 1, n2: 1.52 }) },
              { t: 'Vidrio → aire', onClick: () => set({ n1: 1.52, n2: 1 }) },
              { t: 'Agua → aire', onClick: () => set({ n1: 1.33, n2: 1 }) },
            ]}
          />
          <Rango etiqueta="n₁" valor={s.n1} min={1} max={3} paso={0.01} onChange={(n1) => set({ n1 })} />
          <Rango etiqueta="n₂" valor={s.n2} min={1} max={3} paso={0.01} onChange={(n2) => set({ n2 })} />
          <Rango etiqueta="ángulo de incidencia θ" valor={s.theta} min={0} max={Math.PI / 2 - 1e-3} paso={0.002} formato={grados} onChange={(theta) => set({ theta })} />
        </Grupo>
      )}
      {s.modo === 'grupo' && (
        <Grupo titulo="Relación de dispersión">
          <Atajos opciones={DISPERSIONES.map((p) => ({ t: p.t, activo: s.omega === p.w, onClick: () => set({ omega: p.w }) }))} />
          <Expresion etiqueta="ω(k) =" valor={s.omega} variables={['k']} onChange={(omega) => set({ omega })} />
          {d && 'error' in d && <p className="aviso">{d.error}</p>}
          <Interruptor activo={s.dos} onChange={(dos) => set({ dos })}>Dos ondas (batidos) en vez de un paquete</Interruptor>
          <Rango etiqueta="k₀" valor={s.k0} min={0.5} max={6} paso={0.05} onChange={(k0) => set({ k0 })} />
          <Rango etiqueta={s.dos ? 'Δk (separación)' : 'σ_k (anchura del espectro)'} valor={s.sk} min={0.05} max={1} paso={0.01} onChange={(sk) => set({ sk })} />
          <Rango etiqueta="velocidad" valor={s.velocidad} min={0} max={3} paso={0.05} onChange={(velocidad) => set({ velocidad })} />
        </Grupo>
      )}
      <Resultado />
    </>
  )
}

/* ── polarización en 3D: la onda avanza por x de la escena; Ex hacia el espectador, Ey hacia arriba ── */

const NFLECHAS = 48
const NTRAZA = 240
const L = 1.7

function construirPolar(e: Escena3D, s: EstadoOndas) {
  e.zArriba(false)
  e.suelo()
  e.linea([[-L - 0.1, 0, 0], [L + 0.5, 0, 0]], e.color('--ink-soft'), 0.6)
  e.rotulo('z', [L + 0.7, 0, 0], 0.4)
  e.rotulo('Ey', [-L, 0.95, 0], 0.4)
  e.rotulo('Ex', [-L, 0, 0.95], 0.4)
  const esc = 0.8 / Math.max(s.a, s.b, 1e-9)
  // la elipse que recorre la punta, en el plano final
  const el: Array<[number, number, number]> = []
  for (let i = 0; i <= 120; i++) {
    const f = (i / 120) * 2 * Math.PI
    el.push([L + 0.35, esc * s.b * Math.cos(f + s.delta), esc * s.a * Math.cos(f)])
  }
  e.linea(el, e.color('--ocre'))
  const flechas = new THREE.BufferGeometry()
  flechas.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NFLECHAS * 6), 3))
  e.datos.flechas = e.add(new THREE.LineSegments(flechas, new THREE.LineBasicMaterial({ color: e.color('--accent'), transparent: true, opacity: 0.7 })))
  const traza = new THREE.BufferGeometry()
  traza.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NTRAZA * 3), 3))
  e.datos.traza = e.add(new THREE.Line(traza, new THREE.LineBasicMaterial({ color: e.color('--pos') })))
  const final = new THREE.BufferGeometry()
  final.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3))
  e.datos.final = e.add(new THREE.LineSegments(final, new THREE.LineBasicMaterial({ color: e.color('--ocre') })))
  e.datos.punta = e.punto([L + 0.35, 0, 0], e.color('--ocre'), 0.035)
  e.datos.reloj = 0
  e.datos.esc = esc
}

function animarPolar(e: Escena3D, s: EstadoOndas, _t: number, dt: number) {
  if (!e.datos.flechas) return
  e.datos.reloj += dt * 2 * s.velocidad
  const wt = e.datos.reloj
  const k = (2 * Math.PI) / L
  const esc = e.datos.esc
  const campo = (x: number): [number, number] => {
    const f = k * (x + L) - wt
    return [esc * s.a * Math.cos(f), esc * s.b * Math.cos(f + s.delta)]
  }
  const pf = (e.datos.flechas.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array
  for (let i = 0; i < NFLECHAS; i++) {
    const x = -L + (2 * L * i) / (NFLECHAS - 1)
    const [ex, ey] = campo(x)
    pf.set([x, 0, 0, x, ey, ex], 6 * i)
  }
  e.datos.flechas.geometry.attributes.position.needsUpdate = true
  const pt = (e.datos.traza.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array
  for (let i = 0; i < NTRAZA; i++) {
    const x = -L + (2 * L * i) / (NTRAZA - 1)
    const [ex, ey] = campo(x)
    pt.set([x, ey, ex], 3 * i)
  }
  e.datos.traza.geometry.attributes.position.needsUpdate = true
  const [ex, ey] = campo(L)
  const pfin = (e.datos.final.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array
  pfin.set([L + 0.35, 0, 0, L + 0.35, ey, ex])
  e.datos.final.geometry.attributes.position.needsUpdate = true
  e.datos.punta.position.set(L + 0.35, ey, ex)
}

/* ── Fresnel ── */

function dibujarFresnel(g: Pintor2D, s: EstadoOndas) {
  g.region(0, 0, 0.62, 1)
  g.ventana = { x: [-4, 94], y: [-0.08, 1.12] }
  g.ejes({ etiquetaX: 'θ (°)', etiquetaY: 'R, T' })
  const curva = (f: (t: number) => number, color: string, discontinua = false) => {
    const pts: Array<[number, number]> = []
    for (let i = 0; i <= 900; i++) {
      const t = ((Math.PI / 2 - 1e-6) * i) / 900
      pts.push([(t * 180) / Math.PI, f(t)])
    }
    g.curva(pts, g.color(color), 2, discontinua)
  }
  curva((t) => fresnel(s.n1, s.n2, t).Rs, '--pos')
  curva((t) => fresnel(s.n1, s.n2, t).Rp, '--accent')
  curva((t) => fresnel(s.n1, s.n2, t).Ts, '--pos', true)
  curva((t) => fresnel(s.n1, s.n2, t).Tp, '--accent', true)
  const tb = brewster(s.n1, s.n2)
  const tc = critico(s.n1, s.n2)
  g.curva([[(tb * 180) / Math.PI, 0], [(tb * 180) / Math.PI, 1.05]], g.color('--aux'), 1, true)
  g.texto('θ_B', (tb * 180) / Math.PI, 1.07, g.color('--aux'), { alinea: 'center' })
  if (Number.isFinite(tc)) {
    g.curva([[(tc * 180) / Math.PI, 0], [(tc * 180) / Math.PI, 1.05]], g.color('--rosa'), 1, true)
    g.texto('θ_c', (tc * 180) / Math.PI, 1.07, g.color('--rosa'), { alinea: 'center' })
  }
  const f = fresnel(s.n1, s.n2, s.theta)
  const xg = (s.theta * 180) / Math.PI
  g.curva([[xg, 0], [xg, 1]], g.color('--ink'), 1)
  for (const [v, c] of [[f.Rs, '--pos'], [f.Rp, '--accent'], [f.Ts, '--pos'], [f.Tp, '--accent']] as const) g.punto(xg, v, g.color(c), 3.5)
  g.finRegion()
  // rayos: grosor proporcional a la potencia (media de s y p: luz natural)
  g.region(0.62, 0, 0.38, 1)
  g.ventana = { x: [-1.3, 1.3], y: [-1.3, 1.3] }
  g.igualarEscala()
  g.rellenar([[-3, -3], [3, -3], [3, 0], [-3, 0]], g.color('--accent'), 0.06 + 0.06 * Math.min(1, (s.n2 - 1) / 1.5))
  g.rellenar([[-3, 0], [3, 0], [3, 3], [-3, 3]], g.color('--accent'), 0.06 * Math.min(1, (s.n1 - 1) / 1.5))
  g.curva([[-3, 0], [3, 0]], g.color('--ink-soft'), 1.2)
  g.curva([[0, -1.2], [0, 1.2]], g.color('--ink-soft'), 0.8, true)
  const R = (f.Rs + f.Rp) / 2
  const T = (f.Ts + f.Tp) / 2
  const [si, ci] = [Math.sin(s.theta), Math.cos(s.theta)]
  g.curva([[-1.1 * si, 1.1 * ci], [0, 0]], g.color('--ink'), 3)
  if (R > 1e-4) g.curva([[0, 0], [1.1 * si, 1.1 * ci]], g.color('--pos'), 0.6 + 5 * R)
  if (!f.total && T > 1e-4) g.curva([[0, 0], [1.1 * Math.sin(f.thetaT), -1.1 * Math.cos(f.thetaT)]], g.color('--aux'), 0.6 + 5 * T)
  g.texto(`n₁ = ${s.n1.toFixed(2)}`, -1.2, 1.15, g.color('--ink-soft'))
  g.texto(`n₂ = ${s.n2.toFixed(2)}`, -1.2, -1.15, g.color('--ink-soft'))
  g.finRegion()
}

/* ── fase y grupo ── */

let relojGrupo = 0
let ultimo = 0

function dibujarGrupo(g: Pintor2D, s: EstadoOndas, t: number) {
  const d = leerDispersion(s.omega)
  g.ventana = { x: [-5, 45], y: [-2.4, 2.4] }
  g.ejes({ etiquetaX: 'x', etiquetaY: 'ψ' })
  if ('error' in d) return
  const dtReal = Math.min(0.05, Math.max(0, t - ultimo))
  ultimo = t
  relojGrupo += dtReal * s.velocidad * 2
  const vg = d.dw(s.k0)
  const vf = d.w(s.k0) / s.k0
  const vmax = Math.max(Math.abs(vg), Math.abs(vf), 0.1)
  const T = 40 / vmax
  if (relojGrupo > T) relojGrupo = 0
  const tt = relojGrupo
  const xs: number[] = []
  for (let i = 0; i <= 700; i++) xs.push(-5 + (50 * i) / 700)
  const re: Array<[number, number]> = []
  const env: Array<[number, number]> = []
  const envm: Array<[number, number]> = []
  if (s.dos) {
    const [k1, k2] = [s.k0 - s.sk / 2, s.k0 + s.sk / 2]
    const [w1, w2] = [d.w(k1), d.w(k2)]
    for (const x of xs) {
      re.push([x, Math.cos(k1 * x - w1 * tt) + Math.cos(k2 * x - w2 * tt)])
      const a = 2 * Math.abs(Math.cos(0.5 * ((k2 - k1) * x - (w2 - w1) * tt)))
      env.push([x, a])
      envm.push([x, -a])
    }
  } else {
    // normalizado para que el pico inicial valga 2
    const norma = 2 / Math.hypot(...paquete(d.w, s.k0, s.sk, 0, 0))
    for (const x of xs) {
      const [r, i] = paquete(d.w, s.k0, s.sk, x, tt)
      re.push([x, norma * r])
      env.push([x, norma * Math.hypot(r, i)])
      envm.push([x, -norma * Math.hypot(r, i)])
    }
  }
  g.curva(env, g.color('--pos'), 1.4, true)
  g.curva(envm, g.color('--pos'), 1.4, true)
  g.curva(re, g.color('--accent'), 1.8)
  // una cresta (punto de fase constante) y el centro del grupo
  const xf = ((vf * tt) % 50 + 50) % 50 - 5
  const xgp = vg * tt
  const yf = re.reduce((mejor, p) => (Math.abs(p[0] - xf) < Math.abs(mejor[0] - xf) ? p : mejor), re[0])[1]
  g.punto(xf, yf, g.color('--aux'), 5)
  g.curva([[xgp, -2.3], [xgp, 2.3]], g.color('--pos'), 1.2)
  g.texto('v_g', xgp, 2.2, g.color('--pos'), { dx: 5 })
  g.texto('v_f', xf, yf, g.color('--aux'), { dx: 6, dy: -10 })
}

const VISTAS: Record<Modo, Vista<EstadoOndas>> = {
  polarizacion: { tipo: '3d', clave: 'polarizacion', pesada: true, camara: { theta: 0.8, phi: 1.15, r: 5.8 }, construir: construirPolar, animar: animarPolar },
  fresnel: { tipo: '2d', clave: 'fresnel', navegable: false, dibujar: (g, st) => dibujarFresnel(g, st) },
  grupo: { tipo: '2d', clave: 'grupo', navegable: false, animada: () => true, dibujar: (g, st, t) => dibujarGrupo(g, st, t ?? 0) },
}

function lecturas(s: EstadoOndas): Array<[string, string]> {
  if (s.modo === 'polarizacion') {
    const el = elipse(s.a, s.b, s.delta)
    const e = el.S[0] > 0 ? el.semiMenor / el.semiMayor : 0
    const tipo = el.S[0] === 0 ? 'no hay campo' : e < 1e-9 ? 'lineal' : Math.abs(e - 1) < 1e-9 ? 'circular' : 'elíptica'
    const giro = Math.abs(el.S[3]) < 1e-12 ? '—' : el.S[3] > 0 ? 'antihorario visto de frente (S₃ > 0)' : 'horario visto de frente (S₃ < 0)'
    const S0 = el.S[0] || 1
    return [
      ['Polarización', tipo],
      ['Sentido de giro', giro],
      ['Orientación ψ del eje mayor', grados(el.psi)],
      ['Elipticidad χ', grados(el.chi)],
      ['Semiejes', `${el.semiMayor.toFixed(4)} y ${el.semiMenor.toFixed(4)}`],
      ['Stokes (S₁, S₂, S₃)/S₀', `(${(el.S[1] / S0).toFixed(3)}, ${(el.S[2] / S0).toFixed(3)}, ${(el.S[3] / S0).toFixed(3)})`],
    ]
  }
  if (s.modo === 'fresnel') {
    const f = fresnel(s.n1, s.n2, s.theta)
    const filas: Array<[string, string]> = [
      ['θ transmitido', f.total ? 'reflexión total' : grados(f.thetaT)],
      ['R_s, R_p', `${f4(f.Rs)}, ${f4(f.Rp)}`],
      ['T_s, T_p', `${f4(f.Ts)}, ${f4(f.Tp)}`],
      ['R + T (s y p)', `${f4(f.Rs + f.Ts)}, ${f4(f.Rp + f.Tp)}`],
      ['Brewster θ_B = atan(n₂/n₁)', grados(brewster(s.n1, s.n2))],
      ['Ángulo crítico', s.n2 < s.n1 ? grados(critico(s.n1, s.n2)) : 'no hay (n₂ ≥ n₁)'],
    ]
    if (f.total) filas.push(['Desfases al reflejar (s, p)', `${grados(fase(f.rs))}, ${grados(fase(f.rp))}`])
    else filas.push(['r_s, r_p (amplitud)', `${f4(f.rs[0])}, ${f4(f.rp[0])}`])
    return filas
  }
  const d = leerDispersion(s.omega)
  if ('error' in d) return [['No se puede', d.error]]
  const vf = d.w(s.k0) / s.k0
  const vg = d.dw(s.k0)
  const filas: Array<[string, string]> = [
    ['ω(k₀)', f4(d.w(s.k0))],
    ['velocidad de fase ω/k', f4(vf)],
    ['velocidad de grupo dω/dk', f4(vg)],
    ['v_g / v_f', f4(vg / vf)],
  ]
  if (s.dos) {
    const dw = d.w(s.k0 + s.sk / 2) - d.w(s.k0 - s.sk / 2)
    filas.push(['Periodo del batido 2π/|Δω|', f4((2 * Math.PI) / Math.abs(dw))], ['Longitud del batido 2π/Δk', f4((2 * Math.PI) / s.sk)], ['Velocidad de la envolvente Δω/Δk', f4(dw / s.sk)])
  }
  return filas
}

export default definir<EstadoOndas>({
  id: 'ondas',
  area: 'fisica',
  resumen: 'Ondas: polarización lineal, circular y elíptica con Stokes, coeficientes de Fresnel y velocidades de fase y de grupo',
  corto: 'Polarización y Fresnel',
  titulo: 'Polarización y <i>Fresnel</i>',
  entradilla: 'La elipse de polarización, lo que refleja y transmite una interfaz, y por qué el grupo no va a la velocidad de las crestas.',
  inicial: { modo: 'polarizacion', a: 1, b: 0.6, delta: 1.1, n1: 1, n2: 1.52, theta: 0.9, omega: 'sqrt(9.8*k)', k0: 2, sk: 0.25, dos: false, velocidad: 1 },
  Panel,
  menu: (s) => ({
    ejemplos: DISPERSIONES.map((p) => ({ t: `Dispersión · ${p.t}`, tipo: 'radio' as const, activo: s.modo === 'grupo' && s.omega === p.w, hacer: () => ({ modo: 'grupo' as Modo, omega: p.w }) })),
    acciones: [
      radios<EstadoOndas, Modo>('Fenómeno', [{ v: 'polarizacion', t: 'Polarización' }, { v: 'fresnel', t: 'Fresnel (reflexión y refracción)' }, { v: 'grupo', t: 'Velocidad de fase y de grupo' }], s.modo, (modo) => ({ modo })),
      accion<EstadoOndas>('Polarización lineal', () => ({ modo: 'polarizacion', a: 1, b: 1, delta: 0 })),
      accion<EstadoOndas>('Polarización circular', () => ({ modo: 'polarizacion', a: 1, b: 1, delta: Math.PI / 2 })),
      casilla<EstadoOndas>('Dos ondas (batidos)', s.dos, (dos) => ({ dos })),
    ],
  }),
  resultadoEnPanel: true,
  rotulo: (s) => ({ nombre: { polarizacion: 'Polarización', fresnel: 'Fresnel', grupo: 'Fase y grupo' }[s.modo], apunte: s.modo === 'grupo' ? `ω = ${s.omega}` : '' }),
  formula: (s) =>
    s.modo === 'polarizacion'
      ? [String.raw`\tan 2\psi=\frac{2ab\cos\delta}{a^2-b^2},\qquad \sin 2\chi=\frac{2ab\sin\delta}{a^2+b^2}`, String.raw`S_0^2=S_1^2+S_2^2+S_3^2`]
      : s.modo === 'fresnel'
        ? [String.raw`r_s=\frac{n_1\cos\theta_i-n_2\cos\theta_t}{n_1\cos\theta_i+n_2\cos\theta_t}`, String.raw`r_p=\frac{n_2\cos\theta_i-n_1\cos\theta_t}{n_2\cos\theta_i+n_1\cos\theta_t}`, String.raw`T=\frac{n_2\cos\theta_t}{n_1\cos\theta_i}|t|^2,\quad R+T=1`]
        : [String.raw`v_f=\frac{\omega}{k},\qquad v_g=\frac{d\omega}{dk}`],
  lecturas,
  leyenda: (s) =>
    s.modo === 'polarizacion' ? (
      <>
        <Muestra color="var(--accent)">E(z) en el instante</Muestra>
        <Muestra color="var(--pos)">punta de E</Muestra>
        <Muestra color="var(--ocre)">elipse de polarización</Muestra>
      </>
    ) : s.modo === 'fresnel' ? (
      <>
        <Muestra color="var(--pos)">s (continua R, discontinua T)</Muestra>
        <Muestra color="var(--accent)">p</Muestra>
        <Muestra color="var(--aux)">Brewster / transmitido</Muestra>
        <Muestra color="var(--rosa)">ángulo crítico</Muestra>
      </>
    ) : (
      <>
        <Muestra color="var(--accent)">Re ψ</Muestra>
        <Muestra color="var(--pos)">envolvente y centro (v_g)</Muestra>
        <Muestra color="var(--aux)">una cresta (v_f)</Muestra>
      </>
    ),
  comparaciones: [{ t: 'Aire → vidrio frente a vidrio → aire', a: { modo: 'fresnel', n1: 1, n2: 1.52 }, b: { modo: 'fresnel', n1: 1.52, n2: 1 } }],
  vista: (s) => VISTAS[s.modo],
})
