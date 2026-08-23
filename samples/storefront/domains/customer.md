---
uid: cf8e7593-9185-4932-a0b9-bfbec7b3e5b7
slug: domains/customer
kind: domain
title: Customers
display_ko: 회원
display_en: Customers
description: "This area owns two questions: is the person at the screen really that member, and what is the store allowed to remember about them until the next visit? Separating the memories that make the next visit easier, like a name, saved addresses and a wishlist, from the memories the store must not keep happens here."
capabilities: [capabilities/account-closure, capabilities/address-book, capabilities/login, capabilities/membership-tier, capabilities/signup, capabilities/wishlist]
elements: [elements/address-record, elements/customer-account, elements/login-session, elements/tier-rule, elements/wishlist-entry]
relates: [domains/marketing, domains/order]
---

# Customers

This area owns two questions: is the person at the screen really that member, and what is the store allowed to remember about them until the next visit? Separating the memories that make the next visit easier, like a name, saved addresses and a wishlist, from the memories the store must not keep happens here.

The flow follows a member's life with the store: sign-up first, login to prove it is really them, favourite delivery addresses kept in the address book, things they want kept on the wishlist, a membership tier earned as purchases add up, and account closure at the end.

Most rules here come down to "may we remember this?". It is a promise, not a technique, so what the store keeps and for how long must be decided before anything else. The boundary follows: order history belongs to the orders area and points to the loyalty area, while this area holds only facts about the person.

Account closure is where that boundary is tested. The customer wants everything erased; the law says order records must stay. So the person and their orders are cut apart and only the orders remain: to say "deleted" the store must really delete, and what must be kept must not be attached to a person.
