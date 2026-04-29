(function () {
  var header = document.querySelector(".bar-header");
  var body = document.body;
  var userLink = header ? header.querySelector("[data-admin-user-link]") : null;
  var manageLinks = Array.prototype.slice.call(document.querySelectorAll("[data-manage-collection-link]"));
  var adminOnlyLinks = Array.prototype.slice.call(document.querySelectorAll("[data-admin-only-link]"));
  var adminRequiredLinks = Array.prototype.slice.call(document.querySelectorAll("[data-admin-required-link]"));
  var apiBase = body ? String(body.dataset.adminApiBase || "").trim().replace(/\/$/, "") : "";
  var tokenStorageKey = "doublehit.collection.admin.token";
  var sessionState = {
    token: readStoredToken(),
    username: "",
    checked: false,
    pending: null,
  };

  if (!header) {
    return;
  }

  function readStoredToken() {
    try {
      return window.localStorage.getItem(tokenStorageKey) || "";
    } catch (_error) {
      return "";
    }
  }

  function writeStoredToken(token) {
    try {
      if (token) {
        window.localStorage.setItem(tokenStorageKey, token);
      } else {
        window.localStorage.removeItem(tokenStorageKey);
      }
    } catch (_error) {
      return;
    }
  }

  function syncHeaderState() {
    var scrolled = window.pageYOffset || document.documentElement.scrollTop || 0;
    header.classList.toggle("is-scrolled", scrolled > 4);
  }

  function setHeaderUser(username) {
    setAdminOnlyLinks(Boolean(username));

    if (!userLink) {
      return;
    }

    if (!username) {
      userLink.hidden = true;
      userLink.textContent = "";
      userLink.removeAttribute("title");
      return;
    }

    userLink.hidden = false;
    userLink.textContent = username;
    userLink.title = "Signed in as " + username;
    userLink.setAttribute("aria-label", "Open collection admin for " + username);
  }

  function setAdminOnlyLinks(isVisible) {
    adminOnlyLinks.forEach(function (link) {
      link.hidden = !isVisible;
    });
  }

  function buildRequiredManageUrl(rawUrl) {
    var manageUrl = new URL(rawUrl, window.location.origin);
    manageUrl.searchParams.set("required", "1");
    return manageUrl.toString();
  }

  function buildSessionHeaders() {
    var headers = new Headers();

    if (sessionState.token) {
      headers.set("authorization", "Bearer " + sessionState.token);
    }

    return headers;
  }

  function normalizeUsername(user) {
    if (!user || typeof user.username !== "string") {
      return "";
    }

    return user.username.trim();
  }

  function clearSessionState() {
    sessionState.token = "";
    sessionState.username = "";
    sessionState.checked = true;
    writeStoredToken("");
    setHeaderUser("");
  }

  function setAuthenticatedUser(username, token) {
    sessionState.username = username || "";
    sessionState.token = token || sessionState.token || "";
    sessionState.checked = true;
    writeStoredToken(sessionState.token);
    setHeaderUser(sessionState.username);
  }

  function fetchAdminSession() {
    if (!apiBase || !sessionState.token) {
      clearSessionState();
      return Promise.resolve("");
    }

    if (sessionState.pending) {
      return sessionState.pending;
    }

    sessionState.pending = fetch(apiBase + "/api/auth/session", {
      method: "GET",
      headers: buildSessionHeaders(),
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("Session unavailable");
        }

        return response.json();
      })
      .then(function (payload) {
        var username = normalizeUsername(payload && payload.user);

        if (!username) {
          throw new Error("Missing username");
        }

        setAuthenticatedUser(username);
        return username;
      })
      .catch(function () {
        clearSessionState();
        return "";
      })
      .finally(function () {
        sessionState.pending = null;
      });

    return sessionState.pending;
  }

  function handleManageClick(event) {
    var link = event.currentTarget;
    var targetUrl = link && link.href ? link.href : "";

    if (!targetUrl) {
      return;
    }

    if (!sessionState.token && !sessionState.username) {
      event.preventDefault();
      window.location.assign(buildRequiredManageUrl(targetUrl));
      return;
    }

    if (!sessionState.checked) {
      event.preventDefault();
      fetchAdminSession().then(function (username) {
        window.location.assign(username ? targetUrl : buildRequiredManageUrl(targetUrl));
      });
      return;
    }

    if (!sessionState.username) {
      event.preventDefault();
      window.location.assign(buildRequiredManageUrl(targetUrl));
    }
  }

  window.addEventListener("scroll", syncHeaderState, { passive: true });
  window.addEventListener("resize", syncHeaderState);
  window.addEventListener("doublehit-admin-auth-changed", function (event) {
    var detail = event && event.detail ? event.detail : {};
    var nextToken = typeof detail.token === "string" ? detail.token.trim() : readStoredToken();
    var nextUsername = typeof detail.username === "string" ? detail.username.trim() : "";

    if (!nextToken || detail.signedOut) {
      clearSessionState();
      return;
    }

    sessionState.token = nextToken;

    if (nextUsername) {
      setAuthenticatedUser(nextUsername, nextToken);
      return;
    }

    sessionState.checked = false;
    fetchAdminSession();
  });

  manageLinks.forEach(function (link) {
    link.addEventListener("click", handleManageClick);
  });

  adminRequiredLinks.forEach(function (link) {
    link.addEventListener("click", handleManageClick);
  });

  syncHeaderState();
  fetchAdminSession();
})();
