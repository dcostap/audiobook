import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const site = new URL("../site/", import.meta.url);
const source = await readFile(new URL("sw.js", site), "utf8");
const appSource = await readFile(new URL("app.js", site), "utf8");
const translationHTML = vm.runInNewContext(
  `${appSource.match(/^const esc = .+;$/m)[0]}\n${appSource.match(/^function translationHTML\([\s\S]*?^\}/m)[0]}\ntranslationHTML`,
);

test("sentence highlights keep the original case, spacing, and punctuation", () => {
  assert.equal(translationHTML("Eran perfectamente normales, gracias.", "perfectamente normales"),
    "Eran <mark>perfectamente normales</mark>, gracias.");
  assert.equal(translationHTML("¡Muchas  gracias!", "muchas gracias"), "¡<mark>Muchas  gracias</mark>!");
});

test("sentence highlights skip missing and ambiguous translations", () => {
  for (const [sentence, gloss] of [
    ["Se encogió de hombros.", "se encoge de hombros"],
    ["Sí, sí.", "sí"],
    ["a a a", "a a"],
    ["Había un hombre grandote.", "un hombre grande"],
    ["Parecía alterado.", "alterado, nervioso"],
    ["Se marchó.", undefined],
    ["Se marchó.", ""],
  ]) assert.equal(translationHTML(sentence, gloss), sentence);
});

test("sentence highlights respect word boundaries and accents", () => {
  for (const [sentence, gloss] of [
    ["Desde allí.", "de"],
    ["Él llegó.", "el"],
    ["Quien-usted-sabe", "usted"],
    ["e\u0301l llegó.", "e"],
  ]) assert.equal(translationHTML(sentence, gloss), sentence);
  assert.equal(translationHTML("Él llegó.", "él"), "<mark>Él</mark> llegó.");
});

test("sentence highlights treat HTML and regular expression characters as text", () => {
  assert.equal(translationHTML("<b>J. K. Rowling</b>", "J. K. Rowling"),
    "&#60;b&#62;<mark>J. K. Rowling</mark>&#60;/b&#62;");
  assert.equal(translationHTML("Jx Kx Rowling", "J. K. Rowling"), "Jx Kx Rowling");
  assert.equal(translationHTML("<img src=x>", "<img src=x>"),
    "<mark>&#60;img src=x&#62;</mark>");
});
const scope = "https://example.test/audiobook/";
const prefix = `audiolibros:${scope}:`;
const key = (request) => typeof request === "string" ? request : request.url;

function worker() {
  const handlers = new Map(), stores = new Map();
  let claimed = false;
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        async match(request) { return entries.get(key(request))?.clone(); },
        async put(request, response) { entries.set(key(request), response.clone()); },
        async addAll(requests) {
          for (const request of requests) {
            const path = new URL(request.url).pathname.slice("/audiobook/".length) || "index.html";
            await this.put(request, new Response(await readFile(new URL(path, site))));
          }
        },
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
  };
  const context = vm.createContext({
    self: {
      registration: { scope },
      clients: { async claim() { claimed = true; } },
      addEventListener(type, handler) { handlers.set(type, handler); },
    },
    caches, URL, Request, Response, AbortController, setTimeout, clearTimeout,
    fetch: async () => { throw new TypeError("Offline"); },
  });
  vm.runInContext(source, context);
  async function dispatch(type, request) {
    const pending = [];
    let response;
    handlers.get(type)({ request, waitUntil: (promise) => pending.push(promise), respondWith: (promise) => { response = promise; } });
    const result = await response;
    await Promise.all(pending);
    return result;
  }
  const request = (path, options = {}) => new Request(new URL(path, scope), options);
  return { caches, context, dispatch, request, stores, get claimed() { return claimed; } };
}

test("manifest uses the deployment subpath and valid phone icons", async () => {
  const manifest = JSON.parse(await readFile(new URL("manifest.webmanifest", site), "utf8"));
  for (const property of ["id", "scope", "start_url"]) assert.equal(new URL(manifest[property], scope).href, scope);
  assert.equal(manifest.display, "standalone");
  for (const icon of manifest.icons) {
    const png = await readFile(new URL(icon.src, site));
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
  }
  assert.ok(manifest.icons.some((icon) => icon.purpose === "maskable"));
});

test("installation caches all shell files, but no audio", async () => {
  const w = worker();
  await w.dispatch("install");
  const entries = [...w.stores.values()][0];
  for (const file of ["index.html", "app.js", "pwa.js", "library.json", "fonts/literata.woff2", "books/hp1/cover.jpg"])
    assert.ok(entries.has(new URL(file, scope).href), file);
  assert.ok([...entries.keys()].every((url) => !url.endsWith(".mp3")));
  assert.equal(w.claimed, false);
});

test("activation removes only this app's old shell, keeping chapter data", async () => {
  const w = worker();
  await w.dispatch("install");
  await w.caches.open(`${prefix}shell:old`);
  await w.caches.open(`${prefix}data`);
  await w.caches.open("other-app:shell:old");
  await w.dispatch("activate");
  assert.equal(w.claimed, true);
  assert.ok(!w.stores.has(`${prefix}shell:old`));
  assert.ok(w.stores.has(`${prefix}data`));
  assert.ok(w.stores.has("other-app:shell:old"));
});

