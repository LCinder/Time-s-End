# MAIN — Documento de diseño (GDD)

> Título provisional: **Time's End** (el nombre del repositorio; el definitivo está por decidir, ver §14).
> Documento vivo: se actualiza a medida que avanzamos.

## 0. Cómo ejecutarlo

```powershell
npm install
npm run dev
```
Abre `http://localhost:5173`. Para la versión publicable: `npm run build` (genera `dist/`, que se puede subir a itch.io o GitHub Pages).

**Atajos para probar y diseñar** (parámetros en la URL):
| URL | Efecto |
|---|---|
| `?level=smokestack` | Salta el menú y va directo al nivel (también `newsreel-1`, `serial-1`, `singalong-1`, `memory-1`) |
| `?beat=200` | Empieza el nivel en ese beat (modo práctica) |
| `?diff=hard` | Fuerza una dificultad |
| `?debug=1` | Muestra el panel de depuración (beat, compás, próximos eventos…) |
| `?god=1` | **Modo prueba:** los golpes y las caídas no cuentan, así que puedes jugar el nivel entero (también con `F2` si la depuración está activada) |

Ejemplo: `http://localhost:5173/?level=smokestack&beat=204&debug=1` empieza justo antes del túnel.

**Escenario de pruebas (sin parámetros):** en el título, el botón **▶ TEST STAGE** de arriba a la izquierda (o la tecla **T**, también en la pantalla "BIJOU PICTURES presents"). Se quita para la versión final con `"testStage": false` en `game.json`. Sirve también donde la dirección no lleva parámetros (por ejemplo, un enlace publicado). Ahí puedes:
- quitar o poner las vidas;
- cambiar la dificultad;
- entrar en cualquier nivel de plataformas o en el visor de personajes;
- en cada persecución, empezar desde el principio, desde cualquier marca de ensayo o unos beats antes de cada momento de la canción (billetes, picadora, paso a nivel, cucos, péndulo, agujas, depósito, llave, relojes fantasma, solo de silencio, túnel, el puente roto).

Al salir del nivel vuelves a esa lista. Dentro, `F2` pone y quita las vidas y `R` reinicia desde el mismo punto. Nada de lo que juegues ahí se guarda en las latas de película. Código: `src/scenes/TestScene.ts`.

**Jugar el capítulo 1 completo:** en el título, **NEW GAME** → elige una lata de película → introducción → el Bijou. **CONTINUE** te devuelve a donde lo dejaste.

**Teclas en partida:** `F1` muestra u oculta la depuración · `F2` activa o quita el modo prueba sin vidas (con la depuración activada) · `R` reinicia · `Esc` pausa. En el Bijou, `▲` mira y usa las cosas.
Con la depuración visible, `[` / `]` (o `-` / `+`) mueven el desfase de audio ±5 ms en caliente; el valor se guarda como la calibración.

**Calibración:** en el título, `↑/↓` elige entre **PLAY** y **CALIBRATE** (ver §10.1). Conviene calibrar una vez en cada ordenador (y cada vez que cambies de altavoces o auriculares, sobre todo si son Bluetooth).

**Canción:** *End of the Line* (hecha con Suno) está en `public/audio/smokestack/song.mp3`. El nivel está sincronizado con ella:
- mapa de tempo real de ~134 BPM, que acelera a ~137 en el estribillo final;
- cada palabra de la letra en su momento exacto;
- los peligros recolocados sobre su estructura.

Si el archivo no existe, suena la banda provisional generada por código. La letra está en `public/audio/smokestack/lyrics.txt` y el nivel se resincroniza con **un solo comando**, `npm run audio -- smokestack` (ver [tools/song-analysis](tools/song-analysis/README.md)). El brief original está en [docs/songs/old-smokestack-full-steam-ahead.md](docs/songs/old-smokestack-full-steam-ahead.md).

**Comprobaciones** (también se ejecutan en GitHub en cada cambio):
| Comando | Qué hace |
|---|---|
| `npm run audio -- <jefe>` | Mete la canción de un jefe en el juego: crea el nivel si no existe, instala Python la primera vez, escribe un borrador de letra si falta, sincroniza tempo y letra y comprueba el nivel |
| `npm run check` | Valida todos los JSON y revisa que cada nivel sea justo (ver §11.5). `-- --level <id>` para uno solo |
| `npm test` | Pruebas automáticas (Conductor, letra, anclajes, validación, comprobador) |
| `npm run build` | Compila (TypeScript + Vite) |

---

---

## 1. Visión

Un juego 2D para **navegador** con estética de **dibujos animados de los años 30** (estilo *rubber hose*: brazos de manguera, ojos de porción de tarta, guantes blancos, todo rebotando al ritmo). Cada nivel es un **corto animado** protagonizado por un jefe que **canta su propia canción**, y la letra **anuncia lo que va a pasar**: si el jefe canta *"what a shame if a piano fell on you…"*, un piano cae justo en el tiempo fuerte.

Los niveles alternan entre **derrotar al jefe** (duelos) y **huir / progresar** mientras el jefe te persigue (persecuciones, torres, etc.).

**Tema: el tiempo, su paso y la soledad.** Por fuera, el juego es alegre y rebotón, como los dibujos de los 30; por debajo, es melancólico. Ese contraste (canciones animadas con letras tristes) es muy de la época y es el tono de todo el juego: un reloj solo en un cine vacío que ayuda a otros solitarios a terminar su película.

**Inspiraciones:** el estilo de animación de los años 30 (Fleischer, Disney, Van Beuren) y la idea de los jefes que cantan en juegos de ritmo y plataformas.
**Regla legal:** todo es **original** (personajes, diseños, canciones y nombres). No copiamos personajes, diseños ni canciones de ningún juego o estudio existente.

### Pilares
1. **La canción ES el nivel.** Cada peligro está escrito en la letra y cae al compás.
2. **Memorable.** Cada jefe tiene un estilo musical, una mecánica y un momento estrella propios.
3. **Jefes implacables, pero justos.** Un *souls-like* mezclado con Cuphead y Billie Bust Up: cada jefe es un muro que se aprende a base de morir, con ataques densos que se superponen y van al ritmo. Todo peligro se avisa (con la letra, el aviso visual y el ritmo) antes de golpear, y todo tiene respuesta. Pocas vidas: perder una repite la fase y perder la última reinicia el combate.
4. **El detalle es obligatorio.** El juego es para venderlo: una mano al revés, un reflejo imposible o un pie que flota son fallos tan graves como un cuelgue, porque se notan al instante y abaratan todo. Cada personaje se revisa de cerca (manos, pies, cara, objetos, reflejos y sombras) en cada avance (§11.8, `boss-visual-review`).
5. **Configurable.** Dificultad, ritmo, eventos y niveles se definen en **JSON** que el autor puede editar sin tocar código.

---

## 2. Ideas clave (aprobadas)

| # | Idea | Descripción |
|---|------|-------------|
| 1 | **Pelotita que bota sobre la letra** | Subtítulos cantados al estilo de las *sing-along* de los 30: una pelotita salta de sílaba en sílaba marcando el ritmo. Es subtítulo y metrónomo a la vez. |
| 2 | **Las letras se vuelven físicas** | Las palabras clave ("COW!", "PIANO!") aparecen como letras de rótulo antiguo en el escenario: caen, aplastan o sirven de plataforma. |
| 3 | **Todo el mundo baila** | Árboles, casas, nubes y enemigos rebotan al compás (estirar y aplastar en cada beat). El escenario enseña el ritmo. |
| 4 | **La película como barra de vida** | Al recibir daño, la imagen se raya, parpadea y se quema. A 0, la película arde y aparece *"The End?"*. Al reintentar, la bobina se rebobina con efecto visual. |
| 5 | **El jefe reacciona** | Si fallas, se burla con una línea alternativa. Si vas bien, se pone nervioso: le tiembla la voz y la canción tartamudea. |
| 6 | **Progresión de color = historia de la animación** | Los primeros jefes son en blanco y negro (1928), después sepia, luego Technicolor de dos tonos y el final a todo color. |
| 7 | **Encore** | Al vencer a un jefe se desbloquea un remix más rápido y difícil de su canción. |
| 8 | **El cine se llena** | El mapa es la sala vacía del Bijou. Cada jefe al que le das su final se sienta en una butaca. Al terminar el juego, la sala está llena y todos ven juntos la última película: la de Tick. Es la medida visual del progreso… y de vencer a la soledad. |
| 9 | **Solos de silencio** | En momentos de cada canción la música se corta y solo se oye el tic-tac de Tick. Los peligros siguen cayendo en el beat y hay que mantener el ritmo **de memoria**. El péndulo de Tick sigue marcando el beat: es la única ayuda. |
| 10 | **La cuerda del reloj** | Tick va perdiendo cuerda. Cada acción a tiempo le da cuerda; si fallas mucho, el mundo se ralentiza un poco (imagen y música), como un reloj que se para. Es un "tiempo que se acaba" que se nota sin barra. |
| 11 | **Tu fantasma de antes** | Al reintentar, una silueta translúcida de tu intento anterior corre a tu lado. Nunca estás del todo solo: te acompaña quien fuiste hace un minuto. |
| 12 | **Las estaciones por la ventana** | Entre nivel y nivel, por la ventana de la cabina de proyección se ven pasar las estaciones (hojas, nieve, primavera). Refuerza la progresión de color por épocas: el tiempo pasa. |
| 13 | **Objetos perdidos** | En los niveles hay entradas de cine, cartas sin enviar y fotos del proyeccionista. Cuentan su historia sin texto: quién se fue, a quién esperaba. Se guardan en la cabina. |
| 14 | **Un final en silencio** | El último nivel no tiene enemigos. Es medianoche: la música se apaga instrumento a instrumento hasta que solo queda Tick marcando el ritmo en silencio… y algo le responde. |

---

## 3. Historia ✅

Une tres ideas: **el reloj de alguien que ya no está** (A), **el último minuto** (B) y **villanos que no quieren que su película acabe** (C).

