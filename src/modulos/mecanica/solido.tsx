import * as THREE from 'three'
import { definir, type PropsPanel, type Vista3D } from '../../nucleo/tipos'
import { accion, capaFija, capaVer, casilla, radios, submenu } from '../../nucleo/menu'
import { Atajos, Expresion, Grupo, Interruptor, Muestra, Rango, Resultado, Segmentado } from '../../nucleo/controles'
import { interpolarHermite } from '../../lib/numerico'
import { integrar, type Trayectoria } from '../../lib/mecanica'
import {
  cajaEquivalente, estadoPeonza, invariantesEuler, leerPiezas, numericoPeonza, periodoEuler, precesionUniforme,
  retornos, rotacionEuler, rotacionLibre, tensor, type Pieza, type Tensor, type V3,
} from '../../lib/solido'
import type { Escena3D } from '../../render/escena3d'

type Modo = 'tensor' | 'euler' | 'peonza'

export interface EstadoSolido {
  modo: Modo
  piezas: string
  elipsoide: boolean
  // rotación libre
  I1: number
  I2: number
  I3: number
  w1: number
  w2: number
  w3e: number
  // peonza
  ia: number
  ic: number
  mgl: number
  theta0: number
  phid0: number
  thetad0: number
  w3: number
  tMax: number
  velocidad: number
}

const PIEZAS = [
  { t: 'En L', src: 'caja m=1.5 a=1.2 b=0.3 c=0.2 en (0.6, 0.15, 0.1); caja m=0.8 a=0.3 b=0.9 c=0.2 en (0.15, 0.75, 0.1)' },
  { t: 'Mancuerna', src: 'esfera m=1 r=0.25 en (-0.6, 0, 0); esfera m=1 r=0.25 en (0.6, 0, 0); varilla m=0.2 l=0.9 eje=x' },
  { t: 'Martillo', src: 'varilla m=0.3 l=1.4 eje=z en (0, 0, 0.7); cilindro m=1.2 r=0.12 h=0.5 eje=x en (0, 0, 1.4)' },
  { t: 'Cono', src: 'cono m=1 r=0.4 h=1.2 eje=z' },
]

const EULER: Array<{ t: string; v: Partial<EstadoSolido> }> = [
  { t: 'Raqueta (eje intermedio)', v: { I1: 1, I2: 1.8, I3: 2.4, w1: 0.02, w2: 3, w3e: 0.02 } },
  { t: 'Eje mayor', v: { I1: 1, I2: 1.8, I3: 2.4, w1: 0.3, w2: 0.2, w3e: 3 } },
  { t: 'Simétrico', v: { I1: 1.3, I2: 1.3, I3: 2.2, w1: 0.8, w2: 0, w3e: 2.5 } },
]

const PEONZA: Array<{ t: string; v: Partial<EstadoSolido> }> = [
  { t: 'Cabeceo', v: { theta0: 0.6, phid0: 0.4, thetad0: 0, w3: 12 } },
  { t: 'Bucles', v: { theta0: 0.6, phid0: -0.9, thetad0: 0, w3: 12 } },
  { t: 'Cúspides (se suelta)', v: { theta0: 0.6, phid0: 0, thetad0: 0, w3: 12 } },
]

