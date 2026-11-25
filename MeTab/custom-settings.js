/* =====================================================
   MeTab 自定义设置
   功能：自定义壁纸、快捷入口编辑
===================================================== */

(() => {
  'use strict';

  const STORAGE = {
    background: 'metab_custom_background',
    shortcuts: 'metab_custom_shortcuts',
    preferredBackground: 'preferredBackground'
  };

  const DB_NAME = 'metab_custom_settings';
  const DB_VERSION = 2;
  const WALLPAPER_STORE = 'wallpapers';
  const ICON_STORE = 'shortcutIcons';

  const LOCAL_ICON_MARKER = '__metab_indexeddb_icon__';

  let currentObjectURL = '';
  let defaultShortcuts = [];
  let migrationPromise = null;

  // 保存当前页面中创建的本地图标 Object URL
  const iconObjectURLs = new Map();

  // ===== IndexedDB =====

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('当前浏览器不支持 IndexedDB'));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;

        // 保留原有壁纸仓库
        if (!db.objectStoreNames.contains(WALLPAPER_STORE)) {
          db.createObjectStore(WALLPAPER_STORE);
        }

        // 新增快捷入口图标仓库
        if (!db.objectStoreNames.contains(ICON_STORE)) {
          db.createObjectStore(ICON_STORE);
        }
      };

      request.onsuccess = () => resolve(request.result);

      request.onerror = () => {
        reject(request.error || new Error('无法打开本地数据库'));
      };

      request.onblocked = () => {
        console.warn('MeTab：数据库升级被其他页面阻塞，请关闭其他 MeTab 页面后重试。');
      };
    });
  }

  function databaseRequest(storeName, mode, operation) {
    return openDatabase().then(db => new Promise((resolve, reject) => {
      let transaction;
      let request;

      try {
        transaction = db.transaction(storeName, mode);
        request = operation(transaction.objectStore(storeName));
      } catch (error) {
        db.close();
        reject(error);
        return;
      }

      let result;
      let settled = false;

      function fail(error) {
        if (settled) return;
        settled = true;
        db.close();
        reject(error || new Error('数据库操作失败'));
      }

      request.onsuccess = () => {
        result = request.result;
      };

      request.onerror = () => {
        fail(request.error);
      };

      transaction.oncomplete = () => {
        if (settled) return;

        settled = true;
        db.close();
        resolve(result);
      };

      transaction.onerror = () => {
        fail(transaction.error);
      };

      transaction.onabort = () => {
        fail(transaction.error || new Error('数据库操作已取消'));
      };
    }));
  }

  // ===== 本地壁纸读写 =====

  async function saveLocalWallpaper(file) {
    await databaseRequest(
      WALLPAPER_STORE,
      'readwrite',
      store => store.put(file, 'current')
    );
  }

  async function readLocalWallpaper() {
    return (
      await databaseRequest(
        WALLPAPER_STORE,
        'readonly',
        store => store.get('current')
      )
    ) || null;
  }

  // ===== 本地图标读写 =====

  function iconKey(index) {
    return `shortcut-${index}`;
  }

  async function saveLocalIcon(index, file) {
    await databaseRequest(
      ICON_STORE,
      'readwrite',
      store => store.put(file, iconKey(index))
    );
  }

  async function readLocalIcon(index) {
    return (
      await databaseRequest(
        ICON_STORE,
        'readonly',
        store => store.get(iconKey(index))
      )
    ) || null;
  }

  async function deleteLocalIcon(index) {
    await databaseRequest(
      ICON_STORE,
      'readwrite',
      store => store.delete(iconKey(index))
    );
  }

  function createIconObjectURL(index, file) {
    const oldURL = iconObjectURLs.get(index);

    if (oldURL) {
      URL.revokeObjectURL(oldURL);
      iconObjectURLs.delete(index);
    }

    const url = URL.createObjectURL(file);

    iconObjectURLs.set(index, url);

    return url;
  }

  function releaseIconObjectURL(index) {
    const url = iconObjectURLs.get(index);

    if (!url) return;

    URL.revokeObjectURL(url);
    iconObjectURLs.delete(index);
  }

  // ===== 通用工具 =====

  function isVideoURL(url) {
    try {
      const pathname = new URL(url, location.href).pathname.toLowerCase();

      return /\.(mp4|webm|ogg|mov|m4v)$/.test(pathname);
    } catch {
      return /\.(mp4|webm|ogg|mov|m4v)(?:[?#].*)?$/i.test(url);
    }
  }

  function showDialogError(dialog, message) {
    if (!dialog) return;

    let hint = dialog.querySelector('.metab-custom-error');

    if (!hint) {
      hint = document.createElement('p');
      hint.className = 'metab-custom-error';
      hint.setAttribute('role', 'alert');

      const panel = dialog.querySelector('.metab-custom-panel');
      const actions = panel?.querySelector('.metab-custom-actions');

      if (actions) {
        panel.insertBefore(hint, actions);
      } else if (panel) {
        panel.appendChild(hint);
      }
    }

    hint.textContent = message;
    hint.hidden = false;
  }

  function clearDialogError(dialog) {
    const hint = dialog?.querySelector('.metab-custom-error');

    if (hint) {
      hint.textContent = '';
      hint.hidden = true;
    }
  }

const dialogCloseTimers = new WeakMap();

function openDialog(dialog) {
  if (!dialog) return;

  const timer = dialogCloseTimers.get(dialog);

  if (timer) {
    clearTimeout(timer);
    dialogCloseTimers.delete(dialog);
  }

  dialog.classList.remove('is-closing');
  dialog.hidden = false;
}

function closeDialog(dialog) {
  if (!dialog || dialog.hidden) return;

  dialog.classList.add('is-closing');
  clearDialogError(dialog);

  const timer = setTimeout(() => {
    dialog.hidden = true;
    dialog.classList.remove('is-closing');
    dialogCloseTimers.delete(dialog);
  }, 200);

  dialogCloseTimers.set(dialog, timer);
}

  function releaseObjectURL() {
    if (!currentObjectURL) return;

    URL.revokeObjectURL(currentObjectURL);
    currentObjectURL = '';
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => resolve(reader.result);

      reader.onerror = () => {
        reject(reader.error || new Error('读取文件失败'));
      };

      reader.readAsDataURL(file);
    });
  }

  // ===== 快捷入口配置读写 =====

  function readShortcutConfig() {
    try {
      const result = JSON.parse(
        localStorage.getItem(STORAGE.shortcuts) || '{}'
      );

      return result && typeof result === 'object' && !Array.isArray(result)
        ? result
        : {};
    } catch {
      return {};
    }
  }

  function writeShortcutConfig(config) {
    localStorage.setItem(
      STORAGE.shortcuts,
      JSON.stringify(config)
    );
  }

  // ===== 旧图标数据迁移 =====

  async function migrateLegacyIcons() {
    if (migrationPromise) return migrationPromise;

    migrationPromise = (async () => {
      const saved = readShortcutConfig();
      let changed = false;

      for (const [index, config] of Object.entries(saved)) {
        if (
          !config ||
          typeof config.icon !== 'string' ||
          !config.icon.startsWith('data:')
        ) {
          continue;
        }

        try {
          const response = await fetch(config.icon);
          const blob = await response.blob();

          if (!blob.type.startsWith('image/')) {
            continue;
          }

          await saveLocalIcon(index, blob);

          // 只替换图标字段，保留其他配置
          config.icon = LOCAL_ICON_MARKER;
          changed = true;
        } catch (error) {
          console.warn(
            `MeTab：快捷入口 ${index} 的旧图标迁移失败。`,
            error
          );
        }
      }

      if (changed) {
        try {
          writeShortcutConfig(saved);
        } catch (error) {
          console.warn(
            'MeTab：旧图标已尝试迁移，但无法更新配置。',
            error
          );
        }
      }
    })().finally(() => {
      migrationPromise = null;
    });

    return migrationPromise;
  }

  // ===== 背景切换 =====

  function setCustomBackground(url, type) {
    const video = document.getElementById('bg-video');
    const image = document.getElementById('bg-image');

    if (!url) return;

    const videoBackground = type
      ? type === 'video'
      : isVideoURL(url);

    if (videoBackground) {
      if (!video) return;

      if (image) {
        image.style.display = 'none';
      }

      video.pause();
      video.removeAttribute('src');
      video.load();

      video.src = url;
      video.style.display = 'block';
      video.load();

      const playPromise = video.play();

      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          // 浏览器可能禁止自动播放。
        });
      }
    } else {
      if (!image) return;

      if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
        video.style.display = 'none';
      }

      image.src = url;
      image.style.display = 'block';
    }
  }

  async function restoreBackground() {
    let config;

    try {
      config = JSON.parse(
        localStorage.getItem(STORAGE.background) || 'null'
      );
    } catch {
      config = null;
    }

    if (!config) return;

    if (config.type === 'local') {
      try {
        const file = await readLocalWallpaper();

        if (!file) return;

        releaseObjectURL();
        currentObjectURL = URL.createObjectURL(file);

        const type = file.type.startsWith('video/')
          ? 'video'
          : 'image';

        setCustomBackground(currentObjectURL, type);
      } catch (error) {
        console.warn('MeTab：无法恢复本地壁纸。', error);
      }

      return;
    }

    if (config.url) {
      releaseObjectURL();
      setCustomBackground(config.url, config.type);
    }
  }

  // ===== 自定义壁纸弹窗 =====

  function createWallpaperDialog() {
    if (document.getElementById('metabWallpaperDialog')) return;

    const dialog = document.createElement('div');

    dialog.id = 'metabWallpaperDialog';
    dialog.className = 'metab-custom-dialog';
    dialog.hidden = true;

    dialog.innerHTML = `
      <section class="metab-custom-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="metabWallpaperTitle">

        <h3 id="metabWallpaperTitle">自定义壁纸</h3>

        <label for="metabWallpaperURL">壁纸 URL</label>
        <input
          id="metabWallpaperURL"
          type="text"
          placeholder="输入壁纸 URL"
        >

        <div class="metab-file-picker">
          <label for="metabWallpaperFile">选择本地图片 / 视频</label>
          <span id="metabWallpaperFileName">未选择文件</span>
          <input
            id="metabWallpaperFile"
            type="file"
            accept="image/*,video/*"
          >
        </div>

        <p class="metab-custom-hint">
          支持网络图片、视频链接以及本地图片和视频文件。
          本地文件保存在当前浏览器中，不会上传到服务器。
        </p>

        <div class="metab-custom-actions">
          <button type="button" data-close>取消</button>
          <button type="button" id="metabWallpaperApply">应用壁纸</button>
        </div>
      </section>
    `;

    document.body.appendChild(dialog);

    const urlInput = dialog.querySelector('#metabWallpaperURL');
    const fileInput = dialog.querySelector('#metabWallpaperFile');
    const applyButton = dialog.querySelector('#metabWallpaperApply');
    const fileNameDisplay = dialog.querySelector('#metabWallpaperFileName');

    fileInput.addEventListener('change', () => {
      fileNameDisplay.textContent =
        fileInput.files?.[0]?.name || '未选择文件';
    });

    dialog.querySelector('[data-close]').addEventListener('click', () => {
      closeDialog(dialog);
    });

    urlInput.addEventListener('input', () => {
      if (urlInput.value.trim()) {
        fileInput.value = '';
        fileNameDisplay.textContent = '未选择文件';
      }
    });

    fileInput.addEventListener('change', () => {
      if (fileInput.files?.length) {
        urlInput.value = '';
      }
    });

    applyButton.addEventListener('click', async () => {
      const file = fileInput.files?.[0];
      const url = urlInput.value.trim();

      clearDialogError(dialog);

      if (!file && !url) {
        showDialogError(dialog, '请先输入壁纸 URL 或选择本地文件。');
        return;
      }

      try {
        if (file) {
          if (
            !file.type.startsWith('image/') &&
            !file.type.startsWith('video/')
          ) {
            showDialogError(dialog, '请选择图片或视频文件。');
            return;
          }

          await saveLocalWallpaper(file);

          // 先保存配置，成功后再切换背景
          localStorage.setItem(
            STORAGE.background,
            JSON.stringify({ type: 'local' })
          );

          localStorage.setItem(
            STORAGE.preferredBackground,
            '__metab_local_wallpaper__'
          );

          releaseObjectURL();
          currentObjectURL = URL.createObjectURL(file);

          setCustomBackground(
            currentObjectURL,
            file.type.startsWith('video/') ? 'video' : 'image'
          );
        } else {
          const type = isVideoURL(url) ? 'video' : 'image';

          localStorage.setItem(
            STORAGE.background,
            JSON.stringify({ type, url })
          );

          localStorage.setItem(STORAGE.preferredBackground, url);

          releaseObjectURL();
          setCustomBackground(url, type);
        }

        closeDialog(dialog);
      } catch (error) {
        console.error('MeTab：应用自定义壁纸失败。', error);

        showDialogError(
          dialog,
          '壁纸设置失败，请检查浏览器存储空间或重新选择文件。'
        );
      }
    });
  }

  // ===== 快捷入口默认配置 =====

  function captureDefaultShortcuts() {
    const items = document.querySelectorAll('#quickLinks .quick-item');

    defaultShortcuts = Array.from(items).map(item => {
      const icon = item.querySelector('.quick-icon');

      return {
        title: item.title || item.textContent.trim(),
        url: item.getAttribute('href') || '',
        icon: icon?.getAttribute('src') || ''
      };
    });
  }

  // ===== 快捷入口读取 =====

  async function loadShortcuts() {
    const saved = readShortcutConfig();

    const items = document.querySelectorAll(
      '#quickLinks .quick-item'
    );

    for (const [index, item] of Array.from(items).entries()) {
      const icon = item.querySelector('.quick-icon');
      const config = saved[index];

      if (!icon || !config) continue;

      if (typeof config.url === 'string') {
        item.setAttribute('href', config.url);
      }

if (typeof config.title === 'string' && config.title) {
  item.title = config.title;
  item.setAttribute('aria-label', config.title);
} else {
  // 未设置名称时，不再使用链接作为悬停提示
  item.removeAttribute('title');
  item.removeAttribute('aria-label');
}

      if (config.icon === LOCAL_ICON_MARKER) {
        try {
          const file = await readLocalIcon(index);

          if (file) {
            icon.src = createIconObjectURL(index, file);
            icon.dataset.metabLocalIcon = 'true';
          } else {
            console.warn(
              `MeTab：快捷入口 ${index} 的本地图标不存在。`
            );
          }
        } catch (error) {
          console.warn(
            `MeTab：无法读取快捷入口 ${index} 的本地图标。`,
            error
          );
        }
      } else if (
        typeof config.icon === 'string' &&
        config.icon
      ) {
        icon.src = config.icon;
        delete icon.dataset.metabLocalIcon;
      }

      icon.style.objectFit = 'contain';
      icon.style.objectPosition = 'center';
    }
  }

  // ===== 快捷入口编辑弹窗 =====

  function createShortcutDialog() {
    if (document.getElementById('metabShortcutDialog')) return;

    const dialog = document.createElement('div');

    dialog.id = 'metabShortcutDialog';
    dialog.className = 'metab-custom-dialog';
    dialog.hidden = true;

    dialog.innerHTML = `
      <section class="metab-custom-panel metab-shortcut-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="metabShortcutTitle">

        <h3 id="metabShortcutTitle">编辑快捷入口</h3>

        <div class="metab-shortcut-preview">
          <img id="metabShortcutPreview" src="" alt="">
        </div>

        <label for="metabShortcutName">名称</label>
        <input
          id="metabShortcutName"
          type="text"
          maxlength="40"
          placeholder="输入快捷入口名称(选填)"
        >

        <label for="metabShortcutURL">链接*</label>
        <input
          id="metabShortcutURL"
          type="text"
          placeholder="输入快捷入口链接"
        >

        <label for="metabShortcutIcon">图标 URL*</label>
        <input
          id="metabShortcutIcon"
          type="text"
          placeholder="输入图标 URL"
        >

        <div class="metab-file-picker">
          <label for="metabShortcutFile">选择本地图片</label>
          <span id="metabShortcutFileName">未选择文件</span>
          <input
            id="metabShortcutFile"
            type="file"
            accept="image/*"
          >
        </div>

        <div class="metab-custom-actions">
          <button type="button" data-shortcut-cancel>取消</button>
          <button type="button" data-shortcut-reset>恢复默认</button>
          <button type="button" data-shortcut-save>保存</button>
        </div>
      </section>
    `;

    document.body.appendChild(dialog);

    const nameInput = dialog.querySelector('#metabShortcutName');
    const urlInput = dialog.querySelector('#metabShortcutURL');
    const iconInput = dialog.querySelector('#metabShortcutIcon');
    const fileInput = dialog.querySelector('#metabShortcutFile');
    const fileNameDisplay = dialog.querySelector('#metabShortcutFileName');
    const preview = dialog.querySelector('#metabShortcutPreview');

    fileInput.addEventListener('change', () => {
      fileNameDisplay.textContent =
        fileInput.files?.[0]?.name || '未选择文件';
    });

    dialog.querySelector('[data-shortcut-cancel]')
      .addEventListener('click', () => {
        closeDialog(dialog);
      });

    // 手动输入图标 URL 时切换到网络图标模式
    iconInput.addEventListener('input', () => {
      const value = iconInput.value.trim();

      fileInput.value = '';
      fileNameDisplay.textContent = '未选择文件';

      dialog.dataset.keepLocalIcon = 'false';

      preview.style.display = value ? 'block' : 'none';

      if (value) {
        preview.src = value;
      } else {
        preview.removeAttribute('src');
      }
    });

    // 选择本地图标并预览
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];

      if (!file) return;

      clearDialogError(dialog);

      if (!file.type.startsWith('image/')) {
        showDialogError(dialog, '请选择图片文件。');
        fileInput.value = '';
        fileNameDisplay.textContent = '未选择文件';
        return;
      }

      iconInput.value = '';
      dialog.dataset.keepLocalIcon = 'false';

      const reader = new FileReader();

      reader.onload = () => {
        preview.src = reader.result;
        preview.style.display = 'block';
      };

      reader.onerror = () => {
        showDialogError(dialog, '无法读取所选图片。');
      };

      reader.readAsDataURL(file);
    });

    preview.addEventListener('error', () => {
      preview.style.display = 'none';
    });

    preview.addEventListener('load', () => {
      preview.style.display = 'block';
    });

    // 保存快捷入口
    dialog.querySelector('[data-shortcut-save]')
      .addEventListener('click', async () => {
        clearDialogError(dialog);

        const name = nameInput.value.trim();
        const url = urlInput.value.trim();
        const iconURL = iconInput.value.trim();
        const file = fileInput.files?.[0];

        if (!url) {
          showDialogError(dialog, '请输入快捷入口链接。');
          return;
        }

        const index = Number(dialog.dataset.index);

        const items = document.querySelectorAll(
          '#quickLinks .quick-item'
        );

        const currentItem = items[index];

        if (!currentItem) return;

        const currentIcon = currentItem.querySelector('.quick-icon');

        if (!currentIcon) return;

        const saved = readShortcutConfig();
        const previousConfig = saved[index] || {};

        const hadLocalIcon =
          previousConfig.icon === LOCAL_ICON_MARKER;

        const keepLocalIcon =
          dialog.dataset.keepLocalIcon === 'true' &&
          hadLocalIcon &&
          !file &&
          !iconURL;

        let finalIcon = iconURL || '';

        try {
          if (file) {
            if (!file.type.startsWith('image/')) {
              showDialogError(dialog, '请选择图片文件。');
              return;
            }

            // 本地图标直接存入 IndexedDB，不再转成 Base64 保存
            await saveLocalIcon(index, file);

            finalIcon = LOCAL_ICON_MARKER;
          } else if (keepLocalIcon) {
            finalIcon = LOCAL_ICON_MARKER;
          } else if (!iconURL && hadLocalIcon) {
            // 未填写新图标时，保留当前本地图标
            finalIcon = LOCAL_ICON_MARKER;
          } else if (!iconURL) {
            finalIcon = currentIcon.getAttribute('src') || '';
          }

          saved[index] = {
            title: name,
            url,
            icon: finalIcon
          };

          // 先写入小型配置，避免存储失败后改变页面
          writeShortcutConfig(saved);
        } catch (error) {
          console.error('MeTab：保存快捷入口失败。', error);

          showDialogError(
            dialog,
            error?.name === 'QuotaExceededError'
              ? '保存失败：浏览器本地存储空间不足。请尝试使用更小的图片。'
              : '保存失败，请检查浏览器存储权限或稍后重试。'
          );

          return;
        }

        // 更新页面
        currentItem.setAttribute('href', url);
if (name) {
  currentItem.title = name;
  currentItem.setAttribute('aria-label', name);
} else {
  currentItem.removeAttribute('title');
  currentItem.removeAttribute('aria-label');
}
        currentItem.setAttribute('aria-label', name || url);

        if (finalIcon === LOCAL_ICON_MARKER) {
          try {
            const localFile = await readLocalIcon(index);

            if (localFile) {
              currentIcon.src = createIconObjectURL(index, localFile);
              currentIcon.dataset.metabLocalIcon = 'true';
            }
          } catch (error) {
            console.warn('MeTab：无法更新本地图标预览。', error);
          }
        } else if (finalIcon) {
          releaseIconObjectURL(index);
          currentIcon.src = finalIcon;
          delete currentIcon.dataset.metabLocalIcon;
        }

        currentIcon.style.objectFit = 'contain';
        currentIcon.style.objectPosition = 'center';

        closeDialog(dialog);
      });

    // 恢复默认
    dialog.querySelector('[data-shortcut-reset]')
      .addEventListener('click', async () => {
        clearDialogError(dialog);

        const index = Number(dialog.dataset.index);
        const original = defaultShortcuts[index];

        if (!original) {
          showDialogError(dialog, '未找到该快捷入口的默认配置。');
          return;
        }

        const items = document.querySelectorAll(
          '#quickLinks .quick-item'
        );

        const currentItem = items[index];

        if (!currentItem) return;

        const currentIcon = currentItem.querySelector('.quick-icon');
        const saved = readShortcutConfig();

        delete saved[index];

        try {
          writeShortcutConfig(saved);
        } catch (error) {
          console.warn('MeTab：无法更新快捷入口配置。', error);

          showDialogError(dialog, '恢复默认失败，请稍后重试。');
          return;
        }

        // 删除该快捷入口保存的本地图标
        try {
          await deleteLocalIcon(index);
        } catch (error) {
          console.warn('MeTab：清理本地图标失败。', error);
        }

        releaseIconObjectURL(index);

        currentItem.setAttribute('href', original.url);
        currentItem.title = original.title;
        currentItem.setAttribute('aria-label', original.title);

        if (currentIcon) {
          if (original.icon) {
            currentIcon.src = original.icon;
          } else {
            currentIcon.removeAttribute('src');
          }

          delete currentIcon.dataset.metabLocalIcon;

          currentIcon.style.objectFit = 'contain';
          currentIcon.style.objectPosition = 'center';
        }

        closeDialog(dialog);
      });
  }

  // ===== 打开快捷入口编辑 =====

  function editShortcut(item, index) {
    const icon = item.querySelector('.quick-icon');
    const dialog = document.getElementById('metabShortcutDialog');

    if (!icon || !dialog) return;

    clearDialogError(dialog);

    dialog.dataset.index = index;

    dialog.querySelector('#metabShortcutName').value =
      item.title || '';

    dialog.querySelector('#metabShortcutURL').value =
      item.getAttribute('href') || '';

    const iconURL = icon.getAttribute('src') || '';

    const saved = readShortcutConfig();
    const config = saved[index];

    const isLocalIcon =
      config?.icon === LOCAL_ICON_MARKER ||
      icon.dataset.metabLocalIcon === 'true';

    dialog.querySelector('#metabShortcutIcon').value =
      isLocalIcon || iconURL.startsWith('data:') ||
      iconURL.startsWith('blob:')
        ? ''
        : iconURL;

    dialog.dataset.keepLocalIcon = isLocalIcon ? 'true' : 'false';

    const fileInput = dialog.querySelector('#metabShortcutFile');

    fileInput.value = '';

    dialog.querySelector('#metabShortcutFileName').textContent =
      '未选择文件';

    const preview = dialog.querySelector('#metabShortcutPreview');

    if (iconURL) {
      preview.src = iconURL;
      preview.style.display = 'block';
    } else {
      preview.removeAttribute('src');
      preview.style.display = 'none';
    }

    openDialog(dialog);
  }

  // ===== 快捷入口右键 / 手机长按事件 =====

  function setupShortcutEditing() {
    const container = document.getElementById('quickLinks');

    if (!container) return;

    let longPressTimer = null;
    let longPressTriggered = false;
    let touchStartX = 0;
    let touchStartY = 0;

    const LONG_PRESS_DELAY = 600;
    const MOVE_THRESHOLD = 10;

    function clearLongPressTimer() {
      if (longPressTimer !== null) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    }

    // 电脑端右键编辑
    container.addEventListener('contextmenu', event => {
      const item = event.target.closest('.quick-item');

      if (!item || !container.contains(item)) return;

      event.preventDefault();

      const items = Array.from(
        container.querySelectorAll('.quick-item')
      );

      const index = items.indexOf(item);

      if (index < 0) return;

      editShortcut(item, index);
    });

    // 手机端长按
    container.addEventListener('touchstart', event => {
      const item = event.target.closest('.quick-item');

      if (!item || !container.contains(item)) return;

      if (event.touches.length !== 1) {
        clearLongPressTimer();
        return;
      }

      const touch = event.touches[0];

      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      longPressTriggered = false;

      clearLongPressTimer();

      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        longPressTriggered = true;

        const items = Array.from(
          container.querySelectorAll('.quick-item')
        );

        const index = items.indexOf(item);

        if (index < 0) return;

        editShortcut(item, index);
      }, LONG_PRESS_DELAY);
    }, { passive: true });

    container.addEventListener('touchmove', event => {
      if (longPressTimer === null || event.touches.length !== 1) {
        clearLongPressTimer();
        return;
      }

      const touch = event.touches[0];

      const moveX = Math.abs(touch.clientX - touchStartX);
      const moveY = Math.abs(touch.clientY - touchStartY);

      if (moveX > MOVE_THRESHOLD || moveY > MOVE_THRESHOLD) {
        clearLongPressTimer();
      }
    }, { passive: true });

    container.addEventListener('touchend', () => {
      clearLongPressTimer();
    }, { passive: true });

    container.addEventListener('touchcancel', () => {
      clearLongPressTimer();
    }, { passive: true });

    // 长按打开编辑窗口后，阻止随后的合成点击跳转
    container.addEventListener('click', event => {
      if (!longPressTriggered) return;

      event.preventDefault();
      event.stopPropagation();

      longPressTriggered = false;
    }, true);
  }

  // ===== 自定义壁纸菜单事件 =====

  document.addEventListener('click', event => {
    const target = event.target;

    if (!(target instanceof Element)) return;

    // 自定义壁纸入口
    const customButton = target.closest(
      '#bgDropdown [data-action="custom-wallpaper"]'
    );

    if (customButton) {
      event.preventDefault();
      event.stopPropagation();

      const dialog = document.getElementById('metabWallpaperDialog');

      if (!dialog) return;

      clearDialogError(dialog);

      dialog.querySelector('#metabWallpaperURL').value = '';
      dialog.querySelector('#metabWallpaperFile').value = '';
      dialog.querySelector('#metabWallpaperFileName').textContent =
        '未选择文件';

      openDialog(dialog);

      return;
    }

    // 预设壁纸切换
    const item = target.closest('#bgDropdown [data-bg]');

    if (!item) return;

    localStorage.removeItem(STORAGE.background);

    releaseObjectURL();
  }, true);

  // ===== 初始化 =====

  async function init() {
    // 先获取 HTML 中的默认配置
    captureDefaultShortcuts();

    createWallpaperDialog();
    createShortcutDialog();

    setupShortcutEditing();

    // 先恢复配置中的快捷入口
    await loadShortcuts();

    // 再迁移旧的 Base64 图标
    try {
      await migrateLegacyIcons();
      await loadShortcuts();
    } catch (error) {
      console.warn('MeTab：快捷入口图标迁移失败。', error);
    }

    // 等待原有壁纸初始化完成后，再恢复自定义壁纸
    const applySavedBackground = () => {
      restoreBackground();
    };

    if (document.readyState === 'complete') {
      setTimeout(applySavedBackground, 300);
    } else {
      window.addEventListener('load', () => {
        setTimeout(applySavedBackground, 300);
      }, { once: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();