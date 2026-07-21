const CHROMIUM_WIDEVINE_SOURCE = "chromium-widevine-detector";
const CHROMIUM_WIDEVINE_EVENT_TYPE = "widevine-request-failed";
const CHROMIUM_WIDEVINE_KEY_SYSTEM = "com.widevine.alpha";

let chromiumWidevineNotice = null;
let chromiumWidevineNoticeInfo = null;
let chromiumWidevineLastReportedAt = 0;

function chromiumWidevineText(name, substitutions) {
  return chrome.i18n.getMessage(name, substitutions) || name;
}

function chromiumWidevineSend(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        resolve({
          ok: false,
          message: chromiumWidevineText("extensionContactError"),
          action: "enable",
          button: chromiumWidevineText("enableButton")
        });
        return;
      }
      resolve(response || {
        ok: false,
        message: chromiumWidevineText("extensionNoResponse"),
        action: "enable",
        button: chromiumWidevineText("enableButton")
      });
    });
  });
}

function chromiumWidevineAppendNode(node) {
  const parent = document.body || document.documentElement;
  if (parent) {
    parent.appendChild(node);
    return;
  }

  document.addEventListener("DOMContentLoaded", () => {
    (document.body || document.documentElement).appendChild(node);
  }, { once: true });
}

function chromiumWidevineCreateNotice() {
  const textDirection = chrome.i18n.getMessage("@@bidi_dir") || "ltr";

  const host = document.createElement("div");
  host.lang = chrome.i18n.getUILanguage();
  host.dir = textDirection;
  host.id = "chromium-widevine-notice";
  host.style.all = "initial";
  host.style.position = "fixed";
  host.style.top = "16px";
  host.style.right = "16px";
  host.style.zIndex = "2147483647";
  host.style.maxWidth = "calc(100vw - 32px)";

  const root = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = `
    :host {
      all: initial;
      color-scheme: light;
    }
    .panel {
      width: min(360px, calc(100vw - 32px));
      box-sizing: border-box;
      border: 1px solid #3f4652;
      border-radius: 8px;
      background: #171a20;
      color: #f8fafc;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.28);
      font: 13px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0;
      overflow: hidden;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 12px 0;
    }
    .title {
      font-size: 14px;
      font-weight: 700;
      margin: 0;
    }
    .close {
      width: 28px;
      height: 28px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: #cbd5e1;
      cursor: pointer;
      font: 20px/1 system-ui, sans-serif;
    }
    .close:hover {
      background: #2a303a;
      color: #ffffff;
    }
    .message {
      margin: 0;
      padding: 8px 12px 12px;
      color: #d8dee9;
      overflow-wrap: anywhere;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 0 12px 12px;
    }
    .button {
      min-height: 32px;
      border: 1px solid #49515f;
      border-radius: 6px;
      padding: 0 12px;
      background: #252b35;
      color: #f8fafc;
      cursor: pointer;
      font: 600 13px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .button.primary {
      border-color: #2f8060;
      background: #1f7a4d;
      color: #ffffff;
    }
    .button:disabled {
      cursor: default;
      opacity: 0.7;
    }
  `;

  const panel = document.createElement("section");
  panel.className = "panel";
  panel.setAttribute("role", "status");
  panel.setAttribute("aria-live", "polite");

  const header = document.createElement("div");
  header.className = "header";

  const title = document.createElement("h2");
  title.className = "title";
  title.textContent = chromiumWidevineText("noticeTitle");

  const close = document.createElement("button");
  close.className = "close";
  close.type = "button";
  close.textContent = "x";
  close.setAttribute("aria-label", chromiumWidevineText("dismissButton"));

  const message = document.createElement("p");
  message.className = "message";

  const actions = document.createElement("div");
  actions.className = "actions";

  const primary = document.createElement("button");
  primary.className = "button primary";
  primary.type = "button";

  const dismiss = document.createElement("button");
  dismiss.className = "button";
  dismiss.type = "button";
  dismiss.textContent = chromiumWidevineText("dismissButton");

  header.append(title, close);
  actions.append(primary, dismiss);
  panel.append(header, message, actions);
  root.append(style, panel);
  chromiumWidevineAppendNode(host);

  function remove() {
    host.remove();
    chromiumWidevineNotice = null;
  }

  close.addEventListener("click", remove);
  dismiss.addEventListener("click", remove);

  function showRestartAction(response) {
    message.textContent = response.user_message || chromiumWidevineText("widevineEnabledRestart");
    primary.hidden = false;
    primary.disabled = false;
    primary.textContent = chromiumWidevineText("restartButton");
    chromiumWidevineNoticeInfo = {
      ...response,
      action: "restart",
      button: chromiumWidevineText("restartButton"),
      enabled: true,
      installed: true
    };
  }

  primary.addEventListener("click", async () => {
    const action = chromiumWidevineNoticeInfo && chromiumWidevineNoticeInfo.action;
    primary.disabled = true;
    primary.textContent = chromiumWidevineText("workingButton");

    if (action === "restart") {
      message.textContent = chromiumWidevineText("restartingBrowser");

      const response = await chromiumWidevineSend({ command: "restart" });
      if (response.ok) {
        message.textContent = response.user_message || chromiumWidevineText("restartingBrowser");
        return;
      }

      primary.disabled = false;
      primary.textContent = chromiumWidevineText("restartButton");
      message.textContent = response.code === "bad_command"
        ? chromiumWidevineText("restartUnavailable")
        : response.user_message || response.message || chromiumWidevineText("restartFailed");
      return;
    }

    message.textContent = chromiumWidevineNoticeInfo && chromiumWidevineNoticeInfo.installed
      ? chromiumWidevineText("enablingWidevine")
      : chromiumWidevineText("downloadingWidevine");

    const response = await chromiumWidevineSend({ command: "enable" });
    const enabled = Boolean(response.enabled);

    if (response.ok && enabled) {
      showRestartAction({
        ...response,
        user_message: response.needs_restart
          ? response.user_message || chromiumWidevineText("widevineEnabledRestart")
          : chromiumWidevineText("widevineEnabledRestart")
      });
      return;
    }

    if (response.code === "native_host_error" || response.code === "empty_response") {
      showRestartAction({
        ...response,
        ok: true,
        user_message: chromiumWidevineText("widevineEnabledRestart")
      });
      return;
    }

    primary.disabled = false;
    primary.textContent = chromiumWidevineText("enableButton");
    message.textContent = response.user_message || response.message || chromiumWidevineText("enableFailed");
  });

  chromiumWidevineNotice = {
    host,
    title,
    message,
    primary
  };
  return chromiumWidevineNotice;
}