function leer(s: EstadoSolido): { piezas: Pieza[]; T: Tensor } | { error: string } {
  try {
    const piezas = leerPiezas(s.piezas)
    return { piezas, T: tensor(piezas) }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

const inercias = (s: EstadoSolido): V3 => [s.I1, s.I2, s.I3]
const omega0 = (s: EstadoSolido): V3 => [s.w1, s.w2, s.w3e]
const peonza = (s: EstadoSolido) => ({ ia: s.ia, ic: s.ic, mgl: s.mgl, theta0: s.theta0, phid0: s.phid0, thetad0: s.thetad0, w3: s.w3 })

/** Cada trayectoria se integra una vez por juego de parámetros. */
const cache = new Map<string, Trayectoria | { error: string }>()
function trayectoria(s: EstadoSolido): Trayectoria | { error: string } {
  const clave = s.modo === 'euler' ? JSON.stringify([inercias(s), omega0(s), s.tMax]) : JSON.stringify([peonza(s), s.tMax])
  let tr = cache.get(clave)
  if (!tr) {
    try {
      if (s.modo === 'euler') {
        const I = inercias(s)
        if (!cajaEquivalente(I)) throw new Error('ningún sólido tiene esos momentos: cada uno tiene que ser ≤ la suma de los otros dos')
        tr = rotacionLibre(I, omega0(s), s.tMax)
      } else {
        if (Math.sin(s.theta0) < 1e-3) throw new Error('con θ₀ = 0 los ángulos de Euler son singulares: inclínala un poco')
        tr = integrar(numericoPeonza(peonza(s)), estadoPeonza(peonza(s)), s.tMax)
      }
    } catch (e) {
      tr = { error: (e as Error).message }
    }
    if (cache.size > 40) cache.clear()
    cache.set(clave, tr)
  }
  return tr
}

const deg = (x: number) => `${((x * 180) / Math.PI).toFixed(3)}°`

function Panel({ s, set }: PropsPanel<EstadoSolido>) {
  const pu = s.modo === 'peonza' ? precesionUniforme(peonza(s)) : null
  return (
    <>
      <Grupo titulo="Sólido">
        <Segmentado columnas={3} valor={s.modo} opciones={[{ v: 'tensor', t: 'Tensor' }, { v: 'euler', t: 'Libre' }, { v: 'peonza', t: 'Peonza' }]} onChange={(modo) => set({ modo })} />
        {s.modo === 'tensor' && (
          <>
            <Atajos opciones={PIEZAS.map((p) => ({ t: p.t, activo: s.piezas === p.src, onClick: () => set({ piezas: p.src }) }))} />
            <Expresion
              etiqueta="piezas"
              valor={s.piezas}
              variables={[]}
              piezas={['caja m= a= b= c=', 'cilindro m= r= h= eje=z', 'esfera m= r=', 'cascara m= r=', 'varilla m= l= eje=x', 'cono m= r= h= eje=z', 'punto m=', ' en (0, 0, 0)', '; ']}
              onChange={(piezas) => set({ piezas })}
              comprobar={(v) => {
                try {
                  leerPiezas(v)
                  return null
                } catch (e) {
                  return (e as Error).message
                }
              }}
              previa={() => null}
            />
            <Interruptor activo={s.elipsoide} onChange={(elipsoide) => set({ elipsoide })}>Elipsoide de inercia</Interruptor>
          </>
        )}
        {s.modo === 'euler' && (
          <>
            <Atajos opciones={EULER.map((p) => ({ t: p.t, onClick: () => set(p.v) }))} />
            <Rango etiqueta="I₁" valor={s.I1} min={0.2} max={5} paso={0.05} onChange={(I1) => set({ I1 })} />
            <Rango etiqueta="I₂" valor={s.I2} min={0.2} max={5} paso={0.05} onChange={(I2) => set({ I2 })} />
            <Rango etiqueta="I₃" valor={s.I3} min={0.2} max={5} paso={0.05} onChange={(I3) => set({ I3 })} />
            <Rango etiqueta="ω₁(0)" valor={s.w1} min={-4} max={4} paso={0.01} onChange={(w1) => set({ w1 })} />
            <Rango etiqueta="ω₂(0)" valor={s.w2} min={-4} max={4} paso={0.01} onChange={(w2) => set({ w2 })} />
            <Rango etiqueta="ω₃(0)" valor={s.w3e} min={-4} max={4} paso={0.01} onChange={(w3e) => set({ w3e })} />
          </>
        )}
        {s.modo === 'peonza' && (
          <>
            <Atajos opciones={PEONZA.map((p) => ({ t: p.t, onClick: () => set(p.v) }))} />
            <Rango etiqueta="I₁ (transversal, desde la punta)" valor={s.ia} min={0.2} max={4} paso={0.05} onChange={(ia) => set({ ia })} />
            <Rango etiqueta="I₃ (del eje)" valor={s.ic} min={0.1} max={4} paso={0.05} onChange={(ic) => set({ ic })} />
            <Rango etiqueta="m g l" valor={s.mgl} min={0} max={10} paso={0.1} onChange={(mgl) => set({ mgl })} />
            <Rango etiqueta="θ₀" valor={s.theta0} min={0.05} max={3} paso={0.01} formato={deg} onChange={(theta0) => set({ theta0 })} />
            <Rango etiqueta="φ̇₀" valor={s.phid0} min={-3} max={3} paso={0.01} onChange={(phid0) => set({ phid0 })} />
            <Rango etiqueta="θ̇₀" valor={s.thetad0} min={-3} max={3} paso={0.01} onChange={(thetad0) => set({ thetad0 })} />
            <Rango etiqueta="ω₃ (giro propio)" valor={s.w3} min={0} max={30} paso={0.1} onChange={(w3) => set({ w3 })} />
            <Atajos opciones={[{ t: pu === null ? 'Precesión uniforme: gira más deprisa' : 'Precesión uniforme', onClick: () => pu !== null && set({ phid0: pu, thetad0: 0 }) }]} />
          </>
        )}
        {s.modo !== 'tensor' && (
          <>
            <Rango etiqueta="Ver t hasta" valor={s.tMax} min={5} max={120} paso={1} onChange={(tMax) => set({ tMax })} />
            <Rango etiqueta="velocidad" valor={s.velocidad} min={0.1} max={3} paso={0.05} onChange={(velocidad) => set({ velocidad })} />
          </>
        )}
      </Grupo>
      <Resultado />
    </>
  )
}

/* ── escena ── */

const COLOR_EJES = ['--pos', '--aux', '--rosa']

function geometriaPieza(p: Pieza): THREE.BufferGeometry {
  const { d } = p
  let g: THREE.BufferGeometry
  switch (p.tipo) {
    case 'caja':
      return new THREE.BoxGeometry(d.a, d.b, d.c)
    case 'esfera':
    case 'cascara':
      return new THREE.SphereGeometry(d.r, 40, 24)
    case 'punto':
      return new THREE.SphereGeometry(0.05, 20, 12)
    case 'cilindro':
      g = new THREE.CylinderGeometry(d.r, d.r, d.h, 40)
      break
    case 'varilla':
      g = new THREE.CylinderGeometry(0.018, 0.018, d.l, 12)
      break
    case 'cono':
      // centro de masas a h/4 de la base: la geometría de three va centrada a media altura
      g = new THREE.ConeGeometry(d.r, d.h, 40)
      g.translate(0, d.h / 4, 0)
      break
  }
  // three levanta los cilindros sobre y; se llevan al eje pedido
  if (p.eje === 'x') g.rotateZ(-Math.PI / 2)
  else if (p.eje === 'z') g.rotateX(Math.PI / 2)
  return g
}

function extension(piezas: Pieza[]): number {
  let r = 0.3
  for (const p of piezas) {
    const tam = Math.max(0.05, ...Object.values(p.d).map((v) => (p.tipo === 'esfera' || p.tipo === 'cascara' || p.tipo === 'cilindro' || p.tipo === 'cono') ? v : v / 2))
    r = Math.max(r, Math.hypot(...p.en) + tam)
  }
  return r
}

function escenaTensor(e: Escena3D, s: EstadoSolido) {
  const r = leer(s)
  e.ejes(1.2, ['x', 'y', 'z'], { rejilla: true })
  if ('error' in r) return
  const { piezas, T } = r
  const k = 1 / extension(piezas)
  const grupo = new THREE.Group()
  grupo.scale.setScalar(k)
  for (const p of piezas) {
    const malla = new THREE.Mesh(
      geometriaPieza(p),
      new THREE.MeshStandardMaterial({ color: e.color('--accent'), roughness: 0.5, transparent: true, opacity: p.tipo === 'cascara' ? 0.3 : 0.6, depthWrite: false, side: THREE.DoubleSide }),
    )
    malla.position.set(...p.en)
    grupo.add(malla)
  }
  e.add(grupo)
  const cm = T.cm.map((x) => x * k) as V3
  e.punto(cm, e.color('--ink'), 0.03)
  for (let i = 0; i < 3; i++) {
    const v = T.ejes.map((f) => f[i] * 0.9) as V3
    e.flecha(v, e.color(COLOR_EJES[i]), cm, 0.01)
    e.flecha(v.map((x) => -x) as V3, e.color(COLOR_EJES[i]), cm, 0.006)
    e.rotulo(`I${'₁₂₃'[i]}`, [cm[0] + v[0] * 1.12, cm[1] + v[1] * 1.12, cm[2] + v[2] * 1.12], 0.2)
  }
  if (s.elipsoide && T.principales[0] > 1e-12) {
    // xᵀ I x = cte: semiejes ∝ 1/√Iᵢ, escalados para que el mayor mida 0,8
    const semi = T.principales.map((l) => Math.sqrt(T.principales[0] / l) * 0.8)
    const el = new THREE.Mesh(new THREE.SphereGeometry(1, 36, 20), new THREE.MeshBasicMaterial({ color: e.color('--ocre'), wireframe: true, transparent: true, opacity: 0.35 }))
    // base de ejes principales con det = +1 para que sea una rotación
    const E = T.ejes.map((f) => [...f])
    const det = E[0][0] * (E[1][1] * E[2][2] - E[1][2] * E[2][1]) - E[0][1] * (E[1][0] * E[2][2] - E[1][2] * E[2][0]) + E[0][2] * (E[1][0] * E[2][1] - E[1][1] * E[2][0])
    if (det < 0) for (const f of E) f[2] = -f[2]
    orientar(el, E)
    el.scale.set(semi[0], semi[1], semi[2])
    el.position.set(...cm)
    e.add(el)
  }
}

function flechaMovil(e: Escena3D, color: string) {
  const f = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(), 1, e.color(color).getHex(), 0.12, 0.06)
  return e.add(f)
}

function ponerFlecha(f: THREE.ArrowHelper, v: number[], largo: number) {
  const d = new THREE.Vector3(v[0], v[1], v[2])
  if (d.length() < 1e-9) return
  f.setDirection(d.normalize())
  f.setLength(largo, Math.min(0.12, largo * 0.3), 0.06)
}

function orientar(o: THREE.Object3D, R: number[][]) {
  const m = new THREE.Matrix4().set(R[0][0], R[0][1], R[0][2], 0, R[1][0], R[1][1], R[1][2], 0, R[2][0], R[2][1], R[2][2], 0, 0, 0, 0, 1)
  o.quaternion.setFromRotationMatrix(m)
}

function escenaEuler(e: Escena3D, s: EstadoSolido) {
  e.ejes(1.3, ['x', 'y', 'z'])
  const tr = trayectoria(s)
  const lados = cajaEquivalente(inercias(s))
  if ('error' in tr || !lados) return
  const k = 1.3 / Math.max(...lados)
  const cuerpo = new THREE.Group()
  cuerpo.add(new THREE.Mesh(new THREE.BoxGeometry(lados[0] * k, lados[1] * k, lados[2] * k), new THREE.MeshStandardMaterial({ color: e.color('--accent'), roughness: 0.5, transparent: true, opacity: 0.55, depthWrite: false })))
  cuerpo.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(lados[0] * k, lados[1] * k, lados[2] * k)), new THREE.LineBasicMaterial({ color: e.color('--ink') })))
  for (let i = 0; i < 3; i++) {
    const p = [0, 0, 0]
    p[i] = 0.5 * lados[i] * k + 0.15
    cuerpo.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(...p)]), new THREE.LineBasicMaterial({ color: e.color(COLOR_EJES[i]) })))
  }
  e.add(cuerpo)
  const I = inercias(s)
  const { L } = invariantesEuler(I, tr.y[0])
  const Ln = Math.hypot(...L)
  // L es fijo en el espacio; ω recorre la herpolodia, en el plano invariable ω·L̂ = 2E/|L|
  const escW = 1.2 / Math.max(1e-9, ...tr.y.map((y) => Math.hypot(y[0], y[1], y[2])))
  if (Ln > 0) e.flecha(L.map((x) => (1.35 * x) / Ln) as V3, e.color('--pos'), [0, 0, 0], 0.014)
  const traza: Array<[number, number, number]> = []
  const pasos = Math.min(4000, 40 * s.tMax)
  for (let i = 0; i <= pasos; i++) {
    const y = interpolarHermite(tr, (s.tMax * i) / pasos)
    const R = y.slice(3)
    traza.push([0, 1, 2].map((r) => escW * (R[3 * r] * y[0] + R[3 * r + 1] * y[1] + R[3 * r + 2] * y[2])) as [number, number, number])
  }
  e.linea(traza, e.color('--ocre'), 0.7)
  e.datos.cuerpo = cuerpo
  e.datos.w = flechaMovil(e, '--accent')
  e.datos.escW = escW
}

