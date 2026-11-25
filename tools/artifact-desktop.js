// Solo para la versión artifact: icono propio y botón "Instalar como app" (app de escritorio de Claude).
(() => {
  const claude = window.claude;
  if (!claude || typeof claude.use !== 'function') return; // en GitHub Pages o en un navegador normal, no hace nada

  /** Icono de la app: un mástil visto de cerca, con una nota pisada. */
  function drawIcon() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const m = 14, s = 256 - 2 * m, r = 58;
    g.beginPath();
    g.roundRect(m, m, s, s, r);
    const body = g.createLinearGradient(0, m, 0, m + s);
    body.addColorStop(0, '#34231a');
    body.addColorStop(1, '#17110d');
    g.fillStyle = body;
    g.fill();
    g.save();
    g.clip();
    // cejuela y trastes
    const frets = [78, 122, 160, 193, 222];
    g.fillStyle = '#efe5cc';
    g.fillRect(58, m, 9, s);
    g.fillStyle = '#c9b88c';
    frets.slice(1).forEach((x) => g.fillRect(x, m, 3.5, s));
    // seis cuerdas
    for (let i = 0; i < 6; i++) {
      const y = 62 + i * 26.4;
      g.fillStyle = i >= 3 ? '#d9b36e' : '#e6ddc8';
      g.fillRect(m, y - (1.2 + i * 0.5) / 2, s, 1.2 + i * 0.5);
    }
    // marca de nácar
    g.fillStyle = 'rgba(232, 220, 192, .16)';
    g.beginPath(); g.arc(141, 128, 9, 0, Math.PI * 2); g.fill();
    // nota pisada
    const dot = g.createRadialGradient(176, 114, 4, 176, 114, 34);
    dot.addColorStop(0, 'rgba(240, 162, 59, .55)');
    dot.addColorStop(1, 'rgba(240, 162, 59, 0)');
    g.fillStyle = dot;
    g.fillRect(130, 70, 92, 92);
    g.fillStyle = '#f0a23b';
    g.beginPath(); g.arc(176, 114.4, 19, 0, Math.PI * 2); g.fill();
    g.restore();
    return c.toDataURL('image/png');
  }
  window.__mastilDrawIcon = drawIcon; // para poder revisarlo

  function addInstallButton(desktop) {
    const bar = document.querySelector('.topbar');
    if (!bar) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-ghost install-app';
    btn.textContent = '⤓ Instalar como app';
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        const res = await desktop.install.request();
        if (res === 'installed') btn.textContent = '✓ Instalando…';
        else if (res === 'cancelled') { btn.textContent = '⤓ Instalar como app'; btn.disabled = false; }
        else { btn.textContent = 'No se pudo instalar'; }
      } catch {
        btn.textContent = 'No se pudo instalar';
      }
    };
    bar.append(btn);
  }

  (async () => {
    let desktop = null;
    try { desktop = await claude.use('desktop'); } catch { /* sin capacidad desktop */ }
    if (!desktop) return;
    // Dentro de la ventana de la app instalada: poner el icono propio
    if (desktop.app?.dock) desktop.app.dock.setIcon(drawIcon()).catch(() => {});
    // En el visor de Claude: ofrecer instalarla
    let state = 'unavailable';
    try { state = await desktop.install.state(); } catch { /* sin instalación */ }
    if (state === 'available') addInstallButton(desktop);
  })();
})();
