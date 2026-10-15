// Human Atlas — 2,229-piece interactive 3D anatomy explorer.
// Real anatomy only: BodyParts3D 4.0 isa meshes (CC BY 4.0, DBCLS), packed
// into compressed binary chunks; one mesh per chunk, per-part explode
// offsets driven by a GPU data texture. Coordinates stay in original mm
// Z-up: ONE root group converts to three.js Y-up; no part is ever
// recentered, rotated or rescaled individually.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const SYS_INFO = {
  arterial:     { name: "Arterial",    color: 0xe14b54 },
  venous:       { name: "Venous",      color: 0x7a6ff0 },
  muscular:     { name: "Muscular",    color: 0xb03a48 },
  skeletal:     { name: "Skeletal",    color: 0xe8e0d2 },
  nervous:      { name: "Nervous",     color: 0xf2a3b3 },
  respiratory:  { name: "Respiratory", color: 0xef6f8c },
  digestive:    { name: "Digestive",   color: 0xe8977a },
  sensory:      { name: "Sensory",     color: 0x9fd4a3 },
  connective:   { name: "Connective",  color: 0xd9c08c },
  cardiac:      { name: "Cardiac",     color: 0xd63a4a },
  reproductive: { name: "Reproductive",color: 0xc98ae0 },
  urinary:      { name: "Urinary",     color: 0xd96a9b },
  endocrine:    { name: "Endocrine",   color: 0x8ad4e0 },
  lymphatic:    { name: "Lymphatic",   color: 0x8ae0b0 },
};
const WORLD_HEIGHT = 4.2;   // world units for full body height
const TEX_W = 2048, TEX_H = 2; // per-part data texture (RGBA float)

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function describePart(p, total) {
  const sys = (SYS_INFO[p.system] || {}).name || p.system;
  return `${p.name} is one of ${total.toLocaleString()} individually modeled structures in this atlas, from the ${sys} system. ` +
    `All geometry comes from BodyParts3D 4.0, an adult male reference anatomy (The Database Center for Life Science, CC BY 4.0). ` +
    `This piece is modeled with ${p.triangles.toLocaleString()} triangles.`;
}

