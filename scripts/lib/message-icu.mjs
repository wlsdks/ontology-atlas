import { parse, TYPE } from '@formatjs/icu-messageformat-parser';

const VARIANT_LIMIT = 64;

export function flattenMessages(value, prefix = '') {
  if (typeof value === 'string') return [[prefix, value]];
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) =>
    flattenMessages(child, prefix ? `${prefix}.${key}` : key),
  );
}

function parseMessage(text) {
  return parse(text, { requiresOtherClause: false });
}

export function analyzeMessage(text) {
  const plain = new Set();
  const selectors = new Set();
  const tags = new Map();
  const plurals = [];

  const visit = (elements) => {
    for (const element of elements) {
      switch (element.type) {
        case TYPE.argument:
        case TYPE.number:
        case TYPE.date:
        case TYPE.time:
          plain.add(element.value);
          break;
        case TYPE.select:
        case TYPE.plural:
          selectors.add(element.value);
          if (element.type === TYPE.plural) {
            plurals.push({
              arg: element.value,
              ordinal: element.pluralType === 'ordinal',
              branches: Object.keys(element.options),
            });
          }
          for (const option of Object.values(element.options)) visit(option.value);
          break;
        case TYPE.tag:
          tags.set(element.value, (tags.get(element.value) ?? 0) + 1);
          visit(element.children);
          break;
        default:
          break;
      }
    }
  };

  visit(parseMessage(text));
  return { plain, selectors, args: new Set([...plain, ...selectors]), tags, plurals };
}

function variantsOf(elements) {
  let results = [''];
  for (const element of elements) {
    let pieces;
    switch (element.type) {
      case TYPE.literal:
        pieces = [element.value];
        break;
      case TYPE.argument:
      case TYPE.number:
      case TYPE.date:
      case TYPE.time:
        pieces = [`{${element.value}}`];
        break;
      case TYPE.pound:
        pieces = ['{#}'];
        break;
      case TYPE.tag:
        pieces = variantsOf(element.children).map((inner) => `<${element.value}>${inner}</${element.value}>`);
        break;
      case TYPE.select:
      case TYPE.plural:
        pieces = Object.values(element.options).flatMap((option) => variantsOf(option.value));
        break;
      default:
        pieces = [''];
    }
    results = results.flatMap((head) => pieces.map((piece) => head + piece)).slice(0, VARIANT_LIMIT);
  }
  return results;
}

export function visibleVariants(text) {
  return variantsOf(parseMessage(text));
}

export function literalText(text) {
  const collect = (elements) =>
    elements
      .map((element) => {
        if (element.type === TYPE.literal) return element.value;
        if (element.type === TYPE.tag) return collect(element.children);
        if (element.type === TYPE.select || element.type === TYPE.plural) {
          return Object.values(element.options)
            .map((option) => collect(option.value))
            .join(' ');
        }
        return ' ';
      })
      .join('');
  return collect(parseMessage(text));
}

export function sameMultiset(left, right) {
  if (left.size !== right.size) return false;
  for (const [key, count] of left) if (right.get(key) !== count) return false;
  return true;
}
