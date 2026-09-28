import { jsx as _jsx } from "react/jsx-runtime";
import { useMemo } from 'react';
export function Histogram({ values }) {
    const { bins, max } = useMemo(() => {
        if (!values.length)
            return { bins: [], max: 0 };
        const BINS = 18;
        const min = Math.min(...values);
        const maxV = Math.max(...values);
        const span = maxV - min || 1;
        const bins = new Array(BINS).fill(0);
        for (const v of values) {
            const i = Math.min(BINS - 1, Math.floor(((v - min) / span) * BINS));
            bins[i]++;
        }
        return { bins, max: Math.max(...bins) };
    }, [values]);
    if (!values.length)
        return null;
    return (_jsx("div", { style: { display: 'flex', alignItems: 'flex-end', gap: 4, height: 120, marginTop: 12 }, "aria-label": "Distribuci\u00F3n de precios", children: bins.map((b, i) => (_jsx("div", { title: `${b} publicaciones`, style: {
                flex: 1,
                height: `${Math.max(4, (b / max) * 110)}px`,
                background: 'linear-gradient(180deg,#7c6cf5,#3ec6f0)',
                borderRadius: '4px 4px 0 0',
                opacity: 0.9,
            } }, i))) }));
}
