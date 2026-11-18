// Missions for SOLBAY: five jobs with briefings, beacons, timers and cash
// rewards, plus the floating markers that start them.
var SB = window.SB || (window.SB = {});

SB.MISSIONS = [
  {
    id: "harbor-dash", name: "Harbor Dash", reward: 250, timeLimit: 100,
    giver: "Vic's Garage",
    brief: "Vic needs a crate at the harbor, fast. Take any car and reach the beacon on the beach road before the timer runs out. Cops will not wait for you.",
    start: { x: 25, z: 0 },
    target: { x: -175, z: 215 }, // open sand by the boardwalk — never inside a block
    type: "reach"
  },
  {
    id: "heat-wave", name: "Heat Wave", reward: 300, timeLimit: 0,
    giver: "Lookout Lou",
    brief: "Lou wants to know if you can shake a tail. The job starts HOT: 3 stars, straight away. Lose every last cop and the money is yours. Get busted or wasted and it is over.",
    start: { x: 0, z: -100 },
    target: null,
    type: "evade"
  },
  {
    id: "repo-job", name: "Repo Job", reward: 200, timeLimit: 150,
    giver: "The Lockup",
    brief: "A coupe parked uptown has missed too many payments. Steal it — yes, that will draw heat — and deliver it to the lockup garage on the north side.",
    start: { x: 100, z: 100 },
    target: { x: -150, z: -150 },
    type: "deliver",
    stealAt: { x: 125, z: 100 }
  },
  {
    id: "bay-tour", name: "Bay Tour", reward: 350, timeLimit: 150,
    giver: "Rally Rex",
    brief: "Rex runs an illegal street circuit around the whole city. Hit all four checkpoints IN ORDER before the timer dies — any car, any line, just be fast. Miss the clock and the purse is gone.",
    start: { x: 0, z: 0 },
    target: { x: 150, z: 150 },
    type: "checkpoints",
    checkpoints: [
      { x: 150, z: 150 }, { x: -150, z: 150 },
      { x: -150, z: -150 }, { x: 150, z: -150 }
    ]
  },
  {
    id: "postcard-run", name: "Postcard Run", reward: 300, timeLimit: 0,
    giver: "Sunny Snaps",
    brief: "Sunny needs five postcard shots for the tourist board: the Tower, the lifeguard post, the boardwalk, the marina and the north gate. Any order, no timer — show up at each spot and the shot is yours.",
    start: { x: 50, z: 50 },
    target: { x: 8, z: -8 },
    type: "collect",
    spots: [
      { x: 8, z: -8 }, { x: 60, z: 218 }, { x: -175, z: 213 },
      { x: 192, z: 100 }, { x: -192, z: -100 }
    ]
  }
];

SB.MissionManager = function (scene, tex) {
  this.scene = scene;
  this.tex = tex;
  this.active = null;      // { def, t, stage }
  this.completed = {};
  this.beacon = this.makeBeacon(0xffc93c);
  this.beacon.visible = false;
  scene.add(this.beacon);
  this.startMarkers = [];
  for (var i = 0; i < SB.MISSIONS.length; i++) {
    var m = this.makeBeacon(0x3ddc84, true);
    m.position.set(SB.MISSIONS[i].start.x, 0, SB.MISSIONS[i].start.z);
    m.userData.missionId = SB.MISSIONS[i].id;
    scene.add(m);
    this.startMarkers.push(m);
  }
  this.markedCar = null;
};

SB.MissionManager.prototype.makeBeacon = function (color, small) {
  var g = new THREE.Group();
  var h = small ? 10 : 26;
  var pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.1, h, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false })
  );
  pillar.position.y = h / 2;
  g.add(pillar);
  var ring = new THREE.Mesh(
    new THREE.RingGeometry(2.2, 3.0, 24),
    new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  g.add(ring);
  var arrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.9, 2.0, 4),
    new THREE.MeshBasicMaterial({ color: color })
  );
  arrow.rotation.x = Math.PI;
  arrow.position.y = h + 1.5;
  g.add(arrow);
  g.userData.arrow = arrow;
  g.userData.baseH = h;
  return g;
};

