/**
 * Interactive Diff Inspector Component
 * Conforms to PRD FR-5 (Agentic AI Correction: Inspectable & Revertible Diffs)
 * 
 * Guarantees zero silent overwrites: every suggested correction is presented
 * with linguistic reasoning, confidence impact, and individual accept/reject controls.
 */

export class DiffInspector {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container
   * @param {Function} options.onAcceptDiff
   * @param {Function} options.onRejectDiff
   * @param {Function} options.onAcceptAll
   */
  constructor({ container, onAcceptDiff, onRejectDiff, onAcceptAll }) {
    this.container = container;
    this.onAcceptDiff = onAcceptDiff;
    this.onRejectDiff = onRejectDiff;
    this.onAcceptAll = onAcceptAll;

    this.activeBlock = null;
    this.corrections = [];
    this.render();
  }

  setBlock(block) {
    this.activeBlock = block;
    this.corrections = block?.corrections || [];
    this.render();
  }

  render() {
    if (!this.activeBlock || !this.corrections.length) {
      this.container.innerHTML = `
        <div style="padding: 16px; font-size: 13px; color: var(--text-muted); text-align: center;">
          No AI-suggested corrections for this block.
        </div>
      `;
      return;
    }

    const proposedList = this.corrections.filter(c => c.status === 'proposed');

    this.container.innerHTML = `
      <div style="padding: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <div style="font-size: 13px; font-weight: 700; color: var(--text-primary); display: flex; align-items: center; gap: 6px;">
            <span>🤖</span>
            <span>AI Correction Inspector (${this.corrections.length})</span>
          </div>

          ${proposedList.length > 1 ? `
            <button class="btn btn-secondary" id="btn-accept-all" style="padding: 4px 10px; font-size: 11px;">
              Accept All Proposed
            </button>
          ` : ''}
        </div>

        <div style="display: flex; flex-direction: column; gap: 10px;">
          ${this.corrections.map((corr, idx) => `
            <div class="diff-card">
              <div class="diff-header">
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span>Correction #${idx + 1}</span>
                  ${corr.source === 'gemini' ? `
                    <span class="brand-badge" style="background: rgba(138, 92, 246, 0.25); color: #c4b5fd; font-size: 10px;">✨ Gemini AI</span>
                  ` : ''}
                </div>
                <span class="brand-badge" style="background: ${corr.status === 'accepted' ? 'var(--success-bg)' : (corr.status === 'rejected' ? 'var(--danger-bg)' : 'var(--accent-subtle)')}; color: ${corr.status === 'accepted' ? 'var(--success)' : (corr.status === 'rejected' ? 'var(--danger)' : 'var(--accent-primary)')};">
                  ${corr.status.toUpperCase()} (+${Math.round(corr.confidenceGain * 100)}% conf)
                </span>
              </div>

              <div class="diff-comparison">
                <div>
                  <div style="font-size: 10px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 2px;">Raw OCR Output</div>
                  <div class="diff-before indic-text">${corr.original}</div>
                </div>
                <div>
                  <div style="font-size: 10px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 2px;">AI Suggestion</div>
                  <div class="diff-after indic-text">${corr.suggested}</div>
                </div>
              </div>

              <div class="diff-reason">
                <strong>Rationale:</strong> ${corr.reason}
              </div>

              <div class="diff-actions">
                ${corr.status === 'proposed' ? `
                  <button class="btn btn-success" data-idx="${idx}" style="padding: 5px 12px; font-size: 12px;">
                    <span>✓</span>
                    <span>Accept</span>
                  </button>
                  <button class="btn btn-danger" data-idx="${idx}" style="padding: 5px 12px; font-size: 12px;">
                    <span>✕</span>
                    <span>Reject</span>
                  </button>
                ` : `
                  <button class="btn btn-outline" data-revert-idx="${idx}" style="padding: 4px 10px; font-size: 11px;">
                    <span>↩</span>
                    <span>Revert to Proposed</span>
                  </button>
                `}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    // Event listeners
    this.container.querySelectorAll('.btn-success').forEach(btn => {
      btn.onclick = (e) => {
        const idx = parseInt(e.currentTarget.dataset.idx, 10);
        if (this.onAcceptDiff) this.onAcceptDiff(this.activeBlock, idx);
      };
    });

    this.container.querySelectorAll('.btn-danger').forEach(btn => {
      btn.onclick = (e) => {
        const idx = parseInt(e.currentTarget.dataset.idx, 10);
        if (this.onRejectDiff) this.onRejectDiff(this.activeBlock, idx);
      };
    });

    this.container.querySelectorAll('[data-revert-idx]').forEach(btn => {
      btn.onclick = (e) => {
        const idx = parseInt(e.currentTarget.dataset.revertIdx, 10);
        if (this.corrections[idx]) {
          this.corrections[idx].status = 'proposed';
          this.activeBlock.recomputeActiveText();
          this.render();
        }
      };
    });

    const btnAcceptAll = this.container.querySelector('#btn-accept-all');
    if (btnAcceptAll) {
      btnAcceptAll.onclick = () => {
        if (this.onAcceptAll) this.onAcceptAll(this.activeBlock);
      };
    }
  }
}
