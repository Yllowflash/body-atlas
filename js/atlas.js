// Body Atlas — Three.js viewer.
// Real anatomy only: BodyParts3D 4.0 meshes (CC BY 4.0), loaded from local GLBs.
// Coordinate handling: data is Z-up millimetres; ONE root group converts to
// three.js Y-up, and the whole scene is normalized as ONE group — no model is
// ever recentered, rotated or rescaled individually.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DESCRIPTIONS } from "../data/descriptions.js";

const SYSTEM_COLORS = {
  Cardiovascular: 0xe14b54,
  Respiratory: 0xef6f8c,
  Digestive: 0xe8977a,
  Urinary: 0xd96a9b,
  Nervous: 0xf2a3b3,
  Skeletal: 0xe8e0d2,
  Muscular: 0xb03a48,
  Integumentary: 0xd9a08c,
};
const BONE_ORGANS = new Set([
  "skull", "mandible", "rib-cage", "vertebral-column", "pelvis", "sacrum",
  "sternum", "left-femur", "left-humerus", "left-clavicle", "left-scapula",
  "left-tibia", "left-radius",
]);
const HEAVY_LAZY = new Set(["skeleton-full", "musculature"]);
const WORLD_HEIGHT = 4.2;      // world units for full body height
const SPREAD_MM = 900;         // radial explode distance at slider=1 (data mm)

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export async function bootAtlas(host) {
  const manifest = await (await fetch("data/manifest.json")).json().then((j) => j.models);
  const byId = Object.fromEntries(manifest.map((m) => [m.id, m]));

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
  main.append(panel); // inside .atlas-main so wide layout gets a real sidebar
  const bottombar = el("div", "atlas-bottombar");
  const loadOverlay = el("div", "load-overlay");
  const lazyPill = el("div", "lazy-pill hidden");
  host.append(topbar, main, bottombar, loadOverlay, lazyPill);

  const menuBtn = el("button", "icon-btn", "&#9776;");
  menuBtn.setAttribute("aria-label", "Menu");
  const titleEl = el("div", "atlas-title", "Body Atlas");
  const labelBtn = el("button", "pill-btn", "Labels");
  labelBtn.setAttribute("aria-pressed", "true");
  const rotBtn = el("button", "pill-btn", "Rotate");
  rotBtn.setAttribute("aria-pressed", "true");
  topbar.append(menuBtn, titleEl, el("span", "flex-sp"), labelBtn, rotBtn);

  // panel: search + system tabs + structure list + info card
  const searchWrap = el("div", "search-wrap");
  const searchInput = el("input", "search-input");
  searchInput.placeholder = "Search structures\u2026";
  searchInput.setAttribute("aria-label", "Search structures");
  const searchResults = el("div", "search-results hidden");
  searchWrap.append(searchInput, searchResults);
  const tabsWrap = el("div", "sys-tabs");
  const structList = el("div", "struct-list");
  const infoCard = el("div", "info-card hidden");
  const panelClose = el("button", "panel-close", "Done");
  panelClose.setAttribute("aria-label", "Close panel");
  panelClose.onclick = () => openPanel(false);
  panel.append(panelClose, searchWrap, tabsWrap, structList, infoCard);
  const panelHandle = el("button", "panel-handle", "Explore");
  host.append(panelHandle);

  // bottom bar: layer chips + spread slider
  const chipsWrap = el("div", "layer-chips");
  const chipDefs = [["skin", "Skin"], ["muscles", "Muscles"], ["organs", "Organs"], ["skeleton", "Skeleton"]];
  const chipBtns = {};
  for (const [key, label] of chipDefs) {
    const b = el("button", "chip", label);
    b.dataset.layer = key;
    chipsWrap.append(b);
    chipBtns[key] = b;
  }
  const spreadWrap = el("div", "spread-wrap");
  spreadWrap.innerHTML = `<span class="spread-end">Assembled</span>
    <input type="range" class="spread-slider" min="0" max="100" value="0" aria-label="Spread structures apart">
    <span class="spread-end dim">Spread</span>`;
  const slider = spreadWrap.querySelector("input");
  bottombar.append(chipsWrap, spreadWrap);

  loadOverlay.innerHTML = `<div class="load-box"><div class="load-title">Loading anatomy</div>
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
  controls.maxDistance = 18;

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
  const normGroup = new THREE.Group();
  scene.add(normGroup);
  const zUpGroup = new THREE.Group();
  zUpGroup.rotation.x = -Math.PI / 2; // data Z-up (mm) -> three.js Y-up
  normGroup.add(zUpGroup);

  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const m of manifest) {
    for (let i = 0; i < 3; i++) {
      mn[i] = Math.min(mn[i], m.bboxMin[i]);
      mx[i] = Math.max(mx[i], m.bboxMax[i]);
    }
  }
  const center = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
  const s = WORLD_HEIGHT / (mx[2] - mn[2]);
  normGroup.scale.setScalar(s);
  normGroup.position.set(-s * center[0], -s * center[2], s * center[1]);

  // ------------------------------------------------------------ state
  const models = {};   // id -> {entry, group, mats:[], anchor, dir, loaded}
  const state = {
    layer: "body", spread: 0, spreadTarget: 0,
    selected: null, labels: true, rotate: true, tween: null, ready: false,
  };
  const loader = new GLTFLoader();

  function explodeDir(entry) {
    // Radial from the BODY's central vertical axis (bbox center x/y) — not the
    // data origin, which sits ~100mm behind the body's front-back center.
    const dx = entry.centroid[0] - center[0], dy = entry.centroid[1] - center[1];
    const r = Math.hypot(dx, dy);
    if (r > 25) return [dx / r, dy / r, 0];
    // Near-axis / midline structures: radial is degenerate, so use a
    // deterministic per-id compass direction instead of noise.
    let h = 0;
    for (const ch of entry.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const a = (h % 628) / 100;
    return [Math.cos(a), Math.sin(a), 0];
  }

  function makeMaterial(entry) {
    const color = SYSTEM_COLORS[entry.system] ?? 0xe14b54;
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.06 });
    if (entry.id === "skin") {
      mat.transparent = true;
      mat.opacity = 1;
      mat.roughness = 0.65;
      mat.side = THREE.DoubleSide;
    }
    return mat;
  }

  async function loadModel(id, progressCb) {
    if (models[id]?.loaded) return models[id];
    if (models[id]?.loading) return models[id].loading;
    const entry = byId[id];
    const group = new THREE.Group();
    group.visible = false;
    const anchor = new THREE.Object3D();
    anchor.position.set(entry.centroid[0], entry.centroid[1], entry.centroid[2]);
    // Skin's centroid is mid-torso: pin its label up at the neck/shoulder.
    if (entry.id === "skin") anchor.position.z = entry.bboxMax[2] - 260;
    group.add(anchor);
    group.userData.modelId = id;
    zUpGroup.add(group);
    const rec = { entry, group, mats: [], anchor, dir: explodeDir(entry), loaded: false, loading: null };
    models[id] = rec;
    rec.loading = (async () => {
      const gltf = await loader.loadAsync(entry.file, (ev) => progressCb?.(ev));
      const mat = makeMaterial(entry);
      rec.mats.push(mat);
      gltf.scene.traverse((o) => {
        if (o.isMesh) {
          o.material = mat;
          o.userData.modelId = id;
        }
      });
      group.add(gltf.scene);
      rec.loaded = true;
      rec.loading = null;
      applyLayer();
      applySpread(true);
      return rec;
    })();
    return rec.loading;
  }

  function worldOf(entry, out) {
    out = out || new THREE.Vector3();
    const rec = models[entry.id];
    if (rec) { rec.anchor.getWorldPosition(out); return out; }
    // not loaded yet: transform data centroid manually
    const [x, y, z] = entry.centroid;
    return out.set(s * x - s * center[0], s * z - s * center[2], -s * y + s * center[1]);
  }

  // ------------------------------------------------------------ layers
  function layerVisible(id) {
    const L = state.layer;
    if (L === "body")
      return id === "skin" || id === "musculature" || id === "skeleton-full" || !BONE_ORGANS.has(id);
    if (L === "skin") return id === "skin";
    if (L === "muscles") return id === "musculature";
    if (L === "organs") return id !== "skin" && !HEAVY_LAZY.has(id);
    if (L === "skeleton") return id === "skeleton-full";
    return false;
  }

  function applyLayer() {
    for (const id of Object.keys(models)) {
      const rec = models[id];
      rec.group.visible = layerVisible(id) && rec.loaded;
    }
    for (const [k, b] of Object.entries(chipBtns)) b.classList.toggle("active", state.layer === k);
    refreshLabels();
  }

  async function setLayer(L) {
    if (state.layer !== L) { state.layer = L; clearSelection(false); infoCard.classList.add("hidden"); }
    if (L === "muscles") await ensureHeavy("musculature");
    if (L === "skeleton") await ensureHeavy("skeleton-full");
    applyLayer();
  }

  async function ensureHeavy(id) {
    const rec = models[id];
    if (rec?.loaded) return;
    lazyPill.classList.remove("hidden");
    const name = byId[id].name;
    try {
      await loadModel(id, (ev) => {
        if (ev.total) lazyPill.textContent = `Loading ${name}\u2026 ${Math.round((100 * ev.loaded) / ev.total)}%`;
      });
    } finally {
      lazyPill.classList.add("hidden");
    }
  }

  // ------------------------------------------------------------ selection
  function clearSelection(updateCard = true) {
    if (state.selected) {
      const rec = models[state.selected];
      rec?.mats.forEach((m) => { m.emissive.setHex(0x000000); m.emissiveIntensity = 0; });
      state.selected = null;
    }
    if (updateCard) infoCard.classList.add("hidden");
  }

  function selectModel(id, fly = true) {
    const entry = byId[id];
    if (!entry) return;
    // make sure the structure is visible in the current layer
    if (!layerVisible(id)) {
      if (BONE_ORGANS.has(id)) state.layer = "organs";
      else if (id === "skeleton-full") state.layer = "skeleton";
      else if (id === "musculature") state.layer = "muscles";
      else if (id === "skin") state.layer = "skin";
    }
    const need = layerVisible(id) ? ensureVisible(id) : Promise.resolve();
    need.then(() => {
      clearSelection(false);
      state.selected = id;
      const rec = models[id];
      rec.mats.forEach((m) => { m.emissive.setHex(0xff2d55); m.emissiveIntensity = 0.5; });
      applyLayer();
      // Revealing internal structures: if the skin is still on, spread the
      // body open so the selected structure is actually visible.
      if (id !== "skin" && state.layer === "body" && state.spreadTarget < 0.45) {
        state.spreadTarget = 0.55;
        slider.value = 55;
        setFill();
      }
      showInfo(entry);
      if (fly) flyTo(entry);
    });
  }

  async function ensureVisible(id) {
    if (HEAVY_LAZY.has(id)) await ensureHeavy(id);
    else await loadModel(id);
  }

  function showInfo(entry) {
    const desc = DESCRIPTIONS[entry.id] || "Study notes for this structure are on the way.";
    infoCard.innerHTML = `
      <button class="info-close" aria-label="Close">&times;</button>
      <div class="info-sys">${entry.system}</div>
      <h3>${entry.name}</h3>
      <p>${desc}</p>`;
    infoCard.classList.remove("hidden");
    infoCard.querySelector(".info-close").onclick = () => clearSelection();
    if (window.innerWidth < 821) openPanel(true);
  }

  function flyTo(entry) {
    const toTgt = worldOf(entry, new THREE.Vector3());
    const size = new THREE.Vector3(
      entry.bboxMax[0] - entry.bboxMin[0],
      entry.bboxMax[1] - entry.bboxMin[1],
      entry.bboxMax[2] - entry.bboxMin[2]).multiplyScalar(s);
    const dist = Math.max(size.length() * 1.6, 1.4);
    const dir = camera.position.clone().sub(controls.target).normalize();
    if (dir.lengthSq() < 1e-6) dir.set(0.3, 0.25, 1).normalize();
    const toPos = toTgt.clone().add(dir.multiplyScalar(dist));
    state.tween = {
      t: 0, dur: 0.9,
      fromPos: camera.position.clone(), toPos,
      fromTgt: controls.target.clone(), toTgt,
    };
  }

  // ------------------------------------------------------------ spread
  function applySpread(snap = false) {
    if (snap) state.spread = state.spreadTarget;
    for (const id of Object.keys(models)) {
      const rec = models[id];
      const [dx, dy] = rec.dir;
      const off = state.spread * SPREAD_MM;
      rec.group.position.set(dx * off, dy * off, 0);
    }
    const skin = models.skin;
    if (skin) {
      const op = Math.max(0, 1 - state.spread * 1.7);
      skin.mats.forEach((m) => {
        m.opacity = op;
        m.depthWrite = op > 0.6;
      });
      skin.group.visible = layerVisible("skin") && skin.loaded && op > 0.02;
    }
  }
  const setFill = () => slider.style.setProperty("--fill", slider.value + "%");
  slider.addEventListener("input", () => { state.spreadTarget = slider.value / 100; setFill(); });
  setFill();

  // ------------------------------------------------------------ labels
  const labelEls = {};
  function refreshLabels() {
    for (const id of Object.keys(models)) {
      const entry = byId[id];
      if (!labelEls[id]) {
        const d = el("button", "lbl", entry.name);
        d.addEventListener("click", (e) => { e.stopPropagation(); selectModel(id); });
        labelLayer.append(d);
        labelEls[id] = d;
      }
      labelEls[id].classList.toggle("sel", state.selected === id);
    }
  }
  const _v = new THREE.Vector3();
  const _off = new THREE.Vector3();
  // Labels only for structures the user can actually see: internal labels
  // stay hidden while the skin is opaque, and appear as it fades.
  function labelExposed(id) {
    if (id === "skin") return true;
    if (state.layer === "organs") return true;
    if (state.layer === "muscles") return id === "musculature";
    if (state.layer === "skeleton") return id === "skeleton-full";
    return state.spread > 0.3; // body layer: skin faded enough to see inside
  }
  function updateLabels() {
    const show = state.labels && state.ready;
    labelLayer.style.display = show ? "block" : "none";
    if (!show) return;
    const W = viewer.clientWidth, H = viewer.clientHeight;
    const cands = [];
    for (const id of Object.keys(models)) {
      const rec = models[id];
      if (!rec.loaded || !rec.group.visible || !labelExposed(id)) continue;
      rec.anchor.getWorldPosition(_v);
      const dist = _v.distanceTo(camera.position);
      _v.project(camera);
      if (_v.z > 1 || _v.z < -1) continue;
      const x = (_v.x * 0.5 + 0.5) * W, y = (-_v.y * 0.5 + 0.5) * H;
      if (x < -40 || x > W + 40 || y < -40 || y > H + 40) continue;
      cands.push({ id, x, y, dist });
    }
    cands.sort((a, b) => a.dist - b.dist);
    const placed = [];
    let n = 0;
    for (const c of cands) {
      if (n >= 14) break;
      const d = labelEls[c.id];
      d.style.display = "block"; // measure real width before clamping
      const w = d.offsetWidth, hw = w / 2 + 8;
      const cx = Math.max(hw, Math.min(W - hw, c.x));
      const cy = Math.max(26, Math.min(H - 26, c.y));
      // width-aware box overlap: pills never stack on each other
      if (placed.some((p) => Math.abs(p.x - cx) < (p.w + w) / 2 + 10 && Math.abs(p.y - cy) < 26)) {
        d.style.display = "none"; continue;
      }
      placed.push({ id: c.id, x: cx, y: cy, w }); n++;
      d.style.transform = `translate(-50%,-130%) translate(${cx.toFixed(1)}px,${cy.toFixed(1)}px)`;
      d.dataset.placed = "1";
    }
    for (const id of Object.keys(labelEls)) {
      const d = labelEls[id];
      if (!placed.some((p) => p.id === id)) d.style.display = "none";
    }
  }

  // ------------------------------------------------------------ UI wiring
  const SYSTEMS = ["Cardiovascular", "Respiratory", "Digestive", "Urinary", "Nervous", "Skeletal", "Muscular", "Integumentary"];
  let activeSys = "Cardiovascular";
  for (const sys of SYSTEMS) {
    const b = el("button", "sys-tab" + (sys === activeSys ? " active" : ""), sys);
    b.onclick = () => {
      activeSys = sys;
      tabsWrap.querySelectorAll(".sys-tab").forEach((t) => t.classList.toggle("active", t === b));
      renderStructList();
    };
    tabsWrap.append(b);
  }
  function renderStructList() {
    structList.innerHTML = "";
    for (const m of manifest.filter((m) => m.system === activeSys)) {
      const b = el("button", "struct-btn", m.name);
      b.onclick = () => selectModel(m.id);
      structList.append(b);
    }
  }
  renderStructList();

  searchInput.addEventListener("input", () => {
    const q = searchInput.value.trim().toLowerCase();
    searchResults.innerHTML = "";
    if (q.length < 2) { searchResults.classList.add("hidden"); return; }
    const hits = manifest.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 12);
    if (!hits.length) { searchResults.classList.add("hidden"); return; }
    for (const m of hits) {
      const b = el("button", "search-hit", `<b>${m.name}</b><span>${m.system}</span>`);
      b.onclick = () => {
        searchResults.classList.add("hidden");
        searchInput.value = m.name;
        selectModel(m.id);
      };
      searchResults.append(b);
    }
    searchResults.classList.remove("hidden");
  });
  document.addEventListener("click", (e) => {
    if (!searchWrap.contains(e.target)) searchResults.classList.add("hidden");
  });

  for (const [k, b] of Object.entries(chipBtns)) {
    b.onclick = () => setLayer(state.layer === k ? "body" : k);
  }
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

  // tap-to-select (distinguish tap from drag)
  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  let downPos = null, downT = 0;
  renderer.domElement.addEventListener("pointerdown", (e) => {
    downPos = [e.clientX, e.clientY]; downT = performance.now();
    state.tween = null;
  });
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (!downPos) return;
    const moved = Math.hypot(e.clientX - downPos[0], e.clientY - downPos[1]);
    const dt = performance.now() - downT;
    downPos = null;
    if (moved > 10 || dt > 600) return;
    const r = renderer.domElement.getBoundingClientRect();
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const hits = ray.intersectObjects(zUpGroup.children, true)
      .filter((h) => { let o = h.object; while (o) { if (o.visible === false) return false; o = o.parent; } return true; });
    if (hits.length) selectModel(hits[0].object.userData.modelId);
    else clearSelection();
  });

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
  // initial camera: front view of the body
  camera.position.set(0.4, 0.5, 6.4);
  controls.target.set(0, 0.1, 0);

  const initial = manifest.filter((m) => !HEAVY_LAZY.has(m.id));
  let done = 0;
  setProgress(0, initial.length, "Starting\u2026");
  await Promise.all(initial.map((m) =>
    loadModel(m.id).then(() => { done++; setProgress(done, initial.length, m.name); })
  ));
  state.ready = true;
  loadOverlay.classList.add("hidden");
  applyLayer();
  applySpread(true);
  refreshLabels();
  // Finish the hero assembly in the background: heavy layers lazy-load with
  // the progress pill, so the app is interactive with organs + skin first.
  ensureHeavy("skeleton-full").then(() => ensureHeavy("musculature")).catch(() => {});

  // ------------------------------------------------------------ loop
  const clock = new THREE.Clock();
  function animate() {
    raf = requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    // eased spread (never pops)
    state.spread += (state.spreadTarget - state.spread) * (1 - Math.exp(-dt * 6));
    if (Math.abs(state.spreadTarget - state.spread) < 0.0005) state.spread = state.spreadTarget;
    applySpread();
    // Keep the explosion framed: ease the camera out while spread animates
    // (never fights the user's own zooming or a fly-to tween afterwards).
    const spreadMoving = Math.abs(state.spreadTarget - state.spread) > 0.0005;
    if (spreadMoving && !state.tween) {
      const aspect = camera.aspect || 1;
      const want = 6.4 * (1 + state.spread * (aspect < 0.8 ? 1.5 : 1.0));
      _off.copy(camera.position).sub(controls.target);
      const d = _off.length();
      const nd = d + (want - d) * (1 - Math.exp(-dt * 3));
      if (Math.abs(nd - d) > 1e-4) camera.position.copy(controls.target).add(_off.setLength(nd));
    }
    // camera fly-to tween
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
      renderer.dispose();
      host.innerHTML = "";
    },
  };
}
