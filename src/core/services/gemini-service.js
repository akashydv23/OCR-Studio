/**
 * Google Gemini API Client Service
 * 
 * Provides on-demand hybrid cloud AI capabilities:
 * 1. Contextual Indic OCR proofreading (generates inspectable diffs)
 * 2. Multimodal Vision OCR transcription for degraded/difficult scans
 * 3. Document summarization and semantic Q&A
 * 
 * Stores credentials strictly in client-side localStorage (BYOK pattern).
 * Respects the core principle: Zero silent overwrites.
 */

const STORAGE_KEY_API_KEY = 'indic_ocr_gemini_api_key';
const STORAGE_KEY_MODEL = 'indic_ocr_gemini_model';
const DEFAULT_MODEL = 'gemini-3.6-flash';

export class GeminiService {
  /**
   * Get the stored Gemini API key
   * @returns {string}
   */
  static getApiKey() {
    return localStorage.getItem(STORAGE_KEY_API_KEY) || '';
  }

  /**
   * Save the Gemini API key
   * @param {string} key
   */
  static setApiKey(key) {
    if (key && key.trim()) {
      localStorage.setItem(STORAGE_KEY_API_KEY, key.trim());
    } else {
      localStorage.removeItem(STORAGE_KEY_API_KEY);
    }
  }

  /**
   * Check if a Gemini API key is configured
   * @returns {boolean}
   */
  static hasApiKey() {
    return Boolean(this.getApiKey());
  }

  /**
   * Get configured model
   * @returns {string}
   */
  static getModel() {
    const stored = localStorage.getItem(STORAGE_KEY_MODEL);
    // Sanitize deprecated models like gemini-2.5-flash or gemini-2.5-pro
    if (!stored || stored.startsWith('gemini-2.5')) {
      return DEFAULT_MODEL;
    }
    return stored;
  }

  /**
   * Set model preference
   * @param {string} model
   */
  static setModel(model) {
    if (model) {
      if (model.startsWith('gemini-2.5')) {
        model = DEFAULT_MODEL;
      }
      localStorage.setItem(STORAGE_KEY_MODEL, model);
    }
  }

  /**
   * Clear all Gemini credentials
   */
  static clearCredentials() {
    localStorage.removeItem(STORAGE_KEY_API_KEY);
    localStorage.removeItem(STORAGE_KEY_MODEL);
  }

  /**
   * Test API key connectivity
   * @param {string} [customKey] Optional key to test before saving
   * @returns {Promise<{success: boolean, message: string, model: string}>}
   */
  static async testConnection(customKey = null) {
    const key = customKey || this.getApiKey();
    if (!key) {
      throw new Error('No API key provided. Please enter a valid Google Gemini API key.');
    }

    const model = this.getModel();
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

    const payload = {
      contents: [{
        parts: [{ text: 'Respond with the single word "Connected" if you receive this message.' }]
      }],
      generationConfig: {
        maxOutputTokens: 10,
        temperature: 0.1
      }
    };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        const errMsg = data?.error?.message || `HTTP ${response.status}: ${response.statusText}`;
        throw new Error(errMsg);
      }