SB.MissionManager.prototype.isComplete = function (id) {
  return !!this.completed[id];
};

SB.MissionManager.prototype.allComplete = function () {
  for (var i = 0; i < SB.MISSIONS.length; i++) if (!this.completed[SB.MISSIONS[i].id]) return false;
  return true;
};

SB.MissionManager.prototype.startMission = function (id, game) {
  var def = null;
  for (var i = 0; i < SB.MISSIONS.length; i++) if (SB.MISSIONS[i].id === id) def = SB.MISSIONS[i];
  if (!def || this.active) return false;
  this.active = { def: def, t: 0, stage: "go" };
  if (def.type === "evade") {
    game.police.setWanted(3);
  }
  if (def.type === "deliver") {
    // The marked coupe waits at the steal spot.
    var car = SB.makeCar("coupe", 0xe0a92e, def.stealAt.x, def.stealAt.z, Math.PI / 2, this.tex);
    car.isMarked = true;
    this.scene.add(car.group);
    game.cars.push(car);
    this.markedCar = car;
    this.beacon.position.set(def.stealAt.x, 0, def.stealAt.z);
  } else if (def.type === "checkpoints") {
    this.active.checkpoint = 0;
    this.beacon.position.set(def.checkpoints[0].x, 0, def.checkpoints[0].z);
  } else if (def.type === "collect") {
    this.active.visited = {};
    this.active.found = 0;
    var near = this.nearestSpot(def, game.playerX(), game.playerZ(), this.active.visited);
    this.beacon.position.set(near.x, 0, near.z);
  } else if (def.target) {
    this.beacon.position.set(def.target.x, 0, def.target.z);
  }
  this.beacon.visible = true;
  this.refreshStartMarkers();
  if (SB.hud) {
    SB.hud.toast("Mission: " + def.name);
    SB.hud.showBrief(def);
  }
  if (SB.audio) SB.audio.sfx("mission");
  return true;
};

SB.MissionManager.prototype.refreshStartMarkers = function () {
  for (var i = 0; i < this.startMarkers.length; i++) {
    var m = this.startMarkers[i];
    m.visible = !this.active && !this.completed[m.userData.missionId];
  }
};

SB.MissionManager.prototype.finish = function (won, game) {
  var def = this.active.def;
  this.active = null;
  this.beacon.visible = false;
  if (won) {
    this.completed[def.id] = true;
    game.money += def.reward;
    if (SB.hud) SB.hud.toast("Mission complete! +$" + def.reward);
    if (SB.audio) SB.audio.sfx("win");
    game.saveGame();
    if (this.allComplete() && SB.hud) SB.hud.showVictory(game);
  } else {
    if (SB.hud) SB.hud.toast("Mission failed: " + def.name);
    if (SB.audio) SB.audio.sfx("fail");
  }
  if (this.markedCar && !won) {
    // Leave the marked car where it is; it stays stealable in free roam.
    this.markedCar.isMarked = false;
    this.markedCar = null;
  }
  this.refreshStartMarkers();
};

SB.MissionManager.prototype.nearestSpot = function (def, px, pz, visited) {
  var best = null, bestD = 1e9;
  for (var i = 0; i < def.spots.length; i++) {
    if (visited[i]) continue;
    var d = Math.hypot(def.spots[i].x - px, def.spots[i].z - pz);
    if (d < bestD) { bestD = d; best = def.spots[i]; }
  }
  return best || def.spots[0];
};

