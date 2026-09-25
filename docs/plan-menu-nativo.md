# Plan de la barra de menús y herramientas

Propuesta revisada el 25 de septiembre de 2026 a partir del código local, del plan de Claude
`~/.claude/plans/vamos-con-el-men-glowing-key.md` y de documentación oficial de las aplicaciones
de referencia. Este documento define el destino del producto; no implica que sus opciones estén implementadas.

## Estado de partida comprobado (antes de implementar)

- El último commit local es `75c2ccf`, «Barra de menús, fase 1: Herramientas, Escena y Buscar orden».
- Hay cambios locales sin commit en Electron, App, lienzos, pintor2d y otros archivos; existen
  `escena.ts`, `menuEscena.ts` y `DialogoEscena.tsx` nuevos. La fase 2 está empezada, no solo planeada.
- No se han ejecutado pruebas de la aplicación durante esta revisión documental. Los resultados
  anteriores comunicados por el usuario no certifican estos cambios locales. Tampoco se ha comprobado el remoto.
- `barra.ts` centraliza el esqueleto de **Herramientas**, no la barra completa. Parte del resto sigue
  definida en `electron/main.cjs`; la paleta incorpora solo una parte de esas órdenes en `App.tsx`.
- La paleta actual descarta las entradas desactivadas. Falta poder descubrir una herramienta
  incompatible y conocer qué selección necesita.
- Existen 45 archivos de módulos. Una infraestructura común permite compartir funciones, pero no
  convierte automáticamente cualquier módulo en compatible con cada herramienta o escala.

| Capacidad | Qué existe realmente | Qué queda |
|---|---|---|
| Barra, paleta y categorías fijas | Fase 1; Gráficas y Superficies aportan herramientas | Extender el registro común a todas las órdenes; paridad web/Mac |
| Estudio de funciones | Raíces, asíntotas, extremos, inflexiones, tabla y estudio en Gráficas | Órdenes individuales y adaptación a otros objetos |
| Dominio, paridad, monotonía y concavidad | Análisis numérico dentro de `objetos2d.estudio`, en un intervalo | Separar resultados; no presentarlo como demostración global exacta |
| Derivación, tangente, Taylor, áreas y Riemann | Ya accesibles desde Herramientas en Gráficas | Parámetros y resultados comunes; normal, secante y más aplicaciones |
| Primitivas, integrales definidas, límites, álgebra | Motor y órdenes del CAS | Aplicarlas a la selección sin abrir una fila de ejemplo |
| Plano | Construcciones, dependencias, medidas y transformaciones propias | Selección y comandos comunes; unificar sus ejes y ajuste |
| Superficies | Plano tangente, gradiente, niveles, cortes y cálculos locales de segundo orden | Contrato común y herramientas multivariables ampliadas |
| Campos y teoremas | Divergencia, rotacional, líneas de campo y módulos de Green/Stokes/Gauss | Adaptación a objetos seleccionados; distinguir medición local de operación sobre todo el campo |
| Matrices, Espacios, Hilbert y Señales | Operaciones matriciales, métricas, bases y transformadas específicas | Exponer operaciones reutilizables; no tratarlas todas como funciones nuevas |
| Escena 2D | Trabajo local en ejes X/Y, log, π, posición, proporción, polar y vistas guardadas | Auditar y terminar interacción, persistencia y render; isométrica, pasos editables y otros ajustes |
| Objeto común | Capas con nombre, color, visibilidad y borrado opcionales | Identidad estable, selección, propiedades, duplicado y edición comunes |
| Archivo/Vista/Animación | Guardado, exportaciones actuales, cámara, comparar, reproducción y vídeo | Importaciones, SVG, paneles, animación de parámetros y resultados exportables |

## Implementación posterior

El progreso y los límites actuales se mantienen en [estado-implementacion.md](estado-implementacion.md). El inventario anterior y las marcas del árbol describen la revisión inicial, no una comprobación del código actual. Se han añadido el menú radial, favoritos, recuperación del último cálculo, la aplicación Linux y el Laboratorio de física, además de las operaciones y adaptadores comunes.

