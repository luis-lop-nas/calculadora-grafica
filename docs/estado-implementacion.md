# Estado de implementación · 25 de septiembre de 2026

Este documento describe el código local. El [árbol de destino](plan-menu-nativo.md) conserva el alcance completo propuesto y sus ampliaciones. No se ha publicado esta entrega en GitHub.

## Menús y edición rápida

La barra mantiene Archivo · Edición · Objeto · Herramientas · Escena · Vista · Animación · Módulo · Ventana · Ayuda. La organización de Herramientas está en `src/nucleo/barra.ts`; cada módulo declara sus capacidades. Los comandos semánticos conservan su identidad al cambiar el orden y vuelven a comprobar su disponibilidad al ejecutarse. La paleta de escritorio lee el menú realmente instalado, incluidas sus órdenes del sistema; la barra web presenta las operaciones compartidas.

```text
Q / clic derecho sobre el lienzo
├─ Propiedades → inspector de la selección
├─ Añadir → objetos del módulo
├─ Duplicar
├─ Ocultar
├─ Eliminar
├─ Bloquear movimiento
├─ Herramientas → operaciones del árbol común
└─ Favoritos → estrellas de Buscar orden

Centro → Buscar orden / Menú nativo (escritorio)
Alt/⌥ + clic derecho → contextual nativo completo
Edición → Ajustar último cálculo… (F9)
```

El radial selecciona el objeto bajo el puntero antes de abrirse. Q no interfiere al escribir una expresión. Se maneja con ratón, Tab, números 1–8 y Escape. Los favoritos se guardan en las preferencias locales. Ajustar último cálculo recupera entradas del último resultado guardado en el módulo; recalcular produce un nuevo resultado y la inserción sigue siendo explícita.

