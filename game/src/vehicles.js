// Vehicles for SOLBAY: procedural car models, arcade driving physics shared
// by the player, traffic and police, plus the traffic system itself.
var SB = window.SB || (window.SB = {});

SB.CAR_SPECS = {
  sedan: { maxSpeed: 38, accel: 15, brake: 30, grip: 6.5, turn: 2.1, length: 4.4, width: 2.0 },
  coupe: { maxSpeed: 48, accel: 19, brake: 32, grip: 7.2, turn: 2.3, length: 4.1, width: 1.9 },
  van: { maxSpeed: 30, accel: 11, brake: 26, grip: 5.8, turn: 1.8, length: 4.8, width: 2.1 },
  bike: { maxSpeed: 52, accel: 23, brake: 30, grip: 5.4, turn: 2.9, length: 2.6, width: 0.9 },
  police: { maxSpeed: 48, accel: 18, brake: 34, grip: 7.0, turn: 2.4, length: 4.4, width: 2.0 }
};

SB.CAR_COLORS = [0xc23b2e, 0x2e6fc2, 0xe0a92e, 0x3a3f44, 0xe8e8e8, 0x2e8c4a, 0x7a4a9c, 0xd86a2e, 0x4ab2c2, 0x8c2e4a];

// Build one procedural car. Returns { group, wheels, steerWheels, lightBar }.
SB.buildCarModel = function (kind, color, tex) {
  if (kind === "bike") return SB.buildBikeModel(color);
  var spec = SB.CAR_SPECS[kind];
  var g = new THREE.Group();
  var L = spec.length, W = spec.width;
  var bodyMat = new THREE.MeshLambertMaterial({ color: color });
  var glassMat = new THREE.MeshLambertMaterial({ color: 0x1a2733 });
  var darkMat = new THREE.MeshLambertMaterial({ color: 0x1c1c1e });

  var body = new THREE.Mesh(new THREE.BoxGeometry(W, 0.75, L), bodyMat);
  body.position.y = 0.55;
  g.add(body);
  var cabinH = kind === "van" ? 0.95 : 0.7;
  var cabin = new THREE.Mesh(new THREE.BoxGeometry(W * 0.86, cabinH, L * (kind === "van" ? 0.8 : 0.48)), kind === "van" ? bodyMat : glassMat);
  cabin.position.set(0, 0.55 + 0.38 + cabinH / 2 - 0.1, kind === "van" ? 0.2 : -L * 0.06);
  g.add(cabin);
  if (kind === "van") {
    var windshield = new THREE.Mesh(new THREE.BoxGeometry(W * 0.8, 0.6, 0.1), glassMat);
    windshield.position.set(0, 1.25, L * 0.42);
    windshield.rotation.x = -0.25;
    g.add(windshield);
  }
  // Bumpers.
  var bumpF = new THREE.Mesh(new THREE.BoxGeometry(W + 0.08, 0.3, 0.3), darkMat);
  bumpF.position.set(0, 0.42, L / 2);
  g.add(bumpF);
  var bumpR = bumpF.clone();
  bumpR.position.z = -L / 2;
  g.add(bumpR);
  // Headlights + taillights (emissive so they read at night).
  var headMat = new THREE.MeshBasicMaterial({ color: 0xfff6cc });
  var tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a22 });
  var headGeo = new THREE.BoxGeometry(0.42, 0.22, 0.08);
  var tailGeo = new THREE.BoxGeometry(0.42, 0.22, 0.08);
  [-1, 1].forEach(function (s) {
    var h = new THREE.Mesh(headGeo, headMat);
    h.position.set(s * (W / 2 - 0.35), 0.62, L / 2 + 0.02);
    g.add(h);
    var t = new THREE.Mesh(tailGeo, tailMat);
    t.position.set(s * (W / 2 - 0.35), 0.62, -L / 2 - 0.02);
    g.add(t);
  });
  // Wheels: cylinders rotated to roll around the x-axis.
  var wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  var wheels = [], steerWheels = [];
  [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(function (p, i) {
    var pivot = new THREE.Group();
    pivot.position.set(p[0] * (W / 2 - 0.05), 0.38, p[1] * (L / 2 - 0.85));
    var wheel = new THREE.Mesh(wheelGeo, darkMat);
    pivot.add(wheel);
    g.add(pivot);
    wheels.push(wheel);
    if (p[1] === 1) steerWheels.push(pivot);
  });
  var out = { group: g, wheels: wheels, steerWheels: steerWheels, lightBar: null };
  if (kind === "police") {
    // Livery stripe + light bar.
    var stripe = new THREE.Mesh(new THREE.PlaneGeometry(L * 0.7, 0.5), new THREE.MeshBasicMaterial({ map: tex.police }));
    stripe.rotation.y = Math.PI / 2;
    stripe.position.set(W / 2 + 0.01, 0.6, 0);
    g.add(stripe);
    var stripe2 = stripe.clone();
    stripe2.rotation.y = -Math.PI / 2;
    stripe2.position.x = -W / 2 - 0.01;
    g.add(stripe2);
    var bar = new THREE.Group();
    var red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.3), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    red.position.x = -0.3;
    var blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.3), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    blue.position.x = 0.3;
    bar.add(red); bar.add(blue);
    bar.position.set(0, 1.55, -L * 0.06);
    g.add(bar);
    out.lightBar = { red: red, blue: blue, phase: 0 };
  }
  return out;
};

