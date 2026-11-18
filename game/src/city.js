// The city of Sol Bay: a procedural street grid with instanced buildings,
// streetlights, palms, a beach and an ocean, plus the collision map the
// player, cars and pedestrians all share.
var SB = window.SB || (window.SB = {});

SB.CITY = {
  pitch: 50,            // distance between road centrelines
  roadHalf: 7,          // half the road width
  roads: [-200, -150, -100, -50, 0, 50, 100, 150, 200],
  half: 207,            // city edge (outer road centre + half width)
  bound: 232,           // invisible world wall
  beachZ: 207,          // sand starts here (south edge)
  waterZ: 246,          // ocean waterline
  avenues: ["Playa Ave", "Duna Ave", "Cielo Ave", "Harbor Ave", "Sol Bay Blvd", "Marina Ave", "Sunset Ave", "Coral Ave", "Palma Ave"],
  streets: ["North St", "Cactus St", "Mesa St", "Juniper St", "Central St", "Olive St", "Tide St", "Pelican St", "Ocean St"]
};

SB.streetNameAt = function (x, z) {
  var best = null, bestD = 1e9, vertical = true;
  for (var i = 0; i < SB.CITY.roads.length; i++) {
    var d = Math.abs(x - SB.CITY.roads[i]);
    if (d < bestD) { bestD = d; best = i; vertical = true; }
    d = Math.abs(z - SB.CITY.roads[i]);
    if (d < bestD) { bestD = d; best = i; vertical = false; }
  }
  if (z > SB.CITY.beachZ) return "Boardwalk";
  return vertical ? SB.CITY.avenues[best] : SB.CITY.streets[best];
};

// Circle-vs-AABB push-out shared by the player, cars and pedestrians.
SB.collideCircle = function (colliders, x, z, r) {
  for (var i = 0; i < colliders.length; i++) {
    var c = colliders[i];
    var cx = Math.max(c.minX, Math.min(x, c.maxX));
    var cz = Math.max(c.minZ, Math.min(z, c.maxZ));
    var dx = x - cx, dz = z - cz;
    var d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 0.0001) {
        var d = Math.sqrt(d2);
        x = cx + (dx / d) * r;
        z = cz + (dz / d) * r;
      } else {
        // Centre inside the box: push out along the smallest penetration.
        var pl = x - c.minX + r, pr = c.maxX - x + r;
        var pt = z - c.minZ + r, pb = c.maxZ - z + r;
        var m = Math.min(pl, pr, pt, pb);
        if (m === pl) x = c.minX - r; else if (m === pr) x = c.maxX + r;
        else if (m === pt) z = c.minZ - r; else z = c.maxZ + r;
      }
    }
  }
  return { x: x, z: z };
};

