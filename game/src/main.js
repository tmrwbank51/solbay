// SOLBAY — game orchestration: renderer, fixed-timestep loop, day/night and
// weather, camera, enter/exit car, damage, bust/waste flow, saves, scene
// presets and the probe API the screenshots and tests use.
var SB = window.SB || (window.SB = {});

SB.SAVE_KEY = "solbay-save-v1";
SB.STEP = 1 / 60;

SB.Game = function () {
  this.state = "menu";
  this.prevState = null;
  this.money = 500;
  this.timeOfDay = 0.333; // 08:00
  this.dayLength = 300;   // seconds per full day
  this.weather = "clear";
  this.stats = { carsStolen: 0, pedsHit: 0, maxWanted: 0 };
  this.shakeT = 0;
  this.shakeMag = 0;
  this.damageCooldown = 0;
  this.camYaw = Math.PI;
  this.camPitch = 0.32;
  this.camDist = 9;
  this.menuOrbit = 0;
  this.fps = 60;
  this.frameCount = 0;
  this.playerCar = null;
  this.cars = [];
  this.parked = [];
  this.rain = null;
  this.smokePool = [];
  this.preset = new URLSearchParams(window.location.search).get("scene") || null;
  this.initThree();
  this.initWorld();
  this.initUI();
  SB.game = this;
  SB.hud = this.hud;
  SB.audio = this.audio;
  this.applyPreset();
  this.lastTime = performance.now();
  this.acc = 0;
  var self = this;
  requestAnimationFrame(function (t) { self.loop(t); });
};

SB.Game.prototype.initThree = function () {
  var container = document.getElementById("game-container");
  this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
  this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  this.renderer.setSize(window.innerWidth, window.innerHeight);
  if ("outputEncoding" in this.renderer) this.renderer.outputEncoding = THREE.sRGBEncoding;
  this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  this.renderer.toneMappingExposure = 1.05;
  container.appendChild(this.renderer.domElement);
  this.scene = new THREE.Scene();
  this.scene.background = new THREE.Color(0x87b8dd);
  this.scene.fog = new THREE.Fog(0x87b8dd, 130, 430);
  this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
  this.camera.position.set(0, 40, 120);
  this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x6b7a52, 0.75);
  this.scene.add(this.hemi);
  this.sun = new THREE.DirectionalLight(0xfff2d8, 1.1);
  this.sun.position.set(100, 160, 60);
  this.scene.add(this.sun);
  this.sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: null, color: 0xfff2c0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  this.sunSprite.scale.set(40, 40, 1);
  this.scene.add(this.sunSprite);
  var self = this;
  window.addEventListener("resize", function () {
    self.camera.aspect = window.innerWidth / window.innerHeight;
    self.camera.updateProjectionMatrix();
    self.renderer.setSize(window.innerWidth, window.innerHeight);
  });
};

SB.Game.prototype.initWorld = function () {
  var rng = SB.rng;
  this.tex = SB.buildTextures(rng);
  this.sunSprite.material.map = this.tex.glow;
  this.city = SB.buildCity(this.scene, rng, this.tex);
  this.colliders = this.city.colliders;
  // The player starts on Sol Bay Blvd near Central St.
  this.player = new SB.Player(this.scene, 4, 30);
  this.player.heading = Math.PI;
  // Traffic + parked cars.
  this.traffic = new SB.Traffic(this.scene, rng, this.tex, this.colliders, 10);
  this.cars = this.traffic.cars.slice();
  var parkedSpots = [
    [-46, 25, 0], [54, -75, Math.PI], [-104, 125, Math.PI / 2], [104, 175, -Math.PI / 2],
    [-154, -25, 0], [154, 75, Math.PI], [-4, -125, Math.PI / 2], [46, -175, -Math.PI / 2]
  ];
  for (var i = 0; i < parkedSpots.length; i++) {
    var s = parkedSpots[i];
    var car = SB.makeCar(i % 3 === 0 ? "coupe" : "sedan", rng.pick(SB.CAR_COLORS), s[0], s[1], s[2], this.tex);
    car.parked = true;
    this.scene.add(car.group);
    this.cars.push(car);
    this.parked.push(car);
  }
  this.peds = new SB.Pedestrians(this.scene, rng, 18);
  this.police = new SB.Police(this.scene, this.tex, this.colliders);
  this.missions = new SB.MissionManager(this.scene, this.tex);
  this.audio = new SB.Audio();
  this.input = new SB.Input(this.renderer.domElement);
  this.hud = new SB.HUD();
  this.buildRain();
  this.buildSmoke();
};

