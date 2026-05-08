'use strict';

function _updateLayout() {
  const portrait = window.innerWidth <= 520;
  CONFIG.SIDEBAR_WIDTH        = portrait ? 0   : 220;
  CONFIG.CABLE_Y_BOTTOM_OFFSET = portrait ? 160 : 100;
}

window.addEventListener('load', function () {
  const canvas  = document.getElementById('gameCanvas');
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;

  _updateLayout();
  renderInit(canvas);
  uiInit(canvas);
  uiRenderSidebar();

  let lastTime = null;

  function gameLoop(timestamp) {
    if (lastTime === null) lastTime = timestamp;
    const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
    lastTime = timestamp;

    if (!STATE.gameOver) {
      physicsTick(dt);
      requestsTick(dt);
      eventsTick(dt);
      checkWinLose();
    }

    renderFrame(dt);
    uiUpdateMeters();

    requestAnimationFrame(gameLoop);
  }

  requestAnimationFrame(gameLoop);

  window.addEventListener('resize', function () {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    _updateLayout();
    renderInit(canvas);
  });
});
