/**
 * User Guide & AI Walkthrough Modal Component
 * 
 * Provides an interactive, accessible onboarding experience for first-time and returning users:
 * 1. Quick Start: Step-by-step workflow (Upload, Preflight, Review Studio, Hand Pan, Exports)
 * 2. AI Capabilities: Dual-AI architecture (On-Device WASM Agents vs. Optional Gemini Cloud AI)
 * 3. Shortcuts & Pro-Tips: Canvas navigation, diff inspector, and offline persistence
 */

export class UserGuideModal {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container Mount point
   * @param {string} [options.initialTab='quickstart'] 'quickstart' | 'ai_guide' | 'shortcuts'
   * @param {Function} [options.onClose]
   * @param {Function} [options.onTrySample]
   * @param {Function} [options.onOpenGemini]
   */
  constructor({
    container,
    initialTab = 'quickstart',
    onClose = null,
    onTrySample = null,
    onOpenGemini = null
  }) {
    this.container = container;
    this.activeTab = initialTab;
    this.onClose = onClose;
    this.onTrySample = onTrySample;
    this.onOpenGemini = onOpenGemini;

    this.render();
  }

  static shouldShowOnStartup() {
    return localStorage.getItem('indicocr_hide_welcome_guide') !== 'true';
  }

  static setHideOnStartup(hide) {
    if (hide) {
      localStorage.setItem('indicocr_hide_welcome_guide', 'true');
    } else {
      localStorage.removeItem('indicocr_hide_welcome_guide');
    }
  }

