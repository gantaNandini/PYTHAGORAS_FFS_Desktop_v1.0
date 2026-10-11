export const pick = (d, keys) => Object.fromEntries(keys.map(k => [k, d[k]]));
