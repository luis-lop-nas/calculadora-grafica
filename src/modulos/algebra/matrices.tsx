import katex from 'katex'
import { definir, type PropsPanel } from '../../nucleo/tipos'
import { Atajos, Grupo, Nota, Numero, Resultado, Segmentado } from '../../nucleo/controles'
import {
  aNum, autovalores, baseImagen, determinante, diagonalizar, fmtNum, gaussJordan, identidadR, inversa, leerR, lu, mulR, nucleo, qr, R0, rango,
  sistema, sumaR, svd, texM, texMnum, texPolinomio, texR, textoR, trazaR, transpuestaR, type MR, type Paso,
} from '../../lib/matrizExacta'
import type { R } from '../../lib/cas/polinomios'

type Op = 'rref' | 'det' | 'inversa' | 'sistema' | 'rango' | 'autovalores' | 'lu' | 'qr' | 'producto' | 'potencia'

export interface EstadoMatrices {
  op: Op
  A: string[][]
  B: string[][]
  b: string[]
  k: number
}

const NOMBRES: Record<Op, string> = {
  rref: 'Escalonada reducida (Gauss–Jordan)',
  det: 'Determinante',
  inversa: 'Inversa',
  sistema: 'Sistema A·x = b',
  rango: 'Rango, núcleo e imagen',
  autovalores: 'Autovalores y diagonalización',
  lu: 'Factorización LU',
  qr: 'QR y valores singulares',
  producto: 'Producto y suma con B',
  potencia: 'Potencia Aᵏ',
}
const CUADRADA = new Set<Op>(['det', 'inversa', 'autovalores', 'lu', 'potencia'])

const aTexto = (M: number[][]) => M.map((f) => f.map(String))

const EJEMPLOS: Array<{ t: string; A: number[][] | string[][]; b?: number[]; B?: number[][]; op?: Op }> = [
  { t: 'Invertible 3×3', A: [[2, 1, 1], [1, 3, 2], [1, 0, 0]] },
  { t: 'Singular (rango 2)', A: [[1, 2, 3], [4, 5, 6], [7, 8, 9]] },
  { t: 'Con fracciones', A: [['1/2', '1/3', '0'], ['1/4', '1', '-2/5'], ['0', '3', '1']] },
  { t: 'Sistema compatible determinado', A: [[1, 1, 1], [1, -1, 2], [2, 1, -1]], b: [6, 5, 1], op: 'sistema' },
  { t: 'Sistema compatible indeterminado', A: [[1, 1, 1], [1, -1, 2], [2, 0, 3]], b: [6, 5, 11], op: 'sistema' },
  { t: 'Sistema incompatible', A: [[1, 1, 1], [1, -1, 2], [2, 0, 3]], b: [6, 5, 10], op: 'sistema' },
  { t: 'Diagonalizable (simétrica)', A: [[2, 0, 0], [0, 3, 4], [0, 4, 9]], op: 'autovalores' },
  { t: 'No diagonalizable (Jordan)', A: [[2, 1, 0], [0, 2, 0], [0, 0, 3]], op: 'autovalores' },
  { t: 'Autovalores complejos (giro)', A: [[0, -1], [1, 0]], op: 'autovalores' },
  { t: 'Autovalores irracionales', A: [[1, 2], [3, 4]], op: 'autovalores' },
  { t: 'LU con permutación', A: [[0, 2, 1], [1, 1, 0], [2, 1, 1]], op: 'lu' },
  { t: 'Rectangular 3×4', A: [[1, 2, 0, 3], [2, 4, 1, 7], [1, 2, 1, 4]], op: 'rango' },
  { t: 'Fibonacci (potencia)', A: [[1, 1], [1, 0]], op: 'potencia' },
]

/* ---------- lectura de las celdas ---------- */

interface Leida {
  M: MR | null
  malas: Array<[number, number]>
}

function leer(T: string[][]): Leida {
  const malas: Array<[number, number]> = []
  const M = T.map((f, i) =>
    f.map((t, j) => {
      const v = leerR(t)
      if (!v) malas.push([i, j])
      return v ?? R0
    }),
  )
  return { M: malas.length ? null : M, malas }
}

const redimensiona = (T: string[][], m: number, n: number): string[][] =>
  Array.from({ length: m }, (_, i) => Array.from({ length: n }, (_, j) => T[i]?.[j] ?? '0'))

