// Shops and the taxi job for SOLBAY: spend cash on food and car repairs,
// and run fares across the city for money. All interaction is one key (B)
// near a marker, so it works on foot and behind the wheel.
var SB = window.SB || (window.SB = {});

SB.SHOPS = [
  { id: "taco", name: "Tide & Taco", kind: "food", price: 40, x: 54, z: 25, color: 0xe08a2e,
    prompt: "Press B: taco $40 (full health)" },
  { id: "garage", name: "Vic's Garage", kind: "repair", price: 60, x: -54, z: -100, color: 0x4ab2c2,
    prompt: "Press B: repair $60 (car to 100%)" }
];

SB.TAXI_DESTINATIONS = [
  { name: "Harbor View", x: -100, z: 213 },
  { name: "Solbay Tower", x: 8, z: -8 },
  { name: "North Gate", x: 0, z: -195 },
  { name: "Marina", x: 192, z: 50 },
  { name: "Sunset Plaza", x: -192, z: -50 }
];

SB.JobManager = function (scene, tex) {
  this.scene = scene;
  this.fare = null; // { dest, t }
  this.fareCooldown = 0;
  this.stand = { x: 53, z: -150 }; // hailing a cab on Sol Bay Blvd's edge
  this.time = 0;
  // The waiting passenger, a local in a yellow shirt.
  this.passenger = SB.buildCharacterModel(0xf2d16b, 0x2a4a6b, 0xc98e62);
  this.passenger.group.position.set(this.stand.x, 0, this.stand.z);
  this.passenger.group.rotation.y = Math.PI;
  scene.add(this.passenger.group);
  // One beacon: at the stand while a fare waits, at the destination mid-fare.
  this.beacon = this.makeMarker(0xffd94a, 14);
  this.beacon.position.set(this.stand.x, 0, this.stand.z);
  scene.add(this.beacon);
  // Shop markers, small and colour-coded.
  this.shopMarkers = [];
  for (var i = 0; i < SB.SHOPS.length; i++) {
    var m = this.makeMarker(SB.SHOPS[i].color, 8);
    m.position.set(SB.SHOPS[i].x, 0, SB.SHOPS[i].z);
    scene.add(m);
    this.shopMarkers.push(m);
  }
};

SB.JobManager.prototype.makeMarker = function (color, h) {
  var g = new THREE.Group();
  var pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 0.9, h, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false })
  );
  pillar.position.y = h / 2;
  g.add(pillar);
  var ring = new THREE.Mesh(
    new THREE.RingGeometry(1.8, 2.5, 24),
    new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  g.add(ring);
  var arrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.7, 1.6, 4),
    new THREE.MeshBasicMaterial({ color: color })
  );
  arrow.rotation.x = Math.PI;
  arrow.position.y = h + 1.2;
  g.add(arrow);
  g.userData.arrow = arrow;
  g.userData.baseH = h;
  return g;
};

// What B would do right now, as a prompt line ("" when nothing is in range).
SB.JobManager.prototype.promptFor = function (game) {
  var px = game.playerX(), pz = game.playerZ();
  if (!this.fare && this.fareCooldown <= 0 && game.playerCar &&
      Math.hypot(px - this.stand.x, pz - this.stand.z) < 7) {
    return "Press B: pick up the fare";
  }
  for (var i = 0; i < SB.SHOPS.length; i++) {
    var s = SB.SHOPS[i];
    var d = Math.hypot(px - s.x, pz - s.z);
    if (s.kind === "food" && !game.playerCar && d < 6) return s.prompt;
    if (s.kind === "repair" && game.playerCar && d < 10) return s.prompt;
  }
  return "";
};

