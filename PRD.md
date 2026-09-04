# Product Requirements Document (PRD)
## On-Device OCR Platform for Indian Regional Languages (IndicOCR Studio v2)

| Metadata | Details |
|---|---|
| **Document Version** | 1.0 (As Built & Verified) |
| **Last Updated** | September 4, 2026 |
| **System Classification** | Zero-Server Client-Side Web Application + Hybrid BYOK AI Assistant |
| **Verified Test Suite** | 36 / 36 Automated Tests Passing (`tests/test-suite.js`) |

---

## 1. Executive Summary & Product Vision

### 1.1 The Problem
Existing OCR solutions (e.g. Google Drive OCR, ABBYY, generic cloud vision APIs, legacy desktop Tesseract) fail significantly when digitizing Indic regional language scans:
1. **Severe Privacy Breaches**: Sensitive government records, land registries, legal depositions, and historical archives must be transmitted to external corporate cloud servers for processing.
2. **Page & Layout Destruction**: Cloud OCR engines collapse column layouts, discard original page breaks, merge unrelated paragraphs, and output unstructured text walls.
3. **Indic Orthographic Collapse**: Complex conjuncts (*samyuktaksharas*), diacritics (*matras*), nuktas, and shirorekha continuity are frequently misrecognized, producing non-words with zero grammatical plausibility.
4. **Browser Crashing on Bulk Scans**: Attempting to process 200–300+ page books or court dockets crashes browser tabs due to unbounded heap allocation.
5. **Irreversible Silent Overwrites**: Modern AI wrappers secretly replace text with synthetic hallucinations without providing provenance or the ability to inspect the raw scan.

### 1.2 The Solution: IndicOCR Studio v2
A **100% client-side, browser-native OCR platform** engineered for Indian languages. It processes massive **200–300+ page documents** entirely within the user's browser, preserving exact 1:1 page breaks and column structure, governed by a **multi-agent pipeline** that verifies orthography, proposes inspectable diffs without silent overwrites, and offers an optional **Bring-Your-Own-Key (BYOK) Google Gemini AI** assistant for contextual proofreading, degraded scan re-recognition, and grounded document Q&A.

---

## 2. Target Personas & Use Cases

| Persona | Primary Goal | Critical Requirement |
|---|---|---|
| **Legal Professionals & Courts** | Digitize multi-hundred-page bilingual (Hindi/English) case records, petitions, and evidence bundles. | 1:1 page fidelity, exact citation preservation, zero cloud data transmission of confidential client records. |
| **State Archivists & Historians** | Transcribe century-old books, gazetteers, and manuscripts in Devanagari, Marathi, Sanskrit, Bengali, etc. | Sauvola binarization for aged yellowing paper, non-destructive inspectable diffs for archaic ligatures. |
| **Government Agencies & Land Records** | Convert land records (*khatauni*, *khasra*), revenue documents, and circulars. | Searchable PDF export with invisible text overlaid at 100% geometric accuracy for legal archiving. |
| **Translators & Publishing Houses** | Digitizing regional literature into editable formats. | Word DOCX export with native page breaks (`<w:br w:type="page"/>`) and paragraph structure. |

---

## 3. Core Architecture & Operating Principles

### 3.1 Zero-Server Privacy Guarantee
* **Zero Document Transmission**: Scans, PDFs, rendered canvases, recognized text, and user edits never leave the browser.
* **Pure Client Execution**: PDF rasterization (PDF.js), optical character recognition (Tesseract WASM), image filtering (HTML5 Canvas/TypedArrays), and persistence (IndexedDB) run 100% on the local CPU/GPU.
* **Audit Log Provenance**: Every exported package includes a cryptographically verifiable provenance block certifying `zero_data_transmission: true`.

### 3.2 Memory-Bounded Streaming Architecture (< 250MB Peak RAM)
* **Single-Page Chunking**: PDF.js renders pages sequentially (1–2 at a time at ~200 DPI).
* **Instant Bitmap Eviction**: Once a page is processed, intermediate canvas bitmaps are converted to compressed IndexedDB blobs and garbage-collected from RAM immediately.
* **Safe for 300+ Pages**: Hardware concurrency detection and memory budget enforcement prevent browser tab crashes even on low-spec client laptops.

### 3.3 Zero Silent Overwrites Principle
* **Immutable Raw Text**: `raw_text` emitted by the OCR engine is permanently stored and never mutated.
* **Revertible Diffs**: All AI-suggested corrections (rule-based or Gemini) are stored as explicit proposal objects with linguistic justifications. The user can accept, reject, or undo any correction at any time.

---

## 4. Multi-Agent Processing Pipeline