// Build one procedural motorcycle: two wheels, a tank, a seat and bars.
// Same return shape as buildCarModel so stepCar drives it unchanged.
SB.buildBikeModel = function (color) {
  var g = new THREE.Group();
  var bodyMat = new THREE.MeshLambertMaterial({ color: color });
  var darkMat = new THREE.MeshLambertMaterial({ color: 0x1c1c1e });
  var chromeMat = new THREE.MeshLambertMaterial({ color: 0xb8bcc0 });
  // Frame + tank + seat, all narrow.
  var frame = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 1.7), darkMat);
  frame.position.y = 0.55;
  g.add(frame);
  var tank = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.6), bodyMat);
  tank.position.set(0, 0.72, 0.15);
  g.add(tank);
  var seat = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.6), darkMat);
  seat.position.set(0, 0.7, -0.45);
  g.add(seat);
  // Front fork, raked forward, and the handlebar.
  var fork = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.1), chromeMat);
  fork.position.set(0, 0.62, 0.88);
  fork.rotation.x = 0.42;
  g.add(fork);
  var bars = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.08), darkMat);
  bars.position.set(0, 1.02, 0.72);
  g.add(bars);
  // Headlight + taillight (emissive so they read at night).
  var head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, 0.08), new THREE.MeshBasicMaterial({ color: 0xfff6cc }));
  head.position.set(0, 0.78, 1.02);
  g.add(head);
  var tail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.06), new THREE.MeshBasicMaterial({ color: 0xff2a22 }));
  tail.position.set(0, 0.66, -1.02);
  g.add(tail);
  // Wheels: thin cylinders, front one on a steering pivot.
  var wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.12, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  var wheels = [], steerWheels = [];
  [[1, true], [-1, false]].forEach(function (p) {
    var pivot = new THREE.Group();
    pivot.position.set(0, 0.36, p[0] * 0.95);
    var wheel = new THREE.Mesh(wheelGeo, darkMat);
    pivot.add(wheel);
    g.add(pivot);
    wheels.push(wheel);
    if (p[1]) steerWheels.push(pivot);
  });
  return { group: g, wheels: wheels, steerWheels: steerWheels, lightBar: null };
};

SB.makeCar = function (kind, color, x, z, heading, tex) {
  var model = SB.buildCarModel(kind, color, tex);
  model.group.position.set(x, 0, z);
  model.group.rotation.y = heading;
  return {
    kind: kind, model: model, group: model.group,
    x: x, z: z, heading: heading, speed: 0,
    vx: 0, vz: 0, steer: 0, health: 100,
    isPlayer: false, isPolice: kind === "police", isTraffic: false,
    wheelSpin: 0, smoke: 0, honked: 0
  };
};