SB.MissionManager.prototype.update = function (dt, game) {
  var t = performance.now() / 1000;
  for (var i = 0; i < this.startMarkers.length; i++) {
    var m = this.startMarkers[i];
    if (m.visible) m.userData.arrow.position.y = m.userData.baseH + 1.5 + Math.sin(t * 2 + i) * 0.5;
  }
  if (!this.active) return;
  var a = this.active;
  a.t += dt;
  var def = a.def;
  if (this.beacon.visible) {
    this.beacon.userData.arrow.position.y = this.beacon.userData.baseH + 1.5 + Math.sin(t * 2.5) * 0.6;
    this.beacon.rotation.y += dt * 0.8;
  }
  var px = game.playerX(), pz = game.playerZ();
  if (def.timeLimit > 0 && a.t > def.timeLimit) {
    this.finish(false, game);
    return;
  }
  if (def.type === "reach") {
    if (Math.hypot(px - def.target.x, pz - def.target.z) < 8) this.finish(true, game);
  } else if (def.type === "evade") {
    if (a.t > 3 && game.police.wanted === 0) this.finish(true, game);
  } else if (def.type === "checkpoints") {
    var cp = def.checkpoints[a.checkpoint];
    if (Math.hypot(px - cp.x, pz - cp.z) < 10) {
      a.checkpoint++;
      if (SB.audio) SB.audio.sfx("pickup");
      if (a.checkpoint >= def.checkpoints.length) {
        this.finish(true, game);
      } else {
        if (SB.hud) SB.hud.toast("Checkpoint " + a.checkpoint + "/" + def.checkpoints.length + "!");
        var next = def.checkpoints[a.checkpoint];
        this.beacon.position.set(next.x, 0, next.z);
      }
    }
  } else if (def.type === "collect") {
    for (var si = 0; si < def.spots.length; si++) {
      if (a.visited[si]) continue;
      var sp = def.spots[si];
      if (Math.hypot(px - sp.x, pz - sp.z) < 8) {
        a.visited[si] = true;
        a.found++;
        if (SB.audio) SB.audio.sfx("pickup");
        if (a.found >= def.spots.length) {
          this.finish(true, game);
          return;
        }
        if (SB.hud) SB.hud.toast("Postcard " + a.found + "/" + def.spots.length + " snapped!");
        var near = this.nearestSpot(def, px, pz, a.visited);
        this.beacon.position.set(near.x, 0, near.z);
        break;
      }
    }
  } else if (def.type === "deliver") {
    if (a.stage === "go" && game.playerCar === this.markedCar) {
      a.stage = "deliver";
      this.beacon.position.set(def.target.x, 0, def.target.z);
      if (SB.hud) SB.hud.toast("Got the coupe! Deliver it to the lockup.");
    }
    if (a.stage === "deliver" && game.playerCar === this.markedCar &&
        Math.hypot(px - def.target.x, pz - def.target.z) < 9) {
      this.finish(true, game);
      // The delivered car leaves the world.
      this.scene.remove(this.markedCar.group);
      var ci = game.cars.indexOf(this.markedCar);
      if (ci >= 0) game.cars.splice(ci, 1);
      this.markedCar = null;
    }
  }
};

SB.MissionManager.prototype.objectiveText = function () {
  if (!this.active) return "";
  var def = this.active.def, a = this.active;
  if (def.type === "reach") {
    var left = Math.max(0, def.timeLimit - a.t);
    return def.name + ": reach the beacon — " + Math.ceil(left) + "s left";
  }
  if (def.type === "evade") return def.name + ": lose the cops (wanted " + (SB.game ? SB.game.police.wanted : "?") + ")";
  if (def.type === "checkpoints") {
    var leftCp = Math.max(0, def.timeLimit - a.t);
    return def.name + ": checkpoint " + (a.checkpoint + 1) + "/" + def.checkpoints.length + " — " + Math.ceil(leftCp) + "s left";
  }
  if (def.type === "collect") return def.name + ": postcards " + a.found + "/" + def.spots.length;
  if (a.stage === "go") return def.name + ": steal the marked coupe";
  return def.name + ": deliver the coupe to the lockup";
};