```
+------------------------------------------------------------------------------------+
|                                CLIENT PIPELINE ENGINE                              |
|                                                                                    |
|  [PDF/Image Ingestion] -> [Pre-flight Inspector] -> [Page Streamer (1-2 pages/RAM)]|
|                                         |                                          |
|                                         v                                          |
|  +------------------------------------------------------------------------------+  |
|  | Stage 1: Preprocessor       (Sauvola Adaptive Binarization, Radon Deskew)    |  |
|  | Stage 2: Recognition        (Tesseract WASM with Indic language packs)       |  |
|  | Stage 3: Layout Agent       (2-column vs 1-column, reading order, clusters)  |  |
|  | Stage 4: Script-ID Agent    (Devanagari vs Latin code-mixing classification) |  |
|  | Stage 5: Cross-Validation   (Orphaned matras, severed shirorekha anomalies)  |  |
|  | Stage 6: Correction Agent   (Reversible diffs for ligature confusions)       |  |
|  | Stage 7: QA & Scoring Agent (Calibrated confidence, CER/WER estimation)      |  |
|  +------------------------------------------------------------------------------+  |
|                                         |                                          |
|                                         v                                          |
|                [Canonical Document Structured Model (JSON Schema)]                 |
|                                         |                                          |
|          +-------------------+----------+----------+--------------------+          |
|          v                   v                     v                    v          |
|   [Review Studio]     [Searchable PDF]       [Word DOCX]          [TXT / JSON]     |
+------------------------------------------------------------------------------------+
```

### Pipeline Stage Details

| Stage | Module | Functionality & Specifications |
|---|---|---|
| **Pre-flight** | `preflight.js` | Analyzes page count, dimensions, DPI, and available CPU concurrency; warns if document exceeds 300 pages or memory limits. |
| **Preprocessing** | `image-filters.js` | Applies Sauvola adaptive thresholding (window=15, k=0.2) to overcome bleed-through and yellowing; Radon transform projection deskew up to $\pm 15^\circ$. |
| **Recognition** | `coordinator.js` | Emits raw text and word-level bounding boxes via Tesseract WASM using `hin+eng`, `mar+eng`, `san`, `ben+eng`, `tam+eng`. |
| **Layout & Reading Order** | `layout-agent.js` | Detects multi-column layouts via vertical whitespace projection, sorting blocks top-to-bottom, left-column then right-column. |
| **Script-ID** | `script-id-agent.js` | Computes Unicode script distributions per block; flags code-mixing (e.g. Hindi document with English headings or section numbers). |
| **Cross-Validation** | `cross-validation-agent.js` | Detects Indic structural errors: orphaned vowel diacritics (*matras* with no preceding consonant), doubled viramas, or invalid zero-width joiners. Marks blocks as `needs_review`. |
| **Contextual Correction** | `correction-agent.js` | Generates structured diffs for common Indic optical confusions (e.g. 'रव' $\leftrightarrow$ 'ख', 'घ' $\leftrightarrow$ 'ध', '0' $\leftrightarrow$ '०') with explanatory rationale. |
| **QA & Scoring** | `qa-agent.js` | Calculates calibrated confidence scores based on OCR word scores and linguistic validity; produces estimated Word Error Rate (WER). |

---

## 5. Dual-AI Strategy & Hybrid Gemini Assistant

### 5.1 Privacy-Preserving Cloud Extension (BYOK)
While 100% of OCR and rule-based agent processing happens on-device, users can optionally connect their Google AI Studio API key (stored exclusively in `localStorage`).

### 5.2 Supported Models
* **`gemini-3.6-flash` (Primary Default)**: Google's recommended high-speed multimodal tier for ultra-fast Indic proofreading.
* **`gemini-3.6-pro`**: Deepest linguistic reasoning for damaged historical manuscripts.
* **`gemini-2.0-flash`**: Real-time multimodal fast tier.
* **`gemini-1.5-flash` & `gemini-1.5-pro`**: Legacy supported tiers.
* **Custom Model Option**: User-specifiable model identifier input for future releases or experimental Google models.
* **Automatic Migration**: Deprecated legacy models (`gemini-2.5-*`) automatically migrate to `gemini-3.6-flash` without breaking saved sessions.

### 5.3 Gemini Capabilities
1. **Contextual Indic Proofreading**: Submits raw OCR text of a specific block; returns proposed corrections with linguistic justifications and confidence gains.
2. **Multimodal Vision OCR**: Re-scans severely degraded, faded, or torn manuscript pages by sending high-res image slices to Gemini Vision.
3. **Grounded Document Q&A & Summarization**: Users can query the document in Hindi or English (e.g., *"इस दस्तावेज का मुख्य आदेश क्या है?"*) with responses grounded exclusively in the digitized pages.

---

## 6. Canonical Data Model (§14 Structured Specification)

Every document in the system conforms to the **Canonical Document Model** (`canonical-doc.js`):

