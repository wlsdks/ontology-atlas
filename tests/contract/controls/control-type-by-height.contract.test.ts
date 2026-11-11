import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { TYPE_RAMP_STEPS } from '@/shared/lib/cn';
import { controlClass, fieldClass, type ControlShape, type ControlSize, type FieldSize } from '@/shared/ui/control-class';
import { buttonVariants } from '@/shared/ui/controls/button';
import { SELECT_SIZE_CLASS } from '@/shared/ui/fields/select';
import { readGlobalCss } from '../../../scripts/lib/design/global-css.mjs';
import { classNameOf, readClassSource, stringsOf, type ClassSource } from '../lib/jsx-class-source';

/**
 * A control's height picks its type: `label` at 24px, `body` from 28 to 36, `body-lg` from 40.
 * The value layer owns the pair, so a call site names a type step only beside a height it sets
 * by hand, and then names that height's step (`docs/DESIGN-SYSTEM.md`, "Type follows height").
 */

type TypeStep = (typeof TYPE_RAMP_STEPS)[number];

const LADDER_MIN_PX = 24;
const LADDER_MAX_PX = 44;

function typeForHeight(px: number): TypeStep {
  if (px < 28) return 'label';
  return px < 40 ? 'body' : 'body-lg';
}

const GLOBALS = readGlobalCss();

function basePx(name: string): number | null {
  const value = new RegExp(`^\\s*${name}:\\s*([^;]+);`, 'm').exec(GLOBALS)?.[1];
  const px = value ? /(\d+(?:\.\d+)?)px/.exec(value) : null;
  return px ? Number(px[1]) : null;
}

const TAILWIND_STEP_PX = 4;
const TYPE_TOKEN = new RegExp(`^text-(${[...TYPE_RAMP_STEPS].sort((a, b) => b.length - a.length).join('|')})$`);

type HandHeight = { px: number | null; exact: boolean };

/** Unprefixed tokens only: a responsive or state variant is not the control's resting size. */
function readSize(classes: string[]): { types: TypeStep[]; heights: HandHeight[] } {
  const types: TypeStep[] = [];
  const heights: HandHeight[] = [];
  for (const token of classes.join(' ').split(/\s+/)) {
    const type = TYPE_TOKEN.exec(token);
    if (type) types.push(type[1] as TypeStep);
    const height = /^(min-)?h-(?:(\d+(?:\.\d+)?)|\[var\((--[a-z0-9-]+)\)\])$/.exec(token);
    if (!height) continue;
    const px = height[2] ? Number(height[2]) * TAILWIND_STEP_PX : basePx(height[3]);
    heights.push({ px, exact: !height[1] });
  }
  return { types, heights };
}

function layerPair(cls: string): { px: number | null; type: TypeStep | undefined } {
  const { types, heights } = readSize([cls]);
  return { px: heights[0]?.px ?? null, type: types[0] };
}

const TYPED_SHAPES: ControlShape[] = ['chip', 'pill', 'row', 'card', 'segment'];
const SIZES: ControlSize[] = ['xs', 'sm', 'md', 'lg'];
const FIELD_SIZES: FieldSize[] = ['xs', 'sm', 'md', 'lg'];

const LAYER: Array<[string, string]> = [
  ...TYPED_SHAPES.flatMap((shape) =>
    SIZES.map((size): [string, string] => [`controlClass ${shape}/${size}`, controlClass({ shape, size })]),
  ),
  ...FIELD_SIZES.flatMap((size) =>
    [false, true].map((multiline): [string, string] => [
      `fieldClass boxed/${size}/multiline=${multiline}`,
      fieldClass({ frame: 'boxed', size, multiline }),
    ]),
  ),
  ...(['sm', 'md', 'lg'] as const).map((size): [string, string] => [`Button ${size}`, buttonVariants({ size })]),
  ...(['sm', 'md', 'lg'] as const).map((size): [string, string] => [`Select ${size}`, SELECT_SIZE_CLASS[size]]),
];