      const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return {
        success: true,
        message: 'Successfully connected to Google Gemini API!',
        model: model,
        reply: reply.trim()
      };
    } catch (err) {
      console.error('Gemini connection test failed:', err);
      throw err;
    }
  }

  /**
   * Contextual Indic OCR Proofreading
   * Takes raw/recognized Indic text, asks Gemini to identify OCR errors,
   * and returns structured diff objects with linguistic rationale.
   * 
   * @param {string} text Raw OCR text to proofread
   * @param {string} [language='hin'] Primary language ('hin', 'mar', 'san', 'eng')
   * @returns {Promise<Array<{original: string, suggested: string, reason: string, confidenceGain: number}>>}
   */
  static async proofreadText(text, language = 'hin') {
    if (!this.hasApiKey()) {
      throw new Error('Gemini API key is not configured. Please open Gemini Settings to add your key.');
    }

    if (!text || text.trim().length < 3) {
      return [];
    }

    const key = this.getApiKey();
    const model = this.getModel();
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

    const prompt = `You are an expert Indic language computational linguist and OCR error correction specialist.
The text below was produced by an on-device OCR engine scanning an Indian regional document (primary language: ${language}).

Your task:
1. Identify clear optical character recognition (OCR) errors in the text, including:
   - Devanagari ligature split confusions (e.g., 'रव' confused with 'ख')
   - Severed or missing shirorekha (headline breaks)
   - Stray or missing matras (vowel signs like िका, ु, ो)
   - Confusions between visually similar glyphs (e.g., 'घ' vs 'ध', 'व' vs 'ब', 'य' vs 'थ', 'ट' vs 'ठ')
   - Inadvertent Latin characters/numbers embedded in Indic words (e.g. Latin '0'/'O' for shunya '०')
   - Grammatical / spelling corruptions typical of faint or skewed print
2. DO NOT make stylistic rewrites or change valid words. Only correct clear OCR optical errors.
3. Return a valid JSON array where each element has:
   - "original": the exact misrecognized word or phrase as it appears in the text
   - "suggested": the corrected word or phrase
   - "reason": concise explanation of why this is an OCR optical error
   - "confidenceGain": estimated confidence improvement between 0.15 and 0.40

If there are no OCR errors, return an empty array: []

Text to analyze:
"""
${text}
"""`;

    const payload = {
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json'
      }
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error?.message || `Gemini API error: HTTP ${response.status}`);
    }

    const rawJson = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawJson) return [];

    try {
      const parsed = JSON.parse(rawJson);
      if (Array.isArray(parsed)) {
        return parsed.filter(item => item.original && item.suggested && item.original !== item.suggested);
      }
      return [];
    } catch (parseErr) {
      console.warn('Failed to parse Gemini JSON diff output:', parseErr, rawJson);
      return [];
    }
  }

  /**
   * Multimodal Vision OCR
   * Sends canvas or image blob directly to Gemini Vision model for high-accuracy OCR.
   * 
   * @param {HTMLCanvasElement|Blob|string} imageSource Canvas, Blob, or base64 data URL
   * @param {string} [language='hin']
   * @returns {Promise<string>} Transcribed text
   */
  static async transcribeImage(imageSource, language = 'hin') {
    if (!this.hasApiKey()) {
      throw new Error('Gemini API key is not configured. Please open Gemini Settings to add your key.');
    }

    let base64Data = '';
    let mimeType = 'image/jpeg';

    if (typeof HTMLCanvasElement !== 'undefined' && imageSource instanceof HTMLCanvasElement) {
      const dataUrl = imageSource.toDataURL('image/jpeg', 0.92);
      base64Data = dataUrl.split(',')[1];
    } else if (imageSource instanceof Blob) {
      base64Data = await this._blobToBase64(imageSource);
      mimeType = imageSource.type || 'image/jpeg';
    } else if (typeof imageSource === 'string') {
      if (imageSource.startsWith('data:')) {
        const parts = imageSource.split(',');
        mimeType = parts[0].split(';')[0].replace('data:', '');
        base64Data = parts[1];
      } else {
        base64Data = imageSource;
      }
    }

    const key = this.getApiKey();
    const model = this.getModel();
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

    const prompt = `You are a high-precision OCR and document transcription system specialized in Indian languages (${language}) and English code-mixed documents.
Accurately transcribe all text visible in this scanned document page.
Rules:
1. Preserve exact line breaks, paragraph structure, headings, lists, and indentation.
2. Accurately transcribe Devanagari conjuncts, matras, halants, and punctuation (। ॥).
3. Preserve code-mixed English words and numbers exactly as printed.
4. Output ONLY the transcribed text. Do not include markdown meta-commentary, notes, or introductions.`;

    const payload = {
      contents: [{
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data
            }
          }
        ]
      }],
      generationConfig: {
        temperature: 0.1
      }
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error?.message || `Gemini API error: HTTP ${response.status}`);
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return text.trim();
  }

  /**
   * Summarize document content
   * @param {string} fullText Document text
   * @param {string} [language='hin'] Target response language ('hin' or 'eng')
   * @returns {Promise<string>} Formatted summary
   */
  static async summarizeDocument(fullText, language = 'hin') {
    if (!this.hasApiKey()) {
      throw new Error('Gemini API key is not configured.');
    }

    const key = this.getApiKey();
    const model = this.getModel();
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

    const prompt = `You are an executive legal and administrative document summarizer.
Analyze the following digitized Indian document and provide:
1. **Title / Subject**: Core topic or nature of the document
2. **Key Summary**: A clear, 3-5 bullet point executive summary of critical points, orders, dates, and entities
3. **Key Entities & Dates**: Major parties, authorities, reference numbers, or dates mentioned
4. **Action Items / Conclusions**: Any explicit orders or deadlines

Please formulate the summary in ${language === 'eng' ? 'English' : 'Hindi (Devanagari script)'}.

Document content:
"""
${fullText.slice(0, 30000)}
"""`;

    const payload = {
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.2
      }
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error?.message || `Gemini API error: HTTP ${response.status}`);
    }

    return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  /**
   * Interactive Q&A grounded in the document text
   * @param {string} fullText Document text
   * @param {string} question User question
   * @returns {Promise<string>} Answer
   */
  static async askQuestion(fullText, question) {
    if (!this.hasApiKey()) {
      throw new Error('Gemini API key is not configured.');
    }

    const key = this.getApiKey();
    const model = this.getModel();
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

    const prompt = `You are a helpful assistant answering questions about the following digitized document.
Answer the user's question accurately based strictly on the provided document context. If the answer cannot be found in the document, state that clearly.

Document Context:
"""
${fullText.slice(0, 30000)}
"""

User Question: "${question}"

Provide a concise, direct answer in the language in which the question was asked (Hindi or English).`;

    const payload = {
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.2
      }
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error?.message || `Gemini API error: HTTP ${response.status}`);
    }

    return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  static _blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}
