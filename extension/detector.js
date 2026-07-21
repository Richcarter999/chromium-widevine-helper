(() => {
  const SOURCE = "chromium-widevine-detector";
  const EVENT_TYPE = "widevine-request-failed";
  const KEY_SYSTEM = "com.widevine.alpha";
  const INSTALLED_MARKER = "__chromiumWidevineDetectorInstalled";

  if (window[INSTALLED_MARKER]) {
    return;
  }

  Object.defineProperty(window, INSTALLED_MARKER, {
    value: true,
    configurable: false
  });

  const originalRequest = navigator.requestMediaKeySystemAccess;
  if (typeof originalRequest !== "function") {
    return;
  }

  function isWidevine(keySystem) {
    return typeof keySystem === "string" && keySystem.toLowerCase() === KEY_SYSTEM;
  }

  function errorDetails(error) {
    if (!error || typeof error !== "object") {
      return {
        errorName: "",
        errorMessage: ""
      };
    }

    return {
      errorName: typeof error.name === "string" ? error.name : "",
      errorMessage: typeof error.message === "string" ? error.message : ""
    };
  }

  function reportFailure(error) {
    const targetOrigin = location.origin && location.origin !== "null" ? location.origin : "*";
    window.postMessage({
      source: SOURCE,
      type: EVENT_TYPE,
      keySystem: KEY_SYSTEM,
      href: location.href,
      hostname: location.hostname,
      ...errorDetails(error)
    }, targetOrigin);
  }

  function tryReportFailure(error) {
    try {
      reportFailure(error);
    } catch (_reportError) {
      // Reporting must not change the page's EME failure semantics.
    }
  }

  function requestMediaKeySystemAccess(keySystem) {
    let result;
    try {
      result = Reflect.apply(originalRequest, this, arguments);
    } catch (error) {
      if (isWidevine(keySystem)) {
        tryReportFailure(error);
      }
      throw error;
    }

    if (!isWidevine(keySystem) || !result || typeof result.catch !== "function") {
      return result;
    }

    result.catch((error) => {
      tryReportFailure(error);
    });
    return result;
  }

  try {
    Object.defineProperty(requestMediaKeySystemAccess, "name", {
      value: originalRequest.name,
      configurable: true
    });
    Object.defineProperty(requestMediaKeySystemAccess, "length", {
      value: originalRequest.length,
      configurable: true
    });
  } catch (_error) {
    // Function metadata is cosmetic; the hook still works if these are readonly.
  }

  try {
    Object.defineProperty(navigator, "requestMediaKeySystemAccess", {
      value: requestMediaKeySystemAccess,
      configurable: true,
      writable: true
    });
  } catch (_error) {
    navigator.requestMediaKeySystemAccess = requestMediaKeySystemAccess;
  }
})();
