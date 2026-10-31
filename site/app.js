import { updateInstallButton } from "./pwa.js";

const STORE_KEY = "audiobook:v1";
const RATES = [0.5, 0.6, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
const SIZES = [0.8, 0.9, 1, 1.1, 1.2, 1.35, 1.5, 1.7, 1.9];
const FONTS = { serif: "Clásica", sans: "Moderna" };
// The colours of each theme are in style.css. "auto" follows the system: paper or night.
const THEMES = { auto: "Auto", paper: "Papel", sepia: "Sepia", white: "Blanco", night: "Noche", slate: "Pizarra", black: "Negro" };
const DEFAULTS = { rate: 1, size: 1, font: "serif", theme: "auto", gloss: false };
const PREROLL = 0.05; // seconds: start a little before a word when jumping to it
// A tapped unit near the audio. Heard: in the sentence of the play head or the one before it. Ahead: at most
// AHEAD words after the play head. A heard unit moves the play head back to the start of its sentence, or to one
// word before the unit if the sentence starts more than RESTART words before it.
const AHEAD = 8;
const RESTART = 5;

const ICONS = {
  back: "M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z",
  play: "M8 5v14l11-7z",
  pause: "M6 5h4v14H6zm8 0h4v14h-4z",
  more: "M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z",
  save: "M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15-5-2.18L7 18V5h10v13z",
  saved: "M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z",
  close: "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
};
const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function translationHTML(sentence, gloss) {
  if (!gloss?.trim()) return esc(sentence);
  const phrase = gloss.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/gu, "\\s+");
  // Match whole words, ignoring case and spacing. Count overlapping matches too.
  const wordEnd = /[\p{L}\p{M}\p{N}_'’\-]$/u;
  const wordStart = /^[\p{L}\p{M}\p{N}_'’\-]/u;
  const matches = [...sentence.matchAll(new RegExp(`(?=(${phrase}))`, "giu"))].filter((match) =>
    !wordEnd.test(sentence.slice(0, match.index))
    && !wordStart.test(sentence.slice(match.index + match[1].length)),
  );
  // Reworded translations and repeated phrases have no reliable match. Do not guess.
  if (matches.length !== 1) return esc(sentence);
  const [{ index, 1: text }] = matches;
  return `${esc(sentence.slice(0, index))}<mark>${esc(text)}</mark>${esc(sentence.slice(index + text.length))}`;
}

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

const minutes = (seconds) => `${Math.max(1, Math.round(seconds / 60))} min`;

// Storage: { books: { [id]: { chapter, chapters: { [n]: { time, done } } } }, settings: { rate, size, font, theme }, words: [...] }
// A saved word is one unit at one place: { book, chapter, at: [word indexes in the chapter], k: [token numbers in
// its sentence], sentence (the English sentence), en, base, es, note (the reader's own), saved (ms) }.
// It keeps copies of the texts, so the word list needs no chapter data.

const store = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    if (saved?.books) return { books: saved.books, settings: { ...DEFAULTS, ...saved.settings }, words: saved.words ?? [] };
  } catch {}
  return { books: {}, settings: { ...DEFAULTS }, words: [] };
})();
const save = () => localStorage.setItem(STORE_KEY, JSON.stringify(store));
const progress = (bookId) => (store.books[bookId] ??= { chapter: 1, chapters: {} });
const listened = (book) => {
  const p = store.books[book.id]?.chapters ?? {};
  return book.chapters.reduce((sum, c) => sum + (p[c.n]?.done ? c.duration : Math.min(p[c.n]?.time ?? 0, c.duration)), 0);
};
const total = (book) => book.chapters.reduce((sum, c) => sum + c.duration, 0);
const wordKey = (w) => `${w.book}/${w.chapter}/${w.at[0]}`;
const savedAt = (book, chapter, i) => store.words.find((w) => w.book === book && w.chapter === chapter && w.at.includes(i));

const systemDark = matchMedia("(prefers-color-scheme: dark)");
const narrow = matchMedia("(max-width: 40rem)"); // the word popup is a panel above the player (style.css)

function applySettings() {
  const { theme, font, size } = store.settings, root = document.documentElement;
  root.dataset.theme = theme === "auto" ? (systemDark.matches ? "night" : "paper") : theme;
  root.dataset.font = font;
  root.style.setProperty("--text-scale", size);
  root.toggleAttribute("data-gloss", store.settings.gloss);
  document.querySelector('meta[name="theme-color"]').content = getComputedStyle(root).getPropertyValue("--bg");
}
applySettings();
systemDark.addEventListener("change", applySettings);

const view = document.getElementById("view");
const audio = document.getElementById("audio");