SB.Game.prototype.buildRain = function () {
  var N = 1400;
  var pos = new Float32Array(N * 3);
  for (var i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 70;
    pos[i * 3 + 1] = Math.random() * 40;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 70;
  }
  var geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  var mat = new THREE.PointsMaterial({ color: 0xaac8e0, size: 0.22, transparent: true, opacity: 0.85 });
  this.rain = new THREE.Points(geo, mat);
  this.rain.visible = false;
  this.scene.add(this.rain);
};

SB.Game.prototype.buildSmoke = function () {
  for (var i = 0; i < 24; i++) {
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.glow, color: 0xcccccc, transparent: true, opacity: 0, depthWrite: false }));
    sp.visible = false;
    this.scene.add(sp);
    this.smokePool.push({ sprite: sp, life: 0, vx: 0, vy: 0, vz: 0 });
  }
  this.smokeI = 0;
};

SB.Game.prototype.puff = function (x, y, z, color) {
  var p = this.smokePool[this.smokeI++ % this.smokePool.length];
  p.sprite.visible = true;
  p.sprite.position.set(x, y, z);
  p.sprite.material.color.setHex(color || 0xbbbbbb);
  p.sprite.material.opacity = 0.55;
  p.sprite.scale.set(1.5, 1.5, 1);
  p.life = 0.7;
  p.vx = (Math.random() - 0.5) * 2;
  p.vy = 1.5 + Math.random();
  p.vz = (Math.random() - 0.5) * 2;
};

SB.Game.prototype.rankName = function () {
  var done = 0;
  for (var i = 0; i < SB.MISSIONS.length; i++) if (this.missions.isComplete(SB.MISSIONS[i].id)) done++;
  return ["Rookie", "Wheelman", "Hustler", "Kingpin of Sol Bay"][done];
};

SB.Game.prototype.playerX = function () { return this.playerCar ? this.playerCar.x : this.player.x; };
SB.Game.prototype.playerZ = function () { return this.playerCar ? this.playerCar.z : this.player.z; };
SB.Game.prototype.playerSpeed = function () { return this.playerCar ? Math.abs(this.playerCar.speed) : this.player.speed; };

// ---------- UI wiring ----------
SB.Game.prototype.initUI = function () {
  var self = this;
  function on(id, fn) { document.getElementById(id).addEventListener("click", function () { if (SB.audio) SB.audio.unlock(); if (SB.audio) SB.audio.sfx("click"); fn(); }); }
  on("btn-start", function () { self.startGame(false); });
  on("btn-continue", function () { self.startGame(true); });
  on("btn-help", function () { self.openOverlay("help"); });
  on("btn-help-close", function () { self.closeOverlay(); });
  on("btn-resume", function () { self.closeOverlay(); });
  on("btn-missions", function () { self.openOverlay("missions"); });
  on("btn-missions-close", function () { self.closeOverlay(); });
  on("btn-save", function () { self.saveGame(); self.hud.toast("Game saved."); self.closeOverlay(); });
  on("btn-restart", function () { window.location.reload(); });
  on("btn-busted-ok", function () { self.afterBusted(); });
  on("btn-wasted-ok", function () { self.afterWasted(); });
  on("btn-victory-ok", function () { self.closeOverlay(); });
  document.getElementById("mission-list").addEventListener("click", function (e) {
    var row = e.target.closest(".mission-row");
    if (!row || row.classList.contains("done")) return;
    var idx = Array.prototype.indexOf.call(row.parentNode.children, row);
    if (self.missions.active) { self.hud.toast("Finish the current mission first."); return; }
    if (self.missions.startMission(SB.MISSIONS[idx].id, self)) self.closeOverlay();
  });
  // Continue button only when a save exists.
  try {
    if (window.localStorage.getItem(SB.SAVE_KEY)) document.getElementById("btn-continue").style.display = "inline-block";
  } catch (e) {}
};