  render() {
    const hideOnStartup = localStorage.getItem('indicocr_hide_welcome_guide') === 'true';

    this.container.innerHTML = `
      <div class="modal-overlay" id="guide-overlay">
        <div class="modal-content guide-modal-content" style="max-width: 760px; width: 94%;">
          <!-- Header -->
          <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-subtle); padding: 18px 24px;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="font-size: 28px; line-height: 1;">📖</div>
              <div>
                <div style="font-size: 17px; font-weight: 700; color: var(--text-primary);">IndicOCR User Guide & AI Tutorial</div>
                <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
                  Everything you need to know about processing 300+ page scans and using AI on-device
                </div>
              </div>
            </div>
            <button class="btn btn-outline" id="btn-close-guide" style="padding: 6px 10px; font-size: 14px; border-radius: 6px;" title="Close guide (Esc)">✕</button>
          </div>

          <!-- Tabs -->
          <div class="guide-tab-bar" style="display: flex; gap: 6px; padding: 10px 24px; border-bottom: 1px solid var(--border-subtle); background: var(--bg-tertiary); overflow-x: auto;">
            <button class="btn ${this.activeTab === 'quickstart' ? 'btn-primary' : 'btn-outline'}" id="tab-btn-quickstart" style="padding: 7px 16px; font-size: 13px; white-space: nowrap;">
              🚀 How to Use Website
            </button>
            <button class="btn ${this.activeTab === 'ai_guide' ? 'btn-primary' : 'btn-outline'}" id="tab-btn-ai-guide" style="padding: 7px 16px; font-size: 13px; white-space: nowrap;">
              🤖 How to Use the AI
            </button>
            <button class="btn ${this.activeTab === 'shortcuts' ? 'btn-primary' : 'btn-outline'}" id="tab-btn-shortcuts" style="padding: 7px 16px; font-size: 13px; white-space: nowrap;">
              ⌨️ Shortcuts & Pro-Tips
            </button>
          </div>

          <!-- Body -->
          <div class="modal-body" style="padding: 24px; max-height: 65vh; overflow-y: auto;">
            ${this._renderActiveTab()}
          </div>

          <!-- Footer -->
          <div class="modal-footer" style="display: flex; justify-content: space-between; align-items: center; padding: 14px 24px; border-top: 1px solid var(--border-subtle); background: var(--bg-secondary); border-bottom-left-radius: var(--radius-lg); border-bottom-right-radius: var(--radius-lg);">
            <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-muted); cursor: pointer; user-select: none;">
              <input type="checkbox" id="chk-hide-startup" ${hideOnStartup ? 'checked' : ''} style="cursor: pointer;" />
              <span>Don't show this guide automatically on launch</span>
            </label>

            <div style="display: flex; gap: 10px; align-items: center;">
              ${this.onTrySample ? `
                <button class="btn btn-secondary" id="btn-guide-sample" style="padding: 7px 16px; font-size: 13px;">
                  <span>⚡ Try Sample Document</span>
                </button>
              ` : ''}
              <button class="btn btn-primary" id="btn-guide-finish" style="padding: 7px 20px; font-size: 13px;">
                <span>Got It, Let's Start →</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    this._bindEvents();
  }

  _renderActiveTab() {
    switch (this.activeTab) {
      case 'quickstart':
        return this._renderQuickstartTab();
      case 'ai_guide':
        return this._renderAiGuideTab();
      case 'shortcuts':
        return this._renderShortcutsTab();
      default:
        return this._renderQuickstartTab();
    }
  }

  _renderQuickstartTab() {
    return `
      <div style="display: flex; flex-direction: column; gap: 18px;">
        <!-- Step 1 -->
        <div class="guide-step-card" style="background: var(--bg-tertiary); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 16px 20px;">
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
            <span class="guide-step-num" style="background: var(--accent-primary); color: white; border-radius: 999px; width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 12px;">1</span>
            <div style="font-size: 15px; font-weight: 700; color: var(--text-primary);">Upload or Load a Document</div>
          </div>
          <div style="font-size: 13px; color: var(--text-secondary); line-height: 1.6; padding-left: 34px;">
            Drag & drop large PDF files (supporting <strong>200 to 300+ pages</strong>) or image batches (PNG, JPEG, TIFF).<br/>
            Want to test immediately? Click <strong>"⚡ Load Sample Hindi Document"</strong> on the home screen to test an authentic historical Devanagari scan with zero setup.
          </div>
        </div>

        <!-- Step 2 -->
        <div class="guide-step-card" style="background: var(--bg-tertiary); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 16px 20px;">
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
            <span class="guide-step-num" style="background: var(--accent-primary); color: white; border-radius: 999px; width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 12px;">2</span>
            <div style="font-size: 15px; font-weight: 700; color: var(--text-primary);">Preflight Check & Streaming Progress</div>
          </div>
          <div style="font-size: 13px; color: var(--text-secondary); line-height: 1.6; padding-left: 34px;">
            The platform inspects resolution, page count, and CPU cores. Documents stream 1–2 pages at a time into on-device IndexedDB storage so memory stays bounded (<strong>&lt; 250MB peak RAM</strong>) with no tab crashes.<br/>
            A floating progress monitor in the bottom-right tracks throughput, ETA, and lets you pause, resume, or download partial results.
          </div>
        </div>

        <!-- Step 3 -->
        <div class="guide-step-card" style="background: var(--bg-tertiary); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 16px 20px;">
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
            <span class="guide-step-num" style="background: var(--accent-primary); color: white; border-radius: 999px; width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 12px;">3</span>
            <div style="font-size: 15px; font-weight: 700; color: var(--text-primary);">Side-by-Side Review Studio</div>
          </div>
          <div style="font-size: 13px; color: var(--text-secondary); line-height: 1.6; padding-left: 34px;">
            <strong>• Left Pane</strong>: View the original high-resolution scan with color-coded bounding boxes (<span style="color: var(--success); font-weight: 600;">Green</span> = High confidence, <span style="color: var(--warning); font-weight: 600;">Amber</span> = Medium, <span style="color: var(--danger); font-weight: 600;">Red</span> = Needs review).<br/>
            <strong>• Right Pane</strong>: Structured Indic text editor. You can edit any paragraph or heading directly. All changes auto-save in real time.<br/>
            <strong>• Bottom Filmstrip</strong>: Click thumbnails or use arrow keys to navigate across all pages effortlessly.
          </div>
        </div>

        <!-- Step 4 -->
        <div class="guide-step-card" style="background: var(--bg-tertiary); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 16px 20px;">
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
            <span class="guide-step-num" style="background: var(--accent-primary); color: white; border-radius: 999px; width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 12px;">4</span>
            <div style="font-size: 15px; font-weight: 700; color: var(--text-primary);">Canvas Panning & Hand Tool (✋)</div>
          </div>
          <div style="font-size: 13px; color: var(--text-secondary); line-height: 1.6; padding-left: 34px;">
            Easily move around large or zoomed scan pages:<br/>
            • Click <strong>"✋ Hand"</strong> in the left toolbar to toggle panning mode.<br/>
            • Or hold the <strong>Spacebar</strong> key anytime to drag freely.<br/>
            • Scroll your mouse wheel or 2-finger swipe on trackpad to pan; hold <strong>Ctrl/Cmd</strong> to zoom.<br/>
            • Click <strong>"Fit"</strong> to center the document and return to 100%.
          </div>
        </div>

        <!-- Step 5 -->
        <div class="guide-step-card" style="background: var(--bg-tertiary); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 16px 20px;">
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
            <span class="guide-step-num" style="background: var(--accent-primary); color: white; border-radius: 999px; width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 12px;">5</span>
            <div style="font-size: 15px; font-weight: 700; color: var(--text-primary);">Multi-Format Archival Export</div>
          </div>
          <div style="font-size: 13px; color: var(--text-secondary); line-height: 1.6; padding-left: 34px;">
            Click <strong>"📥 Export"</strong> in the top bar to download your finished document in any format:<br/>
            • <strong>Searchable PDF (Flagship)</strong>: Original scan visually preserved with an invisible selectable Indic text layer.<br/>
            • <strong>Word (.docx)</strong>: Native Word page breaks (<code style="background: var(--bg-surface); padding: 1px 4px; border-radius: 3px;">&lt;w:br&gt;</code>) aligned 1:1 to original pages, preserving headings & formatting.<br/>
            • <strong>Plain Text (.txt)</strong>: Clean Unicode with explicit page markers.<br/>
            • <strong>Canonical JSON</strong>: Full bounding boxes, words, confidence scores, and privacy audit log.
          </div>
        </div>
      </div>
    `;
  }

  _renderAiGuideTab() {
    return `
      <div style="display: flex; flex-direction: column; gap: 22px;">
        <!-- Privacy Callout -->
        <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: var(--radius-md); padding: 14px 18px; display: flex; align-items: flex-start; gap: 12px;">
          <span style="font-size: 22px;">🛡️</span>
          <div style="font-size: 13px; color: var(--text-secondary); line-height: 1.5;">
            <strong style="color: var(--text-primary);">100% On-Device Privacy Guarantee:</strong><br/>
            All core OCR, layout analysis, and linguistic correction agents run entirely inside your browser using WebAssembly. Your documents never touch any cloud server.
          </div>
        </div>

        <!-- Section 1: Local On-Device AI -->
        <div>
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
            <span style="font-size: 18px;">🧠</span>
            <span style="font-size: 16px; font-weight: 700; color: var(--text-primary);">1. On-Device Multi-Agent AI (Built-In & Automatic)</span>
          </div>

          <div style="font-size: 13px; color: var(--text-secondary); line-height: 1.6; margin-bottom: 14px;">
            As pages stream in, five intelligent client-side agents analyze and refine the output in real time:
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px;">
            <div style="background: var(--bg-tertiary); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 12px 14px;">
              <div style="font-weight: 700; font-size: 13px; color: var(--text-primary); margin-bottom: 4px;">🔤 Script-ID Agent</div>
              <div style="font-size: 12px; color: var(--text-muted); line-height: 1.4;">
                Detects code-mixing between Devanagari and Latin characters (e.g. English headings in Hindi texts).
              </div>
            </div>

            <div style="background: var(--bg-tertiary); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 12px 14px;">
              <div style="font-weight: 700; font-size: 13px; color: var(--text-primary); margin-bottom: 4px;">📐 Layout Agent</div>
              <div style="font-size: 12px; color: var(--text-muted); line-height: 1.4;">
                Resolves 1-column vs 2-column structures, reading order, headings, and paragraph blocks.
              </div>
            </div>

            <div style="background: var(--bg-tertiary); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 12px 14px;">
              <div style="font-weight: 700; font-size: 13px; color: var(--text-primary); margin-bottom: 4px;">🔍 Cross-Validation Agent</div>
              <div style="font-size: 12px; color: var(--text-muted); line-height: 1.4;">
                Validates Indic orthography: flags orphaned matras, broken shirorekha, or illegal conjuncts.
              </div>
            </div>

            <div style="background: var(--bg-tertiary); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 12px 14px;">
              <div style="font-weight: 700; font-size: 13px; color: var(--text-primary); margin-bottom: 4px;">⚖️ Contextual Correction Agent</div>
              <div style="font-size: 12px; color: var(--text-muted); line-height: 1.4;">
                Proposes revertible diffs for optical confusions (e.g. 'रव' $\\rightarrow$ 'ख') <strong>without silently overwriting raw text</strong>.
              </div>
            </div>
          </div>

          <!-- How to use diff inspector -->
          <div style="background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: var(--radius-md); padding: 14px 18px; margin-bottom: 14px;">
            <div style="font-weight: 700; font-size: 13px; color: var(--warning); margin-bottom: 6px;">
              👉 How to inspect and accept AI Corrections:
            </div>
            <div style="font-size: 12px; color: var(--text-secondary); line-height: 1.6;">
              1. In the Review Studio editor, blocks with suggestions display an <strong>"🤖 AI Diff(s)"</strong> tag.<br/>
              2. Click on the block to open the <strong>AI Correction Inspector</strong> in the drawer below.<br/>
              3. View the original word, proposed correction, confidence gain, and linguistic reason.<br/>
              4. Click <strong>"Accept"</strong> to apply or <strong>"Reject"</strong> to keep original OCR. You can also click "Accept All" for batch corrections.
            </div>
          </div>

          <!-- Normal vs AI-Based Indicators Guide -->
          <div style="background: var(--bg-tertiary); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 14px 18px;">
            <div style="font-weight: 700; font-size: 13px; color: var(--text-primary); margin-bottom: 8px;">
              🏷️ Result Indicators: Normal vs. AI-Based Results
            </div>
            <div style="font-size: 12px; color: var(--text-secondary); line-height: 1.6; margin-bottom: 8px;">
              IndicOCR displays live status badges in the top navigation bar, in the page header, and on each paragraph:
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px; font-size: 12px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; background: rgba(148, 163, 184, 0.15); color: #94a3b8; border: 1px solid rgba(148, 163, 184, 0.3); white-space: nowrap;">⚙️ Normal (Raw OCR)</span>
                <span style="color: var(--text-secondary);">Unmodified optical recognition output directly from the on-device Tesseract engine.</span>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; background: rgba(59, 130, 246, 0.2); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.4); white-space: nowrap;">🤖 AI Corrected</span>
                <span style="color: var(--text-secondary);">Text that has been verified and improved by accepted AI correction diffs.</span>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; background: rgba(138, 92, 246, 0.2); color: #c4b5fd; border: 1px solid rgba(138, 92, 246, 0.4); white-space: nowrap;">✨ Gemini Vision</span>
                <span style="color: var(--text-secondary);">Page transcribed end-to-end using Google Gemini Multimodal Vision AI.</span>
              </div>
            </div>
          </div>
        </div>

