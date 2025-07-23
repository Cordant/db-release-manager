export type Expression = string & { brand: 'Expression' }

export const dynamicStringCache = new Map<Expression, string>();