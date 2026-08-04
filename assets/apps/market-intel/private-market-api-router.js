(function () {
  'use strict';

  if (window.__amyFxPrivateMarketApiRouterV1) return;
  window.__amyFxPrivateMarketApiRouterV1 = true;

  const nativeFetch = window.fetch.bind(window);
  const EDGE_ORIGIN = 'https://wliecyxzlwhmtftnfnps.supabase.co';
  const ROUTES = Object.freeze({
    '/api/twelvedata': '/functions/v1/market-candles',
    '/api/heatmap': '/functions/v1/market-heatmap',
    '/api/liquidity': '/functions/v1/market-liquidity'
  });

  function route(input) {
    const source = new URL(input instanceof Request ? input.url : String(input), location.href);
    if (source.hostname !== 'amy-fx.vercel.app' || !ROUTES[source.pathname]) return null;
    const target = new URL(ROUTES[source.pathname], EDGE_ORIGIN);
    target.search = source.search;
    return target.toString();
  }

  window.fetch = function privateMarketFetch(input, init) {
    try {
      const target = route(input);
      if (!target) return nativeFetch(input, init);
      const request = input instanceof Request ? new Request(target, input) : target;
      return nativeFetch(request, init);
    } catch (_) {
      return nativeFetch(input, init);
    }
  };

  window.AmyFXPrivateMarketApi = Object.freeze({
    origin: EDGE_ORIGIN,
    routes: ROUTES
  });
})();
