/**
 * Canonical Document Data Model
 * Conforms strictly to PRD Section 14 (Canonical Structured Representation)
 * 
 * Every export (TXT, DOCX, Searchable PDF, JSON) is derived from this single representation,
 * ensuring 1:1 page-accurate mapping and structure preservation.
 */

export class CanonicalDocument {
  /**
   * @param {Object} options
   * @param {string} [options.documentId]
   * @param {string} options.title
   * @param {number} options.sourcePageCount
   * @param {string} [options.primaryLanguage]
   * @param {Object} [options.metadata]
   */
  constructor({
    documentId = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title = 'Untitled Document',
    sourcePageCount = 0,
    primaryLanguage = 'hin',
    metadata = {}
  } = {}) {
    this.document_id = documentId;
    this.title = title;
    this.source_page_count = sourcePageCount;
    this.primary_language = primaryLanguage;
    this.created_at = new Date().toISOString();
    this.updated_at = new Date().toISOString();
    this.metadata = {
      device_tier: 'client-browser',
      engine: 'IndicOCR-v2-OnDevice',
      model_version: 'tess-fast-5.1.0',
      ...metadata
    };
    /** @type {Array<CanonicalPage>} */
    this.pages = [];
  }

  /**
   * Add or update a page in the document
   * @param {CanonicalPage} page
   */
  setPage(page) {
    const idx = this.pages.findIndex(p => p.page_number === page.page_number);
    if (idx >= 0) {
      this.pages[idx] = page;
    } else {
      this.pages.push(page);
      this.pages.sort((a, b) => a.page_number - b.page_number);
    }
    this.source_page_count = Math.max(this.source_page_count, this.pages.length);
    this.updated_at = new Date().toISOString();
  }

  /**
   * Get page by 1-based page number
   * @param {number} pageNumber
   * @returns {CanonicalPage|undefined}
   */
  getPage(pageNumber) {
    return this.pages.find(p => p.page_number === pageNumber);
  }

  /**
   * Compute aggregate document statistics
   */
  getStats() {
    let totalBlocks = 0;
    let totalWords = 0;
    let totalConfidence = 0;
    let confidenceCount = 0;
    let reviewCount = 0;
    let proposedCorrections = 0;
    let acceptedCorrections = 0;

    for (const page of this.pages) {
      for (const block of page.blocks) {
        totalBlocks++;
        if (block.confidence !== undefined) {
          totalConfidence += block.confidence;
          confidenceCount++;
        }
        if (block.needs_review) {
          reviewCount++;
        }
        if (block.words) {
          totalWords += block.words.length;
        }
        if (block.corrections) {
          for (const c of block.corrections) {
            if (c.status === 'proposed') proposedCorrections++;
            if (c.status === 'accepted') acceptedCorrections++;
          }
        }
      }
    }

    return {
      pageCount: this.pages.length,
      sourcePageCount: this.source_page_count,
      totalBlocks,
      totalWords,
      avgConfidence: confidenceCount > 0 ? (totalConfidence / confidenceCount) : 0,
      blocksNeedingReview: reviewCount,
      proposedCorrections,
      acceptedCorrections
    };
  }

  /**
   * Export to raw JSON matching PRD §14 schema
   */
  toJSON() {
    return {
      document_id: this.document_id,
      title: this.title,
      source_page_count: this.source_page_count,
      primary_language: this.primary_language,
      created_at: this.created_at,
      updated_at: this.updated_at,
      metadata: this.metadata,
      stats: this.getStats(),
      pages: this.pages.map(page => page.toJSON ? page.toJSON() : page)
    };
  }

  /**
   * Deserialize from raw JSON
   * @param {Object} json
   * @returns {CanonicalDocument}
   */
  static fromJSON(json) {
    const doc = new CanonicalDocument({
      documentId: json.document_id,
      title: json.title,
      sourcePageCount: json.source_page_count,
      primaryLanguage: json.primary_language,
      metadata: json.metadata
    });
    doc.created_at = json.created_at || doc.created_at;
    doc.updated_at = json.updated_at || doc.updated_at;
    if (Array.isArray(json.pages)) {
      doc.pages = json.pages.map(p => CanonicalPage.fromJSON(p));
    }
    return doc;
  }
}

export class CanonicalPage {
  /**
   * @param {Object} options
   * @param {number} options.pageNumber 1-based page number
   * @param {number} [options.width]
   * @param {number} [options.height]
   * @param {number} [options.dpi]
   * @param {string} [options.status] 'pending' | 'processing' | 'completed' | 'needs_review' | 'failed'
   * @param {Array<CanonicalBlock>} [options.blocks]
   * @param {Object} [options.meta]
   */
  constructor({
    pageNumber,
    width = 0,
    height = 0,
    dpi = 200,
    status = 'pending',
    blocks = [],
    meta = {}
  }) {
    this.page_number = pageNumber;
    this.width = width;
    this.height = height;
    this.dpi = dpi;
    this.status = status;
    /** @type {Array<CanonicalBlock>} */
    this.blocks = blocks;
    this.meta = meta;
  }