## Responsabilidad de cada menú

```text
Calculadora · Archivo · Edición · Objeto · Herramientas · Escena · Vista · Animación · Módulo · Ventana · Ayuda
```

| Menú | Pregunta que resuelve |
|---|---|
| Archivo | ¿Qué documento abro, guardo, importo o exporto? |
| Edición | ¿Cómo deshago, copio o selecciono? |
| Objeto | ¿Qué creo y cómo edito lo seleccionado? |
| Herramientas | ¿Qué calculo o construyo a partir de mis objetos? |
| Escena | ¿En qué referencias, ejes, rejilla y fondo trabajo? |
| Vista | ¿Cómo encuadro y observo la escena? |
| Animación | ¿Qué cambia con el tiempo y cómo lo reproduzco? |
| Módulo | ¿En qué entorno trabajo y qué opciones son propias de él? |
| Ventana | ¿Qué paneles y espacios de trabajo tengo abiertos? |
| Ayuda | ¿Cómo encuentro y entiendo una orden? |

### Reglas de organización

1. Mantener esta barra y categorías estables. Una orden implementada pero incompatible aparece en
   gris. Una función todavía sin implementar permanece en el plan y no se publica como opción muerta.
2. El menú contiene acciones y accesos a ajustes; el inspector contiene valores editables. Color,
   grosor, dominio o tolerancia no necesitan decenas de submenús. `…` significa que falta información
   antes de ejecutar; las casillas muestran estados y los radios alternativas excluyentes.
3. Una orden tiene un identificador y un destino principal. Menú contextual, panel y paleta pueden
   ofrecer accesos a esa misma orden. Esas repeticiones útiles no son implementaciones independientes.
4. No añadir «Crear» y «Añadir» como categorías distintas: usar **Objeto > Añadir**. Editar definición
   y editar apariencia sí son tareas distintas, reunidas en un mismo inspector.
5. Lo que requiere objetos de entrada pertenece a Herramientas: perpendicular, intersección,
   tangente y medida. Añadir ofrece objetos básicos y expresiones nuevas.
6. Duplicar y Eliminar viven en Objeto; Cortar/Copiar/Pegar y Seleccionar en Edición. Los atajos
   actúan sobre texto mientras un campo tiene foco. No asignar Tab a seleccionar objetos ni letras
   globales que impidan escribir fórmulas.
7. Elegir una orden no cambia de módulo silenciosamente. Puede ofrecer «Abrir en…» si hace falta
   otro entorno, conservando la expresión y parámetros compatibles.
8. Las opciones matemáticas del documento se guardan con él: ángulos, supuestos, precisión de
   cálculo, coordenadas y ejes. Tema, idioma, formato visual y atajos son preferencias del usuario.
   Los valores por defecto se aplican a documentos nuevos, sin reinterpretar los existentes.

## Árbol de destino

Leyenda: `[E]` existe en ese ámbito; `[R]` hay una base en módulos/motor que adaptar o recolocar;
`[C]` trabajo local en curso; `[+]` nueva capacidad común. `[A]` ampliación avanzada posterior.
Una marca en una rama se aplica a sus hijos salvo indicación contraria. «R» no garantiza cobertura
general: cada adaptador deberá declarar qué tipos, casos y métodos admite.