/* ---------- editor ---------- */

function EditorMatriz({ T, onChange, nombre, malas, derecha, onDerecha }: {
  T: string[][]
  onChange: (T: string[][]) => void
  nombre: string
  malas: Array<[number, number]>
  /** Columna aparte (el término independiente b). */
  derecha?: string[]
  onDerecha?: (b: string[]) => void
}) {
  const m = T.length
  const n = T[0]?.length ?? 0
  const mala = (i: number, j: number) => malas.some(([a, b]) => a === i && b === j)
  const celda = (valor: string, cambia: (v: string) => void, error: boolean, clave: string) => (
    <div className="celda" key={clave}>
      <input
        type="text"
        inputMode="decimal"
        spellCheck={false}
        value={valor}
        aria-label={clave}
        style={error ? { outline: '1.5px solid var(--rosa)' } : undefined}
        onFocus={(e) => e.target.select()}
        onChange={(e) => cambia(e.target.value)}
      />
    </div>
  )
  return (
    <>
      <div style={{ display: 'flex', gap: 10, alignItems: 'end' }}>
        <Numero etiqueta={`filas de ${nombre}`} valor={m} opciones={[1, 2, 3, 4, 5, 6]} onChange={(k) => {
          onChange(redimensiona(T, k, n))
          if (derecha && onDerecha) onDerecha(Array.from({ length: k }, (_, i) => derecha[i] ?? '0'))
        }} />
        <Numero etiqueta="columnas" valor={n} opciones={[1, 2, 3, 4, 5, 6]} onChange={(k) => onChange(redimensiona(T, m, k))} />
      </div>
      <div className="matriz-marco" style={{ overflowX: 'auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {T.map((f, i) => (
            <div key={i} className="celdas" style={{ gridTemplateColumns: `repeat(${n}, 54px)${derecha ? ' 8px 54px' : ''}` }}>
              {f.map((v, j) => celda(v, (x) => onChange(T.map((g, a) => (a === i ? g.map((w, b) => (b === j ? x : w)) : g))), mala(i, j), `${nombre}${i + 1}${j + 1}`))}
              {derecha && onDerecha && (
                <>
                  <span style={{ borderLeft: '1.5px solid var(--ink-soft)', height: '100%' }} />
                  {celda(derecha[i] ?? '0', (x) => onDerecha(derecha.map((w, a) => (a === i ? x : w))), leerR(derecha[i] ?? '0') === null, `b${i + 1}`)}
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

function Panel({ s, set }: PropsPanel<EstadoMatrices>) {
  const lA = leer(s.A)
  const lB = leer(s.B)
  return (
    <>
      <Grupo titulo="Operación">
        <Segmentado valor={s.op} opciones={(Object.keys(NOMBRES) as Op[]).map((v) => ({ v, t: NOMBRES[v] }))} onChange={(op) => set({ op })} />
        <Atajos
          opciones={EJEMPLOS.map((e) => ({
            t: e.t,
            onClick: () =>
              set({
                A: e.A.map((f) => f.map(String)),
                ...(e.op ? { op: e.op } : {}),
                ...(e.b ? { b: e.b.map(String) } : { b: e.A.map(() => '0') }),
              }),
          }))}
        />
      </Grupo>
      <Grupo titulo="Matriz A">
        <EditorMatriz
          T={s.A}
          nombre="A"
          malas={lA.malas}
          onChange={(A) => set({ A })}
          derecha={s.op === 'sistema' ? redimensionaV(s.b, s.A.length) : undefined}
          onDerecha={(b) => set({ b })}
        />
        <Nota>
          Cada casilla admite enteros, fracciones (−2/5) y decimales (0,25 se toma como 1/4): todo se calcula con fracciones exactas.
          {s.op === 'sistema' && ' La columna tras la raya es b.'}
        </Nota>
      </Grupo>
      {s.op === 'producto' && (
        <Grupo titulo="Matriz B">
          <EditorMatriz T={s.B} nombre="B" malas={lB.malas} onChange={(B) => set({ B })} />
        </Grupo>
      )}
      {s.op === 'potencia' && (
        <Grupo titulo="Exponente">
          <Numero etiqueta="k" valor={s.k} opciones={[-3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20]} onChange={(k) => set({ k })} />
        </Grupo>
      )}
      <Resultado />
    </>
  )
}

const redimensionaV = (b: string[], m: number) => Array.from({ length: m }, (_, i) => b[i] ?? '0')

/* ---------- vista: el cálculo con sus pasos ---------- */

function Tex({ t, bloque = false }: { t: string; bloque?: boolean }) {
  return <span dangerouslySetInnerHTML={{ __html: katex.renderToString(t, { displayMode: bloque, throwOnError: false, output: 'html' }) }} />
}

function Pasos({ inicio, pasos, barra }: { inicio: MR; pasos: Paso[]; barra?: number }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px 10px', alignItems: 'center' }}>
      <Tex t={texM(inicio, barra)} />
      {pasos.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <div style={{ fontSize: 11, color: 'var(--ink-soft)', maxWidth: 220, textAlign: 'center', lineHeight: 1.5 }}>
              {p.ops.map((o, k) => (
                <div key={k}>
                  <Tex t={o} />
                </div>
              ))}
              {p.nota && <div>{p.nota}</div>}
            </div>
            <Tex t="\sim" />
          </div>
          <Tex t={texM(p.M, barra)} />
        </div>
      ))}
    </div>
  )
}

const vector = (v: R[]) => `\\begin{pmatrix}${v.map(texR).join(' \\\\ ')}\\end{pmatrix}`

function Vista({ s }: { s: EstadoMatrices }) {
  const { M: A, malas } = leer(s.A)
  if (!A) return <p>Hay {malas.length} casilla(s) que no son un número: se marcan en el panel.</p>
  const m = A.length
  const n = A[0].length
  if (CUADRADA.has(s.op) && m !== n) return <><h2>{NOMBRES[s.op]}</h2><p>Hace falta una matriz cuadrada: A es {m}×{n}.</p></>
  const titulo = <h2>{NOMBRES[s.op]}</h2>

  switch (s.op) {
    case 'rref': {
      const e = gaussJordan(A)
      return (
        <div>
          {titulo}
          <p>Operaciones elementales por filas hasta que cada pivote es un 1 y es lo único que hay en su columna. Rango: <b>{e.pivotes.length}</b>; pivotes en las columnas {e.pivotes.map((c) => c + 1).join(', ') || '—'}.</p>
          <h3>Pasos</h3>
          <Pasos inicio={A} pasos={e.pasos} />
          <h3>Resultado</h3>
          <Tex bloque t={`\\operatorname{rref}(A) = ${texM(e.R)}`} />
        </div>
      )
    }
    case 'det': {
      const d = determinante(A)
      return (
        <div>
          {titulo}
          <p>Se lleva a forma triangular sumando múltiplos de unas filas a otras (no cambia el determinante); cada intercambio cambia el signo. Al final es el producto de la diagonal.</p>
          <h3>Pasos</h3>
          <Pasos inicio={A} pasos={d.pasos} />
          <h3>Resultado</h3>
          <Tex bloque t={`\\det A = ${d.cuenta}`} />
          {n === 2 && <Tex bloque t={`\\text{Comprobación: } ad - bc = ${texR(A[0][0])}\\cdot ${texR(A[1][1])} - ${texR(A[0][1])}\\cdot ${texR(A[1][0])}`} />}
        </div>
      )
    }
    case 'inversa': {
      const r = inversa(A)
      const aum = A.map((f, i) => [...f, ...identidadR(n)[i]])
      return (
        <div>
          {titulo}
          <p>Gauss–Jordan sobre (A | I): cuando a la izquierda queda I, a la derecha está A⁻¹.</p>
          <h3>Pasos</h3>
          <Pasos inicio={aum} pasos={r.pasos} barra={n} />
          <h3>Resultado</h3>
          {r.inv ? (
            <>
              <Tex bloque t={`A^{-1} = ${texM(r.inv)}`} />
              <Tex bloque t={`A\\,A^{-1} = ${texM(mulR(A, r.inv))}`} />
            </>
          ) : (
            <p>A no es invertible: su rango es {rango(A)} &lt; {n}, así que el determinante es 0.</p>
          )}
        </div>
      )
    }
    case 'sistema': {
      const b = redimensionaV(s.b, m).map((t) => leerR(t))
      if (b.some((v) => !v)) return <p>Alguna casilla de b no es un número.</p>
      const sis = sistema(A, b as R[])
      const aum = A.map((f, i) => [...f, b[i]!])
      const x = (j: number) => `x_{${j + 1}}`
      const libres = sis.libres.map((j, k) => [j, `\\lambda_{${k + 1}}`] as const)
      return (
        <div>
          {titulo}
          <p>
            Rouché–Frobenius: rg A = {sis.rangoA}, rg (A | b) = {sis.rangoAb}, n = {n} incógnitas.{' '}
            <b>{sis.tipo[0].toUpperCase() + sis.tipo.slice(1)}</b>
            {sis.tipo === 'compatible indeterminado' ? `, con ${n - sis.rangoA} parámetro(s).` : '.'}
          </p>
          <h3>Pasos sobre la matriz ampliada</h3>
          <Pasos inicio={aum} pasos={sis.pasos} barra={n} />
          <h3>Solución</h3>
          {sis.tipo === 'incompatible' ? (
            <p>Queda una fila 0 = c con c ≠ 0: no hay solución.</p>
          ) : (
            <>
              {libres.length > 0 && <Tex bloque t={libres.map(([j, l]) => `${x(j)} = ${l}`).join(',\\quad ')} />}
              <Tex
                bloque
                t={`\\begin{pmatrix}${[...Array(n).keys()].map(x).join(' \\\\ ')}\\end{pmatrix} = ${vector(sis.particular!)}${sis.direcciones.map((d, k) => ` + \\lambda_{${k + 1}}${vector(d)}`).join('')}`}
              />
            </>
          )}
        </div>
      )
    }
    case 'rango': {
      const e = gaussJordan(A)
      const ker = nucleo(A)
      const im = baseImagen(A)
      return (
        <div>
          {titulo}
          <p>rg A = {e.pivotes.length}; dim ker A = {n} − {e.pivotes.length} = {ker.length} (teorema del rango).</p>
          <h3>Escalonada reducida</h3>
          <Pasos inicio={A} pasos={e.pasos} />
          <h3>Núcleo: A·x = 0</h3>
          {ker.length ? <Tex bloque t={`\\ker A = \\left\\langle ${ker.map(vector).join(',\\ ')} \\right\\rangle`} /> : <p>Solo el vector cero: A es inyectiva.</p>}
          <h3>Imagen: las columnas con pivote</h3>
          <Tex bloque t={`\\operatorname{Im} A = \\left\\langle ${im.vectores.map(vector).join(',\\ ') || '0'} \\right\\rangle\\quad(\\text{columnas } ${im.indices.map((c) => c + 1).join(', ') || '—'})`} />
          <h3>Espacio fila</h3>
          <Tex bloque t={`\\left\\langle ${e.R.filter((f) => f.some((v) => v.n !== 0n)).map((f) => `(${f.map(texR).join(',\\,')})`).join(',\\ ') || '0'} \\right\\rangle`} />
        </div>
      )
    }
    case 'autovalores': {
      let res: ReturnType<typeof autovalores>
      try {
        res = autovalores(A)
      } catch (e) {
        return <p>{(e as Error).message}</p>
      }
      const dg = diagonalizar(A, res.valores)
      return (
        <div>
          {titulo}
          <h3>Polinomio característico</h3>
          <Tex bloque t={`p(\\lambda) = \\det(\\lambda I - A) = ${texPolinomio(res.p)}`} />
          <h3>Autovalores y subespacios propios</h3>
          <table className="cayley" style={{ marginBottom: 8 }}>
            <thead>
              <tr>
                <th>λ</th>
                <th>mult. algebraica</th>
                <th>mult. geométrica</th>
                <th>vectores propios</th>
              </tr>
            </thead>
            <tbody>
              {res.valores.map((v, i) => (
                <tr key={i}>
                  <td><Tex t={v.tex} /></td>
                  <td>{v.algebraica}</td>
                  <td>{v.geometrica ?? '—'}</td>
                  <td style={{ textAlign: 'left' }}>
                    {v.vectores ? <Tex t={v.vectores.map(vector).join(',\\ ')} /> : v.vectoresNum ? <Tex t={v.vectoresNum.map((w) => `\\begin{pmatrix}${w.map((c) => fmtNum(c, 4)).join(' \\\\ ')}\\end{pmatrix}`).join(',\\ ')} /> : <span>complejos</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3>¿Diagonalizable?</h3>
          <p><b>{dg.sobreR ? 'Sí' : 'No'}</b>: {dg.motivo}.</p>
          {dg.P && dg.D && (
            <>
              <Tex bloque t={`A = P\\,D\\,P^{-1},\\quad P = ${texM(dg.P)},\\quad D = ${texM(dg.D)}`} />
              <Tex bloque t={`A\\,P = ${texM(mulR(A, dg.P))} = P\\,D`} />
            </>
          )}
          {dg.jordan && !dg.sobreR && (
            <>
              <h3>Forma de Jordan</h3>
              <p>Bloques por autovalor, de los rangos de (A − λI)ᵏ:</p>
              <Tex bloque t={`J = ${texJordan(dg.jordan)}`} />
            </>
          )}
          <p>Comprobaciones: traza = {textoR(trazaR(A))} = suma de autovalores; det = {textoR(determinante(A).valor)} = su producto.</p>
        </div>
      )
    }
    case 'lu': {
      const f = lu(A)
      if (!f) return <p>Hace falta una matriz cuadrada.</p>
      return (
        <div>
          {titulo}
          <p>{f.permuta ? 'Algún pivote salía 0 y hubo que permutar filas: P·A = L·U.' : 'Sin permutaciones: A = L·U, con los multiplicadores de Gauss debajo de la diagonal de L.'}</p>
          <Tex bloque t={`${f.permuta ? `P = ${texM(f.P)},\\quad ` : ''}L = ${texM(f.L)},\\quad U = ${texM(f.U)}`} />
          <Tex bloque t={`${f.permuta ? 'P\\,A' : 'A'} = L\\,U = ${texM(mulR(f.L, f.U))}`} />
        </div>
      )
    }
    case 'qr': {
      const An = aNum(A)
      const f = m >= n ? qr(An) : null
      const d = svd(An)
      const tol = 1e-10 * Math.max(1, d.sigma[0] ?? 0)
      const rg = d.sigma.filter((x) => x > tol).length
      return (
        <div>
          {titulo}
          <p>Estas dos necesitan raíces cuadradas: van en decimales.</p>
          <h3>QR (Gram–Schmidt modificado)</h3>
          {f ? <Tex bloque t={`Q = ${texMnum(f.Q)},\\quad R = ${texMnum(f.R)}`} /> : <p>{m < n ? 'Con más columnas que filas no hay QR reducida.' : 'Las columnas son dependientes: no hay QR con R invertible.'}</p>}
          <h3>Valores singulares (SVD)</h3>
          <Tex bloque t={`\\sigma = ${d.sigma.map((x) => fmtNum(x, 6)).join(',\\ ')}`} />
          <p>Rango numérico {rg}. {rg === n && d.sigma[n - 1] > tol ? `Número de condición σ₁/σₙ = ${fmtNum(d.sigma[0] / d.sigma[n - 1], 4).replace('{,}', ',')}.` : ''}</p>
          <Tex bloque t={`V = ${texMnum(d.V)}`} />
        </div>
      )
    }
    case 'producto': {
      const { M: B } = leer(s.B)
      if (!B) return <p>Alguna casilla de B no es un número.</p>
      return (
        <div>
          {titulo}
          {B.length === n ? <Tex bloque t={`A\\,B = ${texM(A)}${texM(B)} = ${texM(mulR(A, B))}`} /> : <p>A·B necesita que B tenga {n} filas (tiene {B.length}).</p>}
          {B.length === m && B[0].length === n ? <Tex bloque t={`A + B = ${texM(sumaR(A, B))}`} /> : <p>A + B necesita el mismo tamaño.</p>}
          <Tex bloque t={`A^{T} = ${texM(transpuestaR(A))}`} />
        </div>
      )
    }
    case 'potencia': {
      let base: MR | null = A
      if (s.k < 0) base = inversa(A).inv
      if (!base) return <p>A no es invertible: no hay potencias negativas.</p>
      let P = identidadR(n)
      for (let i = 0; i < Math.abs(s.k); i++) P = mulR(P, base)
      return (
        <div>
          {titulo}
          <Tex bloque t={`A^{${s.k}} = ${texM(P)}`} />
        </div>
      )
    }
  }
}

function texJordan(bloques: Array<{ l: R; tamanos: number[] }>): string {
  const lista = bloques.flatMap((b) => b.tamanos.map((t) => ({ l: b.l, t })))
  const n = lista.reduce((s, b) => s + b.t, 0)
  const J: string[][] = Array.from({ length: n }, () => Array(n).fill('0'))
  let k = 0
  for (const b of lista) {
    for (let i = 0; i < b.t; i++) {
      J[k + i][k + i] = texR(b.l)
      if (i + 1 < b.t) J[k + i][k + i + 1] = '1'
    }
    k += b.t
  }
  return `\\begin{pmatrix}${J.map((f) => f.join(' & ')).join(' \\\\ ')}\\end{pmatrix}`
}

/* ---------- panel de resultados ---------- */

function lecturas(s: EstadoMatrices): Array<[string, string]> {
  const { M: A } = leer(s.A)
  if (!A) return [['Estado', 'hay casillas que no son números']]
  const m = A.length
  const n = A[0].length
  const filas: Array<[string, string]> = [['Tamaño', `${m}×${n}`], ['Rango', String(rango(A))]]
  if (m === n) {
    const d = determinante(A).valor
    filas.push(['Determinante', textoR(d)], ['Traza', textoR(trazaR(A))], ['¿Invertible?', d.n !== 0n ? 'sí' : 'no'])
  }
  if (s.op === 'sistema') {
    const b = redimensionaV(s.b, m).map((t) => leerR(t))
    if (b.every(Boolean)) filas.push(['Sistema', sistema(A, b as R[]).tipo])
  }
  if (s.op === 'autovalores' && m === n) {
    try {
      const res = autovalores(A)
      filas.push(['Autovalores', res.valores.map((v) => (v.im ? `${fmtNum(v.re, 4)}${v.im > 0 ? '+' : '−'}${fmtNum(Math.abs(v.im), 4)}i` : fmtNum(v.re, 4)).replace(/\{,\}/g, ',')).join('; ')])
      filas.push(['¿Diagonalizable en ℝ?', diagonalizar(A, res.valores).sobreR ? 'sí' : 'no'])
    } catch {
      /* sin autovalores */
    }
  }
  return filas
}

export default definir<EstadoMatrices>({
  id: 'matrices',
  area: 'algebra',
  resumen: 'Matrices paso a paso: Gauss–Jordan, determinante, inversa, sistemas, núcleo, autovalores, diagonalización, Jordan, LU, QR y SVD',
  corto: 'Matrices',
  titulo: 'Matrices <i>paso a paso</i>',
  entradilla: 'Con fracciones exactas y cada operación de fila a la vista, como en papel.',
  inicial: { op: 'rref', A: aTexto([[2, 1, 1], [1, 3, 2], [1, 0, 0]]), B: aTexto([[1, 0, 2], [0, 1, 0], [1, 1, 1]]), b: ['1', '2', '3'], k: 2 },
  Panel,
  resultadoEnPanel: true,
  rotulo: (s) => ({ nombre: NOMBRES[s.op], apunte: `${s.A.length}×${s.A[0]?.length ?? 0}` }),
  formula: (s) => {
    switch (s.op) {
      case 'sistema':
        return [String.raw`\operatorname{rg} A = \operatorname{rg}(A\,|\,b) = n:\ \text{determinado}`, String.raw`\operatorname{rg} A = \operatorname{rg}(A\,|\,b) < n:\ \text{indeterminado}`, String.raw`\operatorname{rg} A < \operatorname{rg}(A\,|\,b):\ \text{incompatible}`]
      case 'autovalores':
        return [String.raw`A\,v = \lambda\,v,\qquad \det(\lambda I - A) = 0`, String.raw`1 \le \dim \ker(A - \lambda I) \le m_a(\lambda)`]
      case 'det':
        return [String.raw`\det(AB) = \det A\,\det B,\qquad A^{-1} = \frac{\operatorname{adj}(A)^{T}}{\det A}`]
      case 'rango':
        return [String.raw`\dim \ker A + \operatorname{rg} A = n`]
      default:
        return []
    }
  },
  lecturas,
  vista: { tipo: 'html', Componente: Vista },
})
