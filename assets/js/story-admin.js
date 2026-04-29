(function () {
  var app = document.querySelector("[data-story-admin-app]");
  var utils = window.DoubleHitStories;

  if (!app || !utils) {
    return;
  }

  var apiBase = String(app.dataset.apiBase || "").trim().replace(/\/$/, "");
  var storyTemplateUrl = String(app.dataset.storyTemplateUrl || "/story/").trim() || "/story/";
  var tokenStorageKey = "doublehit.collection.admin.token";
  var elements = {
    authCard: app.querySelector("[data-story-auth-card]"),
    workspace: app.querySelector("[data-story-admin-workspace]"),
    status: app.querySelector("[data-story-admin-status]"),
    session: app.querySelector("[data-story-admin-session]"),
    feedback: app.querySelector("[data-story-admin-feedback]"),
    list: app.querySelector("[data-story-list]"),
    form: app.querySelector("[data-story-form]"),
    formTitle: app.querySelector("[data-story-form-title]"),
    newButton: app.querySelector("[data-story-new]"),
    deleteButton: app.querySelector("[data-story-delete]"),
    submitButton: app.querySelector("[data-story-submit]"),
    publicLink: app.querySelector("[data-story-public-link]"),
    uploadHeroButton: app.querySelector("[data-story-upload-hero]"),
    clearHeroButton: app.querySelector("[data-story-clear-hero]"),
    insertMediaButton: app.querySelector("[data-story-insert-media]"),
    previewButton: app.querySelector("[data-story-preview-button]"),
    previewDate: app.querySelector("[data-story-preview-date]"),
    previewMinutes: app.querySelector("[data-story-preview-minutes]"),
    previewTitle: app.querySelector("[data-story-preview-title]"),
    previewSubtitle: app.querySelector("[data-story-preview-subtitle]"),
    previewCover: app.querySelector("[data-story-preview-cover]"),
    previewBody: app.querySelector("[data-story-preview-body]"),
  };
  var fields = elements.form ? elements.form.elements : {};
  var state = {
    token: readStoredToken(),
    user: null,
    stories: [],
    currentStory: null,
    heroMedia: null,
    uploadedHeroFileName: "",
  };

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

  function notifyAuthChanged(options) {
    var detail = options || {};
    window.dispatchEvent(
      new CustomEvent("doublehit-admin-auth-changed", {
        detail: {
          token: typeof detail.token === "string" ? detail.token : state.token,
          username: typeof detail.username === "string" ? detail.username : state.user && state.user.username || "",
          signedOut: Boolean(detail.signedOut),
        },
      }),
    );
  }

  function setStatus(message, mode) {
    if (!elements.status) {
      return;
    }

    elements.status.textContent = message || "";
    elements.status.setAttribute("data-mode", mode || "info");
  }

  function setFeedback(message, mode) {
    if (!elements.feedback) {
      return;
    }

    elements.feedback.hidden = !message;
    elements.feedback.textContent = message || "";
    elements.feedback.setAttribute("data-mode", mode || "info");
  }

  function setAuthenticated(authenticated) {
    if (elements.authCard) {
      elements.authCard.hidden = authenticated;
    }

    if (elements.workspace) {
      elements.workspace.hidden = !authenticated;
    }
  }

  function buildHeaders(authenticated) {
    var headers = new Headers({ accept: "application/json" });

    if (authenticated !== false && state.token) {
      headers.set("authorization", "Bearer " + state.token);
    }

    return headers;
  }

  async function apiJson(path, options) {
    var requestInit = options || {};
    var headers = buildHeaders(requestInit.authenticated);
    var body = requestInit.body;

    if (body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    var response = await fetch(apiBase + path, {
      method: requestInit.method || "GET",
      headers: headers,
      body: body,
    });
    var text = await response.text();
    var payload = text ? JSON.parse(text) : null;

    if (!response.ok) {
      throw new Error(payload && payload.error ? payload.error : "Story request failed.");
    }

    return payload;
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

  function buildPublicStoryUrl(story) {
    var publicUrl = new URL(storyTemplateUrl, window.location.origin);
    publicUrl.searchParams.set("slug", story.slug);
    return publicUrl.toString();
  }

  function setPublicLink(story) {
    if (!elements.publicLink) {
      return;
    }

    if (story && story.status === "published") {
      elements.publicLink.hidden = false;
      elements.publicLink.href = buildPublicStoryUrl(story);
      return;
    }

    elements.publicLink.hidden = true;
    elements.publicLink.removeAttribute("href");
  }

  function fillForm(story) {
    var formStory = story || {};
    fields.storyId.value = formStory.id || "";
    fields.title.value = formStory.title || "";
    fields.slug.value = formStory.slug || "";
    fields.subtitle.value = formStory.subtitle || "";
    fields.description.value = formStory.description || "";
    fields.status.value = formStory.status || "draft";
    fields.heroMediaId.value = formStory.heroMediaId || "";
    fields.heroAlt.value = formStory.heroMedia && formStory.heroMedia.alt || "";
    fields.bodyMarkdown.value = formStory.bodyMarkdown || "";

    if (fields.heroFile) {
      fields.heroFile.value = "";
    }

    if (fields.inlineFile) {
      fields.inlineFile.value = "";
    }

    if (fields.inlineAlt) {
      fields.inlineAlt.value = "";
    }

    state.currentStory = story || null;
    state.heroMedia = formStory.heroMedia || null;
    state.uploadedHeroFileName = "";
    elements.formTitle.textContent = story ? "Edit Story" : "New Story";
    elements.submitButton.textContent = story ? "Update Story" : "Save Story";
    elements.deleteButton.hidden = !story;
    setPublicLink(story);
    renderPreview();
  }

  function collectPayload() {
    var title = String(fields.title.value || "").trim();
    var slug = utils.slugify(fields.slug.value || title);

    fields.slug.value = slug;

    return {
      title: title,
      slug: slug,
      subtitle: String(fields.subtitle.value || "").trim(),
      description: String(fields.description.value || "").trim(),
      status: String(fields.status.value || "draft"),
      heroMediaId: fields.heroMediaId.value ? Number(fields.heroMediaId.value) : null,
      bodyMarkdown: String(fields.bodyMarkdown.value || "").trim(),
    };
  }

  function fileToDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();

      reader.onload = function () {
        resolve(String(reader.result || ""));
      };
      reader.onerror = function () {
        reject(new Error("Could not read the selected file."));
      };
      reader.readAsDataURL(file);
    });
  }

  async function uploadFile(file, alt) {
    if (!file) {
      throw new Error("Choose an image or GIF first.");
    }

    if (file.size > 3 * 1024 * 1024) {
      throw new Error("Keep uploads under 3 MB.");
    }

    if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.type || "")) {
      throw new Error("Only PNG, JPG, WebP, and GIF uploads are supported.");
    }

    var dataUrl = await fileToDataUrl(file);
    var payload = await apiJson("/api/admin/story-media", {
      method: "POST",
      body: JSON.stringify({
        filename: file.name || "story-media",
        dataUrl: dataUrl,
        alt: alt || "",
      }),
    });

    return payload.media;
  }

  async function uploadHeroIfNeeded() {
    var file = fields.heroFile && fields.heroFile.files ? fields.heroFile.files[0] : null;

    if (!file) {
      return state.heroMedia;
    }

    if (state.uploadedHeroFileName === file.name && state.heroMedia && state.heroMedia.id) {
      return state.heroMedia;
    }

    setFeedback("Uploading hero media...", "info");
    state.heroMedia = await uploadFile(file, String(fields.heroAlt.value || "").trim());
    state.uploadedHeroFileName = file.name;
    fields.heroMediaId.value = state.heroMedia.id;
    renderPreview();
    setFeedback("Hero media uploaded.", "worker");
    return state.heroMedia;
  }

  function insertTextAtCursor(textarea, text) {
    var start = textarea.selectionStart || textarea.value.length;
    var end = textarea.selectionEnd || textarea.value.length;
    var before = textarea.value.slice(0, start);
    var after = textarea.value.slice(end);
    var prefix = before && !before.endsWith("\n") ? "\n\n" : "";
    var suffix = after && !after.startsWith("\n") ? "\n\n" : "";

    textarea.value = before + prefix + text + suffix + after;
    textarea.focus();
    textarea.selectionStart = textarea.selectionEnd = (before + prefix + text).length;
  }

  function renderList() {
    if (!elements.list) {
      return;
    }

    if (!state.stories.length) {
      elements.list.innerHTML = '<div class="collection-empty">No stories yet. Start with the editor on the right.</div>';
      return;
    }

    elements.list.innerHTML = state.stories.map(function (story) {
      var date = utils.formatDate(story.publishedAt || story.updatedAt || story.createdAt);
      var description = story.description || story.subtitle || "No summary yet.";
      var viewLink = story.status === "published"
        ? '<a class="collection-action-link story-admin-mini-link" href="' + utils.escapeAttribute(buildPublicStoryUrl(story)) + '" target="_blank" rel="noopener">View</a>'
        : "";

      return [
        '<article class="collection-admin-entry story-admin-entry" data-story-id="' + story.id + '">',
        '<div class="collection-admin-entry-copy">',
        story.heroMedia && story.heroMedia.url
          ? '<img src="' + utils.escapeAttribute(resolveMediaUrl(story.heroMedia.url)) + '" alt="' + utils.escapeAttribute(story.heroMedia.alt || story.title) + '">'
          : '<div class="story-admin-entry-placeholder" aria-hidden="true"></div>',
        '<div>',
        '<h3>' + utils.escapeHtml(story.title) + '</h3>',
        '<p>' + utils.escapeHtml(description) + '</p>',
        '<div class="collection-admin-entry-meta">',
        '<span>' + utils.escapeHtml(story.status) + '</span>',
        '<span>' + utils.escapeHtml(date) + '</span>',
        '<span>/' + utils.escapeHtml(story.slug) + '</span>',
        '</div>',
        '</div>',
        '</div>',
        '<div class="collection-admin-entry-actions">',
        '<button type="button" class="collection-admin-secondary" data-story-edit="' + story.id + '">Edit</button>',
        viewLink,
        '</div>',
        '</article>',
      ].join("");
    }).join("");
  }

  async function loadStories() {
    elements.list.textContent = "Loading stories...";
    var payload = await apiJson("/api/admin/stories");
    state.stories = Array.isArray(payload.stories) ? payload.stories : [];
    renderList();
  }

  function renderPreview() {
    var title = String(fields.title.value || "").trim() || "Untitled Story";
    var subtitle = String(fields.subtitle.value || "").trim();
    var bodyMarkdown = String(fields.bodyMarkdown.value || "").trim();
    var hero = state.heroMedia;

    elements.previewDate.textContent = utils.formatDate(state.currentStory && (state.currentStory.publishedAt || state.currentStory.updatedAt));
    elements.previewMinutes.textContent = utils.formatReadTime(bodyMarkdown);
    elements.previewTitle.textContent = title;
    elements.previewSubtitle.textContent = subtitle || "Add a subtitle to shape the hook.";
    elements.previewSubtitle.hidden = false;
    elements.previewBody.innerHTML = bodyMarkdown
      ? utils.renderMarkdown(bodyMarkdown, { resolveUrl: resolveMediaUrl })
      : "<p>Start writing and your preview will appear here.</p>";

    if (hero && hero.url) {
      elements.previewCover.hidden = false;
      elements.previewCover.src = resolveMediaUrl(hero.url);
      elements.previewCover.alt = hero.alt || title;
    } else {
      elements.previewCover.hidden = true;
      elements.previewCover.removeAttribute("src");
      elements.previewCover.alt = "";
    }
  }

  async function saveStory(event) {
    event.preventDefault();
    await uploadHeroIfNeeded();

    var payload = collectPayload();
    var id = Number(fields.storyId.value || 0);
    var saved = await apiJson(id ? "/api/admin/stories/" + id : "/api/admin/stories", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(payload),
    });

    state.currentStory = saved.story;
    state.heroMedia = saved.story.heroMedia || state.heroMedia;
    fillForm(saved.story);
    await loadStories();
    setFeedback(saved.story.status === "published" ? "Story published." : "Draft saved.", "worker");
    setStatus("Story workspace ready.", "worker");
  }

  async function deleteCurrentStory() {
    var id = Number(fields.storyId.value || 0);

    if (!id) {
      return;
    }

    if (!window.confirm("Delete this story? This cannot be undone.")) {
      return;
    }

    await apiJson("/api/admin/stories/" + id, { method: "DELETE" });
    fillForm(null);
    await loadStories();
    setFeedback("Story deleted.", "worker");
  }

  async function insertInlineMedia() {
    var file = fields.inlineFile && fields.inlineFile.files ? fields.inlineFile.files[0] : null;
    var alt = String(fields.inlineAlt.value || "").trim() || (file && file.name || "Story media");

    setFeedback("Uploading inline media...", "info");
    var media = await uploadFile(file, alt);
    insertTextAtCursor(fields.bodyMarkdown, "\n![" + alt.replace(/\]/g, "") + "](" + media.url + ")\n");
    fields.inlineFile.value = "";
    fields.inlineAlt.value = "";
    renderPreview();
    setFeedback("Inline media inserted.", "worker");
  }

  async function checkSession() {
    if (!apiBase) {
      setAuthenticated(false);
      setStatus("Set site.pokemon_api_base_url to your Cloudflare Worker URL to use story admin.", "error");
      return;
    }

    if (!state.token) {
      setAuthenticated(false);
      setStatus("Admin session required before story creation appears.", "info");
      return;
    }

    try {
      var payload = await apiJson("/api/auth/session");
      state.user = payload.user || null;
      writeStoredToken(state.token);
      setAuthenticated(true);
      elements.session.textContent = "Signed in as " + (state.user && state.user.username || "admin") + ".";
      notifyAuthChanged({
        token: state.token,
        username: state.user && state.user.username || "admin",
      });
      setStatus("Story admin ready.", "worker");
      fillForm(null);
      await loadStories();
    } catch (error) {
      state.token = "";
      state.user = null;
      writeStoredToken("");
      notifyAuthChanged({ signedOut: true, token: "" });
      setAuthenticated(false);
      setStatus(error instanceof Error ? error.message : "Admin session expired.", "error");
    }
  }

  function bindEvents() {
    elements.form.addEventListener("submit", function (event) {
      saveStory(event).catch(function (error) {
        setFeedback(error instanceof Error ? error.message : "Story could not be saved.", "error");
      });
    });

    elements.form.addEventListener("input", function (event) {
      if (event.target === fields.title && !fields.storyId.value && !fields.slug.value) {
        fields.slug.value = utils.slugify(fields.title.value);
      }

      renderPreview();
    });

    fields.slug.addEventListener("blur", function () {
      fields.slug.value = utils.slugify(fields.slug.value || fields.title.value);
    });

    elements.newButton.addEventListener("click", function () {
      fillForm(null);
      setFeedback("Ready for a new story.", "info");
    });

    elements.previewButton.addEventListener("click", renderPreview);

    elements.uploadHeroButton.addEventListener("click", function () {
      uploadHeroIfNeeded().catch(function (error) {
        setFeedback(error instanceof Error ? error.message : "Hero upload failed.", "error");
      });
    });

    elements.clearHeroButton.addEventListener("click", function () {
      state.heroMedia = null;
      state.uploadedHeroFileName = "";
      fields.heroMediaId.value = "";
      fields.heroFile.value = "";
      renderPreview();
    });

    elements.insertMediaButton.addEventListener("click", function () {
      insertInlineMedia().catch(function (error) {
        setFeedback(error instanceof Error ? error.message : "Inline media upload failed.", "error");
      });
    });

    elements.deleteButton.addEventListener("click", function () {
      deleteCurrentStory().catch(function (error) {
        setFeedback(error instanceof Error ? error.message : "Story could not be deleted.", "error");
      });
    });

    elements.list.addEventListener("click", function (event) {
      var editButton = event.target.closest("[data-story-edit]");

      if (!editButton) {
        return;
      }

      var id = Number(editButton.getAttribute("data-story-edit"));
      var story = state.stories.find(function (item) {
        return item.id === id;
      });

      if (story) {
        fillForm(story);
        setFeedback("Editing " + story.title + ".", "info");
      }
    });
  }

  bindEvents();
  checkSession().catch(function (error) {
    setAuthenticated(false);
    setStatus(error instanceof Error ? error.message : "Story workspace failed to initialize.", "error");
  });
})();