SB.JobManager.prototype.tryInteract = function (game) {
  var px = game.playerX(), pz = game.playerZ();
  // Taxi pickup first: it needs the car at the stand.
  if (!this.fare && this.fareCooldown <= 0 && game.playerCar &&
      Math.hypot(px - this.stand.x, pz - this.stand.z) < 7) {
    var dest = SB.rng.pick(SB.TAXI_DESTINATIONS);
    this.fare = { dest: dest, t: 0 };
    this.passenger.group.visible = false;
    this.beacon.position.set(dest.x, 0, dest.z);
    if (SB.hud) SB.hud.toast("Fare to " + dest.name + "! Drive fast for a tip.");
    if (SB.audio) SB.audio.sfx("mission");
    return true;
  }
  for (var i = 0; i < SB.SHOPS.length; i++) {
    var s = SB.SHOPS[i];
    var d = Math.hypot(px - s.x, pz - s.z);
    if (s.kind === "food" && !game.playerCar && d < 6) {
      if (game.player.health >= 100) {
        if (SB.hud) SB.hud.toast("Already full health.");
        return true;
      }
      if (game.money < s.price) {
        if (SB.hud) SB.hud.toast("Not enough cash for a taco.");
        return true;
      }
      game.money -= s.price;
      game.player.health = 100;
      if (SB.hud) SB.hud.toast("Taco time! Health restored. -$" + s.price);
      if (SB.audio) SB.audio.sfx("pickup");
      return true;
    }
    if (s.kind === "repair" && game.playerCar && d < 10) {
      var car = game.playerCar;
      if (car.health >= 100) {
        if (SB.hud) SB.hud.toast("This car is already mint.");
        return true;
      }
      if (game.money < s.price) {
        if (SB.hud) SB.hud.toast("Not enough cash for repairs.");
        return true;
      }
      game.money -= s.price;
      car.health = 100;
      if (SB.hud) SB.hud.toast("Vic patched her up. -$" + s.price);
      if (SB.audio) SB.audio.sfx("pickup");
      return true;
    }
  }
  return false;
};

// Busted or wasted mid-fare: the passenger walks away, the fare is lost.
SB.JobManager.prototype.cancelFare = function () {
  if (!this.fare) return;
  this.fare = null;
  this.fareCooldown = 0;
  this.passenger.group.visible = true;
  this.beacon.position.set(this.stand.x, 0, this.stand.z);
};

SB.JobManager.prototype.update = function (dt, game) {
  this.time += dt;
  var bob = Math.sin(this.time * 2.2) * 0.5;
  this.beacon.userData.arrow.position.y = this.beacon.userData.baseH + 1.2 + bob;
  this.beacon.rotation.y += dt * 0.8;
  for (var i = 0; i < this.shopMarkers.length; i++) {
    var m = this.shopMarkers[i];
    m.userData.arrow.position.y = m.userData.baseH + 1.2 + Math.sin(this.time * 2.2 + i) * 0.4;
    m.rotation.y += dt * 0.6;
  }
  if (this.fareCooldown > 0) {
    this.fareCooldown -= dt;
    if (this.fareCooldown <= 0 && !this.fare) {
      this.passenger.group.visible = true;
      this.beacon.visible = true;
      this.beacon.position.set(this.stand.x, 0, this.stand.z);
    }
  }
  if (!this.fare) return;
  this.fare.t += dt;
  // Delivery: arrive at the destination in the car.
  if (game.playerCar &&
      Math.hypot(game.playerX() - this.fare.dest.x, game.playerZ() - this.fare.dest.z) < 9) {
    var tip = Math.round(40 * Math.max(0, 1 - this.fare.t / 90));
    var paid = 80 + tip;
    game.money += paid;
    if (SB.hud) SB.hud.toast("Fare delivered! +$" + paid + (tip > 0 ? " (tip $" + tip + ")" : ""));
    if (SB.audio) SB.audio.sfx("win");
    this.fare = null;
    this.fareCooldown = 8;
    this.beacon.visible = false;
    game.saveGame();
  }
};

// Dots the minimap draws: shops, the stand and the live fare target.
SB.JobManager.prototype.minimapDots = function () {
  var dots = [];
  for (var i = 0; i < SB.SHOPS.length; i++) {
    dots.push({ x: SB.SHOPS[i].x, z: SB.SHOPS[i].z, color: "#ff9a3c", r: 3 });
  }
  if (this.fare) {
    dots.push({ x: this.fare.dest.x, z: this.fare.dest.z, color: "#ffd94a", r: 5 });
  } else if (this.fareCooldown <= 0) {
    dots.push({ x: this.stand.x, z: this.stand.z, color: "#ffd94a", r: 4 });
  }
  return dots;
};
