# Brief de canción — Old Smokestack · "Full Steam Ahead"

> Jefe 1 · Nivel **Chase** (persecución) · Época **1928, blanco y negro**
> Este documento es todo lo que necesitas para componer la canción. El nivel ya está montado sobre esta estructura con una banda provisional; cuando metas tu canción, solo hay que ajustar la sincronización.

---

## 1. Datos técnicos (lo más importante)

| Campo | Valor |
|---|---|
| **BPM** | **132**, constante de principio a fin |
| Compás | 4/4 |
| Tonalidad sugerida | Sol mayor (G); el puente en Mi menor (Em) |
| Duración | **72 compases = 288 beats ≈ 2:10.9** |
| Beat 0 | El **primer tiempo del primer compás de la intro**. Lo ideal es que el archivo empiece justo ahí, sin silencio delante. |
| Formato | `song.ogg` (vale también MP3), 44,1 kHz, estéreo o mono |
| Dónde va | `public/audio/smokestack/song.ogg` |

> **Ojo con el tempo:** si la canción acelera o frena aunque sea un poco, los peligros dejan de cuadrar. Si usas IA (Suno, Udio…), pon "132 BPM" en el prompt de estilo y comprueba la canción contra un metrónomo. Si se desvía, hay dos salidas: ajustarla a la rejilla en un editor de audio (DAW), o pasarme los puntos de cambio y añado un `tempoMap` con varios tempos.

Si el archivo tiene silencio o una cuenta atrás antes del beat 0, mide cuántos milisegundos dura y ponlo en `song.offsetMs` en `public/data/levels/smokestack.json`.

---

## 2. Estilo y sonido

- **Género:** canción de tren de *hot jazz* / *ragtime* de finales de los años 20. Alegre, fanfarrona y con mucho swing (corcheas con swing, ~62 %).
- **Instrumentos:** piano *stride* / *honky-tonk*, tuba o sousáfono (el "oom-pah"), banjo, clarinete, trompeta con sordina "wah-wah", escobillas, percusión de tren ("chugga-chugga") y un **silbato de vapor** de verdad en cada "TOOT!".
- **Voz:** el villano es un barítono grave y rasposo, cantante de vodevil, chulesco y teatral; disfruta asustando. En el puente se vuelve susurrante y siniestro. Al final pasa a "oh no, no, no…" con voz cada vez más aguda y nerviosa.
- **Grabación:** suena "de época" (mono, algo de radio), pero no hace falta añadir crepitar de vinilo: el juego ya lo pone.
- **Gags musicales:** golpe de banda (*stab*) en cada palabra gritada, trombón que baja en "KER-RASH!" y caja china en los saltitos del carbón.

---

## 3. Estructura

| Sección | Compases | Beats | Tiempo | Notas |
|---|---|---|---|---|
| Intro | 1–4 | 0–15 | 0:00.0 | Instrumental. Silbato y tren arrancando. *(Aquí el jugador aprende a saltar al ritmo.)* |
| Estrofa A | 5–20 | 16–79 | 0:07.3 | 8 frases de 2 compases |
| Estribillo 1 | 21–28 | 80–111 | 0:36.4 | Banda completa |
| Estrofa B | 29–44 | 112–175 | 0:50.9 | 8 frases de 2 compases |
| Estribillo 2 | 45–52 | 176–207 | 1:20.0 | Banda completa |
| Puente (túnel) | 53–60 | 208–239 | 1:34.5 | **Oscuro**, menor y apagado. Sube la tensión hasta "QUICK!" |
| Estribillo final | 61–68 | 240–271 | 1:49.1 | El villano se da cuenta del puente roto |
| Outro | 69–72 | 272–287 | 2:03.6 | Celebración / acorde final en el beat 288 |

Acordes de referencia (uno por compás):
- **Intro:** G · E7 · A7 · D7
- **Estrofas:** G G C C G G A7 D7 · G G C C G E7 A7 D7
- **Estribillos:** G D7 D7 G C G A7 D7
- **Puente:** Em Em Am Am Em Em D7 D7
- **Outro:** G C G G

---

## 4. Letra con tiempos

Formato: **beat de inicio de la frase** (y su tiempo). Las palabras en **MAYÚSCULAS** son **gritadas**, y deben caer **exactamente** en el beat indicado, porque en ese instante aparece el peligro.

