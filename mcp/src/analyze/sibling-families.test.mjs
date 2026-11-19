import assert from 'node:assert/strict';
import { test } from 'node:test';

import { siblingFamilies } from './sibling-families.mjs';

const file = (path) => ({ path });
const declared = (name, path, kind = 'class') => [name, [{ name, path, line: 7, kind }]];

function folderOf(folder, stems, extension = '.py') {
  return stems.map((stem) => file(`${folder}/${stem}${extension}`));
}

test('a folder whose files each declare the operation they are named after is one family', () => {
  const files = [
    ...folderOf('shop/mutations', ['order_cancel', 'order_capture', 'order_confirm', 'order_refund', 'order_void', 'utils', '__init__']),
  ];
  const index = new Map([
    declared('OrderCancel', 'shop/mutations/order_cancel.py'),
    declared('OrderCapture', 'shop/mutations/order_capture.py'),
    declared('OrderConfirm', 'shop/mutations/order_confirm.py'),
    declared('OrderRefund', 'shop/mutations/order_refund.py'),
    declared('OrderVoid', 'shop/mutations/order_void.py'),
    declared('clean_lines', 'shop/mutations/utils.py', 'function'),
  ]);
  assert.deepEqual(siblingFamilies(files, index, 5), [{
    kind: 'family',
    name: 'shop/mutations',
    path: 'shop/mutations',
    evidence: 'shop/mutations/order_cancel.py:L7',
    members: ['OrderCancel', 'OrderCapture', 'OrderConfirm', 'OrderRefund', 'OrderVoid'],
  }]);
});

test('a folder where most files hold other declarations is not a family', () => {
  const stems = ['a_loader', 'b_loader', 'c_loader', 'd_loader', 'e_loader', 'f', 'g', 'h', 'i', 'j', 'k'];
  const files = folderOf('shop/loaders', stems);
  const index = new Map(stems.slice(0, 5).map((stem) => declared(stem.replace(/(^|_)(\w)/g, (_, __, c) => c.toUpperCase()), `shop/loaders/${stem}.py`)));
  assert.deepEqual(siblingFamilies(files, index, 5), []);
});

test('fewer members than the family size, a constant named after its file, and a type-per-file language make no family', () => {
  const small = folderOf('shop/tasks', ['send_mail', 'sync_stock']);
  const constants = folderOf('shop/limits', ['one', 'two', 'three', 'four', 'five']);
  const jvm = folderOf('shop/model', ['Order', 'Line', 'Stock', 'Price', 'Tax'], '.java');
  const index = new Map([
    declared('send_mail', 'shop/tasks/send_mail.py', 'function'),
    declared('sync_stock', 'shop/tasks/sync_stock.py', 'function'),
    ...['one', 'two', 'three', 'four', 'five'].map((stem) => declared(stem, `shop/limits/${stem}.py`, 'constant')),
    ...['Order', 'Line', 'Stock', 'Price', 'Tax'].map((stem) => declared(stem, `shop/model/${stem}.java`)),
  ]);
  assert.deepEqual(siblingFamilies([...small, ...constants, ...jvm], index, 5), []);
});
