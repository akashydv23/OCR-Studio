/**
 * Side-by-Side Review Studio Component
 * Conforms to PRD FR-6 (Review & Correction UI) & FR-4 (Layout Preservation)
 * 
 * Features:
 * - Left Pane: Original scan viewer with confidence-coded bounding box overlay & zoom/pan controls
 * - Right Pane: Structured text editor with paragraph hierarchy, inline editing & diff integration
 * - Synchronized navigation & hover between image bboxes and text blocks
 * - Bottom Bar: Virtualized page filmstrip with page status badges (Completed, Needs Review)
 */

import { Storage } from '../../core/storage/db.js';
import { DiffInspector } from './DiffInspector.js';
import { GeminiService } from '../../core/services/gemini-service.js';
import { CanonicalBlock } from '../../core/model/canonical-doc.js';

export class ReviewStudio {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container
   * @param {CanonicalDocument} options.document
   * @param {Function} [options.onDocUpdated]
   * @param {Function} [options.onOpenGeminiModal]
   */
  constructor({ container, document, onDocUpdated = null, onOpenGeminiModal = null }) {
    this.container = container;
    this.document = document;
    this.onDocUpdated = onDocUpdated;
    this.onOpenGeminiModal = onOpenGeminiModal;

    this.activePageNumber = 1;
    this.activeBlockId = null;
    this.zoomLevel = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.isHandToolActive = false;
    this.isSpacePressed = false;
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.filterMode = 'all'; // all | needs_review | completed
    this.diffInspector = null;
    this.activeImageRecord = null;
    this.isGeminiProofreading = false;
    this.isGeminiTranscribing = false;

    // Window event listener references for cleanup
    this._onWindowMouseMove = null;
    this._onWindowMouseUp = null;
    this._onWindowKeyDown = null;
    this._onWindowKeyUp = null;

    this.render();
  }

  setDocument(doc) {
    this.document = doc;
    this.activePageNumber = 1;
    this.panX = 0;
    this.panY = 0;
    this.zoomLevel = 1.0;
    this.render();
  }

  async setPage(pageNumber) {
    this.activePageNumber = pageNumber;
    this.activeBlockId = null;
    this.panX = 0;
    this.panY = 0;
    await this._renderActivePage();
    this._applyZoom();
    this._updateFilmstripHighlight();
  }

