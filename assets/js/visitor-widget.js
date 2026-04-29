(function () {
  var counters = Array.prototype.slice.call(document.querySelectorAll("[data-visitor-counter]"));

  if (!counters.length) {
    return;
  }

  var workerMeta = document.querySelector('meta[name="doublehit-worker-api-base"]');
  var siteKeyMeta = document.querySelector('meta[name="doublehit-visitor-site-key"]');
  var apiBase = workerMeta && workerMeta.content ? workerMeta.content.trim().replace(/\/$/, "") : "";
  var siteKey = siteKeyMeta && siteKeyMeta.content ? siteKeyMeta.content.trim() : (window.location.origin || window.location.hostname || "doublehitcollectibles");
  var VISITOR_HEARTBEAT_MS = 15000;
  var VISITOR_STATS_POLL_MS = 10000;
  var VISITOR_ID_STORAGE_KEY = "doublehit.site.visitorId";
  var state = {
    visitorId: "",
    visitId: "",
    stats: {
      visits: 0,
      uniqueVisitors: 0,
      onSite: 0
    },
    initialized: false,
    pendingStats: null,
    heartbeatId: 0,
    statsPollId: 0,
    leaveSent: false
  };

  function safeParseNumber(value) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
  }

  function formatDigits(value, width) {
    return String(safeParseNumber(value)).padStart(width || 7, "0");
  }

  function createDigitsFragment(value, width) {
    var digits = formatDigits(value, width);
    var fragment = document.createDocumentFragment();
    var firstNonZeroIndex = digits.search(/[1-9]/);
    var zeroCutoff = firstNonZeroIndex === -1 ? digits.length - 1 : firstNonZeroIndex;

    digits.split("").forEach(function (digit, index) {
      var span = document.createElement("span");
      span.className = digit === "0" && index < zeroCutoff ? "visitor-digit visitor-digit-dim" : "visitor-digit";
      span.textContent = digit;
      fragment.appendChild(span);
    });

    return fragment;
  }

  function renderCounter() {
    counters.forEach(function (counter) {
      Array.prototype.slice.call(counter.querySelectorAll("[data-visitor-field]")).forEach(function (field) {
        var key = field.getAttribute("data-visitor-field");
        field.replaceChildren(createDigitsFragment(state.stats[key], 7));
      });
    });
  }

  function generateId(prefix) {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return prefix + window.crypto.randomUUID();
    }

    return prefix + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function getVisitId() {
    if (!state.visitId) {
      state.visitId = generateId("visit-");
    }

    return state.visitId;
  }

  function getVisitorId() {
    if (state.visitorId) {
      return state.visitorId;
    }

    try {
      var storedId = window.localStorage.getItem(VISITOR_ID_STORAGE_KEY);

      if (storedId) {
        state.visitorId = storedId;
        return storedId;
      }
    } catch (_error) {
      // Local storage is optional here.
    }

    state.visitorId = generateId("visitor-");

    try {
      window.localStorage.setItem(VISITOR_ID_STORAGE_KEY, state.visitorId);
    } catch (_error) {
      // Local storage is optional here.
    }

    return state.visitorId;
  }

  function applyStats(payload) {
    if (!payload || typeof payload !== "object") {
      return;
    }

    state.stats = {
      visits: safeParseNumber(payload.visits),
      uniqueVisitors: safeParseNumber(payload.uniqueVisitors),
      onSite: safeParseNumber(payload.onSite)
    };

    renderCounter();
  }

  function buildVisitorUrl(path) {
    if (!apiBase) {
      return "";
    }

    return apiBase + path;
  }

  async function fetchStats() {
    if (!apiBase) {
      return state.stats;
    }

    if (state.pendingStats) {
      return state.pendingStats;
    }

    state.pendingStats = fetch(buildVisitorUrl("/api/visitors?siteKey=" + encodeURIComponent(siteKey)), {
      method: "GET",
      cache: "no-store"
    })
      .then(function (response) {
        return response.json().then(function (payload) {
          if (!response.ok) {
            throw new Error(payload && payload.error ? payload.error : "Unable to fetch visitor stats.");
          }

          applyStats(payload);
          return state.stats;
        });
      })
      .catch(function (error) {
        console.error("visitor stats request failed", error);
        renderCounter();
        throw error;
      })
      .finally(function () {
        state.pendingStats = null;
      });

    return state.pendingStats;
  }

  async function track(action) {
    if (!apiBase) {
      return state.stats;
    }

    var response = await fetch(buildVisitorUrl("/api/visitors/track"), {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      cache: "no-store",
      body: JSON.stringify({
        siteKey: siteKey,
        visitorId: getVisitorId(),
        visitId: getVisitId(),
        action: action
      })
    });
    var payload = await response.json().catch(function () {
      return {};
    });

    if (!response.ok) {
      throw new Error(payload && payload.error ? payload.error : "Unable to update visitor stats.");
    }

    applyStats(payload);
    return state.stats;
  }

  function sendLeave() {
    if (!apiBase || !state.initialized || state.leaveSent) {
      return;
    }

    state.leaveSent = true;

    if (state.stats.onSite > 0) {
      applyStats({
        visits: state.stats.visits,
        uniqueVisitors: state.stats.uniqueVisitors,
        onSite: state.stats.onSite - 1
      });
    }

    var payload = JSON.stringify({
      siteKey: siteKey,
      visitId: getVisitId()
    });

    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(buildVisitorUrl("/api/visitors/leave"), new Blob([payload], { type: "application/json" }));
      }
    } catch (_error) {
      // Keep the fetch fallback below.
    }

    fetch(buildVisitorUrl("/api/visitors/leave"), {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: payload,
      keepalive: true
    }).catch(function () {
      return null;
    });
  }

  function resumeTracking() {
    if (!state.initialized || document.visibilityState === "hidden") {
      return;
    }

    state.leaveSent = false;
    track("heartbeat").catch(function () {
      fetchStats().catch(function () {
        return null;
      });
    });
  }

  function handleVisibilityChange() {
    if (document.visibilityState === "hidden") {
      sendLeave();
      return;
    }

    resumeTracking();
  }

  function initVisitorCounter() {
    renderCounter();

    if (state.initialized || !apiBase) {
      return;
    }

    state.initialized = true;

    track("visit").catch(function () {
      fetchStats().catch(function () {
        return null;
      });
    });

    state.heartbeatId = window.setInterval(function () {
      track("heartbeat").catch(function () {
        fetchStats().catch(function () {
          return null;
        });
      });
    }, VISITOR_HEARTBEAT_MS);

    state.statsPollId = window.setInterval(function () {
      fetchStats().catch(function () {
        return null;
      });
    }, VISITOR_STATS_POLL_MS);

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", resumeTracking);
    window.addEventListener("pageshow", resumeTracking);
    window.addEventListener("pagehide", sendLeave);
    window.addEventListener("beforeunload", sendLeave);
  }

  initVisitorCounter();
})();
