/**
 * Layout & Reading-Order Agent
 * Conforms to PRD §10 (Step 1: Layout Agent) & FR-4 (Structure & Layout Preservation)
 * 
 * Features:
 * - Column-aware reading order analysis (detects 1-column vs 2-column layouts)
 * - Block classification: heading, paragraph, header, footer, caption
 * - Preserves paragraph boundaries and line breaks
 */

import { CanonicalBlock } from '../model/canonical-doc.js';

export class LayoutAgent {
  /**
   * Process raw OCR line/block outputs and reconstruct layout hierarchy
   * @param {Object} ocrResult Tesseract page result (lines, blocks, words, bbox)
   * @param {number} pageWidth Page width in pixels
   * @param {number} pageHeight Page height in pixels
   * @returns {Array<CanonicalBlock>} Structured canonical blocks in true reading order
   */
  static analyze(ocrResult, pageWidth, pageHeight) {
    const rawLines = this._extractLines(ocrResult);
    if (!rawLines.length) {
      return [];
    }

    // 1. Column Detection (detect if page splits into 2 main vertical columns)
    const columns = this._detectColumns(rawLines, pageWidth);

    // 2. Assign lines to columns and sort by reading order
    const orderedLines = this._orderLinesByColumns(rawLines, columns);

    // 3. Cluster lines into coherent blocks (paragraphs, headings, headers, footers)
    const clusteredBlocks = this._clusterIntoBlocks(orderedLines, pageWidth, pageHeight);

    return clusteredBlocks;
  }

  static _extractLines(ocrResult) {
    const lines = [];

    // Tesseract v5 hierarchy: result.data.lines or result.lines
    const tLines = ocrResult?.data?.lines || ocrResult?.lines || [];

    for (let i = 0; i < tLines.length; i++) {
      const line = tLines[i];
      const text = (line.text || '').trim();
      if (!text) continue;

      const bbox0 = line.bbox || {};
      const x0 = bbox0.x0 ?? bbox0.x ?? 0;
      const y0 = bbox0.y0 ?? bbox0.y ?? 0;
      const x1 = bbox0.x1 ?? (x0 + (bbox0.w ?? bbox0.width ?? 0));
      const y1 = bbox0.y1 ?? (y0 + (bbox0.h ?? bbox0.height ?? 0));
      const w = Math.max(1, x1 - x0);
      const h = Math.max(1, y1 - y0);

      const words = (line.words || []).map((w, wIdx) => {
        const wb = w.bbox || {};
        const wx0 = wb.x0 ?? wb.x ?? 0;
        const wy0 = wb.y0 ?? wb.y ?? 0;
        const wx1 = wb.x1 ?? (wx0 + (wb.w ?? wb.width ?? 0));
        const wy1 = wb.y1 ?? (wy0 + (wb.h ?? wb.height ?? 0));
        return {
          id: `w_${i}_${wIdx}`,
          text: (w.text || '').trim(),
          confidence: (w.confidence !== undefined ? w.confidence / 100 : 0.9),
          bbox: [wx0, wy0, Math.max(1, wx1 - wx0), Math.max(1, wy1 - wy0)]
        };
      }).filter(w => w.text.length > 0);

      lines.push({
        id: `line_${i}`,
        text: text,
        confidence: line.confidence !== undefined ? line.confidence / 100 : 0.9,
        bbox: [x0, y0, w, h],
        fontSizeEst: h,
        words: words
      });
    }

    return lines;
  }

  /**
   * Detect vertical text columns by histogramming line horizontal centers
   */
  static _detectColumns(lines, pageWidth) {
    if (lines.length < 6) {
      return [{ xMin: 0, xMax: pageWidth, index: 0 }];
    }

    const midX = pageWidth / 2;
    let leftCount = 0;
    let rightCount = 0;
    let crossCount = 0;

    for (const line of lines) {
      const [x, , w] = line.bbox;
      const right = x + w;

      if (right < midX + 20) {
        leftCount++;
      } else if (x > midX - 20) {
        rightCount++;
      } else {
        crossCount++;
      }
    }

    // If significant lines reside completely on left and right, and few cross the gutter
    if (leftCount >= 3 && rightCount >= 3 && crossCount < (leftCount + rightCount) * 0.3) {
      return [
        { xMin: 0, xMax: midX, index: 0 },
        { xMin: midX, xMax: pageWidth, index: 1 }
      ];
    }

    return [{ xMin: 0, xMax: pageWidth, index: 0 }];
  }