describe('the value layer pairs every height with its type', () => {
  it('reads a height and a type from every typed step', () => {
    expect(LAYER.length).toBe(TYPED_SHAPES.length * SIZES.length + FIELD_SIZES.length * 2 + 6);
    for (const [name, cls] of LAYER) {
      const { px, type } = layerPair(cls);
      expect(px, `${name} names no readable height: ${cls}`).not.toBeNull();
      expect(type, `${name} names no type step: ${cls}`).toBeDefined();
    }
  });

  it.each(LAYER)('%s wears the type of its height', (_name, cls) => {
    const { px, type } = layerPair(cls);
    expect(type, cls).toBe(typeForHeight(px as number));
  });
});

/** A site that may keep one hand step, and why; any other step in the file is still an offence. */
const HAND_TYPE_EXCEPTIONS: Array<{ file: string; type: TypeStep; reason: string }> = [
  {
    file: 'src/views/library/ui/parts/rounds/NewRoundSheet.tsx',
    type: 'title',
    reason: 'the round title renames in place, so the control is the heading',
  },
];

const JSX_PRIMITIVES = new Set(['Button', 'Chip', 'Input', 'Select', 'Textarea']);

type Site = { file: string; line: number; label: string; classes: string[]; layerType: TypeStep | undefined };

function literal(node: ts.Expression | undefined): string | undefined {
  return node && ts.isStringLiteralLike(node) ? node.text : undefined;
}

