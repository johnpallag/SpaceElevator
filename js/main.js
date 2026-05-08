'use strict';

window.addEventListener('load', function () {
  const canvas  = document.getElementById('gameCanvas');
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;

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
    renderInit(canvas);
  });
});
