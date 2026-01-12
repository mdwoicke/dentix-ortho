/**
 * Clipboard utility with fallback for non-secure contexts
 * (e.g., accessing via local IP address without HTTPS)
 */

/**
 * Copy text to clipboard with fallback for non-secure contexts
 * @param text - The text to copy to clipboard
 * @returns Promise that resolves when copy is successful
 * @throws Error if copy fails
 */
export async function copyToClipboard(text: string): Promise<void> {
  // Try modern clipboard API first (requires secure context)
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  // Fallback for non-secure contexts (e.g., local IP access)
  const textArea = document.createElement('textarea');
  textArea.value = text;

  // Prevent scrolling to bottom of page
  textArea.style.position = 'fixed';
  textArea.style.left = '-999999px';
  textArea.style.top = '-999999px';
  textArea.style.opacity = '0';

  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    const successful = document.execCommand('copy');
    if (!successful) {
      throw new Error('execCommand copy failed');
    }
  } finally {
    document.body.removeChild(textArea);
  }
}
