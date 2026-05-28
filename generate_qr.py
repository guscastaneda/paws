# Paws on Longmeadow — QR Code Generator + Airtable Uploader
# Run: AIRTABLE_API_KEY=your_key python3 generate_qr.py
# Requires Python 3.6+, no external packages

import os, sys, json, base64, urllib.request, urllib.error, time

# ── QR Code Generator (pure Python, no dependencies) ──────────────────────────

GF_EXP = [0]*512
GF_LOG = [0]*256
x = 1
for i in range(255):
    GF_EXP[i] = x
    GF_LOG[x] = i
    x <<= 1
    if x & 0x100: x ^= 0x11d
for i in range(255, 512): GF_EXP[i] = GF_EXP[i-255]

def gf_mul(a, b):
    if a == 0 or b == 0: return 0
    return GF_EXP[GF_LOG[a] + GF_LOG[b]]

def gf_poly_mul(p, q):
    r = [0]*(len(p)+len(q)-1)
    for i,pi in enumerate(p):
        for j,qj in enumerate(q):
            r[i+j] ^= gf_mul(pi,qj)
    return r

def rs_generator(n):
    g = [1]
    for i in range(n): g = gf_poly_mul(g, [1, GF_EXP[i]])
    return g

def rs_encode(data, n_ec):
    gen = rs_generator(n_ec)
    msg = data + [0]*n_ec
    for i in range(len(data)):
        coef = msg[i]
        if coef:
            for j,g in enumerate(gen): msg[i+j] ^= gf_mul(g, coef)
    return msg[len(data):]

VERSION_INFO = {
    1:(26,10,1,16,0,0), 2:(44,16,1,28,0,0), 3:(70,26,1,44,0,0),
    4:(100,18,2,32,0,0), 5:(134,24,2,43,0,0), 6:(172,16,4,27,0,0),
    7:(196,18,4,31,0,0), 8:(242,22,2,38,2,39), 9:(292,22,3,36,2,37),
    10:(346,26,4,37,1,38),
}
VERSION_CAPACITY = {1:16,2:28,3:44,4:64,5:86,6:108,7:124,8:154,9:182,10:216}

def get_version(n): 
    for v in range(1,11):
        if n <= VERSION_CAPACITY[v]: return v
    raise ValueError(f"Data too long")

def encode_data(data_bytes, version):
    total_cw, ec_per_block, b1, cw1, b2, cw2 = VERSION_INFO[version]
    total_data_cw = total_cw - ec_per_block*(b1+b2)
    bits = [0,1,0,0]
    n = len(data_bytes)
    for i in range(7,-1,-1): bits.append((n>>i)&1)
    for byte in data_bytes:
        for i in range(7,-1,-1): bits.append((byte>>i)&1)
    bits += [0,0,0,0]
    while len(bits)%8: bits.append(0)
    pad_bytes = [0xEC, 0x11]; i = 0
    while len(bits) < total_data_cw*8:
        bits += [(pad_bytes[i%2]>>j)&1 for j in range(7,-1,-1)]; i+=1
    bits = bits[:total_data_cw*8]
    codewords = [int(''.join(str(b) for b in bits[i:i+8]),2) for i in range(0,len(bits),8)]
    blocks_data = []; idx = 0
    for _ in range(b1): blocks_data.append(codewords[idx:idx+cw1]); idx+=cw1
    for _ in range(b2): blocks_data.append(codewords[idx:idx+cw2]); idx+=cw2
    blocks_ec = [rs_encode(b, ec_per_block) for b in blocks_data]
    final = []
    max_len = max(len(b) for b in blocks_data)
    for i in range(max_len):
        for b in blocks_data:
            if i < len(b): final.append(b[i])
    for i in range(ec_per_block):
        for b in blocks_ec:
            if i < len(b): final.append(b[i])
    return final