async function fetchJSON(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function loadError(container, message) {
  container.innerHTML = `<p role="alert">${message}</p><button class="button primary">Reintentar</button>`;
  container.querySelector("button").onclick = () => location.reload();
}

const library = await fetchJSON("library.json").catch(() => null);

// Routing: #/ (library), #/<book> (chapters), #/<book>/<n> (reader), #/<book>/<n>/<word> (reader, open at a word),
// #/words and #/words/<book> (saved words)

let leave = () => {};
let autoplay = false;
let wordsFrom = "#/words"; // the word list page that opened the reader, for its back button
const wordsLink = (href) => `<a class="button words-link" href="${href}">${icon("saved")}Mis palabras</a>`;

function route() {
  leave();
  leave = () => {};
  const [bookId, n, word] = location.hash.slice(2).split("/");
  const book = library.find((b) => b.id === bookId);
  const chapter = book?.chapters.find((c) => c.n === Number(n));
  window.scrollTo(0, 0);
  if (bookId === "words") showWords(library.find((b) => b.id === n));
  else if (chapter) leave = showReader(book, chapter, word ? Number(word) : -1);
  else if (book) showBook(book);
  else showLibrary();
}
if (library) {
  window.addEventListener("hashchange", route);
  route();
} else {
  view.innerHTML = `<header class="top"><h1>Biblioteca</h1></header><div class="page"></div>`;
  loadError(view.querySelector(".page"), "No se pudo cargar la biblioteca. Comprueba tu conexión.");
}

function showLibrary() {
  document.title = "Audiolibros";
  view.innerHTML = `
    <header class="top"><h1>Biblioteca</h1>${wordsLink("#/words")}</header>
    <div class="page">
      <ul class="books">${library.map((book) => `
        <li><a class="book-card" href="#/${book.id}">
          <img src="${book.cover}" alt="">
          <div>
            <h2>${esc(book.title)}</h2>
            <p>${esc(book.author)}</p>
            <p class="muted">Narrado por ${esc(book.narrator)} · ${book.chapters.length} ${book.chapters.length === 1 ? "capítulo" : "capítulos"} · ${minutes(total(book))}</p>
            <div class="meter"><i style="width:${(100 * listened(book)) / total(book)}%"></i></div>
          </div>
        </a></li>`).join("")}
      </ul>
      <div class="app-actions"><button id="install-app" class="button" hidden>Instalar app</button></div>
    </div>`;
  updateInstallButton();
}

function showBook(book) {
  document.title = book.title;
  const p = progress(book.id);
  const current = book.chapters.find((c) => c.n === p.chapter) ?? book.chapters[0];
  const started = listened(book) > 0;
  view.innerHTML = `
    <header class="top">
      <a class="icon" href="#/" aria-label="Biblioteca">${icon("back")}</a>
      <div class="top-title"><span>Biblioteca</span></div>
      ${wordsLink(`#/words/${book.id}`)}
    </header>
    <div class="page">
      <section class="hero">
        <img src="${book.cover}" alt="">
        <div>
          <h1>${esc(book.title)}</h1>
          <p>${esc(book.author)}</p>
          <p class="muted">Narrado por ${esc(book.narrator)}</p>
          <a class="button primary" href="#/${book.id}/${current.n}">${icon("play")}${started ? "Continuar" : "Empezar"} · Capítulo ${current.n}</a>
        </div>
      </section>
      <ol class="chapters">${book.chapters.map((c) => {
        const state = p.chapters[c.n];
        const status = state?.done ? `<span class="done">✓ Terminado</span>`
          : state?.time > 5 ? `quedan ${minutes(c.duration - state.time)}` : minutes(c.duration);
        return `<li><a href="#/${book.id}/${c.n}">
          <span class="num">${c.n}</span><span>${esc(c.title)}</span><span class="status">${status}</span>
        </a></li>`;
      }).join("")}
      </ol>
    </div>`;
}

function showWords(book) {
  wordsFrom = location.hash;
  document.title = "Mis palabras";
  const books = library.filter((b) => store.words.some((w) => w.book === b.id));
  view.innerHTML = `
    <header class="top">
      <a class="icon" href="${book ? `#/${book.id}` : "#/"}" aria-label="Volver">${icon("back")}</a>
      <div class="top-title"><small></small><span>Mis palabras</span></div>
    </header>
    <div class="page">
      ${books.length > 1 ? `<nav class="filters">
        <a href="#/words" aria-current="${!book}">Todos</a>
        ${books.map((b) => `<a href="#/words/${b.id}" aria-current="${b === book}">${esc(b.title)}</a>`).join("")}
      </nav>` : ""}
      <input class="search" type="search" placeholder="Buscar en inglés o en español" aria-label="Buscar">
      <ul class="word-list"></ul>
      <p class="empty muted" hidden></p>
      <div class="backup">
        <p class="muted">Tus palabras solo se guardan en este navegador. Haz una copia para no perderlas o para pasarlas a otro dispositivo.</p>
        <button class="button export">Exportar copia</button>
        <label class="button import">Importar copia<input type="file" accept=".json,application/json" hidden></label>
        <output></output>
      </div>
    </div>`;

  const $ = (selector) => view.querySelector(selector);
  const fold = (text) => (text ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const where = (w) => {
    const b = library.find((x) => x.id === w.book), c = b?.chapters.find((x) => x.n === w.chapter);
    return `${books.length > 1 ? `${esc(b?.title ?? w.book)} · ` : ""}Capítulo ${w.chapter}${c ? ` · ${esc(c.title)}` : ""}`;
  };
  const marked = (w) => w.sentence.split(" ").map((t, k) => (w.k.includes(k) ? `<mark>${esc(t)}</mark>` : esc(t))).join(" ");

  function list() {
    const mine = store.words.filter((w) => !book || w.book === book.id);
    const query = fold($(".search").value.trim());
    const shown = mine
      .filter((w) => !query || [w.en, w.base, w.es, w.note, w.sentence].some((x) => fold(x).includes(query)))
      .sort((a, b) => b.saved - a.saved);
    $(".top-title small").textContent = `${mine.length} ${mine.length === 1 ? "guardada" : "guardadas"}`;
    $(".word-list").innerHTML = shown.map((w) => `
      <li><a href="#/${w.book}/${w.chapter}/${w.at[0]}">
        <span class="word-en" lang="en">${esc(w.en)}</span>
        ${w.base ? `<span class="word-base"><span>forma base</span> <b lang="en">${esc(w.base)}</b></span>` : ""}
        ${w.es ? `<span class="word-es" lang="es">${esc(w.es)}</span>` : ""}
        ${w.note ? `<span class="word-note">${esc(w.note)}</span>` : ""}
        <span class="word-sentence" lang="en">${marked(w)}</span>
        <small class="word-where">${where(w)}</small>
      </a><button class="icon remove" data-key="${esc(wordKey(w))}" aria-label="Quitar">${icon("close")}</button></li>`).join("");
    $(".empty").hidden = shown.length > 0;
    $(".empty").innerHTML = mine.length
      ? `Ninguna palabra coincide con «${esc($(".search").value.trim())}».`
      : `Aún no has guardado palabras. Mientras lees, toca una palabra y luego el marcador ${icon("save")} de la ventana.`;
  }
  list();

  $(".search").addEventListener("input", list);
  $(".word-list").addEventListener("click", (e) => {
    const b = e.target.closest(".remove");
    if (!b) return;
    const w = store.words.find((x) => wordKey(x) === b.dataset.key);
    if (!confirm(`¿Quitar «${w.en}» de tus palabras?`)) return;
    store.words.splice(store.words.indexOf(w), 1);
    save();
    list();
  });

  // Copies: a JSON file with all the saved words. Importing adds the words that are not in the list yet.
  $(".export").addEventListener("click", () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ words: store.words }, null, 1)], { type: "application/json" }));
    a.download = `mis-palabras-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $(".import input").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const words = Array.isArray(data) ? data : data?.words;
      if (!Array.isArray(words)) throw new Error();
      const have = new Set(store.words.map(wordKey));
      const added = words.filter((w) => w?.book && w.chapter && Array.isArray(w.at) && Array.isArray(w.k)
        && typeof w.sentence === "string" && typeof w.en === "string" && !have.has(wordKey(w)));
      store.words.push(...added);
      save();
      list();
      $(".backup output").textContent = added.length === 1 ? "1 palabra nueva importada." : `${added.length} palabras nuevas importadas.`;
    } catch {
      $(".backup output").textContent = "Este archivo no es una copia de Mis palabras.";
    }
  });
}

