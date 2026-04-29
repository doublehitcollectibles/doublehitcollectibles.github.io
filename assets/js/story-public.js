(function () {
  var utils = window.DoubleHitStories;
  var detailApp = document.querySelector("[data-story-public-app]");
  var indexApp = document.querySelector("[data-story-index-app]");
  var latestHero = document.querySelector("[data-latest-story-hero]");

  if (!utils || (!detailApp && !indexApp && !latestHero)) {
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

  function storyTimestamp(story) {
    var date = new Date(story && (story.publishedAt || story.updatedAt || story.createdAt || story.fallbackPublishedAt) || "");
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  }

  function formatHeroDate(value) {
    var date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    var month = String(date.getMonth() + 1).padStart(2, "0");
    var day = String(date.getDate()).padStart(2, "0");
    var year = String(date.getFullYear());
    return month + "." + day + "." + year;
  }

  function latestStory(stories, fallbackPublishedAt) {
    var latest = {
      isFallback: true,
      fallbackPublishedAt: fallbackPublishedAt,
    };

    (Array.isArray(stories) ? stories : []).forEach(function (story) {
      if (storyTimestamp(story) > storyTimestamp(latest)) {
        latest = story;
      }
    });

    return latest;
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

    function getStaticStories() {
      return Array.prototype.slice.call(indexApp.querySelectorAll("[data-story-index-static-story]"))
        .map(function (element) {
          return {
            isStatic: true,
            title: element.dataset.title || "Untitled Article",
            description: element.dataset.description || "",
            url: element.dataset.url || "",
            coverUrl: element.dataset.coverUrl || "",
            coverAlt: element.dataset.coverAlt || element.dataset.title || "Article cover",
            publishedAt: element.dataset.publishedAt || "",
            cta: element.dataset.cta || "Read Article",
          };
        })
        .filter(function (story) {
          return story.url;
        });
    }

    function setStatus(message, mode) {
      if (!elements.status) {
        return;
      }

      elements.status.hidden = !message;
      elements.status.textContent = message || "";
      elements.status.setAttribute("data-mode", mode || "info");
    }

    function renderStories(stories) {
      var allStories = getStaticStories().concat(Array.isArray(stories) ? stories : []);

      if (!allStories.length) {
        elements.list.innerHTML = "";
        setStatus("No published stories yet. Check back soon.", "info");
        return;
      }

      elements.list.innerHTML = allStories.map(function (story) {
        var hero = story.heroMedia || null;
        var heroUrl = story.coverUrl || (hero && hero.url ? resolveMediaUrl(hero.url, apiBase) : "");
        var storyUrl = story.url || buildStoryUrl(templateUrl, story.slug);
        var description = story.description || story.subtitle || "Read this Double Hit Collectibles story.";
        var publishedAt = story.publishedAt || story.updatedAt || story.createdAt || "";
        var cta = story.cta || "Read Story";

        return [
          '<article class="story-index-card">',
          '<a class="story-index-cover" href="' + utils.escapeAttribute(storyUrl) + '">',
          heroUrl
            ? '<img src="' + utils.escapeAttribute(heroUrl) + '" alt="' + utils.escapeAttribute(story.coverAlt || hero.alt || story.title) + '">'
            : '<span aria-hidden="true"></span>',
          '</a>',
          '<div class="story-index-card-copy">',
          '<time datetime="' + utils.escapeAttribute(publishedAt) + '">' +
          utils.escapeHtml(utils.formatDate(publishedAt)) +
          '</time>',
          '<h2><a href="' + utils.escapeAttribute(storyUrl) + '">' + utils.escapeHtml(story.title || "Untitled Story") + '</a></h2>',
          '<p>' + utils.escapeHtml(description) + '</p>',
          '<a class="story-index-read-link" href="' + utils.escapeAttribute(storyUrl) + '">' + utils.escapeHtml(cta) + '</a>',
          '</div>',
          '</article>',
        ].join("");
      }).join("");
      setStatus("", "info");
    }

    async function loadStories() {
      if (!apiBase) {
        renderStories([]);
        setStatus("Published stories are not configured yet. Showing site articles.", "info");
        return;
      }

      setStatus("Loading published stories...", "info");
      var payload = await apiJson(apiBase, "/api/stories");
      renderStories(payload.stories);
    }

    loadStories().catch(function (error) {
      if (getStaticStories().length) {
        renderStories([]);
        setStatus("Published stories could not be loaded. Showing site articles.", "error");
        return;
      }

      elements.list.innerHTML = "";
      setStatus(error instanceof Error ? error.message : "Stories could not be loaded.", "error");
    });
  }

  function initLatestHero() {
    if (!latestHero) {
      return;
    }

    var apiBase = getApiBase(latestHero);
    var templateUrl = String(latestHero.dataset.storyTemplateUrl || "/story/").trim() || "/story/";
    var fallbackPublishedAt = String(latestHero.dataset.fallbackPublishedAt || "").trim();
    var fallbackImage = String(latestHero.dataset.fallbackImage || "").trim();
    var elements = {
      date: latestHero.querySelector("[data-latest-story-date]"),
      title: latestHero.querySelector("[data-latest-story-title]"),
      description: latestHero.querySelector("[data-latest-story-description]"),
      link: latestHero.querySelector("[data-latest-story-link]"),
    };

    function renderHeroStory(story) {
      if (!story || story.isFallback) {
        return;
      }

      var hero = story.heroMedia || null;
      var heroUrl = hero && hero.url ? resolveMediaUrl(hero.url, apiBase) : fallbackImage;
      var publishedAt = story.publishedAt || story.updatedAt || story.createdAt || "";
      var storyUrl = buildStoryUrl(templateUrl, story.slug);

      if (heroUrl) {
        latestHero.style.backgroundImage = "url(" + JSON.stringify(heroUrl) + ")";
      }

      if (elements.date) {
        elements.date.textContent = formatHeroDate(publishedAt);
        elements.date.setAttribute("datetime", publishedAt);
      }

      if (elements.title) {
        elements.title.textContent = story.title || "Untitled Story";
      }

      if (elements.description) {
        elements.description.textContent = story.description || story.subtitle || "Read the latest Double Hit Collectibles story.";
      }

      if (elements.link) {
        elements.link.href = storyUrl;
      }

      window.dispatchEvent(new Event("resize"));
    }

    async function loadLatestHeroStory() {
      if (!apiBase) {
        return;
      }

      var payload = await apiJson(apiBase, "/api/stories");
      renderHeroStory(latestStory(payload.stories, fallbackPublishedAt));
    }

    loadLatestHeroStory().catch(function () {
      // Keep the server-rendered fallback article if the feed is unavailable.
    });
  }

  initDetail();
  initIndex();
  initLatestHero();
})();
