/* nix27_perfumes: lógica de la página.
   Lee data/catalogo.json (perfumes y precios), data/fichas.json (notas y acordes) y data/resenas.json.
   Los textos y datos de contacto se cambian en js/config.js.
   Sirve para las dos páginas: index.html (inicio y catálogo) y perfume.html (cada perfume). */
(function (root) {
  'use strict';

  var PAGINA = 48;
  var CLAVE_PEDIDO = 'nix27_pedido_v1';
  var CLAVE_FAVORITOS = 'nix27_favoritos_v1';
  var ETIQUETA_GENERO = { Femenino: 'Mujer', Masculino: 'Hombre', Unisex: 'Unisex' };
  var DIAS_NUEVO = 30; // se cambia en js/config.js (diasNuevo)

  /* ---------- Funciones puras (se prueban sin navegador) ---------- */

  function normalizar(texto) {
    return String(texto == null ? '' : texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }
  function esSet(p) { return p.tipo === 'Set'; }
  // Cuidado corporal: body mist, cremas, body spray... (no se mezclan con los perfumes salvo que se pidan)
  function esCorporal(p) { return p.tipo === 'Corporal'; }
  // Combos armados por la tienda (regalos): varios productos del catálogo a un precio un poco menor
  function esCombo(p) { return p.tipo === 'Combo'; }
  function noCorporal(p) { return !esCorporal(p) && !esCombo(p); }
  // Los sets se muestran aunque todavía no tengan foto (sale una tarjeta de regalo)
  function esVisible(p) { return !!p && p.activo !== false && (!!p.imagen || esSet(p)); }
  function coincideGenero(p, genero) {
    if (genero === 'mujer') return p.genero === 'Femenino' || p.genero === 'Unisex';
    if (genero === 'hombre') return p.genero === 'Masculino' || p.genero === 'Unisex';
    return true;
  }
  function enOferta(p) { return p.precio != null && p.precioAntes != null && p.precioAntes > p.precio; }
  // "Nuevo" = recién agregado a la página: sale como nuevo los días indicados en config.js desde "nuevoDesde"
  function esNuevo(p, ahora) {
    if (p.nuevo === true) return true;
    if (!p.nuevoDesde) return false;
    var t = Date.parse(p.nuevoDesde + 'T00:00:00');
    return !isNaN(t) && ((ahora || Date.now()) - t) < DIAS_NUEVO * 86400000;
  }
  function descuento(p) { return enOferta(p) ? Math.round((1 - p.precio / p.precioAntes) * 100) : 0; }
  function estadoInicial() {
    return { q: '', genero: 'todos', categoria: 'todas', tipo: 'todos', marca: 'todas', especial: 'todos', orden: 'marca', visibles: PAGINA };
  }
  // Ficha olfativa: un set puede usar la del perfume que trae ("ficha": "Lattafa|Yara Tous")
  function claveFicha(p) { return p.ficha || (p.marca + '|' + p.nombre); }
  // Mismo perfume en distintas presentaciones (sellado, tester, tamaños)
  function claveGrupo(p) { return p.marca + '|' + p.nombre; }
  function slug(p) {
    var base = [p.marca, p.nombre, p.tipo === 'Tester' ? 'tester' : '', p.ml ? p.ml + 'ml' : ''].join(' ');
    return normalizar(base).replace(/&/g, ' y ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function textoFicha(f) {
    if (!f) return '';
    var n = f.notas || {};
    return [].concat(n.salida || [], n.corazon || [], n.fondo || [], n.generales || [], (f.acordes || []).map(function (a) { return a[0]; })).join(' ');
  }
  function filtrar(items, e, fichas) {
    var terminos = normalizar(e.q).split(/\s+/).filter(Boolean);
    return items.filter(function (p) {
      if (!coincideGenero(p, e.genero)) return false;
      if (e.categoria !== 'todas' && p.categoria !== e.categoria) return false;
      if (e.tipo !== 'todos' && p.tipo !== e.tipo) return false;
      if (e.tipo === 'todos' && (esCorporal(p) || esCombo(p)) && !terminos.length && e.marca === 'todas') return false;
      if (e.marca !== 'todas' && p.marca !== e.marca) return false;
      if (e.especial === 'oferta' && !enOferta(p)) return false;
      if (e.especial === 'nuevo' && !esNuevo(p)) return false;
      if (terminos.length) {
        var pajar = normalizar([p.marca, p.nombre, p.categoria, p.tipo, p.linea || '', p._inspirado || '', esCorporal(p) ? 'cuidado corporal' : '', esCombo(p) ? 'combo regalo ' + (p.contenido || []).join(' ') : '', esSet(p) ? 'set estuche regalo ' + (p.contenido || []).join(' ') : '', textoFicha(fichas && fichas[claveFicha(p)])].join(' '));
        for (var i = 0; i < terminos.length; i++) if (pajar.indexOf(terminos[i]) === -1) return false;
      }
      return true;
    });
  }
  // En la búsqueda, primero lo que coincide por nombre o marca y después lo que coincide solo por notas
  function relevancia(items, q) {
    var t = normalizar(q).trim();
    if (!t) return items;
    var puntos = function (p) {
      var nombre = normalizar(p.marca + ' ' + p.nombre);
      if (normalizar(p.nombre).indexOf(t) === 0) return 0;
      if (nombre.indexOf(t) !== -1) return 1;
      return 2;
    };
    return items.map(function (p, i) { return { p: p, s: puntos(p), i: i }; })
      .sort(function (a, b) { return a.s - b.s || a.i - b.i; }).map(function (x) { return x.p; });
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
    return p.marca + ' ' + p.nombre + (p.tipo === 'Tester' ? ' (Tester)' : '') + (p.ml && !esSet(p) ? ' ' + p.ml + ' ml' : '');
  }
  function nombreTipo(p) { return p.tipo === 'Tester' ? 'Tester' : esSet(p) ? 'Set' : esCombo(p) ? 'Combo' : esCorporal(p) ? (p.linea || 'Cuidado corporal') : 'Sellado'; }
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
    if (k === 'genero' || k === 'categoria' || k === 'tipo' || k === 'marca' || k === 'q' || k === 'especial') e[k] = v;
    return e;
  }
  // Perfumes parecidos: misma marca, acordes en común, mismo género y categoría. Uno por perfume (sin repetir tester y sellado).
  function relacionados(p, todos, fichas, cantidad) {
    var fp = fichas[claveFicha(p)] || {};
    var acordesP = (fp.acordes || []).slice(0, 4).map(function (a) { return a[0]; });
    var mejores = {};
    todos.forEach(function (x) {
      if (claveGrupo(x) === claveGrupo(p)) return;
      var fx = fichas[claveFicha(x)] || {};
      var comunes = (fx.acordes || []).slice(0, 4).filter(function (a) { return acordesP.indexOf(a[0]) !== -1; }).length;
      var s = (x.marca === p.marca ? 4 : 0) + (esSet(x) === esSet(p) ? 0.5 : -1.5) + (esCorporal(x) === esCorporal(p) ? (esCorporal(p) && x.linea === p.linea ? 2 : 0) : -6) + (esCombo(x) === esCombo(p) ? 0 : -6) + comunes * 1.5 + (x.genero === p.genero ? 1.5 : x.genero === 'Unisex' ? 0.7 : -2) + (x.categoria === p.categoria ? 0.5 : 0);
      var k = claveGrupo(x);
      if (!mejores[k] || mejores[k].s < s || (mejores[k].s === s && x.tipo === 'Sellado')) mejores[k] = { x: x, s: s };
    });
    return Object.keys(mejores).map(function (k) { return mejores[k]; })
      .sort(function (a, b) { return b.s - a.s || comparar(a.x.nombre, b.x.nombre); })
      .slice(0, cantidad).map(function (o) { return o.x; });
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

  /* ---------- Colores de acordes e íconos de notas ---------- */

  var COLOR_ACORDE = {
    'cítrico': '#F6E04B', 'amaderado': '#8E6A48', 'aromático': '#3FA593', 'fresco especiado': '#A7D86B', 'cálido especiado': '#C7462E',
    'suave especiado': '#E0A36E', 'dulce': '#EE6A7B', 'avainillado': '#FDF5B5', 'floral': '#F3A6C8', 'floral blanco': '#F4EFEA',
    'floral amarillo': '#F7D54A', 'rosa': '#F2537A', 'frutal': '#F57E3A', 'tropical': '#F9B233', 'atalcado': '#EADBD0',
    'almizclado': '#D7CBDA', 'ámbar': '#C27A2C', 'acuático': '#4FC3E8', 'marino': '#3D8CC4', 'ozónico': '#B9E4F2',
    'verde': '#3BAA4A', 'cuero': '#6B3E26', 'tabaco': '#9C6B3A', 'oud': '#4E3324', 'terroso': '#7C6D5F', 'balsámico': '#B07E4E',
    'lavanda': '#9C7FC0', 'iris': '#B9A3D3', 'violeta': '#7B4FA6', 'atabacado': '#9C6B3A', 'coco': '#F3EBDD', 'café': '#5B3A29',
    'cacao': '#6E4632', 'miel': '#F2B134', 'lactónico': '#FBF6EA', 'almendra': '#E8C9A1', 'nuez': '#B98B5E', 'caramelo': '#D98A3A',
    'herbal': '#6FA35A', 'musgoso': '#5C7A3A', 'ahumado': '#7E7E7E', 'resinoso': '#B5651D', 'animal': '#8D6E63', 'mineral': '#9EB1BD',
    'metálico': '#B8C2CC', 'salado': '#CFE6EE', 'alcohólico': '#A33B4A', 'cereza': '#B2223C', 'pachulí': '#6A5B3B', 'incienso': '#A99A88',
    'chocolate': '#6E4632', 'gourmand': '#C98A5A', 'ron': '#8C4A2F', 'tuberosa': '#F7F1E4', 'cremoso': '#F6EBD6', 'anisado': '#CDE7B0',
    'menta': '#7FD6B4', 'azafrán': '#E06A2B', 'canela': '#B5572C', 'vino': '#7B1F3A', 'whisky': '#B07028', 'agrio': '#E9EE8B'
  };
  function colorAcorde(nombre) {
    var c = COLOR_ACORDE[normalizarAcorde(nombre)];
    if (c) return c;
    var h = 0, s = normalizar(nombre);
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
    return 'hsl(' + h + ',45%,62%)';
  }
  function normalizarAcorde(n) { return String(n || '').toLowerCase().trim(); }
  function textoSobre(color) {
    var m = /^#?([0-9a-f]{6})$/i.exec(color);
    if (!m) return '#1b1b1b';
    var n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    var lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.6 ? '#1b1b1b' : '#ffffff';
  }

  // Cada nota se dibuja con un ícono según su familia. Se reconoce por palabras clave.
  var FAMILIAS_NOTA = [
    ['coco', /\bcoco\b/],
    ['vainilla', /vainilla|vanill/],
    ['cafe', /caf[eé]|espresso|moca|moka/],
    ['cacao', /cacao|chocolate|gianduja/],
    ['miel', /miel/],
    ['dulce', /caramel|az[uú]car|malvavisco|marshmallow|pralin|algod[oó]n de az|toffee|chicle|merengue|dulce|bomb[oó]n|gofre|galleta|pastel|nougat|turr[oó]n|regaliz|cookie|bubble|panettone|gomita|gourmand/],
    ['lacteo', /leche|crema|nata|mantequilla|l[aá]ct|yogur/],
    ['licor', /\bron\b|whisk|co[nñ]ac|bourbon|vino|champ[aá]n|licor|ginebra|vodka|tequila|mojito|c[oó]ctel|cocktail|absenta/],
    ['menta', /menta|hierbabuena/],
    ['te', /\bt[eé]\b|\bmate\b/],
    ['cuero', /cuero|gamuza|\bante\b/],
    ['tabaco', /tabaco/],
    ['oud', /\boud\b|agar/],
    ['incienso', /incienso|humo|ahumad|mirra|copal|ol[ií]bano/],
    ['ambar', /[aá]mbar|benju[ií]|l[aá]bdano|l[aá]dano|labdanum|elem[ií]|opop[oó]naco|b[aá]lsamo|styrax|estoraque|resina|tolu|ambrox|amberwood|orientales/],
    ['almizcle', /almizcle|musk|ambreta|ambrette|cashmeran|cachemir|habanolide|iso e super|aldeh[ií]do/],
    ['especia', /pimienta|pimiento|cardamomo|canela|nuez moscada|clavo|jengibre|azafr[aá]n|comino|an[ií]s|especia|cilantro|coriandro|enebro|baya rosa|chile|cayena|wasabi/],
    ['tonka', /tonka|cumarina|coumarina|almendra|avellana|pistacho|nuez|casta[nñ]a|cacahuate|\bhaba\b/],
    ['lavanda', /lavanda|lavand[ií]n|salvia|romero|albahaca|tomillo|artemisa|estrag[oó]n|mejorana|hierbas|arom[aá]tic|or[eé]gano|hinojo|davana|santolina|mirto/],
    ['flor-blanca', /jazm[ií]n|azahar|tuberosa|nardo|gardenia|magnolia|ylang|frangipani|naranjo|lirio del valle|muguet|lirio|madreselva|loto|orqu[ií]dea|flor blanca|flores blancas|tiar[eé]|champaca|camelia|hedione|nen[uú]far/],
    ['iris', /iris|violeta|orris|heliotropo|talco|polvo/],
    ['rosa', /\brosa\b|rosas|\brose\b|petalia/],
    ['acuatico', /\bmarin|acu[aá]tic|\bagua\b|\bsal\b|salad|alga|oz[oó]n|calone|oc[eé]ano|\bmar\b|lluvia|brisa|helad|hielo|\baire\b/],
    ['mineral', /mineral|met[aá]lic|piedra|pedernal|grafito|p[oó]lvora|masilla/],
    ['citrico', /lim[oó]n|bergamota|mandarina|naranja|pomelo|toronja|\blima\b|yuzu|c[ií]tric|clementina|kumquat|cidra|petitgrain|neroli|limoncillo|verbena|calamansi|chinotto/],
    ['fruta-verde', /manzana|\bpera\b|peras|mel[oó]n|kiwi|\buva|membrillo|nashi/],
    ['fruta-tropical', /pi[nñ]a|mango|maracuy[aá]|pasi[oó]n|papaya|guayaba|pl[aá]tano|banano|lichi|lychee|tropical|ex[oó]ticas|nectarina|melocot[oó]n|durazno|albaricoque|damasco|osmanthus|maninka/],
    ['fruta-roja', /cereza|frambuesa|fresa|grosella|ciruela|frutos rojos|frutos del bosque|ar[aá]ndano|\bmora\b|granada|sand[ií]a|cassis|casis|frutal|fruta|higo|d[aá]til|bayas/],
    ['raiz', /vetiver|pachul[ií]|patchouli|musgo de roble|ra[ií]z|tierra|terros|turba|nagarmotha|cipriol/],
    ['verde', /verde|hoja|hojas|galb|hierba|c[eé]sped|bamb[uú]|higuera|tallo|ruibarbo|pepino|matcha|helecho|musgo|ortiga|hiedra|olivo/],
    ['madera', /madera|amaderad|cedro|s[aá]ndalo|guayaco|abedul|pino|cipr[eé]s|[eé]bano|caoba|teca|akigalawood|papiro|roble|corteza|sequoia|wood/],
    ['flor', /flor|peon[ií]a|fresia|freesia|geranio|clavel|mimosa|hibisco|amapola|dalia|n[eé]ctar|p[eé]talo|osmanto|ciclamen|hortensia|jacinto|tulip|acacia|lila|azalea|cerezo|sakura|narciso|siempreviva|mahonial|reseda|campanilla/]
  ];
  var ICONOS = {
    citrico: ['#FFF4C2', '<circle cx="20" cy="20" r="14" fill="#F6C91C"/><circle cx="20" cy="20" r="11.2" fill="#FFF0A0"/><g stroke="#F6C91C" stroke-width="1.6"><path d="M20 9v22M9 20h22M12.2 12.2l15.6 15.6M27.8 12.2L12.2 27.8"/></g><circle cx="20" cy="20" r="2" fill="#F6C91C"/>'],
    'fruta-verde': ['#E9F6DC', '<path d="M20 13c-4-3-11-1-11 7 0 7 5 13 8 13 2 0 2-1 3-1s1 1 3 1c3 0 8-6 8-13 0-8-7-10-11-7z" fill="#8CC63F"/><path d="M20 13c0-3 1-5 3-6" stroke="#6B4A2B" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M21 10c3-3 7-2 8 0-3 2-6 2-8 0z" fill="#3E9A3A"/>'],
    'fruta-tropical': ['#FFEFD6', '<ellipse cx="20" cy="24" rx="9" ry="11" fill="#F9A825"/><path d="M14 18l12 12M26 18L14 30M13 24h14" stroke="#E08A00" stroke-width="1.2"/><path d="M20 13c-3-5-7-6-9-5 3 1 6 3 9 5zM20 13c3-5 7-6 9-5-3 1-6 3-9 5zM20 13c0-5 1-8 0-10-1 2 0 5 0 10z" fill="#43A047"/>'],
    'fruta-roja': ['#FDE4E6', '<path d="M13 8c3 5 4 9 3 14M24 8c-2 4-2 8 0 13" stroke="#5D8C2A" stroke-width="1.6" fill="none"/><circle cx="15" cy="25" r="7" fill="#D32F4C"/><circle cx="25" cy="25" r="7" fill="#B71C3A"/><circle cx="13" cy="23" r="1.6" fill="#fff" opacity=".6"/><circle cx="23" cy="23" r="1.6" fill="#fff" opacity=".6"/><path d="M13 8c4-2 8-1 11 0" stroke="#5D8C2A" stroke-width="1.6" fill="none"/>'],
    rosa: ['#FDE3EA', '<circle cx="20" cy="18" r="10" fill="#E5396B"/><path d="M20 12c-4 0-6 3-5 6 1 2 4 3 6 1 1-1 1-3-1-3" stroke="#A3123F" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M20 28v8" stroke="#3E8E41" stroke-width="2"/><path d="M20 32c-4-2-7-1-8 1 3 1 6 1 8-1z" fill="#3E8E41"/>'],
    'flor-blanca': ['#F3F1EC', '<g fill="#FFFFFF" stroke="#D8D2C4" stroke-width="1"><ellipse cx="20" cy="11" rx="5" ry="7"/><ellipse cx="28.5" cy="17.5" rx="5" ry="7" transform="rotate(72 28.5 17.5)"/><ellipse cx="25.3" cy="27.5" rx="5" ry="7" transform="rotate(144 25.3 27.5)"/><ellipse cx="14.7" cy="27.5" rx="5" ry="7" transform="rotate(216 14.7 27.5)"/><ellipse cx="11.5" cy="17.5" rx="5" ry="7" transform="rotate(288 11.5 17.5)"/></g><circle cx="20" cy="20" r="3.4" fill="#F5C842"/>'],
    flor: ['#FCE7F1', '<g fill="#F48FB1"><ellipse cx="20" cy="11" rx="5" ry="7"/><ellipse cx="28.5" cy="17.5" rx="5" ry="7" transform="rotate(72 28.5 17.5)"/><ellipse cx="25.3" cy="27.5" rx="5" ry="7" transform="rotate(144 25.3 27.5)"/><ellipse cx="14.7" cy="27.5" rx="5" ry="7" transform="rotate(216 14.7 27.5)"/><ellipse cx="11.5" cy="17.5" rx="5" ry="7" transform="rotate(288 11.5 17.5)"/></g><circle cx="20" cy="20" r="3.6" fill="#FFD54F"/>'],
    iris: ['#EEE7F7', '<path d="M20 6c-3 5-3 9 0 12 3-3 3-7 0-12z" fill="#8E6CC4"/><path d="M20 18c-6-3-11-1-12 3 5 1 9 0 12-3zM20 18c6-3 11-1 12 3-5 1-9 0-12-3z" fill="#B39DDB"/><path d="M20 18c-2 4-2 7 0 10 2-3 2-6 0-10z" fill="#7E57C2"/><path d="M20 28v8" stroke="#43A047" stroke-width="2"/>'],
    lavanda: ['#EEE8F8', '<path d="M14 36c2-8 3-16 3-24M20 36V10M26 36c-2-8-3-16-3-24" stroke="#5E8C3A" stroke-width="1.4" fill="none"/><g fill="#8E6CC4"><ellipse cx="17" cy="9" rx="2" ry="3"/><ellipse cx="17" cy="15" rx="2.3" ry="3"/><ellipse cx="17" cy="21" rx="2.3" ry="3"/><ellipse cx="20" cy="7" rx="2" ry="3"/><ellipse cx="20" cy="13" rx="2.3" ry="3"/><ellipse cx="20" cy="19" rx="2.3" ry="3"/><ellipse cx="23" cy="9" rx="2" ry="3"/><ellipse cx="23" cy="15" rx="2.3" ry="3"/><ellipse cx="23" cy="21" rx="2.3" ry="3"/></g>'],
    verde: ['#E3F4E1', '<path d="M8 32C8 16 18 8 33 8c0 15-8 25-23 25" fill="#4CAF50"/><path d="M8 32C14 24 20 18 28 13" stroke="#2E7D32" stroke-width="1.8" fill="none" stroke-linecap="round"/>'],
    menta: ['#DFF6EE', '<path d="M20 34c-9-4-12-13-8-22 9 2 12 12 8 22z" fill="#43C59E"/><path d="M20 34c9-4 12-13 8-22-9 2-12 12-8 22z" fill="#2FA884"/><path d="M20 34V14" stroke="#1C7A5E" stroke-width="1.4"/>'],
    te: ['#EAF3DE', '<path d="M9 16h20v6a10 10 0 0 1-20 0z" fill="#A1887F"/><path d="M29 18h2a4 4 0 0 1 0 8h-3" stroke="#A1887F" stroke-width="2.2" fill="none"/><path d="M15 6c-2 3 2 4 0 7M21 6c-2 3 2 4 0 7" stroke="#9E9E9E" stroke-width="1.4" fill="none" stroke-linecap="round"/><path d="M7 34h24" stroke="#8D6E63" stroke-width="2" stroke-linecap="round"/>'],
    vainilla: ['#FBF5DC', '<path d="M9 33C17 25 25 15 31 6" stroke="#4E342E" stroke-width="3.2" fill="none" stroke-linecap="round"/><path d="M12 33C19 26 26 17 31 9" stroke="#6D4C41" stroke-width="1.6" fill="none" stroke-linecap="round"/><g fill="#FFF59D" stroke="#E6C84F" stroke-width=".8"><ellipse cx="13" cy="10" rx="3.2" ry="5"/><ellipse cx="18.5" cy="12.5" rx="3.2" ry="5" transform="rotate(70 18.5 12.5)"/><ellipse cx="9" cy="15" rx="3.2" ry="5" transform="rotate(-70 9 15)"/></g><circle cx="13" cy="14" r="1.8" fill="#F9A825"/>'],
    dulce: ['#FCE4EC', '<path d="M6 14l7 6-7 6zM34 14l-7 6 7 6z" fill="#F48FB1"/><circle cx="20" cy="20" r="8.5" fill="#EC407A"/><path d="M14 16c3 2 9 2 12 8M13 22c4 0 8 2 10 5" stroke="#fff" stroke-width="1.6" fill="none" opacity=".75"/>'],
    lacteo: ['#F5F1E8', '<path d="M20 6c-5 8-9 13-9 18a9 9 0 0 0 18 0c0-5-4-10-9-18z" fill="#FFFFFF" stroke="#D7CFC0" stroke-width="1.2"/><path d="M15 25a5 5 0 0 0 4 5" stroke="#E7DFCE" stroke-width="1.8" fill="none" stroke-linecap="round"/>'],
    miel: ['#FFF3D1', '<path d="M20 7l9 5v10l-9 5-9-5V12z" fill="#F2B134"/><path d="M20 12l4.5 2.5v5L20 22l-4.5-2.5v-5z" fill="#FFD36B"/><path d="M14 27c0 3 1 6 2 6s2-3 2-6" fill="#E59E10"/>'],
    cafe: ['#EFE5DE', '<ellipse cx="20" cy="20" rx="10" ry="13" fill="#6D4C41" transform="rotate(25 20 20)"/><path d="M15 9c6 5 4 17 10 22" stroke="#3E2723" stroke-width="2" fill="none" stroke-linecap="round"/>'],
    cacao: ['#EFE3DB', '<rect x="9" y="9" width="22" height="22" rx="3" fill="#6E4632"/><g stroke="#4E2E1F" stroke-width="1.4"><path d="M16.3 9v22M23.6 9v22M9 16.3h22M9 23.6h22"/></g><path d="M23 9l8 8V9z" fill="#C0C0C0"/>'],
    tonka: ['#F3E8DB', '<ellipse cx="15" cy="20" rx="5" ry="10" fill="#4E342E" transform="rotate(-20 15 20)"/><ellipse cx="25" cy="21" rx="5.5" ry="9" fill="#C69C6D" transform="rotate(20 25 21)"/><path d="M23 14c3 4 3 9 1 13" stroke="#A47A4E" stroke-width="1.2" fill="none"/>'],
    especia: ['#FBE7DC', '<g fill="#8D3B1F"><path d="M20 20L20 7l3 10zM20 20l12.4-4-10.2 6zM20 20l7.6 10.5-8.3-7.5zM20 20l-7.6 10.5 4.5-10.1zM20 20L7.6 16l10.6 2z"/></g><circle cx="20" cy="20" r="2.6" fill="#D9762B"/><circle cx="31" cy="30" r="2.6" fill="#3E2723"/><circle cx="27" cy="34" r="2.2" fill="#5D4037"/>'],
    madera: ['#F1E6DA', '<rect x="6" y="13" width="24" height="15" rx="2" fill="#A1764B"/><ellipse cx="30" cy="20.5" rx="5" ry="7.5" fill="#D7B48A"/><ellipse cx="30" cy="20.5" rx="3" ry="4.6" fill="none" stroke="#A1764B" stroke-width="1"/><circle cx="30" cy="20.5" r="1" fill="#A1764B"/><path d="M9 17h14M11 22h12M8 25h9" stroke="#7D5530" stroke-width="1" stroke-linecap="round"/>'],
    raiz: ['#ECE6D8', '<path d="M20 6v10M20 16c-6 4-8 10-10 18M20 16c0 7-1 12-3 18M20 16c2 6 4 12 9 18M20 16c5 2 9 7 11 12" stroke="#8C6A3E" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M20 6c-4-1-7 1-8 3 4 1 6 0 8-3zM20 6c4-1 7 1 8 3-4 1-6 0-8-3z" fill="#689F38"/>'],
    oud: ['#E8DED6', '<path d="M8 28l8-14 5 3-8 14zM18 30l6-17 5 2-6 17z" fill="#4E3324"/><path d="M27 10c-2-2 1-4-1-6M31 12c-2-2 1-4-1-6" stroke="#9E9E9E" stroke-width="1.3" fill="none" stroke-linecap="round"/>'],
    incienso: ['#EEEAE6', '<path d="M18 34h4l-1-12h-2z" fill="#8D6E63"/><path d="M20 22c-4-3 3-6-1-9s3-5 0-8" stroke="#9E9E9E" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M24 20c-2-2 2-4 0-6" stroke="#BDBDBD" stroke-width="1.4" fill="none" stroke-linecap="round"/>'],
    ambar: ['#FBEBD3', '<path d="M20 6l11 9-11 19L9 15z" fill="#E09A3A"/><path d="M20 6l-11 9h22zM20 34l-4-19h8z" fill="#F5C26B" opacity=".75"/><path d="M14 13l3-3" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>'],
    almizcle: ['#F2EEF5', '<path d="M11 27a6 6 0 0 1 1-12 8 8 0 0 1 15-1 6.5 6.5 0 0 1 2 13z" fill="#FFFFFF" stroke="#CFC6DA" stroke-width="1.3"/><circle cx="16" cy="31" r="1.3" fill="#CFC6DA"/><circle cx="21" cy="33" r="1.3" fill="#CFC6DA"/><circle cx="26" cy="31" r="1.3" fill="#CFC6DA"/>'],
    cuero: ['#EFE2D8', '<path d="M9 10c4 1 6-1 11-1s7 2 11 1c-1 5 1 8 1 12 0 6-4 9-4 9H12s-4-3-4-9c0-4 2-7 1-12z" fill="#7B4A2D"/><path d="M12 14c3 6 3 12 1 16M28 14c-3 6-3 12-1 16" stroke="#C49A6C" stroke-width="1.2" stroke-dasharray="2 2" fill="none"/>'],
    tabaco: ['#F2E7DA', '<path d="M20 4c9 6 11 17 0 32C9 21 11 10 20 4z" fill="#A0703F"/><path d="M20 6v28M20 14l-5-4M20 14l5-4M20 21l-6-4M20 21l6-4M20 28l-5-3M20 28l5-3" stroke="#6D4521" stroke-width="1.2" fill="none" stroke-linecap="round"/>'],
    acuatico: ['#E1F3FB', '<path d="M5 16c4-4 7-4 10 0s6 4 10 0 7-4 10 0" stroke="#29A9E1" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M5 23c4-4 7-4 10 0s6 4 10 0 7-4 10 0" stroke="#1E88C8" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M5 30c4-4 7-4 10 0s6 4 10 0 7-4 10 0" stroke="#1565C0" stroke-width="2.6" fill="none" stroke-linecap="round"/>'],
    mineral: ['#E9EEF2', '<path d="M12 12l8-6 8 6-2 18h-12z" fill="#B0BEC5"/><path d="M12 12h16M20 6l-4 6 4 18 4-18z" stroke="#78909C" stroke-width="1.1" fill="none"/>'],
    licor: ['#F6E3E3', '<path d="M12 9h16l-2 13a6 6 0 0 1-12 0z" fill="#fff" stroke="#BDBDBD" stroke-width="1.2"/><path d="M13 15h14l-1 7a6 6 0 0 1-12 0z" fill="#B5652B"/><path d="M20 28v6M15 34h10" stroke="#9E9E9E" stroke-width="1.6" stroke-linecap="round"/>'],
    coco: ['#F3EDE4', '<circle cx="20" cy="22" r="12" fill="#6D4C41"/><circle cx="20" cy="22" r="9" fill="#FFFDF7"/><path d="M8 22h24" stroke="#6D4C41" stroke-width="0"/><circle cx="16" cy="12.5" r="1.2" fill="#3E2723"/><circle cx="20" cy="11" r="1.2" fill="#3E2723"/>'],
    defecto: ['#EEF1F6', '<path d="M20 6c-5 8-9 13-9 18a9 9 0 0 0 18 0c0-5-4-10-9-18z" fill="#CD9A33"/><path d="M16 24a4 4 0 0 0 3 4" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round" opacity=".7"/>']
  };
  function familiaNota(nombre) {
    var n = normalizar(nombre);
    for (var i = 0; i < FAMILIAS_NOTA.length; i++) {
      if (FAMILIAS_NOTA[i][1].test(n)) return FAMILIAS_NOTA[i][0];
    }
    return 'defecto';
  }
  function iconoNota(nombre) {
    var ico = ICONOS[familiaNota(nombre)] || ICONOS.defecto;
    return '<span class="nota__ico" style="--n-bg:' + ico[0] + '"><svg viewBox="0 0 40 40" aria-hidden="true">' + ico[1] + '</svg></span>';
  }

  // Familias olfativas aproximadas a partir de la descripción (para el test)
  var FAMILIAS = {
    fresco: /fresc|citric|acuat|marin|limon|bergamot|verde|menta|lavand|aromatic|limpi|ocean|brisa|agua|azul/,
    dulce: /dulce|vainill|gourmand|caramel|chocolat|azucar|algodon|pralin|cafe|miel|golosin|malvavisco|tonka|cereza|pistach|coco|frutal|tropical/,
    floral: /floral|flor|rosa|jazmin|peoni|nardo|azahar|iris|violeta|orquide/,
    intenso: /amader|madera|oud|cuero|tabaco|ambar|especi|intens|oscur|ahumad|cedro|incienso|almizcl|nocturn|seductor|calid/
  };
  function familiasDe(p) {
    var t = normalizar((p.descripcion || '') + ' ' + p.nombre);
    return Object.keys(FAMILIAS).filter(function (k) { return FAMILIAS[k].test(t); });
  }
  // r = { para: 'mujer'|'hombre'|'todos', momento: 'dia'|'noche'|'siempre', estilo: 'fresco'|'dulce'|'floral'|'intenso', tope: número o 0 }
  function puntajeTest(p, r) {
    var fam = familiasDe(p);
    var s = 0;
    if (fam.indexOf(r.estilo) !== -1) s += 4 - (fam.length - 1) * 0.5;
    if (r.momento === 'dia' && (fam.indexOf('fresco') !== -1 || fam.indexOf('floral') !== -1)) s += 1.5;
    if (r.momento === 'noche' && (fam.indexOf('intenso') !== -1 || fam.indexOf('dulce') !== -1)) s += 1.5;
    if (r.para !== 'todos') s += p.genero === 'Unisex' ? 0.5 : 1;
    if (p.tipo === 'Sellado') s += 0.6;
    return s;
  }
  function recomendar(items, r, cantidad) {
    var base = items.filter(function (p) {
      if (esSet(p) || esCorporal(p) || esCombo(p) || !p.imagen || p.precio == null) return false;
      return coincideGenero(p, r.para === 'todos' ? 'todos' : r.para);
    });
    var conTope = r.tope ? base.filter(function (p) { return p.precio <= r.tope && (!r.piso || p.precio > r.piso); }) : base;
    if (conTope.length >= cantidad) base = conTope;
    var vistos = {};
    return base.map(function (p) { return { p: p, s: puntajeTest(p, r) }; })
      .sort(function (a, b) { return b.s - a.s || ((a.p.id * 7919) % 97) - ((b.p.id * 7919) % 97); })
      .filter(function (x) { var k = claveGrupo(x.p); if (vistos[k]) return false; vistos[k] = 1; return true; })
      .slice(0, cantidad).map(function (x) { return x.p; });
  }

  var puro = {
    normalizar: normalizar, esVisible: esVisible, estadoInicial: estadoInicial, filtrar: filtrar, ordenar: ordenar,
    formatoPrecio: formatoPrecio, rutaImagen: rutaImagen, escapar: escapar, totalPedido: totalPedido,
    mensajeWhatsApp: mensajeWhatsApp, enlaceWhatsApp: enlaceWhatsApp, elegirAlAzar: elegirAlAzar,
    marcasPorCantidad: marcasPorCantidad, atajoAEstado: atajoAEstado, resumenResenas: resumenResenas, estrellasHTML: estrellasHTML,
    slug: slug, esNuevo: esNuevo, claveFicha: claveFicha, claveGrupo: claveGrupo, esSet: esSet, esCorporal: esCorporal, esCombo: esCombo, enOferta: enOferta, descuento: descuento, relacionados: relacionados,
    familiaNota: familiaNota, familiasDe: familiasDe, recomendar: recomendar, colorAcorde: colorAcorde, relevancia: relevancia
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

    if (cfg.diasNuevo > 0) DIAS_NUEVO = Number(cfg.diasNuevo);
    var $ = function (id) { return doc.getElementById(id); };
    var esInicio = !!$('grid');
    var esPerfume = !!$('pagina-perfume');
    var todos = [], porId = {}, porSlug = {}, fichas = {}, inspirados = {}, resultado = [];
    var favoritos = cargarFavoritos();
    var estado = estadoInicial();
    var carrito = cargarPedido();

    function cargarPedido() {
      try {
        var crudo = root.localStorage && root.localStorage.getItem(CLAVE_PEDIDO);
        var obj = crudo ? JSON.parse(crudo) : {};
        return obj && typeof obj === 'object' ? obj : {};
      } catch (e) { return {}; }
    }
    function cargarFavoritos() {
      try {
        var crudo = root.localStorage && root.localStorage.getItem(CLAVE_FAVORITOS);
        var arr = crudo ? JSON.parse(crudo) : [];
        return Array.isArray(arr) ? arr.map(String) : [];
      } catch (e) { return []; }
    }
    function guardarFavoritos() {
      try { root.localStorage && root.localStorage.setItem(CLAVE_FAVORITOS, JSON.stringify(favoritos)); } catch (e) { /* sin guardado */ }
    }
    function esFavorito(id) { return favoritos.indexOf(String(id)) !== -1; }
    function alternarFavorito(id) {
      id = String(id);
      var i = favoritos.indexOf(id);
      if (i === -1) {
        favoritos.push(id);
        var b = $('btn-favs');
        if (b) { b.classList.remove('salto'); void b.offsetWidth; b.classList.add('salto'); }
      } else favoritos.splice(i, 1);
      guardarFavoritos();
      pintarFavoritos();
    }
    function guardarPedido() {
      try { root.localStorage && root.localStorage.setItem(CLAVE_PEDIDO, JSON.stringify(carrito)); } catch (e) { /* sin guardado */ }
    }
    function wa(texto) { return enlaceWhatsApp(texto, cfg.whatsapp); }
    function avisar(texto, conBoton) {
      var a = $('aviso');
      a.innerHTML = escapar(texto) + (conBoton ? ' <button type="button" class="aviso__ver" data-ver-pedido>Ver pedido</button>' : '');
      a.hidden = false;
      clearTimeout(avisar._t);
      avisar._t = setTimeout(function () { a.hidden = true; }, 2400);
    }
    function irA(id) {
      var t = $(id);
      if (t && t.scrollIntoView) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    function enlacePerfume(p) { return 'perfume.html?p=' + encodeURIComponent(p._slug); }
    function enlaceCatalogo(atajo) { return 'index.html?f=' + encodeURIComponent(atajo) + '#catalogo'; }

    // Mientras una ventana está abierta, la página de atrás no se desplaza
    function bloquear(si) { doc.documentElement.classList.toggle('bloqueado', !!si); }
    function hayVentanaAbierta() { return !!doc.querySelector('dialog[open]') || ($('menu') && $('menu').classList.contains('abierto') && root.innerWidth < 1080); }
    function revisarBloqueo() { bloquear(hayVentanaAbierta()); }

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
      if ($('pie-texto')) $('pie-texto').textContent = cfg.pie || '';
      if ($('anio')) $('anio').textContent = String(new Date().getFullYear());
    }

    /* ----- Carga de datos ----- */
    function json(ruta, porDefecto) {
      return root.fetch(ruta).then(function (r) {
        if (!r.ok) { if (porDefecto !== undefined) return porDefecto; throw new Error('HTTP ' + r.status); }
        return r.json();
      }).catch(function (e) { if (porDefecto !== undefined) return porDefecto; throw e; });
    }
    function cargar() {
      return Promise.all([
        json('data/catalogo.json'),
        json('data/fichas.json', {}),
        esInicio ? json('data/resenas.json', []) : Promise.resolve([]),
        json('data/inspirados.json', {})
      ]).then(function (res) {
        inspirados = res[3] && typeof res[3] === 'object' ? res[3] : {};
        fichas = res[1] && typeof res[1] === 'object' ? res[1] : {};
        todos = res[0].filter(esVisible);
        todos.forEach(function (p) {
          porId[p.id] = p;
          var s = slug(p);
          if (porSlug[s]) s = s + '-' + p.id;
          p._slug = s; porSlug[s] = p;
          var ins = inspirados[claveGrupo(p)];
          if (ins && ins.original) p._inspirado = ins.original;
        });
        // Al revés: en el perfume original, cuáles son sus alternativas
        todos.forEach(function (p) {
          var ins = inspirados[claveGrupo(p)];
          if (!ins || !ins.enCatalogo) return;
          todos.forEach(function (o) {
            if (claveGrupo(o) !== ins.enCatalogo) return;
            (o._alternativas = o._alternativas || []).push(p);
          });
        });
        limpiarPedidoInvalido();
        favoritos = favoritos.filter(function (id) { return porId[id]; });
        pintarFavoritos();
        marcarSecciones();
        pintarPedido();
        if (esInicio) iniciarInicio(Array.isArray(res[2]) ? res[2] : []);
        if (esPerfume) pintarPaginaPerfume();
      }).catch(function (err) {
        if (root.console) root.console.error(err);
        var e = $('error');
        if (!e) return;
        e.hidden = false;
        e.innerHTML = '<strong>No se pudo cargar el catálogo.</strong><br>' +
          'Si abriste el archivo con doble clic, el navegador lo bloquea. Abre la carpeta con un servidor local ' +
          '(por ejemplo la extensión <em>Live Server</em> de VS Code, o <code>python -m http.server</code>) ' +
          'o súbela a tu hosting. Verifica también que <code>data/catalogo.json</code> exista y no tenga errores de comas.';
      });
    }
    function limpiarPedidoInvalido() {
      var cambio = false;
      Object.keys(carrito).forEach(function (id) {
        if (!porId[id] || !(carrito[id] > 0)) { delete carrito[id]; cambio = true; }
      });
      if (cambio) guardarPedido();
    }
    // Muestra los enlaces de Nuevos y Ofertas solo si hay perfumes marcados
    function marcarSecciones() {
      var hay = { nuevos: todos.some(function (p) { return esNuevo(p); }), ofertas: todos.some(enOferta), sets: todos.some(esSet), corporal: todos.some(esCorporal), regalos: todos.some(esCombo), alternativas: todos.some(function (p) { return p._inspirado && p.imagen; }) };
      doc.querySelectorAll('[data-solo]').forEach(function (el) { el.hidden = !hay[el.getAttribute('data-solo')]; });
      if ($('g-especial')) $('g-especial').hidden = !(hay.nuevos || hay.ofertas);
    }

    /* ----- Piezas reutilizables ----- */
    // Foto del perfume, o una tarjeta de regalo si el set todavía no tiene foto
    function htmlFoto(p, ancho, alto, lazy) {
      if (p.imagen) return '<img src="' + rutaImagen(p, cfg) + '" alt="' + escapar(p.marca + ' ' + p.nombre) + '"' + (lazy ? ' loading="lazy"' : '') + ' decoding="async" width="' + ancho + '" height="' + alto + '">';
      return '<span class="sin-foto" role="img" aria-label="' + escapar(p.marca + ' ' + p.nombre) + '"><svg class="ico" aria-hidden="true"><use href="#i-regalo"/></svg>' +
        '<span class="sin-foto__marca">' + escapar(p.marca) + '</span><span class="sin-foto__nombre">' + escapar(p.nombre) + '</span></span>';
    }
    function htmlPrecio(p) {
      if (p.precio == null) return '<span class="precio precio--consulta">Consultar precio</span>';
      if (esCombo(p) && p.valorSuelto > p.precio) {
        return '<span class="precio precio--combo"><span class="precio-antes">' + formatoPrecio(p.valorSuelto, cfg.moneda) + '</span>' +
          formatoPrecio(p.precio, cfg.moneda) + '</span>';
      }
      if (enOferta(p)) {
        return '<span class="precio precio--oferta"><span class="precio-antes">' + formatoPrecio(p.precioAntes, cfg.moneda) + '</span>' +
          formatoPrecio(p.precio, cfg.moneda) + '</span>';
      }
      return '<span class="precio">' + formatoPrecio(p.precio, cfg.moneda) + '</span>';
    }
    function botonFavorito(p, grande) {
      var si = esFavorito(p.id);
      return '<button class="btn-fav' + (grande ? ' btn-fav--grande' : '') + '" type="button" data-fav="' + p.id + '" aria-pressed="' + si + '" aria-label="' + (si ? 'Quitar de favoritos' : 'Guardar en favoritos') + '" title="Favoritos">' +
        '<svg class="ico"><use href="#i-corazon"/></svg></button>';
    }
    function tarjeta(p) {
      var etiquetas = '';
      if (p.tipo === 'Tester') etiquetas += '<span class="etiqueta etiqueta--tester">Tester</span>';
      if (esSet(p)) etiquetas += '<span class="etiqueta etiqueta--set">Set' + (p.contenido && p.contenido.length > 1 ? ' · ' + p.contenido.length + ' piezas' : '') + '</span>';
      else if (esCombo(p)) etiquetas += '<span class="etiqueta etiqueta--combo">Combo · ' + (p.incluye || []).length + ' piezas</span>';
      else if (esCorporal(p)) etiquetas += '<span class="etiqueta etiqueta--corporal">' + escapar(p.linea || 'Cuidado corporal') + '</span>';
      else if (p.ml) etiquetas += '<span class="etiqueta">' + p.ml + ' ml</span>';
      var sellos = (esNuevo(p) ? '<span class="sello sello--nuevo">Nuevo</span>' : '') +
        (enOferta(p) ? '<span class="sello sello--oferta">-' + descuento(p) + '%</span>' : '');
      return '<article class="tarjeta">' +
        '<a class="abrir" href="' + enlacePerfume(p) + '">' +
          '<span class="foto">' + (sellos ? '<span class="foto__sellos">' + sellos + '</span>' : '') +
            htmlFoto(p, 300, 400, true) + '</span>' +
          '<span class="tarjeta__info"><span class="tarjeta__marca">' + escapar(p.marca) + '</span>' +
            '<span class="tarjeta__nombre">' + escapar(p.nombre) + '</span>' +
            (p._inspirado ? '<span class="tarjeta__inspirado">Inspirado en ' + escapar(p._inspirado) + '</span>' : '') +
            '<span class="etiquetas">' + etiquetas + '</span></span>' +
        '</a>' + botonFavorito(p, false) +
        '<div class="tarjeta__pie">' + htmlPrecio(p) +
          '<button class="btn-agregar" type="button" data-agregar="' + p.id + '" aria-label="Agregar ' + escapar(p.marca + ' ' + p.nombre) + ' a mi pedido">Agregar</button>' +
        '</div></article>';
    }

    /* =================== Inicio =================== */
    function iniciarInicio(resenas) {
      llenarMarcas();
      pintarHero();
      pintarCintaMarcas();
      pintarCintaFotos('cinta-1');
      pintarCintaFotos('cinta-2');
      pintarFilasEspeciales();
      pintarCategorias();
      pintarPasos();
      pintarResenas(resenas);
      pintarFaq();
      // Filtros que llegan desde otra página: index.html?f=marca:Armaf  o  ?q=vainilla
      var params = new root.URLSearchParams(root.location.search);
      var desdeUrl = null;
      if (params.get('f')) desdeUrl = atajoAEstado(params.get('f'));
      if (params.get('q')) { desdeUrl = desdeUrl || estadoInicial(); desdeUrl.q = params.get('q'); }
      if (desdeUrl) {
        aplicarEstado(desdeUrl, false);
        if (root.history && root.history.replaceState) root.history.replaceState(null, '', root.location.pathname + '#catalogo');
        setTimeout(function () { irA('catalogo'); }, 60);
      } else {
        aplicar(true);
      }
    }
    function llenarMarcas() {
      var lista = marcasPorCantidad(todos).map(function (x) { return x.marca; }).sort(comparar);
      $('f-marca').innerHTML = '<option value="todas">Todas las marcas</option>' +
        lista.map(function (m) { return '<option value="' + escapar(m) + '">' + escapar(m) + '</option>'; }).join('');
    }
    function pintarHero() {
      var conFoto = todos.filter(function (p) { return !!p.imagen && noCorporal(p); });
      var elegidos = elegirAlAzar(conFoto, 5, null, true);
      $('hero-vitrinas').innerHTML = elegidos.map(function (p, i) {
        return '<a class="frasco" href="' + enlacePerfume(p) + '" style="--i:' + i + '" aria-label="Ver ' + escapar(p.marca + ' ' + p.nombre) + '">' +
          '<img src="' + rutaImagen(p, cfg) + '" alt="" width="300" height="400" decoding="async"></a>';
      }).join('');
      var nMarcas = marcasPorCantidad(todos).length;
      var nPerfumes = todos.filter(noCorporal).length;
      $('hero-dato').textContent = 'El catálogo reúne ' + nPerfumes + ' perfumes de ' + nMarcas + ' marcas.';
      var redondo = function (n) { return n >= 100 ? '+' + Math.floor(n / 50) * 50 : n >= 10 ? '+' + Math.floor(n / 10) * 10 : String(n); };
      doc.querySelectorAll('[data-dato="perfumes"]').forEach(function (e) { e.textContent = redondo(nPerfumes); });
      doc.querySelectorAll('[data-dato="marcas"]').forEach(function (e) { e.textContent = redondo(nMarcas); });
    }
    function cinta(id, htmlUnaVez, segundosPorItem, n) {
      $(id).innerHTML = '<div class="cinta__pista" style="--dur:' + Math.max(30, Math.round(n * segundosPorItem)) + 's">' +
        htmlUnaVez(false) + htmlUnaVez(true) + '</div>';
    }
    function pintarCintaMarcas() {
      var marcas = marcasPorCantidad(todos).slice(0, 26).map(function (x) { return x.marca; });
      cinta('cinta-marcas', function (oculto) {
        return marcas.map(function (m) {
          return '<button class="marca-item" type="button" data-filtro="marca:' + escapar(m) + '" title="Ver los perfumes de ' + escapar(m) + '"' + (oculto ? ' aria-hidden="true" tabindex="-1"' : '') + '>' +
            escapar(m) + '</button>';
        }).join('');
      }, 2.6, marcas.length);
    }
    function pintarCintaFotos(id) {
      var items = elegirAlAzar(todos.filter(function (p) { return !!p.imagen && noCorporal(p); }), 16, null, false);
      cinta(id, function (oculto) {
        return items.map(function (p) {
          return '<a class="foto-item" href="' + enlacePerfume(p) + '"' + (oculto ? ' aria-hidden="true" tabindex="-1"' : '') + '>' +
            '<img src="' + rutaImagen(p, cfg) + '" alt="' + (oculto ? '' : escapar(p.marca + ' ' + p.nombre)) + '" loading="lazy" decoding="async" width="300" height="400">' +
            '<span class="foto-item__info"><span class="foto-item__marca">' + escapar(p.marca) + '</span>' +
            '<span class="foto-item__nombre">' + escapar(p.nombre) + '</span>' +
            '<span class="foto-item__precio">' + (p.precio == null ? 'Consultar' : formatoPrecio(p.precio, cfg.moneda)) + '</span></span></a>';
        }).join('');
      }, 4.6, items.length);
    }
    function pintarFilasEspeciales() {
      var nuevos = todos.filter(function (p) { return esNuevo(p); }).sort(function (a, b) { return String(b.nuevoDesde || '').localeCompare(String(a.nuevoDesde || '')) || b.id - a.id; });
      var ofertas = ordenar(todos.filter(enOferta), 'marca').sort(function (a, b) { return descuento(b) - descuento(a); });
      $('nuevos').hidden = !nuevos.length;
      $('ofertas').hidden = !ofertas.length;
      $('carril-nuevos').innerHTML = nuevos.slice(0, 16).map(tarjeta).join('');
      $('carril-ofertas').innerHTML = ofertas.slice(0, 16).map(tarjeta).join('');
      var sets = todos.filter(esSet).sort(function (a, b) { return (b.imagen ? 1 : 0) - (a.imagen ? 1 : 0) || (b.id - a.id); });
      $('sets').hidden = !sets.length;
      $('carril-sets').innerHTML = sets.slice(0, 20).map(tarjeta).join('');
      if ($('regalos')) { $('regalos').hidden = !todos.some(esCombo); pintarRegalos(); }
      if ($('alternativas')) {
        var alt = todos.filter(function (p) { return p._inspirado && p.imagen && p.tipo === 'Sellado'; })
          .sort(function (a, b) { return comparar(a.marca + a.nombre, b.marca + b.nombre); });
        $('alternativas').hidden = !alt.length;
        $('carril-alternativas').innerHTML = alt.map(tarjeta).join('');
      }
      if ($('corporal')) {
        var corp = elegirAlAzar(todos.filter(function (p) { return esCorporal(p) && p.imagen; }), 20, null, false);
        $('corporal').hidden = !corp.length;
        $('carril-corporal').innerHTML = corp.map(tarjeta).join('');
      }
    }
    var regalo = { tope: 20000, para: 'todos' };
    var TOPES = [20000, 30000, 40000, 50000, 0];
    function pintarRegalos() {
      var i = TOPES.indexOf(regalo.tope);
      var piso = i > 0 ? TOPES[i - 1] : 0;
      var lista = todos.filter(function (p) {
        if (!esCombo(p) && !esSet(p)) return false;
        if (!p.imagen || p.precio == null) return false;
        if (regalo.para !== 'todos' && !coincideGenero(p, regalo.para)) return false;
        if (regalo.tope === 0) return p.precio > 50000;
        return p.precio > piso && p.precio <= regalo.tope;
      }).sort(function (a, b) { return (esCombo(b) - esCombo(a)) || a.precio - b.precio; });
      $('regalos-tabs').querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', Number(b.getAttribute('data-tope')) === regalo.tope ? 'true' : 'false'); });
      $('regalos-para').querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-para') === regalo.para ? 'true' : 'false'); });
      $('carril-regalos').innerHTML = lista.length ? lista.map(tarjeta).join('') :
        '<p class="regalos__vacio">No hay regalos armados en este rango todavía. Escríbenos y te armamos uno a tu medida.</p>';
      $('carril-regalos').scrollLeft = 0;
      pintarFavoritos();
    }
    function pintarCategorias() {
      var defs = [
        { titulo: 'Mujer', atajo: 'genero:mujer', pred: function (p) { return p.genero === 'Femenino' || p.genero === 'Unisex'; } },
        { titulo: 'Hombre', atajo: 'genero:hombre', pred: function (p) { return p.genero === 'Masculino' || p.genero === 'Unisex'; } },
        { titulo: 'Árabes', atajo: 'categoria:Árabe', pred: function (p) { return p.categoria === 'Árabe'; } },
        { titulo: 'Nicho', atajo: 'categoria:Nicho', pred: function (p) { return p.categoria === 'Nicho'; } }
      ];
      var fotosFijas = cfg.fotosCategorias || {};
      $('categorias-grid').innerHTML = defs.map(function (d) {
        var lista = todos.filter(function (p) { return noCorporal(p) && d.pred(p); });
        if (!lista.length) return '';
        var src = fotosFijas[d.titulo];
        if (!src) {
          var foto = elegirAlAzar(lista.filter(function (p) { return p.tipo === 'Sellado' && p.imagen; }), 1)[0] || elegirAlAzar(lista.filter(function (p) { return p.imagen; }), 1)[0];
          src = rutaImagen(foto, cfg);
        }
        return '<a class="cat" href="#catalogo" data-filtro="' + escapar(d.atajo) + '">' +
          '<span class="cat__arco"><img src="' + escapar(src) + '" alt="" loading="lazy" decoding="async" width="300" height="400"></span>' +
          '<span class="cat__texto"><span class="cat__titulo">' + d.titulo + '</span>' +
          '<span class="cat__cuenta">' + lista.length + (lista.length === 1 ? ' perfume' : ' perfumes') + '</span></span></a>';
      }).join('');
    }

    /* ----- Catálogo ----- */
    function aplicar(reiniciar) {
      if (reiniciar) estado.visibles = PAGINA;
      resultado = ordenar(filtrar(todos, estado, fichas), estado.orden);
      if (estado.q && estado.orden === 'marca') resultado = relevancia(resultado, estado.q);
      pintarGrid();
    }
    function pintarGrid() {
      var mostrar = resultado.slice(0, estado.visibles);
      $('grid').innerHTML = mostrar.map(tarjeta).join('');
      var total = resultado.length;
      $('resultado').textContent = total === 0 ? '' :
        (estado.tipo === 'Set' ? (total === 1 ? '1 set' : total + ' sets') : (estado.tipo === 'Corporal' || estado.q) ? (total === 1 ? '1 producto' : total + ' productos') : (total === 1 ? '1 perfume' : total + ' perfumes')) + (mostrar.length < total ? ', mostrando ' + mostrar.length : '');
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
      marcarSegmento('f-especial', estado.especial);
      $('f-marca').value = estado.marca;
      $('f-orden').value = estado.orden;
      $('buscar').value = estado.q;
    }
    function aplicarEstado(nuevo, desplazar) {
      estado = nuevo;
      sincronizarControles();
      aplicar(true);
      if (desplazar) irA('catalogo');
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
      $('resenas').hidden = !lista.length;
      if (!lista.length) return;
      if (r.total) {
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

    /* =================== Página de un perfume =================== */
    function pintarPaginaPerfume() {
      var params = new root.URLSearchParams(root.location.search);
      var p = porSlug[params.get('p') || ''] || porId[params.get('id') || ''];
      var cont = $('pagina-perfume');
      if (!p) {
        doc.title = 'Perfume no encontrado | ' + cfg.tienda;
        cont.innerHTML = '<div class="vacio"><h1>No encontramos ese perfume</h1><p style="margin:14px 0 22px">Puede que ya no esté en el catálogo.</p>' +
          '<a class="btn btn--azul" href="index.html#catalogo">Ver el catálogo</a></div>';
        return;
      }
      var f = fichas[claveFicha(p)];
      doc.title = p.nombre + ' de ' + p.marca + (p.tipo === 'Tester' ? ' (Tester)' : '') + ' | ' + cfg.tienda;
      var meta = doc.querySelector('meta[name="description"]');
      if (meta) meta.setAttribute('content', p.marca + ' ' + p.nombre + '. ' + (p.descripcion || '') + ' Pídelo por WhatsApp.');

      var generoTxt = ETIQUETA_GENERO[p.genero] || p.genero;
      var atajoGenero = p.genero === 'Femenino' ? 'genero:mujer' : p.genero === 'Masculino' ? 'genero:hombre' : '';
      var migas = '<nav class="migas" aria-label="Ruta"><a href="index.html">Inicio</a><span aria-hidden="true">›</span>' +
        (atajoGenero ? '<a href="' + enlaceCatalogo(atajoGenero) + '">' + escapar(generoTxt) + '</a><span aria-hidden="true">›</span>' : '') +
        '<a href="' + enlaceCatalogo('marca:' + p.marca) + '">' + escapar(p.marca) + '</a><span aria-hidden="true">›</span>' +
        '<span aria-current="page">' + escapar(p.nombre) + '</span></nav>';

      // Presentaciones del mismo perfume (sellado, tester, otros tamaños)
      var variantes = todos.filter(function (x) { return claveGrupo(x) === claveGrupo(p); })
        .sort(function (a, b) { return (a.tipo === 'Tester') - (b.tipo === 'Tester') || (a.ml || 0) - (b.ml || 0); });
      var opciones = variantes.length > 1 ? '<div><p class="opciones__titulo">Presentación</p><div class="opciones">' +
        variantes.map(function (x) {
          return '<a class="opcion" href="' + enlacePerfume(x) + '"' + (x === p ? ' aria-current="page"' : '') + '>' +
            '<b>' + nombreTipo(x) + (x.ml && !esSet(x) ? ' ' + x.ml + ' ml' : '') + '</b>' +
            '<span>' + (x.precio == null ? 'Consultar' : formatoPrecio(x.precio, cfg.moneda)) + '</span></a>';
        }).join('') + '</div></div>' : '';

      var precio = p.precio == null ? '<div class="producto__precio">Consultar precio</div>' :
        '<div class="producto__precio">' + (enOferta(p) ? '<span class="precio-antes">' + formatoPrecio(p.precioAntes, cfg.moneda) + '</span>' : '') +
        '<span' + (enOferta(p) ? ' class="precio--oferta"' : '') + '>' + formatoPrecio(p.precio, cfg.moneda) + '</span>' +
        (enOferta(p) ? '<span class="producto__ahorro">Ahorras ' + formatoPrecio(p.precioAntes - p.precio, cfg.moneda) + '</span>' : '') +
        (esCombo(p) && p.valorSuelto > p.precio ? '<span class="producto__ahorro">Por separado ' + formatoPrecio(p.valorSuelto, cfg.moneda) + ' · ahorras ' + formatoPrecio(p.valorSuelto - p.precio, cfg.moneda) + '</span>' : '') + '</div>';

      var etiquetas = '<span class="etiqueta">' + escapar(generoTxt) + '</span><span class="etiqueta">' + escapar(p.categoria) + '</span>' +
        (p.tipo === 'Tester' ? '<span class="etiqueta etiqueta--tester">Tester</span>' : esCombo(p) ? '<span class="etiqueta etiqueta--combo">Combo regalo</span>' : esSet(p) ? '<span class="etiqueta etiqueta--set">Set</span>' : esCorporal(p) ? '<span class="etiqueta etiqueta--corporal">' + escapar(p.linea || 'Cuidado corporal') + '</span>' : '<span class="etiqueta">Sellado</span>') +
        (p.ml && !esSet(p) ? '<span class="etiqueta">' + p.ml + ' ml</span>' : '') +
        (esNuevo(p) ? '<span class="sello sello--nuevo">Nuevo</span>' : '');

      var uno = {}; uno[p.id] = 1;
      cont.innerHTML = '<div class="contenedor">' + migas +
        '<div class="producto">' +
          '<div class="producto__foto">' + htmlFoto(p, 600, 800, false) + '</div>' +
          '<div class="producto__datos">' +
            '<p class="producto__marca"><a href="' + enlaceCatalogo('marca:' + p.marca) + '">' + escapar(p.marca) + '</a></p>' +
            '<h1 class="producto__nombre">' + escapar(p.nombre) + '</h1>' +
            '<div class="etiquetas">' + etiquetas + '</div>' +
            precio + opciones +
            (p.descripcion ? '<p class="producto__desc">' + escapar(p.descripcion) + '</p>' : '') +
            htmlInspirado(p) +
            (esCombo(p) && p.incluye ? '<div class="incluye incluye--combo"><p class="opciones__titulo">Incluye</p>' +
              p.incluye.map(function (id) {
                var x = porId[id];
                if (!x) return '';
                return '<a class="alternativa" href="' + enlacePerfume(x) + '">' +
                  (x.imagen ? '<img src="' + rutaImagen(x, cfg) + '" alt="" loading="lazy" width="52" height="64">' : '') +
                  '<span><span class="alternativa__marca">' + escapar(x.marca) + '</span><span class="alternativa__nombre">' + escapar(x.nombre) + '</span></span>' +
                  '<span class="alternativa__precio">' + formatoPrecio(x.precio, cfg.moneda) + '</span></a>';
              }).join('') + '</div>' : '') +
            (esSet(p) && p.contenido && p.contenido.length ? '<div class="incluye"><p class="opciones__titulo">Incluye</p><ul>' +
              p.contenido.map(function (c) { return '<li>' + escapar(c) + '</li>'; }).join('') + '</ul></div>' : '') +
            (p.tipo === 'Tester' && cfg.notaTester ? '<p class="producto__nota">' + escapar(cfg.notaTester) + '</p>' : '') +
            '<div class="comprar">' +
              '<div class="cantidad" role="group" aria-label="Cantidad"><button type="button" id="cant-menos" aria-label="Una menos">−</button><output id="cant" aria-live="polite">1</output><button type="button" id="cant-mas" aria-label="Una más">+</button></div>' +
              '<button class="btn btn--azul" type="button" id="btn-agregar-perfume">Agregar a mi pedido</button>' +
              botonFavorito(p, true) +
            '</div>' +
            '<a class="btn btn--wa-linea" id="btn-wa-perfume" href="' + wa(mensajeWhatsApp(uno, porId, cfg)) + '" target="_blank" rel="noopener"><svg class="ico"><use href="#i-wa"/></svg>Pedir solo este por WhatsApp</a>' +
            '<button class="link-compartir" type="button" id="btn-compartir"><svg class="ico"><use href="#i-compartir"/></svg>Compartir este perfume</button>' +
            '<div class="producto__garantias">' +
              '<span><svg class="ico"><use href="#i-escudo"/></svg>100% original</span>' +
              '<span><svg class="ico"><use href="#i-camion"/></svg>Envíos a todo Costa Rica</span>' +
              '<span><svg class="ico"><use href="#i-sinpe"/></svg>SINPE, efectivo o transferencia</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        htmlFicha(p, f) +
      '</div>' + htmlMasPerfumes(p);

      var cant = 1;
      function ponerCant(n) {
        cant = Math.max(1, Math.min(99, n));
        $('cant').textContent = cant;
        var m = {}; m[p.id] = cant;
        $('btn-wa-perfume').setAttribute('href', wa(mensajeWhatsApp(m, porId, cfg)));
      }
      $('btn-compartir').addEventListener('click', function () {
        var enlace = root.location.origin + root.location.pathname + '?p=' + encodeURIComponent(p._slug);
        var datos = { title: p.nombre + ' de ' + p.marca, text: p.nombre + ' de ' + p.marca + (p.precio != null ? ' · ' + formatoPrecio(p.precio, cfg.moneda) : ''), url: enlace };
        if (root.navigator.share) { root.navigator.share(datos).catch(function () {}); return; }
        var copiado = function () { avisar('Enlace copiado'); };
        if (root.navigator.clipboard) root.navigator.clipboard.writeText(enlace).then(copiado, function () { root.prompt('Copia el enlace:', enlace); });
        else root.prompt('Copia el enlace:', enlace);
      });
      $('cant-menos').addEventListener('click', function () { ponerCant(cant - 1); });
      $('cant-mas').addEventListener('click', function () { ponerCant(cant + 1); });
      $('btn-agregar-perfume').addEventListener('click', function () {
        carrito[p.id] = Math.min(99, (carrito[p.id] || 0) + cant);
        guardarPedido(); pintarPedido();
        abrirCarrito();
      });
    }
    // "Inspirado en..." en el árabe y "Alternativas" en el original
    function htmlInspirado(p) {
      var html = '';
      if (p._inspirado) {
        var ins = inspirados[claveGrupo(p)] || {};
        var orig = ins.enCatalogo ? todos.filter(function (o) { return claveGrupo(o) === ins.enCatalogo; })
          .sort(function (a, b) { return (a.tipo === 'Tester') - (b.tipo === 'Tester'); })[0] : null;
        html += '<div class="inspirado"><span class="inspirado__ico" aria-hidden="true"><svg class="ico"><use href="#i-estrella"/></svg></span><div>' +
          '<p class="inspirado__titulo">Inspirado en <b>' + escapar(p._inspirado) + '</b></p>' +
          '<p class="inspirado__sub">Un aroma de la misma familia por una fracción del precio.' +
          (orig && orig.precio && p.precio && orig.precio > p.precio ? ' Ahorras ' + formatoPrecio(orig.precio - p.precio, cfg.moneda) + ' frente al original.' : '') + '</p>' +
          (orig ? '<a class="inspirado__ver" href="' + enlacePerfume(orig) + '">Ver el original ›</a>' : '') +
          '</div></div>';
      }
      if (p._alternativas && p._alternativas.length) {
        var vistos = {};
        var alts = p._alternativas.filter(function (a) { var k = claveGrupo(a); if (vistos[k]) return false; vistos[k] = 1; return true; });
        html += '<div class="alternativas"><p class="opciones__titulo">Alternativas más económicas</p>' +
          alts.map(function (a) {
            return '<a class="alternativa" href="' + enlacePerfume(a) + '">' +
              (a.imagen ? '<img src="' + rutaImagen(a, cfg) + '" alt="" loading="lazy" width="52" height="64">' : '') +
              '<span><span class="alternativa__marca">' + escapar(a.marca) + '</span><span class="alternativa__nombre">' + escapar(a.nombre) + '</span>' +
              (p.precio && a.precio && p.precio > a.precio ? '<span class="alternativa__ahorro">Ahorras ' + formatoPrecio(p.precio - a.precio, cfg.moneda) + '</span>' : '') + '</span>' +
              '<span class="alternativa__precio">' + (a.precio == null ? 'Consultar' : formatoPrecio(a.precio, cfg.moneda)) + '</span></a>';
          }).join('') + '</div>';
      }
      return html;
    }
    function htmlFicha(p, f) {
      if (!f) return '';
      var bloques = [];
      var acordes = (f.acordes || []).slice(0, 10);
      if (acordes.length) {
        var max = acordes.reduce(function (m, a) { return Math.max(m, a[1] || 0); }, 1);
        bloques.push('<div class="ficha-olf__bloque"><h2>Acordes principales</h2><div class="acordes">' +
          acordes.map(function (a, i) {
            var c = colorAcorde(a[0]);
            var ancho = Math.round(32 + 58 * (a[1] || 0) / max);
            return '<div class="acorde" style="--i:' + i + ';width:' + ancho + '%;background:' + c + ';color:' + textoSobre(c) + '">' + escapar(a[0]) + '</div>';
          }).join('') + '</div></div>');
      }
      if (f.dia != null || f.noche != null) {
        bloques.push('<div class="ficha-olf__bloque"><h2>Cuándo usarlo</h2><div class="uso">' +
          '<span>Día</span><div class="uso__barra uso__barra--dia" role="img" aria-label="Día: ' + (f.dia || 0) + ' de 100"><span style="width:' + (f.dia || 0) + '%"></span></div>' +
          '<span>Noche</span><div class="uso__barra uso__barra--noche" role="img" aria-label="Noche: ' + (f.noche || 0) + ' de 100"><span style="width:' + (f.noche || 0) + '%"></span></div>' +
          '</div></div>');
      }
      var n = f.notas || {};
      var filas = [['Salida', n.salida], ['Corazón', n.corazon], ['Fondo', n.fondo], ['Notas', n.generales]].filter(function (x) { return x[1] && x[1].length; });
      if (filas.length) {
        bloques.push('<div class="ficha-olf__bloque"><h2>Notas</h2>' + filas.map(function (fila) {
          return '<div class="notas-fila"><span class="notas-fila__nombre">' + fila[0] + '</span><div class="notas-lista">' +
            fila[1].map(function (nota) { return '<span class="nota">' + iconoNota(nota) + '<span>' + escapar(nota) + '</span></span>'; }).join('') +
            '</div></div>';
        }).join('') + '</div>');
      }
      var pie = [p.marca, p.categoria, p.genero, f.anio].filter(Boolean).map(escapar).join(' · ');
      if (esSet(p) && p.ficha) pie = 'Ficha del perfume principal del set · ' + pie;
      bloques.push('<p class="ficha-olf__pie">' + pie + '</p>');
      return '<section class="ficha-olf" aria-label="Ficha olfativa">' + bloques.join('') + '</section>';
    }
    function htmlMasPerfumes(p) {
      var lista = relacionados(p, todos, fichas, 12);
      if (!lista.length) return '';
      return '<section class="fila fila--bruma" aria-labelledby="mas-titulo">' +
        '<div class="contenedor fila__cab"><div><h2 id="mas-titulo">Más perfumes</h2><p>Otros que te pueden gustar.</p></div>' +
        '<div class="fila__acciones"><a class="ver-todos" href="' + enlaceCatalogo('marca:' + p.marca) + '">Ver todo ' + escapar(p.marca) + ' ›</a>' +
        '<div class="flechas"><button type="button" data-carril="carril-mas" data-dir="-1" aria-label="Anteriores"><svg class="ico"><use href="#i-izq"/></svg></button>' +
        '<button type="button" data-carril="carril-mas" data-dir="1" aria-label="Siguientes"><svg class="ico"><use href="#i-der"/></svg></button></div></div></div>' +
        '<div class="carril" id="carril-mas">' + lista.map(tarjeta).join('') + '</div></section>';
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
      avisar('Agregado: ' + porId[id].nombre, true);
      saltarCarrito();
    }
    function saltarCarrito() {
      var b = $('btn-carrito');
      b.classList.remove('salto'); void b.offsetWidth; b.classList.add('salto');
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
          (p.imagen ? '<img src="' + rutaImagen(p, cfg) + '" alt="" loading="lazy">' : '<span class="sin-foto sin-foto--mini"><svg class="ico" aria-hidden="true"><use href="#i-regalo"/></svg></span>') +
          '<div><h3><a href="' + enlacePerfume(p) + '">' + escapar(p.nombre) + '</a></h3>' +
            '<p class="sub">' + escapar(p.marca) + (p.tipo === 'Tester' ? ', tester' : '') + (p.ml ? ', ' + p.ml + ' ml' : '') + '</p>' +
            '<div class="linea-pedido__fila">' +
              '<div class="cantidad"><button type="button" data-menos="' + id + '" aria-label="Quitar una unidad">−</button><span aria-live="polite">' + q + '</span><button type="button" data-mas="' + id + '" aria-label="Agregar una unidad">+</button></div>' +
              '<strong>' + precio + '</strong></div>' +
            '<button class="quitar" type="button" data-quitar="' + id + '">Quitar</button>' +
          '</div></div>';
      }).join('');
      var aviso = t.sinPrecio ? '<small>' + t.sinPrecio + (t.sinPrecio === 1 ? ' perfume' : ' perfumes') + ' sin precio: lo confirmamos por WhatsApp.</small>' : '';
      aviso += '<small>Puedes pagar en efectivo, SINPE Móvil o transferencia bancaria. Confirmamos el método por WhatsApp.</small>';
      pie.innerHTML = '<div class="total"><span>Total</span><strong>' + formatoPrecio(t.total, cfg.moneda) + '</strong></div>' + aviso +
        '<a class="btn btn-wa" href="' + wa(mensajeWhatsApp(carrito, porId, cfg)) + '" target="_blank" rel="noopener">Enviar pedido por WhatsApp</a>' +
        '<button class="link-vaciar" type="button" id="btn-vaciar">Vaciar pedido</button>';
    }

    /* ----- Favoritos ----- */
    function pintarFavoritos() {
      doc.querySelectorAll('[data-fav]').forEach(function (b) {
        var si = esFavorito(b.getAttribute('data-fav'));
        b.setAttribute('aria-pressed', si ? 'true' : 'false');
        b.setAttribute('aria-label', si ? 'Quitar de favoritos' : 'Guardar en favoritos');
      });
      var c = $('contador-fav');
      if (c) { c.textContent = favoritos.length; c.hidden = favoritos.length === 0; }
      var lista = $('favoritos-lista'), pie = $('favoritos-pie');
      if (!lista) return;
      var items = favoritos.map(function (id) { return porId[id]; }).filter(Boolean);
      if (!items.length) {
        lista.innerHTML = '<div class="panel__vacio">Todavía no tienes favoritos.<br>Toca el corazón de un perfume para guardarlo aquí.</div>';
        pie.innerHTML = '';
        return;
      }
      lista.innerHTML = items.map(function (p) {
        return '<div class="linea-pedido">' +
          (p.imagen ? '<img src="' + rutaImagen(p, cfg) + '" alt="" loading="lazy">' : '<span class="sin-foto sin-foto--mini"><svg class="ico" aria-hidden="true"><use href="#i-regalo"/></svg></span>') +
          '<div><h3><a href="' + enlacePerfume(p) + '">' + escapar(p.nombre) + '</a></h3>' +
            '<p class="sub">' + escapar(p.marca) + (p.tipo === 'Tester' ? ', tester' : '') + '</p>' +
            '<div class="linea-pedido__fila"><strong>' + (p.precio == null ? 'Consultar precio' : formatoPrecio(p.precio, cfg.moneda)) + '</strong>' +
              '<button class="btn-agregar" type="button" data-agregar="' + p.id + '">Agregar</button></div>' +
            '<button class="quitar" type="button" data-fav="' + p.id + '">Quitar</button>' +
          '</div></div>';
      }).join('');
      pie.innerHTML = '<button class="btn btn--azul" type="button" id="btn-favs-todos">Agregar todos a mi pedido</button>';
    }

    /* ----- Test: encuentra tu perfume ----- */
    var PREGUNTAS = [
      { k: 'para', t: '¿Para quién es?', o: [['mujer', 'Para ella'], ['hombre', 'Para él'], ['todos', 'Me da igual / unisex']] },
      { k: 'momento', t: '¿Cuándo lo vas a usar más?', o: [['dia', 'De día, trabajo o clases'], ['noche', 'De noche y salidas'], ['siempre', 'Para todo']] },
      { k: 'estilo', t: '¿Qué tipo de aroma te gusta?', o: [['fresco', 'Fresco y cítrico'], ['dulce', 'Dulce y goloso'], ['floral', 'Floral y delicado'], ['intenso', 'Amaderado e intenso']] },
      { k: 'tope', t: '¿Cuánto quieres invertir?', o: [['30000', 'Hasta ₡30.000'], ['45000', 'Hasta ₡45.000'], ['70000', 'Hasta ₡70.000'], ['0', 'Sin límite']] }
    ];
    var respuestas = {}, paso = 0;
    function pintarTest() {
      var cuerpo = $('test-cuerpo');
      if (!cuerpo) return;
      if (paso < PREGUNTAS.length) {
        var q = PREGUNTAS[paso];
        cuerpo.innerHTML = '<div class="test__progreso" aria-hidden="true">' + PREGUNTAS.map(function (_, i) { return '<span' + (i <= paso ? ' class="hecho"' : '') + '></span>'; }).join('') + '</div>' +
          '<p class="test__paso">Pregunta ' + (paso + 1) + ' de ' + PREGUNTAS.length + '</p>' +
          '<h3 class="test__pregunta">' + q.t + '</h3>' +
          '<div class="test__opciones">' + q.o.map(function (o) {
            return '<button type="button" class="test__opcion" data-resp="' + o[0] + '">' + o[1] + '</button>';
          }).join('') + '</div>' +
          (paso > 0 ? '<button type="button" class="test__atras" data-test-atras>‹ Atrás</button>' : '');
        return;
      }
      var r = { para: respuestas.para, momento: respuestas.momento, estilo: respuestas.estilo, tope: Number(respuestas.tope) || 0 };
      var lista = recomendar(todos, r, 6);
      cuerpo.innerHTML = '<p class="test__paso">Tu resultado</p><h3 class="test__pregunta">Estos te van a encantar</h3>' +
        (lista.length ? '<div class="test__resultados">' + lista.map(tarjeta).join('') + '</div>' :
          '<p class="panel__vacio">No encontramos perfumes con esas respuestas. Prueba con otro presupuesto.</p>') +
        '<div class="test__fin"><button type="button" class="btn btn--linea-azul" data-test-reiniciar>Volver a empezar</button>' +
        '<a class="btn btn--azul" href="' + wa('Hola, hice el test de la página y me interesa: ' + lista.map(function (p) { return p.marca + ' ' + p.nombre; }).join(', ') + '. ¿Me ayudan a elegir?') + '" target="_blank" rel="noopener"><svg class="ico"><use href="#i-wa"/></svg>Pedir ayuda por WhatsApp</a></div>';
      pintarFavoritos();
    }

    /* ----- Buscador (ventana) ----- */
    function pintarBuscador() {
      var q = $('buscador-input').value.trim();
      var cuerpo = $('buscador-cuerpo');
      if (!todos.length) { cuerpo.innerHTML = '<p class="buscador__vacio">Cargando el catálogo…</p>'; return; }
      if (!q) {
        var marcas = marcasPorCantidad(todos).slice(0, 8).map(function (x) { return x.marca; });
        var notas = ['Vainilla', 'Oud', 'Cítricos', 'Café', 'Rosa', 'Cuero', 'Coco', 'Lavanda'];
        cuerpo.innerHTML = '<p class="buscador__titulo">Marcas</p><div class="buscador__chips">' +
          marcas.map(function (m) { return '<button class="chip" type="button" data-sugerir="' + escapar(m) + '">' + escapar(m) + '</button>'; }).join('') + '</div>' +
          '<p class="buscador__titulo">Buscar por nota</p><div class="buscador__chips">' +
          notas.map(function (m) { return '<button class="chip" type="button" data-sugerir="' + escapar(m === 'Cítricos' ? 'cítrico' : m) + '">' + escapar(m) + '</button>'; }).join('') + '</div>';
        return;
      }
      var e = estadoInicial(); e.q = q;
      var r = relevancia(ordenar(filtrar(todos, e, fichas), 'marca'), q);
      if (!r.length) {
        cuerpo.innerHTML = '<p class="buscador__vacio">No encontramos «' + escapar(q) + '».<br>Escríbenos por WhatsApp y te decimos si lo podemos conseguir.</p>';
        return;
      }
      cuerpo.innerHTML = '<p class="buscador__titulo">' + (r.length === 1 ? '1 resultado' : r.length + ' resultados') + '</p>' +
        r.slice(0, 8).map(function (p) {
          return '<a class="sugerencia" href="' + enlacePerfume(p) + '">' +
            (p.imagen ? '<img src="' + rutaImagen(p, cfg) + '" alt="" loading="lazy" width="52" height="64">' : '<span class="sin-foto sin-foto--mini"><svg class="ico" aria-hidden="true"><use href="#i-regalo"/></svg></span>') +
            '<span><span class="sugerencia__marca">' + escapar(p.marca) + (p.tipo === 'Tester' ? ' · Tester' : esSet(p) ? ' · Set' : esCorporal(p) ? ' · ' + escapar(p.linea || '') : '') + '</span>' +
            '<span class="sugerencia__nombre">' + escapar(p.nombre) + '</span></span>' +
            '<span class="sugerencia__precio">' + (p.precio == null ? 'Consultar' : formatoPrecio(p.precio, cfg.moneda)) + '</span></a>';
        }).join('') +
        (r.length > 8 ? '<button class="btn btn--linea buscador__todos" type="submit" form="buscador-form">Ver los ' + r.length + ' resultados</button>' : '');
    }
    function abrirBuscador() {
      var d = $('buscador');
      if (d.open) return;
      $('buscador-input').value = esInicio ? estado.q : '';
      pintarBuscador();
      d.showModal();
      revisarBloqueo();
      setTimeout(function () { $('buscador-input').focus(); }, 30);
    }
    function verResultados(q) {
      $('buscador').close();
      if (esInicio) {
        var e = estadoInicial(); e.q = q;
        aplicarEstado(e, true);
      } else {
        root.location.href = 'index.html?q=' + encodeURIComponent(q) + '#catalogo';
      }
    }

    /* ----- Eventos ----- */
    function cerrarMenu() {
      $('menu').classList.remove('abierto');
      $('btn-menu').setAttribute('aria-expanded', 'false');
      revisarBloqueo();
    }
    $('btn-menu').addEventListener('click', function () {
      var abierto = $('menu').classList.toggle('abierto');
      $('btn-menu').setAttribute('aria-expanded', abierto ? 'true' : 'false');
      revisarBloqueo();
    });

    var tempBuscador;
    $('buscador-input').addEventListener('input', function () {
      clearTimeout(tempBuscador);
      tempBuscador = setTimeout(pintarBuscador, 90);
    });
    $('buscador-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var q = $('buscador-input').value.trim();
      if (q) verResultados(q);
    });
    $('buscador-cerrar').addEventListener('click', function () { $('buscador').close(); });

    if (esInicio) {
      var segmento = function (idGrupo, clave) {
        $(idGrupo).addEventListener('click', function (e) {
          var b = e.target.closest && e.target.closest('button[data-v]');
          if (!b) return;
          estado[clave] = b.getAttribute('data-v');
          marcarSegmento(idGrupo, estado[clave]);
          aplicar(true);
        });
      };
      segmento('f-genero', 'genero');
      segmento('f-categoria', 'categoria');
      segmento('f-tipo', 'tipo');
      segmento('f-especial', 'especial');
      var temporizador;
      $('buscar').addEventListener('input', function (e) {
        clearTimeout(temporizador);
        var valor = e.target.value;
        temporizador = setTimeout(function () { estado.q = valor; aplicar(true); }, 140);
      });
      $('f-marca').addEventListener('change', function (e) { estado.marca = e.target.value; aplicar(true); });
      $('f-orden').addEventListener('change', function (e) { estado.orden = e.target.value; aplicar(true); });
      $('btn-mas').addEventListener('click', function () { estado.visibles += PAGINA; pintarGrid(); });
      $('btn-filtros').addEventListener('click', function () {
        var f = $('filtros'), abierto = f.classList.toggle('abierto');
        $('btn-filtros').setAttribute('aria-expanded', abierto ? 'true' : 'false');
      });
      $('btn-limpiar').addEventListener('click', function () { aplicarEstado(estadoInicial(), false); });
      $('resenas-prev').addEventListener('click', function () { $('resenas-pista').scrollBy({ left: -372, behavior: 'smooth' }); });
      $('resenas-next').addEventListener('click', function () { $('resenas-pista').scrollBy({ left: 372, behavior: 'smooth' }); });
    }

    // Un solo oyente para todo lo que se pinta dinámicamente
    doc.addEventListener('click', function (e) {
      var el = e.target && e.target.closest ? e.target : null;
      if (!el) return;
      if (el.closest('[data-ver-pedido]')) { $('aviso').hidden = true; abrirCarrito(); return; }
      if (el.closest('[data-abrir-buscador]')) { cerrarMenu(); abrirBuscador(); return; }
      var sug = el.closest('[data-sugerir]');
      if (sug) { $('buscador-input').value = sug.getAttribute('data-sugerir'); pintarBuscador(); $('buscador-input').focus(); return; }
      var f = el.closest('[data-filtro]');
      if (f) {
        e.preventDefault();
        cerrarMenu();
        var v = f.getAttribute('data-filtro');
        if (!esInicio) { root.location.href = v === 'todo:1' ? 'index.html#catalogo' : enlaceCatalogo(v); return; }
        aplicarEstado(v === 'todo:1' ? estadoInicial() : atajoAEstado(v), true);
        return;
      }
      var grupo = el.closest('.menu__abrir');
      if (grupo) {
        var g = grupo.parentNode, abierto = g.classList.toggle('abierto');
        grupo.setAttribute('aria-expanded', abierto ? 'true' : 'false');
        return;
      }
      doc.querySelectorAll('.menu__grupo.abierto').forEach(function (g) { g.classList.remove('abierto'); g.querySelector('.menu__abrir').setAttribute('aria-expanded', 'false'); });
      if (el.closest('#menu a')) cerrarMenu();
      var flecha = el.closest('[data-carril]');
      if (flecha) {
        var carril = $(flecha.getAttribute('data-carril'));
        if (carril) carril.scrollBy({ left: Number(flecha.getAttribute('data-dir')) * carril.clientWidth * 0.8, behavior: 'smooth' });
        return;
      }
      var tope = el.closest('[data-tope]');
      if (tope) { regalo.tope = Number(tope.getAttribute('data-tope')); pintarRegalos(); return; }
      var para = el.closest('[data-para]');
      if (para) { regalo.para = para.getAttribute('data-para'); pintarRegalos(); return; }
      var fav = el.closest('[data-fav]');
      if (fav) { e.preventDefault(); alternarFavorito(fav.getAttribute('data-fav')); return; }
      if (el.closest('#btn-favs-todos')) {
        favoritos.forEach(function (id) { if (porId[id]) carrito[id] = Math.min(99, (carrito[id] || 0) + 1); });
        guardarPedido(); pintarPedido(); $('favoritos').close(); abrirCarrito();
        return;
      }
      if (el.closest('[data-abrir-test]')) { e.preventDefault(); cerrarMenu(); abrirTestDesdeLink(); return; }
      var resp = el.closest('[data-resp]');
      if (resp) { respuestas[PREGUNTAS[paso].k] = resp.getAttribute('data-resp'); paso++; pintarTest(); return; }
      if (el.closest('[data-test-atras]')) { paso = Math.max(0, paso - 1); pintarTest(); return; }
      if (el.closest('[data-test-reiniciar]')) { paso = 0; respuestas = {}; pintarTest(); return; }
      var add = el.closest('[data-agregar]');
      if (add) { agregar(add.getAttribute('data-agregar')); return; }
      var mas = el.closest('[data-mas]'), menos = el.closest('[data-menos]'), quitar = el.closest('[data-quitar]');
      if (mas) cambiarCantidad(mas.getAttribute('data-mas'), 1);
      else if (menos) cambiarCantidad(menos.getAttribute('data-menos'), -1);
      else if (quitar) cambiarCantidad(quitar.getAttribute('data-quitar'), -(carrito[quitar.getAttribute('data-quitar')] || 0));
      else if (el.closest('#btn-vaciar')) { carrito = {}; guardarPedido(); pintarPedido(); }
    });

    function cerrable(id, idBoton) {
      var d = $(id), ultimoFoco = null;
      if (idBoton) $(idBoton).addEventListener('click', function () { d.close(); });
      // Clic fuera de la ventana la cierra
      d.addEventListener('click', function (e) {
        if (e.target !== d) return;
        var r = d.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close();
      });
      d.addEventListener('close', function () { revisarBloqueo(); if (ultimoFoco && ultimoFoco.focus) ultimoFoco.focus(); });
      return function abrir() { ultimoFoco = doc.activeElement; d.showModal(); revisarBloqueo(); };
    }
    var abrirCarrito = cerrable('carrito', 'carrito-cerrar');
    cerrable('buscador', null);
    var abrirFavoritos = cerrable('favoritos', 'favoritos-cerrar');
    $('btn-favs').addEventListener('click', function () { pintarFavoritos(); abrirFavoritos(); });
    var abrirTest = $('test') ? cerrable('test', 'test-cerrar') : null;
    function abrirTestDesdeLink() {
      if (!abrirTest) { root.location.href = 'index.html?test=1'; return; }
      paso = 0; respuestas = {}; pintarTest(); abrirTest();
    }
    if (abrirTest && /[?&]test=1/.test(root.location.search)) setTimeout(abrirTestDesdeLink, 300);
    $('btn-carrito').addEventListener('click', function () { abrirCarrito(); });

    // Atajo: tecla / abre el buscador. Escape cierra el menú.
    root.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') cerrarMenu();
      var t = e.target && e.target.tagName;
      if (e.key === '/' && t !== 'INPUT' && t !== 'TEXTAREA' && t !== 'SELECT') { e.preventDefault(); abrirBuscador(); }
    });
    root.addEventListener('scroll', function () {
      var nav = $('navbar');
      if (nav) nav.classList.toggle('con-sombra', (root.scrollY || 0) > 8);
    }, { passive: true });
    root.addEventListener('resize', revisarBloqueo);

    // Fotos horizontales (cajas acostadas): se muestran completas sobre un fondo difuminado de la misma foto
    doc.addEventListener('load', function (e) {
      var img = e.target;
      if (!img || img.tagName !== 'IMG') return;
      var marco = img.parentNode;
      if (!marco || !marco.classList || !(marco.classList.contains('foto') || marco.classList.contains('producto__foto') || marco.classList.contains('frasco') || marco.classList.contains('cat__arco'))) return;
      if (img.naturalWidth > img.naturalHeight * 0.92) {
        marco.classList.add('marco-ancho');
        marco.style.setProperty('--fondo-foto', 'url("' + img.currentSrc.replace(/"/g, '%22') + '")');
      }
    }, true);

    // Si las fotos no cargan, explica qué ruta está buscando la página
    var fallosFoto = 0;
    doc.addEventListener('error', function (e) {
      var t = e.target;
      if (!t || t.tagName !== 'IMG') return;
      fallosFoto++;
      var caja = $('error');
      if (fallosFoto !== 3 || !caja) return;
      var ruta = (t.getAttribute && t.getAttribute('src')) || '';
      caja.hidden = false;
      caja.innerHTML = '<strong>No se encuentran las fotos.</strong><br>' +
        'La página está buscando la foto en <code>' + escapar(ruta) + '</code>.<br>' +
        'Revisa que la carpeta <code>assets</code> esté en la misma carpeta que <code>index.html</code> y que dentro tenga la carpeta <code>perfumes</code>. ' +
        'En GitHub, las mayúsculas y minúsculas de los nombres deben coincidir.';
    }, true);

    configurarContactos();
    return cargar();
  }

  if (root.document && root.document.getElementById && (root.document.getElementById('grid') || root.document.getElementById('pagina-perfume'))) {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();
  }
  root.__nix27 = { iniciar: iniciar };
})(typeof window !== 'undefined' ? window : globalThis);
