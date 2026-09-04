/**
 * Gemini AI Modal Component
 * 
 * Provides:
 * 1. API Key & Model Configuration (Bring-Your-Own-Key)
 * 2. Connection testing with live feedback
 * 3. Document Insights & Grounded Q&A
 */

import { GeminiService } from '../../core/services/gemini-service.js?v=20260904_gemini36';

export class GeminiModal {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container Mount point
   * @param {Object} [options.document] Active CanonicalDocument
   * @param {string} [options.initialTab='settings'] 'settings' | 'insights'
   * @param {Function} [options.onClose]
   * @param {Function} [options.onConfigChanged]
   */
  constructor({
    container,
    document = null,
    initialTab = 'settings',
    onClose = null,
    onConfigChanged = null
  }) {
    this.container = container;
    this.document = document;
    this.activeTab = initialTab;
    this.onClose = onClose;
    this.onConfigChanged = onConfigChanged;

    this.isTesting = false;
    this.isSummarizing = false;
    this.isAsking = false;
    this.testStatus = null; // { success: boolean, message: string }
    this.summaryText = '';
    this.qaHistory = [];

    this.render();
  }

  render() {
    const hasKey = GeminiService.hasApiKey();
    const currentModel = GeminiService.getModel();
    const docLoaded = Boolean(this.document && this.document.pages && this.document.pages.length > 0);

    this.container.innerHTML = `
      <div class="modal-overlay" id="gemini-overlay">
        <div class="modal-content gemini-modal-content" style="max-width: 620px; width: 92%;">
          <!-- Header -->
          <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-subtle); padding: 16px 20px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 20px;">✨</span>
              <div>
                <div style="font-size: 16px; font-weight: 700; color: var(--text-primary);">Google Gemini AI Assistant</div>
                <div style="font-size: 12px; color: var(--text-muted);">Hybrid Cloud OCR, Contextual Proofreading & Document Insights</div>
              </div>
            </div>
            <button class="btn btn-outline" id="btn-close-modal" style="padding: 4px 8px; font-size: 14px; border-radius: 6px;">✕</button>
          </div>

          <!-- Navigation Tabs -->
          <div class="gemini-tab-bar" style="display: flex; gap: 4px; padding: 10px 20px; border-bottom: 1px solid var(--border-subtle); background: var(--bg-tertiary);">
            <button class="btn ${this.activeTab === 'settings' ? 'btn-primary' : 'btn-outline'}" id="tab-btn-settings" style="padding: 6px 14px; font-size: 13px;">
              ⚙️ API Settings
            </button>
            <button class="btn ${this.activeTab === 'insights' ? 'btn-primary' : 'btn-outline'}" id="tab-btn-insights" style="padding: 6px 14px; font-size: 13px;">
              💡 Document Insights & Q&A
            </button>
          </div>

          <!-- Body -->
          <div class="modal-body" style="padding: 20px; max-height: 70vh; overflow-y: auto;">
            ${this.activeTab === 'settings' ? this._renderSettingsTab(hasKey, currentModel) : this._renderInsightsTab(docLoaded, hasKey)}
          </div>
        </div>
      </div>
    `;

    this._bindEvents();
  }

