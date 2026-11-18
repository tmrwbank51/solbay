// The wanted system: stars, police pursuit cars, evasion and the bust meter.
// Pursuit cars navigate the street grid: they route along roads toward the
// intersection nearest the player (Manhattan legs), switch to direct pursuit
// inside 28 units, and reverse out when wedged against a building.
var SB = window.SB || (window.SB = {});

SB.Police = function (scene, tex, colliders) {
  this.scene = scene;
  this.tex = tex;
  this.colliders = colliders;
  this.wanted = 0;
  this.cars = [];
  this.evadeT = 0;
  this.bustT = 0;
  this.busted = false;
  this.spawnT = 0;
  this.flashT = 0;
};

SB.Police.prototype.setWanted = function (n, silent) {
  this.wanted = Math.max(0, Math.min(5, Math.round(n)));
  if (this.wanted === 0) this.evadeT = 0;
  if (!silent && SB.audio) SB.audio.setSiren(this.wanted > 0);
  return this.wanted;
};

SB.Police.prototype.addWanted = function (n) {
  if (this.wanted < 5) {
    this.setWanted(this.wanted + n);
    return true;
  }
  return false;
};

SB.Police.prototype.wantedTarget = function () {
  return this.wanted === 0 ? 0 : this.wanted <= 2 ? this.wanted : this.wanted + 1;
};

SB.Police.prototype.spawnPoliceCar = function (px, pz, rng) {
  // Spawn on a road 60-90 units from the player.
  var road = rng.pick(SB.CITY.roads);
  var vertical = rng.chance(0.5);
  var x, z;
  for (var tries = 0; tries < 12; tries++) {
    var along = rng.range(-190, 190);
    x = vertical ? road : along;
    z = vertical ? along : road;
    var d = Math.hypot(x - px, z - pz);
    if (d > 55 && d < 110) break;
  }
  var heading = Math.atan2(px - x, pz - z);
  var car = SB.makeCar("police", 0x14181c, x, z, heading, this.tex);
  car.isPolice = true;
  car.route = null;
  car.routeT = 0;
  car.routeGoal = "";
  car.stuckT = 0;
  car.unstickT = 0;
  car.unstickDir = 1;
  car.detour = null;
  this.scene.add(car.group);
  this.cars.push(car);
  return car;
};

SB.Police.prototype.despawnCar = function (car) {
  this.scene.remove(car.group);
  var i = this.cars.indexOf(car);
  if (i >= 0) this.cars.splice(i, 1);
};

SB.Police.prototype.nearestRoad = function (v) {
  return Math.round(v / 50) * 50;
};

// Manhattan route: nearest intersection -> along the cross road -> down the
// player's avenue to the intersection nearest the player. Every leg runs
// along a road, so the car never has to cross a city block.
SB.Police.prototype.planRoute = function (car, px, pz) {
  var gx = this.nearestRoad(px), gz = this.nearestRoad(pz);
  var rx = this.nearestRoad(car.x), rz = this.nearestRoad(car.z);
  var legs = [[rx, rz]];
  if (rx !== gx) legs.push([gx, rz]);
  if (rz !== gz) legs.push([gx, gz]);
  while (legs.length > 1 && Math.hypot(legs[0][0] - car.x, legs[0][1] - car.z) < 7) legs.shift();
  car.route = legs;
  car.routeT = 0;
  car.routeGoal = gx + "," + gz;
};

