(function () {
  var header = document.querySelector(".bar-header");
  var body = document.body;
  var userLink = header ? header.querySelector("[data-admin-user-link]") : null;
  var manageLinks = Array.prototype.slice.call(document.querySelectorAll("[data-manage-collection-link]"));
  var adminOnlyLinks = Array.prototype.slice.call(document.querySelectorAll("[data-admin-only-link]"));
  var adminRequiredLinks = Array.prototype.slice.call(document.querySelectorAll("[data-admin-required-link]"));
  var apiMeta = document.querySelector('meta[name="doublehit-worker-api-base"]');
  var adminMenuPanel = document.querySelector("[data-admin-menu-panel]");
  var adminMenuLoginForm = document.querySelector("[data-admin-menu-login-form]");
  var adminMenuMessage = document.querySelector("[data-admin-menu-message]");
  var adminMenuSession = document.querySelector("[data-admin-menu-session]");
  var adminMenuUsername = document.querySelector("[data-admin-menu-username]");
  var adminMenuLogout = document.querySelector("[data-admin-menu-logout]");
  var apiBase = (
    body ? String(body.dataset.adminApiBase || "").trim() : ""
  ) || (
    apiMeta ? String(apiMeta.getAttribute("content") || "").trim() : ""
  );
  apiBase = apiBase.replace(/\/$/, "");
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
    setAdminMenuState(username);

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

  function setAdminMenuState(username) {
    if (!adminMenuPanel) {
      return;
    }

    var isAuthenticated = Boolean(username);

    if (adminMenuLoginForm) {
      adminMenuLoginForm.hidden = isAuthenticated;
    }

    if (adminMenuSession) {
      adminMenuSession.hidden = !isAuthenticated;
    }

    if (adminMenuUsername) {
      adminMenuUsername.textContent = username || "";
    }

    renderAdminMenuMessage(
      isAuthenticated
        ? "Admin tools are ready."
        : "Sign in to create stories from any page.",
      isAuthenticated ? "success" : "info",
    );
  }

  function renderAdminMenuMessage(message, mode) {
    if (!adminMenuMessage) {
      return;
    }

    adminMenuMessage.textContent = message || "";
    adminMenuMessage.setAttribute("data-mode", mode || "info");
  }

  function setAdminMenuBusy(isBusy) {
    if (!adminMenuLoginForm) {
      return;
    }

    Array.prototype.slice.call(adminMenuLoginForm.elements).forEach(function (field) {
      field.disabled = Boolean(isBusy);
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

  function buildJsonHeaders(includeAuth) {
    var headers = buildSessionHeaders();
    headers.set("content-type", "application/json");

    if (!includeAuth) {
      headers.delete("authorization");
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
    if (!apiBase) {
      sessionState.username = "";
      sessionState.checked = true;
      setHeaderUser("");
      renderAdminMenuMessage("Admin login is unavailable because the Worker API URL is missing.", "error");
      return Promise.resolve("");
    }

    if (!sessionState.token) {
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

  function parseJsonResponse(response) {
    return response.text().then(function (text) {
      var payload = null;

      if (text) {
        try {
          payload = JSON.parse(text);
        } catch (_error) {
          payload = { error: text };
        }
      }

      if (!response.ok) {
        throw new Error(payload && payload.error ? payload.error : "Admin request failed.");
      }

      return payload || {};
    });
  }

  function broadcastAuthChanged(detail) {
    window.dispatchEvent(
      new CustomEvent("doublehit-admin-auth-changed", {
        detail: detail || {},
      }),
    );
  }

  function handleAdminMenuLogin(event) {
    event.preventDefault();

    if (!apiBase) {
      renderAdminMenuMessage("Admin login is unavailable because the Worker API URL is missing.", "error");
      return;
    }

    var formData = new FormData(adminMenuLoginForm);
    var username = String(formData.get("username") || "").trim();
    var password = String(formData.get("password") || "");

    if (!username || !password) {
      renderAdminMenuMessage("Username and password are required.", "error");
      return;
    }

    setAdminMenuBusy(true);
    renderAdminMenuMessage("Signing in...", "info");

    fetch(apiBase + "/api/auth/login", {
      method: "POST",
      headers: buildJsonHeaders(false),
      body: JSON.stringify({ username: username, password: password }),
    })
      .then(parseJsonResponse)
      .then(function (payload) {
        var token = typeof payload.token === "string" ? payload.token.trim() : "";
        var nextUsername = normalizeUsername(payload.user) || username;

        if (!token) {
          throw new Error("Login did not return a session token.");
        }

        setAuthenticatedUser(nextUsername, token);
        adminMenuLoginForm.reset();
        broadcastAuthChanged({
          token: token,
          username: nextUsername,
        });
      })
      .catch(function (error) {
        clearSessionState();
        renderAdminMenuMessage(error instanceof Error ? error.message : "Admin login failed.", "error");
      })
      .finally(function () {
        setAdminMenuBusy(false);
      });
  }

  function handleAdminMenuLogout() {
    clearSessionState();
    broadcastAuthChanged({
      signedOut: true,
      token: "",
      username: "",
    });
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

  if (adminMenuLoginForm) {
    adminMenuLoginForm.addEventListener("submit", handleAdminMenuLogin);
  }

  if (adminMenuLogout) {
    adminMenuLogout.addEventListener("click", handleAdminMenuLogout);
  }

  syncHeaderState();
  fetchAdminSession();
})();