  _renderSettingsTab(hasKey, currentModel) {
    const savedKey = GeminiService.getApiKey();
    const maskedKey = savedKey ? (savedKey.slice(0, 4) + '••••••••••••••••' + savedKey.slice(-4)) : '';

    return `
      <div style="display: flex; flex-direction: column; gap: 18px;">
        <div style="background: rgba(138, 92, 246, 0.08); border: 1px solid rgba(138, 92, 246, 0.25); border-radius: 8px; padding: 12px 16px;">
          <div style="font-size: 13px; font-weight: 600; color: #a78bfa; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
            <span>🛡️</span>
            <span>Hybrid Privacy Model (BYOK)</span>
          </div>
          <div style="font-size: 12px; color: var(--text-secondary); line-height: 1.5;">
            Your Gemini API key is saved solely in your local browser storage. The app remains 100% on-device by default; only pages you explicitly choose to proofread or re-scan with Gemini are transmitted securely to Google's API.
          </div>
        </div>

        <div>
          <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; color: var(--text-primary);">
            Google Gemini API Key
          </label>
          <div style="display: flex; gap: 8px;">
            <input 
              type="password" 
              id="input-gemini-key" 
              placeholder="${hasKey ? 'API key is configured (' + maskedKey + ')' : 'Enter your AI Studio API key (AIzaSy...)'}" 
              value="${savedKey}"
              style="flex: 1; padding: 9px 12px; font-size: 13px; background: var(--bg-primary); border: 1px solid var(--border-subtle); border-radius: 6px; color: var(--text-primary);"
            />
            <button class="btn btn-outline" id="btn-toggle-key" title="Toggle visibility" style="padding: 8px 12px; font-size: 12px;">
              👁️
            </button>
          </div>
          <div style="margin-top: 6px; font-size: 12px; color: var(--text-muted);">
            Don't have a key? 
            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" style="color: var(--accent-primary); text-decoration: underline;">
              Get a free API key from Google AI Studio ↗
            </a>
          </div>
        </div>

        <div>
          <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; color: var(--text-primary);">
            Gemini Model
          </label>
          <select id="select-gemini-model" style="width: 100%; padding: 9px 12px; font-size: 13px; background: var(--bg-primary); border: 1px solid var(--border-subtle); border-radius: 6px; color: var(--text-primary);">
            <option value="gemini-3.6-flash" ${currentModel === 'gemini-3.6-flash' ? 'selected' : ''}>gemini-3.6-flash (Recommended: Google's Latest Fast Tier)</option>
            <option value="gemini-3.6-pro" ${currentModel === 'gemini-3.6-pro' ? 'selected' : ''}>gemini-3.6-pro (Deepest Reasoning & Complex Documents)</option>
            <option value="gemini-2.0-flash" ${currentModel === 'gemini-2.0-flash' ? 'selected' : ''}>gemini-2.0-flash (Fast Multimodal Tier)</option>
            <option value="gemini-1.5-flash" ${currentModel === 'gemini-1.5-flash' ? 'selected' : ''}>gemini-1.5-flash (Standard Fast Tier)</option>
            <option value="gemini-1.5-pro" ${currentModel === 'gemini-1.5-pro' ? 'selected' : ''}>gemini-1.5-pro (Standard Pro Tier)</option>
            <option value="custom" ${!['gemini-3.6-flash', 'gemini-3.6-pro', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'].includes(currentModel) ? 'selected' : ''}>Custom Model ID...</option>
          </select>
          <div id="custom-model-container" style="margin-top: 8px; display: ${!['gemini-3.6-flash', 'gemini-3.6-pro', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'].includes(currentModel) ? 'block' : 'none'};">
            <input 
              type="text" 
              id="input-custom-model" 
              placeholder="e.g. gemini-3.6-flash, gemini-experimental" 
              value="${!['gemini-3.6-flash', 'gemini-3.6-pro', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'].includes(currentModel) ? currentModel : ''}"
              style="width: 100%; padding: 8px 12px; font-size: 13px; background: var(--bg-primary); border: 1px solid var(--border-subtle); border-radius: 6px; color: var(--text-primary);"
            />
          </div>
        </div>

        <!-- Connection Test Feedback -->
        ${this.testStatus ? `
          <div style="padding: 10px 14px; border-radius: 6px; font-size: 13px; display: flex; align-items: center; gap: 8px; background: ${this.testStatus.success ? 'var(--success-bg)' : 'var(--danger-bg)'}; color: ${this.testStatus.success ? 'var(--success)' : 'var(--danger)'}; border: 1px solid ${this.testStatus.success ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'};">
            <span>${this.testStatus.success ? '✓' : '✗'}</span>
            <span>${this.testStatus.message}</span>
          </div>
        ` : ''}

        <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 8px;">
          ${hasKey ? `
            <button class="btn btn-outline" id="btn-clear-key" style="color: var(--danger); border-color: rgba(239, 68, 68, 0.4);">
              Remove Key
            </button>
          ` : ''}
          <button class="btn btn-secondary" id="btn-test-connection" ${this.isTesting ? 'disabled' : ''}>
            ${this.isTesting ? 'Testing...' : 'Test Connection'}
          </button>
          <button class="btn btn-primary" id="btn-save-key">
            Save Configuration
          </button>
        </div>
      </div>
    `;
  }

