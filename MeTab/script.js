/* ===== 精准时间 & 农历 & 星期 ===== */
let baseTime = null;    // 网络时间基准
let lastTick = null;    // 上一次 tick 的性能时间

// 延迟补偿请求（带超时）
async function fetchTimeWithCompensation(url, parser, timeout = 5000) {
    return new Promise(async (resolve) => {
        const timer = setTimeout(() => resolve(null), timeout);
        try {
            const start = performance.now();
            const res = await fetch(url);
            const end = performance.now();
            clearTimeout(timer);
            if (!res.ok) return resolve(null);
            const data = await res.json();
            const serverTime = parser(data);
            const latency = (end - start) / 2;
            resolve(new Date(serverTime.getTime() + latency));
        } catch {
            clearTimeout(timer);
            resolve(null);
        }
    });
}

// 获取网络时间（多源自动切换）
async function getAccurateNetworkTime() {
    const sources = [
        async () => await fetchTimeWithCompensation(
            "https://timeapi.io/api/Time/current/zone?timeZone=Asia/Shanghai",
            d => new Date(d.dateTime)
        ),
        async () => await fetchTimeWithCompensation(
            "https://worldtimeapi.org/api/timezone/Asia/Shanghai",
            d => new Date(d.datetime)
        )
    ];

    for (let fn of sources) {
        const t = await fn();
        if (t && !isNaN(t.getTime())) return t;
    }

    console.warn("⚠ 使用系统时间（网络不可用）");

    MeTabToast.show(
        "网络时间获取失败，已自动切换为系统时间。",
        "warning"
    );

    return new Date();
}

/* ===== 农历计算（1900-2100） ===== */
const lunarInfo = [0x04bd8,0x04ae0,0x0a570,0x054d5,0x0d260,0x0d950,0x16554,0x056a0,0x09ad0,0x055d2,
0x04ae0,0x0a5b6,0x0a4d0,0x0d250,0x1d255,0x0b540,0x0d6a0,0x0ada2,0x095b0,0x14977,
0x04970,0x0a4b0,0x0b4b5,0x06a50,0x06d40,0x1ab54,0x02b60,0x09570,0x052f2,0x04970,
0x06566,0x0d4a0,0x0ea50,0x06e95,0x05ad0,0x02b60,0x186e3,0x092e0,0x1c8d7,0x0c950,
0x0d4a0,0x1d8a6,0x0b550,0x056a0,0x1a5b4,0x025d0,0x092d0,0x0d2b2,0x0a950,0x0b557,
0x06ca0,0x0b550,0x15355,0x04da0,0x0a5d0,0x14573,0x052d0,0x0a9a8,0x0e950,0x06aa0,
0x0aea6,0x0ab50,0x04b60,0x0aae4,0x0a570,0x05260,0x0f263,0x0d950,0x05b57,0x056a0,
0x096d0,0x04dd5,0x04ad0,0x0a4d0,0x0d4d4,0x0d250,0x0d558,0x0b540,0x0b5a0,0x195a6,
0x095b0,0x049b0,0x0a974,0x0a4b0,0x0b27a,0x06a50,0x06d40,0x0af46,0x0ab60,0x09570,
0x04af5,0x04970,0x064b0,0x074a3,0x0ea50,0x06b58,0x05ac0,0x0ab60,0x096d5,0x092e0,
0x0c960,0x0d954,0x0d4a0,0x0da50,0x07552,0x056a0,0x0abb7,0x025d0,0x092d0,0x0cab5,
0x0a950,0x0b4a0,0x0baa4,0x0ad50,0x055d9,0x04ba0,0x0a5b0,0x15176,0x052b0,0x0a930,
0x07954,0x06aa0,0x0ad50,0x05b52,0x04b60,0x0a6e6,0x0a4e0,0x0d260,0x0ea65,0x0d530,
0x05aa0,0x076a3,0x096d0,0x04bd7,0x04ad0,0x0a4d0,0x1d0b6,0x0d250,0x0d520,0x0dd45,
0x0b5a0,0x056d0,0x055b2,0x049b0,0x0a577,0x0a4b0,0x0aa50,0x1b255,0x06d20,0x0ada0];
const monthName = ["正","二","三","四","五","六","七","八","九","十","冬","腊"];
function lunarDate(date){
    let i,temp=0;
    let base = new Date(1900,0,31);
    let offset = Math.floor((date-base)/86400000);
    let year,month,leap,isLeap=false;
    for(year=1900;year<2101&&offset>0;year++){ temp=yearDays(year); offset-=temp;}
    if(offset<0){ offset+=temp; year--;}
    leap=leapMonth(year);
    for(month=1;month<13&&offset>0;month++){
        if(leap>0&&month==(leap+1)&&!isLeap){--month;isLeap=true;temp=leapDays(year);}
        else temp=monthDays(year,month);
        offset-=temp;
        if(isLeap&&month==(leap+1)) isLeap=false;
    }
    if(offset<0){offset+=temp; month--;}
    const day = offset+1;
    return {year,month,monthName:monthName[month-1],day,dayName:lunarDayName(day)};
}
function yearDays(y){let sum=348;for(let i=0x8000;i>0x8;i>>=1)sum+=(lunarInfo[y-1900]&i)?1:0;return sum+leapDays(y);}
function leapMonth(y){return (lunarInfo[y-1900]&0xf);}
function leapDays(y){return leapMonth(y)?((lunarInfo[y-1900]&0x10000)?30:29):0;}
function monthDays(y,m){return (lunarInfo[y-1900]&(0x10000>>m))?30:29;}
function lunarDayName(n){const sx=["初","十","廿","卅"],dn=["一","二","三","四","五","六","七","八","九","十"];if(n===10)return"初十";if(n===20)return"二十";if(n===30)return"三十";return sx[Math.floor((n-1)/10)]+dn[(n-1)%10];}

