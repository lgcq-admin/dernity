// POSIX single-quote quoting: the result is one shell word whatever the input contains.
export const shellQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