def make_matrix(version):
    size = version*4+17
    matrix = [[None]*size for _ in range(size)]
    reserved = [[False]*size for _ in range(size)]
    def set_module(r,c,val): matrix[r][c]=val; reserved[r][c]=True
    def place_finder(r,c):
        for dr in range(7):
            for dc in range(7):
                val = 1 if (dr==0 or dr==6 or dc==0 or dc==6 or (2<=dr<=4 and 2<=dc<=4)) else 0
                if 0<=r+dr<size and 0<=c+dc<size: set_module(r+dr,c+dc,val)
        for i in range(8):
            if 0<=r+i<size and c-1>=0: set_module(r+i,c-1,0)
            if 0<=r+i<size and c+7<size: set_module(r+i,c+7,0)
            if r-1>=0 and 0<=c+i<size: set_module(r-1,c+i,0)
            if r+7<size and 0<=c+i<size: set_module(r+7,c+i,0)
    place_finder(0,0); place_finder(0,size-7); place_finder(size-7,0)
    for i in range(8,size-8): set_module(6,i,i%2==0); set_module(i,6,i%2==0)
    set_module(size-8,8,1)
    ALIGN_POS = {2:[6,18],3:[6,22],4:[6,26],5:[6,30],6:[6,34],
                 7:[6,22,38],8:[6,24,42],9:[6,26,46],10:[6,28,50]}
    if version >= 2:
        pos = ALIGN_POS[version]
        for r in pos:
            for c in pos:
                if matrix[r][c] is None:
                    for dr in range(-2,3):
                        for dc in range(-2,3):
                            val = 1 if (abs(dr)==2 or abs(dc)==2 or (dr==0 and dc==0)) else 0
                            set_module(r+dr,c+dc,val)
    for i in range(9):
        if matrix[i][8] is None: reserved[i][8]=True
        if matrix[8][i] is None: reserved[8][i]=True
    for i in range(size-8,size):
        if matrix[i][8] is None: reserved[i][8]=True
        if matrix[8][i] is None: reserved[8][i]=True
    return matrix, reserved, size

def place_data(matrix, reserved, size, codewords):
    bits = []
    for cw in codewords:
        for i in range(7,-1,-1): bits.append((cw>>i)&1)
    bit_idx = 0; upward = True; col = size-1
    while col >= 0:
        if col == 6: col -= 1
        rows = range(size-1,-1,-1) if upward else range(size)
        for row in rows:
            for dc in range(2):
                c = col-dc
                if not reserved[row][c]:
                    matrix[row][c] = bits[bit_idx] if bit_idx < len(bits) else 0
                    bit_idx += 1
        upward = not upward; col -= 2

