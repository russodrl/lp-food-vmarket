(function () {
  var ATTR_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'fbp'];
  var STORE = 'vm_attr';
  var IP_STORE = 'vm_client_ip';
  var IP_TIMEOUT_MS = 1200;

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

  function readStoredIp() {
    try {
      return sessionStorage.getItem(IP_STORE) || '';
    } catch (e) {
      return '';
    }
  }

  function writeStoredIp(ip) {
    try {
      if (ip) sessionStorage.setItem(IP_STORE, ip);
    } catch (e) {}
  }

  function sanitizeIp(value) {
    if (!value) return '';
    value = String(value).trim();
    // Aceita IPv4, IPv6 e endereços IPv6 compactos. Remove qualquer lixo inesperado.
    return /^[0-9a-fA-F:.]{3,45}$/.test(value) ? value : '';
  }

  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise(function (resolve) {
        setTimeout(function () { resolve(''); }, ms);
      })
    ]);
  }

  function getIpFromCloudflare() {
    return fetch('/cdn-cgi/trace', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.text() : ''; })
      .then(function (txt) {
        var match = txt && txt.match(/^ip=(.*)$/m);
        return sanitizeIp(match ? match[1] : '');
      })
      .catch(function () { return ''; });
  }

  function getIpFromIpify() {
    return fetch('https://api.ipify.org?format=json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { return sanitizeIp(d && d.ip ? d.ip : ''); })
      .catch(function () { return ''; });
  }

  function resolveClientIp() {
    var stored = sanitizeIp(readStoredIp());
    if (stored) return Promise.resolve(stored);

    return withTimeout(
      getIpFromCloudflare().then(function (ip) {
        return ip || getIpFromIpify();
      }),
      IP_TIMEOUT_MS
    ).then(function (ip) {
      ip = sanitizeIp(ip);
      if (ip) writeStoredIp(ip);
      return ip || '';
    });
  }

  function collectAttribution() {
    var url = new URLSearchParams(window.location.search);
    var saved = readSaved();

    ATTR_KEYS.forEach(function (key) {
      var value = url.get(key);
      if (value && !saved[key]) saved[key] = value;
    });
    writeSaved(saved);

    var values = {};
    ATTR_KEYS.forEach(function (key) {
      if (saved[key]) values[key] = saved[key];
    });

    var fbp = readCookie('_fbp');
    if (fbp) values.fbp = fbp;

    // Campos exigidos pela Meta Conversions API, sem hash.
    if (navigator.userAgent) values.ua = navigator.userAgent;

    var ip = sanitizeIp(readStoredIp() || url.get('ip'));
    if (ip) values.ip = ip;

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

    // O Tally lê hidden fields pela query string do próprio iframe/data-tally-src.
    document.querySelectorAll('iframe[data-tally-src], iframe[src*="tally.so"]').forEach(function (frame) {
      var attr = frame.hasAttribute('data-tally-src') ? 'data-tally-src' : 'src';
      var src = frame.getAttribute(attr);
      var next = appendParams(src, params);
      if (next && next !== src) frame.setAttribute(attr, next);
    });
  }

  window.VM_ATTR_VALUES = collectAttribution();
  window.VM_ATTR_APPLY = applyAttribution;
  window.VM_ATTR_READY = resolveClientIp().then(function () {
    applyAttribution();
    return window.VM_ATTR_VALUES || {};
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyAttribution);
  } else {
    applyAttribution();
  }

  setTimeout(applyAttribution, 500);
  setTimeout(applyAttribution, 1500);
})();
