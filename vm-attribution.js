(function () {
  var KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'fbp'];
  var STORE = 'vm_attr';

  function readCookie(name) {
    var match = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
    return match ? decodeURIComponent(match.pop()) : '';
  }

  function readSaved() {
    try {
      return JSON.parse(sessionStorage.getItem(STORE) || '{}') || {};
    } catch (e) {
      return {};
    }
  }

  function writeSaved(saved) {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(saved));
    } catch (e) {}
  }

  function collectAttribution() {
    var url = new URLSearchParams(window.location.search);
    var saved = readSaved();

    KEYS.forEach(function (key) {
      var value = url.get(key);
      if (value && !saved[key]) saved[key] = value;
    });
    writeSaved(saved);

    var values = {};
    KEYS.forEach(function (key) {
      if (saved[key]) values[key] = saved[key];
    });

    var fbp = readCookie('_fbp');
    if (fbp) values.fbp = fbp;

    window.VM_ATTR_VALUES = values;
    return values;
  }

  function valuesToParams(values) {
    var params = new URLSearchParams();
    Object.keys(values).forEach(function (key) {
      if (values[key]) params.set(key, values[key]);
    });
    return params;
  }

  function appendParams(rawUrl, params) {
    if (!rawUrl || !params || !params.toString()) return rawUrl;

    var hash = '';
    var hashIndex = rawUrl.indexOf('#');
    if (hashIndex > -1) {
      hash = rawUrl.slice(hashIndex);
      rawUrl = rawUrl.slice(0, hashIndex);
    }

    var path = rawUrl;
    var query = '';
    var queryIndex = rawUrl.indexOf('?');
    if (queryIndex > -1) {
      path = rawUrl.slice(0, queryIndex);
      query = rawUrl.slice(queryIndex + 1);
    }

    var merged = new URLSearchParams(query);
    params.forEach(function (value, key) {
      if (value && !merged.has(key)) merged.set(key, value);
    });

    var search = merged.toString();
    return path + (search ? '?' + search : '') + hash;
  }

  function syncTallyConfig(values) {
    if (!window.TallyConfig || !window.TallyConfig.popup) return;
    window.TallyConfig.popup.hiddenFields = Object.assign(
      {},
      window.TallyConfig.popup.hiddenFields || {},
      values
    );
  }

  function applyAttribution() {
    var values = collectAttribution();
    syncTallyConfig(values);

    var params = valuesToParams(values);
    if (!params.toString()) return;

    document.querySelectorAll('a[href*="form"]').forEach(function (link) {
      var href = link.getAttribute('href');
      link.setAttribute('href', appendParams(href, params));
    });

    document.querySelectorAll('iframe[data-tally-src], iframe[src*="tally.so"]').forEach(function (frame) {
      var currentPageParams = new URLSearchParams(window.location.search);
      var iframeParams = new URLSearchParams();
      params.forEach(function (value, key) {
        if (value && !currentPageParams.has(key)) iframeParams.set(key, value);
      });
      if (!iframeParams.toString()) return;

      var attr = frame.hasAttribute('data-tally-src') ? 'data-tally-src' : 'src';
      var src = frame.getAttribute(attr);
      frame.setAttribute(attr, appendParams(src, iframeParams));
    });
  }

  window.VM_ATTR_VALUES = collectAttribution();
  window.VM_ATTR_APPLY = applyAttribution;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyAttribution);
  } else {
    applyAttribution();
  }

  setTimeout(applyAttribution, 500);
  setTimeout(applyAttribution, 1500);
})();
