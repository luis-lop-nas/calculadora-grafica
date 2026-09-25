import { varCss } from './tema'

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
    const { x, y } = this.ventana
    const w = this.vw || this.ancho
    const h = this.vh || this.alto
    const e = Math.max((x[1] - x[0]) / w, (y[1] - y[0]) / h)
    const cx = (x[0] + x[1]) / 2
    const cy = (y[0] + y[1]) / 2
    this.ventana = {
      x: [cx - (e * w) / 2, cx + (e * w) / 2],
      y: [cy - (e * h) / 2, cy + (e * h) / 2],
    }
  }

  X(x: number) {
    const [a, b] = this.ventana.x
    return this.vx + ((x - a) / (b - a)) * this.vw
  }
  Y(y: number) {
    const [a, b] = this.ventana.y
    return this.vy + this.vh - ((y - a) / (b - a)) * this.vh
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
    return {
      x: x[0] + ((px - this.vx) / this.vw) * (x[1] - x[0]),
      y: y[0] + (1 - (py - this.vy) / this.vh) * (y[1] - y[0]),
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

  private trazarEjes(opts: { etiquetaX?: string; etiquetaY?: string }, conRejilla: boolean) {
    const { ctx } = this
    const rejilla = conRejilla && this.mostrarRejilla
    // un paso por eje: si no, una ventana alta y estrecha se llena de números
    const pasoX = pasoBonito(90 / Math.abs(this.escalaX || 1))
    const pasoY = pasoBonito(90 / Math.abs(this.escalaY || 1))
    ctx.save()
    ctx.lineWidth = 1
    ctx.font = `11px ${varCss('--mono') || 'monospace'}`
    ctx.fillStyle = this.color('--ink-soft')

    if (rejilla) {
      ctx.strokeStyle = this.color('--grid')
      const lineas = (paso: number, alfa: number, saltar: number) => {
        if (alfa <= 0.01) return
        ctx.globalAlpha = alfa
        ctx.beginPath()
        for (let k = Math.ceil(this.ventana.x[0] / paso); k * paso <= this.ventana.x[1]; k++) {
          if (saltar && k % saltar === 0) continue
          const px = Math.round(this.X(k * paso)) + 0.5
          ctx.moveTo(px, this.vy)
          ctx.lineTo(px, this.vy + this.vh)
        }
        ctx.stroke()
      }
      const lineasY = (paso: number, alfa: number, saltar: number) => {
        if (alfa <= 0.01) return
        ctx.globalAlpha = alfa
        ctx.beginPath()
        for (let k = Math.ceil(this.ventana.y[0] / paso); k * paso <= this.ventana.y[1]; k++) {
          if (saltar && k % saltar === 0) continue
          const py = Math.round(this.Y(k * paso)) + 0.5
          ctx.moveTo(this.vx, py)
          ctx.lineTo(this.vx + this.vw, py)
        }
        ctx.stroke()
      }
      const nx = subdivisiones(pasoX)
      const ny = subdivisiones(pasoY)
      lineas(pasoX / nx, 0.5 * fundido((pasoX / nx) * Math.abs(this.escalaX)), nx)
      lineasY(pasoY / ny, 0.5 * fundido((pasoY / ny) * Math.abs(this.escalaY)), ny)
      lineas(pasoX, 0.75, 0)
      lineasY(pasoY, 0.75, 0)
      ctx.globalAlpha = 1
    }

    // ejes, pegados al borde si el cero queda fuera de la ventana
    const x0 = Math.max(this.vx + 24, Math.min(this.vx + this.vw - 24, this.X(0)))
    const y0 = Math.max(this.vy + 18, Math.min(this.vy + this.vh - 18, this.Y(0)))
    if (!this.mostrarEjes) {
      ctx.restore()
      return
    }
    ctx.strokeStyle = this.color('--ink-soft')
    ctx.globalAlpha = 0.75
    ctx.beginPath()
    ctx.moveTo(this.vx, Math.round(y0) + 0.5)
    ctx.lineTo(this.vx + this.vw, Math.round(y0) + 0.5)
    ctx.moveTo(Math.round(x0) + 0.5, this.vy)
    ctx.lineTo(Math.round(x0) + 0.5, this.vy + this.vh)
    ctx.stroke()
    ctx.globalAlpha = 1

    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    for (let v = Math.ceil(this.ventana.x[0] / pasoX) * pasoX; v <= this.ventana.x[1]; v += pasoX) {
      if (Math.abs(v) < pasoX / 2) continue
      ctx.fillText(rotula(v, pasoX), this.X(v), y0 + 5)
    }
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    for (let v = Math.ceil(this.ventana.y[0] / pasoY) * pasoY; v <= this.ventana.y[1]; v += pasoY) {
      if (Math.abs(v) < pasoY / 2) continue
      ctx.fillText(rotula(v, pasoY), x0 - 6, this.Y(v))
    }

    if (this.mostrarNombres && (opts.etiquetaX || opts.etiquetaY)) {
      ctx.font = `italic 19px ${varCss('--serif') || 'serif'}`
      ctx.fillStyle = this.color('--ink-soft')
      if (opts.etiquetaX) {
        ctx.textAlign = 'right'
        ctx.textBaseline = 'bottom'
        ctx.fillText(opts.etiquetaX, this.vx + this.vw - 10, y0 - 6)
      }
      if (opts.etiquetaY) {
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        ctx.fillText(opts.etiquetaY, x0 + 8, this.vy + 8)
      }
    }
    ctx.restore()
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
    ctx.moveTo(this.X(pts[0][0]), this.Y(pts[0][1]))
    for (let i = 1; i < pts.length; i++) ctx.lineTo(this.X(pts[i][0]), this.Y(pts[i][1]))
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
    const [a, b] = this.ventana.x
    const pts: Array<[number, number]> = []
    for (let i = 0; i <= muestras; i++) {
      const x = a + ((b - a) * i) / muestras
      const y = f(x)
      if (Number.isFinite(y)) pts.push([x, y])
    }
    this.curva(pts, color, grosor)
  }

  punto(x: number, y: number, color: string, r = 4) {
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
