/**
 * App Navigation Bar Component
 * Displays branding, 100% on-device privacy guarantee, active document statistics, and controls.
 */

import { GeminiService } from '../../core/services/gemini-service.js';

export class Navbar {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container
   * @param {Function} options.onNewUpload
   * @param {Function} options.onClearSession
   * @param {Function} options.onExportClick
   * @param {Function} options.onLanguageChange
   * @param {Function} [options.onGeminiClick]
   * @param {Function} [options.onGuideClick]
   */
  constructor({ container, onNewUpload, onClearSession, onExportClick, onLanguageChange, onGeminiClick, onGuideClick = null }) {
    this.container = container;
    this.onNewUpload = onNewUpload;
    this.onClearSession = onClearSession;
    this.onExportClick = onExportClick;
    this.onLanguageChange = onLanguageChange;
    this.onGeminiClick = onGeminiClick;
    this.onGuideClick = onGuideClick;

    this.activeDocument = null;
    this.currentLanguage = 'hin+eng';
    this.theme = 'dark';

    this.render();
  }

  setDocument(doc) {
    this.activeDocument = doc;
    this.render();
  }

  render() {
    const stats = this.activeDocument ? this.activeDocument.getStats() : null;

    this.container.innerHTML = `
      <header class="app-header">
        <div class="brand-container">
          <div class="brand-logo">अ</div>
          <div>
            <div class="brand-title">
              IndicOCR Studio
            </div>
          </div>

          <div class="privacy-badge" title="Guaranteed: Zero document content leaves your machine. All OCR and AI models run locally in WebAssembly.">
            <span>🛡️</span>
            <span>100% On-Device Processing</span>
          </div>
        </div>

        <div class="header-actions">
          ${stats ? `
            <div style="font-size: 12px; color: var(--text-secondary); display: flex; align-items: center; gap: 12px; margin-right: 8px;">
              <span><strong>${stats.pageCount}</strong> Pages</span>
              <span><strong>${Math.round(stats.avgConfidence * 100)}%</strong> Avg Confidence</span>
              ${stats.blocksNeedingReview > 0 ? `
                <span style="color: var(--warning);"><strong>${stats.blocksNeedingReview}</strong> Need Review</span>
              ` : ''}
              ${(this.activeDocument?.pages || []).some(p => p.meta?.transcribedBy === 'gemini-vision') ? `
                <span style="padding: 1px 7px; border-radius: 4px; font-size: 10px; font-weight: 700; background: rgba(138, 92, 246, 0.2); color: #c4b5fd; border: 1px solid rgba(138, 92, 246, 0.4);" title="Document contains Gemini Vision AI transcriptions">
                  ✨ Gemini Vision AI
                </span>
              ` : stats.acceptedCorrections > 0 ? `
                <span style="padding: 1px 7px; border-radius: 4px; font-size: 10px; font-weight: 700; background: rgba(59, 130, 246, 0.2); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.4);" title="${stats.acceptedCorrections} AI correction diff(s) applied">
                  🤖 AI-Enhanced (${stats.acceptedCorrections})
                </span>
              ` : `
                <span style="padding: 1px 7px; border-radius: 4px; font-size: 10px; font-weight: 700; background: rgba(148, 163, 184, 0.15); color: #94a3b8; border: 1px solid rgba(148, 163, 184, 0.25);" title="Standard unedited on-device OCR recognition">
                  ⚙️ Normal (Raw OCR)
                </span>
              `}
            </div>
          ` : ''}

          <select class="select-input" id="lang-select" title="Select Indic language model">
            <option value="hin+eng" ${this.currentLanguage === 'hin+eng' ? 'selected' : ''}>Hindi + English (Devanagari)</option>
            <option value="mar+eng" ${this.currentLanguage === 'mar+eng' ? 'selected' : ''}>Marathi + English</option>
            <option value="san" ${this.currentLanguage === 'san' ? 'selected' : ''}>Sanskrit (Devanagari)</option>
            <option value="eng" ${this.currentLanguage === 'eng' ? 'selected' : ''}>English Only</option>
          </select>

          <button class="btn btn-outline" id="btn-gemini-ai" style="padding: 6px 12px; display: flex; align-items: center; gap: 6px; border-color: rgba(167, 139, 250, 0.4); background: rgba(167, 139, 250, 0.08);" title="Google Gemini Cloud AI (Proofreading, Vision OCR & Q&A)">
            <span style="font-size: 13px;">✨</span>
            <span style="font-weight: 600; color: #a78bfa; font-size: 12px;">Gemini AI</span>
            <span style="font-size: 9px; padding: 1px 5px; border-radius: 10px; background: ${GeminiService.hasApiKey() ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 255, 255, 0.1)'}; color: ${GeminiService.hasApiKey() ? 'var(--success)' : 'var(--text-muted)'};">
              ${GeminiService.hasApiKey() ? 'Active' : 'Setup'}
            </span>
          </button>

          <button class="btn btn-outline" id="btn-user-guide" style="padding: 6px 12px; display: flex; align-items: center; gap: 6px;" title="View User Guide & AI Tutorial">
            <span style="font-size: 13px;">📖</span>
            <span style="font-size: 12px; font-weight: 600;">Guide</span>
          </button>

          ${this.activeDocument ? `
            <button class="btn btn-secondary" id="btn-export">
              <span>📥</span>
              <span>Export</span>
            </button>
            <button class="btn btn-outline" id="btn-new-upload">
              <span>+</span>
              <span>New File</span>
            </button>
            <button class="btn btn-outline" id="btn-clear-session" style="color: var(--danger); border-color: rgba(239, 68, 68, 0.3);" title="Clear current document and start fresh">
              <span>🗑️</span>
              <span>Clear</span>
            </button>
          ` : ''}

          <button class="btn btn-outline" id="btn-theme-toggle" title="Toggle theme" style="padding: 8px 10px;">
            ${this.theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </header>
    `;

    // Event listeners
    const btnGuide = this.container.querySelector('#btn-user-guide');
    if (btnGuide) {
      btnGuide.onclick = () => {
        if (this.onGuideClick) this.onGuideClick();
      };
    }

    const btnGemini = this.container.querySelector('#btn-gemini-ai');
    if (btnGemini) {
      btnGemini.onclick = () => {
        if (this.onGeminiClick) this.onGeminiClick();
      };
    }

    const btnClearSession = this.container.querySelector('#btn-clear-session');
    if (btnClearSession) {
      btnClearSession.onclick = () => {
        if (confirm('Clear current document session and start fresh? All saved pages for this document will be removed.')) {
          if (this.onClearSession) this.onClearSession();
        }
      };
    }
    const langSelect = this.container.querySelector('#lang-select');
    if (langSelect) {
      langSelect.onchange = (e) => {
        this.currentLanguage = e.target.value;
        if (this.onLanguageChange) this.onLanguageChange(this.currentLanguage);
      };
    }

    const btnExport = this.container.querySelector('#btn-export');
    if (btnExport) {
      btnExport.onclick = () => {
        if (this.onExportClick) this.onExportClick();
      };
    }

    const btnNewUpload = this.container.querySelector('#btn-new-upload');
    if (btnNewUpload) {
      btnNewUpload.onclick = () => {
        if (this.onNewUpload) this.onNewUpload();
      };
    }

    const btnTheme = this.container.querySelector('#btn-theme-toggle');
    if (btnTheme) {
      btnTheme.onclick = () => this.toggleTheme();
    }
  }

  toggleTheme() {
    this.theme = this.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', this.theme);
    this.render();
  }
}