**El punto de partida (A + B).** El viejo cine **"The Bijou"** cerró hace años. Su proyeccionista, Elias (nombre provisional), siguió yendo cada noche a proyectar películas para una sala vacía. Una noche no volvió. Su reloj de bolsillo, **Tick**, se quedó en la cabina de proyección y se paró a las **11:59**. Ahora Tick despierta en un cine polvoriento, solo. Todo el juego ocurre dentro de ese **último minuto antes de medianoche**: cada bobina que termina adelanta la aguja, y la última da las doce (*Time's End*).

**Los villanos (C).** Los personajes de las bobinas están atrapados repitiendo su corto para siempre, porque **acabar es ser olvidado**. Por eso se resisten, cantan y atacan. En el fondo, todos están solos, y cada uno encarna una cara del tiempo: las despedidas, la soledad, las oportunidades perdidas, envejecer, estar separados, esperar a alguien, la soledad con uno mismo… Vencerlos **no es destruirlos sino darles su final**: cuando termina su canción aparece *"That's all, folks?"*, el personaje se despide en paz y va a sentarse en una butaca del cine (idea 8).

**Los recuerdos.** Cada bobina es también un recuerdo de la vida de Elias, y sus miedos y nostalgias son los que dan forma a los villanos. Los objetos perdidos (idea 13) y las estaciones por la ventana (idea 12) van contando su historia sin palabras: quién se fue, a quién esperaba, qué tren no cogió.

**El final.** Medianoche. La sala está llena con todos los personajes a los que Tick dio su final. Se proyecta la última película, la de Tick, y llega el nivel en silencio (idea 14): solo Tick marcando el ritmo… hasta que algo le responde (un latido, o Elias). Agridulce.

- El **mapa del juego** es el propio cine, el Bijou: un mundo central que se recorre (§6.1). La esfera de Tick marca cuánto falta para medianoche.
- Cada nivel empieza con un **cartel de título** al estilo de los 30 y termina con *"That's all, folks?"*.

---

## 4. Protagonista ✅

**"Tick"**, un **reloj de bolsillo con patas** que tiene un **péndulo de metrónomo** colgando.
- El péndulo **oscila siempre al beat** (llega a su extremo en cada tiempo), así que es el indicador de ritmo integrado en el personaje.
- Las agujas del reloj le hacen de bigotito y giran solas.
- Tiene guantes blancos, zapatones y ojos de porción de tarta.
- Más adelante: la tapa se abrirá y cerrará al disparar (niveles Duel).
- Era el reloj de **Elias, el proyeccionista**. Sus agujas marcan las **11:59** al empezar y avanzan con cada bobina terminada.
- La **corona** (la ruedecita de dar cuerda) muestra cuánta cuerda le queda (idea 10).

---

## 5. Mecánicas de juego

### 5.1 Movimiento (libre)
- Correr, saltar (salto variable), agacharse y un *dash* corto.
- El movimiento es **libre**: lo que va al ritmo son los **peligros**, no tus pasos.

### 5.2 Acciones al ritmo (el corazón del juego)
Las acciones importantes se valoran según **lo cerca del beat** que las hagas:

| Acción | Fuera de ritmo | **A tiempo** |
|--------|----------------|--------------|
| Disparar | daño normal | **daño x2** + destello |
| Devolver objeto (*parry*) | falla / te golpea | **lo devuelve al jefe** |
| Saltar | salto normal | salto extra / sin coste de stamina (por decidir) |
| Dash | normal | invulnerabilidad más larga |

Las ventanas de tiempo son configurables (por ejemplo *perfect* ±50 ms y *good* ±100 ms) en `difficulty.json`.

### 5.3 Ataque según el nivel
- **Disparo** (duelos, vehículo).
- **Devolver objetos** (algunos jefes sin disparo: hay que devolver lo que lanzan, siempre a tiempo).
- **Sin ataque** (persecuciones: solo sobrevivir y llegar al final).

### 5.4 Vida
- La vida se representa con el **estado de la película** (idea 4). Base: 3 golpes, configurable.
- Al morir, el reinicio es rápido, con el efecto de rebobinado.

### 5.5 Mecánicas del tema (tiempo y soledad) ✅ en Smokestack
- **Solos de silencio** (idea 9): un evento de nivel, `silence`, corta la música durante unos compases (queda el tic-tac y, si acaso, un metrónomo muy bajo). Los peligros siguen en el beat. Las primeras veces se avisa con un cartel (*"Keep time!"*).
- **La cuerda** (idea 10): no sustituye a la vida (la película). Es un medidor aparte: cada acción a tiempo da cuerda y los fallos o el tiempo la gastan. Con poca cuerda, el mundo va un poco más lento: la música baja de tono y velocidad unos segundos y los peligros se ajustan para que siga siendo justo. Se recupera enseguida acertando. Debe sentirse, no castigar: dificultad configurable en `difficulty.json`.
- **El fantasma** (idea 11): se graba la posición de Tick en cada intento y, en el siguiente, se dibuja en translúcido. Se puede apagar en opciones.
- **Oportunidades únicas** (Mister Too-Late, §7): objetos que aparecen **un solo beat**; si no los coges, se pierden para esa partida. *(Pendiente: llega con su jefe.)*

**Implementación (capítulo 1):**
- **Solo de silencio:** evento `silence` en el JSON. En Smokestack está en el interludio tras el primer estribillo (beats 138–146). Tres beats antes avisa *"KEEP TIME!"*. Durante el solo se apaga la banda (una "puerta" de silencio en el audio) y la letra, y suena un tic-tac en cada beat.
- **La cuerda:**
  - Es la llave dorada que hay arriba a la derecha.
  - Se gasta 0,006 por beat. Un PERFECT da +0,09, un GOOD +0,05 y un golpe resta −0,18.
  - Vacía, la canción va al **85 % durante 4 beats** (baja de tono y los peligros también se ralentizan, porque todo va por beats), con el aviso *"WIND ME UP!"*. Después vuelve a 0,4.
  - Se ajusta por dificultad con un bloque opcional `"spring": { "drainPerBeat", "perfect", "good", "hit", "slowRate", "slowBeats" }` en `difficulty.json`.
  - Para ralentizar la canción entera, el Conductor admite tempo variable.
- **El fantasma:** se graba la posición de Tick en cada beat. En el siguiente intento, un Tick translúcido repite el anterior. Se apaga en OPTIONS.
- **Puntos de control:** eventos `cue` en el JSON. Smokestack tiene 6, en el inicio de cada sección. Al perder: ENTER rebobina al último, S al principio. Tras 3 derrotas en el mismo sitio se ofrece **REHEARSAL**: practicar ese tramo sin poder perder hasta el siguiente punto de control, y luego *"Now for real…"*.

---

## 6. Tipos de nivel

| Tipo | Vista / cámara | Objetivo |
|------|----------------|----------|
| **Duel** | Arena fija | Bajar la vida del jefe en varias fases (cada fase con un estilo musical distinto). |
| **Chase** | *Scroll* lateral automático; el jefe persigue desde detrás | Llegar al final de la canción. |
| **Tower** | *Scroll* vertical hacia arriba; algo sube por debajo | Subir hasta la cima antes de que te alcance (en el faro: la marea). |
| **Call & Response** | Arena fija | El jefe enseña un patrón en la estrofa y en el estribillo lo repite más rápido. Variante *Mirror*: el jefe repite **lo que haces tú** un compás después (The Echo). |
| **Last Call** | *Scroll* lateral con andenes y trenes que pasan | Las oportunidades (puertas de tren abiertas, billetes dorados, escalerillas) aparecen **un solo beat**. Cada una que coges le hace daño al jefe; las que pierdes, él las guarda en su colección y no vuelven en esa partida. |
| **Lullaby** (sigilo) | Arena o *scroll* lento | Moverte solo cuando la música suena fuerte; en los silencios, quieto o el jefe despierta. |
| **Vehicle** | *Scroll* lateral de disparos (biplano, tren, bañera…) | Sobrevivir y disparar al ritmo. |
| **Vaudeville** | Escenario de teatro | El público lanza cosas y el jefe presenta números del espectáculo. |
| **Newsreel** (entre jefes) | *Scroll* lateral rápido | Noticiario: corre-y-salta corto e intenso con carteles de noticiario y narrador. |
| **Serial** (entre jefes) | Plataformas | Historia por capítulos; cada uno acaba en *"To be continued…"*. |
| **Sing-along** (entre jefes) | Plataformas relajadas | Las palabras de la letra son las plataformas y la pelotita marca dónde saltar. |
| **Memory** (entre jefes) | Plataformas tranquilas, estilo cine mudo | Un recuerdo de Elias, con intertítulos; al final, un objeto perdido. |
| **Darkroom** (cambio de época) | Plataformas | En el cuarto de revelado, el color nuevo se filtra en el mundo a tu paso. |

### 6.1 La sala central: el Bijou ✅ capítulo 1
El cine es un **mundo que se recorre**, no un menú. Tick se mueve por él con los mismos controles que en los niveles, y todo baila al compás.

**Zonas** (se abren a medida que avanza el reloj de las 11:59):

| Zona | Qué hay |
|---|---|
| **Cabina de proyección** | Donde despierta Tick. El proyector, la mesa de Elias con los objetos perdidos recuperados y la ventana de las estaciones (idea 12) |
| **Sala (patio de butacas)** | La pantalla, el escenario y las butacas que se van llenando (idea 8) |
| **Vestíbulo** | Taquilla, puesto de palomitas, carteles de *"Coming Soon"*, el reloj de pie y la caja de objetos perdidos |
| **Anfiteatro y vigas del techo** | Zonas altas a las que se llega con plataformas |
| **Sótano: archivo de bobinas** | Oscuro, quizá inundado. El cuarto de revelado (Darkroom) |
| **Tejado y marquesina** | El final: medianoche bajo las estrellas, con las letras luminosas de la marquesina |

**Cómo se entra a los niveles**
- **Los jefes (las películas principales), por la pantalla**, con un ritual:
  1. Se consigue la bobina.
  2. Tick sube a la cabina y **enhebra la película en el proyector**: un minijuego corto de ritmo, girando los rodillos a tiempo, que ya enseña el ritmo del jefe.
  3. El haz se enciende y aparece el cartel del corto.
  4. Tick corre por el pasillo, salta al escenario y se lanza dentro de la imagen.
- **Los recuerdos, por los objetos de Elias**: su abrigo en el perchero, una fotografía, la caja de objetos perdidos…
- **Algunos jefes tienen además una entrada temática**: The Echo por el espejo del vestíbulo (dentro, el reflejo no te imita del todo), Grandfather Pendulum por el reloj de pie, Mister Too-Late por la taquilla y Miss Pirouette por una caja de música de objetos perdidos.

**Qué abre el paso: los fotogramas.** Están escondidos en los niveles entre jefes. Con suficientes fotogramas se **empalma la bobina** del siguiente jefe. Guiño: el cine va a 24 fotogramas por segundo, así que juntarlos es, literalmente, recuperar segundos de tiempo.

**Un cine que cuenta el tema**
- **Luz y polvo:** al principio todo está a oscuras y polvoriento. El polvo desaparece por donde pasa Tick y las zonas se iluminan al avanzar el reloj.
- **El órgano del cine** (un órgano de teatro de los 20) toca la música de la sala. Empieza con una nota temblorosa y **gana un instrumento por cada jefe liberado**: la soledad se oye.
- **Los jefes liberados son los habitantes de la sala.** Están sentados en sus butacas, comentan, dan pistas o simplemente están. El arco de la soledad a la compañía se vive aquí.
- **La marquesina** anuncia el siguiente estreno (*"NOW SHOWING: MISTER TOO-LATE"*).

### 6.2 Entre jefes: la sesión de cine ✅ capítulo 1
En los años 30 no se iba a ver una sola película: la sesión tenía **noticiario, corto, serial, a veces un corto para cantar y la película principal**. Cada capítulo del juego es una sesión completa, así el ritmo cambia constantemente y nunca es solo "entrar, jefe, repetir".

| Pieza de la sesión | Nivel |
|---|---|
| **Newsreel** | Corre-y-salta rápido con narrador entusiasta y saltos al ritmo de una marcha |
| **The Serial** | Plataformas por capítulos que continúan de una sesión a otra, cada uno acabado en suspense. Cuenta la juventud de Elias, o a Tick persiguiendo a una bobina fugitiva |
| **Sing-along short** | Las palabras son las plataformas y la pelotita marca el salto (la idea 1 llevada a un nivel entero). Relajado |
| **The Feature** | El jefe |

**Otros niveles de plataformas**
- **Recuerdos de Elias** (Memory): tranquilos y melancólicos, estilo cine mudo (*"Spring, 1912…"*), con música instrumental y plataformas que se mueven al ritmo. Terminan en un objeto perdido (idea 13).
- **El propio edificio:** llegar a una zona nueva exige plataformas de verdad, por las vigas sobre la sala, el telar detrás de la pantalla (cuerdas y sacos de arena que caen al ritmo), los conductos del aire, el archivo inundado o la marquesina con letras de neón que se encienden en el beat.
- **El cuarto de revelado** (Darkroom): marca cada cambio de época. Luz roja, bandejas de revelador e imágenes que aparecen a tu paso, mientras el color nuevo se filtra en el mundo.
- **La bobina fugitiva:** persecución al revés por todo el cine; esta vez Tick persigue.
- **Minijuegos de la sala** (cortos y opcionales): la máquina de palomitas (cada palomita salta en el beat), la taquilla y enhebrar el proyector.

**Qué hay en el capítulo 1** (`public/data/story.json`):
- **Las cuatro piezas de la sesión:**
  - *BIJOU NEWS: The Bijou Closes Its Doors* (`newsreel-1`, con *scroll* automático y titulares que cuentan el cierre del cine).
  - *THE RUNAWAY REEL, Chapter One* (`serial-1`): persigues a una bobina con ojos por los tejados, que se escapa en un tren. Es también "la bobina fugitiva".
  - *FOLLOW THE BOUNCING BALL* (`singalong-1`): canción original en la que 17 palabras gritadas son las plataformas.
  - *A MEMORY: The Station, 1912* (`memory-1`): Elias pierde el tren de las 11:59, y su billete sin usar queda sobre la mesa de la cabina.
- **El edificio como nivel:** las vigas del techo, con tablones al ritmo, una viga móvil, sacos de arena y 3 fotogramas. Al llegar al final se suelta la escalera de cuerda, que queda como atajo.
- **Minijuegos de ritmo**, de unos 20 s cada uno:
  - **Cómo funcionan:** las notas llegan por una tira de película y **cada acierto toca la siguiente nota de una melodía**, así que una buena partida suena bien y un fallo deja un hueco. Hay combo, con un "ding" que sube de tono, y rango S/A/B/C.
  - **Palomitas** (llamada y respuesta): la máquina toca un ritmo (*LISTEN*) y tú lo repites (*YOUR TURN!*); si fallas, una palomita le da a Tick en la cabeza.
  - **Taquilla:** sellar tickets con ritmos cada vez más densos.
  - **Enhebrar el proyector:** es el ritual. Usa el tempo del jefe y hace falta el 70 %.
  - **Premio:** las palomitas y la taquilla dan 1 fotograma con rango B y 2 con rango A o más.
- **Fotogramas:** hay 28 y la bobina necesita 12.
- **Adelantos de capítulos futuros**, que se pueden mirar pero aún no se abren: el cuarto de revelado del sótano (Darkroom), el espejo del vestíbulo (The Echo), el reloj de pie (Grandfather Pendulum) y la trampilla del tejado. *El nivel Darkroom llega con el primer cambio de época (capítulo 3).* La caja de música de objetos perdidos se abre en el capítulo 2.

**Qué hay en el capítulo 2** (de momento, solo el jefe):
- **Se entra por la caja de música de objetos perdidos** (`"entry": "lostfound"` en `story.json`), que se abre en cuanto Old Smokestack tiene su final. No hace falta bobina: el empalmador y el proyector dicen que la música viene del vestíbulo, y el marcador pone *♪ THE LOST & FOUND*.
- **Su final en la sala:** la tapa se abre, Miss Pirouette sale y se queda bailando, diminuta, encima de la caja (y hace una reverencia si Tick se acerca). El órgano gana una melodía, el reloj avanza 7 segundos, la nieve se derrite y llega la primavera. Deja en la caja su objeto perdido, que va a la mesa de Elias: *A faded photograph* ("Rose, 1929. Same time tomorrow?"). La marquesina anuncia a Mister Too-Late.
- **Después:** la caja ofrece otro baile, y el duelo aparece en el programa.
- **Falta:** las piezas de la sesión del capítulo 2 (noticiario, serial, canción y recuerdo).

**Un capítulo tipo**
1. **Recorrido** por el edificio hasta la zona nueva.
2. **Intermedio:** noticiario, capítulo del serial o corto para cantar. Se ganan fotogramas.
3. **Recuerdo de Elias** (opcional): la historia y un objeto perdido.
4. **Bobina:** se empalma, se enhebra el proyector y Tick salta a la pantalla.
5. **El jefe** y su final.
6. **De vuelta en la sala:** el jefe se sienta en su butaca, el órgano gana un instrumento, la aguja avanza y la estación cambia por la ventana.

### 6.3 Guardar, volver y empezar rápido ✅
**Principio:** nunca hay que repetir lo que ya has hecho para volver a lo que estabas haciendo. **Objetivo:** desde que abres el juego hasta que estás jugando lo que dejaste, menos de 10 segundos.

**Guardado automático**
- Se guarda al terminar cada nivel, al entrar en cada zona de la sala y al coger cada coleccionable.
- Hay **3 partidas**, presentadas como 3 latas de película (*Reel A, B y C*).
- Las opciones y la calibración van aparte: son del ordenador, no de la partida.

**Pantalla de título**
- **CONTINUE** (por defecto): vuelve exactamente a donde estabas. Si cerraste a mitad de un nivel, pregunta *"Resume FULL STEAM AHEAD?"* y empieza en su último punto de control.
- **NEW GAME**.
- **PROGRAMME:** el programa de mano del cine, que hace de **selector de niveles**. Contiene todo lo desbloqueado (jefes, noticiarios, capítulos del serial, cortos para cantar y recuerdos), con el mejor rango y los fotogramas encontrados en cada uno. Elegir algo **lleva directo al nivel**, sin recorrido ni ritual. También se abre desde la pausa en la sala.
- **CALIBRATE** y **OPTIONS**.

**Al perder**
- **Nunca te devuelve a la sala.** Se rebobina y reintentas al instante, como ahora.
- **Puntos de control:**
  - en los duelos, uno por fase (cada vuelta de llave, cada vuelta del reloj de arena…);
  - en los niveles largos, **marcas de cambio de bobina**: los circulitos que aparecían en la esquina de los fotogramas antiguos para avisar al proyeccionista. Son el punto de control.
- **Ensayo:** tras 3 derrotas en el mismo sitio, se ofrece *"Rehearsal"*, practicar desde esa sección sin penalización (lo que ahora hace `?beat=`).

**Lo largo solo una vez**
- **Ritual del proyector:** completo la primera vez. Después, el proyector se queda enhebrado y Tick salta directamente.
- **Escenas:** toda escena o ritual ya visto se salta **manteniendo pulsado** un botón, para no saltarlo sin querer.
- **Atajos en el edificio:** cada recorrido abre un atajo al completarlo (una cuerda que cae, el montaplatos del servicio, una escalera). Se recorre una vez.
- **Rejugar a un jefe sin menús:** se habla con él en su butaca para volver a jugar su película (y su encore, cuando se desbloquee).

**Si vuelves después de un tiempo**
- Si han pasado varios días, un intertítulo de cine mudo resume dónde estabas: *"Previously at the Bijou…"*.
- El siguiente capítulo del serial empieza con *"Previously…"*.

**Técnica**
- **Rendimiento:**
  - El decorado fijo (paredes, muebles, butacas, mapas de los niveles, horizontes) se dibuja una vez y se "hornea" en texturas (`src/fx/bake.ts`). El polvo solo se redibuja cuando cambia, y en los niveles solo se dibuja lo que está en pantalla.
  - La física de Tick se divide en pasos pequeños cuando el ordenador va lento, así que nunca va a cámara lenta.
- La partida se guarda en el navegador (`localStorage`, clave `timesend.save.<A|B|C>.v1`), con número de versión para poder migrarla y siempre con try/catch, igual que la calibración.
- Contiene:
  - el progreso del reloj;
  - los niveles completados y su mejor rango;
  - los fotogramas, objetos perdidos, atajos y bobinas enhebradas;
  - la zona y el punto de la sala donde estabas;
  - el nivel y el punto de control si cerraste a mitad.
- Más adelante: exportar e importar la partida como código de texto para pasarla a otro ordenador.


---

## 7. Jefes

Cada jefe encarna **una cara del tiempo o de la soledad**, tiene una mecánica que la cuenta y canta sobre ella con una canción animada y una letra con fondo triste. Vencerlo es darle su final (§3).

| # | Jefe | Tema | Tipo de nivel | Época / paleta | Estilo musical |
|---|------|------|---------------|----------------|----------------|
| 1 | **Old Smokestack** | Las despedidas | Chase | 1928 B/N | Ragtime / swing de tren |
| 2 | **Miss Pirouette** | La soledad | Duel | 1928 B/N | Vals de caja de música → minueto → vals frenético |
| 3 | **Mister Too-Late** | Las oportunidades perdidas | Last Call | 1930 sepia | Blues lento de andén → ragtime con prisa |
| 4 | **Grandfather Pendulum** | Envejecer | Duel con plataformas | 1930 sepia | Marcha solemne que se va ralentizando |
| 5 | **The Hourglass Sisters** | Estar separados | Duel (la gravedad se invierte) | 1932 Technicolor de dos tonos | Dueto de *close harmony* (estilo hermanas de los 30) |
| 6 | **The Lighthouse Keeper** | Esperar a alguien | Tower | 1932 Technicolor de dos tonos | Saloma marinera / vals de acordeón |
| 7 | **The Echo** | La soledad con uno mismo | Call & Response (*Mirror*) | 1935 todo color | Swing a dos voces (Tick y su sombra) |
| 8 | **Maestro Baton / The Last Reel** | El fin del tiempo | Chase → Duel → nivel en silencio | 1935 todo color | Big band / popurrí de todos los jefes |
| extra | **Lady Lullamoon** | El insomnio, la noche sola | Lullaby | 1932 | Nana / vals |
| extra | **Sir Tear-Off** | Los días que pasan | Chase | 1930 | Cambia de estilo con cada estación |

**1. Old Smokestack (las despedidas).** El último tren, el que se lleva a la gente que no vuelve. La persecución ya existe; solo se le añade este trasfondo. Es el mismo tren que perdió Mister Too-Late. *Momento estrella:* el puente roto, el tren que nunca llega.

**2. Miss Pirouette (la soledad)** — *sustituye a Madame Gramola.* ✅ ficha aprobada · en construcción
- **Concepto:** una bailarina diminuta de porcelana dentro de una caja de música. Lleva cincuenta años bailando la misma melodía, sola, esperando que alguien abra la tapa.
  - **Silueta:** cara de porcelana con una grieta, moño alto con tiara, corpiño con cordones, tutú de campana, brazos de manguera en quinta posición, zapatillas de punta y una llave de corazón clavada en la espalda.
  - **Carácter:** una diva orgullosa y frágil que finge no necesitar a nadie. Se burla con desdén elegante y, cuando vas bien, se pone nerviosa y se le escapa un paso.
  - Se llega por la caja de música de objetos perdidos del Bijou.
- **Nivel Duel dentro de la caja de música** (arena fija):
  - **Escenario:** suelo de terciopelo con la plataforma giratoria en el centro, el cilindro de púas y el peine de metal al fondo, el espejo de la tapa arriba y compartimentos de terciopelo como plataformas. La luz entra por la tapa.
  - **Daño:** Tick no dispara. Le devuelve sus notas a tiempo (parry en el beat) y cada una le quita cuerda (PERFECT 0,048 · 0,058 · 0,051 por vuelta; GOOD 0,032 · 0,038 · 0,034: un 60 % más que antes, que tenía demasiada vida). Su vida es la llave de su espalda, que gira hacia atrás.
  - **Ritmo:** la música va en 3/4 y los peligros caen en el "UN-dos-tres".
- **Tres fases, tres vueltas de llave**, cada una más rápida:
  1. **Vals de caja de música:** notas, el giro del tutú y su reflejo. A mitad de fase la tapa se cierra y llega un solo de silencio a oscuras.
  2. **Minueto:** la plataforma gira y bailan en pareja (llamada y respuesta: ella marca 3 pasos y Tick los repite).
  3. **Vals frenético:** todo a la vez y su reflejo sale del espejo.

  Entre fases ella misma se da cuerda ("Click! Click! Wind me up again!") y el tempo sube. Si no le has quitado bastante cuerda, la sección se repite.
- **Momento estrella y final:** se le acaba la cuerda, la melodía se frena hasta pararse y, por primera vez, alguien la está mirando. Hace una reverencia ante Tick.
- **Eventos aprobados:** notas del peine, giro del tutú, fouettés, el espejo, la tapa que se cierra, las púas del cilindro, polillas, los ramos del público que nunca vino, el minueto en pareja, los cojines de terciopelo y un objeto perdido de Elias como recompensa.
- **Canción** (hecha con Suno): *Mirror on the Lid*, vals en 3/4 (unas 187 negras por minuto, el mismo tempo toda la canción) de 4:30 con soprano de opereta de los años 20 y caja de música, pensada para la batalla: tres vueltas de cinco estrofas, cada una seguida de unos compases instrumentales. La letra anuncia cada ataque. El original está en `art/pirouette/song-source.mp3` y su instrumental separado en `art/pirouette/song-instrumental.mp3`; la letra en `public/audio/pirouette/lyrics.txt`; el estilo y la letra para Suno en `art/pirouette/SUNO.md`; cómo se prepara para el juego en [tools/duel-song](tools/duel-song/README.md).
- **Personaje:** hoja de piezas generada con Magnific, versión D (más caricaturizada, estilo 1930): `art/pirouette/01.jpg`, recortada en blanco y negro con `npm run art -- pirouette` (piezas `pirBody`, `pirTiara`, `pirKey`, tres guantes y `pirShoe`, con sus puntos de anclaje en `art/pirouette/textures.json`).
  - **Marioneta propia** (`src/entities/Pirouette.ts`), distinta de la del tren: de frente, sobre las puntas.
    - **Siempre de frente, giros "de papel":** la cabeza no gira sobre su eje (una cara que se deslizaba por la cabeza mientras el pelo se quedaba quieto quedaba rarísimo). En las piruetas y los fouettés, todo el dibujo se estrecha hasta ser una línea y se abre al revés, una y otra vez, como en los dibujos de los 30, con líneas de giro blancas alrededor del tutú. Manos y pies tienen profundidad solo para saber si van delante o detrás de ella.
    - **Las manos, del lado correcto:** el guante dibujado es una mano derecha vista desde la palma (pulgar a su derecha). Su mano derecha (a la izquierda de la pantalla) lo usa tal cual y la izquierda, en espejo; vista de espaldas, al revés. Con los brazos en alto el pulgar queda hacia dentro; con los brazos caídos, hacia fuera.
    - **Brazos y piernas de manguera** con los guantes y las zapatillas de punta dibujados. En quinta posición (la pose de caja de música) los codos se abren y los brazos rodean la cabeza, sin cruzarle la cara. Muelles hacia cada pose, en pasos pequeños para que nunca se descontrolen.
    - **Poses:** caja de música (girando despacio con los brazos en quinta), cantando, pirueta, fouettés, arabesque (de perfil), lanzar una nota (con la mano del lado de Tick), darse cuerda, risita, perder el equilibrio, reverencia, se le acaba la cuerda y la última reverencia.
    - **Vals:** se eleva en el primer tiempo de cada compás de 3.
    - **La llave de corazón** sobresale de su espalda y gira sobre su eje: deprisa al darse cuerda, despacio hacia atrás mientras baila, y quieta cuando se acaba.
    - **La cara:** el mismo sistema de expresiones que el tren, con pestañas, labios pintados y colorete, y expresiones propias: altiva, coqueta, ofendida, risita, diva y tierna.
  - Se ve en el visor de personajes (`?puppet=pirouette`, o desde el escenario de pruebas → Puppet viewer, ← →).
- **El escenario: el interior de la caja de música** (`src/world/MusicBox.ts`). Fondo y piezas generados con Magnific y pasados a blanco y negro (`art/pirouette/02.jpg`, el fondo, tipo `"picture"`; `03.jpg`, las piezas):
  - **Fondo fijo de 1280×720:** pared del fondo de terciopelo capitoné, alas laterales curvas, el mecanismo (cilindro y peine) al pie de la pared, telarañas y la tapa abierta arriba con un espejo ovalado.
  - **Encima, lo que se mueve:**
    - la plataforma giratoria donde baila (unas tachuelas de latón dan la vuelta al borde cuando gira);
    - dos cojines de terciopelo que son plataformas para Tick y pueden subir sobre un muelle enorme;
    - el haz de luz que entra por la tapa, con polvo flotando que brilla al ritmo (`lid` lo apaga);
    - chispas en los dientes del peine cuando suena una nota;
    - **su reflejo** en el óvalo de la tapa, pequeño y desvaído. El espejo está detrás de ella, así que muestra **su espalda**: pelo, moño, la llave y la espalda del corpiño, con las manos en el mismo lado de la pantalla que ella y vistas por el dorso.
  - **Piezas para los eventos,** ya recortadas: la nota de latón (el proyectil), la polilla y el ramo de rosas.
  - **Vista previa** para pasear por la caja con Tick (← → Z): `?stage=pirouette`, o en el escenario de pruebas → *Miss Pirouette: the music box* (`src/scenes/MusicBoxScene.ts`). Ella va haciendo su repertorio y lanza una nota de vez en cuando; no hay combate.
- **El duelo** (`src/scenes/DuelScene.ts`, datos en `public/data/levels/pirouette.json`): en el juego, por la caja de objetos perdidos del Bijou (capítulo 2); para probar, `?duel=pirouette` o el escenario de pruebas → *THE LAST PIROUETTE*.
  - **Su vida es su cuerda:** la barra de arriba, con una llave por cada vuelta que le queda.
  - **La canción se adapta a lo que dure el combate (estrofas y estribillos).** Cada vuelta tiene cinco estrofas (`sections`), cada una con su nombre (aparece bajo la barra) y su tonalidad.
    - **Cada estrofa suena entera una vez** (beats 0 … `beats`), tal cual en la canción, con los ataques que anuncia su letra.
    - **Después, su estribillo instrumental** (los últimos 8 compases, `loopFrom` … final; 4 en las estrofas cortas) se repite, sin la voz y en espejo la primera vez y una sí y otra no (izquierda y derecha cambiadas), mientras su cuerda siga por encima del umbral de la estrofa (`until`; por defecto repartido: 0,8, 0,6, 0,4, 0,2 y 0). En cuanto baja, al acabar ese estribillo entra la siguiente estrofa cantada.
    - Así **la letra nunca se desincroniza**, dure el combate 1 minuto o 20: cada verso suena cuando pasa lo que anuncia. Quien juega muy bien oye la canción de corrido; quien se atasca oye el estribillo, como un disco rayado de caja de música, y practica justo el ataque que la letra acaba de anunciar.
    - **La canción grabada** (`audio` de cada vuelta en el JSON): `p1.mp3`, `p2.mp3` y `p3.mp3` en `public/audio/pirouette/` tienen las estrofas seguidas (el beat 0 de la vuelta cae en el segundo `at`), y `p1-loop.mp3`… la misma música sin la voz, separada con un modelo (UVR MDX-Net), para los estribillos. Cada trozo se programa con Web Audio en el beat exacto, con 6 ms de fundido en cada empalme. `loopAt` toma el estribillo de otros compases de la misma melodía cuando empalman mejor con la vuelta a la canción (medido por armonía).
    - **Siempre a tempo con la música:** el tempo de Suno se mueve un poco (hasta un tiempo de desfase al final de una vuelta con un tempo fijo). Por eso cada estrofa se corta en los tiempos fuertes reales de la canción (detectados con librosa, `tools/duel-song/track.py` y `fit.py`) y cada trozo se reproduce ajustado a sus beats (`audio.sung` y `audio.loop` de cada estrofa, en segundos; casi siempre menos de un 1 % más rápido o más lento). Un beat del juego son dos negras, así que el tiempo fuerte de cada compás cae cada 1,5 beats: **las notas y los golpes caen en el tiempo fuerte** (y, si no cabe, en la negra libre más cercana), y el minueto da un paso por compás (`every: 1.5`).
    - **Más rápida en cada vuelta sin cambiar el tono:** la segunda vuelta va al 110 % y la tercera al 125 % (estiradas con Rubber Band): 93,6 → 103,4 → 117,1 bpm del juego (un beat del juego son dos negras del vals).
    - **La música nunca se para entre vueltas:** al vaciarse la cuerda (salvo en la última), la canción sigue hasta el siguiente beat y ahí entra la vuelta siguiente con su "Click! Click! Wind me up again!" (un fundido de 0,2 s). Solo al final del duelo se frena como una caja de música sin cuerda. Bajo la tapa cerrada (hush) suena algo apagada, pero no baja casi de volumen.
    - **Volumen:** la canción suena un 25 % más fuerte y los efectos a un cuarto mientras dura el duelo (se restauran al salir).
    - **El principio y el final:** antes de la primera vuelta suena su entrada hablada ("Oh! The lid... the light... a visitor? How rude!"). Cada vuelta nueva empieza con su "Click! Click! Wind me up again!". Al ganar, la música se frena y se apaga como una caja de música sin cuerda y canta su despedida ("I'm... winding... down... Thank you.") antes de hablar. Bajo la tapa cerrada (hush) la canción suena apagada.
    - **Sin los archivos** (o si no cargan) suena el vals de caja de música generado por código, con las mismas estrofas y estribillos.
    - **La letra en pantalla**, como en el tren: la línea que canta, con la pelotita saltando de palabra en palabra y las palabras gritadas más grandes (`lyrics` de cada estrofa, en beats desde su inicio, alineadas con la voz por Whisper: `tools/duel-song/lyrics.py`). Sus labios siguen las palabras. En un estribillo (sin voz) sale en su lugar *♫ REFRAIN ♫ send her notes back (C) to wind her down to the notch: then the song goes on*.
    - **La canción nunca se corta a medias:** dentro de una estrofa su cuerda no baja más que el umbral de esa estrofa (una muesca en la barra marca dónde se para); solo en la última puede llegar a 0. Antes, quien le quitaba cuerda muy deprisa acababa la vuelta en mitad de una estrofa y la música se frenaba de golpe.
    - **El comprobador** da error si un estribillo no tiene nada que devolver (se repetiría para siempre: pasaba en "Fifty years of dust and moths") y avisa si quita menos de 0,08 por vuelta.
    - **El comprobador** exige que un estribillo siga siendo justo cuando vuelve: por ejemplo, si baja los cojines, tiene que volver a subirlos antes del siguiente barrido de tul.
  - **Las notas (parry):** notitas vivas dibujadas a tinta (negras con borde blanco, con ojos de porción de tarta y una sonrisa; la dorada, blanca), que salen de su mano, del peine o de su reflejo y vuelan 2 beats en arco con un halo blanco, cabeceando hacia donde van y estirándose en cada beat (sin girar sobre sí mismas). Apuntan al sitio donde Tick pisa (no al Tick que salta, para que no le sigan por el aire); un anillo se cierra y le alcanza justo en el beat, y suena un "tic" un beat antes.
    - **C en ese momento:** la nota vuelve a su cabeza y le quita cuerda, con chispas y una micro-pausa al acertar.
    - **Ventanas:** PERFECT (±58 ms), GOOD (±105 ms) y OK (±152 ms, la mitad de daño) en normal.
    - **Alcance:** vale si la nota está a menos de 150 px del cuerpo de Tick, donde está en ese momento o donde va a caer.
    - **Recuperación:** tras devolver una nota, 0,1 s. Pulsar un poco pronto para una nota que ya viene (hasta 0,26 s antes de su ventana) no castiga: sale "early" y se puede volver a pulsar. Golpear al aire ("MISS") cuesta el combo y 0,25 s. Machacar C (3 golpes al aire en 1,5 s) le marea 0,9 s ("DIZZY!").
    - **Cuándo hace daño:** se decide justo en el beat en que llega, según si toca el cuerpo de Tick en ese instante (lo que ve el jugador). Después se queda brillando el resto de la ventana por si aún la devuelves.
    - **Notas doradas** (`"gold": true`), con una estrella blanca girando alrededor: devueltas con GOOD o mejor, Tick recupera un golpe (o, si no le habían dado, hacen el doble de daño). Hay dos por vuelta, siempre en la parte cantada (nunca en un estribillo, para que atascarse no dé más curas).
    - **Notas altas** (`high`), con una línea de puntos y una flecha: pasan 190 px por encima del suelo. Solo se devuelven desde un cojín o en el aire; si se escapan, ella recupera un poco de cuerda.
    - **Apartarse en el último medio beat:** la nota se rompe en el suelo, pero ella recoge la melodía y recupera un poco de cuerda. No se le puede ganar esquivando.
  - **Los ataques:**
    - **Tocarla hace daño** (el tutú y las piernas; por encima de su cabeza se puede pasar).
    - **bourree (la caza):** avanza saltando de puntillas hacia Tick, un salto de hasta 100 px en la primera mitad de cada beat (`count` saltos), con flechas en el suelo que marcan hacia dónde va. Va más rápido que Tick: hay que saltar por encima de ella justo cuando aterriza (la voltereta ayuda) o subirse donde no llegue.
    - **twirl:** su tutú barre el suelo en el beat; hay que estar en el aire o en un cojín.
    - **sweep:** el tul cubre todo el suelo durante varios beats (cada beat hace daño). La única salida es subirse a un cojín, que antes ha subido sobre su muelle.
    - **dash:** cruza el suelo girando en 2 beats; hay que saltarla. Solo hace daño hacia delante (no a quien queda detrás al arrancar), nunca termina junto a un cojín y, si fuera a pararse encima de Tick, se para antes.
    - **pins (el cilindro):** el cilindro de latón de la caja, con todas sus púas, se suelta y cruza el suelo rodando a botes de pared a pared en 4 beats: aterriza en cada beat con un *THUMP!*, polvo y la pantalla temblando. La pantalla tiembla poco (no molesta). Antes traquetea en su pared y unas flechas en el suelo marcan por dónde vendrá. Hay que saltarlo (o estar en un cojín subido o en la plataforma giratoria). Sustituye a la ola de púas, que no se entendía como ataque.
    - **kicks:** fouettés; en cada beat su pierna barre el suelo a 300 px a su alrededor.
    - **moths:** polillas que salen de la tapa, una por beat; se espantan con C (cada una le quita un poco de cuerda: salen de sus costuras) o se esquivan.
    - **bouquets:** ramos que caen donde está Tick (apuntan un beat antes); hay que apartarse.
    - **minuet:** llamada y respuesta. Ella baila tres pasos (C, C, Z: teclas dibujadas junto a su cabeza, con "HER STEPS" y "step / step / turn" debajo, que se encienden en su beat) y después Tick los repite sobre su cabeza ("YOU!"), con un anillo que se cierra sobre la tecla que toca. Arriba lo explica: *MINUET! watch her three steps... then copy them* y *YOUR TURN! copy her steps on the beat: C C Z (jump)*. Cada paso a tiempo le quita tanta cuerda como una nota devuelta, y los tres seguidos dan un extra (*BRAVO!*); un paso que se escapa avisa al momento (*missed C!*). Mientras dura (de un beat antes de su primer paso al último de Tick) no hay ningún otro ataque: antes una nota o un giro caían justo en un paso y era imposible hacerlo bien. `every` separa los pasos (por defecto 1 beat; 2 para seguir el "STEP and STEP and TURN! Now you!" de la canción).
    - **move:** un grand jeté a otro sitio del escenario; nunca aterriza a menos de 240 px de Tick.
    - **hush:** la tapa se cierra y todo queda a oscuras.
    - **cushions:** los cojines suben o bajan sobre sus muelles.
    - **mirror:** su reflejo es **de cristal**: brillos que le pasan por encima en vez del óvalo de antes. Cada nota suya que le devuelves lo **agrieta** (*CRACK!*), y arriba se cuentan las grietas (0/3). A la tercera **se hace añicos** (*SHATTERED!*, cristales volando): un golpe grande a su cuerda, una frase suya ("My mirror! You BROKE my mirror!") y el espejo de la tapa queda roto, con sus grietas, hasta la siguiente vuelta: ya no saca su reflejo y sus notas "del espejo" salen del peine.
      Antes: su reflejo sale del espejo de la tapa (`"out": true`) o vuelve a él (`"out": false`). Sale de espaldas, como se ve en el espejo, se desliza por la tapa, se da la vuelta a medio camino (un giro de papel) y baja flotando hasta el suelo, al otro lado del escenario. Fuera del espejo es una bailarina normal (no invertida), semitransparente y rodeada por un marco ovalado de espejo para distinguirla de la de verdad. Allí hace lo mismo que ella: gira el tutú a la vez y lanza las notas "del espejo" desde su mano, y esas notas vuelven a él. Sale en la tercera vuelta y vuelve al cristal cuando se cierra la tapa.
  - **Qué vale como "abajo":** el giro del tutú, el barrido, el giro por el suelo y los fouettés alcanzan el suelo, la plataforma giratoria y los cojines bajados; solo libran un cojín subido o el aire. Las púas solo están en el suelo.
  - **La plataforma giratoria** es otra plataforma: Tick puede subirse. Cuando gira, lo arrastra (el borde de delante va de derecha a izquierda): despacio cuando ella baila encima y durante el minueto, y muy deprisa en una pirueta, que lo tira abajo.
    - **Paso a dos:** si Tick baila el minueto a su lado encima de la plataforma, cada paso le quita más cuerda (PAS DE DEUX!). La primera vez sale un aviso arriba.
  - **Sus frases:** una tarjeta sobre su cabeza, con los labios moviéndose. Se burla cuando le das o cuando golpeas al aire, se pone nerviosa cuando le devuelves notas o le queda poca cuerda, presenta cada vuelta de llave, habla al sacar o guardar su reflejo, se sorprende con el primer paso a dos y, al final, dice "...You stayed." y "Nobody ever stayed to watch before." Las frases están en `LINES`, en `DuelScene.ts`.
  - **Los cojines:** la plataforma no se mueve bajo los pies (solo el dibujo baila) y, si sube o baja, lleva a Tick encima. Son necesarios para los barridos y las notas altas.
  - **Rendimiento:** las mangueras (brazos y piernas) se dibujan como un trazo continuo con tapas redondas, y los contornos sin un círculo en cada vértice (`src/rig/Ink.ts`). Antes cada brazo estampaba cientos de círculos en cada fotograma y el duelo, con la bailarina y su reflejo, bajaba a unos 5 fps.
  - **Dash de Tick (SHIFT):** un impulso rápido con estela, uno en el suelo y uno por salto en el aire, con invulnerabilidad mientras dura (170 ms) y 0,45 s de recarga.
  - **Tarjetas la primera vez:** la primera vez que aparece algo nuevo (las notas, la nota dorada, la nota alta, el barrido, el minueto, las polillas, el reflejo), el juego y la canción se paran (el AudioContext se suspende, y con él el reloj del duelo) y sale una tarjeta que lo explica; se sigue con Z o ENTER (tras 0,6 s, para que no se salte sin leer). Se guardan en `localStorage` (`timesend.duelTips`): no vuelven a salir. Los pilotos automáticos las tienen ya leídas.
  - **Indicaciones:** las teclas salen abajo al principio y tras caer. Arriba se explica lo que toca (el minueto, el reflejo que sale del espejo: *it throws notes too: send them back (C) to it*).
  - **Voltereta de Tick:** en el duelo (y en la vista previa de la caja) el segundo salto en el aire es una voltereta hacia delante, como las de los dibujos: se encoge abrazándose las rodillas (puños en las espinillas y ojos apretados), da una vuelta entera hecho una bola, rápido en el centro de la vuelta y con una estela, y se abre estirando las piernas para aterrizar. Sube un poco, cae más despacio y dura más en el aire. Durante la voltereta también se pueden devolver notas. Se dibuja a 24 fotogramas por segundo.
  - **Vidas:** 3 en normal y 2 en difícil (`duelLives` en `difficulty.json`), cada una con 3 golpes.
    - Perder una vida repite la vuelta de llave en la que estabas (*WIND IT BACK!*); perder la última reinicia el duelo desde la primera vuelta, con todas las vidas.
    - Las vidas que quedan se ven como relojitos junto a la barra, y la tarjeta muestra cuánta cuerda le quitaste en total.
    - Las únicas curas son las notas doradas (al empezar una vuelta ya no se recupera un golpe).
  - **Coreografías densas:** cada sección superpone ataques (girar y devolver en el mismo beat, notas mientras barre el suelo, la caza con notas volando, ella y su reflejo lanzando a la vez); cada vuelta es más densa y rápida que la anterior.
  - **Fases = vueltas de la llave:** cuando se acaba la cuerda, se da cuerda ("Click! Click! Wind me up again!") y el vals acelera: 93,6 → 103,4 → 117,1 bpm.
  - **Final:** la melodía se frena hasta pararse, ella hace la última reverencia y habla, y sale la tarjeta *THAT'S ALL, FOLKS!* con el rango (S sin golpes y un combo de 15 o más; A sin golpes; B con un golpe; C el resto, o si repetiste alguna vuelta), los golpes, las notas devueltas, el mejor combo y el objeto encontrado. ENTER vuelve al Bijou (o al escenario de pruebas). Si pierdes, "THE END?" y ENTER repite la vuelta. Esc dos veces sale de la caja. F2 quita y pone las vidas.
  - **Guardado:** al ganar se apunta el nivel con su rango, ella queda liberada (cuenta para el reloj y el órgano) y su objeto perdido va a la partida. Al entrar se guarda por dónde ibas, así que CONTINUAR vuelve a la caja.
  - **Probado** con los pilotos automáticos de `tools/playtest/duel.cjs` (§11.8), tras hacerla implacable:
    - **torpe** (±70 ms, 15 % de fallos): muere en la primera vuelta, con un 7 % y un 15 % del combate hecho (2 semillas);
    - **humano** (±35 ms, 5 %): muere en la segunda vuelta (47 %) y en la tercera (72 %);
    - **perfecto:** pasa la primera y la segunda vuelta sin golpes. La tercera, jugada sola, la gana con 2 golpes de la caza: el piloto aún salta tarde por encima de ella.
    - También el recorrido completo desde el Bijou: abrir la caja, el duelo, la tarjeta final, el final en la sala y el guardado.

**3. Mister Too-Late (las oportunidades perdidas).**
- **Concepto:** un reloj de estación con gorra de jefe de estación y farol, que va siempre **un minuto tarde** (sus agujas están atascadas un minuto por detrás). Hace décadas dudó en el andén y perdió el tren: el tren que se llevaba a alguien, o su gran oportunidad. Desde entonces vive en el andén vacío y colecciona oportunidades perdidas en tarros: billetes sin usar, cartas sin abrir, anillos que nunca entregó. Ahora se asegura de que todo el mundo pierda el suyo.
- **Mecánica (nivel *Last Call*):** las oportunidades aparecen un solo beat, exactamente en el beat (una puerta de vagón que se abre, un billete dorado que vuela, una escalerilla). Cogerlas le hace daño. Las que pierdes, él las mete en un tarro y **no vuelven en esa partida**, así que el final es más difícil cuantas más pierdes. La letra anuncia cada oportunidad (*"Last call for…"*), pero solo una vez.
- **Momento estrella:** llega el último tren de la noche. Él vuelve a dudar, y esta vez Tick tiene que saltar con él al vagón en el beat exacto. Si lo consigue, Mister Too-Late por fin sube y se va: su final.

**4. Grandfather Pendulum (envejecer).** Un reloj de pie, viejo y cansado: el abuelo de Tick. Su canción **se ralentiza** a lo largo del combate, un reto real de ritmo cambiante. Ataca con campanadas que caen en las horas. *Momento estrella:* da las doce: doce campanadas, doce peligros.

**5. The Hourglass Sisters (estar separados).** Dos hermanas encerradas en un reloj de arena, una arriba y otra abajo: nunca coinciden en la misma mitad. En cada fase el reloj **se da la vuelta** y la gravedad se invierte. *Momento estrella:* la arena se detiene y por fin se encuentran en el centro.

**6. The Lighthouse Keeper (esperar a alguien).** Un farero que lleva años esperando un barco que no vuelve. Nivel Tower: se sube el faro mientras **la marea** (otra forma de tiempo) sube por debajo, y la luz barre la pantalla al ritmo. *Momento estrella:* enciende el faro y, a lo lejos, una vela responde. Recoge la idea de Captain Squidwhisker (Tower en el mar).

**7. The Echo (la soledad con uno mismo).** La sombra de Tick, que **repite lo que haces un compás después**. Si dudas, ella duda. *Momento estrella:* dejáis de imitaros y bailáis juntos.

**8. Maestro Baton / The Last Reel (el fin del tiempo).** El director que quiere bajar el telón del cine para siempre. Popurrí de todas las canciones, y cada jefe al que diste su final vuelve a tocar su parte contigo. Termina con el nivel en silencio de medianoche (idea 14).

**Extras (encore o contenido adicional).** **Lady Lullamoon**: la luna con insomnio, nivel de sigilo; se duerme por fin y amanece. **Sir Tear-Off**: un calendario de pared frenético al que se le arrancan las hojas; persecución en la que cada hoja es un peligro y las estaciones (y el estilo musical) cambian a mitad de la canción.

*Conceptos anteriores aparcados* (podrían volver si encajan con el tema): Madame Gramola (descartada), Baron Bonejangle (esqueleto con costillar-xilófono), Captain Squidwhisker (integrado en el farero) y Mister Thunderhead (nube con chistera, nivel Vehicle).

**Reglas de diseño de jefes:**
- **Implacables** (pilar 3): *souls-like* + Cuphead + Billie Bust Up. El listón, medido con los pilotos automáticos (§11.8):
  - el juego perfecto gana sin recibir golpes;
  - el juego torpe (±70 ms, 15 % de reacciones perdidas) pierde, normalmente antes de la última fase;
  - un buen jugador que lo prueba por primera vez (±35 ms, 5 %) suele perder y aprende los patrones.
  - Cada fase es más densa que la anterior: más ataques por compás y ataques superpuestos (saltar y devolver en el mismo beat, notas mientras el suelo está cubierto, una persecución con notas volando).
- Cada jefe tiene un **momento estrella** (un gag visual grande sincronizado con el clímax de la canción) que también es **su final** (§3).
- Cada jefe encarna una cara del tiempo o de la soledad, y su mecánica la cuenta.
- Cada jefe tiene un rasgo de silueta reconocible al instante (nada de "mancha negra con ojos": siluetas variadas).
- Cada jefe tiene unas **líneas alternativas** de burla (cuando fallas) y de nervios (cuando vas bien).

### Cómo se crea un jefe nuevo
Cada jefe es **su propio nivel**, con su tipo de juego (Duel, Tower, Last Call…), su mundo, su cuerpo y sus eventos. Nada visible se copia del tren. Lo único compartido es el motor invisible: tempo y sincronía con la letra, cara y marioneta, peligros anclados a palabras, comprobador de justicia, marcas de ensayo y escenario de pruebas.

Cuando se pide "crea el jefe X":
1. **Ficha del jefe** (Claude): parte de esta sección. Se escriben la mecánica concreta, el momento estrella, los escenarios por partes de la canción y una lluvia de ideas de eventos ligados a su letra y a su mundo. Se aprueba antes de construir.
2. **Lo que se pide al autor**, con los prompts ya escritos y adaptados al jefe:
   - la hoja de piezas del personaje, según su cuerpo (ruedas, piernas, tutú, peana, cuerpo flotante…);
   - las hojas de piezas de su decorado, una por escenario;
   - los objetos propios de sus eventos;
   - la canción y su letra. Si hace falta, Claude escribe la letra para que anuncie los eventos y prepara el prompt para la IA de música.
3. **Lo que construye Claude:**
   - el tipo de nivel, si es la primera vez que se usa;
   - la marioneta con su cuerpo y sus gestos propios;
   - los escenarios;
   - los eventos;
   - la sincronía con la canción;
   - la comprobación.
4. **Revisión:** hojas de fotogramas antes de dar cada paso, y la versión jugable en el enlace de pruebas.

| Tipo de nivel | Estado |
|---|---|
| Chase | ✅ (Old Smokestack) |
| Duel | ✅ Miss Pirouette (`src/scenes/DuelScene.ts`), jugable desde el Bijou, con su canción de Suno adaptada a lo que dure el combate |
| Last Call, Tower, Call & Response, Lullaby, Vaudeville | por construir, con su primer jefe |

### Demo (alcance)
- **Primero solo el Jefe 1, Old Smokestack (Chase)**, hasta pulirlo. Después, Miss Pirouette (Duel) y el resto.
- Pantalla de título, carteles de título, *game over* con quemado de película y rebobinado, y pantalla de victoria con rango.
- Más adelante: mapa del cine con las bobinas y un editor de ritmo (ver §10).

### Old Smokestack: estado actual ✅
- Locomotora dibujada por código: cara con ojos de porción de tarta, bigote de morsa, chimenea con forma de chistera, ruedas con bielas, quitapiedras y un brazo de manguera con guante.
- **Cuerpo de goma** (deformación global del dibujo, `Ink.warp`):
  - La caldera respira en cada beat y el cuerpo ondula mientras canta.
  - Se inclina con un muelle: se echa atrás para coger impulso, se lanza al embestir y se balancea al frenar.
  - La chimenea-chistera se estira al echar humo o toser.
- **Mecánica viva:**
  - Rebote de "chugga" en cada corchea.
  - Pistón con biela de manguera y chorros de vapor del cilindro.
  - Campana que se balancea al ritmo.
  - Silbato que se estira y suelta vapor en cada TOOT!
  - Chispas en las ruedas al embestir.
- **Expresión:**
  - Los ojos siguen a Tick.
  - Las cejas pasan de enfadadas a preocupadas.
  - Bocas anchas o redondas según la sílaba, una "O" enorme y bocanadas de humo al gritar.
  - Un bigote que se levanta, gotas de sudor y un quitapiedras que castañetea de nervios.
- **Reacciones:**
  - Se ríe a carcajadas (ojos cerrados y palmadas en la caldera) cuando Tick recibe un golpe.
  - Tose al lanzar carbón o anillos de humo.
  - Señala al cielo antes de que caiga algo.
  - Dirige la banda con el brazo mientras canta y cierra los dos puños al embestir.
- Peligros: huecos en la vía, vagón, yunques y piano que caen del cielo, palabras-plataforma, ondas del silbato, carbón vivo que salta en cada beat, anillos de humo, embestidas y el túnel a oscuras.
- **Eventos ligados a la canción** (`src/entities/events.ts`), primera tanda:
  - "Tickets, please…" (compases 24–30): picar el billete con saltos a tempo; si es válido, el tren se retrasa;
  - "Tick-tock… your ticket's overdue" (118, 230, 315): la picadora gigante muerde la vía;
  - paso a nivel en el pueblo fantasma (122, 124);
  - "sixty cuckoo clocks" (152, 154): cucos saltando a la vía;
  - "I ran down a grandfather" (156): el péndulo del reloj de pie fantasma.

  Todos se pasan saltando en el beat (comprobado jugando con las vidas activadas). **Integrados en el ambiente:** nada aparece de golpe. El billete lo lanza el propio tren desde la cabina y el viento lo deja revoloteando sobre Tick; la picadora la maneja estirando su brazo de manguera; el paso a nivel, los cucos (clavados en los árboles muertos del cementerio) y el reloj de pie (una lápida-reloj del cementerio que se despierta, abre la puerta y saca el péndulo) llegan desde fuera de pantalla con el decorado.

  Segunda tanda:
  - **Cambio de agujas** (estribillo 1, 98–110): Tick pisa la palanca de un desvío del pueblo. El tren llega a las agujas, se queda atrás hasta salir de la pantalla por la izquierda y vuelve a entrar con un silbido por la vía del fondo, más pequeño, detrás de las casas. Al acabar la frase hace lo mismo al revés: sale de la pantalla y regresa por la vía principal. Nunca se le ve deslizarse de una vía a otra.
  - **El depósito de agua** (solo de silencio, 138–146): el tren se para a beber en el depósito del pueblo (traga con cara de gusto, chorro en arco hasta la boca). Mientras la banda calla, Tick corre solo y el cuadro se oscurece. Al acabar, silbido, humo por las orejas y vuelve a toda prisa.
  - **La llave de cuerda** ("I'll unwind your spring", 196–202): el brazo del tren alcanza la corona de Tick y le gira una llave al revés. La cuerda baja más rápido y se oye el carraspeo de la llave cada medio beat.
  - **Los relojes fantasma** ("forty pocket-watches", 146.5 → puente): cinco fantasmas de relojes aplastados salen del cementerio y siguen a Tick dando saltitos al beat. Con cada golpe (las caídas también cuentan) se va uno. Los que siguen con él en el puente roto vuelan por delante y se aplanan como tablones sonrientes entre las palabras-piedra: escalones de más.

  Tercera y cuarta tanda (con esto están los 14):
  - **La señal en rojo** ("…here comes my favorite note…", 66): Tick llega a una señal de vía y el brazo cae a peligro. La canción se para como un disco al que le cortan la corriente: música, beat y cámara. El tren frena justo detrás de Tick y te mira fijamente. Silencio, solo el tic-tac, hasta que la señal se abre y llega el TOOT!. Si Tick se mueve mientras está en rojo (un paso, un salto, un dash), recibe un golpe.
  - **El piano funerario** ("…played your funeral", 193–196): el piano cae justo detrás de Tick y toca su marcha fúnebre. Su teclado sale del hueco que hay delante y hace de puente. Las teclas se hunden con las notas de la marcha (193 y 195): hay que saltarlas en esa nota. Cada paso sobre una tecla suena.
  - **Por los techos de los vagones** (estribillo 2, 212–222): tres vagones desbocados ruedan por la vía, más despacio que Tick. Se sube al primero de un salto (212) y salta los enganches (215, 219). El tren mira hacia atrás por encima del hombro. Fallar un salto es chocar contra el vagón siguiente.
  - **Parar el tiempo** ("Tick-tock, little clock", embestida de 226): si Tick llega con una racha de 3 saltos a tiempo (los de los vagones), congela el tiempo un compás: destello, anillo de marcas de reloj, "TIME STOP!" y la imagen en gris de foto fija con el jefe a media palabra. Al volver, la embestida se queda en nada y el tren se lleva un susto. Sin racha, la embestida llega como siempre.
  - **El túnel a la escucha** ("I can hear you tick-tick…", 277–282): en cada "tick-tick" el tren se lleva la mano a la oreja y Tick se mete en un nicho de la pared. Hay que no hacer nada: un salto o un dash en ese momento y el tren le oye (golpe). Durante toda la frase, el faro barre las paredes despacio, como un reflector. Sustituye a los tres huecos de medio beat que había ahí.
- **El viaje** (§8.2b): la persecución pasa por seis escenarios mientras el reloj avanza de la tarde al amanecer:

  | Parte de la canción | Beats | Escenario | Hora |
  |---|---|---|---|
  | Intro y estrofa 1 | 0–96 | Campos secos: árboles muertos con cuervos, postes de telégrafo torcidos, un espantapájaros con sonrisa cosida | 16:30 → 18:00 |
  | Estribillo 1 y solo de silencio | 96–146 | Un pueblo fantasma: casas torcidas con ventanas como ojos enfadados, depósito de agua, semáforo de vía caído, el reloj de la estación parado a las 11:59 | se pone el sol |
  | Estrofa 2 ("forty pocket-watches, sixty cuckoo clocks") | 146–210 | El cementerio de relojes: relojes de pie como lápidas, cucos muertos en los árboles, montones de relojes aplastados, cruces hechas con agujas | anochece, sale la luna |
  | Estribillo 2 e interludio | 210–256 | Bosque de pinos a medianoche, la montaña acercándose, ojos entre los arbustos y un búho | medianoche |
  | Puente: el túnel | 256–292 | **Un túnel de verdad**: portal de piedra, paredes de ladrillo, vigas de madera y faroles apagados; salida por otro portal | (el tiempo pasa a oscuras) |
  | Estribillo final y abismo | 292–341 | El desfiladero: mesetas, peñascos y buitres | amanece mientras el tren se estrella |
- Final: un abismo enorme. Las palabras que canta el jefe (BRIDGE, OUT?!, NO!, NO!, NO!, NO!) caen como piedras por las que Tick va saltando. La locomotora sigue corriendo en el aire, se da cuenta, dice adiós con la mano… y ¡KER-RASH! La canción sigue sonando bajo el cartel de victoria.

---

## 8. Arte y animación

### 8.1 Estilo
- **Rubber hose:** extremidades curvas sin codos, guantes blancos, ojos de porción de tarta y siluetas redondas.
- Animación de personajes **"a doses" (12 fps)**, mientras que el juego y la física van a 60 fps.
- **Line boil:** el trazo tiembla ligeramente cada pocos fotogramas, como un dibujo a mano.

### 8.1b Técnicas de animación de los personajes ✅
Inspiradas en cómo se animan los dibujos de goma (también en 3D): no se copia ningún personaje, solo las técnicas.
- **A doses (12 fps):** Tick y los jefes se redibujan 12 veces por segundo, aunque el juego vaya a 60.
- **Smears:** en los movimientos rápidos, el dibujo se estira durante un fotograma o dos.
  - En la embestida del tren, el cuerpo se alarga en la dirección del movimiento y deja líneas de velocidad.
  - Los barridos rápidos del brazo dejan una estela desde donde estaba la mano en el dibujo anterior.
  - En el dash de Tick, se estira a lo ancho con imágenes residuales.
- **Poses clave en los acentos:** en cada palabra gritada y en el pico de cada embestida, el jefe salta a una pose exagerada (alto y estrecho, ojos enormes, brazos arriba) y la **mantiene** unos fotogramas sin redibujar, como un "golpe" de dibujo animado. Tick hace un "ta-da!" (alto, brazos arriba) en cada salto PERFECT.
- **Actuación secundaria** (`src/rig/Acting.ts`), compartida por todos los personajes:
  - **Parpadeos:** al azar, a veces dobles y **siempre que giran la cabeza**, como hacen los animadores.
  - **Giro de cabeza en falso 3D:** los rasgos del centro de la cara se desplazan más que los de los bordes y la cara se estrecha hacia el lado del giro, mediante un muelle rápido con un poco de rebote. El jefe canta mirando al público y, cuando calla, gira la cara hacia Tick; en los acentos se vuelve de golpe al público.
  - **Cabeza:** asiente en cada beat mientras canta, con un cabeceo grande en los acentos. Se ladea con la canción, ladea la cabeza con curiosidad cuando está parado y tiembla si está nervioso.
  - **Cejas:** saltan arriba en los acentos.
  - **Miradas:** de vez en cuando echa un vistazo al público.
  - **En Old Smokestack**, la cara es una "cabeza" propia sobre el frontal de la caldera: gira, se ladea y asiente sin mover la locomotora.
  - **En Tick:**
    - al cambiar de dirección se estrecha pasando por una vista de frente en vez de darse la vuelta de golpe;
    - parado, planta los pies;
    - al rato, da golpecitos con el pie al ritmo, mira alrededor y ladea la cabeza;
    - si sigue esperando, se pone las manos en la cintura.
- **Un repertorio grande y variado** (`src/entities/SmokestackActs.ts`): Old Smokestack tiene 23 actuaciones propias, cada una con poses de brazos, cara, cuerpo y objetos.
  - **Las actuaciones:**

    | Grupo | Actuaciones |
    |---|---|
    | Saludar y presumir | quitarse el sombrero-chimenea, darse palmadas en la caldera, bailar en el sitio, hacer una reverencia |
    | Gestos con la mano | consultar el horario, retorcerse el bigote, pedir silencio con el dedo, hacer oreja con la mano, llamar a Tick con el dedo, contar con los dedos, frotarse las manos, regañar con el dedo, mirar atrás haciendo visera |
    | Reacciones | bostezar, mirar dos veces sin creérselo, echar vapor por las orejas, guiñar el ojo, estornudar hollín, encogerse de hombros, llorar con pañuelo (lágrimas de cocodrilo), entrar en pánico |
    | Amenazar | mirar fijamente a Tick sin parpadear, carcajada malvada con los colmillos fuera |

    Objetos y efectos: pañuelo, horario, lágrimas, vapor por las orejas, nube de hollín, dedos levantados y la chimenea que se levanta como un sombrero.
  - **Un "director"** en la persecución elige qué hacer:
    - **actúa la letra:** "howdy" → se quita el sombrero; "forty… sixty…" → cuenta; "wouldn't it be a pity" → llora con pañuelo; "I can hear you" → hace oreja; "what's THAT?!" → mira dos veces; "the BRIDGE is OUT?!" → pánico; "Choo-choo!" → reverencia;
    - **improvisa** en los compases instrumentales;
    - **reacciona:** con un combo de 6 mira dos veces y con 12 le sale vapor por las orejas.

    Nunca repite la misma actuación dos veces seguidas, y si hay un peligro en camino, el gesto de avisar (señalar el cielo, el puño de la embestida) tiene prioridad sobre la actuación, aunque la cara siga actuando.
  - **Sentado en el Bijou**, también hace alguna actuación cada pocos segundos y se quita el sombrero si Tick está cerca.
- **Un villano turbio, no un abuelo simpático.** En la persecución (`villain = true`) Old Smokestack tiene cara de malo:
  - **la cara:** placa de la cara sucia con manchas de hollín, ojos hundidos en cuencas oscuras, pupilas pequeñas, párpados siempre a media asta y cejas fruncidas aunque esté tranquilo;
  - **la boca:** en reposo, una mueca torcida con un colmillo; al sonreír, una sonrisa ancha con colmillos; al reírse, una carcajada con colmillos arriba y abajo;
  - **las actuaciones son siniestras:**
    - se quita el sombrero y hace la reverencia entornando los ojos y girando la cara;
    - se da palmadas lentas en la caldera;
    - en vez de bailar, se balancea encima de Tick;
    - el guiño es un golpecito en la nariz ("tú y yo sabemos algo");
    - llora con el pañuelo y a mitad asoma una sonrisa malvada;
    - bosteza y termina mirando de reojo;
  - **las improvisaciones** entre versos son sobre todo mirar fijamente y la carcajada;
  - **en el túnel**, a oscuras, los ojos se vuelven dos cuencas negras con un punto de luz amarillenta (el filtro de película tiene una tercera luz pequeña sobre sus ojos, `light3`).

  Ya liberado y **sentado en el Bijou** (`villain = false`) vuelve a ser amable: la mueca y la carcajada se convierten en sonrisa y los ojos entornados en ojos cerrados de gusto.
- **Reacciones de Tick:**
  - mira hacia atrás mientras el tren coge carrerilla para embestir;
  - se sobresalta (ojos enormes y brazos arriba) cuando empieza la embestida;
  - ve estrellitas un momento cuando le dan.
- **Sincronía labial por fonema** (`src/core/visemes.ts`): cada palabra cantada se convierte en una secuencia de bocas: labios cerrados (M, B, P), dientes sobre el labio (F, V, TH), abierta, ancha (A, I), media (E), redonda (O) y fruncida (U, W, OO). Las vocales duran el doble, y la "e" muda del final se ignora. La boca recorre la secuencia mientras se canta la palabra; al gritar, una "O" enorme.

### 8.2 Técnica (demo: todo generado por código)
- **Rig por piezas:** la cabeza, el torso y los guantes son formas vectoriales, y las **extremidades son curvas Bézier gruesas** controladas por código. El estiramiento y aplastamiento van sincronizados al beat.
- **Shader de película** (post-proceso): grano, rayas verticales, motas de polvo, viñeta, parpadeo de brillo y vaivén de la imagen.
- **Paletas por época:** `bw1928`, `sepia1930`, `twoStrip1932` y `full1935`, aplicadas por shader (así el mismo arte sirve para todas las épocas).
- **Fondos:** capas con *parallax*, con textura de acuarela o papel generada por código.

### 8.2b Escenarios: cada jefe es un viaje ✅
Para que el nivel se sienta como un recorrido y no como un fondo que se repite, el fondo cambia mientras avanza la canción (`src/world/Scenery.ts`, `sceneSets.ts` y `SceneryArt.ts`).
- **Tono:** el lado oscuro de los dibujos de los años 30. Nada de nubes ni árboles sonrientes: árboles secos, cuervos, un espantapájaros, un pueblo abandonado, relojes muertos, ojos en los arbustos y un hombre en la luna que te vigila con media sonrisa.
- **Escenarios (`sets`):** cada uno define una capa lejana, una capa media, cosas en el cielo y dos filas de decorado (la del medio y la cercana). Ya existen `dusk`, `town`, `graveyard`, `pines` y `gorge`. Cada jefe nuevo tendrá los suyos (dibujados en `SceneryArt.ts` y declarados en `sceneSets.ts`).
- **Cómo cambian:**
  - las capas lejanas se funden de un escenario al siguiente (8 beats; `dissolve: 0` lo hace de golpe, útil si cambia mientras se está dentro del túnel);
  - el decorado **llega desde la derecha**: cada árbol o casa pertenece al escenario por el que pasa el tren cuando ese objeto llega al centro de la pantalla, así que el pueblo aparece a lo lejos y se va acercando;
  - todo sigue bailando al ritmo, pero las casas y las piedras se balancean menos que los árboles.
- **La hora del día:** el nivel marca qué hora es en cada beat y el cielo la sigue: el color del cielo, el resplandor del horizonte al atardecer y al amanecer, el sol que se pone detrás de las colinas, la luna que sale y las estrellas.
  - De noche la imagen se oscurece (el mismo filtro del túnel, más suave), pero Tick y el faro del tren siguen iluminando, y las colinas lejanas se vuelven siluetas.
  - De noche los ojos del jefe también brillan.
- **Túneles de verdad:** si el nivel lo pide (`"tunnel": "brick"`), cada evento `tunnel` se convierte en un túnel con portal de piedra a la entrada, paredes de ladrillo, vigas de madera, faroles colgando que se balancean al ritmo y otro portal a la salida. Tick entra por el portal justo en el beat del evento.
  - **Se ve de lado, como un corte de montaña de dibujo animado:**
    - la montaña está delante del tren (roca dibujada, `rocktile`, recortada a su silueta y repasada con tinta), así que la chimenea y el sombrero se meten en la roca al entrar;
    - el túnel está excavado en su pie a la altura de la vía (330 px de alto): las dos bocas llevan pilares y arco de dovelas de piedra;
    - dentro se ven la pared del fondo de ladrillo, las vigas de madera de suelo a techo y los faroles colgando del techo de roca, todo en sombra.
  - La pared de ladrillo dibujada se repite en las dos direcciones sin costura (`"tiles"` en `textures.json`), y la roca también (`"type": "tile"`).

### 8.3 Personajes dibujados: la marioneta por capas ✅ (prototipo con Old Smokestack)
Sin animador, la forma más fluida de usar dibujos de verdad es una **marioneta**: el personaje se dibuja una sola vez, separado en piezas, y el código lo anima de forma continua, a 60 fotogramas por segundo.
- **Lo que se dibuja (una hoja de piezas):** el cuerpo sin brazos y con la cara vacía, el sombrero, el bigote, tres guantes (abierto, puño, señalando) y una rueda.
  - **Guantes:** vemos el lado izquierdo del personaje, así que la mano de delante es una mano izquierda vista por la palma: los tres guantes deben tener el pulgar a la derecha. Si la IA dibuja alguno al revés, `"flip": ["gloveFist"]` en `art.json` lo invierte al recortarlo (en Smokestack, el puño y el que señala).
  - En el juego, el guante solo gira, nunca se espeja, y gira de forma suave: al empezar un gesto nunca da la vuelta de golpe.
  - **Lo que agarra:** con el brazo largo la mano siempre es un puño, y el objeto se coloca en el centro del puño, detrás del guante:
    - las tenazas atraviesan el puño con las mandíbulas hacia abajo;
    - la llave de cuerda se agarra por el ojo. El prototipo actual está hecho con una IA de imágenes (`art/smokestack/parts.jpg`); el prompt está en el historial del proyecto y sirve para cualquier jefe.
- **Enemigo nuevo, de forma automática (una imagen y un comando):**
  1. `npm run art -- new <id> --desc "qué es el personaje"` crea `art/<id>/` con `PROMPT.txt` (el prompt para la IA de imágenes, con las piezas en orden fijo: cuerpo sin brazos y con la cara vacía, sombrero, bigote, tres guantes y rueda) y `art.json`. Con `--no-wheel`, `--no-hat` o `--no-mustache` se quitan esas piezas.
  2. Se le pasa `PROMPT.txt` a la IA y la imagen se guarda como `art/<id>/parts.png`.
  3. `npm run art -- <id>` lo hace todo solo:
     - recorta cada pieza y quita el fondo;
     - las nombra por su orden en la hoja (el cuerpo es la más grande);
     - encuentra la cara (el área clara y redonda de delante), el suelo, el morro, la parte de arriba (chimenea o cabeza) y las ruedas (círculos que tocan el suelo);
     - escribe `public/art/<id>/` y dibuja `art/<id>/preview.png` para comprobar lo detectado.

     Cualquier medida se puede forzar a mano en `art.json` (`"anchors"`).
  4. `?puppet=<id>` en la URL abre el **visor de marionetas**: el personaje en 12 escenas a la vez (reposo, cantando a cámara, carcajada, mirada fija, lágrimas falsas, guiño, saludo, horario, aviso, embestida, susto, pánico). `←` y `→` cambian de personaje.
- La misma clase de marioneta sirve para cualquier hoja (`new Smokestack(escena, '<id>')`); las ruedas, el sombrero, el bigote y los guantes son opcionales. `"bossArt": false` en `game.json` (o `?art=0`) vuelve al dibujo por código.
- **Decorado y objetos dibujados con IA:** se piden con los prompts de `art/<jefe>/PROMPTS.md`, numerados (los de Smokestack son 17, más Tick aparte). Cada imagen se guarda como `art/<jefe>/NN.png` (o `.jpg`), y `art/<jefe>/textures.json` dice qué hay en cada una:
  - **hoja de objetos:** nombres en orden de lectura;
  - **tira de fondo:** un nombre.

  `npm run art -- <jefe>` las recorta (`tools/art/slice_textures.py`) y deja `art/<jefe>/textures-preview.png` para comprobarlas.
  - **Objetos:** se quita el blanco de alrededor y se reparten los trocitos sueltos.
  - **Tiras:** se quita el blanco de encima y se cortan donde el perfil coincide en los dos extremos, para que se repitan sin costura.

  El resultado va a `public/art/textures/`. Al arrancar, el juego usa cada imagen **en lugar del dibujo por código del mismo nombre** (`src/fx/artTextures.ts`):
  - la ajusta a su sitio: las tiras, al ancho de la pantalla; el decorado, a su altura; los objetos que caen, a su caja;
  - le añade los tres fotogramas de "línea viva" (un temblor suave, 8 veces por segundo).

  Las imágenes que aún no estén se siguen dibujando por código.
  - **Objetos de los eventos:** se cargan como `art:tex:<nombre>` y cada evento los usa si existen; si no, los dibuja por código.
    - `piece()` en `src/entities/events.ts` crea la pieza girando sobre su punto marcado (`pivot`) y la escala por la distancia hasta `tip`.
    - `piecePoint()` da dónde cae en pantalla otro punto marcado, por ejemplo la esfera del reloj o la bisagra de la palanca.
  - **En Smokestack:**
    - el tren sostiene el billete (con los agujeros dibujados encima), la picadora (abierta o cerrada) y la llave de cuerda (delante del puño, con el ojo de la llave estrechándose al girar);
    - la barrera del paso a nivel gira sobre su bisagra y sale volando al pasar el tren;
    - los árboles del cementerio llevan su reloj de cuco (en espejo, mirando a la vía) y el pájaro sale con un muelle desde la puerta;
    - el reloj de pie despierta con ojos sobre su esfera en blanco, abre la puerta y balancea la bola dibujada (del tamaño de la zona que golpea);
    - la palanca de agujas gira sobre su eje;
    - los relojes fantasma se estiran en tablones en el puente.
  - **Detalles del recortador:**
    - si los dibujos se tocan (hierba a sus pies), lo reintenta con trazos más finos y, si hace falta, cortando por los huecos blancos;
    - `"seeThrough"` vuelve transparentes los huecos blancos encerrados (entre las tablas de una valla);
    - `"anchors"` marca puntos que el juego necesita, como el caño del depósito de agua (`"rightmost"`), que el evento usa para el chorro.
  - **Tick** también está dibujado con IA (`art/tick/`, generado con Magnific): caja, corona, tres guantes y zapato. Se colocan sobre su esqueleto por código (`src/entities/Player.ts`, dibujado en capas: detrás, cuerpo y cara, delante). Los brazos y piernas de manguera y la cara de la esfera (ojos, bigote de agujas, boca) siguen siendo código y siguen animándose. Sin las imágenes, Tick se dibuja entero por código, como antes.
  - **Smokestack:** las 17 hojas están hechas.
    - 5 las hizo el autor: 4, 6, 7, 8 y 9.
    - 12 se generaron con Magnific desde esta sesión (plan gratuito, 20 imágenes al día) y se revisaron una a una.
    - La hoja `16b` rehace la picadora cerrada y la llave de cuerda, que habían salido mal.
    - La red de la sesión no deja descargar el original de Magnific, así que se usa su copia de 1024 px.
- **Cómo se anima (todo continuo, nada salta):**
  - **el cuerpo** es una malla (`Phaser.GameObjects.Mesh`) cuyos vértices pasan cada fotograma por la misma deformación de goma que el dibujo por código: respira, se estira en los acentos, se inclina al embestir y ondula al cantar;
  - **las ruedas** giran y la biela sigue a las manivelas;
  - **la cara** es un rig por código (`src/entities/FaceRig.ts`) dibujado encima del frente redondo. Tiene controles continuos: cada ceja (altura y enfado), párpados de arriba y de abajo que tapan el ojo, tamaño del ojo y de la pupila, mirada, y boca (apertura, anchura, sonrisa, mueca torcida, dientes, colmillos, lengua, mofletes).
    - Hay 18 expresiones: mueca, sonrisa ladeada, sonrisa malvada, carcajada, furia, susto, tramar, mirada amenazante, lágrimas falsas, chulería, guiño, inocencia, preocupación, pánico, bostezo, regodeo, escuchar y sospecha.
    - Cada actuación tiene su expresión y su mirada (`ACT_FACE`). La cara pasa de una a otra deslizándose; las sílabas abren y dan forma a la boca encima de la expresión.
    - Gira en falso 3D, parpadea y los ojos dan pequeños saltos para no quedarse quietos;
  - **mira al jugador:** en los versos que le canta a Tick ("kid", "little ticker", "you"…) el director le hace mirar a cámara y se inclina hacia ella; el guiño, el saludo y la mirada amenazante también van a cámara;
  - **el bigote** (imagen) va pegado a la cara y aletea al cantar;
  - **el sombrero** (imagen) va sobre un muelle: bota en cada beat, salta con el silbato y lo levanta la mano al saludar;
  - **los brazos** son mangueras por código con los guantes dibujados al final; la mano viaja a cada gesto sobre un muelle con un poco de rebote. El hombro está junto a la cara, el brazo tiene un alcance máximo, no se sale de pantalla, el codo se dobla hacia fuera y, si el brazo cruzara la cara, pasa por detrás de la cabeza.
- **Revisión por fotogramas:** antes de cada avance grande se genera una hoja de fotogramas (expresiones y gestos) para revisarla.
- Las 23 actuaciones, el director y la sincronía labial son los mismos que en el dibujo por código. El Smokestack amable del Bijou sigue dibujado por código.
- Se probó antes una hoja de 10 poses cambiando de imagen: se veía falso, porque faltan los dibujos intermedios. La marioneta lo sustituye.
- **Siguiente paso:** el dibujo definitivo de un dibujante (las mismas piezas, en alta resolución) y, si hace falta, piezas extra de la cara.

---

## 9. Música y canciones

### 9.1 Principios
- Sonido **antiguo** (de grabación de los años 30: algo de crepitar de vinilo y un ecualizador "de radio"), variando de género en cada jefe.
- **Canciones en inglés.**
- La palabra del peligro cae en un **tiempo fuerte**, y se anuncia **1–2 beats antes** en la letra.
- **Tono:** música animada y letra con fondo triste. Cada canción habla, de forma juguetona, del tema de su jefe (despedidas, soledad, oportunidades perdidas…) y del miedo a que su película acabe.
- Cada canción incluye al menos un **solo de silencio** (idea 9): unos compases en los que la banda calla y los peligros siguen.

### 9.2 Flujo de trabajo
1. **Diseño conjunto:** para cada jefe escribimos un *brief* con el BPM, la estructura por compases y la lista de peligros, y a cada peligro le corresponde una línea de la letra.
2. **Música provisional:** mientras tanto, el juego usa una pista instrumental generada por código con el **mismo BPM y estructura**, para poder diseñar y probar ya.
3. **Canción final:** la crea el autor siguiendo el *brief*.
4. **Sincronización:** se deja la canción (y la letra en `lyrics.txt`, si la hay) en `public/audio/<jefe>/` y se ejecuta `npm run audio -- <jefe>`. Si el nivel no existe, se crea; si no hay letra, se escribe un borrador con lo que oye Whisper. El script calcula el tempo, el beat 0 y el momento de cada palabra, y los escribe en el JSON del nivel. Los peligros **anclados a una palabra** (§11.4) se recolocan solos. El informe marca las palabras dudosas para revisarlas.
5. **Ajuste:** se juega, se revisan los avisos de `npm run check` y se retocan los eventos (más adelante, con el editor de ritmo).

### 9.3 Requisitos técnicos de la canción entregada
- **BPM constante** (o un mapa de tempos indicado explícitamente).
- Formato **OGG** (y MP3 como alternativa), 44.1 kHz.
- **Stems opcionales:** `drums`, `bass`, `music`, `vocals`. Permiten la música adaptativa: quitar o añadir capas según cómo vaya el jugador.
- **Líneas alternativas opcionales** (burla / nervios) como clips de voz sueltos.
- Duración aproximada: Chase de 2 a 3 min; Duel con fases en bucle de 30 a 60 s cada una.

### 9.4 Plantilla de *brief* de canción
```
Boss: Old Smokestack
Level type: chase
BPM: 132   Time signature: 4/4   Key: (libre)
Style: ragtime / train swing, 1930s recording feel
Structure (bars): intro 4 | verse A 16 | chorus 8 | verse B 16 | chorus 8 | bridge 8 | final chorus 16 | outro 4
Hazards in lyrics:
  - bar 9, beat 1: "...if a boxcar came loose"  -> boxcar falls (telegraph 2 beats)
  - ...
Taunt lines (optional): 2-3 short lines
Nervous lines (optional): 2-3 short lines
```

---

## 10. Tecnología

- **Motor:** Phaser 3 + TypeScript + Vite.
- **Publicación:** web estática (itch.io / GitHub Pages / Netlify).
- **Entrada:** teclado y mando (Gamepad API).
- **Resolución base:** 1280×720 (16:9), escalada al tamaño de la ventana.

### 10.1 Reloj de ritmo ("Conductor")
- La fuente de verdad es el reloj de audio (`AudioContext.currentTime`), nunca el *frame time*.
- Convierte segundos en beats según el BPM o el mapa de tempos y el `offset` de la canción.
- **Calibración de latencia** (`CalibrateScene`, opción **CALIBRATE** del título), a 100 BPM con clic de metrónomo:
  1. **Imagen y sonido:** una pelotita bota en cada clic. Con `←/→` (±5 ms; `Shift` para ±1 ms; `0` vuelve al valor de `game.json`) se retrasa o adelanta la imagen hasta que el bote coincide con el clic. Resultado: `audioOffsetMs`.
  2. **Teclas:** sin nada en pantalla que marque el ritmo, se pulsa saltar en cada clic (4 de cuenta atrás + 16 pulsaciones). Se descartan las pulsaciones a más de 220 ms de un clic; se toma la mediana y la media de las cercanas (±80 ms). Se mide exactamente igual que el juicio de "a tiempo" de la partida. Resultado: `inputOffsetMs`, con un indicador de regularidad.
  - `Enter` guarda · `R` repite las pulsaciones · `Retroceso` vuelve al paso 1 · `Esc` sale sin guardar.
- La calibración se guarda **en el navegador** (`localStorage`, clave `timesend.calibration.v1`) y se **suma** a los valores de `game.json`. Así el JSON sigue siendo la base común y cada ordenador guarda solo su ajuste. El título muestra los valores efectivos.
- Las pulsaciones de teclado se fechan con la marca de tiempo del propio evento y no con el fotograma en que Phaser las procesa (antes podían llegar hasta 16 ms tarde).

### 10.2 Editor de ritmo (herramienta interna)
- Reproduce la canción con metrónomo y una línea de tiempo en beats.
- Permite marcar eventos pulsando teclas mientras suena, moverlos, borrarlos y cuantizarlos a la cuadrícula (1/1, 1/2, 1/4).
- Exporta e importa el JSON del nivel.

### 10.3 Estructura de carpetas
```
cartoon-rhythm-game/
  MAIN.md                       este documento
  docs/songs/                   briefs de canciones
  index.html · package.json · vite.config.ts · tsconfig.json
  src/
    main.ts                     configuración de Phaser
    core/       Conductor.ts (reloj de ritmo), Input.ts (teclado + mando),
                Calibration.ts (calibración guardada en el navegador),
                lyrics.ts, anchors.ts (eventos anclados a palabras),
                timing.ts (cuándo aparece cada peligro), levelCheck.ts (comprobador),
                validate.ts (validación de JSON), types.ts, Game.ts
    audio/      AudioEngine.ts (cadena "vintage"), Synth.ts (instrumentos + SFX),
                Songs.ts (archivo real o banda provisional), chords.ts, Sfx.ts
    entities/   Player.ts (Tick), Smokestack.ts (jefe), hazards.ts (peligros)
    rig/        Ink.ts (trazo de tinta, extremidades de manguera, line boil)
    fx/         FilmPipeline.ts (shader de película), Textures.ts (texturas por código)
    world/      Scenery.ts (el viaje: escenarios, hora del día, túneles), sceneSets.ts
                (escenarios y cielo, sin Phaser), SceneryArt.ts (dibujos del decorado),
                Track.ts (vías y huecos), Solids.ts,
                TileMap.ts (mapas ASCII de los niveles de plataformas)
    hub/        HubLayout.ts (plano del Bijou y sus objetos), HubArt.ts (dibujo fijo),
                HubMusic.ts (el órgano que gana instrumentos)
    ui/         LyricsUI.ts (pelotita), Hud.ts, Cards.ts (intertítulos), Menu.ts
    scenes/     Boot, Error, Splash, Title, TitleCard, Chase, Calibrate,
                Bijou (la sala central), Platform (niveles entre jefes), Minigame,
                Intertitle, MenuScenes (Resume, Slot, Programme, Options)
    core/       … Save.ts (partidas y ajustes), flow.ts (entrar y salir de niveles),
                mapCheck.ts (¿se puede terminar el mapa?)
  public/
    data/config/   game.json, difficulty.json, controls.json
    data/levels/   smokestack.json
    audio/smokestack/   song.mp3 + lyrics.txt (letra para sync_song.py)
  scripts/audio.ts              npm run audio -- <jefe>
  scripts/check-levels.ts       npm run check
  tests/                        npm test (vitest)
  tools/song-analysis/          sync_song.py (+ sus pruebas)
  .github/workflows/ci.yml      compila, prueba y comprueba en cada push
```

---

## 11. Configuración por JSON (editable por el autor)

Todo lo que hay en `public/data/` se puede editar con cualquier editor de texto. Para ver los cambios basta con **recargar la página (F5)**. Si un JSON tiene un error, el juego muestra una pantalla que indica **qué archivo y qué campo** fallan.

### 11.1 `config/game.json`: ajustes globales
| Campo | Qué hace |
|---|---|
| `audioOffsetMs` | Compensa el retraso del audio. Si notas que los golpes llegan **antes** que la música, súbelo (prueba con 30, 60…). Se le suma lo medido en **CALIBRATE** |
| `inputOffsetMs` | Compensa el retraso del teclado o el mando al juzgar "a tiempo". Se le suma lo medido en **CALIBRATE** |
| `defaultDifficulty` | `"normal"` o `"hard"` |
| `masterVolume` / `musicVolume` / `sfxVolume` | De 0 a 1 |
| `vintageAudio` | `true` añade crepitar de vinilo |
| `debug` | `true` muestra el panel de depuración siempre |
| `levels` | Lista de niveles que se cargan |
| `film.grain/scratches/vignette/weave/flicker` | Intensidad de cada efecto de película (0 = nada, 1 = normal, hasta 3) |
| `player.*` | Física de Tick: velocidad, gravedad, salto, dash, invulnerabilidad… |

### 11.2 `config/difficulty.json`: dificultades
Puedes añadir dificultades nuevas copiando un bloque y cambiándole el nombre.
| Campo | Qué hace |
|---|---|
| `label` | Texto que se muestra en el menú |
| `playerHits` | Golpes que aguanta Tick |
| `hitWindowMs.perfect` / `.good` | Margen en ms para que un salto o dash cuente como **PERFECT!** o **GOOD** |
| `onBeatJumpMultiplier` | Cuánto más alto saltas si lo haces a tiempo |
| `onBeatDashBonusMs` | Invulnerabilidad extra del dash a tiempo |
| `telegraphBeats` | Beats de aviso por defecto de los objetos que caen y las embestidas |
| `hazardSpeedMultiplier` | Velocidad de las ondas y los anillos de humo (>1 = menos tiempo para reaccionar) |
| `bossLungeMultiplier` | Distancia de las embestidas |

### 11.3 `config/controls.json`: controles
Lista de teclas por acción (nombres de tecla de Phaser: `LEFT`, `A`, `SPACE`, `SHIFT`, `Z`, `ENTER`, `ESC`…). El mando funciona automáticamente: botón A para saltar, B o RB para el dash y Start para pausar.

### 11.4 `levels/<nivel>.json`: un nivel
```json
{
  "id": "smokestack",
  "title": "FULL STEAM AHEAD",          // título del corto (cartel)
  "subtitle": "Old Smokestack",         // nombre del jefe
  "type": "chase",
  "era": "bw1928",                      // bw1928 | sepia1930 | twoStrip1932 | full1935
  "song": {
    "file": "audio/smokestack/song.ogg",// si no existe → banda provisional
    "offsetMs": 0,                      // ms del archivo en los que cae el beat 0
    "beatsPerBar": 4,
    "tempoMap": [{ "beat": 0, "bpm": 132 }],
    "lengthBeats": 288                  // al llegar aquí: ¡victoria!
  },
  "chase": {
    "pixelsPerBeat": 110,               // velocidad de la cámara
    "anchorX": 440,                     // X de pantalla donde se espera a Tick
    "bossFrontX": 250,                  // X de pantalla del morro del jefe
    "gapLeadPx": 40,                    // los huecos empiezan un poco después del ancla
    "autoRun": true                     // Tick corre solo; ←/→ frenan o aceleran
  },
  "scenery": {                          // opcional: el viaje (§8.2b)
    "stages": [                         // escenarios, en orden
      { "beat": 0, "set": "dusk" },
      { "beat": 96, "set": "town" },
      { "beat": 274, "set": "gorge", "dissolve": 0 }   // dissolve: beats del fundido (8; 0 = de golpe)
    ],
    "hours": [[0, 16.5], [96, 18.0], [256, 24], [341, 30.6]],  // [beat, hora]; después de medianoche se sigue contando: 30 = las 6 de la mañana
    "tunnel": "brick",                  // los eventos tunnel son túneles de verdad
    "nightDark": 0.45                   // cuánto se oscurece la imagen de noche (0-0.9)
  },
  "lyrics": [ ... ],
  "events": [ ... ],
  "placeholderMusic": { ... }
}
```
*(En el JSON real no se pueden escribir comentarios `//`; aquí solo sirven para explicar.)*

Escenarios disponibles (`set`): `dusk` (campos secos), `town` (pueblo fantasma), `graveyard` (cementerio de relojes), `pines` (bosque y montaña), `gorge` (desfiladero). Sin `scenery`, el nivel usa `dusk` a las cinco de la tarde.

**Letra (`lyrics`)**: una entrada por frase.
```json
{ "beat": 56, "text": "if a ^BOXCAR came a-tumblin' down", "at": [0, 0.5, 1, 2, 2.5, 3] }
```
- `beat`: beat en el que empieza la frase.
- `text`: las palabras. Si una empieza por `^`, es **gritada** (más grande y con golpe de banda).
- `at`: beat de cada palabra, relativo al inicio de la frase. Debe haber tantos números como palabras. Si se omite, las palabras se reparten solas en `length` beats (6 por defecto).

**Eventos (`events`)**: todos llevan `type` y `beat`. Opcionales en todos: `"only": ["hard"]` (solo aparece en esas dificultades) y `"comment"` (una nota tuya, el juego la ignora).

**Eventos anclados a una palabra.** En lugar de `beat`, un evento puede llevar `anchor` (y entonces no lleva `beat`):
```json
{ "type": "drop", "anchor": "BOXCAR", "afterBeats": 4, "snap": 1, "object": "boxcar", "x": "player" }
```
- `anchor`: una palabra de la letra, sin importar mayúsculas ni signos. Si se canta varias veces, `#n` indica cuál: `"TOOT#3"` es el tercer TOOT de la canción.
- `afterBeats`: beats después de la palabra (por defecto 0; puede ser negativo).
- `snap`: redondea el resultado a esa cuadrícula (`1` = al beat entero más cercano, `0.5` = a la corchea, `0.25` = a la semicorchea). Sin `snap`, cae justo en `palabra + afterBeats`.
- Así, si se vuelve a sincronizar la canción (o se regenera en Suno), el peligro sigue a su palabra. Conviene anclar todo lo que la letra anuncia y dejar con `beat` fijo lo que va con la música (huecos, ritmos de piedras…).
- En Smokestack: las ondas del silbato caen 2 beats después de cada TOOT, los objetos que caen 4 beats después de su palabra (BOXCAR, TRUNK, PIANO) y las palabras-plataforma en su propia palabra.

| `type` | Campos | Qué hace |
|---|---|---|
| `gap` | `lengthBeats` | Hueco en la vía. Tick llega al borde en `beat` si va a la altura del ancla → **salta en ese beat** |
| `drop` | `object` (`boxcar`, `anvil`, `piano`, `trunk`), `x` (`"player"` o X de pantalla), `telegraphBeats` | El objeto cuelga arriba, una sombra marca dónde caerá y **aterriza exactamente en `beat`**. Después se queda en la vía como obstáculo |
| `lyricObject` | `word`, `x` (X de pantalla, 760 por defecto), `height` (px sobre el suelo, 120 por defecto; 0 = a ras de vía), `lifeBeats` | Una palabra cantada cae del cielo y se convierte en **plataforma** en `beat`. Desaparece tras `lifeBeats` |
| `groundWave` | `travelBeats` (2) | Onda del silbato que sale del jefe y **llega al ancla en `beat`**. Hay que saltarla |
| `coal` | `count` (3), `spacingBeats` (1), `landX` (1020), `hopPx` (60) | Carbón vivo: la chimenea lo lanza, aterriza en `beat` y luego salta hacia Tick en cada beat |
| `smokeRing` | `x` (`"player"` o X), `travelBeats` (2) | Anillo de humo lanzado en parábola que aterriza en `beat` |
| `bossLunge` | `telegraphBeats`, `distance` (230) | El jefe coge carrerilla y **embiste**, con el pico en `beat`. Hay que ir por delante |
| `tunnel` | `lengthBeats` | Oscuridad: solo se ven Tick y el faro del jefe. La música suena apagada. Con `"scenery": { "tunnel": "brick" }` es además un túnel de verdad, con portales y paredes |
| `sign` | `text`, `x` (1100) | Cartel de madera en la vía |
| `bossFall` | `crashBeat` (por defecto `beat` + 4) | Gag final: el jefe sigue corriendo en el aire sobre el abismo, se da cuenta, dice adiós con la mano y se estrella en `crashBeat` |
| `shake` | `intensity` (0.01), `durationBeats` (1) | Sacudida de cámara |
| `cue` | — | Punto de control: al perder se puede rebobinar al último que pasaste (§6.3) |
| `silence` | `lengthBeats` | Solo de silencio: la banda calla durante `lengthBeats` y solo el tic-tac y los peligros marcan el beat (idea 9) |
| `ticketCheck` | `count` (4), `spacingBeats` (2) | "Tickets, please": el tren lanza un billete que el viento deja revoloteando sobre Tick. Cada salto a tempo en `beat`, `beat`+spacing… le pica un agujero con la corona. Con un billete válido el tren se queda atrás unos compases; al sellarlo, el viento se lo lleva |
| `holePunch` | `lengthBeats` (1), `biteBeats` (1.5) | Unas tenazas de picar billetes gigantes muerden la vía `biteBeats` antes de que Tick llegue en `beat`: un hueco que aparece de repente |
| `crossing` | `count`, `spacingBeats` (2) | Paso a nivel: la barrera baja con la campana y está abajo cuando Tick llega en `beat` (y cada `spacingBeats`). Hay que saltarla; el tren la hace astillas |
| `cuckoos` | `count`, `spacingBeats` (2) | Relojes de cuco en postes: el pájaro sale con un muelle a la vía en `beat`. Hay que saltarlo |
| `pendulum` | — | El fantasma de un reloj de pie balancea el péndulo como un metrónomo; la bola pasa por el sitio de Tick justo después de `beat`. Hay que saltar en el beat |
| `trackSwitch` | `lengthBeats` (12) | Cambio de agujas: una palanca junto a la vía; el tren sale de la pantalla hacia atrás, reaparece por la vía del fondo (allí no puede atrapar a Tick) y al final sale otra vez y regresa por la principal |
| `waterStop` | `lengthBeats` (8) | El tren se para a beber en un depósito de agua y se queda atrás; el cuadro se oscurece mientras tanto. Vuelve con un silbido al acabar. Pensado para un `silence` |
| `unwindKey` | `lengthBeats` (6), `drainPerBeat` (0.07) | El brazo del tren gira una llave en la corona de Tick: la cuerda baja `drainPerBeat` más por beat |
| `redSignal` | `holdSec` (2.4) | Señal de vía delante de Tick: en `beat` cae a peligro y la canción se para (un calderón) `holdSec` segundos; el tren frena justo detrás. Moverse durante la parada es un golpe |
| `timeStop` | `need` (4) | Premio en la embestida que culmina en `beat`: con una racha de `need` saltos a tiempo, Tick para el tiempo un compás y la embestida se anula |
| `tunnelListen` | `listen` (lista de beats), `windowBeats` (0.9) | En la oscuridad el tren escucha: en cada beat de `listen` no se puede saltar ni hacer dash. El faro barre como un reflector |
| `pianoKeys` | `lengthBeats`, `presses` (lista de beats) | Un teclado de piano sale de un hueco desde `beat`: las teclas son el suelo y en cada beat de `presses` se hunde la que Tick alcanza (hay que saltarla). Lleva debajo un `gap` del mismo largo |
| `roofRun` | `count` (4), `carBeats` (2), `couplingBeats` (1), `speed` (0.3) | Vagones desbocados delante: Tick sube al primero en `beat` y salta cada enganche; los saltos caen en `beat` + i·(carBeats + couplingBeats) − couplingBeats |
| `ghostWatches` | `count` (5), `bridgeBeat` (321) | Relojes fantasma que siguen a Tick; cada golpe espanta a uno. Los que quedan en `bridgeBeat` se vuelven escalones entre las palabras-plataforma que caen en los 14 beats siguientes |

**Para los eventos (código):** un evento puede cambiar la velocidad de la canción con `ctx.setTempo(r)`: 1 es normal y 0 la congela, junto con el beat y la cámara (la cámara va tan rápido como suena la canción). También puede mover el haz del faro (`mods.beam`) y dejar que el tren se pegue a Tick sin atraparle (`mods.noCatch`). El jefe tiene `lungeCancelled` para anular una embestida.

**Empezar desde una marca (§6.3) o con `?beat=`:** se crean también los eventos que deberían haber aparecido un poco antes y aún no han terminado (`beat` + `lengthBeats` por delante), así los decorados grandes llegan igual. Los relojes fantasma acompañan a Tick hasta el puente aunque se empiece después de que salgan del cementerio.

### 11.5 Comprobador de niveles (`npm run check`)
Revisa cada nivel sin cambiarlo. Con `?debug=1`, el mismo informe sale en la consola del navegador.
- **Errores** (el nivel está roto):
  - eventos fuera de la canción;
  - huecos imposibles de saltar incluso manteniendo →;
  - anclajes a palabras que no están en la letra.
- **Avisos** (probablemente injusto o un descuido):
  - **Aviso previo:** menos de 600 ms entre que aparece un peligro y golpea (vagón, onda, anillo de humo, embestida), en cada dificultad.
  - **Reacciones solapadas:** dos peligros que piden reaccionar a menos de 300 ms el uno del otro.
  - **Huecos exigentes:** un salto normal no basta y hay que mantener →. El cálculo usa la física de `game.json` y la velocidad de la cámara.
  - **Objeto no anunciado:** cae un objeto cuyo nombre no se canta en los 8 beats anteriores.
  - **Palabra no cantada:** cae una palabra-plataforma que no se canta en los 2 beats de alrededor.
  - **Fuera del compás:** un peligro que no cae en la cuadrícula de medio beat.
- Los huecos cruzados sobre palabras-plataforma (el abismo final) no se juzgan como salto normal.
- Aviso actual de Smokestack: la cuarta piedra "NO!" del abismo (beat 331.75) cae más de 2 beats después del último "no" cantado.

### 11.6 `levels/<id>.json` de tipo `platform`: niveles entre jefes
Se dibujan como un **mapa ASCII**: una cadena por fila de casillas de 40 px (al menos 18 filas, que es una pantalla; todas del mismo ancho).

| Carácter | Qué es |
|---|---|
| `#` | Bloque sólido |
| `=` | Tablón (se atraviesa saltando desde abajo) |
| `a` / `b` | Tablones al ritmo: el grupo A está en los tiempos 1–2 de cada compás y el B en el 3–4. Parpadean medio beat antes de desaparecer |
| `M` / `V` | Plataforma de 3 casillas que va y viene, en horizontal o en vertical (4 casillas en 8 beats) |
| `^` | Pinchos |
| `S` | Pisón "1 TON": cae en cada beat par y tiembla antes |
| `B` | Saco de arena: cae en el primer tiempo de cada compás |
| `*` | Fotograma |
| `C` | Marca de cambio de bobina (punto de control) |
| `T` | Muestra el siguiente texto de `texts` (titulares, intertítulos) |
| `W` | Plataforma-palabra: la siguiente palabra ^GRITADA de la letra (sing-along) |
| `O` | Objeto perdido (`lostObject`) |
| `R` | La bobina fugitiva (serial) |
| `P` / `E` | Salida de Tick / meta |

**Campos:**
- **Identidad:** `id`, `kind` (`newsreel`, `serial`, `singalong` o `memory`), `title`, `subtitle` y `era`.
- **Música:** `music { bpm, beatsPerBar, voice, placeholder }`, con la banda provisional y, si `voice` es true, la voz que canta la letra.
- **Opcionales:**
  - `autoscroll`: px por beat; el noticiario usa 100;
  - `lyrics`: para el sing-along;
  - `texts`;
  - `intro` y `outro`: tarjetas de cine mudo antes y después;
  - `lostObject { id, name, text }`;
  - `wordLifeBeats`.
- **Comprobación:** `npm run check` valida el mapa y comprueba con la física real de Tick que la meta, los fotogramas, los puntos de control y el objeto perdido se pueden alcanzar.
- **Duelos** (`src/core/duelCheck.ts`): cada evento es de un tipo conocido y cae dentro de su sección, con opciones válidas (`from`, `to`, `up`, `dir`, `out`), y `encoreFrom` apunta a una sección que existe. Avisa si una fase no tiene nada que devolver.

### 11.7 `story.json`: los capítulos
- **Generales:** `secondsPerBoss` (segundos que avanza el reloj por cada jefe liberado: 7), `intro` (las tarjetas de NEW GAME) y `previously` (el resumen al volver tras más de 3 días; admite `{frames}` y `{friends}`).
- **`chapters[]`, uno por jefe:**
  - `feature`: el nivel del jefe (una persecución de `game.json` → `levels`, o un duelo: `data/levels/<id>.json` con `"type": "duel"`, que se carga solo);
  - `entry` (opcional): por dónde se entra al jefe. `"screen"` (por defecto) es la pantalla, con la bobina empalmada y enhebrada; `"lostfound"` es la caja de música de objetos perdidos, abierta desde el principio del capítulo;
  - `framesNeeded`;
  - `nowShowing` y `comingSoon`: los textos de la marquesina;
  - `interludes`: los niveles de plataformas;
  - `minigameFrames`;
  - `organGift`: el instrumento que regala al órgano;
  - `endCards`.

**Banda provisional (`placeholderMusic`)**: `key` (tonalidad, p. ej. `"G"`), `swing` (0.5 = sin swing, 0.62 = swing de jazz) y `sections`: lista de `{ name, bars, chords, intensity (1–3), train (true = percusión de tren), mood ("dark" = apagado) }`. Los acordes van en números romanos (`I`, `ii`, `IV`, `V7`, `vi`, `VI7`, `bVII`…), uno por compás.


### 11.8 Probar un jefe: skills y agentes
Cada vez que se avanza en un jefe se prueba entero, con las herramientas de `tools/playtest/` y unas skills y agentes del proyecto (en `.claude/`, que se guardan en el repositorio).
- **`tools/playtest/duel.cjs`:** juega un duelo en un navegador real con un reloj virtual (rápido y siempre igual) y un piloto automático, y da un informe en JSON: resultado, fase alcanzada, progreso, golpes (qué, dónde y cuándo), muertes y errores de la página.
  - **Modos:** `perfect` (todo en el beat), `human` (±35 ms, 5 % de fallos), `sloppy` (±70 ms, 15 %) y `events` (una captura de cada tipo de ataque, aviso y golpe, para revisarlas).
  - **Opciones:** `--phase` empieza en otra vuelta, `--seed` repite una partida, `--retry` sigue tras morir y `--out` guarda capturas.
- **`tools/playtest/sheet.py`:** junta capturas en una hoja con etiquetas para revisarlas de un vistazo.
- **Skills** (`.claude/skills/`):
  - **`boss-playtest`:** la dificultad, medida contra el listón de los jefes implacables.
  - **`boss-visual-review`:** capturas de cada ataque y de las poses, revisadas con visión: avisos, legibilidad, textos que se pisan, que el personaje sea fiel a su hoja, movimiento (nada quieto que deba moverse) y estilo de los 30.
  - **`boss-check`:** la pasada completa. Comprobaciones, pruebas y luego los dos agentes en paralelo, con un veredicto conjunto.
- **Agentes** (`.claude/agents/`): `boss-difficulty-tester` y `boss-visual-reviewer`, que siguen esas skills.
- **Pendiente:** las persecuciones (Old Smokestack) aún no tienen piloto automático; se prueban con `npm run check` y la revisión visual.

---

## 12. Hoja de ruta

| Fase | Contenido | Estado |
|------|-----------|--------|
| 0 | Diseño (este documento) | ✅ |
| 1 | Base: Vite + Phaser + TypeScript, Conductor, JSON validado, Tick, shader de película, banda provisional | ✅ |
| 2 | Nivel **Chase**: Old Smokestack con pelotita, palabras-plataforma, mundo que baila, túnel y gag final | ✅ primera versión, en pulido |
| 3 | Canción definitiva del autor + sincronización | ✅ *End of the Line* sincronizada; falta el ajuste fino jugando |
| 4 | Calibración de latencia en el menú y editor de ritmo | ✅ calibración · ⏳ editor de ritmo |
| 4b | Herramientas: sincronización en un comando, eventos anclados a palabras, comprobador de niveles, pruebas y CI | ✅ |
| 5 | Reacciones del jefe con voz (burlas y nervios), stems y música adaptativa | ⏳ |
| 5b | Mecánicas del tema en Smokestack: solos de silencio, la cuerda del reloj y el fantasma del intento anterior | ✅ |
| 5c | Guardado y vuelta rápida (§6.3): 3 partidas, CONTINUE, *Resume*, PROGRAMME, OPTIONS, puntos de control, *Rehearsal* y *"Previously at the Bijou…"* | ✅ |
| 6 | Nivel **Duel**: Miss Pirouette (fases = vueltas de llave), disparo y devolución a tiempo | ⏳ |
| 7 | La sala central, el Bijou (§6.1): zonas, ritual del proyector, fotogramas, órgano, sala que se llena, estaciones, objetos perdidos, esfera de las 11:59 | ✅ capítulo 1 (cabina, vigas, sala y vestíbulo; el sótano y el tejado, como adelanto) |
| 7b | Niveles entre jefes (§6.2): noticiario, serial, corto para cantar, recuerdos, recorridos por el edificio, cuarto de revelado y bobina fugitiva | ✅ capítulo 1 (el cuarto de revelado llega con el primer cambio de época) |
| 8 | Nivel **Last Call**: Mister Too-Late (oportunidades únicas) | ⏳ |
| 9+ | Resto de jefes, final en silencio, encore, arte aportado por el autor y publicación | ⏳ |

---

## 13. Decisiones tomadas

- Demo primero; proyecto personal que se publicará.
- Canciones y textos del juego en **inglés**.
- Primero en ordenador (teclado y mando).
- Disparo o devolución de objetos según el nivel; lo importante es **pulsar al ritmo**.
- Movimiento libre y peligros al ritmo.
- Dificultad normal exigente, **muy configurable por JSON**.
- 2D con distintas vistas según el tipo de nivel (persecución lateral, torre vertical, arena…).
- Un solo jugador.
- Arte: para la demo todo por código; más adelante, mezcla con imágenes del autor.
- Progresión de color aprobada.
- Las canciones finales las crea el autor siguiendo un *brief* con BPM, estructura y peligros; mientras tanto suena la banda provisional.
- Sonido antiguo, variando el estilo en cada nivel.
- Protagonista: **Tick**, reloj de bolsillo con péndulo de metrónomo.
- **Tema: el tiempo, su paso y la soledad.** Historia = A + B + C (§3): el reloj del proyeccionista que ya no está, el último minuto antes de medianoche y villanos a los que se les da su final.
- Todas las ideas del tema (ideas 8–14) aprobadas.
- Estructura del juego aprobada: el cine como mundo central (§6.1), cada capítulo como una sesión de cine con niveles de plataformas entre jefes (§6.2) y guardado y vuelta rápida sin repetir nada (§6.3).
- Jefes (§7): Madame Gramola descartada; entran Miss Pirouette y Mister Too-Late (oportunidades perdidas). Se empieza **solo con Old Smokestack** hasta que esté pulido.
- Nombres de los jefes en inglés aprobados.
- Controles por defecto aprobados.
- Repositorio: `github.com/LCinder/Time-s-End`.

## 14. Preguntas abiertas
- Título definitivo del juego (provisional: *Time's End*, que ahora encaja con la medianoche de la historia).
- Nombre definitivo del proyeccionista (provisional: Elias).
- ¿Qué responde a Tick al final: un latido, Elias, o queda abierto?
- Orden exacto de los jefes 4–7 y si Lady Lullamoon y Sir Tear-Off entran en la historia principal o quedan como extras.
- Herramienta con la que el autor creará las canciones.
- En persecución: ¿mantener el auto-correr (`autoRun: true`) o que haya que mantener → pulsado?
