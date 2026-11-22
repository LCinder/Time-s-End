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
| `?level=smokestack` | Salta el menú y va directo al nivel |
| `?beat=200` | Empieza el nivel en ese beat (modo práctica) |
| `?diff=hard` | Fuerza una dificultad |
| `?debug=1` | Muestra el panel de depuración (beat, compás, próximos eventos…) |

Ejemplo: `http://localhost:5173/?level=smokestack&beat=204&debug=1` empieza justo antes del túnel.

**Teclas en partida:** `F1` muestra u oculta la depuración · `R` reinicia · `Esc` pausa.

**Canción:** *End of the Line* (hecha con Suno) está en `public/audio/smokestack/song.mp3`. El nivel está sincronizado con ella:
- mapa de tempo real de ~134 BPM, que acelera a ~137 en el estribillo final;
- cada palabra de la letra en su momento exacto;
- los peligros recolocados sobre su estructura.

Si el archivo no existe, suena la banda provisional generada por código. Los scripts para analizar una canción y regenerar el nivel están en [tools/song-analysis](tools/song-analysis/README.md). El brief original está en [docs/songs/old-smokestack-full-steam-ahead.md](docs/songs/old-smokestack-full-steam-ahead.md).

---

---

## 1. Visión

Un juego 2D para **navegador** con estética de **dibujos animados de los años 30** (estilo *rubber hose*: brazos de manguera, ojos de porción de tarta, guantes blancos, todo rebotando al ritmo). Cada nivel es un **corto animado** protagonizado por un jefe que **canta su propia canción**, y la letra **anuncia lo que va a pasar**: si el jefe canta *"what a shame if a piano fell on you…"*, un piano cae justo en el tiempo fuerte.

Los niveles alternan entre **derrotar al jefe** (duelos) y **huir / progresar** mientras el jefe te persigue (persecuciones, torres, etc.).

**Inspiraciones:** el estilo de animación de los años 30 (Fleischer, Disney, Van Beuren) y la idea de los jefes que cantan en juegos de ritmo y plataformas.
**Regla legal:** todo es **original** (personajes, diseños, canciones y nombres). No copiamos personajes, diseños ni canciones de ningún juego o estudio existente.

### Pilares
1. **La canción ES el nivel.** Cada peligro está escrito en la letra y cae al compás.
2. **Memorable.** Cada jefe tiene un estilo musical, una mecánica y un momento estrella propios.
3. **Exigente pero justo.** Todo peligro se avisa (con la letra, el aviso visual y el ritmo) antes de golpear.
4. **Configurable.** Dificultad, ritmo, eventos y niveles se definen en **JSON** que el autor puede editar sin tocar código.

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

---

## 3. Historia (borrador)

El viejo cine **"The Bijou"** ha cerrado. En la cabina de proyección, el reloj del proyeccionista (**nuestro protagonista**) despierta y descubre que los villanos de las bobinas se han escapado de sus cortos y le han robado al cine **el color y la música**. Para devolverle la vida al cine, el protagonista entra en cada bobina, sobrevive a la canción de cada villano y recupera un poco de color.

- El **mapa del juego** es la cabina de proyección / la sala del cine: cada bobina es un nivel.
- Cada nivel empieza con un **cartel de título** al estilo de los 30 y termina con *"That's all, folks?"*… o algo propio (por definir).

---

## 4. Protagonista ✅

**"Tick"**, un **reloj de bolsillo con patas** que tiene un **péndulo de metrónomo** colgando.
- El péndulo **oscila siempre al beat** (llega a su extremo en cada tiempo), así que es el indicador de ritmo integrado en el personaje.
- Las agujas del reloj le hacen de bigotito y giran solas.
- Tiene guantes blancos, zapatones y ojos de porción de tarta.
- Más adelante: la tapa se abrirá y cerrará al disparar (niveles Duel).

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

---

## 6. Tipos de nivel

