// Seeded random numbers for SOLBAY: the whole city, traffic and pedestrian
// layout derive from one seed, so the same ?seed= always builds the same city.
var SB = window.SB || (window.SB = {});

SB.hashSeed = function (text) {
  var h = 2166136261;
  for (var i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

SB.mulberry32 = function (seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

SB.Rng = function (seed) {
  this.nextFn = SB.mulberry32(seed);
  this.seed = seed >>> 0;
};

SB.Rng.prototype.next = function () {
  return this.nextFn();
};

SB.Rng.prototype.range = function (lo, hi) {
  return lo + (hi - lo) * this.next();
};

SB.Rng.prototype.int = function (lo, hi) {
  return Math.floor(this.range(lo, hi + 1));
};

SB.Rng.prototype.pick = function (arr) {
  return arr[Math.floor(this.next() * arr.length)];
};

SB.Rng.prototype.chance = function (p) {
  return this.next() < p;
};

SB.Rng.prototype.shuffle = function (arr) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(this.next() * (i + 1));
    var tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
};

// The run seed: ?seed= in the URL, or the default. Every system that needs
// randomness takes it from SB.rng, never from Math.random, so replays match.
SB.urlParams = new URLSearchParams(window.location.search);
SB.seed = parseInt(SB.urlParams.get("seed") || "20261118", 10);
if (!isFinite(SB.seed)) SB.seed = 20261118;
SB.rng = new SB.Rng(SB.seed);
