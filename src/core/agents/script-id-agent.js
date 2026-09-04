/**
 * Script & Language Identification Agent
 * Conforms to PRD §10 (Step 2: Script/Language-ID Agent)
 * 
 * Handles code-mixed Indian documents (e.g. Devanagari + Roman script / English
 * occurring together on the same page or within the same line).
 */

export class ScriptIdAgent {
  /**
   * Classify the script of a text segment
   * @param {string} text
   * @returns {{primaryScript: string, secondaryScript: string|null, isCodeMixed: boolean, stats: Object}}
   */
  static identify(text) {
    if (!text || typeof text !== 'string') {
      return {
        primaryScript: 'Unknown',
        secondaryScript: null,
        isCodeMixed: false,
        stats: { devanagari: 0, latin: 0, numeric: 0, other: 0 }
      };
    }

    let devanagariCount = 0;
    let latinCount = 0;
    let devanagariNumeralCount = 0;
    let arabicNumeralCount = 0;
    let punctuationCount = 0;
    let otherCount = 0;

    for (const char of text) {
      const code = char.charCodeAt(0);

      // Devanagari Unicode block: U+0900 to U+097F
      if (code >= 0x0900 && code <= 0x097F) {
        if (code >= 0x0966 && code <= 0x096F) {
          devanagariNumeralCount++;
        } else {
          devanagariCount++;
        }
      }
      // Latin letters: A-Z, a-z
      else if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) {
        latinCount++;
      }
      // Arabic numerals: 0-9
      else if (code >= 48 && code <= 57) {
        arabicNumeralCount++;
      }
      // Punctuation & Whitespace
      else if (/\s|[.,\/#!$%\^&\*;:{}=\-_`~()।॥]/.test(char)) {
        punctuationCount++;
      }
      else {
        otherCount++;
      }
    }

    const totalAlphabet = devanagariCount + latinCount;
    let primaryScript = 'Devanagari';
    let secondaryScript = null;
    let isCodeMixed = false;

    if (totalAlphabet === 0) {
      primaryScript = (devanagariNumeralCount > arabicNumeralCount) ? 'Devanagari' : 'Latin';
    } else {
      const devaRatio = devanagariCount / totalAlphabet;
      const latinRatio = latinCount / totalAlphabet;

      if (devaRatio > 0.85) {
        primaryScript = 'Devanagari';
        if (latinCount > 0) secondaryScript = 'Latin';
      } else if (latinRatio > 0.85) {
        primaryScript = 'Latin';
        if (devanagariCount > 0) secondaryScript = 'Devanagari';
      } else {
        primaryScript = devaRatio >= latinRatio ? 'Devanagari' : 'Latin';
        secondaryScript = devaRatio >= latinRatio ? 'Latin' : 'Devanagari';
        isCodeMixed = true;
      }
    }

    return {
      primaryScript,
      secondaryScript,
      isCodeMixed,
      stats: {
        devanagari: devanagariCount,
        latin: latinCount,
        devanagariNumerals: devanagariNumeralCount,
        arabicNumerals: arabicNumeralCount,
        punctuation: punctuationCount,
        other: otherCount
      }
    };
  }

  /**
   * Process and annotate all blocks in a page
   * @param {Array<Object>} blocks
   */
  static annotateBlocks(blocks) {
    for (const block of blocks) {
      const idResult = this.identify(block.text || '');
      block.script = idResult.primaryScript;
      block.meta = block.meta || {};
      block.meta.secondaryScript = idResult.secondaryScript;
      block.meta.isCodeMixed = idResult.isCodeMixed;
      block.meta.scriptStats = idResult.stats;
    }
    return blocks;
  }
}