| Tipo | Vista / cámara | Objetivo |
|------|----------------|----------|
| **Duel** | Arena fija | Bajar la vida del jefe en varias fases (cada fase con un estilo musical distinto). |
| **Chase** | *Scroll* lateral automático; el jefe persigue desde detrás | Llegar al final de la canción. |
| **Tower** | *Scroll* vertical hacia arriba; algo sube por debajo | Subir hasta la cima antes de que te alcance. |
| **Call & Response** | Arena fija | El jefe enseña un patrón en la estrofa y en el estribillo lo repite más rápido. |
| **Lullaby** (sigilo) | Arena o *scroll* lento | Moverte solo cuando la música suena fuerte; en los silencios, quieto o el jefe despierta. |
| **Vehicle** | *Scroll* lateral de disparos (biplano, tren, bañera…) | Sobrevivir y disparar al ritmo. |
| **Vaudeville** | Escenario de teatro | El público lanza cosas y el jefe presenta números del espectáculo. |

---

## 7. Jefes (7 iniciales)

| # | Jefe (nombre en inglés) | Concepto | Tipo de nivel | Época / paleta | Estilo musical |
|---|-------------------------|----------|---------------|----------------|----------------|
| 1 | **Old Smokestack** | Locomotora con cara, bigote de humo, muy fanfarrona | Chase | 1928 B/N | Ragtime / swing de tren |
| 2 | **Madame Gramola** | Diva fonógrafo; cada disco que pone es una fase | Duel | 1928 B/N | Tango → Polka → Charlestón |
| 3 | **Baron Bonejangle** | Esqueleto elegante que toca su costillar como un xilófono | Duel con plataformas | 1930 sepia | Danza macabra / foxtrot |
| 4 | **Captain Squidwhisker** | Pulpo pirata con bigote de tentáculos | Tower (mástil mientras el barco se hunde) | 1930 sepia | Saloma marinera |
| 5 | **Lady Lullamoon** | Luna con insomnio que solo quiere dormir | Lullaby | 1932 Technicolor de dos tonos | Nana / vals |
| 6 | **Mister Thunderhead** | Nube de tormenta con chistera | Vehicle (biplano) | 1932 Technicolor de dos tonos | Gospel / boogie-woogie |
| 7 | **Maestro Baton** | Director de orquesta gigante que controla la banda sonora del juego | Chase → Duel | 1935 todo color | Big band / popurrí de todos los jefes |

**Reglas de diseño de jefes:**
- Cada jefe tiene un **momento estrella** (un gag visual grande sincronizado con el clímax de la canción).
- Cada jefe tiene un rasgo de silueta reconocible al instante (nada de "mancha negra con ojos": siluetas variadas).
- Cada jefe tiene unas **líneas alternativas** de burla (cuando fallas) y de nervios (cuando vas bien).

### Demo (alcance)
- **Primero solo el Jefe 1, Old Smokestack (Chase)**, hasta pulirlo. Después, Madame Gramola (Duel) y el resto.
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
- Final: un abismo enorme. Las palabras que canta el jefe (BRIDGE, OUT?!, NO!, NO!, NO!, NO!) caen como piedras por las que Tick va saltando. La locomotora sigue corriendo en el aire, se da cuenta, dice adiós con la mano… y ¡KER-RASH! La canción sigue sonando bajo el cartel de victoria.

---

## 8. Arte y animación

### 8.1 Estilo
- **Rubber hose:** extremidades curvas sin codos, guantes blancos, ojos de porción de tarta y siluetas redondas.
- Animación de personajes **"a doses" (12 fps)**, mientras que el juego y la física van a 60 fps.
- **Line boil:** el trazo tiembla ligeramente cada pocos fotogramas, como un dibujo a mano.

### 8.2 Técnica (demo: todo generado por código)
- **Rig por piezas:** la cabeza, el torso y los guantes son formas vectoriales, y las **extremidades son curvas Bézier gruesas** controladas por código. El estiramiento y aplastamiento van sincronizados al beat.
- **Shader de película** (post-proceso): grano, rayas verticales, motas de polvo, viñeta, parpadeo de brillo y vaivén de la imagen.
- **Paletas por época:** `bw1928`, `sepia1930`, `twoStrip1932` y `full1935`, aplicadas por shader (así el mismo arte sirve para todas las épocas).
- **Fondos:** capas con *parallax*, con textura de acuarela o papel generada por código.

