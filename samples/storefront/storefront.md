---
uid: 1beed293-711b-4b51-b8c0-65f51bc4d606
slug: storefront
kind: project
title: Online Store
display_ko: 온라인 쇼핑몰
display_en: Online Store
description: "Not a real company: an example built so that a first-time visitor can learn how to read the map. It draws a small online store that ships physical goods, clothes and household items, out of a single warehouse by parcel carrier: paid by card and one-tap wallets, shipped through three carriers, brought back with coupons and points. A store like any other."
domains: [domains/catalog, domains/customer, domains/fulfillment, domains/inventory, domains/loyalty, domains/marketing, domains/order, domains/payment, domains/risk-review, domains/support]
capabilities: []
elements: []
---

# Online Store

## What it does

Not a real company: an example built so that a first-time visitor can learn how to read the map. It draws a small online store that ships physical goods, clothes and household items, out of a single warehouse by parcel carrier: paid by card and one-tap wallets, shipped through three carriers, brought back with coupons and points. A store like any other.

## How work flows

1. **Browse.** The [[domains/catalog|catalog]] is what a shopper meets first: products, categories, search.
2. **Buy.** [[domains/order|Orders]] and [[domains/payment|payment]] cross the line from looking to owning, with [[domains/inventory|inventory]] guarding the numbers behind them.
3. **Receive.** [[domains/fulfillment|Fulfillment]] gets the parcel out of the warehouse, and [[domains/support|customer support]] catches what goes wrong.
4. **Protect.** [[domains/risk-review|Risk review]] resolves suspicious activity across accounts, orders, and payments after an initial flag.
5. **Come back.** [[domains/customer|Customers]], [[domains/marketing|marketing]] and [[domains/loyalty|loyalty]] are what brings a shopper back for a second order.

Follow one order from cart to refund and you can see how all ten areas connect.

## Where it is uneven

- [[domains/loyalty|Loyalty]] names more abilities than implementation roles: the flow still needs evidence.
- [[domains/inventory|Inventory]] holds many distinct records behind fewer abilities.
- [[domains/risk-review|Risk review]] is narrower still: one case-resolution ability needs five separate records and decisions.
- Real maps always look like this, sparse in one place and dense in another. The unevenness is what tells you where to look next.

## Where to look next

- [[domains/order|Orders]] touch more areas than anything else on the map: one state change moves stock, payment, delivery and points at once.
- Partial cancellation is the hardest rule here: the shipping fee, the coupon's minimum amount and points already earned all land at the same moment.
