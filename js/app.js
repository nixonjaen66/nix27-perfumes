/* nix27_perfumes: lógica de la página.
   Lee data/catalogo.json y data/resenas.json. Los textos y datos de contacto se cambian en js/config.js */
(function (root) {
  'use strict';

  var PAGINA = 48;
  var CLAVE_PEDIDO = 'nix27_pedido_v1';
  var ETIQUETA_GENERO = { Femenino: 'Mujer', Masculino: 'Hombre', Unisex: 'Unisex' };

  /* ---------- Funciones puras (se prueban sin navegador) ---------- */

  function normalizar(texto) {
    return String(texto == null ? '' : texto).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }
  function esVisible(p) { return !!p && p.activo !== false && !!p.imagen; }
  function coincideGenero(p, genero) {
    if (genero === 'mujer') return p.genero === 'Femenino' || p.genero === 'Unisex';
    if (genero === 'hombre') return p.genero === 'Masculino' || p.genero === 'Unisex';
    return true;
  }
  function estadoInicial() {
    return { q: '', genero: 'todos', categoria: 'todas', tipo: 'todos', marca: 'todas', orden: 'marca', visibles: PAGINA };
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
    var lineas = [cfg.mensajePedido || 'Hola, quisiera hacer este pedido:', ''];
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
  function elegirAlAzar(items, cantidad, azar, marcasDistintas) {
    var rnd = azar || Math.random;
    var m = items.slice();
    for (var i = m.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1)), t = m[i]; m[i] = m[j]; m[j] = t;
    }
    if (!marcasDistintas) return m.slice(0, cantidad);
    var vistas = {}, out = [];
    for (var k = 0; k < m.length && out.length < cantidad; k++) {
      if (!vistas[m[k].marca]) { vistas[m[k].marca] = 1; out.push(m[k]); }
    }
    return out;
  }
  function marcasPorCantidad(items) {
    var cuenta = {};
    items.forEach(function (p) { cuenta[p.marca] = (cuenta[p.marca] || 0) + 1; });
    return Object.keys(cuenta).map(function (m) { return { marca: m, n: cuenta[m] }; })
      .sort(function (a, b) { return b.n - a.n || comparar(a.marca, b.marca); });
  }
  function atajoAEstado(valor) {
    var e = estadoInicial();
    var i = String(valor).indexOf(':');
    if (i < 0) return e;
    var k = valor.slice(0, i), v = valor.slice(i + 1);
    if (k === 'genero' || k === 'categoria' || k === 'tipo' || k === 'marca' || k === 'q') e[k] = v;
    return e;
  }
  function resumenResenas(resenas) {
    var reales = resenas.filter(function (r) { return !r.ejemplo; });
    if (!reales.length) return { total: 0, promedio: 0 };
    var suma = reales.reduce(function (a, r) { return a + (Number(r.estrellas) || 0); }, 0);
    return { total: reales.length, promedio: suma / reales.length };
  }
  function estrellasHTML(n) {
    var html = '';
    for (var i = 1; i <= 5; i++) {
      html += '<svg class="ico' + (i <= Math.round(n) ? '' : ' ico--vacia') + '" aria-hidden="true"><use href="#i-nota"/></svg>';
    }
    return '<div class="estrellas" role="img" aria-label="' + Math.round(n) + ' de 5 estrellas">' + html + '</div>';
  }

  var puro = {
    normalizar: normalizar, esVisible: esVisible, estadoInicial: estadoInicial, filtrar: filtrar, ordenar: ordenar,
    formatoPrecio: formatoPrecio, rutaImagen: rutaImagen, escapar: escapar, totalPedido: totalPedido,
    mensajeWhatsApp: mensajeWhatsApp, enlaceWhatsApp: enlaceWhatsApp, elegirAlAzar: elegirAlAzar,
    marcasPorCantidad: marcasPorCantidad, atajoAEstado: atajoAEstado, resumenResenas: resumenResenas, estrellasHTML: estrellasHTML
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = puro;

  /* ---------- Interfaz ---------- */

  function iniciar() {
    var doc = root.document;
    var cfg = Object.assign({
      tienda: 'nix27_perfumes', whatsapp: '', whatsappVisible: '', instagram: '', moneda: '₡', carpetaImagenes: 'assets',
      mensajePedido: 'Hola, quisiera hacer este pedido:', mensajeConsulta: 'Hola, quisiera consultar por un perfume.',
      mensajeResena: 'Hola, quiero dejar mi reseña.', notaTester: '', pasos: [], faq: [], pie: ''
    }, root.CONFIG || {});

    var $ = function (id) { return doc.getElementById(id); };
    var todos = [], porId = {}, resultado = [];
    var estado = estadoInicial();
    var carrito = cargarPedido();
    var ultimoFoco = null;

    function cargarPedido() {
      try {
        var crudo = root.localStorage && root.localStorage.getItem(CLAVE_PEDIDO);
        var obj = crudo ? JSON.parse(crudo) : {};
        return obj && typeof obj === 'object' ? obj : {};
      } catch (e) { return {}; }
    }
    function guardarPedido() {
      try { root.localStorage && root.localStorage.setItem(CLAVE_PEDIDO, JSON.stringify(carrito)); } catch (e) { /* sin guardado */ }
    }
    function wa(texto) { return enlaceWhatsApp(texto, cfg.whatsapp); }
    function avisar(texto) {
      var a = $('aviso');
      a.textContent = texto; a.hidden = false;
      clearTimeout(avisar._t);
      avisar._t = setTimeout(function () { a.hidden = true; }, 2400);
    }
    function irA(id) {
      var t = $(id);
      if (t && t.scrollIntoView) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    /* ----- Contactos y textos fijos ----- */
    function configurarContactos() {
      var mensajes = { consulta: cfg.mensajeConsulta, resena: cfg.mensajeResena };
      doc.querySelectorAll('[data-wa]').forEach(function (a) {
        a.setAttribute('href', wa(mensajes[a.getAttribute('data-wa-tipo')] || cfg.mensajeConsulta));
        a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener');
      });
      doc.querySelectorAll('[data-ig]').forEach(function (a) {
        a.setAttribute('href', 'https://www.instagram.com/' + cfg.instagram + '/');
      });
      doc.querySelectorAll('[data-tel]').forEach(function (s) { s.textContent = cfg.whatsappVisible; });
      doc.querySelectorAll('[data-ig-nombre]').forEach(function (s) { s.textContent = cfg.instagram; });
      $('pie-texto').textContent = cfg.pie || '';
      $('anio').textContent = String(new Date().getFullYear());
    }

    /* ----- Carga de datos ----- */
    function cargar() {
      var pCatalogo = root.fetch('data/catalogo.json').then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
      var pResenas = root.fetch('data/resenas.json').then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; });
      return Promise.all([pCatalogo, pResenas]).then(function (res) {
        todos = res[0].filter(esVisible);
        todos.forEach(function (p) { porId[p.id] = p; });
        limpiarPedidoInvalido();
        llenarMarcas();
        pintarHero();
        pintarCintaMarcas();
        pintarCintaFotos('cinta-1', false);
        pintarCintaFotos('cinta-2', true);
        pintarCategorias();
        aplicar(true);
        pintarPedido();
        pintarPasos();
        pintarResenas(Array.isArray(res[1]) ? res[1] : []);
        pintarFaq();
      }).catch(function () {
        var e = $('error');
        e.hidden = false;
        e.innerHTML = '<strong>No se pudo cargar el catálogo.</strong><br>' +
          'Si abriste el archivo con doble clic, el navegador lo bloquea. Abre la carpeta con un servidor local ' +
          '(por ejemplo la extensión <em>Live Server</em> de VS Code, o <code>python -m http.server</code>) ' +
          'o súbela a tu hosting. Verifica también que <code>data/catalogo.json</code> exista.';
      });
    }
    function limpiarPedidoInvalido() {
      var cambio = false;
      Object.keys(carrito).forEach(function (id) {
        if (!porId[id] || !(carrito[id] > 0)) { delete carrito[id]; cambio = true; }
      });
      if (cambio) guardarPedido();
    }
    function llenarMarcas() {
      var lista = marcasPorCantidad(todos).map(function (x) { return x.marca; }).sort(comparar);
      $('f-marca').innerHTML = '<option value="todas">Todas las marcas</option>' +
        lista.map(function (m) { return '<option value="' + escapar(m) + '">' + escapar(m) + '</option>'; }).join('');
    }

    /* ----- Portada ----- */
    function pintarHero() {
      var elegidos = elegirAlAzar(todos, 5, null, true);
      $('hero-vitrinas').innerHTML = elegidos.map(function (p, i) {
        return '<button class="frasco" type="button" style="--i:' + i + '" data-abrir="' + p.id + '" aria-label="Ver ' + escapar(p.marca + ' ' + p.nombre) + '">' +
          '<img src="' + rutaImagen(p, cfg) + '" alt="" width="300" height="375" decoding="async"></button>';
      }).join('');
      var nMarcas = marcasPorCantidad(todos).length;
      $('hero-dato').textContent = 'El catálogo reúne ' + todos.length + ' perfumes de ' + nMarcas + ' marcas.';
    }

    /* ----- Cintas ----- */
    function cinta(id, htmlUnaVez, segundosPorItem, n) {
      var el = $(id);
      el.innerHTML = '<div class="cinta__pista" style="--dur:' + Math.max(30, Math.round(n * segundosPorItem)) + 's">' +
        htmlUnaVez(false) + htmlUnaVez(true) + '</div>';
    }
    function pintarCintaMarcas() {
      var marcas = marcasPorCantidad(todos).slice(0, 26).map(function (x) { return x.marca; });
      var unaVez = function (oculto) {
        return marcas.map(function (m) {
          return '<button class="marca-item" type="button" data-filtro="marca:' + escapar(m) + '" title="Ver los perfumes de ' + escapar(m) + '"' + (oculto ? ' aria-hidden="true" tabindex="-1"' : '') + '>' +
            escapar(m) + '</button>';
        }).join('');
      };
      cinta('cinta-marcas', unaVez, 2.6, marcas.length);
    }
    function pintarCintaFotos(id, inversa) {
      var pool = todos.slice();
      var items = elegirAlAzar(pool, 16, null, false);
      var unaVez = function (oculto) {
        return items.map(function (p) {
          return '<button class="foto-item" type="button" data-abrir="' + p.id + '"' + (oculto ? ' aria-hidden="true" tabindex="-1"' : '') + '>' +
            '<img src="' + rutaImagen(p, cfg) + '" alt="' + (oculto ? '' : escapar(p.marca + ' ' + p.nombre)) + '" loading="lazy" decoding="async" width="352" height="440">' +
            '<span class="foto-item__info"><span class="foto-item__marca">' + escapar(p.marca) + '</span>' +
            '<span class="foto-item__nombre">' + escapar(p.nombre) + '</span>' +
            '<span class="foto-item__precio">' + (p.precio == null ? 'Consultar' : formatoPrecio(p.precio, cfg.moneda)) + '</span></span></button>';
        }).join('');
      };
      cinta(id, unaVez, 4.6, items.length);
    }

    /* ----- Categorías ----- */
    function pintarCategorias() {
      var defs = [
        { titulo: 'Mujer', atajo: 'genero:mujer', pred: function (p) { return p.genero === 'Femenino' || p.genero === 'Unisex'; } },
        { titulo: 'Hombre', atajo: 'genero:hombre', pred: function (p) { return p.genero === 'Masculino' || p.genero === 'Unisex'; } },
        { titulo: 'Árabes', atajo: 'categoria:Árabe', pred: function (p) { return p.categoria === 'Árabe'; } },
        { titulo: 'Nicho', atajo: 'categoria:Nicho', pred: function (p) { return p.categoria === 'Nicho'; } }
      ];
      $('categorias-grid').innerHTML = defs.map(function (d) {
        var lista = todos.filter(d.pred);
        if (!lista.length) return '';
        var foto = elegirAlAzar(lista.filter(function (p) { return p.tipo === 'Sellado'; }).concat([]), 1)[0] || elegirAlAzar(lista, 1)[0];
        return '<a class="cat" href="#catalogo" data-filtro="' + escapar(d.atajo) + '">' +
          '<img src="' + rutaImagen(foto, cfg) + '" alt="" loading="lazy" decoding="async" width="400" height="500">' +
          '<span class="cat__texto"><span class="cat__titulo">' + d.titulo + '</span>' +
          '<span class="cat__cuenta">' + lista.length + (lista.length === 1 ? ' perfume' : ' perfumes') + '</span></span></a>';
      }).join('');
    }

    /* ----- Catálogo ----- */
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
      if (p.tipo === 'Tester') etiquetas += '<span class="etiqueta etiqueta--tester">Tester</span>';
      if (p.ml) etiquetas += '<span class="etiqueta">' + p.ml + ' ml</span>';
      return '<article class="tarjeta">' +
        '<button class="abrir" type="button" data-abrir="' + p.id + '" aria-label="Ver ' + escapar(p.marca + ' ' + p.nombre) + '">' +
          '<span class="foto"><img src="' + rutaImagen(p, cfg) + '" alt="' + escapar(p.marca + ' ' + p.nombre) + '" loading="lazy" decoding="async" width="400" height="500"></span>' +
          '<span class="tarjeta__info"><span class="tarjeta__marca">' + escapar(p.marca) + '</span>' +
            '<span class="tarjeta__nombre">' + escapar(p.nombre) + '</span>' +
            '<span class="etiquetas">' + etiquetas + '</span></span>' +
        '</button>' +
        '<div class="tarjeta__pie">' + precio +
          '<button class="btn-agregar" type="button" data-agregar="' + p.id + '" aria-label="Agregar ' + escapar(p.marca + ' ' + p.nombre) + ' a mi pedido">Agregar</button>' +
        '</div></article>';
    }
    function pintarGrid() {
      var mostrar = resultado.slice(0, estado.visibles);
      $('grid').innerHTML = mostrar.map(tarjeta).join('');
      var total = resultado.length;
      $('resultado').textContent = total === 0 ? '' :
        (total === 1 ? '1 perfume' : total + ' perfumes') + (mostrar.length < total ? ', mostrando ' + mostrar.length : '');
      $('vacio').hidden = total !== 0;
      var restantes = total - mostrar.length;
      var mas = $('btn-mas');
      mas.hidden = restantes <= 0;
      mas.textContent = 'Mostrar más (' + restantes + ' restantes)';
    }
    function marcarSegmento(idGrupo, valor) {
      var botones = $(idGrupo).querySelectorAll('button');
      for (var i = 0; i < botones.length; i++) {
        botones[i].setAttribute('aria-pressed', botones[i].getAttribute('data-v') === valor ? 'true' : 'false');
      }
    }
    function sincronizarControles() {
      marcarSegmento('f-genero', estado.genero);
      marcarSegmento('f-categoria', estado.categoria);
      marcarSegmento('f-tipo', estado.tipo);
      $('f-marca').value = estado.marca;
      $('f-orden').value = estado.orden;
      $('buscar').value = estado.q;
      $('buscar-nav').value = estado.q;
    }
    function aplicarEstado(nuevo, desplazar) {
      estado = nuevo;
      sincronizarControles();
      aplicar(true);
      if (desplazar) irA('catalogo');
    }

    /* ----- Ficha ----- */
    function abrirFicha(id) {
      var p = porId[id];
      if (!p) return;
      ultimoFoco = doc.activeElement;
      var etiquetas = '<span class="etiqueta">' + escapar(ETIQUETA_GENERO[p.genero] || p.genero) + '</span>' +
        '<span class="etiqueta">' + escapar(p.categoria) + '</span>' +
        (p.tipo === 'Tester' ? '<span class="etiqueta etiqueta--tester">Tester</span>' : '<span class="etiqueta">Sellado</span>') +
        (p.ml ? '<span class="etiqueta">' + p.ml + ' ml</span>' : '');
      var precio = p.precio == null ? 'Consultar precio' : formatoPrecio(p.precio, cfg.moneda);
      var nota = p.tipo === 'Tester' && cfg.notaTester ? '<p class="ficha__nota">' + escapar(cfg.notaTester) + '</p>' : '';
      var uno = {}; uno[p.id] = 1;
      var enlace = wa(mensajeWhatsApp(uno, porId, cfg));
      $('ficha-cuerpo').innerHTML =
        '<div class="ficha__foto"><img src="' + rutaImagen(p, cfg) + '" alt="' + escapar(p.marca + ' ' + p.nombre) + '"></div>' +
        '<div class="ficha__datos">' +
          '<p class="ficha__marca">' + escapar(p.marca) + '</p>' +
          '<h2 class="ficha__nombre" id="ficha-nombre">' + escapar(p.nombre) + '</h2>' +
          '<div class="etiquetas">' + etiquetas + '</div>' +
          (p.descripcion ? '<p class="ficha__desc">' + escapar(p.descripcion) + '</p>' : '') + nota +
          '<div class="ficha__precio">' + precio + '</div>' +
          '<div class="ficha__acciones">' +
            '<button class="btn btn--azul" type="button" data-agregar="' + p.id + '" data-cerrar="1">Agregar a mi pedido</button>' +
            '<a class="btn btn-wa" href="' + enlace + '" target="_blank" rel="noopener">Pedir solo este por WhatsApp</a>' +
          '</div></div>';
      $('ficha').showModal();
    }

    /* ----- Pedido ----- */
    function cambiarCantidad(id, delta) {
      var q = (carrito[id] || 0) + delta;
      if (q <= 0) delete carrito[id]; else carrito[id] = Math.min(q, 99);
      guardarPedido();
      pintarPedido();
    }
    function agregar(id) {
      if (!porId[id]) return;
      cambiarCantidad(id, 1);
      avisar(descripcionCorta(porId[id]) + ' agregado a tu pedido');
    }
    function pintarPedido() {
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
          '<div><h3>' + escapar(p.nombre) + '</h3>' +
            '<p class="sub">' + escapar(p.marca) + (p.tipo === 'Tester' ? ', tester' : '') + (p.ml ? ', ' + p.ml + ' ml' : '') + '</p>' +
            '<div class="linea-pedido__fila">' +
              '<div class="cantidad"><button type="button" data-menos="' + id + '" aria-label="Quitar una unidad">−</button><span aria-live="polite">' + q + '</span><button type="button" data-mas="' + id + '" aria-label="Agregar una unidad">+</button></div>' +
              '<strong>' + precio + '</strong></div>' +
            '<button class="quitar" type="button" data-quitar="' + id + '">Quitar</button>' +
          '</div></div>';
      }).join('');
      var aviso = t.sinPrecio ? '<small>' + t.sinPrecio + (t.sinPrecio === 1 ? ' perfume' : ' perfumes') + ' sin precio: lo confirmamos por WhatsApp.</small>' : '';
      aviso += '<small>Puedes pagar en efectivo, SINPE Móvil o transferencia bancaria. Confirmamos el método por WhatsApp.</small>';
      var enlace = wa(mensajeWhatsApp(carrito, porId, cfg));
      pie.innerHTML = '<div class="total"><span>Total</span><strong>' + formatoPrecio(t.total, cfg.moneda) + '</strong></div>' + aviso +
        '<a class="btn btn-wa" href="' + enlace + '" target="_blank" rel="noopener">Enviar pedido por WhatsApp</a>' +
        '<button class="link-vaciar" type="button" id="btn-vaciar">Vaciar pedido</button>';
    }

    /* ----- Secciones de contenido ----- */
    function pintarPasos() {
      $('pasos-lista').innerHTML = (cfg.pasos || []).map(function (s) {
        return '<li><div><h3>' + escapar(s.titulo) + '</h3><p>' + escapar(s.texto) + '</p></div></li>';
      }).join('');
    }
    function pintarFaq() {
      $('faq-lista').innerHTML = (cfg.faq || []).map(function (f) {
        return '<details class="pregunta"><summary>' + escapar(f.p) + '</summary><p>' + escapar(f.r) + '</p></details>';
      }).join('');
    }
    function pintarResenas(lista) {
      var r = resumenResenas(lista);
      var resumen = $('resenas-resumen');
      if (!lista.length) {
        resumen.textContent = 'Pronto verás aquí lo que opinan nuestros clientes.';
      } else if (r.total) {
        resumen.textContent = 'Promedio de ' + r.promedio.toFixed(1).replace('.', ',') + ' de 5 en ' + r.total + (r.total === 1 ? ' reseña.' : ' reseñas.');
      } else {
        resumen.textContent = 'Así se verán las reseñas de tus clientes.';
      }
      $('resenas-pista').innerHTML = lista.map(function (x) {
        return '<article class="resena' + (x.ejemplo ? ' resena--ejemplo' : '') + '">' +
          (x.ejemplo ? '<span class="etiqueta-ejemplo">Ejemplo</span>' : '') +
          estrellasHTML(Number(x.estrellas) || 5) +
          '<p class="resena__texto">' + escapar(x.texto) + '</p>' +
          (x.imagen ? '<img class="resena__imagen" src="' + escapar(x.imagen) + '" alt="Mensaje de ' + escapar(x.nombre) + '" loading="lazy">' : '') +
          '<div class="resena__quien"><b>' + escapar(x.nombre) + '</b><span>' + escapar([x.perfume, x.fecha].filter(Boolean).join(', ')) + '</span></div></article>';
      }).join('');
    }

    /* ----- Eventos ----- */
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
      temporizador = setTimeout(function () { estado.q = valor; $('buscar-nav').value = valor; aplicar(true); }, 120);
    });
    $('form-buscar').addEventListener('submit', function (e) {
      e.preventDefault();
      var nuevo = estadoInicial();
      nuevo.q = $('buscar-nav').value;
      aplicarEstado(nuevo, true);
    });
    $('f-marca').addEventListener('change', function (e) { estado.marca = e.target.value; aplicar(true); });
    $('f-orden').addEventListener('change', function (e) { estado.orden = e.target.value; aplicar(true); });
    $('btn-mas').addEventListener('click', function () { estado.visibles += PAGINA; pintarGrid(); });
    $('btn-filtros').addEventListener('click', function () {
      var f = $('filtros'), abierto = f.classList.toggle('abierto');
      $('btn-filtros').setAttribute('aria-expanded', abierto ? 'true' : 'false');
    });
    $('btn-limpiar').addEventListener('click', function () { aplicarEstado(estadoInicial(), false); });

    function cerrarMenu() {
      $('menu').classList.remove('abierto');
      $('btn-menu').setAttribute('aria-expanded', 'false');
    }
    $('btn-menu').addEventListener('click', function () {
      var abierto = $('menu').classList.toggle('abierto');
      $('btn-menu').setAttribute('aria-expanded', abierto ? 'true' : 'false');
    });

    // Un solo oyente para todo lo que se pinta dinámicamente
    doc.addEventListener('click', function (e) {
      var el = e.target && e.target.closest ? e.target : null;
      if (!el) return;
      var f = el.closest('[data-filtro]');
      if (f) {
        e.preventDefault && e.preventDefault();
        cerrarMenu();
        var v = f.getAttribute('data-filtro');
        aplicarEstado(v === 'todo:1' ? estadoInicial() : atajoAEstado(v), true);
        return;
      }
      if (el.closest('#menu')) cerrarMenu();
      var add = el.closest('[data-agregar]');
      if (add) {
        agregar(add.getAttribute('data-agregar'));
        if (add.getAttribute('data-cerrar')) $('ficha').close();
        return;
      }
      var abrir = el.closest('[data-abrir]');
      if (abrir) { abrirFicha(abrir.getAttribute('data-abrir')); return; }
      var mas = el.closest('[data-mas]'), menos = el.closest('[data-menos]'), quitar = el.closest('[data-quitar]');
      if (mas) cambiarCantidad(mas.getAttribute('data-mas'), 1);
      else if (menos) cambiarCantidad(menos.getAttribute('data-menos'), -1);
      else if (quitar) cambiarCantidad(quitar.getAttribute('data-quitar'), -(carrito[quitar.getAttribute('data-quitar')] || 0));
      else if (el.closest('#btn-vaciar')) { carrito = {}; guardarPedido(); pintarPedido(); }
    });

    function cerrable(id, idBoton) {
      var d = $(id);
      $(idBoton).addEventListener('click', function () { d.close(); });
      d.addEventListener('click', function (e) { if (e.target === d) d.close(); });
      d.addEventListener('close', function () { if (ultimoFoco && ultimoFoco.focus) ultimoFoco.focus(); });
    }
    cerrable('ficha', 'ficha-cerrar');
    cerrable('carrito', 'carrito-cerrar');
    $('btn-carrito').addEventListener('click', function () { ultimoFoco = $('btn-carrito'); $('carrito').showModal(); });

    // Reseñas: flechas
    function desplazarResenas(dir) {
      var pista = $('resenas-pista');
      if (pista.scrollBy) pista.scrollBy({ left: dir * 372, behavior: 'smooth' });
    }
    $('resenas-prev').addEventListener('click', function () { desplazarResenas(-1); });
    $('resenas-next').addEventListener('click', function () { desplazarResenas(1); });

    // Sombra de la barra al bajar y tecla Escape
    if (root.addEventListener) {
      root.addEventListener('scroll', function () {
        var nav = $('navbar');
        if (nav) nav.classList.toggle('con-sombra', (root.scrollY || 0) > 8);
      }, { passive: true });
      root.addEventListener('keydown', function (e) { if (e.key === 'Escape') cerrarMenu(); });
    }

    // Si las fotos no cargan, explica qué ruta está buscando la página
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

    configurarContactos();
    return cargar();
  }

  if (root.document && root.document.getElementById && root.document.getElementById('grid')) {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();
  }
  root.__nix27 = { iniciar: iniciar };
})(typeof window !== 'undefined' ? window : globalThis);