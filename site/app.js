const STORE_KEY = "audiobook:v1";
const RATES = [0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
const SIZES = [0.8, 0.9, 1, 1.1, 1.2, 1.35, 1.5, 1.7, 1.9];
const FONTS = { serif: "Clásica", sans: "Moderna" };
// The colours of each theme are in style.css. "auto" follows the system: paper or night.
const THEMES = { auto: "Auto", paper: "Papel", sepia: "Sepia", white: "Blanco", night: "Noche", slate: "Pizarra", black: "Negro" };
const DEFAULTS = { rate: 1, size: 1, font: "serif", theme: "auto" };
const PREROLL = 0.05; // seconds: start a little before a word when jumping to it

const ICONS = {
  back: "M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z",
  play: "M8 5v14l11-7z",
  pause: "M6 5h4v14H6zm8 0h4v14h-4z",
};
const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

const minutes = (seconds) => `${Math.max(1, Math.round(seconds / 60))} min`;

// Storage: { books: { [id]: { chapter, chapters: { [n]: { time, done } } } }, settings: { rate, size, font, theme } }

const store = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    if (saved?.books) return { books: saved.books, settings: { ...DEFAULTS, ...saved.settings } };
  } catch {}
  return { books: {}, settings: { ...DEFAULTS } };
})();
const save = () => localStorage.setItem(STORE_KEY, JSON.stringify(store));
const progress = (bookId) => (store.books[bookId] ??= { chapter: 1, chapters: {} });
const listened = (book) => {
  const p = store.books[book.id]?.chapters ?? {};
  return book.chapters.reduce((sum, c) => sum + (p[c.n]?.done ? c.duration : Math.min(p[c.n]?.time ?? 0, c.duration)), 0);
};
const total = (book) => book.chapters.reduce((sum, c) => sum + c.duration, 0);

const systemDark = matchMedia("(prefers-color-scheme: dark)");

function applySettings() {
  const { theme, font, size } = store.settings, root = document.documentElement;
  root.dataset.theme = theme === "auto" ? (systemDark.matches ? "night" : "paper") : theme;
  root.dataset.font = font;
  root.style.setProperty("--text-scale", size);
  document.querySelector('meta[name="theme-color"]').content = getComputedStyle(root).getPropertyValue("--bg");
}
applySettings();
systemDark.addEventListener("change", applySettings);

const view = document.getElementById("view");
const audio = document.getElementById("audio");
const library = await fetch("library.json").then((r) => r.json());

// Routing: #/ (library), #/<book> (chapters), #/<book>/<n> (reader)

let leave = () => {};
let autoplay = false;

function route() {
  leave();
  leave = () => {};
  const [bookId, n] = location.hash.slice(2).split("/");
  const book = library.find((b) => b.id === bookId);
  const chapter = book?.chapters.find((c) => c.n === Number(n));
  window.scrollTo(0, 0);
  if (chapter) leave = showReader(book, chapter);
  else if (book) showBook(book);
  else showLibrary();
}
window.addEventListener("hashchange", route);
route();

