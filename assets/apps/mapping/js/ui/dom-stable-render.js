const hasDom = typeof window !== 'undefined' && typeof Element !== 'undefined';
const nativeInnerHtml = hasDom ? Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML') : null;
const nativeOuterHtml = hasDom ? Object.getOwnPropertyDescriptor(Element.prototype, 'outerHTML') : null;

if (hasDom && !window.__amyFxDomStableRenderV5Installed && nativeInnerHtml?.get && nativeInnerHtml?.set && nativeOuterHtml?.get && nativeOuterHtml?.set) {
  window.__amyFxDomStableRenderV5Installed = true;

  const REGIME_CARD_ID = 'amy-regime-router-v3';
  let lastAppView = '';
  let patchedAppRenders = 0;
  let replacedViewRenders = 0;
  let patchedCardRenders = 0;
  let removedDuplicateNodes = 0;
  let persistentNodesPreserved = 0;

  function currentView() {
    return String(window.state?.tab || localStorage.getItem('amy_mapping_tab') || 'Dashboard');
  }

  function textKey(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 120);
  }

  function elementKey(node, index = 0) {
    if (!(node instanceof Element)) return `node:${node?.nodeType || 0}:${index}`;
    if (node.id) return `id:${node.id}`;
    if (node.dataset?.stabilityKey) return `stability:${node.dataset.stabilityKey}`;
    if (node.matches('details')) {
      return `details:${textKey(node.querySelector(':scope > summary')?.textContent)}`;
    }
    const heading = node.querySelector(':scope > h1, :scope > h2, :scope > .kicker');
    const className = [...node.classList].sort().join('.');
    const headingText = textKey(heading?.textContent);
    return headingText
      ? `${node.tagName}:${className}:${headingText}`
      : `${node.tagName}:${className}:${index}`;
  }

  function compatible(current, next) {
    if (!current || !next || current.nodeType !== next.nodeType) return false;
    if (current.nodeType === Node.TEXT_NODE || current.nodeType === Node.COMMENT_NODE) return true;
    return current instanceof Element && next instanceof Element && current.tagName === next.tagName;
  }

  function preserveAttribute(name) {
    return name === 'open'
      || name === 'data-bound'
      || name === 'data-amy-disclosure-bound'
      || name === 'data-amy-bound'
      || name === 'data-dom-persistent'
      || name === 'data-stability-key';
  }

  function syncAttributes(current, next) {
    const keepOpen = current instanceof HTMLDetailsElement ? current.open : null;
    const preserved = new Map();
    for (const attribute of [...current.attributes]) {
      if (preserveAttribute(attribute.name)) preserved.set(attribute.name, attribute.value);
      if (!next.hasAttribute(attribute.name) && !preserveAttribute(attribute.name)) {
        current.removeAttribute(attribute.name);
      }
    }
    for (const attribute of [...next.attributes]) {
      if (attribute.name === 'open' && keepOpen !== null) continue;
      if (current.getAttribute(attribute.name) !== attribute.value) {
        current.setAttribute(attribute.name, attribute.value);
      }
    }
    preserved.forEach((value, name) => {
      if (!current.hasAttribute(name)) current.setAttribute(name, value);
    });
    if (keepOpen !== null) current.open = keepOpen;
  }

  function findMatch(currentChildren, used, nextChild, index) {
    const nextKey = elementKey(nextChild, index);
    let match = currentChildren.find((child, childIndex) =>
      !used.has(child)
      && compatible(child, nextChild)
      && elementKey(child, childIndex) === nextKey
    );
    if (match) return match;
    const positional = currentChildren[index];
    if (positional && !used.has(positional) && compatible(positional, nextChild)) return positional;
    return currentChildren.find(child => !used.has(child) && compatible(child, nextChild)) || null;
  }

  function patchChildren(current, next) {
    const currentChildren = [...current.childNodes];
    const nextChildren = [...next.childNodes];
    const used = new Set();
    let cursor = current.firstChild;

    nextChildren.forEach((nextChild, index) => {
      let match = findMatch(currentChildren, used, nextChild, index);
      if (match) {
        used.add(match);
        patchNode(match, nextChild);
      } else {
        match = nextChild.cloneNode(true);
      }
      if (match !== cursor) current.insertBefore(match, cursor);
      cursor = match.nextSibling;
    });

    currentChildren.forEach(child => {
      if (!used.has(child) && child.parentNode === current) child.remove();
    });
  }

  function patchNode(current, next) {
    if (!compatible(current, next)) {
      current.replaceWith(next.cloneNode(true));
      return;
    }
    if (current.nodeType === Node.TEXT_NODE || current.nodeType === Node.COMMENT_NODE) {
      if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue;
      return;
    }

    if (
      current instanceof Element
      && next instanceof Element
      && current.hasAttribute('data-dom-persistent')
      && next.hasAttribute('data-dom-persistent')
    ) {
      persistentNodesPreserved += 1;
      return;
    }

    syncAttributes(current, next);

    if (current instanceof HTMLInputElement || current instanceof HTMLTextAreaElement || current instanceof HTMLSelectElement) {
      if (document.activeElement !== current && current.value !== next.value) current.value = next.value;
    }

    patchChildren(current, next);
  }

  function parseFragment(markup) {
    const template = document.createElement('template');
    nativeInnerHtml.set.call(template, String(markup ?? ''));
    return template.content;
  }

  function patchSameViewApp(app, fragment) {
    const currentChildren = [...app.children];
    const nextChildren = [...fragment.children];
    const pools = new Map();
    const used = new Set();

    currentChildren.forEach((node, index) => {
      const key = elementKey(node, index);
      const pool = pools.get(key) || [];
      pool.push(node);
      pools.set(key, pool);
    });

    let cursor = app.firstElementChild;
    nextChildren.forEach((nextNode, index) => {
      const key = elementKey(nextNode, index);
      const pool = pools.get(key) || [];
      let current = pool.find(node => !used.has(node) && compatible(node, nextNode)) || null;

      if (current) {
        used.add(current);
        patchNode(current, nextNode);
      } else {
        current = nextNode.cloneNode(true);
      }

      if (current !== cursor) app.insertBefore(current, cursor);
      cursor = current.nextElementSibling;
    });

    currentChildren.forEach(node => {
      if (!used.has(node) && node.parentNode === app) {
        node.remove();
        removedDuplicateNodes += 1;
      }
    });

    patchedAppRenders += 1;
  }

  Object.defineProperty(Element.prototype, 'innerHTML', {
    configurable: nativeInnerHtml.configurable,
    enumerable: nativeInnerHtml.enumerable,
    get: nativeInnerHtml.get,
    set(markup) {
      if (this.id !== 'app' || !this.childElementCount) {
        nativeInnerHtml.set.call(this, markup);
        if (this.id === 'app') lastAppView = currentView();
        return;
      }

      const view = currentView();
      if (lastAppView && lastAppView !== view) {
        nativeInnerHtml.set.call(this, markup);
        lastAppView = view;
        replacedViewRenders += 1;
        return;
      }

      patchSameViewApp(this, parseFragment(markup));
      lastAppView = view;
    }
  });

  Object.defineProperty(Element.prototype, 'outerHTML', {
    configurable: nativeOuterHtml.configurable,
    enumerable: nativeOuterHtml.enumerable,
    get: nativeOuterHtml.get,
    set(markup) {
      if (this.id !== REGIME_CARD_ID || !this.isConnected) {
        nativeOuterHtml.set.call(this, markup);
        return;
      }
      const next = parseFragment(markup).firstElementChild;
      if (!next || next.id !== REGIME_CARD_ID) {
        nativeOuterHtml.set.call(this, markup);
        return;
      }
      patchNode(this, next);
      patchedCardRenders += 1;
    }
  });

  window.AmyFXDomStableRender = Object.freeze({
    version: '5.3.0',
    patch(current, next) {
      if (!(current instanceof Element) || !(next instanceof Element)) return false;
      patchNode(current, next);
      return true;
    },
    stats: () => ({
      patchedAppRenders,
      replacedViewRenders,
      patchedCardRenders,
      removedDuplicateNodes,
      persistentNodesPreserved,
      view: lastAppView
    })
  });
}