const weekName = ["日","一","二","三","四","五","六"];

// —— 快速显示系统时间，避免空白
function showSystemTime() {
    const now = new Date();
    const lunar = lunarDate(now);
    document.getElementById('clock').textContent = now.toLocaleTimeString();
    document.getElementById('date').textContent =
        `${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日 星期${weekName[now.getDay()]} ｜ 农历${lunar.monthName}月${lunar.dayName}`;
}
showSystemTime();
setInterval(showSystemTime,1000);

// —— 初始化精准时钟
async function initClock() {
    baseTime = await getAccurateNetworkTime();
    lastTick = performance.now();
    requestAnimationFrame(tick);
}

function tick() {
    const now = new Date(baseTime.getTime() + (performance.now()-lastTick));
    const lunar = lunarDate(now);
    const h = now.getHours().toString().padStart(2,'0');
    const m = now.getMinutes().toString().padStart(2,'0');
    const s = now.getSeconds().toString().padStart(2,'0');
    document.getElementById('clock').textContent = `${h}:${m}:${s}`;
    document.getElementById('date').textContent =
        `${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日 星期${weekName[now.getDay()]} ｜ 农历${lunar.monthName}月${lunar.dayName}`;
    requestAnimationFrame(tick);
}

initClock();


/* ===== 搜索引擎逻辑 ===== */
const engineDropdown = document.getElementById("engineDropdown");
const engineSelect = document.getElementById("engineSelect");
const engineIcon = document.getElementById("engineIcon");
let currentEngine = "Bing";
const engineMap = {
  Bing: "https://www.bing.com/search?q=",
  Google: "https://www.google.com/search?q=",
  Baidu: "https://www.baidu.com/s?wd=",
  Yahoo: "https://search.yahoo.com/search;_ylt=?q=",
  Duckduckgo: "https://www.duckduckgo.com/search?q=",
  Yandex: "https://www.yandex.com/search?text="
};

window.addEventListener("DOMContentLoaded", () => {
  engineDropdown.classList.remove("show");
  const savedEngine = localStorage.getItem("preferredEngine");
  if(savedEngine && engineMap[savedEngine]){
    currentEngine = savedEngine;
    const icon = document.querySelector(`[data-engine="${savedEngine}"]`);
    if(icon) engineIcon.src = icon.dataset.icon;
  }
});

