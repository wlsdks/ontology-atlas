import assert from 'node:assert/strict';
import test from 'node:test';

import { jvmAbilities } from './jvm-abilities.mjs';

const API = 'src/main/java/org/fleet/api';

function abilities(sources) {
  return jvmAbilities(Object.keys(sources).map((path) => ({ path })), (path) => sources[path]);
}

function lineOf(text, needle) {
  return text.split('\n').findIndex((line) => line.includes(needle)) + 1;
}

const BASE_RESOURCE = [
  'package org.fleet.api;',
  'import jakarta.ws.rs.DELETE;',
  'import jakarta.ws.rs.GET;',
  'import jakarta.ws.rs.Path;',
  'public abstract class BaseObjectResource<T> {',
  '    @Path("{id}")',
  '    @GET',
  '    public T getSingle(long id) { return null; }',
  '',
  '    @Path("{id}")',
  '    @DELETE',
  '    public void remove(long id) {}',
  '}',
].join('\n');

const DEVICE_RESOURCE = [
  'package org.fleet.api.resource;',
  '',
  'import jakarta.ws.rs.GET;',
  'import jakarta.ws.rs.POST;',
  'import jakarta.ws.rs.Path;',
  'import org.fleet.api.BaseObjectResource;',
  '',
  '/**',
  ' * @Path("ghost") @GET in a comment is prose.',
  ' */',
  '@Path("devices")',
  'public class DeviceResource extends BaseObjectResource<Device> {',
  '    private static final String NOTE = "@GET @Path(\\"quoted\\")";',
  '',
  '    // @POST',
  '    @GET',
  '    public Object list() { return NOTE; }',
  '',
  '    @Path("{id}/accumulators")',
  '    @POST',
  '    public void accumulators(long id) {}',
  '',
  '    @Path(Routes.IMAGE)',
  '    @POST',
  '    public void image() {}',
  '}',
].join('\n');

const ORDER_CONTROLLER = [
  'package org.fleet.web',
  '',
  'import org.springframework.web.bind.annotation.*',
  '',
  '@RestController',
  '@RequestMapping("/api/orders")',
  'class OrderController(private val orders: Orders) {',
  '    @GetMapping("/{id}")',
  '    fun find(@PathVariable id: Long) = orders.find(id)',
  '',
  '    @PostMapping',
  '    fun create(@RequestBody order: Order) = orders.save(order)',
  '',
  '    @RequestMapping(value = ["/{id}", "/by-id/{id}"], method = [RequestMethod.DELETE])',
  '    fun remove(@PathVariable id: Long) = orders.delete(id)',
  '}',
].join('\n');

test('a resource class is one route row: its routes and those of its repository base, literal paths only', () => {
  const rows = abilities({
    [`${API}/BaseObjectResource.java`]: BASE_RESOURCE,
    [`${API}/resource/DeviceResource.java`]: DEVICE_RESOURCE,
    'src/main/kotlin/org/fleet/web/OrderController.kt': ORDER_CONTROLLER,
  });
  const routes = rows.filter((row) => row.kind === 'route');
  assert.deepEqual(routes, [
    {
      kind: 'route',
      name: 'DeviceResource',
      members: ['GET /devices', 'POST /devices/{id}/accumulators', 'GET /devices/{id}', 'DELETE /devices/{id}'],
      path: `${API}/resource/DeviceResource.java`,
      line: lineOf(DEVICE_RESOURCE, '@Path("devices")'),
      evidence: `${API}/resource/DeviceResource.java:L${lineOf(DEVICE_RESOURCE, '@Path("devices")')}`,
    },
    {
      kind: 'route',
      name: 'OrderController',
      members: ['GET /api/orders/{id}', 'POST /api/orders', 'DELETE /api/orders/{id}', 'DELETE /api/orders/by-id/{id}'],
      path: 'src/main/kotlin/org/fleet/web/OrderController.kt',
      line: lineOf(ORDER_CONTROLLER, '@RequestMapping("/api/orders")'),
      evidence: `src/main/kotlin/org/fleet/web/OrderController.kt:L${lineOf(ORDER_CONTROLLER, '@RequestMapping("/api/orders")')}`,
    },
  ]);
});

