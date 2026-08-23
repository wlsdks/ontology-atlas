---
uid: bdecb4b7-0463-4378-ab15-7ee12da0593e
slug: domains/inventory
kind: domain
title: Inventory
display_ko: 재고
display_en: Inventory
description: "This area owns the question \"how many do we actually have, and how many of those must already count as sold?\". The count on the shelf and the count you can sell are different numbers: an item ordered a minute ago must count as sold even though it is still sitting there, and mixing the two means selling goods that do not exist."
capabilities: [capabilities/restock-alert, capabilities/stock-receiving, capabilities/stock-reservation, capabilities/stock-tracking]
elements: [elements/backorder-queue, elements/purchase-order, elements/restock-subscription, elements/shelf-location, elements/stock-adjustment, elements/stock-count-sheet, elements/stock-hold, elements/stock-ledger, elements/stock-snapshot, elements/supplier-lead-time]
relates: [domains/fulfillment]
---

# Inventory

This area owns the question "how many do we actually have, and how many of those must already count as sold?". The count on the shelf and the count you can sell are different numbers: an item ordered a minute ago must count as sold even though it is still sitting there, and mixing the two means selling goods that do not exist.

The flow has four steps: goods arrive from suppliers and receiving raises the count, stock tracking watches that number continuously, the moment an order comes in a reservation sets that quantity aside, and when a product runs out the restock alert tells the customers who were waiting.

On the map this area has the opposite shape: four things it does, ten things it keeps. Stock looks like "one number" but is really a ledger, physical counts, adjustments and snapshots kept separately, and the moment those four disagree is what a stock incident is. What grows here is not features but things that must be kept distinct.

The most common incident is overselling: two shoppers buying the last item at almost the same moment. It is guaranteed whenever reservation lags behind tracking, so of the four steps, reservation has to be exact first. The boundary: how a sold-out product is shown on screen belongs to the catalog area, physically taking goods off the shelf belongs to fulfillment, and this area guards only the truth of the numbers.
