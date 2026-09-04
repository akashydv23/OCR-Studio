/**
 * Automated Verification Test Suite for IndicOCR Platform
 * Validates PRD Functional Requirements FR-1 through FR-7
 */

import { CanonicalDocument, CanonicalPage, CanonicalBlock } from '../src/core/model/canonical-doc.js';
import { ScriptIdAgent } from '../src/core/agents/script-id-agent.js';
import { CrossValidationAgent } from '../src/core/agents/cross-validation-agent.js';
import { CorrectionAgent } from '../src/core/agents/correction-agent.js';
import { QaAgent } from '../src/core/agents/qa-agent.js';
import { TxtExporter } from '../src/core/export/export-txt.js';
import { JsonExporter } from '../src/core/export/export-json.js';
import { GeminiService } from '../src/core/services/gemini-service.js';
import { UserGuideModal } from '../src/ui/components/UserGuideModal.js';

// Polyfill localStorage for Node test runner
if (typeof localStorage === 'undefined') {
  const store = {};
  globalThis.localStorage = {
    getItem: (key) => store[key] || null,
    setItem: (key, val) => { store[key] = String(val); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); }
  };
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n--- 1. Testing Canonical Data Model (PRD §14) ---');
  const doc = new CanonicalDocument({
    title: 'संविधान मसौदा',
    sourcePageCount: 3,
    primaryLanguage: 'hin'
  });

  const p1 = new CanonicalPage({ pageNumber: 1, width: 1200, height: 1600, dpi: 200 });
  const b1 = new CanonicalBlock({
    blockId: 'p1_b1',
    type: 'heading',
    readingOrder: 1,
    script: 'Devanagari',
    text: 'भारत का संविधान',
    rawText: 'भारत का संविधान',
    confidence: 0.98,
    bbox: [100, 100, 800, 60]
  });
  const b2 = new CanonicalBlock({
    blockId: 'p1_b2',
    type: 'paragraph',
    readingOrder: 2,
    script: 'Devanagari',
    text: 'हम भारत के लोग, भारत को एक संपूर्ण प्रभुत्व-संपन्न लोकतंत्रात्मक गणराज्य बनाने के लिए...',
    rawText: 'हम भारत के लोग, भारत को एक संपूर्ण प्रभुत्व-संपन्न लोकतंत्रात्मक गणराज्य बनाने के लिए...',
    confidence: 0.92,
    bbox: [100, 200, 800, 300]
  });
  p1.addBlock(b1);
  p1.addBlock(b2);
  doc.setPage(p1);

  assert(doc.pages.length === 1, 'Page added successfully');
  assert(doc.source_page_count === 3, 'Source page count preserved for 1:1 mapping');

  // Serialization round-trip
  const json = doc.toJSON();
  assert(json.document_id === doc.document_id, 'Document ID serialized');
  assert(json.pages[0].blocks.length === 2, 'Blocks serialized');

  const restored = CanonicalDocument.fromJSON(json);
  assert(restored.pages[0].blocks[0].text === 'भारत का संविधान', 'Deserialization restored exact Unicode Indic text');

  console.log('\n--- 2. Testing Script-ID Agent (Code-Mixing Detection) ---');
  const pureHindi = ScriptIdAgent.identify('भारत सरकार का आधिकारिक पत्र');
  assert(pureHindi.primaryScript === 'Devanagari' && !pureHindi.isCodeMixed, 'Pure Devanagari recognized');

  const pureEnglish = ScriptIdAgent.identify('Official Gazette of India Publication');
  assert(pureEnglish.primaryScript === 'Latin' && !pureEnglish.isCodeMixed, 'Pure Latin recognized');

  const mixedLine = ScriptIdAgent.identify('Article 21 भारतीय संविधान का एक महत्वपूर्ण अंग है');
  assert(mixedLine.isCodeMixed && mixedLine.primaryScript === 'Devanagari' && mixedLine.secondaryScript === 'Latin', 
    'Code-mixed line detected with Devanagari primary and Latin secondary');

  console.log('\n--- 3. Testing Cross-Validation Agent (Indic Orthography Sanity) ---');
  // Word starting with dependent matra (illegal in Indic orthography)
  const invalidBlock = new CanonicalBlock({
    blockId: 'blk_test_cv',
    readingOrder: 1,
    text: 'िभारत क0ल',
    rawText: 'िभारत क0ल',
    lines: [
      {
        words: [
          { text: 'िभारत', bbox: [10, 10, 50, 20], confidence: 0.85 },
          { text: 'क0ल', bbox: [70, 10, 40, 20], confidence: 0.90 }
        ]
      }
    ]
  });

  const cvResult = CrossValidationAgent.validate([invalidBlock]);
  assert(cvResult.totalFlags >= 2, `Detected orthographic anomalies (found ${cvResult.totalFlags} flags)`);
  assert(invalidBlock.needs_review === true, 'Block automatically marked needs_review due to structural flags');

  console.log('\n--- 4. Testing Contextual Correction Agent (Diff Generation & Reversibility) ---');
  const testBlock = new CanonicalBlock({
    blockId: 'blk_test_corr',
    readingOrder: 1,
    text: 'रवबर ध्यान',
    rawText: 'रवबर ध्यान',
    lines: [
      {
        words: [
          { text: 'रवबर', bbox: [10, 10, 60, 20], confidence: 0.70 }
        ]
      }
    ]
  });

  const corrResult = CorrectionAgent.propose([testBlock]);
  assert(corrResult.proposedCount === 1, 'Proposed diff for ligature confusion (रवबर -> खबर)');
  assert(testBlock.raw_text === 'रवबर ध्यान', 'CRITICAL GUARD: raw_text was NOT silently overwritten');
  assert(testBlock.corrections[0].status === 'proposed', 'Diff status is proposed');

  // Accept diff
  testBlock.acceptCorrection(0);
  assert(testBlock.corrections[0].status === 'accepted', 'Diff marked as accepted');
  assert(testBlock.text === 'खबर ध्यान', 'Active text updated to reflect accepted suggestion');

  // Reject diff
  testBlock.rejectCorrection(0);
  testBlock.recomputeActiveText();
  assert(testBlock.text === 'रवबर ध्यान', 'Active text reverted upon rejection');

  console.log('\n--- 5. Testing QA & Calibrated Confidence Agent ---');
  const qaResult = QaAgent.evaluate([testBlock], 0.85);
  assert(typeof qaResult.summary.avgConfidence === 'number', 'Calculated calibrated confidence score');
  assert(typeof qaResult.summary.estimatedWer === 'number', 'Estimated WER heuristic produced');

  console.log('\n--- 6. Testing Exporters (TXT & JSON) ---');
  const txt = TxtExporter.export(doc, { includeMetadata: true });
  assert(txt.includes('--- [ PAGE 1 OF 3 ] ---'), 'TXT output includes explicit page markers');
  assert(txt.includes('भारत का संविधान'), 'TXT output preserves exact Devanagari text');

  const jsonExport = JsonExporter.export(doc);
  const parsed = JSON.parse(jsonExport);
  assert(parsed.document_id === doc.document_id, 'JSON export valid');

  const auditExport = JsonExporter.exportAuditLog(doc);
  const auditParsed = JSON.parse(auditExport);
  assert(auditParsed.provenance.zero_data_transmission === true, 'Audit log documents 100% on-device privacy guarantee');

  console.log('\n--- 7. Testing Gemini AI Service & Hybrid Diff Integration ---');
  // 7.1 Configuration & Storage
  GeminiService.clearCredentials();
  assert(GeminiService.hasApiKey() === false, 'Fresh start has no API key');
  assert(GeminiService.getModel() === 'gemini-3.6-flash', 'Default model is gemini-3.6-flash');

  GeminiService.setApiKey('MOCK_TEST_KEY_LOCAL_ONLY_12345');
  assert(GeminiService.hasApiKey() === true, 'API key saved');
  assert(GeminiService.getApiKey() === 'MOCK_TEST_KEY_LOCAL_ONLY_12345', 'Retrieved exact API key');

  GeminiService.setModel('gemini-2.0-flash');
  assert(GeminiService.getModel() === 'gemini-2.0-flash', 'Model preference updated');

  // Verify deprecated model migration
  localStorage.setItem('indic_ocr_gemini_model', 'gemini-2.5-flash');
  assert(GeminiService.getModel() === 'gemini-3.6-flash', 'Deprecated gemini-2.5-flash automatically migrates to gemini-3.6-flash');

  GeminiService.clearCredentials();
  assert(GeminiService.hasApiKey() === false, 'Credentials cleared securely');

  // 7.2 Ingesting Gemini diffs into CanonicalBlock
  const geminiBlock = new CanonicalBlock({
    blockId: 'blk_gemini_test',
    readingOrder: 1,
    text: 'भारत सर्कार का आदेश',
    rawText: 'भारत सर्कार का आदेश'
  });

  // Simulate Gemini proposed diff
  const mockGeminiDiff = {
    id: 'diff_gemini_test_1',
    original: 'सर्कार',
    suggested: 'सरकार',
    reason: 'Gemini AI: Devanagari ra-kar optical confusion resolved',
    confidenceGain: 0.30,
    status: 'proposed',
    source: 'gemini'
  };

  geminiBlock.corrections.push(mockGeminiDiff);
  assert(geminiBlock.corrections.length === 1, 'Gemini diff pushed to block');
  assert(geminiBlock.raw_text === 'भारत सर्कार का आदेश', 'Raw text remains unchanged');

  // Accept Gemini diff
  geminiBlock.acceptCorrection(0);
  assert(geminiBlock.text === 'भारत सरकार का आदेश', 'Active text updated on accepted Gemini diff');

  // Reject Gemini diff
  geminiBlock.rejectCorrection(0);
  assert(geminiBlock.text === 'भारत सर्कार का आदेश', 'Active text reverted on rejected Gemini diff');

  console.log('\n--- 8. Testing User Guide & First-Time Onboarding ---');
  assert(UserGuideModal.shouldShowOnStartup() === true, 'Default startup preference displays guide for new visitors');
  UserGuideModal.setHideOnStartup(true);
  assert(UserGuideModal.shouldShowOnStartup() === false, 'User preference to hide guide on startup is persisted');
  UserGuideModal.setHideOnStartup(false);
  assert(UserGuideModal.shouldShowOnStartup() === true, 'Resetting startup preference restores guide trigger');

  console.log(`\n========================================`);
  console.log(`Test Results: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================\n`);

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
