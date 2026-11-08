/* Navidad automática: se enciende sola del 1 de diciembre al 6 de enero y se apaga sola después.
   Las fechas se cambian aquí. Para verla antes de tiempo: abre la página con ?navidad=1  */
(function () {
  var DESDE = { mes: 12, dia: 1 };  // 1 de diciembre
  var HASTA = { mes: 1, dia: 6 };   // 6 de enero (incluido)

  function enTemporada(f) {
    var m = f.getMonth() + 1, d = f.getDate();
    var n = m * 100 + d, a = DESDE.mes * 100 + DESDE.dia, b = HASTA.mes * 100 + HASTA.dia;
    return a <= b ? (n >= a && n <= b) : (n >= a || n <= b);
  }
  var forzar = /[?&]navidad=1/.test(location.search);
  if (!forzar && !enTemporada(new Date())) return;
  document.documentElement.classList.add('navidad');

  function listo() {
    var estrella = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.6 7.4H22l-6 4.6 2.3 7.4L12 17l-6.3 4.4L8 14 2 9.4h7.4z"/></svg>';
    var nav = document.getElementById('navbar');
    var aviso = document.querySelector('.aviso-top p');
    if (aviso && !aviso.querySelector('.nav-saludo')) {
      aviso.insertAdjacentHTML('afterbegin', '<span class="nav-saludo">' + estrella + 'FELICES FIESTAS</span> · ');
    } else if (nav && !document.querySelector('.nav-cinta')) {
      var cinta = document.createElement('div');
      cinta.className = 'nav-cinta';
      var regalos = document.getElementById('regalos') ? 'index.html#regalos' : null;
      cinta.innerHTML = estrella + '<span>Felices fiestas' + (regalos ? ' · <a href="' + regalos + '">Regalos de Navidad</a>' : '') + '</span>' + estrella;
      nav.parentNode.insertBefore(cinta, nav);
    }
    var hero = document.querySelector('.hero');
    if (hero && !hero.querySelector('.nav-nieve')) {
      var nieve = document.createElement('div');
      nieve.className = 'nav-nieve'; nieve.setAttribute('aria-hidden', 'true');
      var html = '';
      for (var i = 0; i < 26; i++) {
        var t = 3 + (i * 7) % 5;
        html += '<i style="left:' + ((i * 37) % 100) + '%;width:' + t + 'px;height:' + t + 'px;animation-duration:' + (9 + (i * 13) % 9) + 's;animation-delay:-' + ((i * 5) % 14) + 's"></i>';
      }
      nieve.innerHTML = html;
      hero.insertBefore(nieve, hero.firstChild);
      var ad = document.createElement('div');
      ad.className = 'nav-adornos'; ad.setAttribute('aria-hidden', 'true');
      ad.innerHTML = [[4, 60, ''], [9, 95, 'azul'], [14, 45, ''], [86, 50, 'azul'], [91, 100, ''], [96, 65, 'azul']].map(function (x, i) {
        return '<span class="' + x[2] + '" style="left:' + x[0] + '%;height:' + x[1] + 'px;animation-delay:-' + i * 0.8 + 's"></span>';
      }).join('');
      hero.insertBefore(ad, hero.firstChild);
    }
    var tit = document.querySelector('#regalos h2');
    if (tit) tit.textContent = 'Regalos de Navidad';
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', listo); else listo();
})();
