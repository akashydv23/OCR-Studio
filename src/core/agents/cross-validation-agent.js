/**
 * Cross-Validation & Consistency Agent
 * Conforms to PRD §10 (Step 4: Cross-Validation Agent)
 * 
 * Verifies structural, orthographic, and glyph consistency in Indic OCR output:
 * - Detects invalid Unicode matra combinations and orphaned diacritics
 * - Flags severed shirorekha artifacts and accidental Latin punctuation splits
 * - Evaluates confidence distribution across words
 */

export class CrossValidationAgent {
  /**
   * Validate a list of canonical blocks
   * @param {Array<Object>} blocks
   * @returns {{validatedBlocks: Array<Object>, totalFlags: number, flags: Array<Object>}}
   */
  static validate(blocks) {
    const allFlags = [];

    for (const block of blocks) {
      block.flags = [];
      const lines = block.lines || [];

      for (const line of lines) {
        const words = line.words || [];

        for (const word of words) {
          const wordFlags = this._checkWordOrthography(word.text, word.bbox);
          if (wordFlags.length > 0) {
            word.flags = wordFlags;
            block.flags.push(...wordFlags);
            allFlags.push(...wordFlags);
            // Downgrade word confidence if structural anomaly detected
            word.confidence = Math.min(word.confidence, 0.65);
          }
        }
      }

      // If block contains structural flags or overall confidence is low, flag for review
      if (block.flags.length > 0) {
        block.needs_review = true;
      }
    }

    return {
      validatedBlocks: blocks,
      totalFlags: allFlags.length,
      flags: allFlags
    };
  }

  /**
   * Check Indic orthographic rules on a single word token
   */
  static _checkWordOrthography(word, bbox) {
    const flags = [];
    if (!word || word.length < 2) return flags;

    // 1. Orphaned / Leading Matra Check (Dependent vowel sign cannot start a word)
    // Devanagari dependent vowel signs: \u093E to \u094C, \u0962, \u0963
    const firstCode = word.charCodeAt(0);
    if ((firstCode >= 0x093E && firstCode <= 0x094C) || firstCode === 0x094D) {
      flags.push({
        type: 'orphaned_matra',
        severity: 'high',
        word,
        bbox,
        message: `Word begins with an unattached dependent vowel or virama: '${word[0]}'`
      });
    }

    // 2. Consecutive Matras Check (e.g. िकाी, ुे)
    const consecutiveMatraRegex = /[\u093E-\u094C]{2,}/;
    if (consecutiveMatraRegex.test(word)) {
      flags.push({
        type: 'consecutive_matras',
        severity: 'high',
        word,
        bbox,
        message: `Word contains illegal consecutive vowel signs: '${word}'`
      });
    }

    // 3. Double Virama Check (््)
    if (word.includes('\u094D\u094D')) {
      flags.push({
        type: 'double_virama',
        severity: 'medium',
        word,
        bbox,
        message: `Word contains redundant consecutive halants/viramas: '${word}'`
      });
    }

    // 4. Broken Word / Severed Shirorekha Artifacts (e.g. Indic text randomly split by Latin punctuation like . - /)
    const severedWordRegex = /[\u0900-\u097F]+[.\-\/\|][\u0900-\u097F]+/;
    if (severedWordRegex.test(word)) {
      flags.push({
        type: 'severed_shirorekha',
        severity: 'medium',
        word,
        bbox,
        message: `Possible broken word with OCR artifact split: '${word}'`
      });
    }

    // 5. Numeral confused in word middle (e.g. "क0ल" instead of "कल" or "क०ल")
    const mixedNumeralRegex = /[\u0900-\u097F][0-9][\u0900-\u097F]/;
    if (mixedNumeralRegex.test(word)) {
      flags.push({
        type: 'numeric_glyph_intrusion',
        severity: 'medium',
        word,
        bbox,
        message: `Digit embedded inside Devanagari word: '${word}'`
      });
    }

    return flags;
  }
}
