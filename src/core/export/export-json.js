/**
 * Canonical JSON & Audit Log Exporter
 * Conforms to PRD FR-7 & §14 (Canonical Structured Representation)
 */

export class JsonExporter {
  /**
   * Export document to canonical JSON format
   * @param {CanonicalDocument} document
   * @param {boolean} [pretty=true]
   * @returns {string} JSON string
   */
  static export(document, pretty = true) {
    const rawObj = document.toJSON ? document.toJSON() : document;
    return JSON.stringify(rawObj, null, pretty ? 2 : 0);
  }

  /**
   * Export processing audit log
   * @param {CanonicalDocument} document
   * @returns {string} Audit report JSON string
   */
  static exportAuditLog(document) {
    const rawObj = document.toJSON ? document.toJSON() : document;
    const audit = {
      document_id: rawObj.document_id,
      title: rawObj.title,
      source_page_count: rawObj.source_page_count,
      primary_language: rawObj.primary_language,
      generated_at: new Date().toISOString(),
      provenance: {
        engine: rawObj.metadata?.engine || 'IndicOCR-v2-OnDevice',
        environment: 'Browser Client-Side (WASM / WebGPU)',
        zero_data_transmission: true
      },
      stats: rawObj.stats,
      page_audit: (rawObj.pages || []).map(p => ({
        page_number: p.page_number,
        status: p.status,
        dimensions: p.dimensions,
        qa_summary: p.meta?.qaSummary,
        corrections_applied: (p.blocks || []).flatMap(b => (b.corrections || []).filter(c => c.status === 'accepted'))
      }))
    };

    return JSON.stringify(audit, null, 2);
  }

  /**
   * Trigger download in browser
   * @param {CanonicalDocument} document
   * @param {boolean} [isAudit=false]
   */
  static download(document, isAudit = false) {
    const content = isAudit ? this.exportAuditLog(document) : this.export(document);
    const blob = new Blob([content], { type: 'application/json' });
    const suffix = isAudit ? '_audit_log.json' : '_canonical.json';
    const name = `${document.title || 'document'}${suffix}`;

    const link = window.document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  }
}
