// Procedural audio for SOLBAY: three WebAudio radio stations, an engine hum,
// a police siren and one-shot effects. No audio files, no network.
var SB = window.SB || (window.SB = {});

SB.RadioStations = [
  {
    name: "SOL 98.5", bpm: 112, wave: "sawtooth",
    bass: [110, 110, 130.8, 98, 110, 110, 146.8, 130.8],
    arp: [440, 554.4, 659.3, 554.4, 440, 493.9, 659.3, 587.3]
  },
  {
    name: "BAY FM", bpm: 84, wave: "triangle",
    bass: [87.3, 87.3, 110, 98, 87.3, 130.8, 110, 98],
    arp: [261.6, 329.6, 392, 329.6, 261.6, 311.1, 392, 349.2]
  },
  {
    name: "TIDE & BASS", bpm: 128, wave: "square",
    bass: [55, 55, 65.4, 55, 55, 82.4, 65.4, 73.4],
    arp: [220, 220, 277.2, 329.6, 220, 246.9, 329.6, 311.1]
  }
];

SB.Audio = function () {
  this.ctx = null;
  this.master = null;
  this.muted = false;
  this.station = 0;
  this.radioOn = true;
  this.nextNoteTime = 0;
  this.step = 0;
  this.timer = null;
  this.sirenOsc = null;
  this.sirenGain = null;
  this.engineOsc = null;
  this.engineGain = null;
  this.engineFilter = null;
};

SB.Audio.prototype.unlock = function () {
  if (this.ctx) {
    if (this.ctx.state === "suspended") this.ctx.resume();
    return;
  }
  try {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.startEngine();
    this.startRadioScheduler();
  } catch (e) { /* audio unavailable: the game stays silent */ }
};

SB.Audio.prototype.note = function (freq, time, dur, type, gain, dest) {
  var osc = this.ctx.createOscillator();
  var g = this.ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(gain, time + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  osc.connect(g);
  g.connect(dest || this.master);
  osc.start(time);
  osc.stop(time + dur + 0.05);
};

SB.Audio.prototype.startRadioScheduler = function () {
  var self = this;
  this.nextNoteTime = this.ctx.currentTime + 0.1;
  this.timer = setInterval(function () {
    if (!self.ctx || !self.radioOn || self.muted) {
      self.nextNoteTime = self.ctx ? self.ctx.currentTime + 0.1 : 0;
      return;
    }
    var st = SB.RadioStations[self.station];
    var stepDur = 60 / st.bpm / 2;
    while (self.nextNoteTime < self.ctx.currentTime + 0.25) {
      var s = self.step % 8;
      var t = self.nextNoteTime;
      self.note(st.bass[s], t, stepDur * 0.9, "sine", 0.16);
      if (s % 2 === 0) self.note(st.arp[s], t, stepDur * 0.8, st.wave, 0.05);
      if (s % 4 === 2) self.noise(t, 0.04, 0.05); // hat
      self.nextNoteTime += stepDur;
      self.step++;
    }
  }, 90);
};

SB.Audio.prototype.noise = function (time, dur, gain) {
  var len = Math.floor(this.ctx.sampleRate * dur);
  var buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
  var data = buf.getChannelData(0);
  for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  var src = this.ctx.createBufferSource();
  src.buffer = buf;
  var g = this.ctx.createGain();
  g.gain.value = gain;
  src.connect(g);
  g.connect(this.master);
  src.start(time);
};

SB.Audio.prototype.startEngine = function () {
  var ctx = this.ctx;
  this.engineOsc = ctx.createOscillator();
  this.engineOsc.type = "sawtooth";
  this.engineOsc.frequency.value = 55;
  this.engineFilter = ctx.createBiquadFilter();
  this.engineFilter.type = "lowpass";
  this.engineFilter.frequency.value = 300;
  this.engineGain = ctx.createGain();
  this.engineGain.gain.value = 0;
  this.engineOsc.connect(this.engineFilter);
  this.engineFilter.connect(this.engineGain);
  this.engineGain.connect(this.master);
  this.engineOsc.start();
};

SB.Audio.prototype.setEngine = function (speedNorm, driving) {
  if (!this.ctx || !this.engineOsc) return;
  var t = this.ctx.currentTime;
  this.engineOsc.frequency.setTargetAtTime(50 + speedNorm * 90, t, 0.1);
  this.engineGain.gain.setTargetAtTime(driving && !this.muted ? 0.05 + speedNorm * 0.06 : 0, t, 0.1);
};

SB.Audio.prototype.setSiren = function (on) {
  if (!this.ctx) return;
  if (on && !this.sirenOsc) {
    var ctx = this.ctx;
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = "triangle";
    this.sirenOsc.frequency.value = 750;
    var lfo = ctx.createOscillator();
    lfo.frequency.value = 1.6;
    var lfoGain = ctx.createGain();
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain);
    lfoGain.connect(this.sirenOsc.frequency);
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = this.muted ? 0 : 0.05;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    lfo.start();
    this.sirenLfo = lfo;
  } else if (!on && this.sirenOsc) {
    try { this.sirenOsc.stop(); this.sirenLfo.stop(); } catch (e) {}
    this.sirenOsc = null;
    this.sirenLfo = null;
  }
};

SB.Audio.prototype.setSirenVolume = function (dist) {
  if (this.sirenGain && this.ctx) {
    var v = Math.max(0, 0.06 * (1 - dist / 120));
    this.sirenGain.gain.setTargetAtTime(this.muted ? 0 : v, this.ctx.currentTime, 0.2);
  }
};

SB.Audio.prototype.sfx = function (name) {
  if (!this.ctx || this.muted) return;
  var t = this.ctx.currentTime;
  if (name === "crash") {
    this.noise(t, 0.25, 0.3);
    this.note(70, t, 0.25, "sine", 0.3);
  } else if (name === "punch") {
    this.noise(t, 0.08, 0.25);
    this.note(140, t, 0.1, "sine", 0.2);
  } else if (name === "pickup") {
    this.note(880, t, 0.09, "sine", 0.15);
    this.note(1318, t + 0.08, 0.12, "sine", 0.15);
  } else if (name === "mission") {
    this.note(523, t, 0.1, "triangle", 0.15);
    this.note(659, t + 0.1, 0.1, "triangle", 0.15);
    this.note(784, t + 0.2, 0.16, "triangle", 0.15);
  } else if (name === "win") {
    [523, 659, 784, 1046].forEach(function (f, i) {
      this.note(f, t + i * 0.11, 0.18, "triangle", 0.16);
    }, this);
  } else if (name === "fail") {
    [392, 330, 262, 196].forEach(function (f, i) {
      this.note(f, t + i * 0.13, 0.2, "triangle", 0.14);
    }, this);
  } else if (name === "click") {
    this.note(660, t, 0.05, "square", 0.06);
  } else if (name === "door") {
    this.noise(t, 0.07, 0.18);
    this.note(180, t, 0.08, "sine", 0.12);
  } else if (name === "horn") {
    this.note(370, t, 0.25, "square", 0.08);
    this.note(466, t, 0.25, "square", 0.08);
  }
};

SB.Audio.prototype.cycleStation = function () {
  this.station = (this.station + 1) % SB.RadioStations.length;
  this.radioOn = true;
  return SB.RadioStations[this.station].name;
};

SB.Audio.prototype.toggleRadio = function () {
  this.radioOn = !this.radioOn;
  return this.radioOn ? SB.RadioStations[this.station].name : "OFF";
};

SB.Audio.prototype.toggleMute = function () {
  this.muted = !this.muted;
  if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
  return this.muted;
};
