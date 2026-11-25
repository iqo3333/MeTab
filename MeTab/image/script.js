
/* =====================================================
   MeTab 壁纸展示页面
   功能：
   - 壁纸分类筛选与关键词搜索
   - 动态壁纸第一帧预览
   - 鼠标移入播放动态壁纸
   - 鼠标移出暂停并恢复第一帧
   - 图片懒加载与异步解码
   - 壁纸详情预览
   - 原始文件地址复制
   - 键盘快捷键支持
===================================================== */

const WALLPAPERS = window.WALLPAPERS || [];

const grid = document.getElementById("wallpaperGrid");
const searchInput = document.getElementById("searchInput");
const resultCount = document.getElementById("resultCount");
const emptyState = document.getElementById("emptyState");

const viewer = document.getElementById("viewer");
const viewerMedia = document.getElementById("viewerMedia");
const viewerTitle = document.getElementById("viewerTitle");
const viewerType = document.getElementById("viewerType");

const openOriginal = document.getElementById("openOriginal");
const copyAddressButton = document.getElementById("copyAddress");

let currentFileAddress = "";
let activeFilter = "all";

// HTML 转义
const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
}[char]));

// 判断媒体类型
function mediaKind(src) {
  const path = src.split("?")[0].toLowerCase();

  if (/\.(mp4|webm|ogg|mov|m4v)$/.test(path)) {
    return "video";
  }

  if (/\.(gif|webp|apng|avif)$/.test(path)) {
    return "animated";
  }

  return "image";
}

// 获取壁纸类型
function getWallpaperTypes(item) {
  return Array.isArray(item.type) ? item.type : [item.type];
}

// 渲染壁纸列表
function renderWallpapers() {
  const keyword = searchInput.value.trim().toLowerCase();

  const filtered = WALLPAPERS.filter(item => {
    const types = getWallpaperTypes(item);

    const matchesType =
      activeFilter === "all" || types.includes(activeFilter);

    const matchesKeyword =
      item.name.toLowerCase().includes(keyword) ||
      types.some(type =>
        String(type).toLowerCase().includes(keyword)
      );

    return matchesType && matchesKeyword;
  });

  grid.innerHTML = filtered.map(item => {
    const kind = mediaKind(item.src);
    const types = getWallpaperTypes(item);

    // 动态壁纸：使用视频第一帧作为预览
    const media = kind === "video"
      ? `<video
          data-src="${escapeHTML(item.src)}"
          muted
          loop
          playsinline
          preload="metadata">
        </video>`
      : `<img
          src="${escapeHTML(item.src)}"
          alt="${escapeHTML(item.name)}"
          loading="lazy"
          decoding="async">`;

    return `
      <article
        class="wallpaper-card"
        data-index="${WALLPAPERS.indexOf(item)}"
        tabindex="0"
        role="button"
        aria-label="预览${escapeHTML(item.name)}">

        <div class="thumb">
          ${media}

          ${
            kind === "video" || kind === "animated"
              ? '<span class="play-mark">▶</span>'
              : ""
          }
        </div>

        <div class="card-meta">
          <span class="card-name">
            ${escapeHTML(item.name)}
          </span>

          <span class="type-tag">
            ${escapeHTML(types[0] || "")}
          </span>
        </div>

      </article>
    `;
  }).join("");

  resultCount.textContent = `共 ${filtered.length} 款壁纸`;
  emptyState.hidden = filtered.length !== 0;

  // 初始化动态壁纸第一帧
  setupVideoPreviews();
}

// 初始化动态壁纸预览画面
function setupVideoPreviews() {
  const videos = grid.querySelectorAll("video[data-src]");

  videos.forEach(video => {
    // 只加载视频元数据
    video.preload = "metadata";
    video.src = video.dataset.src;

    // 获取视频第一帧
    video.addEventListener("loadedmetadata", function () {
      if (video.duration > 0.1) {
        video.currentTime = 0.1;
      }
    }, { once: true });
  });
}

// 鼠标移入：播放动态壁纸
grid.addEventListener("mouseover", event => {
  const card = event.target.closest(".wallpaper-card");

  if (!card || card.contains(event.relatedTarget)) {
    return;
  }

  const video = card.querySelector("video");

  if (video) {
    video.play().catch(() => {});
  }
});

// 鼠标移出：暂停并恢复第一帧
grid.addEventListener("mouseout", event => {
  const card = event.target.closest(".wallpaper-card");

  if (!card || card.contains(event.relatedTarget)) {
    return;
  }

  const video = card.querySelector("video");

  if (video) {
    video.pause();

    if (video.readyState >= 2) {
      video.currentTime = 0.1;
    }
  }
});

