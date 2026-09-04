/**
 * Bulk Upload Zone & Pre-Flight Inspector Component
 * Conforms to PRD FR-1 (Bulk File Ingestion) & FR-2 (Concurrency Setup)
 */

import { PreflightAnalyzer } from '../../core/ingestion/preflight.js';

export class UploadZone {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container
   * @param {Function} options.onStartJob Callback when user confirms processing
   */
  constructor({ container, existingDoc = null, onResumeDoc = null, onDiscardDoc = null, onStartJob, onOpenGuide = null }) {
    this.container = container;
    this.existingDoc = existingDoc;
    this.onResumeDoc = onResumeDoc;
    this.onDiscardDoc = onDiscardDoc;
    this.onStartJob = onStartJob;
    this.onOpenGuide = onOpenGuide;

    this.preflightReport = null;
    this.selectedFiles = null;
    this.concurrency = Math.min(Math.max((navigator.hardwareConcurrency || 4) - 1, 1), 4);
    this.selectedLanguage = 'hin+eng';
    this.options = {
      enableDeskew: true,
      enableBinarization: true,
      enableContrast: true
    };

    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="upload-screen">
        <div class="dropzone-card" id="dropzone">
          ${this.existingDoc ? `
            <div style="background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.4); border-radius: var(--radius-md); padding: 14px 18px; margin-bottom: 24px; text-align: left; display: flex; align-items: center; justify-content: space-between; gap: 14px;">
              <div style="display: flex; align-items: center; gap: 12px; min-width: 0;">
                <span style="font-size: 26px; flex-shrink: 0;">🔄</span>
                <div style="min-width: 0;">
                  <div style="font-weight: 700; font-size: 14px; color: var(--text-primary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
                    Previous Session: "${this.existingDoc.title}"
                  </div>
                  <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
                    ${(this.existingDoc.pages || []).length} of ${this.existingDoc.source_page_count || 0} pages saved in on-device storage (IndexedDB).
                  </div>
                </div>
              </div>

              <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
                <button class="btn btn-primary" id="btn-resume-existing" style="padding: 7px 16px; font-size: 12px;">
                  <span>▶</span>
                  <span>Resume</span>
                </button>
                <button class="btn btn-outline" id="btn-discard-existing" style="padding: 7px 12px; font-size: 12px; color: var(--danger); border-color: rgba(239, 68, 68, 0.3);" title="Discard saved session and start fresh">
                  <span>🗑️</span>
                  <span>Discard</span>
                </button>
              </div>
            </div>
          ` : ''}

          <div class="dropzone-icon">📄</div>
          <h2 class="dropzone-title">Upload Documents for On-Device Indic OCR</h2>
          <p class="dropzone-subtitle">
            Drag & drop PDF files (up to <strong>200–300+ pages</strong>) or batches of scanned images.<br/>
            All processing is performed <strong>100% on your device</strong> — zero data ever leaves your browser.
          </p>

          <input type="file" id="file-input" accept="application/pdf,image/png,image/jpeg,image/tiff" multiple style="display: none;" />

          <div style="display: flex; gap: 12px; justify-content: center; margin-bottom: 14px;">
            <button class="btn btn-primary" id="btn-browse" style="padding: 10px 24px; font-size: 14px;">
              <span>📁</span>
              <span>Select PDF / Scanned Images</span>
            </button>
            <button class="btn btn-secondary" id="btn-sample" style="padding: 10px 18px; font-size: 14px;">
              <span>⚡</span>
              <span>Load Sample Hindi Document</span>
            </button>
          </div>

          <div style="display: flex; justify-content: center; margin-bottom: 24px;">
            <button class="btn btn-outline" id="btn-open-guide-card" style="padding: 6px 18px; font-size: 12px; border-color: rgba(245, 158, 11, 0.4); background: rgba(245, 158, 11, 0.08); color: var(--text-primary); border-radius: 999px; display: flex; align-items: center; gap: 8px;" title="Open interactive guide and AI walkthrough">
              <span>📖</span>
              <span>New to IndicOCR? <strong>View Quick Start & AI Walkthrough</strong> →</span>
            </button>
          </div>

          <div class="dropzone-features">
            <div class="feature-item">
              <div class="feature-title">Bulk 300+ Pages</div>
              <div class="feature-desc">Chunked streaming prevents browser memory limits & tab crashes.</div>
            </div>
            <div class="feature-item">
              <div class="feature-title">1:1 Layout Fidelity</div>
              <div class="feature-desc">Preserves exact source page breaks & paragraph structures.</div>
            </div>
            <div class="feature-item">
              <div class="feature-title">Agentic AI Review</div>
              <div class="feature-desc">Context-aware correction diffs. Never silently overwrites source text.</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Preflight Modal -->
      <div id="preflight-modal-container"></div>
    `;

    this._bindEvents();
  }

  _bindEvents() {
    const dropzone = this.container.querySelector('#dropzone');
    const fileInput = this.container.querySelector('#file-input');
    const btnBrowse = this.container.querySelector('#btn-browse');
    const btnSample = this.container.querySelector('#btn-sample');
    const btnResume = this.container.querySelector('#btn-resume-existing');
    const btnDiscard = this.container.querySelector('#btn-discard-existing');
    const btnGuide = this.container.querySelector('#btn-open-guide-card');

    if (btnGuide) {
      btnGuide.onclick = () => {
        if (this.onOpenGuide) this.onOpenGuide();
      };
    }

    if (btnResume) {
      btnResume.onclick = () => {
        if (this.onResumeDoc) this.onResumeDoc(this.existingDoc);
      };
    }

    if (btnDiscard) {
      btnDiscard.onclick = () => {
        if (confirm(`Discard previous session "${this.existingDoc.title}" and remove saved pages?`)) {
          const docId = this.existingDoc.document_id;
          this.existingDoc = null;
          this.render();
          if (this.onDiscardDoc) this.onDiscardDoc(docId);
        }
      };
    }

    btnBrowse.onclick = () => fileInput.click();

    fileInput.onchange = async (e) => {
      if (e.target.files && e.target.files.length > 0) {
        await this._handleFiles(e.target.files);
      }
    };

    dropzone.ondragover = (e) => {
      e.preventDefault();
      dropzone.classList.add('drag-active');
    };

    dropzone.ondragleave = () => {
      dropzone.classList.remove('drag-active');
    };

    dropzone.ondrop = async (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-active');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        await this._handleFiles(e.dataTransfer.files);
      }
    };

    btnSample.onclick = () => this._loadSampleDocument();
  }

  async _handleFiles(files) {
    try {
      this.selectedFiles = files;
      const report = await PreflightAnalyzer.analyze(files);
      this.preflightReport = report;
      this._showPreflightModal();
    } catch (err) {
      alert(`Pre-flight inspection error: ${err.message}`);
    }
  }

  _showPreflightModal() {
    const modalContainer = this.container.querySelector('#preflight-modal-container');
    const r = this.preflightReport;

    modalContainer.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-content">
          <div class="modal-header">
            <div class="modal-title">Document Pre-Flight Inspection</div>
            <button class="btn btn-outline" id="btn-close-modal" style="padding: 4px 8px;">✕</button>
          </div>

          <div class="modal-body">
            <div class="preflight-grid">
              <div class="stat-box">
                <div class="stat-label">File Name</div>
                <div class="stat-value" style="font-size: 14px; word-break: break-all;">${r.fileName}</div>
              </div>
              <div class="stat-box">
                <div class="stat-label">Page Count</div>
                <div class="stat-value" style="color: var(--accent-primary);">${r.pageCount} Pages</div>
              </div>
              <div class="stat-box">
                <div class="stat-label">File Size</div>
                <div class="stat-value" style="font-size: 15px;">${r.fileSizeFormatted}</div>
              </div>
              <div class="stat-box">
                <div class="stat-label">Estimated Duration</div>
                <div class="stat-value" style="color: var(--success); font-size: 15px;">${r.estimatedDurationFormatted}</div>
              </div>
            </div>

            ${r.warnings && r.warnings.length > 0 ? `
              <div style="margin-bottom: 16px;">
                ${r.warnings.map(w => `
                  <div style="padding: 8px 12px; background: var(--info-bg); border-left: 3px solid var(--info); font-size: 12px; margin-bottom: 6px; border-radius: var(--radius-sm);">
                    ℹ️ ${w.text}
                  </div>
                `).join('')}
              </div>
            ` : ''}

            <div style="background: var(--bg-primary); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 14px;">
              <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 10px;">Processing Options</div>
              
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <label style="font-size: 13px;">Target Language</label>
                <select class="select-input" id="preflight-lang">
                  <option value="hin+eng" selected>Hindi + English (Devanagari)</option>
                  <option value="mar+eng">Marathi + English</option>
                  <option value="san">Sanskrit (Devanagari)</option>
                  <option value="eng">English Only</option>
                </select>
              </div>

              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <label style="font-size: 13px;">Parallel Workers (WASM SIMD)</label>
                <input type="range" id="concurrency-range" min="1" max="4" value="${this.concurrency}" style="width: 120px;" />
                <span id="concurrency-val" style="font-size: 13px; font-weight: 700; width: 24px;">${this.concurrency}</span>
              </div>

              <div style="display: flex; gap: 16px; margin-top: 10px; font-size: 12px;">
                <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                  <input type="checkbox" id="chk-deskew" checked />
                  <span>Auto-Deskew</span>
                </label>
                <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                  <input type="checkbox" id="chk-sauvola" checked />
                  <span>Sauvola Binarization</span>
                </label>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn btn-outline" id="btn-cancel-modal">Cancel</button>
            <button class="btn btn-primary" id="btn-confirm-start" style="padding: 10px 20px;">
              <span>🚀</span>
              <span>Start On-Device Processing</span>
            </button>
          </div>
        </div>
      </div>
    `;

    // Modal listeners
    const btnClose = modalContainer.querySelector('#btn-close-modal');
    const btnCancel = modalContainer.querySelector('#btn-cancel-modal');
    const btnConfirm = modalContainer.querySelector('#btn-confirm-start');
    const rangeInput = modalContainer.querySelector('#concurrency-range');
    const rangeVal = modalContainer.querySelector('#concurrency-val');
    const langSelect = modalContainer.querySelector('#preflight-lang');
    const chkDeskew = modalContainer.querySelector('#chk-deskew');
    const chkSauvola = modalContainer.querySelector('#chk-sauvola');

    const closeModal = () => { modalContainer.innerHTML = ''; };
    btnClose.onclick = closeModal;
    btnCancel.onclick = closeModal;

    rangeInput.oninput = (e) => {
      this.concurrency = parseInt(e.target.value, 10);
      rangeVal.textContent = this.concurrency;
    };

    btnConfirm.onclick = () => {
      this.selectedLanguage = langSelect.value;
      this.options.enableDeskew = chkDeskew.checked;
      this.options.enableBinarization = chkSauvola.checked;

      closeModal();
      if (this.onStartJob) {
        this.onStartJob({
          preflight: this.preflightReport,
          files: this.selectedFiles,
          language: this.selectedLanguage,
          concurrency: this.concurrency,
          options: this.options
        });
      }
    };
  }