test("offline navigation and shell resources use one complete app version", async () => {
  const w = worker();
  await w.dispatch("install");
  const page = await w.dispatch("fetch", { ...w.request("./"), url: scope, method: "GET", mode: "navigate", headers: new Headers() });
  assert.match(await page.text(), /<title>Audiolibros<\/title>/);
  const script = await w.dispatch("fetch", w.request("app.js?test=1"));
  assert.match(await script.text(), /updateInstallButton/);
});

test("chapter data uses the network, with an offline fallback", async () => {
  const w = worker();
  w.context.fetch = async () => Response.json({ chapter: 1 });
  const request = w.request("books/hp1/01.json");
  assert.deepEqual(await (await w.dispatch("fetch", request)).json(), { chapter: 1 });
  w.context.fetch = async () => { throw new TypeError("Offline"); };
  assert.deepEqual(await (await w.dispatch("fetch", request)).json(), { chapter: 1 });
  assert.equal((await w.dispatch("fetch", w.request("books/hp1/02.json"))).status, 503);
});

test("the app still loads online after the browser removes its cached shell", async () => {
  const w = worker();
  w.context.fetch = async () => new Response("Fresh app");
  const response = await w.dispatch("fetch", w.request("app.js"));
  assert.equal(await response.text(), "Fresh app");
});

test("server errors do not replace a saved chapter", async () => {
  const w = worker();
  const request = w.request("books/hp1/01.es.json");
  await (await w.caches.open(`${prefix}data`)).put(request, Response.json({ es: "Hola" }));
  w.context.fetch = async () => new Response("Not found", { status: 404 });
  assert.deepEqual(await (await w.dispatch("fetch", request)).json(), { es: "Hola" });
});

test("a full device cache does not break online reading", async () => {
  const w = worker();
  const open = w.caches.open.bind(w.caches);
  w.caches.open = async (name) => ({ ...await open(name), async put() { throw new Error("QuotaExceededError"); } });
  w.context.fetch = async () => Response.json({ fresh: true });
  const response = await w.dispatch("fetch", w.request("books/hp1/01.json"));
  assert.deepEqual(await response.json(), { fresh: true });
});

test("unavailable cache storage does not break online reading", async () => {
  const w = worker();
  w.caches.open = async () => { throw new Error("SecurityError"); };
  w.context.fetch = async () => Response.json({ fresh: true });
  assert.deepEqual(await (await w.dispatch("fetch", w.request("books/hp1/01.json"))).json(), { fresh: true });
});

test("audio, ranges, non-GET requests, and other apps bypass the worker", async () => {
  const w = worker();
  for (const request of [
    w.request("books/hp1/01.mp3"),
    w.request("books/hp1/01.json", { headers: { Range: "bytes=0-99" } }),
    w.request("library.json", { method: "POST" }),
    new Request("https://example.test/another-app/library.json"),
    new Request("https://other.test/audiobook/library.json"),
]) assert.equal(await w.dispatch("fetch", request), undefined);
});

const installSource = (await readFile(new URL("pwa.js", site), "utf8")).replace("export function", "function");
function installUI({ ios = false, installed = false } = {}) {
  const listeners = new Map();
  const button = { hidden: true };
  let dialogOpened = false;
  const context = vm.createContext({
    matchMedia: () => ({ matches: installed, addEventListener() {} }),
    navigator: { userAgent: ios ? "iPhone" : "Chrome", platform: "", maxTouchPoints: 0 },
    document: { getElementById: (id) => id === "install-app" ? button : { showModal() { dialogOpened = true; } } },
    window: { addEventListener: (name, callback) => listeners.set(name, callback) },
  });
  vm.runInContext(installSource, context);
  context.updateInstallButton();
  return { button, listeners, get dialogOpened() { return dialogOpened; } };
}

test("Chrome shows installation only when its native prompt is ready", async () => {
  const ui = installUI();
  assert.equal(ui.button.hidden, true);
  let prompted = false, prevented = false;
  ui.listeners.get("beforeinstallprompt")({
    preventDefault() { prevented = true; },
    async prompt() { prompted = true; },
    userChoice: Promise.resolve({ outcome: "accepted" }),
  });
  assert.equal(prevented, true);
  assert.equal(ui.button.hidden, false);
  await ui.button.onclick();
  assert.equal(prompted, true);
  assert.equal(ui.button.hidden, true);
});

test("iPhone installation opens the Safari instructions", async () => {
  const ui = installUI({ ios: true });
  assert.equal(ui.button.hidden, false);
  await ui.button.onclick();
  assert.equal(ui.dialogOpened, true);
});

test("installed apps do not show an install button", () => {
  assert.equal(installUI({ ios: true, installed: true }).button.hidden, true);
});

test("a cancelled native prompt does not cause an uncaught error", async () => {
  const ui = installUI();
  ui.listeners.get("beforeinstallprompt")({ preventDefault() {}, async prompt() { throw new Error("Cancelled"); } });
  await ui.button.onclick();
  assert.equal(ui.button.hidden, true);
  assert.equal(ui.button.disabled, false);
});