La referencia de Blender se usa para [menús radiales, favoritos y ajuste de la última operación](https://developer.blender.org/docs/release_notes/2.80/ui/), adaptando las operaciones a objetos matemáticos.

## Funciones comunes incorporadas

| Área | Implementado | Alcance actual |
|---|---|---|
| Herramientas | 95 operaciones con parámetros, fórmulas/tablas y resultados reutilizables | Según los algoritmos disponibles; estudios de signo, continuidad, recorrido y periodicidad son numéricos y acotados, no pruebas globales |
| Objetos | Identidad estable, selección múltiple/por tipo/grupo/dependencias, definición, duplicar, borrar, ocultar, aislar, grupos, estilos y bloqueo | Adaptadores explícitos para Gráficas, Plano, filas de CAS/Espacio y laboratorio; capas informativas siguen siendo de lectura |
| Dependencias | Resultados derivados vinculados, recálculo, detección de ausencia/ciclos y separación al editar manualmente | Filas compatibles de Gráficas; las construcciones de Plano conservan su motor |
| Escena | Ejes, rótulos, rangos, escala, unidades π/grados, cruce, proporción; rejillas cartesiana/polar/isométrica y ajuste | Escala logarítmica habilitada en Gráficas; otros módulos no anuncian compatibilidad que no tienen |
| Escena 3D | Visibilidad de X/Y/Z, nombres y planos XY/XZ/YZ independientes | No escala logarítmica ni editor completo de referencias arbitrarias 3D |
| Fondo | Imagen calibrada, color, guías y texto | Decoración 2D; imagen de fondo en escalas lineales |
| Vista | Vistas guardadas, recuperar/renombrar/eliminar; comparación A/B | Escena e historial independientes por lado |
| Archivo | Importar CSV e imagen; exportar SVG e informe, además de formatos existentes | SVG 2D; CSV convierte columnas elegidas a puntos de Gráficas |
| Animación | Animar parámetro con rango/duración/modo; rastros de puntos y controles de simulación | Parámetros mediante adaptador, actualmente Gráficas; rastros comunes 2D |
| Paneles | Inspector acoplable, resultados persistentes, historial navegable, espacios de trabajo | Resultados guardan entradas y método; pasos cuando el motor los proporciona |

## Laboratorio de física

Nuevo módulo `laboratorio-fisica`, dentro de Física: 46 módulos en total.

```text
Objeto → Añadir
├─ Cuerpo circular · Anclaje · Superficie / rampa
├─ Fuerza aplicada · Muelle
└─ Emisor · Lente delgada · Espejo plano · Interfaz refractante · Pantalla

Panel del laboratorio
├─ Modelo: Newton / Óptica / Lagrange
├─ Paleta de piezas → colocar con clic, mover arrastrando
├─ Objeto seleccionado → posición y propiedades físicas
├─ Entorno → gravedad, restitución, fricción, colisiones
└─ Simulación → duración, reproducción, instante, trayectorias y velocidades

Módulo
├─ Modelo físico
├─ Generar Lagrangiano de la escena
└─ Ejemplos: vacío, tiro, rampa, choque, muelle, lente, refracción y péndulo

Animación
└─ Reproducir / pausar simulación · Volver al inicio
```

Newton integra discos sin rotación mediante RK4, fuerzas constantes y muelles con amortiguación axial. Los contactos son discretos y pueden perder colisiones a velocidades altas respecto al radio y al paso; no representa cuerpos rígidos generales. La energía mostrada suma energía cinética, gravitatoria y elástica; no se promete conservación con fuerzas externas, fricción o amortiguación. Máximo 60 piezas, 24 cuerpos y 30 segundos por simulación.

Óptica aplica reflexión, Snell/reflexión total y lentes delgadas paraxiales, con un máximo de 31 rayos por emisor y 16 interacciones por rayo. No simula difracción. Ocultar piezas conserva su participación en los cálculos.

Lagrange usa el motor simbólico y numérico existente: L, coordenadas, parámetros, condiciones iniciales y posiciones de dibujo editables. Convertir desde Newton admite uno o dos cuerpos móviles y rechaza amortiguación y contactos que no puede representar. Las piezas y las ecuaciones se guardan juntas, y el modelo activo deja claro cuál se está calculando.

## macOS y Linux

Electron adapta menús y atajos a cada sistema. Linux tiene lanzador/MIME `.calc`, recientes persistentes, apertura desde argumentos y segunda instancia, título con estado modificado e instalación por usuario. Los paquetes AppImage y Debian se generan para x64 y arm64. macOS conserva sus roles, eventos de documentos y firma ad hoc del paquete local.

Se ha comprobado el arranque del paquete macOS arm64. Se han generado los cuatro paquetes Linux, pero **no se han ejecutado en una máquina Linux durante esta sesión**. El workflow `.github/workflows/escritorio.yml` configura pruebas nativas y de paquete en macOS y Ubuntu; no se ha ejecutado remotamente ni publicado aquí.

## Validación y ampliaciones pendientes

Comandos de comprobación:

- `npm run build`, `npm run pruebas`, `npm run mate` (2752 comprobaciones al incluir las asas del laboratorio).
- `npm run pruebas:escritorio`, `npm run pruebas:herramientas`, `npm run pruebas:laboratorio`.
- `node comprobar/recorrido.mjs` y `node comprobar/menus-web.mjs`, con Vite abierto.
- `node comprobar/app.mjs`, `node comprobar/menus.mjs`, `NATIVO=1 node comprobar/laboratorio.mjs`.
- `node comprobar/laboratorio.mjs` con Vite para creación, edición radial, enlaces, reproducción, conversión a Lagrange, óptica, persistencia y favoritos.
- `npm run comprobar:paquete` tras empaquetar.

El motor de física tiene pruebas contra caída libre, F/m, oscilador analítico y conservación de energía; choques, cuerpo fijo y contacto con suelo; foco de lente, espejo, Snell y reflexión total. La trayectoria del lagrangiano generado se contrasta con Newton.

El árbol completo todavía contiene ampliaciones: preferencias matemáticas globales del documento y atajos configurables; ejes secundarios y sistemas de referencia arbitrarios; transformaciones afines comunes para todos los tipos de objeto; inspector completo 3D; ajuste a puntos/intersecciones; optimización con restricciones y envolventes generales; fotogramas clave y exportación TikZ. El editor físico no incluye aún sólidos con rotación, contactos continuos, medios ópticos volumétricos ni restricciones mecánicas generadas desde articulaciones. Estas capacidades no se presentan como órdenes disponibles.
