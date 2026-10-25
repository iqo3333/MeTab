/* =====================================================
   MeTab 音乐播放器
   功能：在线歌曲缓存、TXT/M3U 导入、本地音频、
         自动播放偏好、播放进度和音量记忆、
         歌词显示、系统媒体信息与控制
===================================================== */
(() => {
  'use strict';

  const STORAGE = {
    autoPlay: 'metab_music_autoplay',
    volume: 'metab_music_volume',
    track: 'metab_music_track',
    time: 'metab_music_time',
    muted: 'metab_music_muted'
  };

  // ===== IndexedDB 存储 =====
  const MUSIC_DB_NAME = 'metab_music_db';
  const MUSIC_DB_VERSION = 2;
  const MUSIC_STORE_NAME = 'localSongs';
  const ONLINE_MUSIC_STORE_NAME = 'onlineSongs';

  function openMusicDB() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('当前浏览器不支持 IndexedDB'));
        return;
      }

      const request = indexedDB.open(
        MUSIC_DB_NAME,
        MUSIC_DB_VERSION
      );

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains(MUSIC_STORE_NAME)) {
          db.createObjectStore(MUSIC_STORE_NAME, {
            keyPath: 'id'
          });
        }

        if (!db.objectStoreNames.contains(ONLINE_MUSIC_STORE_NAME)) {
          db.createObjectStore(ONLINE_MUSIC_STORE_NAME, {
            keyPath: 'url'
          });
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };

      request.onerror = () => reject(request.error);

      request.onblocked = () => {
        console.warn(
          'MeTab：数据库升级被其他页面阻止，请关闭其他 MeTab 页面后重试。'
        );
      };
    });
  }


function databaseRequest(storeName, mode, operation) {
  return openMusicDB().then(db => new Promise((resolve, reject) => {
    let settled = false;
    let transaction;

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;

      try {
        db.close();
      } catch {}

      callback(value);
    };

    try {
      transaction = db.transaction(storeName, mode);

      transaction.oncomplete = () => {
        finish(resolve, true);
      };

      transaction.onerror = () => {
        finish(
          reject,
          transaction.error || new Error('数据库操作失败')
        );
      };

      transaction.onabort = () => {
        finish(
          reject,
          transaction.error || new Error('数据库操作已取消')
        );
      };

      operation(transaction.objectStore(storeName));
    } catch (error) {
      finish(reject, error);
    }
  }));
}

  // 保存本地音频文件

function saveStoredAudio(file, id) {
  return databaseRequest(
    MUSIC_STORE_NAME,
    'readwrite',
    store => {
      store.put({
        id,
        name: file.name,
        type: file.type || 'application/octet-stream',
        file
      });
    }
  );
}


  // 读取所有已保存的本地音频
  function getStoredAudioList() {
    return openMusicDB().then(db => new Promise((resolve, reject) => {
      let settled = false;

      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        db.close();
        callback(value);
      };

      const transaction = db.transaction(
        MUSIC_STORE_NAME,
        'readonly'
      );

      const request = transaction.objectStore(MUSIC_STORE_NAME).getAll();

      request.onsuccess = () => {
        finish(resolve, request.result || []);
      };

      request.onerror = () => {
        finish(reject, request.error);
      };

      transaction.onabort = () => {
        finish(reject, transaction.error || new Error('读取本地音频失败'));
      };
    }));
  }

  // 删除已保存的本地音频
  function deleteStoredAudio(id) {
    return databaseRequest(MUSIC_STORE_NAME, 'readwrite', (store) => {
      store.delete(id);
    });
  }

  // ===== 在线歌曲缓存 =====
  const onlineObjectUrls = new Map();
  const onlineCacheRequests = new Map();

  function getOnlineCacheKey(url) {
    return new URL(url, location.href).href;
  }

  function getCachedOnlineAudio(url) {
    return openMusicDB().then(db => new Promise((resolve, reject) => {
      let settled = false;

      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        db.close();
        callback(value);
      };

      const transaction = db.transaction(
        ONLINE_MUSIC_STORE_NAME,
        'readonly'
      );

      const request = transaction.objectStore(
        ONLINE_MUSIC_STORE_NAME
      ).get(url);

      request.onsuccess = () => {
        finish(resolve, request.result || null);
      };

      request.onerror = () => {
        finish(reject, request.error);
      };

      transaction.onabort = () => {
        finish(reject, transaction.error || new Error('读取音频缓存失败'));
      };
    }));
  }

