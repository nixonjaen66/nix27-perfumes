/* Catálogo de perfumes — lógica de la página.
   Lee catalogo.json y muestra los perfumes activos. Se personaliza en config.js. */
(function (root) {
  'use strict';

  var PAGINA = 48;
  var CLAVE_CARRITO = 'perfumeria_pedido_v1';
  var ETIQUETA_GENERO = { Femenino: 'Mujer', Masculino: 'Hombre', Unisex: 'Unisex' };

  /* ---------- Funciones puras (se prueban sin navegador) ---------- */

  function normalizar(texto) {
    return String(texto == null ? '' : texto).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function esVisible(p) {
    return p && p.activo !== false && !!p.imagen;
  }

  function coincideGenero(p, genero) {
    if (genero === 'mujer') return p.genero === 'Femenino' || p.genero === 'Unisex';
    if (genero === 'hombre') return p.genero === 'Masculino' || p.genero === 'Unisex';
    return true;
  }

  function filtrar(items, e) {
    var terminos = normalizar(e.q).split(/\s+/).filter(Boolean);
    return items.filter(function (p) {
      if (!coincideGenero(p, e.genero)) return false;
      if (e.categoria !== 'todas' && p.categoria !== e.categoria) return false;
      if (e.tipo !== 'todos' && p.tipo !== e.tipo) return false;
      if (e.marca !== 'todas' && p.marca !== e.marca) return false;
      if (terminos.length) {
        var pajar = normalizar([p.marca, p.nombre, p.categoria, p.tipo].join(' '));
        for (var i = 0; i < terminos.length; i++) if (pajar.indexOf(terminos[i]) === -1) return false;
      }
      return true;
    });
  }

  function comparar(a, b) { return a.localeCompare(b, 'es', { sensitivity: 'base' }); }

  function ordenar(items, orden) {
    var copia = items.slice();
    var porNombre = function (a, b) { return comparar(a.marca, b.marca) || comparar(a.nombre, b.nombre); };
    if (orden === 'precio-asc') {
      copia.sort(function (a, b) {
        var pa = a.precio == null ? Infinity : a.precio, pb = b.precio == null ? Infinity : b.precio;
        return (pa === pb ? 0 : pa < pb ? -1 : 1) || porNombre(a, b);
      });
    } else if (orden === 'precio-desc') {
      copia.sort(function (a, b) {
        var pa = a.precio == null ? -1 : a.precio, pb = b.precio == null ? -1 : b.precio;
        return (pa === pb ? 0 : pa > pb ? -1 : 1) || porNombre(a, b);
      });
    } else {
      copia.sort(porNombre);
    }
    return copia;
  }

  function formatoPrecio(n, moneda) {
    var m = moneda == null ? '₡' : moneda;
    return m + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  function rutaImagen(p, cfg) {
    if (!p.imagen) return '';
    var base = String(cfg.carpetaImagenes || '').replace(/\/+$/, '');
    return encodeURI(base + p.imagen);
  }

  function escapar(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function descripcionCorta(p) {
    return p.marca + ' ' + p.nombre + (p.tipo === 'Tester' ? ' (Tester)' : '') + (p.ml ? ' ' + p.ml + ' ml' : '');
  }

  function totalPedido(carrito, porId) {
    var total = 0, sinPrecio = 0, unidades = 0;
    Object.keys(carrito).forEach(function (id) {
      var p = porId[id], q = carrito[id];
      if (!p || !(q > 0)) return;
      unidades += q;
      if (p.precio == null) sinPrecio += q; else total += p.precio * q;
    });
    return { total: total, sinPrecio: sinPrecio, unidades: unidades };
  }

  function mensajeWhatsApp(carrito, porId, cfg) {
    var lineas = [cfg.saludoPedido || 'Hola, quisiera hacer este pedido:', ''];
    Object.keys(carrito).forEach(function (id) {
      var p = porId[id], q = carrito[id];
      if (!p || !(q > 0)) return;
      var precio = p.precio == null ? 'precio por confirmar' : formatoPrecio(p.precio * q, cfg.moneda);
      lineas.push('• ' + q + ' × ' + descripcionCorta(p) + ' — ' + precio);
    });
    var t = totalPedido(carrito, porId);
    lineas.push('');
    lineas.push('Total: ' + formatoPrecio(t.total, cfg.moneda) + (t.sinPrecio ? ' (más ' + t.sinPrecio + ' por confirmar)' : ''));
    return lineas.join('\n');
  }

  function enlaceWhatsApp(texto, numero) {
    var n = String(numero || '').replace(/\D/g, '');
    return 'https://wa.me/' + n + '?text=' + encodeURIComponent(texto);
  }

  function elegirParaPortada(items, cantidad, azar) {
    var rnd = azar || Math.random;
    var mezcla = items.slice();
    for (var i = mezcla.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1)), t = mezcla[i]; mezcla[i] = mezcla[j]; mezcla[j] = t;
    }
    var vistas = {}, elegidos = [];
    for (var k = 0; k < mezcla.length && elegidos.length < cantidad; k++) {
      if (!vistas[mezcla[k].marca]) { vistas[mezcla[k].marca] = 1; elegidos.push(mezcla[k]); }
    }
    return elegidos;
  }

  var puro = {
    normalizar: normalizar, esVisible: esVisible, filtrar: filtrar, ordenar: ordenar, formatoPrecio: formatoPrecio,
    rutaImagen: rutaImagen, totalPedido: totalPedido, mensajeWhatsApp: mensajeWhatsApp, enlaceWhatsApp: enlaceWhatsApp,
    elegirParaPortada: elegirParaPortada, escapar: escapar
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = puro;

  /* ---------- Interfaz ---------- */

  function iniciar() {
    var doc = root.document;
    var cfg = Object.assign({
      tienda: 'Mi Perfumería', whatsapp: '', moneda: '₡', carpetaImagenes: 'assets',
      notaTester: '', saludoPedido: 'Hola, quisiera hacer este pedido:', pie: ''
    }, root.CONFIG || {});

    var $ = function (id) { return doc.getElementById(id); };
    var todos = [], porId = {}, resultado = [];
    var estado = { q: '', genero: 'todos', categoria: 'todas', tipo: 'todos', marca: 'todas', orden: 'marca', visibles: PAGINA };
    var carrito = cargarCarrito();
    var ultimoFoco = null;

    doc.title = cfg.tienda + ' — Perfumes de diseñador, árabes y de nicho';
    $('nombre-tienda').textContent = cfg.tienda;
    $('pie-texto').textContent = cfg.pie || '';

    /* Carrito en el navegador (si el navegador no deja guardar, funciona igual en memoria) */
    function cargarCarrito() {
      try {
        var crudo = root.localStorage && root.localStorage.getItem(CLAVE_CARRITO);
        var obj = crudo ? JSON.parse(crudo) : {};
        return obj && typeof obj === 'object' ? obj : {};
      } catch (e) { return {}; }
    }
    function guardarCarrito() {
      try { root.localStorage && root.localStorage.setItem(CLAVE_CARRITO, JSON.stringify(carrito)); } catch (e) { /* sin guardado */ }
    }

    function avisar(texto) {
      var a = $('aviso');
      a.textContent = texto; a.hidden = false;
      clearTimeout(avisar._t);
      avisar._t = setTimeout(function () { a.hidden = true; }, 2200);
    }

    /* ----- Catálogo ----- */
    function cargar() {
      return root.fetch('catalogo.json').then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function (datos) {
        todos = datos.filter(esVisible);
        todos.forEach(function (p) { porId[p.id] = p; });
        limpiarCarritoInvalido();
        llenarMarcas();
        pintarPortada();
        aplicar(true);
        pintarCarrito();
      }).catch(function () {
        var e = $('error');
        e.hidden = false;
        e.innerHTML = '<strong>No se pudo cargar el catálogo.</strong><br>' +
          'Si abriste el archivo con doble clic, el navegador lo bloquea. Abre la carpeta con un servidor local ' +
          '(por ejemplo la extensión <em>Live Server</em> de VS Code, o <code>python -m http.server</code>) ' +
          'o súbela a tu hosting. Verifica también que <code>catalogo.json</code> esté junto a <code>index.html</code>.';
      });
    }

    function limpiarCarritoInvalido() {
      var cambio = false;
      Object.keys(carrito).forEach(function (id) {
        if (!porId[id] || !(carrito[id] > 0)) { delete carrito[id]; cambio = true; }
      });
      if (cambio) guardarCarrito();
    }

    function llenarMarcas() {
      var marcas = {};
      todos.forEach(function (p) { marcas[p.marca] = 1; });
      var lista = Object.keys(marcas).sort(comparar);
      $('f-marca').innerHTML = '<option value="todas">Todas las marcas</option>' +
        lista.map(function (m) { return '<option value="' + escapar(m) + '">' + escapar(m) + '</option>'; }).join('');
    }

    function aplicar(reiniciar) {
      if (reiniciar) estado.visibles = PAGINA;
      resultado = ordenar(filtrar(todos, estado), estado.orden);
      pintarGrid();
    }

    function tarjeta(p) {
      var precio = p.precio == null
        ? '<span class="precio precio--consulta">Consultar precio</span>'
        : '<span class="precio">' + formatoPrecio(p.precio, cfg.moneda) + '</span>';
      var etiquetas = '';
      if (p.tipo === 'Tester') etiquetas += '<span class="etiqueta">Tester</span>';
      if (p.ml) etiquetas += '<span class="etiqueta">' + p.ml + ' ml</span>';
      return '<article class="tarjeta">' +
        '<button class="abrir" type="button" data-abrir="' + p.id + '" aria-label="Ver ' + escapar(p.marca + ' ' + p.nombre) + '">' +
          '<span class="foto"><img src="' + rutaImagen(p, cfg) + '" alt="' + escapar(p.marca + ' ' + p.nombre) + '" loading="lazy" decoding="async" width="400" height="500"></span>' +
          '<span class="tarjeta__info">' +
            '<span class="tarjeta__marca">' + escapar(p.marca) + '</span>' +
            '<span class="tarjeta__nombre">' + escapar(p.nombre) + '</span>' +
            '<span class="etiquetas">' + etiquetas + '</span>' +
          '</span>' +
        '</button>' +
        '<div class="tarjeta__pie">' + precio +
          '<button class="btn-agregar" type="button" data-agregar="' + p.id + '" aria-label="Agregar ' + escapar(p.marca + ' ' + p.nombre) + ' a mi pedido">Agregar</button>' +
        '</div>' +
      '</article>';
    }

    function pintarGrid() {
      var mostrar = resultado.slice(0, estado.visibles);
      $('grid').innerHTML = mostrar.map(tarjeta).join('');
      var total = resultado.length;
      $('resultado').textContent = total === 0 ? '' :
        (total === 1 ? '1 perfume' : total + ' perfumes') + (mostrar.length < total ? ' · mostrando ' + mostrar.length : '');
      $('vacio').hidden = total !== 0;
      var restantes = total - mostrar.length;
      var mas = $('btn-mas');
      mas.hidden = restantes <= 0;
      mas.textContent = 'Mostrar más (' + restantes + ' restantes)';
    }

    function pintarPortada() {
      var elegidos = elegirParaPortada(todos, 5);
      $('estante').innerHTML = elegidos.map(function (p, i) {
        return '<button class="frasco" type="button" style="--i:' + i + '" data-abrir="' + p.id + '" aria-label="Ver ' + escapar(p.marca + ' ' + p.nombre) + '">' +
          '<img src="' + rutaImagen(p, cfg) + '" alt="' + escapar(p.marca + ' ' + p.nombre) + '" decoding="async" width="300" height="375"></button>';
      }).join('');
    }

    /* ----- Ficha ----- */
    function abrirFicha(id) {
      var p = porId[id];
      if (!p) return;
      ultimoFoco = doc.activeElement;
      var etiquetas = [ETIQUETA_GENERO[p.genero] || p.genero, p.categoria];
      etiquetas.push(p.tipo === 'Tester' ? 'Tester' : 'Sellado');
      if (p.ml) etiquetas.push(p.ml + ' ml');
      var precio = p.precio == null ? 'Consultar precio' : formatoPrecio(p.precio, cfg.moneda);
      var nota = p.tipo === 'Tester' && cfg.notaTester ? '<p class="ficha__nota">' + escapar(cfg.notaTester) + '</p>' : '';
      var uno = {}; uno[p.id] = 1;
      var enlace = enlaceWhatsApp(mensajeWhatsApp(uno, porId, cfg), cfg.whatsapp);
      $('ficha-cuerpo').innerHTML =
        '<div class="ficha__foto"><img src="' + rutaImagen(p, cfg) + '" alt="' + escapar(p.marca + ' ' + p.nombre) + '"></div>' +
        '<div class="ficha__datos">' +
          '<p class="ficha__marca">' + escapar(p.marca) + '</p>' +
          '<h2 class="ficha__nombre" id="ficha-nombre">' + escapar(p.nombre) + '</h2>' +
          '<div class="etiquetas">' + etiquetas.map(function (t) { return '<span class="etiqueta">' + escapar(t) + '</span>'; }).join('') + '</div>' +
          (p.descripcion ? '<p class="ficha__desc">' + escapar(p.descripcion) + '</p>' : '') + nota +
          '<div class="ficha__precio">' + precio + '</div>' +
          '<div class="ficha__acciones">' +
            '<button class="btn-lleno" type="button" data-agregar="' + p.id + '" data-cerrar="1">Agregar a mi pedido</button>' +
            '<a class="btn-wa" href="' + enlace + '" target="_blank" rel="noopener">Pedir solo este por WhatsApp</a>' +
          '</div>' +
        '</div>';
      $('ficha').showModal();
    }

    /* ----- Pedido ----- */
    function cambiarCantidad(id, delta) {
      var q = (carrito[id] || 0) + delta;
      if (q <= 0) delete carrito[id]; else carrito[id] = Math.min(q, 99);
      guardarCarrito();
      pintarCarrito();
    }

    function agregar(id) {
      if (!porId[id]) return;
      cambiarCantidad(id, 1);
      avisar(descripcionCorta(porId[id]) + ' agregado a tu pedido');
    }

    function pintarCarrito() {
      var t = totalPedido(carrito, porId);
      var c = $('contador');
      c.textContent = t.unidades; c.hidden = t.unidades === 0;
      var ids = Object.keys(carrito).filter(function (id) { return porId[id]; });
      var lista = $('carrito-lista'), pie = $('carrito-pie');
      if (!ids.length) {
        lista.innerHTML = '<div class="panel__vacio">Aún no has agregado perfumes.<br>Elige los que te gusten y aparecerán aquí.</div>';
        pie.innerHTML = '';
        return;
      }
      lista.innerHTML = ids.map(function (id) {
        var p = porId[id], q = carrito[id];
        var precio = p.precio == null ? 'Consultar precio' : formatoPrecio(p.precio * q, cfg.moneda);
        return '<div class="linea-pedido">' +
          '<img src="' + rutaImagen(p, cfg) + '" alt="" loading="lazy">' +
          '<div>' +
            '<h3>' + escapar(p.nombre) + '</h3>' +
            '<p class="sub">' + escapar(p.marca) + (p.tipo === 'Tester' ? ' · Tester' : '') + (p.ml ? ' · ' + p.ml + ' ml' : '') + '</p>' +
            '<div class="linea-pedido__fila">' +
              '<div class="cantidad"><button type="button" data-menos="' + id + '" aria-label="Quitar una unidad">−</button><span aria-live="polite">' + q + '</span><button type="button" data-mas="' + id + '" aria-label="Agregar una unidad">+</button></div>' +
              '<strong>' + precio + '</strong>' +
            '</div>' +
            '<button class="quitar" type="button" data-quitar="' + id + '">Quitar</button>' +
          '</div></div>';
      }).join('');
      var aviso = t.sinPrecio ? '<small>' + t.sinPrecio + (t.sinPrecio === 1 ? ' perfume' : ' perfumes') + ' sin precio: lo confirmamos por WhatsApp.</small>' : '';
      var enlace = enlaceWhatsApp(mensajeWhatsApp(carrito, porId, cfg), cfg.whatsapp);
      pie.innerHTML = '<div class="total"><span>Total</span><strong>' + formatoPrecio(t.total, cfg.moneda) + '</strong></div>' + aviso +
        '<a class="btn-wa" href="' + enlace + '" target="_blank" rel="noopener">Enviar pedido por WhatsApp</a>' +
        '<button class="link-vaciar" type="button" id="btn-vaciar">Vaciar pedido</button>';
    }

    /* ----- Eventos ----- */
    function marcarSegmento(idGrupo, valor) {
      var botones = $(idGrupo).querySelectorAll('button');
      for (var i = 0; i < botones.length; i++) {
        botones[i].setAttribute('aria-pressed', botones[i].getAttribute('data-v') === valor ? 'true' : 'false');
      }
    }
    function segmento(idGrupo, clave) {
      $(idGrupo).addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('button[data-v]');
        if (!b) return;
        estado[clave] = b.getAttribute('data-v');
        marcarSegmento(idGrupo, estado[clave]);
        aplicar(true);
      });
    }
    segmento('f-genero', 'genero');
    segmento('f-categoria', 'categoria');
    segmento('f-tipo', 'tipo');

    var temporizador;
    $('buscar').addEventListener('input', function (e) {
      clearTimeout(temporizador);
      var valor = e.target.value;
      temporizador = setTimeout(function () { estado.q = valor; aplicar(true); }, 120);
    });
    $('f-marca').addEventListener('change', function (e) { estado.marca = e.target.value; aplicar(true); });
    $('f-orden').addEventListener('change', function (e) { estado.orden = e.target.value; aplicar(true); });
    $('btn-mas').addEventListener('click', function () { estado.visibles += PAGINA; pintarGrid(); });
    $('btn-filtros').addEventListener('click', function () {
      var f = $('filtros'), abierto = f.classList.toggle('abierto');
      $('btn-filtros').setAttribute('aria-expanded', abierto ? 'true' : 'false');
    });
    $('btn-limpiar').addEventListener('click', function () {
      estado = { q: '', genero: 'todos', categoria: 'todas', tipo: 'todos', marca: 'todas', orden: 'marca', visibles: PAGINA };
      $('buscar').value = ''; $('f-marca').value = 'todas'; $('f-orden').value = 'marca';
      marcarSegmento('f-genero', 'todos'); marcarSegmento('f-categoria', 'todas'); marcarSegmento('f-tipo', 'todos');
      aplicar(true);
    });

    // Abrir ficha o agregar desde la cuadrícula y la portada
    function manejarClics(e) {
      var el = e.target.closest ? e.target : null;
      if (!el) return;
      var add = el.closest('[data-agregar]');
      if (add) {
        agregar(add.getAttribute('data-agregar'));
        if (add.getAttribute('data-cerrar')) $('ficha').close();
        return;
      }
      var abrir = el.closest('[data-abrir]');
      if (abrir) abrirFicha(abrir.getAttribute('data-abrir'));
    }
    $('grid').addEventListener('click', manejarClics);
    $('estante').addEventListener('click', manejarClics);
    $('ficha-cuerpo').addEventListener('click', manejarClics);

    // Cerrar diálogos
    function cerrable(id, idBoton) {
      var d = $(id);
      $(idBoton).addEventListener('click', function () { d.close(); });
      d.addEventListener('click', function (e) { if (e.target === d) d.close(); });
      d.addEventListener('close', function () { if (ultimoFoco && ultimoFoco.focus) ultimoFoco.focus(); });
    }
    cerrable('ficha', 'ficha-cerrar');
    cerrable('carrito', 'carrito-cerrar');

    $('btn-carrito').addEventListener('click', function () { ultimoFoco = $('btn-carrito'); $('carrito').showModal(); });
    $('carrito').addEventListener('click', function (e) {
      var el = e.target.closest ? e.target : null;
      if (!el) return;
      var mas = el.closest('[data-mas]'), menos = el.closest('[data-menos]'), quitar = el.closest('[data-quitar]');
      if (mas) cambiarCantidad(mas.getAttribute('data-mas'), 1);
      else if (menos) cambiarCantidad(menos.getAttribute('data-menos'), -1);
      else if (quitar) cambiarCantidad(quitar.getAttribute('data-quitar'), -(carrito[quitar.getAttribute('data-quitar')] || 0));
      else if (el.closest('#btn-vaciar')) { carrito = {}; guardarCarrito(); pintarCarrito(); }
    });

    /* Si las fotos no cargan, explica qué ruta está buscando la página */
    var fallosFoto = 0;
    if (doc.addEventListener) {
      doc.addEventListener('error', function (e) {
        var t = e.target;
        if (!t || t.tagName !== 'IMG') return;
        fallosFoto++;
        if (fallosFoto !== 3) return;
        var ruta = (t.getAttribute && t.getAttribute('src')) || '';
        var caja = $('error');
        caja.hidden = false;
        caja.innerHTML = '<strong>No se encuentran las fotos.</strong><br>' +
          'La página está buscando la foto en <code>' + escapar(ruta) + '</code>.<br>' +
          'Revisa que la carpeta <code>assets</code> esté en la misma carpeta que <code>index.html</code> y que dentro tenga la carpeta <code>perfumes</code> ' +
          '(si ves <code>assets/assets/perfumes</code>, saca la carpeta de adentro). En GitHub, las mayúsculas y minúsculas de los nombres deben coincidir.';
      }, true);
    }

    return cargar();
  }

  if (root.document && root.document.getElementById && root.document.getElementById('grid')) {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();
  }
  root.__perfumeria = { iniciar: iniciar };
})(typeof window !== 'undefined' ? window : globalThis);