test('an HTTP annotation from a client library is no route', () => {
  const retrofit = [
    'package org.fleet.client;',
    'import retrofit2.http.GET;',
    'import retrofit2.http.Path;',
    '@Path("users")',
    'public class UsersClient {',
    '    @GET("users/{id}")',
    '    public Object user() { return null; }',
    '}',
  ].join('\n');
  assert.deepEqual(abilities({ 'src/main/java/org/fleet/client/UsersClient.java': retrofit }), []);
});

test('main methods are executables and scheduled work is a worker, each cited at its line', () => {
  const main = 'package org.fleet;\n\npublic class Main {\n    public static void main(String[] args) {}\n}\n';
  const kotlinMain = 'package org.fleet.tools\n\n// fun main() in a comment\nfun main(args: Array<String>) {}\n';
  const task = [
    'package org.fleet.schedule;',
    'import java.util.concurrent.ScheduledExecutorService;',
    'public interface ScheduleTask extends Runnable {',
    '    void schedule(ScheduledExecutorService executor);',
    '}',
  ].join('\n');
  const purge = [
    'package org.fleet.schedule;',
    'import java.util.concurrent.ScheduledExecutorService;',
    'import java.util.concurrent.TimeUnit;',
    'public class TaskPurge implements ScheduleTask {',
    '    @Override',
    '    public void schedule(ScheduledExecutorService executor) {',
    '        executor.scheduleAtFixedRate(this, 1, 1, TimeUnit.HOURS);',
    '    }',
    '    public void run() {}',
    '}',
  ].join('\n');
  const expire = [
    'package org.fleet.schedule;',
    'import java.util.concurrent.ScheduledExecutorService;',
    'public class TaskExpire implements ScheduleTask {',
    '    public void schedule(ScheduledExecutorService executor) { executor.submit(this); }',
    '    public void run() {}',
    '}',
  ].join('\n');
  const digest = [
    'package org.fleet.mail;',
    'import org.springframework.scheduling.annotation.Scheduled;',
    'public class DigestMailer {',
    '    @Scheduled(cron = "0 0 * * * *")',
    '    public void send() {}',
    '}',
  ].join('\n');
  const rows = abilities({
    'src/main/java/org/fleet/Main.java': main,
    'src/main/kotlin/org/fleet/tools/Migrate.kt': kotlinMain,
    'src/main/java/org/fleet/schedule/ScheduleTask.java': task,
    'src/main/java/org/fleet/schedule/TaskPurge.java': purge,
    'src/main/java/org/fleet/schedule/TaskExpire.java': expire,
    'src/main/java/org/fleet/mail/DigestMailer.java': digest,
  });
  const brief = rows.filter((row) => row.kind !== 'family').map((row) => `${row.kind} ${row.symbol} ${row.evidence}`);
  assert.deepEqual(brief, [
    'executable Main.main src/main/java/org/fleet/Main.java:L4',
    'executable main src/main/kotlin/org/fleet/tools/Migrate.kt:L4',
    'worker TaskPurge.schedule src/main/java/org/fleet/schedule/TaskPurge.java:L7',
    'worker DigestMailer.send src/main/java/org/fleet/mail/DigestMailer.java:L4',
    'worker TaskExpire src/main/java/org/fleet/schedule/TaskExpire.java:L3',
  ]);
});

test('doubling a hostile file at most about doubles the time to read it', () => {
  const shapes = {
    'heads without bodies': 'public class A extends B ',
    'unclosed nesting': 'class A { ',
    'one long word in a body': null,
    'unclosed annotation arguments': '@Path( ',
    'annotations without members': '@GET ',
    'main signatures': 'public static void main(String[] args) ',
    'schedule calls': 'x.scheduleAtFixedRate(a, 1, 1, T); ',
    'nested type arguments': '<',
    'Kotlin functions': '@GetMapping("/a") fun a() = b\n',
  };
  const fileOf = (shape, bytes) => {
    if (shape === null) return `package p;\nimport jakarta.ws.rs.Path;\n@Path("a")\nclass A {\n${'a'.repeat(bytes)}\n}\n`;
    return `package p;\nimport jakarta.ws.rs.*;\n@Path("a")\npublic class Resource extends Base {\n${shape.repeat(Math.floor(bytes / shape.length))}`;
  };
  const timed = (path, text) => {
    const runs = [0, 1, 2].map(() => {
      const started = performance.now();
      abilities({ [path]: text });
      return performance.now() - started;
    });
    return runs.sort((a, b) => a - b)[1];
  };
  for (const [name, shape] of Object.entries(shapes)) {
    const path = name.startsWith('Kotlin') ? 'src/main/kotlin/p/A.kt' : 'src/main/java/p/A.java';
    const single = timed(path, fileOf(shape, 64 * 1024));
    const double = timed(path, fileOf(shape, 128 * 1024));
    assert.ok(double < 3 * single + 30, `${name}: ${single.toFixed(0)} ms at 64 KB, ${double.toFixed(0)} ms at 128 KB`);
  }
});