function property(object: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined {
  const found = object.properties.find(
    (entry): entry is ts.PropertyAssignment =>
      ts.isPropertyAssignment(entry) && ts.isIdentifier(entry.name) && entry.name.text === name,
  );
  return found?.initializer;
}

function jsxString(element: ts.JsxOpeningLikeElement, name: string): string | undefined {
  const attribute = element.attributes.properties.find(
    (entry): entry is ts.JsxAttribute => ts.isJsxAttribute(entry) && entry.name.getText() === name,
  );
  const value = attribute?.initializer;
  if (value && ts.isStringLiteral(value)) return value.text;
  return value && ts.isJsxExpression(value) ? literal(value.expression) : undefined;
}

function callLayerType(callee: string, options: ts.ObjectLiteralExpression): TypeStep | undefined {
  const sizeNode = property(options, 'size');
  const size = literal(sizeNode) ?? (sizeNode ? undefined : 'md');
  if (!size) return undefined;
  if (callee === 'fieldClass') return layerPair(fieldClass({ size: size as FieldSize })).type;
  const shapeNode = property(options, 'shape');
  const shape = literal(shapeNode) ?? (shapeNode ? undefined : 'chip');
  return shape ? layerPair(controlClass({ shape: shape as ControlShape, size: size as ControlSize })).type : undefined;
}

function isTypedCall(callee: string, source: ClassSource, options: ts.ObjectLiteralExpression): boolean {
  if (callee === 'fieldClass') return literal(property(options, 'frame')) !== 'bare';
  const shapeNode = property(options, 'shape');
  const shapes = shapeNode ? stringsOf(source, shapeNode, false) : ['chip'];
  return shapes.some((shape) => (TYPED_SHAPES as string[]).includes(shape));
}

function readSites(file: string): Site[] {
  const resolved = readClassSource(file, readFileSync(file, 'utf8'));
  const sites: Site[] = [];
  const line = (node: ts.Node) => resolved.source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const callee = node.expression.text;
      const options = node.arguments[0];
      if ((callee === 'controlClass' || callee === 'fieldClass') && options && ts.isObjectLiteralExpression(options)) {
        const className = property(options, 'className');
        if (className && isTypedCall(callee, resolved, options)) {
          sites.push({
            file,
            line: line(node),
            label: callee,
            classes: stringsOf(resolved, className),
            layerType: callLayerType(callee, options),
          });
        }
      }
    }
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && JSX_PRIMITIVES.has(node.tagName.getText())) {
      const className = classNameOf(node);
      if (className) {
        const tag = node.tagName.getText();
        const size = jsxString(node, 'size');
        sites.push({
          file,
          line: line(node),
          label: tag,
          classes: stringsOf(resolved, className),
          layerType: tag === 'Button' && (!size || size in SELECT_SIZE_CLASS)
            ? layerPair(buttonVariants({ size: (size ?? 'md') as 'sm' | 'md' | 'lg' })).type
            : undefined,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(resolved.source);
  return sites;
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx$/.test(name) && !/\.(test|stories)\.tsx$/.test(name) ? [path] : [];
  });
}

function onLadder(px: number | null): px is number {
  return px !== null && px >= LADDER_MIN_PX && px <= LADDER_MAX_PX;
}

function isExcepted(site: Site): boolean {
  const { types } = readSize(site.classes);
  return HAND_TYPE_EXCEPTIONS.some(
    (exception) => exception.file === site.file && types.length > 0 && types.every((type) => type === exception.type),
  );
}

function handSizeOffence(site: Pick<Site, 'classes' | 'layerType'>): string | null {
  const { types, heights } = readSize(site.classes);
  const hand = heights.find((height) => height.exact) ?? heights[0];
  if (types.length === 0) {
    if (!hand?.exact || !onLadder(hand.px) || !site.layerType) return null;
    const wanted = typeForHeight(hand.px);
    return wanted === site.layerType ? null : `sets ${hand.px}px by hand but keeps text-${site.layerType}; add text-${wanted}`;
  }
  if (!hand) return `names text-${types.join(', text-')} without a hand height; the value layer owns the type`;
  if (!onLadder(hand.px)) return `names text-${types.join(', text-')} beside a height off the 24 to 44 ladder`;
  const wanted = typeForHeight(hand.px);
  return types.every((type) => type === wanted) ? null : `sets ${hand.px}px with text-${types.join(', text-')}; that height wears text-${wanted}`;
}

describe('a call site names a type step only for a height it sets by hand', () => {
  const sites = sourceFiles('src').flatMap(readSites);

  it('reads the call sites of the typed primitives', () => {
    // Measured 564 sites; the floor only proves the scan is not idle.
    expect(sites.length).toBeGreaterThan(400);
    expect(new Set(sites.map((site) => site.label))).toEqual(
      new Set(['controlClass', 'fieldClass', 'Button', 'Chip', 'Input', 'Select', 'Textarea']),
    );
  });

  it('judges a hand type and a hand height by the rule', () => {
    const layerType = 'body' as const;
    expect(handSizeOffence({ classes: ['w-full justify-center'], layerType })).toBeNull();
    expect(handSizeOffence({ classes: ['h-10 text-body-lg'], layerType })).toBeNull();
    expect(handSizeOffence({ classes: ['sm:text-label max-[769px]:min-h-11'], layerType })).toBeNull();
    expect(handSizeOffence({ classes: ['min-h-14'], layerType })).toBeNull();
    expect(handSizeOffence({ classes: ['text-label'], layerType })).toMatch(/without a hand height/);
    expect(handSizeOffence({ classes: ['min-h-8', 'text-label'], layerType })).toMatch(/wears text-body/);
    expect(handSizeOffence({ classes: ['h-[var(--control-h-lg)] text-body'], layerType })).toMatch(/wears text-body-lg/);
    expect(handSizeOffence({ classes: ['h-10 justify-center'], layerType })).toMatch(/add text-body-lg/);
    expect(handSizeOffence({ classes: ['min-h-14 text-body'], layerType })).toMatch(/off the 24 to 44 ladder/);
  });

  it('finds no call site whose hand size breaks the rule', () => {
    const offenders = sites
      .filter((site) => !isExcepted(site))
      .flatMap((site) => {
        const offence = handSizeOffence(site);
        return offence ? [`${site.file}:${site.line} ${site.label} ${offence}`] : [];
      });
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('keeps every exception live', () => {
    for (const { file, type } of HAND_TYPE_EXCEPTIONS) {
      const live = sites.some((site) => site.file === file && isExcepted(site) && handSizeOffence(site) !== null);
      expect(live, `${file} no longer names text-${type} on a typed control`).toBe(true);
    }
  });
});