def apply_mask(matrix, reserved, size, mask_id):
    m = [row[:] for row in matrix]
    def cond(r,c):
        if mask_id==0: return (r+c)%2==0
        if mask_id==1: return r%2==0
        if mask_id==2: return c%3==0
        if mask_id==3: return (r+c)%3==0
        if mask_id==4: return (r//2+c//3)%2==0
        if mask_id==5: return (r*c)%2+(r*c)%3==0
        if mask_id==6: return ((r*c)%2+(r*c)%3)%2==0
        if mask_id==7: return ((r+c)%2+(r*c)%3)%2==0
    for r in range(size):
        for c in range(size):
            if not reserved[r][c] and cond(r,c): m[r][c] ^= 1
    return m

def place_format(matrix, size, mask_id, ecc_level=0b01):
    data = (ecc_level<<3)|mask_id
    g = 0b10100110111; rem = data<<10
    for i in range(4,-1,-1):
        if rem & (1<<(i+10)): rem ^= g<<i
    fmt = ((data<<10)|rem) ^ 0b101010000010010
    bits = [(fmt>>i)&1 for i in range(14,-1,-1)]
    positions = [(8,0),(8,1),(8,2),(8,3),(8,4),(8,5),(8,7),(8,8),
                 (7,8),(5,8),(4,8),(3,8),(2,8),(1,8),(0,8)]
    for i,(r,c) in enumerate(positions): matrix[r][c] = bits[i]
    for i in range(7): matrix[size-1-i][8] = bits[i]
    for i in range(8): matrix[8][size-8+i] = bits[7+i]

def score_matrix(m, size):
    score = 0
    for r in range(size):
        run=1
        for c in range(1,size):
            if m[r][c]==m[r][c-1]: run+=1
            else:
                if run>=5: score+=run-2
                run=1
        if run>=5: score+=run-2
    for c in range(size):
        run=1
        for r in range(1,size):
            if m[r][c]==m[r-1][c]: run+=1
            else:
                if run>=5: score+=run-2
                run=1
        if run>=5: score+=run-2
    for r in range(size-1):
        for c in range(size-1):
            v=m[r][c]
            if m[r+1][c]==v and m[r][c+1]==v and m[r+1][c+1]==v: score+=3
    return score

def generate_qr_svg(text, module_size=10):
    data_bytes = text.encode('utf-8')
    version = get_version(len(data_bytes))
    codewords = encode_data(data_bytes, version)
    matrix, reserved, size = make_matrix(version)
    place_data(matrix, reserved, size, codewords)
    best_mask, best_score, best_matrix = 0, float('inf'), None
    for mask_id in range(8):
        m = apply_mask(matrix, reserved, size, mask_id)
        place_format(m, size, mask_id)
        s = score_matrix(m, size)
        if s < best_score: best_score, best_mask, best_matrix = s, mask_id, m
    place_format(best_matrix, size, best_mask)
    quiet = 4; total = (size+quiet*2)*module_size
    rects = []
    for r in range(size):
        for c in range(size):
            if best_matrix[r][c]:
                x=(c+quiet)*module_size; y=(r+quiet)*module_size
                rects.append(f'<rect x="{x}" y="{y}" width="{module_size}" height="{module_size}"/>')
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {total} {total}" width="{total}" height="{total}"><rect width="{total}" height="{total}" fill="white"/><g fill="black">{"".join(rects)}</g></svg>'

# ── Upload to Airtable ─────────────────────────────────────────────────────────

BASE_ID = 'appvQb876VInNJlnB'
TABLE_ID = 'tblqksLnPLdE0nF8Q'
FIELD_ID = 'fldGrSSkcmh9de1su'

API_KEY = os.environ.get('AIRTABLE_API_KEY', '')
if not API_KEY:
    print("ERROR: Set AIRTABLE_API_KEY environment variable")
    print("  export AIRTABLE_API_KEY=your_key_here")
    sys.exit(1)

CLIENTS = [
  ("rec17CSGSzfoJtMWr","Brendan Saloner","https://client.pawsonlongmeadow.com?client=594770095f3008ffe9fadef6"),
  ("rec1S4dsknefg9l0e","Kimanh Mish","https://client.pawsonlongmeadow.com?client=1fef19ca2cf595e4d6fe3400"),
  ("rec1lBEE5yVxM1yMV","Lisa Schreiber","https://client.pawsonlongmeadow.com?client=6c3dc126a4ffa2a142fb514c"),
  ("rec42sRRKcekC3jlu","Lesley Carrigg","https://client.pawsonlongmeadow.com?client=44243f7caa1338889c995566"),
  ("rec51AUiuJQkY7Rwd","Brad","https://client.pawsonlongmeadow.com?client=d15494b4dbd2a36dff7fbfd6"),
  ("rec5Uq8md7DnRKbYF","Charlene Rincon","https://client.pawsonlongmeadow.com?client=89cb6431082d785548624d6a"),
  ("rec5mYP9a9yDUt2Ti","Erik Dunn","https://client.pawsonlongmeadow.com?client=726acbbcfff3ce2529b47a22"),
  ("rec6mvxs916LxdgI6","Kristen Early","https://client.pawsonlongmeadow.com?client=0cab0810e940604d1033c685"),
  ("rec7Kp5T82q0U0dqd","Kimberly","https://client.pawsonlongmeadow.com?client=c087401ae58c41528d3fe482"),
  ("rec9UZ76f0bQVpnyt","Gwen Bruno","https://client.pawsonlongmeadow.com?client=0520ff9c8ad21c49ebdfee9f"),
  ("rec9nS98CYDNZ7Mw7","Diane Freedland","https://client.pawsonlongmeadow.com?client=66e63b4b61177157b0f3b79f"),
  ("rec9zFje2WtOCFpPK","Gus Castaneda","https://client.pawsonlongmeadow.com?client=8d6f329b7f2c4e07392d71f9"),
  ("recA1BTNQfDQU67TZ","Shilpa Parulekar","https://client.pawsonlongmeadow.com?client=60dfdcad11cc602ddd9b768f"),
  ("recALRI2NZ5zDrf4s","Cheryl Morgan","https://client.pawsonlongmeadow.com?client=40eaa14f7b5393bc4d1b03fb"),
  ("recAmZ9a5SMwXIYZz","Kevin Mawe","https://client.pawsonlongmeadow.com?client=fc25deb178f5064045206c36"),
  ("recB3cG2VInTJnjaf","Sara Lozano","https://client.pawsonlongmeadow.com?client=7be70c822b158b3d73674ae4"),
  ("recCbhBUNKIKsppms","Hemma Sarang-Sieminski","https://client.pawsonlongmeadow.com?client=ba8917c099ce0449f57cf724"),
  ("recCzHsgMMgemSahS","Heather L","https://client.pawsonlongmeadow.com?client=e267afbd8b1bfe9715735d40"),
  ("recFe5BjIJ8LtU1Ih","Sheila Pariser","https://client.pawsonlongmeadow.com?client=02125e75d75795066c8ce3b1"),
  ("recGgPR3I41b3x3CI","Leslie","https://client.pawsonlongmeadow.com?client=bf3bf21b5121e2f12efdbeaf"),
  ("recH45nMn4BOvrhFf","Jasmin McCrory","https://client.pawsonlongmeadow.com?client=123f0d9b33532d9a7f1fddbe"),
  ("recIDX7VTnwvmppzQ","Neha Verma","https://client.pawsonlongmeadow.com?client=c8d0afbe8545db3f6886f1bf"),
  ("recIYPPmNW73E7MDh","Balu Angaian","https://client.pawsonlongmeadow.com?client=b5437f7ad2440d00bfbd81ef"),
  ("recIxGFWg5iB6jAeM","Jess","https://client.pawsonlongmeadow.com?client=c029cd2ea7fc7d563e7d6765"),
  ("recK3Byz82GxEKuSO","Julia Yang","https://client.pawsonlongmeadow.com?client=404240ec00905e4755cc9451"),
  ("recL10VRy33SIlCVm","Deana Blackman","https://client.pawsonlongmeadow.com?client=2780f359d7304cdc3043bc16"),
  ("recLRTbfQkMRyPDsY","Joanne","https://client.pawsonlongmeadow.com?client=5d97720fc61271caebcc54f8"),
  ("recLaLat6Nfm6cp3t","Sandeep Bathia","https://client.pawsonlongmeadow.com?client=e5c380d2efd7ad3634a3045e"),
  ("recLbjoceW0SJ4KGW","Jennifer To","https://client.pawsonlongmeadow.com?client=4729a2a2435ed7014a9b51ca"),
  ("recMJ7FIYZNGe4tt1","Asha Shamanna","https://client.pawsonlongmeadow.com?client=cc49dce5e7066f24e7a66594"),
  ("recNAb3chjXuxtf1f","Angela Frank","https://client.pawsonlongmeadow.com?client=d7205d711f7a2fa5b8f0fa1b"),
  ("recNZ8WDREftc7SOb","Lisa Beaty","https://client.pawsonlongmeadow.com?client=2abbaeba0310edacb14cc616"),
  ("recNcwnt8WsutIjgo","Bandana","https://client.pawsonlongmeadow.com?client=c840e353e7c3ad3f457e3a6e"),
  ("recOPP0pBYy7onnAs","Rahana Aju","https://client.pawsonlongmeadow.com?client=29e669fb68ea9ab70f94102a"),
  ("recOQ8Abq38MrFVlW","Nicole Rodriguez","https://client.pawsonlongmeadow.com?client=b7652c976ab0de816bf6db54"),
  ("recRCPhQmGcTioxUf","Andris Soble","https://client.pawsonlongmeadow.com?client=e335b32ca62a1827440eecc9"),
  ("recRCm2FFaPTiI0Ss","Jackie Fenore","https://client.pawsonlongmeadow.com?client=07a46ee5c058c1dab0b329b2"),
  ("recRjjady0BrifjJ6","Kathleen G","https://client.pawsonlongmeadow.com?client=e06ad19b21e6bd17bd470ec6"),
  ("recRxQ5VPvRX9ChLl","Venkat Bakthavachalam","https://client.pawsonlongmeadow.com?client=3d99eb21f75e0898203484e7"),
  ("recTjQtO7TxKHAAbS","Cheryl Appel","https://client.pawsonlongmeadow.com?client=e2ec6b0781dc25c2b7a30155"),
  ("recUQM1ezyDFPQfkD","Jackie Modiste","https://client.pawsonlongmeadow.com?client=a9a5b564d35ca62792640a99"),
  ("recUSYHhrvjdF7HYW","Steve Savage","https://client.pawsonlongmeadow.com?client=e8b615b5f95afc366ca87f7b"),
  ("recUdzWIzxdKHv10p","Rhea Bennett","https://client.pawsonlongmeadow.com?client=bcba072ba1c58cf7a6c19153"),
  ("recV1jNNSAPRZjoGN","Kelly Haynes","https://client.pawsonlongmeadow.com?client=6ce5b300b68599984322450c"),
  ("recWNXBU3hPUhvMIB","Rupsa Roy","https://client.pawsonlongmeadow.com?client=d9dee61eff384bbf4fbeb9c3"),
  ("recWd5WsPZlNhcm70","Daniel Cifuentes","https://client.pawsonlongmeadow.com?client=938cc8a03048e53ff0bcdc43"),
  ("recX73yWLTojkP7GX","Kathi Mirza","https://client.pawsonlongmeadow.com?client=21c162d214b99a69b4dcab98"),
  ("recY6OLnURYJ9RUeb","Joe Milton","https://client.pawsonlongmeadow.com?client=6dc505d91c8f4158ebba6d06"),
  ("recYRDCQGde5mjuJF","Jennifer Mosaheb","https://client.pawsonlongmeadow.com?client=12db01cb9a80c0097b3c5a22"),
  ("recYhv1ptWxjLChZj","Helen Syski","https://client.pawsonlongmeadow.com?client=ed538362e822c14fcb188184"),
  ("recZ2KwVWLtxU7kAT","Rozanna Penney","https://client.pawsonlongmeadow.com?client=7778ff1dadb1071c9b1968ba"),
  ("recabndu77FpTdp83","Tara","https://client.pawsonlongmeadow.com?client=b0269e820f288187f873b0bb"),
  ("reccUrXoo0xJ56kL7","Ross Fujita","https://client.pawsonlongmeadow.com?client=e9e87ca2645488d0d1bef813"),
  ("reccdW1hdQC5zTc2p","Tori","https://client.pawsonlongmeadow.com?client=c64c05c3e042bebf35e0a704"),
  ("reccf3tZfklkGnfWY","Geralyn Ryan","https://client.pawsonlongmeadow.com?client=48ec345210f5dc79330e3f40"),
  ("recdPLkb9qV8iwE8O","Kassidy Quadrozzi","https://client.pawsonlongmeadow.com?client=eea7949ee69f76717602cb4f"),
  ("recfRqLTR72lfrwRZ","Kris Loos","https://client.pawsonlongmeadow.com?client=28701abc87166c453e1027f7"),
  ("recfuFTjcr8juUSJc","Emily Rapalino","https://client.pawsonlongmeadow.com?client=6b292e72162f82a4768b84f6"),
  ("recgebYlierdtywae","Julia Volfson","https://client.pawsonlongmeadow.com?client=62ef0d6879f7f48638ff8e30"),
  ("recgli1AMevmpWued","Deb Freedman","https://client.pawsonlongmeadow.com?client=37741e41b60a6959a269726b"),
  ("recgzY7bZQXOrSLN7","Vanessa Manero Castro","https://client.pawsonlongmeadow.com?client=952b7c3bf1267800beaecc29"),
  ("rechsJkRetp0iwi2e","Shari","https://client.pawsonlongmeadow.com?client=366a844c89e0b8d79768ec6c"),
  ("recipqlr7vJUaSBv0","Sam Ditters","https://client.pawsonlongmeadow.com?client=8f3d1475925a7e800e1e38b8"),
  ("recitlJueJMM801C1","Jack Sobran","https://client.pawsonlongmeadow.com?client=23d61ca1f650dceee1f03d74"),
  ("recjmzP3y6vkoCsRD","Anand Jajra","https://client.pawsonlongmeadow.com?client=a80730507363ebd58ed55c38"),
  ("recju0qfwEGAo27PT","Jason Worrall","https://client.pawsonlongmeadow.com?client=2d3467b47afef959e9b8dd86"),
  ("reckbuvZfDRRjqxjE","Wendy Shrago","https://client.pawsonlongmeadow.com?client=8ae4743749bb918971e5e8af"),
  ("reckkbHzgOeOYs7mA","Tribeni","https://client.pawsonlongmeadow.com?client=73c2692fd9335faba2c647cd"),
  ("recm1ugAfyaSu4k6D","Susan","https://client.pawsonlongmeadow.com?client=7b30bee39a27e70514e8ca2b"),
  ("recmU5FM8VVswCN9N","Larry Van Leer","https://client.pawsonlongmeadow.com?client=d097b56a3822c8d5dd3640a9"),
  ("recnDtm7DHy2BflRN","Cara Weinstein","https://client.pawsonlongmeadow.com?client=a58bda5f3d14830e8624bd1a"),
  ("recnac15Te4fgdd3y","Shana Engquist","https://client.pawsonlongmeadow.com?client=f80cf554d1ad6b2ae7d2fed8"),
  ("recp6yy7Bd1hLXJVO","Rohanna Wise","https://client.pawsonlongmeadow.com?client=55a309efcc813b6e7d13f425"),
  ("recpsVMGDXIInr9kn","David Hajjar","https://client.pawsonlongmeadow.com?client=cbd209a42aa4932106950c17"),
  ("recqShEYvBsfB2k6h","Betsy Newbold","https://client.pawsonlongmeadow.com?client=19ffff0dcc5d2874eb4a1cfd"),
  ("recqwOlBhoauYMg8Y","Carol Tsoi","https://client.pawsonlongmeadow.com?client=9a1d80ecc86c7a1cef24d0ee"),
  ("recrhRo7SqY3OSPIX","Tiffany Montgomery","https://client.pawsonlongmeadow.com?client=1bf6ee0ccacb2f24c4088db8"),
  ("recsWl5WVSZW59jZy","Amanda Frommelt","https://client.pawsonlongmeadow.com?client=b3fd8f56715b5119f2a19cf3"),
  ("recsX9PIsvu2xEhsL","Ed Wilson","https://client.pawsonlongmeadow.com?client=f56d6d031fdb78fc8876890e"),
  ("recwCfrXSBM2f3SFc","Nga Nguyen","https://client.pawsonlongmeadow.com?client=76d05ae41ffe142a2e9c10b7"),
  ("recx3SOFnhZArxCo0","Dan Kurker","https://client.pawsonlongmeadow.com?client=d51067968dddefc4c120487a"),
  ("recyQClkpbH0yQfwp","Ali Munawar","https://client.pawsonlongmeadow.com?client=015b8ee1b1cbbc13096c2d70"),
  ("recyyt5Yy9ckfXOG1","Ashwini Kamath","https://client.pawsonlongmeadow.com?client=28bf7036169990f2487e78b2"),
]

print(f"Uploading QR codes for {len(CLIENTS)} clients...")
ok, fail = 0, []

for rec_id, name, url in CLIENTS:
    try:
        svg = generate_qr_svg(url, module_size=10)
        svg_b64 = base64.b64encode(svg.encode('utf-8')).decode('utf-8')
        upload_url = f'https://content.airtable.com/v0/{BASE_ID}/{rec_id}/{FIELD_ID}/uploadAttachment'
        payload = json.dumps({
            'contentType': 'image/svg+xml',
            'filename': f'qr-{name.strip().lower().replace(" ","_")}.svg',
            'file': svg_b64
        }).encode('utf-8')
        req = urllib.request.Request(upload_url, data=payload, method='POST',
            headers={'Authorization': f'Bearer {API_KEY}', 'Content-Type': 'application/json'})
        with urllib.request.urlopen(req) as resp:
            resp.read()
        ok += 1
        print(f'  ✓ {name} ({ok}/{len(CLIENTS)})', flush=True)
        time.sleep(0.1)  # be nice to the API
    except Exception as e:
        fail.append(name)
        print(f'  ✗ {name}: {e}', flush=True)

print(f'\n✅ Done: {ok} uploaded, {len(fail)} failed')
if fail: print('Failed:', fail)
