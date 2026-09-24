import type { ModuloAny } from './tipos'

import grafica from '../modulos/funciones/grafica'
import complejos from '../modulos/funciones/complejos'
import cas from '../modulos/funciones/cas'

import geometria from '../modulos/geometria/plano'
import espacio from '../modulos/geometria/espacio'

import orbitales from '../modulos/cuantica/orbitales'
import paquete from '../modulos/cuantica/paquete'
import pozo from '../modulos/cuantica/pozo'

import onda from '../modulos/edp/onda'
import calor from '../modulos/edp/calor'
import laplace from '../modulos/edp/laplace'
import edpPropia from '../modulos/edp/propia'

import resolver from '../modulos/edo/resolver'
import campo from '../modulos/edo/campo'
import superficies from '../modulos/campos/superficies'
import parametricas from '../modulos/campos/parametricas'
import vectorial from '../modulos/campos/vectorial'
import fases from '../modulos/edo/fases'
import segundoorden from '../modulos/edo/segundoorden'

import aplicaciones from '../modulos/algebra/aplicaciones'
import subespacios from '../modulos/algebra/subespacios'
import hilbert from '../modulos/algebra/hilbert'
import estructuras from '../modulos/algebra/estructuras'
import espacios from '../modulos/algebra/espacios'
import unidades from '../modulos/algebra/unidades'
import fourier from '../modulos/senales/fourier'
import transformadaF from '../modulos/senales/transformada'
import convolucionM from '../modulos/senales/convolucion'
import laplaceT from '../modulos/senales/laplace'

/** El orden de esta lista es el orden del menú. */
export const MODULOS: ModuloAny[] = [
  grafica, complejos, cas,
  geometria, espacio,
  orbitales, paquete, pozo,
  edpPropia, onda, calor, laplace,
  resolver, campo, segundoorden, fases,
  superficies, parametricas, vectorial,
  aplicaciones, subespacios, hilbert, estructuras, espacios, unidades,
  fourier, transformadaF, convolucionM, laplaceT,
]
