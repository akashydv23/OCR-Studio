/**
 * IndicOCR v2 Main Application Controller
 * Orchestrates the full lifecycle: Ingestion -> Preflight -> Streaming Batch -> Review Studio -> Exports
 */

import { CanonicalDocument } from './core/model/canonical-doc.js?v=20260904_gemini36';
import { Storage } from './core/storage/db.js?v=20260904_gemini36';
import { PageStreamer } from './core/ingestion/pdf-streamer.js?v=20260904_gemini36';
import { PipelineCoordinator } from './core/pipeline/coordinator.js?v=20260904_gemini36';
import { Navbar } from './ui/components/Navbar.js?v=20260904_gemini36';
import { UploadZone } from './ui/components/UploadZone.js?v=20260904_gemini36';
import { JobProgress } from './ui/components/JobProgress.js?v=20260904_gemini36';
import { ReviewStudio } from './ui/components/ReviewStudio.js?v=20260904_gemini36';
import { ExportModal } from './ui/components/ExportModal.js?v=20260904_gemini36';
import { GeminiModal } from './ui/components/GeminiModal.js?v=20260904_gemini36';
import { UserGuideModal } from './ui/components/UserGuideModal.js?v=20260904_gemini36';

class IndicApp {
  constructor() {
    this.currentDocument = null;
    this.coordinator = null;
    this.streamer = null;

    this.navContainer = document.getElementById('navbar-mount');
    this.mainContainer = document.getElementById('main-mount');
    this.modalContainer = document.getElementById('modal-mount');

    this.navbar = null;
    this.uploadZone = null;
    this.jobProgress = null;
    this.reviewStudio = null;
    this.exportModal = null;
    this.geminiModal = null;
    this.guideModal = null;
  }

  async init() {
    // 1. Initialize IndexedDB
    await Storage.init();

    // 2. Initialize Navigation Bar
    this.navbar = new Navbar({
      container: this.navContainer,
      onNewUpload: () => this.showUploadScreen(),
      onClearSession: async () => {
        if (this.currentDocument) {
          await Storage.deleteDocument(this.currentDocument.document_id);
          this.currentDocument = null;
          this.navbar.setDocument(null);
          this.showUploadScreen();
        }
      },
      onExportClick: () => this.showExportModal(),
      onGeminiClick: () => this.showGeminiModal('settings'),
      onGuideClick: () => this.showGuideModal(),
      onLanguageChange: (lang) => {
        if (this.coordinator) {
          this.coordinator.languages = lang;
        }
      }
    });

    // 3. Check for existing documents in IndexedDB
    const existingDocs = await Storage.listDocuments();
    const activeDoc = existingDocs.find(d => d.pages && d.pages.length > 0);

    if (activeDoc) {
      // Present upload screen with explicit Resume or Discard banner
      this.showUploadScreen({ existingDoc: activeDoc });
    } else {
      this.showUploadScreen();
    }

    // 4. First-time user welcome guide prompt
    if (UserGuideModal.shouldShowOnStartup() && !activeDoc) {
      setTimeout(() => {
        this.showGuideModal('quickstart');
      }, 400);
    }
  }

  showUploadScreen({ existingDoc = null } = {}) {
    this.currentDocument = null;
    this.navbar.setDocument(null);
    this.mainContainer.innerHTML = '<div id="upload-mount" style="flex: 1; display: flex;"></div>';
    const uploadMount = document.getElementById('upload-mount');

    this.uploadZone = new UploadZone({
      container: uploadMount,
      existingDoc: existingDoc,
      onResumeDoc: (doc) => {
        this.currentDocument = CanonicalDocument.fromJSON(doc);
        this.navbar.setDocument(this.currentDocument);
        this.showReviewStudio();
      },
      onDiscardDoc: async (docId) => {
        await Storage.deleteDocument(docId);
      },
      onStartJob: (params) => this.startProcessingJob(params),
      onOpenGuide: () => this.showGuideModal()
    });
  }