SB.Game.prototype.startGame = function (fromSave) {
  if (fromSave) this.loadGame();
  this.state = "playing";
  this.hud.showScreen(null);
  this.hud.el.hud.style.display = "block";
  this.hud.toast("Welcome to Sol Bay. Press M for missions.");
  if (SB.audio) SB.audio.unlock();
};

SB.Game.prototype.openOverlay = function (name) {
  if (this.state === "playing" || this.state === "menu") this.prevState = this.state;
  if (name === "missions") this.hud.renderMissionList(this.missions);
  this.state = name === "help" ? "help" : name === "missions" ? "missions" : "paused";
  this.hud.showScreen(this.state === "paused" ? "pause" : this.state);
};

SB.Game.prototype.closeOverlay = function () {
  this.hud.hideBrief();
  if (this.state === "victory") { this.state = "playing"; this.hud.showScreen(null); return; }
  this.state = this.prevState === "menu" ? "menu" : "playing";
  this.hud.showScreen(this.state === "menu" ? "start" : null);
  if (this.state === "menu") this.hud.el.hud.style.display = "none";
};

SB.Game.prototype.saveGame = function () {
  try {
    window.localStorage.setItem(SB.SAVE_KEY, JSON.stringify({
      money: this.money, health: this.player.health,
      completed: this.missions.completed,
      x: this.player.x, z: this.player.z, timeOfDay: this.timeOfDay,
      stats: this.stats
    }));
  } catch (e) {}
};

SB.Game.prototype.loadGame = function () {
  try {
    var s = JSON.parse(window.localStorage.getItem(SB.SAVE_KEY));
    if (!s) return;
    this.money = s.money;
    this.player.health = s.health;
    this.missions.completed = s.completed || {};
    this.player.x = s.x; this.player.z = s.z;
    this.timeOfDay = s.timeOfDay;
    this.stats = s.stats || this.stats;
    this.missions.refreshStartMarkers();
  } catch (e) {}
};

// ---------- Scene presets for screenshots and probes ----------
SB.Game.prototype.applyPreset = function () {
  var scene = this.preset;
  if (!scene) return;
  this.startGame(false);
  if (scene === "drive") {
    var car = this.parked[0];
    this.enterCar(car, true);
    car.x = 3.5; car.z = -120; car.heading = 0; car.speed = 26;
    this.camYaw = Math.PI;
  } else if (scene === "chase") {
    var car2 = this.parked[1];
    this.enterCar(car2, true);
    car2.x = 3.5; car2.z = -40; car2.heading = 0; car2.speed = 24;
    this.police.setWanted(3);
    this.police.spawnPoliceCarAt(3.5, -70, 0);
    this.police.spawnPoliceCarAt(-3.5, -85, 0);
    this.camYaw = Math.PI;
  } else if (scene === "mission") {
    var car3 = this.parked[0];
    this.enterCar(car3, true);
    car3.x = 25; car3.z = 3.5; car3.heading = Math.PI / 2; car3.speed = 12;
    this.missions.startMission("harbor-dash", this);
    this.camYaw = Math.PI / 2 + Math.PI;
  } else if (scene === "night") {
    this.timeOfDay = 0.9;
    this.weather = "rain";
    this.player.x = 3.5; this.player.z = -60;
    this.player.heading = 0;
    this.camYaw = Math.PI;
    this.camPitch = 0.25;
  }
};

