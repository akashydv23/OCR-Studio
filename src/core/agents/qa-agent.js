/**
 * QA & Calibrated Confidence Agent
 * Conforms to PRD §10 (Step 6: QA / Confidence Agent)
 * 
 * Aggregates signals across the recognition, cross-validation, and correction agents
 * to generate a calibrated confidence score and mark blocks that require human review.
 */

export class QaAgent {
  /**
   * Run QA scoring on all blocks of a page
   * @param {Array<Object>} blocks
   * @param {number} [confidenceThreshold=0.85]
   * @returns {{blocks: Array<Object>, summary: Object}}
   */
  static evaluate(blocks, confidenceThreshold = 0.85) {
    let totalBlockScore = 0;
    let reviewCount = 0;
    let flagCount = 0;
    let proposedDiffCount = 0;

    for (const block of blocks) {
      // Base confidence from words
      let wordConfidenceSum = 0;
      let wordCount = 0;

      if (block.words && block.words.length > 0) {
        for (const w of block.words) {
          wordConfidenceSum += (w.confidence !== undefined ? w.confidence : 0.9);
          wordCount++;
        }
      }

      let calibratedConfidence = wordCount > 0 
        ? (wordConfidenceSum / wordCount) 
        : (block.confidence || 0.85);

      // Penalize for cross-validation flags
      const flags = block.flags || [];
      flagCount += flags.length;

      for (const flag of flags) {
        if (flag.severity === 'high') {
          calibratedConfidence -= 0.15;
        } else if (flag.severity === 'medium') {
          calibratedConfidence -= 0.08;
        }
      }

      // Bonus if proposed corrections resolve flags
      const corrections = block.corrections || [];
      proposedDiffCount += corrections.length;

      // Bound between 0.05 and 0.99
      calibratedConfidence = Math.max(0.05, Math.min(0.99, calibratedConfidence));
      block.confidence = Math.round(calibratedConfidence * 100) / 100;

      // Flag for review if confidence is below threshold OR if high-severity flags exist
      const hasHighSeverityFlag = flags.some(f => f.severity === 'high');
      const hasUnresolvedDiffs = corrections.some(c => c.status === 'proposed');

      block.needs_review = (block.confidence < confidenceThreshold) || hasHighSeverityFlag || hasUnresolvedDiffs;

      if (block.needs_review) {
        reviewCount++;
      }

      totalBlockScore += block.confidence;
    }

    const avgPageConfidence = blocks.length > 0 ? (totalBlockScore / blocks.length) : 1.0;

    // Estimate Word Error Rate (WER) and Character Error Rate (CER) heuristic
    const estWer = Math.max(0, (1.0 - avgPageConfidence) * 1.8).toFixed(3);
    const estCer = Math.max(0, (1.0 - avgPageConfidence) * 0.9).toFixed(3);

    return {
      blocks,
      summary: {
        totalBlocks: blocks.length,
        avgConfidence: Math.round(avgPageConfidence * 100) / 100,
        blocksNeedingReview: reviewCount,
        totalFlags: flagCount,
        proposedDiffs: proposedDiffCount,
        estimatedWer: parseFloat(estWer),
        estimatedCer: parseFloat(estCer),
        qualityGrade: avgPageConfidence >= 0.92 ? 'Excellent' : (avgPageConfidence >= 0.82 ? 'Good' : 'Needs Review')
      }
    };
  }
}