  render() {
    if (!this.document || !this.document.pages.length) {
      const isProcessing = this.document && this.document.source_page_count > 0;
      this.container.innerHTML = `
        <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--text-secondary); gap: 14px; padding: 32px;">
          ${isProcessing ? `
            <div style="font-size: 40px; animation: spin 2s linear infinite;">⚙️</div>
            <div style="font-size: 16px; font-weight: 700; color: var(--text-primary);">Processing Document On-Device</div>
            <div style="font-size: 13px; color: var(--text-muted); max-width: 440px; text-align: center; line-height: 1.6;">
              Running client-side WASM OCR and multi-agent layout analysis.<br/>
              Page 1 will appear in this split-screen studio immediately once recognized.
            </div>
          ` : `
            <div style="font-size: 14px; color: var(--text-muted);">No document loaded.</div>
          `}
        </div>
      `;
      return;
    }

    this.container.innerHTML = `
      <div class="studio-layout">
        <!-- Left Pane: Original Scan Viewport -->
        <div class="studio-left">
          <div class="pane-toolbar">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span>📄 Original Scan (Page <span id="lbl-page-num">${this.activePageNumber}</span>)</span>
            </div>
            <div class="toolbar-controls">
              <button class="btn btn-outline ${this.isHandToolActive ? 'active' : ''}" id="btn-tool-hand" title="Hand Tool: Click & drag to pan (or hold Spacebar)" style="padding: 4px 8px; font-size: 12px; display: flex; align-items: center; gap: 4px;">
                <span>✋</span> <span>Hand</span>
              </button>
              <div style="width: 1px; height: 16px; background: var(--border-subtle); margin: 0 2px;"></div>
              <button class="btn btn-outline" id="btn-zoom-out" style="padding: 4px 8px;" title="Zoom Out">−</button>
              <span id="lbl-zoom" style="font-size: 12px; font-weight: 700; width: 40px; text-align: center;">100%</span>
              <button class="btn btn-outline" id="btn-zoom-in" style="padding: 4px 8px;" title="Zoom In">+</button>
              <button class="btn btn-outline" id="btn-zoom-fit" style="padding: 4px 8px;" title="Reset Zoom & Pan">Fit</button>
            </div>
          </div>

          <div class="scan-viewport" id="scan-viewport">
            <div class="scan-canvas-wrapper" id="scan-wrapper">
              <img id="scan-img" class="scan-image" alt="Scanned page" />
              <div class="scan-bbox-overlay" id="bbox-overlay"></div>
            </div>
          </div>
        </div>

        <!-- Right Pane: Structured Text Editor & Diff Inspector -->
        <div class="studio-right">
          <div class="pane-toolbar">
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <span>✏️ Structured Indic Text</span>
              <span class="brand-badge" id="lbl-page-status">Done</span>
              <span class="brand-badge" id="lbl-result-source" style="font-size: 11px; padding: 2px 8px; border-radius: 4px; font-weight: 600;">⚙️ Normal (Raw OCR)</span>
            </div>
            <div class="toolbar-controls">
              <button class="btn btn-outline" id="btn-prev-page" title="Previous page">◀</button>
              <span style="font-size: 12px;">
                Page <input type="number" id="input-page-jump" min="1" max="${this.document.source_page_count || this.document.pages.length}" value="${this.activePageNumber}" style="width: 44px; padding: 2px 4px; background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border-subtle); border-radius: 4px; text-align: center;" />
                of ${this.document.source_page_count || this.document.pages.length}
              </span>
              <button class="btn btn-outline" id="btn-next-page" title="Next page">▶</button>
            </div>
          </div>

          <!-- Gemini AI Assistant Action Bar -->
          <div class="gemini-sub-toolbar" style="display: flex; align-items: center; justify-content: space-between; padding: 6px 14px; background: rgba(138, 92, 246, 0.08); border-bottom: 1px solid rgba(138, 92, 246, 0.2); font-size: 12px;">
            <div style="display: flex; align-items: center; gap: 6px; font-weight: 600; color: #c4b5fd;">
              <span>✨ Gemini Cloud AI</span>
            </div>
            <div style="display: flex; gap: 6px; align-items: center;">
              <button class="btn btn-outline" id="btn-gemini-proofread" ${this.isGeminiProofreading ? 'disabled' : ''} style="padding: 3px 9px; font-size: 11px; border-color: rgba(167, 139, 250, 0.35); color: #e9d5ff;" title="Run deep Indic linguistic proofreading with Gemini to generate inspectable diffs">
                ${this.isGeminiProofreading ? '⏳ Proofreading...' : '🔍 Proofread Page'}
              </button>
              <button class="btn btn-outline" id="btn-gemini-rescan" ${this.isGeminiTranscribing ? 'disabled' : ''} style="padding: 3px 9px; font-size: 11px; border-color: rgba(167, 139, 250, 0.35); color: #e9d5ff;" title="Re-scan page image with Gemini Multimodal Vision">
                ${this.isGeminiTranscribing ? '⏳ Transcribing...' : '📷 Vision Re-scan'}
              </button>
              <button class="btn btn-outline" id="btn-gemini-insights" style="padding: 3px 9px; font-size: 11px; border-color: rgba(167, 139, 250, 0.35); color: #e9d5ff;" title="Summarize document or ask questions with Gemini">
                💡 Summary & Q&A
              </button>
            </div>
          </div>

          <div class="editor-viewport" id="editor-viewport">
            <div class="editor-card" id="editor-card">
              <!-- Content rendered dynamically -->
            </div>

            <!-- Diff Inspector Drawer -->
            <div id="diff-drawer" style="margin-top: 24px; border-top: 1px solid var(--border-subtle);"></div>
          </div>
        </div>
      </div>

      <!-- Bottom Filmstrip -->
      <div class="filmstrip-container" id="filmstrip">
        <!-- Thumbnails rendered dynamically -->
      </div>
    `;

    this._bindEvents();
    this._renderFilmstrip();
    this._renderActivePage();
  }