### Estrofa A
| Beat | Tiempo | Letra | Lo que pasa en el juego |
|---|---|---|---|
| 16 | 0:07.3 | Well, howdy there, little ticker, you're runnin' mighty slow! | |
| 24 | 0:10.9 | I'm the meanest hunk of iron on the Bijou railroad! | |
| 32 | 0:14.5 | I got coal inside my belly and a whistle in my throat, | |
| 40 | 0:18.2 | So listen close, my little clock, here comes my favorite note... **TOOT!** (beat 46) | El silbato lanza una onda que llega a Tick en el **beat 48** |
| 48 | 0:21.8 | Now wouldn't it be a pity? Wouldn't it be a shame, | |
| 56 | 0:25.5 | if a **BOXCAR** (57) came a-tumblin' down and flattened (60) out your frame? | La palabra BOXCAR cae como plataforma (57); un vagón aplasta a Tick en el **beat 60** |
| 64 | 0:29.1 | And wouldn't it be tragic? Wouldn't it be grim, | |
| 72 | 0:32.7 | if a pile of hoppin' **COAL** (75) came a-bouncin' on your limbs? | Tres trozos de carbón vivos llegan saltando en cada beat a partir del 76 |

### Estribillo (se repite en los beats 80, 176 y 240)
| Beat | Letra | Lo que pasa |
|---|---|---|
| +0 | Full steam ahead! Chugga chugga choo! | Huecos en la vía en "ahead!" |
| +8 | Full steam ahead! I'm comin' after you! | La locomotora **embiste** al final de la frase |
| +16 | Tick-tock, little clock, your time is runnin' through! | Anillos de humo |
| +24 | Full steam ahead! **TOOT! TOOT!** (+28, +29) Choo-choo! | Dos ondas de silbato seguidas |

### Estrofa B
| Beat | Tiempo | Letra | Lo que pasa |
|---|---|---|---|
| 112 | 0:50.9 | I've flattened forty pocket-watches, sixty cuckoo clocks, | |
| 120 | 0:54.5 | I ran down a grandfather and I squashed his tick-a-tocks! | |
| 128 | 0:58.2 | So wouldn't it be dreadful? Wouldn't it be sad, | |
| 136 | 1:01.8 | if an **ANVIL** (137) fell from heaven? Golly (140), wouldn't that be bad (142)! | Yunques en el **140** y el **142** |
| 144 | 1:05.5 | And wouldn't it be awful? Wouldn't it be cruel, | |
| 152 | 1:09.1 | if a **PIANO** (153) played your funeral, you (156) silly little fool? | Piano en el **156** |
| 160 | 1:12.7 | I'll derail your little gears, kid, I'll unwind your spring, | Anillos de humo en 162, 164 y 166 |
| 168 | 1:16.4 | 'Cause a watch ain't worth a nickel when it's lost its ting-a-ling! | Embestida en el 172 |

### Puente — el túnel (oscuridad total, solo se ven los faros)
| Beat | Tiempo | Letra |
|---|---|---|
| 208 | 1:34.5 | Here comes the tunnel, and it's dark as tar, |
| 216 | 1:38.2 | Can't see the tracks, kid, can't see how far, |
| 224 | 1:41.8 | But I can hear you tickin'... tick (228)... tick (229)... tick (230)... |
| 232 | 1:45.5 | So run, little ticker, 'cause I'm comin' up **QUICK!** (238), la gran embestida |

### Estribillo final + gag
| Beat | Tiempo | Letra | Lo que pasa |
|---|---|---|---|
| 240 | 1:49.1 | Full steam ahead! Chugga chugga choo! | |
| 248 | 1:52.7 | Full steam ahead! I'm almost onto you! | |
| 256 | 1:56.4 | Tick-tock, little clock, your time is... wait, what's **THAT?!** (262) | Aparece el cartel BRIDGE OUT! |
| 264 | 2:00.0 | The **BRIDGE** (264.5) is **OUT?!** (266) Oh no, no, no... **KER-RASH!** (270) | La palabra BRIDGE *es* el puente por el que cruza Tick. La locomotora se queda colgando en el aire (gag clásico de los dibujos) y se estrella en el **270** |

---

## 5. Lista de sincronización crítica

Estas palabras deben caer **en el beat exacto**:

`TOOT 46 · BOXCAR 57 · flattened 60 · COAL 75 · TOOT 108 · TOOT 109 · ANVIL 137 · Golly 140 · bad 142 · PIANO 153 · you 156 · TOOT 204 · TOOT 205 · QUICK 238 · THAT 262 · BRIDGE 264.5 · OUT 266 · KER-RASH 270`

Si cambias la letra o la métrica, no pasa nada: se ajustan los números en `smokestack.json` (`lyrics[].at` y `events[].beat`).

---

## 6. Extras opcionales (para más adelante)

- **Stems** por separado: `drums.ogg`, `bass.ogg`, `music.ogg`, `vocals.ogg`. Sirven para la música adaptativa.
- **Burlas** (2–3 frases cortas sueltas) para cuando el jugador recibe un golpe: *"Ha! Clean your gears!"*
- **Nervios** (2–3 frases) para cuando el jugador encadena muchos saltos a tiempo: *"H-hey, slow down, kid!"*
