# Cuánto vale mi auto — Valuador argentino de usados

App web que estima el valor de mercado de un auto usado en Argentina a partir de **publicaciones reales** (Mercado Libre, Autocosmos, Kavak, DeMotores), con análisis estadístico propio, sin IA ni servicios pagos.

## Qué hace

Ingresás `Marca + Modelo + Año` → el backend consulta múltiples fuentes, normaliza, filtra, deduplica, elimina outliers, convierte USD→ARS con cotización gratuita (DolarAPI) y devuelve:

- Rango estimado (P10–P90), promedio, mediana
- Mismo rango en ARS y USD (toggle en la UI, dólar oficial por defecto)
- Min/max observados, percentiles, desvío, cantidad de publicaciones, fuentes, distribución (histograma), versiones, kilometraje mediano, nivel de confianza, lista de publicaciones con link, fecha/hora y metodología.

## Arquitectura

```
frontend/ (React + TS + Vite)
backend/src/
  scrapers/      MercadoLibre (API pública) · Autocosmos (HTML+JSON-LD) · Kavak (HTML/JSON) · DeMotores (HTML)
  services/      exchangeRate · normalizer · filter · deduplicator · statistics · confidence · orchestrator · cache
  routes/        GET /api/valuation · GET /api/dollar · GET /api/brands
```

Pipeline: `RAW → NORMALIZE (ARS) → HARD-FILTER (solo inválidos) → DEDUPLICATE → TIME-ADJUST (Theil-Sen) → OUTLIERS (IQR/MAD) → WEIGHTED STATISTICS → VALUATION (P10–P90 ponderados) → CONFIDENCE`.

## Valuación por comparables (búsqueda progresiva)

El sistema NO exige coincidencias exactas para estimar. Cada publicación recibe un
**peso de similitud** `total = modelo × año × versión × kilometraje`:

- **Modelo** (genérico, sin reglas por vehículo): marca con alias + primer token del modelo
  obligatorios; todos los tokens → `EXACT` (1.0); familia/variante (`Gol` vs `Gol Trendline`) → `VARIANT` (0.8–0.9); otra cosa → `INVALID` (se descarta).
- **Año**: peso gradual 1.0 → 0.9 (±1) → 0.75 (±2) → 0.55 (±3); fuera de `YEAR_WINDOW` (default ±3) se descarta.
- **Versión**: si la búsqueda incluye tokens extra (ej. `Corolla XEI`), bonifica títulos que los contengan; con búsqueda base no penaliza.
- **Kilometraje**: presente 1.0, ausente 0.95 (resta, no destruye).

**Fases**: LEVEL 1 (búsqueda exacta + pipeline completo) → si los comparables/peso efectivo
no alcanzan los umbrales (`MIN_COMPARABLES=8`, `MIN_EFFECTIVE_WEIGHT=5`), LEVEL 2-3
re-busca el modelo **sin año** (más páginas) y re-ejecuta el pipeline sobre todo lo
acumulado → LEVEL 4-5 pondera variantes y años cercanos. La decisión de ampliar usa el
resultado del pipeline, nunca un conteo crudo previo.

**Ajuste temporal**: medianas por año + tendencia robusta Theil-Sen; solo con ≥3 años de
≥4 muestras y pendiente verosímil (≤40% de la mediana/año). Si no, passthrough documentado.

**Estimación**: media/mediana/P10–P90 **ponderados** sobre precios ajustados; rango = P10–P90
ponderados.
**Filtros opcionales** (`mileage`, `version`): son pesos suaves, nunca compuertas.
El km pondera por cercanía (decaimiento gaussiano) y, con ≥15 comparables con km,
normaliza precios con tendencia robusta decreciente; la versión bonifica coincidencias.
Si la muestra sigue corta, el pipeline relaja versión y luego km (LEVEL 6) y lo informa
en `appliedFilters.relaxed`. La confianza (ALTA/MEDIA/BAJA) es una salida: muestra efectiva, % exactos,
fuentes, dispersión (CV) y calidad de datos. `INSUFICIENTE` solo si no hay base ni con
comparables. La respuesta incluye `comparables.byYear`, `methodology` narrativa y objeto
`debug` con fases, matching y filtrado.

Agregar una fuente = crear una clase `CarDataSource` en `src/scrapers/` y registrarla en `registry.ts`. Ningún cambio al núcleo.

## Dólar (ARS + USD)

- Fuente: **DolarAPI** (`https://dolarapi.com/v1/dolares/<tipo>`), pública y gratuita, sin key.
- Estrategia por defecto: `OFICIAL` (el más representativo para precios de vehículos en concesionarias argentinas); fallback `mayorista/bolsa/blue` si el tipo pedido falla. Todo queda registrado en `exchangeRate { source, strategy, arsPerUsd, fetchedAt, fallback }` y visible en la UI.
- La UI muestra el toggle **ARS/USD**; los USD se derivan del rango ARS con el mismo tipo de cambio (no se inventa otro).