  loadSampleDocument() {
    return this._loadSampleDocument();
  }

  async _loadSampleDocument() {
    // Generate an authentic 2-page Devanagari scan simulation canvas and convert to File
    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = 1200;
    sampleCanvas.height = 1600;
    const ctx = sampleCanvas.getContext('2d');

    // Lightly aged parchment background
    ctx.fillStyle = '#fbf9f4';
    ctx.fillRect(0, 0, 1200, 1600);

    // Title / Heading
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 36px "Noto Sans Devanagari", sans-serif';
    ctx.fillText('भारतीय संविधान एवं मौलिक अधिकार', 120, 160);

    // Subtitle
    ctx.font = '24px "Noto Sans Devanagari", sans-serif';
    ctx.fillText('अध्याय ३ : नागरिक अधिकार एवं कर्तव्य (भाग १)', 120, 220);

    // Paragraph 1
    ctx.font = '22px "Noto Sans Devanagari", sans-serif';
    ctx.fillText('भारत का संविधान प्रत्येक नागरिक को समता, स्वतंत्रता एवं न्याय का अधिकार प्रदान करता है।', 120, 320);
    ctx.fillText('सर्वोच्च न्यायालय एवं उच्च न्यायालय मौलिक अधिकारों के संरक्षण हेतु अनुच्छेद ३२ एवं २२६', 120, 360);
    ctx.fillText('के अंतर्गत रिट याचिका स्वीकार करते हैं। विधि का शासन ही प्रजातंत्र का आधार है।', 120, 400);

    // Paragraph 2 with intentional ligature test & code mixing
    ctx.fillText('नागरिकों के अधिकारों की सुरक्षा के लिए सरकार एवं प्रशासन सदैव कटिबद्ध हैं।', 120, 480);
    ctx.fillText('Article 21 guarantees Right to Life and Personal Liberty to all citizens.', 120, 520);
    ctx.fillText('प्रत्येक व्यक्ति को विचार, अभिव्यक्ति एवं विश्वास की पूर्ण स्वतंत्रता प्राप्त है।', 120, 560);

    // Binarization & photocopy texture simulation
    ctx.fillStyle = 'rgba(0, 0, 0, 0.03)';
    for (let i = 0; i < 400; i++) {
      ctx.fillRect(Math.random() * 1200, Math.random() * 1600, 2, 2);
    }

    sampleCanvas.toBlob(async (blob) => {
      const sampleFile = new File([blob], 'sample_indic_scan.png', { type: 'image/png' });
      await this._handleFiles([sampleFile]);
    }, 'image/png');
  }
}
