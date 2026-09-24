import * as THREE from 'three'
import { varCss } from './tema'

/**
 * Escenario 3D compartido por todos los módulos: cámara en órbita, ejes con
 * rótulos en serif y unas cuantas primitivas (superficie, nube, línea, flecha).
 *
 * Convenio: el mundo es z-arriba (el de física). El grupo `root` lleva la
 * rotación que lo adapta al y-arriba de three.js, así que los módulos escriben
 * siempre (x, y, z) de física.
 */
export class Escena3D {
  renderer: THREE.WebGLRenderer
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(40, 1, 0.01, 200)
  root = new THREE.Group()
  /** Cajón donde `construir` deja referencias que `animar` necesita. */
  datos: Record<string, any> = {}
  orb = { theta: 0.9, phi: 1.1, r: 4.2 }
  /**
   * Tamaño típico de la escena. Los límites del zoom y los planos near/far de
   * la cámara escalan con él: un orbital de n=4 mide ~50 a₀, no ~1.
   */
  escala = 1
  rejillaCompleta = false
  giro = false
  /** Superposiciones del menú Vista: las respeta `ejes()`. */
  mostrarEjes = true
  mostrarNombres = true
  mostrarRejilla = true
  /** Casi ortográfica: campo de 2° desde lejos, así el rayo, las asas y los rótulos no cambian. */
  ortografica = false
  /** Punto al que mira la cámara (marco de three); «Encuadrar» lo mueve. */
  objetivo = new THREE.Vector3()
  /** Mallas sobre las que se deslizan las asas de tipo `superficie`; `construir` las deja aquí. */
  agarre: THREE.Object3D[] = []
  private objs: THREE.Object3D[] = []
  private luzCam: THREE.DirectionalLight
  private capaAsas = new THREE.Group()
  /** Guías de selección, movimiento y giro: no las borra `limpiar`. */
  private capaGuias = new THREE.Group()
  private asas: Array<{ id: string; sprite: THREE.Sprite; halo: THREE.Sprite }> = []
  private rayo = new THREE.Raycaster()

  /** Sin fondo: para superponer una escena a otra en el modo Comparar. */
  transparente: boolean

