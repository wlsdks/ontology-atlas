import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isDecorativeSemanticLine,
  isExcludedSemanticSection,
  semanticSectionCategory,
  semanticSectionPriority,
} from './semantic-excerpt.mjs';

test('sponsor and table-of-contents sections never feed the excerpt', () => {
  assert.equal(isExcludedSemanticSection('Sponsors'), true);
  assert.equal(isExcludedSemanticSection('## Table of Contents'), true);
  assert.equal(isExcludedSemanticSection('Funding'), true);
  assert.equal(isExcludedSemanticSection('Features'), false);
});

test('badges, bare links and sponsor lines are decoration, prose is not', () => {
  assert.equal(isDecorativeSemanticLine(''), true);
  assert.equal(isDecorativeSemanticLine('[![CI](https://x/ci.svg)](https://x/ci)'), true);
  assert.equal(isDecorativeSemanticLine('https://example.com/docs'), true);
  assert.equal(isDecorativeSemanticLine('- Sponsors: Acme'), true);
  assert.equal(isDecorativeSemanticLine('Checkout lets a shopper pay.'), false);
});

test('a heading is ranked purpose over architecture over ability, and an untitled section is nothing', () => {
  const section = (value, extra = {}) => ({ heading: value ? { value } : null, ...extra });
  assert.equal(semanticSectionCategory(section('Mission')), 'purpose');
  assert.equal(semanticSectionCategory(section('Architecture')), 'architecture');
  assert.equal(semanticSectionCategory(section('Features')), 'ability');
  assert.equal(semanticSectionCategory(section('Changelog')), null);
  assert.equal(semanticSectionCategory(section(null)), 'purpose');
  assert.equal(semanticSectionPriority(section('Mission')), 3);
  assert.equal(semanticSectionPriority(section('Architecture')), 2);
  assert.equal(semanticSectionPriority(section('Features')), 1);
  assert.equal(semanticSectionPriority(section('Changelog')), 0);
});