### 8.3 Futuro (mezcla)
- El autor puede aportar imágenes de enemigos. A partir de ellas se generan vistas y poses, y se integran en el rig o como *sprite sheets*.
- Opcionalmente, fondos generados con IA.

---

## 9. Música y canciones

### 9.1 Principios
- Sonido **antiguo** (de grabación de los años 30: algo de crepitar de vinilo y un ecualizador "de radio"), variando de género en cada jefe.
- **Canciones en inglés.**
- La palabra del peligro cae en un **tiempo fuerte**, y se anuncia **1–2 beats antes** en la letra.

### 9.2 Flujo de trabajo
1. **Diseño conjunto:** para cada jefe escribimos un *brief* con el BPM, la estructura por compases y la lista de peligros, y a cada peligro le corresponde una línea de la letra.
2. **Música provisional:** mientras tanto, el juego usa una pista instrumental generada por código con el **mismo BPM y estructura**, para poder diseñar y probar ya.
3. **Canción final:** la crea el autor siguiendo el *brief*.
4. **Ajuste:** con el editor de ritmo se ajustan el `offset` y los eventos a la grabación final.

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
- Calibración de latencia en el menú de opciones (pulsar al ritmo para medir la latencia de audio y de entrada).

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
                lyrics.ts, validate.ts (validación de JSON), types.ts, Game.ts
    audio/      AudioEngine.ts (cadena "vintage"), Synth.ts (instrumentos + SFX),
                Songs.ts (archivo real o banda provisional), chords.ts, Sfx.ts
    entities/   Player.ts (Tick), Smokestack.ts (jefe), hazards.ts (peligros)
    rig/        Ink.ts (trazo de tinta, extremidades de manguera, line boil)
    fx/         FilmPipeline.ts (shader de película), Textures.ts (texturas por código)
    world/      Scenery.ts (fondo que baila), Track.ts (vías y huecos), Solids.ts
    ui/         LyricsUI.ts (pelotita), Hud.ts
    scenes/     Boot, Error, Splash, Title, TitleCard, Chase
  public/
    data/config/   game.json, difficulty.json, controls.json
    data/levels/   smokestack.json
    audio/smokestack/song.ogg   (cuando exista)
```

---

## 11. Configuración por JSON (editable por el autor)

Todo lo que hay en `public/data/` se puede editar con cualquier editor de texto. Para ver los cambios basta con **recargar la página (F5)**. Si un JSON tiene un error, el juego muestra una pantalla que indica **qué archivo y qué campo** fallan.

### 11.1 `config/game.json`: ajustes globales
| Campo | Qué hace |
|---|---|
| `audioOffsetMs` | Compensa el retraso del audio. Si notas que los golpes llegan **antes** que la música, súbelo (prueba con 30, 60…) |
| `inputOffsetMs` | Compensa el retraso del teclado o el mando al juzgar "a tiempo" |
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
  "lyrics": [ ... ],
  "events": [ ... ],
  "placeholderMusic": { ... }
}
```
*(En el JSON real no se pueden escribir comentarios `//`; aquí solo sirven para explicar.)*

**Letra (`lyrics`)**: una entrada por frase.
```json
{ "beat": 56, "text": "if a ^BOXCAR came a-tumblin' down", "at": [0, 0.5, 1, 2, 2.5, 3] }
```
- `beat`: beat en el que empieza la frase.
- `text`: las palabras. Si una empieza por `^`, es **gritada** (más grande y con golpe de banda).
- `at`: beat de cada palabra, relativo al inicio de la frase. Debe haber tantos números como palabras. Si se omite, las palabras se reparten solas en `length` beats (6 por defecto).

**Eventos (`events`)**: todos llevan `type` y `beat`. Opcionales en todos: `"only": ["hard"]` (solo aparece en esas dificultades) y `"comment"` (una nota tuya, el juego la ignora).