// One arcade physics step. input: { throttle 0..1, brake 0..1, steer -1..1,
// handbrake bool, reverse bool }. Returns a crash impulse (0 when no crash).
SB.stepCar = function (car, dt, input, colliders, others) {
  var spec = SB.CAR_SPECS[car.kind];
  var targetSteer = (input.steer || 0) * (car.speed >= 0 ? 1 : -1);
  car.steer += (targetSteer - car.steer) * Math.min(1, dt * 8);
  var speedFactor = Math.min(1, Math.abs(car.speed) / 12);
  car.heading += car.steer * spec.turn * speedFactor * dt * (car.speed >= 0 ? 1 : -1);
  if (input.throttle) car.speed += spec.accel * input.throttle * dt;
  if (input.brake) {
    if (car.speed > 0.5) car.speed -= spec.brake * dt;
    else car.speed -= spec.accel * 0.6 * input.brake * dt; // reverse
  }
  if (!input.throttle && !input.brake) {
    car.speed -= car.speed * 0.7 * dt; // rolling drag
    if (Math.abs(car.speed) < 0.15) car.speed = 0;
  }
  // A battered car loses top speed: at 0 health it crawls at 55% of its
  // spec. Traffic and police stay at full health, so only the player's car
  // (and anything the player wrecks) feels it. Vic's Garage restores it.
  var effMax = spec.maxSpeed * (car.health >= 100 ? 1 : 0.55 + 0.45 * Math.max(0, car.health) / 100);
  car.speed = Math.max(-11, Math.min(effMax, car.speed));
  // Velocity follows the heading with grip; handbrake breaks grip (drift).
  var fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  var grip = input.handbrake ? 1.6 : spec.grip;
  car.vx += (fx * car.speed - car.vx) * Math.min(1, grip * dt);
  car.vz += (fz * car.speed - car.vz) * Math.min(1, grip * dt);
  var nx = car.x + car.vx * dt, nz = car.z + car.vz * dt;
  // World bounds + waterline.
  nx = Math.max(-SB.CITY.bound, Math.min(SB.CITY.bound, nx));
  nz = Math.max(-SB.CITY.bound, Math.min(SB.CITY.waterZ - 3, nz));
  var before = { x: nx, z: nz };
  var fixed = SB.collideCircle(colliders, nx, nz, 2.1);
  var crash = 0;
  if (fixed.x !== before.x || fixed.z !== before.z) {
    var impact = Math.hypot(car.vx, car.vz);
    if (impact > 6) crash = impact;
    car.vx *= 0.35; car.vz *= 0.35;
    car.speed *= 0.45;
  }
  car.x = fixed.x; car.z = fixed.z;
  // Car-vs-car: soft push-apart.
  if (others) {
    for (var i = 0; i < others.length; i++) {
      var o = others[i];
      if (o === car) continue;
      var dx = car.x - o.x, dz = car.z - o.z;
      var d = Math.hypot(dx, dz);
      if (d < 4.2 && d > 0.01) {
        var push = (4.2 - d) / 2;
        car.x += (dx / d) * push; car.z += (dz / d) * push;
        var rel = Math.hypot(car.vx - o.vx, car.vz - o.vz);
        if (rel > 5) crash = Math.max(crash, rel * 0.7);
        car.vx *= 0.6; car.vz *= 0.6;
      }
    }
  }
  car.group.position.set(car.x, 0, car.z);
  car.group.rotation.y = car.heading;
  car.wheelSpin += (car.speed / 0.38) * dt;
  for (var w = 0; w < car.model.wheels.length; w++) car.model.wheels[w].rotation.x = car.wheelSpin;
  for (var s = 0; s < car.model.steerWheels.length; s++) car.model.steerWheels[s].rotation.y = car.steer * 0.45;
  if (car.model.lightBar) {
    car.model.lightBar.phase += dt * 10;
    var on = Math.sin(car.model.lightBar.phase) > 0;
    car.model.lightBar.red.material.color.setHex(on ? 0xff2222 : 0x551111);
    car.model.lightBar.blue.material.color.setHex(on ? 0x111155 : 0x2244ff);
  }
  return crash;
};

