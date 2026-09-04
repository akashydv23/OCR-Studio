/**
 * Context-Aware Indic Correction Agent
 * Conforms to PRD §10 (Step 5: Correction Agent) & FR-5 (Agentic AI Correction & QA)
 * 
 * STRICT ARCHITECTURAL PRINCIPLE:
 * The correction layer must NEVER silently overwrite raw OCR text.
 * Every correction is proposed as an explicit, inspectable, and revertible diff.
 */

// Core Indic high-frequency words for dictionary validation
const COMMON_INDIC_LEXICON = new Set([
  'भारत', 'सरकार', 'न्यायालय', 'अधिनियम', 'संविधान', 'आदेश', 'निर्णय', 'धारा',
  'प्रावधान', 'प्रकरण', 'याचिका', 'अपील', 'पत्र', 'दिनांक', 'वर्ष', 'संख्या',
  'कार्यालय', 'अधिकारी', 'सचिव', 'आयोग', 'विभाग', 'राज्य', 'केंद्रीय', 'लोकसभा',
  'राज्यसभा', 'विधानसभा', 'सूचना', 'प्रमाणपत्र', 'विश्वविद्यालय', 'संस्थान', 'परिषद',
  'प्रथम', 'द्वितीय', 'तृतीय', 'अंतिम', 'सत्य', 'न्याय', 'धर्म', 'कर्म',
  'कहा', 'गया', 'किया', 'होता', 'होते', 'होती', 'सकता', 'सकते', 'सकती',
  'लिए', 'साथ', 'और', 'तथा', 'एवं', 'या', 'परंतु', 'किंतु', 'लेकिन',
  'उनके', 'उनकी', 'उनका', 'जिसमें', 'जिसके', 'जिसकी', 'जिसका', 'इसलिए',
  'खबर', 'खाना', 'खेल', 'खोल', 'खुद', 'खुशी', 'खराब', 'खर्च', 'खतरा', 'खरीद',
  'घर', 'घोषणा', 'घटना', 'घंटा', 'घूम', 'धन', 'धर्म', 'ध्यान', 'धोखा', 'धारा',
  'बात', 'बच्चा', 'वर्ष', 'विकाश', 'विकास', 'विभाग', 'व्यवस्था', 'व्यवसाय'
]);

export class CorrectionAgent {
  /**
   * Scan blocks and propose structured diffs
   * @param {Array<Object>} blocks
   * @returns {{correctedBlocks: Array<Object>, proposedCount: number}}
   */
  static propose(blocks) {
    let proposedCount = 0;

    for (const block of blocks) {
      block.corrections = block.corrections || [];
      const lines = block.lines || [];

      for (const line of lines) {
        const words = line.words || [];

        for (const wordObj of words) {
          const rawWord = wordObj.text;
          const correction = this._analyzeWord(rawWord, wordObj.bbox);

          if (correction) {
            // Check if this correction is already proposed
            const exists = block.corrections.some(c => c.original === correction.original && c.suggested === correction.suggested);
            if (!exists) {
              block.corrections.push(correction);
              proposedCount++;
            }
          }
        }
      }
    }

    return {
      correctedBlocks: blocks,
      proposedCount
    };
  }

  /**
   * Analyze a single word token for well-known Indic OCR optical ambiguities
   */
  static _analyzeWord(word, bbox) {
    if (!word || word.length < 2) return null;

    // Rule 1: 'रव' merged glyph optical confusion for 'ख'
    // 'ख' is frequently misrecognized as 'र' + 'व' because the left loop resembles 'र' and right loop resembles 'व'.
    // Example: 'रवबर' -> 'खबर', 'रवच' -> 'खर्च'
    if (word.startsWith('रव') && word.length >= 3) {
      const candidate = 'ख' + word.slice(2);
      if (COMMON_INDIC_LEXICON.has(candidate) || !COMMON_INDIC_LEXICON.has(word)) {
        return {
          id: `diff_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          original: word,
          suggested: candidate,
          reason: "Common Devanagari ligature confusion: 'रव' split glyph resolved to 'ख'",
          confidenceGain: 0.22,
          status: 'proposed',
          bbox
        };
      }
    }

    // Rule 2: Accidental Latin '0' / 'O' inside Devanagari word
    if (/[0O]/.test(word) && /[\u0900-\u097F]/.test(word)) {
      // If it looks like Shunya '०'
      const candidate = word.replace(/[0O]/g, '०');
      return {
        id: `diff_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        original: word,
        suggested: candidate,
        reason: "Code-mixed glyph normalization: Latin '0/O' corrected to Devanagari shunya '०'",
        confidenceGain: 0.18,
        status: 'proposed',
        bbox
      };
    }

    // Rule 3: 'घ' vs 'ध' confusion
    // 'ध' has an open loop at top-left, 'घ' has a full shirorekha.
    if (word.startsWith('घ्यान')) {
      return {
        id: `diff_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        original: word,
        suggested: word.replace('घ्यान', 'ध्यान'),
        reason: "Visual confusion: 'घ' shirorekha error corrected to 'ध' in 'ध्यान'",
        confidenceGain: 0.25,
        status: 'proposed',
        bbox
      };
    }

    // Rule 4: 'व' vs 'ब' confusion
    // In Hindi, 'ब' has a crossbar inside the loop, easily missed in faint scans.
    if (word === 'वच्चा' || word === 'वच्चे') {
      const candidate = word.replace('व', 'ब');
      return {
        id: `diff_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        original: word,
        suggested: candidate,
        reason: "Missing internal diagonal crossbar in faint scan: 'व' corrected to 'ब' ('बच्चा')",
        confidenceGain: 0.28,
        status: 'proposed',
        bbox
      };
    }

    // Rule 5: Trailing or broken virama at end of normal Hindi word (e.g. 'सरकार्' -> 'सरकार')
    if (word.endsWith('\u094D') && word.length > 3) {
      const trimmed = word.slice(0, -1);
      if (COMMON_INDIC_LEXICON.has(trimmed)) {
        return {
          id: `diff_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          original: word,
          suggested: trimmed,
          reason: "Extraneous scan speckle recognized as trailing halant/virama removed",
          confidenceGain: 0.20,
          status: 'proposed',
          bbox
        };
      }
    }

    return null;
  }
}