export async function bootAtlas(host) {
  const atlas = await (await fetch("data/pieces/atlas.json")).json();
  const parts = atlas.parts;
  const N = parts.length;
  const byId = Object.fromEntries(parts.map((p, i) => [p.id, i]));
  const systems = atlas.systems.filter((s) => SYS_INFO[s]);

  // ------------------------------------------------------------ DOM
  host.innerHTML = "";
  host.classList.add("atlas-root");
  const viewer = el("div", "viewer");
  const labelLayer = el("div", "label-layer");
  viewer.append(labelLayer);
  const main = el("div", "atlas-main");
  main.append(viewer);
  const topbar = el("div", "atlas-topbar");
  const panel = el("aside", "atlas-panel");
  main.append(panel);
  const bottombar = el("div", "atlas-bottombar");
  const loadOverlay = el("div", "load-overlay");
  host.append(topbar, main, bottombar, loadOverlay);

  const menuBtn = el("button", "icon-btn", "&#9776;");
  menuBtn.setAttribute("aria-label", "Menu");
  const titleEl = el("div", "atlas-title", "Human Atlas");
  const countEl = el("div", "atlas-count", `${N.toLocaleString()} pieces`);
  const labelBtn = el("button", "pill-btn", "Labels");
  labelBtn.setAttribute("aria-pressed", "true");
  const rotBtn = el("button", "pill-btn", "Rotate");
  rotBtn.setAttribute("aria-pressed", "true");
  topbar.append(menuBtn, titleEl, countEl, el("span", "flex-sp"), labelBtn, rotBtn);

  // panel: search + systems + info card
  const searchWrap = el("div", "search-wrap");
  const searchInput = el("input", "search-input");
  searchInput.placeholder = "Search 2,229 structures\u2026";
  searchInput.setAttribute("aria-label", "Search structures");
  const searchResults = el("div", "search-results hidden");
  searchWrap.append(searchInput, searchResults);
  const sysWrap = el("div", "sys-list");
  const infoCard = el("div", "info-card hidden");
  const panelClose = el("button", "panel-close", "Done");
  panelClose.setAttribute("aria-label", "Close panel");
  panelClose.onclick = () => openPanel(false);
  panel.append(panelClose, searchWrap, sysWrap, infoCard);
  const panelHandle = el("button", "panel-handle", "Explore");
  host.append(panelHandle);

  // bottom bar: systems button + explode slider
  const sysBtn = el("button", "chip", "Systems");
  sysBtn.onclick = () => openPanel();
  const spreadWrap = el("div", "spread-wrap");
  spreadWrap.innerHTML = `<span class="spread-end">Assembled</span>
    <input type="range" class="spread-slider" min="0" max="100" value="0" aria-label="Explode anatomy">
    <span class="spread-end dim">Exploded</span>`;
  const slider = spreadWrap.querySelector("input");
  bottombar.append(sysBtn, spreadWrap);

  loadOverlay.innerHTML = `<div class="load-box"><div class="load-title">Loading Human Atlas</div>
    <div class="load-bar"><div class="load-fill"></div></div><div class="load-label"></div></div>`;
  const loadFill = loadOverlay.querySelector(".load-fill");
  const loadLabel = loadOverlay.querySelector(".load-label");
  const setProgress = (done, total, label) => {
    loadFill.style.width = `${(100 * done) / total}%`;
    loadLabel.textContent = label || `${done} / ${total}`;
  };

  // ------------------------------------------------------------ three.js
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  viewer.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07080c);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.1;
  controls.minDistance = 0.6;
  controls.maxDistance = 30;

  scene.add(new THREE.HemisphereLight(0xfff2e8, 0x141a28, 0.95));
  const key = new THREE.DirectionalLight(0xffffff, 1.7);
  key.position.set(3, 5, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xff9db0, 0.85);
  rim.position.set(-4, 2.5, -3.5);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xbfd4ff, 0.35);
  fill.position.set(0, -3, 4);
  scene.add(fill);

  // Whole-scene normalization: ONE parent transform for the entire body.
  function makeBodyRoot() {
    const normGroup = new THREE.Group();
    const zUpGroup = new THREE.Group();
    zUpGroup.rotation.x = -Math.PI / 2; // data Z-up (mm) -> three.js Y-up
    normGroup.add(zUpGroup);
    return { normGroup, zUpGroup };
  }
  const view = makeBodyRoot();
  scene.add(view.normGroup);
  const pickRoot = makeBodyRoot();
  const pickScene = new THREE.Scene();
  pickScene.add(pickRoot.normGroup);

  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) {
    for (let i = 0; i < 3; i++) {
      mn[i] = Math.min(mn[i], p.bboxMin[i]);
      mx[i] = Math.max(mx[i], p.bboxMax[i]);
    }
  }
  const center = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
  const s = WORLD_HEIGHT / (mx[2] - mn[2]);
  for (const root of [view, pickRoot]) {
    root.normGroup.scale.setScalar(s);
    root.normGroup.position.set(-s * center[0], -s * center[2], s * center[1]);
  }
  // data (x,y,z mm) + explode offset -> world
  function worldOf(x, y, z, ox, oy, oz, out) {
    out = out || new THREE.Vector3();
    const X = x + (ox || 0), Y = y + (oy || 0), Z = z + (oz || 0);
    return out.set(s * X - s * center[0], s * Z - s * center[2], -s * Y + s * center[1]);
  }

  // ------------------------------------------------------------ state
  const state = {
    spread: 0, spreadTarget: 0, selected: -1, isolated: false,
    labels: true, rotate: true, tween: null, ready: false,
    systemsOn: Object.fromEntries(systems.map((sy) => [sy, true])),
  };
  // per-part GPU data: xyz = explode offset (mm), w = 0 normal | 1 dim | 2 hidden
  const partData = new Float32Array(TEX_W * TEX_H * 4);
  const partTex = new THREE.DataTexture(partData, TEX_W, TEX_H, THREE.RGBAFormat, THREE.FloatType);
  partTex.magFilter = THREE.NearestFilter;
  partTex.minFilter = THREE.NearestFilter;
  partTex.needsUpdate = true;
  const uExplode = { value: 0 };
  const uPartTex = { value: partTex };

  function injectPartShader(mat) {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uPartTex = uPartTex;
      shader.uniforms.uExplode = uExplode;
      shader.vertexShader = `
        attribute float aPart;
        uniform sampler2D uPartTex;
        uniform float uExplode;
        varying float vDim;
      ` + shader.vertexShader.replace("#include <begin_vertex>", `
        #include <begin_vertex>
        {
          vec2 puv = vec2((mod(aPart, ${TEX_W}.0) + 0.5) / ${TEX_W}.0,
                          (floor(aPart / ${TEX_W}.0) + 0.5) / ${TEX_H}.0);
          vec4 pdat = texture2D(uPartTex, puv);
          transformed += pdat.xyz * uExplode;
          float hide = step(1.5, pdat.w);
          transformed *= (1.0 - hide);
          vDim = pdat.w;
        }
      `);
      shader.fragmentShader = `
        varying float vDim;
      ` + shader.fragmentShader.replace("#include <color_fragment>", `
        #include <color_fragment>
        {
          float dim = step(0.5, vDim) * (1.0 - step(1.5, vDim));
          diffuseColor.rgb *= (1.0 - dim * 0.82);
        }
      `);
    };
    mat.customProgramCacheKey = () => "human-atlas-part";
    return mat;
  }

  const pickMat = new THREE.ShaderMaterial({
    uniforms: { uPartTex: uPartTex, uExplode: uExplode },
    vertexShader: `
      attribute float aPart;
      uniform sampler2D uPartTex;
      uniform float uExplode;
      varying float vPart;
      void main() {
        vec2 puv = vec2((mod(aPart, ${TEX_W}.0) + 0.5) / ${TEX_W}.0,
                        (floor(aPart / ${TEX_W}.0) + 0.5) / ${TEX_H}.0);
        vec4 pdat = texture2D(uPartTex, puv);
        vec3 transformed = position + pdat.xyz * uExplode;
        transformed *= (1.0 - step(1.5, pdat.w));
        vPart = aPart;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
      }`,
    fragmentShader: `
      varying float vPart;
      void main() {
        float id = vPart + 1.0;
        gl_FragColor = vec4(
          mod(id, 256.0) / 255.0,
          mod(floor(id / 256.0), 256.0) / 255.0,
          floor(id / 65536.0) / 255.0, 1.0);
      }`,
  });

  // ------------------------------------------------------------ chunk loading
  const chunkMeshes = [];   // {mesh, pick, system, chunkIndex}
  const sysMaterials = {};
  for (const sy of systems) {
    sysMaterials[sy] = injectPartShader(new THREE.MeshStandardMaterial({
      color: SYS_INFO[sy].color, roughness: 0.55, metalness: 0.06,
    }));
  }

  async function loadChunk(ci, progressCb) {
    const c = atlas.chunks[ci];
    const res = await fetch(c.file);
    if (!res.ok) throw new Error(`chunk ${ci} http ${res.status}`);
    const gz = await res.arrayBuffer();
    const ds = new DecompressionStream("gzip");
    const buf = await new Response(new Blob([gz]).stream().pipeThrough(ds)).arrayBuffer();
    // layout: [positions f32][normals f32][indices u32][partIds f32]
    let vTotal = 0, iTotal = 0;
    for (let i = 0; i < N; i++) {
      const p = parts[i];
      if (p.chunk === ci) { vTotal += p.vCount; iTotal += p.iCount; }
    }
    const f32 = new Float32Array(buf, 0, vTotal * 3 + vTotal * 3);
    const pos = new Float32Array(buf, 0, vTotal * 3);
    const nor = new Float32Array(buf, vTotal * 3 * 4, vTotal * 3);
    const idx = new Uint32Array(buf, vTotal * 6 * 4, iTotal);
    const pid = new Float32Array(buf, vTotal * 6 * 4 + iTotal * 4, vTotal);
    void f32;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    geo.setAttribute("aPart", new THREE.BufferAttribute(pid, 1));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    const mesh = new THREE.Mesh(geo, sysMaterials[c.system]);
    mesh.frustumCulled = false;
    view.zUpGroup.add(mesh);
    const pick = new THREE.Mesh(geo, pickMat);
    pick.frustumCulled = false;
    pick.visible = false;
    pickRoot.zUpGroup.add(pick);
    chunkMeshes.push({ mesh, pick, system: c.system, chunkIndex: ci });
    progressCb?.();
    return mesh;
  }

  // ------------------------------------------------------------ explode layout
  // Packs visible parts into a non-overlapping 2D inventory in the X/Z plane
  // (data mm), centered on the body. Explode offset = cell - centroid.
  function computeExplode() {
    const W = viewer.clientWidth || 1, H = viewer.clientHeight || 1;
    const aspect = W / H;
    const vis = [];
    for (let i = 0; i < N; i++) {
      if (state.systemsOn[parts[i].system]) vis.push(i);
    }
    const cards = vis.map((i) => {
      const p = parts[i];
      const w = Math.max(40, p.bboxMax[0] - p.bboxMin[0]) + 48;
      const h = Math.max(40, p.bboxMax[2] - p.bboxMin[2]) + 48;
      return { i, w, h };
    });
    const area = cards.reduce((a, c) => a + c.w * c.h, 0);
    const maxW = Math.max(300, ...cards.map((c) => c.w));
    const targetW = Math.max(maxW, Math.sqrt(area * Math.max(0.5, Math.min(1.5, aspect))) * 1.18);
    cards.sort((a, b) => b.h - a.h || a.i - b.i);
    const cells = new Map();
    let x = 0, y = 0, row = 0, usedW = 0;
    for (const c of cards) {
      if (x > 0 && x + c.w > targetW) { x = 0; y += row; row = 0; }
      cells.set(c.i, { x: x + c.w / 2, y: y + c.h / 2, w: c.w, h: c.h });
      x += c.w; usedW = Math.max(usedW, x); row = Math.max(row, c.h);
    }
    const height = y + row;
    // write offsets (leave hidden parts at 0)
    for (let i = 0; i < N; i++) {
      const o = i * 4;
      const cell = cells.get(i);
      if (!cell) { partData[o] = 0; partData[o + 1] = 0; partData[o + 2] = 0; continue; }
      const p = parts[i];
      partData[o] = cell.x - usedW / 2 - p.centroid[0] + center[0];
      partData[o + 1] = 0;
      partData[o + 2] = -(cell.y - height / 2) - p.centroid[2] + center[2];
    }
    partTex.needsUpdate = true;
  }

  function setPartFlag(i, flag) {
    partData[i * 4 + 3] = flag;
  }
  function refreshFlags() {
    for (let i = 0; i < N; i++) {
      let f = 0;
      if (state.selected >= 0) {
        if (i === state.selected) f = 0;
        else f = state.isolated ? 2 : 1;
      }
      setPartFlag(i, f);
    }
    partTex.needsUpdate = true;
  }

  function applySystemVisibility() {
    for (const cm of chunkMeshes) {
      const on = state.systemsOn[cm.system];
      cm.mesh.visible = on;
      cm.pick.visible = false; // pick meshes only shown during picking
    }
    if (state.selected >= 0 && !state.systemsOn[parts[state.selected].system]) {
      clearSelection();
    }
    computeExplode();
    refreshLabels();
  }

  // ------------------------------------------------------------ selection
  function clearSelection(updateCard = true) {
    state.selected = -1;
    state.isolated = false;
    refreshFlags();
    refreshLabels();
    if (updateCard) infoCard.classList.add("hidden");
  }

  function selectPart(i, fly = true) {
    clearSelection(false);
    state.selected = i;
    state.isolated = false;
    refreshFlags();
    const p = parts[i];
    showInfo(p, i);
    if (fly) flyTo(p);
    refreshLabels();
  }

  function showInfo(p, i) {
    infoCard.innerHTML = `
      <button class="info-close" aria-label="Close">&times;</button>
      <div class="info-sys">${(SYS_INFO[p.system] || {}).name || p.system} &middot; piece ${i + 1} of ${N.toLocaleString()}</div>
      <h3>${p.name}</h3>
      <p>${describePart(p, N)}</p>
      <button class="pill-btn isolate-btn">${state.isolated ? "Show all" : "Isolate"}</button>`;
    infoCard.classList.remove("hidden");
    infoCard.querySelector(".info-close").onclick = () => clearSelection();
    infoCard.querySelector(".isolate-btn").onclick = () => {
      state.isolated = !state.isolated;
      refreshFlags();
      showInfo(p, i);
    };
    if (window.innerWidth < 821) openPanel(true);
  }

  function flyTo(p) {
    const i = byId[p.id];
    const ox = partData[i * 4] * state.spread;
    const oy = partData[i * 4 + 1] * state.spread;
    const oz = partData[i * 4 + 2] * state.spread;
    const toTgt = worldOf(p.centroid[0], p.centroid[1], p.centroid[2], ox, oy, oz, new THREE.Vector3());
    const size = new THREE.Vector3(
      p.bboxMax[0] - p.bboxMin[0], p.bboxMax[1] - p.bboxMin[1], p.bboxMax[2] - p.bboxMin[2]).multiplyScalar(s);
    const dist = Math.max(size.length() * 2.2 + 0.35, 0.9);
    const dir = camera.position.clone().sub(controls.target).normalize();
    if (dir.lengthSq() < 1e-6) dir.set(0.3, 0.25, 1).normalize();
    const toPos = toTgt.clone().add(dir.multiplyScalar(dist));
    state.tween = {
      t: 0, dur: 0.9,
      fromPos: camera.position.clone(), toPos,
      fromTgt: controls.target.clone(), toTgt,
    };
  }

  // ------------------------------------------------------------ picking (tap)
  const pickTarget = new THREE.WebGLRenderTarget(1, 1);
  const pickPixel = new Uint8Array(4);
  function pickAt(clientX, clientY) {
    const r = renderer.domElement.getBoundingClientRect();
    const pr = renderer.getPixelRatio();
    const bw = Math.round(r.width * pr), bh = Math.round(r.height * pr);
    const px = Math.round((clientX - r.left) * pr), py = Math.round((r.height - (clientY - r.top)) * pr);
    for (const cm of chunkMeshes) {
      cm.pick.visible = cm.mesh.visible;
      cm.mesh.visible = false;
    }
    camera.setViewOffset(bw, bh, px, py, 1, 1);
    renderer.setRenderTarget(pickTarget);
    renderer.render(pickScene, camera);
    renderer.setRenderTarget(null);
    camera.clearViewOffset();
    renderer.readRenderTargetPixels(pickTarget, 0, 0, 1, 1, pickPixel);
    for (const cm of chunkMeshes) {
      cm.mesh.visible = state.systemsOn[cm.system];
      cm.pick.visible = false;
    }
    const id = pickPixel[0] + pickPixel[1] * 256 + pickPixel[2] * 65536;
    return id === 0 ? -1 : id - 1;
  }

  let downPos = null, downT = 0;
  renderer.domElement.addEventListener("pointerdown", (e) => {
    downPos = [e.clientX, e.clientY]; downT = performance.now();
    state.tween = null;
  });
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (!downPos || !state.ready) return;
    const moved = Math.hypot(e.clientX - downPos[0], e.clientY - downPos[1]);
    const dt = performance.now() - downT;
    downPos = null;
    if (moved > 10 || dt > 600) return;
    const i = pickAt(e.clientX, e.clientY);
    if (i >= 0 && i < N) selectPart(i);
    else clearSelection();
  });

  // ------------------------------------------------------------ labels
  const labelEls = {};
  const _v = new THREE.Vector3();
  // major parts: top by triangle count (stable, deterministic)
  const major = parts.map((p, i) => i).sort((a, b) => parts[b].triangles - parts[a].triangles).slice(0, 48);
  const majorSet = new Set(major);
  function refreshLabels() {
    const ids = new Set(major);
    if (state.selected >= 0) ids.add(state.selected);
    for (const i of ids) {
      if (!labelEls[i]) {
        const d = el("button", "lbl", parts[i].name);
        d.addEventListener("click", (ev) => { ev.stopPropagation(); selectPart(i); });
        labelLayer.append(d);
        labelEls[i] = d;
      }
      labelEls[i].classList.toggle("sel", state.selected === i);
    }
  }
  function updateLabels() {
    const show = state.labels && state.ready;
    labelLayer.style.display = show ? "block" : "none";
    if (!show) return;
    const W = viewer.clientWidth, H = viewer.clientHeight;
    const cands = [];
    const ids = [];
    if (state.selected >= 0) ids.push(state.selected);
    if (state.spread > 0.35) {
      for (const i of major) {
        if (i !== state.selected && state.systemsOn[parts[i].system]) ids.push(i);
      }
    }
    for (const i of ids) {
      const p = parts[i];
      if (!state.systemsOn[p.system]) continue;
      const ox = partData[i * 4] * state.spread;
      const oy = partData[i * 4 + 1] * state.spread;
      const oz = partData[i * 4 + 2] * state.spread;
      worldOf(p.centroid[0], p.centroid[1], p.centroid[2], ox, oy, oz, _v);
      const dist = _v.distanceTo(camera.position);
      _v.project(camera);
      if (_v.z > 1 || _v.z < -1) continue;
      const x = (_v.x * 0.5 + 0.5) * W, y = (-_v.y * 0.5 + 0.5) * H;
      if (x < -40 || x > W + 40 || y < -40 || y > H + 40) continue;
      cands.push({ i, x, y, dist });
    }
    cands.sort((a, b) => a.dist - b.dist);
    const placed = [];
    let n = 0;
    for (const c of cands) {
      if (n >= 14) break;
      const d = labelEls[c.i];
      if (!d) continue;
      d.style.display = "block";
      const w = d.offsetWidth, hw = w / 2 + 8;
      const cx = Math.max(hw, Math.min(W - hw, c.x));
      const cy = Math.max(26, Math.min(H - 26, c.y));
      if (placed.some((q) => Math.abs(q.x - cx) < (q.w + w) / 2 + 10 && Math.abs(q.y - cy) < 26)) {
        d.style.display = "none"; continue;
      }
      placed.push({ i: c.i, x: cx, y: cy, w }); n++;
      d.style.transform = `translate(-50%,-130%) translate(${cx.toFixed(1)}px,${cy.toFixed(1)}px)`;
    }
    for (const k of Object.keys(labelEls)) {
      if (!placed.some((q) => q.i === Number(k))) labelEls[k].style.display = "none";
    }
  }

  // ------------------------------------------------------------ UI wiring
  const setFill = () => slider.style.setProperty("--fill", slider.value + "%");
  slider.addEventListener("input", () => { state.spreadTarget = slider.value / 100; setFill(); });
  setFill();

  // systems panel
  const sysCounts = {};
  for (const p of parts) sysCounts[p.system] = (sysCounts[p.system] || 0) + 1;
  const sysRows = {};
  for (const sy of systems) {
    const row = el("button", "sys-row on");
    const dot = el("span", "sys-dot");
    dot.style.background = "#" + SYS_INFO[sy].color.toString(16).padStart(6, "0");
    row.append(dot, el("span", "sys-name", `${SYS_INFO[sy].name} <em>${(sysCounts[sy] || 0).toLocaleString()}</em>`));
    row.onclick = () => {
      state.systemsOn[sy] = !state.systemsOn[sy];
      row.classList.toggle("on", state.systemsOn[sy]);
      applySystemVisibility();
    };
    sysWrap.append(row);
    sysRows[sy] = row;
  }
  const presetWrap = el("div", "sys-presets");
  const presetDefs = [
    ["All", null],
    ["Skeleton", ["skeletal"]],
    ["Muscles", ["muscular"]],
    ["Vessels", ["arterial", "venous", "lymphatic"]],
    ["Organs", ["cardiac", "respiratory", "digestive", "urinary", "reproductive", "endocrine", "nervous", "sensory"]],
  ];
  for (const [label, list] of presetDefs) {
    const b = el("button", "pill-btn sm", label);
    b.onclick = () => {
      for (const sy of systems) {
        state.systemsOn[sy] = !list || list.includes(sy);
        sysRows[sy].classList.toggle("on", state.systemsOn[sy]);
      }
      applySystemVisibility();
    };
    presetWrap.append(b);
  }
  sysWrap.prepend(presetWrap);

  searchInput.addEventListener("input", () => {
    const q = searchInput.value.trim().toLowerCase();
    searchResults.innerHTML = "";
    if (q.length < 2) { searchResults.classList.add("hidden"); return; }
    const hits = [];
    for (let i = 0; i < N && hits.length < 12; i++) {
      if (parts[i].name.toLowerCase().includes(q)) hits.push(i);
    }
    if (!hits.length) { searchResults.classList.add("hidden"); return; }
    for (const i of hits) {
      const p = parts[i];
      const b = el("button", "search-hit", `<b>${p.name}</b><span>${(SYS_INFO[p.system] || {}).name || p.system}</span>`);
      b.onclick = () => {
        searchResults.classList.add("hidden");
        searchInput.value = p.name;
        if (!state.systemsOn[p.system]) {
          state.systemsOn[p.system] = true;
          sysRows[p.system].classList.toggle("on", true);
          applySystemVisibility();
        }
        selectPart(i);
      };
      searchResults.append(b);
    }
    searchResults.classList.remove("hidden");
  });
  document.addEventListener("click", (e) => {
    if (!searchWrap.contains(e.target)) searchResults.classList.add("hidden");
  });

  labelBtn.onclick = () => {
    state.labels = !state.labels;
    labelBtn.setAttribute("aria-pressed", String(state.labels));
    labelBtn.classList.toggle("off", !state.labels);
  };
  rotBtn.onclick = () => {
    state.rotate = !state.rotate;
    controls.autoRotate = state.rotate;
    rotBtn.setAttribute("aria-pressed", String(state.rotate));
    rotBtn.classList.toggle("off", !state.rotate);
  };

  function openPanel(force) {
    const open = force !== undefined ? force : !panel.classList.contains("open");
    panel.classList.toggle("open", open);
    panelHandle.style.display = open ? "none" : "";
  }
  panelHandle.onclick = () => openPanel();

  // ------------------------------------------------------------ boot load
  function resize() {
    const w = viewer.clientWidth || 1, h = viewer.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(viewer);
  resize();
  camera.position.set(0.4, 0.5, 6.4);
  controls.target.set(0, 0.1, 0);

  // progressive: hero systems first, then the rest (4 parallel)
  const order = [...atlas.chunks.keys()]
    .sort((a, b) => {
      const pa = atlas.chunks[a].system === "muscular" ? 0 : atlas.chunks[a].system === "skeletal" ? 1 : 2;
      const pb = atlas.chunks[b].system === "muscular" ? 0 : atlas.chunks[b].system === "skeletal" ? 1 : 2;
      return pa - pb || a - b;
    });
  let done = 0;
  const totalBytes = atlas.chunks.reduce((t, c) => t + c.gzipBytes, 0);
  let doneBytes = 0;
  setProgress(0, 100, "Starting\u2026");
  const CONC = 4;
  let cursor = 0;
  async function worker() {
    while (cursor < order.length) {
      const ci = order[cursor++];
      await loadChunk(ci);
      done++;
      doneBytes += atlas.chunks[ci].gzipBytes;
      setProgress(Math.round((100 * doneBytes) / totalBytes), 100,
        `${done} / ${order.length} chunks \u00b7 ${(doneBytes / 1e6).toFixed(0)} MB`);
      if (done === 2) { computeExplode(); } // hero pose as soon as body core lands
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  computeExplode();
  refreshFlags();
  applySystemVisibility();
  state.ready = true;
  loadOverlay.classList.add("hidden");
  refreshLabels();

  // ------------------------------------------------------------ loop
  const clock = new THREE.Clock();
  function animate() {
    raf = requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    state.spread += (state.spreadTarget - state.spread) * (1 - Math.exp(-dt * 5));
    if (Math.abs(state.spreadTarget - state.spread) < 0.0005) state.spread = state.spreadTarget;
    uExplode.value = state.spread;
    // keep the explosion framed while it animates
    const moving = Math.abs(state.spreadTarget - state.spread) > 0.0005;
    if (moving && !state.tween) {
      const aspect = camera.aspect || 1;
      const want = 6.4 * (1 + state.spread * (aspect < 0.8 ? 2.6 : 1.9));
      _v.copy(camera.position).sub(controls.target);
      const d = _v.length();
      const nd = d + (want - d) * (1 - Math.exp(-dt * 3));
      if (Math.abs(nd - d) > 1e-4) camera.position.copy(controls.target).add(_v.setLength(nd));
    }
    const tw = state.tween;
    if (tw) {
      tw.t += dt / tw.dur;
      const k = easeInOut(Math.min(tw.t, 1));
      camera.position.lerpVectors(tw.fromPos, tw.toPos, k);
      controls.target.lerpVectors(tw.fromTgt, tw.toTgt, k);
      if (tw.t >= 1) state.tween = null;
    }
    controls.update();
    updateLabels();
    renderer.render(scene, camera);
  }
  let raf = requestAnimationFrame(animate);

  return {
    menuButton: menuBtn,
    openPanel,
    destroy() {
      cancelAnimationFrame(raf);
      controls.dispose();
      for (const cm of chunkMeshes) cm.mesh.geometry.dispose();
      pickTarget.dispose();
      partTex.dispose();
      renderer.dispose();
      host.innerHTML = "";
    },
  };
}
