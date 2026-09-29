(() => {
  'use strict';

  const input = document.getElementById('pdf-input');
  const picker = document.getElementById('pick-pdf');
  const dropZone = document.getElementById('drop-zone');
  const uploadStatus = document.getElementById('upload-status');
  const overlay = document.getElementById('pdf-reader');
  const stage = document.getElementById('pdf-stage');
  const book = document.getElementById('pdf-book');
  const shell = book.querySelector('.pdf-page-shell');
  const loading = document.getElementById('pdf-loading');
  const title = document.getElementById('pdf-title');
  const meta = document.getElementById('pdf-file-meta');
  const pageLabel = document.getElementById('pdf-page-label');
  const slider = document.getElementById('pdf-page-slider');
  const prevButton = document.getElementById('pdf-prev');
  const nextButton = document.getElementById('pdf-next');
  const edgePrev = document.getElementById('edge-prev');
  const edgeNext = document.getElementById('edge-next');
  const closeButton = document.getElementById('pdf-close');
  const fullscreenButton = document.getElementById('pdf-fullscreen');

  let pdf = null;
  let currentPage = 1;
  let frontCanvas = document.getElementById('pdf-canvas-front');
  let backCanvas = document.getElementById('pdf-canvas-back');
  let turning = false;

  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'assets/vendor/pdf.worker.min.js';
  }

  const openPicker = () => input.click();
  picker.addEventListener('click', openPicker);
  document.querySelectorAll('[data-open-upload]').forEach(button => {
    button.addEventListener('click', () => {
      document.getElementById('upload').scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.setTimeout(openPicker, 460);
    });
  });

  input.addEventListener('change', () => {
    if (input.files[0]) loadPdf(input.files[0]);
  });

  ['dragenter', 'dragover'].forEach(type => {
    dropZone.addEventListener(type, event => {
      event.preventDefault();
      dropZone.classList.add('is-dragging');
    });
  });

  ['dragleave', 'drop'].forEach(type => {
    dropZone.addEventListener(type, event => {
      event.preventDefault();
      dropZone.classList.remove('is-dragging');
    });
  });

  dropZone.addEventListener('drop', event => {
    const file = event.dataTransfer.files[0];
    if (file) loadPdf(file);
  });

  async function loadPdf(file) {
    if (!window.pdfjsLib) {
      uploadStatus.textContent = 'The PDF reader could not be loaded.';
      return;
    }
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      uploadStatus.textContent = 'Please choose a PDF file.';
      return;
    }

    uploadStatus.textContent = `Opening ${file.name}…`;
    title.textContent = file.name.replace(/\.pdf$/i, '');
    meta.textContent = `${formatBytes(file.size)} · Processing on this device`;
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    loading.hidden = false;

    try {
      if (pdf && typeof pdf.destroy === 'function') await pdf.destroy();
      const bytes = new Uint8Array(await file.arrayBuffer());
      pdf = await window.pdfjsLib.getDocument({ data: bytes, disableWorker: true }).promise;
      currentPage = 1;
      slider.max = pdf.numPages;
      slider.value = 1;
      await renderPage(currentPage, frontCanvas, true);
      clearCanvas(backCanvas);
      updateControls();
      uploadStatus.textContent = `${file.name} is ready.`;
    } catch (error) {
      console.error(error);
      meta.textContent = 'This PDF could not be opened.';
      uploadStatus.textContent = 'This PDF could not be opened. Please try another file.';
    } finally {
      loading.hidden = true;
    }
  }

  async function renderPage(number, canvas, resizeShell) {
    const page = await pdf.getPage(number);
    const base = page.getViewport({ scale: 1 });
    const ratio = base.width / base.height;
    const pixelScale = Math.min(2.4, Math.max(1.35, window.devicePixelRatio * 1.2));
    const viewport = page.getViewport({ scale: pixelScale });
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d', { alpha: false });
    context.save();
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.restore();
    await page.render({ canvasContext: context, viewport }).promise;
    if (resizeShell) sizePageShell(ratio);
  }

  function sizePageShell(ratio) {
    const stageBox = stage.getBoundingClientRect();
    const availableWidth = Math.max(260, stageBox.width - 140);
    const availableHeight = Math.max(300, stageBox.height - 26);
    let width = Math.min(availableWidth, availableHeight * ratio);
    let height = width / ratio;
    if (height > availableHeight) {
      height = availableHeight;
      width = height * ratio;
    }
    shell.style.width = `${Math.floor(width)}px`;
    shell.style.height = `${Math.floor(height)}px`;
  }

  async function turnTo(target) {
    if (!pdf || turning || target < 1 || target > pdf.numPages || target === currentPage) return;
    turning = true;
    const direction = target > currentPage ? 'forward' : 'back';
    await renderPage(target, backCanvas, false);
    shell.classList.add('is-turning', `turn-${direction}`);
    await waitForAnimation(frontCanvas, 650);
    shell.classList.remove('is-turning', 'turn-forward', 'turn-back');

    const oldFront = frontCanvas;
    frontCanvas = backCanvas;
    backCanvas = oldFront;
    frontCanvas.id = 'pdf-canvas-front';
    backCanvas.id = 'pdf-canvas-back';
    frontCanvas.style.transform = '';
    frontCanvas.style.filter = '';
    backCanvas.style.transform = '';
    backCanvas.style.filter = '';
    shell.appendChild(backCanvas);
    shell.appendChild(frontCanvas);
    shell.appendChild(shell.querySelector('.page-sheen'));
    currentPage = target;
    updateControls();
    turning = false;
  }

  function waitForAnimation(element, fallback) {
    return new Promise(resolve => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        element.removeEventListener('animationend', finish);
        resolve();
      };
      element.addEventListener('animationend', finish, { once: true });
      window.setTimeout(finish, fallback);
    });
  }

  function updateControls() {
    const total = pdf ? pdf.numPages : 1;
    pageLabel.textContent = `Page ${currentPage} of ${total}`;
    slider.value = currentPage;
    [prevButton, edgePrev].forEach(button => button.disabled = currentPage <= 1);
    [nextButton, edgeNext].forEach(button => button.disabled = currentPage >= total);
  }

  function clearCanvas(canvas) {
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 KB';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / Math.pow(1024, index)).toFixed(index ? 1 : 0)} ${units[index]}`;
  }

  function closeReader() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  prevButton.addEventListener('click', () => turnTo(currentPage - 1));
  nextButton.addEventListener('click', () => turnTo(currentPage + 1));
  edgePrev.addEventListener('click', () => turnTo(currentPage - 1));
  edgeNext.addEventListener('click', () => turnTo(currentPage + 1));
  slider.addEventListener('change', () => turnTo(Number(slider.value)));
  closeButton.addEventListener('click', closeReader);

  shell.addEventListener('click', event => {
    const bounds = shell.getBoundingClientRect();
    turnTo(currentPage + (event.clientX < bounds.left + bounds.width / 2 ? -1 : 1));
  });

  fullscreenButton.addEventListener('click', async () => {
    try {
      if (!document.fullscreenElement) await overlay.requestFullscreen();
      else await document.exitFullscreen();
    } catch (error) {
      console.error(error);
    }
  });

  document.addEventListener('fullscreenchange', () => {
    fullscreenButton.textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen';
    if (pdf) window.setTimeout(() => renderPage(currentPage, frontCanvas, true), 100);
  });

  document.addEventListener('keydown', event => {
    if (overlay.hidden) return;
    if (event.key === 'ArrowRight' || event.key === 'PageDown') turnTo(currentPage + 1);
    if (event.key === 'ArrowLeft' || event.key === 'PageUp') turnTo(currentPage - 1);
    if (event.key === 'Escape' && !document.fullscreenElement) closeReader();
  });

  window.addEventListener('resize', () => {
    if (pdf && !overlay.hidden) window.setTimeout(() => renderPage(currentPage, frontCanvas, true), 120);
  });
})();
