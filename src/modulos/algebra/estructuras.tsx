import { definir, type PropsPanel } from '../../nucleo/tipos'
import { radios } from '../../nucleo/menu'
import { Grupo as GrupoUI, Nota, Rango, Segmentado } from '../../nucleo/controles'
import {
  abeliano, centro, diedral, divisores, inverso, mcd, orden, simetrico, subgrupos, zn,
  type Grupo,
} from '../../lib/grupos'

type Tipo = 'anillo' | 'simetrico' | 'diedral'

interface S {
  tipo: Tipo
  n: number
}

const grupo = (s: S): Grupo =>
  s.tipo === 'simetrico' ? simetrico(Math.min(4, Math.max(2, s.n))) : s.tipo === 'diedral' ? diedral(s.n) : zn(s.n)

function Panel({ s, set }: PropsPanel<S>) {
  return (
    <>
      <GrupoUI titulo="Estructura">
        <Segmentado
          columnas={3}
          valor={s.tipo}
          opciones={[
            { v: 'anillo', t: 'Anillo Zₙ' },
            { v: 'simetrico', t: 'Sₙ' },
            { v: 'diedral', t: 'Dₙ' },
          ]}
          onChange={(tipo) => set({ tipo, n: tipo === 'simetrico' ? 3 : tipo === 'diedral' ? 4 : 12 })}
        />
        <Rango
          etiqueta="n"
          valor={s.n}
          min={2}
          max={s.tipo === 'simetrico' ? 4 : s.tipo === 'diedral' ? 8 : 24}
          paso={1}
          formato={(v) => `${v}`}
          onChange={(n) => set({ n })}
        />
        <Nota>
          {s.tipo === 'anillo' ? (
            <>
              Las dos tablas son la suma y el producto de <b>Zₙ</b>. Naranja = divisores de cero;
              azul = unidades (los que tienen inverso).
            </>
          ) : s.tipo === 'simetrico' ? (
            <>
              Permutaciones de n elementos en notación de una línea: <b>(231)</b> manda 1→2, 2→3, 3→1.
            </>
          ) : (
            <>
              Simetrías del polígono de n lados: <b>r</b> gira y <b>s</b> refleja, con sr = r⁻¹s.
            </>
          )}
        </Nota>
      </GrupoUI>
    </>
  )
}

function esPrimo(n: number) {
  if (n < 2) return false
  for (let i = 2; i * i <= n; i++) if (n % i === 0) return false
  return true
}