// ---------- Enter / exit car ----------
SB.Game.prototype.nearestCar = function (maxD) {
  var best = null, bestD = maxD;
  for (var i = 0; i < this.cars.length; i++) {
    var c = this.cars[i];
    if (c.isPolice) continue;
    var d = Math.hypot(c.x - this.player.x, c.z - this.player.z);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
};

SB.Game.prototype.enterCar = function (car, silent) {
  this.playerCar = car;
  car.isPlayer = true;
  car.isTraffic = false;
  car.parked = false;
  this.player.model.group.visible = false;
  if (SB.audio) SB.audio.sfx("door");
  if (!car.stolen) {
    car.stolen = true;
    this.stats.carsStolen++;
    if (!silent) {
      this.hud.toast("Car stolen! The cops noticed.");
      if (this.police.addWanted(1)) this.hud.toast("Wanted level up!");
    }
  }
};

SB.Game.prototype.exitCar = function () {
  var car = this.playerCar;
  if (!car) return;
  car.speed = 0;
  car.vx = 0; car.vz = 0;
  car.isPlayer = false;
  var side = car.heading + Math.PI / 2;
  this.player.x = car.x + Math.sin(side) * 2.6;
  this.player.z = car.z + Math.cos(side) * 2.6;
  var fixed = SB.collideCircle(this.colliders, this.player.x, this.player.z, 0.55);
  this.player.x = fixed.x; this.player.z = fixed.z;
  this.player.heading = car.heading;
  this.player.model.group.visible = true;
  this.playerCar = null;
  if (SB.audio) SB.audio.sfx("door");
};

// ---------- Bust / waste ----------
SB.Game.prototype.onBusted = function () {
  if (this.missions.active) this.missions.finish(false, this);
  this.police.clearAll();
  this.money = Math.max(0, this.money - 150);
  this.state = "busted";
  this.hud.showScreen("busted");
  if (SB.audio) SB.audio.sfx("fail");
  this.saveGame();
};

SB.Game.prototype.afterBusted = function () {
  if (this.playerCar) { this.playerCar.isPlayer = false; this.playerCar = null; }
  this.player.x = 150; this.player.z = -96;
  this.player.health = 100;
  this.player.model.group.visible = true;
  this.state = "playing";
  this.hud.showScreen(null);
};

SB.Game.prototype.onWasted = function () {
  if (this.missions.active) this.missions.finish(false, this);
  this.police.clearAll();
  this.money = Math.max(0, this.money - 100);
  this.state = "wasted";
  this.hud.showScreen("wasted");
  if (SB.audio) SB.audio.sfx("fail");
  this.saveGame();
};

SB.Game.prototype.afterWasted = function () {
  if (this.playerCar) { this.playerCar.isPlayer = false; this.playerCar = null; }
  this.player.x = 96; this.player.z = -150;
  this.player.health = 100;
  this.player.model.group.visible = true;
  this.state = "playing";
  this.hud.showScreen(null);
};

SB.Game.prototype.shake = function (mag, time) {
  this.shakeMag = Math.max(this.shakeMag, mag);
  this.shakeT = Math.max(this.shakeT, time);
};

// ---------- Fixed-timestep update ----------
SB.Game.prototype.step = function (dt) {
  var input = this.input;
  // Global keys.
  if (input.pressed("KeyP") || input.pressed("Escape")) {
    if (this.state === "playing") this.openOverlay("pause");
    else if (this.state === "paused") this.closeOverlay();
  }
  if (input.pressed("KeyM") && (this.state === "playing" || this.state === "paused")) {
    if (this.state === "missions") this.closeOverlay();
    else this.openOverlay("missions");
  }
  if (input.pressed("KeyH") && this.state === "playing") this.openOverlay("help");
  if (input.pressed("Enter") && this.state === "menu") this.startGame(false);
  if (this.state !== "playing" && this.state !== "menu") return;
  if (this.state === "playing") {
    if (input.pressed("KeyR")) {
      var name = SB.audio.cycleStation();
      this.hud.toast("Radio: " + name);
    }
    if (input.pressed("KeyT")) {
      this.weather = this.weather === "clear" ? "rain" : "clear";
      this.hud.toast(this.weather === "rain" ? "Rain rolling in." : "Skies clearing.");
    }
    if (input.pressed("Digit1") || input.pressed("Digit2") || input.pressed("Digit3")) {
      // Quick mission start from the number keys.
      var idx = input.pressed("Digit1") ? 0 : input.pressed("Digit2") ? 1 : 2;
      if (!this.missions.active && !this.missions.isComplete(SB.MISSIONS[idx].id)) {
        this.missions.startMission(SB.MISSIONS[idx].id, this);
      }
    }
  }
  // Time of day + weather visuals.
  this.timeOfDay = (this.timeOfDay + dt / this.dayLength) % 1;
  this.updateSky(dt);
  // World life always runs (menu background included).
  var allCars = this.cars.concat(this.police.cars);
  var threats = [];
  for (var ti = 0; ti < allCars.length; ti++) {
    var tc = allCars[ti];
    if (Math.abs(tc.speed) > 5) threats.push({ x: tc.x, z: tc.z, speed: Math.abs(tc.speed) });
  }
  this.traffic.update(dt, allCars, { x: this.playerX(), z: this.playerZ() }, this.peds.list);
  this.peds.update(dt, this.colliders, threats);
  this.city.update(dt, this.darkness);
  this.updateRain(dt);
  this.updateSmoke(dt);
  if (this.state !== "playing") return;

  // --- Player control ---
  var camYaw = this.camYaw;
  if (this.playerCar) {
    var car = this.playerCar;
    var drive = {
      throttle: input.down("KeyW") || input.down("ArrowUp") ? 1 : 0,
      brake: input.down("KeyS") || input.down("ArrowDown") ? 1 : 0,
      steer: (input.down("KeyA") || input.down("ArrowLeft") ? -1 : 0) + (input.down("KeyD") || input.down("ArrowRight") ? 1 : 0),
      handbrake: input.down("Space")
    };
    // Steering: left key turns left (negative heading change).
    drive.steer = -drive.steer;
    var crash = SB.stepCar(car, dt, drive, this.colliders, allCars);
    if (drive.handbrake && Math.abs(car.speed) > 10 && Math.random() < dt * 20) {
      this.puff(car.x - Math.sin(car.heading) * 2, 0.3, car.z - Math.cos(car.heading) * 2, 0xdddddd);
    }
    if (crash > 8) {
      this.damagePlayer((crash - 8) * 1.4, true);
      this.shake(0.35, 0.3);
      if (SB.audio) SB.audio.sfx("crash");
      this.puff(car.x, 1, car.z, 0x888888);
    }
    if (input.pressed("KeyE")) this.exitCar();
    // Running over pedestrians.
    for (var pi = 0; pi < this.peds.list.length; pi++) {
      var ped = this.peds.list[pi];
      if (ped.down) continue;
      if (Math.hypot(ped.x - car.x, ped.z - car.z) < 2.3 && Math.abs(car.speed) > 4) {
        this.peds.knockDown(ped, car.x, car.z);
        this.peds.scareNear(car.x, car.z, 25);
        this.stats.pedsHit++;
        this.police.addWanted(1);
        this.hud.toast("You hit a pedestrian!");
        if (SB.audio) SB.audio.sfx("crash");
        this.shake(0.3, 0.25);
        car.speed *= 0.7;
      }
    }
    if (SB.audio) SB.audio.setEngine(Math.abs(car.speed) / 48, true);
  } else {
    var foot = {
      fwd: input.down("KeyW") || input.down("ArrowUp"),
      back: input.down("KeyS") || input.down("ArrowDown"),
      strafe: (input.down("KeyD") || input.down("ArrowRight") ? 1 : 0) - (input.down("KeyA") || input.down("ArrowLeft") ? 1 : 0),
      run: input.down("ShiftLeft") || input.down("ShiftRight"),
      jump: input.pressed("Space"),
      punch: input.pressed("KeyF")
    };
    this.player.update(dt, foot, this.colliders, camYaw + Math.PI);
    // Punch hits.
    var hits = this.player.punchTargets(this.peds.list);
    if (hits.length) {
      for (var hi = 0; hi < hits.length; hi++) this.peds.knockDown(hits[hi], this.player.x, this.player.z);
      this.peds.scareNear(this.player.x, this.player.z, 20);
      this.police.addWanted(1);
      if (SB.audio) SB.audio.sfx("punch");
      this.hud.toast("Hey! The cops saw that.");
    }
    if (input.pressed("KeyE")) {
      var near = this.nearestCar(4.5);
      if (near) this.enterCar(near, false);
    }
    if (SB.audio) SB.audio.setEngine(0, false);
    // Prompt.
    var nearCar = this.nearestCar(4.5);
    this.hud.setPrompt(nearCar ? (nearCar.stolen ? "Press E to drive" : "Press E to steal the car") : "");
  }
  // Health regen.
  this.damageCooldown -= dt;
  if (this.damageCooldown <= 0 && this.player.health < 100) {
    this.player.health = Math.min(100, this.player.health + dt * 1.5);
  }
  // Police.
  var pvx = 0, pvz = 0;
  if (this.playerCar) { pvx = this.playerCar.vx; pvz = this.playerCar.vz; }
  var pres = this.police.update(dt, {
    px: this.playerX(), pz: this.playerZ(), pvx: pvx, pvz: pvz,
    playerSpeed: this.playerSpeed(), inCar: !!this.playerCar, playerAlive: this.player.health > 0
  }, SB.rng, allCars);
  this.stats.maxWanted = Math.max(this.stats.maxWanted, this.police.wanted);
  if (pres.crash > 8 && this.playerCar) {
    this.damagePlayer((pres.crash - 8) * 1.0, true);
    this.shake(0.3, 0.25);
    if (SB.audio) SB.audio.sfx("crash");
  }
  if (SB.audio && this.police.cars.length) SB.audio.setSirenVolume(pres.nearest || 120);
  if (pres.bust) { this.onBusted(); return; }
  // Missions.
  this.missions.update(dt, this);
  // Wasted check.
  if (this.player.health <= 0) { this.onWasted(); return; }
  // Camera orbit input.
  var orbit = input.consumeOrbit();
  this.camYaw -= orbit.dx * 0.005;
  this.camPitch = Math.max(0.08, Math.min(1.1, this.camPitch + orbit.dy * 0.004));
  this.camDist = Math.max(5, Math.min(18, this.camDist + input.consumeWheel() * 0.01));
  // Camera auto-follow behind the direction of travel.
  var moveHeading = this.playerCar ? this.playerCar.heading : this.player.heading;
  var speedNow = this.playerSpeed();
  if (speedNow > 3 && !input.dragging) {
    var targetYaw = moveHeading + Math.PI;
    var dy = targetYaw - this.camYaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.camYaw += dy * Math.min(1, dt * (this.playerCar ? 1.6 : 2.4));
  }
  this.hud.update(this, dt);
};

SB.Game.prototype.damagePlayer = function (amount, crash) {
  if (this.damageCooldown > 0.4 && crash) return;
  this.player.health -= amount;
  this.damageCooldown = 5;
};

SB.Game.prototype.updateSky = function (dt) {
  // Sun elevation: 0 at 06:00 and 18:00, 1 at noon, -1 at midnight.
  var elev = Math.sin((this.timeOfDay - 0.25) * Math.PI * 2);
  var daylight = Math.max(0.04, Math.min(1, elev * 2.2 + 0.18));
  if (this.weather === "rain") daylight *= 0.72;
  this.darkness = 1 - daylight;
  var night = new THREE.Color(0x0b1226);
  var day = new THREE.Color(0x87b8dd);
  var sky = night.clone().lerp(day, daylight);
  var sunset = Math.exp(-Math.abs(elev) * 7) * (elev > -0.25 ? 1 : 0.3);
  sky.lerp(new THREE.Color(0xe8935a), sunset * 0.45 * daylight);
  if (this.weather === "rain") sky.lerp(new THREE.Color(0x5a6a78), 0.35);
  this.scene.background.copy(sky);
  this.scene.fog.color.copy(sky);
  this.scene.fog.near = this.weather === "rain" ? 90 : 130;
  this.scene.fog.far = this.weather === "rain" ? 300 : 430;
  var az = (this.timeOfDay - 0.25) * Math.PI * 2;
  this.sun.position.set(Math.cos(az) * 180, Math.max(12, elev * 180 + 20), Math.sin(az) * 120);
  this.sun.intensity = 0.12 + daylight * 1.15;
  this.sun.color.setHex(elev < 0.25 ? 0xffd9a8 : 0xfff2d8);
  this.hemi.intensity = 0.22 + daylight * 0.6;
  this.sunSprite.position.copy(this.sun.position).normalize().multiplyScalar(420);
  this.sunSprite.material.opacity = daylight > 0.15 ? 0.85 : 0.1;
};

SB.Game.prototype.updateRain = function (dt) {
  this.rain.visible = this.weather === "rain";
  if (!this.rain.visible) return;
  var pos = this.rain.geometry.attributes.position;
  var cx = this.playerX(), cz = this.playerZ();
  for (var i = 0; i < pos.count; i++) {
    var y = pos.getY(i) - 42 * dt;
    if (y < 0) y = 40;
    pos.setY(i, y);
    pos.setX(i, cx + (pos.getX(i) - cx) - 6 * dt + ((i * 7) % 3 - 1) * 0.01);
    if (pos.getX(i) < cx - 35) pos.setX(i, cx + 35);
    pos.setZ(i, cz + ((pos.getZ(i) - cz + 35) % 70 + 70) % 70 - 35);
  }
  pos.needsUpdate = true;
  this.rain.position.set(0, 0, 0);
};

SB.Game.prototype.updateSmoke = function (dt) {
  for (var i = 0; i < this.smokePool.length; i++) {
    var p = this.smokePool[i];
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) { p.sprite.visible = false; continue; }
    p.sprite.position.x += p.vx * dt;
    p.sprite.position.y += p.vy * dt;
    p.sprite.position.z += p.vz * dt;
    var s = 1.5 + (0.7 - p.life) * 3;
    p.sprite.scale.set(s, s, 1);
    p.sprite.material.opacity = Math.max(0, p.life) * 0.7;
  }
};