engineSelect.addEventListener("click", e => {
  e.stopPropagation();
  engineDropdown.classList.toggle("show");
});
document.addEventListener("click", e => {
  if(!engineSelect.contains(e.target)) engineDropdown.classList.remove("show");
});
document.querySelectorAll("#engineDropdown div").forEach(item => {
  item.addEventListener("click", () => {
    currentEngine = item.dataset.engine;
    engineIcon.src = item.dataset.icon;
    engineDropdown.classList.remove("show");
    localStorage.setItem("preferredEngine", currentEngine);
  });
});

/* ===== 搜索跳转 ===== */
function handleInput() {
  const inputElement = document.getElementById('domainInput');
  const input = inputElement.value.trim();

  if (!input) return;

  /* 保存搜索记录 */
  if (typeof saveSearchHistory === "function") {
    saveSearchHistory(input);
  }

  let finalURL = "";

  /* 0️⃣ 已带协议 → 直接跳转 */
  if (/^https?:\/\//i.test(input)) {
    window.open(input, "_blank");
    return;
  }

  /* 拆分 host */
  const [hostPart] = input.split('/');

  /* 1️⃣ IP 地址（最高优先级） */
  const isPureIP =
    /^(\d{1,3}\.){3}\d{1,3}$/.test(hostPart) &&
    hostPart.split('.').every(n => Number(n) <= 255);

  if (isPureIP) {
    window.open(`http://${input}`, "_blank");
    return;
  }

  /* 2️⃣ 中文域名 */
  const isChineseDomain =
    /[\u4e00-\u9fa5]+(\.[\w\u4e00-\u9fa5]+)+/.test(hostPart);

  /* 3️⃣ 英文域名 */
  const isEnglishDomain =
    /^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+$/.test(hostPart);

  /* 4️⃣ 版本号 / 编号（必须搜索） */
  const isVersionLike =
    /^[a-zA-Z]*\d+(\.\d+)+$/.test(input) ||
    /^\d+\.\d+$/.test(input);

  /* 5️⃣ 纯后缀 */
  const isOnlyTLD =
    /^\.[a-zA-Z]+$/.test(input);

  /* 6️⃣ 决策 */
  if (
    !isVersionLike &&
    !isOnlyTLD &&
    (isChineseDomain || isEnglishDomain)
  ) {
    finalURL = `http://${input}`;
  } else {
    finalURL =
      engineMap[currentEngine] +
      encodeURIComponent(input);
  }

  /* Windows 本地文件路径识别 */
  const isWindowsPath = /^[a-zA-Z]:[\\/]/.test(input);
  const isUncPath = /^\\\\[^\\]+\\[^\\]+/.test(input);

  if (isWindowsPath || isUncPath) {
MeTabToast.show(
  "检测到本地文件路径，请在文件资源管理器中打开该文件。",
  "info"
);
    return;
  }

  window.open(finalURL, "_blank");
}


/* ===== 回车搜索 ===== */
document.getElementById('domainInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    handleInput();
  }
});

/* ===== 新标签页打开 ===== */
document.addEventListener('click', function(e) {
  const target = e.target.closest('a, .quick-item, button.search-btn');
  if (!target) return;

  // 如果是功能按钮或功能下拉菜单，则忽略
  if (target.closest('.lang-wrapper')) return;

  // 默认新标签页打开
  const url = target.href || target.dataset.url;
  if (url) {
    window.open(url, '_blank');
    e.preventDefault();
  }
});

// 适配你现有 CSS（不改 CSS）
const engineBtn = document.querySelector(".engine-select");
const engineMenu = document.querySelector(".engine-dropdown");

let engineAnimating = false;
let engineOpen = false;

// helper：强制重排，保证 animation 可重复触发
function flushReflow(el){
  el.classList.remove("show", "hide");
  void el.offsetWidth; // 强制重排
}

// 开门（播放 popIn）
function openEngine(){
  if (engineAnimating) return;
  engineAnimating = true;

  // 确保没有残留 hide，触发一次重排再加 show
  flushReflow(engineMenu);
  engineMenu.classList.add("show");
  engineOpen = true;
}

// 关门（播放 popOut）
function closeEngine(){
  if (engineAnimating) return;
  engineAnimating = true;

  // 一定先移除 show 再触发重排然后加 hide（保证 popOut 能播放）
  engineMenu.classList.remove("show");
  void engineMenu.offsetWidth; // 强制重排，确保浏览器把 show -> 基态 应用
  engineMenu.classList.add("hide");
  engineOpen = false;
}

