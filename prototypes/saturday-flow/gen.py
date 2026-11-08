import json, base64, io, os, re, sys
from PIL import Image
EXP = os.path.expanduser('~/anylist-export')
d = json.load(open(f'{EXP}/user-data.json'))
rd = d['recipeDataResponse']
cols = {}
for c in rd['recipeCollections']:
    for rid in c.get('recipeIds', []):
        cols.setdefault(rid, []).append(c['name'])
recipes = []
for r in rd['recipes']:
    thumb = None
    p = f"{EXP}/photos/{r['identifier']}-0.jpg"
    if os.path.exists(p):
        im = Image.open(p).convert('RGB'); im.thumbnail((160, 160))
        b = io.BytesIO(); im.save(b, 'WEBP', quality=60)
        thumb = 'data:image/webp;base64,' + base64.b64encode(b.getvalue()).decode()
    ings = []
    for i in r.get('ingredients', []):
        if i.get('isHeading'):
            continue
        ings.append({'q': i.get('quantity') or '', 'n': (i.get('name') or i.get('rawIngredient') or '').strip()})
    recipes.append({'id': r['identifier'], 'name': r.get('name', '').strip(), 'cols': cols.get(r['identifier'], []),
                    'servings': r.get('servings') or '', 'thumb': thumb, 'ings': [x for x in ings if x['n']]})
recipes.sort(key=lambda r: r['name'].lower())
ess = [i['name'] for l in d['shoppingListsResponse']['newLists'] if l['name'] == 'Weekly Essentials' for i in l.get('items', [])]
out = {'recipes': recipes, 'essentials': ess, 'collections': [c['name'] for c in rd['recipeCollections']]}
open('data.js', 'w').write('window.DATA=' + json.dumps(out, ensure_ascii=False) + ';')
print(len(recipes), len(ess), os.path.getsize('data.js'))
