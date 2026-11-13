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

  // Quién entra: lista de ids de perfumes SELLADOS del catálogo, con ₡3.000 de descuento.
  // Los testers no entran (ya tienen su precio rebajado). Para quitar o agregar uno, borra o agrega su id.
  var SELLADOS = [162, 163, 164, 165, 166, 167, 168, 169, 170, 174, 175, 176, 177, 178, 179, 183, 184, 185, 186, 187, 189, 190, 191, 192, 193, 194, 197, 198, 199, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215, 216, 218, 219, 220, 221, 226, 227, 228, 229, 230, 231, 233, 234, 235, 236, 237, 238, 239, 241, 242, 243, 244, 245, 246, 247, 248, 249, 250, 252, 253, 254, 255, 256, 257, 258, 259, 260, 261, 262, 263, 264, 265, 266, 267, 268, 270, 276, 282, 283, 284, 285, 286, 287, 288, 289, 290, 291, 292, 293, 294, 295, 307, 308, 309, 310, 311, 312, 313, 314, 315, 316, 317, 318, 321, 322, 323, 324, 329, 342, 343, 344, 346, 349, 350, 353, 427, 442, 445, 448, 453, 460, 466, 468, 469, 471, 476, 479, 480, 482, 490, 491, 501, 503, 507, 509, 510, 524, 530, 535];
  function descuentoDe(p) {
    return p.tipo === 'Sellado' && SELLADOS.indexOf(p.id) !== -1 ? 3000 : 0;
  }

  window.NIX_BLACK = {
    activo: true,
    aplicar: function (items) {
      items.forEach(function (p) {
        var d = p.precio == null ? 0 : descuentoDe(p);
        if (!d || p.precioAntes != null || p.precio <= d) return;
        p.precioAntes = p.precio;
        p.precio = p.precio - d;
        p.bn = true;
      });
    }
  };

  document.documentElement.classList.add('black');
  function listo() {
    var aviso = document.querySelector('.aviso-top p');
    if (aviso) aviso.innerHTML = '<span class="bn-franja">BLACK NOVEMBER</span> Descuento en perfumes seleccionados · hasta el 30 de nov, 10 p. m. <a href="#catalogo" data-filtro="especial:oferta">Ver ofertas ›</a>';
    document.querySelectorAll('.menu a[href$="#ofertas"], footer a[href$="#ofertas"]').forEach(function (a) { a.textContent = 'Black November'; a.classList.add('menu__bn'); a.setAttribute('href', '#catalogo'); a.setAttribute('data-filtro', 'especial:oferta'); });
    var h = document.querySelector('#ofertas h2'); if (h) h.textContent = 'Black November';
    var s = document.querySelector('#ofertas .fila__cab p'); if (s) s.textContent = 'Descuento en perfumes seleccionados hasta el 30 de noviembre a las 10 p. m.';
    var b = document.querySelector('#f-especial [data-v="oferta"]'); if (b) b.textContent = 'Black November';
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', listo); else listo();
  // Al terminar, la página se recarga sola con los precios normales
  if (!forzar && HASTA - ahora < 2000000000) setTimeout(function () { location.reload(); }, HASTA - ahora + 1000);
})();
