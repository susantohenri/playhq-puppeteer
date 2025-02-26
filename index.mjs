import path from 'path';
import xlsxPopulate from 'xlsx-populate';

export const handler = async (event) => {
  const response = {
    statusCode: 200,
    body: JSON.stringify(await readPlayerNames()),
  };
  return response;
};

async function readPlayerNames() {
  const currentDir = path.dirname(new URL(import.meta.url).pathname);
  const filePath = path.join(currentDir, 'template.xlsx');
  const workbook = await xlsxPopulate.fromFileAsync(filePath);
  const sheet = workbook.sheet(`Template`);
  let row = 2;
  const names = [];
  while (true) {
      const name = sheet.cell(`B${row}`).value();
      row++;
      if (undefined === name) break;
      else names.push(name.replace(String.fromCharCode(160), String.fromCharCode(32)))
  }
  return names;
}