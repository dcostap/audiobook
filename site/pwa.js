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

// Let updates wait until all app windows close. Never reload during playback.
if ("serviceWorker" in navigator && window.isSecureContext) {
  const register = async () => {
    try {
      const registration = await navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" });
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
