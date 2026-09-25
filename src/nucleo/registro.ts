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
import teoremas from '../modulos/campos/teoremas'
import fases from '../modulos/edo/fases'
import segundoorden from '../modulos/edo/segundoorden'

import matrices from '../modulos/algebra/matrices'
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
import control from '../modulos/senales/control'
import circuito from '../modulos/senales/circuito'
import filtros from '../modulos/senales/filtros'
import lagrangiano from '../modulos/mecanica/lagrangiano'
import orbitas from '../modulos/mecanica/orbitas'
import oscilaciones from '../modulos/mecanica/oscilaciones'
import solido from '../modulos/mecanica/solido'
import relatividad from '../modulos/mecanica/relatividad'
import electrostatica from '../modulos/fisica/electrostatica'
import magnetostatica from '../modulos/fisica/magnetostatica'
import ondas from '../modulos/fisica/ondas'
import difraccion from '../modulos/fisica/difraccion'
import laboratorio from '../modulos/fisica/laboratorio'
import geometrica from '../modulos/fisica/geometrica'
import termodinamica from '../modulos/fisica/termodinamica'

/**
 * El orden de esta lista es el orden del menú, y las áreas salen en el orden de su primer módulo:
 * de la más potente a la más concreta.
 */
export const MODULOS: ModuloAny[] = [
  matrices, aplicaciones, subespacios, hilbert, estructuras, espacios,
  geometria, espacio,
  grafica, complejos, cas,
  resolver, campo, segundoorden, fases,
  edpPropia, onda, calor, laplace,
  superficies, parametricas, vectorial, teoremas,
  fourier, transformadaF, convolucionM, laplaceT, control, circuito, filtros,
  lagrangiano, orbitas, oscilaciones, solido, relatividad,
  laboratorio, electrostatica, magnetostatica, ondas, difraccion, geometrica, termodinamica, unidades,
  orbitales, paquete, pozo,
]
