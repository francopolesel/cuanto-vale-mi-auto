import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { fmtARS, fmtUSD, fmtNum, fmtShort } from '../types';
const BRANDS = ['Toyota', 'Volkswagen', 'Ford', 'Chevrolet', 'Renault', 'Peugeot', 'Fiat', 'Honda', 'Nissan', 'Citroen', 'Jeep', 'Audi', 'BMW', 'Mercedes Benz', 'Kia', 'Hyundai'];
const YEARS = Array.from({ length: 30 }, (_, i) => new Date().getFullYear() + 1 - i);
const PAGE_SIZE = 15;
function initialTheme() {
    try {
        const saved = localStorage.getItem('cvma-theme');
        if (saved === 'light' || saved === 'dark')
            return saved;
    }
    catch {
        /* ignore */
    }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function loadHistory() {
    try {
        const raw = JSON.parse(localStorage.getItem('cvma-history') ?? '[]');
        return Array.isArray(raw) ? raw : [];
    }
    catch {
        return [];
    }
}
export function App() {
    const [theme, setTheme] = useState(initialTheme);
    const [brand, setBrand] = useState('');
    const [model, setModel] = useState('');
    const [year, setYear] = useState(new Date().getFullYear() - 5);
    const [currency, setCurrency] = useState('ARS');
    const [loading, setLoading] = useState(false);
    const [slow, setSlow] = useState(false);
    const [data, setData] = useState(null);
    const [failed, setFailed] = useState(false);
    const [formError, setFormError] = useState(null);
    const [showListings, setShowListings] = useState(false);
    const [visible, setVisible] = useState(PAGE_SIZE);
    const [sort, setSort] = useState('price-asc');
    const [history, setHistory] = useState(loadHistory);
    useEffect(() => {
        document.documentElement.dataset.theme = theme;
        try {
            localStorage.setItem('cvma-theme', theme);
        }
        catch {
            /* ignore */
        }
    }, [theme]);
    useEffect(() => {
        try {
            localStorage.setItem('cvma-history', JSON.stringify(history.slice(0, 6)));
        }
        catch {
            /* ignore */
        }
    }, [history]);
    useEffect(() => {
        if (!loading) {
            setSlow(false);
            return;
        }
        const t = setTimeout(() => setSlow(true), 5000);
        return () => clearTimeout(t);
    }, [loading]);
    async function search(b = brand, m = model, y = year) {
        if (!b.trim()) {
            setFormError('Elegí una marca para continuar.');
            return;
        }
        if (!m.trim()) {
            setFormError('Escribí el modelo para continuar.');
            return;
        }
        setFormError(null);
        setLoading(true);
        setFailed(false);
        setData(null);
        setShowListings(false);
        setVisible(PAGE_SIZE);
        try {
            const r = await fetch(`/api/valuation?brand=${encodeURIComponent(b.trim())}&model=${encodeURIComponent(m.trim())}&year=${y}`);
            if (!r.ok)
                throw new Error();
            const json = (await r.json());
            if (!json.valuation) {
                setFailed(true);
                return;
            }
            setData(json);
            setHistory((h) => [{ brand: b.trim(), model: m.trim(), year: y, price: json.valuation.average }, ...h.filter((x) => !(x.brand === b && x.model === m && x.year === y))].slice(0, 6));
        }
        catch {
            setFailed(true);
        }
        finally {
            setLoading(false);
        }
    }
    function reset() {
        setData(null);
        setFailed(false);
        setShowListings(false);
        setFormError(null);
        window.scrollTo({ top: 0 });
    }
    function goListings() {
        setShowListings(true);
        setVisible(PAGE_SIZE);
        window.scrollTo({ top: 0 });
    }
    function backToResult() {
        setShowListings(false);
        window.scrollTo({ top: 0 });
    }
    const v = currency === 'USD' ? data?.valuationUSD : data?.valuation;
    const fmt = currency === 'USD' ? fmtUSD : fmtARS;
    const sorted = data
        ? [...data.listings].sort((a, b) => {
            const pa = a.priceARS ?? a.price;
            const pb = b.priceARS ?? b.price;
            if (sort === 'price-desc')
                return pb - pa;
            if (sort === 'km-asc')
                return (a.mileage ?? Number.MAX_SAFE_INTEGER) - (b.mileage ?? Number.MAX_SAFE_INTEGER);
            return pa - pb;
        })
        : [];
    return (_jsxs("div", { className: "page", children: [_jsxs("header", { className: "navbar", children: [_jsx("a", { className: "name", href: "#", onClick: (e) => { e.preventDefault(); reset(); }, children: "Cu\u00E1nto vale mi auto" }), _jsx("button", { type: "button", className: "theme-toggle", "aria-label": theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro', "aria-pressed": theme === 'dark', onClick: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), children: theme === 'dark' ? '☀ Claro' : '☾ Oscuro' })] }), _jsxs("main", { children: [!data && !loading && !failed && (_jsxs("section", { "aria-labelledby": "search-title", children: [_jsx("h1", { className: "headline", id: "search-title", children: "\u00BFCu\u00E1nto vale tu auto?" }), _jsx("p", { className: "sub", children: "Complet\u00E1 los datos y te mostramos el valor estimado." }), _jsx("form", { className: "form", noValidate: true, onSubmit: (e) => { e.preventDefault(); search(); }, children: _jsxs("div", { className: "form-3", style: { display: 'grid', gap: 18 }, children: [_jsxs("label", { htmlFor: "brand", children: ["Marca", _jsx("input", { id: "brand", list: "brands", value: brand, onChange: (e) => setBrand(e.target.value), placeholder: "Volkswagen", autoComplete: "off" }), _jsx("datalist", { id: "brands", children: BRANDS.map((b) => _jsx("option", { value: b }, b)) })] }), _jsxs("label", { htmlFor: "model", children: ["Modelo", _jsx("input", { id: "model", value: model, onChange: (e) => setModel(e.target.value), placeholder: "Gol Trend", autoComplete: "off" })] }), _jsxs("label", { htmlFor: "year", children: ["A\u00F1o", _jsx("select", { id: "year", value: year, onChange: (e) => setYear(Number(e.target.value)), children: YEARS.map((y) => _jsx("option", { value: y, children: y }, y)) })] }), _jsx("button", { className: "cta", type: "submit", children: "Buscar valor" })] }) }), formError && _jsx("p", { className: "form-error", role: "alert", children: formError }), !formError && _jsx("p", { className: "hint", children: "Con la marca, el modelo y el a\u00F1o alcanza." }), history.length > 0 && (_jsxs("section", { className: "history", "aria-label": "\u00DAltimas b\u00FAsquedas", children: [_jsx("h2", { children: "\u00DAltimas b\u00FAsquedas" }), history.map((h, i) => (_jsxs("button", { type: "button", onClick: () => { setBrand(h.brand); setModel(h.model); setYear(h.year); search(h.brand, h.model, h.year); }, children: [_jsxs("span", { children: [h.brand, " ", h.model, " ", h.year] }), _jsx("small", { children: fmtShort(h.price) })] }, i)))] }))] })), loading && (_jsx("section", { "aria-live": "polite", children: _jsxs("p", { className: "status", children: ["Buscando el valor de tu auto\u2026", slow && _jsx("small", { children: "Estamos revisando publicaciones del mercado, ya casi est\u00E1." })] }) })), failed && !loading && (_jsxs("section", { children: [_jsx("p", { className: "status", children: "No encontramos suficientes datos para estimar este modelo." }), _jsx("div", { className: "actions", children: _jsx("button", { type: "button", className: "btn-secondary", onClick: reset, children: "Volver a buscar" }) })] })), data && v && !showListings && (_jsxs("section", { "aria-labelledby": "result-title", children: [_jsxs("div", { className: "vehicle", children: [_jsxs("h1", { id: "result-title", children: [data.vehicle.brand, " ", data.vehicle.model] }), _jsx("p", { children: data.vehicle.year })] }), _jsx("p", { className: "question", children: "\u00BFCu\u00E1nto vale?" }), _jsx("p", { className: "price", children: fmt(v.average) }), _jsx("p", { className: "caption", children: "Precio estimado" }), _jsxs("div", { className: "range", children: ["Entre ", fmt(v.min), " y ", fmt(v.max), _jsx("small", { children: "Rango de mercado observado" })] }), _jsxs("p", { className: "updated", children: ["Actualizado ", new Date(data.queriedAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })] }), _jsxs("div", { className: "currency", role: "group", "aria-label": "Moneda", children: [_jsx("button", { type: "button", "aria-pressed": currency === 'ARS', onClick: () => setCurrency('ARS'), children: "Pesos" }), _jsx("button", { type: "button", "aria-pressed": currency === 'USD', onClick: () => setCurrency('USD'), children: "D\u00F3lares" })] }), _jsxs("div", { className: "actions", children: [_jsx("button", { type: "button", className: "btn-primary", onClick: goListings, children: "Ver publicaciones" }), _jsx("button", { type: "button", className: "btn-secondary", onClick: reset, children: "Buscar otro auto" })] }), _jsxs("details", { className: "more", children: [_jsx("summary", { children: "M\u00E1s detalles \u25BE" }), _jsxs("div", { className: "body", children: [_jsxs("p", { children: ["Promedio: ", _jsx("strong", { children: fmt(v.average) })] }), _jsxs("p", { children: ["Rango: ", _jsxs("strong", { children: [fmt(v.min), " \u2013 ", fmt(v.max)] })] }), _jsxs("p", { children: ["Publicaciones analizadas: ", _jsx("strong", { children: fmtNum(data.comparables.total) })] }), _jsxs("p", { children: ["Actualizaci\u00F3n: ", _jsx("strong", { children: new Date(data.queriedAt).toLocaleString('es-AR') })] })] })] })] })), data && showListings && (_jsxs("section", { "aria-labelledby": "listings-title", children: [_jsxs("div", { className: "sticky", children: [_jsxs("button", { type: "button", className: "back", onClick: backToResult, "aria-label": "Volver a la valuaci\u00F3n", children: [_jsx("span", { className: "arrow", "aria-hidden": "true", children: "\u2190" }), " Volver a la valuaci\u00F3n"] }), _jsxs("span", { className: "where", children: [data.vehicle.brand, " ", data.vehicle.model, " ", data.vehicle.year] })] }), _jsxs("div", { className: "listings-head", children: [_jsx("h1", { id: "listings-title", children: "Publicaciones" }), _jsxs("p", { children: [data.vehicle.brand, " ", data.vehicle.model, " ", data.vehicle.year, " \u00B7 ", sorted.length, " avisos"] })] }), _jsxs("div", { className: "sort-row", children: [_jsx("label", { htmlFor: "sort", children: "Ordenar por:" }), _jsxs("select", { id: "sort", value: sort, onChange: (e) => setSort(e.target.value), children: [_jsx("option", { value: "price-asc", children: "Precio m\u00E1s bajo" }), _jsx("option", { value: "price-desc", children: "Precio m\u00E1s alto" }), _jsx("option", { value: "km-asc", children: "Menor kilometraje" })] })] }), sorted.slice(0, visible).map((l, i) => (_jsxs("article", { className: "listing", children: [_jsx("h2", { children: l.title }), _jsxs("p", { className: "meta", children: [l.year, l.mileage ? ` · ${fmtNum(l.mileage)} km` : ''] }), _jsx("p", { className: "amount", children: fmtARS(l.priceARS ?? l.price) }), _jsx("p", { className: "src", children: l.source }), _jsx("a", { className: "visit", href: l.url, target: "_blank", rel: "noreferrer", children: "Ver publicaci\u00F3n" })] }, i))), visible < sorted.length && (_jsxs("button", { type: "button", className: "load-more", onClick: () => setVisible((n) => n + PAGE_SIZE), children: ["Mostrar m\u00E1s (", sorted.length - visible, " restantes)"] }))] }))] }, data ? (showListings ? 'listings' : 'result') : 'search'), _jsxs("footer", { children: [_jsx("p", { className: "contact-title", children: "\u00BFQuer\u00E9s contactarme?" }), _jsx("p", { className: "contact-name", children: "Franco Polesel" }), _jsxs("p", { className: "contact-links", children: [_jsx("a", { href: "mailto:francopolesel99@gmail.com", children: "\u2709 francopolesel99@gmail.com" }), _jsx("span", { "aria-hidden": "true", children: " \u00B7 " }), _jsx("a", { href: "https://github.com/francopolesel", target: "_blank", rel: "noreferrer", children: "GitHub" }), _jsx("span", { "aria-hidden": "true", children: " \u00B7 " }), _jsx("a", { href: "https://ar.linkedin.com/in/franco-paul-polesel", target: "_blank", rel: "noreferrer", children: "LinkedIn" })] })] })] }));
}
