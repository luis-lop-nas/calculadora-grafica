# Calculadora gráfica

Una sola aplicación con un módulo por tema: cada uno tiene su panel de controles a la
izquierda y su lienzo a la derecha, con las fórmulas y las lecturas numéricas siempre a la vista.

## Arrancar

```bash
npm install     # solo la primera vez
npm run dev     # abre http://localhost:5173
```

`npm run build` genera `dist/` si alguna vez quieres subirlo a algún sitio.
`npm run pruebas` comprueba el evaluador de expresiones y `npm run mate` contrasta cada cálculo con
su forma cerrada o con un segundo método independiente. `npm run comprobar` abre todos los módulos
(la lista sale de la propia paleta) en un Chromium de verdad, captura cada uno en `comprobar/tiros/`
y falla si alguno suelta un error; `SOLO=fourier,control` recorre solo esos.
`npm run comprobar:app` hace lo mismo en la app de Mac desde su menú Módulo, y además guarda y
reabre un `.calc` y exporta PNG y CSV.

## App de Mac

La misma aplicación, también como app nativa (Electron) con barra de menús de macOS. La web no cambia.

```bash
npm run app:dev         # en caliente: Vite + ventana de la app
npm run app             # compila dist/ y abre la app
npm run app:empaquetar  # genera release/mac-arm64/Calculadora.app (arrástrala a Aplicaciones)
```

Menús: **Archivo** (nueva ventana ⌘N, abrir ⌘O, recientes, guardar ⌘S / como ⇧⌘S, exportar PNG ⌘E y
CSV), **Edición**, **Módulo** (todos, ⌘1…⌘9 por área, ⌘[ ⌘] anterior/siguiente, ⌘K buscar), **Vista**
(Comparar ⌘D, autogiro, zoom, pantalla completa). Las sesiones se guardan como documentos `.calc`
(el mismo JSON del autoguardado; también abre los `.json` del botón JSON) y Finder los abre con
doble clic. El autoguardado sigue funcionando, pero es **aparte del del navegador**.

Piezas: `electron/main.cjs` (ventanas, menú, diálogos), `electron/preload.cjs` (el puente que la
página ve como `window.escritorio`) y `src/nucleo/escritorio.ts` (sus tipos; en la web no existe).
Ojo: VS Code exporta `ELECTRON_RUN_AS_NODE=1` a sus procesos y con eso Electron no abre ventana;
los scripts ya la quitan.

## Moverse por la aplicación

Arriba solo está el botón **☰**, la ruta del módulo abierto («Álgebra › Matrices») y la búsqueda.
El ☰ (o un clic en la ruta) abre un panel lateral con todas las áreas —Álgebra · Geometría ·
Funciones · EDO · EDP · Cálculo vectorial · Señales · Mecánica · Física · Cuántica— y sus módulos,
con el abierto resaltado; al final, **Exportar** el estado (JSON) o las lecturas (CSV). Esc o un
clic fuera lo cierra.

**⌘K** abre la búsqueda: escribe *onda*, *calor*, *Bessel*, *anillo*… y salta directo, sin pasar
por el área. Flechas para moverte, Enter para abrir, Escape para cerrar.

El estado de cada módulo (números cuánticos, matriz, semillas, expresión…) se guarda, así que ir y
volver no pierde nada.

**Comparar** (arriba a la derecha, junto a Autogiro en 3D) parte el lienzo en dos, A y B, **lado a lado** o **superpuestos**
(B translúcido encima de A), con las **cámaras enlazadas** si quieres: mover o girar uno mueve el
otro. B puede ser el mismo módulo con otros parámetros (empieza como copia de A; «Copiar A en B»
vuelve a igualarlos) o cualquier otro módulo, elegido en la barra. Encima del panel, «A · … / B · …»
elige qué lado editas. Algunos módulos traen comparaciones hechas: **dominio ↔ imagen** en Variable
compleja y en Aplicaciones lineales, y **otra métrica** en Espacios métricos.

## Mover con el ratón

