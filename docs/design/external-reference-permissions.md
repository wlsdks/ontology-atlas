---
title: External design references — permission review
doc_type: design
status: current
area: design-system
---

# External design references — permission review

Checked on 2026-10-09 for the MIT-licensed Atlas repository. This is a first
pass over twelve relevant resources linked from Designeer's
[Inspiration](https://www.designeer.xyz/),
[Components](https://www.designeer.xyz/components), and
[Build](https://www.designeer.xyz/build) pages, not a clearance of the whole
directory or every file in the selected projects.

The [Reference Permission Test](../PRODUCT-DESIGN-OPERATING-SYSTEM.md#reference-permission-test)
remains the design authority: translate a source into an Atlas rule and a
verifier. The directory's [Info page](https://www.designeer.xyz/info) carries
an All Rights Reserved notice; its listings do not license linked works.
Every row below refers to the original publisher's terms, not a directory
badge or GitHub's automatic license label.

## Resources with an explicit reuse license

| Resource and scope checked | Original terms | Use in Atlas |
|---|---|---|
| [web.dev — Keyboard focus](https://web.dev/learn/accessibility/focus/) | The page declares CC BY 4.0 for content and Apache 2.0 for code samples, with exceptions. [Site policy](https://developers.google.com/terms/site-policies) excludes trademarks and can exclude media and external content. | Study logical focus order and visible focus. Reused or adapted prose needs credit, source and license links, and modification disclosure; copied samples need Apache notices. |
| [UI Playbook](https://uiplaybook.dev/) — its linked public repository | [MIT](https://github.com/raunofreiberg/ui-playbook/blob/master/LICENSE). | A useful source for component states and keyboard behavior. Covered code and authored documentation may be adapted with the copyright and license notice retained. Check embedded third-party material separately. |
| [Impeccable](https://impeccable.style/) — public skills and implementation | [Apache 2.0](https://github.com/pbakaus/impeccable/blob/main/LICENSE), confirmed by its [FAQ](https://impeccable.style/faq/). [NOTICE.md](https://github.com/pbakaus/impeccable/blob/main/NOTICE.md) identifies MIT-derived platform references. | Useful for product-specific hierarchy, critique and accessibility questions. If files are imported or adapted, include the license, preserve relevant notices, identify modifications, and carry the applicable NOTICE attributions. Its instructions do not replace Atlas's workflow by being read as research. |
| [shadcn/ui](https://ui.shadcn.com/) — public repository | [MIT](https://github.com/shadcn-ui/ui/blob/main/LICENSE.md). | Covered component code can be reused with notices. Map useful behavior to Atlas's existing primitives; a permissive license does not make another spacing, color or type system appropriate. |
| [Radix Primitives](https://www.radix-ui.com/) — public repository | [MIT](https://github.com/radix-ui/primitives/blob/main/LICENSE). | A candidate for studying focus, dismissal and keyboard contracts. Preserve notices for copied or distributed covered code, and check the exact component and its dependencies before importing it. |
| [Motion](https://motion.dev/) — the public motiondivision/motion repository | [MIT](https://github.com/motiondivision/motion/blob/main/LICENSE.md). | Covered library code may be distributed with notices. The finding is for this repository, not every product or asset on the domain. Atlas's existing motion rules and rendered proof still determine whether a technique fits. |
| [Codrops](https://tympanus.net/codrops/) — downloadable demos | [License page](https://tympanus.net/codrops/licensing/) says demos are MIT unless specifically stated otherwise. Its design freebies prohibit redistribution, republishing or sale of the items or edited parts. Articles have different reuse terms. | A particular demo can be a code candidate after its own license and asset inventory are checked. Do not treat a demo's MIT terms as permission to put design freebies, article translations, fonts or third-party images in the public repository. |

## Restricted or unresolved resources

| Resource | Observed terms | Use in Atlas |
|---|---|---|
| [React Bits](https://reactbits.dev/) | [MIT + Commons Clause](https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md). It permits inclusion in an application, website or product, but forbids selling, sublicensing or redistributing the components themselves, including bundles and ports. | Technique research is a candidate. Hold component copying until the exact public-source distribution has been assessed against the added restriction; do not label it ordinary MIT or pass it on under Atlas's MIT notice alone. |
| [GSAP](https://gsap.com/) | [Standard No Charge license](https://gsap.com/community/standard-license/) permits many interface uses but restricts competing visual animation builders and removal of proprietary notices. It is a custom license, not MIT or Apache 2.0. | Study animation techniques. Adding the engine needs an assessment of its exact version, distribution and product use; free commercial use is not blanket permission to relicense the engine. |
| [Refero Styles](https://styles.refero.design/) | [Terms §§10 and 13](https://doc.refero.design/legal/terms-of-use) permit normal product design from learned insights within the applicable plan. They restrict redistribution, systematic extraction, datasets and AI/ML evaluation uses of Refero content. Third-party rights remain with their owners. | Derive an original hierarchy or interaction rule. Keep reference screenshots, logos and extracted design content out of the public repository; a separately licensed tool does not license the designs it indexes. |
| [Butterick's Practical Typography](https://practicaltypography.com/) | [Legal page](https://practicaltypography.com/legal.html): All Rights Reserved; reproduction needs written permission except qualifying fair use. | Study typography principles and express the Atlas rule in original terms. Do not copy book prose, illustrations or fonts into Atlas on the strength of free web access. |
| [Design System Checklist](https://designsystemchecklist.com/) | Its [README](https://github.com/ardakaracizmeli/design-system-checklist/blob/master/README.md) calls it open source, but the complete public tree inspected at this date contained no license file, and neither README nor [package.json](https://github.com/ardakaracizmeli/design-system-checklist/blob/master/package.json) supplied a license grant. | Read and follow its references as research; copying or translating the checklist remains on hold until a grant covering the exact content is found. Public source availability is insufficient. [GitHub's licensing guidance](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository) explains the default rights when no license is granted. |

## First techniques to use

| Source | Atlas translation | Verifier |
|---|---|---|
| web.dev's focus guidance | The exact Flow request has one named keyboard scroll target; its overflow fade cannot obscure the surrounding focus frame. | `FlowTab.test.tsx` covers the request before and after a saved answer; `insights-flow-scroll.spec.ts` checks Tab, End, the focus frame and exit to the handoff. Actual-window captures confirm the rendered state. |
| UI Playbook's component documentation | Use its state questions when inspecting an existing Atlas button or field, while retaining Atlas's primitives and scale. | A future slice must reproduce the missing or confusing state in the rendered Atlas component before changing it. No component code was imported by this review. |
| Impeccable's critique material | Ask whether the main fact and its supporting evidence belong to this product and whether an observed defect warrants a change. | Use the existing Atlas product/design route and measured render loop. This review installs no skill or detector and claims no Impeccable audit result. |

The Flow fix uses original Atlas code and existing tokens; it imports no
external implementation, artwork or typography assets. Source links record
the influence. If a future change copies covered material, retain the actual
required notices in source and distribution: a link in this research note is
not a replacement for a license copy. See [Apache §4](https://www.apache.org/licenses/LICENSE-2.0)
and [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) for their obligations.
Atlas's root MIT license does not erase a third-party file's conditions.

These findings cover the listed public artifacts and terms at the checked
date. Recheck the exact file, version, nested license, provenance and bundled
assets when selecting anything for reuse. Unexamined entries remain unknown.
