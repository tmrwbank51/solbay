// Procedural canvas textures for SOLBAY: every surface in the city is drawn
// in code, so the game ships no image files and makes no network requests.
var SB = window.SB || (window.SB = {});

SB.makeCanvasTexture = function (w, h, drawFn, repeatX, repeatY, crisp) {
  var canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  var ctx = canvas.getContext("2d");
  drawFn(ctx, w, h);
  var tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  if (repeatX || repeatY) tex.repeat.set(repeatX || 1, repeatY || 1);
  tex.anisotropy = crisp ? 8 : 4;
  if (crisp) tex.magFilter = THREE.NearestFilter;
  if ("colorSpace" in tex && THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  else if ("encoding" in tex && THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
  return tex;
};

// Building facade: a grid of windows, a few lit, on a tinted concrete face.
// One texture serves every building; per-instance colour tints the rest.
// Drawn at 256x512 with hard window frames and NearestFilter magnification so
// the facade stays crisp instead of smearing when stretched over tall faces.
// The lit-window grid is shared with the emissive map (recorded here, read
// there) so the windows that glow at night are the ones that read lit by day.
SB._facadeLit = null;
SB.buildingTexture = function (rng) {
  var tint = rng.pick(["#c8bfae", "#b8c4c4", "#d8cbb2", "#aeb8c2", "#cdbfb4"]);
  var cols = 6, rows = 14;
  var lit = [];
  for (var k = 0; k < cols * rows; k++) lit.push(rng.chance(0.22));
  SB._facadeLit = lit;
  return SB.makeCanvasTexture(256, 512, function (ctx, w, h) {
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(0,0,0,0.16)";
    ctx.fillRect(0, 0, w, 10);
    ctx.fillRect(0, h - 6, w, 6);
    var cw = w / cols, ch = h / rows;
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var wx = Math.round(x * cw + 5), wy = Math.round(y * ch + 6);
        var ww = Math.round(cw - 10), wh = Math.round(ch - 12);
        // Dark frame, then glass, then a hard top highlight: crisp edges that
        // survive stretching instead of one soft smudge per window.
        ctx.fillStyle = "#1c2530";
        ctx.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);
        ctx.fillStyle = lit[y * cols + x] ? "#ffd98a" : "#2e3a44";
        ctx.fillRect(wx, wy, ww, wh);
        ctx.fillStyle = lit[y * cols + x] ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.28)";
        ctx.fillRect(wx, wy, ww, 5);
        ctx.fillStyle = "rgba(0,0,0,0.22)";
        ctx.fillRect(wx, wy + wh - 4, ww, 4);
      }
    }
  }, 0, 0, true);
};

// The lit-window mask used as an emissive map at night: only lit windows glow.
// Consumes the same 84 rng draws as before (keeps the seeded stream aligned)
// but draws the shared grid recorded by buildingTexture, so glow matches the
// lit windows instead of landing on random panes.
SB.buildingEmissiveTexture = function (rng) {
  var cols = 6, rows = 14;
  for (var k = 0; k < cols * rows; k++) rng.chance(0.22);
  var lit = SB._facadeLit || [];
  return SB.makeCanvasTexture(256, 512, function (ctx, w, h) {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, w, h);
    var cw = w / cols, ch = h / rows;
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        if (lit[y * cols + x]) {
          ctx.fillStyle = "#ffca66";
          ctx.fillRect(Math.round(x * cw + 5), Math.round(y * ch + 6), Math.round(cw - 10), Math.round(ch - 12));
        }
      }
    }
  }, 0, 0, true);
};