Casi todos los lienzos tienen **asas**: puntos que se arrastran y cambian el problema. Doble clic en
un hueco añade (donde tiene sentido), doble clic o Supr sobre un asa la quita, y en 3D ⌥ mueve
en vertical. Además de las de Gráficas, Geometría, Superficies, Paramétricas, Campos, Aplicaciones,
Subespacios y Calor: los puntos p y q en Espacios y métricas, la sonda z₀ en Variable compleja, las
semillas de las trayectorias en Campo de direcciones y Retrato de fase, y(0) y la pendiente y′(0) en
Resolver y en Segundo orden (α y β en el problema de contorno), el punto donde se pulsa la cuerda en
la onda 1D, la energía E en la barrera, un punto x₀ de lectura en Bases de Hilbert, una sonda con la
propiedad de la media en Laplace y una sonda de |ψ|² en los orbitales.

Atajos en los lienzos 3D (el botón **?** de la barra los recuerda):

| Tecla / gesto | Qué hace |
|---|---|
| **X**, **Y**, **Z** | mirar desde ese eje; **0** vuelve a la vista de partida |
| arrastrar un asa + **⌥** | en vertical |
| arrastrar un asa + **Mayús** | solo por el eje en que más se mueve, a pasos de 0,5 |
| clic en la figura (Aplicaciones) | seleccionarla (marco discontinuo); **Esc** la suelta |
| **⌘** (Ctrl) + arrastrar | mover la figura; con **Mayús**, por un eje y a pasos de 0,5 |
| **R** | girarla con el ratón; **X/Y/Z** eligen el eje, **Mayús** a pasos de 15°, clic o Intro confirma, Esc deshace |

El giro y el desplazamiento se hacen en el dominio, antes de aplicar A: se ve cómo la matriz deforma
la figura ya colocada. «Recolocar la figura» la devuelve al origen.

## Meter los datos

- **Matrices y vectores**: cada celda se **arrastra en horizontal** para cambiar el valor de
  seguido, o se **pulsa** para escribirlo. `↑`/`↓` suben y bajan un paso, con `Shift` diez. En los
  módulos de vectores cada fila lleva su nombre y el color con el que sale dibujada.
- **Ecuaciones**: se escriben en texto (`y*(1-y)`, `-sin(x)-0.2*y`) y debajo aparecen **compuestas
  en LaTeX** mientras escribes, así ves si has puesto el paréntesis donde creías. Si algo no cuadra,
  el aviso dice qué. Los botones de debajo insertan trozos (`sin(`, `sqrt(`, `pi`, `^`…) en el
  cursor. Entiende `+ - * / ^`, `n!`, `30°`, `|x|`, multiplicación implícita (`2x`, `xy`,
  `2sin(x)`, `sin x`), comparaciones encadenadas (`0<x<2`), a trozos con `if(x<0, -x, x^2)` (o `si`),
  trigonométricas e hiperbólicas con sus inversas, `sec csc cot`, `log(b, x)`, `nroot`, `atan2`, `mod`,
  `min/max`, `nCr`, `gamma`, `erf`, `floor/ceil/round`, letras griegas y `pi, e, tau, phi`; nada más,
  porque no usa `eval`.
- **Atajos**: los ejemplos (logística, péndulo, Van der Pol, Identidad, Cizalla…) son texto
  pulsable, no botones que compitan con los controles.

## Módulos

**Álgebra lineal, estructuras y análisis funcional**
- Matrices paso a paso — calculadora exacta con fracciones (hasta 6×6; admite `−2/5` y `0,25`), con cada operación de fila a la vista: escalonada reducida (Gauss–Jordan), determinante por triangulación, inversa con (A | I), sistemas A·x = b con Rouché–Frobenius y la solución paramétrica, rango, núcleo, imagen y espacio fila, polinomio característico, autovalores exactos (racionales, con radicales o complejos) con sus multiplicidades y vectores propios, diagonalización A = P·D·P⁻¹, forma de Jordan, PA = LU, QR y valores singulares.
- Aplicaciones lineales en R³ — la matriz como deformación del espacio: rango, núcleo, determinante como factor de volumen; los autovalores complejos se leen como el giro y la escala en su plano invariante.
- Subespacios y proyección ortogonal — Gram-Schmidt, proyección, residuo y complemento ortogonal; con un segundo subespacio, W₁ ∩ W₂ (dibujada) y W₁ + W₂ con la fórmula de Grassmann.
- Bases de Hilbert — Fourier, Legendre, Chebyshev y Hermite; Parseval y el fenómeno de Gibbs.
- Grupos, anillos y cuerpos — tablas de Cayley de Zₙ, Sₙ y Dₙ, con unidades, divisores de cero, ideales y subgrupos.
- Espacios métricos — distancias euclídea, ponderada, Manhattan, Minkowski y Poincaré, con bolas unidad y comparación.

