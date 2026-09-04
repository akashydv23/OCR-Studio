/**
 * Multi-Format Export Modal Component
 * Conforms to PRD FR-7 (Export & Output Formats)
 */

import { SearchablePdfExporter } from '../../core/export/export-searchable-pdf.js';
import { DocxExporter } from '../../core/export/export-docx.js';
import { TxtExporter } from '../../core/export/export-txt.js';
import { JsonExporter } from '../../core/export/export-json.js';

export class ExportModal {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container
   * @param {CanonicalDocument} options.document
   * @param {Function} options.onClose
   */
  constructor({ container, document, onClose }) {
    this.container = container;
    this.document = document;
    this.onClose = onClose;

    this.isExporting = false;
    this.statusMessage = '';

    this.render();
  }

  render() {
    const doc = this.document;
    const stats = doc ? doc.getStats() : {};

    this.container.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-content" style="max-width: 680px;">
          <div class="modal-header">
            <div class="modal-title">Export Digitized Document</div>
            <button class="btn btn-outline" id="btn-close-export" style="padding: 4px 8px;">✕</button>
          </div>

          <div class="modal-body">
            <div style="margin-bottom: 20px;">
              <div style="font-size: 15px; font-weight: 700;">${doc?.title || 'Document'}</div>
              <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                <span>${stats.pageCount} Pages • ${stats.totalWords} Words • ${Math.round(stats.avgConfidence * 100)}% Avg Confidence</span>
                ${(doc?.pages || []).some(p => p.meta?.transcribedBy === 'gemini-vision') ? `
                  <span style="padding: 1px 7px; border-radius: 4px; font-size: 10px; font-weight: 700; background: rgba(138, 92, 246, 0.2); color: #c4b5fd; border: 1px solid rgba(138, 92, 246, 0.4);">
                    ✨ Gemini Vision AI
                  </span>
                ` : stats.acceptedCorrections > 0 ? `
                  <span style="padding: 1px 7px; border-radius: 4px; font-size: 10px; font-weight: 700; background: rgba(59, 130, 246, 0.2); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.4);">
                    🤖 AI-Enhanced (${stats.acceptedCorrections})
                  </span>
                ` : `
                  <span style="padding: 1px 7px; border-radius: 4px; font-size: 10px; font-weight: 700; background: rgba(148, 163, 184, 0.15); color: #94a3b8; border: 1px solid rgba(148, 163, 184, 0.25);">
                    ⚙️ Normal (Raw OCR)
                  </span>
                `}
              </div>
            </div>

            ${this.isExporting ? `
              <div style="padding: 32px 16px; text-align: center;">
                <div style="font-size: 24px; margin-bottom: 12px;">⚙️</div>
                <div style="font-size: 15px; font-weight: 600; color: var(--accent-primary);">${this.statusMessage}</div>
                <div style="font-size: 12px; color: var(--text-muted); margin-top: 6px;">Generating file 100% on your device...</div>
              </div>
            ` : `
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
                <!-- Searchable PDF -->
                <div class="feature-item" style="cursor: pointer; transition: all 0.2s;" id="card-pdf">
                  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                    <span style="font-size: 20px;">📑</span>
                    <span class="brand-badge">Flagship</span>
                  </div>
                  <div class="feature-title" style="color: var(--text-primary); font-size: 14px;">Searchable PDF (.pdf)</div>
                  <div class="feature-desc">
                    Original scan images preserved 100% visually, with an invisible selectable/searchable OCR text layer.
                  </div>
                  <button class="btn btn-primary" style="width: 100%; margin-top: 14px; padding: 6px 12px; font-size: 12px;">
                    Download PDF
                  </button>
                </div>

                <!-- Microsoft Word -->
                <div class="feature-item" style="cursor: pointer;" id="card-docx">
                  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                    <span style="font-size: 20px;">📝</span>
                    <span class="brand-badge" style="background: var(--info-bg); color: var(--info);">Editable</span>
                  </div>
                  <div class="feature-title" style="color: var(--text-primary); font-size: 14px;">Word Document (.docx)</div>
                  <div class="feature-desc">
                    Native Word page breaks aligned 1:1 to source pagination, styled headings and paragraphs.
                  </div>
                  <button class="btn btn-secondary" style="width: 100%; margin-top: 14px; padding: 6px 12px; font-size: 12px;">
                    Download DOCX
                  </button>
                </div>

                <!-- Plain Text -->
                <div class="feature-item" style="cursor: pointer;" id="card-txt">
                  <div style="font-size: 20px; margin-bottom: 6px;">📄</div>
                  <div class="feature-title" style="color: var(--text-primary); font-size: 14px;">Plain Text (.txt)</div>
                  <div class="feature-desc">
                    Standardized page break markers (--- Page X ---) and clean preserved paragraph formatting.
                  </div>
                  <button class="btn btn-outline" style="width: 100%; margin-top: 14px; padding: 6px 12px; font-size: 12px;">
                    Download TXT
                  </button>
                </div>

                <!-- Canonical JSON -->
                <div class="feature-item" style="cursor: pointer;" id="card-json">
                  <div style="font-size: 20px; margin-bottom: 6px;">⚙️</div>
                  <div class="feature-title" style="color: var(--text-primary); font-size: 14px;">Canonical JSON (.json)</div>
                  <div class="feature-desc">
                    PRD §14 structured format with word bboxes, confidences, script IDs, and full audit provenance.
                  </div>
                  <button class="btn btn-outline" style="width: 100%; margin-top: 14px; padding: 6px 12px; font-size: 12px;">
                    Download JSON
                  </button>
                </div>
              </div>
            `}
          </div>

          <div class="modal-footer">
            <button class="btn btn-outline" id="btn-dismiss">Close</button>
          </div>
        </div>
      </div>
    `;

    this._bindEvents();
  }

  _bindEvents() {
    const btnClose = this.container.querySelector('#btn-close-export');
    const btnDismiss = this.container.querySelector('#btn-dismiss');

    const close = () => {
      this.container.innerHTML = '';
      if (this.onClose) this.onClose();
    };

    if (btnClose) btnClose.onclick = close;
    if (btnDismiss) btnDismiss.onclick = close;

    if (!this.isExporting) {
      const cardPdf = this.container.querySelector('#card-pdf');
      const cardDocx = this.container.querySelector('#card-docx');
      const cardTxt = this.container.querySelector('#card-txt');
      const cardJson = this.container.querySelector('#card-json');

      if (cardPdf) cardPdf.onclick = () => this._handlePdfExport();
      if (cardDocx) cardDocx.onclick = () => this._handleDocxExport();
      if (cardTxt) cardTxt.onclick = () => this._handleTxtExport();
      if (cardJson) cardJson.onclick = () => this._handleJsonExport();
    }
  }

  async _handlePdfExport() {
    try {
      this.isExporting = true;
      this.statusMessage = 'Assembling Searchable PDF with invisible text layer...';
      this.render();

      await SearchablePdfExporter.download(this.document, null, (p) => {
        this.statusMessage = `Embedding Page ${p.pageNumber} of ${p.totalPages} into Searchable PDF...`;
        const el = this.container.querySelector('.modal-body');
        if (el) this.render();
      });

      this.isExporting = false;
      this.render();
    } catch (err) {
      this.isExporting = false;
      alert(`PDF Export error: ${err.message}`);
      this.render();
    }
  }

  async _handleDocxExport() {
    try {
      this.isExporting = true;
      this.statusMessage = 'Generating DOCX with native Word page breaks...';
      this.render();

      await DocxExporter.download(this.document);
      this.isExporting = false;
      this.render();
    } catch (err) {
      this.isExporting = false;
      alert(`DOCX Export error: ${err.message}`);
      this.render();
    }
  }

  _handleTxtExport() {
    TxtExporter.download(this.document);
  }

  _handleJsonExport() {
    JsonExporter.download(this.document, false);
  }
}
