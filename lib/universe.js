/**
 * lib/universe.js
 * Shared IDX stock universe reference data — extracted from
 * lib/idx-data-engine.js during the provider-adapter refactor (roadmap
 * "provider adapter refactor": separate Yahoo/IDX/Invezgo providers from
 * each other and from shared reference data). loadBaseUniverse() is used
 * by BOTH lib/providers/yahoo-client.js and lib/idx-data-engine.js's
 * engine functions, so it lives here rather than inside either provider
 * to avoid a circular import between them. No behavior change from the
 * original — same file read, same VM sandbox eval, same output shape.
 */

import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let _universeCache = null;

// Extract base stock universe
function loadBaseUniverse() {
  if (_universeCache) return _universeCache;

  try {
    const data01Path = path.join(__dirname, '..', 'public', 'js', '01-data.js');
    if (fs.existsSync(data01Path)) {
      const content = fs.readFileSync(data01Path, 'utf8');
      const sandbox = { window: {}, document: { getElementById: () => null } };
      sandbox.window = sandbox;
      const ctx = vm.createContext(sandbox);
      vm.runInContext(content, ctx);

      const db = ctx.DB || {};
      const rawList = ctx._IDX_RAW_LIST || {};
      const combined = {};

      // Seed LQ45 list
      const lq45List = new Set([
        'ACES','ADRO','AMMN','AMRT','ANTM','ARTO','ASII','BBCA','BBNI','BBRI','BBTN','BDMN',
        'BMRI','BRIS','BRPT','BUKA','CPIN','EMTK','ESSA','EXCL','GGRM','GOTO','HRUM','ICBP',
        'INCO','INDF','INKP','INTP','ITMG','JSMR','KLBF','MAPI','MBMA','MDKA','MEDC','MIKA',
        'MYOR','PGAS','PGEO','PTBA','PTRO','SMGR','SRTG','TLKM','TOWR','TPIA','UNTR','UNVR'
      ]);

      const idx30List = new Set([
        'ACES','ADRO','AMMN','AMRT','ANTM','ASII','BBCA','BBNI','BBRI','BMRI','BRIS','BRPT',
        'CPIN','EXCL','GOTO','ICBP','INCO','INDF','INKP','KLBF','MDKA','MEDC','PGAS','PTBA',
        'SMGR','TLKM','TOWR','TPIA','UNTR','UNVR'
      ]);

      const idx80List = new Set([
        ...Array.from(lq45List),
        'ACES','ADMR','AUTO','AVIA','BFIN','BJBR','BJTM','BSDE','BTPS','CLEO','CMRY','CTRA',
        'DNET','ELSA','ERAA','HEAL','ISAT','JPFA','MAPA','MARK','MTEL','NISP','PANI','PBSA',
        'PNBN','PNLF','PRDA','PWON','RAJA','RALS','SCMA','SILO','SMRA','SSMS','TBIG','TKIM',
        'ULTJ','WIFI','WOOD','WTON'
      ]);

      const kompas100List = new Set([
        ...Array.from(idx80List),
        'AALI','ABMM','AGRO','AGII','BACA','BBHI','BBYB','BDKR','BIRD','BISI','BKSL','BMTR',
        'CITA','CUAN','DEWA','DOID','DRMA','ENRG','GJTL','HATM','IMAS','INDY','KIJA','KPIG',
        'MBAP','MCOL','MIDI','MNCN','MSIN','MYOH','NCKL','NRCA','PTPP','PSAB','RIMO','SAME',
        'SIDO','SMSM','TAPG','TINS','TOTL','TRIM','WIKA','WSKT'
      ]);

      const sriKehatiList = new Set([
        'ASII','BBCA','BBNI','BBRI','BMRI','INDF','ICBP','JSMR','KLBF','PGAS','PTBA','SMGR',
        'TLKM','UNTR','UNVR','SIDO','MYOR','CPIN','ACES','AUTO','BSDE','CTRA','EXCL','MAPI','MIKA'
      ]);

      // Combine from DB and rawList
      const allKeys = Array.from(new Set([...Object.keys(db), ...Object.keys(rawList)]));

      allKeys.forEach(code => {
        const d = db[code] || {};
        const r = rawList[code] || {};
        const name = d.name || r.name || (code + ' Tbk.');
        const sector = d.sector && d.sector !== 'Lainnya' ? d.sector : (r.sector || 'Lainnya');
        const isLq45 = lq45List.has(code);
        const isIdx30 = idx30List.has(code);
        const isIdx80 = idx80List.has(code);
        const isKompas100 = kompas100List.has(code);
        const isSriKehati = sriKehatiList.has(code);

        let board = 'Utama';
        if (['GOTO','BUKA','BELI'].includes(code)) board = 'Ekonomi Baru';
        else if (['FREN','BUMI','DEWA','KAEF'].includes(code)) board = 'Pengembangan';
        else if (code.length > 4) board = 'Akselerasi';

        // Verified listed shares. INV-010 (audit): a static "5 billion
        // shares" placeholder used to apply to every ticker without a
        // hardcoded entry below, silently fabricating market cap for ~900+
        // emiten. Unverified shares are now null — consumers must treat a
        // null share count as UNAVAILABLE for market cap, never guess.
        let shares = null;
        if (code === 'BBCA') shares = 123275050000;
        else if (code === 'BBRI') shares = 151559000000;
        else if (code === 'BMRI') shares = 93333333333;
        else if (code === 'BBNI') shares = 37294752960;
        else if (code === 'TLKM') shares = 99062216600;
        else if (code === 'ASII') shares = 40483553140;
        else if (code === 'GOTO') shares = 1201409662836;
        else if (code === 'AMMN') shares = 72511450000;
        else if (code === 'BREN') shares = 133790500000;

        combined[code] = {
          code: code,
          name: name,
          sector: sector,
          board: board,
          shares: shares,
          beta: d.beta || 1.0,
          basePrice: d.base || 0,
          indexes: {
            lq45: isLq45,
            idx30: isIdx30,
            idx80: isIdx80,
            kompas100: isKompas100,
            sriKehati: isSriKehati
          }
        };
      });

      _universeCache = combined;
      return combined;
    }
  } catch (e) {
    console.warn('[IDX Engine] Error loading base universe from 01-data.js:', e.message);
  }

  _universeCache = {};
  return _universeCache;
}

export { loadBaseUniverse };
