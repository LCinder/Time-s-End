# Sincronizar una canción con su nivel

Desde la raíz del proyecto:

```bash
npm run audio -- madame-gramola
```

Es el comando completo para cualquier jefe nuevo o existente:
1. Busca la canción en `public/audio/<jefe>/` (`song.mp3`, o el único archivo de audio de la carpeta: `.mp3`, `.ogg`, `.wav`, `.m4a` o `.flac`).
2. Si el nivel no existe, **lo crea** en `public/data/levels/<jefe>.json`, con la duración de la canción, y lo añade a `game.json`. Si renombraste el audio, corrige `song.file`.
3. Busca un Python con librosa y faster-whisper. **La primera vez lo instala solo**, en `tools/song-analysis/.venv`.
4. Ejecuta `sync_song.py`, explicado abajo. **Si no hay `lyrics.txt`, escribe un borrador** con lo que oye Whisper, para que solo tengas que corregirlo.
5. Pasa el comprobador de niveles al resultado y te dice cómo probarlo.

`npm run audio` sin nada lista los jefes de `public/audio` y lo que le falta a cada uno.

| Opción (después de `--`) | Para qué |
|---|---|
| `--name "Madame Gramola"` | Nombre del jefe en el cartel (niveles nuevos; por defecto sale de la carpeta) |
| `--title "SPIN ME ROUND"` | Título del corto (niveles nuevos; por defecto, el nombre en mayúsculas) |
| `--fast` | Whisper escucha una vez en lugar de tres (más rápido, menos fiable) |
| `--passes 1\|2\|3`, `--bpm`, `--phase-ms`, `--model`, `--no-cache`, `--dry-run` | Se pasan a `sync_song.py` (ver la tabla de abajo) |
| `--no-check` | No ejecuta el comprobador al final |

**Flujo para un jefe nuevo:**
1. Crea la carpeta `public/audio/<jefe>/` con la canción y, si la tienes, la letra en `lyrics.txt`.
2. Ejecuta `npm run audio -- <jefe>`.
3. Si no había letra, corrige el borrador.
4. Vuelve a ejecutarlo; tarda segundos gracias a la caché.
5. Prueba en `http://localhost:5173/?level=<jefe>&debug=1`.
6. Añade los peligros anclados a palabras.

Tiempos en un portátil normal: la primera vez, entre 2 y 4 minutos (más la instalación); las siguientes, unos 20 segundos.

Por debajo, `npm run audio` llama a `sync_song.py`, que también se puede usar directamente:

```bash
python sync_song.py smokestack
```

## Qué necesita

1. **El audio.** El nivel lo indica en `song.file` (por ejemplo, `public/audio/smokestack/song.mp3`).
2. **La letra.** Va en un `lyrics.txt` junto al audio: una línea por verso, igual que la pegas en Suno.
   - `[verse 1]`, `[chorus]`… marcan las secciones (solo salen en el informe).
   - `^PALABRA` marca una palabra gritada.
   - `palabra@146.1` fija una palabra a un beat exacto, si la transcripción la falla.
   - `# …` es un comentario.

   Ejemplo completo: [`public/audio/smokestack/lyrics.txt`](../../public/audio/smokestack/lyrics.txt).

## Qué hace

1. **Busca el pulso con librosa.** Saca el mapa de tempo (un punto por compás) y el beat 0. La corrección de fase se calcula sola contra la percusión.
2. **Transcribe la voz con faster-whisper, tres veces** y con un contexto distinto cada vez. Con voz cantada, Whisper mueve algunas palabras según el contexto; por eso cada palabra se queda con el momento en que coinciden al menos dos de las tres pasadas. Las transcripciones se guardan en `.cache/`, así que las siguientes ejecuciones tardan segundos.
3. **Cuadra la letra escrita con lo que oyó.** Tolera palabras mal entendidas ("truck" por "trunk", "tugga" por "chugga"). Además, ajusta cada palabra al ataque de voz más cercano y separa las repeticiones que Whisper junta ("TOOT! TOOT!").
4. **Escribe en el JSON del nivel solo** `song.offsetMs`, `song.tempoMap` y `lyrics`. **Los eventos no se tocan.**

## El informe

- `?` = palabra no oída (se coloca entre sus vecinas).
- `~` = dudosa (las pasadas no coinciden o Whisper no estaba seguro).
- `@` = fijada a mano.
- `(was …)` = cuánto se ha movido cada verso.
- **Eventos anclados** que cambian de beat.
- **Avisos** si el beat 0 se ha desplazado, porque entonces los eventos con un `beat` fijo quedarían descolocados.

Después, ejecuta `npm run check` para comprobar que el nivel sigue siendo justo.

## Opciones

| Opción | Para qué |
|---|---|
| `--dry-run` | Muestra el informe sin escribir nada |
| `--bpm 134` | Pista de tempo si detecta el doble o la mitad |
| `--phase-ms -25` | Corrección de fase fija en vez de la automática |
| `--model medium.en` | Otro modelo de Whisper (más lento y más preciso) |
| `--no-cache` | Vuelve a transcribir |
| `--passes 1` | Whisper escucha una sola vez (más rápido, menos fiable; por defecto 3) |
| `--length auto` | Ajusta también `song.lengthBeats` al final de la canción (lo usa `npm run audio` en niveles nuevos) |

Si falta `lyrics.txt`, el script escribe un **borrador** a partir de la transcripción: corta las líneas en las pausas y las secciones en las pausas largas. Corrígelo y vuelve a ejecutar.

## Instalación (una vez)

`npm run audio` lo hace solo. A mano:

```bash
python -m venv venv
venv\Scripts\pip install librosa faster-whisper soundfile
venv\Scripts\python -I sync_song.py smokestack
```

En Linux o macOS, `venv/bin/...`. La primera vez se descarga el modelo de Whisper (unos 500 MB) desde huggingface.co. El audio se decodifica con librosa, así que no hace falta PyAV.

## Pruebas

```bash
python -m unittest discover tools/song-analysis
```

Solo necesitan numpy. También se ejecutan en GitHub en cada cambio.
