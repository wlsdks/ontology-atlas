import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { inferImports } from '../../infer-imports.mjs';
import { classifyJvmImports, parseJvmSource } from './java-imports.mjs';
import { createPathFacts } from '../confinement/path-confinement.mjs';
import { withRepo } from '../repo-fixture.mjs';

function write(root, path, text) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

const MAIN = 'src/main/java/org/fleet';

test('Java imports resolve to the declaring file, the longest type prefix, or the package folder of a wildcard', () => {
  const root = withRepo((r) => {
    write(r, `${MAIN}/model/Position.java`, 'package org.fleet.model;\npublic class Position { public static class Builder {} }\n');
    write(r, `${MAIN}/model/Device.java`, 'package org.fleet.model;\npublic class Device {}\n');
    write(r, `${MAIN}/helper/Units.java`, 'package org.fleet.helper;\npublic final class Units { public static double knots(double v) { return v; } }\n');
    write(r, `${MAIN}/session/Session.java`, 'package org.fleet.session;\npublic class Session {}\n');
    write(r, `${MAIN}/protocol/Codec.java`, 'package org.fleet.protocol;\npublic class Codec {}\n');
    write(r, `${MAIN}/protocol/Decoder.java`, [
      'package org.fleet.protocol;',
      '',
      'import org.fleet.model.Position;',
      'import org.fleet.model.Position.Builder;',
      'import static org.fleet.helper.Units.knots;',
      'import org.fleet.session.*;',
      'import java.util.List;',
      '',
      '// import org.fleet.model.Device;',
      'public class Decoder extends Codec {',
      '  String note = "import org.fleet.model.Device;";',
      '}',
    ].join('\n'));
    write(r, 'src/test/java/org/fleet/protocol/DecoderTest.java', 'package org.fleet.protocol;\nimport org.fleet.model.Device;\nclass DecoderTest {}\n');
  });
  try {
    const result = inferImports(root);
    const decoder = `${MAIN}/protocol/Decoder.java`;
    assert.deepEqual(
      result.edges.filter((edge) => edge.from === decoder).map((edge) => edge.to),
      [`${MAIN}/model/Position.java`, `${MAIN}/helper/Units.java`, `${MAIN}/session`, `${MAIN}/protocol/Codec.java`],
      'a nested type names its outer file once, a static import its type, a wildcard its folder, the same-package Codec its file; the commented and quoted Device give none',
    );
    assert.deepEqual(
      result.externalImports.filter((row) => row.from === decoder),
      [{ from: decoder, spec: 'java.util.List' }],
    );
    const testEdge = result.edges.find((edge) => edge.from.startsWith('src/test/'));
    assert.equal(testEdge?.to, `${MAIN}/model/Device.java`);
    assert.equal(testEdge?.sourceRole, 'test');
    assert.ok(result.coverage.limitations.some((line) => line.startsWith('Java and Kotlin imports are file edges only')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Kotlin imports resolve top-level functions and aliased types, and ignore imports written in strings', () => {
  const root = withRepo((r) => {
    write(r, 'src/main/kotlin/org/fleet/util/Formatting.kt', 'package org.fleet.util\n\nfun formatSpeed(value: Double): String = value.toString()\n');
    write(r, 'src/main/kotlin/org/fleet/model/Models.kt', 'package org.fleet.model\n\ndata class Trip(val id: Long)\n');
    write(r, 'src/main/kotlin/org/fleet/report/TripReport.kt', [
      'package org.fleet.report',
      '',
      'import org.fleet.util.formatSpeed',
      'import org.fleet.model.Trip as Journey',
      '',
      'val sample = """',
      'import org.fleet.model.Ghost',
      '"""',
      '/* import org.fleet.model.Hidden /* nested */ still a comment */',
      'fun render(trip: Journey) = formatSpeed(1.0)',
    ].join('\n'));
  });
  try {
    const result = inferImports(root);
    assert.deepEqual(
      result.edges.filter((edge) => edge.from.endsWith('TripReport.kt')).map((edge) => edge.to),
      ['src/main/kotlin/org/fleet/util/Formatting.kt', 'src/main/kotlin/org/fleet/model/Models.kt'],
    );
    assert.deepEqual(result.externalImports.filter((row) => row.from.endsWith('TripReport.kt')), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Java reaches Kotlin top-level functions through the file facade, a type of the same package needs no import, and nested type arguments and enum classes are declarations', () => {
  const root = withRepo((r) => {
    write(r, 'src/main/kotlin/org/shop/order/Order.kt', 'package org.shop.order\n\ndata class Order(val id: String)\n\nfun Order.isEmpty(): Boolean = id.isEmpty()\n');
    write(r, 'src/main/kotlin/org/shop/order/rules.kt', '@file:JvmName("OrderRules")\npackage org.shop.order\n\nfun validate(order: Order): Boolean = true\n');
    write(r, 'src/main/kotlin/org/shop/order/Plain.kt', 'package org.shop.order\n\nclass Plain\n');
    write(r, 'src/main/java/org/shop/order/Checkout.java', [
      'package org.shop.order;',
      '',
      'import org.shop.billing.Invoice;',
      '',
      'public class Checkout {',
      '  // Ledger is named only in this comment',
      '  boolean ok(Order order) { return OrderRules.validate(order) && !OrderKt.isEmpty(order); }',
      '  Invoice bill() { return new Invoice(); }',
      '  Object raw() { return org.shop.order.Plain.class; }',
      '}',
    ].join('\n'));
    write(r, 'src/main/java/org/shop/order/Ledger.java', 'package org.shop.order;\npublic class Ledger {}\n');
    write(r, 'src/main/java/org/shop/order/Invoice.java', 'package org.shop.order;\npublic class Invoice {}\n');
    write(r, 'src/main/java/org/shop/billing/Invoice.java', 'package org.shop.billing;\npublic class Invoice {}\n');
    write(r, 'src/test/java/org/shop/order/Fixtures.java', 'package org.shop.order;\nclass Fixtures { Checkout checkout = new Checkout(); Ledger ledger; }\n');
    write(r, 'src/test/java/org/shop/order/Ledger.java', 'package org.shop.order;\nclass Ledger {}\n');
    write(r, 'src/main/kotlin/org/shop/order/Storage.kt', 'package org.shop.order\n\ninline fun <reified T : Enum<T>> Map<String, List<T>>.firstOrNone(key: String): T? = null\n\nenum class Mode { ON }\n');
    write(r, 'src/main/java/org/shop/api/Probe.java', 'package org.shop.api;\nimport org.shop.order.OrderKt;\nclass Probe {}\n');
    write(r, 'src/main/kotlin/org/shop/api/Reader.kt', 'package org.shop.api\n\nimport org.shop.order.firstOrNone\nimport org.shop.order.Mode\n');
  });
  try {
    const result = inferImports(root);
    const targets = (from) => result.edges.filter((edge) => edge.from === from).map((edge) => edge.to).sort();
    assert.deepEqual(targets('src/main/java/org/shop/order/Checkout.java'), [
      'src/main/java/org/shop/billing/Invoice.java',
      'src/main/kotlin/org/shop/order/Order.kt',
      'src/main/kotlin/org/shop/order/rules.kt',
    ], 'OrderKt and the JvmName facade name their Kotlin files; the imported Invoice shadows the same-package one; a commented name and a qualified one give none');
    assert.deepEqual(targets('src/test/java/org/shop/order/Fixtures.java'), [
      'src/main/java/org/shop/order/Checkout.java',
      'src/test/java/org/shop/order/Ledger.java',
    ], 'a type declared under both roots resolves to the one beside the file');
    assert.deepEqual(targets('src/main/java/org/shop/api/Probe.java'), ['src/main/kotlin/org/shop/order/Order.kt']);
    assert.deepEqual(targets('src/main/kotlin/org/shop/api/Reader.kt'), ['src/main/kotlin/org/shop/order/Storage.kt'], 'a function with nested type arguments and an enum class are declarations');
    assert.ok(!result.externalImports.some((row) => row.spec.startsWith('org.shop.')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a same-package name the file binds itself, an aliased import, another module and a test twin give no edge', () => {
  const root = withRepo((r) => {
    const core = 'core/src/main/kotlin/org/shop/order';
    write(r, `${core}/Builder.kt`, 'package org.shop.order\n\nclass Builder\n');
    write(r, `${core}/State.kt`, 'package org.shop.order\n\nclass State\n');
    write(r, `${core}/Settings.kt`, 'package org.shop.order\n\nclass Settings\n');
    write(r, `${core}/Money.kt`, 'package org.shop.order\n\nclass Money\n');
    write(r, `${core}/Order.kt`, 'package org.shop.order\n\nclass Order\n');
    write(r, 'core/src/main/java/org/shop/order/Ticket.java', [
      'package org.shop.order;',
      'public class Ticket<State> {',
      '  public static class Builder { Builder self() { return this; } }',
      '  public static <Money> Money cast(Object value) { return null; }',
      '}',
    ].join('\n'));
    write(r, `${core}/Screen.kt`, 'package org.shop.order\n\nenum class Screen(val title: String) { @Deprecated("old") Home("a"), Settings("b") }\n');
    write(r, `${core}/Legacy.kt`, 'package org.shop.order\n\nimport org.shop.legacy.Order as LegacyOrder\nimport org.shop.legacy.OldMoney as Money\n\nfun convert(order: LegacyOrder, total: Money): Order = Order()\n');
    write(r, 'core/src/test/kotlin/org/shop/order/Ledger.kt', 'package org.shop.order\n\nclass Ledger\n');
    write(r, 'core/src/main/kotlin/org/shop/order/Books.kt', 'package org.shop.order\n\nclass Books(val ledger: Ledger)\n');
    write(r, 'core/src/test/kotlin/org/shop/order/BooksTest.kt', 'package org.shop.order\n\nclass BooksTest(val books: Books, val ledger: Ledger)\n');
    write(r, 'billing/src/main/java/org/shop/order/Invoice.java', 'package org.shop.order;\nclass Invoice { Order order; }\n');
  });
  try {
    const result = inferImports(root);
    const targets = (from) => result.edges.filter((edge) => edge.from === from).map((edge) => edge.to).sort();
    const core = 'core/src/main/kotlin/org/shop/order';
    assert.deepEqual(targets('core/src/main/java/org/shop/order/Ticket.java'), [], 'a nested type and type parameters are the file own names');
    assert.deepEqual(targets(`${core}/Screen.kt`), [], 'an enum entry is no type reference');
    assert.deepEqual(targets(`${core}/Legacy.kt`), [`${core}/Order.kt`], 'an alias shadows its own name, so the bare Order is the sibling and Money is the import');
    assert.deepEqual(targets(`${core}/Books.kt`), [], 'main code does not reach a test twin');
    assert.deepEqual(targets('core/src/test/kotlin/org/shop/order/BooksTest.kt'), [`${core}/Books.kt`, 'core/src/test/kotlin/org/shop/order/Ledger.kt']);
    assert.deepEqual(targets('billing/src/main/java/org/shop/order/Invoice.java'), [], 'another module holding the same package is not searched');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a library import is probed only in roots holding its package folder, and confined reads keep every candidate', () => {
  const root = withRepo((r) => {
    for (let index = 0; index < 30; index += 1) write(r, `m${index}/src/main/java/org/shop/m${index}/A.java`, `package org.shop.m${index};\nclass A {}\n`);
    write(r, 'app/src/main/java/org/shop/app/Main.java', `package org.shop.app;\n${Array.from({ length: 40 }, (_, i) => `import androidx.lib${i}.deep.Type${i};`).join('\n')}\nclass Main {}\n`);
  });
  const count = (confined) => {
    const previous = process.env.OATLAS_CONFINED_SOURCE_READS;
    if (confined) process.env.OATLAS_CONFINED_SOURCE_READS = '1';
    const facts = createPathFacts(root);
    let candidates = 0;
    const counting = { ...facts, isOwnFile: (path) => { candidates += 1; return facts.isOwnFile(path); } };
    const roots = Array.from({ length: 31 }, (_, i) => (i < 30 ? `m${i}` : 'app'));
    const parsed = roots.map((module) => {
      const file = module === 'app' ? join(root, 'app/src/main/java/org/shop/app/Main.java') : join(root, `${module}/src/main/java/org/shop/${module}/A.java`);
      return { file, ...parseJvmSource(readFileSync(file, 'utf8'), file) };
    });
    classifyJvmImports(parsed, { rootPath: root, edges: [], externalImports: [], ignore: new Set(), facts: counting });
    if (previous === undefined) delete process.env.OATLAS_CONFINED_SOURCE_READS;
    else process.env.OATLAS_CONFINED_SOURCE_READS = previous;
    return candidates;
  };
  try {
    assert.equal(count(false), 0, 'no root holds an androidx folder, so no type file is asked for');
    assert.equal(count(true), 40 * 3 * 31 * 2, 'a snapshot is asked the same candidate files it always was');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an import deeper than any package is external without a probe', () => {
  const root = withRepo((r) => {
    write(r, 'src/main/java/org/shop/Deep.java', `package org.shop;\nimport ${Array.from({ length: 6000 }, () => 'a').join('.')};\nclass Deep {}\n`);
  });
  try {
    const result = inferImports(root);
    assert.equal(result.externalImports.filter((row) => row.from.endsWith('Deep.java')).length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a type in a module the walk does not reach resolves through that module source root', () => {
  const root = withRepo((r) => {
    write(r, `${MAIN}/server/Server.java`, 'package org.fleet.server;\nimport org.fleet.core.Engine;\npublic class Server {}\n');
    write(r, 'core/src/main/java/org/fleet/core/Engine.java', 'package org.fleet.core;\npublic class Engine {}\n');
  });
  try {
    const result = inferImports(root);
    assert.equal(result.filesScanned, 1, 'only the configured src folder is walked');
    assert.deepEqual(result.edges.map((edge) => edge.to), ['core/src/main/java/org/fleet/core/Engine.java']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a type file or a package folder that is a link out of the repository stays external', () => {
  const outside = withRepo((r) => {
    write(r, 'Secret.java', 'package org.fleet.model;\npublic class Secret {}\n');
    write(r, 'ext/Thing.java', 'package org.fleet.ext;\npublic class Thing {}\n');
  });
  const root = withRepo((r) => {
    write(r, `${MAIN}/protocol/Decoder.java`, 'package org.fleet.protocol;\nimport org.fleet.model.Secret;\nimport org.fleet.ext.Thing;\npublic class Decoder {}\n');
    mkdirSync(join(r, MAIN, 'model'), { recursive: true });
    symlinkSync(join(outside, 'Secret.java'), join(r, MAIN, 'model', 'Secret.java'));
    symlinkSync(join(outside, 'ext'), join(r, MAIN, 'ext'));
  });
  try {
    const result = inferImports(root);
    assert.deepEqual(result.edges, []);
    assert.deepEqual(result.externalImports.map((row) => row.spec), ['org.fleet.model.Secret', 'org.fleet.ext.Thing']);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('doubling a hostile JVM file at most about doubles the time to read its imports', () => {
  const shapes = [
    ['Java', 'import a.b.c.d.e.f.g.h.'],
    ['Java', 'class A '],
    ['Java', '/* '],
    ['Java', '"\n'],
    ['Java', '{('],
    ['Java', 'a'],
    ['Kotlin', 'fun a.b.c.d.e.'],
    ['Kotlin', 'val "${'],
    ['Kotlin', '/* /* '],
    ['Kotlin', 'fun <'],
    ['Kotlin', 'fun a<'],
    ['Kotlin', 'fun <<a>'],
    ['Kotlin', 'val a<<x>'],
    ['Kotlin', 'enum class A { B, '],
    ['Java', 'static <A, '],
  ];
  // Processor time, not wall clock: on a busy machine a run longer than a scheduler slice waits its
  // turn and a shorter one does not, which reads as a worse-than-linear curve. Fastest of seven each.
  const timedPair = (path, small, large) => {
    const once = (text) => {
      const started = process.cpuUsage();
      parseJvmSource(text, path);
      const spent = process.cpuUsage(started);
      return (spent.user + spent.system) / 1000;
    };
    once(small);
    once(large);
    let single = Infinity;
    let double = Infinity;
    for (let run = 0; run < 7; run += 1) {
      single = Math.min(single, once(small));
      double = Math.min(double, once(large));
    }
    return { single, double };
  };
  for (const [language, unit] of shapes) {
    const path = language === 'Kotlin' ? 'A.kt' : 'A.java';
    const text = (bytes) => `package p;\n${unit.repeat(Math.floor(bytes / unit.length))}`;
    const { single, double } = timedPair(path, text(256 * 1024), text(512 * 1024));
    assert.ok(double < 3 * single + 50, `${language} ${JSON.stringify(unit)}: ${single.toFixed(0)} ms at 256 KB, ${double.toFixed(0)} ms at 512 KB`);
  }
});
