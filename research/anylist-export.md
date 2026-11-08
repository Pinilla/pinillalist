# What data can come out of AnyList

Research for issue #3. Checked 2026-11-08.

## Short answer

AnyList has no bulk export. The official routes send one recipe or one list at a time as email text, a print page, or an AnyList-only recipe file. They are fine for a handful of recipes and useless for a one-time migration.

The practical route is AnyList's private sync API. One authenticated request, `POST https://www.anylist.com/data/user-data/get`, returns a protobuf message (`PBUserDataResponse`) that holds the whole account. That includes every list and item, every recipe with its ingredients and steps, recipe collections, favorites, recent items, categories, and the per-item category rules. The community `anylist` npm package already logs in and decodes this message. It needs the account email and password.

Recommended plan for pinillalist: write a small read-only script on top of the `anylist` npm package that calls the user-data endpoint once and saves the full decoded message as JSON. Import from that JSON. Do not rely on the package's `Recipe`, `Ingredient` and `Item` classes, because they drop fields (details below).

## Official routes

| Route | What it covers | Format | Useful for migration |
|---|---|---|---|
| Send recipe by email | One recipe | Email body with the recipe text, plus an optional attachment that only AnyList opens | No. One at a time, and the attachment is a private format |
| AirDrop recipe | One recipe | AnyList file, iOS to iOS with AnyList installed | No |
| Send recipe link | One recipe | Link to the original source website | Only for recipes that came from a website |
| Print recipe | One recipe | Print page, or PDF through the system print dialog | No, except as a human-readable archive |
| Send or print a list | One list | Plain text or print page | Partial. Names and quantities as text, no structure |
| Household sharing | Whole recipe box and meal plan, shared with another AnyList account | Stays inside AnyList | No |

Sources:

- [Sending recipes via email or AirDrop](https://help.anylist.com/articles/send-recipe/) describes Send Recipe, AirDrop Recipe and Send Recipe Link. The email contains "the recipe text" and an optional attachment "that can be opened directly in AnyList".
- [Opening an AnyList recipe file](https://help.anylist.com/articles/open-recipe-file/) only covers importing that file into AnyList. It does not document the file format.
- [Printing recipes](https://help.anylist.com/articles/print-recipe/), [Sending a list](https://help.anylist.com/articles/send-list), [Printing a list](https://help.anylist.com/articles/print-list/).
- The [sharing recipes topic](https://help.anylist.com/topics/recipes/sharing-recipes/) lists only those four articles. A search of help.anylist.com found no export, backup or download article. The help center documents import from Paprika ([article](https://help.anylist.com/articles/paprika-import/)) but nothing in the other direction.
- I found no export feature documented for the Mac app or the web app at anylist.com/web either. [anylist-recipe-pdf-maker](https://github.com/rkanter/anylist-recipe-pdf-maker) works around this by driving the web app to print each recipe to PDF, and its README says AnyList has no way to back up or bulk export recipes.

There is no CSV, JSON or Paprika-style export in any AnyList app.

## Unofficial route: the private sync API

### What the endpoint returns

The `anylist` npm package ([codetheweb/anylist](https://github.com/codetheweb/anylist), version 0.8.6 on npm, published 2026-05-03) ships the protobuf schema it uses in [`lib/definitions.json`](https://github.com/codetheweb/anylist/blob/master/lib/definitions.json). Every read in the package goes through one call in [`lib/index.js`](https://github.com/codetheweb/anylist/blob/master/lib/index.js), `_getUserData()`, which posts to `data/user-data/get` and decodes `PBUserDataResponse`. That message has these top-level parts:

- `shoppingListsResponse`: every list (`ShoppingList`) with its items (`ListItem`), plus per-list `listResponses` holding category groups, categories, categorization rules and stores.
- `recipeDataResponse`: every recipe (`PBRecipe`), recipe collections, and an `allRecipesCollection`.
- `starterListsResponse`: favorites (`favoriteItemListsResponse`), recent items (`recentItemListsResponse`) and user starter lists. Each is a `StarterList` holding `ListItem` entries.
- `categorizedItemsResponse`: items the user has assigned to a category, as `ListItem` entries.
- `userCategoriesResponse`: user-level categories and category groupings.
- `mealPlanningCalendarResponse`, `listFoldersResponse`, and list settings.

So one request covers recipes, grocery lists, favorites and categories together.

### Recipes

`PBRecipe` fields: name, note, icon, sourceName, sourceUrl, ingredients, preparationSteps, photoIds, photoUrls, scaleFactor, rating, nutritionalInfo, prepTime, cookTime, servings, creationTimestamp, timestamp, and paprikaIdentifier.

- `preparationSteps` is a list of strings, one per step.
- `servings` and `nutritionalInfo` are free-text strings.
- `prepTime` and `cookTime` are integers. The schema does not say the unit, so check against a known recipe.
- Photos come as IDs and URLs. The [anylist-backup](https://github.com/seancummins/anylist-backup) tool downloads them, so the URLs are fetchable.
- Recipe tags do not appear in the schema. The author of the ha-anylist integration also reports that tags are not in the API ([forum thread](https://community.home-assistant.io/t/anylist-for-home-assistant-shopping-lists-recipes-and-categories/1014626)).

### Ingredient amounts

`PBIngredient` has `rawIngredient`, `name`, `quantity`, `note` and `isHeading`. All except `isHeading` are strings.

This is semi-structured. AnyList splits each ingredient line into a quantity, a name and a note, and keeps the original line in `rawIngredient`. There is no separate unit field and no numeric amount, so the unit most likely sits inside the `quantity` string (for example "2 cups"). pinillalist will have to parse `quantity` itself if it wants numbers and units. `isHeading` marks section headings such as "For the sauce". AnyList does not link ingredients to steps.

Shopping list items are more structured. `ListItem` has `quantityPb` and `packageSizePb`, which split into `amount`, `unit` and the raw text, plus `details`, `category`, `categoryMatchId`, `categoryAssignments`, `storeIds`, prices and `recipeId` (set when the item was added from a recipe).

### Saved items, favorites and categories

- Favorites come back per list as `StarterList` entries under `favoriteItemListsResponse`. The package exposes them through `getFavoriteItemsByListId()`.
- Each list has category groups (`PBListCategoryGroup`) holding categories (`PBListCategory`: name, icon, systemCategory, sortIndex). This is the aisle order the household has set up.
- `PBListCategorizationRule` maps an item name to a category for a list. This is how AnyList remembers that "milk" goes in Dairy. These rules plus the favorites are the closest thing to a saved item catalog.
- `PBStore` lists the stores defined on each list.
- AnyList's built-in grocery autocomplete dictionary is not part of the user data. Only items the household has used, favorited or categorized come back.

### Fields the npm package drops

The wrapper classes are convenient but lossy, so a migration should serialize the raw decoded message instead.

- `Ingredient` in [`lib/ingredient.js`](https://github.com/codetheweb/anylist/blob/master/lib/ingredient.js) keeps rawIngredient, name, quantity and note, and drops `isHeading`.
- `Item` in [`lib/item.js`](https://github.com/codetheweb/anylist/blob/master/lib/item.js) keeps only `quantityPb.amount`, so the unit, package size, category assignments, stores and prices are lost.

## Other community tools

| Tool | Built on | Covers | Notes |
|---|---|---|---|
| [seancummins/anylist-backup](https://github.com/seancummins/anylist-backup) | `anylist` 0.8.6 | Recipes, photos, collections | One JSON file per recipe, plus optional YAML and Cooklang. Read-only by design. No lists or favorites. Two commits, no stars |
| [ducksauz/anylist-recipe-backup](https://github.com/ducksauz/anylist-recipe-backup) | `anylist` | Recipes | Dumps recipe objects to stdout. Its README says the output is not yet valid JSON |
| [pyanylist](https://pypi.org/project/pyanylist/) on [anylist_rs](https://github.com/phildenhoff/anylist_rs) | Rust reimplementation | Lists, items, recipes, favorites | Version 0.0.6, March 2026. Can save and restore tokens. Early version numbers |
| [moryoav/ha-anylist](https://github.com/moryoav/ha-anylist) | Own pure-Python client | Lists, recipes, collections, categories | Home Assistant custom integration, active through October 2026. Has `get_recipes` and `get_recipe` actions |
| [Home Assistant AnyList integration](https://www.home-assistant.io/integrations/any_list/) | Unofficial API | Shopping lists only | Official HA integration since 2026.11. Syncs item name, completed state and description. No recipes, favorites or categories |

The Home Assistant routes are not useful for this migration. The official integration only syncs list items, and the custom one adds a Home Assistant install in between for no gain over calling the API directly.

## Password and authentication

Every unofficial route needs the AnyList account email and password. The npm package posts them to `https://www.anylist.com/auth/token` and gets back an access token and a refresh token (`_fetchTokens()` in `lib/index.js`). By default it stores the tokens in `~/.anylist_credentials`, encrypted with the account password. Passing `credentialsFile: null` turns that off. pyanylist can export tokens after login so the password is not needed again. There is no OAuth or app-password option, because AnyList has no public API.

For a one-time run, the password can be passed as an environment variable and the credentials file disabled.

## How fragile each route is

- The official share and print routes are stable but do not do the job.
- The private API is undocumented. Both the [Home Assistant docs](https://www.home-assistant.io/integrations/any_list/) and the ha-anylist author say AnyList changes can break it. It has worked for years, though. The npm package dates from 2020, its issue tracker shows reads working and the latest release is from May 2026.
- Reads are reliable and writes are not. Open issues [#59](https://github.com/codetheweb/anylist/issues/59) and [#37](https://github.com/codetheweb/anylist/issues/37) report that creating, updating and deleting recipes does not persist. A migration only reads, so this does not matter here.
- The npm package pins protobufjs 5.0.3, which has security advisories ([#63](https://github.com/codetheweb/anylist/issues/63)). For a one-off read against AnyList's own server this is acceptable. Do not ship it inside pinillalist.
- AnyList is a paid app. If the household lets the subscription lapse, recipes may become limited (the user data includes a `maxRecipeCount` field). Export before cancelling.

## Suggested next steps for pinillalist

1. Write a throwaway Node script that logs in with `anylist`, calls `_getUserData(true)`, and writes the whole decoded `PBUserDataResponse` to a JSON file. Download recipe photos from `photoUrls` in the same run.
2. Look at a few real recipes in that file to confirm how `quantity` strings look and what unit `prepTime` uses.
3. Build the pinillalist importer against that JSON file, so AnyList is only contacted once.
