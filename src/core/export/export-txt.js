/**
 * Plain Text Exporter
 * Conforms to PRD FR-7 (Export: Plain text with explicit page breaks and paragraph structure)
 */

export class TxtExporter {
  /**
   * Export Canonical Document to formatted plain text string
   * @param {CanonicalDocument} document
   * @param {Object} [options]
   * @param {boolean} [options.includeMetadata=true]
   * @returns {string} Plain text content
   */
  static export(document, { includeMetadata = true } = {}) {
    const lines = [];

    if (includeMetadata) {
      lines.push(`================================================================================`);
      lines.push(`DOCUMENT: ${document.title || 'Untitled Document'}`);
      lines.push(`TOTAL PAGES: ${document.source_page_count || document.pages.length}`);
      lines.push(`PRIMARY LANGUAGE: ${document.primary_language}`);
      lines.push(`DIGITIZED AT: ${document.updated_at || new Date().toISOString()}`);
      lines.push(`ENGINE: IndicOCR-v2 (On-Device Client-Side)`);
      lines.push(`================================================================================\n\n`);
    }

    const pages = document.pages || [];

    for (let p = 0; p < pages.length; p++) {
      const page = pages[p];
      const pageNum = page.page_number || (p + 1);

      // Explicit, standard page marker (PRD FR-7)
      lines.push(`--- [ PAGE ${pageNum} OF ${document.source_page_count || pages.length} ] ---\n`);

      const blocks = page.blocks || [];
      for (const block of blocks) {
        const text = (block.text || '').trim();
        if (!text) continue;

        if (block.type === 'heading') {
          lines.push(`${text.toUpperCase()}\n`);
        } else {
          lines.push(`${text}\n`);
        }
      }

      lines.push('\n');
    }

    return lines.join('\n');
  }

  /**
   * Download as .txt file in browser
   * @param {CanonicalDocument} document
   * @param {string} [filename]
   */
  static download(document, filename = null) {
    const content = this.export(document);
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const name = filename || `${document.title || 'document'}_digitized.txt`;

    const link = window.document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  }
}
