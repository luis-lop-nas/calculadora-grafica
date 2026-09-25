import * as THREE from 'three'
import { definir, type PropsPanel } from '../../nucleo/tipos'
import { accion, casilla, radios } from '../../nucleo/menu'
import { Boton, Grupo, Interruptor, Rango } from '../../nucleo/controles'

interface S {
  sigma: number
  k: number
  jugando: boolean
  reinicios: number
}

const M = 700
const X = 30
const X0 = -16
const reloj = { t: 0 }

/** ψ(x,t) del paquete gaussiano libre, ħ = m = 1. Devuelve [Re, Im]. */
function psi(x: number, t: number, sigma: number, k: number): [number, number] {
  const s2 = sigma * sigma
  const tau = t / s2
  const mod = Math.pow(1 + tau * tau, -0.25)
  const arg0 = -0.5 * Math.atan(tau)
  const d = x - X0 - k * t
  const den = 1 + tau * tau
  const re = -(d * d) / (2 * s2 * den)
  const im = (d * d * tau) / (2 * s2 * den)
  const fase = arg0 + im + k * (x - X0 - (k * t) / 2)
  const a = mod * Math.exp(re)
  return [a * Math.cos(fase), a * Math.sin(fase)]
}

function Panel({ s, set }: PropsPanel<S>) {
  return (
    <>
      <Grupo titulo="Paquete inicial">
        <Rango
          etiqueta="Anchura inicial σ"
          valor={s.sigma}
          min={1}
          max={6}
          paso={0.1}
          formato={(v) => v.toFixed(1)}
          onChange={(sigma) => set({ sigma })}
        />
        <Rango
          etiqueta="Número de onda k"
          valor={s.k}
          min={-3}
          max={3}
          paso={0.1}
          formato={(v) => v.toFixed(1)}
          onChange={(k) => set({ k })}
        />
        <div className="interruptores">
          <Interruptor activo={s.jugando} onChange={(jugando) => set({ jugando })}>
            Animación
          </Interruptor>
          <Boton
            onClick={() => {
              reloj.t = 0
              set({ reinicios: s.reinicios + 1 })
            }}
          >
            Reiniciar
          </Boton>
        </div>
      </Grupo>
    </>
  )
}

