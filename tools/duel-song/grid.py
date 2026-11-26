"""The beat grid of each part of a song: quarter-note tempo and where a beat falls.
  python -I grid.py song.wav   (edit the (from, to) parts in the loop below)"""
import sys, numpy as np, librosa
y, sr = librosa.load(sys.argv[1], sr=22050, mono=True)
hop=64
oenv = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop, aggregate=np.median)
fr = sr/hop
S=np.abs(librosa.stft(y, hop_length=hop, n_fft=2048)); f=librosa.fft_frequencies(sr=sr,n_fft=2048)
bass=np.maximum(0,np.diff(np.log1p(S[(f>40)&(f<250)].sum(axis=0)),prepend=0))
def val(env,t): 
    i=np.clip((t*fr).astype(int),0,len(env)-1); return env[i]
for a,b in [(0,104),(13,104),(104,181),(181,246),(13,246)]:
    best=(0,)
    for bpm in np.arange(184,191,0.02):
        p=60/bpm; 
        for ph in np.linspace(0,p,40,endpoint=False):
            t=np.arange(a+ph,b,p); sc=val(oenv,t).mean()
            if sc>best[0]: best=(sc,bpm,ph)
    sc,bpm,ph=best; p=60/bpm
    t=np.arange(a+ph,b,p)
    # downbeat: which of 3 positions has most bass
    bs=[val(bass,t[k::3]).mean() for k in range(3)]
    k=int(np.argmax(bs))
    print(a,b,'bpm %.2f'%bpm,'first beat %.3f'%(a+ph),'downbeat offset',k,'first downbeat %.3f'%t[k],[round(x,3) for x in bs])
