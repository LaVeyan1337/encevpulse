(() => {
  'use strict';

  // Read only a small allowlist of visible profile labels on the official e-CED host.
  // Never inspect forms, inputs, password fields, cookies, storage, or page-wide text.
  const PROFILE_SELECTORS = [
    '[data-testid="profile-name"]',
    '[data-testid="user-name"]',
    '[data-user-name]',
    '[data-account-name]',
    '[aria-label="Kullanıcı adı"]',
    '.logged-user-name',
    '.profile-info .username',
    '.user-info .username',
    '.user-profile .display-name',
    '.navbar-user .username',
    '.username-display'
  ];
  const GENERIC_LABELS = new Set([
    'kullanıcı','kullanici','kullanıcı adı','kullanici adi','hesap','profil',
    'giriş','giris','çıkış','cikis','ana sayfa','menü','menu'
  ]);
  let lastValue = '';
  let lastSentAt = 0;
  let scanScheduled = false;

  function cleanVisibleName(value) {
    const text = String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    if (text.length < 3 || text.length > 100) return '';
    if (GENERIC_LABELS.has(text.toLocaleLowerCase('tr-TR'))) return '';
    if (/^(şifre|sifre|parola|password|tc kimlik|vergi no)\b/i.test(text)) return '';
    return text;
  }

  function isVisibleProfileElement(element) {
    if (!(element instanceof HTMLElement)) return false;
    if (element.closest('input,textarea,select,form,[contenteditable="true"],button,[role="button"]')) return false;
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 &&
      rect.top < window.innerHeight && rect.left < window.innerWidth;
  }

  function findVisibleAccountName() {
    const candidates = new Set();
    for (const selector of PROFILE_SELECTORS) {
      let elements;
      try { elements = document.querySelectorAll(selector); } catch { continue; }
      for (const element of elements) {
        if (!isVisibleProfileElement(element)) continue;
        const name = cleanVisibleName(element.innerText || '');
        if (name) candidates.add(name);
      }
    }
    // Ambiguous header/profile matches must not silently choose the wrong account.
    return candidates.size === 1 ? [...candidates][0] : '';
  }

  function reportAccount() {
    scanScheduled = false;
    const accountName = findVisibleAccountName();
    if (!accountName || accountName === lastValue || Date.now() - lastSentAt < 2500) return;
    lastValue = accountName;
    lastSentAt = Date.now();
    try {
      chrome.runtime.sendMessage({ type: 'portal-account-observed', accountName }, () => {
        // A missing receiver (e.g. after an extension reload) is intentionally harmless.
        void chrome.runtime.lastError;
      });
    } catch { /* The portal remains usable if the extension is unavailable. */ }
  }

  function scheduleScan() {
    if (scanScheduled) return;
    scanScheduled = true;
    window.setTimeout(reportAccount, 800);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'scan-visible-account') {
      reportAccount();
      sendResponse({ ok: true });
    }
    return false;
  });

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  scheduleScan();
})();