  constructor(canvas: HTMLCanvasElement, transparente = false) {
    this.transparente = transparente
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: transparente })
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    this.renderer.localClippingEnabled = true
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.6))
    this.luzCam = new THREE.DirectionalLight(0xffffff, 2.0)
    this.luzCam.position.set(1, 2, 1)
    this.camera.add(this.luzCam)
    this.scene.add(this.camera)
    this.scene.add(this.root)
    this.root.add(this.capaAsas)
    this.root.add(this.capaGuias)
    this.zArriba(true)
  }

  zArriba(si: boolean) {
    this.root.rotation.set(si ? -Math.PI / 2 : 0, 0, 0)
  }
  /** ¿El eje z de la física apunta hacia arriba en pantalla? */
  get conZArriba() {
    return this.root.rotation.x !== 0
  }

  color(n: string) {
    return new THREE.Color(varCss(n))
  }

  fondo() {
    this.renderer.setClearColor(this.color('--stage'), this.transparente ? 0 : 1)
  }

  dimensionar(w: number, h: number) {
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h || 1
    this.camera.updateProjectionMatrix()
  }

  acercar(factor: number) {
    this.orb.r = Math.min(40 * this.escala, Math.max(0.8 * this.escala, this.orb.r * factor))
  }

  colocarCamara() {
    const { theta, phi } = this.orb
    const fov = this.ortografica ? 2 : 40
    // misma anchura de encuadre en el objetivo: d·tan(fov/2) se conserva
    const k = this.ortografica ? Math.tan((40 * Math.PI) / 360) / Math.tan((fov * Math.PI) / 360) : 1
    const r = this.orb.r * k
    const far = 200 * this.escala * k
    if (this.camera.far !== far || this.camera.fov !== fov) {
      this.camera.near = 0.01 * this.escala * k
      this.camera.far = far
      this.camera.fov = fov
      this.camera.updateProjectionMatrix()
    }
    const o = this.objetivo
    this.camera.position.set(
      o.x + r * Math.sin(phi) * Math.cos(theta),
      o.y + r * Math.cos(phi),
      o.z + r * Math.sin(phi) * Math.sin(theta),
    )
    this.camera.lookAt(o)
  }

  /** Mira al centro de lo dibujado y se aleja lo justo para que quepa (sin ejes ni rejillas). */
  encuadrar() {
    this.root.updateMatrixWorld(true)
    const caja = new THREE.Box3()
    const parcial = new THREE.Box3()
    for (const o of this.objs) {
      if (o.userData.referencia || !o.visible) continue
      parcial.setFromObject(o)
      if (!parcial.isEmpty() && Number.isFinite(parcial.min.x) && Number.isFinite(parcial.max.x)) caja.union(parcial)
    }
    if (caja.isEmpty()) {
      this.objetivo.set(0, 0, 0)
      return
    }
    const esfera = caja.getBoundingSphere(new THREE.Sphere())
    this.objetivo.copy(esfera.center)
    const aspecto = Math.min(1, this.camera.aspect || 1)
    const r = (esfera.radius * 1.08) / (Math.sin((20 * Math.PI) / 180) * aspecto)
    this.orb.r = Math.min(40 * this.escala, Math.max(0.3 * this.escala, r))
  }

  pintar() {
    this.colocarCamara()
    this.escalarAsas()
    this.renderer.render(this.scene, this.camera)
  }

  /* ---------- asas: puntos que el usuario agarra ---------- */

  /** Sustituye las asas pintadas. `activa` es la que está bajo el ratón o en la mano. */
  ponerAsas(asas: Array<{ id: string; p: number[]; color: THREE.Color }>, activa: string | null) {
    for (const a of this.asas) {
      this.capaAsas.remove(a.sprite, a.halo)
      a.sprite.material.dispose()
      a.halo.material.dispose()
    }
    this.asas = asas.map((a) => {
      const mat = (tex: THREE.Texture, color: THREE.Color, opacidad: number) =>
        new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity: opacidad, depthTest: false, depthWrite: false })
      const sprite = new THREE.Sprite(mat(texturaAsa, a.color, 1))
      const halo = new THREE.Sprite(mat(texturaHalo, this.color('--ink'), a.id === activa ? 0.9 : 0))
      for (const o of [sprite, halo]) {
        o.position.set(a.p[0], a.p[1], a.p[2] ?? 0)
        o.renderOrder = 10
        o.userData.activa = a.id === activa
        this.capaAsas.add(o)
      }
      return { id: a.id, sprite, halo }
    })
  }

  /** Las asas miden lo mismo en pantalla estén cerca o lejos. */
  private escalarAsas() {
    if (!this.asas.length) return
    const alto = this.renderer.domElement.clientHeight || 1
    const tan = Math.tan((this.camera.fov * Math.PI) / 360)
    const q = new THREE.Vector3()
    for (const { sprite, halo } of this.asas) {
      sprite.getWorldPosition(q)
      const porPx = (2 * q.distanceTo(this.camera.position) * tan) / alto
      const px = sprite.userData.activa ? 17 : 13
      sprite.scale.setScalar(px * porPx)
      halo.scale.setScalar(30 * porPx)
    }
  }

  /** Asa más cercana al puntero (px del canvas), si está a menos de `radio` px. */
  asaEn(x: number, y: number, radio = 14): string | null {
    const c = this.renderer.domElement
    let mejor: string | null = null
    let dmin = radio
    const q = new THREE.Vector3()
    for (const { id, sprite } of this.asas) {
      sprite.getWorldPosition(q).project(this.camera)
      if (q.z > 1) continue
      const d = Math.hypot(((q.x + 1) / 2) * c.clientWidth - x, ((1 - q.y) / 2) * c.clientHeight - y)
      if (d < dmin) {
        dmin = d
        mejor = id
      }
    }
    return mejor
  }

  /** Punto de física → píxeles del canvas; null si queda detrás de la cámara. */
  aPantalla(p: number[]): { x: number; y: number } | null {
    const c = this.renderer.domElement
    this.camera.updateMatrixWorld()
    this.root.updateMatrixWorld()
    const q = this.root.localToWorld(new THREE.Vector3(p[0], p[1], p[2] ?? 0)).project(this.camera)
    if (q.z > 1) return null
    return { x: ((q.x + 1) / 2) * c.clientWidth, y: ((1 - q.y) / 2) * c.clientHeight }
  }

  /** Sustituye las guías: polilíneas finas y translúcidas, encima de todo. */
  ponerGuias(lineas: Array<{ pts: number[][]; color: THREE.Color; opacidad?: number; discontinua?: boolean }>) {
    for (const o of [...this.capaGuias.children]) {
      this.capaGuias.remove(o)
      ;(o as THREE.Line).geometry.dispose()
      ;((o as THREE.Line).material as THREE.Material).dispose()
    }
    for (const l of lineas) {
      const g = new THREE.BufferGeometry().setFromPoints(l.pts.map((q) => new THREE.Vector3(q[0], q[1], q[2] ?? 0)))
      const mat = l.discontinua
        ? new THREE.LineDashedMaterial({ color: l.color, transparent: true, opacity: l.opacidad ?? 0.7, dashSize: 0.06, gapSize: 0.05, depthTest: false })
        : new THREE.LineBasicMaterial({ color: l.color, transparent: true, opacity: l.opacidad ?? 0.7, depthTest: false })
      const linea = new THREE.Line(g, mat)
      if (l.discontinua) linea.computeLineDistances()
      linea.renderOrder = 9
      this.capaGuias.add(linea)
    }
  }

  /** Rayo del puntero, ya en coordenadas de física (las de `root`). */
  rayoFisico(x: number, y: number) {
    const c = this.renderer.domElement
    this.camera.updateMatrixWorld()
    this.root.updateMatrixWorld()
    this.rayo.setFromCamera(new THREE.Vector2((x / c.clientWidth) * 2 - 1, 1 - (y / c.clientHeight) * 2), this.camera)
    const inv = this.root.matrixWorld.clone().invert()
    return this.rayo.ray.clone().applyMatrix4(inv)
  }

  /**
   * Dónde cae el puntero al arrastrar un punto que estaba en `p`: en el plano
   * horizontal que pasa por él, o con `vertical` en el plano vertical que mira
   * a la cámara. Si el horizontal se ve de canto, se usa el que mira a la cámara.
   */
  puntoEnPlano(x: number, y: number, p: number[], vertical: boolean): number[] | null {
    const r = this.rayoFisico(x, y)
    const P = new THREE.Vector3(p[0], p[1], p[2] ?? 0)
    let n: THREE.Vector3
    if (vertical) {
      n = new THREE.Vector3(r.direction.x, r.direction.y, 0)
      if (n.lengthSq() < 1e-6) return null
    } else if (Math.abs(r.direction.z) < 0.12) n = r.direction.clone()
    else n = new THREE.Vector3(0, 0, 1)
    const hit = r.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(n.normalize(), P), new THREE.Vector3())
    if (!hit) return null
    return vertical ? [p[0], p[1], hit.z] : [hit.x, hit.y, hit.z]
  }

  /** Primer choque del puntero con las mallas de `agarre`, con sus coordenadas uv. */
  puntoEnMalla(x: number, y: number): { p: number[]; uv?: [number, number] } | null {
    if (!this.agarre.length) return null
    const c = this.renderer.domElement
    this.rayo.setFromCamera(new THREE.Vector2((x / c.clientWidth) * 2 - 1, 1 - (y / c.clientHeight) * 2), this.camera)
    const [hit] = this.rayo.intersectObjects(this.agarre, false)
    if (!hit) return null
    const q = this.root.worldToLocal(hit.point.clone())
    return { p: [q.x, q.y, q.z], uv: hit.uv ? [hit.uv.x, hit.uv.y] : undefined }
  }

  limpiar() {
    for (const o of this.objs) {
      this.root.remove(o)
      o.traverse((n: any) => {
        n.geometry?.dispose?.()
        if (n.material) {
          const ms = Array.isArray(n.material) ? n.material : [n.material]
          for (const m of ms) {
            if (m.map && m.map !== texturaPunto) m.map.dispose()
            m.dispose()
          }
        }
      })
    }
    this.objs = []
    this.datos = {}
    this.agarre = []
    this.escala = 1
  }

  add<T extends THREE.Object3D>(o: T): T {
    this.root.add(o)
    this.objs.push(o)
    return o
  }

  private matLinea(opacidad = 0.55) {
    return new THREE.LineBasicMaterial({
      color: this.color('--ink-soft'),
      transparent: true,
      opacity: opacidad,
    })
  }

  /** Rótulo flotante en serif itálica, como los ejes del Atlas. */
  rotulo(texto: string, pos: [number, number, number], escala = 0.24) {
    const c = document.createElement('canvas')
    c.width = 256
    c.height = 128
    const x = c.getContext('2d')!
    x.font = `italic 68px ${varCss('--serif') || 'Georgia, serif'}`
    x.fillStyle = varCss('--ink-soft') || '#8A93A5'
    x.textAlign = 'center'
    x.textBaseline = 'middle'
    x.fillText(texto, 128, 68)
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthWrite: false, transparent: true }),
    )
    s.scale.set(escala, escala / 2, 1)
    s.position.set(pos[0], pos[1], pos[2])
    return this.add(s)
  }

  /** Tres ejes centrados en el origen, con sus letras. */
  ejes(
    largo = 1.15,
    etiquetas: [string, string, string] | null = ['x', 'y', 'z'],
    opts: { caja?: boolean | number; rejilla?: boolean; planos?: Array<'xy' | 'xz' | 'yz'>; infinita?: boolean; paso?: number } = {},
  ) {
    if (opts.rejilla && this.mostrarRejilla) {
      const planos = this.rejillaCompleta ? ['xy', 'xz', 'yz'] as const : opts.planos ?? ['xy']
      const extension = opts.infinita ? 50 : largo
      for (const plano of planos) this.rejilla(plano, extension, opts.paso ?? largo / 5).userData.referencia = true
    }
    if (opts.caja) {
      const l = typeof opts.caja === 'number' ? opts.caja : largo
      this.add(
        new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.BoxGeometry(2 * l, 2 * l, 2 * l)),
          this.matLinea(0.4),
        ),
      )
    }
    const p = (a: number[], b: number[]) => [new THREE.Vector3(...a), new THREE.Vector3(...b)]
    const g = new THREE.BufferGeometry().setFromPoints([
      ...p([-largo, 0, 0], [largo, 0, 0]),
      ...p([0, -largo, 0], [0, largo, 0]),
      ...p([0, 0, -largo], [0, 0, largo]),
    ])
    const ejes = this.add(new THREE.LineSegments(g, this.matLinea(0.32)))
    ejes.renderOrder = -1
    ejes.userData.referencia = true
    ejes.visible = this.mostrarEjes
    if (etiquetas && this.mostrarNombres) {
      const d = largo + 0.13
      this.rotulo(etiquetas[0], [d, 0, 0]).userData.referencia = true
      this.rotulo(etiquetas[1], [0, d, 0]).userData.referencia = true
      this.rotulo(etiquetas[2], [0, 0, d]).userData.referencia = true
    }
  }

  /** Cuadrícula de referencia en uno de los planos coordenados. */
  rejilla(plano: 'xy' | 'xz' | 'yz', largo = 1.5, paso = 0.3) {
    const pts: THREE.Vector3[] = []
    for (let v = -largo; v <= largo + paso * 0.1; v += paso) {
      if (plano === 'xy') {
        pts.push(new THREE.Vector3(-largo, v, 0), new THREE.Vector3(largo, v, 0))
        pts.push(new THREE.Vector3(v, -largo, 0), new THREE.Vector3(v, largo, 0))
      } else if (plano === 'xz') {
        pts.push(new THREE.Vector3(-largo, 0, v), new THREE.Vector3(largo, 0, v))
        pts.push(new THREE.Vector3(v, 0, -largo), new THREE.Vector3(v, 0, largo))
      } else {
        pts.push(new THREE.Vector3(0, -largo, v), new THREE.Vector3(0, largo, v))
        pts.push(new THREE.Vector3(0, v, -largo), new THREE.Vector3(0, v, largo))
      }
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts)
    const lineas = this.add(new THREE.LineSegments(geo, this.matLinea(0.18)))
    lineas.renderOrder = -2
    return lineas
  }

  linea(pts: Array<[number, number, number]>, color?: THREE.Color, opacidad = 1, grosor?: number) {
    const g = new THREE.BufferGeometry().setFromPoints(pts.map((q) => new THREE.Vector3(...q)))
    void grosor // el ancho de línea no es portable en WebGL; se deja el de 1 px
    return this.add(
      new THREE.Line(
        g,
        new THREE.LineBasicMaterial({
          color: color ?? this.color('--ink-soft'),
          transparent: opacidad < 1,
          opacity: opacidad,
        }),
      ),
    )
  }

  /** Vector desde el origen (o desde `desde`), con punta. */
  flecha(
    v: [number, number, number],
    color: THREE.Color,
    desde: [number, number, number] = [0, 0, 0],
    grosor = 0.012,
  ) {
    const dir = new THREE.Vector3(v[0], v[1], v[2])
    const largo = dir.length()
    if (largo < 1e-6) return null
    const grupo = new THREE.Group()
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.05 })
    const cabeza = Math.min(0.12, largo * 0.28)
    const cuerpo = new THREE.Mesh(new THREE.CylinderGeometry(grosor, grosor, largo - cabeza, 12), mat)
    cuerpo.position.y = (largo - cabeza) / 2
    const punta = new THREE.Mesh(new THREE.ConeGeometry(grosor * 2.6, cabeza, 14), mat)
    punta.position.y = largo - cabeza / 2
    grupo.add(cuerpo, punta)
    grupo.position.set(...desde)
    grupo.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize())
    return this.add(grupo)
  }

  /**
   * Malla paramétrica de nu×nv. `actualizar(f)` recoloca los vértices y su
   * color; sirve tanto para construir como para animar sin reasignar memoria.
   */
  superficie(nu: number, nv: number, opts: { alambre?: boolean; opacidad?: number } = {}) {
    const geo = new THREE.PlaneGeometry(1, 1, nu - 1, nv - 1)
    const n = nu * nv
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.55,
      metalness: 0.02,
      side: THREE.DoubleSide,
      flatShading: false,
      transparent: (opts.opacidad ?? 1) < 1,
      opacity: opts.opacidad ?? 1,
    })
    const malla = this.add(new THREE.Mesh(geo, mat))
    let alambre: THREE.LineSegments | null = null
    if (opts.alambre) {
      alambre = this.add(
        new THREE.LineSegments(new THREE.WireframeGeometry(geo), this.matLinea(0.22)),
      )
    }
    const pos = geo.attributes.position as THREE.BufferAttribute
    const col = geo.attributes.color as THREE.BufferAttribute
    const actualizar = (
      f: (i: number, j: number) => [number, number, number, [number, number, number]],
    ) => {
      for (let j = 0; j < nv; j++) {
        for (let i = 0; i < nu; i++) {
          const k = j * nu + i
          const [x, y, z, c] = f(i, j)
          pos.setXYZ(k, x, y, z)
          col.setXYZ(k, c[0], c[1], c[2])
        }
      }
      pos.needsUpdate = true
      col.needsUpdate = true
      geo.computeVertexNormals()
      geo.computeBoundingSphere()
      if (alambre) {
        alambre.geometry.dispose()
        alambre.geometry = new THREE.WireframeGeometry(geo)
      }
    }
    return { malla, actualizar, geo }
  }

  /** Nube de puntos con color por vértice. */
  nube(posiciones: Float32Array, colores: Float32Array, tam = 0.02, opacidad = 0.8) {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(posiciones, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(colores, 3))
    return this.add(
      new THREE.Points(
        geo,
        new THREE.PointsMaterial({
          size: tam,
          map: texturaPunto,
          vertexColors: true,
          transparent: true,
          opacity: opacidad,
          depthWrite: false,
          alphaTest: 0.05,
        }),
      ),
    )
  }

  /** Marca un punto del espacio. */
  punto(p: [number, number, number], color: THREE.Color, r = 0.03) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(r, 20, 14),
      new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.05 }),
    )
    m.position.set(p[0], p[1], p[2])
    return this.add(m)
  }

  /** Muchos segmentos en una sola geometría, con color por vértice. */
  segmentos(pos: Float32Array, col: Float32Array) {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
    return this.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true })))
  }

  /** Línea con color por vértice (líneas de campo, trayectorias). */
  lineaColor(pos: Float32Array, col: Float32Array) {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
    return this.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ vertexColors: true })))
  }

  /** Malla a partir de triángulos sueltos (isosuperficies). */
  malla(
    pos: Float32Array,
    nor: Float32Array,
    color: THREE.Color,
    opts: { opacidad?: number; planos?: THREE.Plane[] } = {},
  ) {
    if (!pos.length) return null
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
    const op = opts.opacidad ?? 1
    return this.add(
      new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({
          color,
          roughness: 0.42,
          metalness: 0,
          side: THREE.DoubleSide,
          transparent: op < 1,
          opacity: op,
          depthWrite: op >= 1,
          clippingPlanes: opts.planos ?? [],
        }),
      ),
    )
  }

  destruir() {
    this.ponerAsas([], null)
    this.ponerGuias([])
    this.limpiar()
    this.renderer.dispose()
  }
}

/** Disco con borde oscuro: el color del asa lo pone el material. */
const texturaAsa = (() => {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const x = c.getContext('2d')!
  x.beginPath()
  x.arc(32, 32, 29, 0, 2 * Math.PI)
  x.fillStyle = 'rgba(0,0,0,.55)'
  x.fill()
  x.beginPath()
  x.arc(32, 32, 22, 0, 2 * Math.PI)
  x.fillStyle = '#fff'
  x.fill()
  return new THREE.CanvasTexture(c)
})()

const texturaHalo = (() => {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const x = c.getContext('2d')!
  x.beginPath()
  x.arc(32, 32, 28, 0, 2 * Math.PI)
  x.lineWidth = 3
  x.strokeStyle = '#fff'
  x.stroke()
  return new THREE.CanvasTexture(c)
})()

const texturaPunto = (() => {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const x = c.getContext('2d')!
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.55, 'rgba(255,255,255,.85)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  x.fillStyle = g
  x.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
})()