function saveCachedOnlineAudio(url, blob) {
  return databaseRequest(
    ONLINE_MUSIC_STORE_NAME,
    'readwrite',
    store => {
      store.put({
        url,
        blob,
        type: blob.type || 'application/octet-stream',
        cachedAt: Date.now()
      });
    }
  );
}


  async function getOnlineAudioSource(song) {
    const cacheKey = getOnlineCacheKey(song.url);

    if (onlineObjectUrls.has(cacheKey)) {
      return onlineObjectUrls.get(cacheKey);
    }

    // 防止同一首歌被重复下载
    if (onlineCacheRequests.has(cacheKey)) {
      return onlineCacheRequests.get(cacheKey);
    }

    const request = (async () => {
      // 先读取持久化缓存
      try {
        const cached = await getCachedOnlineAudio(cacheKey);

        if (cached?.blob instanceof Blob && cached.blob.size > 0) {
          const blobUrl = URL.createObjectURL(cached.blob);
          onlineObjectUrls.set(cacheKey, blobUrl);
          return blobUrl;
        }
      } catch (error) {
        console.warn('MeTab：读取在线音频缓存失败。', error);
      }

      // 缓存未命中，尝试下载完整音频
      try {
        setStatus(`正在加载歌曲：${song.title}`);

        const response = await fetch(song.url, {
          cache: 'default'
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const blob = await response.blob();

        if (!blob.size) {
          throw new Error('音频文件为空');
        }

        // 存储失败不影响本次播放
        try {
          await saveCachedOnlineAudio(cacheKey, blob);
        } catch (error) {
          console.warn('MeTab：保存在线音频缓存失败。', error);
        }

        const blobUrl = URL.createObjectURL(blob);
        onlineObjectUrls.set(cacheKey, blobUrl);

        return blobUrl;
      } catch (error) {
        console.warn(
          'MeTab：无法缓存音频，将尝试使用原始地址播放。',
          error
        );

        return song.url;
      }
    })();

    onlineCacheRequests.set(cacheKey, request);

    try {
      return await request;
    } finally {
      onlineCacheRequests.delete(cacheKey);
    }
  }

  // ===== 文本编码处理 =====
  function decodeText(buffer, preferredEncoding = '') {
    const bytes = new Uint8Array(buffer);

    if (
      bytes.length >= 3 &&
      bytes[0] === 0xEF &&
      bytes[1] === 0xBB &&
      bytes[2] === 0xBF
    ) {
      return new TextDecoder('utf-8').decode(bytes);
    }

    if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
      return new TextDecoder('utf-16le').decode(bytes);
    }

    if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
      return new TextDecoder('utf-16be').decode(bytes);
    }

    if (preferredEncoding) {
      try {
        return new TextDecoder(preferredEncoding).decode(bytes);
      } catch {}
    }

    try {
      return new TextDecoder('utf-8', {
        fatal: true
      }).decode(bytes);
    } catch {
      try {
        return new TextDecoder('gb18030').decode(bytes);
      } catch {
        return new TextDecoder('utf-8').decode(bytes);
      }
    }
  }

  async function readTextFile(file) {
    return decodeText(await file.arrayBuffer());
  }

  async function readTextResponse(response) {
    const contentType = response.headers.get('content-type') || '';
    const charset = contentType.match(
      /charset\s*=\s*["']?([^;"'\s]+)/i
    )?.[1];

    return decodeText(await response.arrayBuffer(), charset || '');
  }

  function getFileName(url) {
    try {
      return decodeURIComponent(
        new URL(url, location.href).pathname.split('/').pop()
      ) || '未命名歌曲';
    } catch {
      return String(url).split('/').pop() || '未命名歌曲';
    }
  }

  const initialSongs = Array.isArray(window.METAB_MUSIC_LIST?.songs)
    ? window.METAB_MUSIC_LIST.songs
    : [];

  const songs = initialSongs
    .filter(song => song && typeof song.url === 'string' && song.url.trim())
    .map(song => ({
      title: String(song.title || getFileName(song.url)),
      artist: String(song.artist || '未知歌手'),
      url: song.url.trim(),
      cover: typeof song.cover === 'string' ? song.cover.trim() : '',
      lyrics: typeof song.lyrics === 'string' ? song.lyrics : '',
      lyricsUrl: typeof song.lyricsUrl === 'string'
        ? song.lyricsUrl.trim()
        : '',
      local: false
    }));

  let currentIndex = -1;
  let localObjectUrls = [];
  let savedTime = Number(localStorage.getItem(STORAGE.time)) || 0;
  let seeking = false;
  let lyricLines = [];
  let lyricRequestToken = 0;
  let mediaArtworkUrl = '';
  let trackLoadToken = 0;

  const getBool = (key, fallback) => {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === 'true';
  };

  let autoPlay = getBool(STORAGE.autoPlay, true);

  const icons = {
    music: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.8c0-.8.9-1.3 1.6-.9l10 6.2a1 1 0 0 1 0 1.7l-10 6.2c-.7.4-1.6-.1-1.6-.9z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>',
    prev: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h2v14H6zM19 6.2v11.6c0 .8-.9 1.3-1.6.8l-8.1-5.8a1 1 0 0 1 0-1.6l8.1-5.8c.7-.5 1.6 0 1.6.8z"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 5h2v14h-2zM5 6.2v11.6c0 .8.9 1.3 1.6.8l8.1-5.8a1 1 0 0 0 0-1.6L6.6 5.4C5.9 4.9 5 5.4 5 6.2z"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
    volume: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10v4h4l5 4V6l-5 4z"/><path d="M16 9a5 5 0 0 1 0 6"/></svg>'
  };

  const root = document.createElement('section');
  root.id = 'metabMusicPlayer';

  root.innerHTML = `
    <button class="mp-launcher mp-glass" type="button" aria-label="打开音乐播放器" aria-expanded="false">${icons.music}</button>
    <div class="mp-panel mp-glass" role="dialog" aria-label="音乐播放器">
      <div class="mp-topline">
        <span class="mp-heading">MeTab 音乐播放器</span>
        <div>
          <button class="mp-icon-btn mp-list-toggle" type="button" aria-label="显示播放列表">${icons.list}</button>
          <button class="mp-icon-btn mp-close" type="button" aria-label="关闭播放器">${icons.close}</button>
        </div>
      </div>
      <div class="mp-track">
        <div class="mp-cover">${icons.music}<img class="mp-cover-image" alt="" hidden></div>
        <div class="mp-meta">
          <div class="mp-title">尚未选择歌曲</div>
          <div class="mp-artist">请导入播放列表或本地音乐</div>
        </div>
      </div>
      <div class="mp-lyrics" hidden>
        <div class="mp-lyric-prev"></div>
        <div class="mp-lyric-current">暂无歌词</div>
        <div class="mp-lyric-next"></div>
      </div>
      <div class="mp-lyrics-tools">
        <button class="mp-small-btn mp-lyrics-toggle" type="button" aria-expanded="false">显示歌词</button>
      </div>
      <div class="mp-progress-row">
        <span class="mp-current-time">0:00</span>
        <input class="mp-progress" type="range" min="0" max="1000" value="0" aria-label="播放进度">
        <span class="mp-duration">0:00</span>
      </div>
      <div class="mp-controls">
        <button class="mp-icon-btn mp-prev" type="button" aria-label="上一首">${icons.prev}</button>
        <button class="mp-icon-btn mp-play" type="button" aria-label="播放">${icons.play}</button>
        <button class="mp-icon-btn mp-next" type="button" aria-label="下一首">${icons.next}</button>
      </div>
      <div class="mp-options">
        <label class="mp-option"><input class="mp-autoplay" type="checkbox"> 自动播放</label>
        <label class="mp-volume"><span>${icons.volume}</span><input class="mp-volume-range" type="range" min="0" max="1" step="0.01" aria-label="音量"></label>
      </div>
      <div class="mp-list-tools">
        <button class="mp-small-btn mp-import-list" type="button">导入 TXT 列表(Alpha)</button>
        <button class="mp-add-local mp-small-btn" type="button">添加本地音乐</button>
      </div>
      <input class="mp-file-input mp-list-file" type="file" accept=".txt,.m3u,.m3u8,text/plain,audio/x-mpegurl">
      <input class="mp-file-input mp-audio-file" type="file" accept="audio/*,.mp3,.m4a,.aac,.ogg,.wav,.flac,.opus" multiple>
      <div class="mp-playlist"></div>
      <div class="mp-status" role="status" aria-live="polite"></div>
    </div>
    <audio class="mp-audio" preload="metadata"></audio>
  `;

  document.body.appendChild(root);

  const $ = selector => root.querySelector(selector);
  const audio = $('.mp-audio');
  const launcher = $('.mp-launcher');
  const panel = $('.mp-panel');
  const playButton = $('.mp-play');
  const progress = $('.mp-progress');
  const volume = $('.mp-volume-range');
  const autoPlayInput = $('.mp-autoplay');
  const status = $('.mp-status');
  const playlist = $('.mp-playlist');

  function updateRangeFill(input) {
    const min = Number(input.min) || 0;
    const max = Number(input.max) || 100;
    const value = Number(input.value) || 0;
    const percent = Math.max(
      0,
      Math.min(100, (value - min) / (max - min) * 100)
    );

    input.style.setProperty('--mp-range-progress', `${percent}%`);
  }

  // ===== 系统媒体会话 =====
  const mediaSession = 'mediaSession' in navigator
    ? navigator.mediaSession
    : null;

  function updateMediaMetadata(song, artworkUrl) {
    if (!mediaSession || typeof MediaMetadata === 'undefined') return;

    if (!song) {
      mediaSession.metadata = null;
      mediaArtworkUrl = '';
      return;
    }

    const artwork = artworkUrl || mediaArtworkUrl || song.cover || '';
    const artworkList = artwork
      ? [
          { src: artwork, sizes: '96x96' },
          { src: artwork, sizes: '128x128' },
          { src: artwork, sizes: '192x192' },
          { src: artwork, sizes: '256x256' },
          { src: artwork, sizes: '384x384' },
          { src: artwork, sizes: '512x512' }
        ]
      : [];

    try {
      mediaSession.metadata = new MediaMetadata({
        title: song.title || '未命名歌曲',
        artist: song.artist || '未知歌手',
        album: 'MeTab',
        artwork: artworkList
      });
    } catch (error) {
      console.warn('MeTab：无法更新系统歌曲信息。', error);
    }
  }

  function updateMediaPosition() {
    if (
      !mediaSession ||
      typeof mediaSession.setPositionState !== 'function' ||
      !Number.isFinite(audio.duration) ||
      audio.duration <= 0 ||
      !Number.isFinite(audio.currentTime)
    ) return;

    try {
      mediaSession.setPositionState({
        duration: audio.duration,
        playbackRate: audio.playbackRate || 1,
        position: Math.min(audio.currentTime, audio.duration)
      });
    } catch {}
  }

  function updateMediaPlaybackState() {
    if (!mediaSession) return;

    mediaSession.playbackState = audio.paused ? 'paused' : 'playing';
    updateMediaPosition();
  }

  function setupMediaSession() {
    if (
      !mediaSession ||
      typeof mediaSession.setActionHandler !== 'function'
    ) return;

    const handlers = {
      play: () => playAudio(),
      pause: () => audio.pause(),
      previoustrack: () => previousTrack(),
      nexttrack: () => nextTrack(),

      seekbackward: details => {
        const offset = details.seekOffset || 10;
        try {
          audio.currentTime = Math.max(0, audio.currentTime - offset);
        } catch {}
      },

      seekforward: details => {
        const offset = details.seekOffset || 10;
        const end = Number.isFinite(audio.duration)
          ? audio.duration
          : audio.currentTime + offset;

        try {
          audio.currentTime = Math.min(end, audio.currentTime + offset);
        } catch {}
      },

      seekto: details => {
        if (!Number.isFinite(details.seekTime)) return;

        try {
          audio.currentTime = Math.max(
            0,
            Number.isFinite(audio.duration)
              ? Math.min(details.seekTime, audio.duration)
              : details.seekTime
          );
        } catch {}
      }
    };

    Object.entries(handlers).forEach(([action, handler]) => {
      try {
        mediaSession.setActionHandler(action, handler);
      } catch {}
    });
  }

  setupMediaSession();

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';

    const minutes = Math.floor(seconds / 60);
    const remainder = Math.floor(seconds % 60)
      .toString()
      .padStart(2, '0');

    return `${minutes}:${remainder}`;
  }

  function setStatus(message) {
    status.textContent = message || '';
  }

  function updatePlayButton() {
    playButton.innerHTML = audio.paused ? icons.play : icons.pause;
    playButton.setAttribute(
      'aria-label',
      audio.paused ? '播放' : '暂停'
    );
    launcher.classList.toggle('is-playing', !audio.paused);
  }


  // ===== LRC 歌词解析 =====
  function parseLyrics(text) {
    if (typeof text !== 'string' || !text.trim()) {
      return [];
    }

    const lines = [];
    let offset = 0;

    const sourceLines = text
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/);

    // 读取 LRC 时间偏移
    for (const line of sourceLines) {
      const match = line.match(/^\s*\[offset\s*:\s*(-?\d+)\s*\]/i);

      if (match) {
        offset = Number(match[1]) || 0;
        break;
      }
    }

    for (const line of sourceLines) {
      // 支持 [mm:ss]、[mm:ss.xx]、[mm:ss.xxx]
      const timestamps = [
        ...line.matchAll(
          /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g
        )
      ];

      if (!timestamps.length) continue;

      // 去掉时间标签，保留歌词正文
      const lyricText = line
        .replace(
          /\[(?:\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?|offset\s*:\s*-?\d+|(?:ti|ar|al|by|re|ve|length|la|tool)\s*:[^\]]*)\]/gi,
          ''
        )
        .trim();

      if (!lyricText) continue;

      for (const match of timestamps) {
        const minutes = Number(match[1]);
        const seconds = Number(match[2]);
        const fraction = match[3] || '';

        // 将小数部分统一换算成秒
        const fractionSeconds = fraction
          ? Number(`0.${fraction}`)
          : 0;

        const time = Math.max(
          0,
          minutes * 60 +
          seconds +
          fractionSeconds +
          offset / 1000
        );

        lines.push({
          time,
          text: lyricText
        });
      }
    }

    return lines.sort((a, b) => a.time - b.time);
  }

  // ===== 歌词：平滑切换动画 =====
  let lastRenderedLyricIndex = null;
  let lyricRenderInitialized = false;
  let lyricAnimationTimer = null;

  function updateLyrics() {
    const current = Number.isFinite(audio.currentTime)
      ? audio.currentTime
      : 0;

    let index = -1;

    for (let i = 0; i < lyricLines.length; i++) {
      if (lyricLines[i].time <= current + 0.15) {
        index = i;
      } else {
        break;
      }
    }

    const prevText = index > 0
      ? lyricLines[index - 1].text
      : '';

    const currentText = index >= 0
      ? lyricLines[index].text
      : lyricLines.length
        ? '♪ ♪ ♪'
        : '暂无歌词';

    const nextText = index >= 0 && index < lyricLines.length - 1
      ? lyricLines[index + 1].text
      : '';

    const lyricsBox = $('.mp-lyrics');
    const prevElement = $('.mp-lyric-prev');
    const currentElement = $('.mp-lyric-current');
    const nextElement = $('.mp-lyric-next');

    lyricsBox.classList.toggle(
      'has-lyrics',
      lyricLines.length > 0
    );

    // 歌词没有变化时不重复触发动画
    if (
      lyricRenderInitialized &&
      index === lastRenderedLyricIndex
    ) {
      return;
    }

    lastRenderedLyricIndex = index;

    // 首次显示歌词时直接渲染，避免初始化闪烁
    if (!lyricRenderInitialized) {
      lyricRenderInitialized = true;

      prevElement.textContent = prevText;
      currentElement.textContent = currentText;
      nextElement.textContent = nextText;

      lyricsBox.classList.remove('is-changing');

      return;
    }

    // 取消上一次尚未完成的动画，避免快速切换时发生冲突
    if (lyricAnimationTimer !== null) {
      clearTimeout(lyricAnimationTimer);
      lyricAnimationTimer = null;
    }

    // 先淡出当前歌词
    lyricsBox.classList.add('is-changing');

    // 等待淡出后再更新文字
    lyricAnimationTimer = setTimeout(() => {
      prevElement.textContent = prevText;
      currentElement.textContent = currentText;
      nextElement.textContent = nextText;

      // 下一帧移除状态类，让歌词自然淡入
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          lyricsBox.classList.remove('is-changing');
          lyricAnimationTimer = null;
        });
      });
    }, 130);
  }

  async function loadLyrics(song) {
    const token = ++lyricRequestToken;

    if (lyricAnimationTimer !== null) {
      clearTimeout(lyricAnimationTimer);
      lyricAnimationTimer = null;
    }

    lyricRenderInitialized = false;
    lastRenderedLyricIndex = null;

    $('.mp-lyrics').classList.remove('is-changing');

    lyricLines = [];

    if (song?.lyrics) {
      lyricLines = parseLyrics(song.lyrics);
    } else if (song?.lyricsUrl) {
      try {
        const response = await fetch(song.lyricsUrl);

        if (!response.ok) throw new Error('HTTP error');

        const raw = await readTextResponse(response);

        if (token !== lyricRequestToken) return;

        lyricLines = parseLyrics(raw);
      } catch {
        if (token === lyricRequestToken) {
          $('.mp-lyric-current').textContent =
            '歌词加载失败，请检查歌词链接或跨域设置';
        }
      }
    }

    if (token === lyricRequestToken) updateLyrics();
  }

  // ===== 封面缓存与获取 =====
  const coverCache = new Map();
  const coverRequests = new Map();

  function showCover(song, url) {
    if (!song || !url) return;

    const coverImage = $('.mp-cover-image');
    const coverBox = $('.mp-cover');

    coverImage.onload = () => {
      if (songs[currentIndex] !== song) return;

      coverImage.hidden = false;
      coverBox.classList.add('has-image');
      mediaArtworkUrl = url;
      updateMediaMetadata(song, url);
    };

    coverImage.onerror = () => {
      if (songs[currentIndex] !== song) return;

      coverImage.hidden = true;
      coverBox.classList.remove('has-image');
    };

    coverImage.hidden = true;
    coverBox.classList.remove('has-image');
    coverImage.src = url;

    mediaArtworkUrl = url;
    updateMediaMetadata(song, url);
  }

  async function fetchCover(song) {
    if (!song || song.local) return;

    const key = `${song.title}::${song.artist}`.toLowerCase();

    if (coverCache.has(key)) {
      const cachedCover = coverCache.get(key);
      if (cachedCover) applyCover(song, cachedCover);
      return;
    }

    if (coverRequests.has(key)) {
      const cover = await coverRequests.get(key);
      if (cover) applyCover(song, cover);
      return;
    }

    const request = (async () => {
      try {
        const term = encodeURIComponent(
          `${song.title} ${song.artist || ''}`
        );

        const response = await fetch(
          `https://itunes.apple.com/search?term=${term}&entity=song&limit=8&country=cn`
        );

        if (!response.ok) return '';

        const data = await response.json();
        const results = Array.isArray(data.results) ? data.results : [];

        const normalize = value =>
          String(value || '')
            .toLowerCase()
            .replace(/[\s\p{P}\p{S}]/gu, '');

        const title = normalize(song.title);
        const artist = normalize(song.artist);

        const best = results.find(item =>
          normalize(item.trackName) === title &&
          (
            !artist ||
            normalize(item.artistName).includes(artist) ||
            artist.includes(normalize(item.artistName))
          )
        ) || results[0];

        const artwork = best?.artworkUrl600 || best?.artworkUrl100 || '';

        return artwork
          ? artwork.replace(/\d+x\d+bb\./, '600x600bb.')
          : '';
      } catch {
        return '';
      }
    })();

    coverRequests.set(key, request);

    const cover = await request;

    coverRequests.delete(key);
    coverCache.set(key, cover);

    if (cover) applyCover(song, cover);
  }

  function applyCover(song, cover) {
    if (!cover || songs[currentIndex] !== song || song.cover) return;
    showCover(song, cover);
  }

  function renderTrack() {
    const song = songs[currentIndex];

    $('.mp-title').textContent = song?.title || '尚未选择歌曲';
    $('.mp-artist').textContent =
      song?.artist || '请导入播放列表或本地音乐';

    loadLyrics(song);

    const coverBox = $('.mp-cover');
    const coverImage = $('.mp-cover-image');

    coverImage.onload = null;
    coverImage.onerror = null;
    coverImage.hidden = true;
    coverImage.removeAttribute('src');
    coverBox.classList.remove('has-image');

    mediaArtworkUrl = '';

    if (song) {
      updateMediaMetadata(song);

      if (song.cover) showCover(song, song.cover);
      else fetchCover(song);
    } else {
      updateMediaMetadata(null);
    }

    [...playlist.querySelectorAll('.mp-song')].forEach((row, index) => {
      row.classList.toggle('is-current', index === currentIndex);
    });
  }

  // ===== 播放列表 =====
  function renderPlaylist() {
    playlist.innerHTML = '';

    if (!songs.length) {
      const empty = document.createElement('div');
      empty.className = 'mp-empty';
      empty.textContent =
        '播放列表为空。可编辑 music-list.js，或导入 TXT 列表、添加本地音频。';

      playlist.appendChild(empty);
      return;
    }

    songs.forEach((song, index) => {
      const row = document.createElement('div');
      row.className = 'mp-song';
      row.setAttribute('role', 'group');

      const play = document.createElement('button');
      play.type = 'button';
      play.className = 'mp-song-play';
      play.setAttribute('aria-label', `播放：${song.title}`);

      const thumb = document.createElement('span');
      thumb.className = 'mp-song-cover';

      if (song.cover) {
        const image = document.createElement('img');
        image.alt = '';
        image.loading = 'lazy';
        image.src = song.cover;

        image.onerror = () => {
          thumb.classList.add('is-empty');
          image.remove();
        };

        thumb.appendChild(image);
      } else {
        thumb.classList.add('is-empty');
        thumb.textContent = '♪';
      }

      const number = document.createElement('span');
      number.className = 'mp-song-number';
      number.textContent = String(index + 1).padStart(2, '0');

      const name = document.createElement('span');
      name.className = 'mp-song-name';
      name.textContent = `${song.title}${song.local ? ' · 本地' : ''}`;

      play.append(thumb, number, name);
      play.addEventListener('click', event => {
  event.stopPropagation();
  loadTrack(index, true);
});

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'mp-song-remove';
      remove.setAttribute('aria-label', `从播放列表移除：${song.title}`);
      remove.title = '移除歌曲';
      remove.innerHTML = icons.close;

      remove.addEventListener('click', event => {
        event.stopPropagation();
        removeTrack(index);
      });

      row.append(play, remove);
      playlist.appendChild(row);
    });

    renderTrack();
  }

  // ===== 移除歌曲 =====
  async function removeTrack(index) {
    if (index < 0 || index >= songs.length) return;

    const removedSong = songs[index];
    const wasCurrent = index === currentIndex;

    if (wasCurrent) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }

    songs.splice(index, 1);

    if (removedSong.storageId) {
      try {
        await deleteStoredAudio(removedSong.storageId);
      } catch (error) {
        console.warn('MeTab：删除本地歌曲存档失败。', error);
      }
    }

    if (removedSong.local && removedSong.url.startsWith('blob:')) {
      URL.revokeObjectURL(removedSong.url);
      localObjectUrls = localObjectUrls.filter(
        url => url !== removedSong.url
      );
    }

    if (!songs.length) {
      currentIndex = -1;
      savedTime = 0;

      localStorage.setItem(STORAGE.track, '-1');
      localStorage.setItem(STORAGE.time, '0');

      renderPlaylist();
      renderTrack();
      updatePlayButton();
      updateMediaPlaybackState();
      setStatus('歌曲已移除，播放列表为空。');
      return;
    }

    if (wasCurrent) {
      currentIndex = Math.min(index, songs.length - 1);
      savedTime = 0;
      await loadTrack(currentIndex, false);
    } else {
      if (index < currentIndex) currentIndex--;

      localStorage.setItem(STORAGE.track, String(currentIndex));
      renderPlaylist();
    }

    setStatus(`已移除：${removedSong.title}`);
  }

  // ===== 加载歌曲 =====
  async function loadTrack(index, playNow = false, restorePosition = false) {
    if (!songs.length) {
      setStatus('播放列表为空，请先添加歌曲。');
      return;
    }

    const token = ++trackLoadToken;

    currentIndex = (index + songs.length) % songs.length;
    const song = songs[currentIndex];

    localStorage.setItem(STORAGE.track, String(currentIndex));

    if (!restorePosition) {
      savedTime = 0;
      localStorage.setItem(STORAGE.time, '0');
    }

    progress.value = '0';
    updateRangeFill(progress);

    $('.mp-current-time').textContent = '0:00';
    $('.mp-duration').textContent = '0:00';

    renderPlaylist();
    updateMediaPlaybackState();

    setStatus(song.local ? '正在准备本地歌曲…' : '正在检查歌曲缓存…');

    try {
      const source = song.local
        ? song.url
        : await getOnlineAudioSource(song);

      // 等待缓存期间如果已切换歌曲，则忽略旧请求
      if (token !== trackLoadToken || songs[currentIndex] !== song) {
        return;
      }

      audio.src = source;
      audio.load();

      if (song.local) {
        setStatus('正在播放本地歌曲。');
      } else if (source.startsWith('blob:')) {
        setStatus('歌曲已从本地缓存加载。');
      } else {
        setStatus('使用原始音频链接播放。');
      }

      updateMediaPlaybackState();

      if (playNow) await playAudio();
    } catch (error) {
      if (token !== trackLoadToken) return;

      console.error('MeTab：加载歌曲失败。', error);
      setStatus('歌曲加载失败，请检查音频文件和网络连接。');
    }
  }

  async function playAudio() {
    if (!songs.length) {
      setStatus('请先添加歌曲或导入播放列表。');
      return;
    }

    if (!audio.src) {
      await loadTrack(currentIndex < 0 ? 0 : currentIndex, false);
    }

    try {
      await audio.play();
      setStatus('');
    } catch (error) {
      if (error?.name === 'NotAllowedError') {
        setStatus('浏览器阻止了自动播放，请点击播放按钮开始。');
      } else {
        setStatus('播放失败：请检查音频地址、文件格式或跨域限制。');
      }
    }

    updatePlayButton();
    updateMediaPlaybackState();
  }

  function nextTrack() {
    if (songs.length) {
      loadTrack(currentIndex < 0 ? 0 : currentIndex + 1, true);
    }
  }

  function previousTrack() {
    if (!songs.length) return;

    if (audio.currentTime > 3) {
      try {
        audio.currentTime = 0;
      } catch {}

      updateMediaPosition();
      return;
    }

    loadTrack(currentIndex < 0 ? 0 : currentIndex - 1, true);
  }

  // ===== TXT / M3U 播放列表解析 =====
  function parsePlaylist(text) {
    return text
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line =>
        line &&
        !line.startsWith('#EXTM3U') &&
        !line.startsWith('#EXTINF') &&
        !line.startsWith('//') &&
        !line.startsWith('#')
      )
      .map(line => {
        const parts = line.split('|').map(part => part.trim());

        if (parts.length >= 5) {
          return {
            title: parts[0] || getFileName(parts[2]),
            artist: parts[1] || '未知歌手',
            url: parts[2],
            cover: parts[3],
            lyricsUrl: parts.slice(4).join('|'),
            local: false
          };
        }

        if (parts.length >= 4) {
          return {
            title: parts[0] || getFileName(parts[2]),
            artist: parts[1] || '未知歌手',
            url: parts[2],
            cover: parts[3],
            local: false
          };
        }

        if (parts.length >= 3) {
          return {
            title: parts[0] || getFileName(parts[2]),
            artist: parts[1] || '未知歌手',
            url: parts[2],
            cover: '',
            local: false
          };
        }

        if (parts.length === 2 && /^https?:\/\//i.test(parts[1])) {
          return {
            title: parts[0] || getFileName(parts[1]),
            artist: '未知歌手',
            url: parts[1],
            local: false
          };
        }

        return {
          title: getFileName(parts[0]),
          artist: '未知歌手',
          url: parts[0],
          local: false
        };
      })
      .filter(song => song.url);
  }

  function openPanel() {
    root.classList.add('is-open');
    launcher.setAttribute('aria-expanded', 'true');
  }

  function closePanel() {
    root.classList.remove('is-open');
    launcher.setAttribute('aria-expanded', 'false');
  }

  // ===== 界面事件 =====
  launcher.addEventListener('click', () => {
    root.classList.contains('is-open') ? closePanel() : openPanel();
  });

  $('.mp-close').addEventListener('click', closePanel);

  $('.mp-list-toggle').addEventListener('click', () => {
    playlist.hidden = !playlist.hidden;
  });

  $('.mp-lyrics-toggle').addEventListener('click', () => {
    const box = $('.mp-lyrics');
    box.hidden = !box.hidden;

    $('.mp-lyrics-toggle').textContent =
      box.hidden ? '显示歌词' : '隐藏歌词';

    $('.mp-lyrics-toggle').setAttribute(
      'aria-expanded',
      String(!box.hidden)
    );
  });

  playButton.addEventListener('click', () => {
    audio.paused ? playAudio() : audio.pause();
  });

  $('.mp-prev').addEventListener('click', previousTrack);
  $('.mp-next').addEventListener('click', nextTrack);

  // ===== 音频事件 =====
  audio.addEventListener('play', () => {
    updatePlayButton();
    updateMediaPlaybackState();
  });

  audio.addEventListener('pause', () => {
    updatePlayButton();
    updateMediaPlaybackState();
  });

  audio.addEventListener('loadedmetadata', () => {
    $('.mp-duration').textContent = formatTime(audio.duration);

    if (
      savedTime > 0 &&
      Number.isFinite(audio.duration) &&
      audio.duration > 0
    ) {
      const targetTime = Math.min(
        savedTime,
        Math.max(0, audio.duration - 0.5)
      );

      try {
        audio.currentTime = targetTime;
      } catch (error) {
        console.warn('MeTab：恢复播放进度失败。', error);
      }
    }

    updateRangeFill(progress);
    updateMediaPosition();
  });

  audio.addEventListener('durationchange', () => {
    $('.mp-duration').textContent = formatTime(audio.duration);
    updateMediaPosition();
  });

  audio.addEventListener('ratechange', updateMediaPosition);
  audio.addEventListener('ended', nextTrack);

  audio.addEventListener('error', () => {
    if (audio.src) {
      setStatus(
        '音频无法加载：请确认链接有效、文件格式受支持，且服务器允许访问。'
      );
    }
  });

  audio.addEventListener('timeupdate', () => {
    if (
      !seeking &&
      Number.isFinite(audio.duration) &&
      audio.duration > 0
    ) {
      progress.value = String(
        Math.round(audio.currentTime / audio.duration * 1000)
      );
    }

    updateRangeFill(progress);

    $('.mp-current-time').textContent = formatTime(audio.currentTime);
    $('.mp-duration').textContent = formatTime(audio.duration);

    if (Number.isFinite(audio.currentTime)) {
      localStorage.setItem(STORAGE.time, String(audio.currentTime));
    }

    updateLyrics();
    updateMediaPosition();
  });

  // 拖动时仅更新预览，避免播放位置频繁跳动
  progress.addEventListener('input', () => {
    seeking = true;
    updateRangeFill(progress);

    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      const targetTime =
        audio.duration * Number(progress.value) / 1000;

      $('.mp-current-time').textContent = formatTime(targetTime);
    }
  });

  // 拖动结束后执行跳转
  progress.addEventListener('change', () => {
    const duration = audio.duration;
    const value = Number(progress.value);

    if (
      audio.readyState >= HTMLMediaElement.HAVE_METADATA &&
      Number.isFinite(duration) &&
      duration > 0 &&
      Number.isFinite(value)
    ) {
      const targetTime = Math.max(
        0,
        Math.min(duration, duration * value / 1000)
      );

      try {
        audio.currentTime = targetTime;
        localStorage.setItem(STORAGE.time, String(targetTime));
        $('.mp-current-time').textContent = formatTime(targetTime);
      } catch (error) {
        console.warn('MeTab：无法跳转到指定播放位置。', error);
        setStatus('当前音频暂不支持跳转，请稍后重试。');
      }
    } else {
      setStatus('音频仍在加载，请稍后再拖动进度条。');
    }

    seeking = false;
    updateRangeFill(progress);
    updateMediaPosition();
  });

  // ===== 音量设置 =====
  volume.value = localStorage.getItem(STORAGE.volume) ?? '0.7';
  audio.volume = Math.max(0, Math.min(1, Number(volume.value)));
  updateRangeFill(volume);
  audio.muted = getBool(STORAGE.muted, false);

  volume.addEventListener('input', () => {
    audio.volume = Number(volume.value);
    audio.muted = false;
    updateRangeFill(volume);

    localStorage.setItem(STORAGE.volume, volume.value);
    localStorage.setItem(STORAGE.muted, 'false');
  });

  // ===== 自动播放设置 =====
  autoPlayInput.checked = autoPlay;

  autoPlayInput.addEventListener('change', () => {
    autoPlay = autoPlayInput.checked;
    localStorage.setItem(STORAGE.autoPlay, String(autoPlay));

    setStatus(
      autoPlay
        ? '已开启自动播放偏好；浏览器仍可能要求首次手动点击播放。'
        : '已关闭自动播放。'
    );
  });

  // ===== 本地音频导入与持久化 =====
  const audioFileInput = $('.mp-audio-file');
  const addLocalButton = $('.mp-add-local');

  addLocalButton.addEventListener('click', () => {
    audioFileInput.click();
  });

  audioFileInput.addEventListener('change', async () => {
    const files = Array.from(audioFileInput.files || []);
    if (!files.length) return;

    let addedCount = 0;

    for (const file of files) {
      if (
        !file.type.startsWith('audio/') &&
        !/\.(mp3|m4a|aac|ogg|wav|flac|opus)$/i.test(file.name)
      ) {
        continue;
      }

      const id =
        `local_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

      try {
        await saveStoredAudio(file, id);

        const url = URL.createObjectURL(file);
        localObjectUrls.push(url);

        songs.push({
          title: file.name.replace(/\.[^.]+$/, ''),
          artist: '本地文件',
          url,
          cover: '',
          lyrics: '',
          lyricsUrl: '',
          local: true,
          storageId: id
        });

        addedCount++;
      } catch (error) {
        console.error('MeTab：保存本地音频失败。', error);
      }
    }

    audioFileInput.value = '';
    renderPlaylist();

    if (addedCount > 0) {
      const firstAddedIndex = songs.length - addedCount;

      if (currentIndex < 0) {
        await loadTrack(firstAddedIndex, false);
      }

      setStatus(`已添加 ${addedCount} 首本地歌曲，音频文件已保存。`);
    } else {
      setStatus('未能添加音频，请检查文件格式或浏览器存储权限。');
    }
  });

  // ===== TXT / M3U 导入 =====
  const importListButton = $('.mp-import-list');
  const listFileInput = $('.mp-list-file');

  importListButton.addEventListener('click', () => {
    listFileInput.click();
  });

  listFileInput.addEventListener('change', async () => {
    const file = listFileInput.files?.[0];
    if (!file) return;

    try {
      const text = await readTextFile(file);
      const importedSongs = parsePlaylist(text);

      if (!importedSongs.length) {
        setStatus('没有识别到有效歌曲，请检查列表格式。');
        return;
      }

      const normalizedSongs = importedSongs.map(song => ({
        title: String(song.title || getFileName(song.url)),
        artist: String(song.artist || '未知歌手'),
        url: song.url.trim(),
        cover: song.cover || '',
        lyrics: song.lyrics || '',
        lyricsUrl: song.lyricsUrl || '',
        local: false
      }));

      songs.push(...normalizedSongs);
      renderPlaylist();

      setStatus(`已导入 ${normalizedSongs.length} 首歌曲。`);

      if (currentIndex < 0) {
        await loadTrack(0, false);
      }
    } catch (error) {
      console.error('MeTab：导入播放列表失败。', error);
      setStatus('播放列表导入失败，请检查文件编码和内容。');
    } finally {
      listFileInput.value = '';
    }
  });

  // ===== 页面交互 =====
  document.addEventListener('click', event => {
    if (
      root.classList.contains('is-open') &&
      !root.contains(event.target)
    ) {
      closePanel();
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closePanel();
  });

  window.addEventListener('pagehide', () => {
    localStorage.setItem(
      STORAGE.time,
      String(Number.isFinite(audio.currentTime) ? audio.currentTime : 0)
    );

    localObjectUrls.forEach(url => URL.revokeObjectURL(url));
    localObjectUrls = [];

    onlineObjectUrls.forEach(url => URL.revokeObjectURL(url));
    onlineObjectUrls.clear();
  });

  // 首次交互时尝试自动播放
  document.addEventListener('pointerdown', function startMusicOnce() {
    if (autoPlay && audio.paused && songs.length) {
      playAudio();
    }
  }, { once: true });

  // ===== 初始化 =====
  async function initMusicPlayer() {
    try {
      const storedAudios = await getStoredAudioList();

      for (const stored of storedAudios) {
        if (!stored.file) continue;

        const alreadyExists = songs.some(
          song => song.storageId === stored.id
        );

        if (alreadyExists) continue;

        const url = URL.createObjectURL(stored.file);
        localObjectUrls.push(url);

        songs.push({
          title: stored.name.replace(/\.[^.]+$/, ''),
          artist: '本地文件',
          url,
          cover: '',
          lyrics: '',
          lyricsUrl: '',
          local: true,
          storageId: stored.id
        });
      }
    } catch (error) {
      console.error('MeTab：恢复本地音频失败。', error);
    }

    renderPlaylist();

    if (songs.length) {
      const storedIndex = Number(localStorage.getItem(STORAGE.track));

      const startIndex =
        Number.isInteger(storedIndex) &&
        storedIndex >= 0 &&
        storedIndex < songs.length
          ? storedIndex
          : 0;

      await loadTrack(startIndex, autoPlay, true);
    } else {
      setStatus(
        '先在 music-list.js 添加歌曲，或导入 TXT 列表 / 本地音频。'
      );
    }
  }

  initMusicPlayer();
})();