SB.buildCity = function (scene, rng, tex) {
  var city = { colliders: [], lamps: [], trafficLights: [], clouds: [], billboards: [] };
  var M = new THREE.Matrix4();
  var Q = new THREE.Quaternion();
  var V = new THREE.Vector3();
  var S = new THREE.Vector3();
  var C = new THREE.Color();

  function place(mesh, i, x, y, z, sx, sy, sz, rotY, color) {
    Q.setFromEuler(new THREE.Euler(0, rotY || 0, 0));
    M.compose(V.set(x, y, z), Q, S.set(sx, sy, sz));
    mesh.setMatrixAt(i, M);
    if (color) mesh.setColorAt(i, C.set(color));
  }

  // --- Ground: grass base, then roads, then sidewalk slabs per block. ---
  var ground = new THREE.Mesh(
    new THREE.PlaneGeometry(700, 700),
    new THREE.MeshLambertMaterial({ map: tex.grass })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, -40);
  scene.add(ground);

  var roadMat = new THREE.MeshLambertMaterial({ map: tex.road });
  var roadGeoH = new THREE.PlaneGeometry(460, 14);
  var roadGeoV = new THREE.PlaneGeometry(14, 460);
  for (var ri = 0; ri < SB.CITY.roads.length; ri++) {
    var c = SB.CITY.roads[ri];
    var rh = new THREE.Mesh(roadGeoH, roadMat);
    rh.rotation.x = -Math.PI / 2;
    rh.position.set(0, 0.02, c);
    scene.add(rh);
    var rv = new THREE.Mesh(roadGeoV, roadMat);
    rv.rotation.x = -Math.PI / 2;
    rv.position.set(c, 0.03, 0);
    scene.add(rv);
  }

  // --- Buildings: one instanced mesh, tinted per instance, with colliders. ---
  var spots = [];
  for (var bx = 0; bx < 8; bx++) {
    for (var bz = 0; bz < 8; bz++) {
      var cx = -175 + bx * 50, cz = -175 + bz * 50;
      if (cx === 25 && cz === -25) continue; // reserved for the Solbay Tower
      var distC = Math.sqrt(cx * cx + cz * cz);
      var downtown = distC < 90 ? 1.6 : (distC < 150 ? 1.2 : 0.9);
      var lots = rng.pick([1, 2, 2, 4]);
      var cells = lots === 1 ? [[0, 0, 30]] : lots === 2
        ? (rng.chance(0.5) ? [[-7.5, 0, 14], [7.5, 0, 14]] : [[0, -7.5, 14], [0, 7.5, 14]])
        : [[-7.5, -7.5, 13], [7.5, -7.5, 13], [-7.5, 7.5, 13], [7.5, 7.5, 13]];
      for (var li = 0; li < cells.length; li++) {
        var cell = cells[li];
        var w = cell[2] * rng.range(0.75, 0.95);
        var d = cell[2] * rng.range(0.75, 0.95);
        var h = Math.max(7, rng.range(8, 30) * downtown + rng.range(0, 8));
        spots.push({ x: cx + cell[0], z: cz + cell[1], w: w, d: d, h: h });
      }
    }
  }
  // The Solbay Tower landmark on its own centre block (25,-25) — never on a road.
  spots.push({ x: 25, z: -25, w: 26, d: 26, h: 68, landmark: true });

  var boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0.5, 0);
  var bMat = new THREE.MeshLambertMaterial({ map: tex.building, emissive: 0xffffff, emissiveMap: tex.buildingEmissive, emissiveIntensity: 0 });
  var buildings = new THREE.InstancedMesh(boxGeo, bMat, spots.length);
  var roofGeo = new THREE.BoxGeometry(1, 1, 1);
  roofGeo.translate(0, 0.5, 0);
  var roofMat = new THREE.MeshLambertMaterial({ color: 0x8a857c });
  var roofCount = 0;
  for (var si = 0; si < spots.length; si++) if (rng.chance(0.45)) roofCount++;
  var roofs = new THREE.InstancedMesh(roofGeo, roofMat, Math.max(roofCount, 1));
  var roofI = 0;
  var palette = [0xffffff, 0xf2e8d8, 0xdfe8ea, 0xe8ddd0, 0xd8dce2, 0xf5ead2];
  for (var bi = 0; bi < spots.length; bi++) {
    var s = spots[bi];
    place(buildings, bi, s.x, 0, s.z, s.w, s.h, s.d, 0, s.landmark ? 0xcfe0ee : rng.pick(palette));
    city.colliders.push({ minX: s.x - s.w / 2 - 0.4, maxX: s.x + s.w / 2 + 0.4, minZ: s.z - s.d / 2 - 0.4, maxZ: s.z + s.d / 2 + 0.4 });
    if (roofI < roofCount && rng.chance(0.45)) {
      place(roofs, roofI++, s.x + rng.range(-3, 3), s.h, s.z + rng.range(-3, 3), rng.range(3, 6), rng.range(1.5, 3), rng.range(3, 6), 0, null);
    }
  }
  buildings.instanceMatrix.needsUpdate = true;
  if (buildings.instanceColor) buildings.instanceColor.needsUpdate = true;
  roofs.count = roofI;
  roofs.instanceMatrix.needsUpdate = true;
  scene.add(buildings);
  scene.add(roofs);
  city.buildingMaterial = bMat;

  // Sidewalk slabs under each block.
  var walkGeo = new THREE.PlaneGeometry(38, 38);
  var walkMat = new THREE.MeshLambertMaterial({ map: tex.sidewalk });
  for (var wx = 0; wx < 8; wx++) {
    for (var wz = 0; wz < 8; wz++) {
      var slab = new THREE.Mesh(walkGeo, walkMat);
      slab.rotation.x = -Math.PI / 2;
      slab.position.set(-175 + wx * 50, 0.01, -175 + wz * 50);
      scene.add(slab);
    }
  }

  // --- Streetlights along the roads. ---
  var poleGeo = new THREE.CylinderGeometry(0.18, 0.24, 7, 6);
  poleGeo.translate(0, 3.5, 0);
  var poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f44 });
  var lampGeo = new THREE.SphereGeometry(0.42, 10, 8);
  var lampMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
  var lampSpots = [];
  for (var lr = 0; lr < SB.CITY.roads.length; lr++) {
    for (var lt = -175; lt <= 175; lt += 50) {
      lampSpots.push({ x: SB.CITY.roads[lr] + 8, z: lt });
      lampSpots.push({ x: lt, z: SB.CITY.roads[lr] + 8 });
    }
  }
  var poles = new THREE.InstancedMesh(poleGeo, poleMat, lampSpots.length);
  var lamps = new THREE.InstancedMesh(lampGeo, lampMat, lampSpots.length);
  for (var lpi = 0; lpi < lampSpots.length; lpi++) {
    place(poles, lpi, lampSpots[lpi].x, 0, lampSpots[lpi].z, 1, 1, 1, 0, null);
    place(lamps, lpi, lampSpots[lpi].x, 7, lampSpots[lpi].z, 1, 1, 1, 0, null);
  }
  poles.instanceMatrix.needsUpdate = true;
  lamps.instanceMatrix.needsUpdate = true;
  scene.add(poles);
  scene.add(lamps);
  city.lampMaterial = lampMat;
  // A few glow sprites near the centre for the night look (cheap: 12 sprites).
  var glowMat = new THREE.SpriteMaterial({ map: tex.glow, color: 0xffe9a8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  for (var gi = 0; gi < 12; gi++) {
    var sp = new THREE.Sprite(glowMat.clone());
    var lp = lampSpots[rng.int(0, lampSpots.length - 1)];
    sp.position.set(lp.x, 7, lp.z);
    sp.scale.set(6, 6, 1);
    scene.add(sp);
    city.lamps.push(sp);
  }

  // --- Traffic lights at every other intersection. ---
  var tlPoleGeo = new THREE.CylinderGeometry(0.15, 0.2, 5.4, 6);
  tlPoleGeo.translate(0, 2.7, 0);
  var tlPoles = new THREE.InstancedMesh(tlPoleGeo, poleMat, 25);
  var tlHeadGeo = new THREE.BoxGeometry(0.7, 1.6, 0.7);
  var tlHeadMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
  var tlHeads = new THREE.InstancedMesh(tlHeadGeo, tlHeadMat, 25);
  var tlDotGeo = new THREE.SphereGeometry(0.28, 8, 6);
  var tlDotMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  var tlDots = new THREE.InstancedMesh(tlDotGeo, tlDotMat, 25);
  var tlI = 0;
  for (var tx = 0; tx < SB.CITY.roads.length; tx += 2) {
    for (var tz = 0; tz < SB.CITY.roads.length; tz += 2) {
      if (tlI >= 25) break;
      var px = SB.CITY.roads[tx] + 8, pz = SB.CITY.roads[tz] + 8;
      place(tlPoles, tlI, px, 0, pz, 1, 1, 1, 0, null);
      place(tlHeads, tlI, px, 5.4, pz, 1, 1, 1, 0, null);
      place(tlDots, tlI, px, 5.7, pz + 0.4, 1, 1, 1, 0, 0x33dd55);
      tlI++;
    }
  }
  tlPoles.instanceMatrix.needsUpdate = true;
  tlHeads.instanceMatrix.needsUpdate = true;
  tlDots.instanceMatrix.needsUpdate = true;
  scene.add(tlPoles); scene.add(tlHeads); scene.add(tlDots);
  city.trafficLightDots = tlDots;
  city.trafficLightPhase = 0;

  // --- Palms: trunks + crowns, instanced, along the beach and sidewalks. ---
  var palmSpots = [];
  for (var px2 = -200; px2 <= 200; px2 += 25) {
    palmSpots.push({ x: px2 + rng.range(-6, 6), z: 214 + rng.range(-2, 6) });
    if (rng.chance(0.6)) palmSpots.push({ x: px2 + rng.range(-6, 6), z: 228 + rng.range(-2, 4) });
  }
  for (var pp = 0; pp < 26; pp++) {
    palmSpots.push({ x: rng.pick(SB.CITY.roads) + rng.pick([-9, 9]), z: rng.range(-180, 180) });
  }
  var trunkGeo = new THREE.CylinderGeometry(0.28, 0.42, 7, 7);
  trunkGeo.translate(0, 3.5, 0);
  var trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6b4a });
  var trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
  var crownGeo = new THREE.IcosahedronGeometry(2.6, 0);
  crownGeo.scale(1, 0.45, 1);
  var crownMat = new THREE.MeshLambertMaterial({ color: 0x3f8c3a });
  var crowns = new THREE.InstancedMesh(crownGeo, crownMat, palmSpots.length);
  for (var pi = 0; pi < palmSpots.length; pi++) {
    var lean = rng.range(-0.12, 0.12);
    Q.setFromEuler(new THREE.Euler(lean, 0, lean * 0.6));
    M.compose(V.set(palmSpots[pi].x, 0, palmSpots[pi].z), Q, S.set(1, rng.range(0.85, 1.25), 1));
    trunks.setMatrixAt(pi, M);
    Q.setFromEuler(new THREE.Euler(0, rng.range(0, Math.PI * 2), 0));
    M.compose(V.set(palmSpots[pi].x + lean * 6, 7 * 1.05, palmSpots[pi].z), Q, S.set(1, 1, 1));
    crowns.setMatrixAt(pi, M);
    crowns.setColorAt(pi, C.set(rng.pick([0x3f8c3a, 0x4a9c42, 0x35802f])));
  }
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
  scene.add(trunks);
  scene.add(crowns);

  // --- Beach, boardwalk, ocean, foam, lifeguard tower, umbrellas. ---
  var sand = new THREE.Mesh(new THREE.PlaneGeometry(520, 46), new THREE.MeshLambertMaterial({ map: tex.sand }));
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.02, 228);
  scene.add(sand);
  var boardwalk = new THREE.Mesh(new THREE.PlaneGeometry(460, 8), new THREE.MeshLambertMaterial({ color: 0xb09a72 }));
  boardwalk.rotation.x = -Math.PI / 2;
  boardwalk.position.set(0, 0.06, 209);
  scene.add(boardwalk);
  var ocean = new THREE.Mesh(new THREE.PlaneGeometry(900, 500), new THREE.MeshLambertMaterial({ map: tex.water, transparent: true, opacity: 0.94 }));
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, -0.25, 500);
  scene.add(ocean);
  city.ocean = ocean;
  var foam = new THREE.Mesh(new THREE.PlaneGeometry(520, 3), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(0, 0.05, 246);
  scene.add(foam);
  city.foam = foam;

  // Lifeguard tower.
  var tower = new THREE.Group();
  var tLeg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4, 0.4), new THREE.MeshLambertMaterial({ color: 0xffffff }));
  [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]].forEach(function (o) {
    var leg = tLeg.clone();
    leg.position.set(o[0], 2, o[1]);
    tower.add(leg);
  });
  var cab = new THREE.Mesh(new THREE.BoxGeometry(4, 2.4, 3.4), new THREE.MeshLambertMaterial({ color: 0xf2e8d8 }));
  cab.position.y = 5.2;
  tower.add(cab);
  var roofT = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.3, 4.2), new THREE.MeshLambertMaterial({ color: 0xc22e4a }));
  roofT.position.y = 6.6;
  tower.add(roofT);
  tower.position.set(60, 0, 224);
  scene.add(tower);
  city.colliders.push({ minX: 58, maxX: 62, minZ: 222, maxZ: 226 });

  // Beach umbrellas.
  var umbPoleGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.6, 5);
  umbPoleGeo.translate(0, 1.3, 0);
  var umbTopGeo = new THREE.ConeGeometry(2.2, 1.1, 8);
  var umbCols = [0xc22e4a, 0x1b4f9c, 0xe08a2e, 0x2e8c4a];
  for (var ui = 0; ui < 8; ui++) {
    var ug = new THREE.Group();
    ug.add(new THREE.Mesh(umbPoleGeo, new THREE.MeshLambertMaterial({ color: 0xdddddd })));
    var top = new THREE.Mesh(umbTopGeo, new THREE.MeshLambertMaterial({ color: umbCols[ui % 4] }));
    top.position.y = 2.8;
    ug.add(top);
    ug.position.set(rng.range(-190, 190), 0, rng.range(216, 238));
    scene.add(ug);
  }

  // --- Billboards at major intersections. ---
  var bbPoleGeo = new THREE.CylinderGeometry(0.3, 0.4, 9, 6);
  bbPoleGeo.translate(0, 4.5, 0);
  var bbSpots = [[-100, -100], [100, -50], [-50, 100], [150, 150], [0, -150], [-150, 50]];
  for (var bbi = 0; bbi < bbSpots.length; bbi++) {
    var bg = new THREE.Group();
    bg.add(new THREE.Mesh(bbPoleGeo, poleMat));
    var face = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), new THREE.MeshLambertMaterial({ map: tex.billboards[bbi % tex.billboards.length], side: THREE.DoubleSide }));
    face.position.y = 10;
    bg.add(face);
    bg.position.set(bbSpots[bbi][0] + 10, 0, bbSpots[bbi][1] + 10);
    bg.rotation.y = rng.range(0, Math.PI);
    scene.add(bg);
    city.billboards.push(bg);
    city.colliders.push({ minX: bg.position.x - 0.6, maxX: bg.position.x + 0.6, minZ: bg.position.z - 0.6, maxZ: bg.position.z + 0.6 });
  }

  // --- Clouds: drifting blobs. ---
  var cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 });
  var puffGeo = new THREE.SphereGeometry(1, 10, 8);
  for (var ci = 0; ci < 9; ci++) {
    var cg = new THREE.Group();
    var nPuffs = rng.int(3, 5);
    for (var cp = 0; cp < nPuffs; cp++) {
      var puff = new THREE.Mesh(puffGeo, cloudMat);
      puff.position.set(rng.range(-6, 6), rng.range(-1, 1), rng.range(-2, 2));
      puff.scale.set(rng.range(4, 8), rng.range(1.6, 2.6), rng.range(3, 5));
      cg.add(puff);
    }
    cg.position.set(rng.range(-260, 260), rng.range(55, 80), rng.range(-220, 220));
    scene.add(cg);
    city.clouds.push({ group: cg, speed: rng.range(0.6, 1.4) });
  }

  // --- Stars (visible at night) and the tower beacon. ---
  var starGeo = new THREE.BufferGeometry();
  var starPos = new Float32Array(400 * 3);
  for (var sti = 0; sti < 400; sti++) {
    var th = rng.range(0, Math.PI * 2), ph = rng.range(0.12, 1.35);
    starPos[sti * 3] = Math.cos(th) * Math.sin(ph) * 480;
    starPos[sti * 3 + 1] = Math.cos(ph) * 480;
    starPos[sti * 3 + 2] = Math.sin(th) * Math.sin(ph) * 480;
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  var starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, transparent: true, opacity: 0, sizeAttenuation: false });
  city.stars = new THREE.Points(starGeo, starMat);
  scene.add(city.stars);

  var beaconMat = new THREE.SpriteMaterial({ map: tex.glow, color: 0xff4444, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  var beacon = new THREE.Sprite(beaconMat);
  beacon.position.set(25, 70, -25);
  beacon.scale.set(6, 6, 1);
  scene.add(beacon);
  city.beacon = beacon;
  city.time = 0;

  // Per-frame city life: clouds, ocean, foam, traffic lights, beacon.
  city.update = function (dt, darkness) {
    city.time += dt;
    for (var i = 0; i < city.clouds.length; i++) {
      var cl = city.clouds[i];
      cl.group.position.x += cl.speed * dt;
      if (cl.group.position.x > 300) cl.group.position.x = -300;
    }
    tex.water.offset.x += dt * 0.015;
    tex.water.offset.y += dt * 0.006;
    city.foam.material.opacity = 0.4 + 0.2 * Math.sin(city.time * 1.4);
    city.trafficLightPhase += dt;
    var phase = Math.floor(city.trafficLightPhase / 6) % 2;
    var col = phase === 0 ? 0x33dd55 : 0xdd3333;
    for (var d = 0; d < 25; d++) city.trafficLightDots.setColorAt(d, C.set(col));
    city.trafficLightDots.instanceColor.needsUpdate = true;
    city.beacon.material.opacity = 0.4 + 0.5 * (Math.sin(city.time * 2.4) > 0 ? 1 : 0.15);
    city.stars.material.opacity = darkness;
    for (var li2 = 0; li2 < city.lamps.length; li2++) city.lamps[li2].material.opacity = darkness * 0.75;
    city.buildingMaterial.emissiveIntensity = darkness * 0.85;
  };

  return city;
};