        <div style="border-top: 1px solid var(--border-subtle); margin: 2px 0;"></div>

        <!-- Section 2: Optional Gemini Cloud AI -->
        <div>
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 18px;">✨</span>
              <span style="font-size: 16px; font-weight: 700; color: #c4b5fd;">2. Google Gemini Cloud AI (How to Integrate & Use)</span>
            </div>
            ${this.onOpenGemini ? `
              <button class="btn btn-outline" id="btn-guide-open-gemini" style="padding: 4px 12px; font-size: 12px; color: #a78bfa; border-color: rgba(167, 139, 250, 0.4); font-weight: 600;">
                Open Gemini Settings ⚙️
              </button>
            ` : ''}
          </div>

          <!-- Step-by-Step Integration Guide -->
          <div style="background: rgba(138, 92, 246, 0.08); border: 1px solid rgba(138, 92, 246, 0.25); border-radius: var(--radius-md); padding: 16px 20px; margin-bottom: 16px;">
            <div style="font-weight: 700; font-size: 14px; color: #e9d5ff; margin-bottom: 12px; display: flex; align-items: center; gap: 6px;">
              <span>🔑</span>
              <span>Step-by-Step: How to Integrate Gemini AI</span>
            </div>

            <div style="display: flex; flex-direction: column; gap: 12px; font-size: 13px; line-height: 1.5;">
              <div style="display: flex; gap: 10px; align-items: flex-start;">
                <span style="background: #8b5cf6; color: white; border-radius: 999px; width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 11px; flex-shrink: 0; margin-top: 2px;">1</span>
                <div>
                  <strong style="color: var(--text-primary);">Get a Free Google Gemini API Key:</strong><br/>
                  Go to <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" style="color: #c4b5fd; text-decoration: underline; font-weight: 600;">Google AI Studio (aistudio.google.com/app/apikey) ↗</a>. Sign in with your Google account and click <strong>"Create API Key"</strong>. Copy your generated key (starts with <code style="background: rgba(0,0,0,0.3); padding: 1px 4px; border-radius: 3px;">AIzaSy...</code>). <em>The free tier requires no credit card.</em>
                </div>
              </div>