function escenaPeonza(e: Escena3D, s: EstadoSolido) {
  e.ejes(1.3, ['x', 'y', 'z'], { rejilla: true })
  const tr = trayectoria(s)
  if ('error' in tr) return
  const h = 1.1
  const cuerpo = new THREE.Group()
  const cono = new THREE.ConeGeometry(0.32, h, 40)
  cono.rotateX(Math.PI)
  cono.translate(0, h / 2, 0)
  cono.rotateX(Math.PI / 2)
  cuerpo.add(new THREE.Mesh(cono, new THREE.MeshStandardMaterial({ color: e.color('--accent'), roughness: 0.45 })))
  // una marca en el borde para que se vea el giro propio ψ
  const marca = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.05), new THREE.MeshStandardMaterial({ color: e.color('--pos') }))
  marca.position.set(0.3, 0, h)
  cuerpo.add(marca)
  cuerpo.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, h + 0.25)]), new THREE.LineBasicMaterial({ color: e.color('--ink') })))
  e.add(cuerpo)
  const traza: Array<[number, number, number]> = []
  const pasos = Math.min(6000, 60 * s.tMax)
  for (let i = 0; i <= pasos; i++) {
    const [th, ph] = interpolarHermite(tr, (s.tMax * i) / pasos)
    traza.push([(h + 0.25) * Math.sin(th) * Math.sin(ph), -(h + 0.25) * Math.sin(th) * Math.cos(ph), (h + 0.25) * Math.cos(th)])
  }
  e.linea(traza, e.color('--ocre'), 0.8)
  e.datos.cuerpo = cuerpo
}