```text
Calculadora                                     (menú de la aplicación en macOS)
├─ Acerca de Calculadora                         [E]
├─ Ajustes…                                     [+]
│  └─ Apariencia · Formato numérico · Atajos · Valores por defecto
└─ Servicios · Ocultar · Salir                   [E, convenciones del sistema]

Archivo
├─ Nueva ventana · Abrir… · Abrir recientes      [E]
├─ Cerrar · Guardar · Guardar como…              [E]
├─ Volver a lo guardado                          [E]
├─ Ajustes del documento…                        [+]
│  └─ Radianes/grados · Supuestos · Precisión de cálculo
├─ Importar                                     [+]
│  ├─ Datos CSV… → tabla y puntos
│  └─ Imagen… → fondo calibrado u objeto imagen
├─ Exportar
│  ├─ PNG · PDF · CSV · JSON · Vídeo WebM         [E]
│  ├─ SVG…                                      [+]
│  ├─ Informe de resultados…                    [+]
│  └─ TikZ/LaTeX del dibujo…                    [A]
└─ Imprimir…                                    [E]

Edición
├─ Deshacer · Rehacer                            [E]
├─ Cortar · Copiar · Pegar                       [E texto / + objetos]
├─ Copiar como                                  [E]
│  └─ Imagen · Fórmula LaTeX · Lecturas
└─ Seleccionar                                  [+ para objetos]
   └─ Todo · Nada · Invertir · Por tipo… · Dependencias…

Objeto
├─ Añadir
│  ├─ Funciones y relaciones                    [R]
│  │  ├─ f(x) · x=g(y) · Implícita · Región
│  │  ├─ Curva paramétrica · Curva polar
│  │  └─ Función a trozos…                      [+ editor; revisar sintaxis existente]
│  ├─ Geometría 2D                              [R]
│  │  └─ Punto · Recta · Semirrecta · Segmento · Vector · Círculo · Cónica · Polígono
│  ├─ Geometría 3D                              [R]
│  │  └─ Punto · Recta · Plano · Curva · Superficie · Sólido
│  ├─ Datos y expresiones
│  │  ├─ Expresión / ecuación · Vector · Matriz  [R]
│  │  └─ Lista / tabla de datos…                [+]
│  ├─ Controles y anotaciones
│  │  ├─ Deslizador                             [R]
│  │  └─ Casilla · Texto/LaTeX · Imagen          [+]
│  └─ Del módulo                                [R]
│     └─ Carga · Sonda · Lente · Foco · Condición inicial…
├─ Editar definición…                           [+ común]
├─ Propiedades…                                 [+ inspector común]
│  └─ Nombre · Color · Grosor · Trazo · Opacidad · Relleno · Etiqueta · Dominio
├─ Renombrar… · Duplicar                         [+]
├─ Transformar                                  [R parcial / + común]
│  └─ Mover… · Girar… · Escalar… · Reflejar… · Transformación afín…
├─ Organización                                 [+]
│  └─ Agrupar · Desagrupar · Traer al frente · Enviar al fondo
├─ Visibilidad                                  [R visibilidad / + selección común]
│  └─ Mostrar/ocultar selección · Aislar · Salir de aislamiento · Mostrar todo
├─ Interacción                                  [+]
│  └─ Bloquear movimiento · Permitir selección · Mostrar etiqueta
├─ Dependencias                                 [R en Plano / + común]
│  └─ Ver objetos de origen · Ver dependientes · Crear copia independiente
└─ Eliminar selección                           [R borrado / + selección común]

Herramientas
├─ Estudio de funciones
│  ├─ Estudio completo… · Tabla de valores…     [E; ampliar parámetros]
│  ├─ Dominio · Paridad · Monotonía · Concavidad [R del estudio numérico]
│  ├─ Raíces / cortes con X · Extremos          [E]
│  ├─ Inflexiones · Asíntotas                   [E]
│  ├─ Cortes con Y · Signo                      [+ órdenes dedicadas]
│  └─ Recorrido · Periodicidad · Continuidad    [+ con alcance explícito]
├─ Derivación
│  ├─ Derivada · Tangente en un punto           [E]
│  ├─ Derivada de orden n…                      [R CAS]
│  ├─ Normal · Secante                         [+]
│  └─ Derivación implícita · Curvatura          [A]
├─ Integración
│  ├─ Primitiva F+C · Integral definida…        [R CAS]
│  ├─ Área bajo la curva · Área entre curvas   [E]
│  ├─ Sumas de Riemann                         [E]
│  │  └─ Izquierda · Derecha · Punto medio · Trapecios
│  ├─ Valor medio · Longitud de arco           [+]
│  └─ Volumen de revolución…                   [A]
├─ Límites y series
│  ├─ Límite en un punto / infinito…           [R CAS]
│  ├─ Límites laterales…                       [R motor; validar cobertura]
│  ├─ Taylor / Maclaurin…                      [E / R CAS]
│  └─ Error de aproximación…                   [+; separar estimación de cota]
├─ Construcción y medida
│  ├─ Intersecciones…                          [E curvas / R geometría]
│  ├─ Paralela · Perpendicular                 [R Plano]
│  ├─ Mediatriz · Bisectriz · Punto medio       [R Plano]
│  ├─ Tangentes desde un punto…                [R casos de Plano / A general]
│  ├─ Lugar geométrico…                        [R Plano]
│  └─ Distancia · Ángulo · Longitud · Área      [R medidas de Plano / + común]
├─ Álgebra y ecuaciones
│  ├─ Simplificar · Desarrollar · Factorizar   [R CAS]
│  ├─ Resolver ecuación · Sistema lineal       [R CAS]
│  ├─ Sustituir…                               [R motor / + interfaz]
│  └─ Fracciones parciales · Inecuaciones      [+ interfaz; auditar motor]
├─ Vectores y matrices                         [R por operación disponible]
│  ├─ Productos · Norma · Proyección
│  ├─ Transpuesta · Determinante · Inversa
│  ├─ Rango · Núcleo · Imagen · Gauss-Jordan
│  ├─ Sistemas lineales · Autovalores · Autovectores
│  └─ Descomposiciones… → LU · QR · SVD · Diagonalización
├─ Coordenadas y representación                [+ interfaz común]
│  ├─ Expresar coordenadas en… → cartesianas / polares / cilíndricas / esféricas
│  ├─ Reescribir ecuación en…
│  ├─ Cambiar base…                            [R bases / + adaptación]
│  ├─ Cambiar unidades…                        [R módulo Unidades]
│  └─ Jacobiano del cambio…                    [A]
├─ Normas y métricas
│  ├─ Distancia con métrica…                   [R Espacios]
│  │  └─ Euclídea · Ponderada · Manhattan · p · Hiperbólica; Máximo [+ si no hay adaptador]
│  ├─ Normalizar vector…                       [+ común]
│  ├─ Normalizar función en L²[a,b]…           [+]
│  ├─ Producto escalar / proyección funcional… [R Hilbert / + adaptación]
│  └─ Bola unidad…                             [R Espacios]
├─ Familias y operaciones con funciones        [+ común]
│  ├─ Familia f(x,k)… · Barrido del parámetro…
│  ├─ Trasladar / escalar la función…
│  ├─ Valor absoluto · Composición · Inversa restringida…
│  └─ Envolvente…                              [A]
├─ Multivariable y campos
│  ├─ Gradiente · Plano tangente               [E Superficies]
│  ├─ Curvas de nivel · Cortes                 [E Superficies]
│  ├─ Hessiana / clasificación local…          [R cálculo local; + herramienta general]
│  ├─ Derivada direccional…                    [+]
│  ├─ Divergencia · Rotacional · Líneas        [R Campos]
│  ├─ Integrales de línea / superficie…        [R casos de Teoremas / A general]
│  └─ Optimización con restricciones…          [A]
├─ Métodos numéricos y datos
│  ├─ Raíz por bisección…                      [R motor / + interfaz didáctica]
│  ├─ Newton paso a paso…                      [+ herramienta]
│  ├─ Interpolación · Ajuste por mínimos cuadrados… [+ herramientas comunes]
│  └─ Resumen estadístico…                     [+]
└─ Ecuaciones diferenciales y señales
   ├─ Resolver EDO… · Condiciones iniciales…   [R]
   ├─ Campo de direcciones · Retrato de fases… [R]
   └─ Fourier · Laplace · Convolución…          [R módulos/CAS según operación]

Escena
├─ Propiedades de la escena…                   [+ unificar diálogo C]
├─ Ejes
│  ├─ Mostrar ejes · Mostrar nombres           [E]
│  ├─ Eje X · Eje Y                            [C]
│  ├─ Eje Z                                    [+ independiente, solo 3D]
│  ├─ Editar ejes…                             [C parcial / + ampliación]
│  │  └─ Rótulo · Marcas · Paso · Color · Flechas · Unidades
│  ├─ Escala por eje → lineal / logarítmica     [C 2D]
│  ├─ Numeración → decimal / múltiplos de π     [C 2D]
│  ├─ Mostrar ángulos en grados                [+ conversión de etiquetas]
│  ├─ Posición → origen / borde / cruce dado    [C primeras / + cruce dado]
│  ├─ Añadir eje secundario…                   [A, con relación a un eje principal]
│  └─ Eliminar eje secundario                  [A]
├─ Referencias de coordenadas                   [+]
│  ├─ Lecturas → cartesianas / polares / cilíndricas / esféricas
│  └─ Añadir sistema de referencia…            [A]
│     └─ Origen · Base · Nombres · Visibilidad · Eliminar referencia
├─ Proporción
│  └─ 1:1 · Libre                              [C]
│     Proporción personalizada… · Bloquear     [+]
├─ Rejilla
│  ├─ Mostrar                                  [E]
│  ├─ Tipo → cartesiana / polar / isométrica    [E / C / +]
│  ├─ Paso visual → automático / personalizado [+ personalización]
│  ├─ Paso radial / angular…                   [+ para polar]
│  └─ Planos 3D → XY / XZ / YZ                 [E juntos / + separados]
├─ Ajuste al arrastrar
│  ├─ Activar · Paso de ajuste                 [E, adaptar Plano y rejillas]
│  └─ Destinos → rejilla / puntos / intersecciones [+ ampliar]
└─ Fondo y guías                                [+]
   └─ Color · Imagen calibrada · Guías horizontales/verticales

Vista
├─ Encuadrar todo · Acercar · Alejar             [E]
├─ Encuadrar selección                          [+]
├─ Definir ventana visible…                     [R trabajo C de Escena]
│  └─ x mín/máx · y mín/máx · Mantener proporción
├─ Vistas guardadas                             [R trabajo C de Escena]
│  └─ Guardar… · Recuperar · Renombrar… · Eliminar
├─ Punto de vista 3D                            [E]
│  └─ Inicial · X · Y · Z · Isométrica · Ortográfica/perspectiva
├─ Mostrar                                      [E]
│  └─ Leyenda · Fórmula · Lecturas
├─ Comparar A y B                               [E]
│  └─ Lado a lado · Superpuestos · Enlazar cámaras · Copiar A en B
├─ Autogiro · Presentación · Pantalla completa  [E]
└─ Apariencia → Tema · Tamaño de interfaz        [E, mismos comandos que Ajustes]

Animación
├─ Reproducir/pausar · Avanzar fotograma         [E]
├─ Volver al inicio · Velocidad                 [E]
├─ Animar parámetro…                            [+ común]
│  └─ Parámetro · Rango · Duración · Una vez/bucle/ida y vuelta
├─ Rastros                                      [+ común; aprovechar rastros locales]
│  └─ Activar para selección · Persistencia… · Borrar rastros
├─ Fotogramas clave…                            [A]
└─ Grabar vídeo                                 [E, misma orden que Archivo > Exportar]

Módulo
├─ Buscar módulo… · Anterior · Siguiente        [E]
├─ Ir al área · Áreas y módulos                 [E]
├─ Ejemplos                                     [E]
├─ Opciones de «módulo actual»                   [E, depurar]
│  └─ Modelo físico · Condiciones de contorno · Método específico…
└─ Restablecer el módulo                        [E]

Ventana
├─ Minimizar · Zoom de ventana · Ventanas       [E, nativo]
├─ Paneles
│  ├─ Panel del módulo                          [R]
│  ├─ Objetos y capas                           [R listado / + panel completo]
│  ├─ Propiedades                               [+]
│  ├─ Resultados y pasos                        [R resultados locales / + común]
│  ├─ Tabla de valores                          [R Gráficas / + común]
│  └─ Historial                                 [+]
└─ Espacios de trabajo                          [+]
   └─ Estudio · Geometría · 3D · Comparación · Guardar/restablecer disposición

Ayuda
├─ Buscar orden… ⇧⌘P                            [E, ampliar cobertura y motivos]
├─ Atajos · Guía                                [E]
├─ Sintaxis y funciones disponibles…            [+ acceso dedicado]
├─ Ayuda de la herramienta activa…              [+]
└─ Desarrollo                                   [E]
```

