/** Exact/compact numbers, author credits and source-claim presentation. */
(function (root) {
  'use strict';

  function createFormatters(data) {
    const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    const esc = value => String(value).replace(/[&<>"']/g, char => entities[char]);
    const comma = value => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const exactVal = value => value == null ? '—' : comma(value);

    function notation(value) {
      if (value == null) return '—';
      const digits = String(value);
      if (digits.length <= 11) return comma(digits);
      return `${digits[0]}.${digits.slice(1,3)}… × 10^${digits.length-1}`;
    }

    function referenceIds(claim, side) {
      if (claim.source === 'L') return claim.record.refs || [];
      if (claim.source === 'B') return data.bound_references[claim.record.id]?.[side] || [];
      if (claim.source === 'G' && side === 'lower') {
        return claim.record.references || [data.metadata.grassl.reference_id];
      }
      if (claim.source === 'P' && claim[side] != null) {
        return claim.record[`${side}_references`] ?? claim.record.references ?? [];
      }
      return [];
    }

    function authorLabel(key) {
      const reference = data.citation_metadata[key];
      if (!reference?.authors?.length) return '';
      const names = reference.authors;
      const authors = names.length > 3 ? names[0] + ' et al.'
        : names.length === 3 ? `${names[0]}, ${names[1]} and ${names[2]}` : names.join(' and ');
      return authors + (reference.year ? ` (${reference.year})` : '');
    }

    function boundAttributions(claims, side) {
      const labels = [];
      for (const claim of claims) {
        if (claim.source === 'T') {
          labels.push(side === 'lower' && claim.lower !== claim.upper ? 'Two-word repetition code' : claim.rule);
        } else {
          for (const key of referenceIds(claim, side)) {
            const label = authorLabel(key);
            if (label) labels.push(label);
          }
        }
      }
      return [...new Set(labels)].join(' / ')
        || (claims.length ? 'Original paper not identified' : 'Not imported');
    }

    function powerForm(value, claims = [], side = 'lower') {
      if (value == null || value <= 0n) return null;
      for (const claim of claims) {
        if (claim.source === 'L' && side === 'lower' && claim.lower === value) {
          const N = BigInt(claim.record.N), k = claim.record.k - (claim.steps || 0);
          if (k >= 0 && N * (2n ** BigInt(k)) === value) return { N, k };
        }
        if (claim.source === 'B' && claim[side] === value) {
          const parts = claim.record.raw.split('-');
          const raw = side === 'upper' ? (parts[1] || parts[0]) : parts[0];
          const match = raw.match(/^2\^(\d+)$/);
          if (match && 2n ** BigInt(match[1]) === value) return { N: 1n, k: Number(match[1]) };
        }
      }
      let N = value, k = 0;
      while (N > 1n && N % 2n === 0n) { N /= 2n; k++; }
      return value >= 1024n && k >= 4 && String(N).length <= 12 ? { N, k } : null;
    }

    function boundNumber(value, claims = [], side = 'lower') {
      if (value == null) return '—';
      const power = powerForm(value, claims, side);
      if (power) {
        if (power.k === 0) return esc(exactVal(power.N));
        const coefficient = power.N === 1n ? '' : esc(exactVal(power.N)) + ' × ';
        return `${coefficient}2<sup>${power.k}</sup>`;
      }
      const digits = String(value);
      return digits.length <= 11 ? esc(exactVal(value))
        : `≈ ${digits[0]}.${digits.slice(1,3)}… × 10<sup>${digits.length-1}</sup>`;
    }

    function exactIntegers(entries) {
      const values = entries.filter(([, value]) => value != null)
        .map(([label, value]) => `<p>${esc(label)}: ${esc(exactVal(value))}</p>`).join('');
      return `<details class="exact-values"><summary>Exact integers</summary>${values}</details>`;
    }

    function numberDetails(lower, upper, lowerValue, upperValue, lowerLabel = 'Lower bound') {
      return lower !== esc(exactVal(lowerValue)) || upper !== esc(exactVal(upperValue))
        ? exactIntegers([[lowerLabel, lowerValue], ['Upper bound', upperValue]]) : '';
    }

    function approximationNote(text) {
      return text.includes('≈')
        ? '<div class="claim-note">Approximate display; use Exact integers for the full bounds.</div>' : '';
    }

    function johnsonCalculation(claim) {
      if (!claim.johnson) return '';
      const j = claim.johnson;
      const relation = claim.originD % 2 === 0
        ? `Use A(${claim.originN},${claim.originD}) = A(${j.N},${j.D}). ` : '';
      return `<details class="claim-note">
        <summary>Johnson calculation and Hamming comparison</summary>
        <p>${esc(relation)}For N=${j.N}, D=${j.D}=2e+1, e=${j.e}: the nested-floor constant-weight
          bound gives A(N,D+1,D) ≤ B=${esc(exactVal(j.constantWeight))}.</p>
        <p>V = Σᵢ₌₀ᵉ C(N,i) = ${esc(exactVal(j.volume))}; q = ⌊N/(e+1)⌋ = ${j.q};
          Δ = C(N,e+1) − C(D,e)B = ${esc(exactVal(j.delta))}.</p>
        <p>Johnson: ⌊2<sup>${j.N}</sup>q / (qV + Δ)⌋ = ${esc(exactVal(j.upper))}.
          Hamming at (${claim.originN},${claim.originD}): ${esc(exactVal(claim.hammingUpper))}.
          ${j.upper < claim.hammingUpper ? 'Johnson is strictly stronger.' : 'The integer bounds coincide.'}</p>
        <p><a href="https://ir.cwi.nl/pub/11831/11831D.pdf" target="_blank" rel="noopener noreferrer">Johnson formula, equation (2)</a>;
          <a href="https://pure.tue.nl/ws/portalfiles/portal/1929604/593604.pdf" target="_blank" rel="noopener noreferrer">constant-weight recursion, Theorem 3.9</a>.</p>
      </details>`;
    }

    function theoremClaim(claim) {
      const lower = boundNumber(claim.lower, [claim], 'lower');
      const upper = boundNumber(claim.upper, [claim], 'upper');
      const result = claim.lower === claim.upper
        ? `A(${claim.originN},${claim.originD}) = ${upper}`
        : `${lower} ≤ A(${claim.originN},${claim.originD}) ≤ ${upper}`;
      return `<div class="claim">
        <div class="claim-title">${esc(claim.rule)}</div>
        <div class="claim-result">${result}</div>${approximationNote(result)}
        ${numberDetails(lower, upper, claim.lower, claim.upper)}
        <div class="claim-note">${esc(claim.note)}</div>${johnsonCalculation(claim)}
      </div>`;
    }

    function citations(claim) {
      if (claim.source === 'L') {
        return referenceIds(claim, 'lower').map(key => `<span>[${esc(key)}]
          ${esc(data.citation_metadata[key]?.citation || 'Not found in uploaded bibliography')}</span>`)
          .join('<br>') || 'No bibliography tag on archived row.';
      }
      const constructionURL = claim.source === 'G'
        ? `https://www.codetables.de/BKLC/BKLC.php?q=2&n=${claim.record.code_n}&k=${claim.record.k}` : '';
      const citeSide = (side, label) => {
        if (claim[side] == null) return '';
        const keys = referenceIds(claim, side);
        const references = keys.length ? keys.map(key => {
          const reference = data.citation_metadata[key];
          const url = claim.source === 'G' && key === data.metadata.grassl.reference_id ? '' : reference.url;
          const link = url && url !== constructionURL
            ? ` <a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Source</a>` : '';
          return esc(reference.citation) + link;
        }).join('<br>') : 'Original paper not identified in the imported notes.';
        const locator = claim.source === 'P'
          ? claim.record[`${side}_source_locator`] ?? claim.record.source_locator : '';
        return `<p><strong>${label}:</strong> ${references}${locator ? `<br>${esc(locator)}` : ''}</p>`;
      };
      const compilation = constructionURL
        ? `<a href="${esc(constructionURL)}" target="_blank" rel="noopener noreferrer">CodeTables construction</a>`
        : claim.source === 'B'
          ? '<a target="_blank" rel="noopener noreferrer" href="https://aeb.win.tue.nl/codes/binary-1.html">Brouwer’s table and improvement notes</a>' : '';
      return citeSide('lower', 'Lower bound') + citeSide('upper', 'Upper bound') + compilation;
    }

    function importedClaim(claim) {
      const archived = claim.source === 'L';
      const original = claim.sourceBound ?? claim.lower;
      const originalClaim = archived ? { ...claim, lower: original, steps: 0 } : claim;
      const lower = boundNumber(original, [originalClaim], 'lower');
      const upper = boundNumber(claim.upper, [claim], 'upper');
      let result = `A(${claim.originN},${claim.originD}) ≥ ${lower}`;
      if (!archived && claim.upper != null) {
        result = claim.lower == null ? `A(${claim.originN},${claim.originD}) ≤ ${upper}`
          : claim.lower === claim.upper ? `A(${claim.originN},${claim.originD}) = ${lower}`
          : `${lower} ≤ A(${claim.originN},${claim.originD}) ≤ ${upper}`;
      }
      const derivations = [];
      if (claim.implied) {
        const power = powerForm(claim.lower, [claim]);
        const value = power ? `${power.N} × 2^${power.k}` : notation(claim.lower);
        derivations.push(`Shorten from length ${claim.originN} to ${claim.originN-claim.steps}
          (${claim.steps} coordinates). Derived lower bound ${value}.`);
      }
      if (claim.source === 'G') {
        if (claim.record.reference_note) derivations.push(claim.record.reference_note);
        if (claim.parity && !claim.padding) derivations.push('Transfer this lower bound to the selected parameters by the odd/even parity identity.');
      }
      if (claim.padding) {
        const { fromN, toN, d } = claim.padding;
        if (claim.originD !== d) {
          derivations.push(`Use the odd/even parity identity to transfer the lower bound to A(${fromN},${d}).`);
        }
        const coordinates = toN - fromN;
        derivations.push(`Append ${coordinates === 1 ? 'one zero coordinate' : `${coordinates} zero coordinates`} to each codeword to increase the length from ${fromN} to ${toN}. The minimum distance and code size are preserved.`);
      }
      const type = claim.record.type;
      const typeName = data.code_types[type] ? ` (${esc(data.code_types[type])})` : '';
      const provenance = archived
        ? `Imported via the Litsyn–Rains–Sloane archive (1999). Row: k=${claim.record.k}, N=${esc(claim.record.N)}, type ${esc(type)}${typeName}.`
        : claim.source === 'G'
          ? `Binary linear code [${esc(claim.record.code_n)}, ${esc(claim.record.k)}, ${esc(claim.record.code_d)}] with 2<sup>${esc(claim.record.k)}</sup> codewords.`
          : claim.source === 'P'
            ? `Literature record ${esc(claim.record.id)}.`
            : 'Imported via Brouwer’s table (2026); paper and communication credits are listed below.';
      const exact = archived
        ? (lower !== esc(exactVal(original)) ? exactIntegers([['Archived lower bound', original]]) : '')
        : numberDetails(lower, upper, claim.lower, claim.upper);
      const title = claim.source === 'B' ? 'Imported table claim'
        : esc(boundAttributions([claim], claim.lower != null ? 'lower' : 'upper'));
      const derived = claim.parity || claim.implied || claim.padding ? '<span class="claim-derived"> · derived</span>' : '';
      return `<div class="claim">
        <div class="claim-title">${title}${derived}</div><div class="claim-result">${result}</div>
        ${approximationNote(result)}${exact}<div class="claim-meta">${provenance}</div>
        ${derivations.length ? `<div class="claim-note">${esc(derivations.join(' '))}</div>` : ''}
        <div class="cite">${citations(claim)}</div>
      </div>`;
    }

    const displayClaim = claim => claim.source === 'T' ? theoremClaim(claim) : importedClaim(claim);
    return { esc, comma, notation, exactVal, authorLabel, referenceIds,
      boundAttributions, powerForm, boundNumber, exactIntegers, displayClaim };
  }

  const api = { createFormatters };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AtlasFormat = api;
})(globalThis);