// Place one police car at exact coordinates (used by the chase scene preset).
SB.Police.prototype.spawnPoliceCarAt = function (x, z, heading) {
  var car = SB.makeCar("police", 0x14181c, x, z, heading, this.tex);
  car.isPolice = true;
  car.route = null;
  car.routeT = 0;
  car.routeGoal = "";
  car.stuckT = 0;
  car.unstickT = 0;
  car.unstickDir = 1;
  car.detour = null;
  this.scene.add(car.group);
  this.cars.push(car);
  return car;
};
SB.Police.prototype.pursue = function (car, dt, ctx, allCars) {
  var px = ctx.px, pz = ctx.pz;
  var dist = Math.hypot(px - car.x, pz - car.z) || 1;
  var tx, tz, direct = dist < 28;
  if (direct) {
    tx = px + ctx.pvx * 0.5; tz = pz + ctx.pvz * 0.5;
    car.detour = null;
  } else if (car.detour) {
    // Detour: drive sideways to clear the obstacle, then resume the route.
    tx = car.detour[0]; tz = car.detour[1];
    if (Math.hypot(tx - car.x, tz - car.z) < 6) car.detour = null;
  } else {
    car.routeT += dt;
    var goal = this.nearestRoad(px) + "," + this.nearestRoad(pz);
    if (!car.route || car.routeT > 2.5 || car.routeGoal !== goal) this.planRoute(car, px, pz);
    // Shift legs early so the car starts its turn before the intersection
    // instead of overshooting it and swinging wide into the corner building.
    while (car.route.length > 1 && Math.hypot(car.route[0][0] - car.x, car.route[0][1] - car.z) < 12) car.route.shift();
    if (car.route.length === 1 && Math.hypot(car.route[0][0] - car.x, car.route[0][1] - car.z) < 7) {
      // Reached the target intersection: replan (the player has moved on).
      this.planRoute(car, px, pz);
    }
    tx = car.route[0][0]; tz = car.route[0][1];
  }
  var dx = tx - car.x, dz = tz - car.z;
  var legDist = Math.hypot(dx, dz) || 1;
  var desired = Math.atan2(dx, dz);
  var dh = desired - car.heading;
  while (dh > Math.PI) dh -= Math.PI * 2;
  while (dh < -Math.PI) dh += Math.PI * 2;
  var steer = Math.max(-1, Math.min(1, dh * 2.2));
  var throttle = 1, brake = 0;
  if (direct) {
    // Close in fast from range, then ease off so the car pulls alongside
    // instead of ramming the player at full speed and overshooting.
    if (dist < 7 && ctx.playerSpeed < 2) {
      // Hold position near a slow player: the bust meter does the rest.
      throttle = 0; brake = 1;
    } else {
      var want = Math.min(30, Math.max(4, dist * 0.9));
      if (car.speed > want) { throttle = 0; brake = 0.8; }
      else throttle = 0.9;
    }
  } else {
    // Cap the approach speed by distance to the player so the car arrives
    // at the direct zone under control instead of flying through it.
    var wantRoute = Math.min(44, Math.max(10, dist * 0.9));
    if (car.speed > wantRoute) { throttle = 0; brake = 0.6; }
    if (legDist < 15 && Math.abs(dh) > 0.5) {
      // Slow for the turn at the end of a road leg so the arc stays on the road.
      if (car.speed > 16) { throttle = 0; brake = 0.6; }
      else throttle = Math.min(throttle, 0.4);
    }
  }
  // Unstick: throttle down but barely moving means wedged against something.
  // Reverse out, then detour sideways — replanning the same route from the
  // same spot would drive straight back into the same wall.
  if (car.unstickT > 0) {
    car.unstickT -= dt;
    throttle = 0; brake = 1; steer = car.unstickDir;
  } else if (throttle > 0 && Math.abs(car.speed) < 2) {
    car.stuckT += dt;
    if (car.stuckT > 1.2) {
      car.unstickT = 0.8;
      car.unstickDir = -car.unstickDir;
      car.stuckT = 0;
      car.route = null;
      var side = car.unstickDir;
      var perpX = Math.cos(car.heading) * side, perpZ = -Math.sin(car.heading) * side;
      car.detour = [car.x + perpX * 22, car.z + perpZ * 22];
    }
  } else {
    car.stuckT = 0;
  }
  var crash = SB.stepCar(car, dt, { throttle: throttle, brake: brake, steer: steer, handbrake: false }, this.colliders, allCars);
  return crash;
};

SB.Police.prototype.update = function (dt, ctx, rng, allCars) {
  // ctx: { px, pz, pvx, pvz, playerSpeed, inCar, playerAlive }
  if (!ctx.playerAlive) return { bust: false, crash: 0 };
  var target = this.wantedTarget();
  this.spawnT -= dt;
  if (this.cars.length < target && this.spawnT <= 0 && this.wanted > 0) {
    this.spawnPoliceCar(ctx.px, ctx.pz, rng);
    this.spawnT = 1.2;
  }
  var crash = 0;
  var nearest = 1e9;
  for (var i = this.cars.length - 1; i >= 0; i--) {
    var car = this.cars[i];
    var d = Math.hypot(car.x - ctx.px, car.z - ctx.pz);
    nearest = Math.min(nearest, d);
    if (this.wanted === 0 && d > 60) {
      this.despawnCar(car);
      continue;
    }
    if (d > 220) {
      // Too far behind: respawn closer so the chase never dies out.
      this.despawnCar(car);
      this.spawnPoliceCar(ctx.px, ctx.pz, rng);
      continue;
    }
    // Only crashes right next to the player can hurt the player: a distant
    // police car hitting a building must never damage the player remotely.
    var pc = this.pursue(car, dt, ctx, allCars);
    if (d < 10) crash = Math.max(crash, pc);
  }
  // Evasion: no police within 85 units for long enough drops a star.
  if (this.wanted > 0 && nearest > 85) {
    this.evadeT += dt;
    var need = 5 + this.wanted * 2;
    if (this.evadeT >= need) {
      this.setWanted(this.wanted - 1);
      this.evadeT = 0;
      if (SB.hud) SB.hud.toast(this.wanted === 0 ? "You lost the cops!" : "Heat dropping… " + this.wanted + " stars left");
    }
  } else {
    this.evadeT = 0;
  }
  // Bust meter: police close and the player nearly stopped.
  var bust = false;
  if (this.wanted > 0 && nearest < 11 && ctx.playerSpeed < 2.5) {
    this.bustT += dt / 3;
    if (this.bustT >= 1) bust = true;
  } else {
    this.bustT = Math.max(0, this.bustT - dt * 0.5);
  }
  this.flashT += dt;
  return { bust: bust, crash: crash, nearest: nearest };
};

SB.Police.prototype.clearAll = function () {
  for (var i = this.cars.length - 1; i >= 0; i--) this.despawnCar(this.cars[i]);
  this.setWanted(0, true);
  this.bustT = 0;
  this.evadeT = 0;
  if (SB.audio) SB.audio.setSiren(false);
};