// 点击开关
engineBtn.addEventListener("click", (e)=>{
  e.stopPropagation();
  if (engineOpen) closeEngine();
  else openEngine();
});

// 点击菜单项后触发关闭（保留你切换 engine 的逻辑）
engineMenu.querySelectorAll("div").forEach(item=>{
  item.addEventListener("click", (ev)=>{
    // 先执行你需要的切换逻辑（例如更新图标/保存首选引擎）
    // currentEngine = item.dataset.engine; ... (如果需要)
    // 然后收起
    closeEngine();
  });
});

// 关键：监听 animationend，动画播放完成后清理类并允许下一次交互
engineMenu.addEventListener("animationend", (ev) => {
  // 关闭动画结束（popOut）时，移除 hide，恢复到初始状态
  if (ev.animationName === "popOut") {
    engineMenu.classList.remove("hide");
    engineAnimating = false;
    // pointer-events 已由 CSS hide/popOut 控制
    return;
  }

  // 打开动画结束（popIn）时，保留 show（表示处于打开状态），解除锁
  if (ev.animationName === "popIn") {
    engineAnimating = false;
    return;
  }

  // 其他动画结束也解除锁以防万一
  engineAnimating = false;
});

// 点击页面空白处也应收起（和你原来逻辑一致）
document.addEventListener("click", (e) => {
  if (engineOpen && !engineBtn.contains(e.target) && !engineMenu.contains(e.target)) {
    closeEngine();
  }
});

// ------------------ 阻止缩放 ------------------
let startY = 0;
let lastTouchEnd = 0;

document.addEventListener('touchstart', e => {
    startY = e.touches[0].clientY;
});

document.addEventListener('touchmove', e => {
    const moveY = e.touches[0].clientY;
    // 下拉刷新时忽略，不阻止页面滚动
    if (moveY - startY > 50 && window.scrollY === 0) return;
});

// 阻止双击缩放
document.addEventListener('touchend', e => {
    const now = new Date().getTime();
    if (now - lastTouchEnd <= 300) {
        e.preventDefault(); // 阻止双击放大
    }
    lastTouchEnd = now;
}, false);

// 阻止双指捏合缩放
document.addEventListener('gesturestart', e => {
    e.preventDefault();
});
/* ===== 背景切换 ===== */

function setBackground(url) {
  const image = document.getElementById("bg-image");
  const video = document.getElementById("bg-video");

  if (!url || !image || !video) return;

  /* ===== 视频背景 ===== */
  if (/\.(mp4|webm|ogg|mov|m4v)(?:$|[?#])/i.test(url)) {
    image.style.display = "none";

    video.pause();
    video.style.display = "block";
    video.src = url;
    video.load();

    const playPromise = video.play();

    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(function (error) {
        console.warn("背景视频播放失败：", error);

        if (error && error.name !== "NotAllowedError") {
          MeTabToast.show(
            "背景视频播放失败，请检查壁纸链接。",
            "error"
          );
        }
      });
    }
  }

  /* ===== 图片背景 ===== */
  else {
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.style.display = "none";

    image.loading = "eager";
    image.decoding = "async";

    if ("fetchPriority" in image) {
      image.fetchPriority = "high";
    }

    // 重新显示图片元素
    image.style.display = "block";

    // 绑定图片加载失败事件
    image.onerror = function () {
      console.error("背景图片加载失败：", url);

      MeTabToast.show(
        "背景图片加载失败，请检查图片链接或网络连接。",
        "error"
      );

      image.onerror = null;
    };

    image.src = url;
  }
}
/* ===== 等待页面 + 动态菜单全部完成 ===== */


/* ===== 壁纸菜单初始化（Edge 扩展兼容） ===== */

window.addEventListener("load", function () {

  const bgBtn = document.getElementById("bgBtn");
  const bgDropdown = document.getElementById("bgDropdown");

  if (!bgBtn || !bgDropdown) {
    console.error("bgBtn 或 bgDropdown 不存在");

    if (window.MeTabToast) {
      MeTabToast.show(
        "壁纸菜单初始化失败，页面必要元素不存在。",
        "error"
      );
    }

    return;
  }

  /* ===== 恢复背景 ===== */

  const savedBg = localStorage.getItem("preferredBackground");

  const defaultBg =
    "image/MeTab-晴天.png";

  let hasCustomBackground = false;

  try {
    const config = JSON.parse(
      localStorage.getItem("metab_custom_background") || "null"
    );

    hasCustomBackground = !!config;
  } catch (error) {
    hasCustomBackground = false;
  }

  if (!hasCustomBackground) {
    setBackground(savedBg || defaultBg);
  }

  /* ===== 展开 / 收起菜单 ===== */

  bgBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    bgDropdown.classList.toggle("show");
  });

  /* ===== 点击空白关闭菜单 ===== */

  document.addEventListener("click", function (e) {

    if (
      !bgBtn.contains(e.target) &&
      !bgDropdown.contains(e.target)
    ) {
      bgDropdown.classList.remove("show");
    }

  });

  /* ===== 内置壁纸切换 ===== */

  bgDropdown.querySelectorAll("[data-bg]").forEach(function (item) {

    item.addEventListener("click", function () {

      const bg = item.dataset.bg;

      if (!bg) return;

      setBackground(bg);

      try {
        localStorage.setItem("preferredBackground", bg);
      } catch (error) {
        console.error("背景设置保存失败：", error);

        if (window.MeTabToast) {
          MeTabToast.show(
            "壁纸已切换，但设置保存失败。",
            "warning"
          );
        }
      }

      bgDropdown.classList.remove("show");

    });

  });

});