/* ── lecturas ── */

const tresDec = (v: number[]) => `(${v.map((x) => (Math.abs(x) < 5e-13 ? 0 : x).toFixed(4)).join(', ')})`

function lecturas(s: EstadoSolido): Array<[string, string]> {
  if (s.modo === 'tensor') {
    const r = leer(s)
    if ('error' in r) return [['No se puede', r.error]]
    const { T } = r
    return [
      ['Masa', T.masa.toFixed(4)],
      ['Centro de masas', tresDec(T.cm)],
      ...T.principales.map((I, i) => [`I${'₁₂₃'[i]} (principal)`, I.toFixed(6)] as [string, string]),
      ...T.principales.map((_I, i) => [`eje ${i + 1}`, tresDec(T.ejes.map((f) => f[i]))] as [string, string]),
    ]
  }
  const tr = trayectoria(s)
  if ('error' in tr) return [['No se puede', tr.error]]
  if (s.modo === 'euler') {
    const I = inercias(s)
    const inv0 = invariantesEuler(I, tr.y[0])
    const deriva = Math.max(...tr.y.map((y) => Math.abs(invariantesEuler(I, y).E - inv0.E))) / Math.max(inv0.E, 1e-300)
    const T = periodoEuler(I, omega0(s))
    const orden = [0, 1, 2].sort((a, b) => I[a] - I[b])
    const regimen = inv0.L2 > 2 * inv0.E * I[orden[1]] ? `alrededor del eje de I mayor (I${'₁₂₃'[orden[2]]})` : `alrededor del eje de I menor (I${'₁₂₃'[orden[0]]})`
    return [
      ['Energía E', inv0.E.toFixed(6)],
      ['|L|', Math.sqrt(inv0.L2).toFixed(6)],
      ['La polodia rodea', I[orden[0]] === I[orden[2]] ? '—' : regimen],
      ['Periodo de ω: 4K(k)/λ', T === null ? '—' : T.toFixed(6)],
      ['Deriva relativa de E', deriva.toExponential(1)],
    ]
  }
  const p = peonza(s)
  const num = numericoPeonza(p)
  const E0 = num.energia(tr.y[0])
  const deriva = Math.max(...tr.y.map((y) => Math.abs(num.energia(y) - E0))) / Math.max(Math.abs(E0), 1e-12)
  const rt = retornos(p)
  const pu = precesionUniforme(p)
  return [
    ['p_ψ = I₃ω₃', (p.ic * p.w3).toFixed(5)],
    ['θ mínimo (raíz de la cúbica)', rt ? deg(rt[0]) : '—'],
    ['θ máximo (raíz de la cúbica)', rt ? deg(rt[1]) : '—'],
    ['φ̇ de precesión uniforme', pu === null ? 'no hay: ω₃ demasiado lento' : pu.toFixed(6)],
    ['Aprox. trompo rápido mgl/(I₃ω₃)', p.w3 > 0 ? (p.mgl / (p.ic * p.w3)).toFixed(6) : '—'],
    ['Trompo dormido estable si ω₃² >', (p.ia * p.ic > 0 ? (4 * p.ia * p.mgl) / p.ic ** 2 : NaN).toFixed(4)],
    ['Deriva relativa de E', deriva.toExponential(1)],
  ]
}

