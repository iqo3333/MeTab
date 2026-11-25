window.addEventListener("DOMContentLoaded", () => {

  const bgWrapper = document.querySelector(".bg-wrapper");

  if (!bgWrapper) return;

  bgWrapper.insertAdjacentHTML("beforeend", `

    <div class="bg-dropdown" id="bgDropdown">

      <a href="image/index.html" target="_blank">
        MeTab 壁纸库
      </a>

      <div data-bg="image/MeTab-晴天.png">
        MeTab•晴天
      </div>

      <div data-bg="image/MeTab-夜晚.png">
        MeTab•夜晚
      </div>

      <div data-bg="image/MeTab-日系.png">
        MeTab•日系
      </div>

      <div data-bg="image/MeTab-未来沙漠.png">
        MeTab•未来沙漠
      </div>

      <div data-bg="image/冰公主.png">
        鬼刀•冰公主
      </div>

      <div data-bg="https://video.wetab.link/wallpaper-dynamic/v1gtq7c98hpyiv8xry6eslv7vrq6.mp4">
        孤独宇航员•动态
      </div>

      <div data-bg="https://video.wetab.link/wallpaper-dynamic/v1gtq6t5bgrvzjx4p06fly6k2f21.mp4">
        空崎日奈•动态
      </div>

      <div data-bg="https://video.wetab.link/wallpaper-dynamic/v1gtq6c1g3z5yg0bit0zu13gy7wh.mp4">
        千与千寻•动态
      </div>

      <div data-bg="https://video.wetab.link/wallpaper-dynamic/v1gtq6cu4hc4wahg4yiiskspityx.mp4">
        尼尔:机械纪元•动态
      </div>

      <div data-bg="https://video.wetab.link/wallpaper-dynamic/v1gtq77u4cvcki7ncfc2vwkr4at0.mp4">
        赛琳娜•幻奏•动态
      </div>

      <div data-bg="https://video.wetab.link/wallpaper-dynamic/v1gtq6pavf0yt1ndjm4ub5q88x6i.mp4">
       韧心鬼切•动态      </div>

      <div data-bg="https://video.wetab.link/wallpaper-dynamic/v1gtq6trgkb0pkhoebhmnihqfytt.mp4">
       金克斯•动态      </div>

      <div data-action="custom-wallpaper">
      自定义壁纸…
      </div>

    </div>

  `);

});