/* ===== 输入框清除按钮 ===== */

const domainInput = document.getElementById("domainInput");
const clearBtn = document.getElementById("clearBtn");
document.getElementById("goBtn").addEventListener("mousedown", e => {
  e.preventDefault();
});

document.getElementById("clearBtn").addEventListener("mousedown", e => {
  e.preventDefault();
});

/* 输入时显示 */
domainInput.addEventListener("input", () => {

  if(domainInput.value.trim()){

    clearBtn.classList.add("show");

  }else{

    clearBtn.classList.remove("show");

  }

});

/* 点击清空 */
clearBtn.addEventListener("click", () => {

  domainInput.value = "";

  clearBtn.classList.remove("show");

  domainInput.focus();

});

/* ===== iOS Safari 视口修复 ===== */

function updateViewportHeight(){

  const vh = window.visualViewport
    ? window.visualViewport.height
    : window.innerHeight;

  document.documentElement.style.setProperty(
    "--vh",
    `${vh}px`
  );
}

/* 初始化 */
updateViewportHeight();

/* 监听 */
window.addEventListener("resize", updateViewportHeight);

if(window.visualViewport){

  visualViewport.addEventListener(
    "resize",
    updateViewportHeight
  );

}
/* ===== 公告系统 ===== */

window.addEventListener("load", async ()=>{

  const noticeModal =
    document.getElementById("noticeModal");

  const noticeContent =
    document.getElementById("noticeContent");

  const noticeClose =
    document.getElementById("noticeClose");

  const noticeHide =
    document.getElementById("noticeHide");

  /* ===== 判断当前语言 ===== */

  const isHant =
    location.pathname.includes("/zh_hant/");

  /* ===== 公告接口 ===== */

  const NOTICE_API = isHant

    ? "https://yc.iqo3333.cn/?lang=hant"

    : "https://yc.iqo3333.cn/?lang=cn";

  /* ===== 本地存储 Key ===== */

  const STORAGE_KEY = isHant

    ? "notice_hidden_hant"

    : "notice_hidden_cn";

  try{

    const res = await fetch(

      NOTICE_API + "&t=" + Date.now(),

      {
        cache:"no-store"
      }
    );

    if(!res.ok){

      throw new Error("公告加载失败");
    }

    const text = await res.text();

    const content = text.trim();

    /* ===== 空公告不弹 ===== */

    if(!content){

      return;
    }

    /* ===== 已隐藏内容 ===== */

    const savedNotice =
      localStorage.getItem(STORAGE_KEY);

    /* ===== 内容未变化 ===== */

    if(savedNotice === content){

      return;
    }

    /* ===== 写入公告 ===== */

    noticeContent.innerHTML = content;

    /* ===== 显示弹窗 ===== */

    noticeModal.classList.add("show");

    /* =========================
       本次关闭
    ========================= */

    noticeClose.addEventListener(

      "click",

      ()=>{

        noticeModal.classList.remove(
          "show"
        );
      }
    );

/* =========================
   不再提示
========================= */

noticeHide.addEventListener(

  "click",

  ()=>{

    /* 保存当前公告 */

    localStorage.setItem(
      STORAGE_KEY,
      content
    );

    /* 已提示过 */

    if(
      !noticeContent.querySelector(
        ".notice-red"
      )
    ){

      const tip =
        document.createElement("div");

      tip.className =
        "notice-red";

      tip.textContent =
        "下次内容变更时将再次弹出";

      tip.style.marginTop =
        "16px";

      noticeContent.appendChild(
        tip
      );
    }

    /* 禁用按钮 */

    noticeHide.disabled = true;

    /* 立即关闭 */

    noticeModal.classList.remove(
      "show"
    );
  }
);
    /* =========================
       点击背景关闭
    ========================= */

    noticeModal.addEventListener(

      "click",

      (e)=>{

        if(e.target === noticeModal){

          noticeModal.classList.remove(
            "show"
          );
        }
      }
    );

}catch(err){

  console.error("MeTab 公告加载失败：", err);

  MeTabToast.show(
    "公告加载失败，请检查网络连接后重试。",
    "error"
  );
}

});