## Correcciones importantes respecto al plan anterior

- **Rejilla polar no significa conversión de expresiones.** `Escena > Rejilla > Polar` dibuja una
  referencia. La curva `r=…` conserva su interpretación explícita, incluso con rejilla cartesiana.
  `Herramientas > Coordenadas` transforma una representación; no se cambia el significado de una
  expresión ya guardada al marcar una opción visual.
- **Escala, etiquetas y unidades son cosas diferentes.** Log transforma posiciones; π cambia las
  marcas; grados requieren conversión de lectura cuando las coordenadas internas son radianes.
  Cambiar una unidad física convierte valores, mientras renombrar un eje solo cambia su texto.
- **La métrica cambia cómo se mide.** Una conversión a polares conserva la geometría euclídea.
  Distancia Manhattan o hiperbólica es una elección matemática de la operación, no un tema visual
  ni un efecto de la rejilla. Una métrica global necesitaría un modelo explícito del espacio y de
  qué construcciones la usan; no se añadirá como interruptor que parezca cambiarlo todo.
- **Ejes principales no son objetos borrables.** X/Y/Z se ocultan y configuran. Un eje secundario
  sí puede añadirse o eliminarse y exige una relación explícita, por ejemplo °F frente a °C.
  Otro sistema de referencia con base propia es una función avanzada distinta de añadir un eje.
