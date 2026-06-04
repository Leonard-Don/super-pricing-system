/**
 * 数据导出工具
 * 支持 CSV、Excel、JSON 格式导出
 */

export interface ColumnDef {
  key: string;
  title: string;
}

/**
 * 将数据导出为 CSV 格式
 */
export const exportToCSV = (
  data: Record<string, unknown>[],
  filename: string,
  columns: ColumnDef[] | null = null,
): void => {
  if (!data || data.length === 0) {
    console.warn('No data to export');
    return;
  }

  const cols: ColumnDef[] =
    columns ?? Object.keys(data[0]).map((key) => ({ key, title: key }));

  const headers = cols.map((col) => `"${col.title}"`).join(',');
  const rows = data
    .map((item) =>
      cols
        .map((col) => {
          let value: unknown = item[col.key];
          if (value === null || value === undefined) {
            value = '';
          } else if (typeof value === 'object') {
            value = JSON.stringify(value);
          }
          const strValue = String(value).replace(/"/g, '""');
          return `"${strValue}"`;
        })
        .join(','),
    )
    .join('\n');

  const csvContent = '﻿' + headers + '\n' + rows;
  downloadFile(csvContent, `${filename}.csv`, 'text/csv;charset=utf-8');
};

/**
 * 将数据导出为 JSON 格式
 */
export const exportToJSON = (data: unknown, filename: string): void => {
  const jsonContent = JSON.stringify(data, null, 2);
  downloadFile(jsonContent, `${filename}.json`, 'application/json');
};

/**
 * 将数据导出为 Excel 格式 (使用简单的 HTML 表格方式)
 */
export const exportToExcel = (
  data: Record<string, unknown>[],
  filename: string,
  columns: ColumnDef[] | null = null,
  sheetName = 'Sheet1',
): void => {
  if (!data || data.length === 0) {
    console.warn('No data to export');
    return;
  }

  const cols: ColumnDef[] =
    columns ?? Object.keys(data[0]).map((key) => ({ key, title: key }));

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
    <head>
      <meta charset="UTF-8">
      <!--[if gte mso 9]>
      <xml>
        <x:ExcelWorkbook>
          <x:ExcelWorksheets>
            <x:ExcelWorksheet>
              <x:Name>${sheetName}</x:Name>
              <x:WorksheetOptions><x:Panes></x:Panes></x:WorksheetOptions>
            </x:ExcelWorksheet>
          </x:ExcelWorksheets>
        </x:ExcelWorkbook>
      </xml>
      <![endif]-->
      <style>
        table { border-collapse: collapse; }
        th, td { border: 1px solid #000; padding: 8px; }
        th { background-color: #4472c4; color: white; font-weight: bold; }
        tr:nth-child(even) { background-color: #f2f2f2; }
      </style>
    </head>
    <body>
      <table>
        <thead>
          <tr>
            ${cols.map((col) => `<th>${escapeHtmlExcel(col.title)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${data
            .map(
              (item) => `
            <tr>
              ${cols
                .map((col) => {
                  let value: unknown = item[col.key];
                  if (value === null || value === undefined) value = '';
                  if (typeof value === 'object') value = JSON.stringify(value);
                  return `<td>${escapeHtmlExcel(String(value))}</td>`;
                })
                .join('')}
            </tr>
          `,
            )
            .join('')}
        </tbody>
      </table>
    </body>
    </html>
  `;

  downloadFile(html, `${filename}.xls`, 'application/vnd.ms-excel');
};

/**
 * 下载文件
 */
const downloadFile = (content: string, filename: string, mimeType: string): void => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * 转义 HTML 特殊字符 (Excel variant uses DOM)
 */
const escapeHtmlExcel = (text: string): string => {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

const exportUtils = {
  exportToCSV,
  exportToJSON,
  exportToExcel,
};

export default exportUtils;
