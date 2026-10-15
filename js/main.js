// App shell: hamburger menu, section switching, footer attribution.
import { SECTIONS, getSection, ATTRIBUTION_SHORT, PROVENANCE, LICENSE_URL } from "./sections.js?v=4";
import { bootAtlas } from "./atlas.js?v=4";

const app = document.getElementById("app");
const drawer = document.getElementById("menu-drawer");
const scrim = document.getElementById("drawer-scrim");
const sectionHost = document.getElementById("section-host");
const navList = document.getElementById("menu-nav");

let atlasApi = null;
let menuOpener = null;

function closeDrawer() {
  drawer.classList.remove("open");
  scrim.classList.add("hidden");
}
function openDrawer() {
  drawer.classList.add("open");
  scrim.classList.remove("hidden");
}
scrim.addEventListener("click", closeDrawer);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });

async function showSection(id) {
  const sec = getSection(id);
  closeDrawer();
  if (atlasApi) { atlasApi.destroy(); atlasApi = null; }
  sectionHost.innerHTML = "";
  document.querySelectorAll("#menu-nav button").forEach((b) =>
    b.classList.toggle("active", b.dataset.section === sec.id));
  if (sec.id === "atlas") {
    const root = document.createElement("div");
    root.id = "atlas-mount";
    sectionHost.append(root);
    atlasApi = await bootAtlas(root);
    menuOpener = () => openDrawer();
    atlasApi.menuButton.addEventListener("click", menuOpener);
  } else {
    const wrap = document.createElement("div");
    wrap.className = "section-static";
    sectionHost.append(wrap);
    // local top bar so the menu stays reachable from anywhere
    const bar = document.createElement("div");
    bar.className = "static-topbar";
    const mb = document.createElement("button");
    mb.className = "icon-btn";
    mb.innerHTML = "&#9776;";
    mb.setAttribute("aria-label", "Menu");
    mb.addEventListener("click", openDrawer);
    const t = document.createElement("div");
    t.className = "atlas-title";
    t.textContent = sec.title;
    bar.append(mb, t);
    const body = document.createElement("div");
    body.className = "static-body";
    sec.render(body);
    wrap.append(bar, body);
  }
}

// Build the menu from the registry — future sections appear here with no other changes.
for (const sec of SECTIONS) {
  const b = document.createElement("button");
  b.className = "menu-item";
  b.dataset.section = sec.id;
  b.innerHTML = `<span>${sec.title}</span>${sec.comingSoon ? '<em>soon</em>' : ""}`;
  b.addEventListener("click", () => showSection(sec.id));
  navList.append(b);
}
// Footer attribution (required by the CC BY 4.0 license).
const foot = document.getElementById("menu-foot");
foot.innerHTML = `<p>${ATTRIBUTION_SHORT}</p><p class="prov">${PROVENANCE}</p>
  <p><a href="${LICENSE_URL}" target="_blank" rel="noopener">License terms</a></p>`;

showSection("atlas");
