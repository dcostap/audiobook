const STORE_KEY = "audiobook:v1";
const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2];
const SIZES = [0.85, 1, 1.15, 1.3, 1.5];
const PREROLL = 0.05; // seconds: start a little before a word when jumping to it

const ICONS = {
  back: "M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z",
  play: "M8 5v14l11-7z",
  pause: "M6 5h4v14H6zm8 0h4v14h-4z",
  prev: "M6 6h2v12H6zm3.5 6 8.5 6V6z",
  next: "M16 6h2v12h-2zM6 18l8.5-6L6 6z",
};
const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

function clock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
const minutes = (seconds) => `${Math.max(1, Math.round(seconds / 60))} min`;

// Storage: { books: { [id]: { chapter, chapters: { [n]: { time, done } } } }, settings: { rate, size } }

const store = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    if (saved?.books && saved?.settings) return saved;
  } catch {}
  return { books: {}, settings: { rate: 1, size: 1 } };
})();
const save = () => localStorage.setItem(STORE_KEY, JSON.stringify(store));
const progress = (bookId) => (store.books[bookId] ??= { chapter: 1, chapters: {} });
const listened = (book) => {
  const p = store.books[book.id]?.chapters ?? {};
  return book.chapters.reduce((sum, c) => sum + (p[c.n]?.done ? c.duration : Math.min(p[c.n]?.time ?? 0, c.duration)), 0);
};
const total = (book) => book.chapters.reduce((sum, c) => sum + c.duration, 0);