/** Una vista fija por modo: el lienzo 3D se remonta cuando cambia el objeto de la vista. */
const vista3D = (modo: Modo): Vista3D<EstadoSolido> => ({
    tipo: '3d',
    clave: modo,
    camara: { theta: 0.7, phi: 1.1, r: 4.4 },
    pesada: true,
    construir(e, st) {
      if (st.modo === 'tensor') escenaTensor(e, st)
      else if (st.modo === 'euler') escenaEuler(e, st)
      else escenaPeonza(e, st)
    },
    animar(e, st, t) {
      if (st.modo === 'tensor' || !e.datos.cuerpo) return
      const tr = trayectoria(st)
      if ('error' in tr) return
      const tt = (t * st.velocidad) % st.tMax
      const y = interpolarHermite(tr, tt)
      if (st.modo === 'euler') {
        const R = [y.slice(3, 6), y.slice(6, 9), y.slice(9, 12)]
        // Hermite no conserva la ortogonalidad exacta entre pasos; para pintar basta el cuaternión más cercano
        orientar(e.datos.cuerpo, R)
        const w = [0, 1, 2].map((i) => R[i][0] * y[0] + R[i][1] * y[1] + R[i][2] * y[2])
        ponerFlecha(e.datos.w, w, e.datos.escW * Math.hypot(...w))
      } else orientar(e.datos.cuerpo, rotacionEuler(y[0], y[1], y[2]))
    },
})
const VISTAS: Record<Modo, Vista3D<EstadoSolido>> = { tensor: vista3D('tensor'), euler: vista3D('euler'), peonza: vista3D('peonza') }

