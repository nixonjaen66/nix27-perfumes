/* Black November: se enciende y se apaga solo según las fechas de abajo.
   Aplica el descuento en colones a los perfumes de la lista (por id del catálogo): el precio normal
   sale tachado y el precio rebajado en rojo. No toca data/catalogo.json: al terminar, todo vuelve al precio normal.
   Para verla fuera de fechas: abre la página con ?black=1  */
(function () {
  var DESDE = Date.parse('2026-11-12T00:00:00-06:00');
  var HASTA = Date.parse('2026-11-30T22:00:00-06:00'); // 30 de nov, 10:00 p. m. (hora de Costa Rica)
  var forzar = /[?&]black=1/.test(location.search);
  var ahora = Date.now();
  var activo = forzar || (ahora >= DESDE && ahora < HASTA);
  if (!activo) { window.NIX_BLACK = { activo: false, aplicar: function () {} }; return; }

  // id del catálogo -> descuento en colones
  var D3 = [254,255,258,260,259,253,257,270,267,276,264,290,295,294,286,291,311,309,317,316,315,353,350,349,346,318,342,501,248,246,479,245,284,480,
            207,524,243,192,193,194,220,219,233,241,239,190,199,168,530,244,228,226,175,204,466,206];
  var D2 = [21,99,103,37,157,158,129,838,130,153,76,93,161,860,12,28,107];
  var LISTA = {};
  D3.forEach(function (id) { LISTA[id] = 3000; });
  D2.forEach(function (id) { LISTA[id] = 2000; });

  window.NIX_BLACK = {
    activo: true,
    aplicar: function (items) {
      items.forEach(function (p) {
        var d = LISTA[p.id];
        if (!d || p.precio == null || p.precioAntes != null || p.precio <= d) return;
        p.precioAntes = p.precio;
        p.precio = p.precio - d;
        p.bn = true;
      });
    }
  };

  document.documentElement.classList.add('black');
  function listo() {
    var aviso = document.querySelector('.aviso-top p');
    if (aviso) aviso.innerHTML = '<span class="bn-franja">BLACK NOVEMBER</span> ₡3.000 menos en perfumes seleccionados · hasta el 30 de nov, 10 p. m. <a href="index.html#ofertas">Ver ofertas ›</a>';
    document.querySelectorAll('.menu a[href$="#ofertas"], footer a[href$="#ofertas"]').forEach(function (a) { a.textContent = 'Black November'; a.classList.add('menu__bn'); });
    var h = document.querySelector('#ofertas h2'); if (h) h.textContent = 'Black November';
    var s = document.querySelector('#ofertas .fila__cab p'); if (s) s.textContent = 'Descuento en perfumes seleccionados hasta el 30 de noviembre a las 10 p. m.';
    var b = document.querySelector('#f-especial [data-v="oferta"]'); if (b) b.textContent = 'Black November';
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', listo); else listo();
  // Al terminar, la página se recarga sola con los precios normales
  if (!forzar && HASTA - ahora < 2000000000) setTimeout(function () { location.reload(); }, HASTA - ahora + 1000);
})();
