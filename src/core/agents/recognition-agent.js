/**
 * On-Device Indic Recognition Agent
 * Conforms to PRD §10 (Step 3: Recognition Agent) & FR-3 (On-Device Indic OCR)
 * 
 * Manages Tesseract WASM instances configured with local vendor and model assets
 * for completely client-side, offline-capable inference.
 */

export class RecognitionAgent {
  /**
   * @param {Object} options
   * @param {string} [options.languages='hin+eng'] Primary language or combo (e.g. 'hin+eng', 'mar+eng', 'san')
   * @param {Function} [options.onProgress] Progress callback
   */
  constructor({
    languages = 'hin+eng',
    onProgress = null
  } = {}) {
    this.languages = languages;
    this.onProgress = onProgress;
    this.worker = null;
    this.isReady = false;
    this._initPromise = null;
  }

  /**
   * Initialize or reuse the Tesseract WASM worker
   */
  async init() {
    if (this.isReady && this.worker) return this.worker;
    if (this._initPromise) return this._initPromise;

    if (typeof window.Tesseract === 'undefined') {
      throw new Error('Tesseract library not loaded in window.Tesseract');
    }

    this._initPromise = (async () => {
      // Determine local path vs relative baseUrl (compatible with subpaths e.g. GitHub Pages)
      const baseUrl = new URL('.', window.location.href).href.replace(/\/$/, '');
      const workerPath = `${baseUrl}/public/vendor/tesseract-worker.min.js`;
      const corePath = `${baseUrl}/public/vendor`;
      const langPath = `${baseUrl}/public/models`;

      // Create Tesseract worker
      this.worker = await window.Tesseract.createWorker(this.languages, 1, {
        workerPath: workerPath,
        corePath: corePath,
        langPath: langPath,
        gzip: true,
        logger: (m) => {
          if (this.onProgress && m.status) {
            this.onProgress({
              status: m.status,
              progress: m.progress || 0
            });
          }
        },
        errorHandler: (err) => console.warn('Tesseract worker warning:', err)
      });

      // Set OCR parameters optimized for Indic scripts
      await this.worker.setParameters({
        tessedit_pageseg_mode: '1', // Automatic page segmentation with OSD
        preserve_interword_spaces: '1'
      });

      this.isReady = true;
      return this.worker;
    })();

    return this._initPromise;
  }

  /**
   * Recognize an image (Canvas, ImageBitmap, Blob, or URL)
   * @param {HTMLCanvasElement|OffscreenCanvas|Blob|string} imageSource
   * @returns {Promise<Object>} Raw Tesseract result
   */
  async recognize(imageSource) {
    const worker = await this.init();
    let src = imageSource;
    if (typeof OffscreenCanvas !== 'undefined' && imageSource instanceof OffscreenCanvas) {
      src = await imageSource.convertToBlob({ type: 'image/png' });
    }
    const result = await worker.recognize(src);
    return result;
  }

  /**
   * Switch languages dynamically
   * @param {string} newLanguages e.g. 'mar+eng'
   */
  async setLanguages(newLanguages) {
    if (this.languages === newLanguages) return;
    this.languages = newLanguages;
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.isReady = false;
      this._initPromise = null;
      await this.init();
    }
  }

  /**
   * Terminate worker to free memory
   */
  async terminate() {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.isReady = false;
      this._initPromise = null;
    }
  }
}
