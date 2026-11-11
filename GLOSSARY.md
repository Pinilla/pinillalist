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
A standing list of groceries the household always keeps on hand, such as toilet paper. Its items are never done. Each week the stock check asks about each one, starting at 0, and only the low ones go into the weekly order.
_Avoid_: Staples, pantry list, inventory

**Stock check**:
The pass before a weekly order where someone walks the house, one location at a time, and goes through the groceries the picked recipes need and the Essentials list. Each grocery shows the ingredient lines that ask for it, and the person sets how many of its product to buy. The quantity starts at 1 for a recipe grocery and 0 for an Essential, and 0 means there's enough at home. The app never adds the amounts up or converts them.
_Avoid_: Pantry check, review, inventory

**Location**:
Where at home the household keeps a grocery, such as Pantry or Fridge. Each grocery has at most one. The locations are a fixed list in walk order, and the stock check follows it.
_Avoid_: Room, area, shelf

**Item**:
One grocery to buy on a grocery list, with an optional amount.
_Avoid_: Entry, line, product

**Recipe**:
A dish the household cooks: a name, its ingredients with amounts, and optional steps.
_Avoid_: Meal

**Ingredient**:
A grocery a recipe needs. It has a cooking amount ("1 cup") and an optional preparation ("diced"). It doesn't say how much to buy. The person decides that in the stock check.
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
The household's Saturday grocery order. Each person can work through it on their own phone at the same time, and each fills the household's shared store carts (mostly Walmart, sometimes Amazon). The store cart combines them, and a person checks out on the store's site.
_Avoid_: Purchase, checkout, online order
