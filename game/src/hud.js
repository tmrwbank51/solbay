// HUD, minimap, message toasts and menu screens for SOLBAY.
var SB = window.SB || (window.SB = {});

SB.HUD = function () {
  var self = this;
  function el(id) { return document.getElementById(id); }
  this.el = {
    hud: el("hud"), healthFill: el("health-fill"), healthText: el("health-text"),
    money: el("money"), stars: el("stars"), clock: el("clock"),
    weather: el("weather-icon"), radio: el("radio-name"),
    speedBox: el("speed-box"), speed: el("speed"), street: el("street-name"),
    tracker: el("mission-tracker"), prompt: el("prompt"), toast: el("toast"),
    bustBox: el("bust-box"), bustFill: el("bust-fill"),
    minimap: el("minimap"), rank: el("rank-label"),
    screens: {
      start: el("screen-start"), pause: el("screen-pause"),
      busted: el("screen-busted"), wasted: el("screen-wasted"),
      victory: el("screen-victory"), missions: el("screen-missions"),
      help: el("screen-help"), briefing: el("screen-briefing")
    },
    briefTitle: el("brief-title"), briefText: el("brief-text"),
    victoryStats: el("victory-stats"), missionList: el("mission-list"),
    continueBtn: el("btn-continue")
  };
  this.cache = {};
  this.toastQueue = [];
  this.toastT = 0;
  this.mm = this.el.minimap.getContext("2d");
  this.mmStatic = document.createElement("canvas");
  this.mmStatic.width = 220;
  this.mmStatic.height = 220;
  this.buildStaticMinimap();
  this.time = 0;
};

SB.HUD.prototype.buildStaticMinimap = function () {
  var c = this.mmStatic.getContext("2d");
  var S = 220 / 480; // world [-240,240] -> 220px
  function X(x) { return (x + 240) * S; }
  function Z(z) { return (z + 240) * S; }
  c.fillStyle = "#5d7a3e";
  c.fillRect(0, 0, 220, 220);
  // Ocean + beach (south).
  c.fillStyle = "#1f6f9e";
  c.fillRect(0, Z(246), 220, 220 - Z(246));
  c.fillStyle = "#e0cd96";
  c.fillRect(0, Z(207), 220, Z(246) - Z(207));
  // Blocks.
  c.fillStyle = "#8f8a80";
  for (var bx = 0; bx < 8; bx++) {
    for (var bz = 0; bz < 8; bz++) {
      c.fillRect(X(-175 + bx * 50 - 18), Z(-175 + bz * 50 - 18), 36 * S, 36 * S);
    }
  }
  // Roads.
  c.fillStyle = "#3a3a3e";
  for (var i = 0; i < SB.CITY.roads.length; i++) {
    var r = SB.CITY.roads[i];
    c.fillRect(X(r - 7), Z(-207), 14 * S, 414 * S);
    c.fillRect(X(-207), Z(r - 7), 414 * S, 14 * S);
  }
};

SB.HUD.prototype.setText = function (key, element, text) {
  if (this.cache[key] !== text) {
    this.cache[key] = text;
    element.textContent = text;
  }
};

SB.HUD.prototype.toast = function (text) {
  this.toastQueue.push(text);
};

SB.HUD.prototype.update = function (game, dt) {
  this.time += dt;
  // Toasts.
  if (this.toastT > 0) {
    this.toastT -= dt;
    if (this.toastT <= 0) this.el.toast.classList.remove("show");
  } else if (this.toastQueue.length) {
    this.el.toast.textContent = this.toastQueue.shift();
    this.el.toast.classList.add("show");
    this.toastT = 3.5;
  }
  var hp = Math.max(0, Math.round(game.player.health));
  this.el.healthFill.style.width = hp + "%";
  this.el.healthFill.style.background = hp > 50 ? "#3ddc84" : hp > 25 ? "#ffc93c" : "#ff4444";
  this.setText("hp", this.el.healthText, hp + "");
  this.setText("money", this.el.money, "$" + game.money);
  var stars = "";
  for (var s = 0; s < 5; s++) stars += s < game.police.wanted ? "★" : "☆";
  this.setText("stars", this.el.stars, stars);
  this.el.stars.className = game.police.wanted > 0 ? "stars hot" : "stars";
  var hours = Math.floor(game.timeOfDay * 24);
  var mins = Math.floor((game.timeOfDay * 24 - hours) * 60);
  this.setText("clock", this.el.clock, (hours < 10 ? "0" : "") + hours + ":" + (mins < 10 ? "0" : "") + mins);
  this.setText("weather", this.el.weather, game.weather === "rain" ? "🌧 Rain" : "☀ Clear");
  this.setText("radio", this.el.radio, "♫ " + (SB.audio && SB.audio.radioOn && !SB.audio.muted ? SB.RadioStations[SB.audio.station].name : SB.audio && SB.audio.muted ? "Muted" : "Radio off"));
  this.setText("rank", this.el.rank, game.rankName());
  if (game.playerCar) {
    this.el.speedBox.style.display = "block";
    this.setText("speed", this.el.speed, Math.round(Math.abs(game.playerCar.speed) * 3.2) + "");
  } else {
    this.el.speedBox.style.display = "none";
  }
  this.setText("street", this.el.street, SB.streetNameAt(game.playerX(), game.playerZ()));
  var obj = game.missions.objectiveText();
  this.el.tracker.style.display = obj ? "block" : "none";
  if (obj) this.setText("obj", this.el.tracker, "◆ " + obj);
  // Bust meter.
  if (game.police.bustT > 0.02) {
    this.el.bustBox.style.display = "block";
    this.el.bustFill.style.width = Math.round(game.police.bustT * 100) + "%";
  } else {
    this.el.bustBox.style.display = "none";
  }
  this.drawMinimap(game);
};

