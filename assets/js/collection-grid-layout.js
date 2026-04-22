(function (root) {
  function normalizeCards(cards) {
    return Array.isArray(cards) ? cards : [];
  }

  function getCardKey(card) {
    return card?.instanceKey || card?.id || "";
  }

  function getInlineDetailSpan(columnCount) {
    const columns = Math.max(1, Number(columnCount) || 1);

    if (columns >= 3) {
      return 2;
    }

    return 1;
  }

  function buildInlineDetailLayout(cards, selectedCardId, columnCount) {
    const normalizedCards = normalizeCards(cards);
    const columns = Math.max(1, Number(columnCount) || 1);

    if (!selectedCardId) {
      return normalizedCards.map((card) => ({ type: "card", card }));
    }

    const selectedIndex = normalizedCards.findIndex((card) => getCardKey(card) === selectedCardId);

    if (selectedIndex === -1) {
      return normalizedCards.map((card) => ({ type: "card", card }));
    }

    const detailSpan = getInlineDetailSpan(columns);
    const rowStart = Math.floor(selectedIndex / columns) * columns;
    const rowEnd = Math.min(rowStart + columns, normalizedCards.length);
    const beforeRow = normalizedCards.slice(0, rowStart).map((card) => ({ type: "card", card }));
    const rowCards = normalizedCards.slice(rowStart, rowEnd);
    const selectedRowIndex = selectedIndex - rowStart;
    const leadCount = Math.min(selectedRowIndex, Math.max(0, columns - detailSpan - 1));
    const prefixCards = rowCards
      .slice(0, leadCount)
      .map((card) => ({ type: "card", card }));
    const selectedCard = normalizedCards[selectedIndex];
    const suffixCards = rowCards
      .filter((card, index) => getCardKey(card) !== selectedCardId && index >= leadCount)
      .map((card) => ({ type: "card", card }));
    const afterRow = normalizedCards.slice(rowEnd).map((card) => ({ type: "card", card }));

    return [
      ...beforeRow,
      ...prefixCards,
      { type: "card", card: selectedCard },
      { type: "detail", cardId: selectedCardId, span: detailSpan },
      ...suffixCards,
      ...afterRow,
    ];
  }

  root.CollectionGridLayout = {
    buildInlineDetailLayout,
    getInlineDetailSpan,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
