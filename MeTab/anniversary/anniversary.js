/* =====================================================
   MeTab Ver.9.0.0 周年庆典
   功能：
   1. 北京时间自动判断活动日期
   2. 自动计算 Ver.9.0.0 发布周年
   3. 每次打开页面自动展示
   4. 支持关闭与入场动画
===================================================== */

(function () {

  var modal = document.getElementById('anniversaryModal');
  var closeBtn = document.getElementById('anniversaryClose');
  var enterBtn = document.getElementById('anniversaryEnter');

  var numberEl = document.getElementById('anniversaryNumber');
  var unitEl = document.getElementById('anniversaryUnit');
  var mainTextEl = document.getElementById('anniversaryMainText');

  if (!modal || !closeBtn || !enterBtn) return;

  /* ===== 获取北京时间 ===== */

  function getBeijingDate() {

    var parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric'
    }).formatToParts(new Date());

    var result = {};

    parts.forEach(function (part) {
      if (part.type !== 'literal') {
        result[part.type] = Number(part.value);
      }
    });

    return result;
  }

  /* ===== 数字转中文 ===== */

  function toChineseNumber(number) {

    var numbers = [
      '零', '一', '二', '三', '四',
      '五', '六', '七', '八', '九', '十'
    ];

    if (number <= 10) {
      return numbers[number];
    }

    if (number < 20) {
      return '十' + numbers[number % 10];
    }

    if (number < 100) {
      var tens = Math.floor(number / 10);
      var units = number % 10;

      return numbers[tens] + '十' +
        (units ? numbers[units] : '');
    }

    return String(number);
  }

  /* ===== 更新周年信息 ===== */

  function updateAnniversary(year) {

    var anniversaryYears = year - 2025;

    if (anniversaryYears < 1) return false;

    var chineseYears = toChineseNumber(anniversaryYears);

    numberEl.innerHTML = '<span>' + anniversaryYears + '</span>';

    unitEl.textContent =
      'YEAR' + (anniversaryYears > 1 ? 'S' : '') +
      ' ANNIVERSARY';

    mainTextEl.textContent =
      'MeTab Ver.9.0.0 发布' +
      chineseYears +
      '周年';

    return true;
  }

  /* ===== 判断活动时间 ===== */

  function checkAnniversary() {

    try {

      var date = getBeijingDate();

      var year = date.year;
      var month = date.month;
      var day = date.day;

      // 每年 12 月 1 日至 12 月 7 日
      var isAnniversaryPeriod =
        month === 12 &&
        day >= 1 &&
        day <= 7;

      if (!isAnniversaryPeriod) return;

      if (!updateAnniversary(year)) return;

      // 每次打开页面均显示，不记录关闭状态
      modal.hidden = false;

      document.body.style.overflow = 'hidden';

    } catch (error) {

      console.warn('MeTab 周年庆典初始化失败：', error);

    }

  }

  /* ===== 关闭周年庆典 ===== */

  function closeAnniversary() {

    if (modal.hidden || modal.classList.contains('is-closing')) {
      return;
    }

    modal.classList.add('is-closing');

    document.body.style.overflow = '';

    window.setTimeout(function () {

      modal.hidden = true;
      modal.classList.remove('is-closing');

    }, 550);

  }

  /* ===== 绑定事件 ===== */

  closeBtn.addEventListener('click', closeAnniversary);

  enterBtn.addEventListener('click', closeAnniversary);

  document.addEventListener('keydown', function (event) {

    if (event.key === 'Escape' && !modal.hidden) {
      closeAnniversary();
    }

  });

  /* ===== 启动 ===== */

  checkAnniversary();

})();