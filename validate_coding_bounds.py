#!/usr/bin/env python3
"""Basic import and mathematical consistency checks for the source-backed A(n,d) prototype."""
from pathlib import Path
import csv, json, math
from collections import defaultdict
from fractions import Fraction
from coding_bounds_math import hamming_upper, johnson_trace, johnson_upper, elementary_upper
from coding_bounds_attribution import enrich_attribution
from coding_bounds_claims import validate_literature_claims, validate_literature_consistency

ROOT=Path(__file__).parent
DB=json.loads((ROOT/'coding_bounds_seed.json').read_text(encoding='utf-8'))
L=DB['litsyn']; B=DB['brouwer']
assert len(L)==1014 and len(B)==161
assert len({(r['n'],r['d']) for r in L})==len(L)
assert len({(r['n'],r['d']) for r in B})==len(B)
assert all(1<=r['n']<=512 and r['d'] in range(3,30,2) and int(r['lower'])==int(r['N'])*2**r['k'] for r in L)
assert all(6<=r['n']<=28 and r['d'] in range(4,17,2) and 1<=int(r['lower'])<=int(r['upper']) for r in B)
ref_keys=set(DB['bibliography'])
attributed=enrich_attribution(DB)
citations=attributed['citation_metadata']
literature=validate_literature_claims(DB.get('literature_claims',[]),citations)
validate_literature_consistency(DB)
assert all(citations[key]['authors'] for key in ref_keys)
assert citations['etzi00']['year']=='1992'
assert citations['shek89']['year']=='1989'
assert '%\\bibitem' not in citations['shek89']['citation']
assert citations['hama88']['authors']==['Hämäläinen']
assert citations['oste96']['authors']==['Östergård','Kaikkonen']
assert len(citations['hamm94']['authors'])==5
assert attributed['bound_references']['BRO-18-4']['lower']==['milshtein2026','sanchez2026']
assert attributed['bound_references']['BRO-18-4']['upper']==['tseng2023']
assert attributed['bound_references']['BRO-23-10']['lower']==['ota2026']
assert attributed['bound_references']['BRO-25-10']['upper']==['gijswijt2012']
assert all(key in citations for sides in attributed['bound_references'].values() for keys in sides.values() for key in keys)
missing={k for r in L for k in r['refs'] if k not in ref_keys}
assert not missing,missing

excluded={entry['claim_id'] for entry in DB['editorial_exclusions']}
assert excluded=={'LIT-32-19','LIT-35-21'}
eligible=[r for r in L if r['id'] not in excluded]
assert len(eligible)==1012
for r in L:
    if r['id'] in excluded:
        assert int(r['lower'])>(2*r['d'])//(2*r['d']-r['n'])

by_d=defaultdict(list)
for r in eligible: by_d[r['d']].append(r)
for group in by_d.values(): group.sort(key=lambda r:r['n'])
by_b={(r['n'],r['d']):r for r in B}
by_l={(r['n'],r['d']):r for r in eligible}

def imported_at(n,d):
    claims=[]
    origin_n,origin_d=(n,d) if d&1 else (n-1,d-1)
    if origin_n>=1 and origin_d in by_d:
        r=by_l.get((origin_n,origin_d))
        if r is None:
            r=next((t for t in by_d[origin_d] if t['n']>origin_n),None)
        if r:
            steps=r['n']-origin_n
            val=(int(r['lower'])+(1<<steps)-1)//(1<<steps)
            claims.append(('Litsyn',val,None,r))
    origin_n,origin_d=(n,d) if d%2==0 else (n+1,d+1)
    if (origin_n,origin_d) in by_b:
        r=by_b[origin_n,origin_d]
        claims.append(('Brouwer',int(r['lower']),int(r['upper']),r))
    target=(n,d) if d%2 else (n-1,d-1)
    for r in literature:
        pair=(r['n'],r['d']) if r['d']%2 else (r['n']-1,r['d']-1)
        if r.get('active') is not False and pair==target:
            claims.append(('Literature',int(r['lower']) if r.get('lower') else None,
                           int(r['upper']) if r.get('upper') else None,r))
    return claims

