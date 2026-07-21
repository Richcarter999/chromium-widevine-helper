const title = document.getElementById("title");
const toggle = document.getElementById("toggle");
const toggleLabel = document.getElementById("toggleLabel");
const statusBar = document.getElementById("status");
const summary = document.getElementById("summary");

let applying = false;
let lastInstalled = false;

function t(name, substitutions) {
  return chrome.i18n.getMessage(name, substitutions) || name;
}

function initLocale() {
  document.documentElement.lang = chrome.i18n.getUILanguage();
  document.documentElement.dir = chrome.i18n.getMessage("@@bidi_dir") || "ltr";
  title.textContent = t("popupTitle");
  summary.textContent = t("checkingStatus");
  statusBar.textContent = t("checkingStatus");
  toggleLabel.title = t("toggleEnableWidevine");
  toggle.setAttribute("aria-label", t("toggleEnableWidevine"));
}

function setStatus(text, kind = "") {
  statusBar.textContent = text;
  statusBar.className = `status ${kind}`.trim();
}

function send(command) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ command }, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        resolve({
          ok: false,
          enabled: false,
          user_message: t("extensionContactError")
        });
        return;
      }
      resolve(response || {
        ok: false,
        enabled: false,
        user_message: t("extensionNoResponse")
      });
    });
  });
}

function applyResponse(response) {
  applying = true;
  toggle.checked = Boolean(response.enabled);
  applying = false;
  lastInstalled = Boolean(response.installed);
  summary.textContent = response.enabled ? t("summaryEnabled") : t("summaryDisabled");
  setStatus(
    response.user_message || (response.enabled ? t("widevineEnabled") : t("widevineDisabled")),
    response.ok ? (response.enabled ? "ok" : "") : "error"
  );
}

async function refresh() {
  toggle.disabled = true;
  const response = await send("status");
  applyResponse(response);
  toggle.disabled = false;
}

toggle.addEventListener("change", async () => {
  if (applying) {
    return;
  }

  toggle.disabled = true;
  if (toggle.checked) {
    setStatus(
      lastInstalled ? t("enablingWidevine") : t("downloadingWidevine"),
      "busy"
    );
    summary.textContent = t("summaryWorking");
    applyResponse(await send("enable"));
  } else {
    setStatus(t("disablingWidevine"), "busy");
    summary.textContent = t("summaryWorking");
    applyResponse(await send("disable"));
  }
  toggle.disabled = false;
});

initLocale();
refresh();