  static _orderLinesByColumns(lines, columns) {
    if (columns.length === 1) {
      // Sort strictly top-to-bottom
      return [...lines].sort((a, b) => a.bbox[1] - b.bbox[1]);
    }

    // Multi-column sorting
    const col0 = [];
    const col1 = [];
    const fullWidth = [];

    const gutterX = columns[0].xMax;

    for (const line of lines) {
      const [x, , w] = line.bbox;
      if (w > (columns[0].xMax * 1.5)) {
        // Full width heading spanning both columns
        fullWidth.push(line);
      } else if (x + w / 2 < gutterX) {
        col0.push(line);
      } else {
        col1.push(line);
      }
    }

    col0.sort((a, b) => a.bbox[1] - b.bbox[1]);
    col1.sort((a, b) => a.bbox[1] - b.bbox[1]);
    fullWidth.sort((a, b) => a.bbox[1] - b.bbox[1]);

    // Merge: full width banners at top, then col0, then col1
    return [...fullWidth, ...col0, ...col1];
  }

  static _clusterIntoBlocks(orderedLines, pageWidth, pageHeight) {
    if (!orderedLines.length) return [];

    const blocks = [];
    let currentLines = [];
    let blockIndex = 1;

    const flushBlock = () => {
      if (!currentLines.length) return;

      // Compute bounding box encompassing all lines
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      let totalConfidence = 0;
      const combinedWords = [];
      const textParts = [];

      for (const line of currentLines) {
        const [lx, ly, lw, lh] = line.bbox;
        minX = Math.min(minX, lx);
        minY = Math.min(minY, ly);
        maxX = Math.max(maxX, lx + lw);
        maxY = Math.max(maxY, ly + lh);
        totalConfidence += line.confidence;
        combinedWords.push(...line.words);
        textParts.push(line.text);
      }

      const blockBbox = [minX, minY, Math.max(1, maxX - minX), Math.max(1, maxY - minY)];
      const avgConfidence = totalConfidence / currentLines.length;
      const fullText = textParts.join('\n');

      // Classify type
      const blockType = this._classifyBlockType(currentLines, blockBbox, pageWidth, pageHeight);

      const canonicalBlock = new CanonicalBlock({
        blockId: `blk_${blockIndex}`,
        type: blockType,
        readingOrder: blockIndex,
        text: fullText,
        rawText: fullText,
        confidence: Math.round(avgConfidence * 100) / 100,
        bbox: blockBbox,
        needsReview: avgConfidence < 0.85,
        lines: currentLines,
        words: combinedWords
      });

      blocks.push(canonicalBlock);
      blockIndex++;
      currentLines = [];
    };

    // Cluster based on vertical gap & line heights
    for (let i = 0; i < orderedLines.length; i++) {
      const line = orderedLines[i];
      if (currentLines.length === 0) {
        currentLines.push(line);
        continue;
      }

      const prevLine = currentLines[currentLines.length - 1];
      const prevYBottom = prevLine.bbox[1] + prevLine.bbox[3];
      const currentYTop = line.bbox[1];
      const verticalGap = currentYTop - prevYBottom;
      const avgHeight = (prevLine.bbox[3] + line.bbox[3]) / 2;

      // New paragraph if vertical gap exceeds ~1.4x line height or if font size changes significantly
      const fontDifference = Math.abs(line.fontSizeEst - prevLine.fontSizeEst);
      const isLargeGap = verticalGap > avgHeight * 1.35;
      const isStyleChange = fontDifference > avgHeight * 0.45;

      if (isLargeGap || isStyleChange) {
        flushBlock();
      }

      currentLines.push(line);
    }

    flushBlock();
    return blocks;
  }

  static _classifyBlockType(lines, bbox, pageWidth, pageHeight) {
    const [, y, , h] = bbox;

    // Header: Top 6% of page and short text
    if (y < pageHeight * 0.06 && lines.length <= 2) {
      return 'header';
    }

    // Footer: Bottom 6% of page
    if (y + h > pageHeight * 0.94 && lines.length <= 2) {
      return 'footer';
    }

    // Heading: 1 or 2 lines with larger font height or centered
    const firstLine = lines[0];
    if (lines.length <= 2 && firstLine.fontSizeEst > 24) {
      return 'heading';
    }

    return 'paragraph';
  }
}
