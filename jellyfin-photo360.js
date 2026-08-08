// Jellyfin 360° Photo Viewer for Jellyfin Web 10.11.x
// Features:
// - Manual 360° button inside Jellyfin's native photo slideshow
// - Optional AUTO mode for photos tagged VR360 in Jellyfin metadata
// - Equirectangular 360° rendering with A-Frame
// - Desktop mouse drag + mouse-wheel zoom
// - Android/iOS single-finger drag + two-finger pinch zoom
// - Normal / inverted drag toggle
// - Optional device-motion exploration (requires a secure context / HTTPS)
// - Previous / Next buttons browse adjacent photos tagged VR360 without leaving 360 mode
// - Collapsible left thumbnail gallery lists VR360 photos in the current Jellyfin slideshow
// - Responsive gallery UX: desktop left-edge hover opens and delayed mouse-out closes
// - Android/touch keeps explicit tap-to-open/tap-to-close behavior (no hover dependency)
// - Optional pin button keeps the gallery open on either input mode
// - Gallery toggle and previous-photo navigation use separate non-overlapping click zones
// - Clicking a thumbnail jumps directly to that 360 photo and keeps Jellyfin synchronized
// - Single X closes both the 360 viewer and Jellyfin slideshow, returning directly to the library
// - Projection button: Normal / Mirror Ball / Little Planet (isolated WebGL overlay)
(function () {
  'use strict';

  const TAG_NAME = 'VR360';
  const AUTO_STORAGE_KEY = 'jellyfin-photo360-auto-enabled-v1';
  const OVERLAY_ID = 'jf-photo360-overlay';
  const CONTROLS_CLASS = 'jf-photo360-controls';

  let autoEnabled = (() => {
    try {
      const saved = localStorage.getItem(AUTO_STORAGE_KEY);
      return saved === null ? true : saved === 'true';
    } catch (_) {
      return true;
    }
  })();

  let currentOverlayItemId = null;
  let autoDismissedItemId = null;
  let lastAutoCheckedItemId = null;
  let checkInFlightItemId = null;
  let lastObservedItemId = null;
  let navigationBusy = false;
  const metadataCache = new Map();
  let galleryCacheSignature = '';
  let galleryCacheItems = [];

  function log(...args) {
    console.debug('[Jellyfin Photo360]', ...args);
  }

  function saveAutoPreference() {
    try {
      localStorage.setItem(AUTO_STORAGE_KEY, String(autoEnabled));
    } catch (_) {}
  }

  // Jellyfin 10.11.x slideshow renders the current photo in .swiper-slide-active
  // with data-original, data-itemid and data-serverid attributes.
  function getActivePhotoInfo() {
    const dialog = document.querySelector('.slideshowDialog');
    if (!dialog) return null;

    const slide = dialog.querySelector('.swiper-slide-active');
    if (!slide) return null;

    const image = slide.querySelector('img.swiper-slide-img');
    const url = slide.getAttribute('data-original') || image?.currentSrc || image?.src || '';
    const itemId = slide.getAttribute('data-itemid') || '';
    const serverId = slide.getAttribute('data-serverid') || '';

    if (!url || !itemId) return null;

    return {
      dialog,
      slide,
      image,
      url,
      itemId,
      serverId
    };
  }

  function getNativeSwiper() {
    const dialog = document.querySelector('.slideshowDialog');
    const container = dialog?.querySelector('.slideshowSwiperContainer');
    return container?.swiper || null;
  }

  // Jellyfin 10.11.x uses Swiper virtual slides. Only a few slides exist in
  // the DOM at once, but swiper.virtual.slides contains the complete slideshow.
  function getVirtualSlideshowEntries() {
    const swiper = getNativeSwiper();
    const entries = swiper?.virtual?.slides;
    return Array.isArray(entries) ? entries : [];
  }

  function getVirtualEntryDescriptor(entry, index, fallbackInfo) {
    const itemId = String(entry?.Id || entry?.id || entry?.ItemId || entry?.itemId || '');
    const serverId = String(entry?.ServerId || entry?.serverId || fallbackInfo?.serverId || '');
    const originalImage = String(entry?.originalImage || entry?.OriginalImage || '');
    const title = String(entry?.Name || entry?.name || entry?.title || entry?.Title || '');
    if (!itemId) return null;
    return { index, itemId, serverId, originalImage, title, raw: entry };
  }

  function buildPhotoInfoForMetadata(descriptor, fallbackInfo) {
    return {
      itemId: descriptor.itemId,
      serverId: descriptor.serverId || fallbackInfo?.serverId || '',
      // The URL is only needed by the direct-request fallback to recover the
      // Jellyfin base URL/token. The active photo URL is sufficient for that.
      url: descriptor.originalImage || fallbackInfo?.url || ''
    };
  }

  function buildThumbnailUrl(descriptor, item, fallbackInfo) {
    const apiClient = getApiClient();
    try {
      if (apiClient && typeof apiClient.getScaledImageUrl === 'function') {
        const options = {
          type: 'Primary',
          maxWidth: 360,
          maxHeight: 180,
          quality: 82
        };
        const tag = item?.ImageTags?.Primary || item?.ImageTags?.primary;
        if (tag) options.tag = tag;
        return apiClient.getScaledImageUrl(descriptor.itemId, options);
      }
    } catch (_) {}

    try {
      const base = getServerBase(descriptor.originalImage || fallbackInfo?.url || '', apiClient);
      const url = new URL(base.replace(/\/$/, '') + '/Items/' + encodeURIComponent(descriptor.itemId) + '/Images/Primary');
      url.searchParams.set('maxWidth', '360');
      url.searchParams.set('maxHeight', '180');
      url.searchParams.set('quality', '82');
      const token = getTokenFromPhotoUrl(descriptor.originalImage || fallbackInfo?.url || '', apiClient);
      if (token) url.searchParams.set('api_key', token);
      return url.toString();
    } catch (_) {
      return descriptor.originalImage || fallbackInfo?.url || '';
    }
  }

  async function mapWithConcurrency(values, limit, worker) {
    const results = new Array(values.length);
    let cursor = 0;
    async function run() {
      while (true) {
        const index = cursor++;
        if (index >= values.length) return;
        try {
          results[index] = await worker(values[index], index);
        } catch (error) {
          results[index] = null;
          console.warn('[Jellyfin Photo360] Gallery item failed:', error);
        }
      }
    }
    const workers = Array.from({ length: Math.min(limit, values.length) }, () => run());
    await Promise.all(workers);
    return results;
  }

  async function get360GalleryItems(force = false) {
    const fallbackInfo = getActivePhotoInfo();
    if (!fallbackInfo) return [];

    const entries = getVirtualSlideshowEntries();
    const descriptors = entries
      .map((entry, index) => getVirtualEntryDescriptor(entry, index, fallbackInfo))
      .filter(Boolean);

    const signature = descriptors.map(d => d.itemId).join('|');
    if (!force && signature && signature === galleryCacheSignature && galleryCacheItems.length) {
      return galleryCacheItems;
    }

    const inspected = await mapWithConcurrency(descriptors, 6, async (descriptor) => {
      let item = descriptor.raw;
      // If Tags were not included in Jellyfin's slideshow item payload, fetch
      // the full item once. getItemMetadata() caches the result by ItemId.
      if (!Array.isArray(item?.Tags) && !Array.isArray(item?.tags)) {
        item = await getItemMetadata(buildPhotoInfoForMetadata(descriptor, fallbackInfo));
      }
      if (!itemHas360Tag(item)) return null;

      return {
        itemId: descriptor.itemId,
        serverId: descriptor.serverId,
        index: descriptor.index,
        title: item?.Name || descriptor.title || '360° photo',
        thumbnailUrl: buildThumbnailUrl(descriptor, item, fallbackInfo)
      };
    });

    galleryCacheSignature = signature;
    galleryCacheItems = inspected.filter(Boolean).sort((a, b) => a.index - b.index);
    return galleryCacheItems;
  }

  async function sendGalleryToViewer(currentItemId, force = false) {
    postToViewer({ type: 'JF_PHOTO360_GALLERY_LOADING' });
    try {
      const items = await get360GalleryItems(force);
      postToViewer({
        type: 'JF_PHOTO360_GALLERY',
        items,
        currentItemId: currentItemId || getActivePhotoInfo()?.itemId || ''
      });
    } catch (error) {
      console.warn('[Jellyfin Photo360] Unable to build gallery:', error);
      postToViewer({ type: 'JF_PHOTO360_GALLERY', items: [], currentItemId: currentItemId || '' });
    }
  }

  function getApiClient() {
    return window.ApiClient || globalThis.ApiClient || null;
  }

  function getUserId(apiClient) {
    try {
      return apiClient?.getCurrentUserId?.() ||
             apiClient?._serverInfo?.UserId ||
             apiClient?._serverInfo?.userId ||
             null;
    } catch (_) {
      return apiClient?._serverInfo?.UserId || null;
    }
  }

  function getTokenFromPhotoUrl(photoUrl, apiClient) {
    try {
      const parsed = new URL(photoUrl, window.location.href);
      return apiClient?.accessToken?.() ||
             parsed.searchParams.get('api_key') ||
             parsed.searchParams.get('apiKey') ||
             null;
    } catch (_) {
      try {
        return apiClient?.accessToken?.() || null;
      } catch (_) {
        return null;
      }
    }
  }

  function getServerBase(photoUrl, apiClient) {
    try {
      if (apiClient?._serverAddress) return String(apiClient._serverAddress).replace(/\/$/, '');
    } catch (_) {}

    try {
      const parsed = new URL(photoUrl, window.location.href);
      const path = parsed.pathname;
      const markers = ['/Items/', '/items/'];
      let index = -1;
      for (const marker of markers) {
        index = path.indexOf(marker);
        if (index >= 0) break;
      }
      return parsed.origin + (index >= 0 ? path.slice(0, index) : '');
    } catch (_) {
      return window.location.origin;
    }
  }

  async function getItemMetadata(info) {
    if (info?.itemId && metadataCache.has(info.itemId)) {
      return metadataCache.get(info.itemId);
    }

    const apiClient = getApiClient();
    const userId = getUserId(apiClient);
    let item = null;

    if (apiClient && typeof apiClient.getItem === 'function' && userId) {
      try {
        item = await apiClient.getItem(userId, info.itemId);
      } catch (error) {
        console.warn('[Jellyfin Photo360] ApiClient.getItem failed; using direct API request.', error);
      }
    }

    if (!item) {
      const base = getServerBase(info.url, apiClient);
      const url = new URL(base.replace(/\/$/, '') + '/Items/' + encodeURIComponent(info.itemId));
      if (userId) url.searchParams.set('userId', userId);

      const token = getTokenFromPhotoUrl(info.url, apiClient);
      const headers = {};
      if (token) headers['X-Emby-Token'] = token;

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers,
        credentials: 'same-origin'
      });

      if (!response.ok) {
        throw new Error('Metadata request failed: HTTP ' + response.status);
      }

      item = await response.json();
    }

    if (info?.itemId && item) metadataCache.set(info.itemId, item);
    return item;
  }

  function itemHas360Tag(item) {
    const tags = item?.Tags || item?.tags || [];
    return Array.isArray(tags) && tags.some(tag => String(tag).trim().toUpperCase() === TAG_NAME);
  }

  function updateAutoButtons() {
    document.querySelectorAll('.jf-photo360-auto').forEach(btn => {
      btn.setAttribute('aria-pressed', String(autoEnabled));
      btn.title = autoEnabled
        ? 'Auto 360 Photos: ON — automatically opens photos tagged VR360'
        : 'Auto 360 Photos: OFF — click to enable';
      btn.classList.toggle('jf-photo360-active', autoEnabled);
      const label = btn.querySelector('.jf-photo360-auto-label');
      if (label) label.style.color = autoEnabled ? '#00a4dc' : 'inherit';
    });
  }

  function setAutoEnabled(value) {
    autoEnabled = Boolean(value);
    saveAutoPreference();
    updateAutoButtons();

    if (autoEnabled) {
      autoDismissedItemId = null;
      lastAutoCheckedItemId = null;
      checkCurrentPhoto(true);
    }
  }

  function makeMaterialButton(iconText, title, extraClass) {
    const btn = document.createElement('button');
    btn.setAttribute('is', 'paper-icon-button-light');
    btn.className = 'autoSize slideshowButton ' + extraClass;
    btn.type = 'button';
    btn.title = title;
    btn.setAttribute('aria-label', title);

    const icon = document.createElement('span');
    icon.className = 'material-icons slideshowButtonIcon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = iconText;
    btn.appendChild(icon);
    return btn;
  }

  function makeAutoButton() {
    const btn = document.createElement('button');
    btn.setAttribute('is', 'paper-icon-button-light');
    btn.className = 'autoSize slideshowButton jf-photo360-auto';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Toggle automatic 360 photo viewing');

    const span = document.createElement('span');
    span.className = 'jf-photo360-auto-label';
    span.textContent = 'AUTO';
    span.style.cssText = `
      font-family:'Noto Sans',sans-serif;
      font-size:11px;
      font-weight:700;
      letter-spacing:.4px;
      min-width:28px;
      display:inline-flex;
      align-items:center;
      justify-content:center;
    `;
    btn.appendChild(span);
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      setAutoEnabled(!autoEnabled);
    };
    return btn;
  }

  function injectControlsInto(container) {
    if (!container || container.querySelector('.' + CONTROLS_CLASS)) return;

    const wrapper = document.createElement('span');
    wrapper.className = CONTROLS_CLASS;
    wrapper.style.display = 'contents';

    const autoBtn = makeAutoButton();
    const viewBtn = makeMaterialButton('360', 'Open 360° Photo Viewer', 'jf-photo360-open');
    viewBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const info = getActivePhotoInfo();
      if (info) open360Viewer(info, { autoStarted: false });
    };

    wrapper.appendChild(autoBtn);
    wrapper.appendChild(viewBtn);

    const fullscreenButton = container.querySelector('.btnFullscreen, .btnFullscreenExit');
    if (fullscreenButton) {
      container.insertBefore(wrapper, fullscreenButton);
    } else {
      container.appendChild(wrapper);
    }
  }

  function ensurePhotoControls() {
    const dialog = document.querySelector('.slideshowDialog');
    if (!dialog) return;

    const bottom = dialog.querySelector('.slideshowBottomBar');
    const top = dialog.querySelector('.topActionButtons');

    // Desktop uses the bottom OSD. Mobile puts actions in the top bar.
    if (bottom) injectControlsInto(bottom);
    if (!bottom && top) injectControlsInto(top);

    updateAutoButtons();
  }

  function close360Viewer({ suppressAuto = true } = {}) {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;

    const itemId = overlay.dataset.itemId || currentOverlayItemId;
    const blobUrl = overlay.dataset.blobUrl;

    if (suppressAuto && itemId) autoDismissedItemId = itemId;

    if (blobUrl) {
      try { URL.revokeObjectURL(blobUrl); } catch (_) {}
    }

    overlay.remove();
    currentOverlayItemId = null;

    // Restore native slideshow visibility without changing its selected slide.
    const dialog = document.querySelector('.slideshowDialog');
    if (dialog) {
      dialog.style.visibility = '';
      dialog.removeAttribute('aria-hidden');
    }
  }

  function exit360ViewerToLibrary() {
    const overlay = document.getElementById(OVERLAY_ID);

    if (overlay) {
      const itemId = overlay.dataset.itemId || currentOverlayItemId;
      const blobUrl = overlay.dataset.blobUrl;

      // Prevent Auto VR from immediately reopening while the native slideshow
      // is being closed.
      if (itemId) autoDismissedItemId = itemId;

      if (blobUrl) {
        try { URL.revokeObjectURL(blobUrl); } catch (_) {}
      }

      overlay.remove();
    }

    currentOverlayItemId = null;

    // Jellyfin's native slideshow is a fullscreen dialog layered over the
    // library page. Closing its own exit button returns directly to the same
    // library/grid view without another intermediate photo viewer.
    const dialog = document.querySelector('.slideshowDialog');

    if (!dialog) return;

    dialog.style.visibility = '';
    dialog.removeAttribute('aria-hidden');

    const nativeExit = dialog.querySelector('.btnSlideshowExit');

    if (nativeExit) {
      nativeExit.click();
      return;
    }

    // Fallback for unexpected Jellyfin DOM changes: expose the dialog rather
    // than leaving the page hidden. This should rarely be needed on 10.11.x.
    console.warn(
      '[Jellyfin Photo360] Native slideshow exit button was not found.'
    );
  }

  const VIEWER_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>360 Photo</title>
