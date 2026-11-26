# Meter la canción de un duelo en el juego

Un duelo dura lo que tarde el jugador, así que el juego no reproduce la canción de corrido. Cada
estrofa suena entera una vez y después su estribillo instrumental se repite (sin voz) hasta que
la cuerda del jefe baja lo bastante; entonces entra la siguiente estrofa (ver MAIN.md, Miss Pirouette).
Lo que el juego necesita, por cada vuelta (fase) del duelo:

- `public/audio/<jefe>/pN.mp3`: las estrofas de esa vuelta seguidas, ya al tempo de la vuelta;
- `public/audio/<jefe>/pN-loop.mp3`: lo mismo sin la voz (para los estribillos);
- en el JSON del nivel, `phases[i].audio = { song, loop, at }` (`at`: segundo del archivo en que
  cae el beat 0 de la vuelta), `bpm` exacto, y en cada estrofa `beats`, `loopFrom` y, si hace
  falta, `loopAt`. Además `audio.intro` (la entrada hablada) y `audio.outro` (la despedida).

## Pasos (así se hizo *Mirror on the Lid*)

Con un Python que tenga `numpy librosa soundfile faster-whisper onnxruntime` (sin torch):

1. **Letra con tiempos:** `python -I words.py cancion16k.wav small.en words.json` (wav mono a
   16 kHz con ffmpeg). Dice dónde empieza cada estrofa y dónde hay huecos sin voz.
2. **Pulso:** `python -I grid.py cancion.wav`, el tempo en negras y un beat de cada parte. Suno
   no siempre cambia de tempo aunque se lo pidas: *Mirror on the Lid* va a unas 187 negras por
   minuto toda la canción. Un beat del juego son dos negras.
3. **Instrumental:** `python -I separate.py UVR-MDX-NET-Inst_HQ_3.onnx cancion44k.wav inst.wav voz.wav`.
   Comprobación: pasar `words.py` por el instrumental no debe oír ninguna palabra.
4. **Cortes:** en `plan.py`, la rejilla de cada parte, la velocidad de cada vuelta y la primera
   palabra de cada estrofa; calcula dónde empieza cada estrofa en beats enteros (`plan.json`).
5. **Archivos:** con ffmpeg, cada vuelta de la canción y del instrumental, estirada sin cambiar
   el tono (`-af rubberband=tempo=1.1:pitchq=quality`), a mp3 de 128 kbps.
6. **Nivel:** `python -I remap.py nivel.json nuevo.json` ajusta `beats`, `loopFrom` (los últimos 8
   compases; 4 en estrofas cortas) y mueve los eventos con su estrofa. Después se colocan a mano
   los ataques que nombra la letra en su palabra (el giro en "TWIRL", la tapa en "HUSH"…): el
   informe de `remap.py` da el beat de cada palabra.
7. **Empalmes:** `python -I loops.py nivel.json <carpeta con pN-loop.wav>` busca, para cada
   estribillo, los compases del instrumental que mejor empalman con la vuelta a la canción y
   escribe `loopAt`.
8. `npm run check` y `npm test`, y probar con `?duel=<jefe>`.