**Geometría**
- Regla y compás — construcciones que se mantienen al mover los puntos: cada objeto guarda su definición, no sus coordenadas. Herramientas por grupos: puntos (libre, sobre un objeto, medio, intersección, centro), rectas (segmento, recta, semirrecta, vector, perpendicular, paralela, mediatriz, bisectriz, tangentes), polígonos (y regulares), circunferencias (centro y punto, centro y radio, por tres puntos, compás, arco, semicircunferencia), cónicas (elipse e hipérbola por focos, parábola por foco y directriz, por cinco puntos), circunferencia inscrita en un triángulo, medidas (ángulo, distancia, área, perímetro, pendiente), transformaciones (simetría axial y central, rotación, traslación, homotecia, inversión) y lugar geométrico. Cada cónica dice su tipo (elipse, circunferencia, hipérbola, parábola, degenerada), su excentricidad y su centro. Con Mover se arrastran los puntos libres (azules) y los que van sobre un objeto (verdes). La lista de objetos da coordenadas, ecuaciones y medidas, y cada uno se oculta o se borra con todo lo que depende de él.
- Espacio 3D — una fila por objeto: superficies implícitas (`x^2+y^2+z^2=4`, planos), `z = f(x, y)` escrita como `x^2 - y^2`, puntos arrastrables `A = (1, 2, 3)`, curvas `(cos(t), sin(t), t/4), -12 < t < 12`, superficies paramétricas en u, v, y órdenes `recta`, `segmento`, `vector`, `plano(A, B, C)`, `esfera(C, r)`, `cubo`, `prisma`, `piramide`, `cono`, `cilindro` y los poliedros regulares (con volumen y área), `revolucion(f(x), a, b)` y `corte(1, 2)`, la curva donde se cortan dos superficies. Las letras libres son deslizadores.