              <div style="display: flex; gap: 10px; align-items: flex-start;">
                <span style="background: #8b5cf6; color: white; border-radius: 999px; width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 11px; flex-shrink: 0; margin-top: 2px;">2</span>
                <div>
                  <strong style="color: var(--text-primary);">Open Settings in IndicOCR:</strong><br/>
                  Click the <strong>"✨ Gemini AI"</strong> button in the top navigation bar (or click the button at the top right of this card).
                </div>
              </div>

              <div style="display: flex; gap: 10px; align-items: flex-start;">
                <span style="background: #8b5cf6; color: white; border-radius: 999px; width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 11px; flex-shrink: 0; margin-top: 2px;">3</span>
                <div>
                  <strong style="color: var(--text-primary);">Paste Key & Select Model:</strong><br/>
                  Paste your key in the API Key box. Choose <strong>gemini-3.6-flash</strong> (recommended by Google for latest features & fast proofreading) or <strong>gemini-3.6-pro</strong> (best for complex manuscripts). You can also specify any custom model ID.
                </div>
              </div>

              <div style="display: flex; gap: 10px; align-items: flex-start;">
                <span style="background: #8b5cf6; color: white; border-radius: 999px; width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 11px; flex-shrink: 0; margin-top: 2px;">4</span>
                <div>
                  <strong style="color: var(--text-primary);">Test & Save:</strong><br/>
                  Click <strong>"Test Connection"</strong> to verify. When you see the green confirmation, click <strong>"Save API Key"</strong>. The navbar badge turns to green <strong>Active</strong>.
                </div>
              </div>

