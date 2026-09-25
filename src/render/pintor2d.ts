import { varCss } from './tema'
import { ESCENA_INICIAL, type AjustesEscena } from '../nucleo/escena'

export interface Ventana {
  x: [number, number]
  y: [number, number]
}

/**
 * Canvas 2D con coordenadas del mundo. `X`/`Y` pasan de mundo a píxel; el resto
 * de ayudas (ejes, curvas, flechas) trabajan siempre en unidades del mundo.
 */
export class Pintor2D {
  ctx: CanvasRenderingContext2D
  ancho = 0
  alto = 0
  ventana: Ventana = { x: [-1, 1], y: [-1, 1] }
  /** Superposiciones del menú Vista: las respeta `ejes()`. */
  mostrarEjes = true
  mostrarNombres = true
  mostrarRejilla = true
  /** Menú Escena: escala log, unidades π, rejilla polar, posición de los ejes… */
  escena: AjustesEscena = ESCENA_INICIAL
  /** Trozo del lienzo en el que se está dibujando, en píxeles. */
  private vx = 0
  private vy = 0
  private vw = 0
  private vh = 0

  private lienzoMapa?: HTMLCanvasElement

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx
  }

  /**
   * Restringe el dibujo a un trozo del lienzo, en fracciones del total. Todo lo
   * que venga después usa ese trozo como si fuera el lienzo entero.
   */
  region(fx: number, fy: number, fw: number, fh: number) {
    this.ctx.save()
    this.vx = fx * this.ancho
    this.vy = fy * this.alto
    this.vw = fw * this.ancho
    this.vh = fh * this.alto
    this.ctx.beginPath()
    this.ctx.rect(this.vx, this.vy, this.vw, this.vh)
    this.ctx.clip()
  }

  /** Cambia la región de trabajo sin recortar: sirve para dejarla fijada al salir. */
  usarRegion(fx: number, fy: number, fw: number, fh: number) {
    this.vx = fx * this.ancho
    this.vy = fy * this.alto
    this.vw = fw * this.ancho
    this.vh = fh * this.alto
  }

  /** Vuelve al lienzo entero. */
  finRegion() {
    this.ctx.restore()
    this.vx = 0
    this.vy = 0
    this.vw = this.ancho
    this.vh = this.alto
  }

  /** Ajusta la ventana para que una unidad del mundo mida lo mismo en x y en y. */
  igualarEscala() {
    // con un eje logarítmico no hay «misma unidad» en los dos
    if (this.escena.logX || this.escena.logY) return
    const { x, y } = this.ventana
    const w = this.vw || this.ancho
    const h = this.vh || this.alto
    const r = this.escena.proporcion === 'personalizada' ? this.escena.razon : 1
    const e = Math.max((x[1] - x[0]) / w, (y[1] - y[0]) / h / r)
    const cx = (x[0] + x[1]) / 2
    const cy = (y[0] + y[1]) / 2
    this.ventana = {
      x: [cx - (e * w) / 2, cx + (e * w) / 2],
      y: [cy - (e * h * r) / 2, cy + (e * h * r) / 2],
    }
  }

  X(x: number) {
    const [a, b] = this.ventana.x
    if (this.escena.logX) return this.vx + ((lg(x) - lg(a)) / (lg(b) - lg(a))) * this.vw
    return this.vx + ((x - a) / (b - a)) * this.vw
  }
  Y(y: number) {
    const [a, b] = this.ventana.y
    if (this.escena.logY) return this.vy + this.vh - ((lg(y) - lg(a)) / (lg(b) - lg(a))) * this.vh
    return this.vy + this.vh - ((y - a) / (b - a)) * this.vh
  }

  /** Un eje logarítmico solo ve x > 0: si la ventana incluye el 0 o negativos, se corre a positivos. */
  sanearVentana() {
    const arreglar = (iv: [number, number]): [number, number] => {
      if (iv[0] > 0) return iv
      if (iv[1] <= 0) return [0.1, 1000]
      return [Math.max(iv[1] * 1e-3, 1e-6), iv[1]]
    }
    if (this.escena.logX) this.ventana = { ...this.ventana, x: arreglar(this.ventana.x) }
    if (this.escena.logY) this.ventana = { ...this.ventana, y: arreglar(this.ventana.y) }
  }

  /** Desplaza la vista tantos píxeles (arrastre): en log se mueve por décadas, no por unidades. */
  desplazar(dpx: number, dpy: number) {
    const mover = (iv: [number, number], d: number, log: boolean): [number, number] => {
      if (!log) return [iv[0] + d * (iv[1] - iv[0]), iv[1] + d * (iv[1] - iv[0])]
      const [a, b] = [lg(iv[0]), lg(iv[1])]
      return [10 ** (a + d * (b - a)), 10 ** (b + d * (b - a))]
    }
    this.ventana = {
      x: mover(this.ventana.x, -dpx / (this.vw || this.ancho), this.escena.logX),
      y: mover(this.ventana.y, dpy / (this.vh || this.alto), this.escena.logY),
    }
  }

  /** Acerca (k < 1) o aleja (k > 1) dejando quieto el píxel (px, py). */
  acercarEn(px: number, py: number, k: number) {
    const c = this.aMundo(px, py)
    const escalar = (iv: [number, number], m: number, log: boolean): [number, number] => {
      if (!log) return [m + (iv[0] - m) * k, m + (iv[1] - m) * k]
      const lm = lg(m)
      return [10 ** (lm + (lg(iv[0]) - lm) * k), 10 ** (lm + (lg(iv[1]) - lm) * k)]
    }
    this.ventana = { x: escalar(this.ventana.x, c.x, this.escena.logX), y: escalar(this.ventana.y, c.y, this.escena.logY) }
  }

  /**
   * Parámetro para muestrear una función de x a lo ancho de la ventana: lineal, o por décadas si
   * el eje X es logarítmico (si no, las décadas de la izquierda se quedarían sin muestras).
   */
  muestreoX(): { a: number; b: number; x: (u: number) => number } {
    const [a, b] = this.ventana.x
    if (this.escena.logX) return { a: lg(a), b: lg(b), x: (u) => 10 ** u }
    return { a, b, x: (u) => u }
  }
  /** Píxeles por unidad del mundo en x. */
  get escalaX() {
    return this.vw / (this.ventana.x[1] - this.ventana.x[0])
  }
  get escalaY() {
    return this.vh / (this.ventana.y[1] - this.ventana.y[0])
  }
  aMundo(px: number, py: number) {
    const { x, y } = this.ventana
    const fx = (px - this.vx) / this.vw
    const fy = 1 - (py - this.vy) / this.vh
    return {
      x: this.escena.logX ? 10 ** (lg(x[0]) + fx * (lg(x[1]) - lg(x[0]))) : x[0] + fx * (x[1] - x[0]),
      y: this.escena.logY ? 10 ** (lg(y[0]) + fy * (lg(y[1]) - lg(y[0]))) : y[0] + fy * (y[1] - y[0]),
    }
  }

  color(n: string) {
    return varCss(n)
  }

  limpiar() {
    this.vx = 0
    this.vy = 0
    this.vw = this.ancho
    this.vh = this.alto
    this.ctx.clearRect(0, 0, this.ancho, this.alto)
    if (this.escena.fondo) { this.ctx.fillStyle = this.escena.fondo; this.ctx.fillRect(0,0,this.ancho,this.alto) }
  }

  /**
   * Rejilla y ejes con números, iguales en todos los módulos 2D (el módulo solo nombra los ejes).
   * Al estilo GeoGebra: la rejilla gruesa va a pasos bonitos (1, 2, 5…) de ~90 px, y la fina
   * (cuartos o quintos) se enciende al acercarse y se apaga al alejarse, según su separación en px.
   */
  ejes(opts: { etiquetaX?: string; etiquetaY?: string } = {}) {
    this.trazarEjes(opts, true)
  }

  /** Ejes y números sobre un mapa de color: el mapa ya es el fondo, así que sin rejilla. */
  ejesMapa(opts: { etiquetaX?: string; etiquetaY?: string } = {}) {
    this.trazarEjes(opts, false)
  }

  /**
   * Marcas de un eje: las gruesas con su número y las finas (con su opacidad, que se funde al
   * alejarse). Números a pasos bonitos, múltiplos de π, o décadas si el eje es logarítmico.
   */
  private marcas(eje: 'x' | 'y', pasoComun?: number): { paso: number; gruesas: Array<{ v: number; t: string }>; finas: Array<{ v: number; alfa: number }> } {
    const [a, b] = eje === 'x' ? this.ventana.x : this.ventana.y
    const log = eje === 'x' ? this.escena.logX : this.escena.logY
    const pi = (eje === 'x' ? this.escena.unidadX : this.escena.unidadY) === 'pi'
    const largo = eje === 'x' ? this.vw || this.ancho : this.vh || this.alto
    const gruesas: Array<{ v: number; t: string }> = []
    const finas: Array<{ v: number; alfa: number }> = []
    if (log) {
      const [la, lb] = [lg(a), lg(b)]
      const pxDecada = largo / Math.max(1e-9, lb - la)
      // una década de cada 1, 2, 5… según lo apretadas que vayan
      const salto = pxDecada >= 45 ? 1 : pasoBonito(45 / pxDecada)
      for (let k = Math.ceil(la / salto) * salto; k <= lb + 1e-9; k += salto) gruesas.push({ v: 10 ** k, t: potencia10(Math.round(k)) })
      const alfa = 0.5 * fundido(pxDecada * (lg(2) - lg(1)))
      if (salto === 1 && alfa > 0.01)
        for (let k = Math.floor(la); k <= Math.ceil(lb); k++) for (let m = 2; m <= 9; m++) finas.push({ v: m * 10 ** k, alfa })
      return { paso: salto, gruesas, finas }
    }
    const e = largo / (b - a)
    const grados = (eje === 'x' ? this.escena.unidadX : this.escena.unidadY) === 'grados'
    const fijo = eje === 'x' ? this.escena.pasoX : this.escena.pasoY
    const paso = Math.max((b-a)/1000, fijo || pasoComun || (pi || grados ? pasoPi(90 / e) : pasoBonito(90 / e)))
    const n = pi ? 2 : subdivisiones(paso)
    const alfa = 0.5 * fundido((paso / n) * e)
    for (let k = Math.ceil(a / paso); k * paso <= b; k++) gruesas.push({ v: k * paso, t: grados ? `${Number((k * paso * 180 / Math.PI).toPrecision(6))}°` : pi ? rotulaPi(k * paso) : rotula(k * paso, paso) })
    if (alfa > 0.01)
      for (let k = Math.ceil((a * n) / paso); (k * paso) / n <= b; k++) if (k % n) finas.push({ v: (k * paso) / n, alfa })
    return { paso, gruesas, finas }
  }

  private trazarEjes(opts: { etiquetaX?: string; etiquetaY?: string }, conRejilla: boolean) {
    const { ctx } = this
    const esc = this.escena
    this.sanearVentana()
    const rejilla = conRejilla && this.mostrarRejilla
    const mx = this.marcas('x')
    // a escala 1:1 el mismo paso en los dos ejes: celdas cuadradas aunque un redondeo las separe
    const ex = Math.abs(this.escalaX || 1)
    const ey = Math.abs(this.escalaY || 1)
    const mismoPaso = !esc.logX && !esc.logY && esc.unidadX === esc.unidadY && Math.abs(ex - ey) < 0.02 * ex
    const my = this.marcas('y', mismoPaso ? mx.paso : undefined)
    ctx.save()
    ctx.lineWidth = 1
    ctx.font = `11px ${varCss('--mono') || 'monospace'}`
    ctx.fillStyle = this.color('--ink-soft')

    const polar = esc.sistema === 'polar' && !esc.logX && !esc.logY
    if (rejilla && polar) this.rejillaPolar(esc.pasoX || mx.paso)
    else if (rejilla && esc.sistema === 'isometrico' && !esc.logX && !esc.logY) this.rejillaIsometrica(esc.pasoX || mx.paso)
    else if (rejilla) {
      ctx.strokeStyle = this.color('--grid')
      const vertical = (v: number) => {
        const px = Math.round(this.X(v)) + 0.5
        ctx.moveTo(px, this.vy)
        ctx.lineTo(px, this.vy + this.vh)
      }
      const horizontal = (v: number) => {
        const py = Math.round(this.Y(v)) + 0.5
        ctx.moveTo(this.vx, py)
        ctx.lineTo(this.vx + this.vw, py)
      }
      const trazar = (vs: Array<{ v: number }>, alfa: number, linea: (v: number) => void) => {
        if (!vs.length || alfa <= 0.01) return
        ctx.globalAlpha = alfa
        ctx.beginPath()
        for (const m of vs) linea(m.v)
        ctx.stroke()
      }
      trazar(mx.finas, mx.finas[0]?.alfa ?? 0, vertical)
      trazar(my.finas, my.finas[0]?.alfa ?? 0, horizontal)
      trazar(mx.gruesas, 0.75, vertical)
      trazar(my.gruesas, 0.75, horizontal)
      ctx.globalAlpha = 1
    }

    // ejes: en el origen (pegados al borde si el cero queda fuera) o en el borde, como una caja;
    // un eje logarítmico no tiene cero, así que el otro eje va siempre al borde
    const caja = esc.posicion === 'borde'
    const x0 =
      caja || esc.logX
        ? this.vx + 44
        : Math.max(this.vx + 24, Math.min(this.vx + this.vw - 24, this.X(esc.posicion === 'cruce' ? esc.cruceX : 0)))
    const y0 =
      caja || esc.logY
        ? this.vy + this.vh - 22
        : Math.max(this.vy + 18, Math.min(this.vy + this.vh - 18, this.Y(esc.posicion === 'cruce' ? esc.cruceY : 0)))
    if (!this.mostrarEjes || (!esc.ejeX && !esc.ejeY)) {
      ctx.restore()
      return
    }
    ctx.strokeStyle = esc.colorEjes || this.color('--ink-soft')
    ctx.globalAlpha = 0.75
    ctx.beginPath()
    if (esc.ejeX) {
      ctx.moveTo(this.vx, Math.round(y0) + 0.5)
      ctx.lineTo(this.vx + this.vw, Math.round(y0) + 0.5)
    }
    if (esc.ejeY) {
      ctx.moveTo(Math.round(x0) + 0.5, this.vy)
      ctx.lineTo(Math.round(x0) + 0.5, this.vy + this.vh)
    }
    ctx.stroke()
    ctx.globalAlpha = 1

    // el cero se salta donde se cruzan los ejes; en la caja se rotula
    const cruce = (v: number, paso: number, log: boolean) => !caja && !log && Math.abs(v) < paso / 2
    if (esc.ejeX) {
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      for (const m of mx.gruesas) {
        const px = this.X(m.v)
        // un número pegado al borde saldría cortado
        if (!cruce(m.v, mx.paso, esc.logX) && px > this.vx + 10 && px < this.vx + this.vw - 10) ctx.fillText(m.t, px, y0 + 5)
      }
    }
    if (esc.ejeY) {
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      for (const m of my.gruesas) {
        const py = this.Y(m.v)
        if (!cruce(m.v, my.paso, esc.logY) && py > this.vy + 6 && py < this.vy + this.vh - 6) ctx.fillText(m.t, x0 - 6, py)
      }
    }

    const etX = esc.rotuloX || opts.etiquetaX
    const etY = esc.rotuloY || opts.etiquetaY
    if (this.mostrarNombres && (etX || etY)) {
      ctx.font = `italic 19px ${varCss('--serif') || 'serif'}`
      ctx.fillStyle = this.color('--ink-soft')
      if (etX && esc.ejeX) {
        ctx.textAlign = 'right'
        ctx.textBaseline = 'bottom'
        ctx.fillText(etX, this.vx + this.vw - 10, y0 - 6)
      }
      if (etY && esc.ejeY) {
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        ctx.fillText(etY, x0 + 8, this.vy + 8)
      }
    }
    ctx.restore()
  }

  private rejillaPolar(paso: number) {
    const { ctx } = this
    const rMax = Math.max(...this.ventana.x.flatMap(x => this.ventana.y.map(y => Math.hypot(x,y))))
    paso = Math.max(paso, rMax / 300)
    ctx.save()
    ctx.beginPath(); ctx.rect(this.vx, this.vy, this.vw, this.vh); ctx.clip()
    ctx.strokeStyle = this.color('--grid'); ctx.globalAlpha = 0.75
    ctx.beginPath()
    for (let r = paso; r <= rMax; r += paso) {
      ctx.moveTo(this.X(r), this.Y(0))
      ctx.ellipse(this.X(0), this.Y(0), r*Math.abs(this.escalaX), r*Math.abs(this.escalaY), 0, 0, 2*Math.PI)
    }
    for (let a = 0; a < 360; a += this.escena.pasoAngular) {
      const t = a*Math.PI/180
      ctx.moveTo(this.X(0), this.Y(0)); ctx.lineTo(this.X(rMax*Math.cos(t)), this.Y(rMax*Math.sin(t)))
    }
    ctx.stroke(); ctx.restore()
  }

  private rejillaIsometrica(paso: number) {
    const { ctx } = this
    const { x, y } = this.ventana
    const h = Math.sqrt(3)/2
    const r = Math.max(...[...x,...y].map(Math.abs))*3 + paso
    paso = Math.max(paso, r / 500)
    ctx.save(); ctx.beginPath(); ctx.rect(this.vx,this.vy,this.vw,this.vh); ctx.clip()
    ctx.strokeStyle = this.color('--grid'); ctx.globalAlpha = 0.65; ctx.beginPath()
    for (let k = Math.floor(-r/paso); k*paso <= r; k++) {
      const b = k*paso
      ctx.moveTo(this.X(x[0]),this.Y(b*h)); ctx.lineTo(this.X(x[1]),this.Y(b*h))
      for (const signo of [-1,1]) {
        ctx.moveTo(this.X(b+signo*y[0]/(2*h)),this.Y(y[0]))
        ctx.lineTo(this.X(b+signo*y[1]/(2*h)),this.Y(y[1]))
      }
    }
    ctx.stroke(); ctx.restore()
  }

  /** Curva a partir de puntos del mundo. */
  curva(pts: Array<[number, number]>, color: string, grosor = 2, discontinua = false) {
    if (pts.length < 2) return
    const { ctx } = this
    ctx.save()
    ctx.strokeStyle = color
    ctx.lineWidth = grosor
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    if (discontinua) ctx.setLineDash([5, 5])
    ctx.beginPath()
    let conectado = false
    let py = 0
    for (const [x,y] of pts) {
      const X = this.X(x), Y = this.Y(y)
      if (!Number.isFinite(X) || !Number.isFinite(Y)) { conectado = false; continue }
      if (!conectado || Math.abs(Y-py) > this.alto*4) ctx.moveTo(X,Y)
      else ctx.lineTo(X,Y)
      conectado = true; py = Y
    }
    ctx.stroke()
    ctx.restore()
  }

  /** Curva de y = f(x) muestreada en la ventana visible. */
  /** Rectángulo de fondo para distinguir una región de otra. */
  /** Polígono relleno en coordenadas del mundo (áreas, regiones críticas). */
  rellenar(pts: Array<[number, number]>, color: string, opacidad = 0.25) {
    if (pts.length < 3) return
    const { ctx } = this
    ctx.save()
    ctx.globalAlpha = opacidad
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(this.X(pts[0][0]), this.Y(pts[0][1]))
    for (let i = 1; i < pts.length; i++) ctx.lineTo(this.X(pts[i][0]), this.Y(pts[i][1]))
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  /** Barras de histograma o de función de masa: una por `x` con su altura y anchura en unidades del mundo. */
  barras(xs: ArrayLike<number>, alturas: ArrayLike<number>, ancho: number, color: string, opacidad = 0.55) {
    const { ctx } = this
    ctx.save()
    ctx.fillStyle = color
    ctx.strokeStyle = color
    ctx.lineWidth = 1
    for (let i = 0; i < xs.length; i++) {
      const x0 = this.X(xs[i] - ancho / 2)
      const x1 = this.X(xs[i] + ancho / 2)
      const y0 = this.Y(0)
      const y1 = this.Y(alturas[i])
      ctx.globalAlpha = opacidad
      ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0))
      ctx.globalAlpha = 1
      ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0))
    }
    ctx.restore()
  }

  /** Marca un subpanel: el mismo fondo que el resto, separado por una línea fina. */
  panel() {
    const { ctx } = this
    ctx.save()
    ctx.strokeStyle = this.color('--line')
    ctx.lineWidth = 1
    ctx.strokeRect(Math.round(this.vx) + 0.5, Math.round(this.vy) + 0.5, Math.round(this.vw) - 1, Math.round(this.vh) - 1)
    ctx.restore()
  }

  funcion(f: (x: number) => number, color: string, grosor = 2, muestras = 500) {
    const m = this.muestreoX()
    const pts: Array<[number, number]> = []
    for (let i = 0; i <= muestras; i++) {
      const x = m.x(m.a + ((m.b - m.a) * i) / muestras)
      const y = f(x)
      pts.push([x, y])
    }
    this.curva(pts, color, grosor)
  }

  punto(x: number, y: number, color: string, r = 4) {
    if (!Number.isFinite(this.X(x)) || !Number.isFinite(this.Y(y))) return
    const { ctx } = this
    ctx.save()
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(this.X(x), this.Y(y), r, 0, 2 * Math.PI)
    ctx.fill()
    ctx.restore()
  }

  /** Flecha del mundo (x,y) con componentes (u,v) también del mundo. */
  flecha(x: number, y: number, u: number, v: number, color: string, grosor = 1.4, cabeza = 5) {
    const { ctx } = this
    const x1 = this.X(x)
    const y1 = this.Y(y)
    const x2 = this.X(x + u)
    const y2 = this.Y(y + v)
    const ang = Math.atan2(y2 - y1, x2 - x1)
    const largo = Math.hypot(x2 - x1, y2 - y1)
    ctx.save()
    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.lineWidth = grosor
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
    if (largo > cabeza) {
      ctx.beginPath()
      ctx.moveTo(x2, y2)
      ctx.lineTo(x2 - cabeza * Math.cos(ang - 0.4), y2 - cabeza * Math.sin(ang - 0.4))
      ctx.lineTo(x2 - cabeza * Math.cos(ang + 0.4), y2 - cabeza * Math.sin(ang + 0.4))
      ctx.closePath()
      ctx.fill()
    }
    ctx.restore()
  }

  /**
   * Campo de flechas común a todos los módulos. La malla está anclada a múltiplos de un paso del
   * mundo (no «nada» al desplazar) con ~44 px entre flechas (a potencias de 2), y cada flecha mide lo mismo en pantalla
   * a cualquier zoom; la dirección se calcula en píxeles, así no se deforma si x e y tienen escalas
   * distintas. Sin `magnitud` es un campo de direcciones (todas iguales); con ella, un campo
   * vectorial: la longitud crece, suavizada, con |F|.
   */
  campoFlechas(f: (x: number, y: number) => [number, number] | null, opts: { color?: string; magnitud?: boolean } = {}) {
    const { ctx } = this
    const ex = Math.abs(this.escalaX)
    const ey = Math.abs(this.escalaY)
    // potencias de 2: la separación se queda más cerca de la buscada que con pasos 1-2-5
    const pasoX = 2 ** Math.round(Math.log2(44 / ex))
    const pasoY = 2 ** Math.round(Math.log2(44 / ey))
    const largo = Math.min(28, 0.72 * Math.min(pasoX * ex, pasoY * ey))
    const puntos: Array<[number, number, number, number, number]> = []
    for (let i = Math.floor(this.ventana.x[0] / pasoX); (i + 0.5) * pasoX <= this.ventana.x[1]; i++)
      for (let j = Math.floor(this.ventana.y[0] / pasoY); (j + 0.5) * pasoY <= this.ventana.y[1]; j++) {
        const x = (i + 0.5) * pasoX
        const y = (j + 0.5) * pasoY
        if (x < this.ventana.x[0] || y < this.ventana.y[0]) continue
        const w = f(x, y)
        if (!w || !Number.isFinite(w[0]) || !Number.isFinite(w[1])) continue
        const m = Math.hypot(w[0], w[1])
        if (m < 1e-12) continue
        puntos.push([x, y, w[0] * ex, -w[1] * ey, m])
      }
    // referencia de |F|: el percentil 85, no el máximo (cerca de un polo el máximo lo aplasta todo)
    const orden = puntos.map((q) => q[4]).sort((a, b) => a - b)
    const ref = orden[Math.floor(0.85 * (orden.length - 1))] || 1
    ctx.save()
    ctx.strokeStyle = ctx.fillStyle = opts.color ?? this.color('--ink-soft')
    ctx.globalAlpha = 0.85
    ctx.lineWidth = 1.2
    ctx.lineCap = 'round'
    for (const [x, y, sx, sy, m] of puntos) {
      const n = Math.hypot(sx, sy)
      const l = opts.magnitud ? largo * Math.max(0.3, Math.min(1, Math.pow(m / ref, 0.5))) : largo
      const dx = (sx / n) * l
      const dy = (sy / n) * l
      const cx = this.X(x)
      const cy = this.Y(y)
      const x2 = cx + dx / 2
      const y2 = cy + dy / 2
      ctx.beginPath()
      ctx.moveTo(cx - dx / 2, cy - dy / 2)
      ctx.lineTo(x2, y2)
      ctx.stroke()
      const cabeza = Math.min(5, l * 0.4)
      const ang = Math.atan2(dy, dx)
      ctx.beginPath()
      ctx.moveTo(x2, y2)
      ctx.lineTo(x2 - cabeza * Math.cos(ang - 0.45), y2 - cabeza * Math.sin(ang - 0.45))
      ctx.lineTo(x2 - cabeza * Math.cos(ang + 0.45), y2 - cabeza * Math.sin(ang + 0.45))
      ctx.closePath()
      ctx.fill()
    }
    ctx.restore()
  }

  /** Texto en coordenadas del mundo, con desplazamiento en píxeles. */
  /** Rejilla de píxeles nx×ny (fila 0 abajo) pintada en el rectángulo del mundo [xa, xb]×[ya, yb]. */
  mapa(nx: number, ny: number, rgb: (i: number, j: number) => [number, number, number], [xa, xb, ya, yb]: [number, number, number, number], suave = true) {
    const c = (this.lienzoMapa ??= document.createElement('canvas'))
    if (c.width !== nx || c.height !== ny) {
      c.width = nx
      c.height = ny
    }
    const cx = c.getContext('2d')!
    const img = cx.createImageData(nx, ny)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const [r, g, b] = rgb(i, j)
        const k = ((ny - 1 - j) * nx + i) * 4
        img.data[k] = r * 255
        img.data[k + 1] = g * 255
        img.data[k + 2] = b * 255
        img.data[k + 3] = 255
      }
    cx.putImageData(img, 0, 0)
    this.ctx.save()
    this.ctx.imageSmoothingEnabled = suave
    this.ctx.drawImage(c, this.X(xa), this.Y(yb), this.X(xb) - this.X(xa), this.Y(ya) - this.Y(yb))
    this.ctx.restore()
  }

  texto(
    txt: string,
    x: number,
    y: number,
    color: string,
    opts: { dx?: number; dy?: number; fuente?: string; alinea?: CanvasTextAlign } = {},
  ) {
    const { ctx } = this
    ctx.save()
    ctx.fillStyle = color
    ctx.font = opts.fuente ?? `12px ${varCss('--sans') || 'sans-serif'}`
    ctx.textAlign = opts.alinea ?? 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(txt, this.X(x) + (opts.dx ?? 0), this.Y(y) + (opts.dy ?? 0))
    ctx.restore()
  }
}

