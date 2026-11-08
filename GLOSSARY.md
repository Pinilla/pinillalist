# pinillalist

A self-hosted app a household uses to plan grocery shopping, built around grocery lists and the recipes that feed them.

## Language

**Household**:
The small group of known people who share lists and recipes. There is no public sign-up.
_Avoid_: Family, team, group

**Grocery list**:
A named list of items to buy, which members of the household tick off while shopping. A household can keep several, such as one per store. One of them is the default list, which receives a recipe's ingredients unless someone picks another.
_Avoid_: Shopping list, checklist, to-do

**Essentials list**:
A standing list of groceries the household always keeps on hand, such as toilet paper. Its items are never done. Each week someone marks the few that are low, and only those go into the weekly order.
_Avoid_: Staples, pantry list, inventory

**Stock check**:
The pass before a weekly order where someone marks each item as "have it" or "need it." Only items marked "need it" go into the weekly order.
_Avoid_: Pantry check, review, inventory

**Item**:
One thing to buy on a grocery list, with an amount. When two recipes need the same thing, they share one item that records both recipes.
_Avoid_: Entry, line, product

**Recipe**:
A dish the household cooks: a name, its ingredients with amounts, and optional steps.
_Avoid_: Meal

**Ingredient**:
A grocery a recipe needs, with an amount and an optional preparation. Adding the recipe to a grocery list turns each ingredient into an item for its grocery, or adds to an existing one.
_Avoid_: Component

**Preparation**:
How a recipe wants an ingredient readied, such as diced, minced or shredded. It belongs to the recipe only and never appears on a grocery list, so "1 onion, diced" adds Onion.
_Avoid_: Prep note, cut, style

**Catalog**:
The household's set of groceries, the things it buys. Grocery lists and recipes point into it, so a grocery's details apply everywhere it appears.
_Avoid_: Library, database, pantry

**Product**:
One specific offering a store sells, such as a particular brand and size of deli American cheese at Walmart. A grocery may be linked to one product.
_Avoid_: SKU, store item, listing

**Weekly order**:
The household's Saturday grocery order. Pinillalist fills the store carts (mostly Walmart, sometimes Amazon) from grocery lists, and a person checks out on the store's site.
_Avoid_: Purchase, checkout, online order