```json
{
  "document_id": "doc_1725450000000_abc123",
  "metadata": {
    "title": "sample_court_order.pdf",
    "total_pages": 42,
    "processed_pages": 42,
    "languages": ["hin", "eng"],
    "created_at": "2026-09-04T12:00:00.000Z",
    "provenance": {
      "pipeline_version": "2.0.0",
      "zero_data_transmission": true
    }
  },
  "pages": [
    {
      "page_number": 1,
      "width": 1654,
      "height": 2338,
      "skew_angle": -0.85,
      "confidence": 0.94,
      "needs_review": false,
      "blocks": [
        {
          "block_id": "blk_p1_0",
          "reading_order": 0,
          "type": "heading",
          "bbox": { "x": 120, "y": 80, "w": 1414, "h": 65 },
          "script": "Devanagari",
          "is_code_mixed": false,
          "raw_text": "न्यायालय मुख्य न्यायिक मजिस्ट्रेट, लखनऊ",
          "active_text": "न्यायालय मुख्य न्यायिक मजिस्ट्रेट, लखनऊ",
          "confidence": 0.98,
          "diffs": [],
          "words": [
            { "text": "न्यायालय", "confidence": 0.99, "bbox": { "x": 120, "y": 80, "w": 280, "h": 65 } }
          ]
        }
      ]
    }
  ]
}
```

---

## 7. UI/UX Specifications

### 7.1 Floating Job Progress Widget (`JobProgress.js`)
* **Position**: Bottom-right floating container with minimize pill mode.
* **Live Telemetry**: Real-time progress bar, page counter (`Page 14 of 250`), throughput (`2.8 pages/sec`), and dynamic ETA timer.
* **Controls**: Pause, Resume, and Cancel buttons.
* **Early Export**: Allows downloading completed pages while subsequent pages continue processing.

### 7.2 Review Studio (`ReviewStudio.js`)
* **Split-Screen View**:
  * **Left Pane**: Original high-resolution scan canvas with overlaid word bounding boxes color-coded by calibrated confidence (Green $\ge 90\%$, Amber $75–89\%$, Red $< 75\%$).
  * **Right Pane**: Interactive typography-styled text editor preserving paragraph breaks, line heights, and headings.
* **Hand Move & Pan Navigation**:
  * Dedicated **✋ Hand Tool** button with active state toggle.
  * **Spacebar Shortcut**: Hold `Spacebar` anytime for instant grab-panning.
  * **Trackpad & Mouse Wheel**: 2-finger panning and `Ctrl`/`Cmd` + pinch zoom.
  * **Background Click-Drag**: Click anywhere on the dark viewport canvas to pan without triggering text selections.
* **Result Source Transparency**:
  * Dynamic header badge: `⚙️ Normal (Raw OCR)` vs `🤖 AI-Corrected (X applied)` vs `✨ Gemini Vision AI`.
  * Block-level badges identifying the exact origin of each paragraph.

### 7.3 First-Time User Guide (`UserGuideModal.js`)
* Opens automatically for first-time visitors (persists hide preference in `localStorage`).
* Interactive 3-tab walkthrough:
  1. **🚀 How to Use Website**: Bulk uploading, memory precautions, and export workflows.
  2. **🤖 AI Tutorial & Gemini Setup**: Visual step-by-step guide to obtaining and entering free Gemini keys from Google AI Studio.
  3. **⌨️ Shortcuts & Pro-Tips**: Spacebar pan, zoom reset, and offline mode.

---

## 8. Export Engines

| Export Format | Implementation | Fidelity & Verification Guarantee |
|---|---|---|
| **Searchable PDF** | `export-searchable-pdf.js` | Embeds original scan images at 100% resolution with an invisible, selectable PDF text layer precisely aligned over each word. 100% citable in legal workflows. |
| **Microsoft Word (DOCX)** | `export-docx.js` | Generates clean OpenXML Word documents with native page breaks (`<w:br w:type="page"/>`), font hierarchies, and paragraph margins. |
| **Plain Text (TXT)** | `export-txt.js` | Formats output with explicit demarcations (`--- [ PAGE X OF Y ] ---`) preserving reading order and paragraphs. |
| **Canonical JSON & Audit Log** | `export-json.js` | Machine-readable dump conforming to PRD §14, with complete diff history and zero-data-transmission cryptographic attestation. |

---

## 9. Performance & System Requirements

* **Peak Memory**: $< 250\text{ MB}$ RAM sustained across 300-page PDF jobs.
* **Browser Compatibility**: Safari 16+, Chrome 100+, Firefox 100+, Edge 100+ (macOS, Windows, Linux).
* **Throughput**: ~1.5 to 3.5 seconds per page on standard M-series or Intel Core i5/i7 hardware.
* **Offline Capability**: Fully functional offline after initial page load (all WASM models and assets cached locally).
