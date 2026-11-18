// Keyboard and mouse input for SOLBAY: held keys, edge-triggered presses,
// mouse-drag camera orbit and wheel zoom.
var SB = window.SB || (window.SB = {});

SB.Input = function (canvas) {
  this.keys = {};
  this.justPressed = {};
  this.dragging = false;
  this.lastX = 0;
  this.lastY = 0;
  this.orbitDX = 0;
  this.orbitDY = 0;
  this.wheelDelta = 0;
  var self = this;
  var GAME_KEYS = ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD", "KeyE", "KeyF", "KeyM", "KeyR", "KeyT", "KeyP", "KeyH", "KeyQ", "KeyB", "Enter", "Escape", "ShiftLeft", "ShiftRight", "Digit1", "Digit2", "Digit3", "Digit4", "Digit5"];
  window.addEventListener("keydown", function (e) {
    if (GAME_KEYS.indexOf(e.code) >= 0) e.preventDefault();
    if (!self.keys[e.code]) self.justPressed[e.code] = true;
    self.keys[e.code] = true;
    if (SB.audio) SB.audio.unlock();
  });
  window.addEventListener("keyup", function (e) {
    self.keys[e.code] = false;
  });
  window.addEventListener("blur", function () {
    self.keys = {};
    self.dragging = false;
  });
  canvas.addEventListener("mousedown", function (e) {
    self.dragging = true;
    self.lastX = e.clientX;
    self.lastY = e.clientY;
    if (SB.audio) SB.audio.unlock();
  });
  window.addEventListener("mousemove", function (e) {
    if (!self.dragging) return;
    self.orbitDX += e.clientX - self.lastX;
    self.orbitDY += e.clientY - self.lastY;
    self.lastX = e.clientX;
    self.lastY = e.clientY;
  });
  window.addEventListener("mouseup", function () {
    self.dragging = false;
  });
  canvas.addEventListener("wheel", function (e) {
    e.preventDefault();
    self.wheelDelta += e.deltaY;
  }, { passive: false });
  canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });
};

SB.Input.prototype.down = function (code) {
  return !!this.keys[code];
};

SB.Input.prototype.pressed = function (code) {
  return !!this.justPressed[code];
};

SB.Input.prototype.consumeOrbit = function () {
  var d = { dx: this.orbitDX, dy: this.orbitDY };
  this.orbitDX = 0;
  this.orbitDY = 0;
  return d;
};

SB.Input.prototype.consumeWheel = function () {
  var w = this.wheelDelta;
  this.wheelDelta = 0;
  return w;
};

SB.Input.prototype.endFrame = function () {
  this.justPressed = {};
};
