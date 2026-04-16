(function () {
  var header = document.querySelector(".bar-header");

  if (!header) {
    return;
  }

  function syncHeaderState() {
    var scrolled = window.pageYOffset || document.documentElement.scrollTop || 0;
    header.classList.toggle("is-scrolled", scrolled > 4);
  }

  window.addEventListener("scroll", syncHeaderState, { passive: true });
  window.addEventListener("resize", syncHeaderState);
  syncHeaderState();
})();
