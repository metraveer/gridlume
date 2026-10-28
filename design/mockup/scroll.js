// Scroll hints: any element that scrolls gets a soft fade on the edge that still hides content,
// and briefly shows its thin scrollbar while it is being scrolled. Works for elements added later too.

(function () {
  var timers = new WeakMap();

  function update(el) {
    var canUp = el.scrollTop > 2;
    var canDown = el.scrollTop + el.clientHeight < el.scrollHeight - 2;
    el.classList.toggle('fade-top', canUp);
    el.classList.toggle('fade-bottom', canDown);
  }

  function scrollable(el) {
    if (!(el instanceof HTMLElement)) return false;
    var oy = getComputedStyle(el).overflowY;
    return (oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 2;
  }

  function scan() {
    document.querySelectorAll('body *').forEach(function (el) {
      if (scrollable(el)) update(el);
      else if (el.classList.contains('fade-bottom') || el.classList.contains('fade-top')) el.classList.remove('fade-bottom', 'fade-top');
    });
  }

  document.addEventListener('scroll', function (e) {
    var el = e.target;
    if (!(el instanceof HTMLElement)) return;
    update(el);
    el.classList.add('is-scrolling');
    clearTimeout(timers.get(el));
    timers.set(el, setTimeout(function () { el.classList.remove('is-scrolling'); }, 700));
  }, true);

  // Content changes all the time (live logs, inspector re-renders): re-check, but not more than once a frame.
  var pending = false;
  new MutationObserver(function () {
    if (pending) return;
    pending = true;
    requestAnimationFrame(function () { pending = false; scan(); });
  }).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('resize', scan);
  document.addEventListener('DOMContentLoaded', scan);
})();