function chromiumWidevineShowNotice(info) {
  chromiumWidevineNoticeInfo = info;
  const notice = chromiumWidevineNotice || chromiumWidevineCreateNotice();
  notice.title.textContent = info.title || chromiumWidevineText("noticeTitle");
  notice.message.textContent = info.message || chromiumWidevineText("siteRequiresWidevineDrm");

  if (info.action !== "dismiss") {
    notice.primary.hidden = false;
    notice.primary.disabled = false;
    notice.primary.textContent = info.button || chromiumWidevineText("enableButton");
  } else {
    notice.primary.hidden = true;
  }
}

window.addEventListener("message", async (event) => {
  if (event.source !== window) {
    return;
  }

  const data = event.data;
  if (
    !data
    || data.source !== CHROMIUM_WIDEVINE_SOURCE
    || data.type !== CHROMIUM_WIDEVINE_EVENT_TYPE
    || data.keySystem !== CHROMIUM_WIDEVINE_KEY_SYSTEM
  ) {
    return;
  }

  const now = Date.now();
  if (now - chromiumWidevineLastReportedAt < 30000) {
    return;
  }
  chromiumWidevineLastReportedAt = now;

  const response = await chromiumWidevineSend({
    command: "widevine-needed",
    detector: {
      hostname: location.hostname,
      href: location.href,
      errorName: typeof data.errorName === "string" ? data.errorName : "",
      errorMessage: typeof data.errorMessage === "string" ? data.errorMessage : ""
    }
  });

  chromiumWidevineShowNotice(response);
});
