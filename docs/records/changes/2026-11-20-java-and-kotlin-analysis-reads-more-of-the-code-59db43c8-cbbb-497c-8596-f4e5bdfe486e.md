---
id: 59db43c8-cbbb-497c-8596-f4e5bdfe486e
date: 2026-11-20
category: Changed
---
Analyzing a Java or Kotlin repository now connects files that use a type from their own package without an import, Java code that calls a Kotlin file's top-level functions, and Kotlin enum classes, which were missed before. Message listeners (Kafka, RabbitMQ, JMS, SQS, Pulsar) are listed as workers. On a multi-module Kotlin project of about 3,800 files the import scan went from 14 seconds and 1 GB of memory to under 2 seconds and 274 MB.