export default definir<EstadoSolido>({
  id: 'solido',
  area: 'mecanica',
  resumen: 'Sólido rígido: tensor de inercia con Steiner, ejes principales, rotación libre (raqueta) y peonza pesada',
  corto: 'Sólido rígido',
  titulo: 'Sólido <i>rígido</i>',
  entradilla: 'Tensor de inercia de piezas sueltas, el giro libre de Euler y la peonza con precesión y nutación.',
  inicial: {
    modo: 'tensor', piezas: PIEZAS[0].src, elipsoide: true,
    I1: 1, I2: 1.8, I3: 2.4, w1: 0.02, w2: 3, w3e: 0.02,
    ia: 1.4, ic: 0.6, mgl: 2.3, theta0: 0.6, phid0: 0.4, thetad0: 0, w3: 12,
    tMax: 30, velocidad: 1,
  },
  Panel,
  capas: (s) => (s.modo === 'tensor' ? [capaFija<EstadoSolido>('e1', 'Eje 1 (I menor)', '--pos'), capaFija<EstadoSolido>('e2', 'Eje 2', '--aux'), capaFija<EstadoSolido>('e3', 'Eje 3 (I mayor)', '--rosa'), capaVer(s, 'elipsoide', 'Elipsoide de inercia', '--ocre')] : []),
  menu: (s) => ({
    ejemplos: [
      submenu<EstadoSolido>('Piezas (tensor)', PIEZAS.map((p) => accion<EstadoSolido>(p.t, () => ({ modo: 'tensor', piezas: p.src })))),
      submenu<EstadoSolido>('Rotación libre', EULER.map((p) => accion<EstadoSolido>(p.t, () => ({ modo: 'euler', ...p.v })))),
      submenu<EstadoSolido>('Peonza', PEONZA.map((p) => accion<EstadoSolido>(p.t, () => ({ modo: 'peonza', ...p.v })))),
    ],
    acciones: [
      radios<EstadoSolido, Modo>('Qué mirar', [{ v: 'tensor', t: 'Tensor de inercia' }, { v: 'euler', t: 'Rotación libre (Euler)' }, { v: 'peonza', t: 'Peonza pesada' }], s.modo, (modo) => ({ modo })),
      casilla<EstadoSolido>('Elipsoide de inercia', s.elipsoide, (elipsoide) => ({ elipsoide })),
    ],
  }),
  resultadoEnPanel: true,
  rotulo: (s) => ({ nombre: s.modo === 'tensor' ? 'I = Σ (I_cm + m(|d|²𝟙 − d dᵀ))' : s.modo === 'euler' ? 'I ω̇ + ω × I ω = 0' : 'peonza simétrica pesada', apunte: s.modo }),
  formula: (s) =>
    s.modo === 'tensor'
      ? (() => {
          const r = leer(s)
          const base = [String.raw`I_{ij}=\int\!\left(r^2\delta_{ij}-x_ix_j\right)dm`, String.raw`I_O=I_{\rm cm}+m\left(|\mathbf d|^2\,\mathbb 1-\mathbf d\,\mathbf d^{\mathsf T}\right)`]
          if ('error' in r) return base
          const f = (x: number) => (Math.abs(x) < 5e-13 ? '0' : x.toFixed(4))
          return [...base, String.raw`I_{\rm cm}=\begin{pmatrix}${r.T.Icm.map((fila) => fila.map(f).join('&')).join(String.raw`\\`)}\end{pmatrix}`]
        })()
      : s.modo === 'euler'
        ? [String.raw`I_1\dot\omega_1=(I_2-I_3)\,\omega_2\omega_3\quad(\text{y cíclicas})`, String.raw`\dot R=R\,[\boldsymbol\omega]_\times,\qquad \mathbf L=R\,I\boldsymbol\omega=\text{cte}`]
        : [String.raw`L=\tfrac{I_1}{2}\left(\dot\theta^2+\dot\varphi^2\sin^2\theta\right)`, String.raw`\quad+\tfrac{I_3}{2}\left(\dot\psi+\dot\varphi\cos\theta\right)^2-mgl\cos\theta`, String.raw`\dot u^2=(1-u^2)(\alpha-\beta u)-(b-au)^2,\quad u=\cos\theta`],
  lecturas,
  leyenda: (s) =>
    s.modo === 'tensor' ? (
      <>
        <Muestra color="var(--pos)">eje 1 (I menor)</Muestra>
        <Muestra color="var(--aux)">eje 2</Muestra>
        <Muestra color="var(--rosa)">eje 3 (I mayor)</Muestra>
        {s.elipsoide && <Muestra color="var(--ocre)">elipsoide de inercia</Muestra>}
      </>
    ) : s.modo === 'euler' ? (
      <>
        <Muestra color="var(--pos)">L (fijo)</Muestra>
        <Muestra color="var(--accent)">ω</Muestra>
        <Muestra color="var(--ocre)">herpolodia</Muestra>
      </>
    ) : (
      <>
        <Muestra color="var(--accent)">peonza</Muestra>
        <Muestra color="var(--ocre)">traza del eje</Muestra>
      </>
    ),
  comparaciones: [
    { t: 'Raqueta: eje intermedio frente a eje mayor', a: { modo: 'euler', ...EULER[0].v }, b: { modo: 'euler', ...EULER[1].v } },
    { t: 'Peonza: cabeceo frente a bucles', a: { modo: 'peonza', ...PEONZA[0].v }, b: { modo: 'peonza', ...PEONZA[1].v } },
  ],
  vista: (s) => VISTAS[s.modo],
})