/* =====================================================
   搜索记录系统
===================================================== */

(function(){

  const input =
    document.getElementById("domainInput");

  const historyBox =
    document.getElementById("searchHistory");

  const historyList =
    document.getElementById("historyList");

  const clearHistoryBtn =
    document.getElementById("clearHistory");

  if(
    !input ||
    !historyBox ||
    !historyList ||
    !clearHistoryBtn
  ){

    return;

  }


  /* ===== 当前语言独立存储 ===== */

  const isHant =
    location.pathname.includes("/zh_hant/");

  const STORAGE_KEY =
    isHant
      ? "metab_search_history_hant"
      : "metab_search_history_cn";


  /* ===== 最大记录数量 ===== */

  const MAX_HISTORY = 15;


  /* ===== 获取历史记录 ===== */

  function getHistory(){

    try{

      const data =
        localStorage.getItem(STORAGE_KEY);

      const history =
        data ? JSON.parse(data) : [];

      return Array.isArray(history)
        ? history
        : [];

    }catch{

      return [];

    }

  }


  /* ===== 保存历史记录 ===== */

  function saveHistory(history){

    localStorage.setItem(

      STORAGE_KEY,

      JSON.stringify(history)

    );

  }


  /* ===== 添加记录 ===== */

  function addHistory(value){

    const text =
      value.trim();

    if(!text){

      return;

    }


    let history =
      getHistory();


    /* 删除重复记录 */

    history =
      history.filter(
        item => item !== text
      );


    /* 最新记录放在最前 */

    history.unshift(text);


    /* 限制数量 */

    history =
      history.slice(0, MAX_HISTORY);


    saveHistory(history);

  }


  /* ===== 删除单条记录 ===== */

  function deleteHistory(value){

    const history =
      getHistory().filter(
        item => item !== value
      );

    saveHistory(history);

    renderHistory(input.value);

  }


  /* ===== 清空全部记录 ===== */

  function clearHistory(){

    localStorage.removeItem(STORAGE_KEY);

    renderHistory();

  }


  /* ===== 渲染记录 ===== */

  function renderHistory(keyword = ""){

    const history =
      getHistory();


    const text =
      keyword.trim().toLowerCase();


    const filtered =
      text

        ? history.filter(
            item =>
              item.toLowerCase().includes(text)
          )

        : history;


    historyList.innerHTML = "";


    /* 没有记录 */

    if(!filtered.length){

      historyBox.classList.remove("show");

      historyBox.classList.add("empty");

      return;

    }


    historyBox.classList.remove("empty");


    filtered.forEach(item => {


      const row =
        document.createElement("div");

      row.className =
        "history-item";


      /* 左侧文字 */

      const textBox =
        document.createElement("div");

      textBox.className =
        "history-text";


      const icon =
        document.createElement("span");

      icon.className =
        "history-icon";

      icon.textContent =
        "↻";


      const label =
        document.createElement("span");

      label.textContent =
        item;


      textBox.appendChild(icon);

      textBox.appendChild(label);


      /* 删除按钮 */

      const del =
        document.createElement("button");

      del.className =
        "history-delete";

      del.type =
        "button";

      del.textContent =
        "×";


      del.addEventListener(

        "click",

        function(e){

          e.stopPropagation();

          deleteHistory(item);

        }

      );


 /* 点击记录 → 直接跳转 */
row.addEventListener(
  "click",
  function(){

    input.value = item;

    historyBox.classList.remove("show");

    handleInput();

  }
);


      row.appendChild(textBox);

      row.appendChild(del);


      historyList.appendChild(row);

    });


    historyBox.classList.add("show");

  }


  /* ===== 点击输入框 ===== */

  input.addEventListener(

    "focus",

    function(){

      renderHistory(input.value);

    }

  );


  /* ===== 输入时筛选 ===== */

  input.addEventListener(

    "input",

    function(){

      renderHistory(input.value);

    }

  );


  /* ===== 点击外部关闭 ===== */

  document.addEventListener(

    "click",

    function(e){

      if(

        !historyBox.contains(e.target) &&

        e.target !== input

      ){

        historyBox.classList.remove("show");

      }

    }

  );


  /* ===== 清空记录 ===== */

  clearHistoryBtn.addEventListener(

    "click",

    function(){

      clearHistory();

    }

  );


  /* ===== 暴露给搜索函数 ===== */

  window.saveSearchHistory =
    addHistory;


  /* ===== 页面加载时初始化 ===== */

  renderHistory();

/* 防止刷新页面时自动展开 */
historyBox.classList.remove("show");

})();