export default definir<S>({
  id: 'paquete',
  area: 'cuantica',
  resumen: 'Paquete de ondas y dispersión',
  corto: 'Paquete de ondas',
  titulo: 'Paquete gaussiano',
  entradilla: 'Partícula libre en 1D: la hélice es ψ compleja y la curva gris su densidad.',
  inicial: { sigma: 2.5, k: 1.5, jugando: true, reinicios: 0 },
  Panel,
  menu: (s) => ({
    acciones: [
      casilla<S>('Reproducir', s.jugando, (jugando) => ({ jugando })),
      accion<S>('Reiniciar', (t) => ({ reinicios: t.reinicios + 1 })),
      radios<S, number>('Anchura σ', [0.5, 1, 1.5, 2, 3].map((v) => ({ v, t: String(v).replace('.', ',') })), s.sigma, (sigma) => ({ sigma })),
    ],
  }),
  lecturasVivas: true,
  rotulo: () => ({ nombre: 'Paquete gaussiano', apunte: 'partícula libre, ħ = m = 1' }),
  formula: () => [
    String.raw`\psi(x,t)=(1+i\tau)^{-1/2}\exp\left[-\frac{(x-x_0-kt)^2}{2\sigma^2(1+i\tau)}\right]e^{ik(x-x_0-kt/2)}`,
    String.raw`\tau=\frac{\hbar t}{m\sigma^2},\qquad \sigma(t)=\sigma\sqrt{1+\tau^2}`,
  ],
  lecturas: (s) => {
    const t = reloj.t
    const st = s.sigma * Math.sqrt(1 + (t / s.sigma ** 2) ** 2)
    return [
      ['t', t.toFixed(2)],
      ['Centro ⟨x⟩', (X0 + s.k * t).toFixed(2)],
      ['Anchura σ(t)', st.toFixed(2)],
      ['⟨p⟩ = ħk', s.k.toFixed(1)],
      ['Velocidad de grupo', s.k.toFixed(1)],
      ['Δx · Δp', ((st / Math.SQRT2) * (1 / (s.sigma * Math.SQRT2))).toFixed(3)],
    ]
  },
  leyenda: () => (
    <>
      <span>
        <span className="rueda" />
        color = fase arg ψ
      </span>
      <span>curva gris = |ψ|²</span>
    </>
  ),
  vista: {
    tipo: '3d',
    camara: { theta: 0.55, phi: 1.0, r: 3.4 },
    construir(e, s) {
      e.zArriba(false)
      e.suelo()
      e.linea([
        [-1.1, 0, 0],
        [1.1, 0, 0],
      ])
      e.linea([
        [0, -0.8, 0],
        [0, 0.8, 0],
      ])
      e.linea([
        [0, 0, -0.8],
        [0, 0, 0.8],
      ])
      e.linea([
        [-1, -0.7, -0.9],
        [1, -0.7, -0.9],
      ])
      e.rotulo('x', [1.2, 0, 0])
      e.rotulo('Re ψ', [0, 0.9, 0], 0.34)
      e.rotulo('Im ψ', [0, 0, 0.95], 0.34)
      e.rotulo('|ψ|²', [-1.1, -0.6, -0.9], 0.3)

      const cinta = new THREE.BufferGeometry()
      cinta.setAttribute('position', new THREE.BufferAttribute(new Float32Array(M * 2 * 3), 3))
      cinta.setAttribute('color', new THREE.BufferAttribute(new Float32Array(M * 2 * 3), 3))
      const idx: number[] = []
      for (let i = 0; i < M - 1; i++) {
        const a = 2 * i
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
      }
      cinta.setIndex(idx)
      e.datos.cinta = e.add(
        new THREE.Mesh(
          cinta,
          new THREE.MeshBasicMaterial({
            vertexColors: true,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.45,
            depthWrite: false,
          }),
        ),
      )

      const helice = new THREE.BufferGeometry()
      helice.setAttribute('position', new THREE.BufferAttribute(new Float32Array(M * 3), 3))
      helice.setAttribute('color', new THREE.BufferAttribute(new Float32Array(M * 3), 3))
      e.datos.helice = e.add(new THREE.Line(helice, new THREE.LineBasicMaterial({ vertexColors: true })))

      const dens = new THREE.BufferGeometry()
      dens.setAttribute('position', new THREE.BufferAttribute(new Float32Array(M * 3), 3))
      e.datos.dens = e.add(new THREE.Line(dens, new THREE.LineBasicMaterial({ color: e.color('--ink-soft') })))
      e.datos.tmp = new THREE.Color()
      refrescar(e, s)
    },
    animar(e, s, _t, dt) {
      if (s.jugando) {
        reloj.t += dt * 3
        const centro = X0 + s.k * reloj.t
        if (Math.abs(centro) > 34 || reloj.t > 70) reloj.t = 0
      }
      refrescar(e, s)
    },
  },
})

function refrescar(e: any, s: S) {
  const cinta = e.datos.cinta as THREE.Mesh | undefined
  if (!cinta) return
  const helice = e.datos.helice as THREE.Line
  const dens = e.datos.dens as THREE.Line
  const c = e.datos.tmp as THREE.Color
  const A = 0.65
  const rp = (cinta.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array
  const rc = (cinta.geometry.attributes.color as THREE.BufferAttribute).array as Float32Array
  const hp = (helice.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array
  const hc = (helice.geometry.attributes.color as THREE.BufferAttribute).array as Float32Array
  const dp = (dens.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array
  for (let i = 0; i < M; i++) {
    const u = -1 + (2 * i) / (M - 1)
    const [re, im] = psi(u * X, reloj.t, s.sigma, s.k)
    const amp = Math.hypot(re, im)
    c.setHSL(((Math.atan2(im, re) / (2 * Math.PI)) + 1) % 1, 0.75, 0.55)
    hp.set([u, re * A, im * A], 3 * i)
    hc.set([c.r, c.g, c.b], 3 * i)
    rp.set([u, 0, 0, u, re * A, im * A], 6 * i)
    rc.set([c.r, c.g, c.b, c.r, c.g, c.b], 6 * i)
    dp.set([u, -0.7 + amp * amp * 1.1, -0.9], 3 * i)
  }
  for (const o of [cinta, helice, dens]) {
    const g = o.geometry as THREE.BufferGeometry
    g.attributes.position.needsUpdate = true
    if (g.attributes.color) g.attributes.color.needsUpdate = true
    g.computeBoundingSphere()
  }
}
