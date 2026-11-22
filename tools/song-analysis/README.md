# Sincronizar una canción con su nivel

Un solo comando hace todo el trabajo:

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

## Instalación (una vez)

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