SB.roadTexture = function () {
  return SB.makeCanvasTexture(128, 128, function (ctx, w, h) {
    ctx.fillStyle = "#3a3a3e";
    ctx.fillRect(0, 0, w, h);
    for (var i = 0; i < 900; i++) {
      ctx.fillStyle = "rgba(255,255,255," + (Math.random() * 0.05) + ")";
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    ctx.fillStyle = "#d8c84a";
    ctx.fillRect(w / 2 - 2, 10, 4, 44);
    ctx.fillRect(w / 2 - 2, 74, 4, 44);
    ctx.fillStyle = "#e8e8e8";
    ctx.fillRect(4, 0, 3, h);
    ctx.fillRect(w - 7, 0, 3, h);
  }, 1, 8);
};

SB.sidewalkTexture = function () {
  return SB.makeCanvasTexture(128, 128, function (ctx, w, h) {
    ctx.fillStyle = "#9a958c";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 2;
    for (var i = 0; i <= 4; i++) {
      ctx.beginPath(); ctx.moveTo(i * 32, 0); ctx.lineTo(i * 32, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * 32); ctx.lineTo(w, i * 32); ctx.stroke();
    }
  }, 6, 6);
};

SB.grassTexture = function (rng) {
  return SB.makeCanvasTexture(128, 128, function (ctx, w, h) {
    ctx.fillStyle = "#7d9b52";
    ctx.fillRect(0, 0, w, h);
    for (var i = 0; i < 1200; i++) {
      ctx.fillStyle = rng.pick(["#6d8b45", "#8aa860", "#75975a"]);
      ctx.fillRect(rng.range(0, w), rng.range(0, h), 3, 3);
    }
  }, 24, 24);
};

SB.sandTexture = function (rng) {
  return SB.makeCanvasTexture(128, 128, function (ctx, w, h) {
    ctx.fillStyle = "#e0cd96";
    ctx.fillRect(0, 0, w, h);
    for (var i = 0; i < 800; i++) {
      ctx.fillStyle = rng.pick(["#d4c184", "#e8d8a4", "#cdb87c"]);
      ctx.fillRect(rng.range(0, w), rng.range(0, h), 3, 2);
    }
  }, 20, 6);
};

SB.waterTexture = function () {
  return SB.makeCanvasTexture(128, 128, function (ctx, w, h) {
    ctx.fillStyle = "#1f6f9e";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 2;
    for (var y = 8; y < h; y += 18) {
      ctx.beginPath();
      for (var x = 0; x <= w; x += 8) ctx.lineTo(x, y + Math.sin(x * 0.2 + y) * 2);
      ctx.stroke();
    }
  }, 30, 30);
};

// Billboard adverts with original Sol Bay brands.
SB.billboardTexture = function (text, sub, bg, fg) {
  return SB.makeCanvasTexture(256, 128, function (ctx, w, h) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = fg;
    ctx.font = "bold 44px Arial";
    ctx.textAlign = "center";
    ctx.fillText(text, w / 2, 62);
    ctx.font = "20px Arial";
    ctx.fillText(sub, w / 2, 96);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 4;
    ctx.strokeRect(6, 6, w - 12, h - 12);
  });
};

// Soft radial glow for the sun, lamp halos and the mission beacon.
SB.glowTexture = function () {
  return SB.makeCanvasTexture(64, 64, function (ctx, w, h) {
    var g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.4, "rgba(255,255,255,0.45)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
};

// Police livery: white doors with a stripe and SOLBAY PD lettering.
SB.policeTexture = function () {
  return SB.makeCanvasTexture(256, 64, function (ctx, w, h) {
    ctx.fillStyle = "#14181c";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#f2f2f2";
    ctx.fillRect(70, 0, 116, h);
    ctx.fillStyle = "#1b4f9c";
    ctx.fillRect(0, 26, w, 12);
    ctx.fillStyle = "#14181c";
    ctx.font = "bold 22px Arial";
    ctx.textAlign = "center";
    ctx.fillText("POLICE", 128, 22);
    ctx.font = "bold 13px Arial";
    ctx.fillText("SOLBAY PD", 128, 56);
  });
};

SB.buildTextures = function (rng) {
  var t = {};
  t.building = SB.buildingTexture(rng);
  t.buildingEmissive = SB.buildingEmissiveTexture(rng);
  t.road = SB.roadTexture();
  t.sidewalk = SB.sidewalkTexture();
  t.grass = SB.grassTexture(rng);
  t.sand = SB.sandTexture(rng);
  t.water = SB.waterTexture();
  t.glow = SB.glowTexture();
  t.police = SB.policeTexture();
  t.billboards = [
    SB.billboardTexture("SOLBAY", "sunshine city", "#0e7d8c", "#ffffff"),
    SB.billboardTexture("PALMA COLA", "taste the bay", "#c22e4a", "#ffffff"),
    SB.billboardTexture("BAY FM 98.5", "all hits, all day", "#1b4f9c", "#ffe45c"),
    SB.billboardTexture("CORAL HOTEL", "stay by the sea", "#e08a2e", "#ffffff"),
    SB.billboardTexture("TIDE & TACO", "open til late", "#2e8c4a", "#ffffff")
  ];
  return t;
};