/** La rejilla fina parte la gruesa en quintos (pasos 1 y 5) o en cuartos (paso 2). */
function subdivisiones(paso: number) {
  const m = Math.round(paso / Math.pow(10, Math.floor(Math.log10(paso) + 1e-9)))
  return m === 2 ? 4 : 5
}

/** Visibilidad de la rejilla fina según la separación de sus líneas en píxeles. */
function fundido(px: number) {
  const t = Math.min(1, Math.max(0, (px - 7) / (18 - 7)))
  return t * t * (3 - 2 * t)
}

function pasoBonito(bruto: number) {
  const e = Math.pow(10, Math.floor(Math.log10(Math.abs(bruto) || 1)))
  const m = bruto / e
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * e
}

function rotula(v: number, paso: number) {
  const dec = Math.max(0, -Math.floor(Math.log10(paso)))
  // «1» y «1.5», no «1.0» y «1.5»
  return v.toFixed(Math.min(4, dec)).replace(/\.?0+$/, (m) => (m.includes('.') || dec ? '' : m))
}

const lg = Math.log10

/** Paso en múltiplos de π: π/12, π/6, π/4, π/2, π, 2π, 5π… el primero que no apriete los números. */
function pasoPi(bruto: number) {
  const k = bruto / Math.PI
  for (const c of [1 / 12, 1 / 6, 1 / 4, 1 / 2]) if (k <= c) return c * Math.PI
  return pasoBonito(Math.max(k, 1)) * Math.PI
}

/** «π/2», «3π/4», «−2π»: fracción de π con denominador hasta 12. */
function rotulaPi(v: number) {
  const k = v / Math.PI
  if (Math.abs(k) < 1e-9) return '0'
  for (const d of [1, 2, 3, 4, 6, 12]) {
    const n = Math.round(k * d)
    if (Math.abs(n / d - k) > 1e-6) continue
    const signo = n < 0 ? '−' : ''
    const m = Math.abs(n)
    return `${signo}${m === 1 ? '' : m}π${d === 1 ? '' : `/${d}`}`
  }
  return `${k.toFixed(2)}π`
}

const SUPER: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' }

/** 10ᵏ: de 0,001 a 1000 con cifras; fuera, en potencia. */
function potencia10(k: number) {
  if (k >= -3 && k <= 3) return String(10 ** k)
  return `10${String(k).replace(/./g, (c) => SUPER[c] ?? c)}`
}
