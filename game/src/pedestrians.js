// Pedestrians: Sol Bay locals strolling the sidewalks, who flee from danger
// and get knocked down (then back up) when a car hits them.
var SB = window.SB || (window.SB = {});

SB.Pedestrians = function (scene, rng, count) {
  this.list = [];
  var shirts = [0xc23b2e, 0x2e6fc2, 0xe0a92e, 0x2e8c4a, 0xe8e8e8, 0x7a4a9c, 0xd86a2e, 0x4ab2c2, 0xf2d16b, 0x8c2e4a];
  var pants = [0x333a44, 0x4a3a2e, 0x2a4a6b, 0x555555, 0x6b2a2a];
  var skins = [0xe0b08c, 0xc98e62, 0x8a5a34, 0xf0c8a0, 0x6b4226];
  for (var i = 0; i < count; i++) {
    var model = SB.buildCharacterModel(rng.pick(shirts), rng.pick(pants), rng.pick(skins));
    var scale = rng.range(0.94, 1.06);
    model.group.scale.setScalar(scale);
    scene.add(model.group);
    // Walk a rectangle around one city block, on the sidewalk.
    var bx = rng.int(0, 7), bz = rng.int(0, 7);
    var cx = -175 + bx * 50, cz = -175 + bz * 50;
    var inset = 17;
    var loop = [
      { x: cx - inset, z: cz - inset }, { x: cx + inset, z: cz - inset },
      { x: cx + inset, z: cz + inset }, { x: cx - inset, z: cz + inset }
    ];
    var start = rng.int(0, 3);
    var ped = {
      model: model, x: loop[start].x, z: loop[start].z,
      loop: loop, target: (start + 1) % 4,
      heading: 0, speed: rng.range(1.4, 2.4), walkPhase: rng.range(0, 6),
      fleeT: 0, fleeX: 0, fleeZ: 0, down: 0, downT: 0, scared: 0
    };
    ped.model.group.position.set(ped.x, 0, ped.z);
    this.list.push(ped);
  }
};

SB.Pedestrians.prototype.scareNear = function (x, z, radius) {
  for (var i = 0; i < this.list.length; i++) {
    var p = this.list[i];
    var d = Math.hypot(p.x - x, p.z - z);
    if (d < radius && !p.down) {
      p.fleeT = 4;
      p.fleeX = p.x - x; p.fleeZ = p.z - z;
      var l = Math.hypot(p.fleeX, p.fleeZ) || 1;
      p.fleeX /= l; p.fleeZ /= l;
      p.scared = 1;
    }
  }
};

SB.Pedestrians.prototype.knockDown = function (ped, fromX, fromZ) {
  if (ped.down) return;
  ped.down = 1;
  ped.downT = 3.2;
  ped.fleeT = 6;
  ped.fleeX = ped.x - fromX; ped.fleeZ = ped.z - fromZ;
  var l = Math.hypot(ped.fleeX, ped.fleeZ) || 1;
  ped.fleeX /= l; ped.fleeZ /= l;
  ped.model.group.rotation.x = Math.PI / 2 * 0.9;
  ped.model.group.position.y = 0.25;
};

SB.Pedestrians.prototype.update = function (dt, colliders, threats) {
  // threats: [{x, z, speed}] — fast cars nearby scare peds off the road.
  for (var i = 0; i < this.list.length; i++) {
    var p = this.list[i];
    if (p.down) {
      p.downT -= dt;
      if (p.downT <= 0) {
        p.down = 0;
        p.model.group.rotation.x = 0;
        p.model.group.position.y = 0;
      }
      continue;
    }
    if (threats) {
      for (var t = 0; t < threats.length; t++) {
        var th = threats[t];
        if (th.speed > 8 && Math.hypot(p.x - th.x, p.z - th.z) < 7) {
          p.fleeT = 2.5;
          p.fleeX = p.x - th.x; p.fleeZ = p.z - th.z;
          var ll = Math.hypot(p.fleeX, p.fleeZ) || 1;
          p.fleeX /= ll; p.fleeZ /= ll;
        }
      }
    }
    var mx, mz, spd;
    if (p.fleeT > 0) {
      p.fleeT -= dt;
      mx = p.fleeX; mz = p.fleeZ; spd = 5.2;
    } else {
      var tgt = p.loop[p.target];
      var dx = tgt.x - p.x, dz = tgt.z - p.z;
      var d = Math.hypot(dx, dz);
      if (d < 1.5) {
        p.target = (p.target + 1) % 4;
        tgt = p.loop[p.target];
        dx = tgt.x - p.x; dz = tgt.z - p.z; d = Math.hypot(dx, dz) || 1;
      }
      mx = dx / d; mz = dz / d; spd = p.speed;
    }
    var targetHeading = Math.atan2(mx, mz);
    var dh = targetHeading - p.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    p.heading += dh * Math.min(1, dt * 8);
    var nx = p.x + Math.sin(p.heading) * spd * dt;
    var nz = p.z + Math.cos(p.heading) * spd * dt;
    nx = Math.max(-SB.CITY.bound, Math.min(SB.CITY.bound, nx));
    nz = Math.max(-SB.CITY.bound, Math.min(SB.CITY.waterZ - 2, nz));
    var fixed = SB.collideCircle(colliders, nx, nz, 0.5);
    p.x = fixed.x; p.z = fixed.z;
    p.walkPhase += spd * dt * 2.0;
    SB.animateCharacter(p.model, p.walkPhase, Math.min(1, spd / 5), 0);
    p.model.group.position.set(p.x, 0, p.z);
    p.model.group.rotation.y = p.heading;
  }
};
