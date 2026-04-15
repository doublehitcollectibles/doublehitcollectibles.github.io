import * as pretext from "@chenglou/pretext";
import * as richInline from "@chenglou/pretext/rich-inline";

const componentState = new WeakMap();
const selectors = {
  balance: "[data-pretext-balance]",
  measure: "[data-pretext-measure]",
  richInline: "[data-pretext-rich-inline]"
};

let resizeFrame = 0;

function getState(element) {
  if (!componentState.has(element)) {
    componentState.set(element, {});
  }

  return componentState.get(element);
}

function normalizeWhitespace(value) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function onReady(callback) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", callback, { once: true });
    return;
  }

  callback();
}

function readNumberData(element, name, fallback) {
  const rawValue = element.dataset[name];
  const parsedValue = Number(rawValue);
  return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

function fontFromElement(element) {
  const styles = window.getComputedStyle(element);
  if (styles.font && styles.font.length > 0) {
    return styles.font;
  }

  const parts = [];
  if (styles.fontStyle && styles.fontStyle !== "normal") {
    parts.push(styles.fontStyle);
  }
  if (styles.fontVariant && styles.fontVariant !== "normal") {
    parts.push(styles.fontVariant);
  }
  if (styles.fontWeight) {
    parts.push(styles.fontWeight);
  }
  if (styles.fontStretch && styles.fontStretch !== "normal") {
    parts.push(styles.fontStretch);
  }

  parts.push(styles.fontSize || "16px");
  parts.push(styles.fontFamily || "sans-serif");
  return parts.join(" ");
}

function lineHeightFromElement(element) {
  const styles = window.getComputedStyle(element);
  const computedLineHeight = Number.parseFloat(styles.lineHeight);
  if (Number.isFinite(computedLineHeight)) {
    return computedLineHeight;
  }

  const fontSize = Number.parseFloat(styles.fontSize);
  return Number.isFinite(fontSize) ? fontSize * 1.35 : 24;
}

function containerWidthFor(element) {
  const container = element.closest("[data-pretext-balance-container]") || element.parentElement || element;
  return Math.floor(container.clientWidth || element.clientWidth || 0);
}

function extractMeasureText(element) {
  const clone = element.cloneNode(true);
  clone.querySelectorAll("script, [data-pretext-measure-output]").forEach((node) => node.remove());
  return normalizeWhitespace(clone.textContent || "");
}

function chooseTargetLineCount(textLength, maxLines) {
  if (textLength > 72) {
    return Math.min(4, maxLines);
  }
  if (textLength > 40) {
    return Math.min(3, maxLines);
  }
  if (textLength > 24) {
    return Math.min(2, maxLines);
  }
  return 1;
}

function scoreLines(lines, width, targetLines) {
  if (!lines.length) {
    return Number.POSITIVE_INFINITY;
  }

  const widths = lines.map((line) => line.width);
  const averageWidth = widths.reduce((total, currentWidth) => total + currentWidth, 0) / widths.length;
  const raggedness = widths.reduce((total, currentWidth) => total + Math.abs(currentWidth - averageWidth), 0) / Math.max(averageWidth, 1);
  const lastLineWidth = widths[widths.length - 1];
  const orphanPenalty = widths.length > 1 && lastLineWidth < averageWidth * 0.58
    ? (averageWidth - lastLineWidth) / Math.max(averageWidth, 1)
    : 0;
  const lineCountPenalty = Math.abs(lines.length - targetLines) * 0.55;
  const narrowPenalty = width < 180 ? 0.2 : 0;
  return raggedness + orphanPenalty + lineCountPenalty + narrowPenalty;
}

function chooseBalancedLayout(prepared, availableWidth, lineHeight, targetLines, maxLines, minRatio) {
  const naturalWidth = Math.max(1, pretext.measureNaturalWidth(prepared));
  const upperBound = Math.max(1, Math.min(availableWidth, naturalWidth));
  const lowerBound = Math.max(140, Math.floor(upperBound * minRatio));

  let bestWidth = upperBound;
  let bestResult = pretext.layoutWithLines(prepared, upperBound, lineHeight);
  let bestScore = scoreLines(bestResult.lines, upperBound, targetLines);

  if (upperBound <= lowerBound + 8) {
    return { width: bestWidth, result: bestResult };
  }

  for (let sampleIndex = 0; sampleIndex < 16; sampleIndex += 1) {
    const candidateWidth = Math.round(lowerBound + ((upperBound - lowerBound) * sampleIndex) / 15);
    const candidateResult = pretext.layoutWithLines(prepared, candidateWidth, lineHeight);

    if (candidateResult.lineCount > maxLines) {
      continue;
    }

    const candidateScore = scoreLines(candidateResult.lines, candidateWidth, targetLines);
    if (candidateScore < bestScore) {
      bestWidth = candidateWidth;
      bestResult = candidateResult;
      bestScore = candidateScore;
    }
  }

  return { width: bestWidth, result: bestResult };
}

function renderBalancedText(element) {
  const state = getState(element);
  const sourceText = state.balanceSource || normalizeWhitespace(element.dataset.pretextSource || element.textContent || "");
  if (!sourceText) {
    return;
  }

  state.balanceSource = sourceText;

  const availableWidth = containerWidthFor(element);
  if (availableWidth < 120) {
    return;
  }

  const lineHeight = lineHeightFromElement(element);
  const maxLines = Math.max(1, Math.round(readNumberData(element, "pretextMaxLines", 4)));
  const targetLines = Math.max(1, Math.round(readNumberData(element, "pretextTargetLines", chooseTargetLineCount(sourceText.length, maxLines))));
  const minRatio = Math.min(0.92, Math.max(0.38, readNumberData(element, "pretextMinRatio", sourceText.length > 60 ? 0.42 : 0.56)));
  const prepared = pretext.prepareWithSegments(sourceText, fontFromElement(element));
  const balancedLayout = chooseBalancedLayout(prepared, availableWidth, lineHeight, targetLines, maxLines, minRatio);

  if (balancedLayout.result.lines.length <= 1) {
    element.textContent = sourceText;
    element.style.removeProperty("max-width");
    element.dataset.pretextReady = "true";
    element.dataset.pretextLineCount = "1";
    return;
  }

  const linesFragment = document.createDocumentFragment();
  balancedLayout.result.lines.forEach((line) => {
    const lineElement = document.createElement("span");
    lineElement.className = "pretext-balance-line";
    lineElement.textContent = line.text;
    linesFragment.appendChild(lineElement);
  });

  element.replaceChildren(linesFragment);
  element.setAttribute("aria-label", sourceText);
  element.style.maxWidth = `${Math.ceil(balancedLayout.width)}px`;
  element.dataset.pretextReady = "true";
  element.dataset.pretextLineCount = String(balancedLayout.result.lineCount);
}

function renderMeasuredText(element) {
  const state = getState(element);
  const sourceText = state.measureSource || extractMeasureText(element);
  if (!sourceText) {
    return;
  }

  state.measureSource = sourceText;

  const availableWidth = Math.max(1, Math.floor(element.clientWidth || containerWidthFor(element)));
  const lineHeight = lineHeightFromElement(element);
  const options = {
    whiteSpace: element.dataset.pretextWhiteSpace === "pre-wrap" ? "pre-wrap" : "normal",
    wordBreak: element.dataset.pretextWordBreak === "keep-all" ? "keep-all" : "normal"
  };
  const prepared = pretext.prepare(sourceText, fontFromElement(element), options);
  const measurement = pretext.layout(prepared, availableWidth, lineHeight);
  const height = Math.ceil(measurement.height);

  element.style.setProperty("--pretext-measured-height", `${height}px`);
  element.style.setProperty("--pretext-line-count", String(measurement.lineCount));
  element.dataset.pretextMeasuredHeight = String(height);
  element.dataset.pretextLineCount = String(measurement.lineCount);
  element.dataset.pretextReady = "true";

  const output = element.querySelector("[data-pretext-measure-output]");
  if (output) {
    output.textContent = `${measurement.lineCount} predicted lines`;
  }
}

function parseRichInlineItems(element) {
  const state = getState(element);
  if (state.richInlineItems) {
    return state.richInlineItems;
  }

  const sourceNode = element.querySelector("script.pretext-rich-inline-source");
  if (!sourceNode) {
    state.richInlineItems = [];
    return state.richInlineItems;
  }

  try {
    const parsedItems = JSON.parse(sourceNode.textContent || "[]");
    state.richInlineItems = Array.isArray(parsedItems) ? parsedItems : [];
  } catch (error) {
    console.error("Could not parse Pretext rich inline items.", error);
    state.richInlineItems = [];
  }

  return state.richInlineItems;
}

function renderRichInlineText(element) {
  const items = parseRichInlineItems(element);
  if (!items.length) {
    return;
  }

  const availableWidth = containerWidthFor(element);
  if (availableWidth < 120) {
    return;
  }

  const defaultFont = fontFromElement(element);
  const normalizedItems = items.map((item) => ({
    text: item.text || "",
    font: item.font || defaultFont,
    break: item.break === "never" ? "never" : "normal",
    extraWidth: Number.isFinite(Number(item.extraWidth)) ? Number(item.extraWidth) : 0,
    className: item.className || "",
    title: item.title || ""
  }));
  const prepared = richInline.prepareRichInline(
    normalizedItems.map((item) => ({
      text: item.text,
      font: item.font,
      break: item.break,
      extraWidth: item.extraWidth
    }))
  );
  const lines = [];

  richInline.walkRichInlineLineRanges(prepared, availableWidth, (range) => {
    lines.push(richInline.materializeRichInlineLineRange(prepared, range));
  });

  const rebuiltContent = document.createDocumentFragment();
  const sourceNode = document.createElement("script");
  sourceNode.type = "application/json";
  sourceNode.className = "pretext-rich-inline-source";
  sourceNode.textContent = JSON.stringify(items);
  rebuiltContent.appendChild(sourceNode);

  lines.forEach((line) => {
    const lineElement = document.createElement("div");
    lineElement.className = "pretext-rich-line";

    line.fragments.forEach((fragment) => {
      const sourceItem = normalizedItems[fragment.itemIndex] || {};
      const fragmentElement = document.createElement("span");
      fragmentElement.className = "pretext-rich-fragment";
      if (sourceItem.className) {
        sourceItem.className.split(/\s+/).filter(Boolean).forEach((className) => fragmentElement.classList.add(className));
      }
      if (sourceItem.title) {
        fragmentElement.title = sourceItem.title;
      }
      if (fragment.gapBefore > 0) {
        fragmentElement.style.marginInlineStart = `${fragment.gapBefore}px`;
      }
      fragmentElement.textContent = fragment.text;
      lineElement.appendChild(fragmentElement);
    });

    rebuiltContent.appendChild(lineElement);
  });

  element.replaceChildren(rebuiltContent);
  element.setAttribute("aria-label", normalizeWhitespace(normalizedItems.map((item) => item.text).join(" ")));
  element.dataset.pretextReady = "true";
  element.dataset.pretextLineCount = String(lines.length);
}

function renderComponentSet(root = document) {
  root.querySelectorAll(selectors.balance).forEach((element) => {
    try {
      renderBalancedText(element);
    } catch (error) {
      console.error("Pretext balance rendering failed.", error);
    }
  });

  root.querySelectorAll(selectors.measure).forEach((element) => {
    try {
      renderMeasuredText(element);
    } catch (error) {
      console.error("Pretext measurement failed.", error);
    }
  });

  root.querySelectorAll(selectors.richInline).forEach((element) => {
    try {
      renderRichInlineText(element);
    } catch (error) {
      console.error("Pretext rich inline rendering failed.", error);
    }
  });
}

function scheduleRefresh() {
  window.cancelAnimationFrame(resizeFrame);
  resizeFrame = window.requestAnimationFrame(() => {
    renderComponentSet(document);
  });
}

const runtime = {
  api: pretext,
  richInline,
  components: {
    renderBalancedText,
    renderMeasuredText,
    renderRichInlineText
  },
  refresh(root = document) {
    renderComponentSet(root);
  }
};

window.DoubleHitPretext = runtime;

onReady(() => {
  renderComponentSet(document);
  window.addEventListener("resize", scheduleRefresh);

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => scheduleRefresh()).catch(() => {});
  }

  document.dispatchEvent(new CustomEvent("doublehit:pretext:ready"));
});
