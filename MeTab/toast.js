
/* =====================================================
   MeTab Toast
   独立全局轻提示组件
===================================================== */

(function () {
  "use strict";

  const icons = {
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',

    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></svg>',

    warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 2.7 17a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 16h.01"/></svg>',

    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/></svg>'
  };

  const queue = [];
  let isShowing = false;
  let container = null;

  /* 创建容器 */
  function createContainer() {
    if (container) return;

    container = document.createElement("div");
    container.id = "metabToastContainer";
    container.setAttribute("aria-live", "polite");
    container.setAttribute("aria-atomic", "false");

    document.body.appendChild(container);
  }

  /* 显示下一条提示 */
  function showNext() {
    if (isShowing || queue.length === 0) return;

    createContainer();

    isShowing = true;

    const item = queue.shift();

    const toast = document.createElement("div");
    toast.className = "metab-toast metab-toast-" + item.type;
    toast.setAttribute("role", "status");

    const icon = document.createElement("div");
    icon.className = "metab-toast-icon";
    icon.innerHTML = icons[item.type];

    const message = document.createElement("div");
    message.className = "metab-toast-message";
    message.textContent = item.message;

    toast.appendChild(icon);
    toast.appendChild(message);

    container.appendChild(toast);

    requestAnimationFrame(function () {
      toast.classList.add("show");
    });

    /* 自动消失 */
    setTimeout(function () {
      toast.classList.remove("show");
      toast.classList.add("hide");

      setTimeout(function () {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }

        isShowing = false;
        showNext();

      }, 260);

    }, item.duration);
  }

  /* 对外接口 */
  window.MeTabToast = {

    show: function (message, type, duration) {
      if (!message) return;

      type = icons[type] ? type : "info";

      duration = Number(duration);
      if (!duration || duration < 0) {
        duration = 2600;
      }

      queue.push({
        message: String(message),
        type: type,
        duration: duration
      });

      showNext();
    },

    clear: function () {
      queue.length = 0;

      if (container) {
        container.innerHTML = "";
      }

      isShowing = false;
    }
  };

})();
