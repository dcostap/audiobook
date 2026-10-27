let installPrompt = null;
const standalone = matchMedia("(display-mode: standalone)");
const isInstalled = () => standalone.matches || navigator.standalone === true;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export function updateInstallButton() {
  const button = document.getElementById("install-app");
  if (!button) return;
  button.hidden = isInstalled() || (!installPrompt && !isIOS);
  button.onclick = async () => {
    if (!installPrompt) {
      document.getElementById("install-help").showModal();
      return;
    }
    const prompt = installPrompt;
    button.disabled = true;
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch {
      // The browser can cancel installation when the page loses focus.
    } finally {
      installPrompt = null;
      button.disabled = false;
      updateInstallButton();
    }
  };
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  updateInstallButton();
});
window.addEventListener("appinstalled", () => {
  installPrompt = null;
  updateInstallButton();
});
standalone.addEventListener("change", updateInstallButton);

// Use a new version when the user cannot notice the reload: before their first touch, or while the app is
// hidden. Never during playback. Else the new version waits until all app windows close.
if ("serviceWorker" in navigator && window.isSecureContext) {
  let touched = false;
  for (const type of ["pointerdown", "keydown"]) window.addEventListener(type, () => (touched = true), { capture: true, once: true });
  const register = async () => {
    try {
      const registration = await navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" });
      const audio = document.getElementById("audio");
      let updating = false;
      const apply = () => {
        const worker = registration.waiting;
        // No controller: the first installation, which needs no reload.
        if (!worker || !navigator.serviceWorker.controller || updating || !audio.paused || (touched && !document.hidden)) return;
        updating = true;
        navigator.serviceWorker.addEventListener("controllerchange", () => location.reload(), { once: true });
        worker.postMessage("activate");
      };
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => worker.state === "installed" && apply());
      });
      audio.addEventListener("pause", apply);
      document.addEventListener("visibilitychange", apply);
      apply();
      let checked = Date.now();
      const check = () => {
        if (document.hidden || Date.now() - checked < 60 * 60 * 1000) return;
        checked = Date.now();
        registration.update().catch(() => {});
      };
      document.addEventListener("visibilitychange", check);
      window.addEventListener("online", check);
    } catch {
      // Private mode or browser policy can block workers. Keep the web app usable.
    }
  };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
