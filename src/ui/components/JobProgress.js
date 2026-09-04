/**
 * Job & Batch Progress Monitor Component
 * Conforms to PRD FR-8 (Job & Batch Management)
 * 
 * Features:
 * - Real-time progress bar (pages completed / total)
 * - Live throughput (pages/min) & ETA calculation
 * - Pause, resume, and cancel execution
 * - Partial download button for completed pages mid-run
 */

export class JobProgress {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container
   * @param {Function} options.onPause
   * @param {Function} options.onResume
   * @param {Function} options.onCancel
   * @param {Function} options.onDownloadPartial
   */
  constructor({ container, totalPages = 0, statusText = '', onPause, onResume, onCancel, onDownloadPartial }) {
    this.container = container;
    this.onPause = onPause;
    this.onResume = onResume;
    this.onCancel = onCancel;
    this.onDownloadPartial = onDownloadPartial;

    this.completedPages = 0;
    this.totalPages = totalPages;
    this.percent = 0;
    this.pagesPerMin = 0;
    this.etaSeconds = 0;
    this.status = totalPages > 0 ? 'running' : 'idle';
    this.statusText = statusText || (totalPages > 0 ? 'Initializing On-Device OCR Engine...' : '');
    this.isMinimized = false;

    this.render();
  }

  updateProgress({ completedPages, totalPages, percent, pagesPerMin, etaSeconds, status, statusText }) {
    if (completedPages !== undefined) this.completedPages = completedPages;
    if (totalPages !== undefined) this.totalPages = totalPages;
    if (percent !== undefined) this.percent = percent;
    if (pagesPerMin !== undefined) this.pagesPerMin = pagesPerMin;
    if (etaSeconds !== undefined) this.etaSeconds = etaSeconds;
    if (status) this.status = status;
    if (statusText) this.statusText = statusText;
    this.render();
  }

  render() {
    if (this.status === 'idle') {
      this.container.innerHTML = '';
      return;
    }

    const isRunning = this.status === 'running';
    const isPaused = this.status === 'paused';
    const isCompleted = this.status === 'completed';

    if (this.isMinimized) {
      this.container.innerHTML = `
        <div class="progress-screen minimized" id="btn-toggle-min" title="Click to expand progress monitor">
          <div style="display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600;">
            <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: ${isCompleted ? 'var(--success)' : 'var(--accent-primary)'}; animation: pulseLow 1.5s infinite;"></span>
            <span>${isCompleted ? 'Digitization Complete (100%)' : `Page ${this.completedPages}/${this.totalPages} (${this.percent}%)`}</span>
            <span style="font-size: 10px; color: var(--text-muted);">▲</span>
          </div>
        </div>
      `;

      const btnToggle = this.container.querySelector('#btn-toggle-min');
      if (btnToggle) {
        btnToggle.onclick = () => {
          this.isMinimized = false;
          this.render();
        };
      }
      return;
    }

    this.container.innerHTML = `
      <div class="progress-screen">
        <div class="progress-header">
          <div style="flex: 1; min-width: 0; margin-right: 8px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 14px; font-weight: 700; white-space: nowrap;">
                ${isCompleted ? 'Digitization Complete' : (isPaused ? 'Processing Paused' : 'Processing Document')}
              </span>
              <span class="brand-badge" style="background: ${isCompleted ? 'var(--success-bg)' : 'var(--accent-subtle)'}; color: ${isCompleted ? 'var(--success)' : 'var(--accent-primary)'}; padding: 1px 6px; font-size: 10px;">
                ${this.completedPages}/${this.totalPages} (${this.percent}%)
              </span>
            </div>
            ${this.statusText ? `
              <div style="font-size: 11px; color: var(--accent-primary); margin-top: 2px; display: flex; align-items: center; gap: 5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                <span style="display: inline-block; width: 5px; height: 5px; border-radius: 50%; background: var(--accent-primary); animation: pulseLow 1.5s infinite; flex-shrink: 0;"></span>
                <span style="overflow: hidden; text-overflow: ellipsis;">${this.statusText}</span>
              </div>
            ` : ''}
          </div>

          <div style="display: flex; align-items: center; gap: 6px;">
            ${!isCompleted ? `
              ${isRunning ? `
                <button class="btn btn-secondary" id="btn-pause" style="padding: 4px 8px; font-size: 11px;" title="Pause">
                  ⏸️
                </button>
              ` : `
                <button class="btn btn-primary" id="btn-resume" style="padding: 4px 8px; font-size: 11px;" title="Resume">
                  ▶️
                </button>
              `}
              <button class="btn btn-outline" id="btn-cancel" style="padding: 4px 8px; font-size: 11px; color: var(--danger);" title="Cancel">
                ✕
              </button>
            ` : `
              <button class="btn btn-outline" id="btn-dismiss-prog" style="padding: 2px 6px; font-size: 11px;" title="Dismiss">
                ✕
              </button>
            `}

            <button class="btn btn-outline" id="btn-toggle-min" style="padding: 4px 6px; font-size: 10px;" title="Minimize">
              ▼
            </button>
          </div>
        </div>

        <div class="progress-body">
          <div class="progress-bar-container">
            <div class="progress-bar-fill" style="width: ${this.percent}%;"></div>
          </div>

          <div class="progress-metrics">
            <span>⚡ Speed: <strong>${this.pagesPerMin}</strong> p/min</span>
            <span>⏱️ ETA: <strong>${this._formatEta(this.etaSeconds)}</strong></span>
            <span>💾 Memory: <strong>Streamed</strong></span>
            <span>🔒 <strong>100% On-Device</strong></span>
          </div>

          ${this.completedPages > 0 ? `
            <div style="margin-top: 10px; display: flex; justify-content: flex-end;">
              <button class="btn ${isCompleted ? 'btn-primary' : 'btn-secondary'}" id="btn-partial" style="padding: 5px 12px; font-size: 11px; width: 100%;">
                <span>📥</span>
                <span>${isCompleted ? 'Export Results Now' : 'Download Partial Results'}</span>
              </button>
            </div>
          ` : ''}
        </div>
      </div>
    `;

    const btnPause = this.container.querySelector('#btn-pause');
    const btnResume = this.container.querySelector('#btn-resume');
    const btnCancel = this.container.querySelector('#btn-cancel');
    const btnPartial = this.container.querySelector('#btn-partial');
    const btnToggle = this.container.querySelector('#btn-toggle-min');
    const btnDismiss = this.container.querySelector('#btn-dismiss-prog');

    if (btnPause) btnPause.onclick = () => { if (this.onPause) this.onPause(); };
    if (btnResume) btnResume.onclick = () => { if (this.onResume) this.onResume(); };
    if (btnCancel) btnCancel.onclick = () => { if (this.onCancel) this.onCancel(); };
    if (btnPartial) btnPartial.onclick = () => { if (this.onDownloadPartial) this.onDownloadPartial(); };
    if (btnToggle) {
      btnToggle.onclick = () => {
        this.isMinimized = true;
        this.render();
      };
    }
    if (btnDismiss) {
      btnDismiss.onclick = () => {
        this.status = 'idle';
        this.render();
      };
    }
  }

  _formatEta(seconds) {
    if (!seconds || seconds <= 0) return 'Almost done';
    if (seconds < 60) return `${seconds}s remaining`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s remaining`;
  }
}