// target: the index of a word to show (from the word list), or -1. Showing a word does not move the audio.
function showReader(book, chapter, target) {
  document.title = `${chapter.title} · ${book.title}`;
  const p = progress(book.id);
  if (target < 0) {
    p.chapter = chapter.n;
    save();
  }

  view.innerHTML = `
    <header class="top">
      <a class="icon" href="${target < 0 ? `#/${book.id}` : wordsFrom}" aria-label="Volver">${icon("back")}</a>
      <div class="top-title"><small>Capítulo ${chapter.n}</small><span>${esc(chapter.title)}</span></div>
      <span class="remaining"></span>
    </header>
    <p class="playback-error" role="status" hidden></p>
    <article class="text" lang="en"><p class="muted">Cargando…</p></article>
    <div class="pop" role="dialog" aria-label="Ayuda" hidden>
      <div class="pop-head">
        <div class="pop-word" lang="en"></div>
        <div class="pop-base"><span>forma base</span> <b lang="en"></b></div>
        <button class="icon pop-save"></button>
        <button class="icon pop-close" aria-label="Cerrar ayuda" title="Cerrar">${icon("close")}</button>
      </div>
      <div class="pop-gloss" lang="es"></div>
      <p class="pop-note" lang="es"></p>
      <label class="pop-mine"><span>Tu nota</span><textarea rows="2" placeholder="Escribe aquí…"></textarea></label>
      <button class="pop-more" aria-expanded="false">${icon("more")}<span>Ver la frase entera</span></button>
      <p class="pop-sentence" lang="es" hidden></p>
      <button class="button primary pop-play">${icon("play")}Escuchar desde aquí</button>
    </div>
    <button class="mark" hidden aria-label="Volver a la lectura"></button>
    <footer class="player">
      <button class="pill" hidden></button>
      <div class="controls">
        <button class="chip rate" aria-label="Velocidad" aria-haspopup="menu" aria-expanded="false"></button>
        <button class="icon play" aria-label="Reproducir">${icon("play")}</button>
        <div class="end">
          <button class="chip gloss" aria-label="Traducción entre líneas" title="Traducción entre líneas" aria-pressed="false">ES</button>
          <button class="chip look" aria-label="Texto y tema" aria-haspopup="dialog" aria-expanded="false">Aa</button>
        </div>
        <div class="panel rates" role="menu" aria-label="Velocidad" hidden>
          ${RATES.map((r) => `<button role="menuitemradio" data-rate="${r}">${r}×</button>`).join("")}
        </div>
        <div class="panel looks" role="dialog" aria-label="Texto y tema" hidden>
          <div class="row">
            <span>Tamaño</span>
            <div class="seg stepper">
              <button data-step="-1" aria-label="Letra más pequeña">A</button><output></output><button data-step="1" aria-label="Letra más grande">A</button>
            </div>
          </div>
          <div class="row">
            <span>Letra</span>
            <div class="seg">${Object.entries(FONTS).map(([id, label]) => `<button data-font="${id}">${label}</button>`).join("")}</div>
          </div>
          <div class="themes">${Object.entries(THEMES).map(([id, label]) => `
            <button data-pick-theme="${id}"><span class="swatch" data-theme="${id}">Aa</span>${label}</button>`).join("")}
          </div>
        </div>
      </div>
    </footer>`;

  const $ = (selector) => view.querySelector(selector);
  const header = $(".top"), article = $(".text"), player = $(".player"), pill = $(".pill"), mark = $(".mark");
  const pop = $(".pop"), playButton = $(".play"), remaining = $(".remaining");

  const words = []; // { el, s, e, sentence, k (its number in the sentence) }
  const sentences = []; // { el, first (index of its first word) }
  let translation = null; // for each sentence: { es, units: [{ t: [k...], es, note }] } or null
  let current = -1; // index of the highlighted word
  let picked = []; // indexes of the words outlined by the open popup
  let popUnit = null; // the unit of the open popup
  let listenedTo = null; // the play head time before the open popup moved it, or null
  let follow = true; // scroll the page with the audio
  let ready = false; // audio is at the saved position, so progress can be saved
  let frame = 0;
  let lastSave = 0;

  const signal = new AbortController();
  const on = (target, type, fn, options = {}) => target.addEventListener(type, fn, { ...options, signal: signal.signal });

  fetchJSON(chapter.data, { signal: signal.signal }).then((data) => {
    if (signal.signal.aborted) return;
    render(data);
    const loaded = new Promise((resolve) => {
      on(audio, "loadedmetadata", resolve, { once: true });
      on(audio, "error", resolve, { once: true });
    });
    on(audio, "loadedmetadata", () => {
      const saved = p.chapters[chapter.n];
      seek(saved && !saved.done ? saved.time : 0, "instant");
      ready = true;
      if (autoplay) play();
      autoplay = false;
    }, { once: true });
    audio.src = data.audio;
    audio.defaultPlaybackRate = audio.playbackRate = store.settings.rate;
    const translated = data.translation ? fetchJSON(data.translation, { signal: signal.signal })
      .then((t) => { translation = t; addGlosses(); }).catch(() => null) : null;
    // Opened from the word list: show the word and its popup. The audio stays at the saved position.
    if (words[target]) Promise.all([loaded, translated]).then(() => {
      if (signal.signal.aborted) return;
      follow = false;
      reveal(words[target].el, "instant");
      openPop(target);
      updatePill();
    });
  }).catch(() => {
    if (signal.signal.aborted) return;
    autoplay = false;
    article.lang = "es";
    loadError(article, "Este capítulo no está disponible. Comprueba tu conexión.");
  });

  function render(data) {
    article.textContent = "";
    for (const block of data.blocks) {
      const blockEl = document.createElement({ h: "h2", p: "p", break: "hr" }[block.type]);
      for (const sentence of block.sentences) {
        const sentenceEl = document.createElement("span");
        sentenceEl.className = "s";
        sentences.push({ el: sentenceEl, first: words.length });
        for (const [k, [text, s, e]] of sentence.entries()) {
          const wordEl = document.createElement("span");
          wordEl.className = "w";
          wordEl.textContent = text;
          wordEl.dataset.i = words.length;
          words.push({ el: wordEl, s, e, sentence: sentences.length - 1, k });
          sentenceEl.append(wordEl, " ");
        }
        blockEl.append(sentenceEl);
      }
      article.append(blockEl);
    }
    article.append(marks);
    layoutMarks();
  }

  // Translation between the lines (the gloss setting). Each unit becomes a column, the English over the Spanish,
  // and each sentence starts a line (style.css). A unit with a gap, as "looked … up", has its Spanish under its
  // part with the most letters. The Spanish of the first unit starts with a capital, as the English does.
  function addGlosses() {
    const letters = (run) => run.reduce((sum, i) => sum + trim(words[i].el.textContent).length, 0);
    translation.forEach((entry, s) => {
      const { first } = sentences[s] ?? {};
      if (!entry || first === undefined) return;
      const capital = /^\P{L}*\p{Lu}/u.test(words[first].el.textContent);
      for (const unit of entry.units) {
        const at = unit.t.map((k) => first + k).sort((a, b) => a - b);
        const runs = at.reduce((out, i, n) => (n && i === at[n - 1] + 1 ? out.at(-1).push(i) : out.push([i]), out), []);
        const run = runs.reduce((best, r) => (letters(r) > letters(best) ? r : best));
        const column = document.createElement("span");
        column.className = "u";
        words[run[0]].el.before(column);
        for (let node = words[run[0]].el, last = words[run.at(-1)].el; ;) {
          const next = node.nextSibling;
          column.append(node);
          if (node === last) break;
          node = next;
        }
        const gloss = document.createElement("span");
        gloss.className = "g";
        gloss.lang = "es";
        gloss.dataset.i = at[0];
        gloss.textContent = capital && at[0] === first ? unit.es.replace(/\p{L}/u, (c) => c.toUpperCase()) : unit.es;
        column.append(gloss);
      }
    });
  }

  // Saved units: a ring around each run of words on one line, and the note in a bubble beside the text. The
  // bubbles show only on wide screens (style.css). A bubble moves down when the one above it is in the way.
  const marks = document.createElement("div");
  marks.className = "marks";
  function layoutMarks() {
    marks.textContent = "";
    const origin = article.getBoundingClientRect();
    const rings = (at) => at.reduce((out, i, n) => {
      const r = words[i].el.getBoundingClientRect(), last = out.at(-1);
      if (last && at[n - 1] === i - 1 && Math.abs(last.top - r.top) < 2) last.right = r.right;
      else out.push({ top: r.top, bottom: r.bottom, left: r.left, right: r.right });
      return out;
    }, []);
    const saved = store.words
      .filter((w) => w.book === book.id && w.chapter === chapter.n && w.at.every((i) => words[i]))
      .map((w) => ({ w, rings: rings(w.at) }))
      .sort((a, b) => a.rings[0].top - b.rings[0].top);
    let free = -Infinity; // the top of the free space under the last bubble
    for (const { w, rings } of saved) {
      for (const r of rings) {
        const ring = document.createElement("i");
        Object.assign(ring.style, {
          top: `${r.top - origin.top}px`, left: `${r.left - origin.left}px`,
          width: `${r.right - r.left}px`, height: `${r.bottom - r.top}px`,
        });
        marks.append(ring);
      }
      if (!w.note.trim()) continue;
      const bubble = document.createElement("button");
      bubble.className = "bubble";
      bubble.dataset.i = w.at[0];
      bubble.textContent = w.note;
      bubble.style.top = `${Math.max(rings[0].top - origin.top, free + 8)}px`;
      marks.append(bubble);
      free = bubble.offsetTop + bubble.offsetHeight;
    }
  }
  const resized = new ResizeObserver(() => layoutMarks());
  resized.observe(article);
  // A font that arrives late moves the words, but often not the size of the text.
  on(document.fonts, "loadingdone", () => layoutMarks());

  // Time -> word

  // A jump to a word starts PREROLL before it, so a word starts that much earlier here.
  function wordAt(t) {
    let lo = 0, hi = words.length - 1, found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (words[mid].s <= t + PREROLL + 0.01) { found = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return found;
  }

  function highlight(i) {
    if (i === current) return;
    const before = words[current], now = words[i];
    if (before) {
      before.el.classList.remove("on");
      sentences[before.sentence].el.classList.remove("on");
    }
    if (now) {
      now.el.classList.add("on");
      sentences[now.sentence].el.classList.add("on");
    }
    current = i;
    updatePill();
  }

  function sync() {
    const t = audio.currentTime, i = wordAt(t);
    if (i !== current) {
      highlight(i);
      if (follow && words[i]) reveal(words[i].el, "smooth");
    }
    showTime(t);
  }

  function showTime(t) {
    const text = `quedan ${minutes(chapter.duration - t)}`;
    if (remaining.textContent !== text) remaining.textContent = text;
  }

  // Scrolling: keep the current word in the upper part of the space between the header and the player

  function band() {
    const top = header.getBoundingClientRect().bottom;
    const bottom = (narrow.matches && !pop.hidden ? pop : player).getBoundingClientRect().top;
    return { top, bottom, height: bottom - top };
  }

  function reveal(el, behavior) {
    const r = el.getBoundingClientRect(), b = band();
    if (r.top >= b.top + b.height * 0.1 && r.bottom <= b.top + b.height * 0.75) return;
    window.scrollTo({ top: window.scrollY + r.top - b.top - b.height * 0.3, behavior });
  }

  // When the reading position is off screen: a pill above the player, and a mark beside the scrollbar
  // at the place where the scrollbar thumb would show the reading position.
  function updatePill() {
    const el = words[current]?.el;
    let away = false;
    if (el && !follow) {
      const r = el.getBoundingClientRect(), b = band();
      away = r.bottom <= b.top || r.top >= b.bottom;
      if (away) {
        pill.textContent = `${r.top < b.top ? "↑" : "↓"} Volver a la lectura`;
        const y = ((window.scrollY + r.top + r.height / 2) / document.documentElement.scrollHeight) * window.innerHeight;
        mark.style.top = `${clamp(y, 16, window.innerHeight - 16)}px`;
      }
    }
    pill.hidden = mark.hidden = !away;
  }

  function stopFollow() {
    follow = false;
    updatePill();
  }

  function startFollow() {
    follow = true;
    if (words[current]) reveal(words[current].el, "smooth");
    updatePill();
  }

  // Playback

  function playbackError() {
    const message = $(".playback-error");
    message.textContent = navigator.onLine
      ? "No se pudo cargar el audio. Pulsa reproducir para reintentar."
      : "Conéctate para escuchar el audio.";
    message.hidden = false;
  }

  function play() {
    closePop();
    startFollow();
    if (audio.error) {
      // Keep the current position when retrying after a network failure.
      const time = ready ? audio.currentTime : (p.chapters[chapter.n]?.time ?? 0);
      on(audio, "loadedmetadata", () => seek(time, "instant"), { once: true });
      audio.load();
    }
    audio.play().catch((error) => {
      if (!signal.signal.aborted && error.name !== "AbortError") playbackError();
    });
  }

  function seek(t, behavior = "smooth") {
    t = clamp(t, 0, chapter.duration);
    audio.currentTime = t;
    listenedTo = null;
    follow = true;
    highlight(wordAt(t));
    showTime(t);
    if (words[current]) reveal(words[current].el, behavior);
    updatePill();
  }

  const toggle = () => (audio.paused ? play() : audio.pause());

  function saveProgress(force) {
    if (!ready) return;
    const now = performance.now();
    if (!force && now - lastSave < 2000) return;
    lastSave = now;
    const t = audio.currentTime;
    p.chapters[chapter.n] = { time: Math.round(t * 10) / 10, done: t >= chapter.duration - 3 };
    save();
  }

  function tick() {
    sync();
    frame = requestAnimationFrame(tick);
  }

  function setPlaying(playing) {
    playButton.innerHTML = icon(playing ? "pause" : "play");
    playButton.setAttribute("aria-label", playing ? "Pausa" : "Reproducir");
    cancelAnimationFrame(frame);
    if (playing) frame = requestAnimationFrame(tick);
  }

  on(audio, "play", () => {
    $(".playback-error").hidden = true;
    setPlaying(true);
    if (p.chapter !== chapter.n) { p.chapter = chapter.n; save(); }
  });
  on(audio, "pause", () => { setPlaying(false); saveProgress(true); });
  on(audio, "error", playbackError);
  on(audio, "seeked", sync);
  on(audio, "timeupdate", () => saveProgress(false));
  on(audio, "ended", () => {
    p.chapters[chapter.n] = { time: chapter.duration, done: true };
    save();
    const next = book.chapters.find((c) => c.n === chapter.n + 1);
    if (next) {
      autoplay = true;
      location.hash = `#/${book.id}/${next.n}`;
    }
  });

  // Controls

  on(playButton, "click", toggle);
  on(pill, "click", startFollow);
  on(mark, "click", startFollow);

  // Speed menu and text and theme panel

  const panels = [[$(".rate"), $(".rates")], [$(".look"), $(".looks")]];
  function togglePanel(k) {
    panels.forEach(([button, panel], j) => {
      const open = j === k && panel.hidden;
      panel.hidden = !open;
      button.setAttribute("aria-expanded", open);
    });
  }
  const closePanels = () => togglePanel(-1);
  panels.forEach(([button], k) => on(button, "click", () => togglePanel(k)));
  on(document, "click", (e) => {
    if (!e.target.closest(".panel, .rate, .look")) closePanels();
  });

  function showSettings() {
    const { rate, size, font, theme } = store.settings;
    $(".rate").textContent = `${rate}×`;
    for (const b of view.querySelectorAll("[data-rate]")) b.setAttribute("aria-checked", Number(b.dataset.rate) === rate);
    for (const b of view.querySelectorAll("[data-font]")) b.setAttribute("aria-pressed", b.dataset.font === font);
    for (const b of view.querySelectorAll("[data-pick-theme]")) b.setAttribute("aria-pressed", b.dataset.pickTheme === theme);
    $(".gloss").setAttribute("aria-pressed", store.settings.gloss);
    $(".stepper output").textContent = `${Math.round(size * 100)}%`;
    $('[data-step="-1"]').disabled = size <= SIZES[0];
    $('[data-step="1"]').disabled = size >= SIZES.at(-1);
  }
  showSettings();

  function changeSettings(change) {
    // Keep the same words at the same place on the screen when the text size or font changes.
    const anchor = follow && words[current] ? words[current].el : firstVisibleWord();
    const before = anchor?.getBoundingClientRect().top;
    change(store.settings);
    save();
    applySettings();
    showSettings();
    if (anchor) window.scrollTo(0, window.scrollY + anchor.getBoundingClientRect().top - before);
  }

  function firstVisibleWord() {
    const top = band().top;
    let lo = 0, hi = words.length - 1, found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (words[mid].el.getBoundingClientRect().bottom > top) { found = mid; hi = mid - 1; } else lo = mid + 1;
    }
    return words[found]?.el;
  }

  on($(".gloss"), "click", () => {
    changeSettings((s) => (s.gloss = !s.gloss));
    if (!pop.hidden) placePop();
  });

  on($(".rates"), "click", (e) => {
    const b = e.target.closest("[data-rate]");
    if (!b) return;
    changeSettings((s) => (s.rate = Number(b.dataset.rate)));
    audio.playbackRate = audio.defaultPlaybackRate = store.settings.rate;
    closePanels();
  });

  on($(".looks"), "click", (e) => {
    const b = e.target.closest("button");
    if (b?.dataset.step) {
      // The nearest size step, so a size saved by an older version still works.
      const at = SIZES.reduce((best, x, k) => (Math.abs(x - store.settings.size) < Math.abs(SIZES[best] - store.settings.size) ? k : best), 0);
      changeSettings((s) => (s.size = SIZES[clamp(at + Number(b.dataset.step), 0, SIZES.length - 1)]));
    } else if (b?.dataset.font) changeSettings((s) => (s.font = b.dataset.font));
    else if (b?.dataset.pickTheme) changeSettings((s) => (s.theme = b.dataset.pickTheme));
  });

  on(document, "keydown", (e) => {
    if (e.target.closest("input, textarea") && e.key !== "Escape") return;
    if (e.key === " " && !e.target.closest("button")) { e.preventDefault(); toggle(); }
    else if (e.key === "Escape") { closePop(); closePanels(); }
    else if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(e.key)) stopFollow();
  });

  // The user scrolls the text: stop following the audio until they ask for it again.
  on(window, "wheel", stopFollow, { passive: true });
  on(window, "touchmove", stopFollow, { passive: true });
  on(window, "scroll", updatePill, { passive: true });
  on(window, "resize", () => {
    updatePill();
    if (!pop.hidden) placePop();
  });

  // Word popup

  on($(".pop-close"), "click", closePop);
  on(article, "click", (e) => {
    const el = e.target.closest(".w, .bubble, .g");
    if (el) lookUp(Number(el.dataset.i));
  });
  on(document, "click", (e) => {
    // The path at the time of the click: a click can replace its own target, as the bookmark icon does.
    // The player stays usable with the popup open. Its play button closes the popup.
    if (!pop.hidden && !e.composedPath().includes(pop) && !e.target.closest(".w, .bubble, .g, .player")) closePop();
  });
  on($(".pop-play"), "click", () => {
    const i = Number(pop.dataset.word);
    closePop();
    seek(words[i].s - PREROLL);
    play();
  });
  on($(".pop-more"), "click", (e) => {
    const sentence = $(".pop-sentence");
    sentence.hidden = !sentence.hidden;
    e.currentTarget.setAttribute("aria-expanded", !sentence.hidden);
    e.currentTarget.querySelector("span").textContent = sentence.hidden ? "Ver la frase entera" : "Ocultar la frase";
    placePop(true);
  });

  // Save the unit to the word list, or remove it.
  on($(".pop-save"), "click", () => {
    const i = Number(pop.dataset.word), mine = savedAt(book.id, chapter.n, i);
    if (mine) {
      store.words.splice(store.words.indexOf(mine), 1);
    } else {
      const w = {
        book: book.id, chapter: chapter.n, at: [...picked], k: picked.map((j) => words[j].k),
        sentence: words.filter((x) => x.sentence === words[i].sentence).map((x) => x.el.textContent).join(" "),
        en: $(".pop-word").textContent, base: popUnit?.base, es: popUnit?.es, note: "", saved: Date.now(),
      };
      store.words.push(w);
    }
    save();
    showSaved(i);
    placePop();
    layoutMarks();
    if (!mine) $(".pop-mine textarea").focus({ preventScroll: true }); // just saved: ask for a note
  });
  on($(".pop-mine"), "input", (e) => {
    const mine = savedAt(book.id, chapter.n, Number(pop.dataset.word));
    if (mine) { mine.note = e.target.value; save(); layoutMarks(); placePop(); } // the field grows with the note
  });

  function showSaved(i) {
    const mine = savedAt(book.id, chapter.n, i), button = $(".pop-save");
    const label = mine ? "Quitar de mis palabras" : "Guardar en mis palabras";
    button.innerHTML = icon(mine ? "saved" : "save");
    button.setAttribute("aria-pressed", !!mine);
    button.setAttribute("aria-label", label);
    button.title = label;
    $(".pop-mine").hidden = !mine;
    $(".pop-mine textarea").value = mine?.note ?? "";
  }

  const trim = (text) => text.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  // Notes mark English words as *word*.
  const rich = (text) => esc(text).replace(/\*(.+?)\*/g, "<i lang=\"en\">$1</i>");

  // A tap on a word: pause, show the popup, and put the play head where play should continue. The place is
  // found from the play head before the popup opened, so more taps do not move it again and again.
  function lookUp(i) {
    const from = listenedTo ?? audio.currentTime;
    openPop(i);
    if (pop.hidden) return;
    audio.pause();
    stopFollow();
    if (!ready) return;
    listenedTo = from;
    const head = wordAt(from), first = Math.min(...picked), { first: start } = sentences[words[first].sentence];
    const heard = first <= head && words[first].sentence >= words[head].sentence - 1;
    const ahead = first > head && first - head <= AHEAD;
    const t = heard ? words[first - start <= RESTART ? start : first - 1].s - PREROLL : from;
    if (Math.abs(audio.currentTime - t) > 0.01) {
      audio.currentTime = Math.max(0, t);
      highlight(wordAt(t));
      showTime(t);
    }
    $(".pop-play").hidden = heard || ahead;
    placePop(true);
  }

  function openPop(i) {
    closePop();
    if (!trim(words[i].el.textContent)) return; // "–", "…": nothing to explain
    const { sentence, k } = words[i], entry = translation?.[sentence];
    sentences[sentence].el.classList.add("look");
    const unit = (popUnit = entry?.units.find((u) => u.t.includes(k)));
    const first = sentences[sentence].first;
    picked = unit ? unit.t.map((t) => first + t) : [i];
    for (const j of picked) words[j].el.classList.add("picked");
    // The words of the unit; "…" marks a gap, as in "looked … up".
    $(".pop-word").textContent = trim(picked
      .map((j, n) => (n && j !== picked[n - 1] + 1 ? "… " : "") + words[j].el.textContent)
      .join(" "));
    $(".pop-base b").textContent = unit?.base ?? "";
    $(".pop-base").hidden = !unit?.base;
    $(".pop-gloss").textContent = unit?.es ?? "";
    $(".pop-note").innerHTML = unit?.note ? rich(unit.note) : "";
    $(".pop-sentence").innerHTML = translationHTML(entry?.es ?? "", unit?.es);
    $(".pop-sentence").hidden = true;
    // When the unit is the whole sentence, the sentence translation only repeats the gloss.
    const end = sentences[sentence + 1]?.first ?? words.length;
    const whole = words.slice(first, end).every((w, n) => picked.includes(first + n) || !trim(w.el.textContent));
    $(".pop-more").hidden = !entry || whole;
    $(".pop-more").setAttribute("aria-expanded", false);
    $(".pop-more span").textContent = "Ver la frase entera";
    $(".pop-play").hidden = false;
    pop.dataset.word = i;
    showSaved(i);
    pop.hidden = false;
    placePop(true);
  }

  // Narrow screens: a full-width panel on top of the player, as tall as its content. Pinned (pin), the page
  // scrolls so that the bottom of the sentence touches the top of the panel, but never so far that the unit goes
  // under the header. Where the page cannot scroll so far, the panel grows up to the sentence.
  // Else: below the unit if it fits above the player, else above it. Centred on the tapped word.
  // A word with its column, so that a popup does not cover the Spanish under it
  const unitBox = (j) => (words[j].el.closest(".u") ?? words[j].el).getBoundingClientRect();
  function placePop(pin = false) {
    if (narrow.matches) {
      const gap = 8, top = header.getBoundingClientRect().bottom, bottom = player.getBoundingClientRect().top;
      const rects = picked.map(unitBox);
      const unitTop = Math.min(...rects.map((r) => r.top)), unitBottom = Math.max(...rects.map((r) => r.bottom));
      // While the reader types a note, the panel can use all the space.
      const typing = pop.contains(document.activeElement);
      const room = bottom - top - (typing ? 0 : unitBottom - unitTop + 2 * gap);
      pop.style.left = pop.style.top = "";
      pop.style.bottom = `${window.innerHeight - bottom}px`;
      pop.style.maxHeight = `${room}px`;
      if (!pin) return;
      pop.style.minHeight = `${Math.min(room, window.innerHeight * 0.3)}px`;
      const height = pop.offsetHeight;
      const space = bottom - gap - sentences[words[pop.dataset.word].sentence].el.getBoundingClientRect().bottom;
      const shift = Math.max(-window.scrollY, Math.min(height - space, unitTop - top - gap));
      pop.style.minHeight = `${clamp(space + shift, height, bottom - top)}px`;
      if (Math.abs(shift) > 1) window.scrollTo({ top: window.scrollY + shift, behavior: "smooth" });
      return;
    }
    pop.style.bottom = pop.style.minHeight = pop.style.maxHeight = "";
    const rects = picked.map(unitBox), b = band();
    const r = words[pop.dataset.word].el.getBoundingClientRect();
    const top = Math.min(...rects.map((x) => x.top)), bottom = Math.max(...rects.map((x) => x.bottom));
    const below = bottom + 8 + pop.offsetHeight < b.bottom;
    const x = clamp(r.left + r.width / 2 - pop.offsetWidth / 2, 8, window.innerWidth - pop.offsetWidth - 8);
    const y = below ? bottom + 8 : Math.max(b.top + 8, top - pop.offsetHeight - 8);
    pop.style.left = `${x + window.scrollX}px`;
    pop.style.top = `${y + window.scrollY}px`;
  }

  function closePop() {
    for (const j of picked) words[j].el.classList.remove("picked");
    view.querySelector(".s.look")?.classList.remove("look");
    picked = [];
    listenedTo = null;
    pop.hidden = true;
  }

  // Lock screen and media keys

  const media = navigator.mediaSession;
  const actions = {
    play,
    pause: () => audio.pause(),
    seekbackward: () => seek(audio.currentTime - 15),
    seekforward: () => seek(audio.currentTime + 15),
    seekto: (details) => seek(details.seekTime),
  };
  if (media) {
    media.metadata = new MediaMetadata({
      title: `${chapter.n}. ${chapter.title}`,
      artist: `${book.author} · narrado por ${book.narrator}`,
      album: book.title,
      artwork: [{ src: new URL(book.cover, location.href).href }],
    });
    for (const [action, fn] of Object.entries(actions)) {
      try { media.setActionHandler(action, fn); } catch {}
    }
  }

  on(window, "pagehide", () => saveProgress(true));
  on(document, "visibilitychange", () => document.hidden && saveProgress(true));

  return () => {
    saveProgress(true);
    signal.abort();
    resized.disconnect();
    cancelAnimationFrame(frame);
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    if (media) for (const action of Object.keys(actions)) {
      try { media.setActionHandler(action, null); } catch {}
    }
  };
}