def baseline_upper(n,d):
    if d>n: return 1
    if d==1: return 2**n
    if d==2: return 2**(n-1)
    t=(d-1)//2
    ans=min(2**(n-d+1), 2**n//sum(math.comb(n,i) for i in range(t+1)))
    if 2*d>n: ans=min(ans,(2*d)//(2*d-n))
    return ans

# Published GUAVA example, perfect codes, parity, and a nonintegral
# Johnson denominator (rounding this denominator prematurely weakens the bound).
assert hamming_upper(13,5)==89 and johnson_upper(13,5)==77
assert hamming_upper(12,5)==51 and johnson_upper(12,5)==47
assert johnson_upper(29,5)==1230101
assert johnson_upper(30,6)==johnson_upper(29,5)
for n,d,value in [(7,3,16),(15,3,2048),(23,7,4096),(24,8,4096)]:
    assert johnson_upper(n,d)==value
assert johnson_upper(6,9)==1
assert johnson_upper(512,1)==2**512

inconsistent=[]
total=0
johnson_improves_hamming=0
johnson_improves_baseline=0
display_improvements=[]
for n in range(3,513):
    for d in range(3,min(29,n)+1):
        total+=1
        claims=imported_at(n,d)
        lower=max([2]+[c[1] for c in claims if c[1] is not None])
        upper=min([elementary_upper(n,d)]+[c[2] for c in claims if c[2] is not None])
        old_upper=min([baseline_upper(n,d)]+[c[2] for c in claims if c[2] is not None])
        trace=johnson_trace(n,d)
        j=trace['upper']
        assert j<=hamming_upper(n,d)
        # Independent rational evaluation of the published formula.
        denominator=Fraction(trace['volume'])+Fraction(trace['delta'],trace['q'])
        assert j==math.floor(Fraction(2**trace['N'])/denominator)
        assert upper<=old_upper
        partner=(n+1,d+1) if d%2 else (n-1,d-1)
        assert elementary_upper(n,d)==elementary_upper(*partner)
        johnson_improves_hamming+=j<hamming_upper(n,d)
        johnson_improves_baseline+=j<baseline_upper(n,d)
        if upper<old_upper:
            display_improvements.append((n,d,hamming_upper(n,d),j,old_upper,upper))
        if lower>upper:
            inconsistent.append((n,d,lower,upper,[(c[0],c[3]['id']) for c in claims]))
        assert all(c[3]['id'] not in excluded for c in claims)

assert not inconsistent,inconsistent
for n,d,upper in [(32,19,5),(33,20,5),(35,21,5),(36,22,5)]:
    assert elementary_upper(n,d)==upper
    assert max([2]+[c[1] for c in imported_at(n,d) if c[1] is not None])<=upper
example=imported_at(17,3)
assert max(c[1] for c in example if c[1] is not None)>=6144
assert min([elementary_upper(17,3)]+[c[2] for c in example if c[2] is not None])<=6551

overlap=[]
for r in L:
    current=by_b.get((r['n']+1,r['d']+1))
    if current is not None:
        overlap.append((r,current))
improved=[(r,c) for r,c in overlap if int(c['lower'])>int(r['lower'])]

lines=[
    'A(n,d) Atlas | Seed validation report',
    '====================================',
    f'Litsyn raw source rows: {len(L)}',
    f'Excluded erroneous archive rows: {len(excluded)}',
    f'Eligible Litsyn source rows: {len(eligible)}',
    f'Brouwer table cells: {len(B)}',
    f'Active literature updates: {sum(r.get("active") is not False for r in literature)}',
    f'Active bibliography keys: {len(DB["bibliography"])}',
    f'Bibliography entries with author labels: {sum(bool(citations[key]["authors"]) for key in ref_keys)}',
    f'Brouwer cells with identified bound references: {len(attributed["bound_references"])}',
    f'Missing bibliography keys: {len(missing)}',
    f'Overlapping explicitly cited parameter pairs via parity: {len(overlap)}',
    f'Overlaps where Brouwer improves Litsyn lower bound: {len(improved)}',
    f'Pairs scanned (3 <= d <= min(29,n), 3 <= n <= 512): {total}',
    f'Pairs with lower > imported/theorem upper: {len(inconsistent)}',
    f'Pairs where Johnson beats direct Hamming: {johnson_improves_hamming}',
    f'Pairs where Johnson improves the previous theorem minimum: {johnson_improves_baseline}',
    f'Pairs with a stronger displayed upper bound (all sources enabled): {len(display_improvements)}',
    '',
    'Editorial exclusions (raw archive retained; excluded before all derivations):',
    *[f'  {entry["claim_id"]}: {entry["reason"]}' for entry in DB['editorial_exclusions']],
    '',
    'Regression checks: parity-closed Plotkin upper bound 5 at all four formerly conflicting pairs;',
    'A(17,3) remains bounded by 6144 and 6551; no excluded row feeds a derived claim.',
    'Johnson regressions: A(13,5) <= 77 versus Hamming 89; A(12,5) <= 47 versus 51;',
    'A(29,5) and A(30,6) <= 1230101; Hamming/Golay perfect-code values are preserved.',
    '',
    'Important: This is a consistency test against elementary upper bounds,',
    'not an independent verification of all constructions or a literature audit.'
]
report='\n'.join(lines)+'\n'
(ROOT/'coding_bounds_validation.txt').write_text(report,encoding='utf-8')
with (ROOT/'coding_bounds_johnson_improvements.csv').open('w',newline='',encoding='utf-8') as output:
    writer=csv.writer(output)
    writer.writerow(['n','d','hamming_upper','johnson_upper','previous_displayed_upper','displayed_upper'])
    writer.writerows(display_improvements)
print(report)