              <div style="display: flex; gap: 10px; align-items: flex-start;">
                <span style="background: #8b5cf6; color: white; border-radius: 999px; width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 11px; flex-shrink: 0; margin-top: 2px;">5</span>
                <div>
                  <strong style="color: var(--text-primary);">Privacy Guarantee:</strong><br/>
                  Your API key is saved <strong>only in your local browser's storage</strong> (<code style="background: rgba(0,0,0,0.3); padding: 1px 4px; border-radius: 3px;">localStorage</code>). Calls connect directly and securely from your browser to Google's API.
                </div>
              </div>
            </div>
          </div>

          <div style="font-size: 13px; font-weight: 700; color: var(--text-primary); margin-bottom: 10px;">
            Features Unlocked with Gemini AI:
          </div>

          <div style="display: flex; flex-direction: column; gap: 10px;">
            <div style="background: rgba(138, 92, 246, 0.06); border: 1px solid rgba(138, 92, 246, 0.2); border-radius: var(--radius-md); padding: 12px 16px;">
              <div style="font-weight: 700; font-size: 13px; color: #c4b5fd; margin-bottom: 4px;">🔍 Proofread Page</div>
              <div style="font-size: 12px; color: var(--text-secondary); line-height: 1.5;">
                Click <strong>"🔍 Proofread Page"</strong> in the Review Studio toolbar. Gemini performs deep Indic linguistic proofreading to catch subtle contextual spelling errors, generating inspectable diffs in your drawer.
              </div>
            </div>