/* ===== Edge 扩展兼容：HTML 事件绑定 ===== */

document.addEventListener("DOMContentLoaded", function () {

  /* 搜索按钮 */
  var goBtn = document.getElementById("goBtn");

  if (goBtn) {
    goBtn.addEventListener("click", function () {
      if (typeof handleInput === "function") {
        handleInput();
      }
    });
  }

  /* MeTab 介绍页 */
  var profileBtn = document.getElementById("profileBtn");

  if (profileBtn) {
    profileBtn.addEventListener("click", function () {
      window.location.href = "profile.html";
    });
  }

});

// ===== MeTab 新版本检测 =====

(function () {

  var CURRENT_VERSION = 'Ver.9.3.4';

  var API_URL =
    'https://api.github.com/repos/iqo3333/MeTab/releases/latest';

  var versionLink =
    document.getElementById('versionLink');

  var versionUpdate =
    document.getElementById('versionUpdate');

  if (!versionLink || !versionUpdate) return;



  // 提取版本号
  function parseVersion(version) {
    return String(version)
      .replace(/^Ver\./i, '')
      .replace(/^v/i, '')
      .split('.')
      .map(function (item) {
        return parseInt(item, 10) || 0;
      });
  }

  // 比较版本号
  function isNewerVersion(latest, current) {

    var a = parseVersion(latest);
    var b = parseVersion(current);

    var length = Math.max(a.length, b.length);

    for (var i = 0; i < length; i++) {

      var av = a[i] || 0;
      var bv = b[i] || 0;

      if (av > bv) return true;
      if (av < bv) return false;

    }

    return false;
  }

  // 获取最新正式版
  fetch(API_URL, {
    headers: {
      Accept: 'application/vnd.github+json'
    }
  })
    .then(function (response) {

      if (!response.ok) {
        throw new Error('版本信息获取失败');
      }

      return response.json();

    })
    .then(function (release) {

      if (!release || !release.tag_name) return;

      var latestVersion = release.tag_name;

// 发现更新
if (isNewerVersion(latestVersion, CURRENT_VERSION)) {

  versionUpdate.hidden = false;

  versionUpdate.textContent =
    '发现新版本 ' + latestVersion;

  // 新版本提示独立跳转
  versionUpdate.href =
    release.html_url ||
    'https://github.com/iqo3333/MeTab/releases';

}

    })
.catch(function (error) {

  console.warn("MeTab 版本检测失败：", error);

  MeTabToast.show(
    "新版本检测失败，请稍后重试。",
    "warning"
  );

});

})();