export default definir<S>({
  id: 'estructuras',
  area: 'algebra',
  resumen: 'Grupos, anillos y cuerpos',
  corto: 'Grupos, anillos y cuerpos',
  titulo: 'Grupos, anillos y <i>cuerpos</i>',
  entradilla: 'La tabla de la operación es la estructura entera: todo lo demás se lee en ella.',
  inicial: { tipo: 'anillo', n: 12 },
  Panel,
  menu: (s) => ({
    acciones: [
      radios<S, Tipo>('Estructura', [{ v: 'anillo', t: 'Anillo Zₙ' }, { v: 'simetrico', t: 'Grupo simétrico Sₙ' }, { v: 'diedral', t: 'Grupo diédrico Dₙ' }], s.tipo, (tipo) => ({ tipo, n: tipo === 'simetrico' ? 3 : tipo === 'diedral' ? 4 : 12 })),
      radios<S, number>(
        'n',
        Array.from({ length: (s.tipo === 'simetrico' ? 4 : s.tipo === 'diedral' ? 8 : 24) - 1 }, (_, i) => ({ v: i + 2, t: String(i + 2) })),
        s.n,
        (n) => ({ n }),
      ),
    ],
  }),
  rotulo: (s) => {
    const G = grupo(s)
    if (s.tipo === 'anillo')
      return {
        nombre: `Z<sub>${s.n}</sub>`,
        apunte: esPrimo(s.n) ? 'cuerpo (n primo)' : 'anillo con divisores de cero',
      }
    return { nombre: G.nombre, apunte: abeliano(G) ? 'abeliano' : 'no abeliano' }
  },
  formula: (s) =>
    s.tipo === 'anillo'
      ? [
          String.raw`\mathbb{Z}_n \text{ es cuerpo} \iff n \text{ primo}`,
          String.raw`U(\mathbb{Z}_n)=\{a : \gcd(a,n)=1\}`,
          String.raw`|U(\mathbb{Z}_n)|=\varphi(n)`,
          String.raw`\text{ideales de } \mathbb{Z}_n \;=\; (d) \text{ con } d \mid n`,
        ]
      : [
          String.raw`|H| \ \big|\ |G| \qquad (\text{Lagrange})`,
          s.tipo === 'diedral'
            ? String.raw`D_n=\langle r,s \mid r^n=s^2=e,\ srs=r^{-1}\rangle`
            : String.raw`|S_n| = n!`,
        ],
  lecturas: (s) => {
    const G = grupo(s)
    const N = G.etiquetas.length
    if (s.tipo === 'anillo') {
      const unidades = [...Array(N).keys()].filter((a) => mcd(a, s.n) === 1 && a !== 0)
      const divs = [...Array(N).keys()].filter((a) => a !== 0 && mcd(a, s.n) !== 1)
      return [
        ['Orden', `${N}`],
        ['Característica', `${s.n}`],
        ['Unidades φ(n)', `${unidades.length}`],
        ['Divisores de cero', `${divs.length}`],
        ['¿Dominio de integridad?', divs.length === 0 ? 'sí' : 'no'],
        ['¿Cuerpo?', esPrimo(s.n) ? 'sí' : 'no'],
        ['Ideales', divisores(s.n).length.toString()],
      ]
    }
    const subs = subgrupos(G)
    const z = centro(G)
    return [
      ['Orden |G|', `${N}`],
      ['¿Abeliano?', abeliano(G) ? 'sí' : 'no'],
      ['Centro Z(G)', `${z.length} elemento(s)`],
      ['Subgrupos hallados', `${subs.length}`],
      ['Órdenes de subgrupo', [...new Set(subs.map((h) => h.length))].sort((a, b) => a - b).join(', ')],
      ['Máximo orden de elemento', `${Math.max(...G.etiquetas.map((_, i) => orden(G, i)))}`],
    ]
  },
  vista: {
    tipo: 'html',
    Componente({ s }: { s: S }) {
      const G = grupo(s)
      const N = G.etiquetas.length
      const unidades = new Set(s.tipo === 'anillo' ? [...Array(N).keys()].filter((a) => mcd(a, s.n) === 1) : [])
      const divs = new Set(s.tipo === 'anillo' ? [...Array(N).keys()].filter((a) => a !== 0 && mcd(a, s.n) !== 1) : [])

      const tabla = (op: number[][], titulo: string, simbolo: string, marca?: (v: number, a: number, b: number) => string) => (
        <>
          <h3>{titulo}</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="cayley">
              <thead>
                <tr>
                  <th>{simbolo}</th>
                  {G.etiquetas.map((e, i) => (
                    <th key={i}>{e}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {op.map((fila, i) => (
                  <tr key={i}>
                    <th>{G.etiquetas[i]}</th>
                    {fila.map((v, j) => (
                      <td key={j} className={marca?.(v, i, j)}>
                        {G.etiquetas[v]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )

      if (s.tipo === 'anillo') {
        const prod = [...Array(s.n).keys()].map((a) => [...Array(s.n).keys()].map((b) => (a * b) % s.n))
        return (
          <div>
            <h2>
              Z<sub>{s.n}</sub>
            </h2>
            <p>
              El anillo de los enteros módulo {s.n}. Con la suma es un grupo cíclico; con el producto,
              solo las unidades forman grupo. {esPrimo(s.n) ? 'Como n es primo, todo elemento no nulo es unidad y Zₙ es un cuerpo.' : `Como ${s.n} no es primo, hay divisores de cero y no puede ser cuerpo.`}
            </p>

            <h3>Unidades U(Z{s.n})</h3>
            <div className="fichas">
              {[...Array(s.n).keys()].map((a) => (
                <span key={a} className={`ficha${unidades.has(a) && a !== 0 ? ' on' : ''}`}>
                  {a}
                  {unidades.has(a) && a !== 0 && <> · inv {prod[a].indexOf(1)}</>}
                </span>
              ))}
            </div>

            <h3>Ideales (d) con d | {s.n}</h3>
            <div className="fichas">
              {divisores(s.n).map((d) => (
                <span key={d} className="ficha on">
                  ({d}) = {'{'}
                  {[...Array(s.n / d).keys()].map((k) => k * d).join(', ')}
                  {'}'} · índice {d}
                </span>
              ))}
            </div>

            {tabla(G.op, 'Tabla de la suma', '+', (v) => (v === 0 ? 'uno' : ''))}
            {tabla(prod, 'Tabla del producto', '·', (v, a, b) =>
              v === 0 && a !== 0 && b !== 0 ? 'cero' : v === 1 ? 'uno' : '',
            )}
            <p style={{ marginTop: 14 }}>
              En la tabla del producto, los ceros que no vienen de multiplicar por 0 (en naranja) son
              exactamente los divisores de cero: {divs.size ? [...divs].join(', ') : 'no hay'}. Las
              casillas azules marcan los pares inversos.
            </p>
          </div>
        )
      }

      const subs = subgrupos(G)
      const z = centro(G)
      return (
        <div>
          <h2>{G.nombre}</h2>
          <p>
            Grupo de orden {N}, {abeliano(G) ? 'abeliano' : 'no abeliano'}. El centro tiene {z.length}{' '}
            elemento(s): {z.map((i) => G.etiquetas[i]).join(', ')}. Por Lagrange, el orden de cualquier
            subgrupo divide a {N}.
          </p>

          <h3>Órdenes de los elementos</h3>
          <div className="fichas">
            {G.etiquetas.map((e, i) => (
              <span key={i} className={`ficha${orden(G, i) === N ? ' on' : ''}`}>
                {e} · orden {orden(G, i)} · inv {G.etiquetas[inverso(G, i)]}
              </span>
            ))}
          </div>

          <h3>Subgrupos generados por uno o dos elementos</h3>
          <div className="fichas">
            {subs.map((H, i) => (
              <span key={i} className={`ficha${H.length === N ? ' on' : ''}`}>
                |H| = {H.length}: {'{'}
                {H.map((k) => G.etiquetas[k]).join(', ')}
                {'}'}
              </span>
            ))}
          </div>

          {tabla(G.op, 'Tabla de Cayley', '∘', (v, a, b) =>
            v === G.neutro ? 'uno' : a === G.neutro || b === G.neutro ? '' : '',
          )}
        </div>
      )
    },
  },
})
