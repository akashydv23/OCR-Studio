/**
 * Multi-Agent Pipeline Coordinator & Batch Processing Engine
 * Conforms to PRD §9, §10, FR-2 (Parallel/Concurrent Processing), FR-8 (Job Management)
 * 
 * Orchestrates the full sequence of specialized agents per page:
 * Preprocessing -> Recognition -> Layout -> Script-ID -> Cross-Validation -> Correction -> QA
 * 
 * Manages worker concurrency, progress reporting, pause/resume, and partial downloads.
 */

import { ImageFilters } from '../preprocessor/image-filters.js';
import { RecognitionAgent } from '../agents/recognition-agent.js';
import { LayoutAgent } from '../agents/layout-agent.js';
import { ScriptIdAgent } from '../agents/script-id-agent.js';
import { CrossValidationAgent } from '../agents/cross-validation-agent.js';
import { CorrectionAgent } from '../agents/correction-agent.js';
import { QaAgent } from '../agents/qa-agent.js';
import { CanonicalDocument, CanonicalPage } from '../model/canonical-doc.js';
import { Storage } from '../storage/db.js';

export class PipelineCoordinator {
  /**
   * @param {Object} options
   * @param {string} [options.languages='hin+eng']
   * @param {number} [options.concurrency=2] Number of parallel page workers
   * @param {Function} [options.onProgress] Callback for overall progress
   * @param {Function} [options.onPageCompleted] Callback when a page completes
   * @param {Function} [options.onStatusChange] Callback for status transitions
   */
  constructor({
    languages = 'hin+eng',
    concurrency = 2,
    onProgress = null,
    onPageCompleted = null,
    onStatusChange = null
  } = {}) {
    this.languages = languages;
    this.concurrency = concurrency;
    this.onProgress = onProgress;
    this.onPageCompleted = onPageCompleted;
    this.onStatusChange = onStatusChange;

    this.activeJob = null;
    this.isPaused = false;
    this.isCancelled = false;
    this.recognitionAgents = [];
  }

  /**
   * Start or resume processing a document
   * @param {Object} options
   * @param {CanonicalDocument} options.document
   * @param {any} options.streamer PageStreamer instance
   * @param {Array<number>} [options.pageList] Subset of pages to process (optional)
   */
  async processDocument({
    document,
    streamer,
    pageList = null
  }) {
    this.activeJob = document;
    this.isPaused = false;
    this.isCancelled = false;

    this._updateStatus('running');

    const totalPages = document.source_page_count;
    const pagesToProcess = pageList || Array.from({ length: totalPages }, (_, i) => i + 1);

    // Filter out already completed pages for resumability
    const pendingPages = [];
    for (const pageNum of pagesToProcess) {
      const existingPage = document.getPage(pageNum);
      if (!existingPage || existingPage.status !== 'completed') {
        pendingPages.push(pageNum);
      }
    }

    const startTime = Date.now();
    let completedInRun = 0;
    const totalToProcess = pendingPages.length;

    // Initialize recognition agent pool with error reporting
    try {
      if (this.onProgress) {
        this.onProgress({
          documentId: document.document_id,
          completedPages: 0,
          totalPages: totalToProcess,
          percent: 0,
          pagesPerMin: 0,
          etaSeconds: 0
        });
      }
      await this._ensureAgentPool();
    } catch (err) {
      console.error('Failed to initialize OCR agent pool:', err);
      this._updateStatus('failed');
      throw new Error(`Failed to initialize on-device OCR engine: ${err.message}`);
    }

    // Work queue loop
    let queueIndex = 0;
    const activePromises = [];

    const processNext = async (workerId) => {
      while (queueIndex < pendingPages.length) {
        if (this.isCancelled) break;

        if (this.isPaused) {
          await this._waitWhilePaused();
          if (this.isCancelled) break;
        }

        const pageNum = pendingPages[queueIndex++];
        const agent = this.recognitionAgents[workerId % this.recognitionAgents.length];

        try {
          // 1. Stream & Render page image
          const pageImgData = await streamer.streamPage(pageNum);

          // 2. Run multi-agent pipeline on page
          const canonicalPage = await this._processSinglePage(pageNum, pageImgData, agent);

          // 3. Update canonical model & save to IndexedDB
          document.setPage(canonicalPage);
          await Storage.savePageData(document.document_id, pageNum, canonicalPage.toJSON());
          await Storage.saveDocument(document);

          completedInRun++;

          // Compute throughput & ETA
          const elapsedSecs = (Date.now() - startTime) / 1000;
          const pagesPerMin = completedInRun > 0 ? (completedInRun / (elapsedSecs / 60)) : 0;
          const remainingPages = totalToProcess - completedInRun;
          const etaSecs = pagesPerMin > 0 ? (remainingPages / (pagesPerMin / 60)) : 0;

          if (this.onPageCompleted) {
            this.onPageCompleted({
              pageNumber: pageNum,
              page: canonicalPage,
              completedCount: completedInRun,
              totalCount: totalToProcess,
              pagesPerMin: Math.round(pagesPerMin * 10) / 10,
              etaSeconds: Math.round(etaSecs)
            });
          }

          if (this.onProgress) {
            this.onProgress({
              documentId: document.document_id,
              completedPages: completedInRun,
              totalPages: totalToProcess,
              percent: Math.round((completedInRun / totalToProcess) * 100),
              pagesPerMin: Math.round(pagesPerMin * 10) / 10,
              etaSeconds: Math.round(etaSecs)
            });
          }

        } catch (err) {
          console.error(`Error processing page ${pageNum}:`, err);
          const errorPage = new CanonicalPage({
            pageNumber: pageNum,
            status: 'failed',
            meta: { error: err.message }
          });
          document.setPage(errorPage);
          await Storage.savePageData(document.document_id, pageNum, errorPage.toJSON());
        }
      }
    };

    // Launch worker threads
    const poolSize = Math.min(this.concurrency, pendingPages.length);
    for (let i = 0; i < poolSize; i++) {
      activePromises.push(processNext(i));
    }

    await Promise.all(activePromises);

    if (this.isCancelled) {
      this._updateStatus('cancelled');
    } else {
      this._updateStatus('completed');
    }

    return document;
  }

