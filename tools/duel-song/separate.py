"""Separate the voice from a song with the UVR MDX-Net Inst HQ 3 model (ONNX, CPU, no torch).
  python -I separate.py UVR-MDX-NET-Inst_HQ_3.onnx song44k.wav instrumental.wav vocals.wav
Model: https://huggingface.co/seanghay/uvr_models (UVR-MDX-NET-Inst_HQ_3.onnx). Needs numpy, librosa,
soundfile, onnxruntime. About 2 minutes of CPU per minute of song."""
import sys, numpy as np, librosa, soundfile as sf, onnxruntime as ort
NFFT, HOP, DIMF, SEG, COMP = 6144, 1024, 3072, 256, 1.022
sess = ort.InferenceSession(sys.argv[1], providers=["CPUExecutionProvider"])
mix, sr = librosa.load(sys.argv[2], sr=44100, mono=False)
mix = mix.astype(np.float32)
trim = NFFT // 2; chunk = HOP * (SEG - 1); gen = chunk - 2 * trim
pad = gen + trim - (mix.shape[-1] % gen)
mixture = np.concatenate((np.zeros((2, trim), np.float32), mix, np.zeros((2, pad), np.float32)), 1)
overlap = 0.5; step = int((1 - overlap) * chunk)
res = np.zeros((2, mixture.shape[-1]), np.float32); div = np.zeros_like(res)
win_stft = np.hanning(NFFT + 1)[:-1]
def stft(x):  # x (2,T) -> (1,4,DIMF,256)
    out = []
    for c in range(2):
        S = librosa.stft(x[c], n_fft=NFFT, hop_length=HOP, window=win_stft, center=True, pad_mode="reflect")
        out += [S.real, S.imag]
    a = np.stack(out)[:, :DIMF, :]
    return a[None].astype(np.float32)
def istft(a):
    a = a[0]; T = a.shape[-1]
    full = np.zeros((4, NFFT // 2 + 1, T), np.float32); full[:, :DIMF] = a
    ys = []
    for c in range(2):
        S = full[2*c] + 1j * full[2*c+1]
        ys.append(librosa.istft(S, n_fft=NFFT, hop_length=HOP, window=win_stft, center=True, length=chunk))
    return np.stack(ys)
n = 0
for i in range(0, mixture.shape[-1], step):
    end = min(i + chunk, mixture.shape[-1]); act = end - i
    part = mixture[:, i:end]
    if act < chunk: part = np.concatenate((part, np.zeros((2, chunk - act), np.float32)), 1)
    spek = stft(part); spek[:, :, :3, :] = 0
    pos = sess.run(None, {"input": spek})[0]; neg = sess.run(None, {"input": -spek})[0]
    pred = pos * 0.5 - neg * 0.5
    y = istft(pred)
    w = np.tile(np.hanning(act)[None], (2, 1))
    res[:, i:end] += y[:, :act] * w; div[:, i:end] += w
    n += 1; print(n, end=" ", flush=True)
inst = (res / np.maximum(div, 1e-8))[:, trim:trim + mix.shape[-1]]
sf.write(sys.argv[3], inst.T, 44100)
voc = mix - inst * COMP
sf.write(sys.argv[4], voc.T, 44100)
print("done")
