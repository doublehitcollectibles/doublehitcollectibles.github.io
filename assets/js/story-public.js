(function () {
  var utils = window.DoubleHitStories;
  var detailApp = document.querySelector("[data-story-public-app]");
  var indexApp = document.querySelector("[data-story-index-app]");

  if (!utils || (!detailApp && !indexApp)) {
    return;
  }

  function getApiBase(app) {
    var apiMeta = document.querySelector('meta[name="doublehit-worker-api-base"]');
    var apiBase = String(app && app.dataset.apiBase || "").trim() ||
      String(apiMeta && apiMeta.getAttribute("content") || "").trim();
    return apiBase.replace(/\/$/, "");
  }

  function resolveMediaUrl(url, apiBase) {
    var value = String(url || "").trim();

    if (!value) {
      return "";
    }

    if (/^(https?:)?\/\//i.test(value) || value.indexOf("data:") === 0) {
      return value;
    }

    return value.charAt(0) === "/" && apiBase ? apiBase + value : value;
  }

  async function apiJson(apiBase, path) {
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

  function buildStoryUrl(templateUrl, slug) {
    var storyUrl = new URL(templateUrl || "/story/", window.location.origin);
    storyUrl.searchParams.set("slug", slug);
    return storyUrl.toString();
  }

  function readMinutes(markdown) {
    var match = /^(\d+)/.exec(utils.formatReadTime(markdown));
    return match ? Number(match[1]) || 1 : 1;
  }

  function wordCount(markdown) {
    return String(markdown || "")
      .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
      .replace(/\[[^\]]+\]\([^)]+\)/g, " ")
      .replace(/[#>*_`~\-]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
  }

  function updateMetaSelector(selector, attributeName, value) {
    var element = document.querySelector(selector);

    if (element && value) {
      element.setAttribute(attributeName, value);
    }
  }

  function updateShareLinks(story, storyUrl) {
    var description = story.description || story.subtitle || story.title || "Double Hit Collectibles story";
    var twitter = document.querySelector('.author-share-links a[href*="twitter.com/intent"]');
    var facebook = document.querySelector('.author-share-links a[href*="facebook.com/sharer"]');

    if (twitter) {
      twitter.href = "https://twitter.com/intent/tweet?text=" +
        encodeURIComponent('"' + description + '" ' + storyUrl);
    }

    if (facebook) {
      facebook.href = "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(storyUrl);
    }
  }

  function updateStoryMetadata(story, storyUrl, heroUrl) {
    var title = story.title || "Story";
    var description = story.description || story.subtitle || "Read a Double Hit Collectibles story.";

    document.title = title + " | Double Hit Collectibles";
    updateMetaSelector('meta[name="description"]', "content", description);
    updateMetaSelector('meta[name="twitter:title"]', "content", document.title);
    updateMetaSelector('meta[name="twitter:description"]', "content", description);
    updateMetaSelector('meta[property="og:title"]', "content", document.title);
    updateMetaSelector('meta[property="og:description"]', "content", description);
    updateMetaSelector('meta[property="og:url"]', "content", storyUrl);
    updateMetaSelector('link[rel="canonical"]', "href", storyUrl);

    if (heroUrl) {
      updateMetaSelector('meta[property="twitter:image"]', "content", heroUrl);
      updateMetaSelector('meta[property="og:image"]', "content", heroUrl);
    }
  }

  function updateStructuredData(story, storyUrl, heroUrl) {
    var script = document.querySelector("[data-story-public-jsonld]");

    if (!script) {
      return;
    }

    script.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      name: story.title,
      headline: story.subtitle || story.title,
      description: story.description || story.subtitle || "",
      image: heroUrl || "",
      url: storyUrl,
      articleBody: story.bodyMarkdown || "",
      wordcount: wordCount(story.bodyMarkdown),
      inLanguage: document.documentElement.lang || "en",
      dateCreated: story.createdAt || "",
      datePublished: story.publishedAt || story.createdAt || "",
      dateModified: story.updatedAt || story.publishedAt || story.createdAt || "",
      author: {
        "@type": "Person",
        name: "Double Hit Collectibles",
      },
      publisher: {
        "@type": "Organization",
        name: "Double Hit Collectibles",
        url: window.location.origin + "/",
      },
      mainEntityOfPage: storyUrl,
    }, null, 2);
  }

  function initDetail() {
    if (!detailApp) {
      return;
    }

    var apiBase = getApiBase(detailApp);
    var elements = {
      article: detailApp.querySelector("[data-story-public-article]"),
      state: detailApp.querySelector("[data-story-public-state]"),
      date: detailApp.querySelector("[data-story-public-date]"),
      minutes: detailApp.querySelector("[data-story-public-minutes]"),
      title: detailApp.querySelector("[data-story-public-title]"),
      subtitle: detailApp.querySelector("[data-story-public-subtitle]"),
      cover: detailApp.querySelector("[data-story-public-cover]"),
      body: detailApp.querySelector("[data-story-public-body]"),
      timebar: document.querySelector("[data-story-public-timebar]"),
    };

    function setState(message, mode) {
      if (!elements.state) {
        return;
      }

      elements.state.hidden = !message;
      elements.state.textContent = message || "";
      elements.state.setAttribute("data-mode", mode || "info");
    }

    function renderStory(story) {
      var bodyMarkdown = story.bodyMarkdown || "";
      var hero = story.heroMedia || null;
      var heroUrl = hero && hero.url ? resolveMediaUrl(hero.url, apiBase) : "";
      var storyUrl = window.location.href;
      var publishedDate = story.publishedAt || story.updatedAt || story.createdAt;
      var minutes = readMinutes(bodyMarkdown);

      elements.date.textContent = utils.formatDate(publishedDate);
      elements.date.setAttribute("datetime", publishedDate || "");
      elements.minutes.textContent = utils.formatReadTime(bodyMarkdown);
      elements.title.textContent = story.title || "Untitled Story";
      elements.subtitle.textContent = story.subtitle || "";
      elements.subtitle.hidden = !story.subtitle;
      elements.body.innerHTML = utils.renderMarkdown(bodyMarkdown, {
        resolveUrl: function (url) {
          return resolveMediaUrl(url, apiBase);
        },
      });

      if (elements.timebar) {
        elements.timebar.setAttribute("data-minutes", String(minutes));
      }

      if (heroUrl) {
        elements.cover.hidden = false;
        elements.cover.src = heroUrl;
        elements.cover.alt = hero.alt || story.title || "Story cover";
      } else {
        elements.cover.hidden = true;
        elements.cover.removeAttribute("src");
        elements.cover.alt = "";
      }

      updateStoryMetadata(story, storyUrl, heroUrl);
      updateShareLinks(story, storyUrl);
      updateStructuredData(story, storyUrl, heroUrl);
      elements.article.hidden = false;
      setState("", "info");
      window.dispatchEvent(new Event("resize"));
    }

    async function loadStory() {
      var params = new URL(window.location.href).searchParams;
      var slug = String(params.get("slug") || "").trim();

      if (!apiBase) {
        throw new Error("Story API is not configured.");
      }

      if (!slug) {
        throw new Error("Choose a published story from the Stories page.");
      }

      setState("Loading story...", "info");
      var payload = await apiJson(apiBase, "/api/stories/" + encodeURIComponent(slug));
      renderStory(payload.story);
    }

    loadStory().catch(function (error) {
      if (elements.article) {
        elements.article.hidden = true;
      }

      setState(error instanceof Error ? error.message : "Story could not be loaded.", "error");
    });
  }

  function initIndex() {
    if (!indexApp) {
      return;
    }

    var apiBase = getApiBase(indexApp);
    var templateUrl = String(indexApp.dataset.storyTemplateUrl || "/story/").trim() || "/story/";
    var elements = {
      status: indexApp.querySelector("[data-story-index-status]"),
      list: indexApp.querySelector("[data-story-index-list]"),
    };

    function setStatus(message, mode) {
      if (!elements.status) {
        return;
      }

      elements.status.hidden = !message;
      elements.status.textContent = message || "";
      elements.status.setAttribute("data-mode", mode || "info");
    }

    function renderStories(stories) {
      if (!Array.isArray(stories) || !stories.length) {
        elements.list.innerHTML = "";
        setStatus("No published stories yet. Check back soon.", "info");
        return;
      }

      elements.list.innerHTML = stories.map(function (story) {
        var hero = story.heroMedia || null;
        var heroUrl = hero && hero.url ? resolveMediaUrl(hero.url, apiBase) : "";
        var storyUrl = buildStoryUrl(templateUrl, story.slug);
        var description = story.description || story.subtitle || "Read this Double Hit Collectibles story.";

        return [
          '<article class="story-index-card">',
          '<a class="story-index-cover" href="' + utils.escapeAttribute(storyUrl) + '">',
          heroUrl
            ? '<img src="' + utils.escapeAttribute(heroUrl) + '" alt="' + utils.escapeAttribute(hero.alt || story.title) + '">'
            : '<span aria-hidden="true"></span>',
          '</a>',
          '<div class="story-index-card-copy">',
          '<time datetime="' + utils.escapeAttribute(story.publishedAt || story.updatedAt || story.createdAt || "") + '">' +
          utils.escapeHtml(utils.formatDate(story.publishedAt || story.updatedAt || story.createdAt)) +
          '</time>',
          '<h2><a href="' + utils.escapeAttribute(storyUrl) + '">' + utils.escapeHtml(story.title || "Untitled Story") + '</a></h2>',
          '<p>' + utils.escapeHtml(description) + '</p>',
          '<a class="story-index-read-link" href="' + utils.escapeAttribute(storyUrl) + '">Read Story</a>',
          '</div>',
          '</article>',
        ].join("");
      }).join("");
      setStatus("", "info");
    }

    async function loadStories() {
      if (!apiBase) {
        throw new Error("Story API is not configured.");
      }

      setStatus("Loading published stories...", "info");
      var payload = await apiJson(apiBase, "/api/stories");
      renderStories(payload.stories);
    }

    loadStories().catch(function (error) {
      elements.list.innerHTML = "";
      setStatus(error instanceof Error ? error.message : "Stories could not be loaded.", "error");
    });
  }

  initDetail();
  initIndex();
})();
