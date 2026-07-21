const HOST_NAME = "org.chromium.widevine";
const NATIVE_COMMANDS = new Set(["status", "enable", "disable", "update", "restart"]);
const UPDATE_ALARM_NAME = "widevine-update";
const UPDATE_PERIOD_MINUTES = 6 * 60;

function t(name, substitutions) {
  return chrome.i18n.getMessage(name, substitutions) || name;
}

function sendNative(command) {
  return new Promise((resolve) => {
    chrome.runtime.sendNativeMessage(HOST_NAME, { command }, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        const nativeError = error.message || String(error);
        console.warn(`${HOST_NAME}: ${nativeError}`);
        try {
          chrome.storage.local.set({
            lastNativeMessagingError: {
              host: HOST_NAME,
              message: nativeError,
              time: new Date().toISOString()
            }
          }, () => {
            void chrome.runtime.lastError;
          });
        } catch (_storageError) {
          // Diagnostics should never change the native-messaging result.
        }
        resolve({
          ok: false,
          enabled: false,
          installed: false,
          code: "native_host_error",
          user_message: t("installerContactError"),
          native_error: nativeError
        });
        return;
      }
      resolve(response || {
        ok: false,
        enabled: false,
        installed: false,
        code: "empty_response",
        user_message: t("installerNoResponse")
      });
    });
  });
}

function errorMessageForCode(code, command) {
  if (command === "restart") {
    if (code === "restart_unavailable") {
      return t("restartUnavailable");
    }
    return t("restartFailed");
  }
  if (code === "internet_required") {
    return t("internetRequired");
  }
  if (code === "unsupported_arch") {
    return t("unsupportedArch");
  }
  if (code === "download_failed") {
    return t("downloadFailed");
  }
  if (code === "native_host_error") {
    return t("installerContactError");
  }
  if (code === "empty_response") {
    return t("installerNoResponse");
  }
  if (code === "bad_command") {
    return t("unknownCommand");
  }
  return t("enableFailed");
}

function localizeNativeResponse(command, response) {
  const localized = { ...response };
  if (localized.ok === false) {
    localized.user_message = errorMessageForCode(localized.code, command);
    return localized;
  }

  if (command === "status") {
    localized.user_message = localized.enabled ? t("widevineEnabled") : t("widevineDisabled");
    return localized;
  }

  if (command === "enable" && localized.enabled) {
    localized.user_message = (localized.installed_now || localized.updated)
      ? t("widevineInstalledRestart")
      : t("widevineEnabledRestart");
    return localized;
  }

  if (command === "disable") {
    localized.user_message = t("widevineDisabled");
    return localized;
  }

  if (command === "update") {
    localized.user_message = localized.enabled ? t("widevineEnabled") : t("widevineDisabled");
    return localized;
  }

  if (command === "restart") {
    localized.user_message = t("restartingBrowser");
    return localized;
  }

  return localized;
}

async function refreshStatus() {
  const status = localizeNativeResponse("status", await sendNative("status"));
  await updateBadge(status);
  return status;
}

async function runSilentUpdate() {
  const response = await sendNative("update");
  if (response && response.ok) {
    await updateBadge(response);
    return response;
  }
  return refreshStatus();
}

function scheduleSilentUpdates() {
  chrome.alarms.create(UPDATE_ALARM_NAME, {
    delayInMinutes: 5,
    periodInMinutes: UPDATE_PERIOD_MINUTES
  });
}

async function updateBadge(status, tabId) {
  const enabled = Boolean(status && status.enabled);
  const target = Number.isInteger(tabId) ? { tabId } : {};
  try {
    await chrome.action.setBadgeText({ ...target, text: enabled ? t("badgeOn") : "" });
    await chrome.action.setBadgeBackgroundColor({ ...target, color: enabled ? "#1f7a4d" : "#666666" });
  } catch (_error) {
    // The tab can close while an async native-host response is in flight.
  }
}

async function markWidevineNeeded(status, tabId) {
  if (!Number.isInteger(tabId)) {
    return;
  }

  const enabled = Boolean(status && status.enabled);
  try {
    await chrome.action.setBadgeText({ tabId, text: enabled ? t("badgeOn") : t("badgeDrm") });
    await chrome.action.setBadgeBackgroundColor({
      tabId,
      color: enabled ? "#1f7a4d" : "#9a5a00"
    });
  } catch (_error) {
    // The tab can close while an async native-host response is in flight.
  }
}

function widevineNeededResponse(status) {
  if (!status || status.ok === false) {
    return {
      ok: false,
      title: t("noticeTitle"),
      message: t("siteRequiresWidevineDrmMissing"),
      action: "enable",
      button: t("enableButton"),
      enabled: false,
      installed: false
    };
  }

  if (status.enabled) {
    return {
      ok: true,
      title: t("restartTitle"),
      message: t("siteRequiresWidevineDrmRestart"),
      action: "restart",
      button: t("restartButton"),
      enabled: true,
      installed: true
    };
  }

  if (status.installed) {
    return {
      ok: true,
      title: t("noticeTitle"),
      message: t("siteRequiresWidevineDrmInstalledDisabled"),
      action: "enable",
      button: t("enableButton"),
      enabled: false,
      installed: true
    };
  }

  return {
    ok: true,
    title: t("noticeTitle"),
    message: t("siteRequiresWidevineDrmMissing"),
    action: "enable",
    button: t("enableButton"),
    enabled: false,
    installed: false
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const command = message && message.command;
  const tabId = _sender && _sender.tab && _sender.tab.id;
  if (NATIVE_COMMANDS.has(command)) {
    sendNative(command).then(async (response) => {
      const localized = localizeNativeResponse(command, response);
      await updateBadge(localized, tabId);
      sendResponse(localized);
    });
    return true;
  }

  if (command === "widevine-needed") {
    sendNative("status").then(async (status) => {
      await markWidevineNeeded(status, tabId);
      sendResponse(widevineNeededResponse(status));
    });
    return true;
  }

  if (!command) {
    sendResponse({
      ok: false,
      enabled: false,
      code: "bad_command",
      user_message: t("unknownCommand")
    });
    return false;
  }

  sendResponse({
    ok: false,
    enabled: false,
    code: "bad_command",
    user_message: t("unknownCommand")
  });
  return false;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm && alarm.name === UPDATE_ALARM_NAME) {
    runSilentUpdate();
  }
});

chrome.runtime.onInstalled.addListener(() => {
  scheduleSilentUpdates();
  refreshStatus().then(runSilentUpdate);
});

chrome.runtime.onStartup.addListener(() => {
  scheduleSilentUpdates();
  refreshStatus().then(runSilentUpdate);
});
