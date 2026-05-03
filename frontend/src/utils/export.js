/**
 * 数据导出工具
 * 支持 CSV、Excel、JSON 格式导出
 */

/**
 * 将数据导出为 CSV 格式
 * @param {Array} data - 数据数组
 * @param {string} filename - 文件名
 * @param {Array} columns - 列配置 [{key, title}]
 */
export const exportToCSV = (data, filename, columns = null) => {
    if (!data || data.length === 0) {
        console.warn('No data to export');
        return;
    }

    // 如果没有指定列，使用数据的所有键
    const cols = columns || Object.keys(data[0]).map(key => ({ key, title: key }));

    // 构建 CSV 内容
    const headers = cols.map(col => `"${col.title}"`).join(',');
    const rows = data.map(item =>
        cols.map(col => {
            let value = item[col.key];
            // 处理特殊字符
            if (value === null || value === undefined) {
                value = '';
            } else if (typeof value === 'object') {
                value = JSON.stringify(value);
            }
            // 转义引号
            value = String(value).replace(/"/g, '""');
            return `"${value}"`;
        }).join(',')
    ).join('\n');

    const csvContent = '\uFEFF' + headers + '\n' + rows; // 添加 BOM 支持中文
    downloadFile(csvContent, `${filename}.csv`, 'text/csv;charset=utf-8');
};

/**
 * 将数据导出为 JSON 格式
 * @param {any} data - 数据
 * @param {string} filename - 文件名
 */
export const exportToJSON = (data, filename) => {
    const jsonContent = JSON.stringify(data, null, 2);
    downloadFile(jsonContent, `${filename}.json`, 'application/json');
};

/**
 * 将数据导出为 Excel 格式 (使用简单的 HTML 表格方式)
 * @param {Array} data - 数据数组
 * @param {string} filename - 文件名
 * @param {Array} columns - 列配置
 * @param {string} sheetName - 工作表名称
 */
export const exportToExcel = (data, filename, columns = null, sheetName = 'Sheet1') => {
    if (!data || data.length === 0) {
        console.warn('No data to export');
        return;
    }

    const cols = columns || Object.keys(data[0]).map(key => ({ key, title: key }));

    // 构建 HTML 表格
    let html = `
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
            ${cols.map(col => `<th>${escapeHtml(col.title)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${data.map(item => `
            <tr>
              ${cols.map(col => {
        let value = item[col.key];
        if (value === null || value === undefined) value = '';
        if (typeof value === 'object') value = JSON.stringify(value);
        return `<td>${escapeHtml(String(value))}</td>`;
    }).join('')}
            </tr>
          `).join('')}
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
const downloadFile = (content, filename, mimeType) => {
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
 * 转义 HTML 特殊字符
 */
const escapeHtml = (text) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
};

const exportUtils = {
    exportToCSV,
    exportToJSON,
    exportToExcel
};

export default exportUtils;
