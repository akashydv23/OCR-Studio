/**
 * Microsoft Word (.docx) Exporter
 * Conforms to PRD FR-7 (Export: DOCX with native Word page breaks and paragraph styles)
 * 
 * Generates an authentic OpenXML (.docx) package directly in the browser using JSZip,
 * embedding native page breaks (<w:br w:type="page"/>) to guarantee 1:1 page parity.
 */

export class DocxExporter {
  /**
   * Generate a .docx Blob from a CanonicalDocument
   * @param {CanonicalDocument} document
   * @returns {Promise<Blob>}
   */
  static async export(document) {
    if (typeof window.JSZip === 'undefined') {
      throw new Error('JSZip library not loaded in window.JSZip');
    }

    const zip = new window.JSZip();

    // 1. [Content_Types].xml
    zip.file('[Content_Types].xml', this._getContentTypesXml());

    // 2. _rels/.rels
    zip.file('_rels/.rels', this._getRootRelsXml());

    // 3. word/_rels/document.xml.rels
    zip.file('word/_rels/document.xml.rels', this._getDocumentRelsXml());

    // 4. word/styles.xml
    zip.file('word/styles.xml', this._getStylesXml());

    // 5. word/document.xml (Content with native page breaks & paragraph styling)
    const documentXml = this._getDocumentXml(document);
    zip.file('word/document.xml', documentXml);

    const blob = await zip.generateAsync({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    });

    return blob;
  }

  /**
   * Download as .docx in browser
   * @param {CanonicalDocument} document
   * @param {string} [filename]
   */
  static async download(document, filename = null) {
    const blob = await this.export(document);
    const name = filename || `${document.title || 'document'}_digitized.docx`;

    const link = window.document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  }

  static _escapeXml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  static _getDocumentXml(document) {
    const pages = document.pages || [];
    const paragraphsXml = [];

    // Title / Cover paragraph
    paragraphsXml.push(`
      <w:p>
        <w:pPr>
          <w:pStyle w:val="Title"/>
          <w:jc w:val="center"/>
        </w:pPr>
        <w:r>
          <w:rPr>
            <w:b/>
            <w:sz w:val="48"/>
          </w:rPr>
          <w:t>${this._escapeXml(document.title || 'Digitized Document')}</w:t>
        </w:r>
      </w:p>
    `);

    for (let p = 0; p < pages.length; p++) {
      const page = pages[p];
      const pageNum = page.page_number || (p + 1);

      // Native Word Page Break before every page (except right after title)
      paragraphsXml.push(`
        <w:p>
          <w:r>
            <w:br w:type="page"/>
          </w:r>
        </w:p>
      `);

      // Page Header subtitle
      paragraphsXml.push(`
        <w:p>
          <w:pPr>
            <w:pStyle w:val="Subtitle"/>
          </w:pPr>
          <w:r>
            <w:rPr>
              <w:color w:val="718096"/>
              <w:sz w:val="20"/>
            </w:rPr>
            <w:t>Page ${pageNum} of ${document.source_page_count || pages.length}</w:t>
          </w:r>
        </w:p>
      `);

      const blocks = page.blocks || [];
      for (const block of blocks) {
        const text = (block.text || '').trim();
        if (!text) continue;

        const isHeading = block.type === 'heading';
        const pStyle = isHeading ? 'Heading1' : 'Normal';
        const fontSize = isHeading ? '32' : '24'; // 16pt vs 12pt (half-points)
        const isBold = isHeading ? '<w:b/>' : '';

        // Handle multi-line paragraphs
        const lines = text.split('\n');
        const textRuns = lines.map((line, idx) => {
          const br = idx > 0 ? '<w:br/>' : '';
          return `${br}<w:t xml:space="preserve">${this._escapeXml(line)}</w:t>`;
        }).join('');

        paragraphsXml.push(`
          <w:p>
            <w:pPr>
              <w:pStyle w:val="${pStyle}"/>
              <w:spacing w:after="160" w:line="276" w:lineRule="auto"/>
            </w:pPr>
            <w:r>
              <w:rPr>
                <w:rFonts w:ascii="Noto Sans Devanagari" w:hAnsi="Noto Sans Devanagari" w:cs="Noto Sans Devanagari"/>
                ${isBold}
                <w:sz w:val="${fontSize}"/>
                <w:szCs w:val="${fontSize}"/>
              </w:rPr>
              ${textRuns}
            </w:r>
          </w:p>
        `);
      }
    }

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${paragraphsXml.join('\n')}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720"/>
    </w:sectPr>
  </w:body>
</w:document>`;
  }

  static _getContentTypesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;
  }

  static _getRootRelsXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
  }

  static _getDocumentRelsXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
  }

  static _getStylesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Noto Sans Devanagari" w:hAnsi="Noto Sans Devanagari" w:cs="Noto Sans Devanagari"/>
        <w:sz w:val="24"/>
        <w:szCs w:val="24"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr>
      <w:spacing w:before="240" w:after="120"/>
    </w:pPr>
    <w:rPr>
      <w:b/>
      <w:color w:val="1A365D"/>
      <w:sz w:val="32"/>
      <w:szCs w:val="32"/>
    </w:rPr>
  </w:style>
</w:styles>`;
  }
}