- **Encuadre y vistas guardadas pasan a Vista.** Escena define escala, proporción y referencias;
  Vista fija qué intervalo se ve. El inspector puede enlazar ambos ajustes sin duplicar estado.
  Fijar cuatro límites exactos puede ser incompatible con 1:1 en un lienzo dado: debe indicarse qué
  rango se ajustará, o permitir bandas, sin prometer ambos resultados simultáneamente.
- **Ajuste separado de dibujo de rejilla.** La rejilla automática puede cambiar al hacer zoom;
  el paso de ajuste debe seguir siendo predecible. En polar se ajustan r y θ, en isométrica la
  base de la rejilla; no redondear siempre x e y como si fuera cartesiana.
- **Intersecciones se integra en Construcción y medida.** Raíces queda en Estudio de funciones.
  Una tangente diferencial vive en Derivación; las tangentes desde un punto a una cónica viven
  en Construcción. Compartir algoritmos cuando proceda, sin fingir que tienen las mismas entradas.
- **Escalar y homotecia no requieren entradas competidoras.** Escalar abre centro y factores;
  el factor uniforme describe una homotecia. Transformaciones de geometría y operaciones como
  f(x+a), f(bx), |f| o inversa tienen interfaces distintas porque no siempre conservan el tipo.
- **Las órdenes del CAS no son objetos «Derivar» o «Integrar».** Se trasladan desde Añadir a
  Herramientas. Añadir conserva expresión, ecuación y fila vacía; Ejemplos conserva plantillas.
