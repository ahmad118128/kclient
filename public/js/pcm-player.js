function PCMPlayer(t) {
  this.init(t);
}
(PCMPlayer.prototype.init = function () {
  (this.audioCtx = new (window.AudioContext || window.webkitAudioContext)({
    sampleRate: 44100,
  })),
    this.audioCtx.resume(),
    (this.gainNode = this.audioCtx.createGain()),
    (this.gainNode.gain.value = 1),
    this.gainNode.connect(this.audioCtx.destination),
    (this.startTime = this.audioCtx.currentTime);
}),
  (PCMPlayer.prototype.feed = function (t) {
    t = new Float32Array(t);
    let i = this.audioCtx.createBufferSource(),
      e = t.length / 2,
      a = this.audioCtx.createBuffer(2, e, 44100),
      o,
      n,
      s = a.getChannelData(0),
      r = 0;
    for (o = 0; o < e; o++) (s[o] = t[r]), (r += 2);
    let u = a.getChannelData(1),
      h = 0;
    for (n = 0; n < e; n++) (u[n] = t[h]), (h += 2);
    this.startTime < this.audioCtx.currentTime &&
      (this.startTime = this.audioCtx.currentTime),
      (i.buffer = a),
      i.connect(this.gainNode),
      i.start(this.startTime),
      (this.startTime += a.duration);
  }),
  (PCMPlayer.prototype.destroy = function () {
    this.audioCtx.close(), (this.audioCtx = null);
  });