SB.HUD.prototype.drawMinimap = function (game) {
  var c = this.mm;
  var S = 220 / 480;
  function X(x) { return (x + 240) * S; }
  function Z(z) { return (z + 240) * S; }
  c.clearRect(0, 0, 220, 220);
  c.drawImage(this.mmStatic, 0, 0);
  // Mission target.
  var mm = game.missions;
  if (mm.active && mm.beacon.visible) {
    var pulse = 3 + Math.sin(this.time * 5) * 1.5;
    c.fillStyle = "#ffc93c";
    c.beginPath();
    c.arc(X(mm.beacon.position.x), Z(mm.beacon.position.z), pulse + 2, 0, Math.PI * 2);
    c.fill();
  }
  // Mission start markers.
  for (var i = 0; i < mm.startMarkers.length; i++) {
    var mk = mm.startMarkers[i];
    if (!mk.visible) continue;
    c.fillStyle = "#3ddc84";
    c.beginPath();
    c.arc(X(mk.position.x), Z(mk.position.z), 4, 0, Math.PI * 2);
    c.fill();
  }
  // Shops, taxi stand and the live fare target.
  if (game.jobs) {
    var dots = game.jobs.minimapDots();
    for (var di = 0; di < dots.length; di++) {
      c.fillStyle = dots[di].color;
      c.beginPath();
      c.arc(X(dots[di].x), Z(dots[di].z), dots[di].r, 0, Math.PI * 2);
      c.fill();
    }
  }
  // Traffic.
  c.fillStyle = "rgba(255,255,255,0.75)";
  for (var t = 0; t < game.cars.length; t++) {
    var car = game.cars[t];
    if (car.isPolice || car === game.playerCar) continue;
    c.fillRect(X(car.x) - 1.5, Z(car.z) - 1.5, 3, 3);
  }
  // Police (flashing).
  var flash = Math.sin(this.time * 10) > 0;
  c.fillStyle = flash ? "#ff4444" : "#4488ff";
  for (var p = 0; p < game.police.cars.length; p++) {
    c.beginPath();
    c.arc(X(game.police.cars[p].x), Z(game.police.cars[p].z), 4, 0, Math.PI * 2);
    c.fill();
  }
  // Player arrow.
  var px = X(game.playerX()), pz = Z(game.playerZ());
  var heading = game.playerCar ? game.playerCar.heading : game.player.heading;
  c.save();
  c.translate(px, pz);
  c.rotate(heading);
  c.fillStyle = "#ffffff";
  c.strokeStyle = "#111111";
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(0, -7);
  c.lineTo(5, 5);
  c.lineTo(-5, 5);
  c.closePath();
  c.fill();
  c.stroke();
  c.restore();
  // View frame.
  c.strokeStyle = "rgba(255,255,255,0.5)";
  c.lineWidth = 2;
  c.strokeRect(1, 1, 218, 218);
};

SB.HUD.prototype.setPrompt = function (text) {
  this.setText("prompt", this.el.prompt, text || "");
  this.el.prompt.style.display = text ? "block" : "none";
};

SB.HUD.prototype.showScreen = function (name) {
  var screens = this.el.screens;
  for (var k in screens) screens[k].classList.remove("show");
  if (name && screens[name]) screens[name].classList.add("show");
  this.el.hud.style.display = (name === "start" || name === null) && name === "start" ? "none" : "block";
  if (name === "start") this.el.hud.style.display = "none";
  else if (name) this.el.hud.style.display = "block";
};

SB.HUD.prototype.showBrief = function (def) {
  this.el.briefTitle.textContent = def.name + " — " + def.giver;
  this.el.briefText.textContent = def.brief + "  Reward: $" + def.reward + ".";
  this.el.screens.briefing.classList.add("show");
  var self = this;
  clearTimeout(this._briefTimer);
  this._briefTimer = setTimeout(function () {
    self.el.screens.briefing.classList.remove("show");
  }, 6000);
};

SB.HUD.prototype.hideBrief = function () {
  clearTimeout(this._briefTimer);
  this.el.screens.briefing.classList.remove("show");
};

SB.HUD.prototype.showVictory = function (game) {
  this.el.victoryStats.textContent = "All " + SB.MISSIONS.length + " missions complete · $" + game.money +
    " in the bank · " + game.stats.carsStolen + " cars stolen · " + game.stats.pedsHit + " pedestrians bowled over · wanted peaks: " +
    game.stats.maxWanted + " stars. Sol Bay is yours — free roam continues.";
  // Pause the simulation behind the screen: the game step returns early for
  // every state but playing/menu, so the world freezes until "Keep playing".
  game.prevState = "playing";
  game.state = "victory";
  this.showScreen("victory");
};

SB.HUD.prototype.renderMissionList = function (missions) {
  var html = "";
  for (var i = 0; i < SB.MISSIONS.length; i++) {
    var m = SB.MISSIONS[i];
    var done = missions.isComplete(m.id);
    html += '<div class="mission-row' + (done ? " done" : "") + '">' +
      "<b>" + (i + 1) + ". " + m.name + "</b> — " + m.giver + " · $" + m.reward +
      (done ? " · ✓ COMPLETE" : "") +
      '<div class="mission-brief">' + m.brief + "</div></div>";
  }
  this.el.missionList.innerHTML = html;
};