<script src="https://aframe.io/releases/1.5.0/aframe.min.js"><\/script>
<link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Icons">
<style>
  *{box-sizing:border-box}
  html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#000;color:#fff;font-family:'Noto Sans',Arial,sans-serif;touch-action:none;overscroll-behavior:none;user-select:none}
  a-scene{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;z-index:1!important}
  #projectionCanvas{position:absolute;inset:0;width:100%;height:100%;z-index:2;display:none;pointer-events:none;background:#000}
  .a-enter-vr,.a-enter-ar,.a-enter-vr-button,.a-enter-ar-button,.a-enter-vr-modal,[class*=\"enter-vr\"],[class*=\"enter-ar\"]{display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;width:0!important;height:0!important}
  .material-icons{font-family:'Material Icons';font-weight:normal;font-style:normal;font-size:24px;line-height:1}
  #topbar{position:fixed;top:0;left:0;right:0;height:64px;display:flex;align-items:center;padding:8px 12px;z-index:10000;background:linear-gradient(to bottom,rgba(0,0,0,.68),transparent);pointer-events:none}
  #bottombar{position:fixed;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;gap:4px;padding:16px 12px 18px;z-index:10000;background:linear-gradient(to top,rgba(0,0,0,.72),transparent);pointer-events:none}
  button{pointer-events:auto;border:0;background:transparent;color:rgba(255,255,255,.9);width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer}
  button:hover{background:rgba(255,255,255,.15)}
  button.active{background:rgba(0,164,220,.28);color:#00a4dc}
  .pill-btn{width:auto;min-width:118px;height:38px;padding:0 12px;border-radius:999px;gap:7px;font-size:12px;font-weight:600;letter-spacing:.2px;background:rgba(255,255,255,.08)}
  .pill-btn .material-icons{font-size:18px}
  #viewModeWrap{position:relative;pointer-events:auto}
  #viewMode{position:relative}
  #viewModeCaret{font-size:18px;opacity:.8;margin-left:-2px}
  #viewModeMenu{position:absolute;left:50%;bottom:46px;transform:translateX(-50%);min-width:172px;padding:6px;background:rgba(18,18,18,.96);border:1px solid rgba(255,255,255,.12);border-radius:10px;box-shadow:0 10px 28px rgba(0,0,0,.35);display:flex;flex-direction:column;gap:2px;z-index:10020}
  #viewModeMenu[hidden]{display:none!important}
  .projectionOption{width:100%;height:auto;min-height:36px;border-radius:8px;padding:8px 10px;background:transparent;display:flex;align-items:center;justify-content:flex-start;gap:8px;color:rgba(255,255,255,.92);font-size:12px;font-weight:600}
  .projectionOption:hover{background:rgba(255,255,255,.10)}
  .projectionOption.active{background:rgba(0,164,220,.18);color:#00a4dc}
  .projectionCheck{font-size:18px;visibility:hidden}
  .projectionOption.active .projectionCheck{visibility:visible}
  #closeViewer{margin-left:auto}
  #badge{pointer-events:none;border:1px solid #00a4dc;color:#00a4dc;font-size:11px;font-weight:700;letter-spacing:.5px;padding:3px 8px;border-radius:4px;margin-left:8px}
  #title{pointer-events:none;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70vw;margin-left:8px;color:rgba(255,255,255,.92)}
  #hint{position:fixed;top:72px;left:50%;transform:translateX(-50%);z-index:10000;background:rgba(0,0,0,.55);padding:7px 12px;border-radius:5px;font-size:12px;color:rgba(255,255,255,.82);pointer-events:none;opacity:1;transition:opacity .5s}
  .navPhoto{position:fixed;top:50%;transform:translateY(-50%);z-index:10001;width:54px;height:72px;border-radius:7px;background:rgba(0,0,0,.28);opacity:.78}
  .navPhoto:hover{background:rgba(0,0,0,.62);opacity:1}
  .navPhoto:disabled{opacity:.22;cursor:default}
  #previousPhoto{left:10px}
  #nextPhoto{right:10px}
  #loading{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:10002;background:rgba(0,0,0,.68);padding:10px 15px;border-radius:6px;font-size:13px;display:none;pointer-events:none}
  :root{--gallery-width:224px;--gallery-toggle-width:28px;--gallery-control-gap:10px;--gallery-hot-zone:18px}
  #galleryPanel{position:fixed;left:0;top:64px;bottom:0;width:var(--gallery-width);z-index:10003;background:rgba(18,18,18,.94);border-right:1px solid rgba(255,255,255,.12);box-shadow:4px 0 18px rgba(0,0,0,.35);transform:translateX(0);transition:transform .22s ease;pointer-events:auto;backdrop-filter:blur(5px)}
  #galleryPanel.closed{transform:translateX(-100%)}
  #galleryHeader{height:42px;display:flex;align-items:center;justify-content:space-between;gap:6px;padding:0 7px 0 12px;border-bottom:1px solid rgba(255,255,255,.09);font-size:13px;font-weight:600;color:rgba(255,255,255,.9)}
  #galleryHeaderTitle{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #galleryPin{width:34px;height:34px;min-width:34px;border-radius:50%;color:rgba(255,255,255,.62)}
  #galleryPin .material-icons{font-size:19px}
  #galleryPin.active{background:rgba(0,164,220,.24);color:#00a4dc}
  #galleryCount{font-size:11px;font-weight:400;color:rgba(255,255,255,.55);margin-left:6px}
  #galleryList{position:absolute;top:42px;left:0;right:0;bottom:0;overflow-y:auto;overflow-x:hidden;padding:6px 6px 96px;touch-action:pan-y;overscroll-behavior:contain;scrollbar-width:thin}
  #galleryStatus{padding:18px 10px;text-align:center;font-size:12px;color:rgba(255,255,255,.58);line-height:1.45}
  .galleryItem{display:block;width:100%;height:auto;padding:3px;margin:0 0 6px;border-radius:4px;background:transparent;border:2px solid transparent;cursor:pointer;text-align:left;color:#fff;position:relative}
  .galleryItem:hover{background:rgba(255,255,255,.08)}
  .galleryItem.active{border-color:#00a4dc;background:rgba(0,164,220,.14)}
  .galleryThumb{display:block;width:100%;aspect-ratio:2/1;object-fit:cover;background:#242424;border-radius:2px;pointer-events:none}
  .galleryName{display:block;padding:5px 3px 2px;font-size:11px;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:rgba(255,255,255,.86);pointer-events:none}
  .galleryIndex{position:absolute;top:7px;left:7px;background:rgba(0,0,0,.58);border-radius:3px;padding:2px 5px;font-size:10px;color:#fff;pointer-events:none}
  #galleryHotZone{position:fixed;left:0;top:64px;bottom:0;width:var(--gallery-hot-zone);z-index:10002;display:none;pointer-events:auto;background:transparent}
  body.gallery-hover-capable #galleryHotZone{display:block}
  body.gallery-open #galleryHotZone{pointer-events:none}
  #galleryToggle{position:fixed;left:var(--gallery-width);top:50%;transform:translateY(-50%);z-index:10004;width:var(--gallery-toggle-width);height:58px;border-radius:0 6px 6px 0;background:rgba(18,18,18,.82);box-shadow:2px 0 8px rgba(0,0,0,.28);transition:left .22s ease}
  body.gallery-closed #galleryToggle{left:0}
  /* Keep the previous-photo control completely outside the gallery toggle click zone. */
  body.gallery-open #previousPhoto{left:calc(var(--gallery-width) + var(--gallery-toggle-width) + var(--gallery-control-gap))}
  body.gallery-closed #previousPhoto{left:calc(var(--gallery-toggle-width) + var(--gallery-control-gap))}
  @media(max-width:700px){:root{--gallery-width:138px;--gallery-control-gap:8px;--gallery-hot-zone:14px}.pill-btn{min-width:44px;width:44px;padding:0}.pill-btn #viewModeLabel,.pill-btn #viewModeCaret{display:none}#viewModeMenu{min-width:156px;bottom:48px}.galleryName{font-size:10px}#galleryHeader{padding-left:8px;font-size:11px}#galleryPin{width:30px;height:30px;min-width:30px}}
</style>
</head>
<body>
<div id="topbar">
  <span id="badge">360° PHOTO</span>
  <span id="title"></span>
  <button id="closeViewer" title="Close 360 viewer and return to library"
          aria-label="Close 360 viewer and return to library">
    <span class="material-icons">close</span>
  </button>
</div>
<div id="galleryHotZone" aria-hidden="true"></div>
<aside id="galleryPanel" aria-label="360 photo thumbnails">
  <div id="galleryHeader">
    <span id="galleryHeaderTitle">360 Photos <span id="galleryCount"></span></span>
    <button id="galleryPin" title="Pin thumbnail panel" aria-label="Pin thumbnail panel" aria-pressed="false"><span class="material-icons">push_pin</span></button>
  </div>
  <div id="galleryList"><div id="galleryStatus">Loading 360 photos…</div></div>
</aside>
<button id="galleryToggle" title="Show photo thumbnails" aria-label="Toggle photo thumbnails"><span class="material-icons">chevron_right</span></button>
<div id="hint">Drag to look around · wheel/pinch to zoom · ←/→ change 360 photo</div>
<button class="navPhoto" id="previousPhoto" title="Previous 360° photo"><span class="material-icons">chevron_left</span></button>
<button class="navPhoto" id="nextPhoto" title="Next 360° photo"><span class="material-icons">chevron_right</span></button>
<div id="loading">Finding next 360° photo…</div>
<div id="bottombar">
  <button id="zoomOut" title="Zoom out"><span class="material-icons">zoom_out</span></button>
  <button id="zoomReset" title="Reset view"><span class="material-icons">center_focus_strong</span></button>
  <button id="zoomIn" title="Zoom in"><span class="material-icons">zoom_in</span></button>
  <div id="viewModeWrap">
    <button id="viewMode" class="pill-btn" title="Projection: Normal" aria-label="Choose projection mode" aria-haspopup="menu" aria-expanded="false"><span class="material-icons">public</span><span id="viewModeLabel">Normal</span><span class="material-icons" id="viewModeCaret">arrow_drop_up</span></button>
    <div id="viewModeMenu" role="menu" aria-label="Projection modes" hidden>
      <button class="projectionOption active" data-mode="normal" role="menuitemradio" aria-checked="true"><span class="material-icons projectionCheck">check</span><span>Normal</span></button>
      <button class="projectionOption" data-mode="mirror" role="menuitemradio" aria-checked="false"><span class="material-icons projectionCheck">check</span><span>Mirror Ball</span></button>
      <button class="projectionOption" data-mode="planet" role="menuitemradio" aria-checked="false"><span class="material-icons projectionCheck">check</span><span>Little Planet</span></button>
    </div>
  </div>
  <button id="invert" class="active" title="Rotation: inverted"><span class="material-icons">swap_horiz</span></button>
  <button id="motion" title="Device motion: off"><span class="material-icons">screen_lock_rotation</span></button>
</div>
<a-scene vr-mode-ui="enabled:false" embedded background="color:#000">
  <a-assets id="assets"></a-assets>
  <a-sky id="sky" rotation="0 -90 0"></a-sky>
  <a-camera id="camera" position="0 1.6 0" look-controls="enabled:true;mouseEnabled:false;touchEnabled:false;magicWindowTrackingEnabled:false" wasd-controls-enabled="false"></a-camera>
</a-scene>
<canvas id="projectionCanvas" aria-hidden="true"></canvas>
<script>
(function(){
  const closeViewer=document.getElementById('closeViewer');
  const title=document.getElementById('title');
  const sky=document.getElementById('sky');
  const assets=document.getElementById('assets');
  const cameraEl=document.getElementById('camera');
  const zoomIn=document.getElementById('zoomIn');
  const zoomOut=document.getElementById('zoomOut');
  const zoomReset=document.getElementById('zoomReset');
  const viewModeWrap=document.getElementById('viewModeWrap');
  const viewMode=document.getElementById('viewMode');
  const viewModeLabel=document.getElementById('viewModeLabel');
  const viewModeMenu=document.getElementById('viewModeMenu');
  const projectionOptions=[...document.querySelectorAll('.projectionOption')];
  const projectionCanvas=document.getElementById('projectionCanvas');
  const invert=document.getElementById('invert');
  const motion=document.getElementById('motion');
  const hint=document.getElementById('hint');
  const previousPhoto=document.getElementById('previousPhoto');
  const nextPhoto=document.getElementById('nextPhoto');
  const loading=document.getElementById('loading');
  const galleryPanel=document.getElementById('galleryPanel');
  const galleryList=document.getElementById('galleryList');
  const galleryCount=document.getElementById('galleryCount');
  const galleryToggle=document.getElementById('galleryToggle');
  const galleryToggleIcon=galleryToggle.querySelector('.material-icons');
  const galleryHotZone=document.getElementById('galleryHotZone');
  const galleryPin=document.getElementById('galleryPin');

  const supportsHover=window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const AUTO_COLLAPSE_DELAY=420;
  let galleryItems=[];
  let currentGalleryItemId='';
  let galleryOpen=false;
  let galleryPinned=false;
  let galleryCollapseTimer=null;

  document.body.classList.toggle('gallery-hover-capable',supportsHover);
  document.body.classList.toggle('gallery-touch-capable',!supportsHover);

  function cancelGalleryCollapse(){
    if(galleryCollapseTimer){
      clearTimeout(galleryCollapseTimer);
      galleryCollapseTimer=null;
    }
  }

  function setGalleryOpen(open){
    galleryOpen=!!open;
    applyGalleryState();
  }

  function applyGalleryState(){
    galleryPanel.classList.toggle('closed',!galleryOpen);
    document.body.classList.toggle('gallery-open',galleryOpen);
    document.body.classList.toggle('gallery-closed',!galleryOpen);
    galleryToggleIcon.textContent=galleryOpen?'chevron_left':'chevron_right';
    galleryToggle.title=galleryOpen?'Hide photo thumbnails':'Show photo thumbnails';
    galleryPin.classList.toggle('active',galleryPinned);
    galleryPin.setAttribute('aria-pressed',String(galleryPinned));
    galleryPin.title=galleryPinned?'Unpin thumbnail panel':'Pin thumbnail panel';
  }

  function scheduleGalleryCollapse(){
    cancelGalleryCollapse();
    if(!supportsHover||galleryPinned||!galleryOpen)return;
    galleryCollapseTimer=setTimeout(()=>{
      galleryCollapseTimer=null;
      if(!galleryPinned)setGalleryOpen(false);
    },AUTO_COLLAPSE_DELAY);
  }

  applyGalleryState();

  // Desktop: a narrow left-edge hot zone opens the gallery without requiring a click.
  // Leaving the panel collapses it after a short delay unless it is pinned.
  if(supportsHover){
    galleryHotZone.addEventListener('mouseenter',()=>{cancelGalleryCollapse();setGalleryOpen(true);});
    galleryPanel.addEventListener('mouseenter',cancelGalleryCollapse);
    galleryPanel.addEventListener('mouseleave',scheduleGalleryCollapse);
    galleryToggle.addEventListener('mouseenter',cancelGalleryCollapse);
    galleryToggle.addEventListener('mouseleave',scheduleGalleryCollapse);
  }

  // Manual toggle remains available on desktop and is the primary control on touch devices.
  galleryToggle.onclick=(e)=>{
    e.stopPropagation();
    cancelGalleryCollapse();
    setGalleryOpen(!galleryOpen);
  };

  galleryPin.onclick=(e)=>{
    e.stopPropagation();
    cancelGalleryCollapse();
    galleryPinned=!galleryPinned;
    if(galleryPinned)setGalleryOpen(true);
    else {
      applyGalleryState();
      if(supportsHover)scheduleGalleryCollapse();
    }
  };

  // Android/touch: tapping outside an unpinned open gallery closes it.
  document.addEventListener('pointerdown',(e)=>{
    if(supportsHover||galleryPinned||!galleryOpen)return;
    if(e.target.closest('#galleryPanel,#galleryToggle'))return;
    setGalleryOpen(false);
  },true);

  function setActiveGalleryItem(itemId){
    currentGalleryItemId=String(itemId||'');
    galleryList.querySelectorAll('.galleryItem').forEach(el=>{
      el.classList.toggle('active',el.dataset.itemId===currentGalleryItemId);
    });
    const active=galleryList.querySelector('.galleryItem.active');
    active?.scrollIntoView?.({block:'nearest',behavior:'smooth'});
  }

  function renderGallery(items,currentItemId){
    galleryItems=Array.isArray(items)?items:[];
    galleryCount.textContent=galleryItems.length?'('+galleryItems.length+')':'';
    galleryList.innerHTML='';
    if(!galleryItems.length){
      const empty=document.createElement('div');
      empty.id='galleryStatus';
      empty.textContent='No other photos tagged VR360 were found in this slideshow.';
      galleryList.appendChild(empty);
      return;
    }
    galleryItems.forEach((item,i)=>{
      const btn=document.createElement('button');
      btn.className='galleryItem';
      btn.dataset.itemId=String(item.itemId||'');
      btn.title=item.title||'Open 360° photo';
      const img=document.createElement('img');
      img.className='galleryThumb';
      img.loading='lazy';
      img.decoding='async';
      img.alt='';
      if(item.thumbnailUrl)img.src=item.thumbnailUrl;
      const index=document.createElement('span');
      index.className='galleryIndex';
      index.textContent=String(i+1);
      const name=document.createElement('span');
      name.className='galleryName';
      name.textContent=item.title||('360° photo '+(i+1));
      btn.append(img,index,name);
      btn.onclick=()=>{
        if(btn.dataset.itemId===currentGalleryItemId){
          if(!supportsHover&&!galleryPinned)setGalleryOpen(false);
          return;
        }
        parent.postMessage({type:'JF_PHOTO360_GOTO',itemId:btn.dataset.itemId,index:item.index},'*');
        // On phones/tablets, give the 360 image the screen back immediately after selection.
        if(!supportsHover&&!galleryPinned)setGalleryOpen(false);
      };
      galleryList.appendChild(btn);
    });
    setActiveGalleryItem(currentItemId);
  }

  const DEFAULT_FOV=80, MIN_FOV=30, MAX_FOV=105, STEP=5;
  let fov=DEFAULT_FOV;
  let inverted=true;
  let motionEnabled=false;
  let imageEl=null;

  // Projection modes are deliberately isolated from A-Frame. Normal mode continues
  // to use the original a-sky renderer; special modes use their own WebGL canvas.
  const VIEW_MODES=[
    {key:'normal',label:'Normal',mode:0},
    {key:'mirror',label:'Mirror Ball',mode:1},
    {key:'planet',label:'Little Planet',mode:2}
  ];
  let viewModeIndex=0;
  let pgl=null;
  let pProgram=null;
  let pBuffer=null;
  let pTexture=null;
  let pLocations=null;
  let pTextureImage=null;
  let pReady=false;

  function currentViewMode(){return VIEW_MODES[viewModeIndex]||VIEW_MODES[0];}

  function updateViewModeButton(){
    const m=currentViewMode();
    viewModeLabel.textContent=m.label;
    viewMode.title='Projection: '+m.label+' (click to choose)';
    viewMode.setAttribute('aria-label','Projection mode: '+m.label+'. Click to choose another mode.');
    projectionOptions.forEach(option=>{
      const active=option.dataset.mode===m.key;
      option.classList.toggle('active',active);
      option.setAttribute('aria-checked',active?'true':'false');
    });
  }

  let viewModeMenuOpen=false;
  function closeViewModeMenu(){
    viewModeMenu.hidden=true;
    viewModeMenuOpen=false;
    viewMode.setAttribute('aria-expanded','false');
  }
  function openViewModeMenu(){
    viewModeMenu.hidden=false;
    viewModeMenuOpen=true;
    viewMode.setAttribute('aria-expanded','true');
  }
  function toggleViewModeMenu(){
    if(viewModeMenuOpen) closeViewModeMenu();
    else openViewModeMenu();
  }
  function setViewModeByKey(modeKey,{announce=true}={}){
    const nextIndex=VIEW_MODES.findIndex(m=>m.key===modeKey);
    if(nextIndex<0) return;
    viewModeIndex=nextIndex;
    applyViewMode();
    if(announce) showProjectionMessage('Projection: '+currentViewMode().label);
  }

  function compileShader(gl,type,source){
    const shader=gl.createShader(type);
    gl.shaderSource(shader,source);
    gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){
      const message=gl.getShaderInfoLog(shader)||'Unknown shader error';
      gl.deleteShader(shader);
      throw new Error(message);
    }
    return shader;
  }

  function initProjectionGL(){
    if(pReady) return true;
    try{
      pgl=projectionCanvas.getContext('webgl',{alpha:false,antialias:true,preserveDrawingBuffer:false}) ||
          projectionCanvas.getContext('experimental-webgl',{alpha:false,antialias:true});
      if(!pgl) throw new Error('WebGL is unavailable');

      const vs=[
        'attribute vec2 aPosition;',
        'varying vec2 vUv;',
        'void main(){',
        '  vUv=(aPosition+1.0)*0.5;',
        '  gl_Position=vec4(aPosition,0.0,1.0);',
        '}'
      ].join('\\n');

      const fs=[
        'precision highp float;',
        'varying vec2 vUv;',
        'uniform sampler2D uTexture;',
        'uniform float uAspect;',
        'uniform float uYaw;',
        'uniform float uPitch;',
        'uniform float uZoom;',
        'uniform float uMode;',
        'const float PI=3.14159265358979323846;',
        'mat3 rotY(float a){float s=sin(a),c=cos(a);return mat3(c,0.0,-s,0.0,1.0,0.0,s,0.0,c);}',
        'mat3 rotX(float a){float s=sin(a),c=cos(a);return mat3(1.0,0.0,0.0,0.0,c,-s,0.0,s,c);}',
        'vec3 orient(vec3 d){return normalize(rotY(uYaw)*rotX(uPitch)*d);}',
        'vec2 envUV(vec3 d){',
        '  d=normalize(d);',
        '  float lon=atan(d.x,-d.z);',
        '  float lat=asin(clamp(d.y,-1.0,1.0));',
        '  return vec2(fract(0.5+lon/(2.0*PI)),clamp(0.5-lat/PI,0.0,1.0));',
        '}',
        'void main(){',
        '  vec2 p=vUv*2.0-1.0;',
        '  p.x*=uAspect;',
        '  p/=max(0.35,uZoom);',
        '  vec3 d;',
        '  if(uMode<1.5){',
        '    float r2=dot(p,p);',
        '    if(r2>1.0){gl_FragColor=vec4(0.0,0.0,0.0,1.0);return;}',
        '    float z=sqrt(max(0.0,1.0-r2));',
        '    vec3 n=normalize(vec3(p.x,-p.y,z));',
        '    vec3 v=vec3(0.0,0.0,1.0);',
        '    d=normalize(2.0*dot(v,n)*n-v);',
        '  }else{',
        '    p*=1.15;',
        '    float r2=dot(p,p);',
        '    d=normalize(vec3(2.0*p.x,r2-1.0,-2.0*p.y));',
        '  }',
        '  d=orient(d);',
        '  gl_FragColor=texture2D(uTexture,envUV(d));',
        '}'
      ].join('\\n');

      const vsh=compileShader(pgl,pgl.VERTEX_SHADER,vs);
      const fsh=compileShader(pgl,pgl.FRAGMENT_SHADER,fs);
      pProgram=pgl.createProgram();
      pgl.attachShader(pProgram,vsh);
      pgl.attachShader(pProgram,fsh);
      pgl.linkProgram(pProgram);
      pgl.deleteShader(vsh);
      pgl.deleteShader(fsh);
      if(!pgl.getProgramParameter(pProgram,pgl.LINK_STATUS)){
        throw new Error(pgl.getProgramInfoLog(pProgram)||'Unable to link projection shader');
      }

      pBuffer=pgl.createBuffer();
      pgl.bindBuffer(pgl.ARRAY_BUFFER,pBuffer);
      pgl.bufferData(pgl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),pgl.STATIC_DRAW);

      pLocations={
        position:pgl.getAttribLocation(pProgram,'aPosition'),
        texture:pgl.getUniformLocation(pProgram,'uTexture'),
        aspect:pgl.getUniformLocation(pProgram,'uAspect'),
        yaw:pgl.getUniformLocation(pProgram,'uYaw'),
        pitch:pgl.getUniformLocation(pProgram,'uPitch'),
        zoom:pgl.getUniformLocation(pProgram,'uZoom'),
        mode:pgl.getUniformLocation(pProgram,'uMode')
      };
      pReady=true;
      return true;
    }catch(err){
      console.error('[Photo360 projection] init failed',err);
      pReady=false;
      return false;
    }
  }

  function uploadProjectionTexture(img){
    if(!img || !img.complete || !img.naturalWidth || !initProjectionGL()) return false;
    try{
      if(pTexture) pgl.deleteTexture(pTexture);
      pTexture=pgl.createTexture();
      pgl.bindTexture(pgl.TEXTURE_2D,pTexture);
      pgl.pixelStorei(pgl.UNPACK_FLIP_Y_WEBGL,false);
      pgl.texParameteri(pgl.TEXTURE_2D,pgl.TEXTURE_WRAP_S,pgl.CLAMP_TO_EDGE);
      pgl.texParameteri(pgl.TEXTURE_2D,pgl.TEXTURE_WRAP_T,pgl.CLAMP_TO_EDGE);
      pgl.texParameteri(pgl.TEXTURE_2D,pgl.TEXTURE_MIN_FILTER,pgl.LINEAR);
      pgl.texParameteri(pgl.TEXTURE_2D,pgl.TEXTURE_MAG_FILTER,pgl.LINEAR);
      pgl.texImage2D(pgl.TEXTURE_2D,0,pgl.RGBA,pgl.RGBA,pgl.UNSIGNED_BYTE,img);
      pTextureImage=img;
      return true;
    }catch(err){
      console.error('[Photo360 projection] texture upload failed',err);
      return false;
    }
  }

  function showProjectionMessage(message){
    hint.textContent=message;
    hint.style.opacity='1';
    clearTimeout(showProjectionMessage._timer);
    showProjectionMessage._timer=setTimeout(()=>{hint.style.opacity='0';},1800);
  }

  function applyViewMode(){
    const m=currentViewMode();
    updateViewModeButton();
    if(m.key==='normal'){
      projectionCanvas.style.display='none';
      return;
    }
    if(!imageEl || !imageEl.complete || !imageEl.naturalWidth){
      viewModeIndex=0;
      updateViewModeButton();
      projectionCanvas.style.display='none';
      showProjectionMessage('Photo is not ready yet — using Normal view');
      return;
    }
    if(!pReady && !initProjectionGL()){
      viewModeIndex=0;
      updateViewModeButton();
      projectionCanvas.style.display='none';
      showProjectionMessage('This browser could not start the special projection — using Normal view');
      return;
    }
    if(pTextureImage!==imageEl && !uploadProjectionTexture(imageEl)){
      viewModeIndex=0;
      updateViewModeButton();
      projectionCanvas.style.display='none';
      showProjectionMessage('Unable to use this image for the special projection — using Normal view');
      return;
    }
    projectionCanvas.style.display='block';
  }

  viewMode.onclick=(event)=>{
    event.stopPropagation();
    toggleViewModeMenu();
  };
  projectionOptions.forEach(option=>{
    option.onclick=(event)=>{
      event.stopPropagation();
      closeViewModeMenu();
      setViewModeByKey(option.dataset.mode);
    };
  });
  document.addEventListener('click',(event)=>{
    if(viewModeMenuOpen && !viewModeWrap.contains(event.target)){
      closeViewModeMenu();
    }
  });
  updateViewModeButton();

  function resizeProjectionCanvas(){
    if(projectionCanvas.style.display==='none') return;
    const dpr=Math.min(window.devicePixelRatio||1,2);
    const w=Math.max(1,Math.round(projectionCanvas.clientWidth*dpr));
    const h=Math.max(1,Math.round(projectionCanvas.clientHeight*dpr));
    if(projectionCanvas.width!==w || projectionCanvas.height!==h){
      projectionCanvas.width=w;
      projectionCanvas.height=h;
    }
  }

  function drawProjection(){
    if(projectionCanvas.style.display==='none' || !pReady || !pTexture){
      requestAnimationFrame(drawProjection);
      return;
    }
    try{
      resizeProjectionCanvas();
      pgl.viewport(0,0,projectionCanvas.width,projectionCanvas.height);
      pgl.clearColor(0,0,0,1);
      pgl.clear(pgl.COLOR_BUFFER_BIT);
      pgl.useProgram(pProgram);
      pgl.bindBuffer(pgl.ARRAY_BUFFER,pBuffer);
      pgl.enableVertexAttribArray(pLocations.position);
      pgl.vertexAttribPointer(pLocations.position,2,pgl.FLOAT,false,0,0);
      pgl.activeTexture(pgl.TEXTURE0);
      pgl.bindTexture(pgl.TEXTURE_2D,pTexture);
      pgl.uniform1i(pLocations.texture,0);
      pgl.uniform1f(pLocations.aspect,projectionCanvas.width/Math.max(1,projectionCanvas.height));
      const controls=cameraEl.components && cameraEl.components['look-controls'];
      const yaw=controls && controls.yawObject ? controls.yawObject.rotation.y : 0;
      const pitch=controls && controls.pitchObject ? controls.pitchObject.rotation.x : 0;
      pgl.uniform1f(pLocations.yaw,yaw||0);
      pgl.uniform1f(pLocations.pitch,pitch||0);
      pgl.uniform1f(pLocations.zoom,DEFAULT_FOV/Math.max(MIN_FOV,fov));
      pgl.uniform1f(pLocations.mode,currentViewMode().mode);
      pgl.drawArrays(pgl.TRIANGLES,0,6);
    }catch(err){
      console.error('[Photo360 projection] render failed',err);
      viewModeIndex=0;
      updateViewModeButton();
      projectionCanvas.style.display='none';
    }
    requestAnimationFrame(drawProjection);
  }
  requestAnimationFrame(drawProjection);

  hint.textContent=supportsHover
    ? 'Drag to look around · wheel to zoom · move to left edge for gallery · ←/→ change 360 photo'
    : 'Drag to look around · pinch to zoom · tap the left tab for gallery';

  function setFov(v){
    fov=Math.max(MIN_FOV,Math.min(MAX_FOV,v));
    cameraEl.setAttribute('camera','fov',fov);
  }

  zoomIn.onclick=()=>setFov(fov-STEP);
  zoomOut.onclick=()=>setFov(fov+STEP);
  zoomReset.onclick=()=>{
    setFov(DEFAULT_FOV);
    const c=cameraEl.components?.['look-controls'];
    if(c?.yawObject)c.yawObject.rotation.y=0;
    if(c?.pitchObject)c.pitchObject.rotation.x=0;
  };

  invert.onclick=()=>{
    inverted=!inverted;
    invert.classList.toggle('active',inverted);
    invert.title=inverted?'Rotation: inverted':'Rotation: normal';
  };

  function setMotionTracking(enabled){
    cameraEl.setAttribute('look-controls','magicWindowTrackingEnabled',enabled);
    const c=cameraEl.components?.['look-controls'];
    if(c?.magicWindowControls)c.magicWindowControls.enabled=enabled;
  }

  motion.onclick=async()=>{
    if(motionEnabled){
      motionEnabled=false;
      setMotionTracking(false);
      motion.classList.remove('active');
      motion.querySelector('.material-icons').textContent='screen_lock_rotation';
      motion.title='Device motion: off';
      return;
    }

    if(!window.isSecureContext){
      alert('Device motion requires HTTPS (or a browser origin explicitly treated as secure).');
      return;
    }
    if(typeof DeviceOrientationEvent==='undefined'){
      alert('This browser/device does not expose device orientation sensors.');
      return;
    }

    try{
      if(typeof DeviceOrientationEvent.requestPermission==='function'){
        const p=await DeviceOrientationEvent.requestPermission();
        if(p!=='granted')return;
      }

      // Match the video viewer behavior: A-Frame can expose look-controls
      // without creating magicWindowControls when the browser is in
      // desktop-site mode on a phone. In that state, enabling the option
      // would appear to work but the device orientation would do nothing.
      const controls=
        cameraEl.components &&
        cameraEl.components['look-controls'];

      if(!controls || !controls.magicWindowControls){
        alert(
          'A-Frame could not initialize mobile motion tracking. ' +
          'Disable desktop-site mode in the browser and reopen the player.'
        );
        return;
      }

      motionEnabled=true;
      setMotionTracking(true);
      motion.classList.add('active');
      motion.querySelector('.material-icons').textContent='screen_rotation';
      motion.title='Device motion: on';
    }catch(e){
      console.error('[Jellyfin Photo360] Unable to enable device motion:',e);
      alert('Unable to enable device motion: '+(e?.message||e));
    }
  };


  closeViewer.onclick=()=>{
    closeViewModeMenu();
    parent.postMessage({type:'JF_PHOTO360_EXIT_LIBRARY'},'*');
  };
  previousPhoto.onclick=()=>{closeViewModeMenu();parent.postMessage({type:'JF_PHOTO360_NAVIGATE',direction:'previous'},'*');};
  nextPhoto.onclick=()=>{closeViewModeMenu();parent.postMessage({type:'JF_PHOTO360_NAVIGATE',direction:'next'},'*');};
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){
      if(viewModeMenuOpen){ closeViewModeMenu(); return; }
      parent.postMessage({type:'JF_PHOTO360_EXIT_LIBRARY'},'*');
    }
    if(e.key==='ArrowLeft'){e.preventDefault();previousPhoto.click();}
    if(e.key==='ArrowRight'){e.preventDefault();nextPhoto.click();}
    if(e.key==='+'||e.key==='=')setFov(fov-STEP);
    if(e.key==='-'||e.key==='_')setFov(fov+STEP);
    if(e.key==='0')zoomReset.click();
    if(e.key==='i'||e.key==='I')invert.click();
    if(e.key==='v'||e.key==='V'){e.preventDefault();toggleViewModeMenu();}
  });

  function installGestures(){
    const scene=cameraEl.sceneEl;
    const canvas=scene?.canvas;
    const controls=cameraEl.components?.['look-controls'];
    if(!canvas||!controls){setTimeout(installGestures,100);return;}
    if(canvas.dataset.photo360Gestures==='1')return;
    canvas.dataset.photo360Gestures='1';
    canvas.style.touchAction='none';

    const sensitivity=.002;
    const halfPi=Math.PI/2;
    function rotate(dx,dy){
      const dir=inverted?1:-1;
      controls.yawObject.rotation.y += dx*sensitivity*dir;
      controls.pitchObject.rotation.x += dy*sensitivity*dir;
      controls.pitchObject.rotation.x=Math.max(-halfPi,Math.min(halfPi,controls.pitchObject.rotation.x));
    }

    let dragging=false,px=0,py=0;
    canvas.addEventListener('pointerdown',e=>{
      if(e.pointerType!=='mouse'||e.button!==0)return;
      dragging=true;px=e.clientX;py=e.clientY;canvas.setPointerCapture?.(e.pointerId);e.preventDefault();
    });
    canvas.addEventListener('pointermove',e=>{
      if(e.pointerType!=='mouse'||!dragging)return;
      const dx=e.clientX-px,dy=e.clientY-py;px=e.clientX;py=e.clientY;rotate(dx,dy);e.preventDefault();
    });
    ['pointerup','pointercancel','lostpointercapture'].forEach(name=>canvas.addEventListener(name,()=>dragging=false));

    let mode='none',tx=0,ty=0,startDistance=0,startFov=fov;
    const distance=t=>Math.max(1,Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY));
    const beginPinch=t=>{mode='pinch';startDistance=distance(t);startFov=fov;};
    canvas.addEventListener('touchstart',e=>{
      if(e.touches.length>=2)beginPinch(e.touches);
      else if(e.touches.length===1){mode='rotate';tx=e.touches[0].clientX;ty=e.touches[0].clientY;}
      e.preventDefault();
    },{passive:false,capture:true});
    canvas.addEventListener('touchmove',e=>{
      if(e.touches.length>=2){
        if(mode!=='pinch')beginPinch(e.touches);
        setFov(startFov/(distance(e.touches)/startDistance));e.preventDefault();return;
      }
      if(e.touches.length===1){
        const t=e.touches[0];
        if(mode!=='rotate'){mode='rotate';tx=t.clientX;ty=t.clientY;e.preventDefault();return;}
        const dx=t.clientX-tx,dy=t.clientY-ty;tx=t.clientX;ty=t.clientY;rotate(dx,dy);e.preventDefault();
      }
    },{passive:false,capture:true});
    canvas.addEventListener('touchend',e=>{
      if(e.touches.length>=2)beginPinch(e.touches);
      else if(e.touches.length===1){mode='rotate';tx=e.touches[0].clientX;ty=e.touches[0].clientY;}
      else mode='none';
      e.preventDefault();
    },{passive:false,capture:true});
    canvas.addEventListener('touchcancel',e=>{mode='none';e.preventDefault();},{passive:false,capture:true});

    document.addEventListener('wheel',e=>{
      if(e.ctrlKey)return;
      if(e.target.closest('#galleryPanel,#galleryToggle,#topbar,#bottombar'))return;
      e.preventDefault();
      setFov(fov+(e.deltaY<0?-STEP:STEP));
    },{passive:false});
  }
  installGestures();

  function loadPhoto(data){
    if(!data?.url)return;
    closeViewModeMenu();
    title.textContent=data.title||'';
    setActiveGalleryItem(data.itemId);
    loading.style.display='block';

    const nextImage=document.createElement('img');
    const textureId='photo360Texture_'+Date.now()+'_'+Math.floor(Math.random()*100000);
    nextImage.id=textureId;
    nextImage.crossOrigin='anonymous';

    nextImage.onload=()=>{
      const oldImage=imageEl;
      imageEl=nextImage;
      sky.setAttribute('src','#'+textureId);
      pTextureImage=null;
      if(currentViewMode().key!=='normal') applyViewMode();
      loading.style.display='none';
      if(oldImage) setTimeout(()=>oldImage.remove(),750);
    };
    nextImage.onerror=()=>{
      loading.textContent='Unable to load this 360° photo';
      setTimeout(()=>{loading.style.display='none';loading.textContent='Finding next 360° photo…';},2200);
    };

    assets.appendChild(nextImage);
    nextImage.src=data.url;
    setTimeout(()=>{hint.style.opacity='0';},3500);
  }

  // A-Frame may add its own VR/AR UI after scene initialization. Remove it repeatedly
  // for the first few seconds and also watch later DOM mutations.
  function removeAFrameVrUi(){
    const selectors='.a-enter-vr,.a-enter-ar,.a-enter-vr-button,.a-enter-ar-button,.a-enter-vr-modal,[class*=\"enter-vr\"],[class*=\"enter-ar\"]';
    const roots=[document];
    const scene=document.querySelector('a-scene');
    if(scene && scene.shadowRoot) roots.push(scene.shadowRoot);
    roots.forEach(root=>{
      try{root.querySelectorAll(selectors).forEach(el=>el.remove());}catch(_){}
    });
    try{scene?.setAttribute('vr-mode-ui','enabled',false);}catch(_){}
  }
  removeAFrameVrUi();
  new MutationObserver(removeAFrameVrUi).observe(document.body,{childList:true,subtree:true});
  let vrUiSweeps=0;
  const vrUiTimer=setInterval(()=>{
    removeAFrameVrUi();
    if(++vrUiSweeps>=20) clearInterval(vrUiTimer);
  },250);

  window.addEventListener('message',e=>{
    const data=e.data||{};
    if(data.type==='JF_PHOTO360_LOAD'){
      loadPhoto(data);
      return;
    }
    if(data.type==='JF_PHOTO360_GALLERY_LOADING'){
      galleryCount.textContent='';
      galleryList.innerHTML='<div id="galleryStatus">Loading 360 photos…</div>';
      return;
    }
    if(data.type==='JF_PHOTO360_GALLERY'){
      renderGallery(data.items,data.currentItemId||currentGalleryItemId);
      return;
    }
    if(data.type==='JF_PHOTO360_NAV_BUSY'){
      const busy=Boolean(data.busy);
      previousPhoto.disabled=busy;
      nextPhoto.disabled=busy;
      loading.style.display=busy?'block':'none';
      if(data.message)loading.textContent=data.message;
      else if(!busy)loading.textContent='Finding next 360° photo…';
      return;
    }
    if(data.type==='JF_PHOTO360_NAV_RESULT'){
      previousPhoto.disabled=false;
      nextPhoto.disabled=false;
      loading.style.display='none';
      loading.textContent='Finding next 360° photo…';
      if(data.message){
        hint.textContent=data.message;
        hint.style.opacity='1';
        setTimeout(()=>{hint.style.opacity='0';},2200);
      }
    }
  });
})();
<\/script>
</body>
</html>`;

  function getPhotoTitle(info) {
    // Jellyfin's photo slide itself does not render the title in the screenshot mode;
    // use metadata asynchronously when available, otherwise leave it blank.
    return info?.image?.alt || '';
  }

  function open360Viewer(info, { autoStarted = false } = {}) {
    if (!info) info = getActivePhotoInfo();
    if (!info) return;

    const existing = document.getElementById(OVERLAY_ID);
    if (existing) {
      if (existing.dataset.itemId === info.itemId) return;
      close360Viewer({ suppressAuto: false });
    }

    currentOverlayItemId = info.itemId;

    // Hide, rather than destroy, Jellyfin's native slideshow. That preserves
    // the current Swiper slide and makes Back instantaneous/reliable.
    info.dialog.style.visibility = 'hidden';
    info.dialog.setAttribute('aria-hidden', 'true');

    const blob = new Blob([VIEWER_HTML], { type: 'text/html' });
    const blobUrl = URL.createObjectURL(blob);

    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.dataset.itemId = info.itemId;
    overlay.dataset.blobUrl = blobUrl;
    overlay.dataset.autoStarted = String(Boolean(autoStarted));
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#000;';

    const iframe = document.createElement('iframe');
    iframe.src = blobUrl;
    iframe.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;background:#000;';
    iframe.allow = 'autoplay; fullscreen; xr-spatial-tracking; accelerometer; gyroscope; magnetometer';
    iframe.setAttribute('allowfullscreen', '');

    iframe.onload = async () => {
      let title = getPhotoTitle(info);
      try {
        const item = await getItemMetadata(info);
        title = item?.Name || title;
      } catch (_) {}

      iframe.contentWindow?.postMessage({
        type: 'JF_PHOTO360_LOAD',
        url: info.url,
        itemId: info.itemId,
        serverId: info.serverId,
        title
      }, '*');
      sendGalleryToViewer(info.itemId);
    };

    overlay.appendChild(iframe);
    document.body.appendChild(overlay);
  }

  function getViewerIframe() {
    return document.querySelector('#' + OVERLAY_ID + ' iframe');
  }

  function postToViewer(message) {
    getViewerIframe()?.contentWindow?.postMessage(message, '*');
  }

  function getNativeNavButton(direction) {
    const dialog = document.querySelector('.slideshowDialog');
    if (!dialog) return null;
    return dialog.querySelector(direction === 'previous' ? '.btnSlideshowPrevious' : '.btnSlideshowNext');
  }

  function nativeNavUnavailable(button) {
    return !button ||
      button.disabled ||
      button.classList.contains('swiper-button-disabled') ||
      button.getAttribute('aria-disabled') === 'true';
  }

  function waitForActivePhotoChange(previousItemId, timeoutMs = 1200) {
    return new Promise(resolve => {
      const started = Date.now();
      const poll = () => {
        const info = getActivePhotoInfo();
        if (info?.itemId && info.itemId !== previousItemId) {
          resolve(info);
          return;
        }
        if (Date.now() - started >= timeoutMs) {
          resolve(null);
          return;
        }
        setTimeout(poll, 40);
      };
      poll();
    });
  }

  async function moveNativeSlideshowOne(direction) {
    const before = getActivePhotoInfo();
    if (!before) return null;

    const button = getNativeNavButton(direction);
    if (nativeNavUnavailable(button)) return null;

    button.click();
    return waitForActivePhotoChange(before.itemId);
  }

  async function restoreNativeSlideshow(directionMoved, steps) {
    if (!steps) return;
    const reverse = directionMoved === 'next' ? 'previous' : 'next';
    for (let i = 0; i < steps; i++) {
      const moved = await moveNativeSlideshowOne(reverse);
      if (!moved) break;
    }
  }

  async function navigateToAdjacent360(direction) {
    if (navigationBusy || !document.getElementById(OVERLAY_ID)) return;
    navigationBusy = true;

    const original = getActivePhotoInfo();
    if (!original) {
      navigationBusy = false;
      return;
    }

    postToViewer({
      type: 'JF_PHOTO360_NAV_BUSY',
      busy: true,
      message: direction === 'previous' ? 'Finding previous 360° photo…' : 'Finding next 360° photo…'
    });

    let stepsMoved = 0;
    let found = null;
    const MAX_SCAN = 200;

    try {
      for (let i = 0; i < MAX_SCAN; i++) {
        const candidate = await moveNativeSlideshowOne(direction);
        if (!candidate) break;
        stepsMoved++;

        let item = null;
        try {
          item = await getItemMetadata(candidate);
        } catch (error) {
          console.warn('[Jellyfin Photo360] Unable to inspect adjacent photo:', error);
          continue;
        }

        if (itemHas360Tag(item)) {
          found = { info: candidate, item };
          break;
        }
      }

      if (!found) {
        await restoreNativeSlideshow(direction, stepsMoved);
        postToViewer({
          type: 'JF_PHOTO360_NAV_RESULT',
          message: direction === 'previous' ? 'No previous VR360 photo' : 'No next VR360 photo'
        });
        return;
      }

      const overlay = document.getElementById(OVERLAY_ID);
      if (!overlay) return;

      currentOverlayItemId = found.info.itemId;
      overlay.dataset.itemId = found.info.itemId;
      overlay.dataset.autoStarted = 'false';
      autoDismissedItemId = null;
      lastObservedItemId = found.info.itemId;
      lastAutoCheckedItemId = found.info.itemId;

      postToViewer({
        type: 'JF_PHOTO360_LOAD',
        url: found.info.url,
        itemId: found.info.itemId,
        serverId: found.info.serverId,
        title: found.item?.Name || getPhotoTitle(found.info) || ''
      });
      postToViewer({ type: 'JF_PHOTO360_NAV_RESULT' });
    } catch (error) {
      console.error('[Jellyfin Photo360] Navigation failed:', error);
      try {
        const now = getActivePhotoInfo();
        if (now?.itemId !== original.itemId) {
          await restoreNativeSlideshow(direction, stepsMoved);
        }
      } catch (_) {}
      postToViewer({ type: 'JF_PHOTO360_NAV_RESULT', message: 'Unable to change 360° photo' });
    } finally {
      navigationBusy = false;
    }
  }

  async function goTo360GalleryItem(itemId, requestedIndex) {
    if (navigationBusy || !itemId || !document.getElementById(OVERLAY_ID)) return;
    const current = getActivePhotoInfo();
    if (current?.itemId === itemId) return;

    navigationBusy = true;
    postToViewer({ type: 'JF_PHOTO360_NAV_BUSY', busy: true, message: 'Opening 360° photo…' });

    try {
      const swiper = getNativeSwiper();
      let targetIndex = Number.isInteger(requestedIndex) ? requestedIndex : -1;

      if (swiper && targetIndex < 0) {
        const entries = getVirtualSlideshowEntries();
        targetIndex = entries.findIndex(entry => String(entry?.Id || entry?.id || entry?.ItemId || entry?.itemId || '') === String(itemId));
      }

      if (!swiper || targetIndex < 0) {
        throw new Error('Unable to locate the selected photo in Jellyfin slideshow.');
      }

      const beforeId = current?.itemId || '';
      swiper.slideTo(targetIndex, 240);
      let info = await waitForActivePhotoChange(beforeId, 1800);
      if (!info) info = getActivePhotoInfo();
      if (!info || String(info.itemId) !== String(itemId)) {
        throw new Error('Jellyfin did not switch to the selected photo.');
      }

      const item = await getItemMetadata(info);
      if (!itemHas360Tag(item)) {
        throw new Error('The selected photo is no longer tagged VR360.');
      }

      const overlay = document.getElementById(OVERLAY_ID);
      currentOverlayItemId = info.itemId;
      overlay.dataset.itemId = info.itemId;
      overlay.dataset.autoStarted = 'false';
      autoDismissedItemId = null;
      lastObservedItemId = info.itemId;
      lastAutoCheckedItemId = info.itemId;

      postToViewer({
        type: 'JF_PHOTO360_LOAD',
        url: info.url,
        itemId: info.itemId,
        serverId: info.serverId,
        title: item?.Name || getPhotoTitle(info) || ''
      });
      postToViewer({ type: 'JF_PHOTO360_NAV_RESULT' });
    } catch (error) {
      console.error('[Jellyfin Photo360] Gallery navigation failed:', error);
      postToViewer({ type: 'JF_PHOTO360_NAV_RESULT', message: 'Unable to open selected 360° photo' });
    } finally {
      navigationBusy = false;
    }
  }

  window.addEventListener('message', (event) => {
    if (event.data?.type === 'JF_PHOTO360_EXIT_LIBRARY') {
      exit360ViewerToLibrary();
      return;
    }

    // Keep support for the old message type in case a cached iframe briefly
    // survives a script refresh.
    if (event.data?.type === 'JF_PHOTO360_CLOSE') {
      exit360ViewerToLibrary();
      return;
    }

    if (event.data?.type === 'JF_PHOTO360_GOTO') {
      const index = Number(event.data.index);
      goTo360GalleryItem(String(event.data.itemId || ''), Number.isInteger(index) ? index : -1);
      return;
    }

    if (event.data?.type === 'JF_PHOTO360_NAVIGATE') {
      const direction = event.data.direction === 'previous' ? 'previous' : 'next';
      navigateToAdjacent360(direction);
    }
  });

  async function maybeAutoOpen(info, force = false) {
    if (!autoEnabled || !info || document.getElementById(OVERLAY_ID)) return;

    const itemId = info.itemId;
    if (!itemId) return;

    if (lastObservedItemId && lastObservedItemId !== itemId) {
      autoDismissedItemId = null;
    }
    lastObservedItemId = itemId;

    if (autoDismissedItemId === itemId) return;
    if (!force && lastAutoCheckedItemId === itemId) return;
    if (checkInFlightItemId === itemId) return;

    checkInFlightItemId = itemId;
    try {
      const item = await getItemMetadata(info);
      const current = getActivePhotoInfo();
      if (!current || current.itemId !== itemId) return;

      lastAutoCheckedItemId = itemId;
      const tags = item?.Tags || [];
      log('Metadata checked', { itemId, tags });

      if (itemHas360Tag(item) && autoEnabled && autoDismissedItemId !== itemId) {
        open360Viewer(current, { autoStarted: true });
      }
    } catch (error) {
      console.warn('[Jellyfin Photo360] Unable to read photo metadata:', error);
    } finally {
      if (checkInFlightItemId === itemId) checkInFlightItemId = null;
    }
  }

  function checkCurrentPhoto(force = false) {
    const info = getActivePhotoInfo();

    if (!info) {
      // Native slideshow is closed. Clean up our overlay if necessary.
      if (document.getElementById(OVERLAY_ID)) close360Viewer({ suppressAuto: false });
      lastObservedItemId = null;
      lastAutoCheckedItemId = null;
      autoDismissedItemId = null;
      return;
    }

    ensurePhotoControls();

    if (lastObservedItemId && lastObservedItemId !== info.itemId) {
      autoDismissedItemId = null;
      lastAutoCheckedItemId = null;
    }
    lastObservedItemId = info.itemId;

    maybeAutoOpen(info, force);
  }

  const observer = new MutationObserver(() => {
    checkCurrentPhoto(false);
  });

  function init() {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });

    // Swiper can update the active slide without creating/removing a node;
    // a light poll is a reliable fallback and costs virtually nothing.
    setInterval(() => checkCurrentPhoto(false), 500);
    checkCurrentPhoto(false);
    log('Initialized. Tag 360 photos with', TAG_NAME);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
