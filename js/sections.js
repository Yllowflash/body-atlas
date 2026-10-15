// Section registry: the app's modular menu architecture.
//
// To add a future section (quiz, drug guide, ...), append one entry:
//   { id: 'my-section', title: 'My Section', render(el) { el.innerHTML = '...'; } }
// No existing code needs to change. Entries with `comingSoon: true` render
// a standard placeholder automatically.

export const LICENSE_URL = "https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html";
export const ATTRIBUTION_SHORT =
  "BodyParts3D, \u00A9 The Database Center for Life Science licensed under CC Attribution 4.0 International";
export const PROVENANCE =
  "All 3D models are from BodyParts3D 4.0 \u2014 an anonymized, publicly licensed anatomical database (The Database Center for Life Science, CC BY 4.0).";

function placeholderSection(title, blurb) {
  return {
    title,
    comingSoon: true,
    render(el) {
      el.innerHTML = `
        <div class="soon-wrap">
          <div class="soon-badge">Coming soon</div>
          <h2>${title}</h2>
          <p>${blurb}</p>
          <p class="soon-hint">This section will plug into the menu automatically once it is built \u2014 no changes to the atlas needed.</p>
        </div>`;
    },
  };
}

export const SECTIONS = [
  {
    id: "atlas",
    title: "Human Atlas",
    // render() is wired by main.js to boot the 3D atlas into `el`.
    render: null,
  },
  {
    id: "quizzes",
    ...placeholderSection(
      "Quizzes",
      "Test yourself: identify structures on the 3D model, timed system drills, and spaced-repetition decks built for med-school exams."
    ),
  },
  {
    id: "drug-guide",
    ...placeholderSection(
      "Drug Guide",
      "A quick-reference pharmacology companion: mechanisms, key side effects and classic exam pearls, cross-linked to atlas structures."
    ),
  },
  {
    id: "about",
    title: "About & Provenance",
    render(el) {
      el.innerHTML = `
        <div class="about-wrap">
          <h2>About this atlas</h2>
          <p>A static, fully offline 3D human body atlas for medical students. Every mesh is real anatomical data \u2014 never AI-generated or procedural.</p>
          <h3>Data provenance</h3>
          <p>${PROVENANCE}</p>
          <p class="attr-line">${ATTRIBUTION_SHORT}</p>
          <p><a class="ext-link" href="${LICENSE_URL}" target="_blank" rel="noopener">BodyParts3D license terms</a></p>
          <h3>Coordinate note</h3>
          <p>All models share one anatomical coordinate system (millimetres, Z-up). They are assembled without recentering any individual structure, so spatial relationships are exactly as segmented.</p>
        </div>`;
    },
  },
];

export function getSection(id) {
  return SECTIONS.find((s) => s.id === id) || SECTIONS[0];
}