// --- Traffic: cars looping the road grid, braking for what is ahead. ---
SB.Traffic = function (scene, rng, tex, colliders, count) {
  this.cars = [];
  this.rng = rng;
  this.tex = tex;
  this.colliders = colliders;
  var kinds = ["sedan", "sedan", "coupe", "van"];
  for (var i = 0; i < count; i++) this.spawnCar(scene, kinds[i % kinds.length]);
};

SB.Traffic.prototype.spawnCar = function (scene, kind) {
  var rng = this.rng;
  var vertical = rng.chance(0.5);
  var road = rng.pick(SB.CITY.roads);
  var along = rng.range(-190, 190);
  var dir = rng.chance(0.5) ? 1 : -1;
  var x = vertical ? road + (dir > 0 ? 3.5 : -3.5) : along;
  var z = vertical ? along : road + (dir > 0 ? 3.5 : -3.5);
  var heading = vertical ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  var car = SB.makeCar(kind, rng.pick(SB.CAR_COLORS), x, z, heading, this.tex);
  car.isTraffic = true;
  car.axis = vertical ? "z" : "x";
  car.dir = dir;
  car.cruise = rng.range(9, 14);
  car.speed = car.cruise;
  scene.add(car.group);
  this.cars.push(car);
  return car;
};

SB.Traffic.prototype.aheadBlocked = function (car, others, playerPos) {
  var fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  function blocks(px, pz, r) {
    var dx = px - car.x, dz = pz - car.z;
    var along = dx * fx + dz * fz;
    if (along < 0 || along > 12) return false;
    var side = Math.abs(dx * fz - dz * fx);
    return side < 2.4 + r;
  }
  for (var i = 0; i < others.length; i++) {
    if (others[i] !== car && blocks(others[i].x, others[i].z, 0)) return true;
  }
  if (playerPos && blocks(playerPos.x, playerPos.z, 0.5)) return true;
  return false;
};

SB.Traffic.prototype.update = function (dt, allCars, playerPos, peds) {
  for (var i = 0; i < this.cars.length; i++) {
    var car = this.cars[i];
    if (car.isPlayer) continue;
    // At intersections, sometimes turn onto the crossing road.
    var nearX = Math.abs(car.x % 50) < 3 || Math.abs(car.x % 50) > 47;
    var nearZ = Math.abs(car.z % 50) < 3 || Math.abs(car.z % 50) > 47;
    if (nearX && nearZ && this.rng.chance(dt * 0.5)) {
      car.axis = car.axis === "z" ? "x" : "z";
      car.dir = this.rng.chance(0.5) ? 1 : -1;
      car.heading = car.axis === "z" ? (car.dir > 0 ? 0 : Math.PI) : (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      // Snap onto the lane centre of the new road.
      if (car.axis === "z") car.x = Math.round(car.x / 50) * 50 + (car.dir > 0 ? 3.5 : -3.5);
      else car.z = Math.round(car.z / 50) * 50 + (car.dir > 0 ? 3.5 : -3.5);
    }
    // Turn around at the city edge instead of leaving.
    if (car.axis === "z" && Math.abs(car.z) > 198) car.dir *= -1;
    if (car.axis === "x" && Math.abs(car.x) > 198) car.dir *= -1;
    var targetHeading = car.axis === "z" ? (car.dir > 0 ? 0 : Math.PI) : (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    var dh = targetHeading - car.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    car.heading += dh * Math.min(1, dt * 2);
    var blocked = this.aheadBlocked(car, allCars, playerPos);
    if (peds) {
      for (var p = 0; p < peds.length; p++) {
        if (peds[p].down) continue;
        var dx = peds[p].x - car.x, dz = peds[p].z - car.z;
        var fx = Math.sin(car.heading), fz = Math.cos(car.heading);
        if (dx * fx + dz * fz > 0 && dx * fx + dz * fz < 9 && Math.abs(dx * fz - dz * fx) < 2.4) { blocked = true; break; }
      }
    }
    var input = { throttle: blocked ? 0 : 1, brake: blocked ? 1 : 0, steer: 0, handbrake: false };
    if (!blocked && car.speed < car.cruise) input.throttle = 1;
    if (car.speed > car.cruise) input = { throttle: 0, brake: 0.4, steer: 0, handbrake: false };
    SB.stepCar(car, dt, input, this.colliders, allCars);
  }
};