- **Capas no basta como modelo matemático.** Una capa puede ser una decoración o resumen y sus
  ids actuales no garantizan identidad persistente. Un objeto puede necesitar varias capas.
  Introducir referencias estables antes de colgar operaciones y dependencias de índices de filas.
- **No desaparecerán los límites del motor al hacer el menú universal.** Un estudio muestreado
  debe mostrar intervalo y aproximación; un CAS puede no resolver un caso. En particular no afirmar
  dominio global, periodicidad o ausencia de raíces basándose solo en una ventana muestreada.

## Cómo se usa una herramienta

Ejemplo: seleccionar `f(x)=sin(x)` → Herramientas > Derivación > Tangente → elegir x₀ → previsualizar
→ crear la tangente. La tangente queda vinculada a f y x₀, puede renombrarse, estilizarse, ocultarse y
animarse. Cambiar f recalcula el resultado. Deshacer revierte la operación completa en un paso.

No toda operación produce una curva. Una medida genera un valor; un estudio, un informe; una
derivada, una expresión o función; una construcción, un objeto dependiente. El panel de resultados
ofrece copiar, insertar en escena, abrir en el CAS o consultar pasos cuando el motor los proporciona.
Nunca fabricar pasos para un algoritmo que no los devuelve. Registrar entradas, parámetros,
dominio/supuestos y carácter exacto o aproximado.