  /**
   * Run the multi-agent pipeline on a single page
   */
  async _processSinglePage(pageNumber, pageImgData, recognitionAgent) {
    const { width, height, imageBlob } = pageImgData;

    // Create Canvas from Blob
    const imgBitmap = await createImageBitmap(imageBlob);
    let canvas;
    if (typeof OffscreenCanvas !== 'undefined') {
      canvas = new OffscreenCanvas(width, height);
    } else {
      canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imgBitmap, 0, 0);
    imgBitmap.close();

    // Stage 1: Pre-processing (Deskew & Sauvola adaptive binarization)
    const { processedCanvas, skewAngle } = await ImageFilters.preprocess(canvas, {
      enableDeskew: true,
      enableBinarization: true,
      enableContrast: true
    });

    // Stage 2: Recognition Agent (Tesseract WASM)
    const ocrResult = await recognitionAgent.recognize(processedCanvas);

    // Stage 3: Layout Agent (Blocks, Headings, Paragraphs, Column-aware reading order)
    let blocks = LayoutAgent.analyze(ocrResult, width, height);

    // Stage 4: Script-ID Agent (Devanagari vs Latin code-mixing annotation)
    blocks = ScriptIdAgent.annotateBlocks(blocks);

    // Stage 5: Cross-Validation Agent (Glyph sanity, matra & shirorekha checks)
    const validationResult = CrossValidationAgent.validate(blocks);
    blocks = validationResult.validatedBlocks;

    // Stage 6: Contextual Correction Agent (Proposes inspectable, revertible diffs)
    const correctionResult = CorrectionAgent.propose(blocks);
    blocks = correctionResult.correctedBlocks;

    // Stage 7: QA & Calibrated Confidence Agent (Aggregates scores, tags needs_review)
    const qaResult = QaAgent.evaluate(blocks, 0.85);
    blocks = qaResult.blocks;

    // Build Canonical Page
    const canonicalPage = new CanonicalPage({
      pageNumber,
      width,
      height,
      status: qaResult.summary.blocksNeedingReview > 0 ? 'needs_review' : 'completed',
      blocks,
      meta: {
        skewAngle,
        qaSummary: qaResult.summary,
        processedAt: new Date().toISOString()
      }
    });

    return canonicalPage;
  }

  async _ensureAgentPool() {
    if (this.recognitionAgents.length < this.concurrency) {
      const needed = this.concurrency - this.recognitionAgents.length;
      for (let i = 0; i < needed; i++) {
        const agent = new RecognitionAgent({ languages: this.languages });
        await agent.init();
        this.recognitionAgents.push(agent);
      }
    }
  }

  pause() {
    this.isPaused = true;
    this._updateStatus('paused');
  }

  resume() {
    this.isPaused = false;
    this._updateStatus('running');
  }

  cancel() {
    this.isCancelled = true;
    this._updateStatus('cancelled');
  }

  _waitWhilePaused() {
    return new Promise((resolve) => {
      const check = setInterval(() => {
        if (!this.isPaused || this.isCancelled) {
          clearInterval(check);
          resolve();
        }
      }, 250);
    });
  }

  _updateStatus(status) {
    if (this.onStatusChange) {
      this.onStatusChange(status);
    }
  }

  async terminate() {
    for (const agent of this.recognitionAgents) {
      await agent.terminate();
    }
    this.recognitionAgents = [];
  }
}
