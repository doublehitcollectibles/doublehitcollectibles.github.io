(function () {
  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }

  function safeUrl(value) {
    var url = String(value || "").trim();

    if (!url) {
      return "#";
    }

    if (/^(https?:)?\/\//i.test(url) || url.charAt(0) === "/" || url.charAt(0) === "#" || /^mailto:/i.test(url)) {
      return url;
    }

    return "#";
  }

  function slugify(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/['"]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
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

  function readMinutes(markdown) {
    return Math.max(1, Math.ceil(wordCount(markdown) / 220));
  }

  function formatReadTime(markdown) {
    var minutes = readMinutes(markdown);
    return minutes + " min read";
  }

  function formatDate(value) {
    if (!value) {
      return "Draft preview";
    }

    var date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "Draft preview";
    }

    return new Intl.DateTimeFormat("en", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(date);
  }

  function normalizeOptions(options) {
    return options && typeof options === "object" ? options : {};
  }

  function resolveUrl(url, options) {
    var settings = normalizeOptions(options);

    if (typeof settings.resolveUrl === "function") {
      return settings.resolveUrl(url);
    }

    return url;
  }

  function renderInline(value, options) {
    var text = escapeHtml(value);

    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (_match, label, url) {
      var href = safeUrl(resolveUrl(url, options));
      return '<a href="' + escapeAttribute(href) + '" target="_blank" rel="noopener">' + escapeHtml(label) + "</a>";
    });
    text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
    text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/\*([^*]+)\*/g, "<em>$1</em>");

    return text;
  }

  function isBlockStart(line) {
    return /^(#{1,3})\s+/.test(line) ||
      /^>\s+/.test(line) ||
      /^[-*]\s+/.test(line) ||
      /^\d+\.\s+/.test(line) ||
      /^!\[[^\]]*\]\([^)]+\)$/.test(line);
  }

  function renderMarkdown(markdown, options) {
    var lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
    var html = [];
    var index = 0;

    while (index < lines.length) {
      var line = lines[index].trim();

      if (!line) {
        index += 1;
        continue;
      }

      var imageMatch = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(line);

      if (imageMatch) {
        var imageSrc = safeUrl(resolveUrl(imageMatch[2], options));
        var imageAlt = escapeAttribute(imageMatch[1]);
        html.push('<figure><img src="' + escapeAttribute(imageSrc) + '" alt="' + imageAlt + '"></figure>');
        index += 1;
        continue;
      }

      var headingMatch = /^(#{1,3})\s+(.+)$/.exec(line);

      if (headingMatch) {
        var level = headingMatch[1].length + 1;
        html.push("<h" + level + ">" + renderInline(headingMatch[2], options) + "</h" + level + ">");
        index += 1;
        continue;
      }

      if (/^>\s+/.test(line)) {
        var quoteLines = [];

        while (index < lines.length && /^>\s+/.test(lines[index].trim())) {
          quoteLines.push(lines[index].trim().replace(/^>\s+/, ""));
          index += 1;
        }

        html.push("<blockquote><p>" + renderInline(quoteLines.join(" "), options) + "</p></blockquote>");
        continue;
      }

      if (/^[-*]\s+/.test(line)) {
        var items = [];

        while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
          items.push("<li>" + renderInline(lines[index].trim().replace(/^[-*]\s+/, ""), options) + "</li>");
          index += 1;
        }

        html.push("<ul>" + items.join("") + "</ul>");
        continue;
      }

      if (/^\d+\.\s+/.test(line)) {
        var orderedItems = [];

        while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
          orderedItems.push("<li>" + renderInline(lines[index].trim().replace(/^\d+\.\s+/, ""), options) + "</li>");
          index += 1;
        }

        html.push("<ol>" + orderedItems.join("") + "</ol>");
        continue;
      }

      var paragraph = [];

      while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index].trim())) {
        paragraph.push(lines[index].trim());
        index += 1;
      }

      html.push("<p>" + renderInline(paragraph.join(" "), options) + "</p>");
    }

    return html.join("");
  }

  window.DoubleHitStories = {
    escapeHtml: escapeHtml,
    escapeAttribute: escapeAttribute,
    safeUrl: safeUrl,
    slugify: slugify,
    formatDate: formatDate,
    formatReadTime: formatReadTime,
    renderMarkdown: renderMarkdown,
  };
})();
