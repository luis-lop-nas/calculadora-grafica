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
  /** Trozo del lienzo en el que se está dibujando, en píxeles. */
  private vx = 0
  private vy = 0
  private vw = 0
  private vh = 0

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

  /** Rejilla y ejes con números. `paso` automático si no se da. */
  ejes(opts: { etiquetaX?: string; etiquetaY?: string; rejilla?: boolean; paso?: number } = {}) {
    const { ctx } = this
    const { rejilla = true } = opts
    // un paso por eje: si no, una ventana alta y estrecha se llena de números
    const pasoX = opts.paso ?? pasoBonito((this.ventana.x[1] - this.ventana.x[0]) / 8)
    const pasoY = opts.paso ?? pasoBonito((this.ventana.y[1] - this.ventana.y[0]) / 6)
    ctx.save()
    ctx.lineWidth = 1
    ctx.font = `11px ${varCss('--mono') || 'monospace'}`
    ctx.fillStyle = this.color('--ink-soft')

    if (rejilla) {
      ctx.strokeStyle = this.color('--grid')
      ctx.globalAlpha = 0.5
      ctx.beginPath()
      for (let v = Math.ceil(this.ventana.x[0] / pasoX) * pasoX; v <= this.ventana.x[1]; v += pasoX) {
        ctx.moveTo(Math.round(this.X(v)) + 0.5, this.vy)
        ctx.lineTo(Math.round(this.X(v)) + 0.5, this.vy + this.vh)
      }
      for (let v = Math.ceil(this.ventana.y[0] / pasoY) * pasoY; v <= this.ventana.y[1]; v += pasoY) {
        ctx.moveTo(this.vx, Math.round(this.Y(v)) + 0.5)
        ctx.lineTo(this.vx + this.vw, Math.round(this.Y(v)) + 0.5)
      }
      ctx.stroke()
      ctx.globalAlpha = 1
    }

    // ejes, pegados al borde si el cero queda fuera de la ventana
    const x0 = Math.max(this.vx + 24, Math.min(this.vx + this.vw - 24, this.X(0)))
    const y0 = Math.max(this.vy + 18, Math.min(this.vy + this.vh - 18, this.Y(0)))
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

    if (opts.etiquetaX || opts.etiquetaY) {
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
  fondoRegion(color: string) {
    this.ctx.save()
    this.ctx.fillStyle = color
    this.ctx.fillRect(this.vx, this.vy, this.vw, this.vh)
    this.ctx.restore()
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

function pasoBonito(bruto: number) {
  const e = Math.pow(10, Math.floor(Math.log10(Math.abs(bruto) || 1)))
  const m = bruto / e
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * e
}

function rotula(v: number, paso: number) {
  const dec = Math.max(0, -Math.floor(Math.log10(paso)))
  return v.toFixed(Math.min(4, dec))
}