SB.Game.prototype.updateCamera = function (dt) {
  var target;
  if (this.state === "menu") {
    this.menuOrbit += dt * 0.05;
    var r = 130;
    this.camera.position.set(Math.cos(this.menuOrbit) * r, 46, Math.sin(this.menuOrbit) * r - 20);
    this.camera.lookAt(0, 6, 0);
    return;
  }
  if (this.playerCar) {
    target = new THREE.Vector3(this.playerCar.x, 2.2, this.playerCar.z);
  } else {
    target = new THREE.Vector3(this.player.x, 2.0 + this.player.y, this.player.z);
  }
  var dist = this.playerCar ? this.camDist + 3.5 : this.camDist;
  var cx = target.x + Math.sin(this.camYaw) * Math.cos(this.camPitch) * dist;
  var cz = target.z + Math.cos(this.camYaw) * Math.cos(this.camPitch) * dist;
  var cy = target.y + Math.sin(this.camPitch) * dist;
  cy = Math.max(0.7, cy);
  if (this.shakeT > 0) {
    this.shakeT -= dt;
    cx += (Math.random() - 0.5) * this.shakeMag;
    cy += (Math.random() - 0.5) * this.shakeMag;
    cz += (Math.random() - 0.5) * this.shakeMag;
    if (this.shakeT <= 0) this.shakeMag = 0;
  }
  this.camera.position.set(cx, cy, cz);
  this.camera.lookAt(target);
};