| `type` | Campos | Qué hace |
|---|---|---|
| `gap` | `lengthBeats` | Hueco en la vía. Tick llega al borde en `beat` si va a la altura del ancla → **salta en ese beat** |
| `drop` | `object` (`boxcar`, `anvil`, `piano`, `trunk`), `x` (`"player"` o X de pantalla), `telegraphBeats` | El objeto cuelga arriba, una sombra marca dónde caerá y **aterriza exactamente en `beat`**. Después se queda en la vía como obstáculo |
| `lyricObject` | `word`, `x` (X de pantalla, 760 por defecto), `height` (px sobre el suelo, 120 por defecto; 0 = a ras de vía), `lifeBeats` | Una palabra cantada cae del cielo y se convierte en **plataforma** en `beat`. Desaparece tras `lifeBeats` |
| `groundWave` | `travelBeats` (2) | Onda del silbato que sale del jefe y **llega al ancla en `beat`**. Hay que saltarla |
| `coal` | `count` (3), `spacingBeats` (1), `landX` (1020), `hopPx` (60) | Carbón vivo: la chimenea lo lanza, aterriza en `beat` y luego salta hacia Tick en cada beat |
| `smokeRing` | `x` (`"player"` o X), `travelBeats` (2) | Anillo de humo lanzado en parábola que aterriza en `beat` |
| `bossLunge` | `telegraphBeats`, `distance` (230) | El jefe coge carrerilla y **embiste**, con el pico en `beat`. Hay que ir por delante |
| `tunnel` | `lengthBeats` | Oscuridad: solo se ven Tick y el faro del jefe. La música suena apagada |
| `sign` | `text`, `x` (1100) | Cartel de madera en la vía |
| `bossFall` | `crashBeat` (por defecto `beat` + 4) | Gag final: el jefe sigue corriendo en el aire sobre el abismo, se da cuenta, dice adiós con la mano y se estrella en `crashBeat` |
| `shake` | `intensity` (0.01), `durationBeats` (1) | Sacudida de cámara |

**Banda provisional (`placeholderMusic`)**: `key` (tonalidad, p. ej. `"G"`), `swing` (0.5 = sin swing, 0.62 = swing de jazz) y `sections`: lista de `{ name, bars, chords, intensity (1–3), train (true = percusión de tren), mood ("dark" = apagado) }`. Los acordes van en números romanos (`I`, `ii`, `IV`, `V7`, `vi`, `VI7`, `bVII`…), uno por compás.

---

## 12. Hoja de ruta

| Fase | Contenido | Estado |
|------|-----------|--------|
| 0 | Diseño (este documento) | ✅ |
| 1 | Base: Vite + Phaser + TypeScript, Conductor, JSON validado, Tick, shader de película, banda provisional | ✅ |
| 2 | Nivel **Chase**: Old Smokestack con pelotita, palabras-plataforma, mundo que baila, túnel y gag final | ✅ primera versión, en pulido |
| 3 | Canción definitiva del autor + sincronización | ✅ *End of the Line* sincronizada; falta el ajuste fino jugando |
| 4 | Calibración de latencia en el menú y editor de ritmo | ⏳ |
| 5 | Reacciones del jefe con voz (burlas y nervios), stems y música adaptativa | ⏳ |
| 6 | Nivel **Duel**: Madame Gramola (fases = discos), disparo y devolución a tiempo | ⏳ |
| 7 | Mapa del cine con bobinas y progresión de color | ⏳ |
| 8+ | Resto de jefes, encore, arte aportado por el autor y publicación | ⏳ |

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
- Historia del cine aprobada.
- 7 jefes iniciales, ampliables. Se empieza **solo con Old Smokestack** hasta que esté pulido.
- Nombres de los jefes en inglés aprobados.
- Controles por defecto aprobados.
- Repositorio: `github.com/LCinder/Time-s-End`.

## 14. Preguntas abiertas
- Título definitivo del juego (provisional: *Time's End*).
- Herramienta con la que el autor creará las canciones.
- En persecución: ¿mantener el auto-correr (`autoRun: true`) o que haya que mantener → pulsado?