  _renderInsightsTab(docLoaded, hasKey) {
    if (!hasKey) {
      return `
        <div style="text-align: center; padding: 32px 16px; color: var(--text-muted);">
          <div style="font-size: 32px; margin-bottom: 8px;">🔑</div>
          <div style="font-size: 15px; font-weight: 600; color: var(--text-primary); margin-bottom: 6px;">Gemini API Key Required</div>
          <div style="font-size: 13px; max-width: 400px; margin: 0 auto 16px; line-height: 1.5;">
            Configure your free Gemini API key in the <strong>API Settings</strong> tab to unlock document summarization, legal analysis, and interactive Q&A.
          </div>
          <button class="btn btn-primary" id="btn-go-to-settings">
            Go to API Settings
          </button>
        </div>
      `;
    }

    if (!docLoaded) {
      return `
        <div style="text-align: center; padding: 32px 16px; color: var(--text-muted);">
          <div style="font-size: 32px; margin-bottom: 8px;">📄</div>
          <div style="font-size: 15px; font-weight: 600; color: var(--text-primary); margin-bottom: 6px;">No Document Loaded</div>
          <div style="font-size: 13px;">
            Please upload and digitize a document to generate summaries and ask questions.
          </div>
        </div>
      `;
    }

    return `
      <div style="display: flex; flex-direction: column; gap: 20px;">
        <!-- Executive Summary Section -->
        <div style="border: 1px solid var(--border-subtle); border-radius: 8px; padding: 16px; background: var(--bg-primary);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <div style="font-size: 14px; font-weight: 700; color: var(--text-primary); display: flex; align-items: center; gap: 6px;">
              <span>📋</span>
              <span>Executive Document Summary</span>
            </div>
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-secondary" id="btn-generate-summary" ${this.isSummarizing ? 'disabled' : ''} style="padding: 5px 12px; font-size: 12px;">
                ${this.isSummarizing ? 'Analyzing...' : (this.summaryText ? 'Regenerate' : 'Generate Summary')}
              </button>
            </div>
          </div>

          <div id="summary-content" style="font-size: 13px; line-height: 1.6; color: var(--text-secondary); max-height: 200px; overflow-y: auto; white-space: pre-wrap; background: var(--bg-tertiary); padding: 12px; border-radius: 6px;">
            ${this.summaryText || 'Click "Generate Summary" to have Gemini analyze and synthesize all pages of this document.'}
          </div>
        </div>

        <!-- Document Q&A Chat -->
        <div style="border: 1px solid var(--border-subtle); border-radius: 8px; padding: 16px; background: var(--bg-primary);">
          <div style="font-size: 14px; font-weight: 700; color: var(--text-primary); margin-bottom: 12px; display: flex; align-items: center; gap: 6px;">
            <span>💬</span>
            <span>Ask Questions About This Document</span>
          </div>

          <!-- Q&A History -->
          <div id="qa-history" style="display: flex; flex-direction: column; gap: 10px; max-height: 220px; overflow-y: auto; margin-bottom: 12px; padding: 4px;">
            ${this.qaHistory.length === 0 ? `
              <div style="font-size: 12px; color: var(--text-muted); text-align: center; padding: 16px;">
                Ask questions in Hindi or English (e.g., "इस दस्तावेज का मुख्य आदेश क्या है?", "What dates are mentioned?").
              </div>
            ` : this.qaHistory.map(item => `
              <div style="display: flex; flex-direction: column; gap: 4px;">
                <div style="align-self: flex-end; background: var(--accent-subtle); color: var(--accent-primary); padding: 6px 12px; border-radius: 12px 12px 2px 12px; font-size: 12px; max-width: 85%;">
                  <strong>Q:</strong> ${item.question}
                </div>
                <div style="align-self: flex-start; background: var(--bg-tertiary); color: var(--text-primary); padding: 8px 12px; border-radius: 12px 12px 12px 2px; font-size: 13px; line-height: 1.5; max-width: 90%; white-space: pre-wrap;">
                  <strong>Gemini:</strong> ${item.answer}
                </div>
              </div>
            `).join('')}
          </div>

          <!-- Question Input -->
          <div style="display: flex; gap: 8px;">
            <input 
              type="text" 
              id="input-qa-question" 
              placeholder="Ask a question about the document..." 
              ${this.isAsking ? 'disabled' : ''}
              style="flex: 1; padding: 8px 12px; font-size: 13px; background: var(--bg-tertiary); border: 1px solid var(--border-subtle); border-radius: 6px; color: var(--text-primary);"
            />
            <button class="btn btn-primary" id="btn-submit-qa" ${this.isAsking ? 'disabled' : ''} style="padding: 8px 14px; font-size: 13px;">
              ${this.isAsking ? 'Thinking...' : 'Ask'}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  _bindEvents() {
    // Backdrop click
    const backdrop = this.container.querySelector('#gemini-overlay');
    if (backdrop) {
      backdrop.onclick = (e) => {
        if (e.target === backdrop) this.close();
      };
    }

    // Close button
    const btnClose = this.container.querySelector('#btn-close-modal');
    if (btnClose) {
      btnClose.onclick = () => this.close();
    }

    // Tabs
    const tabSettings = this.container.querySelector('#tab-btn-settings');
    const tabInsights = this.container.querySelector('#tab-btn-insights');
    const btnGoToSettings = this.container.querySelector('#btn-go-to-settings');

    if (tabSettings) {
      tabSettings.onclick = () => {
        this.activeTab = 'settings';
        this.render();
      };
    }
    if (tabInsights) {
      tabInsights.onclick = () => {
        this.activeTab = 'insights';
        this.render();
      };
    }
    if (btnGoToSettings) {
      btnGoToSettings.onclick = () => {
        this.activeTab = 'settings';
        this.render();
      };
    }

    // Settings actions
    if (this.activeTab === 'settings') {
      const inputKey = this.container.querySelector('#input-gemini-key');
      const selectModel = this.container.querySelector('#select-gemini-model');
      const customModelContainer = this.container.querySelector('#custom-model-container');
      const inputCustomModel = this.container.querySelector('#input-custom-model');
      const btnToggleKey = this.container.querySelector('#btn-toggle-key');
      const btnTest = this.container.querySelector('#btn-test-connection');
      const btnSave = this.container.querySelector('#btn-save-key');
      const btnClear = this.container.querySelector('#btn-clear-key');

      if (selectModel && customModelContainer) {
        selectModel.onchange = () => {
          if (selectModel.value === 'custom') {
            customModelContainer.style.display = 'block';
            inputCustomModel?.focus();
          } else {
            customModelContainer.style.display = 'none';
          }
        };
      }

      const getSelectedModel = () => {
        if (!selectModel) return GeminiService.getModel();
        if (selectModel.value === 'custom') {
          return inputCustomModel?.value.trim() || 'gemini-3.6-flash';
        }
        return selectModel.value;
      };

      if (btnToggleKey && inputKey) {
        btnToggleKey.onclick = () => {
          inputKey.type = inputKey.type === 'password' ? 'text' : 'password';
        };
      }

      if (btnTest && inputKey) {
        btnTest.onclick = async () => {
          const testKey = inputKey.value.trim() || GeminiService.getApiKey();
          if (!testKey) {
            this.testStatus = { success: false, message: 'Please enter an API key first.' };
            this.render();
            return;
          }

          const modelToUse = getSelectedModel();
          GeminiService.setModel(modelToUse);

          this.isTesting = true;
          this.testStatus = null;
          this.render();

          try {
            const res = await GeminiService.testConnection(testKey);
            this.testStatus = { success: true, message: `Connected to ${res.model} successfully!` };
          } catch (err) {
            this.testStatus = { success: false, message: err.message };
          } finally {
            this.isTesting = false;
            this.render();
          }
        };
      }

      if (btnSave && inputKey) {
        btnSave.onclick = () => {
          const key = inputKey.value.trim();
          GeminiService.setApiKey(key);
          const modelToUse = getSelectedModel();
          GeminiService.setModel(modelToUse);

          this.testStatus = { success: true, message: 'Gemini configuration saved successfully!' };
          if (this.onConfigChanged) this.onConfigChanged();
          this.render();
        };
      }

      if (btnClear) {
        btnClear.onclick = () => {
          GeminiService.clearCredentials();
          this.testStatus = null;
          if (this.onConfigChanged) this.onConfigChanged();
          this.render();
        };
      }
    }

    // Insights actions
    if (this.activeTab === 'insights') {
      const btnGenSummary = this.container.querySelector('#btn-generate-summary');
      const inputQuestion = this.container.querySelector('#input-qa-question');
      const btnSubmitQa = this.container.querySelector('#btn-submit-qa');

      if (btnGenSummary) {
        btnGenSummary.onclick = async () => {
          const fullText = this._extractDocText();
          this.isSummarizing = true;
          this.render();

          try {
            const lang = this.document?.primary_language || 'hin';
            this.summaryText = await GeminiService.summarizeDocument(fullText, lang);
          } catch (err) {
            this.summaryText = `Failed to generate summary: ${err.message}`;
          } finally {
            this.isSummarizing = false;
            this.render();
          }
        };
      }

      if (btnSubmitQa && inputQuestion) {
        const handleAsk = async () => {
          const q = inputQuestion.value.trim();
          if (!q) return;

          const fullText = this._extractDocText();
          this.isAsking = true;
          this.render();

          try {
            const answer = await GeminiService.askQuestion(fullText, q);
            this.qaHistory.push({ question: q, answer });
          } catch (err) {
            this.qaHistory.push({ question: q, answer: `Error: ${err.message}` });
          } finally {
            this.isAsking = false;
            this.render();
          }
        };

        btnSubmitQa.onclick = handleAsk;
        inputQuestion.onkeydown = (e) => {
          if (e.key === 'Enter') handleAsk();
        };
      }
    }
  }

  _extractDocText() {
    if (!this.document || !this.document.pages) return '';
    return this.document.pages
      .map(p => `--- [ Page ${p.page_number} ] ---\n` + (p.blocks || []).map(b => b.text).join('\n'))
      .join('\n\n');
  }

  close() {
    this.container.innerHTML = '';
    if (this.onClose) this.onClose();
  }
}
