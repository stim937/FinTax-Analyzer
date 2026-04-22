import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KOSPI_PATH = path.join(__dirname, '../api/market/data/kospi_code.mst');
const KOSDAQ_PATH = path.join(__dirname, '../api/market/data/kosdaq_code.mst');
const OUTPUT_PATH = path.join(__dirname, '../api/market/data/stocks.json');

const decoder = new TextDecoder('euc-kr');

function parseMst(filePath, recordLen) {
  if (!fs.existsSync(filePath)) {
    console.log(`[Skip] File not found: ${filePath}`);
    return [];
  }

  const buffer = fs.readFileSync(filePath);
  const stocks = [];
  
  const CODE_START = 0;
  const CODE_LEN   = 6;
  const NAME_START = 21; 
  const NAME_LEN   = 40;

  for (let i = 0; i < buffer.length; i += recordLen) {
    const record = buffer.slice(i, i + recordLen);
    if (record.length < recordLen) break;

    const ticker = record.slice(CODE_START, CODE_START + CODE_LEN).toString('ascii').trim();
    
    // 종목코드 첫 자리가 숫자인 것만 상장 종목으로 처리
    if (!/^\d{6}$/.test(ticker)) continue;

    const nameBuffer = record.slice(NAME_START, NAME_START + NAME_LEN);
    let name = decoder.decode(nameBuffer).replace(/\0/g, '').trim();
    name = name.split('  ')[0].trim();

    if (ticker && name) {
      stocks.push({ ticker, name });
    }
  }
  return stocks;
}

console.log('MST 파일 변환 중 (KOSPI=289, KOSDAQ=283)...');
const kospi = parseMst(KOSPI_PATH, 289);
const kosdaq = parseMst(KOSDAQ_PATH, 283);

const allStocks = [...kospi, ...kosdaq];

// 중복 제거
const uniqueStocks = [];
const seen = new Set();
for (const s of allStocks) {
  if (!seen.has(s.ticker)) {
    seen.add(s.ticker);
    uniqueStocks.push(s);
  }
}

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(uniqueStocks, null, 2));
console.log(`변환 완료: 총 ${uniqueStocks.length}개 종목 저장됨 -> ${OUTPUT_PATH}`);

// 확인 테스트
const kospiTest = uniqueStocks.find(s => s.name === '삼성전자');
const kosdaqTest = uniqueStocks.find(s => s.name === '에코프로비엠');
console.log('--- 데이터 확인 ---');
console.log('KOSPI (삼성전자):', kospiTest || '찾을 수 없음');
console.log('KOSDAQ (에코프로비엠):', kosdaqTest || '찾을 수 없음');
