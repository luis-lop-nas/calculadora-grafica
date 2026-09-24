import { definir, type PropsPanel } from '../../nucleo/tipos'
import { Eleccion, Grupo, Nota } from '../../nucleo/controles'
import { convertir, formato, unidad, unidadesDe, type Dimension } from '../../lib/unidades'

type Familia = 'longitud' | 'masa' | 'tiempo' | 'velocidad' | 'fuerza' | 'energia' | 'presion' | 'temperatura'

interface S {
  familia: Familia
  desde: string
  hasta: string
  valor: number
}

const FAMILIAS: Record<Familia, { nombre: string; dimension: Dimension; base: string; destino: string }> = {
  longitud: { nombre: 'Longitud', dimension: [1, 0, 0, 0, 0], base: 'm', destino: 'km' },
  masa: { nombre: 'Masa', dimension: [0, 1, 0, 0, 0], base: 'kg', destino: 'g' },
  tiempo: { nombre: 'Tiempo', dimension: [0, 0, 1, 0, 0], base: 's', destino: 'min' },
  velocidad: { nombre: 'Velocidad', dimension: [1, 0, -1, 0, 0], base: 'ms', destino: 'kmh' },
  fuerza: { nombre: 'Fuerza', dimension: [1, 1, -2, 0, 0], base: 'N', destino: 'dyn' },
  energia: { nombre: 'Energía', dimension: [2, 1, -2, 0, 0], base: 'J', destino: 'kWh' },
  presion: { nombre: 'Presión', dimension: [-1, 1, -2, 0, 0], base: 'Pa', destino: 'bar' },
  temperatura: { nombre: 'Temperatura', dimension: [0, 0, 0, 0, 1], base: 'K', destino: 'C' },
}

function opcionesFamilia(familia: Familia) {
  return unidadesDe(FAMILIAS[familia].dimension).map((u) => ({ v: u.id, t: `${u.nombre} (${u.simbolo})` }))
}

function Panel({ s, set }: PropsPanel<S>) {
  const cambioFamilia = (familia: Familia) => {
    const f = FAMILIAS[familia]
    set({ familia, desde: f.base, hasta: f.destino })
  }
  const opciones = opcionesFamilia(s.familia)
  return (
    <>
      <Grupo titulo="Magnitud">
        <Eleccion etiqueta="Familia" valor={s.familia} opciones={Object.entries(FAMILIAS).map(([v, f]) => ({ v: v as Familia, t: f.nombre }))} onChange={cambioFamilia} />
        <Nota>Solo se pueden convertir unidades de la misma dimensión física. Las temperaturas incluyen el desplazamiento absoluto.</Nota>
      </Grupo>
      <Grupo titulo="Conversión">
        <label className="campo-numero">
          Valor
          <input type="number" value={s.valor} onChange={(e) => set({ valor: Number(e.target.value) })} />
        </label>
        <Eleccion etiqueta="Desde" valor={s.desde} opciones={opciones} onChange={(desde) => set({ desde })} />
        <Eleccion etiqueta="Hasta" valor={s.hasta} opciones={opciones} onChange={(hasta) => set({ hasta })} />
      </Grupo>
    </>
  )
}

export default definir<S>({
  id: 'unidades',
  area: 'algebra',
  resumen: 'Unidades físicas y análisis dimensional',
  corto: 'Unidades',
  titulo: 'Unidades y <i>magnitudes</i>',
  entradilla: 'Convierte magnitudes físicas sin mezclar dimensiones incompatibles.',
  inicial: { familia: 'longitud', desde: 'm', hasta: 'km', valor: 1500 },
  Panel,
  rotulo: (s) => ({ nombre: FAMILIAS[s.familia].nombre, apunte: `${unidad(s.desde).simbolo} → ${unidad(s.hasta).simbolo}` }),
  lecturas: (s) => {
    try {
      const resultado = convertir(s.valor, s.desde, s.hasta)
      return [
        ['Entrada', `${formato(s.valor)} ${unidad(s.desde).simbolo}`],
        ['Resultado', `${formato(resultado)} ${unidad(s.hasta).simbolo}`],
        ['Dimensión', s.familia],
      ]
    } catch (e) {
      return [['Estado', (e as Error).message]]
    }
  },
  vista: {
    tipo: 'html',
    Componente({ s }) {
      let resultado: number | null = null
      let error = ''
      try {
        resultado = convertir(s.valor, s.desde, s.hasta)
      } catch (e) {
        error = (e as Error).message
      }
      return (
        <section className="resultado-unidades">
          <p className="resultado-etiqueta">Conversión dimensional</p>
          {resultado === null ? (
            <p className="resultado-error">{error}</p>
          ) : (
            <>
              <div className="resultado-grande">{formato(resultado)} <small>{unidad(s.hasta).simbolo}</small></div>
              <p>{formato(s.valor)} {unidad(s.desde).simbolo} = {formato(resultado)} {unidad(s.hasta).simbolo}</p>
              <div className="unidad-detalle">
                <span>{unidad(s.desde).nombre}</span>
                <span className="flecha-unidad">→</span>
                <span>{unidad(s.hasta).nombre}</span>
              </div>
            </>
          )}
        </section>
      )
    },
  },
})