  addBlock(block) {
    this.blocks.push(block);
    this.blocks.sort((a, b) => a.reading_order - b.reading_order);
  }

  toJSON() {
    return {
      page_number: this.page_number,
      dimensions: {
        width: this.width,
        height: this.height,
        dpi: this.dpi
      },
      status: this.status,
      meta: this.meta,
      blocks: this.blocks.map(b => b.toJSON ? b.toJSON() : b)
    };
  }

  static fromJSON(json) {
    const page = new CanonicalPage({
      pageNumber: json.page_number,
      width: json.dimensions?.width || json.width || 0,
      height: json.dimensions?.height || json.height || 0,
      dpi: json.dimensions?.dpi || json.dpi || 200,
      status: json.status || 'completed',
      meta: json.meta || {}
    });
    if (Array.isArray(json.blocks)) {
      page.blocks = json.blocks.map(b => CanonicalBlock.fromJSON(b));
    }
    return page;
  }
}

export class CanonicalBlock {
  /**
   * @param {Object} options
   * @param {string} options.blockId
   * @param {string} [options.type] 'paragraph' | 'heading' | 'header' | 'footer' | 'caption' | 'list_item'
   * @param {number} options.readingOrder
   * @param {string} [options.script] 'Devanagari' | 'Latin' | 'CodeMixed' | 'Unknown'
   * @param {string} options.text Current active text (with accepted corrections)
   * @param {string} [options.rawText] Pristine raw OCR text (NEVER modified)
   * @param {number} [options.confidence] 0.0 - 1.0
   * @param {Array<number>} [options.bbox] [x, y, width, height]
   * @param {boolean} [options.needsReview]
   * @param {Array<Object>} [options.corrections] Diff list
   * @param {Array<Object>} [options.lines] Line hierarchy
   * @param {Array<Object>} [options.words] Word hierarchy with bboxes
   */
  constructor({
    blockId,
    type = 'paragraph',
    readingOrder = 1,
    script = 'Devanagari',
    text = '',
    rawText = null,
    confidence = 0.9,
    bbox = [0, 0, 0, 0],
    needsReview = false,
    corrections = [],
    lines = [],
    words = []
  }) {
    this.block_id = blockId;
    this.type = type;
    this.reading_order = readingOrder;
    this.script = script;
    this.text = text;
    this.raw_text = rawText !== null ? rawText : text;
    this.confidence = confidence;
    this.bbox = bbox;
    this.needs_review = needsReview;
    this.corrections = corrections;
    this.lines = lines;
    this.words = words;
  }

  /**
   * Apply an AI correction diff
   * @param {number} correctionIndex
   */
  acceptCorrection(correctionIndex) {
    const corr = this.corrections[correctionIndex];
    if (!corr || corr.status === 'accepted') return;
    corr.status = 'accepted';
    this.recomputeActiveText();
  }

  /**
   * Reject an AI correction diff
   * @param {number} correctionIndex
   */
  rejectCorrection(correctionIndex) {
    const corr = this.corrections[correctionIndex];
    if (!corr || corr.status === 'rejected') return;
    corr.status = 'rejected';
    this.recomputeActiveText();
  }

  /**
   * Recompute active text based on raw_text + accepted corrections
   */
  recomputeActiveText() {
    let result = this.raw_text;
    const accepted = this.corrections.filter(c => c.status === 'accepted');
    for (const c of accepted) {
      if (c.original && result.includes(c.original)) {
        result = result.replace(c.original, c.suggested);
      }
    }
    this.text = result;
  }

  toJSON() {
    return {
      block_id: this.block_id,
      type: this.type,
      reading_order: this.reading_order,
      script: this.script,
      text: this.text,
      raw_text: this.raw_text,
      confidence: this.confidence,
      bbox: this.bbox,
      needs_review: this.needs_review,
      corrections: this.corrections,
      lines: this.lines,
      words: this.words
    };
  }

  static fromJSON(json) {
    return new CanonicalBlock({
      blockId: json.block_id,
      type: json.type,
      readingOrder: json.reading_order,
      script: json.script,
      text: json.text,
      rawText: json.raw_text,
      confidence: json.confidence,
      bbox: json.bbox,
      needsReview: json.needs_review,
      corrections: json.corrections || [],
      lines: json.lines || [],
      words: json.words || []
    });
  }
}