  async startProcessingJob({ preflight, files, language, concurrency, options }) {
    // Create new Canonical Document
    this.currentDocument = new CanonicalDocument({
      title: preflight.fileName.replace(/\.[^/.]+$/, ''),
      sourcePageCount: preflight.pageCount,
      primaryLanguage: language,
      metadata: {
        fileSize: preflight.fileSize,
        concurrency,
        options
      }
    });

    // Save initial document record
    await Storage.saveDocument(this.currentDocument);
    this.navbar.setDocument(this.currentDocument);

    // Setup Main View Layout: Progress at top, Review Studio below
    this.mainContainer.innerHTML = `
      <div id="progress-mount"></div>
      <div id="studio-mount" style="flex: 1; display: flex; flex-direction: column; overflow: hidden;"></div>
    `;

    const progressMount = document.getElementById('progress-mount');
    const studioMount = document.getElementById('studio-mount');

    // 1. Setup Job Progress Monitor
    this.jobProgress = new JobProgress({
      container: progressMount,
      totalPages: preflight.pageCount,
      statusText: 'Initializing On-Device WASM Engine & Models...',
      onPause: () => this.coordinator && this.coordinator.pause(),
      onResume: () => this.coordinator && this.coordinator.resume(),
      onCancel: () => this.coordinator && this.coordinator.cancel(),
      onDownloadPartial: () => this.showExportModal()
    });

    // 2. Setup Review Studio (starts with empty / initial pages)
    this.reviewStudio = new ReviewStudio({
      container: studioMount,
      document: this.currentDocument,
      onDocUpdated: (doc) => this.navbar.setDocument(doc),
      onOpenGeminiModal: (tab) => this.showGeminiModal(tab)
    });

    // 3. Initialize Page Streamer
    this.streamer = new PageStreamer({
      documentId: this.currentDocument.document_id,
      pdfDocument: preflight.pdfDocument,
      imageFiles: preflight.files,
      scale: 2.0
    });

    // 4. Initialize Pipeline Coordinator
    this.coordinator = new PipelineCoordinator({
      languages: language,
      concurrency: concurrency,
      onStatusChange: (status) => {
        this.jobProgress.status = status;
        this.jobProgress.render();
      },
      onProgress: (info) => {
        this.jobProgress.updateProgress({
          completedPages: info.completedPages,
          totalPages: info.totalPages,
          percent: info.percent,
          pagesPerMin: info.pagesPerMin,
          etaSeconds: info.etaSeconds,
          status: 'running',
          statusText: `Digitizing Page ${Math.min(info.completedPages + 1, info.totalPages)} of ${info.totalPages} (Layout & Devanagari AI)...`
        });
      },
      onPageCompleted: ({ pageNumber, page, completedCount, totalCount }) => {
        // Refresh Review Studio and filmstrip
        this.reviewStudio.setDocument(this.currentDocument);
        if (completedCount === 1) {
          this.reviewStudio.setPage(pageNumber);
        }
        this.navbar.setDocument(this.currentDocument);
      }
    });

    // Execute batch
    try {
      await this.coordinator.processDocument({
        document: this.currentDocument,
        streamer: this.streamer
      });

      this.jobProgress.updateProgress({
        completedPages: this.currentDocument.pages.length,
        totalPages: this.currentDocument.source_page_count,
        percent: 100,
        pagesPerMin: 0,
        etaSeconds: 0,
        status: 'completed'
      });

    } catch (err) {
      console.error('Batch processing failed:', err);
      alert(`Processing error: ${err.message}`);
    }
  }

  showReviewStudio() {
    this.mainContainer.innerHTML = `
      <div id="studio-mount" style="flex: 1; display: flex; flex-direction: column; overflow: hidden;"></div>
    `;
    const studioMount = document.getElementById('studio-mount');

    this.reviewStudio = new ReviewStudio({
      container: studioMount,
      document: this.currentDocument,
      onDocUpdated: (doc) => this.navbar.setDocument(doc),
      onOpenGeminiModal: (tab) => this.showGeminiModal(tab)
    });
  }

  showGeminiModal(initialTab = 'settings') {
    this.geminiModal = new GeminiModal({
      container: this.modalContainer,
      document: this.currentDocument,
      initialTab: initialTab,
      onClose: () => {
        this.modalContainer.innerHTML = '';
        if (this.navbar) this.navbar.render();
      },
      onConfigChanged: () => {
        if (this.navbar) this.navbar.render();
        if (this.reviewStudio) this.reviewStudio.render();
      }
    });
  }

  showExportModal() {
    if (!this.currentDocument) return;

    this.exportModal = new ExportModal({
      container: this.modalContainer,
      document: this.currentDocument,
      onClose: () => {
        this.modalContainer.innerHTML = '';
      }
    });
  }

  showGuideModal(initialTab = 'quickstart') {
    this.guideModal = new UserGuideModal({
      container: this.modalContainer,
      initialTab: initialTab,
      onClose: () => {
        this.modalContainer.innerHTML = '';
      },
      onTrySample: () => {
        this.modalContainer.innerHTML = '';
        if (this.uploadZone) {
          this.uploadZone.loadSampleDocument();
        } else {
          this.showUploadScreen();
          if (this.uploadZone) this.uploadZone.loadSampleDocument();
        }
      },
      onOpenGemini: () => {
        this.modalContainer.innerHTML = '';
        this.showGeminiModal('settings');
      }
    });
  }
}

// Bootstrap application once DOM is loaded
window.addEventListener('DOMContentLoaded', async () => {
  const app = new IndicApp();
  await app.init();
  window.indicApp = app; // Expose for testing/debugging
});
