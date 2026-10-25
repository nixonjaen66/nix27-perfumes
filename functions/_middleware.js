// Vista previa al compartir un perfume (WhatsApp, Instagram, Facebook...).
// Esos servicios no ejecutan JavaScript, así que aquí, en Cloudflare, se cambian
// el título, la descripción y la foto de perfume.html?p=... antes de enviar la página.
// No hay que tocar nada: lee data/catalogo.json en cada visita.

function normalizar(t) {
  return String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
// Igual que slug() en js/app.js
function slug(p) {
  const base = [p.marca, p.nombre, p.tipo === 'Tester' ? 'tester' : '', p.ml ? p.ml + 'ml' : ''].join(' ');
  return normalizar(base).replace(/&/g, ' y ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function esVisible(p) { return !!p && p.activo !== false && (!!p.imagen || p.tipo === 'Set'); }
function buscar(catalogo, slugPedido, idPedido) {
  const vistos = {};
  let encontrado = null;
  for (const p of catalogo.filter(esVisible)) {
    let s = slug(p);
    if (vistos[s]) s = s + '-' + p.id;
    vistos[s] = true;
    if ((slugPedido && s === slugPedido) || (idPedido && String(p.id) === String(idPedido))) { encontrado = p; break; }
  }
  return encontrado;
}
function precio(n) { return '₡' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
function escaparXml(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
// Enlace oficial de cada perfume (Cloudflare quita el .html de las direcciones)
function enlaceOficial(origen, s) { return origen + '/perfume?p=' + encodeURIComponent(s); }

// Mapa del sitio para Google, generado a partir del catálogo
async function mapaDelSitio(url, env) {
  const r = await env.ASSETS.fetch(new URL('/data/catalogo.json', url.origin));
  const catalogo = await r.json();
  const vistos = {};
  const urls = [url.origin + '/'];
  for (const p of catalogo.filter(esVisible)) {
    let s = slug(p);
    if (vistos[s]) s = s + '-' + p.id;
    vistos[s] = true;
    urls.push(enlaceOficial(url.origin, s));
  }
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((u) => '  <url><loc>' + escaparXml(u) + '</loc></url>').join('\n') + '\n</urlset>\n';
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}
function escaparAttr(t) { return String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);
  if (url.pathname === '/sitemap.xml') {
    try { return await mapaDelSitio(url, env); } catch (e) { return next(); }
  }
  if (url.pathname !== '/perfume' && url.pathname !== '/perfume.html') return next();
  const slugPedido = url.searchParams.get('p');
  const idPedido = url.searchParams.get('id');
  const resp = await next();
  if (!slugPedido && !idPedido) return resp;
  if (!resp.ok || !(resp.headers.get('content-type') || '').includes('text/html')) return resp;

  let p = null;
  try {
    const r = await env.ASSETS.fetch(new URL('/data/catalogo.json', url.origin));
    p = buscar(await r.json(), slugPedido, idPedido);
  } catch (e) {
    return resp;
  }
  if (!p) return resp;

  const tipo = p.tipo === 'Tester' ? ' (Tester)' : '';
  const titulo = p.nombre + ' de ' + p.marca + tipo + (p.precio != null ? ' · ' + precio(p.precio) : '');
  const descripcion = (p.descripcion ? p.descripcion + ' ' : '') + '100% original, envíos a todo Costa Rica. Pídelo por WhatsApp.';
  const imagen = p.imagen ? url.origin + '/assets' + encodeURI(p.imagen) : url.origin + '/assets/marca/og-image.jpg';
  const enlace = enlaceOficial(url.origin, slugPedido || slug(p));
  // Datos de producto para Google (precio, marca, foto)
  const datos = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.nombre + tipo,
    brand: { '@type': 'Brand', name: p.marca },
    image: [imagen],
    description: p.descripcion || (p.marca + ' ' + p.nombre),
    sku: String(p.id),
    category: p.categoria,
    url: enlace
  };
  if (p.precio != null) {
    datos.offers = {
      '@type': 'Offer',
      price: String(p.precio),
      priceCurrency: 'CRC',
      availability: 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/NewCondition',
      url: enlace,
      seller: { '@type': 'Organization', name: 'nix27_perfumes' }
    };
  }
  const jsonLd = JSON.stringify(datos).replace(/</g, '\\u003c');

  const poner = (valor) => ({ element(e) { e.setAttribute('content', valor); } });
  return new HTMLRewriter()
    .on('title', { element(e) { e.setInnerContent(titulo + ' | nix27_perfumes'); } })
    .on('meta[name="description"]', poner(descripcion))
    .on('meta[property="og:type"]', poner('product'))
    .on('meta[property="og:title"]', poner(titulo))
    .on('meta[property="og:description"]', poner(descripcion))
    .on('meta[property="og:image"]', poner(imagen))
    .on('meta[property="og:image:width"]', { element(e) { e.remove(); } })
    .on('meta[property="og:image:height"]', { element(e) { e.remove(); } })
    .on('head', {
      element(e) {
        e.append('<link rel="canonical" href="' + escaparAttr(enlace) + '">' +
          '<script type="application/ld+json">' + jsonLd + '</script>' +
          '<meta property="og:url" content="' + escaparAttr(enlace) + '">' +
          '<meta property="og:image:alt" content="' + escaparAttr(p.marca + ' ' + p.nombre) + '">' +
          (p.precio != null ? '<meta property="product:price:amount" content="' + p.precio + '"><meta property="product:price:currency" content="CRC">' : ''), { html: true });
      }
    })
    .transform(resp);
}
