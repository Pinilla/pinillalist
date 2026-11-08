# How to fill Walmart and Amazon carts from a list of products

Research for [issue #2](https://github.com/Pinilla/pinillalist/issues/2), part of the [v1 spec map](https://github.com/Pinilla/pinillalist/issues/1). Checked on 2026-11-08.

## Question

Given a list of exact products with quantities, how can pinillalist put them into the household's Walmart cart and Amazon cart? The person checks out on the store's own site.

## Answer

Both stores still have a public add-to-cart link that takes many products and quantities in one URL. pinillalist can build that link on the server and show it as a button. The person taps it on their phone, signs in if needed, and the store puts the items in their own cart. No API key, affiliate account or stored store password is needed, and this is the only route that clearly fits both stores' terms.

| Store | Recommended route | Link format |
|---|---|---|
| Walmart | Walmart's documented Add To Cart Service | `https://www.walmart.com/sc/cart/addToCart?items=ITEMID_QTY,ITEMID_QTY&storeId=STORE` |
| Amazon | Amazon's Add to Cart form, sent as a GET link, with no Associate tag | `https://www.amazon.com/gp/aws/cart/add.html?ASIN.1=ASIN&Quantity.1=QTY&ASIN.2=...` |

Keep the fallback from the map: a direct link to each product page, for items whose link fails.

## Routes compared

| Route | Works today | Needs | Fragility | Fits the terms |
|---|---|---|---|---|
| Walmart add-to-cart link | Yes, documented by Walmart | Walmart item IDs. Nothing else. | Low to medium. Walmart moved it once and the old URL still redirects. | Yes. Walmart publishes it for third parties. |
| Amazon Add to Cart form link | Yes, the endpoint answers. Documentation is gone. | ASINs. The person signs in to Amazon. | Medium. It is a leftover of the retired PA-API docs. | Yes, if no Associate tag is used. |
| Walmart Commerce API (account linking) | Yes, for approved partners | Walmart I/O keys, partner approval, "a qualifying business case" | Low once approved, but approval is unlikely for a household app | Yes, for approved partners |
| Amazon official API | No cart operation exists | Not applicable | Not applicable | Not applicable |
| Alexa Shopping List | No. Amazon shut off third-party list access on 2024-07-01. | Not applicable | Not applicable | Not applicable |
| Walmart Agent Gateway (MCP) | Invite-only beta | An invitation | Unknown | Yes, for invited agents |
| Browser automation on server1 | Technically possible | Store login, 2FA, a headless browser, session upkeep | High. Both stores run bot detection. | Only with strict self-identification. Amazon can ask an agent to stop and blocks unauthorized agents. |
| Browser extension | Technically possible on desktop, hard on phones | A custom extension per browser | High. Depends on each store's page markup. | Same agent rules as automation. |
| Share-A-Cart and similar third-party extensions | Yes | Their extension on a desktop browser | Medium | Third-party product, outside pinillalist |

## Walmart

### Add To Cart Service link (recommended)

Walmart I/O documents a URL that adds items to the shopper's Walmart cart. The docs page is a single-page app, and the raw Markdown it loads is at [walmart.io/apidocs/atc/add-to-cart](https://walmart.io/apidocs/atc/add-to-cart). The human-facing page is [walmart.io/docs/atc/v1/add-to-cart](https://walmart.io/docs/atc/v1/add-to-cart). It says:

- "The AddToCart proxy service provides the integration for third party partners to be able to add items to Walmart cart."
- "This service is available to partners/publishers whether they are onboarded to Impact Radius or not." So no affiliate account is needed.
- The endpoint is `https://www.walmart.com/sc/cart/addToCart`.
- `items` is a comma-separated list of item ID plus `_` or `|` plus quantity. A quantity of 1 can be just the item ID. Example from the docs: `https://www.walmart.com/sc/cart/addToCart?items=945193065,660768274_2`.
- `offers` takes offer IDs the same way, for a specific seller's offer.
- `storeId` and `ap` (access point ID) are optional. Both come from the Affiliate store locator API. `storeId` matters for groceries, which depend on the pickup or delivery store.
- "If any items from request is not added to Walmart cart, an error message modal will be shown and customer will be taken to home page of Walmart site." One bad item ID spoils the visible result, so pinillalist should only put items with a known numeric item ID in the link.

The docs give no limit on how many items one link can carry. A weekly order of 30 to 50 items with 9 to 10 digit IDs makes a URL of about 400 to 600 characters, well inside normal URL limits.

What I tested. `curl` to the old affiliate URL `https://affil.walmart.com/cart/addToCart?items=...` returns `307` to `https://www.walmart.com/affil/cart/addToCart?items=...`, so the old format still forwards. `curl` to `www.walmart.com/sc/cart/addToCart` is sent to `www.walmart.com/blocked`, Walmart's bot check, which is expected for a non-browser client. I did not try to get past it. The link has to be tested once in a real phone browser.

Fragility. Walmart has already replaced the URL once (from `affil.walmart.com/cart/addToCart` to `www.walmart.com/sc/cart/addToCart`) and kept a redirect. A developer project noted the same move in October 2026 ([grocery-price-optimizer PR #22](https://github.com/bbernhardt15/grocery-price-optimizer/pull/22)). Because it is a documented partner service, a change is likely to come with new docs rather than a silent break.

Item IDs. The service takes Walmart item IDs. The number at the end of a product URL such as `walmart.com/ip/<name>/<id>` appears to be that ID. The docs examples use IDs of that shape, but this should be confirmed with one real product. How pinillalist gets and stores IDs belongs to the product lookup research.

### Commerce API with account linking

Walmart I/O also documents a server-side add-to-cart for linked accounts: `POST /api-proxy/service/affiliate/checkout-api/v4/al/add-to-cart` with a body of `{"items":[{"itemId": "...", "quantity": n}]}` ([docs](https://walmart.io/apidocs/checkout/account-linking-shipping-add-to-cart), [overview](https://walmart.io/apidocs/checkout/account-linking-shipping)). It returns how many of each item were added, which a link cannot do. But the [Commerce API introduction](https://walmart.io/apidocs/checkout/introduction) says "Access to this API requires additional approval and a qualifying business case." It also needs Walmart I/O keys and request signing. A two-person household app is unlikely to be approved, so this is not a v1 route.

### Agent Gateway and Agentic Access Terms

On 2026-10-21 Walmart announced an MCP-based Agent Gateway, Agent Profiles with spending limits, and new terms for AI agents ([Unite.AI coverage](https://www.unite.ai/walmart-introduces-agent-profiles-gateway-for-ai-shopping-agents/), [PPC Land](https://ppc.land/walmart-lets-ai-agents-buy-within-customer-set-limits-such-as-50-or-100/)). Coverage quotes the beta page as saying "access is limited, available by invitation only, and may be suspended at any time." pinillalist cannot count on it.

The [Walmart.com Terms of Use](https://www.walmart.com/help/article/walmart-com-terms-of-use/3b75080af40340d6bbd596f116fae5a0) forbid using "any robot, spider, ... or other manual or automatic device" to "place orders, or otherwise interact with the sites" unless authorized under Section 16.L or the [Walmart Agentic Access Terms](https://www.walmart.com/help/article/walmart-agentic-access-terms/d048fc229d7549738d7c05a4317e24d7). Both pages sit behind Walmart's human check, so I could not fetch them directly. The wording here comes from search-engine extracts and from a [reproduction of the Agentic Access Terms](https://ucpchecker.com/blog/walmart-agentic-access-terms-ai-agents) (October 21, 2026 version). According to that reproduction, the terms count "browser-automation tools" as agents, require agents to identify themselves and not "defeat checks that tell people from software," and say that outside the Agent Gateway agents "may not check out autonomously." Read the live pages before building anything automated against Walmart.

## Amazon

### Add to Cart form link (recommended)

Amazon's Product Advertising API docs described an "Add to Cart form": send `ASIN.n` and `Quantity.n` pairs to `https://www.amazon.com/gp/aws/cart/add.html`, numbering the pairs 1, 2, 3 and so on. The old docs page (`webservices.amazon.com/paapi5/documentation/add-to-cart-form.html`) now redirects to the [PA-API 5 deprecation notice](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/paapiv5-deprecation). A copy of the older version is still on Amazon's image host ([AddToCartForm.html](https://images-na.ssl-images-amazon.com/images/G/09/associates/paapi/dg/AddToCartForm.html)).

The endpoint itself still answers. I tested it today:

```
GET https://www.amazon.com/gp/aws/cart/add.html?ASIN.1=B07FZ8S74R&Quantity.1=2&ASIN.2=B0BSHF7WHW&Quantity.2=1
-> 302 to https://www.amazon.com/ap/signin?...&openid.return_to=https://www.amazon.com/associates/addtocart?ASIN.1=B07FZ8S74R&Quantity.1=2&ASIN.2=B0BSHF7WHW&Quantity.2=1&openid.assoc_handle=amzn_associates_add_to_cart_us...
```

Amazon forwards the request to a sign-in page, then to `/associates/addtocart` with the items intact. The same happens with no `AssociateTag`, so the tag is optional. A `HEAD` request returns `405`, so the link must be opened as a normal GET. I did not sign in, so I have not seen the final page. A developer project from November 2026 says Amazon shows a confirmation step before adding the items ([meali2picnic PR #2](https://github.com/kwzwk/meali2picnic/pull/2)), but its author did not test against the live site either. The owner should open one link on a signed-in phone to confirm.

Do not add the household's own Associate tag. The [Associates Program Policies](https://affiliate-program.amazon.com/help/operating/policies) say "You will not directly or indirectly purchase any Product(s) ... through Special Links, whether for your use or for the use of any other person or entity." A plain link with no tag is just an Amazon URL that the account owner opens.

Fragility. This is the weakest point of the plan. Amazon no longer documents the form, and its API docs have moved to the Creators API. Amazon could remove the endpoint without notice. If it breaks, pinillalist falls back to one product link per item.

### Official APIs

There is no Amazon API that writes to a shopper's cart. PA-API 5 was retired in 2026 and now answers with HTTP 403 `AccessDeniedException` ([deprecation notice](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/paapiv5-deprecation)). Its replacement, the [Creators API](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/introduction), has four operations: SearchItems, GetItems, GetVariations and GetBrowseNodes. None of them touch a cart. It also needs "at least 10 qualifying sales within the past 30 days", which a household app will not have.

The [Alexa Shopping List API is gone](https://developer.amazon.com/en-US/docs/alexa/ask-overviews/deprecated-features.html). Since 2024-07-01 "List skills and the List Management REST API to access Alexa lists ... are no longer supported." AnyList lost its Alexa sync at the same time.

### Amazon's terms on automation

The [Amazon Conditions of Use](https://www.amazon.com/gp/help/customer/display.html?nodeId=GLSBYFE9MGKKQXXM) (last updated August 14, 2026) exclude "any use of data mining, robots, or similar data gathering and extraction tools" from the license. A newer "Agents" section defines an agent as "any software or service that takes autonomous or semi-autonomous action on behalf of, or at the instruction of, any person or entity". Agents must:

- put `Agent/[agent name]` in the user agent string of every request,
- not mimic human keystrokes or navigation, and not complete or get around CAPTCHAs,
- stop if Amazon asks them to.

Amazon also says it "may limit, including by technical measures, whether and how any Agent accesses" its services. In practice Amazon is blocking third-party shopping agents. In September 2026 it blocked Meta's Muse agent with a popup saying "Continued access by an unauthorized AI agent violates Amazon's Conditions of Use" ([The Register](https://www.theregister.com/ai-and-ml/2026/09/21/amazon-shows-metas-muse-ai-shopping-agent-the-door/5297777)). In the Perplexity Comet case a district court barred Comet from password-protected parts of Amazon in March 2026, and the Ninth Circuit vacated that injunction in August 2026 ([Retail Insight Network](https://www.retail-insight-network.com/news/us-court-overturns-amazon-injunction-perplexity/), [GeekWire on the March order](https://www.geekwire.com/2026/judge-blocks-perplexitys-ai-bot-from-shopping-on-amazon-in-early-test-of-agentic-commerce/)). The legal question is still open. Amazon's contract terms and technical blocks are not.

## Browser automation on server1

A headless browser (Playwright or similar) on server1, signed in as the household, could search, add items and report exactly what went into the cart. It is the only route that could confirm each item was added. Against that:

- Both stores' terms treat browser automation as an agent. A compliant agent must announce itself in its user agent and must not get around CAPTCHAs. Both stores can and do block self-identified agents.
- Walmart's bot check blocks plain HTTP clients today. Amazon runs CAPTCHAs and sign-in challenges. A compliant agent cannot solve either, so the job fails whenever a check appears.
- server1 would hold long-lived sessions or passwords for both store accounts, plus 2FA handling. That is a security cost for a home server.
- Store page markup changes break the scripts, and the failures show up on Saturday morning.

Not recommended for v1.

## Browser extension

A pinillalist extension could read the list from list.pinillaweb.org and click "Add to cart" on each product page in the person's own signed-in browser. That avoids storing store passwords on the server, but:

- The household uses phones. Chrome on Android does not run extensions. Safari on iOS does, but only as [Safari web extensions](https://developer.apple.com/documentation/safariservices/safari-web-extensions) packaged in an App Store app, which needs an Apple developer account. Firefox for Android runs extensions, but that means switching browsers.
- An extension that acts on the person's instruction fits Amazon's definition of an agent, so the same terms apply.
- It breaks when the stores change their page markup.

The add-to-cart links do the same job with none of these costs. Third-party tools such as [Share-A-Cart](https://share-a-cart.com/supported/walmart) exist, but they are desktop extensions run by someone else and add nothing over the links.

## Recommendation for the spec

1. Walmart. Store each product's Walmart item ID. Build `https://www.walmart.com/sc/cart/addToCart?items=ID_QTY,...` and add `storeId` for the household's pickup or delivery store if that is known. Leave out items without a numeric item ID and list them separately with their product links, because one bad item makes Walmart show an error.
2. Amazon. Store each product's ASIN. Build `https://www.amazon.com/gp/aws/cart/add.html?ASIN.1=...&Quantity.1=...` with no `AssociateTag`.
3. Show each cart link as one button. Keep a direct product link for every item as the fallback.
4. Treat both links as hand-offs. pinillalist cannot know what actually reached the cart, so it should not mark items as ordered automatically.
5. Unit-test the link builders. A live check against the stores needs a signed-in browser and does not belong in the automated suite.

## Open questions for the owner to check by hand

These need a signed-in phone and take a few minutes:

- Open a two-item Walmart link from the phone. Does it add both items with the right quantities? Does the phone open the Walmart app instead of the browser, and does the app handle the link?
- Open a two-item Amazon link the same way. Is there a confirmation page? Does the Amazon app catch the link?
- Try a Walmart link with about 40 items to check for an unpublished size limit.
- Check that the number in a `walmart.com/ip/.../<id>` URL is the item ID the cart link expects.