test('three classes in one folder sharing a resolved supertype are a family; an unresolvable one is in none', () => {
  const decoder = (name, extra = '') => [
    'package org.fleet.protocol;',
    'import org.fleet.BaseDecoder;',
    extra,
    `public class ${name} extends BaseDecoder {}`,
  ].join('\n');
  const rows = abilities({
    'src/main/java/org/fleet/BaseDecoder.java': 'package org.fleet;\npublic abstract class BaseDecoder {}\n',
    'src/main/java/org/fleet/protocol/AisDecoder.java': decoder('AisDecoder'),
    'src/main/java/org/fleet/protocol/GpsDecoder.java': decoder('GpsDecoder'),
    'src/main/java/org/fleet/protocol/TeltonikaDecoder.java': decoder('TeltonikaDecoder'),
    // A wildcard import from outside the repository leaves `Adapter` undecided.
    'src/main/java/org/fleet/protocol/RawCodec.java': 'package org.fleet.protocol;\nimport io.netty.channel.*;\npublic class RawCodec extends Adapter {}\n',
    'src/main/java/org/fleet/protocol/LineCodec.java': 'package org.fleet.protocol;\nimport io.netty.channel.*;\npublic class LineCodec extends Adapter {}\n',
    'src/main/java/org/fleet/protocol/FrameCodec.java': 'package org.fleet.protocol;\nimport io.netty.channel.*;\npublic class FrameCodec extends Adapter {}\n',
    'src/main/java/org/fleet/events/BaseEventHandler.java': 'package org.fleet.events;\npublic abstract class BaseEventHandler {}\n',
    'src/main/java/org/fleet/events/BasePositionEventHandler.java': 'package org.fleet.events;\npublic abstract class BasePositionEventHandler extends BaseEventHandler {}\n',
    'src/main/java/org/fleet/events/AlarmEventHandler.java': 'package org.fleet.events;\npublic class AlarmEventHandler extends BasePositionEventHandler {}\n',
    'src/main/java/org/fleet/events/SpeedEventHandler.java': 'package org.fleet.events;\npublic class SpeedEventHandler extends BasePositionEventHandler {}\n',
    'src/main/java/org/fleet/events/MediaEventHandler.java': 'package org.fleet.events;\npublic class MediaEventHandler extends BaseEventHandler {}\n',
    'src/main/java/org/fleet/util/One.java': 'package org.fleet.util;\npublic class One implements java.io.Serializable {}\n',
    'src/main/java/org/fleet/util/Two.java': 'package org.fleet.util;\nimport java.io.Serializable;\npublic class Two implements Serializable {}\n',
    'src/main/java/org/fleet/util/Three.java': 'package org.fleet.util;\nimport java.io.Serializable;\npublic class Three implements Serializable {}\n',
  });
  assert.deepEqual(rows, [
    {
      kind: 'family',
      name: 'BaseEventHandler',
      path: 'src/main/java/org/fleet/events',
      symbol: 'org.fleet.events.BaseEventHandler',
      evidence: 'src/main/java/org/fleet/events/AlarmEventHandler.java:L2',
      members: ['AlarmEventHandler', 'MediaEventHandler', 'SpeedEventHandler'],
    },
    {
      kind: 'family',
      name: 'BaseDecoder',
      path: 'src/main/java/org/fleet/protocol',
      symbol: 'org.fleet.BaseDecoder',
      evidence: 'src/main/java/org/fleet/protocol/AisDecoder.java:L4',
      members: ['AisDecoder', 'GpsDecoder', 'TeltonikaDecoder'],
    },
  ]);
});