Si una orden necesita dos curvas y solo hay una seleccionada, la paleta puede explicar «Selecciona
dos curvas» y el diálogo permitir elegirlas. En una construcción interactiva se guía la selección
«Elige punto» → «Elige recta» y Escape cancela sin crear objetos incompletos. Las opciones sin
compatibilidad real permanecen desactivadas también al ejecutar desde atajo o paleta.

## Arquitectura y fases de entrega

### 2A. Terminar la escena 2D en curso

Auditar primero el diff local. Corregir el nombre «Sistema de coordenadas» si solo elige rejilla
polar; mover encuadres a Vista. Terminar lineal/log por eje, marcas π, posición origen/borde,
proporción 1:1/libre, rejillas cartesiana/polar/isométrica y ajuste coherente. Unificar Plano.

Guardar ejes, visibilidad, rejilla y ajuste de cada escena en el documento. Hoy las opciones
nuevas están en `_escena` pero algunas casillas aún son preferencias globales. Versionar/migrar
documentos: los defaults del usuario sirven para nuevos documentos; abrir uno no debe modificar
sus referencias ni las del otro lado de Comparar. Decidir explícitamente qué conserva Restablecer.

No prometer log en todas las primitivas por cambiar `px/py`: revisar segmentos, curvas, polígonos,
circunferencias, rellenos, vectores, recorte y hit testing. Los puntos x≤0 o y≤0 en su eje log se
excluyen de ese dominio, sin inventar valores. Revisar navegación y arrastre con la inversa correcta.

Entrega: un problema 2D se guarda y reabre con los mismos ejes, rejilla y escala; deshacer/rehacer
funciona; A/B conserva dos escenas independientes. La edición 3D avanzada va en 2B, separada.

### 2B. Ampliar escena según capacidades

Marcas/pasos editables, cruce arbitrario, proporción personalizada, nombres/unidades, controles
independientes X/Y/Z y planos 3D. Ejes secundarios y referencias oblicuas se reservan para una
entrega avanzada: requieren relaciones y bases explícitas, no solo más líneas pintadas.

### 3. Selección, comandos y propiedades comunes

Definir `ObjetoRef` con id estable, tipo matemático, dimensión y referencia al módulo/escena;
selección simple/múltiple y objeto activo. Mantener adaptadores graduales para módulos existentes.
Introducir un registro común de comandos con id, ruta, etiqueta, palabras de búsqueda, condiciones,
motivo de desactivación y ejecución. Llevar desde ahí menú, paleta, menú contextual y atajos.
Electron recibe descriptores serializables y devuelve ids, sin implementar matemáticas.

Primer alcance: Gráficas, Plano y Superficies/Espacio; después extender las capacidades. Implementar
Propiedades, renombrado, duplicado, ocultar, aislar y borrar, con operaciones que respeten dependencias.
No convertir decoraciones, lecturas o curvas informativas en objetos editables por defecto.

Entrega: seleccionar en lienzo o panel apunta al mismo objeto; las órdenes usan la escena con foco;
editar, duplicar y deshacer son coherentes; el teclado de texto sigue funcionando.

### 4. Subir la matemática que ya existe

Adaptar estudio, derivadas, tangentes, primitivas, integrales, límites, Taylor, construcciones y
medidas. Conectar resultados y dependencias; ofrecer parámetros uniformes. Crear primero normal,
secante, cortes con Y y valor medio como ampliaciones acotadas. Integrar matrices y operaciones
vectoriales con sus entradas propias, sin obligarlas a comportarse como una f(x).

Entrega: la misma operación funciona sobre objetos compatibles de al menos dos módulos; muestra
el método y alcance reales; una dependencia se recalcula y puede deshacerse como una operación.

### 5. Nuevas herramientas por paquetes independientes

