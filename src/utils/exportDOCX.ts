import { buildZipArchive, triggerDownload } from './exportXLSX';

export interface DocxTableData {
  headers: string[];
  rows: string[][];
}

function escapeXml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function paragraph(text: string, options?: { bold?: boolean; size?: number; align?: 'left' | 'center' | 'right' }): string {
  const sz = (options?.size || 11) * 2;
  const jc = options?.align ? `<w:jc w:val="${options.align}"/>` : '';
  const b = options?.bold ? '<w:b/>' : '';
  return `<w:p><w:pPr>${jc}</w:pPr><w:r><w:rPr>${b}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

export function exportDOCX(params: {
  filename: string;
  title: string;
  subtitle?: string;
  className: string;
  table: DocxTableData;
  footerLeftTitle?: string;
  footerLeftName?: string;
  footerRightTitle?: string;
  footerRightName?: string;
}): void {
  const headerRows = `
    <w:tr>
      ${params.table.headers
        .map(
          (h) => `
        <w:tc>
          <w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="0F172A"/></w:tcPr>
          <w:p><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="20"/></w:rPr><w:t>${escapeXml(h)}</w:t></w:r></w:p>
        </w:tc>`
        )
        .join('')}
    </w:tr>`;

  const bodyRows = params.table.rows
    .map(
      (row) => `
    <w:tr>
      ${row
        .map(
          (cell) => `
        <w:tc>
          <w:p><w:r><w:rPr><w:sz w:val="19"/></w:rPr><w:t xml:space="preserve">${escapeXml(cell)}</w:t></w:r></w:p>
        </w:tc>`
        )
        .join('')}
    </w:tr>`
    )
    .join('');

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraph('PEMERINTAH KOTA SAMARINDA — DINAS PENDIDIKAN DAN KEBUDAYAAN', { bold: true, size: 11, align: 'center' })}
    ${paragraph('SMP NEGERI 10 SAMARINDA · MAPEL SENI BUDAYA (TEATER)', { bold: true, size: 13, align: 'center' })}
    ${paragraph(`Tahun Ajaran 2025/2026 · ${params.className}`, { size: 10, align: 'center' })}
    ${paragraph('', { size: 8 })}
    ${paragraph(params.title.toUpperCase(), { bold: true, size: 14, align: 'center' })}
    ${params.subtitle ? paragraph(params.subtitle, { size: 10, align: 'center' }) : ''}
    ${paragraph('', { size: 10 })}
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="9500" w:type="dxa"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
          <w:left w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
          <w:bottom w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
          <w:right w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
          <w:insideH w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>
          <w:insideV w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>
        </w:tblBorders>
      </w:tblPr>
      ${headerRows}
      ${bodyRows}
    </w:tbl>
    ${paragraph('', { size: 12 })}
    ${paragraph(`Samarinda, ${new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}`, { size: 10, align: 'right' })}
    ${paragraph(`${params.footerLeftTitle || 'Bendahara Produksi'}                              ${params.footerRightTitle || 'Pimpinan Produksi / Guru Pengampu'}`, { size: 10 })}
    ${paragraph('', { size: 18 })}
    ${paragraph(`${params.footerLeftName || '________________________'}                    ${params.footerRightName || '________________________'}`, { bold: true, size: 10 })}
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080"/></w:sectPr>
  </w:body>
</w:document>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const rawBlob = buildZipArchive([
    { path: '[Content_Types].xml', content: contentTypesXml },
    { path: '_rels/.rels', content: rootRelsXml },
    { path: 'word/document.xml', content: documentXml },
  ]);
  const docxBlob = new Blob([rawBlob], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  triggerDownload(docxBlob, params.filename.endsWith('.docx') ? params.filename : `${params.filename}.docx`);
}
