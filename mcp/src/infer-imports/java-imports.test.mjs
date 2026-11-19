import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { inferImports } from '../infer-imports.mjs';
import { parseJvmSource } from './java-imports.mjs';
import { withRepo } from './repo-fixture.mjs';

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
      [`${MAIN}/model/Position.java`, `${MAIN}/helper/Units.java`, `${MAIN}/session`],
      'a nested type names its outer file once, a static import its type, a wildcard its folder; the commented and quoted Device and the same-package Codec give none',
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

test('a type file that is a link out of the repository stays external', () => {
  const outside = withRepo((r) => write(r, 'Secret.java', 'package org.fleet.model;\npublic class Secret {}\n'));
  const root = withRepo((r) => {
    write(r, `${MAIN}/protocol/Decoder.java`, 'package org.fleet.protocol;\nimport org.fleet.model.Secret;\npublic class Decoder {}\n');
    mkdirSync(join(r, MAIN, 'model'), { recursive: true });
    symlinkSync(join(outside, 'Secret.java'), join(r, MAIN, 'model', 'Secret.java'));
  });
  try {
    const result = inferImports(root);
    assert.deepEqual(result.edges, []);
    assert.deepEqual(result.externalImports.map((row) => row.spec), ['org.fleet.model.Secret']);
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
  ];
  // A warm-up run, then the median of five, so one scheduling or collection pause on a busy machine decides nothing.
  const timed = (path, text) => {
    parseJvmSource(text, path);
    const runs = [0, 1, 2, 3, 4].map(() => {
      const started = performance.now();
      parseJvmSource(text, path);
      return performance.now() - started;
    });
    return runs.sort((a, b) => a - b)[2];
  };
  for (const [language, unit] of shapes) {
    const path = language === 'Kotlin' ? 'A.kt' : 'A.java';
    const text = (bytes) => `package p;\n${unit.repeat(Math.floor(bytes / unit.length))}`;
    const single = timed(path, text(256 * 1024));
    const double = timed(path, text(512 * 1024));
    assert.ok(double < 3 * single + 50, `${language} ${JSON.stringify(unit)}: ${single.toFixed(0)} ms at 256 KB, ${double.toFixed(0)} ms at 512 KB`);
  }
});