            <div style="background: rgba(138, 92, 246, 0.06); border: 1px solid rgba(138, 92, 246, 0.2); border-radius: var(--radius-md); padding: 12px 16px;">
              <div style="font-weight: 700; font-size: 13px; color: #c4b5fd; margin-bottom: 4px;">📷 Vision Re-scan</div>
              <div style="font-size: 12px; color: var(--text-secondary); line-height: 1.5;">
                If a scan has curved lines, severe bleed-through, or low contrast, click <strong>"📷 Vision Re-scan"</strong>. Gemini Multimodal Vision reads the scan image directly to generate clean paragraphs.
              </div>
            </div>

            <div style="background: rgba(138, 92, 246, 0.06); border: 1px solid rgba(138, 92, 246, 0.2); border-radius: var(--radius-md); padding: 12px 16px;">
              <div style="font-weight: 700; font-size: 13px; color: #c4b5fd; margin-bottom: 4px;">💡 Summary & Grounded Q&A</div>
              <div style="font-size: 12px; color: var(--text-secondary); line-height: 1.5;">
                Click <strong>"💡 Summary & Q&A"</strong> or the top navbar Gemini button to generate instant Hindi/English summaries of the entire document or ask questions with citations grounded in the text.
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  _renderShortcutsTab() {
    return `
      <div style="display: flex; flex-direction: column; gap: 20px;">
        <div style="font-size: 14px; font-weight: 700; color: var(--text-primary);">Navigation & Canvas Shortcuts</div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div style="background: var(--bg-tertiary); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 12px 16px;">
            <div style="font-weight: 700; font-size: 13px; color: var(--text-primary); margin-bottom: 4px;">Spacebar (Hold)</div>
            <div style="font-size: 12px; color: var(--text-secondary);">
              Temporarily enables Hand tool to pan the scan viewer. Automatically ignores when typing in text fields.
            </div>
          </div>

          <div style="background: var(--bg-tertiary); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 12px 16px;">
            <div style="font-weight: 700; font-size: 13px; color: var(--text-primary); margin-bottom: 4px;">Trackpad Swipe / Mouse Wheel</div>
            <div style="font-size: 12px; color: var(--text-secondary);">
              Scroll up, down, left, or right to pan across zoomed scan pages smoothly.
            </div>
          </div>

          <div style="background: var(--bg-tertiary); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 12px 16px;">
            <div style="font-weight: 700; font-size: 13px; color: var(--text-primary); margin-bottom: 4px;">Ctrl / Cmd + Wheel</div>
            <div style="font-size: 12px; color: var(--text-secondary);">
              Pinch-to-zoom or wheel-zoom centered directly on the viewport cursor.
            </div>
          </div>

          <div style="background: var(--bg-tertiary); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 12px 16px;">
            <div style="font-weight: 700; font-size: 13px; color: var(--text-primary); margin-bottom: 4px;">Click Word Bounding Box</div>
            <div style="font-size: 12px; color: var(--text-secondary);">
              Click any bounding box on the original scan to scroll and focus the corresponding text paragraph.
            </div>
          </div>

          <div style="background: var(--bg-tertiary); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 12px 16px;">
            <div style="font-weight: 700; font-size: 13px; color: var(--text-primary); margin-bottom: 4px;">"Fit" Button</div>
            <div style="font-size: 12px; color: var(--text-secondary);">
              Resets pan position to (0,0) and zooms back to 100% center.
            </div>
          </div>

          <div style="background: var(--bg-tertiary); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 12px 16px;">
            <div style="font-weight: 700; font-size: 13px; color: var(--text-primary); margin-bottom: 4px;">Auto-Save & Offline Persistence</div>
            <div style="font-size: 12px; color: var(--text-secondary);">
              Every edit and accepted diff is saved to IndexedDB. If you close your tab, click <strong>"Resume"</strong> upon returning!
            </div>
          </div>
        </div>

        <div style="background: var(--bg-secondary); border-radius: var(--radius-md); padding: 14px 18px; border-left: 3px solid var(--accent-primary);">
          <div style="font-size: 13px; font-weight: 700; color: var(--text-primary); margin-bottom: 4px;">💡 Pro-Tip for 200–300+ Page Documents:</div>
          <div style="font-size: 12px; color: var(--text-secondary); line-height: 1.5;">
            You don't need to wait for all 300 pages to finish processing. As soon as Page 1 is recognized, it appears in the Review Studio so you can begin reading and editing immediately while the background pipeline processes subsequent pages!
          </div>
        </div>
      </div>
    `;
  }

