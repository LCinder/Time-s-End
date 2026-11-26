import json, sys, numpy as np, librosa
rates={1:1.0,2:1.1,3:1.25}
out={}
for p in (1,2,3):
    y,sr=librosa.load(f'dec_p{p}-loop.wav',sr=22050)
    hop=128; fr=sr/hop
    oenv=librosa.onset.onset_strength(y=y,sr=sr,hop_length=hop)
    tempo,beats=librosa.beat.beat_track(onset_envelope=oenv,sr=sr,hop_length=hop,start_bpm=187.3*rates[p],tightness=600,trim=False)
    bt=librosa.frames_to_time(beats,sr=sr,hop_length=hop)
    ibi=np.diff(bt); med=np.median(ibi)
    print(p,'tempo',np.round(tempo,2),'n',len(bt),'ibi med',round(med,4),'min',round(ibi.min(),3),'max',round(ibi.max(),3), 'outliers',int(np.sum(np.abs(ibi-med)>0.15*med)))
    S=np.abs(librosa.stft(y,n_fft=4096,hop_length=hop)); f=librosa.fft_frequencies(sr=sr,n_fft=4096)
    bass=np.log1p(S[(f>30)&(f<180)].sum(axis=0)); bon=np.maximum(0,np.diff(bass,prepend=bass[0]))
    v=np.array([bon[max(0,int(t*fr)-6):int(t*fr)+7].max() for t in bt])
    # downbeat phase in windows of 24 beats
    ph=[]
    for a in range(0,len(bt)-24,24):
        sc=[v[a:a+24][(np.arange(24)+a)%3==k].mean() for k in range(3)]
        ph.append(int(np.argmax(sc)))
    print('  downbeat phase per 8 bars:',ph)
    out[p]={'beats':bt.tolist(),'bass':v.tolist()}
json.dump(out,open('tracks.json','w'))
