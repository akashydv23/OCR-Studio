/**
 * Memory-Bounded Page Streamer
 * Conforms to PRD FR-1, FR-2, NFR-6 (Memory Management)
 * 
 * Ensures 200-300+ page documents can be rendered and processed without
 * exhausting browser tab RAM. Evicts active bitmaps from memory immediately
 * after caching in IndexedDB.
 */

import { Storage } from '../storage/db.js';

export class PageStreamer {
  /**
   * @param {Object} options
   * @param {string} options.documentId
   * @param {any} [options.pdfDocument] PDF.js document instance
   * @param {Array<File>} [options.imageFiles] Array of image files (if image mode)
   * @param {number} [options.scale] Rendering scale (2.0 = ~200 DPI for crisp Indic text)
   * @param {Function} [options.onPageExtracted] Callback when page image is ready
   */
  constructor({
    documentId,
    pdfDocument = null,
    imageFiles = null,
    scale = 2.0,
    onPageExtracted = null
  }) {
    this.documentId = documentId;
    this.pdfDoc = pdfDocument;
    this.imageFiles = imageFiles;
    this.scale = scale;
    this.onPageExtracted = onPageExtracted;
    this.totalPages = pdfDocument ? pdfDocument.numPages : (imageFiles ? imageFiles.length : 0);
  }

  /**
   * Render and stream a single page to IndexedDB
   * @param {number} pageNumber 1-based page number
   * @returns {Promise<{pageNumber: number, width: number, height: number, imageBlob: Blob, thumbnailBlob: Blob}>}
   */
  async streamPage(pageNumber) {
    if (this.pdfDoc) {
      return await this._streamPdfPage(pageNumber);
    } else if (this.imageFiles) {
      return await this._streamImagePage(pageNumber);
    }
    throw new Error('No valid PDF or image source configured in PageStreamer');
  }

  async _streamPdfPage(pageNumber) {
    const page = await this.pdfDoc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: this.scale });

    // Create OffscreenCanvas if supported, else regular Canvas
    let canvas, ctx;
    if (typeof OffscreenCanvas !== 'undefined') {
      canvas = new OffscreenCanvas(Math.round(viewport.width), Math.round(viewport.height));
      ctx = canvas.getContext('2d');
    } else {
      canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      ctx = canvas.getContext('2d');
    }

    // Render PDF page to canvas
    const renderContext = {
      canvasContext: ctx,
      viewport: viewport
    };
    await page.render(renderContext).promise;

    // Convert to high-res Blob (JPEG 0.88 is compact and keeps Indic matras sharp)
    const imageBlob = await this._canvasToBlob(canvas, 'image/jpeg', 0.88);

    // Create lightweight thumbnail (width ~ 160px)
    const thumbScale = 160 / viewport.width;
    const thumbCanvas = this._createThumbnailCanvas(canvas, viewport.width * thumbScale, viewport.height * thumbScale);
    const thumbnailBlob = await this._canvasToBlob(thumbCanvas, 'image/jpeg', 0.7);

    // Persist immediately to IndexedDB
    await Storage.savePageImage(this.documentId, pageNumber, imageBlob, thumbnailBlob);

    const result = {
      pageNumber,
      width: Math.round(viewport.width),
      height: Math.round(viewport.height),
      imageBlob,
      thumbnailBlob
    };

    if (this.onPageExtracted) {
      this.onPageExtracted(result);
    }

    // Explicitly release canvas memory
    canvas.width = 1;
    canvas.height = 1;
    if (thumbCanvas) {
      thumbCanvas.width = 1;
      thumbCanvas.height = 1;
    }

    return result;
  }

  async _streamImagePage(pageNumber) {
    const file = this.imageFiles[pageNumber - 1];
    if (!file) throw new Error(`Image for page ${pageNumber} not found.`);

    // Load file into Image bitmap
    const imgBitmap = await createImageBitmap(file);
    const width = imgBitmap.width;
    const height = imgBitmap.height;

    // Create thumbnail
    const thumbScale = 160 / width;
    let thumbCanvas;
    if (typeof OffscreenCanvas !== 'undefined') {
      thumbCanvas = new OffscreenCanvas(Math.round(width * thumbScale), Math.round(height * thumbScale));
    } else {
      thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = Math.round(width * thumbScale);
      thumbCanvas.height = Math.round(height * thumbScale);
    }
    const tCtx = thumbCanvas.getContext('2d');
    tCtx.drawImage(imgBitmap, 0, 0, thumbCanvas.width, thumbCanvas.height);
    const thumbnailBlob = await this._canvasToBlob(thumbCanvas, 'image/jpeg', 0.7);

    // Save image blob to IndexedDB
    await Storage.savePageImage(this.documentId, pageNumber, file, thumbnailBlob);

    const result = {
      pageNumber,
      width,
      height,
      imageBlob: file,
      thumbnailBlob
    };

    if (this.onPageExtracted) {
      this.onPageExtracted(result);
    }

    imgBitmap.close();
    return result;
  }

  _createThumbnailCanvas(sourceCanvas, targetWidth, targetHeight) {
    let tCanvas;
    if (typeof OffscreenCanvas !== 'undefined') {
      tCanvas = new OffscreenCanvas(Math.round(targetWidth), Math.round(targetHeight));
    } else {
      tCanvas = document.createElement('canvas');
      tCanvas.width = Math.round(targetWidth);
      tCanvas.height = Math.round(targetHeight);
    }
    const tCtx = tCanvas.getContext('2d');
    tCtx.drawImage(sourceCanvas, 0, 0, tCanvas.width, tCanvas.height);
    return tCanvas;
  }

  _canvasToBlob(canvas, type = 'image/jpeg', quality = 0.88) {
    if (canvas.convertToBlob) {
      return canvas.convertToBlob({ type, quality });
    }
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), type, quality);
    });
  }
}