  _cleanupGlobalEvents() {
    if (this._onWindowMouseMove) {
      window.removeEventListener('mousemove', this._onWindowMouseMove);
      this._onWindowMouseMove = null;
    }
    if (this._onWindowMouseUp) {
      window.removeEventListener('mouseup', this._onWindowMouseUp);
      this._onWindowMouseUp = null;
    }
    if (this._onWindowKeyDown) {
      window.removeEventListener('keydown', this._onWindowKeyDown);
      this._onWindowKeyDown = null;
    }
    if (this._onWindowKeyUp) {
      window.removeEventListener('keyup', this._onWindowKeyUp);
      this._onWindowKeyUp = null;
    }
  }

  _updateCursorAndToolState() {
    const scanViewport = this.container.querySelector('#scan-viewport');
    const btnHand = this.container.querySelector('#btn-tool-hand');
    const isHand = this.isHandToolActive || this.isSpacePressed;

    if (scanViewport) {
      scanViewport.classList.toggle('hand-mode', isHand);
    }
    if (btnHand) {
      btnHand.classList.toggle('active', this.isHandToolActive);
    }
  }

  _bindEvents() {
    this._cleanupGlobalEvents();

    const btnHand = this.container.querySelector('#btn-tool-hand');
    const btnZoomIn = this.container.querySelector('#btn-zoom-in');
    const btnZoomOut = this.container.querySelector('#btn-zoom-out');
    const btnZoomFit = this.container.querySelector('#btn-zoom-fit');
    const scanViewport = this.container.querySelector('#scan-viewport');
    const btnPrevPage = this.container.querySelector('#btn-prev-page');
    const btnNextPage = this.container.querySelector('#btn-next-page');
    const inputJump = this.container.querySelector('#input-page-jump');

    if (btnHand) {
      btnHand.onclick = () => {
        this.isHandToolActive = !this.isHandToolActive;
        this._updateCursorAndToolState();
      };
    }

    btnZoomIn.onclick = () => {
      this.zoomLevel = Math.min(3.0, this.zoomLevel + 0.2);
      this._applyZoom();
    };

    btnZoomOut.onclick = () => {
      this.zoomLevel = Math.max(0.4, this.zoomLevel - 0.2);
      this._applyZoom();
    };

    btnZoomFit.onclick = () => {
      this.zoomLevel = 1.0;
      this.panX = 0;
      this.panY = 0;
      this._applyZoom();
    };

    btnPrevPage.onclick = () => {
      if (this.activePageNumber > 1) {
        this.setPage(this.activePageNumber - 1);
      }
    };

    btnNextPage.onclick = () => {
      const maxPages = this.document.source_page_count || this.document.pages.length;
      if (this.activePageNumber < maxPages) {
        this.setPage(this.activePageNumber + 1);
      }
    };

    inputJump.onchange = (e) => {
      const val = parseInt(e.target.value, 10);
      const maxPages = this.document.source_page_count || this.document.pages.length;
      if (val >= 1 && val <= maxPages) {
        this.setPage(val);
      } else {
        e.target.value = this.activePageNumber;
      }
    };

    // Scan Viewport Dragging (Hand tool, Spacebar held, middle click, or click on background)
    if (scanViewport) {
      scanViewport.addEventListener('mousedown', (e) => {
        const isBackground = e.target === scanViewport;
        const shouldPan = this.isHandToolActive || this.isSpacePressed || e.button === 1 || e.altKey || isBackground;

        if (shouldPan && (e.button === 0 || e.button === 1)) {
          this.isDragging = true;
          this.dragStartX = e.clientX - this.panX;
          this.dragStartY = e.clientY - this.panY;
          scanViewport.classList.add('is-dragging');
          e.preventDefault();
        }
      });

      // Wheel pan & zoom
      scanViewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
          // Pinch to zoom or Ctrl+Wheel
          const zoomDelta = -e.deltaY * 0.005;
          this.zoomLevel = Math.max(0.4, Math.min(3.0, this.zoomLevel + zoomDelta));
          this._applyZoom();
        } else {
          // Pan viewport
          this.panX -= e.deltaX;
          this.panY -= e.deltaY;
          this._applyZoom();
        }
      }, { passive: false });

      // Touch drag
      let touchStartX = 0;
      let touchStartY = 0;
      scanViewport.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
          const touch = e.touches[0];
          touchStartX = touch.clientX - this.panX;
          touchStartY = touch.clientY - this.panY;
        }
      }, { passive: true });

      scanViewport.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1) {
          const touch = e.touches[0];
          this.panX = touch.clientX - touchStartX;
          this.panY = touch.clientY - touchStartY;
          this._applyZoom();
        }
      }, { passive: true });
    }

    this._onWindowMouseMove = (e) => {
      if (!this.isDragging) return;
      this.panX = e.clientX - this.dragStartX;
      this.panY = e.clientY - this.dragStartY;
      this._applyZoom();
    };
    window.addEventListener('mousemove', this._onWindowMouseMove);

    this._onWindowMouseUp = () => {
      if (this.isDragging) {
        this.isDragging = false;
        const vp = this.container.querySelector('#scan-viewport');
        if (vp) vp.classList.remove('is-dragging');
      }
    };
    window.addEventListener('mouseup', this._onWindowMouseUp);

    this._onWindowKeyDown = (e) => {
      if (e.code === 'Space') {
        const activeEl = document.activeElement;
        const isInput = activeEl && (['INPUT', 'TEXTAREA'].includes(activeEl.tagName) || activeEl.isContentEditable);
        if (!isInput) {
          this.isSpacePressed = true;
          this._updateCursorAndToolState();
          e.preventDefault();
        }
      }
    };
    window.addEventListener('keydown', this._onWindowKeyDown);

    this._onWindowKeyUp = (e) => {
      if (e.code === 'Space') {
        this.isSpacePressed = false;
        this._updateCursorAndToolState();
      }
    };
    window.addEventListener('keyup', this._onWindowKeyUp);

    // Gemini AI Buttons
    const btnProofread = this.container.querySelector('#btn-gemini-proofread');
    if (btnProofread) {
      btnProofread.onclick = () => this._handleGeminiProofread();
    }

    const btnRescan = this.container.querySelector('#btn-gemini-rescan');
    if (btnRescan) {
      btnRescan.onclick = () => this._handleGeminiRescan();
    }

    const btnInsights = this.container.querySelector('#btn-gemini-insights');
    if (btnInsights) {
      btnInsights.onclick = () => {
        if (this.onOpenGeminiModal) this.onOpenGeminiModal('insights');
      };
    }

    this._updateCursorAndToolState();
  }

  _applyZoom() {
    const scanWrapper = this.container.querySelector('#scan-wrapper');
    const lblZoom = this.container.querySelector('#lbl-zoom');
    if (scanWrapper) {
      scanWrapper.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoomLevel})`;
      scanWrapper.style.transformOrigin = 'center center';
    }
    if (lblZoom) {
      lblZoom.textContent = `${Math.round(this.zoomLevel * 100)}%`;
    }
  }

  _updateResultIndicators(page) {
    const lblResultSource = this.container.querySelector('#lbl-result-source');
    if (!lblResultSource || !page) return;

    if (page.meta?.transcribedBy === 'gemini-vision') {
      lblResultSource.textContent = '✨ Gemini Vision AI';
      lblResultSource.style.background = 'rgba(138, 92, 246, 0.2)';
      lblResultSource.style.color = '#c4b5fd';
      lblResultSource.style.border = '1px solid rgba(138, 92, 246, 0.4)';
      lblResultSource.title = 'Page transcribed directly using Google Gemini Multimodal Vision AI';
    } else {
      const acceptedCount = (page.blocks || []).reduce((acc, b) => acc + (b.corrections?.filter(c => c.status === 'accepted').length || 0), 0);
      const proposedCount = (page.blocks || []).reduce((acc, b) => acc + (b.corrections?.filter(c => c.status === 'proposed').length || 0), 0);

      if (acceptedCount > 0) {
        lblResultSource.textContent = `🤖 AI-Corrected (${acceptedCount} applied)`;
        lblResultSource.style.background = 'rgba(59, 130, 246, 0.2)';
        lblResultSource.style.color = '#93c5fd';
        lblResultSource.style.border = '1px solid rgba(59, 130, 246, 0.4)';
        lblResultSource.title = `${acceptedCount} AI correction diff(s) accepted and applied on this page`;
      } else if (proposedCount > 0) {
        lblResultSource.textContent = `⚙️ Normal OCR (${proposedCount} AI diffs pending)`;
        lblResultSource.style.background = 'rgba(245, 158, 11, 0.15)';
        lblResultSource.style.color = '#fbbf24';
        lblResultSource.style.border = '1px solid rgba(245, 158, 11, 0.35)';
        lblResultSource.title = 'Displaying normal raw OCR text; AI suggestions are pending review in the drawer below';
      } else {
        lblResultSource.textContent = '⚙️ Normal (Raw OCR)';
        lblResultSource.style.background = 'rgba(148, 163, 184, 0.12)';
        lblResultSource.style.color = '#cbd5e1';
        lblResultSource.style.border = '1px solid rgba(148, 163, 184, 0.25)';
        lblResultSource.title = 'Displaying unmodified on-device OCR recognition output';
      }
    }
  }

  async _renderActivePage() {
    const page = this.document.getPage(this.activePageNumber);
    if (!page) return;

    // Update headers
    const lblNum = this.container.querySelector('#lbl-page-num');
    const inputJump = this.container.querySelector('#input-page-jump');
    const lblStatus = this.container.querySelector('#lbl-page-status');

    if (lblNum) lblNum.textContent = this.activePageNumber;
    if (inputJump) inputJump.value = this.activePageNumber;

    if (lblStatus) {
      const isReview = page.status === 'needs_review';
      lblStatus.textContent = isReview ? 'Needs Review' : 'Verified';
      lblStatus.style.background = isReview ? 'var(--warning-bg)' : 'var(--success-bg)';
      lblStatus.style.color = isReview ? 'var(--warning)' : 'var(--success)';
    }

    // Update page-level result indicator (Normal vs AI-Based)
    this._updateResultIndicators(page);

    // 1. Fetch & display original image
    const scanImg = this.container.querySelector('#scan-img');
    const bboxOverlay = this.container.querySelector('#bbox-overlay');
    bboxOverlay.innerHTML = '';

    const imgRecord = await Storage.getPageImage(this.document.document_id, this.activePageNumber);
    if (imgRecord && imgRecord.image_blob) {
      const url = URL.createObjectURL(imgRecord.image_blob);
      scanImg.src = url;

      scanImg.onload = () => {
        this._renderBoundingBoxes(page, scanImg.naturalWidth || page.width, scanImg.naturalHeight || page.height);
        this._applyZoom();
      };
      if (scanImg.complete && scanImg.naturalWidth) {
        this._renderBoundingBoxes(page, scanImg.naturalWidth || page.width, scanImg.naturalHeight || page.height);
        this._applyZoom();
      }
    }

    // 2. Render structured editor blocks
    this._renderEditorBlocks(page);

    // 3. Initialize Diff Inspector
    const diffDrawer = this.container.querySelector('#diff-drawer');
    const firstBlockWithDiffs = page.blocks.find(b => b.corrections && b.corrections.length > 0) || page.blocks[0];

    this.diffInspector = new DiffInspector({
      container: diffDrawer,
      onAcceptDiff: (block, idx) => {
        block.acceptCorrection(idx);
        this._updateBlockDom(block);
        this._updateResultIndicators(page);
        this._savePageAndDoc();
      },
      onRejectDiff: (block, idx) => {
        block.rejectCorrection(idx);
        this._updateBlockDom(block);
        this._updateResultIndicators(page);
        this._savePageAndDoc();
      },
      onAcceptAll: (block) => {
        for (let i = 0; i < (block.corrections || []).length; i++) {
          block.acceptCorrection(i);
        }
        this._updateBlockDom(block);
        this._updateResultIndicators(page);
        this._savePageAndDoc();
      }
    });

    this.diffInspector.setBlock(firstBlockWithDiffs);
  }

  _renderBoundingBoxes(page, naturalW, naturalH) {
    const overlay = this.container.querySelector('#bbox-overlay');
    overlay.innerHTML = '';

    const scaleX = 1.0;
    const scaleY = 1.0;

    for (const block of page.blocks) {
      const lines = block.lines || [];

      for (const line of lines) {
        const words = line.words || [];

        for (const word of words) {
          const [x, y, w, h] = word.bbox || [0, 0, 0, 0];
          if (w === 0 || h === 0) continue;

          const conf = word.confidence !== undefined ? word.confidence : 0.9;
          const confClass = conf >= 0.88 ? 'bbox-high' : (conf >= 0.72 ? 'bbox-med' : 'bbox-low');

          const boxEl = document.createElement('div');
          boxEl.className = `bbox-highlight ${confClass}`;
          boxEl.id = `bbox_${word.id}`;

          // Percentage positioning for perfect scaling
          boxEl.style.left = `${(x / naturalW) * 100}%`;
          boxEl.style.top = `${(y / naturalH) * 100}%`;
          boxEl.style.width = `${(w / naturalW) * 100}%`;
          boxEl.style.height = `${(h / naturalH) * 100}%`;

          boxEl.title = `Word: "${word.text}" • Confidence: ${Math.round(conf * 100)}%`;

          boxEl.onclick = () => {
            this._highlightCorrespondingWord(word.id, block.block_id);
          };

          overlay.appendChild(boxEl);
        }
      }
    }
  }

  _renderEditorBlocks(page) {
    const editorCard = this.container.querySelector('#editor-card');
    editorCard.innerHTML = '';

    for (const block of page.blocks) {
      const blockEl = document.createElement('div');
      blockEl.className = 'block-item';
      blockEl.id = `block_${block.block_id}`;

      const isHeading = block.type === 'heading';
      const confPct = Math.round((block.confidence || 0.9) * 100);

      const isGeminiPage = page.meta?.transcribedBy === 'gemini-vision';
      const hasAccepted = (block.corrections || []).some(c => c.status === 'accepted');
      const hasProposed = (block.corrections || []).some(c => c.status === 'proposed');

      let sourceTag = '';
      if (isGeminiPage) {
        sourceTag = `<span style="padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; background: rgba(138, 92, 246, 0.2); color: #c4b5fd; border: 1px solid rgba(138, 92, 246, 0.4);" title="Generated by Gemini Multimodal Vision AI">✨ Gemini AI</span>`;
      } else if (hasAccepted) {
        sourceTag = `<span style="padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; background: rgba(59, 130, 246, 0.2); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.4);" title="AI linguistic corrections applied to this paragraph">🤖 AI Corrected</span>`;
      } else if (hasProposed) {
        sourceTag = `<span style="padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.35);" title="Raw OCR text; AI suggestions are pending review">⚙️ Normal OCR</span>`;
      } else {
        sourceTag = `<span style="padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; background: rgba(148, 163, 184, 0.12); color: #94a3b8; border: 1px solid rgba(148, 163, 184, 0.25);" title="Original unedited on-device OCR recognition">⚙️ Normal (Raw OCR)</span>`;
      }

      blockEl.innerHTML = `
        <div class="block-meta-tag" id="meta_${block.block_id}">
          ${sourceTag}
          <span>•</span>
          <span>${isHeading ? '🏷️ HEADING' : '¶ PARAGRAPH'} #${block.reading_order}</span>
          <span>•</span>
          <span style="color: ${confPct >= 85 ? 'var(--success)' : 'var(--warning)'};">${confPct}% conf</span>
          <span>•</span>
          <span>${block.script}</span>
          ${(block.corrections && block.corrections.length > 0) ? `
            <span>•</span>
            <span style="color: var(--accent-primary); cursor: pointer;" class="diff-trigger">
              🤖 ${block.corrections.length} AI Diff(s)
            </span>
          ` : ''}
        </div>

        <div class="${isHeading ? 'block-heading' : 'block-paragraph'} indic-text" 
             contenteditable="true" 
             id="text_${block.block_id}" 
             spellcheck="false">
          ${this._escapeHtml(block.text)}
        </div>
      `;

      // Event listener for inline editing
      const textDiv = blockEl.querySelector(`#text_${block.block_id}`);
      textDiv.oninput = (e) => {
        block.text = e.target.innerText;
        this._savePageAndDoc();
      };

      // Click to focus block and update Diff Inspector
      blockEl.onclick = () => {
        this.activeBlockId = block.block_id;
        this.container.querySelectorAll('.block-item').forEach(el => el.classList.remove('focused'));
        blockEl.classList.add('focused');
        if (this.diffInspector) {
          this.diffInspector.setBlock(block);
        }
      };

      editorCard.appendChild(blockEl);
    }
  }

  _updateBlockDom(block) {
    const textDiv = this.container.querySelector(`#text_${block.block_id}`);
    if (textDiv) {
      textDiv.innerText = block.text;
    }
    const metaDiv = this.container.querySelector(`#meta_${block.block_id}`);
    if (metaDiv) {
      const page = this.document.getPage(this.activePageNumber);
      const isHeading = block.type === 'heading';
      const confPct = Math.round((block.confidence || 0.9) * 100);
      const isGeminiPage = page?.meta?.transcribedBy === 'gemini-vision';
      const hasAccepted = (block.corrections || []).some(c => c.status === 'accepted');
      const hasProposed = (block.corrections || []).some(c => c.status === 'proposed');

      let sourceTag = '';
      if (isGeminiPage) {
        sourceTag = `<span style="padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; background: rgba(138, 92, 246, 0.2); color: #c4b5fd; border: 1px solid rgba(138, 92, 246, 0.4);" title="Generated by Gemini Multimodal Vision AI">✨ Gemini AI</span>`;
      } else if (hasAccepted) {
        sourceTag = `<span style="padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; background: rgba(59, 130, 246, 0.2); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.4);" title="AI linguistic corrections applied to this paragraph">🤖 AI Corrected</span>`;
      } else if (hasProposed) {
        sourceTag = `<span style="padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.35);" title="Raw OCR text; AI suggestions are pending review">⚙️ Normal OCR</span>`;
      } else {
        sourceTag = `<span style="padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; background: rgba(148, 163, 184, 0.12); color: #94a3b8; border: 1px solid rgba(148, 163, 184, 0.25);" title="Original unedited on-device OCR recognition">⚙️ Normal (Raw OCR)</span>`;
      }

      metaDiv.innerHTML = `
        ${sourceTag}
        <span>•</span>
        <span>${isHeading ? '🏷️ HEADING' : '¶ PARAGRAPH'} #${block.reading_order}</span>
        <span>•</span>
        <span style="color: ${confPct >= 85 ? 'var(--success)' : 'var(--warning)'};">${confPct}% conf</span>
        <span>•</span>
        <span>${block.script}</span>
        ${(block.corrections && block.corrections.length > 0) ? `
          <span>•</span>
          <span style="color: var(--accent-primary); cursor: pointer;" class="diff-trigger">
            🤖 ${block.corrections.length} AI Diff(s)
          </span>
        ` : ''}
      `;
    }
  }

  _highlightCorrespondingWord(wordId, blockId) {
    const blockEl = this.container.querySelector(`#block_${blockId}`);
    if (blockEl) {
      blockEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      blockEl.classList.add('focused');
    }
  }

  async _renderFilmstrip() {
    const filmstrip = this.container.querySelector('#filmstrip');
    filmstrip.innerHTML = '';

    const pages = this.document.pages || [];

    for (const page of pages) {
      const pageNum = page.page_number;
      const thumbEl = document.createElement('div');
      thumbEl.className = `filmstrip-thumb ${pageNum === this.activePageNumber ? 'active' : ''}`;
      thumbEl.id = `thumb_p_${pageNum}`;

      const img = document.createElement('img');
      img.className = 'thumb-img';

      // Load thumbnail blob from IndexedDB
      const imgRecord = await Storage.getPageImage(this.document.document_id, pageNum);
      if (imgRecord && imgRecord.thumbnail_blob) {
        img.src = URL.createObjectURL(imgRecord.thumbnail_blob);
      } else if (imgRecord && imgRecord.image_blob) {
        img.src = URL.createObjectURL(imgRecord.image_blob);
      }

      const badge = document.createElement('div');
      badge.className = 'thumb-badge';
      badge.textContent = `P${pageNum}`;

      thumbEl.appendChild(img);
      thumbEl.appendChild(badge);

      thumbEl.onclick = () => this.setPage(pageNum);
      filmstrip.appendChild(thumbEl);
    }
  }

  _updateFilmstripHighlight() {
    this.container.querySelectorAll('.filmstrip-thumb').forEach(el => el.classList.remove('active'));
    const activeThumb = this.container.querySelector(`#thumb_p_${this.activePageNumber}`);
    if (activeThumb) {
      activeThumb.classList.add('active');
      activeThumb.scrollIntoView({ behavior: 'smooth', inline: 'center' });
    }
  }

  async _savePageAndDoc() {
    const page = this.document.getPage(this.activePageNumber);
    if (page) {
      await Storage.savePageData(this.document.document_id, this.activePageNumber, page.toJSON());
      await Storage.saveDocument(this.document);
      if (this.onDocUpdated) this.onDocUpdated(this.document);
    }
  }

  async _handleGeminiProofread() {
    if (!GeminiService.hasApiKey()) {
      if (confirm('A Google Gemini API key is required to use AI proofreading. Would you like to configure it now?')) {
        if (this.onOpenGeminiModal) this.onOpenGeminiModal('settings');
      }
      return;
    }

    const page = this.document.getPage(this.activePageNumber);
    if (!page || !page.blocks || !page.blocks.length) return;

    this.isGeminiProofreading = true;
    this.render();

    try {
      const pageText = page.blocks.map(b => b.text).join('\n\n');
      const diffs = await GeminiService.proofreadText(pageText, this.document.primary_language || 'hin');

      if (!diffs.length) {
        alert('Gemini AI reviewed this page: No OCR errors detected! The text appears clean.');
        return;
      }

      let addedCount = 0;
      for (const diff of diffs) {
        const targetBlock = page.blocks.find(b => b.text.includes(diff.original)) || page.blocks[0];
        if (targetBlock) {
          targetBlock.corrections = targetBlock.corrections || [];
          const exists = targetBlock.corrections.some(c => c.original === diff.original && c.suggested === diff.suggested);
          if (!exists) {
            targetBlock.corrections.push({
              id: `diff_gemini_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              original: diff.original,
              suggested: diff.suggested,
              reason: `Gemini AI: ${diff.reason}`,
              confidenceGain: diff.confidenceGain || 0.25,
              status: 'proposed',
              source: 'gemini'
            });
            targetBlock.needs_review = true;
            addedCount++;
          }
        }
      }

      await this._savePageAndDoc();
      alert(`Gemini AI proposed ${addedCount} correction${addedCount === 1 ? '' : 's'}. You can inspect, accept, or reject them in the AI Correction Inspector below!`);
    } catch (err) {
      console.error('Gemini proofreading failed:', err);
      alert(`Gemini AI proofreading error: ${err.message}`);
    } finally {
      this.isGeminiProofreading = false;
      this.render();
    }
  }

  async _handleGeminiRescan() {
    if (!GeminiService.hasApiKey()) {
      if (confirm('A Google Gemini API key is required to use Vision Re-scan. Would you like to configure it now?')) {
        if (this.onOpenGeminiModal) this.onOpenGeminiModal('settings');
      }
      return;
    }

    const page = this.document.getPage(this.activePageNumber);
    if (!page) return;

    if (!confirm(`Re-transcribe Page ${this.activePageNumber} using Gemini Multimodal Vision? This will analyze the scanned image directly with Google's vision model.`)) {
      return;
    }

    this.isGeminiTranscribing = true;
    this.render();

    try {
      let imgSource = null;
      const imgRecord = await Storage.getPageImage(this.document.document_id, this.activePageNumber);
      if (imgRecord && imgRecord.image_blob) {
        imgSource = imgRecord.image_blob;
      } else {
        const scanImg = this.container.querySelector('#scan-img');
        if (scanImg && scanImg.src) {
          imgSource = scanImg.src;
        }
      }

      if (!imgSource) {
        throw new Error('Could not retrieve the page image for Vision re-scanning.');
      }

      const transcribed = await GeminiService.transcribeImage(imgSource, this.document.primary_language || 'hin');
      if (!transcribed) {
        alert('Gemini Vision did not detect any text on this page.');
        return;
      }

      const paragraphs = transcribed.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
      const newBlocks = paragraphs.map((para, pIdx) => {
        return new CanonicalBlock({
          blockId: `blk_gemini_p${this.activePageNumber}_${pIdx + 1}`,
          type: 'paragraph',
          readingOrder: pIdx + 1,
          script: 'Devanagari',
          text: para,
          rawText: para,
          confidence: 0.98,
          bbox: [10, 10 + (pIdx * 60), page.width || 800, 50],
          needsReview: false
        });
      });

      page.meta = page.meta || {};
      page.meta.previousWasmBlocks = page.blocks;
      page.meta.transcribedBy = 'gemini-vision';
      page.blocks = newBlocks;

      await this._savePageAndDoc();
      alert(`Page ${this.activePageNumber} successfully re-transcribed with Gemini Vision! (${paragraphs.length} paragraphs generated)`);
    } catch (err) {
      console.error('Gemini Vision re-scan failed:', err);
      alert(`Gemini Vision error: ${err.message}`);
    } finally {
      this.isGeminiTranscribing = false;
      this.render();
    }
  }

  _escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
