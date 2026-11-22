# Análisis de canciones → nivel

Scripts para sincronizar el nivel con una canción real (los usé con *End of the Line*).

1. **`beats.py`**: detecta el tempo y la posición de cada beat (librosa).
2. **`words.py`**: transcribe la voz con faster-whisper y saca el momento de cada palabra.
3. **`align.py`**: cruza la letra prevista (lista `LINES` dentro del script) con la transcripción, ajusta cada palabra al ataque de voz más cercano y la convierte a beats.
4. **`gen_level.py`**: genera `smokestack.json`:
   - el mapa de tempo, suavizado y con un punto por compás;
   - el `offsetMs` (incluye una corrección de fase de −25 ms medida contra la percusión);
   - la letra con sus tiempos;
   - la lista de eventos, escrita dentro del script.

```powershell
python -m venv venv
venv\Scripts\pip install librosa faster-whisper soundfile
venv\Scripts\python -I beats.py song.mp3 beats.json
venv\Scripts\python -I words.py song.mp3 words.json small.en
venv\Scripts\python -I align.py beats.json words.json aligned.json song.mp3
venv\Scripts\python -I gen_level.py beats.json aligned.json ..\..\public\data\levels\smokestack.json -25
```

Para otro jefe: cambia `LINES` en `align.py` y la lista de eventos en `gen_level.py`, o edita el JSON a mano después.
