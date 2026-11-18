// The on-foot character: a procedural low-poly person with a walk cycle,
// jump physics and a punch, shared by the player and the pedestrians.
var SB = window.SB || (window.SB = {});

SB.buildCharacterModel = function (shirt, pants, skin) {
  var g = new THREE.Group();
  var skinMat = new THREE.MeshLambertMaterial({ color: skin });
  var shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  var pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  var head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skinMat);
  head.position.y = 1.62;
  g.add(head);
  var hair = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.14, 0.44), new THREE.MeshLambertMaterial({ color: 0x2a2018 }));
  hair.position.y = 1.86;
  g.add(hair);
  var torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), shirtMat);
  torso.position.y = 1.12;
  g.add(torso);
  function limb(mat, w, len, px, py) {
    var pivot = new THREE.Group();
    pivot.position.set(px, py, 0);
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, len, w), mat);
    m.position.y = -len / 2;
    pivot.add(m);
    g.add(pivot);
    return pivot;
  }
  var armL = limb(shirtMat, 0.16, 0.58, -0.36, 1.38);
  var armR = limb(shirtMat, 0.16, 0.58, 0.36, 1.38);
  var legL = limb(pantsMat, 0.2, 0.78, -0.15, 0.8);
  var legR = limb(pantsMat, 0.2, 0.78, 0.15, 0.8);
  return { group: g, head: head, torso: torso, armL: armL, armR: armR, legL: legL, legR: legR };
};

SB.animateCharacter = function (model, walkPhase, speedNorm, punchT) {
  var swing = Math.sin(walkPhase) * 0.65 * speedNorm;
  model.legL.rotation.x = swing;
  model.legR.rotation.x = -swing;
  if (punchT > 0) {
    // Punch: right arm snaps forward, then recovers.
    var k = punchT > 0.18 ? (0.3 - punchT) / 0.12 : punchT / 0.18;
    model.armR.rotation.x = -1.5 * Math.max(0, Math.min(1, k));
    model.armL.rotation.x = -swing * 0.5;
  } else {
    model.armL.rotation.x = -swing;
    model.armR.rotation.x = swing;
  }
  model.group.position.y = Math.abs(Math.cos(walkPhase)) * 0.04 * speedNorm;
};

// The player on foot.
SB.Player = function (scene, x, z) {
  this.model = SB.buildCharacterModel(0x2e6fc2, 0x333a44, 0xe0b08c);
  this.model.group.position.set(x, 0, z);
  scene.add(this.model.group);
  this.x = x; this.z = z; this.y = 0; this.vy = 0;
  this.heading = 0; this.speed = 0; this.walkPhase = 0;
  this.health = 100; this.punchT = 0; this.punchHitDone = true;
  this.onGround = true;
};

SB.Player.prototype.update = function (dt, input, colliders, camYaw) {
  // input: { fwd, strafe, jump, punch } in camera space.
  var mx = 0, mz = 0;
  if (input.fwd) { mx += Math.sin(camYaw); mz += Math.cos(camYaw); }
  if (input.back) { mx -= Math.sin(camYaw); mz -= Math.cos(camYaw); }
  if (input.strafe > 0) { mx += Math.cos(camYaw); mz -= Math.sin(camYaw); }
  if (input.strafe < 0) { mx -= Math.cos(camYaw); mz += Math.sin(camYaw); }
  var moving = (mx !== 0 || mz !== 0);
  var run = input.run ? 8.5 : 5.0;
  if (moving) {
    var len = Math.hypot(mx, mz);
    mx /= len; mz /= len;
    var targetHeading = Math.atan2(mx, mz);
    var dh = targetHeading - this.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    this.heading += dh * Math.min(1, dt * 12);
    this.speed += (run - this.speed) * Math.min(1, dt * 8);
  } else {
    this.speed += (0 - this.speed) * Math.min(1, dt * 10);
    if (this.speed < 0.05) this.speed = 0;
  }
  var nx = this.x + Math.sin(this.heading) * this.speed * dt;
  var nz = this.z + Math.cos(this.heading) * this.speed * dt;
  nx = Math.max(-SB.CITY.bound, Math.min(SB.CITY.bound, nx));
  nz = Math.max(-SB.CITY.bound, Math.min(SB.CITY.waterZ - 2, nz));
  var fixed = SB.collideCircle(colliders, nx, nz, 0.55);
  this.x = fixed.x; this.z = fixed.z;
  // Jump + gravity.
  if (input.jump && this.onGround) {
    this.vy = 7.5;
    this.onGround = false;
  }
  if (!this.onGround) {
    this.vy -= 22 * dt;
    this.y += this.vy * dt;
    if (this.y <= 0) { this.y = 0; this.vy = 0; this.onGround = true; }
  }
  // Punch.
  if (input.punch && this.punchT <= 0) {
    this.punchT = 0.3;
    this.punchHitDone = false;
  }
  if (this.punchT > 0) this.punchT -= dt;
  this.walkPhase += this.speed * dt * 1.9;
  SB.animateCharacter(this.model, this.walkPhase, Math.min(1, this.speed / 8), Math.max(0, this.punchT));
  this.model.group.position.set(this.x, this.y, this.z);
  this.model.group.rotation.y = this.heading;
};

// Punch hit test: peds in front of the player, within reach.
SB.Player.prototype.punchTargets = function (peds) {
  var hits = [];
  if (this.punchT <= 0 || this.punchHitDone) return hits;
  var fx = Math.sin(this.heading), fz = Math.cos(this.heading);
  for (var i = 0; i < peds.length; i++) {
    var p = peds[i];
    if (p.down) continue;
    var dx = p.x - this.x, dz = p.z - this.z;
    if (dx * fx + dz * fz > 0 && Math.hypot(dx, dz) < 1.9) hits.push(p);
  }
  if (hits.length) this.punchHitDone = true;
  return hits;
};