## Instalación / ejecución

```bash
npm install
npm run dev      # backend :3000 + frontend :5173
# o por separado:
npm run dev --workspace=backend
npm run dev --workspace=frontend
npm run build
npm start        # backend compilado
npm test --workspace=backend
```

Abrí http://localhost:5173 → Marca: Toyota, Modelo: Corolla, Año: 2020 → Buscar valor.

## Cómo compartirlo con amigos (deploy gratis)

La forma más fácil: **Render (plan free) con el `render.yaml` incluido**.
El backend sirve al frontend desde el mismo origen, así que es un solo servicio y un solo link.

1. Subí el repo a GitHub.
2. Creá una cuenta en Render y elegí **New → Blueprint**, conectá el repo.
3. Render detecta `render.yaml` y crea el servicio `cuanto-vale-mi-auto` (plan free).
4. Abrí la URL que te da Render y pasala. Listo.

Atajos y advertencias honestas:

- El plan free "duerme" el servicio sin tráfico: la primera visita puede tardar ~1 min en despertar.
- La caché SQLite es efímera en Render (se pierde con cada deploy/reinicio); no guarda nada importante.
- El scraping corre desde IPs de datacenter: algunos sitios bloquean más que desde tu casa. Si una fuente falla, la app sigue con las demás y lo muestra.
- Alternativa instantánea sin deploy (para probar con alguien al lado): corré `npm run build` + `npm start` y exponé el puerto 3000 con un túnel (ej. Cloudflare Tunnel: `cloudflared tunnel --url http://localhost:3000`). El link dura lo que dure tu PC encendida.

## Variables de entorno (backend/.env)

```
PORT=3000
SCRAPE_DELAY_MS=400
MAX_CONCURRENT_SCRAPERS=3
REQUEST_TIMEOUT_MS=15000
CACHE_TTL_MINUTES=60
MAX_PAGES_PER_SOURCE=4
MAX_LISTINGS_PER_SOURCE=120
DOLLAR_STRATEGY=OFICIAL
FRONTEND_ORIGIN=http://localhost:5173
```

## UI

Filosofía ("Cuánto vale mi auto"): herramienta clara y accesible. Una sola pregunta —
¿cuánto vale tu auto? — con formulario etiquetado (marca/modelo/año), precio protagonista,
rango secundario, toggle Pesos/Dólares, historial local y pantalla de publicaciones con
header sticky para volver. Modos claro y oscuro con tokens, contraste alto, botones ≥48px
y navegación por teclado. Sin dashboards, gráficos, ni jerga del algoritmo en la interfaz.

## Fuentes y scraping responsable

- Mercado Libre: API pública de búsqueda (`api.mercadolibre.com/sites/MLA/search`), sin browser.
  Nota 2026: ese endpoint devuelve `403` para búsquedas web; el scraper lo intenta igual y cae automáticamente
  al plan B: HTML de `autos.mercadolibre.com.ar` + JSON embebido `__NORDIC_RENDERING_CTX__` (parseo lineal, sin regex gigantes).
- Resto: `fetch` + JSON-LD → HTML tolerante → texto visible. Sin Playwright obligatorio (se puede añadir solo si una fuente lo exige), sin CAPTCHA-bypass, sin login, con timeout, retries limitados, concurrencia ≤3, delay entre fuentes, paginación acotada y cache 60 min. Si una fuente falla → `success:false` y el sistema sigue con las demás.

## Metodología

Filtrado duro (sin precio/año válido, anticipo/cuota, precio absurdo, marca/modelo fuera de
familia, año fuera de ventana) → scoring de similitud → dedup (sourceId/URL + fuzzy
título+año+km+precio±2%) → ajuste temporal Theil-Sen → outliers IQR/MAD sobre precios
ajustados → stats ponderadas (P10–P90, media, mediana) → valuación + confianza de salida.
Ver sección "Valuación por comparables".

## Limitaciones

- Los sitios cambian: los selectores son tolerantes pero alguna fuente puede caer (se informa en la UI).
- 0 km se etiqueta `NEW_OR_NEAR_NEW`; versiones se agrupan y muestran, no se separan en la valuación v1.
- Guía CCA/Autocosmos: no se mezcla con el observado (se puede agregar como referencia separada a futuro).

## Tests

`npm test --workspace=backend` — unit (normalización, precios, km, años, FX, dedup, outliers, media/mediana/percentiles, validación) + fixtures HTML (`backend/fixtures/`) para `HTML → parser → CarListing` sin internet.
