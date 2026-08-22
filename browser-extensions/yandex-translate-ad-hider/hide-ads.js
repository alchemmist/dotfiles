(() => {
  const AD_SELECTOR = [
    '.side-block',
    '[id^="adfox_"]',
    '[id*="adfox" i]',
    '[class*="adfox" i]',
    '[class*="advert" i]',
    '[class*="ad-banner" i]',
    '[data-adfox]',
    '[data-advertisement]',
    'iframe[src*="adfox" i]',
    'iframe[src*="an.yandex" i]',
    'iframe[title*="advert" i]',
    'iframe[title*="реклама" i]'
  ].join(',');

  const hide = (element) => {
    if (!(element instanceof HTMLElement)) return;

    let container = element;
    for (let level = 0; level < 4; level += 1) {
      const parent = container.parentElement;
      if (!parent || parent === document.body || parent === document.documentElement) break;
      if (parent.matches('.side-block')) break;

      const rect = parent.getBoundingClientRect();
      const isRightRail = rect.left >= window.innerWidth * 0.55;
      const isNarrow = rect.width > 0 && rect.width <= window.innerWidth * 0.45;
      const isReasonableHeight = rect.height <= window.innerHeight * 1.25;

      if (!isRightRail || !isNarrow || !isReasonableHeight) break;
      container = parent;
    }

    container.classList.add('yt-ad-hidden');
    container.setAttribute('aria-hidden', 'true');
  };

  const scan = (root = document) => {
    document.querySelectorAll('.app.state-withDirect').forEach((app) => {
      app.classList.remove('state-withDirect');
    });

    if (root instanceof Element && root.matches(AD_SELECTOR)) hide(root);
    root.querySelectorAll?.(AD_SELECTOR).forEach(hide);
  };

  const start = () => {
    scan();

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof Element) scan(node);
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });
  };

  if (document.documentElement) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
