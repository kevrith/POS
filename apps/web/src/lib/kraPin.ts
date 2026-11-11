/** A KRA PIN: A (an individual) or P (a company), nine digits, a letter. The server checks the same shape. */
export const isValidKraPin = (value: string): boolean => /^[AP]\d{9}[A-Z]$/.test(value.trim().toUpperCase());