// 打开壁纸预览
function openPreview(item) {
  const kind = mediaKind(item.src);

  viewerMedia.innerHTML = "";

  let media;

  if (kind === "video") {
    media = document.createElement("video");

    media.src = item.src;
    media.controls = true;
    media.autoplay = true;
    media.loop = true;
    media.muted = true;
    media.playsInline = true;
    media.preload = "auto";

  } else {
    media = document.createElement("img");

    media.src = item.src;
    media.alt = item.name;
    media.decoding = "async";
  }

  viewerMedia.appendChild(media);

  viewerTitle.textContent = item.name;
  viewerType.textContent = getWallpaperTypes(item).join(" · ");

  // 转换为完整文件地址
  // 方便复制到 MeTab 自定义壁纸设置中
  currentFileAddress = new URL(
    item.src,
    window.location.href
  ).href;

  openOriginal.href = currentFileAddress;

  copyAddressButton.textContent = "复制文件地址";
  copyAddressButton.classList.remove("copied");

  viewer.classList.add("open");
  viewer.setAttribute("aria-hidden", "false");

  document.body.style.overflow = "hidden";

  if (kind === "video") {
    media.play().catch(() => {});
  }
}

// 关闭壁纸预览
function closePreview() {
  viewer.classList.remove("open");
  viewer.setAttribute("aria-hidden", "true");

  const video = viewerMedia.querySelector("video");

  if (video) {
    video.pause();
    video.removeAttribute("src");
    video.load();
  }

  viewerMedia.innerHTML = "";

  document.body.style.overflow = "";
}

// 壁纸卡片点击事件
grid.addEventListener("click", event => {
  const card = event.target.closest(".wallpaper-card");

  if (!card) return;

  const item = WALLPAPERS[Number(card.dataset.index)];

  if (item) {
    openPreview(item);
  }
});

// 键盘访问
grid.addEventListener("keydown", event => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  const card = event.target.closest(".wallpaper-card");

  if (!card) return;

  event.preventDefault();

  const item = WALLPAPERS[Number(card.dataset.index)];

  if (item) {
    openPreview(item);
  }
});

// 分类筛选
document.querySelectorAll(".filter").forEach(button => {
  button.addEventListener("click", () => {
    const current = document.querySelector(".filter.active");

    if (current) {
      current.classList.remove("active");
    }

    button.classList.add("active");

    activeFilter = button.dataset.filter;

    renderWallpapers();
  });
});

// 关键词搜索
searchInput.addEventListener("input", renderWallpapers);

// 复制壁纸文件地址
copyAddressButton.addEventListener("click", async () => {
  if (!currentFileAddress) return;

  try {
    await navigator.clipboard.writeText(currentFileAddress);

    copyAddressButton.textContent = "已复制";
    copyAddressButton.classList.add("copied");

  } catch (error) {
    // 兼容非 HTTPS 或不支持 Clipboard API 的环境
    const helper = document.createElement("textarea");

    helper.value = currentFileAddress;
    helper.style.position = "fixed";
    helper.style.opacity = "0";

    document.body.appendChild(helper);

    helper.select();

    try {
      document.execCommand("copy");

      copyAddressButton.textContent = "已复制";
      copyAddressButton.classList.add("copied");

    } catch (copyError) {
      copyAddressButton.textContent = "复制失败";
    }

    helper.remove();
  }
});

// 关闭预览按钮
document.getElementById("closeViewer")
  .addEventListener("click", closePreview);

// 点击遮罩关闭预览
viewer.addEventListener("click", event => {
  if (event.target.hasAttribute("data-close")) {
    closePreview();
  }
});

// 全局键盘快捷键
document.addEventListener("keydown", event => {
  // ESC 关闭预览
  if (
    event.key === "Escape" &&
    viewer.classList.contains("open")
  ) {
    closePreview();
  }

  // Ctrl + K / Command + K 聚焦搜索框
  if (
    (event.metaKey || event.ctrlKey) &&
    event.key.toLowerCase() === "k"
  ) {
    event.preventDefault();
    searchInput.focus();
  }
});

// 统计壁纸数量
document.getElementById("totalCount").textContent =
  WALLPAPERS.length;

document.getElementById("motionCount").textContent =
  WALLPAPERS.filter(item =>
    getWallpaperTypes(item).includes("动态")
  ).length;

document.getElementById("stillCount").textContent =
  WALLPAPERS.filter(item =>
    getWallpaperTypes(item).includes("静态")
  ).length;

// 初始化页面
renderWallpapers();
