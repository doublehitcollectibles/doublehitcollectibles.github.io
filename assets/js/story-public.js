(function () {
  var app = document.querySelector("[data-story-public-app]");
  var utils = window.DoubleHitStories;

  if (!app || !utils) {
    return;
  }

  var apiBase = String(app.dataset.apiBase || "").trim().replace(/\/$/, "");
  var elements = {
    article: app.querySelector("[data-story-public-article]"),
    state: app.querySelector("[data-story-public-state]"),
    date: app.querySelector("[data-story-public-date]"),
    minutes: app.querySelector("[data-story-public-minutes]"),
    title: app.querySelector("[data-story-public-title]"),
    subtitle: app.querySelector("[data-story-public-subtitle]"),
    cover: app.querySelector("[data-story-public-cover]"),
    body: app.querySelector("[data-story-public-body]"),
  };

  function setState(message, mode) {
    if (!elements.state) {
      return;
    }

    elements.state.hidden = !message;
    elements.state.textContent = message || "";
    elements.state.setAttribute("data-mode", mode || "info");
  }

  function resolveMediaUrl(url) {
    var value = String(url || "").trim();

    if (!value) {
      return "";
    }

    if (/^(https?:)?\/\//i.test(value) || value.indexOf("data:") === 0) {
      return value;
    }

    return value.charAt(0) === "/" && apiBase ? apiBase + value : value;
  }

  async function apiJson(path) {
    var response = await fetch(apiBase + path, {
      method: "GET",
      headers: new Headers({ accept: "application/json" }),
    });
    var payload = await response.json().catch(function () {
      return null;
    });

    if (!response.ok) {
      throw new Error(payload && payload.error ? payload.error : "Story request failed.");
    }

    return payload;
  }

  function renderStory(story) {
    var bodyMarkdown = story.bodyMarkdown || "";
    var hero = story.heroMedia || null;

    elements.date.textContent = utils.formatDate(story.publishedAt || story.updatedAt || story.createdAt);
    elements.minutes.textContent = utils.formatReadTime(bodyMarkdown);
    elements.title.textContent = story.title || "Untitled Story";
    elements.subtitle.textContent = story.subtitle || "";
    elements.subtitle.hidden = !story.subtitle;
    elements.body.innerHTML = utils.renderMarkdown(bodyMarkdown, { resolveUrl: resolveMediaUrl });

    if (hero && hero.url) {
      elements.cover.hidden = false;
      elements.cover.src = resolveMediaUrl(hero.url);
      elements.cover.alt = hero.alt || story.title || "Story cover";
    } else {
      elements.cover.hidden = true;
      elements.cover.removeAttribute("src");
      elements.cover.alt = "";
    }

    document.title = (story.title || "Story") + " | Double Hit Collectibles";
    elements.article.hidden = false;
    setState("", "info");
  }

  async function init() {
    var params = new URL(window.location.href).searchParams;
    var slug = String(params.get("slug") || "").trim();

    if (!apiBase) {
      throw new Error("Story API is not configured.");
    }

    if (!slug) {
      throw new Error("Choose a story link with a slug to read this page.");
    }

    setState("Loading story...", "info");
    var payload = await apiJson("/api/stories/" + encodeURIComponent(slug));
    renderStory(payload.story);
  }

  init().catch(function (error) {
    if (elements.article) {
      elements.article.hidden = true;
    }

    setState(error instanceof Error ? error.message : "Story could not be loaded.", "error");
  });
})();