  _bindEvents() {
    // Close button
    const btnClose = this.container.querySelector('#btn-close-guide');
    if (btnClose) {
      btnClose.onclick = () => this._handleClose();
    }

    const btnFinish = this.container.querySelector('#btn-guide-finish');
    if (btnFinish) {
      btnFinish.onclick = () => this._handleClose();
    }

    // Overlay click to close
    const overlay = this.container.querySelector('#guide-overlay');
    if (overlay) {
      overlay.onclick = (e) => {
        if (e.target === overlay) {
          this._handleClose();
        }
      };
    }

    // ESC key listener
    this._onKeyDown = (e) => {
      if (e.key === 'Escape') {
        this._handleClose();
      }
    };
    window.addEventListener('keydown', this._onKeyDown);

    // Tab buttons
    const btnQuickstart = this.container.querySelector('#tab-btn-quickstart');
    const btnAiGuide = this.container.querySelector('#tab-btn-ai-guide');
    const btnShortcuts = this.container.querySelector('#tab-btn-shortcuts');

    if (btnQuickstart) {
      btnQuickstart.onclick = () => {
        this.activeTab = 'quickstart';
        this.render();
      };
    }

    if (btnAiGuide) {
      btnAiGuide.onclick = () => {
        this.activeTab = 'ai_guide';
        this.render();
      };
    }

    if (btnShortcuts) {
      btnShortcuts.onclick = () => {
        this.activeTab = 'shortcuts';
        this.render();
      };
    }

    // Sample button
    const btnSample = this.container.querySelector('#btn-guide-sample');
    if (btnSample) {
      btnSample.onclick = () => {
        this._handleClose();
        if (this.onTrySample) this.onTrySample();
      };
    }

    // Gemini button from AI guide tab
    const btnOpenGemini = this.container.querySelector('#btn-guide-open-gemini');
    if (btnOpenGemini) {
      btnOpenGemini.onclick = () => {
        this._handleClose();
        if (this.onOpenGemini) this.onOpenGemini();
      };
    }

    // Checkbox preference
    const chkHide = this.container.querySelector('#chk-hide-startup');
    if (chkHide) {
      chkHide.onchange = (e) => {
        UserGuideModal.setHideOnStartup(e.target.checked);
      };
    }
  }

  _handleClose() {
    if (this._onKeyDown) {
      window.removeEventListener('keydown', this._onKeyDown);
      this._onKeyDown = null;
    }
    if (this.onClose) {
      this.onClose();
    }
  }
}