function showLibrary() {
  document.title = "Audiolibros";
  view.innerHTML = `
    <header class="top"><h1>Biblioteca</h1></header>
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
    </div>`;
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

function showReader(book, chapter) {
  document.title = `${chapter.title} · ${book.title}`;
  const p = progress(book.id);
  p.chapter = chapter.n;
  save();

  view.innerHTML = `
    <header class="top">
      <a class="icon" href="#/${book.id}" aria-label="Capítulos">${icon("back")}</a>
      <div class="top-title"><small>Capítulo ${chapter.n}</small><span>${esc(chapter.title)}</span></div>
      <span class="remaining"></span>
    </header>
    <article class="text" lang="en"><p class="muted">Cargando…</p></article>
    <div class="pop" role="dialog" hidden>
      <div class="pop-word" lang="en"></div>
      <div class="pop-base" lang="en"></div>
      <div class="pop-gloss" lang="es"></div>
      <p class="pop-note" lang="es"></p>
      <p class="pop-sentence" lang="es" hidden></p>
      <div class="pop-actions">
        <button class="button primary pop-play">${icon("play")}Escuchar desde aquí</button>
        <button class="button pop-more" aria-expanded="false">Frase</button>
      </div>
    </div>
    <button class="mark" hidden aria-label="Volver a la lectura"></button>
    <footer class="player">
      <button class="pill" hidden></button>
      <div class="controls">
        <button class="chip rate" aria-label="Velocidad" aria-haspopup="menu" aria-expanded="false"></button>
        <button class="icon play" aria-label="Reproducir">${icon("play")}</button>
        <button class="chip look" aria-label="Texto y tema" aria-haspopup="dialog" aria-expanded="false">Aa</button>
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
  let follow = true; // scroll the page with the audio
  let ready = false; // audio is at the saved position, so progress can be saved
  let frame = 0;
  let lastSave = 0;

  const signal = new AbortController();
  const on = (target, type, fn, options = {}) => target.addEventListener(type, fn, { ...options, signal: signal.signal });

  fetch(chapter.data).then((r) => r.json()).then((data) => {
    if (signal.signal.aborted) return;
    render(data);
    on(audio, "loadedmetadata", () => {
      const saved = p.chapters[chapter.n];
      seek(saved && !saved.done ? saved.time : 0, "instant");
      ready = true;
      if (autoplay) play();
      autoplay = false;
    }, { once: true });
    audio.src = data.audio;
    audio.defaultPlaybackRate = audio.playbackRate = store.settings.rate;
    if (data.translation) fetch(data.translation).then((r) => r.json()).then((t) => (translation = t));
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
  }

  // Time -> word

  function wordAt(t) {
    let lo = 0, hi = words.length - 1, found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (words[mid].s <= t) { found = mid; lo = mid + 1; } else hi = mid - 1;
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
    const top = header.getBoundingClientRect().bottom, bottom = player.getBoundingClientRect().top;
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

  function play() {
    startFollow();
    audio.play().catch(() => {});
  }

  function seek(t, behavior = "smooth") {
    t = clamp(t, 0, chapter.duration);
    audio.currentTime = t;
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

  on(audio, "play", () => setPlaying(true));
  on(audio, "pause", () => { setPlaying(false); saveProgress(true); });
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
    if (e.target.closest("input")) return;
    if (e.key === " " && !e.target.closest("button")) { e.preventDefault(); toggle(); }
    else if (e.key === "Escape") { closePop(); closePanels(); }
    else if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(e.key)) stopFollow();
  });

  // The user scrolls the text: stop following the audio until they ask for it again.
  on(window, "wheel", stopFollow, { passive: true });
  on(window, "touchmove", stopFollow, { passive: true });
  on(window, "scroll", updatePill, { passive: true });
  on(window, "resize", updatePill);

  // Word popup

  on(article, "click", (e) => {
    const el = e.target.closest(".w");
    if (el) openPop(Number(el.dataset.i));
  });
  on(document, "click", (e) => {
    if (!pop.hidden && !pop.contains(e.target) && !e.target.closest(".w")) closePop();
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
    placePop();
  });

  const trim = (text) => text.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  // Notes mark English words as *word*.
  const rich = (text) => esc(text).replace(/\*(.+?)\*/g, "<i lang=\"en\">$1</i>");

  function openPop(i) {
    closePop();
    if (!trim(words[i].el.textContent)) return; // "–", "…": nothing to explain
    const { sentence, k } = words[i], entry = translation?.[sentence];
    const unit = entry?.units.find((u) => u.t.includes(k));
    const first = sentences[sentence].first;
    picked = unit ? unit.t.map((t) => first + t) : [i];
    for (const j of picked) words[j].el.classList.add("picked");
    // The words of the unit; "…" marks a gap, as in "looked … up".
    $(".pop-word").textContent = trim(picked
      .map((j, n) => (n && j !== picked[n - 1] + 1 ? "… " : "") + words[j].el.textContent)
      .join(" "));
    $(".pop-base").textContent = unit?.base ? `→ ${unit.base}` : "";
    $(".pop-gloss").textContent = unit?.es ?? "";
    $(".pop-note").innerHTML = unit?.note ? rich(unit.note) : "";
    $(".pop-sentence").textContent = entry?.es ?? "";
    $(".pop-sentence").hidden = true;
    $(".pop-more").hidden = !entry;
    $(".pop-more").setAttribute("aria-expanded", false);
    pop.dataset.word = i;
    pop.hidden = false;
    placePop();
  }

  // Below the unit if it fits above the player, else above it. Centred on the tapped word.
  function placePop() {
    const rects = picked.map((j) => words[j].el.getBoundingClientRect()), b = band();
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
    picked = [];
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
    cancelAnimationFrame(frame);
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    if (media) for (const action of Object.keys(actions)) {
      try { media.setActionHandler(action, null); } catch {}
    }
  };
}
