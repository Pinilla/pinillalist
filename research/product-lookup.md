# Looking up a product from a Walmart or Amazon link

Research for [issue #4](https://github.com/Pinilla/pinillalist/issues/4). Checked on 2026-11-08.

## Question

Given a Walmart or Amazon product link (or an ID), how can pinillalist get the product's ID, name, size, picture and price, so that linking a grocery to a product takes one paste? Which ID does each store's add-to-cart mechanism need?

## Short answer

- **Walmart.** Parse the item ID (usItemId) from the link, then call the Walmart Affiliate Product Lookup API. It returns name, size, images, sale price, UPC and offer ID. Signing up needs only a walmart.com login and an uploaded RSA public key. An Impact publisher ID is optional for lookups. Fetching walmart.com pages directly from server1 hit a bot wall, and Walmart's terms forbid scraping.
- **Amazon.** Parse the ASIN from the link. The official API (the Creators API, which replaced PA-API 5) gives name, size, images and price, but only to Amazon Associates with at least 10 qualifying sales in the past 30 days. One household will not meet that. The fallback is reading the product page HTML, which answered a plain request from server1 but has no JSON-LD or Open Graph tags, and which Amazon's Conditions of Use forbid for automated tools.
- **Cart IDs.** Walmart's add-to-cart URL takes the item ID (or an offer ID), not the UPC. Amazon's add-to-cart form takes the ASIN (or an OfferListingId).

## Walmart

### Getting the ID from a link

Walmart product URLs have the form `https://www.walmart.com/ip/<slug>/<itemId>`, and `https://www.walmart.com/ip/<itemId>` also works. The trailing number is the item ID that the Affiliate API calls `itemId` and the site calls usItemId. The Affiliate API sample response builds the product URL the same way, `https%3A%2F%2Fwww.walmart.com%2Fip%2F54518466` inside `productTrackingUrl` ([Product Lookup docs](https://walmart.io/docs/affiliates/v1/product-lookup)).

I could not confirm the format of links shared from the Walmart phone app from any first-party source. Third-party pages say the app's share button gives the full `/ip/` URL, and one userscript claims Walmart removed the share button from its app and mobile web pages ([greasyfork](https://greasyfork.org/scripts/590085-walmart-mobile-share-button)). Test this on the household's phones. If the app shares a short link, the server can follow its redirect and parse the final `/ip/` URL.

### Affiliate Product Lookup API

Source: [walmart.io Product Lookup](https://walmart.io/docs/affiliates/v1/product-lookup). The docs page renders with JavaScript. Its Markdown source is at `https://walmart.io/apidocs/affiliates/product-lookup`.

- Endpoint: `GET https://developer.api.walmart.com/api-proxy/service/affil/product/v2/items/{itemId}` or `.../items?ids=a,b` ("supports upto 20 items in one call"). You can also look up by `upc=` or `gtin=`.
- Query parameters: `publisherId`, `adId` and `campaignId` (Impact IDs) are all listed as optional. `zipCode` is optional: "Price and availability is also dependent on zipCode and storeId. If no zipCode or storeId is passed then default zipCode of San Bruno is being used." `storeId` "needs additional approvals from business team".
- Response fields that pinillalist needs ([Item Response Groups](https://walmart.io/docs/affiliates/v1/item-response-groups)):
  - `itemId`, `parentItemId` (the base item when this one is a size or color variant)
  - `name`, `brandName`
  - `size` ("Size attribute for the item")
  - `salePrice`, `msrp`
  - `thumbnailImage` (100x100), `mediumImage` (180x180), `largeImage` (450x450), `imageEntities`
  - `upc`, `offerId`, `stock` ("Available, Limited Supply, Last few items, Not available")
  - `affiliateAddToCartUrl`, an Impact tracking URL that wraps `affil.walmart.com/cart/addToCart?items=<itemId>`
- The introduction warns: "Several categories are excluded from the API calls... we can not list them here" ([Affiliates introduction](https://walmart.io/apidocs/affiliates/introduction)). Check that grocery items come back before building on this.

### Signing up and authenticating

- [Quickstart](https://walmart.io/apidocs/affiliates/quickstart): log in to walmart.io with a walmart.com account, create an application, upload an RSA public key, and the portal issues a consumer ID.
- [Additional headers](https://walmart.io/apidocs/affiliates/additional-headers): every call sends `WM_CONSUMER.ID`, `WM_CONSUMER.INTIMESTAMP` (epoch ms), `WM_SEC.KEY_VERSION`, and `WM_SEC.AUTH_SIGNATURE`. The signature is SHA256withRSA over those three values signed with the private key. "The TTL of this signature is 180 seconds."
- The lookup docs mark `publisherId` optional, so it looks like a household can use the API without joining the Impact affiliate program. Confirm this with a real call.
- I found no published rate limit for the Affiliate API. The walmart.io docs nav lists an "API Throttling" page, but its source path returned 404. A household doing a few lookups a day is unlikely to hit a limit.

### Add to cart

Source: [walmart.io Add To Cart](https://walmart.io/docs/atc/v1/add-to-cart) (Markdown at `https://walmart.io/apidocs/atc/add-to-cart`).

- URL: `https://www.walmart.com/sc/cart/addToCart?items=<itemId>_<qty>,<itemId>_<qty>`. If the quantity is 1, the item ID alone is enough. A pipe also works as the delimiter.
- `offers=<offerId>_<qty>` adds a specific seller's offer instead. Offer IDs are 32-character hex strings such as `5692EFEFD5F840FFB7F7E5ED3E221502`.
- `storeId` and `ap` (access point ID from the store locator API) pick a store or pickup point.
- "This service is available to partners/publishers whether they are onboarded to Impact Radius or not."
- The docs never use a UPC as a cart key. The `offers` row mentions "upcs", but that looks like a copy error, since every example uses offer IDs.

So pinillalist should store the item ID. It can also store the offer ID if it wants to pin a seller, but offer IDs come from the API and cannot be parsed from a link.

### Reading the page directly

A plain `curl` of `https://www.walmart.com/ip/10450114` from server1 was redirected to `https://www.walmart.com/blocked?...` with the title "Robot or human?" and a PerimeterX captcha (`px-captcha`). I did not try to get around it. The [Walmart.com Terms of Use](https://www.walmart.com/help/article/walmart-com-terms-of-use/3b75080af40340d6bbd596f116fae5a0) say you may not "use any robot, spider, site search/retrieval application or other manual or automatic device ... to retrieve, index, 'scrape,' 'data mine' or otherwise gather any Materials ... without Walmart's express prior written consent." So I could not check whether Walmart pages carry JSON-LD or Open Graph tags. Use the Affiliate API instead.

## Amazon

### Getting the ID from a link

The ASIN is the 10-character code in `/dp/<ASIN>` or `/gp/product/<ASIN>` (the [Creators API GetItems](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/api-reference/operations/get-items) response gives `detailPageURL` in that form). A regex such as `/(?:dp|gp/product|gp/aw/d)/([A-Z0-9]{10})` covers the common forms. Amazon publishes no URL spec, so this pattern comes from observed URLs, not from a document.

Links shared from the Amazon phone app are commonly short `https://a.co/d/<code>` links (not documented by Amazon). These are redirects, so the server sends a request without following redirects and reads the `Location` header, then parses the ASIN from that URL. I had no real share link to test with, and a made-up code returned 404. Test with a link copied from a household phone.

### Creators API (replaces PA-API 5)

- PA-API 5 "has been deprecated and is being replaced by the Creators API". Old calls now get HTTP 403 `AccessDeniedException` ([deprecation notice](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/paapiv5-deprecation)). The old `webservices.amazon.com/paapi5/documentation/` pages now redirect to that notice.
- Eligibility ([introduction](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/introduction)): you must be in the Amazon Associates program for the marketplace and "have at least 10 qualifying sales within the past 30 days".
- Losing access ([API rates](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/concepts/api-rates)): access stops if the account "has not generated qualified referring sales for a consecutive 30-day period". The starting limits are 1 request per second and 8,640 per day, and they grow with shipped revenue. Over-limit calls get HTTP 429.
- Auth: OAuth 2.0 client credentials ([FAQ](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/frequently-asked-questions)).
- `GetItems` takes up to 10 ASINs and a required `partnerTag`. Useful resources are `itemInfo.title`, `images.primary.large`, `offersV2.listings.price` and `itemInfo.productInfo`. `productInfo` has `Size`, `UnitCount`, `Color` and `ItemDimensions` ([item info](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/api-reference/resources/item-info)).

A single household that buys its own groceries through its own links probably cannot reach 10 qualifying sales a month. Plan as if this API is not available.

### Reading the page directly

Two plain `curl` requests to `https://www.amazon.com/dp/B07FZ8S74R` from server1 returned HTTP 200 with the full page (about 1.3 MB). The page had:

- no `application/ld+json` block and no `og:` tags
- `<meta name="title">` and `<meta name="description">`
- `id="productTitle"` with the full title
- `id="landingImage"` with a `data-old-hires` attribute holding a 1000px image URL on `m.media-amazon.com`
- the price in `<span class="a-offscreen">`
- `"asin":"B07FZ8S74R"` in inline JSON

These are internal page structure and can change without notice. Amazon also returns captcha pages to automated clients at times. Amazon's Conditions of Use exclude "any use of data mining, robots, or similar data gathering and extraction tools" from the license to use the site ([Amazon.com Conditions of Use](https://www.amazon.com/gp/help/customer/display.html?nodeId=508088). That page failed to load during this research. The wording comes from the [Amazon-hosted copy](https://digprjsurvey.amazon.com/csad/help/node/GLSBYFE9MGKKQXXM) and the UK version). Size is not in a fixed spot on the page, so pinillalist would have to parse it from the title or ask the user.

### Add to cart

The PA-API 5 "Add to Cart form" sends items to `https://www.amazon.com/gp/aws/cart/add.html` with `ASIN.1=<ASIN>&Quantity.1=<n>&ASIN.2=...`, plus a required `AssociateTag`. An `OfferListingId.n` can replace the ASIN. The page was at [webservices.amazon.com/paapi5/documentation/add-to-cart-form.html](https://webservices.amazon.com/paapi5/documentation/add-to-cart-form.html). It now redirects to the deprecation notice, and the Japanese copy returned 403, so I quote it from search results and the Japanese [legacy guide](https://images-na.ssl-images-amazon.com/images/G/09/associates/paapi/dg/AddToCartForm.html). The Creators API docs do not mention a cart form. Test whether the URL still adds items, and whether it works without an Associate tag, before relying on it. The ASIN is the key either way.

## Summary table

| | Walmart | Amazon |
|---|---|---|
| ID in link | item ID (usItemId), last path segment of `/ip/...` | ASIN after `/dp/` or `/gp/product/` |
| Phone share link | not confirmed, test on device | `a.co/d/...` redirect, read `Location` |
| Official API | Affiliate Product Lookup, free walmart.io key, publisher ID optional | Creators API, needs Associates plus 10 sales per 30 days |
| Size field | `size` | `itemInfo.productInfo.Size`, API only |
| Page metadata | blocked by bot wall from server1 | HTML readable, no JSON-LD or OG |
| Terms on scraping | forbidden | forbidden |
| Cart ID | item ID (`items=`), or offer ID (`offers=`) | ASIN (`ASIN.1=`), or OfferListingId |

## Suggested approach for pinillalist

1. On paste, detect the store by host, follow one redirect for short links, and parse the item ID or ASIN. Store that ID. It is all the cart link needs.
2. For Walmart, call the Affiliate Product Lookup API to fill in name, size, picture and price. Pass the household's ZIP code so the price matches.
3. For Amazon, there is no sanctioned lookup a household can use. Either prefill from the page HTML (best effort, against the terms, may break), or show an edit form where the user types the name and size. If the text pasted from the app share sheet includes the product title, use it to prefill the name.
4. Prices change. If pinillalist shows prices, refresh them from the API on a schedule (Walmart) or treat them as "last seen" (Amazon).

## Open items to test

- Does Product Lookup return grocery items, given the excluded categories?
- Does Product Lookup work with no `publisherId`?
- What does a Walmart app share produce, and what does an Amazon app `a.co` link redirect to?
- Does `amazon.com/gp/aws/cart/add.html` still add items, and does it need an `AssociateTag`?
