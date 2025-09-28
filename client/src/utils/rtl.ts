/**
 * Utility functions for RTL (Right-to-Left) language support
 */

// Arabic, Hebrew, Persian/Farsi, Urdu Unicode ranges
const RTL_CHAR_REGEX = /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

/**
 * Detects if text contains RTL (Right-to-Left) characters
 * @param text - The text to check
 * @returns true if text contains RTL characters
 */
export function isRTLText(text: string): boolean {
  if (!text) return false;
  return RTL_CHAR_REGEX.test(text);
}

/**
 * Gets the appropriate text direction for the given text
 * @param text - The text to analyze
 * @returns 'rtl' if text contains RTL characters, 'ltr' otherwise
 */
export function getTextDirection(text: string): 'rtl' | 'ltr' {
  return isRTLText(text) ? 'rtl' : 'ltr';
}

/**
 * Gets the appropriate text alignment for RTL text
 * @param text - The text to analyze
 * @param defaultAlign - Default alignment when not RTL
 * @returns appropriate alignment for the text direction
 */
export function getTextAlign(
  text: string,
  defaultAlign: 'left' | 'right' | 'center' | 'justify' | 'start' | 'end' = 'center'
): 'left' | 'right' | 'center' | 'justify' | 'start' | 'end' {
  if (isRTLText(text)) {
    // For RTL text, use 'center' for center alignment, 'right' for start alignment
    if (defaultAlign === 'center') return 'center';
    if (defaultAlign === 'start' || defaultAlign === 'left') return 'right';
    if (defaultAlign === 'end' || defaultAlign === 'right') return 'left';
    return defaultAlign;
  }
  return defaultAlign;
}