- 5A: coordenadas de puntos/vectores, unidades, normas y normalización.
- 5B: familias, transformaciones de funciones, composición e inversa con dominio restringido.
- 5C: herramientas multivariables, campos y adaptaciones de EDO/señales.
- 5D: datos, interpolación, ajuste y métodos numéricos con iteraciones visibles.
- Avanzado: transformación de ecuaciones y componentes vectoriales entre bases curvilíneas,
  Jacobianos, envolventes, integrales generales y optimización con restricciones.

Convenciones explícitas para cilíndricas/esféricas, ángulos y ramas; singularidades de coordenadas;
normalización del vector cero y funciones sin norma finita; p≥1 para normas Lp habituales. Las
transformaciones de campos requieren cambiar también las componentes de base, no solo sustituir
x e y. Las fórmulas cerradas generales no se prometen si solo existe un procedimiento numérico.

### 6. Paneles, documentos y animación

El inspector mínimo y resultados llegan en 3/4, no se retrasan hasta aquí. Esta fase añade paneles
acoplables, historial navegable, espacios de trabajo, importar CSV/imagen, SVG e informes y
animación de parámetros/rastros. Fotogramas clave, TikZ y otras exportaciones avanzadas se evalúan
por separado. SVG/TikZ necesitan dibujo vectorial o representación exportable; no basta el PNG.

## Verificación por entrega

- Ejecutar `npm run pruebas`, `npm run mate`, el recorrido web y `npm run comprobar:app` para cambios
  de implementación; empaquetar y revisar la app nativa cuando cambien integración o menús.
- Menús: misma estructura publicada en los 45 módulos; activación según capacidades; sin ids
  desconocidos ni atajos en conflicto; accesos repetidos encaminados a una única orden.
- Paleta: acentos, sinónimos, ruta, disponibilidad explicada y ausencia de órdenes ficticias.
- Escena: guardar/reabrir, migración, deshacer, Comparar A/B, resize, exportar y límites inválidos.
- Render: transformación mundo↔pantalla, navegación y arrastre en lineal/log; curvas que cruzan
  discontinuidades; rejilla y ajuste polar/isométrico. Revisar primitivas de módulos representativos
  y desactivar combinaciones que no estén soportadas (por ejemplo polar con escala log inicialmente).
- Objeto: selección múltiple, ids tras insertar/borrar, dependencias, duplicado, foco y campos de texto.
- Matemáticas: casos con solución conocida, casos singulares y resultados no disponibles; exacto
  frente a aproximado; dominio de validez. El número de comprobaciones previo no se asume inmutable.

## Referencias y decisiones que inspiran

- [GeoGebra: personalizar la vista](https://geogebra.github.io/docs/manual/en/Customizing_the_Graphics_View/):
  configuración por eje, proporción, cruce, borde y rejillas cartesiana/polar/isométrica. Adoptar
  un inspector claro para estos valores, con accesos directos desde Escena.
- [GeoGebra: propiedades de objetos](https://geogebra.github.io/docs/manual/en/Object_Properties/):
  visibilidad, objetos fijos y estilo/relleno. Adoptar un modelo común de propiedades.
- [Blender: búsqueda de menús](https://docs.blender.org/manual/en/2.90/interface/controls/templates/operator_search.html):
  búsqueda ejecutable de órdenes. La referencia documenta el patrón; no se copian sus atajos sin
  comprobar conflictos con campos matemáticos y macOS.
- [Illustrator: panel Propiedades](https://helpx.adobe.com/illustrator/desktop/get-started/learn-the-basics/properties-panel-overview.html):
  controles según selección. Adoptar un inspector que muestre propiedades pertinentes.
- [Symbolab: ayuda](https://www.symbolab.com/help): soluciones con pasos, tabla, deslizadores y
  propiedades de funciones. Adoptar resultados explicables y vinculados a sus entradas.
- [DaVinci Resolve: edición](https://www.blackmagicdesign.com/products/davinciresolve/edit):
  inspector y animación con fotogramas clave. Adoptar primero animación de parámetros; reservar una
  línea de tiempo completa para cuando haya una necesidad real.

La clasificación de los menús y el orden de las fases son decisiones de esta propuesta, no una
reproducción literal de los menús de esas aplicaciones.