SB.Game.prototype.loop = function (now) {
  var self = this;
  requestAnimationFrame(function (t) { self.loop(t); });
  var rawDt = (now - this.lastTime) / 1000;
  this.lastTime = now;
  this.fps += (1 / Math.max(rawDt, 0.001) - this.fps) * 0.05;
  var frameDt = Math.min(0.1, rawDt);
  this.acc += frameDt;
  var steps = 0;
  while (this.acc >= SB.STEP && steps < 5) {
    this.step(SB.STEP);
    this.acc -= SB.STEP;
    steps++;
  }
  if (steps === 5) this.acc = 0;
  this.input.endFrame();
  this.updateCamera(frameDt);
  this.renderer.render(this.scene, this.camera);
  this.frameCount++;
  if (this.frameCount === 8) {
    window.__shotReady = true;
  }
};

// ---------- Probe API ----------
SB.Game.prototype.probe = function () {
  var self = this;
  return {
    version: "solbay-s1",
    state: function () { return self.state; },
    player: self.player,
    playerCar: function () { return self.playerCar; },
    police: self.police,
    missions: self.missions,
    cars: self.cars,
    money: function () { return self.money; },
    health: function () { return self.player.health; },
    fps: function () { return Math.round(self.fps); },
    start: function () { self.startGame(false); },
    startMission: function (id) { return self.missions.startMission(id, self); },
    setWanted: function (n) { return self.police.setWanted(n); },
    setTimeOfDay: function (t) { self.timeOfDay = t; },
    setWeather: function (w) { self.weather = w; },
    teleport: function (x, z) {
      if (self.playerCar) { self.playerCar.x = x; self.playerCar.z = z; self.playerCar.speed = 0; self.playerCar.vx = 0; self.playerCar.vz = 0; }
      else { self.player.x = x; self.player.z = z; }
    },
    enterNearestCar: function () { var c = self.nearestCar(8); if (c) self.enterCar(c, true); return !!c; },
    exitCar: function () { self.exitCar(); },
    press: function (code) { self.input.keys[code] = true; self.input.justPressed[code] = true; },
    release: function (code) { self.input.keys[code] = false; },
    seed: SB.seed
  };
};

window.__shotReady = false;
window.addEventListener("load", function () {
  var game = new SB.Game();
  window.__game = game.probe();
  window.__game._game = game;
});