**Funciones, cálculo simbólico y variable compleja**
- Gráficas — vista algebraica al estilo GeoGebra: cada fila es texto libre y se reconoce sola. `x^3-3x` o `f(x) = …` (función), `x^2+y^2=9` (implícita), `y < sin(x)` o `x^2+y^2<=4 & y>x` (región sombreada, borde discontinuo si es estricta), `(cos(3t), sin(2t))` (paramétrica), `r = 1+cos(θ)` (polar), `x = y^2` (función de y), `A = (2, 1)` (punto que se arrastra) y `a = 3` (deslizador). Una restricción al final acota el dominio: `f(x) = x^2, 0 < x < 2`. **Deslizadores automáticos**: cualquier letra libre (`a sin(bx+c)`) crea el suyo, con rango editable y ▶ para animarlo. Una función puede usar otra y sus derivadas: `g(x) = f'(x) + 1`. Sobre la función activa: x₀ con tangente, f′, área bajo la curva o entre dos, raíces y corte con y, extremos, inflexiones, asíntotas (verticales, horizontales y oblicuas, también en el borde del dominio como ln x) y cortes entre curvas; sumas de Riemann (izquierda, derecha, punto medio y trapecios) sobre el área; polinomio de Taylor de grado 0–10 en x₀; estudio de la función (dominio, huecos, paridad, intervalos de crecimiento y de concavidad); tabla de valores. Doble clic junto a una curva marca un punto sobre ella; en un hueco crea un punto libre.
- Variable compleja — coloreado del dominio (color = fase, brillo = módulo, con bandas por duplicación), imagen de una rejilla para ver la conformidad, y campo de Pólya. Comprueba Cauchy-Riemann comparando la derivada en dos direcciones (`conj(z)`, `re(z)`, `im(z)` para ver las que no lo cumplen). Marca los ceros y los polos con su orden, las singularidades esenciales y los puntos de ramificación, da los residuos, y calcula ∮ f dz sobre una circunferencia arrastrable, contrastada con 2πi·Σ Res y con el principio del argumento.
- Cálculo simbólico — una orden por fila y el resultado exacto a la derecha, compuesto en LaTeX. `derivar(f, x, n)`, `integrar(f, x)` y `integrar(f, x, a, b)` (Barrow solo si la primitiva es continua: parte por las asíntotas del integrando y dice cuándo diverge; impropias con `inf` y singularidades integrables; sin primitiva, cuadratura de doble exponencial), `simplificar` (cancela fracciones de polinomios, sin² + cos² = 1), `desarrollar`, `factorizar` (sobre ℚ, con multiplicidades), `resolver(ecuación, x)` (raíces exactas con radicales, complejas aparte, familias con k ∈ ℤ, numérica si no hay forma cerrada) y sistemas lineales `resolver({x+y=3, x-y=1}, {x, y})`, `limite(f, x, a)` con `a = inf` (L'Hôpital simbólico, 1^∞ y 0·∞, laterales), `taylor(f, x, a, n)`, `numerico` y `sustituir`. `f(x) := …` y `a := …` definen para las filas de debajo, y `f'(x)` funciona. Aritmética exacta con racionales grandes: √72 = 6√2, 1/√2 = √2/2, sin(π/3) = √3/2. Integra con la tabla y, si no basta, por **fracciones simples** (factores lineales con multiplicidad y cuadráticos irreducibles), **cambio de variable** (busca u con u′ en el integrando, también eˣ en e^{2x}) **partes** (tabular para polinomio × exp/trig, u = ln/arctan/arcsen, y la cíclica e^{ax}·sin bx), **potencias trigonométricas** (sinᵐ cosⁿ, tan, sec, csc) y **sustituciones trigonométricas** (√(a² ± u²)). `n!`, `nCr` y Γ(n) salen exactos. Cada primitiva se comprueba derivándola; si no hay primitiva elemental (e^{x²}, sin x / x) lo dice en vez de inventar.

**Ecuaciones diferenciales ordinarias**
- Resolver una EDO — **se escribe la ecuación entera, con el igual**: `y'' + 3*y' + 2*y = 0`. La clasifica (orden, lineal o no, coeficientes constantes o variables, homogénea o no), da la **solución general en forma cerrada** con los pasos y la que cumple tus condiciones iniciales, y dibuja las dos curvas —la de la fórmula y la numérica— superpuestas para que se vea que coinciden. Métodos: separación de variables, lineal de primer orden (factor integrante), Bernoulli, exacta y con factor integrante μ(x) o μ(y), homogénea (y = v·x), coeficientes constantes con coeficientes indeterminados o variación de parámetros, Cauchy–Euler y reducción de orden. Cuando el despeje da dos ramas (±√…), la condición inicial elige la buena. Cada solución se comprueba metiéndola en la ecuación; si no hay forma cerrada, queda la numérica.
- Campo de direcciones — y′ = f(x, y) escrita por ti; pulsa en el lienzo para lanzar soluciones. Compara Euler, punto medio y RK4. Isoclinas, y en las autónomas y′ = f(y), la línea de fase con los equilibrios estables, inestables y semiestables.
- Segundo orden y contorno — y″ = f(t, y, y′), con **problema de valor inicial** (y(0), y′(0)) o **de contorno** (y(0)=α, y(T)=β resuelto por tiro, enseñando los intentos que fallan). En el caso lineal da las raíces características, el régimen de amortiguamiento, la amplitud estacionaria y la frecuencia de resonancia.
- Retrato de fase — sistemas lineales (con autovectores y clasificación) y no lineales, con nulclinas, equilibrios detectados y clasificados (y avisa cuando la linealización no decide) y las separatrices de cada silla (variedades estable e inestable). Una rejilla de órbitas llena el retrato de golpe, y `x(t), y(t)` parte el lienzo para poner las series temporales al lado.

**Ecuaciones en derivadas parciales** — onda y calor cambian de dimensión sin cambiar de módulo
- Escribe tu EDP — la ecuación escrita a mano, en 1D o 2D, con uno o dos campos (`u_t = lap(u) + u*(1-u)`, `u_tt = u_xx - 0.3*u_t`, `lap(u) = -1`…), resuelta por el método de líneas (diferencias finitas y RK4 con el paso que pide la estabilidad): Dirichlet, Neumann o periódica, contornos que dependen de t, estacionarias (Poisson, Laplace) y sistemas de reacción–difusión (Gray–Scott, FitzHugh–Nagumo, Schnakenberg). Un clic deja caer una gota en el dominio.
- Ecuación de onda (1D / 2D / 3D) — la cuerda admite los tres contornos (**fijo-fijo, fijo-libre, libre-libre**, cada uno con su base propia) y **las dos condiciones iniciales**: perfil u(x,0) y velocidad u_t(x,0), las dos escribibles a mano. Membrana rectangular y circular (ceros de Bessel) y modos de una caja, en isosuperficies o en tres cortes ortogonales.
- Ecuación del calor (1D / 2D / 3D) — barra con Dirichlet, mixta, Neumann y **Robin** (convección, con sus autovalores resueltos de λcosλ + h senλ = 0); temperatura inicial a elegir o escrita a mano. Placa y cubo con dato separable, en superficie y en cortes.
- Ecuación de Laplace — problema de Dirichlet en el cuadrado y en el disco, con dato de contorno propio y la propiedad de la media.

**Cálculo vectorial** (varias variables)
- Superficies z = f(x, y) — la escribes tú; plano tangente, las dos curvas de corte con sus tangentes T₁ y T₂, gradiente en la base, curvas de nivel proyectadas y clasificación de puntos críticos por el hessiano.
- Superficies paramétricas r(u, v) — esfera, toro, astroide, Möbius, helicoide, catenoide, Klein, silla del mono, o la tuya; curvas coordenadas y área ∬‖rᵤ×rᵥ‖.
- Campos vectoriales — F = (P, Q, R) escrita a mano o de la lista (radial, dipolo, hilo con corriente, torbellino…); flechas coloreadas por ‖F‖, líneas de campo integradas, y divergencia y rotacional en un punto de sonda.

**Señales y sistemas**
- Series de Fourier — f escrita en un periodo; suma parcial, espectro, Gibbs (tiende a 8,949 %), Fejér y Parseval. Los coeficientes se reconocen en forma exacta cuando la tienen (4/(3π)…).
- Transformada de Fourier — espectro continuo, muestreo con aliasing y reconstrucción de Shannon, y DFT con ventanas (rectangular, Hann, Hamming, Blackman).
- Convolución — x(τ)·h(t − τ) deslizándose, el área que se acumula y la salida.
- Transformada de Laplace — directa, inversa (fracciones simples, retardos e^{−τs}, δ) y **EDO lineales con condiciones en 0**, con pasos. Cada resultado se comprueba con ∫₀^∞ f e^{−st} dt; en el CAS, `laplace(…)` e `ilaplace(…)`. Escalón: `heaviside(t−a)`; delta: `dirac(t−a)`.
- Sistemas y control — G(s) escrita, ganancia, lazo cerrado y PID; escalón con sus métricas, Bode con asíntotas y márgenes, Nyquist (Z = N + P), lugar de las raíces y Routh–Hurwitz.
- Circuitos RLC — serie y paralelo: transitorio exacto en los tres regímenes, fasores girando, impedancia, potencia y curva de resonancia.
- Filtros digitales — media móvil, IIR, resonador, peine, Butterworth (bilineal) o coeficientes propios: plano z, |H(e^{iω})| y h[n].

**Mecánica clásica y relatividad**
- Escribe tu lagrangiano — escribe L(q, q̇) con `q'` para las velocidades: ecuaciones de Euler–Lagrange y de Hamilton, animación, fases, energía y sección de Poincaré. Presets: péndulo, doble péndulo, elástico, carro y péndulo, Atwood, cono, oscilador.
- Órbitas — potencial −μ/r (+ ε/r³ para la precesión), elementos orbitales, áreas iguales y transferencia de Hohmann.
- Oscilaciones — cadena de N masas o M y K escritas: modos normales (problema generalizado), superposición y dispersión; oscilador forzado amortiguado con amplitud, fase y transitorio exacto.
- Sólido rígido — tensor de inercia de piezas (`caja m=1 a=… b=… c=… en (x, y, z)`, cilindro, esfera, cáscara, varilla, cono, punto) con Steiner, ejes principales y elipsoide; rotación libre de Euler (raqueta, periodo 4K(k)/λ); peonza pesada con nutación entre las raíces de la cúbica y precesión uniforme.
- Relatividad especial — diagrama de Minkowski con sucesos y el eje t′ arrastrables, intervalos, simultaneidad, gemelos (con Doppler), contracción y composición de velocidades.

**Física**
- Electrostática — cargas arrastrables con líneas de campo y equipotenciales, flujo de Gauss por una superficie y método de las imágenes (plano y esfera a tierra).
- Magnetostática — Biot–Savart sobre curvas escritas (hilo, espira, Helmholtz, solenoide, nudo de trébol), líneas de B y circulación de Ampère.
- Polarización y Fresnel — polarización con parámetros de Stokes, Fresnel con Brewster y reflexión total, y velocidades de fase y de grupo.
- Óptica ondulatoria — rendijas y redes, Fraunhofer por FFT 2D de una abertura, películas delgadas y Michelson.
- Óptica geométrica — sistemas de lentes con matrices ABCD (objeto y lentes arrastrables), aberración esférica de un espejo cóncavo con su cáustica y dispersión en un prisma.
- Termodinámica — ciclos de Carnot, Otto, Diesel, Brayton y Stirling (con o sin regenerador) en P–V y T–S con los estados arrastrables: calor y trabajo tramo a tramo, y el rendimiento del balance contrastado con la fórmula del libro y con Carnot entre las mismas temperaturas. Gas de van der Waals en variables reducidas: isotermas, construcción de Maxwell con las dos áreas, campana de coexistencia y espinodal, presión de vapor, calor latente y fase del estado (metaestable, inestable…), con los puntos críticos de CO₂, H₂O, N₂, Ar y He.
- Unidades y magnitudes — conversiones dimensionales de longitud, masa, tiempo, velocidad, fuerza, energía, presión y temperatura.

**Cuántica**
- Orbitales y estados ligados 3D — hidrógeno, caja cúbica y oscilador isótropo, con nube |ψ|² e isosuperficie.
- Paquete de ondas y dispersión — ψ compleja como hélice coloreada por la fase, y su ensanchamiento.
- Pozos, barrera y efecto túnel — pozo infinito, finito (ecuación trascendente resuelta numéricamente), armónico y T(E) de la barrera.

## Cómo añadir un módulo

Un módulo es un fichero que exporta `definir<S>({...})`:

```
src/modulos/<area>/<nombre>.tsx
```

Lo mínimo es `id`, `area`, `resumen`, `titulo`, `inicial`, `Panel` y `vista`. `corto` es el nombre
que sale en la fila de módulos (si falta, se usa `resumen`). La vista puede ser:

- `{ tipo: '3d', construir(e, s), animar?(e, s, t, dt) }` — `e` es la `Escena3D` compartida
  (cámara en órbita, ejes con rótulos, `superficie`, `nube`, `linea`, `flecha`, `malla`).
  `construir` se rehace al cambiar el estado; `animar` corre cada fotograma.
- `{ tipo: '2d', dibujar(g, s, t) }` — `g` es el `Pintor2D`, con coordenadas del mundo,
  paneo y zoom, `ejes`, `curva`, `funcion`, `flecha` y `texto`. `alPulsar` recibe el clic.
  `region(x, y, w, h)` restringe el dibujo a un trozo del lienzo, que es como el retrato de fase
  pone las series temporales al lado.
- `{ tipo: 'html', Componente }` — para lo que se lee mejor como documento (tablas de Cayley).

`comparaciones: [{ t, a?, b }]` ofrece en el modo Comparar parejas preparadas: el parche que se
aplica a A y el que se aplica a B.

`vista` también puede ser una **función del estado** (`vista: (s) => Vista<S>`) cuando el módulo
cambia de lienzo —así onda y calor pasan de 1D a 2D y 3D—; `clave` distingue vistas del mismo tipo
para que el lienzo se remonte al cambiar.

Después basta añadirlo a `src/nucleo/registro.ts`; el orden de esa lista es el orden del menú.

Para los controles del panel están `Segmentado`, `Rango`, `Interruptor`, `Boton`, `Numero`,
`Matriz` (con `filas` para vectores con nombre y color), `Expresion` y `Atajos`, todos en
`src/nucleo/controles.tsx`.

Opcionales útiles: `formula(s)` (LaTeX, un bloque por elemento), `lecturas(s)` (pares
etiqueta/valor), `rotulo(s)`, `leyenda(s)`, `pista` y `lecturasVivas` cuando las lecturas
dependen del tiempo.

## Piezas compartidas

- `src/lib/especiales.ts` — Laguerre, Legendre, Hermite, Bessel (también para x grande), K(k), Si(x), gamma y beta incompletas, erf y su inversa.
- `src/lib/fft.ts` — FFT de cualquier longitud (radix-2 y Bluestein), 2D y convolución.
- `src/lib/azar.ts` — generador con semilla y once distribuciones con pdf, cdf, cuantil y muestreo.
- `src/lib/senales.ts` — saltos de una función, integrales partidas en ellos, coeficientes de Fourier y transformada continua.
- `src/lib/control.ts` — respuesta temporal, Bode, márgenes, Nyquist, lugar de las raíces y Routh.
- `src/lib/cas/laplace.ts` — Laplace directa, inversa y EDO lineales, con su comprobación numérica.
- `src/lib/cas/compilar.ts` — pasa una expresión del CAS a un cierre numérico rápido.
- `src/lib/mecanica.ts` — de un lagrangiano a sus ecuaciones (simbólicas) y su integración (Dormand–Prince).
- `src/lib/solido.ts` — tensor de inercia, rotación libre con orientación y peonza simétrica.
- `src/lib/relatividad.ts` — boosts de Lorentz, intervalo, composición de velocidades, gemelos.
- `src/lib/expresion.ts` — evaluador de expresiones sin `eval`: descenso recursivo a un árbol
  público (`analizar`, `Nodo`) que se compila a cierres; `aLatex` para la vista previa y `compilarC`
  para evaluar la misma expresión sobre los complejos (con `i`).
- `src/lib/cas/` — el CAS: `expr.ts` (forma canónica con racionales exactos), `tex.ts`, `derivar.ts`,
  `polinomios.ts` (aritmética sobre ℚ, Yun, raíces racionales), `algebra.ts`, `resolver.ts`,
  `limites.ts` (L'Hôpital, reconocer números, Taylor), `integrar.ts` y `cas.ts` (las órdenes).
- `src/lib/geometria.ts` — construcciones con regla y compás: definiciones, intersecciones, cónicas, transformaciones y lugar geométrico.
- `src/lib/objetos3d.ts` — filas del espacio, sólidos y curva de corte de dos superficies.
- `src/lib/objetos2d.ts` — qué es cada fila de Gráficas, deslizadores y puntos notables (raíces,
  extremos, inflexiones, asíntotas, cortes).
  Pruebas: `npm run pruebas`.
- `src/lib/numerico.ts` — Euler, RK2, RK4, Dormand–Prince 5(4) con interpolación de Hermite y trayectorias.
- `src/lib/matrices.ts` — rref, rango, núcleo, autovalores (Jacobi, generalizado, tridiagonal), raíces de polinomios, mínimos cuadrados por QR, Gram-Schmidt, clasificación de equilibrios.
- `src/lib/contorno.ts` — marching squares, equilibrios y jacobiano numérico.
- `src/lib/mallado.ts` — rejilla volumétrica, marching tetrahedra y nube por |ψ|².
- `src/lib/grupos.ts` — Zₙ, Sₙ, Dₙ, órdenes, centro y subgrupos.

## Tema

Todo el color sale de variables CSS en `src/estilos.css` (`--accent`, `--pos`, `--neg`, `--aux`…),
con claro y oscuro. Los módulos las leen con `e.color('--pos')` o `g.color('--pos')`, así que
cambiar la paleta no toca ni un módulo.