document.documentElement.style.setProperty("--text-scale", store.settings.size);

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
  document.title = "Audiobooks";
  view.innerHTML = `
    <header class="top"><h1>Library</h1></header>
    <div class="page">
      <ul class="books">${library.map((book) => `
        <li><a class="book-card" href="#/${book.id}">
          <img src="${book.cover}" alt="">
          <div>
            <h2>${esc(book.title)}</h2>
            <p>${esc(book.author)}</p>
            <p class="muted">Read by ${esc(book.narrator)} · ${book.chapters.length} ${book.chapters.length === 1 ? "chapter" : "chapters"} · ${minutes(total(book))}</p>
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
      <a class="icon" href="#/" aria-label="Library">${icon("back")}</a>
      <div class="top-title"><span>Library</span></div>
    </header>
    <div class="page">
      <section class="hero">
        <img src="${book.cover}" alt="">
        <div>
          <h1>${esc(book.title)}</h1>
          <p>${esc(book.author)}</p>
          <p class="muted">Read by ${esc(book.narrator)}</p>
          <a class="button primary" href="#/${book.id}/${current.n}">${icon("play")}${started ? "Continue" : "Start"} · Chapter ${current.n}</a>
        </div>
      </section>
      <ol class="chapters">${book.chapters.map((c) => {
        const state = p.chapters[c.n];
        const status = state?.done ? `<span class="done">✓ Done</span>`
          : state?.time > 5 ? `${minutes(c.duration - state.time)} left` : minutes(c.duration);
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
      <a class="icon" href="#/${book.id}" aria-label="Chapters">${icon("back")}</a>
      <div class="top-title"><small>Chapter ${chapter.n}</small><span>${esc(chapter.title)}</span></div>
    </header>
    <article class="text"><p class="muted">Loading…</p></article>
    <div class="pop" role="dialog" hidden>
      <div class="pop-word"></div>
      <button class="button primary pop-play">${icon("play")}Play from here</button>
    </div>
    <footer class="player">
      <button class="pill" hidden>Back to the reading position</button>
      <div class="scrub">
        <span class="time cur">0:00</span>
        <input type="range" min="0" max="${chapter.duration}" step="any" value="0" aria-label="Position">
        <span class="time left">-${clock(chapter.duration)}</span>
      </div>
      <div class="controls">
        <button class="chip rate" aria-label="Playback speed">${store.settings.rate}×</button>
        <div class="transport">
          <button class="icon prev" aria-label="Previous sentence">${icon("prev")}</button>
          <button class="icon play" aria-label="Play">${icon("play")}</button>
          <button class="icon next" aria-label="Next sentence">${icon("next")}</button>
        </div>
        <button class="chip size" aria-label="Text size">Aa</button>
      </div>
    </footer>`;

  const $ = (selector) => view.querySelector(selector);
  const header = $(".top"), article = $(".text"), player = $(".player"), pill = $(".pill");
  const pop = $(".pop"), range = $(".scrub input"), playButton = $(".play");

  const words = []; // { el, s, e, sentence }
  const sentences = []; // { el, first }
  let current = -1; // index of the highlighted word
  let picked = -1; // index of the word with the open popup
  let follow = true; // scroll the page with the audio
  let ready = false; // audio is at the saved position, so progress can be saved
  let dragging = false;
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
  });

  function render(data) {
    article.textContent = "";
    for (const block of data.blocks) {
      const blockEl = document.createElement({ h: "h2", p: "p", break: "hr" }[block.type]);
      for (const sentence of block.sentences) {
        const sentenceEl = document.createElement("span");
        sentenceEl.className = "s";
        sentences.push({ el: sentenceEl, first: words.length });
        for (const [text, s, e] of sentence) {
          const wordEl = document.createElement("span");
          wordEl.className = "w";
          wordEl.textContent = text;
          wordEl.dataset.i = words.length;
          words.push({ el: wordEl, s, e, sentence: sentences.length - 1 });
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
    if (!dragging) showTime(t);
  }

  function showTime(t) {
    range.value = t;
    range.style.setProperty("--p", `${(100 * t) / chapter.duration}%`);
    $(".cur").textContent = clock(t);
    $(".left").textContent = `-${clock(chapter.duration - t)}`;
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

  function updatePill() {
    const el = words[current]?.el;
    let visible = true;
    if (el && !follow) {
      const r = el.getBoundingClientRect(), b = band();
      visible = r.bottom > b.top && r.top < b.bottom;
    }
    pill.hidden = follow || visible;
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

  function jumpToSentence(k) {
    if (k < 0) return seek(0);
    if (k < sentences.length) seek(words[sentences[k].first].s - PREROLL);
  }

  function previousSentence() {
    const k = words[current]?.sentence ?? -1;
    if (k < 0) return seek(0);
    const start = words[sentences[k].first].s;
    // Like "previous track": restart the sentence, or go one back if it only just started.
    jumpToSentence(audio.currentTime - start < 1.5 ? k - 1 : k);
  }

  const nextSentence = () => jumpToSentence((words[current]?.sentence ?? -1) + 1);
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
    playButton.setAttribute("aria-label", playing ? "Pause" : "Play");
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
  on($(".prev"), "click", previousSentence);
  on($(".next"), "click", nextSentence);
  on(pill, "click", startFollow);
  on(range, "input", () => { dragging = true; showTime(Number(range.value)); });
  on(range, "change", () => { dragging = false; seek(Number(range.value)); });

  on($(".rate"), "click", (e) => {
    const rate = RATES[(RATES.indexOf(store.settings.rate) + 1) % RATES.length];
    store.settings.rate = audio.playbackRate = audio.defaultPlaybackRate = rate;
    e.currentTarget.textContent = `${rate}×`;
    save();
  });

  on($(".size"), "click", () => {
    store.settings.size = SIZES[(SIZES.indexOf(store.settings.size) + 1) % SIZES.length];
    document.documentElement.style.setProperty("--text-scale", store.settings.size);
    save();
    if (words[current]) reveal(words[current].el, "instant");
  });

  on(document, "keydown", (e) => {
    if (e.target.closest("input")) return;
    if (e.key === " ") { e.preventDefault(); toggle(); }
    else if (e.key === "ArrowLeft") previousSentence();
    else if (e.key === "ArrowRight") nextSentence();
    else if (e.key === "Escape") closePop();
    else if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(e.key)) stopFollow();
  });

  // The user scrolls the text: stop following the audio until they ask for it again.
  on(window, "wheel", stopFollow, { passive: true });
  on(window, "touchmove", stopFollow, { passive: true });
  on(window, "scroll", updatePill, { passive: true });

  // Word popup

  on(article, "click", (e) => {
    const el = e.target.closest(".w");
    if (el) openPop(Number(el.dataset.i));
  });
  on(document, "click", (e) => {
    if (!pop.hidden && !pop.contains(e.target) && !e.target.closest(".w")) closePop();
  });
  on($(".pop-play"), "click", () => {
    const i = picked;
    closePop();
    seek(words[i].s - PREROLL);
    play();
  });

  function openPop(i) {
    closePop();
    picked = i;
    const el = words[i].el;
    el.classList.add("picked");
    $(".pop-word").textContent = el.textContent.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    pop.hidden = false;
    const r = el.getBoundingClientRect(), b = band();
    const below = r.bottom + 8 + pop.offsetHeight < b.bottom;
    const x = clamp(r.left + r.width / 2 - pop.offsetWidth / 2, 8, window.innerWidth - pop.offsetWidth - 8);
    const y = below ? r.bottom + 8 : r.top - pop.offsetHeight - 8;
    pop.style.left = `${x + window.scrollX}px`;
    pop.style.top = `${y + window.scrollY}px`;
  }

  function closePop() {
    words[picked]?.el.classList.remove("picked");
    picked = -1;
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
    previoustrack: previousSentence,
    nexttrack: nextSentence,
  };
  if (media) {
    media.metadata = new MediaMetadata({
      title: `${chapter.n}. ${chapter.title}`,
      artist: `${book.author} · read by ${book.narrator}`,
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
